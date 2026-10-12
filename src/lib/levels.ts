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

/** XP to go from `level` to the next one: 100, then 150, 200, 250… */
export const xpForNext = (level: number) => 100 + (level - 1) * 50;

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
