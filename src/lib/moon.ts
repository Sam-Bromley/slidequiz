/**
 * The Moon's phase right now: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
 * Uses the average length of a lunar month from a known new moon (6 Jan 2000, 18:14 UTC),
 * which is within a few hours of the real times: plenty for a picture.
 */
const LUNAR_MONTH = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(at = new Date()): number {
  const days = (at.getTime() - KNOWN_NEW_MOON) / 86_400_000;
  return (((days % LUNAR_MONTH) + LUNAR_MONTH) % LUNAR_MONTH) / LUNAR_MONTH;
}

export function moonPhaseName(p: number): string {
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(p * 8) % 8];
}

/**
 * SVG path for the lit part of a moon of radius r (drawn in a 2r × 2r box), as seen from
 * England: while it grows (waxing) the right side is lit, while it shrinks the left.
 */
export function moonLitPath(p: number, r: number): string {
  const k = Math.cos(2 * Math.PI * p); // 1 at new moon, -1 at full
  const rx = Math.abs(k) * r;
  const waxing = p < 0.5;
  // Outer edge of the lit side, from the top to the bottom.
  const limb = `M ${r} 0 A ${r} ${r} 0 0 ${waxing ? 1 : 0} ${r} ${2 * r}`;
  // Back up to the top along the line between light and dark.
  const crescent = k > 0;
  const sweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  return `${limb} A ${rx} ${r} 0 0 ${sweep} ${r} 0 Z`;
}
