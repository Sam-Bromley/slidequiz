import { cn } from "@/lib/utils";

/** SlideQuiz mark: a white slide with the signature green tick, on black (in every theme). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="#0a0a0a" className="stroke-transparent dark:stroke-white/15" strokeWidth="1" />
      <rect x="7.5" y="8.5" width="17" height="12" rx="2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M16 20.5v3M13 23.5h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m12.8 14.5 2.2 2.2 4.2-4.2" fill="none" stroke="#22c55e" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, pro }: { className?: string; pro?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-6" />
      <span className="text-[16px] font-bold tracking-[-0.025em] text-foreground">SlideQuiz</span>
      {pro && <span className="pro-gold pro-badge rounded-md text-[10px] font-bold uppercase leading-none tracking-wider">Pro</span>}
    </span>
  );
}
