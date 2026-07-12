/* shape-lab.js — "Claude cloud": a first-person flythrough of an INFINITE field
   of portfolio cards, with a barrel/fisheye lens.
   • Fly forever (scroll / two-finger) — cards recycle so you always see more.
   • Strafe forever (drag) — the field wraps laterally around you.
   • Cards fade (pop) in and out at both the near and far edges, in both directions.
   Registers <shape-lab>. Requires window.THREE (r160 UMD).
   Dispatches sphere:hover / sphere:open (same contract as sphere-grid.js).
   Attributes: distortion, cardsize, density, flyspeed, automotion. */
(function () {
  'use strict';

  var ATLAS_COLS = 4, ATLAS_ROWS = 3, N_PROJECTS = 12, MAX_TILES = 76;

  var PROJECTS = [];
  for (var i = 0; i < N_PROJECTS; i++) {
    PROJECTS.push({
      index: i,
      slug: 'coming-soon-' + (i + 1),
      title: 'Coming soon',
      year: '2026',
      kind: 'In progress',
      desc: 'This project is coming soon. A finished animation will live here \u2014 check back shortly.'
    });
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function makeAtlas() {
    var CELL = 384, R = 26;
    var cv = document.createElement('canvas');
    cv.width = ATLAS_COLS * CELL; cv.height = ATLAS_ROWS * CELL;
    var ctx = cv.getContext('2d');
    var ink = '#1D1D1F', accent = '#0071e3';
    for (var i = 0; i < N_PROJECTS; i++) {
      var col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
      var cx = col * CELL, cy = row * CELL;
      var mx = cx + CELL / 2, my = cy + CELL / 2;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx + 2, cy + 2, CELL - 4, CELL - 4, R);
      else ctx.rect(cx + 2, cy + 2, CELL - 4, CELL - 4);
      ctx.clip();
      var g = ctx.createLinearGradient(cx, cy, cx, cy + CELL);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#ECEDF1');
      ctx.fillStyle = g;
      ctx.fillRect(cx, cy, CELL, CELL);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var ringY = my - CELL * 0.055;
      ctx.strokeStyle = hexA(ink, 0.22);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, ringY, CELL * 0.088, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = hexA(accent, 0.85);
      ctx.lineWidth = 2.4;
      var pl = CELL * 0.032;
      ctx.beginPath();
      ctx.moveTo(mx - pl, ringY); ctx.lineTo(mx + pl, ringY);
      ctx.moveTo(mx, ringY - pl); ctx.lineTo(mx, ringY + pl);
      ctx.stroke();
      ctx.fillStyle = hexA(ink, 0.62);
      ctx.font = '600 ' + Math.round(CELL * 0.072) + 'px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';
      ctx.fillText('Coming soon', mx, my + CELL * 0.135);
      ctx.fillStyle = hexA(ink, 0.34);
      ctx.font = '500 ' + Math.round(CELL * 0.038) + 'px "SF Mono", ui-monospace, Menlo, monospace';
      ctx.fillText('I N   P R O G R E S S', mx, my + CELL * 0.225);
      ctx.restore();
    }
    return cv;
  }

  // ---- fisheye / barrel post-processing ----
  var POST_VERT = [
    'varying vec2 vUv;',
    'void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  var POST_FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform float uK;',
    'uniform float uAspect;',
    'uniform vec3 uRimColor;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 off = vUv - 0.5;',
    '  vec2 q = off * vec2(uAspect, 1.0);',
    '  float r2 = dot(q, q);',
    '  float f = 1.0 + uK * r2;',
    '  vec3 col = texture2D(uTex, 0.5 + off * f).rgb;',
    '  float rim = smoothstep(0.60, 1.04, sqrt(r2));',
    '  col = mix(col, uRimColor, rim * 0.5);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function whenThree(cb) {
    if (window.THREE) { cb(); return; }
    var t = setInterval(function () {
      if (window.THREE) { clearInterval(t); cb(); }
    }, 30);
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // field constants
  var NEAR = 3.0, FAR = 48, FADE_NEAR = 3.5, FADE_FAR = 14;
  var HALF_W = 32, HALF_H = 19, FADE_LAT = 6;

  // starfield
  var STAR_N = 1200, SBX = 80, SBY = 54, SBZ = 80;

  var STAR_VERT = [
    'attribute float aSize;',
    'attribute float aBright;',
    'attribute float aTw;',
    'attribute vec3 aColor;',
    'uniform float uTime;',
    'uniform float uScale;',
    'uniform float uDpr;',
    'varying float vBright;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + aTw * 2.5) + aTw * 40.0);',
    '  vBright = aBright * mix(0.7, 1.0, tw);',
    '  vColor = aColor;',
    '  vFog = -mv.z;',
    '  float ps = aSize * uScale / max(-mv.z, 0.1);',
    '  gl_PointSize = clamp(ps, 1.0, 46.0 * uDpr);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var STAR_FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'varying float vBright;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'void main() {',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  float f = clamp((uFogFar - vFog) / (uFogFar - uFogNear), 0.0, 1.0);',
    '  float a = t.a * vBright * f;',
    '  gl_FragColor = vec4(t.rgb * vColor, a);',
    '}'
  ].join('\n');

  function makeNebula() {
    var S = 1024;
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var ctx = cv.getContext('2d');
    // deep base
    ctx.fillStyle = '#04050A';
    ctx.fillRect(0, 0, S, S);
    function blob(x, y, r, col, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col.replace('ALPHA', a));
      g.addColorStop(1, col.replace('ALPHA', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    // broad cool glow, slightly off-center
    blob(S * 0.46, S * 0.40, S * 0.62, 'rgba(28,36,74,ALPHA)', '0.9');
    // faint indigo + violet drifts
    blob(S * 0.72, S * 0.66, S * 0.42, 'rgba(46,32,78,ALPHA)', '0.55');
    blob(S * 0.24, S * 0.72, S * 0.40, 'rgba(20,44,72,ALPHA)', '0.45');
    blob(S * 0.60, S * 0.20, S * 0.30, 'rgba(58,44,86,ALPHA)', '0.35');
    return cv;
  }

  // shiny star sprite: hot white core + soft halo + faint 4-point diffraction glint
  function makeStarSprite() {
    var S = 128, c = S / 2;
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.13, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.32, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createLinearGradient(0, c, S, c);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, c - 1, S, 2);
    var sg2 = ctx.createLinearGradient(c, 0, c, S);
    sg2.addColorStop(0, 'rgba(255,255,255,0)');
    sg2.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    sg2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg2;
    ctx.fillRect(c - 1, 0, 2, S);
    var cg = ctx.createRadialGradient(c, c, 0, c, c, S * 0.09);
    cg.addColorStop(0, 'rgba(255,255,255,1)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, S, S);
    return cv;
  }

  // 12 distinct planet skins (gas-giant-ish bands), cohesive with the deep-space palette
  var PLANET_PALETTES = [
    { a: '#0f2b52', b: '#2e6fb0', c: '#8fc4ee', glow: '#4a9fe0' },
    { a: '#0c3a38', b: '#1f8a7c', c: '#7fe0cf', glow: '#2fc9b0' },
    { a: '#241a47', b: '#5a3fa8', c: '#b199ea', glow: '#7d5cf0' },
    { a: '#43180e', b: '#a24a28', c: '#e0966a', glow: '#e0703a' },
    { a: '#453210', b: '#b0862e', c: '#eccf86', glow: '#e0b040' },
    { a: '#161f4a', b: '#3a4fb8', c: '#9aa8ee', glow: '#5a72e8' },
    { a: '#3a1233', b: '#93307e', c: '#e88fd0', glow: '#d84fb0' },
    { a: '#0f3a20', b: '#2e9a52', c: '#8fe0a4', glow: '#3fc86a' },
    { a: '#202d3c', b: '#4f6a86', c: '#aecadf', glow: '#6f9fd0' },
    { a: '#452810', b: '#b06e20', c: '#e8bc70', glow: '#e09030' },
    { a: '#421624', b: '#9e3a54', c: '#e88ea0', glow: '#d8506a' },
    { a: '#0c3350', b: '#1f86b6', c: '#84d6ee', glow: '#3fb0e0' }
  ];

  function makePlaceholderTex(seedn) {
    // neutral white "unfilled" orb — soft grey banding just so the sphere form reads
    var W = 512, H = 256;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var rnd = mulberry(seedn);
    ctx.fillStyle = '#EEF0F5';
    ctx.fillRect(0, 0, W, H);
    // very faint latitude shading for volume
    for (var k = 0; k < 6; k++) {
      var by = rnd() * H, bh = H * (0.05 + rnd() * 0.1);
      ctx.fillStyle = rnd() > 0.5 ? '#DDE0E8' : '#F7F8FB';
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, by, W, bh);
    }
    ctx.globalAlpha = 1;
    return cv;
  }

  function makePlanetTex(pal, seedn) {
    var W = 512, H = 256;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var rnd = mulberry(seedn);
    ctx.fillStyle = pal.a;
    ctx.fillRect(0, 0, W, H);
    var bands = 8 + Math.floor(rnd() * 7);
    for (var k = 0; k < bands; k++) {
      var by = rnd() * H, bh = H * (0.02 + rnd() * 0.09);
      ctx.fillStyle = rnd() > 0.5 ? pal.b : pal.c;
      ctx.globalAlpha = 0.18 + rnd() * 0.4;
      var amp = H * (0.008 + rnd() * 0.02), fq = 0.01 + rnd() * 0.04, ph = rnd() * 6.28;
      for (var x = 0; x < W; x += 3) {
        ctx.fillRect(x, by + Math.sin(x * fq + ph) * amp, 4, bh);
      }
    }
    ctx.globalAlpha = 1;
    for (var s = 0; s < 500; s++) {
      ctx.fillStyle = rnd() > 0.5 ? pal.c : pal.b;
      ctx.globalAlpha = 0.05 + rnd() * 0.15;
      var sz = 1 + rnd() * 2.5;
      ctx.fillRect(rnd() * W, rnd() * H, sz, sz);
    }
    ctx.globalAlpha = 1;
    var pg = ctx.createLinearGradient(0, 0, 0, H);
    pg.addColorStop(0, hexA(pal.c, 0.5));
    pg.addColorStop(0.16, hexA(pal.c, 0));
    pg.addColorStop(0.84, hexA(pal.c, 0));
    pg.addColorStop(1, hexA(pal.c, 0.5));
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, W, H);
    return cv;
  }

  // fresnel atmosphere shell (additive, back side → glowing rim just outside the planet)
  var ATMO_VERT = [
    'varying float vF;',
    'void main() {',
    '  #ifdef USE_INSTANCING',
    '  mat4 im = instanceMatrix;',
    '  #else',
    '  mat4 im = mat4(1.0);',
    '  #endif',
    '  vec3 n = normalize(normalMatrix * (mat3(im) * normal));',
    '  vec4 mv = modelViewMatrix * im * vec4(position, 1.0);',
    '  vec3 vd = normalize(-mv.xyz);',
    '  vF = pow(1.0 - max(dot(n, vd), 0.0), 3.0);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var ATMO_FRAG = [
    'precision highp float;',
    'uniform vec3 uColor;',
    'varying float vF;',
    'void main() { gl_FragColor = vec4(uColor, vF * 0.68); }'
  ].join('\n');

  // glassy soap-bubble shader for the placeholder orbs (instanced)
  var BUBBLE_VERT = [
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  #ifdef USE_INSTANCING',
    '  mat4 im = instanceMatrix;',
    '  #else',
    '  mat4 im = mat4(1.0);',
    '  #endif',
    '  vN = normalize(mat3(modelViewMatrix * im) * normal);',
    '  vec4 mv = modelViewMatrix * im * vec4(position, 1.0);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BUBBLE_FRAG = [
    'precision highp float;',
    'uniform vec3 uColor;',
    'uniform vec3 uLightDir;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(vV);',
    '  float ndv = max(dot(N, V), 0.0);',
    '  float fres = pow(1.0 - ndv, 2.6);',           // thin bright rim
    '  vec3 L = normalize(uLightDir);',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N, H), 0.0), 48.0);', // one soft highlight
    '  vec3 col = uColor + fres * vec3(0.42, 0.48, 0.6) + spec * 0.9;',
    '  float alpha = clamp(0.07 + fres * 0.82 + spec * 0.55, 0.0, 1.0);',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  // burst droplets — sparkle shards when a bubble pops
  var BURST_VERT = [
    'attribute float aSize;',
    'attribute float aLife;',
    'uniform float uScale;',
    'uniform float uDpr;',
    'varying float vLife;',
    'void main() {',
    '  vLife = aLife;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  float ps = aSize * uScale / max(-mv.z, 0.1) * (0.5 + 0.5 * aLife);',
    '  gl_PointSize = clamp(ps, 0.0, 30.0 * uDpr);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BURST_FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'varying float vLife;',
    'void main() {',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  gl_FragColor = vec4(vec3(0.8, 0.86, 1.0), t.a * vLife * 0.9);',
    '}'
  ].join('\n');

  class ShapeLab extends HTMLElement {
    static get observedAttributes() {
      return ['distortion', 'cardsize', 'density', 'flyspeed', 'automotion'];
    }

    constructor() {
      super();
      this._auto = true;
      this._ready = false;
      this._paused = false;
      this._distort = 0.17;
      this._cardSize = 1.75;
      this._flySpeed = 1;
      this._activeN = 52;
      this._projCursor = 0;
      this._openIdx = -1;
    }

    attributeChangedCallback(name, _old, val) {
      if (name === 'distortion') {
        var d = parseFloat(val); if (!isNaN(d)) { this._distort = d; if (this._ready) this._applyPost(); }
      } else if (name === 'cardsize') {
        var c = parseFloat(val); if (!isNaN(c)) this._cardSize = c;
      } else if (name === 'flyspeed') {
        var f = parseFloat(val); if (!isNaN(f)) this._flySpeed = f;
      } else if (name === 'density') {
        var g = parseFloat(val);
        if (!isNaN(g)) this._activeN = Math.max(12, Math.min(MAX_TILES, Math.round(g)));
      } else if (name === 'automotion') {
        this._auto = val !== 'off' && val !== 'false';
      }
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      this.style.display = 'block';
      this.style.width = '100%';
      this.style.height = '100%';
      this.style.touchAction = 'none';
      this.style.cursor = 'grab';
      this.style.userSelect = 'none';
      this.style.webkitUserSelect = 'none';
      var self = this;
      whenThree(function () { if (self.isConnected) self._init(); });
    }

    disconnectedCallback() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._onFlatten) window.removeEventListener('sphere:flatten', this._onFlatten);
      if (this._renderer) this._renderer.dispose();
      this._booted = false;
      this._ready = false;
    }

    _init() {
      var T = window.THREE;
      T.ColorManagement.enabled = false;
      this._renderer = new T.WebGLRenderer({ antialias: true });
      this._renderer.setClearColor(0x04050A, 1);
      this.appendChild(this._renderer.domElement);
      this._renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';

      this._scene = new T.Scene();
      var neb = new T.CanvasTexture(makeNebula());
      neb.colorSpace = T.SRGBColorSpace;
      this._scene.background = neb;
      this._scene.fog = new T.Fog(0x05060C, 16, FAR + 6);
      this._camera = new T.PerspectiveCamera(52, 1, 0.1, 200);
      this._aspect = (this.clientWidth / this.clientHeight) || (16 / 9);
      this._baseZ = 8;
      this._camera.position.set(0, 0, this._baseZ);

      this._buildStars();
      this._buildBurst();

      // lights: a distant "sun" + cool ambient so planets read as 3D bodies
      var sun = new T.DirectionalLight(0xfff1dc, 1.3);
      sun.position.set(-0.55, 0.75, 0.65);
      this._scene.add(sun);
      this._scene.add(new T.AmbientLight(0x4a5a8a, 0.72));

      this._rnd = mulberry(11);

      // all projects are unfilled placeholders — one neutral white skin
      this._planetTex = []; this._planetGlow = []; this._planetEmis = [];
      var whiteGlow = new T.Color('#cdd8ec');
      var whiteEmis = new T.Color('#5a6478');
      for (var pi = 0; pi < N_PROJECTS; pi++) {
        var pt = new T.CanvasTexture(makePlaceholderTex(pi + 3));
        pt.colorSpace = T.SRGBColorSpace;
        pt.anisotropy = this._renderer.capabilities.getMaxAnisotropy();
        this._planetTex.push(pt);
        this._planetGlow.push(whiteGlow.clone());
        this._planetEmis.push(whiteEmis.clone());
      }

      // all placeholders are identical → one instanced bubble mesh (1 draw call)
      var sphGeo = new T.SphereGeometry(0.5, 40, 28);
      var bubbleMat = new T.ShaderMaterial({
        vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG,
        uniforms: {
          uColor: { value: new T.Vector3(0.30, 0.36, 0.5) },
          uLightDir: { value: new T.Vector3(-0.4, 0.55, 0.85) }
        },
        transparent: true, depthWrite: false, fog: false,
        blending: T.NormalBlending, side: T.FrontSide
      });
      this._planetMesh = new T.InstancedMesh(sphGeo, bubbleMat, MAX_TILES);
      this._planetMesh.frustumCulled = false;
      this._planetMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this._scene.add(this._planetMesh);
      this._dummy = new T.Object3D();
      var zeroM = new T.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
      this._tiles = [];
      for (var i = 0; i < MAX_TILES; i++) {
        var ci = i % N_PROJECTS;
        this._planetMesh.setMatrixAt(i, zeroM);
        this._tiles.push({
          project: PROJECTS[ci],
          pos: new T.Vector3(), vel: new T.Vector3(),
          tgt: new T.Vector3(),
          hx: 0, hy: 0, hz: -20, ph: 0, fr: 0.35, cell: ci,
          spin: (this._rnd() - 0.5) * 0.012, spinAngle: this._rnd() * 6.28,
          tilt: (this._rnd() - 0.5) * 0.6,
          s: 0, sT: 0, hover: 0, k: 0.10
        });
      }
      this._planetMesh.instanceMatrix.needsUpdate = true;

      // post pipeline
      this._postMat = new T.ShaderMaterial({
        vertexShader: POST_VERT, fragmentShader: POST_FRAG,
        depthTest: false, depthWrite: false,
        uniforms: {
          uTex: { value: null }, uK: { value: 0 },
          uAspect: { value: this._aspect },
          uRimColor: { value: new T.Vector3(0.02, 0.03, 0.07) }
        }
      });
      this._postScene = new T.Scene();
      this._postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this._postScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), this._postMat));
      this._rt = new T.WebGLRenderTarget(4, 4, { samples: 4 });
      this._renderScale = 1.0;
      this._postMat.uniforms.uTex.value = this._rt.texture;

      this._ray = new T.Raycaster();
      this._ndc = new T.Vector2(2, 2);
      this._pointerIn = false;
      this._dragging = false;
      this._hoverIdx = -1;
      this._lastHoverProject = null;
      this._travel = 0; this._travelVel = 0;
      this._camOff = { x: 0, y: 0 };
      this._panVel = { x: 0, y: 0 };
      this._time = 0;

      this._seedField();
      this._resize();
      this._ro = new ResizeObserver(this._resize.bind(this));
      this._ro.observe(this);

      this._onFlatten = (function (e) {
        var flat = !!(e.detail && e.detail.flat);
        this._paused = flat;
        if (!flat && this._openIdx >= 0) {
          // card dismissed → the bubble re-forms in place
          var t = this._tiles[this._openIdx];
          t.hidden = false;
          t.s = 0;
          this._openIdx = -1;
        }
      }).bind(this);
      window.addEventListener('sphere:flatten', this._onFlatten);

      this._bindPointer();
      this._ready = true;
      this._applyPost();
      this._loop = this._loop.bind(this);
      this._raf = requestAnimationFrame(this._loop);
    }

    _seedField() {
      var camZ = this._baseZ - this._travel, camX = this._camOff.x, camY = this._camOff.y;
      for (var i = 0; i < MAX_TILES; i++) {
        var t = this._tiles[i];
        t.hz = camZ - (NEAR + this._rnd() * (FAR - NEAR));
        t.hx = camX + (this._rnd() - 0.5) * 2 * HALF_W;
        t.hy = camY + (this._rnd() - 0.5) * 2 * HALF_H;
        t.ph = this._rnd() * Math.PI * 2;
        t.fr = 0.3 + this._rnd() * 0.4;
        t.pos.set(t.hx, t.hy, t.hz);
        t.vel.set(0, 0, 0);
        t.s = 0;
      }
    }

    _reproject(t) {
      var ci = this._projCursor % N_PROJECTS;
      this._projCursor++;
      t.project = PROJECTS[ci];
      t.cell = ci;
    }

    _resize() {
      var w = this.clientWidth, h = this.clientHeight;
      if (!w || !h || w <= 1) {
        var self = this;
        requestAnimationFrame(function () { if (self._ready !== undefined) self._resize(); });
        return;
      }
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._renderer.setPixelRatio(dpr);
      this._renderer.setSize(w, h, false);
      var scale = this._renderScale || 1.0;
      this._rt.setSize(Math.max(4, Math.round(w * dpr * scale)), Math.max(4, Math.round(h * dpr * scale)));
      this._aspect = w / h;
      this._camera.aspect = this._aspect;
      this._camera.updateProjectionMatrix();
      this._w = w; this._h = h;
      this._applyPost();
      this._applyStarScale();
    }

    _applyPost() {
      if (!this._postMat) return;
      var u = this._postMat.uniforms;
      u.uK.value = -this._distort * this._aspect;
      u.uAspect.value = this._aspect;
    }

    _buildStars() {
      var T = window.THREE;
      var pos = new Float32Array(STAR_N * 3);
      var col = new Float32Array(STAR_N * 3);
      var aSize = new Float32Array(STAR_N);
      var aBright = new Float32Array(STAR_N);
      var aTw = new Float32Array(STAR_N);
      this._starBase = new Float32Array(STAR_N * 3);
      var rnd = this._rnd || (this._rnd = mulberry(11));
      for (var i = 0; i < STAR_N; i++) {
        var bx = (rnd() - 0.5) * 2 * SBX;
        var by = (rnd() - 0.5) * 2 * SBY;
        var bz = (rnd() - 0.5) * 2 * SBZ;
        this._starBase[i * 3] = bx; this._starBase[i * 3 + 1] = by; this._starBase[i * 3 + 2] = bz;
        pos[i * 3] = bx; pos[i * 3 + 1] = by; pos[i * 3 + 2] = bz;
        // color: mostly warm-white, some cool blue / faint gold
        var tint = rnd();
        var r = 1, gg = 1, bl = 1;
        if (tint > 0.82) { r = 0.72; gg = 0.82; bl = 1.0; }        // blue-white
        else if (tint > 0.72) { r = 0.86; gg = 0.9; bl = 1.0; }    // cool white
        else if (tint > 0.64) { r = 1.0; gg = 0.93; bl = 0.78; }   // warm gold
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = bl;
        // size: most tiny, a handful large & bright (shiny hero stars)
        var q = rnd();
        if (q > 0.975) { aSize[i] = 0.30 + rnd() * 0.22; aBright[i] = 1.0; }
        else if (q > 0.86) { aSize[i] = 0.16 + rnd() * 0.1; aBright[i] = 0.9; }
        else { aSize[i] = 0.055 + rnd() * 0.075; aBright[i] = 0.5 + rnd() * 0.35; }
        aTw[i] = rnd();
      }
      var geo = new T.BufferGeometry();
      this._starPosAttr = new T.BufferAttribute(pos, 3);
      this._starPosAttr.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('position', this._starPosAttr);
      geo.setAttribute('aColor', new T.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new T.BufferAttribute(aSize, 1));
      geo.setAttribute('aBright', new T.BufferAttribute(aBright, 1));
      geo.setAttribute('aTw', new T.BufferAttribute(aTw, 1));
      this._starMat = new T.ShaderMaterial({
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
        uniforms: {
          uTex: { value: new T.CanvasTexture(makeStarSprite()) },
          uTime: { value: 0 }, uScale: { value: 900 }, uDpr: { value: 1 },
          uFogNear: { value: 16 }, uFogFar: { value: FAR + 20 }
        },
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false
      });
      this._stars = new T.Points(geo, this._starMat);
      this._stars.frustumCulled = false;
      this._scene.add(this._stars);
      this._applyStarScale();
    }

    _applyStarScale() {
      if (!this._starMat) return;
      var dpr = this._renderer ? this._renderer.getPixelRatio() : 1;
      var scale = this._renderScale || 1;
      var hPx = (this._h || this.clientHeight || 800) * dpr * scale;
      var tan = Math.tan((this._camera.fov * Math.PI) / 360);
      this._starMat.uniforms.uScale.value = hPx / (2 * tan);
      this._starMat.uniforms.uDpr.value = dpr;
      if (this._burstMat) {
        this._burstMat.uniforms.uScale.value = hPx / (2 * tan);
        this._burstMat.uniforms.uDpr.value = dpr;
      }
    }

    _buildBurst() {
      var T = window.THREE;
      var N = this._burstN = 64;
      this._burstPos = new Float32Array(N * 3);
      this._burstVel = new Float32Array(N * 3);
      this._burstLife = new Float32Array(N);
      this._burstSize = new Float32Array(N);
      var geo = new T.BufferGeometry();
      this._burstPosAttr = new T.BufferAttribute(this._burstPos, 3);
      this._burstPosAttr.setUsage(T.DynamicDrawUsage);
      this._burstLifeAttr = new T.BufferAttribute(this._burstLife, 1);
      this._burstLifeAttr.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('position', this._burstPosAttr);
      geo.setAttribute('aLife', this._burstLifeAttr);
      geo.setAttribute('aSize', new T.BufferAttribute(this._burstSize, 1));
      this._burstMat = new T.ShaderMaterial({
        vertexShader: BURST_VERT, fragmentShader: BURST_FRAG,
        uniforms: {
          uTex: { value: new T.CanvasTexture(makeStarSprite()) },
          uScale: { value: 900 }, uDpr: { value: 1 }
        },
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false
      });
      var pts = new T.Points(geo, this._burstMat);
      pts.frustumCulled = false;
      this._scene.add(pts);
      this._burstCursor = 0;
    }

    _spawnBurst(x, y, z, r) {
      var count = 18;
      for (var i = 0; i < count; i++) {
        var j = this._burstCursor = (this._burstCursor + 1) % this._burstN;
        var th = Math.random() * Math.PI * 2;
        var ph = Math.acos(2 * Math.random() - 1);
        var sp = 0.05 + Math.random() * 0.09;
        var dx = Math.sin(ph) * Math.cos(th), dy = Math.sin(ph) * Math.sin(th), dz = Math.cos(ph);
        this._burstPos[j * 3] = x + dx * r * 0.85;
        this._burstPos[j * 3 + 1] = y + dy * r * 0.85;
        this._burstPos[j * 3 + 2] = z + dz * r * 0.85;
        this._burstVel[j * 3] = dx * sp;
        this._burstVel[j * 3 + 1] = dy * sp;
        this._burstVel[j * 3 + 2] = dz * sp * 0.6;
        this._burstLife[j] = 1;
        this._burstSize[j] = 0.05 + Math.random() * 0.08;
      }
      this._burstMat && (this._burstPosAttr.needsUpdate = true);
    }

    _worldToScreen(p) {
      // world → render NDC → invert the barrel distortion → CSS pixels
      var T = window.THREE;
      var v = new T.Vector3(p.x, p.y, p.z).project(this._camera);
      var qx = v.x / 2, qy = v.y / 2;
      var ox = qx, oy = qy, K = -this._distort * this._aspect;
      for (var it = 0; it < 4; it++) {
        var ax = ox * this._aspect;
        var f = 1 + K * (ax * ax + oy * oy);
        ox = qx / f; oy = qy / f;
      }
      var rect = this.getBoundingClientRect();
      return {
        x: rect.left + (ox + 0.5) * rect.width,
        y: rect.top + (0.5 - oy) * rect.height
      };
    }

    _pickNdc(su, sv) {
      // invert barrel distortion so hover/click hits the tile UNDER the cursor
      var offx = su - 0.5, offy = (1 - sv) - 0.5;
      var qx = offx * this._aspect, qy = offy;
      var r2 = qx * qx + qy * qy;
      var f = 1 + (-this._distort * this._aspect) * r2;
      this._ndc.set((0.5 + offx * f) * 2 - 1, (0.5 + offy * f) * 2 - 1);
    }

    // raycast the current _ndc against the planet field; returns tile index or -1.
    // shared by the rAF hover pass and tap-to-open so both pick identically
    _raycastAtNdc() {
      if (this._ndc.x < -1 || this._ndc.x > 1) return -1;
      this._ray.setFromCamera(this._ndc, this._camera);
      // instances move every frame (infinite field) → force the cached bounding sphere to refresh
      this._planetMesh.boundingSphere = null;
      var hits = this._ray.intersectObject(this._planetMesh, false);
      for (var hi = 0; hi < hits.length; hi++) {
        var id = hits[hi].instanceId;
        if (id != null && this._tiles[id] && this._tiles[id].s > 0.5) return id;
      }
      return -1;
    }

    _bindPointer() {
      var self = this, el = this;
      // one entry per active finger/mouse button: pointerId -> last {x, y}
      var pointers = new Map();
      var moved = 0;

      function pickAt(clientX, clientY) {
        var rect = el.getBoundingClientRect();
        self._pickNdc((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
        self._pointerIn = true;
      }

      el.addEventListener('wheel', function (e) {
        if (self._paused) return;
        e.preventDefault();
        self._travelVel += e.deltaY * 0.010 * self._flySpeed;
      }, { passive: false });

      el.addEventListener('pointerdown', function (e) {
        if (self._paused) return;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events have no active pointer */ }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          self._dragging = true;
          el.style.cursor = 'grabbing';
          moved = 0;
          self._travelVel *= 0.3;
          // pick at the down point: a clean tap may never fire pointermove,
          // so the hover raycast must not be the only thing that aims picks
          pickAt(e.clientX, e.clientY);
        } else {
          // a second finger means this gesture can no longer be a tap
          moved = 999;
        }
      });

      el.addEventListener('pointermove', function (e) {
        if (pointers.size <= 1) pickAt(e.clientX, e.clientY);
        var p = pointers.get(e.pointerId);
        if (!p) return;
        if (pointers.size === 1) {
          var dx = e.clientX - p.x, dy = e.clientY - p.y;
          p.x = e.clientX; p.y = e.clientY;
          moved += Math.abs(dx) + Math.abs(dy);
          // drag strafes you through space (wheel / pinch handles zoom)
          self._panVel.x += dx * 0.012;
          self._panVel.y -= dy * 0.012;
        } else if (pointers.size === 2) {
          // pinch: finger-distance delta flies you forward/back,
          // centroid delta pans (two-finger drag)
          var pts = Array.from(pointers.values());
          var oldD = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          var oldCx = (pts[0].x + pts[1].x) / 2, oldCy = (pts[0].y + pts[1].y) / 2;
          p.x = e.clientX; p.y = e.clientY;
          var newD = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          var newCx = (pts[0].x + pts[1].x) / 2, newCy = (pts[0].y + pts[1].y) / 2;
          if (!self._paused) {
            self._travelVel += (newD - oldD) * 0.006 * self._flySpeed;
            self._panVel.x += (newCx - oldCx) * 0.012;
            self._panVel.y -= (newCy - oldCy) * 0.012;
          }
        }
      });

      function release(e) {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        if (pointers.size > 0) {
          // pinch ended with a finger still down: it continues as a drag, never a tap
          moved = 999;
          return;
        }
        if (self._dragging) {
          self._dragging = false;
          el.style.cursor = 'grab';
          // fingers wobble more than mice — allow a bigger slop for touch taps
          var tapSlop = e.pointerType === 'touch' ? 9 : 4;
          if (moved < tapSlop && !self._paused) {
            // raycast fresh at the release point instead of trusting the
            // rAF-loop hover index (touch may never have hovered)
            pickAt(e.clientX, e.clientY);
            var hit = self._raycastAtNdc();
            if (hit >= 0) {
              self._travelVel = 0;
              var t = self._tiles[hit];
              // burst the bubble and hand the card its on-screen origin
              self._openIdx = hit;
              t.hidden = true;
              self._spawnBurst(t.pos.x, t.pos.y, t.pos.z, t.s * 0.5);
              var scr = self._worldToScreen(t.pos);
              window.dispatchEvent(new CustomEvent('sphere:open', {
                detail: Object.assign({}, t.project, { screen: scr })
              }));
            }
          }
        }
        if (e.pointerType === 'touch') {
          // no hover once the finger lifts — let the loop emit sphere:hover(null)
          self._pointerIn = false;
          self._ndc.set(2, 2);
        }
      }
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', function () { self._pointerIn = false; });
    }

    _loop() {
      this._raf = requestAnimationFrame(this._loop);
      this._time += 1 / 60;

      // gentle auto-glide forward (frozen while a card is open)
      if (this._paused) {
        this._travelVel *= 0.75;
        this._panVel.x *= 0.75; this._panVel.y *= 0.75;
      } else if (this._auto && !this._dragging && Math.abs(this._travelVel) < 0.012) {
        this._travelVel += 0.006 * this._flySpeed;
      }
      this._travel += this._travelVel;
      this._travelVel *= 0.9;

      // strafe (infinite)
      this._camOff.x += this._panVel.x; this._camOff.y += this._panVel.y;
      this._panVel.x *= 0.86; this._panVel.y *= 0.86;

      var camZ = this._baseZ - this._travel, camX = this._camOff.x, camY = this._camOff.y;
      this._camera.position.set(camX, camY, camZ);
      this._camera.lookAt(camX, camY, camZ - 12);
      var camQ = this._camera.quaternion;

      // starfield tiles infinitely around the camera
      if (this._stars) {
        this._starMat.uniforms.uTime.value = this._time;
        var sp = this._starPosAttr.array, sb = this._starBase;
        for (var si = 0; si < STAR_N; si++) {
          var rx = sb[si * 3] - camX; rx = ((rx + SBX) % (2 * SBX) + 2 * SBX) % (2 * SBX) - SBX;
          var ry = sb[si * 3 + 1] - camY; ry = ((ry + SBY) % (2 * SBY) + 2 * SBY) % (2 * SBY) - SBY;
          var rz = sb[si * 3 + 2] - camZ; rz = ((rz + SBZ) % (2 * SBZ) + 2 * SBZ) % (2 * SBZ) - SBZ;
          sp[si * 3] = camX + rx; sp[si * 3 + 1] = camY + ry; sp[si * 3 + 2] = camZ + rz;
        }
        this._starPosAttr.needsUpdate = true;
      }

      // burst droplets
      if (this._burstMat) {
        var anyAlive = false;
        for (var bi = 0; bi < this._burstN; bi++) {
          if (this._burstLife[bi] <= 0) continue;
          anyAlive = true;
          this._burstLife[bi] = Math.max(0, this._burstLife[bi] - 0.028);
          this._burstPos[bi * 3] += this._burstVel[bi * 3];
          this._burstPos[bi * 3 + 1] += this._burstVel[bi * 3 + 1];
          this._burstPos[bi * 3 + 2] += this._burstVel[bi * 3 + 2];
          this._burstVel[bi * 3] *= 0.92;
          this._burstVel[bi * 3 + 1] *= 0.92;
          this._burstVel[bi * 3 + 2] *= 0.92;
        }
        if (anyAlive) {
          this._burstPosAttr.needsUpdate = true;
          this._burstLifeAttr.needsUpdate = true;
        }
      }

      var n = this._activeN;
      for (var i = 0; i < MAX_TILES; i++) {
        var t = this._tiles[i];
        if (i >= n) { t.sT = 0; }
        else {
          var recycled = false;
          var a = camZ - t.hz;               // depth ahead of camera
          if (a < NEAR) { t.hz = camZ - FAR; this._reseedXY(t, camX, camY); this._reproject(t); recycled = true; }
          else if (a > FAR) { t.hz = camZ - NEAR; this._reseedXY(t, camX, camY); this._reproject(t); recycled = true; }
          // lateral wrap (invisible: happens where latVis == 0)
          var lx = t.hx - camX, ly = t.hy - camY;
          if (lx > HALF_W) { t.hx -= 2 * HALF_W; recycled = true; }
          else if (lx < -HALF_W) { t.hx += 2 * HALF_W; recycled = true; }
          if (ly > HALF_H) { t.hy -= 2 * HALF_H; recycled = true; }
          else if (ly < -HALF_H) { t.hy += 2 * HALF_H; recycled = true; }
          a = camZ - t.hz; lx = t.hx - camX; ly = t.hy - camY;

          // visibility: fade at near & far depth edges AND lateral edges
          var zNear = Math.min(1, Math.max(0, (a - NEAR) / FADE_NEAR));
          var zFar = Math.min(1, Math.max(0, (FAR - a) / FADE_FAR));
          var latX = Math.min(1, Math.max(0, (HALF_W - Math.abs(lx)) / FADE_LAT));
          var latY = Math.min(1, Math.max(0, (HALF_H - Math.abs(ly)) / FADE_LAT));
          var vis = zNear * zFar * latX * latY;

          t.tgt.set(
            t.hx + Math.sin(this._time * t.fr + t.ph) * 0.4,
            t.hy + Math.cos(this._time * t.fr * 0.8 + t.ph * 2) * 0.32,
            t.hz
          );
          t.sT = this._cardSize * vis;
          if (t.hidden) t.sT = 0;
          if (recycled) { t.pos.copy(t.tgt); t.vel.set(0, 0, 0); t.s = 0; }
        }
      }

      // NaN guard
      for (var g = 0; g < MAX_TILES; g++) {
        var tg = this._tiles[g];
        if (!isFinite(tg.pos.x + tg.pos.y + tg.pos.z)) { tg.pos.copy(tg.tgt); tg.vel.set(0, 0, 0); }
      }

      // hover raycast (distortion-corrected) against the instanced planet field
      var best = -1;
      if (this._pointerIn && !this._paused) best = this._raycastAtNdc();
      this._hoverIdx = best;
      var hoverProj = best >= 0 ? this._tiles[best].project : null;
      if (hoverProj !== this._lastHoverProject) {
        this._lastHoverProject = hoverProj;
        window.dispatchEvent(new CustomEvent('sphere:hover', { detail: hoverProj }));
      }

      // springs + scale → write per-instance matrices
      var dummy = this._dummy;
      for (var j = 0; j < MAX_TILES; j++) {
        var tt = this._tiles[j];
        tt.vel.x += (tt.tgt.x - tt.pos.x) * tt.k;
        tt.vel.y += (tt.tgt.y - tt.pos.y) * tt.k;
        tt.vel.z += (tt.tgt.z - tt.pos.z) * tt.k;
        tt.vel.multiplyScalar(0.76);
        tt.pos.add(tt.vel);
        tt.hover += ((j === best ? 1 : 0) - tt.hover) * 0.14;
        var sT = tt.sT * (1 + tt.hover * 0.10);
        tt.s += (sT - tt.s) * (tt.hidden ? 0.32 : 0.12);
        var sc = Math.max(tt.s, 0.0001);
        tt.spinAngle += tt.spin;
        dummy.position.set(tt.pos.x, tt.pos.y, tt.pos.z + (tt.hover > 0.01 ? tt.hover * 0.6 : 0));
        dummy.rotation.set(tt.tilt, tt.spinAngle, 0);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        this._planetMesh.setMatrixAt(j, dummy.matrix);
      }
      this._planetMesh.instanceMatrix.needsUpdate = true;

      this.style.cursor = best >= 0 && !this._dragging ? 'pointer' : (this._dragging ? 'grabbing' : 'grab');

      this._renderer.setRenderTarget(this._rt);
      this._renderer.clear();
      this._renderer.render(this._scene, this._camera);
      this._renderer.setRenderTarget(null);
      this._renderer.render(this._postScene, this._postCam);
    }

    _reseedXY(t, camX, camY) {
      t.hx = camX + (this._rnd() - 0.5) * 2 * HALF_W;
      t.hy = camY + (this._rnd() - 0.5) * 2 * HALF_H;
      t.ph = this._rnd() * Math.PI * 2;
      t.fr = 0.3 + this._rnd() * 0.4;
      t.tilt = (this._rnd() - 0.5) * 0.6;
      t.spin = (this._rnd() - 0.5) * 0.012;
    }
  }

  if (!customElements.get('shape-lab')) customElements.define('shape-lab', ShapeLab);
})();
