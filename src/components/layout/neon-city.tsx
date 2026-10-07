import { useId, useMemo } from "react";

type Pal = { sky: [string, string, string]; sun: string; layers: [string, string, string]; stars?: boolean; glow?: [string, string] };

/** Small seeded random numbers, so the street looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * A narrow Tokyo back street at night, in one-point perspective.
 * The left wall runs from the screen edge (x = 0) to the far end (x = 600); the right wall mirrors it.
 * A point on a wall is (x, v): x along the street, v from the top of the wall (0) to the pavement (1).
 */
const W = 1440;
const H = 900;
const FAR = 600;
const top = (x: number) => 0.55 * x;
const bot = (x: number) => 860 - 0.5667 * x;
const wallH = (x: number) => bot(x) - top(x);
const at = (x: number, v: number, right = false): [number, number] => [right ? W - x : x, top(x) + v * wallH(x)];
const quad = (xa: number, xb: number, v1: number, v2: number, right = false) => {
  const p = [at(xa, v1, right), at(xb, v1, right), at(xb, v2, right), at(xa, v2, right)];
  return `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} Z`;
};

/** Where each building starts along the street (they get narrower with distance). */
const LEFT = [0, 190, 330, 425, 490, 535, 568, 590, FAR];
const RIGHT = [0, 160, 300, 410, 480, 528, 562, 588, FAR];

type Sign = { x: number; v: number; text: string; kind: "box" | "red" | "neon0" | "neon1"; right?: boolean; tall?: number };
const SIGNS: Sign[] = [
  { x: 260, v: 0.22, text: "本屋", kind: "box" },
  { x: 445, v: 0.3, text: "ラーメン", kind: "neon0", tall: 1.25 },
  { x: 528, v: 0.28, text: "喫茶", kind: "box" },
  { x: 575, v: 0.34, text: "薬", kind: "red" },
  { x: 250, v: 0.3, text: "ホテル", kind: "box", right: true },
  { x: 430, v: 0.36, text: "居酒屋", kind: "red", right: true },
  { x: 520, v: 0.3, text: "バー", kind: "neon1", right: true },
  { x: 580, v: 0.3, text: "宿", kind: "box", right: true },
];

const JP = "'Hiragino Sans','Yu Gothic','Noto Sans JP','Meiryo',sans-serif";

/** A narrow Tokyo side street: shops, lanterns, a vending machine, cables overhead and just a little neon. */
export function NeonCity({ p, dark, small }: { p: Pal; dark: boolean; small?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [pink, cyan] = p.glow ?? ["#ff4f8b", "#3fd5e8"];
  const [far, mid, near] = p.layers;
  const lamp = p.sun;

  const city = useMemo(() => {
    const r = rng(11);
    const walls: { d: string; shade: number }[] = [];
    const windows: { d: string; lit: boolean; o: number }[] = [];
    const shops: { d: string; awning: string; tint: number }[] = [];
    const units: string[] = [];
    for (const right of [false, true]) {
      const xs = right ? RIGHT : LEFT;
      for (let i = 0; i < xs.length - 1; i++) {
        const [xa, xb] = [xs[i], xs[i + 1]];
        // Some buildings are shorter, showing sky above them.
        const roof = i % 3 === 1 ? 0.12 + r() * 0.12 : 0;
        walls.push({ d: quad(xa, xb, roof, 1, right), shade: r() });
        const cols = Math.max(1, Math.round((xb - xa) / 34));
        for (let c = 0; c < cols; c++) {
          const a = xa + ((xb - xa) * (c + 0.22)) / cols;
          const b = xa + ((xb - xa) * (c + 0.78)) / cols;
          for (let v = roof + 0.07; v < 0.66; v += 0.1) windows.push({ d: quad(a, b, v, v + 0.055, right), lit: r() < 0.32, o: 0.45 + r() * 0.5 });
        }
        // Ground floor: a shop window under a small awning.
        shops.push({ d: quad(xa + (xb - xa) * 0.1, xb - (xb - xa) * 0.1, 0.8, 0.96, right), awning: quad(xa + (xb - xa) * 0.05, xb - (xb - xa) * 0.05, 0.76, 0.8, right), tint: r() });
        // Air-conditioning units on some walls.
        if (r() < 0.5 && xb - xa > 30) units.push(quad(xa + (xb - xa) * 0.3, xa + (xb - xa) * 0.55, 0.45 + r() * 0.15, 0.5 + r() * 0.15, right));
      }
    }
    return { walls, windows, shops, units };
  }, []);

  // Power cables strung across the street, sagging in the middle.
  const cables = [140, 300, 440, 520, 565].map((x, i) => {
    const [x1, y1] = at(x, 0.14 + (i % 2) * 0.05);
    const [x2, y2] = at(x + 10, 0.12 + (i % 3) * 0.04, true);
    const sag = wallH(x) * 0.12;
    return { d: `M${x1} ${y1} Q ${W / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}`, w: Math.max(0.8, wallH(x) / 260) };
  });

  // Red paper lanterns along one shop front.
  const lanterns = Array.from({ length: 6 }, (_, i) => {
    const x = 200 + i * 22;
    const [lx, ly] = at(x, 0.745);
    const s = wallH(x) / 52;
    return { x: lx + s * 0.7, y: ly, s };
  });

  // A drinks vending machine on the right pavement.
  const vx = 455;
  const [vmx, vmy] = at(vx, 0.985, true);
  const vh = wallH(vx) * 0.24;
  const vw = vh * 0.5;

  const roadTop = bot(FAR);
  const signColor = (k: Sign["kind"]) => (k === "neon0" ? pink : k === "neon1" ? cyan : k === "red" ? "#c8402f" : "#efe6cf");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
      <defs>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <radialGradient id={`${id}-haze`} cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor={lamp} stopOpacity={dark ? 0.35 : 0.25} />
          <stop offset="1" stopColor={lamp} stopOpacity="0" />
        </radialGradient>
        {/* Distance fog: the far end fades into the sky, which also keeps text over the middle easy to read. */}
        <radialGradient id={`${id}-fog`} cx="720" cy="430" r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={p.sky[1]} stopOpacity={dark ? 0.82 : 0.8} />
          <stop offset="0.55" stopColor={p.sky[1]} stopOpacity={dark ? 0.45 : 0.4} />
          <stop offset="1" stopColor={p.sky[1]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-road`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mid} />
          <stop offset="1" stopColor={near} />
        </linearGradient>
      </defs>

      {/* Far end of the street: a low block and one tower behind, lit by a warm haze. */}
      <rect x="560" y="120" width="320" height="420" fill={`url(#${id}-haze)`} />
      <path d={`M688 ${roadTop} V150 H752 V${roadTop} Z`} fill={far} />
      <circle cx="720" cy="146" r="3" fill="#ff4a3d" filter={`url(#${id}-soft)`} />
      <path d={`M${FAR} ${roadTop} V315 H${W - FAR} V${roadTop} Z`} fill={far} />
      {Array.from({ length: 24 }, (_, i) => (
        <rect key={i} x={612 + (i % 8) * 28} y={330 + Math.floor(i / 8) * 30} width="12" height="14" fill={lamp} opacity={(i * 7) % 5 < 2 ? (dark ? 0.75 : 0.4) : 0.08} />
      ))}

      {/* Road and pavements */}
      <path d={`M0 ${H} L0 860 L${FAR} ${roadTop} L${W - FAR} ${roadTop} L${W} 860 L${W} ${H} Z`} fill={`url(#${id}-road)`} />
      <path d={`M0 ${H} L${FAR + 22} ${roadTop} M${W} ${H} L${W - FAR - 22} ${roadTop}`} stroke={far} strokeWidth="3" opacity="0.6" />
      <path d={`M720 ${roadTop + 6} L720 ${H}`} stroke={lamp} strokeOpacity={dark ? 0.18 : 0.3} strokeWidth="6" strokeDasharray="40 50" />

      {/* Buildings on both sides */}
      {city.walls.map((w, i) => (
        <path key={i} d={w.d} fill={w.shade < 0.33 ? far : w.shade < 0.66 ? mid : near} />
      ))}
      <g>
        {city.windows.map((w, i) => (
          <path key={i} d={w.d} fill={w.lit ? lamp : dark ? "#000" : "#ffffff"} opacity={w.lit ? w.o * (dark ? 0.85 : 0.5) : dark ? 0.35 : 0.22} />
        ))}
      </g>
      {city.units.map((d, i) => (
        <path key={i} d={d} fill={dark ? "#3a3846" : "#d9d6e0"} opacity="0.7" />
      ))}
      {city.shops.map((s, i) => (
        <g key={i}>
          <path d={s.d} fill={lamp} opacity={dark ? 0.35 + s.tint * 0.35 : 0.3 + s.tint * 0.2} />
          <path d={s.awning} fill={s.tint < 0.4 ? "#7a2f2a" : s.tint < 0.7 ? "#2f3a5c" : "#3b4a3a"} opacity="0.9" />
        </g>
      ))}

      <rect x="0" y="0" width={W} height={H} fill={`url(#${id}-fog)`} />

      {/* Lanterns */}
      {lanterns.map((l, i) => (
        <g key={i}>
          <ellipse cx={l.x} cy={l.y + l.s * 1.6} rx={l.s} ry={l.s * 1.35} fill="#d2402e" filter={dark ? `url(#${id}-soft)` : undefined} />
          <path d={`M${l.x} ${l.y} V${l.y + l.s * 0.25}`} stroke={near} strokeWidth={l.s * 0.15} />
        </g>
      ))}

      {/* Vending machine */}
      <g filter={dark ? `url(#${id}-soft)` : undefined}>
        <rect x={vmx - vw - 4} y={vmy - vh} width={vw} height={vh} rx={vw * 0.06} fill={dark ? "#e8f4ff" : "#f4f8fc"} />
        <rect x={vmx - vw + vw * 0.08 - 4} y={vmy - vh + vh * 0.08} width={vw * 0.84} height={vh * 0.48} fill={dark ? "#bfe3ff" : "#dceaf6"} />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={vmx - vw + vw * 0.14 - 4 + (i % 4) * vw * 0.19} y={vmy - vh + vh * 0.12 + Math.floor(i / 4) * vh * 0.14} width={vw * 0.12} height={vh * 0.1} rx="1.5" fill={["#e2483d", "#2f7de1", "#f2b632", "#3aa45c"][i % 4]} opacity="0.85" />
        ))}
      </g>
      <rect x={vmx - vw - 30} y={vmy} width={vw + 60} height={vh * 0.5} fill="#cfeaff" opacity={dark ? 0.12 : 0} filter={`url(#${id}-blur)`} />

      {/* Signs sticking out from the walls, with their reflections in the wet road */}
      {SIGNS.map((s, i) => {
        const h = wallH(s.x);
        const sw = h * 0.07;
        const sh = h * 0.2 * (s.tall ?? 1);
        const [ax, ay] = at(s.x, s.v, s.right);
        const x = s.right ? ax - sw - 2 : ax + 2;
        const c = signColor(s.kind);
        const neon = s.kind.startsWith("neon");
        const chars = [...s.text];
        const fs = Math.min(sw * 0.62, (sh * 0.85) / chars.length);
        const ink = s.kind === "box" ? "#2a211b" : s.kind === "red" ? "#fff4e8" : c;
        return (
          <g key={i}>
            <rect x={x + sw * 0.1} y={bot(s.x) + 6} width={sw * 0.8} height={h * 0.18} fill={c} opacity={dark ? (neon ? 0.28 : 0.16) : 0.1} filter={`url(#${id}-blur)`} />
            <g filter={dark && (neon || s.kind === "box") ? `url(#${id}-soft)` : undefined}>
              <rect x={x} y={ay} width={sw} height={sh} rx={sw * 0.08} fill={neon ? near : c} stroke={neon ? c : "none"} strokeWidth={sw * 0.06} />
              <text fill={ink} fontSize={fs} fontWeight="700" textAnchor="middle" fontFamily={JP}>
                {chars.map((ch, k) => (
                  <tspan key={k} x={x + sw / 2} y={ay + (sh - fs * chars.length) / 2 + fs * (k + 0.86)}>
                    {ch}
                  </tspan>
                ))}
              </text>
            </g>
          </g>
        );
      })}

      {/* Cables overhead */}
      {cables.map((c, i) => (
        <path key={i} d={c.d} stroke={dark ? "#050608" : "#3d3a48"} strokeWidth={c.w} fill="none" opacity="0.9" />
      ))}
      {!small && <rect x="0" y={H - 70} width={W} height="70" fill={near} opacity="0.25" />}
    </svg>
  );
}

/** Soft rain falling over the street (dark only; still for people who prefer less motion). */
export function NeonRain() {
  return <div className="neon-rain absolute inset-0" />;
}
