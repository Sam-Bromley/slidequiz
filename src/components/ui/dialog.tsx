import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openCount = 0;

/** Accessible modal: portal, focus trap, Escape to close, restores focus, scroll lock. Becomes a bottom sheet on phones. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      (el ?? ref.current)?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && ref.current) {
        const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      openCount--;
      if (!openCount) document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border bg-popover text-popover-foreground shadow-pop outline-none",
          "animate-slide-up pb-safe sm:animate-scale-in sm:rounded-2xl sm:pb-0",
          width,
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
        <header className="flex items-start gap-3 px-5 pb-2 pt-4 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[17px] font-semibold leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {!hideClose && (
            <button onClick={onClose} className="-mr-1.5 -mt-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" aria-label="Close">
              <X className="size-4" />
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 scrollbar-thin">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-subtle px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
