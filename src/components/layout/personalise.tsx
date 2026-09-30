import { Check, Moon, Palette, Sun, Sunset } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { baseTheme, effectiveTheme, isDarkTheme } from "@/lib/theme";

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
  const base = baseTheme(data.settings);
  const night = data.settings.theme === "warm" || !!data.settings.nightLight;
  const saved = data.settings.scene ?? "none";
  const scene = SCENE_ORDER.includes(saved) ? saved : "none";

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
            {([
              { key: "light", label: "Light", Icon: Sun, on: base === "light", set: () => actions.updateSettings({ theme: "light" }) },
              { key: "dark", label: "Dark", Icon: Moon, on: base === "dark", set: () => actions.updateSettings({ theme: "dark" }) },
              {
                key: "night",
                label: "Night light",
                Icon: Sunset,
                on: night,
                // Warms whatever you're on: from Light it stays light (no moon and stars).
                set: () => actions.updateSettings(data.settings.theme === "warm" ? { theme: "dark", nightLight: false } : { nightLight: !night }),
              },
            ] as const).map((t) => (
              <button
                key={t.key}
                role={t.key === "night" ? "switch" : "radio"}
                aria-checked={t.on}
                onClick={t.set}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[12.5px] transition-colors focus-ring", t.on ? "border-foreground/40 bg-accent" : "hover:bg-accent")}
              >
                <t.Icon className="size-4" />
                {t.label}
              </button>
            ))}
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
