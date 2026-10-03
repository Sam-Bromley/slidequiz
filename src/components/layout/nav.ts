import { House, Layers, Library, ListChecks, PenLine, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: House, match: (p) => p === "/" },
  { to: "/materials", label: "My Materials", icon: Library, match: (p) => p.startsWith("/materials") || p.startsWith("/upload") || p.startsWith("/generate") || p.startsWith("/ask") },
  { to: "/flashcards", label: "Flashcards", icon: Layers, match: (p) => p.startsWith("/flashcards") },
  { to: "/questions", label: "Questions", icon: ListChecks, match: (p) => p.startsWith("/questions") || p.startsWith("/practice") },
  { to: "/essays", label: "Essays", icon: PenLine, match: (p) => p.startsWith("/essays") },
];
