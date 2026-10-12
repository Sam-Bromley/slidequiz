/** A big moment shown in the middle of the screen: a new level, or the daily goal reached. */
export type Moment = { kind: "level"; from: number; to: number } | { kind: "goal"; goal: number };

export const MOMENT_EVENT = "slidequiz:moment";

export function showMoment(m: Moment) {
  if (typeof window === "undefined") return;
  // A moment after the answer that earned it, so it never gets in the way of seeing the result.
  setTimeout(() => window.dispatchEvent(new CustomEvent<Moment>(MOMENT_EVENT, { detail: m })), 700);
}
