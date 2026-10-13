import { useEffect, useState } from "react";
import { fanfare } from "@/lib/celebrate";
import { levelColour, levelName } from "@/lib/levels";
import { getState } from "@/store/store";
import { MOMENT_EVENT as EVENT, type Moment } from "@/lib/moments";

/** Lives once at the top of the app. Moments that arrive together are shown one after the other. */
export function BigMoments() {
  const [queue, setQueue] = useState<{ id: number; m: Moment }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => setQueue((q) => [...q, { id: ++n, m: (e as CustomEvent<Moment>).detail }]);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const first = queue[0];
  if (!first) return null;
  // Keyed by its own id, so another moment arriving meanwhile doesn't restart this one.
  return <MomentCard key={first.id} m={first.m} onDone={() => setQueue((q) => q.slice(1))} />;
}

function MomentCard({ m, onDone }: { m: Moment; onDone: () => void }) {
  // 0: just appeared, 1: the level number turns over, 2: leaving.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const sound = getState().settings.soundEffects !== false;
    const t1 = setTimeout(() => {
      setPhase(1);
      if (sound) fanfare();
    }, m.kind === "level" ? 650 : 150);
    const t2 = setTimeout(() => setPhase(2), m.kind === "level" ? 3300 : 2600);
    const t3 = setTimeout(onDone, m.kind === "level" ? 3650 : 2950);
    return () => [t1, t2, t3].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    setPhase(2);
    setTimeout(onDone, 300);
  };

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={close}
      className="fixed inset-0 z-[70] grid cursor-pointer place-items-center bg-background/40 px-6 backdrop-blur-[3px] transition-opacity duration-300"
      style={{ opacity: phase === 2 ? 0 : 1 }}
    >
      <div className="w-full max-w-[320px] animate-praise rounded-3xl border bg-card px-8 py-8 text-center shadow-pop">
        {m.kind === "level" ? (
          <>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Level up!</p>
            <p className="mt-3 text-[13px] font-medium text-muted-foreground">Level</p>
            {/* The old number rolls up and away as the new one rolls in. */}
            <div className="relative mx-auto h-[84px] w-full overflow-hidden" aria-label={`Level ${m.to}`}>
              <span
                className="absolute inset-x-0 top-0 text-[76px] font-extrabold leading-[84px] tabular-nums transition-[transform,opacity] duration-500 ease-[cubic-bezier(.3,.7,.3,1)]"
                style={{ transform: phase >= 1 ? "translateY(-100%)" : "none", opacity: phase >= 1 ? 0 : 1 }}
              >
                {m.from}
              </span>
              <span
                className="absolute inset-x-0 top-0 bg-clip-text text-[76px] font-extrabold leading-[84px] tabular-nums text-transparent transition-[transform,opacity] duration-500 ease-[cubic-bezier(.3,.7,.3,1.3)]"
                style={{ transform: phase >= 1 ? "none" : "translateY(100%)", opacity: phase >= 1 ? 1 : 0, backgroundImage: `linear-gradient(180deg, ${levelColour(m.to).light} 0%, ${levelColour(m.to).mid} 45%, ${levelColour(m.to).dark} 100%)` }}
              >
                {m.to}
              </span>
            </div>
            <p className="mt-2 text-[20px] font-bold transition-opacity duration-500" style={{ opacity: phase >= 1 ? 1 : 0 }}>
              {levelName(m.to)}
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto text-[64px] leading-none" aria-hidden>
              🎯
            </div>
            <p className="mt-4 text-[24px] font-extrabold leading-tight">Daily goal reached!</p>
            <p className="mt-1.5 text-[14px] text-muted-foreground">{m.goal} things revised today. Anything more is a bonus.</p>
          </>
        )}
        <p className="mt-5 text-[12px] text-muted-foreground">Tap to carry on</p>
      </div>
    </div>
  );
}
