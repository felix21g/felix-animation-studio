import { useEffect, useRef } from 'react';
import type { Project } from '../data/projects';

interface HoverLabelProps {
  hover: Project | null;
}

// Follows the cursor via a ref-driven transform so pointermove never re-renders React.
export default function HoverLabel({ hover }: HoverLabelProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (trackRef.current) {
        trackRef.current.style.transform =
          `translate(${e.clientX + 18}px, ${e.clientY + 16}px)`;
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <div ref={trackRef} className="hover-label-track">
      <div className={hover ? 'hover-label is-visible' : 'hover-label'}>
        <span className="hover-label-index">
          {hover ? String(hover.index + 1).padStart(2, '0') : ''}
        </span>
        <span>{hover ? hover.title : ''}</span>
      </div>
    </div>
  );
}
