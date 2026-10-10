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

type Key = "flashcards" | "notes" | "essays";
type LastOpen = { flashcards?: string; notes?: string; essays?: string; at?: Partial<Record<Key, string>> };

/** The deck, lecture or essay this page is, if any (to remember it as the last one opened). */
export function openedItem(path: string): { key: Key; id: string } | null {
  for (const s of SECTIONS) {
    const m = s.re.exec(path);
    if (m) return { key: s.key, id: decodeURIComponent(m[1]) };
  }
  return null;
}

/**
 * Where a tab goes: Flashcards, Notes and Essays always open a deck, lecture or essay: the one used last, or one made
 * since then (the newest), or, if none has been opened yet, the newest one made. Only with none at all does it show the list.
 * Pressing the tab again while already in that section goes to the full list.
 */
export function navTarget(n: NavItem, path: string, last: LastOpen | undefined, items: (key: Key) => { id: string; createdAt: string }[]): string {
  const s = SECTIONS.find((x) => x.to === n.to);
  if (!s || n.match(path)) return n.to;
  const list = items(s.key);
  if (!list.length) return n.to;
  const newest = list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  const usedId = last?.[s.key];
  const used = usedId ? list.find((x) => x.id === usedId) : undefined;
  const usedAt = last?.at?.[s.key] ?? "";
  const pick = used && !(newest.createdAt > usedAt && newest.id !== used.id) ? used : newest;
  return `${n.to}/${encodeURIComponent(pick.id)}`;
}
