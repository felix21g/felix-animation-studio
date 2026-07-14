import { useCallback, useEffect, useRef, useState } from 'react';
import ShapeLab from './components/ShapeLab';
import Header from './components/Header';
import HoverLabel from './components/HoverLabel';
import HintPill from './components/HintPill';
import DetailCard from './components/DetailCard';
import { projects, type Project, type ProjectOpenDetail } from './data/projects';

export default function App() {
  const [open, setOpen] = useState<ProjectOpenDetail | null>(null);
  const [shown, setShown] = useState(false);
  const [hover, setHover] = useState<Project | null>(null);
  const [, setResizeTick] = useState(0);
  const openRef = useRef<ProjectOpenDetail | null>(null);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  openRef.current = open;

  const close = useCallback(() => {
    if (!openRef.current || closingRef.current) return;
    closingRef.current = true;
    // card shrinks back to the bubble's spot first, then the bubble re-forms
    setShown(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sphere:flatten', { detail: { flat: false } }));
      closingRef.current = false;
      setOpen(null);
    }, 480);
  }, []);

  useEffect(() => {
    const onOpen = (e: CustomEvent<ProjectOpenDetail>) => {
      setOpen(e.detail);
      setShown(false);
      setHover(null);
      window.dispatchEvent(new CustomEvent('sphere:flatten', { detail: { flat: true } }));
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };
    const onHover = (e: CustomEvent<Project | null>) => {
      if (!openRef.current) setHover(e.detail);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // the card's from-transform is pixel-based — recompute on resize while open
    const onResize = () => {
      if (openRef.current) setResizeTick((t) => t + 1);
    };
    window.addEventListener('sphere:open', onOpen);
    window.addEventListener('sphere:hover', onHover);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('sphere:open', onOpen);
      window.removeEventListener('sphere:hover', onHover);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [close]);

  return (
    <div className="stage">
      <ShapeLab projects={projects} />
      <div className="top-frost" aria-hidden="true" />
      <Header />
      <HoverLabel hover={hover} />
      <HintPill />
      <DetailCard open={open} shown={shown} onClose={close} />
    </div>
  );
}
