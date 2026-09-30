import { Coffee, Pause, Play, SkipForward, Square, Timer } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Study timer (Pomodoro): focus for a set time, then a short break, and round again.
 * Kept in this browser (localStorage), so it carries on through page changes and reloads.
 */
interface TimerState {
  phase: "focus" | "break";
  focusMin: number;
  breakMin: number;
  /** When the current phase ends (ms), while running. */
  endsAt: number | null;
  /** Time left (ms) while paused. */
  left: number | null;
  /** Focus sessions finished. */
  done: number;
}

const KEY = "slidequiz:timer";
const listeners = new Set<() => void>();
let state: TimerState | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
})();
const set = (s: TimerState | null) => {
  state = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
};
const useTimerState = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );

const PRESETS: [number, number][] = [
  [25, 5],
  [50, 10],
  [15, 3],
];

function chime(times = 2) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = i % 2 ? 660 : 880;
      const t = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    }
    setTimeout(() => ctx.close(), 1600);
  } catch {
    /* no sound available */
  }
}

function notify(title: string, body: string) {
  toast(title, { description: body });
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification(title, { body, icon: "icon-192.png" });
  } catch {
    /* notifications blocked */
  }
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function startTimer(focusMin: number, breakMin: number) {
  try {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  } catch {
    /* ignore */
  }
  set({ phase: "focus", focusMin, breakMin, endsAt: Date.now() + focusMin * 60_000, left: null, done: 0 });
}

function nextPhase(s: TimerState, sound = true) {
  const toBreak = s.phase === "focus";
  const mins = toBreak ? s.breakMin : s.focusMin;
  if (sound) {
    chime(toBreak ? 2 : 3);
    notify(toBreak ? "Time for a break" : "Back to it!", toBreak ? `Nice work. Take ${s.breakMin} minutes.` : `${s.focusMin} minutes of focus. You've got this.`);
  }
  set({ ...s, phase: toBreak ? "break" : "focus", endsAt: Date.now() + mins * 60_000, left: null, done: s.done + (toBreak ? 1 : 0) });
}

/** The button in the top bar: set up and start a timer. */
export function StudyTimerButton() {
  const s = useTimerState();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(s?.focusMin ?? 25);
  const [brk, setBrk] = useState(s?.breakMin ?? 5);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const clampMin = (n: number, max: number) => Math.max(1, Math.min(max, Math.round(n) || 1));
  return (
    <div ref={wrap} className="relative">
      <Button variant="ghost" size="icon" aria-label="Study timer" title="Study timer" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(s && "text-primary")}>
        <Timer />
      </Button>
      {open && (
        <div role="dialog" aria-label="Study timer" className="absolute right-0 top-full z-50 mt-2 w-[272px] animate-scale-in rounded-2xl border bg-popover p-4 text-popover-foreground shadow-pop">
          <p className="text-[14px] font-semibold">Study timer</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Focus, then a short break, and repeat.</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {PRESETS.map(([f, b]) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFocus(f);
                  setBrk(b);
                }}
                className={cn("rounded-lg border py-2 text-[12.5px] font-medium transition-colors focus-ring", focus === f && brk === b ? "border-foreground/40 bg-accent" : "hover:bg-accent")}
              >
                {f} / {b}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
            <label className="space-y-1">
              <span className="text-muted-foreground">Focus (min)</span>
              <input type="number" min={1} max={180} value={focus} onChange={(e) => setFocus(clampMin(Number(e.target.value), 180))} className="h-9 w-full rounded-lg border bg-background px-2.5 text-[14px] focus-ring" />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Break (min)</span>
              <input type="number" min={1} max={60} value={brk} onChange={(e) => setBrk(clampMin(Number(e.target.value), 60))} className="h-9 w-full rounded-lg border bg-background px-2.5 text-[14px] focus-ring" />
            </label>
          </div>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              startTimer(focus, brk);
              setOpen(false);
            }}
          >
            <Play /> {s ? "Restart" : "Start"}
          </Button>
          {s && (
            <Button variant="ghost" className="mt-1 w-full text-muted-foreground" onClick={() => (set(null), setOpen(false))}>
              <Square /> Stop timer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The small timer in the corner while it's running. */
export function StudyTimerPill() {
  const s = useTimerState();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => {
      const cur = state;
      if (cur?.endsAt && cur.endsAt <= Date.now()) nextPhase(cur, Date.now() - cur.endsAt < 60_000);
      tick((n) => n + 1);
    }, 500);
    return () => clearInterval(t);
  }, [!!s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const left = s.endsAt ? s.endsAt - Date.now() : s.left ?? 0;
  const total = (s.phase === "focus" ? s.focusMin : s.breakMin) * 60_000;
  const pct = Math.max(0, Math.min(1, 1 - left / total));
  const paused = !s.endsAt;
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] right-3 z-40 flex animate-fade-up items-center gap-1 rounded-full border bg-background/85 py-1 pl-1.5 pr-1 shadow-pop backdrop-blur-xl lg:bottom-5 lg:right-5"
      role="timer"
      aria-label={`${s.phase === "focus" ? "Focus" : "Break"}: ${fmt(left)} left`}
    >
      <span className="relative grid size-8 place-items-center">
        <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className={s.phase === "focus" ? "stroke-brand" : "stroke-success"} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
        </svg>
        {s.phase === "focus" ? <Timer className="size-3.5" /> : <Coffee className="size-3.5 text-success" />}
      </span>
      <span className="min-w-[46px] px-1 text-[14px] font-semibold tabular-nums">{fmt(left)}</span>
      <span className="hidden pr-1 text-[12px] text-muted-foreground sm:inline">{s.phase === "focus" ? "Focus" : "Break"}</span>
      <button
        type="button"
        className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-ring"
        aria-label={paused ? "Resume" : "Pause"}
        title={paused ? "Resume" : "Pause"}
        onClick={() => (paused ? set({ ...s, endsAt: Date.now() + (s.left ?? 0), left: null }) : set({ ...s, left: (s.endsAt ?? Date.now()) - Date.now(), endsAt: null }))}
      >
        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
      <button type="button" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" aria-label={s.phase === "focus" ? "Skip to break" : "Skip break"} title={s.phase === "focus" ? "Skip to break" : "Skip break"} onClick={() => nextPhase(s, false)}>
        <SkipForward className="size-4" />
      </button>
      <button type="button" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" aria-label="Stop timer" title="Stop timer" onClick={() => set(null)}>
        <Square className="size-3.5" />
      </button>
    </div>
  );
}
