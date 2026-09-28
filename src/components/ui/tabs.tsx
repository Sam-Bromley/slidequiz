import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/** Underline tabs (ARIA tablist). Panels are rendered by the parent using `tabPanelProps`. */
export function Tabs<T extends string>({ value, onChange, items, idPrefix, className }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; idPrefix: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = items.findIndex((t) => t.value === value);
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[n].value);
    (ref.current?.querySelectorAll("[role=tab]")[n] as HTMLElement | undefined)?.focus();
  };
  return (
    <div ref={ref} role="tablist" onKeyDown={onKey} className={cn("no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0", className)}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            id={`${idPrefix}-tab-${t.value}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13.5px] font-medium transition-colors focus-ring rounded-t-md",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && <span className={cn("rounded px-1.5 text-[11px] tabular-nums", active ? "bg-primary-soft text-primary" : "bg-secondary text-muted-foreground")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const tabPanelProps = (idPrefix: string, value: string) => ({ id: `${idPrefix}-panel`, role: "tabpanel", "aria-labelledby": `${idPrefix}-tab-${value}`, tabIndex: 0, className: "outline-none" });
