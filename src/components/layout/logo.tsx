import { cn } from "@/lib/utils";

/** SlideQuiz mark: a slide with a tick, monochrome. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <rect x="7.5" y="8.5" width="17" height="12" rx="2" fill="none" className="stroke-background" strokeWidth="1.8" />
      <path d="M16 20.5v3M13 23.5h6" className="stroke-background" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m12.8 14.5 2.2 2.2 4.2-4.2" fill="none" className="stroke-background" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-6" />
      <span className="text-[15.5px] font-semibold tracking-[-0.02em]">SlideQuiz</span>
    </span>
  );
}
