import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** CSS-only tooltip that appears on hover and keyboard focus. */
export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-[240px] -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-center text-xs font-medium leading-snug text-background opacity-0 shadow-pop transition-opacity delay-0 duration-150",
          "group-hover/tt:opacity-100 group-hover/tt:delay-300 group-has-[:focus-visible]/tt:opacity-100",
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
        )}
      >
        {content}
      </span>
    </span>
  );
}
