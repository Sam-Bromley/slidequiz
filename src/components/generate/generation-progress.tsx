import { Button } from "@/components/ui/button";
import type { GenerationStage } from "@/services/ai";

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: "reading", label: "Reading your slides" },
  { key: "topics", label: "Sorting them into topics" },
  { key: "concepts", label: "Picking out the key terms" },
  { key: "questions", label: "Writing questions" },
  { key: "explanations", label: "Adding answers and slide references" },
];

export function GenerationProgress({ stage, summary, onCancel }: { stage: GenerationStage; summary: string; onCancel: () => void }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  const pct = ((idx + 0.6) / STAGES.length) * 100;
  return (
    <div className="max-w-md py-16 sm:py-24" role="status" aria-live="polite">
      <p className="text-[13px] text-muted-foreground">{summary}</p>
      <h1 className="mt-2 text-[24px] font-bold">{STAGES[idx].label}…</h1>
      <div className="relative mt-6 h-1.5 rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 animate-hop rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.2)] [animation-iteration-count:infinite] [animation-duration:1.1s]" style={{ left: `${pct}%`, transition: "left .7s ease-out" }} />
      </div>
      <p className="mt-3 text-[13px] tabular-nums text-muted-foreground">
        Step {idx + 1} of {STAGES.length}
      </p>
      <Button variant="ghost" size="sm" className="mt-6 -ml-3" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
