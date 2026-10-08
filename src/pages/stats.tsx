import { BarChart3, Layers, ListChecks, PenLine, Target } from "lucide-react";
import { useState } from "react";
import { PageHeader, SectionTitle } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link, navigate } from "@/lib/router";
import { effectiveTheme, isDarkTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useData } from "@/store/store";
import type { AppData } from "@/services/db/types";
import type { ID } from "@/types/models";

/** Categorical colours in a fixed order (checked for colour-blind separation), light and dark versions. */
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
const OTHER = { light: "#a8a8a2", dark: "#6b6b66" };
const MAX_SLICES = 6;

type Row = { id: ID | "other"; title: string; questions: number; cards: number; written: number; total: number; copies?: number };

/** How much each lecture has been revised: questions answered, flashcard reviews and written answers marked. */
function revision(d: AppData): Row[] {
  const rows = new Map<ID, Row>(d.materials.map((m) => [m.id, { id: m.id, title: m.title, questions: 0, cards: 0, written: 0, total: 0 }]));
  for (const q of d.questions) {
    const r = rows.get(q.materialId);
    if (r) r.questions += q.stats.attempts;
  }
  for (const c of d.flashcards) {
    const r = rows.get(c.materialId);
    // Each review moves a card on (or back after "Hard"), so this counts the reviews made.
    if (r && c.srs.lastReviewedAt) r.cards += Math.max(1, c.srs.reps + c.srs.lapses);
  }
  for (const m of d.materials) {
    const r = rows.get(m.id)!;
    r.written = (m.written ?? []).filter((w) => w.last).length;
  }
  // The same lecture uploaded more than once counts as one (opening the copy revised most).
  const byTitle = new Map<string, Row & { copies: number; best: number }>();
  for (const r of rows.values()) {
    const total = r.questions + r.cards + r.written;
    if (!total) continue;
    const key = r.title.trim().toLowerCase();
    const prev = byTitle.get(key);
    if (!prev) byTitle.set(key, { ...r, total, copies: 1, best: total });
    else
      byTitle.set(key, {
        ...prev,
        id: total > prev.best ? r.id : prev.id,
        best: Math.max(prev.best, total),
        questions: prev.questions + r.questions,
        cards: prev.cards + r.cards,
        written: prev.written + r.written,
        total: prev.total + total,
        copies: prev.copies + 1,
      });
  }
  return [...byTitle.values()];
}

const fmtPct = (x: number) => (x > 0 && x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`);

export function StatsPage() {
  const data = useData();
  const dark = isDarkTheme(effectiveTheme(data.settings));
  const [hover, setHover] = useState<number | null>(null);

  const all = revision(data).sort((a, b) => b.total - a.total);
  const grand = all.reduce((n, r) => n + r.total, 0);
  // The biggest lectures get a slice each; the rest share one "Other" slice.
  const top = all.slice(0, all.length > MAX_SLICES + 1 ? MAX_SLICES : MAX_SLICES + 1);
  const rest = all.slice(top.length);
  // Colours follow the lecture (the order it was added), not its rank, so they don't swap around.
  const order = new Map(data.materials.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((m, i) => [m.id, i]));
  const ranked = top.slice().sort((a, b) => (order.get(a.id as ID) ?? 0) - (order.get(b.id as ID) ?? 0));
  const colourOf = new Map(ranked.map((r, i) => [r.id, (dark ? DARK : LIGHT)[i]]));
  const slices: (Row & { colour: string })[] = [
    ...top.map((r) => ({ ...r, colour: colourOf.get(r.id)! })),
    ...(rest.length
      ? [{ id: "other" as const, title: `${rest.length} other ${rest.length === 1 ? "lecture" : "lectures"}`, questions: 0, cards: 0, written: 0, total: rest.reduce((n, r) => n + r.total, 0), colour: dark ? OTHER.dark : OTHER.light }]
      : []),
  ];

  const answered = data.questions.reduce((n, q) => n + q.stats.attempts, 0);
  const right = data.questions.reduce((n, q) => n + q.stats.correct, 0);
  const cards = all.reduce((n, r) => n + r.cards, 0);
  const written = all.reduce((n, r) => n + r.written, 0);

  if (!grand)
    return (
      <div>
        <PageHeader title="Stats" />
        <EmptyState icon={BarChart3} title="Nothing revised yet" description="Answer some questions or go through some flashcards, and you'll see which lectures you've revised the most." action={<Button onClick={() => navigate("/questions")}><ListChecks /> Practise questions</Button>} />
      </div>
    );

  let start = 0;
  const S = 220;
  const WIDTH = 34;
  const RING = (S - WIDTH - 12) / 2;
  const C = 2 * Math.PI * RING;
  const shown = hover !== null ? slices[hover] : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Stats" description="What you've revised, and which lectures you've spent the most time on." className="mb-0 sm:mb-0" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: ListChecks, label: "Questions answered", value: answered.toLocaleString() },
          { icon: Target, label: "Answered right", value: answered ? `${Math.round((right / answered) * 100)}%` : "–" },
          { icon: Layers, label: "Flashcard reviews", value: cards.toLocaleString() },
          { icon: PenLine, label: "Written answers", value: written.toLocaleString() },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border bg-card p-4">
            <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
              <t.icon className="mt-0.5 size-3.5 shrink-0" /> {t.label}
            </p>
            <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">{t.value}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="split-h" className="rounded-2xl border bg-card p-5 sm:p-6">
        <SectionTitle id="split-h">What you've revised most</SectionTitle>
        <p className="-mt-1 mb-5 text-[13px] text-muted-foreground">Share of everything you've revised (questions, flashcards and written answers), by lecture.</p>
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
          <div className="relative shrink-0" style={{ width: S, height: S }}>
            <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label="Pie chart of revision by lecture" className="-rotate-90" onMouseLeave={() => setHover(null)}>
              {/* One smooth ring: each slice is a stretch of the same circle's outline, so the edges line up exactly. */}
              {slices.map((s, i) => {
                const len = (s.total / grand) * C;
                const offset = start;
                start += len;
                const on = hover === i;
                return (
                  <circle
                    key={s.id}
                    cx={S / 2}
                    cy={S / 2}
                    r={RING}
                    fill="none"
                    stroke={s.colour}
                    strokeWidth={on ? WIDTH + 10 : WIDTH}
                    // A hair of overlap so no hairline shows where two slices meet.
                    strokeDasharray={`${Math.min(C, len + (slices.length > 1 ? 0.6 : 0))} ${C}`}
                    strokeDashoffset={-offset}
                    opacity={hover === null || on ? 1 : 0.5}
                    className="cursor-pointer transition-[stroke-width,opacity] duration-200 ease-out"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => s.id !== "other" && navigate(`/materials/${s.id}`)}
                  >
                    <title>{`${s.title}: ${fmtPct(s.total / grand)}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div className="max-w-[112px]">
                <p className="text-[26px] font-bold tabular-nums leading-none">{shown ? fmtPct(shown.total / grand) : grand.toLocaleString()}</p>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-tight text-muted-foreground">{shown ? shown.title : "things revised"}</p>
              </div>
            </div>
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-1" aria-label="Revision by lecture">
            {slices.map((s, i) => {
              const share = s.total / grand;
              const inner = (
                <>
                  <span className="size-3 shrink-0 rounded-[3px]" style={{ background: s.colour }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[14px] font-medium">{s.title}</span>
                      <span className="ml-auto shrink-0 text-[14px] font-semibold tabular-nums">{fmtPct(share)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: s.colour }} />
                    </span>
                    {s.id !== "other" && (
                      <span className="mt-1 block text-[12px] text-muted-foreground">
                        {[s.questions && `${s.questions} ${s.questions === 1 ? "question" : "questions"}`, s.cards && `${s.cards} ${s.cards === 1 ? "card" : "cards"}`, s.written && `${s.written} written`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </>
              );
              const cls = cn("flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors", hover === i ? "bg-accent" : "hover:bg-accent/60");
              return (
                <li key={s.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {s.id === "other" ? <div className={cls}>{inner}</div> : <Link to={`/materials/${s.id}`} className={cn(cls, "focus-ring")}>{inner}</Link>}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
