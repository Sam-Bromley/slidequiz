/**
 * Revision over time: pick what to show (questions, accuracy, flashcards…), the kind of chart and the time period.
 * Hand-drawn SVG so it matches the app and stays light.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn, dayKey } from "@/lib/utils";
import type { AppData } from "@/services/db/types";

export type Metric = "all" | "questions" | "accuracy" | "cards" | "written" | "lectures";
type Kind = "line" | "area" | "bar" | "total";
type Period = "7d" | "30d" | "3m" | "1y";

export const METRICS: { id: Metric; label: string; short: string; light: string; dark: string; pct?: boolean }[] = [
  { id: "all", label: "Everything revised", short: "Revised", light: "#6C63FF", dark: "#8B84FF" },
  { id: "questions", label: "Questions answered", short: "Questions", light: "#3BA4FF", dark: "#62B6FF" },
  { id: "accuracy", label: "Answered right", short: "Right", light: "#16B394", dark: "#3AD6B8", pct: true },
  { id: "cards", label: "Flashcard reviews", short: "Flashcards", light: "#F59E0B", dark: "#FFC145" },
  { id: "written", label: "Written answers", short: "Written", light: "#FF6B8B", dark: "#FF8AA3" },
  { id: "lectures", label: "Lectures added", short: "Lectures", light: "#A66CFF", dark: "#B98AFF" },
];

const PERIODS: { value: Period; label: string; span: string }[] = [
  { value: "7d", label: "Week", span: "7 days" },
  { value: "30d", label: "Month", span: "30 days" },
  { value: "3m", label: "3 months", span: "3 months" },
  { value: "1y", label: "Year", span: "12 months" },
];
const KINDS: { value: Kind; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
  { value: "total", label: "Running total" },
];

type Bucket = { label: string; long: string; start: Date; end: Date };

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", o);

/** The time slots for a period: days for a week or month, weeks for 3 months, months for a year. */
function buckets(period: Period, offset = 0): Bucket[] {
  const today = startOfDay(new Date());
  if (period === "7d" || period === "30d") {
    const n = period === "7d" ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const start = new Date(today.getTime() - (n - 1 - i + offset * n) * DAY);
      return { start, end: new Date(start.getTime() + DAY), label: n === 7 ? fmt(start, { weekday: "short" }) : fmt(start, { day: "numeric", month: "short" }), long: fmt(start, { weekday: "long", day: "numeric", month: "long" }) };
    });
  }
  if (period === "3m") {
    // 13 weeks, each ending on today's weekday.
    return Array.from({ length: 13 }, (_, i) => {
      const end = new Date(today.getTime() + DAY - (12 - i + offset * 13) * 7 * DAY);
      const start = new Date(end.getTime() - 7 * DAY);
      const last = new Date(end.getTime() - DAY);
      return { start, end, label: fmt(start, { day: "numeric", month: "short" }), long: `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short" })}` };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth() - (11 - i) - offset * 12, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end, label: fmt(start, { month: "short" }), long: fmt(start, { month: "long", year: "numeric" }) };
  });
}

/** Everything that happened on each day, from the study log and the dated things saved with the account. */
function daily(d: AppData) {
  const days = new Map<string, { q: number; c: number; cards: number; written: number; lectures: number }>();
  const get = (k: string) => {
    let x = days.get(k);
    if (!x) days.set(k, (x = { q: 0, c: 0, cards: 0, written: 0, lectures: 0 }));
    return x;
  };
  for (const [k, v] of Object.entries(d.user.studyLog ?? {})) {
    const x = get(k);
    x.q += v.q;
    x.c += v.c;
    x.cards += v.cards;
  }
  for (const m of d.materials) {
    get(dayKey(m.createdAt)).lectures++;
    for (const w of m.written ?? []) if (w.last?.at) get(dayKey(w.last.at)).written++;
  }
  return days;
}

function series(days: ReturnType<typeof daily>, bs: Bucket[], metric: Metric): (number | null)[] {
  return bs.map((b) => {
    let q = 0, c = 0, cards = 0, written = 0, lectures = 0;
    for (let t = b.start.getTime(); t < b.end.getTime(); t += DAY) {
      const x = days.get(dayKey(new Date(t + DAY / 2)));
      if (!x) continue;
      q += x.q;
      c += x.c;
      cards += x.cards;
      written += x.written;
      lectures += x.lectures;
    }
    switch (metric) {
      case "all": return q + cards + written;
      case "questions": return q;
      case "accuracy": return q ? Math.round((c / q) * 100) : null;
      case "cards": return cards;
      case "written": return written;
      case "lectures": return lectures;
    }
  });
}

/** Round numbers for the side of the chart. */
function ticks(max: number, pct: boolean) {
  if (pct) return [0, 25, 50, 75, 100];
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? 10 * mag;
  const s = Math.max(1, step);
  return Array.from({ length: Math.ceil(max / s) + 1 }, (_, i) => i * s);
}

/** A smooth line through the points that never overshoots (monotone curve). */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

export function ActivityChart({ data, dark }: { data: AppData; dark: boolean }) {
  const [metric, setMetric] = useState<Metric>("all");
  const [kind, setKind] = useState<Kind>("area");
  const [period, setPeriod] = useState<Period>("30d");
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const info = METRICS.find((m) => m.id === metric)!;
  const colour = dark ? info.dark : info.light;
  const days = useMemo(() => daily(data), [data]);
  const bs = useMemo(() => buckets(period), [period]);
  const raw = useMemo(() => series(days, bs, metric), [days, bs, metric]);
  const prevRaw = useMemo(() => series(days, buckets(period, 1), metric), [days, period, metric]);
  // A running total makes no sense for a percentage, so that shows as a line.
  const shape: Kind = kind === "total" && info.pct ? "line" : kind;
  const vals = useMemo(() => {
    if (shape !== "total") return raw;
    let sum = 0;
    return raw.map((v) => (sum += v ?? 0));
  }, [raw, shape]);

  // Headline number for the period, and how it compares with the one before.
  const sum = (xs: (number | null)[]) => xs.reduce<number>((n, v) => n + (v ?? 0), 0);
  const accuracy = (off: number) => {
    const b = buckets(period, off);
    const q = sum(series(days, b, "questions"));
    const right = b.reduce((n, x) => {
      for (let t = x.start.getTime(); t < x.end.getTime(); t += DAY) n += days.get(dayKey(new Date(t + DAY / 2)))?.c ?? 0;
      return n;
    }, 0);
    return q ? Math.round((right / q) * 100) : null;
  };
  const headline = info.pct ? accuracy(0) : sum(raw);
  const before = info.pct ? accuracy(1) : sum(prevRaw);
  const change = headline === null || before === null ? null : info.pct ? headline - before : before ? Math.round(((headline - before) / before) * 100) : headline ? null : 0;

  const H = 230;
  const pad = { l: 34, r: 10, t: 14, b: 26 };
  const iw = Math.max(10, W - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const max = Math.max(0, ...vals.map((v) => v ?? 0));
  const ys = ticks(max, !!info.pct);
  const top = ys[ys.length - 1] || 1;
  const n = vals.length;
  const step = iw / n;
  const x = (i: number) => (shape === "bar" ? pad.l + step * i + step / 2 : pad.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1)));
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const pts = vals.map((v, i) => (v === null ? null : ([x(i), y(v)] as [number, number])));
  // Lines skip gaps (no answers that day means no accuracy, not 0%).
  const runs: [number, number][][] = [];
  for (const p of pts) {
    if (!p) runs.push([]);
    else (runs[runs.length - 1] && runs[runs.length - 1].length ? runs[runs.length - 1] : (runs.push([]), runs[runs.length - 1])).push(p);
  }
  const lines = runs.filter((r) => r.length);
  const everyLabel = Math.ceil(n / Math.max(2, Math.floor(iw / 52)));
  const gid = `grad-${metric}`;

  const pick = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const px = clientX - r.left;
    const i = shape === "bar" ? Math.floor((px - pad.l) / step) : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hv = hover !== null ? vals[hover] : null;
  const shown = (v: number | null) => (v === null ? "–" : info.pct ? `${v}%` : v.toLocaleString());

  return (
    <section aria-labelledby="trend-h" className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trend-h" className="text-[17px] font-semibold">Over time</h2>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-[30px] font-bold leading-none tabular-nums tracking-tight">{shown(headline)}</span>
            <span className="text-[13px] text-muted-foreground">{info.pct ? "answered right" : info.label.toLowerCase()} in the last {PERIODS.find((p) => p.value === period)!.span}</span>
          </p>
          {change !== null && (
            <p className={cn("mt-1 text-[12.5px] font-medium", change > 0 ? "text-emerald-600 dark:text-emerald-400" : change < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
              {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}
              {info.pct ? " points" : "%"} on the {PERIODS.find((p) => p.value === period)!.span} before
            </p>
          )}
        </div>
        <Segmented size="sm" label="Time period" value={period} onChange={(v) => { setPeriod(v); setHover(null); }} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to show">
        {METRICS.map((m) => {
          const on = m.id === metric;
          const c = dark ? m.dark : m.light;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMetric(m.id)}
              className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-ring", on ? "border-transparent text-white" : "text-muted-foreground hover:text-foreground")}
              style={on ? { background: c } : undefined}
            >
              {!on && <span className="size-2 rounded-full" style={{ background: c }} aria-hidden />}
              {m.short}
            </button>
          );
        })}
      </div>

      <div ref={wrap} className="relative mt-4 touch-pan-y select-none" onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${info.label} over the last ${PERIODS.find((p) => p.value === period)!.span}`} className="block overflow-visible" shapeRendering="geometricPrecision">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={dark ? 0.45 : 0.32} />
              <stop offset="100%" stopColor={colour} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gid}-bar`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colour} />
              <stop offset="100%" stopColor={colour} stopOpacity="0.65" />
            </linearGradient>
          </defs>
          {ys.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t ? "3 4" : undefined} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
                {info.pct ? `${t}%` : t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : t}
              </text>
            </g>
          ))}
          {bs.map((b, i) =>
            i % everyLabel === (n - 1) % everyLabel ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
                {b.label}
              </text>
            ) : null,
          )}

          {shape === "bar" &&
            vals.map((v, i) => {
              const bw = Math.min(28, step * 0.62);
              const h = v ? Math.max(3, (v / top) * ih) : 0;
              return h ? (
                <rect key={i} x={x(i) - bw / 2} y={pad.t + ih - h} width={bw} height={h} rx={Math.min(6, bw / 2)} fill={`url(#${gid}-bar)`} opacity={hover === null || hover === i ? 1 : 0.45} className="transition-opacity duration-150">
                  <animate attributeName="height" from="0" to={h} dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1" />
                  <animate attributeName="y" from={pad.t + ih} to={pad.t + ih - h} dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1" />
                </rect>
              ) : null;
            })}

          {shape !== "bar" &&
            lines.map((r, k) => (
              <g key={`${metric}-${period}-${shape}-${k}`}>
                {(shape === "area" || shape === "total") && r.length > 1 && <path d={`${smooth(r)} L${r[r.length - 1][0]},${pad.t + ih} L${r[0][0]},${pad.t + ih} Z`} fill={`url(#${gid})`} />}
                <path d={smooth(r)} fill="none" stroke={colour} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset="0">
                  <animate attributeName="stroke-dashoffset" from="1" to="0" dur="0.7s" fill="freeze" calcMode="spline" keySplines="0.3 0.7 0.2 1" keyTimes="0;1" />
                </path>
                {r.length === 1 && <circle cx={r[0][0]} cy={r[0][1]} r={3.5} fill={colour} />}
              </g>
            ))}

          {hover !== null && shape !== "bar" && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="stroke-foreground/25" />
              {hv !== null && <circle cx={x(hover)} cy={y(hv)} r={5} fill={colour} className="stroke-card" strokeWidth={2.5} />}
            </g>
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-[12px] shadow-pop"
            style={{ left: Math.max(70, Math.min(W - 70, x(hover))) }}
          >
            <p className="text-muted-foreground">{bs[hover].long}</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-semibold">
              <span className="size-2 rounded-full" style={{ background: colour }} aria-hidden />
              {shown(hv)} <span className="font-normal text-muted-foreground">{shape === "total" ? "so far" : info.short.toLowerCase()}</span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <Segmented size="sm" label="Chart type" value={kind} onChange={setKind} options={KINDS.filter((k) => !(info.pct && k.value === "total"))} />
      </div>
    </section>
  );
}
