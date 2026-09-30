/** A soft, stable colour (a hue) for each subject name, so cards are easy to tell apart. */
const HUES = [212, 152, 262, 330, 24, 190, 45, 0, 285, 120];

export function subjectHue(subject: string): number | null {
  const s = subject.trim().toLowerCase();
  if (!s || s === "general") return null;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
