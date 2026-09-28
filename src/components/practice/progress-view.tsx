import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { overallProgress, topicProgress } from "@/services/practice";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { ID, Material } from "@/types/models";

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
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[44px] font-semibold leading-none tabular-nums">{all.pct}%</p>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {all.covered} of {all.total} questions covered{all.review ? ` · ${all.review} to review` : ""}
          </p>
        </div>
        <Button onClick={() => onPractise(null)}>Practise</Button>
      </div>

      <ul className="mt-8 divide-y border-y">
        {rows.map((r) => (
          <li key={r.topicId ?? "other"} className="py-4">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{r.name}</p>
              <span className="text-[14px] font-semibold tabular-nums">{r.pct}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-[width] duration-500", r.pct === 100 ? "bg-success" : "bg-foreground")} style={{ width: `${r.pct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>
                {r.covered} of {r.total} covered
                {r.review > 0 && <> · {r.review} to review</>}
                {r.answered < r.total && <> · {r.total - r.answered} not tried yet</>}
              </span>
              <button type="button" onClick={() => onPractise(r.topicId)} className="font-medium text-foreground underline-offset-2 hover:underline focus-ring">
                Practise this
              </button>
            </div>
          </li>
        ))}
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
