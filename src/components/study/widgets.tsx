import { ArrowRight, Clock, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { cn, pct } from "@/lib/utils";
import { reviewCounts, type TopicStat, type TopicStatus } from "@/services/study/analytics";
import { useData } from "@/store/store";
import { startWeakAreas } from "@/components/quiz/start";

export const STATUS_META: Record<TopicStatus, { label: string; dot: string; text: string; bar: "danger" | "warning" | "success" | "muted" }> = {
  weak: { label: "Weak", dot: "bg-destructive", text: "text-destructive", bar: "danger" },
  review: { label: "Needs review", dot: "bg-warning", text: "text-warning", bar: "warning" },
  strong: { label: "Strong", dot: "bg-success", text: "text-success", bar: "success" },
  new: { label: "Not started", dot: "bg-muted-foreground/40", text: "text-muted-foreground", bar: "muted" },
};

export function StatusPill({ status }: { status: TopicStatus }) {
  const s = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium", s.text)}>
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function TopicRow({ t, action = true }: { t: TopicStat; action?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_META[t.status].dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{t.name}</p>
        <p className="truncate text-[12px] text-muted-foreground">
          {t.materialTitle}
          {t.mastery != null && <> · {pct(t.mastery)} mastery</>}
        </p>
      </div>
      <StatusPill status={t.status} />
      {action && t.status !== "strong" && t.questionCount > 0 && (
        <Button variant="ghost" size="icon-sm" aria-label={`Practise ${t.name}`} onClick={() => startWeakAreas([t.materialId], [t.topicId])}>
          <ArrowRight />
        </Button>
      )}
    </li>
  );
}

export function StatTile({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between text-[12.5px] font-medium text-muted-foreground">
        {label}
        {icon}
      </div>
      <p className="mt-1.5 font-display text-[24px] font-bold tabular-nums leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function TodaysReview({ compact }: { compact?: boolean }) {
  const data = useData();
  const rc = reviewCounts(data.flashcards);
  const items = [
    { n: rc.difficult, label: "difficult", tone: "text-destructive" },
    { n: rc.due, label: "due", tone: "text-warning" },
    { n: rc.mastered, label: "mastered", tone: "text-success" },
  ];
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Today's Review</h2>
        <Layers className="size-4 text-muted-foreground" />
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {items.map((i) => (
          <li key={i.label} className="rounded-lg bg-subtle px-3 py-2.5">
            <span className={cn("block font-display text-[22px] font-bold tabular-nums leading-none", i.tone)}>{i.n}</span>
            <span className="mt-1 block text-[12px] text-muted-foreground">{i.label}</span>
          </li>
        ))}
      </ul>
      {!compact && rc.fresh > 0 && <p className="mt-3 text-[12.5px] text-muted-foreground">{rc.fresh} new cards waiting to be learned.</p>}
      <Button className="mt-4 w-full" variant={rc.due + rc.difficult ? "default" : "outline"} onClick={() => navigate("/flashcards/review")} disabled={!rc.total}>
        <Clock /> {rc.due + rc.difficult ? `Review ${Math.min(rc.due + rc.fresh, 30)} cards` : "Study flashcards"}
      </Button>
    </div>
  );
}
