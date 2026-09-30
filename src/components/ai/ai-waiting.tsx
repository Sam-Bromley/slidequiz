import { Clock, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { enhanceMaterial } from "@/services/ai/cloud";
import { hasPlus } from "@/services/plus";
import type { Material } from "@/types/models";

/**
 * Shown in place of notes or questions until the AI has written them: a calm "writing" state,
 * the daily-allowance message, or a way to try again. Nothing is filled in with guesses meanwhile.
 */
export function AIWaiting({ material, what }: { material: Material; what: "notes" | "questions" }) {
  const status = material.ai?.status;
  const noun = what === "notes" ? "notes" : "practice questions";

  if (status === "limit")
    return (
      <Panel icon={<Clock className="size-5" />} title="Today's AI allowance is used up">
        Your {noun} will be written as soon as it resets tomorrow; just open this lecture again.
        {!hasPlus() && (
          <>
            {" "}
            Or{" "}
            <Link to="/plus" className="font-medium text-foreground underline underline-offset-2">
              get Plus
            </Link>{" "}
            for more each day.
          </>
        )}
      </Panel>
    );

  if (status === "failed")
    return (
      <Panel icon={<TriangleAlert className="size-5" />} title={`Couldn't write your ${noun}`} action={<Button variant="outline" onClick={() => enhanceMaterial(material.id)}><RotateCcw /> Try again</Button>}>
        The AI is busy or your connection dropped. Try again in a moment.
        {material.ai?.error && <span className="mt-2 block text-[12px] opacity-70">Reason: {material.ai.error}</span>}
      </Panel>
    );

  return (
    <div className="rounded-2xl border bg-card p-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2.5 text-[15px] font-medium">
        <Sparkles className="size-4 animate-pulse" /> Writing your {noun}…
      </div>
      <p className="mt-1 text-[13.5px] text-muted-foreground">This usually takes under a minute. You can look around while you wait.</p>
      <div className="mt-6 space-y-3" aria-hidden>
        {[92, 78, 85, 60, 88, 70].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded-full bg-muted" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Panel({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[14px] text-muted-foreground">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** True when a material has text for the AI to work from. */
export const hasText = (m: Material) => m.pages.some((p) => p.included && p.text.trim());
