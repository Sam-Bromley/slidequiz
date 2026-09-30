import { useEffect, useState } from "react";
import type { Settings, ThemeName } from "@/types/models";

export interface ThemeDef {
  value: ThemeName;
  label: string;
  dark: boolean;
  /** background, card, accent colour for the picker swatch */
  swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  { value: "light", label: "Light", dark: false, swatch: ["#ffffff", "#ededed", "#171717"] },
  { value: "dark", label: "Dark", dark: true, swatch: ["#000000", "#1c1c1c", "#f2f2f2"] },
  { value: "warm", label: "Night light", dark: true, swatch: ["#1b1612", "#2a231c", "#e0a052"] },
];

const byValue = (t: string) => THEMES.find((x) => x.value === t) ?? THEMES[0];
export const isDarkTheme = (t: string) => byValue(t).dark;
export const DEFAULT_NIGHT = { start: "21:00", end: "06:00" };

const toMin = (hhmm: string | undefined, fallback: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "") ?? /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** True when the clock is inside the night-light window (which may cross midnight). */
export function isNightHours(s?: Pick<Settings, "nightStart" | "nightEnd">, d = new Date()) {
  const now = d.getHours() * 60 + d.getMinutes();
  const a = toMin(s?.nightStart, DEFAULT_NIGHT.start);
  const b = toMin(s?.nightEnd, DEFAULT_NIGHT.end);
  if (a === b) return false;
  return a < b ? now >= a && now < b : now >= a || now < b;
}

type ThemeInput = Pick<Settings, "theme" | "nightLight" | "nightLightAuto" | "nightStart" | "nightEnd">;

/** Light or dark underneath (the old "Night light" theme counts as dark). */
export const baseTheme = (s: Pick<Settings, "theme">): "light" | "dark" => (s.theme === "dark" || s.theme === "warm" ? "dark" : "light");
/** Is night light on right now (by hand, the old Night light theme, or the schedule)? */
export const nightLightOn = (s: ThemeInput) => s.theme === "warm" || !!s.nightLight || (!!s.nightLightAuto && isNightHours(s));

/**
 * The theme actually shown. With automatic night light, during the chosen hours a light theme
 * turns warm but stays light ("warmlight"), and a dark theme turns warm and dark ("warm").
 */
export function effectiveTheme(s: ThemeInput): ThemeName {
  const base = baseTheme(s);
  if (nightLightOn(s)) return base === "light" ? "warmlight" : "warm";
  return base;
}

export function applyTheme(s: ThemeInput) {
  const t = effectiveTheme(s);
  const root = document.documentElement;
  root.classList.toggle("dark", isDarkTheme(t));
  root.classList.toggle("warm", t === "warm");
  root.classList.toggle("warmlight", t === "warmlight");
  try {
    localStorage.setItem("slidequiz:appearance", effectiveTheme({ ...s, nightLightAuto: false }));
    localStorage.setItem("slidequiz:v7", "1");
    localStorage.setItem("slidequiz:nightauto", s.nightLightAuto ? "1" : "0");
    localStorage.setItem("slidequiz:nighttimes", `${s.nightStart ?? DEFAULT_NIGHT.start}-${s.nightEnd ?? DEFAULT_NIGHT.end}`);
  } catch {
    /* ignore */
  }
  return t;
}

/** Keeps <html> theme classes in sync with settings, re-checking the clock for automatic night light. */
export function useThemeSync(s: ThemeInput) {
  const [, tick] = useState(0);
  useEffect(() => {
    applyTheme(s);
    if (!s.nightLightAuto) return;
    const t = setInterval(() => {
      applyTheme(s);
      tick((n) => n + 1);
    }, 30_000);
    return () => clearInterval(t);
  }, [s.theme, s.nightLight, s.nightLightAuto, s.nightStart, s.nightEnd]);
}
