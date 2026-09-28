import { Check, Moon, Palette, Sun, Sunset } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { effectiveTheme, isDarkTheme, THEMES } from "@/lib/theme";

const THEME_ICON = { light: Sun, dark: Moon, warm: Sunset } as const;
import { cn } from "@/lib/utils";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { BackgroundScene } from "@/types/models";
import { SCENE_ORDER, SCENES, ScenePreview } from "./app-background";

export const sceneLabel = (s: BackgroundScene) => (s === "none" ? "Plain" : SCENES[s].label);

/** Top-right personalise panel: theme + background preset. */
export function Personalise() {
  const data = useData();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = effectiveTheme(data.settings);
  const dark = isDarkTheme(current);
  const scene = data.settings.scene ?? "none";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <Button variant="ghost" size="icon" aria-label="Personalise" aria-expanded={open} title="Personalise" onClick={() => setOpen((o) => !o)}>
        <Palette />
      </Button>
      {open && (
        <div role="dialog" aria-label="Personalise" className="absolute right-0 top-full z-50 mt-2 w-[296px] animate-scale-in rounded-2xl border bg-popover p-3 text-popover-foreground shadow-pop">
          <p className="px-1 pb-2 text-[12px] font-medium text-muted-foreground">Theme</p>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => {
              const on = current === t.value;
              return (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={on}
                  onClick={() => actions.updateSettings({ theme: t.value, ...(t.value !== "warm" && data.settings.nightLightAuto ? { nightLightAuto: false } : {}) })}
                  className={cn("flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[12.5px] transition-colors focus-ring", on ? "border-foreground/40 bg-accent" : "hover:bg-accent")}
                >
                  {(() => {
                    const Icon = THEME_ICON[t.value];
                    return <Icon className="size-4" />;
                  })()}
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="px-1 pb-2 pt-4 text-[12px] font-medium text-muted-foreground">Background</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Background">
            {SCENE_ORDER.map((s) => {
              const on = scene === s;
              return (
                <button key={s} role="radio" aria-checked={on} onClick={() => actions.updateSettings({ scene: s })} className="group text-left focus-ring rounded-xl">
                  <span className={cn("relative block h-14 overflow-hidden rounded-xl border-2 transition-colors", on ? "border-foreground" : "border-transparent group-hover:border-border")}>
                    <ScenePreview scene={s} dark={dark} />
                    {on && (
                      <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-foreground text-background">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-center text-[12px] text-muted-foreground">{sceneLabel(s)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
