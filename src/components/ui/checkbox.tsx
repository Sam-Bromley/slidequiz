import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, indeterminate, ...p }: InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer relative size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-input bg-card shadow-xs transition-colors focus-ring",
        "checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary",
        "after:absolute after:inset-0 after:m-auto after:hidden checked:after:block indeterminate:after:block",
        "checked:after:h-[9px] checked:after:w-[5px] checked:after:-translate-y-[1px] checked:after:rotate-45 checked:after:border-b-2 checked:after:border-r-2 checked:after:border-primary-foreground",
        "indeterminate:after:h-[2px] indeterminate:after:w-2 indeterminate:after:rotate-0 indeterminate:after:translate-y-0 indeterminate:after:border-0 indeterminate:after:bg-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...p}
    />
  );
}
