import type { MouseEventHandler } from 'react';
import type { ProjectOpenDetail } from '../data/projects';

interface DetailCardProps {
  open: ProjectOpenDetail | null;
  shown: boolean;
  onClose: MouseEventHandler<HTMLElement>;
}

// Backdrop + project detail card. The card grows out of the burst bubble's
// on-screen position (open.screen, fisheye-corrected by the engine) and
// shrinks back into it on dismiss.
export default function DetailCard({ open, shown, onClose }: DetailCardProps) {
  const active = shown && !!open;

  let from = 'scale(0.965) translateY(14px)';
  if (open) {
    const dx = open.screen.x - window.innerWidth / 2;
    const dy = open.screen.y - window.innerHeight / 2;
    from = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(0.06)`;
  }

  return (
    <div
      className={active ? 'card-backdrop is-open' : 'card-backdrop'}
      style={{ pointerEvents: open ? 'auto' : 'none' }}
      onClick={onClose}
    >
      <div
        className="detail-card"
        style={{
          opacity: active ? 1 : 0,
          transform: active ? 'translate(0,0) scale(1)' : from,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-card-top">
          <span className="index-chip">
            {open ? String(open.index + 1).padStart(2, '0') : ''}
          </span>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            &#10005;
          </button>
        </div>
        <h2 className="detail-title">{open ? open.title : ''}</h2>
        <div className="chip-row">
          <span className="chip">{open ? open.year : ''}</span>
          <span className="chip">{open ? open.kind : ''}</span>
        </div>
        <div className="media-placeholder">
          <span>ANIMATION PLACEHOLDER</span>
        </div>
        <p className="detail-desc">{open ? open.desc : ''}</p>
        <a href="#" className="case-link">View case study &#8594;</a>
      </div>
    </div>
  );
}
