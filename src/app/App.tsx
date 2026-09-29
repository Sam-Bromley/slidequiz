import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CommandMenu, ShortcutsDialog } from "@/components/layout/command-menu";
import { StartQuizDialog } from "@/components/quiz/start-quiz-dialog";
import { toast, Toaster } from "@/components/ui/toast";
import { matchPath, navigate, useLocation } from "@/lib/router";
import { useThemeSync } from "@/lib/theme";
import { setUI } from "@/lib/ui";
import { onPersistError, useData } from "@/store/store";
import { AskPage } from "@/pages/ask";
import { DeckPage, FlashcardsPage } from "@/pages/flashcards";
import { GeneratePage } from "@/pages/generate";
import { HistoryPage } from "@/pages/history";
import { HomePage } from "@/pages/home";
import { MaterialDetailPage } from "@/pages/material-detail";
import { MaterialsPage } from "@/pages/materials";
import { NotFound } from "@/pages/not-found";
import { QuestionBankPage } from "@/pages/question-bank";
import { QuizPage } from "@/pages/quiz";
import { QuizResultsPage } from "@/pages/quiz-results";
import { SettingsPage } from "@/pages/settings";
import { StudyPage } from "@/pages/study";
import { UploadPage } from "@/pages/upload";
import { MixedPracticePage } from "@/pages/practice";
import { PrivacyPage } from "@/pages/privacy";

type Route = { pattern: string; render: (p: Record<string, string>) => React.ReactNode; bare?: boolean };

const ROUTES: Route[] = [
  { pattern: "/", render: () => <HomePage /> },
  { pattern: "/materials", render: () => <MaterialsPage /> },
  { pattern: "/materials/:id", render: (p) => <MaterialDetailPage id={p.id} /> },
  { pattern: "/upload", render: () => <UploadPage /> },
  { pattern: "/practice", render: () => <MixedPracticePage /> },
  { pattern: "/privacy", render: () => <PrivacyPage /> },
  { pattern: "/generate", render: () => <GeneratePage /> },
  { pattern: "/questions", render: () => <QuestionBankPage /> },
  { pattern: "/flashcards", render: () => <FlashcardsPage /> },
  { pattern: "/flashcards/:id", render: (p) => <DeckPage key={p.id} id={p.id} /> },
  { pattern: "/study", render: () => <StudyPage /> },
  { pattern: "/quiz/:id", render: (p) => <QuizPage id={p.id} />, bare: true },
  { pattern: "/quiz/:id/results", render: (p) => <QuizResultsPage id={p.id} /> },
  { pattern: "/history", render: () => <HistoryPage /> },
  { pattern: "/ask", render: () => <AskPage /> },
  { pattern: "/settings", render: () => <SettingsPage /> },
];

/** Tiny bit of life: anything you click gives a little bounce (its icon hops, or the control squishes). */
function useClickBounce() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("button, a, [role=radio], [role=tab], [role=switch], [role=checkbox]");
      if (!el || el.closest("[data-no-bounce]")) return;
      const icon = el.querySelector<SVGElement>(":scope > svg, :scope > span > svg");
      const target: Element = icon ?? el;
      if (!icon && /\banimate-/.test(el.className)) return; // already animating (e.g. answer feedback)
      const cls = icon ? "animate-boop" : "animate-press";
      target.classList.remove(cls);
      void (target as HTMLElement).getBoundingClientRect?.();
      target.classList.add(cls);
      target.addEventListener("animationend", () => target.classList.remove(cls), { once: true });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t.closest("input,textarea,select,[contenteditable]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUI({ command: true });
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setUI({ command: true });
      } else if (e.key === "?") setUI({ shortcuts: true });
      else if (e.key.toLowerCase() === "u" && !location.hash.startsWith("#/quiz") && !location.hash.includes("review")) navigate("/upload");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const data = useData();
  const { path } = useLocation();
  useThemeSync(data.settings);
  useGlobalShortcuts();
  useClickBounce();
  useEffect(() => {
    const off = onPersistError((msg) => toast.error("Couldn't save", { description: msg }));
    return () => void off();
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [path]);

  let match: { route: Route; params: Record<string, string> } | null = null;
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, path);
    if (params) {
      match = { route: r, params };
      break;
    }
  }

  return (
    <>
      <AppShell bare={match?.route.bare}>
        <div key={path} className="animate-fade-up">
          {match ? match.route.render(match.params) : <NotFound />}
        </div>
      </AppShell>
      <CommandMenu />
      <ShortcutsDialog />
      <StartQuizDialog />
      <Toaster />
    </>
  );
}
