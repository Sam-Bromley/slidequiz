import { ChartPie, House, Layers, Library, ListChecks, PenLine, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: House, match: (p) => p === "/" },
  { to: "/materials", label: "Notes", icon: Library, match: (p) => p.startsWith("/materials") || p.startsWith("/upload") || p.startsWith("/generate") || p.startsWith("/ask") },
  { to: "/flashcards", label: "Flashcards", icon: Layers, match: (p) => p.startsWith("/flashcards") },
  { to: "/questions", label: "Questions", icon: ListChecks, match: (p) => p.startsWith("/questions") || p.startsWith("/practice") },
  { to: "/essays", label: "Essays", icon: PenLine, match: (p) => p.startsWith("/essays") },
  { to: "/stats", label: "Stats", icon: ChartPie, match: (p) => p.startsWith("/stats") },
];

const SECTIONS = [
  { to: "/flashcards", key: "flashcards", re: /^\/flashcards\/([^/?#]+)/ },
  { to: "/materials", key: "notes", re: /^\/materials\/([^/?#]+)/ },
  { to: "/essays", key: "essays", re: /^\/essays\/([^/?#]+)/ },
] as const;

type LastOpen = { flashcards?: string; notes?: string; essays?: string };

/** The deck, lecture or essay this page is, if any (to remember it as the last one opened). */
export function openedItem(path: string): { key: keyof LastOpen; id: string } | null {
  for (const s of SECTIONS) {
    const m = s.re.exec(path);
    if (m) return { key: s.key, id: decodeURIComponent(m[1]) };
  }
  return null;
}

/**
 * Where a tab goes: Flashcards, Notes and Essays open the deck, lecture or essay used last (if it still exists).
 * Pressing the tab again while already in that section goes to the full list.
 */
export function navTarget(n: NavItem, path: string, last: LastOpen | undefined, exists: (key: keyof LastOpen, id: string) => boolean): string {
  const s = SECTIONS.find((x) => x.to === n.to);
  if (!s || n.match(path)) return n.to;
  const id = last?.[s.key];
  return id && exists(s.key, id) ? `${n.to}/${encodeURIComponent(id)}` : n.to;
}
