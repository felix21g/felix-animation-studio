import { useCallback, useEffect, useRef, useState } from 'react';
import ShapeLab from './components/ShapeLab.jsx';
import Header from './components/Header.jsx';
import HoverLabel from './components/HoverLabel.jsx';
import HintPill from './components/HintPill.jsx';
import DetailCard from './components/DetailCard.jsx';
import { projects } from './data/projects.js';

export default function App() {
  const [open, setOpen] = useState(null);
  const [shown, setShown] = useState(false);
  const [hover, setHover] = useState(null);
  const [, setResizeTick] = useState(0);
  const openRef = useRef(null);
  const closingRef = useRef(false);
  const closeTimer = useRef(null);
  openRef.current = open;

  const close = useCallback(() => {
    if (!openRef.current || closingRef.current) return;
    closingRef.current = true;
    // card shrinks back to the bubble's spot first, then the bubble re-forms
    setShown(false);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sphere:flatten', { detail: { flat: false } }));
      closingRef.current = false;
      setOpen(null);
    }, 480);
  }, []);

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(e.detail);
      setShown(false);
      setHover(null);
      window.dispatchEvent(new CustomEvent('sphere:flatten', { detail: { flat: true } }));
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };
    const onHover = (e) => {
      if (!openRef.current) setHover(e.detail);
    };
    const onKey = (e) => {
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
      clearTimeout(closeTimer.current);
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
