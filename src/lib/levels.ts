/**
 * Levels earned with XP (10 XP for each multiple-choice question right, 10 XP for each mark on a written answer).
 * Each level needs a bit more XP than the one before.
 *
 * The names are placeholders: change them here. Level 1 is the first name, level 2 the second, and so on.
 * After the last name, levels keep counting up with the last name.
 */
export const LEVEL_NAMES = [
  "Cooked",
  "Barely awake",
  "Getting there",
  "Half decent",
  "Locked in",
  "Swotting",
  "Bookworm",
  "Brainbox",
  "Top of the class",
  "Scholar",
  "Mastermind",
  "Professor",
  "Genius",
  "Legend",
  "Untouchable",
];

/** XP to go from `level` to the next one: 200, then 350, 500, 650… (each level takes longer). */
export const xpForNext = (level: number) => 200 + (level - 1) * 150;

/**
 * Each level has its own colour, climbing from dull to bright to precious, so a higher level looks
 * (and feels) more earned. `light` → `mid` → `dark` make the gradient; `ink` is readable on it; `text`
 * is the colour for words and the floating "+10" (readable on white and on dark).
 */
export const LEVEL_COLOURS: { light: string; mid: string; dark: string; ink: string; text: string }[] = [
  { light: "#d6c3b0", mid: "#a8876b", dark: "#7a5b43", ink: "#ffffff", text: "#8a6a50" }, // 1 burnt toast
  { light: "#f3c9a0", mid: "#d98a4e", dark: "#b0602a", ink: "#ffffff", text: "#c06a2e" }, // 2 bronze
  { light: "#d9f99d", mid: "#84cc16", dark: "#4d7c0f", ink: "#ffffff", text: "#65a30d" }, // 3 lime
  { light: "#86efac", mid: "#22c55e", dark: "#15803d", ink: "#ffffff", text: "#16a34a" }, // 4 green
  { light: "#5eead4", mid: "#14b8a6", dark: "#0f766e", ink: "#ffffff", text: "#0d9488" }, // 5 teal
  { light: "#7dd3fc", mid: "#0ea5e9", dark: "#0369a1", ink: "#ffffff", text: "#0284c7" }, // 6 sky
  { light: "#93c5fd", mid: "#3b82f6", dark: "#1d4ed8", ink: "#ffffff", text: "#2563eb" }, // 7 blue
  { light: "#a5b4fc", mid: "#6366f1", dark: "#4338ca", ink: "#ffffff", text: "#4f46e5" }, // 8 indigo
  { light: "#c4b5fd", mid: "#8b5cf6", dark: "#6d28d9", ink: "#ffffff", text: "#7c3aed" }, // 9 violet
  { light: "#f0abfc", mid: "#d946ef", dark: "#a21caf", ink: "#ffffff", text: "#c026d3" }, // 10 magenta
  { light: "#f9a8d4", mid: "#ec4899", dark: "#be185d", ink: "#ffffff", text: "#db2777" }, // 11 pink
  { light: "#fca5a5", mid: "#ef4444", dark: "#b91c1c", ink: "#ffffff", text: "#dc2626" }, // 12 red
  { light: "#fdba74", mid: "#f97316", dark: "#c2410c", ink: "#ffffff", text: "#ea580c" }, // 13 orange
  { light: "#e5e7eb", mid: "#9ca3af", dark: "#4b5563", ink: "#ffffff", text: "#6b7280" }, // 14 platinum
  { light: "#ffe066", mid: "#fcc419", dark: "#e67700", ink: "#5c3800", text: "#f08c00" }, // 15+ gold
];
export const levelColour = (level: number) => LEVEL_COLOURS[Math.min(Math.max(1, level), LEVEL_COLOURS.length) - 1];

export function levelInfo(xp: number) {
  let level = 1;
  let left = Math.max(0, Math.floor(xp || 0));
  while (left >= xpForNext(level)) {
    left -= xpForNext(level);
    level++;
  }
  const next = xpForNext(level);
  return { level, name: levelName(level), into: left, next, pct: left / next };
}

export const levelName = (level: number) => LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1];
