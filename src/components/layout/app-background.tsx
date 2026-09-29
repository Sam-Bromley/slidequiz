import { useEffect, useRef, useState } from "react";
import type { BackgroundScene } from "@/types/models";
import { moonLitPath, moonPhase, moonPhaseName } from "@/lib/moon";

type Pal = { sky: [string, string, string]; sun: string; layers: [string, string, string]; stars?: boolean; glow?: [string, string] };

/** Each preset has a light and a dark version. */
/** Where (and how big) the sun sits, per scene. Scenes without one have no sun. */
type SunSpot = { left: string; top: string; size: string; preview: { left: string; top: string; size: number } };
const SUN_SPOT: Partial<Record<Exclude<BackgroundScene, "none">, SunSpot>> = {
  // low and to the left, half sunk behind the ridges
  sunset: { left: "32%", top: "64%", size: "22vmin", preview: { left: "26%", top: "46%", size: 20 } },
  // small and high in the top right
  dunes: { left: "82%", top: "12%", size: "9vmin", preview: { left: "76%", top: "12%", size: 10 } },
};

export const SCENES: Record<Exclude<BackgroundScene, "none">, { label: string; light: Pal; dark: Pal }> = {
  sunset: {
    label: "Sunset",
    light: { sky: ["#fff6ee", "#ffe3d1", "#ffc9b0"], sun: "#f5845f", layers: ["#f3d6e4", "#e2c9e6", "#cdbde6"] },
    dark: { sky: ["#0d0b16", "#241a33", "#4a2a3f"], sun: "#f07f4f", layers: ["#3a2941", "#241a30", "#120e1a"], stars: true },
  },
  forest: {
    label: "Forest",
    light: { sky: ["#f1f7f3", "#dcede3", "#c6e2d3"], sun: "transparent", layers: ["#a9cab4", "#7eab8e", "#4c7a5f"] },
    dark: { sky: ["#040907", "#0b1814", "#142b24"], sun: "transparent", layers: ["#1c382e", "#122720", "#081511"], stars: true },
  },
  ocean: {
    label: "Ocean",
    light: { sky: ["#f0f7fc", "#d9ecf7", "#c0e0f2"], sun: "transparent", layers: ["#a3cde6", "#73aad0", "#3f7eae"] },
    dark: { sky: ["#02060c", "#091526", "#132d47"], sun: "transparent", layers: ["#16344f", "#0d2336", "#071321"], stars: true },
  },
  aurora: {
    label: "Aurora",
    light: { sky: ["#f2f6fb", "#e6eef8", "#dbe7f3"], sun: "transparent", layers: ["#cad7e5", "#b4c4d7", "#98acc3"], glow: ["#7fe0c3", "#a896f2"] },
    dark: { sky: ["#010308", "#050b15", "#0a1320"], sun: "transparent", layers: ["#0f1925", "#0a121c", "#050a11"], stars: true, glow: ["#26c996", "#7457ea"] },
  },
  dunes: {
    label: "Dunes",
    light: { sky: ["#fff9ef", "#fdecd2", "#f8dbb2"], sun: "#f09a4c", layers: ["#f0d09e", "#e2b67b", "#c8955b"] },
    dark: { sky: ["#0a0705", "#1c120b", "#382311"], sun: "#e68a3d", layers: ["#482f1f", "#31200f", "#1a1108"], stars: true },
  },
  hills: {
    label: "Hills",
    light: { sky: ["#f3f8f1", "#e3f0de", "#d2e8cb"], sun: "transparent", layers: ["#b9d9a8", "#8fc281", "#5f9e5a"] },
    dark: { sky: ["#03070a", "#0a1512", "#12251c"], sun: "transparent", layers: ["#1d3a2a", "#142c20", "#0b1d14"], stars: true },
  },
  lake: {
    label: "Lake",
    light: { sky: ["#f2f6fa", "#e1ebf4", "#cfdfee"], sun: "transparent", layers: ["#b3c4d8", "#8aa2bf", "#a9c3dc"] },
    dark: { sky: ["#02040a", "#081122", "#10203a"], sun: "transparent", layers: ["#1d2d48", "#15233c", "#0d1b31"], stars: true },
  },
  canyon: {
    label: "Canyon",
    light: { sky: ["#fff7ef", "#fde6d3", "#f8d2b6"], sun: "transparent", layers: ["#eab494", "#d08666", "#a95a40"] },
    dark: { sky: ["#07040a", "#1a0e14", "#35191a"], sun: "transparent", layers: ["#4a2622", "#351a18", "#1f0f0e"], stars: true },
  },
  peaks: {
    label: "Peaks",
    light: { sky: ["#f4f6fa", "#e7ebf3", "#dbe1ec"], sun: "transparent", layers: ["#c9d1df", "#a5b1c6", "#7a88a1"] },
    dark: { sky: ["#020308", "#060a14", "#0d1424"], sun: "transparent", layers: ["#1a2336", "#121a2a", "#0a101c"], stars: true },
  },
  snow: {
    label: "Snowy peaks",
    light: { sky: ["#f5f9fd", "#e8eff8", "#dce7f3"], sun: "transparent", layers: ["#d8e3ef", "#c3d2e3", "#aebfd4"] },
    dark: { sky: ["#03050a", "#0a1120", "#162137"], sun: "transparent", layers: ["#1f2c40", "#152034", "#0b1321"], stars: true },
  },
};

export const SCENE_ORDER: BackgroundScene[] = ["none", "sunset", "forest", "peaks", "hills", "ocean", "canyon", "dunes", "aurora"];

/** Scenes whose shapes rise higher up the screen. */
const TALL: Partial<Record<BackgroundScene, true>> = { peaks: true };

const STARS = [
  [6, 3], [14, 9], [22, 2], [31, 7], [39, 12], [47, 4], [55, 10], [63, 2], [71, 8], [79, 5], [87, 11], [94, 3], [10, 14], [26, 16], [43, 17], [60, 14], [76, 16], [90, 15],
];

/** One minimal pine: two stacked triangles and a short trunk. */
function pine(x: number, base: number, h: number, w: number) {
  const tw = w * 0.1;
  return (
    ` M${x - tw / 2} ${base} L${x - tw / 2} ${base - h * 0.16} L${x + tw / 2} ${base - h * 0.16} L${x + tw / 2} ${base} Z` +
    ` M${x - w / 2} ${base - h * 0.12} L${x} ${base - h * 0.7} L${x + w / 2} ${base - h * 0.12} Z` +
    ` M${x - w * 0.36} ${base - h * 0.45} L${x} ${base - h} L${x + w * 0.36} ${base - h * 0.45} Z`
  );
}

/** A soft ground line so each row of trees sits on its own rise. */
const ground = (y: number, lift: number, w = 1440) => `M0 400 L0 ${y} C ${w * 0.25} ${y - lift}, ${w * 0.75} ${y + lift}, ${w} ${y - lift / 2} L${w} 400 Z`;

type Peak = [cx: number, top: number, left: number, right: number];

/** Separate, overlapping mountains (each its own shape) with a slight shoulder on each side. */
function mountains(peaks: Peak[], base = 400) {
  return peaks
    .map(([cx, top, l, r]) => {
      const h = base - top;
      return `M${cx - l} ${base} L${cx - l * 0.42} ${top + h * 0.5} L${cx - l * 0.18} ${top + h * 0.2} L${cx} ${top} L${cx + r * 0.25} ${top + h * 0.28} L${cx + r * 0.5} ${top + h * 0.42} L${cx + r} ${base} Z`;
    })
    .join(" ");
}

/** Snow caps that follow the same peaks. */
function caps(peaks: Peak[], base = 400) {
  return peaks
    .map(([cx, top, l, r]) => {
      const h = base - top;
      const lx = cx - l * 0.14, ly = top + h * 0.16;
      const rx = cx + r * 0.2, ry = top + h * 0.22;
      return `M${cx} ${top} L${rx} ${ry} L${cx + r * 0.08} ${top + h * 0.17} L${cx - l * 0.02} ${top + h * 0.22} L${cx - l * 0.08} ${top + h * 0.15} L${lx} ${ly} Z`;
    })
    .join(" ");
}

/** Round, overlapping hills. */
const hills = (list: [cx: number, top: number, w: number][], base = 400) =>
  list.map(([cx, top, w]) => `M${cx - w} ${base} C ${cx - w * 0.55} ${top}, ${cx + w * 0.55} ${top}, ${cx + w} ${base} Z`).join(" ");

/** Flat-topped mesas for the canyon, each with a small step on one side. */
const mesas = (list: [cx: number, top: number, w: number][], base = 400) =>
  list
    .map(([cx, top, w]) => {
      const h = base - top;
      return `M${cx - w} ${base} L${cx - w * 0.82} ${top + h * 0.35} L${cx - w * 0.62} ${top + h * 0.33} L${cx - w * 0.55} ${top} L${cx + w * 0.6} ${top} L${cx + w * 0.72} ${top + h * 0.12} L${cx + w} ${base} Z`;
    })
    .join(" ");

const LAKE_PEAKS: Peak[] = [[160, 150, 260, 280], [520, 95, 300, 280], [900, 140, 270, 300], [1270, 110, 300, 320]];
const LAKE_FRONT: Peak[] = [[340, 205, 240, 230], [1080, 200, 260, 240]];

const BACK_H = [210, 250, 190, 240, 220, 200];
const FRONT_H = [300, 270, 320, 285];

/** Forest drawn for a given drawing width, so trees keep their shape and never get cropped. */
function forest(w: number, b: string, c: string) {
  const back: string[] = [];
  const front: string[] = [];
  for (let i = 0, x = 90; x < w + 120; i++, x += 250 + ((i * 37) % 40)) back.push(pine(x, 306, BACK_H[i % BACK_H.length], 150));
  for (let i = 0, x = 210; x < w + 160; i++, x += 380 + ((i * 53) % 90)) front.push(pine(x, 380, FRONT_H[i % FRONT_H.length], 215));
  return (
    <>
      <path d={ground(300, 16, w) + back.join("")} fill={b} />
      <path d={ground(372, 12, w) + front.join("")} fill={c} />
    </>
  );
}

const PEAKS_BACK: Peak[] = [[170, 40, 300, 330], [560, 5, 340, 300], [930, 70, 260, 300], [1280, 20, 320, 360]];
const PEAKS_MID: Peak[] = [[20, 150, 220, 260], [390, 115, 280, 250], [760, 165, 240, 280], [1090, 110, 300, 250], [1430, 160, 260, 220]];
const PEAKS_FRONT: Peak[] = [[230, 245, 330, 280], [690, 265, 290, 330], [1170, 235, 340, 320]];

const SNOW_BACK: Peak[] = [[140, 150, 240, 260], [470, 95, 300, 260], [860, 120, 280, 300], [1250, 105, 300, 320]];
const SNOW_FRONT: Peak[] = [[300, 220, 280, 260], [700, 240, 260, 300], [1100, 215, 300, 280], [1440, 245, 240, 200]];

function waves(y: number, amp: number, len: number) {
  let d = `M0 400 L0 ${y}`;
  for (let x = 0; x < 1440; x += len) d += ` Q ${x + len / 4} ${y - amp} ${x + len / 2} ${y} T ${x + len} ${y}`;
  return `${d} L1440 400 Z`;
}

function Shapes({ scene, p }: { scene: Exclude<BackgroundScene, "none">; p: Pal }) {
  const [a, b, c] = p.layers;
  switch (scene) {
    case "forest":
      return forest(1440, b, c);
    case "hills":
      return (
        <>
          <path d={hills([[150, 170, 360], [620, 140, 420], [1120, 165, 400], [1480, 190, 300]])} fill={a} />
          <path d={hills([[380, 235, 420], [900, 220, 440], [1400, 245, 340]])} fill={b} />
          <path d={hills([[80, 300, 380], [640, 310, 460], [1180, 295, 420]])} fill={c} />
        </>
      );
    case "lake":
      return (
        <>
          <path d={mountains(LAKE_PEAKS, 300)} fill={a} />
          <path d={caps(LAKE_PEAKS, 300)} fill="#fff" opacity={p.stars ? 0.14 : 0.8} />
          <path d={mountains(LAKE_FRONT, 300)} fill={b} />
          <rect x="0" y="300" width="1440" height="100" fill={c} />
          <g transform="translate(0 600) scale(1 -1)" opacity={0.28}>
            <path d={mountains(LAKE_PEAKS, 300)} fill={a} />
            <path d={mountains(LAKE_FRONT, 300)} fill={b} />
          </g>
          <path d="M200 330 h140 M620 348 h220 M1040 334 h160 M420 372 h120 M980 382 h200" stroke="#fff" strokeOpacity={p.stars ? 0.12 : 0.5} strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case "canyon":
      return (
        <>
          <path d={mesas([[260, 170, 230], [760, 140, 260], [1230, 180, 240]])} fill={a} />
          <path d={mesas([[520, 235, 220], [1000, 250, 200], [1440, 230, 200], [30, 245, 170]])} fill={b} />
          <path d="M0 330 C 300 310, 600 345, 900 330 S 1300 315, 1440 325 L1440 400 L0 400 Z" fill={c} />
        </>
      );
    case "peaks":
      return (
        <>
          <path d={mountains(PEAKS_BACK)} fill={a} />
          <path d={caps(PEAKS_BACK)} fill="#fff" opacity={p.stars ? 0.16 : 0.85} />
          <path d={mountains(PEAKS_MID)} fill={b} />
          <path d={mountains(PEAKS_FRONT)} fill={c} />
        </>
      );
    case "ocean":
      return (
        <>
          <path d={waves(250, 10, 240)} fill={a} />
          <path d={waves(300, 12, 300)} fill={b} />
          <path d={waves(350, 14, 360)} fill={c} />
        </>
      );
    case "snow":
      return (
        <>
          <path d={mountains(SNOW_BACK)} fill={a} />
          <path d={caps(SNOW_BACK)} fill="#fff" opacity={p.stars ? 0.5 : 0.9} />
          <path d={mountains(SNOW_FRONT)} fill={b} />
          <path d={caps(SNOW_FRONT)} fill="#fff" opacity={p.stars ? 0.35 : 0.75} />
          <path d="M0 360 C 240 330, 480 340, 720 352 S 1200 336, 1440 350 L1440 400 L0 400 Z" fill={c} />
        </>
      );
    case "dunes":
      return (
        <>
          <path d="M0 260 C 200 200, 420 210, 620 260 S 1040 300, 1440 220 L1440 400 L0 400 Z" fill={a} />
          <path d="M0 320 C 260 260, 520 300, 760 290 S 1180 250, 1440 300 L1440 400 L0 400 Z" fill={b} />
          <path d="M0 360 C 320 340, 700 330, 1000 355 S 1300 350, 1440 345 L1440 400 L0 400 Z" fill={c} />
        </>
      );
    default:
      // sunset + aurora use soft ridges
      return (
        <>
          <path d="M0 210 C 90 180, 160 120, 250 135 S 390 205, 470 170 S 610 70, 720 95 S 880 185, 960 160 S 1110 80, 1210 110 S 1360 175, 1440 150 L1440 400 L0 400 Z" fill={a} />
          <path d="M0 270 C 120 240, 200 200, 300 215 S 470 280, 560 250 S 720 175, 840 205 S 1010 275, 1100 245 S 1280 190, 1440 230 L1440 400 L0 400 Z" fill={b} />
          <path d="M0 330 C 160 305, 300 300, 440 320 S 760 345, 920 322 S 1240 300, 1440 318 L1440 400 L0 400 Z" fill={c} />
        </>
      );
  }
}

/** Things the pointer should keep working on, even if a star sits underneath. */
const INTERACTIVE = "button,a,input,textarea,select,label,summary,[role=button],[role=radio],[role=dialog],[role=menu],[role=listbox],[contenteditable],.bg-card,.bg-popover";

/**
 * Stars can be picked up and dragged. When let go they spring back to where they were.
 * The scene sits behind the page, so we listen on the document and hit-test stars by position.
 */
function StarField() {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stars = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>("[data-star]") ?? []);
    const hit = (x: number, y: number, target: EventTarget | null) => {
      if ((target as Element | null)?.closest?.(INTERACTIVE)) return null;
      // The sun or moon gets picked up instead of a star behind it.
      for (const o of document.querySelectorAll("[data-orb]")) {
        const r = o.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return null;
      }
      let best: HTMLElement | null = null;
      let bestD = 18;
      for (const s of stars()) {
        const r = s.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
        if (d < bestD) (best = s), (bestD = d);
      }
      return best;
    };
    let drag: { el: HTMLElement; x: number; y: number; id: number } | null = null;
    let hover = false;
    const setCursor = (c: string) => (document.body.style.cursor = c);

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = hit(e.clientX, e.clientY, e.target);
      if (!el) return;
      e.preventDefault();
      el.style.transition = "transform 80ms ease-out";
      el.style.transform = "scale(2.2)";
      el.style.opacity = "1";
      el.classList.remove("motion-safe:animate-twinkle");
      drag = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
      setCursor("grabbing");
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        drag.el.style.transition = "none";
        drag.el.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px) scale(2.2)`;
        return;
      }
      if (e.pointerType !== "mouse") return;
      const near = !!hit(e.clientX, e.clientY, e.target);
      if (near !== hover) {
        hover = near;
        setCursor(near ? "grab" : "");
      }
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const el = drag.el;
      drag = null;
      el.style.transition = "transform 750ms cubic-bezier(.18,1.6,.36,1)";
      el.style.transform = "";
      setTimeout(() => {
        el.style.opacity = "";
        el.classList.add("motion-safe:animate-twinkle");
      }, 750);
      setCursor(hover ? "grab" : "");
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      setCursor("");
    };
  }, []);
  return (
    <div ref={wrap} className="absolute inset-0">
      {STARS.map(([x, y], i) => (
        <span
          key={i}
          data-star
          className="absolute rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)] motion-safe:animate-twinkle"
          style={{ left: `${x}%`, top: `${y}%`, width: i % 4 ? 2 : 3, height: i % 4 ? 2 : 3, animationDelay: `${(i * 0.61) % 4}s` }}
        />
      ))}
    </div>
  );
}

/** At night every background gets the moon, high on the right. */
const MOON_SPOT: SunSpot = { left: "80%", top: "10%", size: "11vmin", preview: { left: "78%", top: "12%", size: 9 } };

/** Today's moon, as it looks from England. Checks again every hour so it changes day by day. */
function Moon() {
  const [phase, setPhase] = useState(() => moonPhase());
  useEffect(() => {
    const t = setInterval(() => setPhase(moonPhase()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const r = 50;
  return (
    <svg viewBox="0 0 100 100" className="size-full overflow-visible" role="img" aria-label={moonPhaseName(phase)}>
      <defs>
        <radialGradient id="moon-lit" cx="40%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#fbf8ee" />
          <stop offset="100%" stopColor="#dcd6c4" />
        </radialGradient>
      </defs>
      {/* The dark part is faintly visible, like earthshine. */}
      <circle cx={r} cy={r} r={r} fill="#ffffff" fillOpacity={0.07} />
      <path d={moonLitPath(phase, r)} fill="url(#moon-lit)" />
      {/* A few soft craters, only where it's lit. */}
      <clipPath id="moon-clip">
        <path d={moonLitPath(phase, r)} />
      </clipPath>
      <g clipPath="url(#moon-clip)" fill="#b9b19b" fillOpacity={0.35}>
        <circle cx="34" cy="36" r="9" />
        <circle cx="62" cy="58" r="12" />
        <circle cx="42" cy="72" r="6" />
        <circle cx="68" cy="30" r="5" />
      </g>
    </svg>
  );
}

/**
 * The sun (or moon at night) can be dragged anywhere in the sky, including down behind the hills.
 * It stays where it's dropped until the background is changed.
 */
function DraggableOrb({ spot, style, label, children }: { spot: SunSpot; style?: React.CSSProperties; label: string; children?: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  useEffect(() => {
    const onSun = (x: number, y: number, target: EventTarget | null) => {
      if ((target as Element | null)?.closest?.(INTERACTIVE) || !el.current) return false;
      const r = el.current.getBoundingClientRect();
      return Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y) <= r.width / 2 + 6;
    };
    let drag: { x: number; y: number; ox: number; oy: number; id: number } | null = null;
    let hover = false;
    const setCursor = (c: string) => (document.body.style.cursor = c);
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !onSun(e.clientX, e.clientY, e.target)) return;
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y, id: e.pointerId };
      setCursor("grabbing");
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const r = el.current!.getBoundingClientRect();
        let x = drag.ox + e.clientX - drag.x;
        let y = drag.oy + e.clientY - drag.y;
        // Keep it on screen (it may sink below the hills, but not vanish off the edge).
        const cx = r.left + r.width / 2 - offsetRef.current.x + x;
        const cy = r.top + r.height / 2 - offsetRef.current.y + y;
        x += Math.max(0, -cx) - Math.max(0, cx - window.innerWidth);
        y += Math.max(0, r.height / 2 - cy) - Math.max(0, cy - window.innerHeight);
        setOffset({ x, y });
        return;
      }
      if (e.pointerType !== "mouse") return;
      const near = onSun(e.clientX, e.clientY, e.target);
      if (near !== hover) {
        hover = near;
        setCursor(near ? "grab" : "");
      }
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      setCursor(hover ? "grab" : "");
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      setCursor("");
    };
  }, []);
  return (
    <div
      ref={el}
      data-orb={label}
      className="absolute max-h-56 max-w-56 rounded-full"
      style={{
        left: spot.left,
        top: spot.top,
        width: spot.size,
        height: spot.size,
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The forest's drawing width follows the screen's shape, so trees are never squashed or cut off. */
function ForestSvg({ p }: { p: Pal }) {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(1440);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setW(Math.round((400 * r.width) / r.height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <svg ref={ref} viewBox={`0 0 ${w} 400`} preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 h-[30vh] min-h-[160px] w-full sm:h-[40vh] sm:min-h-[220px]">
      {forest(w, p.layers[1], p.layers[2])}
    </svg>
  );
}

/** Decorative background preset, fixed behind the app. "none" = plain theme background. */
export function AppBackground({ scene, dark }: { scene: BackgroundScene; dark: boolean }) {
  if (scene === "none" || !SCENE_ORDER.includes(scene)) return null;
  const def = SCENES[scene];
  const p = dark ? def.dark : def.light;
  const sun = SUN_SPOT[scene];
  return (
    <div className="scene-root pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden style={{ background: `linear-gradient(to bottom, ${p.sky[0]} 0%, ${p.sky[1]} 55%, ${p.sky[2]} 100%)` }}>
      {p.stars && <StarField />}
      {p.glow && (
        <>
          <div className="absolute left-[-10%] top-[8%] h-[38vh] w-[70%] rotate-[-8deg] rounded-full opacity-40 blur-3xl" style={{ background: p.glow[0] }} />
          <div className="absolute right-[-10%] top-[16%] h-[30vh] w-[60%] rotate-[10deg] rounded-full opacity-30 blur-3xl" style={{ background: p.glow[1] }} />
        </>
      )}
      {/* Keyed by scene: switching to another background and back puts the sun back where it started. */}
      {dark ? (
        <DraggableOrb key={`${scene}-moon`} spot={MOON_SPOT} label="moon" style={{ filter: "drop-shadow(0 0 2.5vmin rgba(255, 248, 225, 0.35))" }}>
          <Moon />
        </DraggableOrb>
      ) : (
        sun && p.sun !== "transparent" && <DraggableOrb key={scene} spot={sun} label="sun" style={{ background: p.sun, boxShadow: `0 0 0 2vmin ${p.sun}22, 0 0 12vmin 4vmin ${p.sun}30` }} />
      )}
      {scene === "forest" ? (
        <ForestSvg p={p} />
      ) : (
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none" className={TALL[scene] ? "absolute inset-x-0 bottom-0 h-[52vh] min-h-[260px] w-full sm:h-[68vh]" : "absolute inset-x-0 bottom-0 h-[30vh] min-h-[160px] w-full sm:h-[40vh] sm:min-h-[220px]"}>
          <Shapes scene={scene} p={p} />
        </svg>
      )}
    </div>
  );
}

/** Small preview swatch used in the personalise menu. */
export function ScenePreview({ scene, dark }: { scene: BackgroundScene; dark: boolean }) {
  if (scene === "none") return <div className="size-full" style={{ background: dark ? "#000" : "#fff" }} />;
  const p = dark ? SCENES[scene].dark : SCENES[scene].light;
  const sun = SUN_SPOT[scene]?.preview;
  return (
    <div className="relative size-full overflow-hidden" style={{ background: `linear-gradient(${p.sky[0]}, ${p.sky[2]})` }}>
      {p.glow && <div className="absolute inset-x-0 top-1 h-1/2 opacity-60 blur-md" style={{ background: `linear-gradient(90deg, ${p.glow[0]}, ${p.glow[1]})` }} />}
      {sun && p.sun !== "transparent" && <div className="absolute -translate-x-1/2 rounded-full" style={{ left: sun.left, top: sun.top, width: sun.size, height: sun.size, background: p.sun }} />}
      <svg viewBox="0 0 1440 400" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-3/5 w-full">
        <Shapes scene={scene} p={p} />
      </svg>
    </div>
  );
}
