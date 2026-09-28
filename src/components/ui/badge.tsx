import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11.5px] font-medium [&_svg]:size-3", TONES[tone], className)} {...p} />;
}
