const SEP = ' · ';
const COARSE =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

export default function HintPill() {
  const text = COARSE
    ? `DRAG TO MOVE ${SEP} PINCH TO ZOOM ${SEP} TAP A BUBBLE`
    : `DRAG TO MOVE ${SEP} SCROLL TO ZOOM ${SEP} CLICK A BUBBLE`;
  return (
    <div className="hint-wrap">
      <span className="hint-pill">{text}</span>
    </div>
  );
}
