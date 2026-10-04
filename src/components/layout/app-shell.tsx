import { Gift, Settings, Upload, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CreditsDialogHost } from "@/components/account/credits-dialog";
import { openEarnCredits } from "@/services/invites";
import { Personalise } from "./personalise";
import { AppBackground } from "./app-background";
import { StreakFlame } from "./streak";
import { StudyTimerButton, StudyTimerPill } from "./study-timer";
import { actions } from "@/store/actions";
import { applyFont, TEXT_ZOOM } from "@/lib/reading";
import { usePlan, usePlanQuiet } from "@/services/plus";
import { useBackgroundPhotoUrl } from "@/services/background-photo";
import { useEffect, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Link, useLocation } from "@/lib/router";
import { effectiveTheme, isDarkTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useData } from "@/store/store";
import { Logo, LogoMark } from "./logo";
import { NAV } from "./nav";

const SB_DEFAULT = 248;
const SB_MIN = 68;
/** It never gets wider than the normal size. */
const SB_MAX = SB_DEFAULT;
/** Below this width the sidebar shows icons only. */
const SB_COMPACT = 150;

function Sidebar() {
  const { path } = useLocation();
  const data = useData();
  const pro = usePlanQuiet().plus;
  const saved = Math.min(SB_MAX, data.settings.sidebarWidth ?? SB_DEFAULT);
  const [live, setLive] = useState<number | null>(null);
  const width = live ?? saved;
  const compact = width < SB_COMPACT;
  // 0 at icons only, 1 at the normal size: everything slides and fades between the two.
  const t = Math.max(0, Math.min(1, (width - SB_MIN) / (SB_DEFAULT - SB_MIN)));
  const labels = Math.max(0, Math.min(1, (width - 112) / 60));

  // Drag the right edge to resize, anywhere from icons only up to the normal size.
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    document.documentElement.classList.add("sb-dragging");
    document.body.style.cursor = "ew-resize";
    let last = w0;
    let frame = 0;
    const move = (ev: PointerEvent) => {
      // Follows the pointer smoothly, and stops at the normal size and at icons only.
      const next = Math.max(SB_MIN, Math.min(SB_MAX, w0 + ev.clientX - x0));
      if (next === last) return;
      last = next;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setLive(last);
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.classList.remove("sb-dragging");
      document.body.style.cursor = "";
      cancelAnimationFrame(frame);
      const final = Math.round(last);
      actions.updateSettings({ sidebarWidth: final });
      setLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--sb", `${data.settings.sidebarHidden ? 0 : width}px`);
  }, [width, data.settings.sidebarHidden]);

  if (data.settings.sidebarHidden)
    return (
      <button
        type="button"
        onClick={() => actions.updateSettings({ sidebarHidden: false })}
        className="fixed left-3 top-3 z-30 hidden size-9 place-items-center rounded-lg border bg-background/70 text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:text-foreground focus-ring lg:grid"
        aria-label="Show sidebar"
        title="Show sidebar"
      >
        <PanelLeftOpen className="size-[18px]" />
      </button>
    );

  return (
    <aside className="sb-anim fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-background/45 backdrop-blur-xl lg:flex" style={{ width }} aria-label="Sidebar">
      <div className="group/sb relative flex h-14 items-center overflow-hidden" style={{ paddingLeft: 16 + 6 * (1 - t) }}>
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded-md focus-ring" aria-label="SlideQuiz home">
          <LogoMark className="size-6 shrink-0" />
          <span className="flex items-center gap-2 whitespace-nowrap" style={{ opacity: labels }} aria-hidden={labels < 0.5}>
            <span className="text-[16px] font-bold tracking-[-0.025em] text-foreground">SlideQuiz</span>
            {pro && <span className="pro-gold pro-badge rounded-md text-[10px] font-bold uppercase leading-none tracking-wider" style={{ opacity: Math.max(0, Math.min(1, (width - 196) / 30)) }}>Pro</span>}
          </span>
        </Link>
        {labels > 0.95 && (
          <button
            type="button"
            onClick={() => actions.updateSettings({ sidebarHidden: true })}
            className="absolute right-3 grid size-8 place-items-center rounded-md bg-background/60 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-ring focus-visible:opacity-100 group-hover/sb:opacity-100"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <PanelLeftClose className="size-[18px]" />
          </button>
        )}
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
                  title={compact ? n.label : undefined}
                  className={cn("flex h-9 items-center gap-2.5 overflow-hidden rounded-lg pr-2.5 text-[14px] transition-colors focus-ring", active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  style={{ paddingLeft: 10 + 5 * (1 - t) }}
                >
                  <n.icon className="size-[18px] shrink-0" />
                  <span className="whitespace-nowrap" style={{ opacity: labels }}>
                    {n.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={() => actions.updateSettings({ sidebarHidden: true })}
        className={cn("mb-3 mt-auto grid size-9 place-items-center self-center rounded-lg text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-ring", labels > 0.95 && "pointer-events-none")}
        style={{ opacity: 1 - labels }}
        tabIndex={labels > 0.95 ? -1 : 0}
        aria-hidden={labels > 0.95}
        aria-label="Hide sidebar"
        title="Hide sidebar"
      >
        <PanelLeftClose className="size-[18px]" />
      </button>
      {/* Drag to resize; double-click to reset. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize · double-click to reset"
        onPointerDown={startDrag}
        onDoubleClick={() => actions.updateSettings({ sidebarWidth: SB_DEFAULT })}
        className="absolute -right-1 inset-y-0 w-2 cursor-ew-resize touch-none transition-colors hover:bg-foreground/10"
      />
    </aside>
  );
}

/** "Free credits": opens the list of ways to get more. */
function FreeCreditsButton() {
  return (
    <button type="button" onClick={openEarnCredits} title="Free credits" aria-label="Free credits" className={cn(buttonClass("ghost", "sm"), "h-9 gap-1.5 rounded-full px-2.5 sm:px-3")}>
      <Gift className="size-[18px] text-primary" />
      <span className="hidden text-[13.5px] font-medium sm:inline">Free credits</span>
    </button>
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

function MobileTopBar(_: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 bg-background/40 px-3 backdrop-blur-xl lg:hidden" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <Link to="/" className="mr-auto rounded-md focus-ring" aria-label="SlideQuiz home">
        <Logo pro={usePlanQuiet().plus} />
      </Link>
      <FreeCreditsButton />
      <StreakFlame />
          <StudyTimerButton />
          <Personalise />
      <SettingsButton />
    </header>
  );
}

const MOBILE_TABS = NAV;

function BottomNav() {
  const { path } = useLocation();
  return (
    <nav data-no-bounce className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/70 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Primary">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
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
  // Pro members' own photo (only while they have Pro, and only on the device it was added on).
  const plan = usePlan();
  const photoUrl = useBackgroundPhotoUrl(plan.plus && data.settings.bgPhotoOn ? data.settings.bgPhoto : undefined);
  // Reading font and size (Settings → Appearance).
  const zoom = TEXT_ZOOM[data.settings.textSize ?? "default"] ?? 1;
  useEffect(() => applyFont(data.settings.font), [data.settings.font]);
  // Pro accent colour on the whole page (only while they have Pro).
  const accent = plan.plus && data.settings.accent && data.settings.accent !== "default" ? data.settings.accent : null;
  useEffect(() => {
    const cl = document.documentElement.classList;
    for (const c of [...cl]) if (c.startsWith("accent-")) cl.remove(c);
    if (accent) cl.add(`accent-${accent}`);
    try {
      localStorage.setItem("slidequiz:accent", accent ?? "");
    } catch {
      /* storage blocked */
    }
  }, [accent]);
  const bg = <AppBackground scene={data.settings.scene ?? "none"} dark={isDarkTheme(effectiveTheme(data.settings))} photo={photoUrl} />;
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
      <StudyTimerPill />
      <MobileTopBar onMenu={() => setDrawer(true)} />
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <div className="sb-anim lg:pl-[var(--sb,248px)]">
        <div className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-1 px-4 lg:flex">
          <div className="topbar-tools flex items-center gap-1">
            <FreeCreditsButton />
            <StreakFlame />
            <StudyTimerButton />
            <Personalise />
            <SettingsButton />
          </div>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-16 lg:pt-2" style={zoom !== 1 ? { zoom } : undefined}>
          {children}
        </main>
      </div>
      <BottomNav />
      <CreditsDialogHost />
    </div>
  );
}
