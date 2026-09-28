import { RotateCw } from "lucide-react";
import { SourceChip } from "@/components/questions/source";
import { cn } from "@/lib/utils";
import type { Flashcard } from "@/types/models";

/** 3D flip card. Front: prompt/term. Back: answer. */
export function FlipCard({ card, flipped, onFlip, topic }: { card: Flashcard; flipped: boolean; onFlip: () => void; topic?: string }) {
  const face = "absolute inset-0 flex flex-col rounded-2xl border bg-card p-6 shadow-soft [backface-visibility:hidden] sm:p-8";
  return (
    <div className="[perspective:1600px]">
      <button
        type="button"
        onClick={onFlip}
        aria-label={flipped ? "Show front of card" : "Reveal answer"}
        aria-pressed={flipped}
        className="relative block h-[320px] w-full rounded-2xl text-left focus-ring sm:h-[360px]"
      >
        <div className={cn("relative size-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none", flipped && "[transform:rotateY(180deg)]")}>
          <div className={face} aria-hidden={flipped}>
            <div className="flex items-center justify-between text-[12px] font-medium text-muted-foreground">
              <span>{topic ?? "Flashcard"}</span>
              <span className="uppercase tracking-[0.08em]">Question</span>
            </div>
            <div className="flex flex-1 items-center justify-center px-2 text-center">
              <p className={cn("text-balance font-medium leading-snug", card.front.length > 90 ? "text-[19px]" : "text-[24px] sm:text-[28px]")}>{card.front}</p>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
              <RotateCw className="size-3.5" /> Tap or press Space to flip
            </p>
          </div>
          <div className={cn(face, "[transform:rotateY(180deg)]")} aria-hidden={!flipped}>
            <div className="flex items-center justify-between text-[12px] font-medium text-muted-foreground">
              <span className="line-clamp-1">{card.front}</span>
              <span className="uppercase tracking-[0.08em] text-primary">Answer</span>
            </div>
            <div className="flex flex-1 items-center justify-center px-2 text-center">
              <p className={cn("text-balance leading-relaxed", card.back.length > 120 ? "text-[16px]" : "text-[19px] sm:text-[21px]")}>{card.back}</p>
            </div>
            <div className="h-6" />
          </div>
        </div>
      </button>
      {card.source && (
        <div className="mt-3 flex justify-center">
          <SourceChip source={card.source} />
        </div>
      )}
    </div>
  );
}
