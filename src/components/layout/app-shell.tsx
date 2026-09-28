import { Menu as MenuIcon, Search, Settings, Upload, X } from "lucide-react";
import { Personalise } from "./personalise";
import { AppBackground } from "./app-background";
import { useEffect, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Link, useLocation } from "@/lib/router";
import { effectiveTheme, isDarkTheme } from "@/lib/theme";
import { setUI } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { useData } from "@/store/store";
import { Logo, LogoMark } from "./logo";
import { NAV } from "./nav";

function Sidebar() {
  const { path } = useLocation();
  const data = useData();
  const recent = [...data.materials].sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)).slice(0, 8);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r bg-background/45 backdrop-blur-xl lg:flex" aria-label="Sidebar">
      <div className="flex h-14 items-center px-4">
        <Link to="/" className="rounded-md focus-ring" aria-label="SlideQuiz home">
          <Logo />
        </Link>
      </div>
      <nav className="px-2.5" aria-label="Main" data-no-bounce>
        <ul className="space-y-px">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors focus-ring", active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                >
                  <n.icon className="size-[18px]" />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {recent.length > 0 && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 scrollbar-thin" data-no-bounce>
          <p className="px-2.5 pb-1.5 text-[12px] font-medium text-muted-foreground">Recent</p>
          <ul className="space-y-px">
            {recent.map((m) => {
              const active = path === `/materials/${m.id}`;
              return (
                <li key={m.id}>
                  <Link to={`/materials/${m.id}`} className={cn("block truncate rounded-lg px-2.5 py-2 text-[13.5px] transition-colors focus-ring", active ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent")}>
                    {m.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

function SettingsButton() {
  const { path } = useLocation();
  const on = path.startsWith("/settings");
  return (
    <Link to="/settings" aria-label="Settings" title="Settings" aria-current={on ? "page" : undefined} className={cn(buttonClass("ghost", "icon"), on && "bg-accent text-foreground")}>
      <Settings />
    </Link>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 bg-background/40 px-3 backdrop-blur-xl lg:hidden" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <Link to="/" className="mr-auto rounded-md focus-ring" aria-label="SlideQuiz home">
        <Logo />
      </Link>
      <Button variant="ghost" size="icon" aria-label="Search" onClick={() => setUI({ command: true })}>
        <Search />
      </Button>
      <Personalise />
      <SettingsButton />
      <Button variant="ghost" size="icon" aria-label="Open menu" onClick={onMenu}>
        <MenuIcon />
      </Button>
    </header>
  );
}

const MOBILE_TABS = NAV;

function BottomNav() {
  const { path } = useLocation();
  return (
    <nav data-no-bounce className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/70 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Primary">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-3">
        {MOBILE_TABS.map((n) => {
          const active = n.match(path);
          return (
            <li key={n.to} className="flex">
              <Link
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors focus-ring rounded-lg", active ? "text-primary" : "text-muted-foreground")}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <n.icon className="size-[19px]" />
                </span>
                {n.label.replace("My ", "")}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { path } = useLocation();
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[82%] max-w-xs animate-fade-in flex-col border-l bg-background p-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
        <div className="mb-4 flex items-center justify-between">
          <LogoMark className="size-7" />
          <Button variant="ghost" size="icon" aria-label="Close menu" onClick={onClose} data-autofocus>
            <X />
          </Button>
        </div>
        <Link to="/upload" className={buttonClass("default", "lg", "mb-3 w-full")}>
          <Upload /> Upload material
        </Link>
        <nav aria-label="All pages" data-no-bounce>
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <Link to={n.to} aria-current={n.match(path) ? "page" : undefined} className={cn("flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium focus-ring", n.match(path) ? "bg-accent text-foreground" : "text-muted-foreground")}>
                  <n.icon className="size-5" />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function AppShell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const [drawer, setDrawer] = useState(false);
  const data = useData();
  const bg = <AppBackground scene={data.settings.scene ?? "none"} dark={isDarkTheme(effectiveTheme(data.settings))} />;
  if (bare)
    return (
      <div className="min-h-[100dvh]">
        {bg}
        {children}
      </div>
    );
  return (
    <div className="min-h-[100dvh]">
      {bg}
      <a href="#main" className="sr-only z-[100] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Sidebar />
      <MobileTopBar onMenu={() => setDrawer(true)} />
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <div className="lg:pl-[248px]">
        <div className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-1 px-4 lg:flex">
          <Button variant="ghost" size="icon" aria-label="Search" title="Search (Ctrl K)" onClick={() => setUI({ command: true })}>
            <Search />
          </Button>
          <Personalise />
          <SettingsButton />
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-16 lg:pt-2">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
