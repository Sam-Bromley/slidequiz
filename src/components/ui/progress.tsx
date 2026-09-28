import { cn } from "@/lib/utils";

export function Progress({ value, className, tone = "primary", label, size = "md" }: { value: number; className?: string; tone?: "primary" | "success" | "warning" | "danger" | "muted"; label?: string; size?: "sm" | "md" }) {
  const v = Math.max(0, Math.min(1, value));
  const color = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-destructive", muted: "bg-muted-foreground/40" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("w-full overflow-hidden rounded-full bg-secondary", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", color)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}
