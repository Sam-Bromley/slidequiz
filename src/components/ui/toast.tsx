import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn, uid } from "@/lib/utils";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
  duration: number;
}

let toasts: Toast[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function toast(title: string, opts: Partial<Omit<Toast, "id" | "title">> = {}) {
  const t: Toast = { id: uid("t"), title, tone: "success", duration: opts.action ? 6500 : 3800, ...opts };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => dismiss(t.id), t.duration);
  return t.id;
}
toast.error = (title: string, opts: Partial<Omit<Toast, "id" | "title" | "tone">> = {}) => toast(title, { ...opts, tone: "error" });
toast.info = (title: string, opts: Partial<Omit<Toast, "id" | "title" | "tone">> = {}) => toast(title, { ...opts, tone: "info" });
/** Toast with an Undo action for destructive operations. */
toast.undo = (title: string, undo: () => void) => toast(title, { tone: "info", action: { label: "Undo", onClick: () => { undo(); toast("Restored"); } } });

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => toasts,
  );
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6">
      {list.map((t) => {
        const Icon = t.tone === "error" ? CircleAlert : t.tone === "info" ? Info : CheckCircle2;
        return (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-popover p-3 pr-2 text-popover-foreground shadow-pop">
            <Icon className={cn("mt-0.5 size-[18px] shrink-0", t.tone === "error" ? "text-destructive" : t.tone === "info" ? "text-primary" : "text-success")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{t.description}</p>}
            </div>
            {t.action && (
              <button
                className="h-7 shrink-0 rounded-md px-2 text-[13px] font-semibold text-primary hover:bg-primary-soft focus-ring"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-ring" aria-label="Dismiss notification">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
