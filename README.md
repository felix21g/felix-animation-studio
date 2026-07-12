# Handoff: Planet Cloud — Infinite 3D Portfolio Landing

## Production app (implemented)

The handoff below has been implemented as a **Vite + React** single-page app at the repo root:

- **Run it:** `npm install`, then `npm run dev` → http://localhost:5173. `npm run build` emits a fully static `dist/` deployable to any static host.
- **Where things live:** the 3D engine is [src/engine/shape-lab.js](src/engine/shape-lab.js) (the reference engine with `import * as THREE from 'three'` instead of the CDN global, plus a `projects` property); the overlay is [src/App.jsx](src/App.jsx) + [src/components/](src/components/) with all styling in [src/styles.css](src/styles.css) (design tokens + real media queries, no `!important`).
- **Edit your projects:** replace the twelve placeholders in [src/data/projects.js](src/data/projects.js) — data-only change, the field picks them up automatically.
- `reference/` remains the design spec and is untouched.

---

## Overview
An immersive, full-screen WebGL landing experience for **Felix — Motion & Interaction**. The visitor flies first-person through an **infinite deep-space field** of translucent "bubble" orbs (project placeholders), drifting past a twinkling starfield and a soft nebula. Hovering an orb shows a floating label; clicking one **bursts the bubble** and a project detail card **grows out of the burst point** to center screen. Dismissing the card reverses the animation and the bubble re-forms in place.

The whole thing is one `<canvas>` (Three.js) plus a thin DOM/React overlay layer (header, hover label, hint pill, detail card).

## About the Design Files
The files in `reference/` are a **design reference created in HTML** — a working prototype showing the intended look and behavior, **not production code to copy verbatim**. The task is to **recreate this experience in the target codebase's environment** (React / Vite / Next.js) using its established patterns.

Good news: the hard part — the 3D engine — is already written as **framework-agnostic vanilla Three.js** in `reference/shape-lab.js`. It's a self-registering Web Component (`<shape-lab>`) that can be dropped into any framework almost unchanged. The parts that genuinely need re-implementation in your stack are the **DOM overlay** (header, hover label, detail card) and the **wiring** (props in, custom events out). Ignore `support.js` entirely — it is the prototype tool's runtime and is **not** part of the deliverable.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, easing curves, and interaction timings below are final. Recreate the overlay UI pixel-accurately. The 3D scene should match the reference visually; exact particle counts/tunables are provided but can be adjusted for performance on target hardware.

---

## Architecture

```
┌─ Full-screen container (fixed inset:0, bg #04050A) ──────────────┐
│                                                                  │
│   <shape-lab>  ← Three.js canvas, absolute inset:0               │
│      • nebula background + 1200-star twinkling field             │
│      • infinite recycling field of ~35 bubble orbs               │
│      • fisheye/barrel post-process pass                          │
│      • emits: sphere:hover, sphere:open                          │
│      • listens: sphere:flatten (freeze/unfreeze camera)          │
│                                                                  │
│   DOM overlay (z above canvas):                                  │
│      • frosted top gradient (z9)                                 │
│      • <header> Felix / nav (z10)                                │
│      • hover label (follows cursor, z15)                         │
│      • hint pill bottom-center (z10)                             │
│      • detail card + backdrop (z20)                              │
└──────────────────────────────────────────────────────────────────┘
```

**Data flow:**
- App → engine: set attributes/props (`distortion`, `cardsize`, `density`, `flyspeed`, `automotion`).
- Engine → App: `window` CustomEvents `sphere:hover` (detail = project or null) and `sphere:open` (detail = project + `{screen:{x,y}}`).
- App → engine: `window` CustomEvent `sphere:flatten` with `{flat: true|false}` to freeze the camera while the card is open and trigger the bubble to re-form on close.

---

## The 3D Engine (`shape-lab.js`)

Vanilla Three.js (r160). Registers a custom element `<shape-lab>`. Requires `window.THREE` to be loaded first (the prototype loads `three@0.160.0` from unpkg; in your app, `import * as THREE from 'three'` and assign `window.THREE = THREE` before the element upgrades, **or** refactor the file to take THREE as an ES import — see "Integration" below).

### Public attributes (all optional, all numbers except automotion)
| Attribute | Type | Default in code | Design default | Range | Meaning |
|---|---|---|---|---|---|
| `distortion` | float | 0.17 | **0.30** | 0 – 0.34 | Fisheye/barrel lens strength (+ chromatic aberration at edges) |
| `cardsize` | float | 1.75 | **4.0** | 1.1 – 4.0 | Diameter of each bubble orb |
| `density` | int | 52 | **35** | 18 – 76 | How many orbs are live in the field at once (max 76) |
| `flyspeed` | float | 1 | **0.4** | 0.4 – 2.2 | Multiplier on scroll/auto-glide travel speed |
| `automotion` | "on"/"off" | on | on | — | Gentle forward auto-glide when idle |

> The "Design default" column reflects the values the designer settled on — use these as your initial props.

### Emitted events (on `window`)
- **`sphere:hover`** — `detail` = the hovered project object, or `null` when nothing is hovered. Fires only on change.
- **`sphere:open`** — fired on a click/tap (a press that moves < 4px for mouse/pen, < 9px for touch — fingers wobble) over an orb. The pick is raycast fresh at the release point, so taps work even when no `pointermove` ever fired. `detail` = the project object **plus** `screen: {x, y}` — the CSS-pixel position of the bubble at click time (already corrected for the fisheye distortion). Use this as the transform-origin for the card grow/shrink animation.

### Consumed events (on `window`)
- **`sphere:flatten`** — `detail = {flat: boolean}`.
  - `flat:true` → freeze camera drift/auto-glide (call when the card opens).
  - `flat:false` → unfreeze **and** re-form the just-burst bubble in place (call when the card finishes closing).

### Interaction model (built into the engine)
The engine tracks every active pointer in a per-`pointerId` registry, so mouse, pen, and multi-touch all coexist. Gestures derive from how many pointers are down:
- **Drag** (one pointer) = strafe through space laterally (X/Y), with momentum.
- **Scroll wheel / trackpad** = fly forward/backward (zoom through the field), with momentum.
- **Pinch** (two fingers) = fly forward/backward — spread the fingers to fly forward, pinch them together to pull back. Pinch feeds the same travel-velocity variable as the wheel, so momentum, damping, and freeze-while-card-open come for free. The two-finger **centroid** delta also pans (two-finger drag), and putting a second finger down permanently cancels tap detection for that gesture.
- **Click / tap** (press that moves < 4px mouse, < 9px touch) on an orb = burst + emit `sphere:open`. The pick raycasts fresh at the release position (`_raycastAtNdc()`), not the rAF hover state, so a clean tap that fires no move events still opens.
- **Hover** = raycast; emits `sphere:hover`. Cursor becomes `pointer` over an orb, `grab`/`grabbing` otherwise. On touch, hover clears when the last finger lifts (`sphere:hover` fires `null`), so the floating label never lingers after a tap.
- The field is **infinite**: orbs recycle (reposition + re-assign a project) once flown past or strafed beyond the bounds, so there is always something on screen. Orbs **fade in and out** at the near and far depth edges and the lateral edges (the "pop-in" effect), in both travel directions.
- Clicking bursts an **18-droplet sparkle particle** spray at the orb; the orb hides, then re-forms on `sphere:flatten {flat:false}`.

### Scene details (for faithful recreation / tuning)
- **Background:** procedural nebula canvas texture — base `#04050A` with soft radial blobs of `rgba(28,36,74)`, `rgba(46,32,78)`, `rgba(20,44,72)`, `rgba(58,44,86)`.
- **Fog:** `THREE.Fog(0x05060C, 16, FAR+6)` where `FAR = 48`.
- **Camera:** `PerspectiveCamera(fov 52, near 0.1, far 200)`, base Z = 8, looks 12 units ahead.
- **Starfield:** 1200 points in an 80×54×80 half-extent box, tiled infinitely around the camera. Custom point shader: per-star size/brightness/color/twinkle. ~2.5% are large bright "hero" stars, rest tiny. Tints: warm-white, blue-white (`0.72,0.82,1.0`), cool-white, faint gold (`1.0,0.93,0.78`). Additive blending. Sprite is a soft radial core + 4-point diffraction cross drawn to a 128px canvas.
- **Bubble orbs:** `SphereGeometry(0.5, 40, 28)` rendered via a single **InstancedMesh** (1 draw call, up to 76 instances) with a custom glassy shader:
  - Fresnel rim: `pow(1 - dot(N,V), 2.6)` tinted `(0.42, 0.48, 0.6)`.
  - One soft specular highlight: `pow(dot(N,H), 48) * 0.9`, light dir `(-0.4, 0.55, 0.85)`.
  - Base color `(0.30, 0.36, 0.5)`; alpha `clamp(0.07 + fres*0.82 + spec*0.55, 0, 1)`.
  - NormalBlending, `depthWrite:false`, `fog:false` (raw ShaderMaterials can't use Three's fog uniforms — do **not** set `fog:true` on them or Three throws every frame).
  - Each orb slowly spins on a random tilt/axis and bobs on a sine phase.
- **Burst particles:** 64-point pool, custom additive shader, sprite reuses the star sprite, color `(0.8, 0.86, 1.0)`, life decays ~0.028/frame, velocity damped 0.92/frame.
- **Post-processing:** scene renders to a `WebGLRenderTarget` (samples: 4) then a full-screen barrel-distortion shader pass:
  - `uK = -distortion * aspect`, applied to UVs as `1 + uK*r²`.
  - Chromatic aberration `uCA = 0.0035 * r²` split across R/B channels.
  - Edge rim darken toward `rgb(0.02, 0.03, 0.07)`.
  - **Important:** the hover/click raycast **inverts** this distortion so picks land on the orb visually under the cursor (`_pickNdc`), and `_worldToScreen` inverts it too so the card animates from the correct on-screen point.
- **Performance:** DPR capped at 2, internal render scale 1.0, InstancedMesh keeps orbs to 1 draw call. The InstancedMesh bounding sphere is reset each frame before raycasting (instances move every frame, so the cached bounds go stale — a real bug that was fixed; keep this).

### Project data
The prototype generates 12 placeholder projects, all identical "Coming soon" entries. Replace with real data. Each project object shape:
```js
{
  index: number,        // 0-based; label shows ('0'+(index+1)).slice(-2) → "01".."12"
  slug: string,
  title: string,        // e.g. "Coming soon"
  year: string,         // e.g. "2026"
  kind: string,         // e.g. "In progress"  (shown as a chip)
  desc: string          // paragraph in the detail card
}
```
Wire your real projects into the engine's project list; the engine cycles through them as orbs recycle.

---

## Screens / Views

### 1. Main canvas (the only screen)
- **Purpose:** Browse projects by flying through space; open a project for details.
- **Layout:** Full-viewport fixed container. Canvas fills it. Overlay elements are absolutely positioned.

### Overlay components

#### Header (z-index 10)
- Absolute top:0 left:0 right:0, `display:flex; align-items:center; justify-content:space-between; padding:18px 28px`.
- **No** background/border of its own — it floats over the scene.
- Left cluster: `display:flex; align-items:baseline; gap:12px`
  - "Felix" — 16px, weight 600, letter-spacing −0.01em, color `#F5F5F7`.
  - "Motion & Interaction" — 12px, weight 400, color `rgba(245,245,247,0.5)`.
- Right nav: `display:flex; gap:26px; font-size:13px`
  - "Work" — `#0A84FF`, weight 500 (active).
  - "About", "Contact" — `rgba(245,245,247,0.6)`.

#### Frosted top gradient (z-index 9, behind header)
A separate element under the header that produces a soft white frost fading to nothing:
- Absolute top:0 left:0 right:0, **height:200px**, `pointer-events:none`.
- `backdrop-filter: blur(18px) brightness(1.4) saturate(1.2)` (+ `-webkit-` prefix).
- `background: linear-gradient(to bottom, rgba(255,255,255,0.11) 0%, 0.095 12%, 0.075 25%, 0.05 40%, 0.028 58%, 0.012 76%, 0.003 90%, 0 100%)` — eight stops on an eased curve so there's no visible band edge.
- `mask-image: linear-gradient(to bottom, black 0%, rgba(0,0,0,0.85) 30%, 0.55 55%, 0.25 78%, transparent 100%)` (+ `-webkit-`) so the blur itself also fades out.

#### Hover label (z-index 15, follows cursor)
- Fixed; positioned via `transform: translate(clientX+18px, clientY+16px)` updated on `pointermove`.
- Pill: `display:flex; align-items:center; gap:9px; padding:7px 13px; border-radius:999px; background:rgba(16,20,34,0.7); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.12); box-shadow:0 6px 24px rgba(0,0,0,0.5); font-size:13px; font-weight:500; color:#F5F5F7; white-space:nowrap`.
- Transitions opacity + scale (0.25s ease); shown only when hovering (opacity 1 / scale 1, else opacity 0 / scale 0.92).
- Contents: index (SF Mono, 10px, letter-spacing 0.08em, `rgba(245,245,247,0.5)`) + title.

#### Hint pill (z-index 10, bottom center)
- Absolute bottom `calc(22px + env(safe-area-inset-bottom))` (clears the iOS home indicator), centered, `pointer-events:none`.
- SF Mono, 11px, letter-spacing 0.08em, `rgba(245,245,247,0.5)`, `background:rgba(8,10,18,0.5); backdrop-filter:blur(10px); padding:7px 14px; border-radius:999px; border:1px solid rgba(255,255,255,0.08)`.
- Text (middots are `\u00A0\u00B7\u00A0`), chosen by `matchMedia('(pointer: coarse)')`:
  - Fine pointer: `DRAG TO MOVE · SCROLL TO ZOOM · CLICK A PLANET`
  - Coarse pointer (touch): `DRAG TO MOVE · PINCH TO ZOOM · TAP A PLANET`

#### Detail card + backdrop (z-index 20)
- **Backdrop / wrap:** absolute inset:0, `display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(4,5,10,0.55); backdrop-filter:blur(22px) saturate(1.3)`. Transitions opacity 0.45s `cubic-bezier(0.32,0.72,0,1)`. `pointer-events` auto only when open. Click on backdrop closes.
- **Card:** `width:min(520px,92vw); color:#F5F5F7; background:rgba(18,22,36,0.82); border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:30px 32px; box-shadow:0 30px 80px rgba(0,0,0,0.6)`.
  - **Open/close animation:** transitions `transform 0.5s cubic-bezier(0.32,0.72,0,1), opacity 0.34s ease`. When closed, the card sits at the burst point scaled tiny: `transform: translate(dx, dy) scale(0.06)` where `dx = screen.x - innerWidth/2`, `dy = screen.y - innerHeight/2` (from `sphere:open` detail). When open: `translate(0,0) scale(1)`, opacity 1. This makes the card grow out of / shrink back into the bubble. (Recompute on window resize while open.)
  - `stopPropagation` on card click so it doesn't close.
  - **Card contents (top→bottom):**
    - Row: index chip (SF Mono 12px, letter-spacing 0.1em, `rgba(245,245,247,0.5)`, border `1px rgba(255,255,255,0.16)`, radius 999px, padding 5px 12px) + close button (32×32 circle, `background:rgba(255,255,255,0.1)`, `color:rgba(245,245,247,0.7)`, "✕").
    - `<h2>` title — 34px, weight 600, letter-spacing −0.02em, margin 0 0 14px.
    - Chip row (gap 8px): year + kind chips — SF Mono 11px, letter-spacing 0.06em, `rgba(245,245,247,0.6)`, `background:rgba(255,255,255,0.08)`, radius 999px, padding 5px 11px.
    - Media placeholder — `aspect-ratio:16/10; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background:linear-gradient(135deg,#1B2136,#0C1020)`, centered caption "ANIMATION PLACEHOLDER" (SF Mono 11px, letter-spacing 0.1em, `rgba(245,245,247,0.35)`). **Replace with real project media.**
    - `<p>` description — 14px, line-height 1.55, `rgba(245,245,247,0.62)`, `text-wrap:pretty`.
    - "View case study →" link — 14px, weight 500, `#0A84FF`, margin-top 18px.

---

## Interactions & Behavior

**Open (click a bubble):**
1. Engine detects click over an orb (press moved < 4px), bursts it (particles), hides that orb, computes its on-screen `{x,y}`, emits `sphere:open` with `{...project, screen}`.
2. App sets `open = detail`, `shown = false`; dispatches `sphere:flatten {flat:true}` (freezes camera).
3. Next double-rAF, App sets `shown = true` → card transitions from `translate(dx,dy) scale(0.06)` → `scale(1)` centered, backdrop fades in.

**Close (✕ / backdrop / Esc):**
1. App sets `shown = false` (card shrinks back toward the burst point, backdrop fades out). Guard with a `closing` flag to ignore repeat calls.
2. After **480ms**, App dispatches `sphere:flatten {flat:false}` (un-freezes camera **and** the just-burst orb re-forms with a soft pop-in), then clears `open`.

**Hover:** `sphere:hover` updates the label (ignored while a card is open).

**Cursor:** pointer over an orb; grab / grabbing otherwise (engine sets this on the host element).

**Responsive:** while a card is open, recompute the card's from-transform on `resize` (origin is pixel-based).

**Mobile / touch:**
- All gestures live inside the engine (see "Interaction model") — the overlay needs no gesture code of its own.
- Phone breakpoint (`@media (max-width: 480px)`): card title 34→26px, card padding 30/32→22/20px, card radius 24→20px, header padding 18/28→14/18px, nav gap 26→18px, hint pill 11→10px (plus `white-space: nowrap` so it never wraps).
- Coarse pointers get a 40×40 close button (`@media (pointer: coarse)`) and the touch hint text.
- Safe areas: the card backdrop's padding and the hint pill's bottom offset add `env(safe-area-inset-*)`; the viewport meta uses `viewport-fit=cover`.
- The prototype's phone rules use classes (`pc-header`, `pc-card`, `pc-title`, `pc-nav`, `pc-close`, `pc-hint`) with `!important` to beat its inline styles — in the production app express them as normal CSS.
- Perf note: the `backdrop-filter` blurs (top frost 18px, backdrop 22px, pills 10–12px) are the main GPU cost on phones; reduce or drop them at the phone breakpoint if a target device struggles. The engine already caps DPR at 2.

---

## State Management
Minimal — overlay only:
- `open: Project | null` — currently open project (with `screen`).
- `shown: boolean` — drives the card's open/close transition (separate from `open` so exit animation can play before unmount).
- `hover: Project | null` — hovered project for the label.
- `closing: boolean` (guard) + a close timeout ref.
- Engine holds all 3D/travel/camera/recycling state internally; App does not touch it beyond props + the three events.

---

## Design Tokens

**Colors**
- Space background / page: `#04050A`
- Fog: `#05060C`
- Primary text: `#F5F5F7`
- Muted text: `rgba(245,245,247,0.5–0.62)`
- Accent (links / active nav): `#0A84FF`
- Card surface: `rgba(18,22,36,0.82)`; border `rgba(255,255,255,0.1)`
- Glass pills / chips: `rgba(255,255,255,0.08–0.10)`, borders `rgba(255,255,255,0.08–0.16)`
- Media placeholder gradient: `#1B2136 → #0C1020`
- Bubble base `(0.30,0.36,0.5)`, rim tint `(0.42,0.48,0.6)`, light dir `(-0.4,0.55,0.85)`

**Typography**
- UI: `-apple-system, 'SF Pro Display', 'SF Pro Text', Helvetica, Arial, sans-serif`
- Mono (labels/chips/hint): `'SF Mono', ui-monospace, Menlo, monospace`
- Scale: h2 34/600/−0.02em · logo 16/600 · nav 13 · body 14/1.55 · subtitle & label 12–13 · chips/hint 10–12 mono with 0.06–0.1em tracking

**Radius:** cards 24px · media 16px · pills/chips/buttons 999px
**Shadow:** card `0 30px 80px rgba(0,0,0,0.6)` · label `0 6px 24px rgba(0,0,0,0.5)`
**Easing:** primary `cubic-bezier(0.32,0.72,0,1)` — card transform 0.5s, backdrop 0.45s, card opacity 0.34s · small UI 0.25s ease · close delay 480ms

---

## Assets
No external image assets — everything is procedural (canvas-generated nebula, star sprite, burst sprite) or CSS. Only runtime dependency is **Three.js r160**. Fonts are system (SF). Replace the per-project **media placeholder** with real project imagery/video when data is available.

---

## Integration notes (React / Vite / Next.js)

1. **Three.js:** `npm i three`. Either (a) `import * as THREE from 'three'; window.THREE = THREE;` before importing `shape-lab.js`, or (b) refactor `shape-lab.js` to `import * as THREE from 'three'` and drop the `whenThree`/`window.THREE` polling. Option (b) is cleaner for a bundled app.
2. **The Web Component** can be used directly: register it once (the file self-registers `customElements.define('shape-lab', …)`), then render `<shape-lab distortion="0.3" cardsize="4" density="35" flyspeed="0.4" automotion="on" />`. In React, set these as attributes (strings). In Next.js, load it **client-side only** (`'use client'` + dynamic import with `ssr:false`) — it touches `window`/WebGL.
3. **Overlay as a React component:** port the `renderVals()`/template in `Shape Explorations.dc.html` into a normal component. Subscribe to `sphere:hover`/`sphere:open` in a `useEffect`, keep `open/shown/hover` in `useState`, and dispatch `sphere:flatten` on open/close exactly as documented. Add/remove the `keydown`(Esc), `pointermove`(label follow), and `resize` listeners in the same effect.
4. **Do not ship** `support.js` — prototype runtime only. The DC template syntax (`{{ }}`, `<x-import>`, `data-props`) is prototype-only; reference it for values/structure, don't reproduce it.
5. **Project data:** replace the generated 12 "Coming soon" placeholders in `shape-lab.js` with your real project list and swap the card's media placeholder.

## Files
- `reference/Shape Explorations.dc.html` — the overlay UI + interaction wiring (header, hover label, hint, detail card, open/close animation). Prototype format; read for exact styles/values.
- `reference/shape-lab.js` — **the 3D engine** (Three.js). Framework-agnostic; reusable near-as-is. This is the core deliverable.
- `reference/support.js` — prototype runtime. **Ignore / do not ship.**
