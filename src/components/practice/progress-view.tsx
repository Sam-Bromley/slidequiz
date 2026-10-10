import { Check, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { overallProgress, topicProgress, type TopicProgress } from "@/services/practice";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { ID, Material } from "@/types/models";

/** A smooth ring showing how much of the lecture is covered. */
function Ring({ pct }: { pct: number }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const done = pct === 100;
  return (
    <div className="relative size-[120px] shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" shapeRendering="geometricPrecision" aria-hidden>
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
        {pct > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`}
            className={cn("transition-[stroke-dasharray] duration-700 ease-out", done ? "stroke-success" : "stroke-primary")}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {done ? <Check className="size-8 text-success" strokeWidth={2.5} /> : <span className="text-[28px] font-semibold leading-none tabular-nums">{pct}%</span>}
        <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{done ? "All done" : "covered"}</span>
      </div>
    </div>
  );
}

/** Right, wrong and not tried yet, side by side in one bar. */
function Bar({ r }: { r: { total: number; covered: number; review: number } }) {
  const w = (n: number) => `${(n / r.total) * 100}%`;
  return (
    <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-muted">
      {r.covered > 0 && <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: w(r.covered) }} />}
      {r.review > 0 && <div className="h-full rounded-full bg-warning transition-[width] duration-500" style={{ width: w(r.review) }} />}
    </div>
  );
}

function status(r: TopicProgress) {
  if (r.pct === 100) return { label: "Done", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300" };
  if (!r.answered) return { label: "Not started", cls: "bg-muted text-muted-foreground" };
  if (r.review > 0) return { label: `${r.review} to fix`, cls: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300" };
  return { label: "In progress", cls: "bg-primary/10 text-foreground" };
}

/** How much of each topic is covered: the share of its questions whose latest answer was right. */
export function ProgressView({ material, onPractise }: { material: Material; onPractise: (topicId: ID | null) => void }) {
  const data = useData();
  const rows = topicProgress(data, material);
  const all = overallProgress(data, material);

  if (!all.total)
    return (
      <div className="rounded-2xl border border-dashed py-14 text-center">
        <p className="font-medium">Nothing to show yet</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Your progress appears here once there are questions to practise.</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center">
        <Ring pct={all.pct} />
        <Button className="mt-5 min-w-[200px] bg-success text-white hover:bg-success/90" onClick={() => onPractise(null)}>
          Practise
        </Button>
      </div>

      <h3 className="mb-2 mt-8 px-1 text-[13px] font-medium uppercase tracking-wider text-muted-foreground">Topics</h3>
      <ul className="space-y-2">
        {rows.map((r) => {
          const s = status(r);
          return (
            <li key={r.topicId ?? "other"}>
              <button
                type="button"
                onClick={() => onPractise(r.topicId)}
                className="group w-full rounded-2xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-accent/60 focus-ring"
                aria-label={`Practise ${r.name}: ${r.pct}% covered`}
              >
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{r.name}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", s.cls)}>{s.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Bar r={r} />
                  </div>
                  <span className="w-[3.2em] shrink-0 text-right text-[13px] font-semibold tabular-nums">{r.pct}%</span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  {r.covered} of {r.total} right
                  {r.answered < r.total && <> · {r.total - r.answered} not tried</>}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {all.covered + all.review > 0 && (
        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              const undo = actions.resetPractice(material.id);
              toast.undo("Progress reset", undo);
            }}
          >
            <RotateCcw /> Start again from 0%
          </Button>
        </div>
      )}
    </div>
  );
}
