import { useEffect, useRef } from 'react';
import '../engine/shape-lab';
import type { Project } from '../data/projects';

interface ShapeLabProps {
  projects: Project[];
  distortion?: number;
  cardsize?: number;
  density?: number;
  flyspeed?: number;
  automotion?: 'on' | 'off';
}

// Thin wrapper over the framework-agnostic <shape-lab> web component.
// Attribute values are the design defaults from the README handoff.
export default function ShapeLab({
  projects,
  distortion = 0.3,
  cardsize = 4,
  density = 35,
  flyspeed = 0.4,
  automotion = 'on',
}: ShapeLabProps) {
  const ref = useRef<ShapeLabElement>(null);

  useEffect(() => {
    if (ref.current && projects) ref.current.projects = projects;
  }, [projects]);

  // Intro: hold a flat lens long enough to register, then snap into the
  // fisheye with an overshoot (bows past the target, relaxes back) while a
  // forward surge sweeps bubbles toward the viewer. The engine's `distortion`
  // attribute is live (it updates the shader uniform), and the surge rides
  // the engine's own wheel-momentum physics.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = Number(distortion);
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      el.setAttribute('distortion', String(target));
      return;
    }
    const HOLD = 700;
    const DURATION = 1200;
    // easeOutBack with c1=4: peaks at ~1.38x around t=0.47, settles to 1
    const backOut = (t: number) => {
      const c1 = 4;
      const u = t - 1;
      return 1 + (c1 + 1) * u * u * u + c1 * u * u;
    };
    let raf = 0;
    let start: number | undefined;
    let surged = false;
    const tick = (now: number) => {
      if (start === undefined) start = now;
      const t = (now - start - HOLD) / DURATION;
      if (t >= 1) {
        el.setAttribute('distortion', String(target));
        return;
      }
      if (t > 0) {
        if (!surged) {
          surged = true;
          el.dispatchEvent(new WheelEvent('wheel', { deltaY: 180, cancelable: true }));
        }
        el.setAttribute('distortion', (target * backOut(t)).toFixed(4));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <shape-lab
      ref={ref}
      distortion="0"
      cardsize={String(cardsize)}
      density={String(density)}
      flyspeed={String(flyspeed)}
      automotion={automotion}
    />
  );
}
