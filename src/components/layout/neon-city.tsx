import { useId, useMemo } from "react";

type Pal = { sky: [string, string, string]; sun: string; layers: [string, string, string]; stars?: boolean; glow?: [string, string] };

/** Small seeded random numbers, so the city looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const W = 1440;
const H = 600;
const HORIZON = 470;

type Tower = { x: number; w: number; top: number; antenna?: number; step?: number };

function towers(seed: number, min: number, max: number, minW: number, maxW: number, skip?: (x: number) => number | null): Tower[] {
  const r = rng(seed);
  const out: Tower[] = [];
  for (let x = -20; x < W + 20; ) {
    const w = Math.round(minW + r() * (maxW - minW));
    let h = min + r() * (max - min);
    const cap = skip?.(x + w / 2);
    if (cap != null) h = Math.min(h, cap);
    out.push({ x, w, top: Math.round(HORIZON - h), antenna: r() < 0.3 ? Math.round(14 + r() * 40) : undefined, step: r() < 0.35 ? Math.round(w * 0.22) : undefined });
    x += w + (r() < 0.25 ? Math.round(r() * 10) : 0);
  }
  return out;
}

const towerPath = (t: Tower[]) =>
  t
    .map(({ x, w, top, antenna, step }) => {
      // A stepped top on some towers, and a thin antenna on others.
      const body = step ? `M${x} ${HORIZON} V${top + 18} H${x + step} V${top} H${x + w - step} V${top + 18} H${x + w} V${HORIZON} Z` : `M${x} ${HORIZON} V${top} H${x + w} V${HORIZON} Z`;
      const ant = antenna ? ` M${x + w / 2 - 1.5} ${top} V${top - antenna} H${x + w / 2 + 1.5} V${top} Z` : "";
      return body + ant;
    })
    .join(" ");

/** A pagoda: five tiers with up-turned roofs. */
function pagoda(cx: number, base: number) {
  let d = "";
  let y = base;
  for (let i = 0; i < 5; i++) {
    const w = 120 - i * 18;
    const h = 30 - i * 2;
    const roof = w * 0.68 + 14;
    d += ` M${cx - w / 2} ${y} V${y - h} H${cx + w / 2} V${y} Z`;
    // Roof: wide, thin, curling up at both ends.
    d += ` M${cx - roof} ${y - h + 2} Q ${cx - roof * 0.6} ${y - h - 4} ${cx - w / 2 + 4} ${y - h - 12} H${cx + w / 2 - 4} Q ${cx + roof * 0.6} ${y - h - 4} ${cx + roof} ${y - h + 2} Q ${cx + roof * 0.7} ${y - h - 2} ${cx} ${y - h - 6} Q ${cx - roof * 0.7} ${y - h - 2} ${cx - roof} ${y - h + 2} Z`;
    y -= h + 12;
  }
  d += ` M${cx - 2} ${y} V${y - 46} H${cx + 2} V${y} Z`;
  return d;
}

type Sign = { x: number; y: number; w: number; h: number; text: string; color: 0 | 1; vertical?: boolean };
const PAGODA = 672;
const SIGNS: Sign[] = [
  { x: 500, y: HORIZON - 225, w: 40, h: 170, text: "ラーメン", color: 0, vertical: true },
  { x: 900, y: HORIZON - 205, w: 40, h: 150, text: "カラオケ", color: 1, vertical: true },
  { x: 96, y: 150, w: 46, h: 200, text: "居酒屋", color: 0, vertical: true },
  { x: 250, y: 236, w: 40, h: 150, text: "夜市", color: 1, vertical: true },
  { x: 1180, y: 128, w: 46, h: 180, text: "東京", color: 1, vertical: true },
  { x: 1318, y: 230, w: 40, h: 170, text: "ネオン", color: 0, vertical: true },
  { x: 1150, y: 360, w: 150, h: 40, text: "勉強中", color: 0 },

];

/** Neon Tokyo at night: a striped sun sinking behind towers, a pagoda, glowing signs and a grid that runs to the horizon. */
export function NeonCity({ p, dark, small }: { p: Pal; dark: boolean; small?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [pink, cyan] = p.glow ?? ["#ff2bd6", "#19e6ff"];
  const neon = [pink, cyan];
  const [far, mid, near] = p.layers;

  const city = useMemo(() => {
    // Keep the middle low so the sun shows above the skyline.
    const back = towers(7, 120, 270, 34, 80, (cx) => (Math.abs(cx - W / 2) < 200 ? 95 : null));
    const front = towers(21, 90, 400, 60, 130, (cx) => (Math.abs(cx - W / 2) < 200 ? 70 : Math.abs(cx - W / 2) < 330 ? 150 : null));
    const middle = towers(42, 70, 190, 50, 110, (cx) => (Math.abs(cx - PAGODA) < 80 ? 30 : Math.abs(cx - W / 2) < 200 ? 80 : null));
    // Two tall towers either side of the sun, carrying the signs that show on phones too.
    front.push({ x: 478, w: 88, top: HORIZON - 255, antenna: 46 }, { x: 884, w: 96, top: HORIZON - 240, step: 20 });
    // Lit windows on the near towers.
    const r = rng(99);
    const windows: { x: number; y: number; c: number; o: number }[] = [];
    for (const t of front) {
      for (let y = t.top + 26; y < HORIZON - 14; y += 16)
        for (let x = t.x + 8; x < t.x + t.w - 10; x += 13) if (r() < 0.22) windows.push({ x, y, c: r() < 0.5 ? 0 : 1, o: 0.35 + r() * 0.55 });
    }
    return { back, middle, front, windows };
  }, []);

  const grid: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const y = HORIZON + Math.pow(i / 7, 1.8) * (H - HORIZON);
    grid.push(`M0 ${y.toFixed(1)} H${W}`);
  }
  for (let i = -12; i <= 12; i++) grid.push(`M${W / 2 + i * 22} ${HORIZON} L${W / 2 + i * 210} ${H}`);

  const sunR = 150;
  const sunY = HORIZON - 170;
  const glowA = dark ? 1 : 0.7;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={small ? "absolute inset-0 size-full" : "absolute inset-x-0 bottom-0 h-[62vh] min-h-[320px] w-full sm:h-[72vh]"}>
      <defs>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sun} />
          <stop offset="1" stopColor={pink} />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pink} stopOpacity={dark ? 0.35 : 0.25} />
          <stop offset="1" stopColor={pink} stopOpacity="0" />
        </linearGradient>
        {/* The sun's lower half is cut into thinning stripes. */}
        <mask id={`${id}-stripes`}>
          <rect x="0" y="0" width={W} height={H} fill="#fff" />
          {Array.from({ length: 7 }, (_, i) => {
            const y = sunY + 20 + i * 19;
            return <rect key={i} x="0" y={y} width={W} height={2.5 + i * 1.8} fill="#000" />;
          })}
        </mask>
      </defs>

      {/* Haze behind the skyline */}
      <ellipse cx={W / 2} cy={HORIZON - 40} rx={620} ry={170} fill={pink} opacity={dark ? 0.16 : 0.18} />
      <circle cx={W / 2} cy={sunY} r={sunR} fill={`url(#${id}-sun)`} mask={`url(#${id}-stripes)`} opacity={dark ? 0.95 : 0.85} />

      <path d={towerPath(city.back)} fill={far} />
      <path d={towerPath(city.middle) + pagoda(PAGODA, HORIZON - 30)} fill={mid} />
      {/* Pagoda edge lights */}
      <path d={pagoda(PAGODA, HORIZON - 30)} fill="none" stroke={pink} strokeOpacity={dark ? 0.5 : 0.35} strokeWidth="1.2" filter={dark ? `url(#${id}-glow)` : undefined} />
      <path d={towerPath(city.front)} fill={near} />

      <g opacity={dark ? 1 : 0.55}>
        {city.windows.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width="6" height="8" rx="1" fill={neon[w.c]} opacity={w.o * (dark ? 0.8 : 0.6)} />
        ))}
      </g>

      {/* Neon signs */}
      <g filter={`url(#${id}-glow)`} opacity={glowA}>
        {SIGNS.map((s, i) => {
          const c = neon[s.color];
          const chars = [...s.text];
          return (
            <g key={i}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="5" fill={near} stroke={c} strokeWidth="2.5" />
              {s.vertical ? (
                <text x={s.x + s.w / 2} fill={c} fontSize={s.w * 0.62} fontWeight="700" textAnchor="middle" fontFamily="'Hiragino Sans','Yu Gothic','Noto Sans JP','Meiryo',sans-serif">
                  {chars.map((ch, k) => (
                    <tspan key={k} x={s.x + s.w / 2} y={s.y + 12 + (s.w * 0.62) * (k + 1) + ((s.h - 24 - s.w * 0.62 * chars.length) / 2)}>
                      {ch}
                    </tspan>
                  ))}
                </text>
              ) : (
                <text x={s.x + s.w / 2} y={s.y + s.h * 0.72} fill={c} fontSize={s.h * 0.62} fontWeight="700" textAnchor="middle" letterSpacing="6" fontFamily="'Hiragino Sans','Yu Gothic','Noto Sans JP','Meiryo',sans-serif">
                  {s.text}
                </text>
              )}
            </g>
          );
        })}
        {/* Thin neon strips along a few rooftops */}
        {city.front
          .filter((_, i) => i % 3 === 1)
          .map((t, i) => (
            <path key={i} d={`M${t.x + 4} ${t.top + 6} H${t.x + t.w - 4}`} stroke={neon[i % 2]} strokeWidth="2" opacity="0.8" />
          ))}
      </g>

      {/* Ground: a glowing grid running to the horizon */}
      <rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={near} />
      <rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={`url(#${id}-fade)`} />
      <path d={grid.join(" ")} stroke={cyan} strokeOpacity={dark ? 0.55 : 0.45} strokeWidth="1.3" fill="none" filter={dark && !small ? `url(#${id}-glow)` : undefined} />
      <path d={`M0 ${HORIZON} H${W}`} stroke={pink} strokeWidth="2" opacity="0.9" filter={`url(#${id}-glow)`} />
    </svg>
  );
}

/** Soft rain falling over the city (dark only; still for people who prefer less motion). */
export function NeonRain() {
  return <div className="neon-rain absolute inset-0" />;
}
