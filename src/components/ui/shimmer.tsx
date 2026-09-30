import { cn } from "@/lib/utils";

/** A loading placeholder with a soft light sweeping across it. */
export function Shimmer({ className }: { className?: string }) {
  return <span className={cn("shimmer block rounded-md", className)} aria-hidden />;
}
