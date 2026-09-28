import { formatDate } from "@/lib/utils";

/** Small line chart of quiz scores over time (0–100% fixed scale). */
export function ScoreTrend({ scores }: { scores: { at: string; score: number; title: string }[] }) {
  const pts = scores.slice(-12);
  if (pts.length < 2) return <p className="py-6 text-center text-[13px] text-muted-foreground">Complete a couple more quizzes to see your trend.</p>;
  const W = 560, H = 160, L = 44, R = 12, T = 12, B = 26;
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = pts[pts.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Quiz scores over your last ${pts.length} quizzes, most recent ${Math.round(last.score * 100)}%`}>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="stroke-border" strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={L - 8} y={y(g) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]">{g * 100}%</text>
          </g>
        ))}
        <path d={area} className="fill-primary/10" />
        <path d={line} fill="none" className="stroke-primary" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.score)} r={i === pts.length - 1 ? 4.5 : 2.5} className={i === pts.length - 1 ? "fill-primary stroke-card" : "fill-card stroke-primary"} strokeWidth={i === pts.length - 1 ? 2 : 1.5}>
            <title>{`${p.title}: ${Math.round(p.score * 100)}%`}</title>
          </circle>
        ))}
        <text x={x(0)} y={H - 6} className="fill-muted-foreground text-[10px]">{formatDate(pts[0].at, { day: "numeric", month: "short" })}</text>
        <text x={x(pts.length - 1)} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">{formatDate(last.at, { day: "numeric", month: "short" })}</text>
      </svg>
    </figure>
  );
}
