import { cn } from "@/lib/utils";

export function Switch({ checked, onChange, id, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; id?: string; label?: string; disabled?: boolean; className?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent transition-colors focus-ring disabled:opacity-50", checked ? "bg-primary" : "bg-input", className)}
    >
      <span className={cn("block size-[18px] rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-[17px]" : "translate-x-[1px]")} />
    </button>
  );
}
