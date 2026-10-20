/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from "react";

export const PALETTE: { paper: string; ink: string }[] = [
  { paper: "#1f2a44", ink: "#e8ecf4" },
  { paper: "#23382c", ink: "#e7efe9" },
  { paper: "#4a1f24", ink: "#f5e8e6" },
  { paper: "#5b4a1e", ink: "#f6efdc" },
  { paper: "#2e2e33", ink: "#ececf0" },
  { paper: "#1d3c40", ink: "#e3f0f0" },
  { paper: "#3b2546", ink: "#efe6f3" },
  { paper: "#6b3221", ink: "#f8ebe4" },
  { paper: "#d9d2c3", ink: "#2a2620" },
  { paper: "#c9cfd6", ink: "#1f252c" },
  { paper: "#e4c9a8", ink: "#2d2116" },
  { paper: "#93413a", ink: "#fbeee9" },
  { paper: "#f1ece2", ink: "#262320" },
  { paper: "#2d4a6b", ink: "#eaf1f8" },
];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paletteFor(key: string) {
  return PALETTE[hashString(key) % PALETTE.length];
}

const W = 200;
const H = 300;

export function CoverArt({ seed, title }: { seed: string; title?: string }) {
  const h = hashString(seed);
  const r = rng(h);
  const { paper, ink } = paletteFor(seed);
  const kind = h % 6;
  const id = `g${h.toString(36)}`;
  const shapes: ReactNode[] = [];

  if (kind === 0) {
    const cx = 40 + r() * 120;
    const cy = 50 + r() * 80;
    for (let i = 0; i < 9; i++) shapes.push(<circle key={i} cx={cx} cy={cy} r={14 + i * 15} fill="none" stroke={ink} strokeOpacity={0.5 - i * 0.045} strokeWidth={i % 3 === 0 ? 1.6 : 0.8} />);
    shapes.push(<circle key="c" cx={cx} cy={cy} r={6} fill={ink} fillOpacity={0.85} />);
  } else if (kind === 1) {
    for (let x = 0; x < 9; x++)
      for (let y = 0; y < 10; y++) {
        const on = r() > 0.82;
        shapes.push(<circle key={`${x}-${y}`} cx={18 + x * 21} cy={16 + y * 19} r={on ? 4.2 : 1.4} fill={ink} fillOpacity={on ? 0.85 : 0.35} />);
      }
  } else if (kind === 2) {
    for (let i = 0; i < 12; i++) {
      const y = 18 + i * 15;
      const a = 6 + r() * 10;
      const f = 0.02 + r() * 0.03;
      let d = `M0 ${y}`;
      for (let x = 0; x <= W; x += 10) d += ` L${x} ${(y + Math.sin(x * f + i) * a).toFixed(1)}`;
      shapes.push(<path key={i} d={d} fill="none" stroke={ink} strokeOpacity={0.18 + (i % 4) * 0.12} strokeWidth={1.2} />);
    }
  } else if (kind === 3) {
    const cy = 70 + r() * 40;
    shapes.push(
      <clipPath key="cp" id={`${id}-c`}>
        <circle cx={W / 2} cy={cy} r={62} />
      </clipPath>,
    );
    shapes.push(
      <g key="s" clipPath={`url(#${id}-c)`}>
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={0} y={cy - 62 + i * 9} width={W} height={4 + i * 0.25} fill={ink} fillOpacity={0.8} />
        ))}
      </g>,
    );
    shapes.push(<line key="hz" x1={0} x2={W} y1={cy + 70} y2={cy + 70} stroke={ink} strokeOpacity={0.4} />);
  } else if (kind === 4) {
    for (let l = 0; l < 4; l++) {
      const base = 90 + l * 26;
      let d = `M0 ${H}L0 ${base}`;
      for (let x = 0; x <= W; x += 25) d += ` L${x} ${base - r() * (40 - l * 6)}`;
      d += ` L${W} ${H}Z`;
      shapes.push(<path key={l} d={d} fill={ink} fillOpacity={0.12 + l * 0.12} />);
    }
    shapes.push(<circle key="m" cx={40 + r() * 120} cy={42} r={14} fill={ink} fillOpacity={0.8} />);
  } else {
    const letter = (title ?? seed).replace(/^https?:\/\/(www\.)?/, "").trim().charAt(0).toUpperCase() || "G";
    shapes.push(
      <text key="t" x={W / 2} y={150} textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontWeight={300} fontSize={190} fill={ink} fillOpacity={0.88}>
        {letter}
      </text>,
    );
    shapes.push(<rect key="f" x={14} y={14} width={W - 28} height={182} fill="none" stroke={ink} strokeOpacity={0.35} />);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" width="100%" height="100%" aria-hidden>
      <rect width={W} height={H} fill={paper} />
      {shapes}
    </svg>
  );
}

export function TransitArt({ lines, paper, ink, label }: { lines: [string, string][]; paper: string; ink: string; label: string }) {
  const n = lines.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" width="100%" height="100%" aria-hidden>
      <rect width={W} height={H} fill={paper} />
      <g stroke={ink} strokeOpacity={0.06}>
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={i * 20} x2={i * 20} y1={0} y2={H} />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <line key={`h${i}`} x1={0} x2={W} y1={i * 20} y2={i * 20} />
        ))}
      </g>
      {lines.map(([name, color], i) => {
        const y0 = 34 + i * (130 / n);
        const y1 = 190 - i * (130 / n) - 10;
        const hubX = 96 + (i - n / 2) * 4;
        const d = `M-5 ${y0} L${hubX - 46} ${y0} L${hubX} ${110 + (i - n / 2) * 8} L${hubX + 46} ${y1} L205 ${y1}`;
        return (
          <g key={name}>
            <path d={d} fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={hubX - 46} cy={y0} r={4.2} fill={paper} stroke={ink} strokeWidth={2} />
            <circle cx={hubX + 46} cy={y1} r={4.2} fill={paper} stroke={ink} strokeWidth={2} />
            <rect x={6} y={y0 - 9} width={22} height={18} rx={5} fill={color} />
            <text x={17} y={y0 + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" fontFamily="var(--sans)">
              {name}
            </text>
          </g>
        );
      })}
      <circle cx={96} cy={110} r={11} fill={paper} stroke={ink} strokeWidth={3} />
      <text x={W - 12} y={24} textAnchor="end" fontSize={15} fontStyle="italic" fill={ink} fillOpacity={0.9} fontFamily="var(--serif)">
        {label}
      </text>
    </svg>
  );
}
