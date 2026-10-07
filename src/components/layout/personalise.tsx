import { Check, Moon, Palette, Sun, Sunset, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { baseTheme, effectiveTheme, isDarkTheme, nightLightOn, toggleNightLight } from "@/lib/theme";

import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { toast } from "@/components/ui/toast";
import { usePlan } from "@/services/plus";
import { removeBackgroundPhoto, setBackgroundPhoto, useBackgroundPhotoUrl } from "@/services/background-photo";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { BackgroundScene } from "@/types/models";
import { SCENE_ORDER, SCENES, ScenePreview } from "./app-background";

export const sceneLabel = (s: BackgroundScene) => (s === "none" ? "Plain" : SCENES[s].label);

const ACCENTS = [
  { key: "default", label: "Default", swatch: "hsl(var(--foreground))" },
  { key: "blue", label: "Blue", swatch: "#2563eb" },
  { key: "green", label: "Green", swatch: "#16a34a" },
  { key: "purple", label: "Purple", swatch: "#8b5cf6" },
  { key: "pink", label: "Pink", swatch: "#ec4899" },
  { key: "orange", label: "Orange", swatch: "#f97316" },
] as const;

/** Top-right personalise panel: theme + background preset. */
export function Personalise() {
  const data = useData();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = effectiveTheme(data.settings);
  const dark = isDarkTheme(current);
  const base = baseTheme(data.settings);
  const night = nightLightOn(data.settings);
  const plan = usePlan();
  const photoUrl = useBackgroundPhotoUrl(data.settings.bgPhoto);
  const photoOn = plan.plus && !!data.settings.bgPhotoOn && !!photoUrl;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
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
                set: () => actions.updateSettings(toggleNightLight(data.settings)),
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
          <p className="flex items-center gap-1.5 px-1 pb-2 pt-4 text-[12px] font-medium text-muted-foreground">
            Accent colour
            {!plan.plus && <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">Pro</span>}
          </p>
          <div className="flex flex-wrap gap-2 px-1" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => {
              const on = plan.plus ? (data.settings.accent ?? "default") === a.key : a.key === "default";
              return (
                <button
                  key={a.key}
                  role="radio"
                  aria-checked={on}
                  aria-label={a.label}
                  title={a.label}
                  onClick={() => {
                    if (plan.plus) actions.updateSettings({ accent: a.key });
                    else if (a.key !== "default") {
                      setOpen(false);
                      toast("Accent colours are part of SlideQuiz Pro");
                      navigate("/pro");
                    }
                  }}
                  className={cn("grid size-7 place-items-center rounded-full border-2 transition-transform hover:scale-110 focus-ring", on ? "border-foreground" : "border-transparent")}
                  style={{ background: a.swatch }}
                >
                  {on && <Check className={cn("size-3.5", a.key === "default" ? "text-background" : "text-white")} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          <p className="px-1 pb-2 pt-4 text-[12px] font-medium text-muted-foreground">Background</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Background">
            {SCENE_ORDER.map((s) => {
              const on = scene === s && !photoOn;
              return (
                <button key={s} role="radio" aria-checked={on} onClick={() => actions.updateSettings({ scene: s, bgPhotoOn: false })} className="group text-left focus-ring rounded-xl">
                  <span className={cn("relative block h-14 overflow-hidden rounded-xl border-2 transition-colors", on ? "border-foreground" : "border-transparent group-hover:border-border")}>
                    <ScenePreview scene={s} dark={dark} accent={plan.plus && data.settings.accent !== "default" ? data.settings.accent : null} />
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
            {/* Pro: your own photo. */}
            <button
              role="radio"
              aria-checked={photoOn}
              onClick={() => {
                if (!plan.plus) {
                  setOpen(false);
                  toast("Your own background is part of SlideQuiz Pro");
                  navigate("/pro");
                } else if (photoUrl && !photoOn) actions.updateSettings({ bgPhotoOn: true });
                else fileRef.current?.click();
              }}
              className="group rounded-xl text-left focus-ring"
            >
              <span className={cn("relative grid h-14 place-items-center overflow-hidden rounded-xl border-2 bg-muted transition-colors", photoOn ? "border-foreground" : "border-transparent group-hover:border-border")}>
                {photoUrl ? <img src={photoUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus className="size-5 text-muted-foreground" />}
                {!plan.plus && <span className="absolute right-1 top-1 rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">Pro</span>}
                {photoOn && (
                  <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-foreground text-background">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-1 block text-center text-[12px] text-muted-foreground">{busy ? "Adding…" : "Your photo"}</span>
            </button>
          </div>
          {plan.plus && photoUrl && (
            <div className="mt-2 flex justify-center gap-3 text-[12px]">
              <button type="button" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring" onClick={() => fileRef.current?.click()}>
                Change photo
              </button>
              <button type="button" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring" onClick={() => removeBackgroundPhoto()}>
                Remove
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              try {
                await setBackgroundPhoto(f);
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
