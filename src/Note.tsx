// Banknote artwork: engraved guilloche lines, drawn once as SVG.
// The note is QuidsIn's one signature element; everything else stays plain.

function wavePath(y: number, amp: number, freq: number, phase: number, width = 400) {
  let d = `M0 ${y.toFixed(1)}`;
  for (let x = 4; x <= width; x += 4) {
    const yy = y + amp * Math.sin((x / width) * Math.PI * 2 * freq + phase);
    d += ` L${x} ${yy.toFixed(1)}`;
  }
  return d;
}

function rosettePath(cx: number, cy: number, r: number, lobes: number, depth: number, turn: number) {
  let d = "";
  for (let i = 0; i <= 360; i += 2) {
    const a = (i * Math.PI) / 180;
    const rr = r + depth * Math.sin(a * lobes + turn);
    const x = cx + rr * Math.cos(a);
    const y = cy + rr * Math.sin(a);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d + "Z";
}

const WAVES = Array.from({ length: 14 }, (_, i) => wavePath(18 + i * 15, 9, 2.5, i * 0.45));
const ROSETTE = Array.from({ length: 9 }, (_, i) => rosettePath(330, 64, 30 + i * 5, 12, 6, i * 0.35));

export function Guilloche({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        {WAVES.map((d, i) => (
          <path key={i} d={d} opacity={0.55} />
        ))}
        {ROSETTE.map((d, i) => (
          <path key={`r${i}`} d={d} opacity={0.8} />
        ))}
      </g>
    </svg>
  );
}

/** Home-page illustration: a note torn in two, the halves drifting apart once. */
export function TornNote() {
  return (
    <div className="torn" aria-hidden="true">
      <div className="torn-half left">
        <Guilloche className="torn-art" />
        <span className="torn-sign">£</span>
      </div>
      <div className="torn-half right">
        <Guilloche className="torn-art" />
        <span className="torn-serial">QI-7KQ4-M9X2</span>
      </div>
    </div>
  );
}
