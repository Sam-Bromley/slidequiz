/** Applies the student's reading font (loading it the first time) and text size. */
import type { Settings } from "@/types/models";

const FONT_CSS: Record<string, string> = {
  readable: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap",
  dyslexic: "https://cdnjs.cloudflare.com/ajax/libs/fontsource-opendyslexic/5.3.0/index.css",
};

export const TEXT_ZOOM: Record<NonNullable<Settings["textSize"]>, number> = { small: 0.92, default: 1, large: 1.1, xl: 1.22 };

export function applyFont(font: Settings["font"]) {
  const cl = document.documentElement.classList;
  cl.remove("font-readable", "font-dyslexic");
  if (!font || font === "default") return;
  const href = FONT_CSS[font];
  if (href && !document.querySelector(`link[data-font="${font}"]`)) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.font = font;
    document.head.appendChild(l);
  }
  cl.add(`font-${font}`);
}
