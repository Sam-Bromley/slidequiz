import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
}

/** Dropdown menu with roving focus (arrow keys, Home/End, Escape). */
export function Menu({ trigger, items, align = "end", label }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; "aria-controls": string; ref: React.Ref<HTMLButtonElement> }) => ReactNode; items: MenuItem[]; align?: "start" | "end"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 208;
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const h = items.length * 36 + 12;
    const top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    setPos({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus(), 10);
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", onScroll);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") els[(i + 1) % els.length]?.focus();
    else if (e.key === "ArrowUp") els[(i - 1 + els.length) % els.length]?.focus();
    else if (e.key === "Home") els[0]?.focus();
    else if (e.key === "End") els[els.length - 1]?.focus();
    else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      btn.current?.focus();
    } else return;
    e.preventDefault();
  };

  return (
    <>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu", "aria-controls": id, ref: btn })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onKey}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[80] w-52 animate-scale-in rounded-xl border bg-popover p-1 text-popover-foreground shadow-pop"
          >
            {items.map((it, i) => (
              <div key={i}>
                {it.separatorBefore && <div className="-mx-1 my-1 h-px bg-border" />}
                <button
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] outline-none transition-colors hover:bg-accent focus:bg-accent disabled:opacity-40 [&_svg]:size-4",
                    it.danger ? "text-destructive" : "text-foreground",
                  )}
                >
                  {it.icon && <it.icon className={it.danger ? "" : "text-muted-foreground"} />}
                  <span className="flex-1">{it.label}</span>
                  {it.shortcut && <span className="text-[11px] text-muted-foreground">{it.shortcut}</span>}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
