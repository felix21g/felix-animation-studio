import { useEffect, useRef } from 'react';

// Follows the cursor via a ref-driven transform so pointermove never re-renders React.
export default function HoverLabel({ hover }) {
  const trackRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
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
