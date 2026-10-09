import { ArrowRight, CalendarDays, History, Download, X } from "lucide-react";
import { useState } from "react";
import { promptInstall, useInstallState } from "@/lib/install";
import { lecturesLeft, useAllowance } from "@/services/ai/cloud";
import { PLUS, PLUS_ON } from "@/services/plus";
import { Link } from "@/lib/router";
import { madeAgo, reviewStatus } from "@/lib/reviews";
import { relativeTime } from "@/lib/utils";
import { useData } from "@/store/store";

/** Home for someone who already has lectures: what's due a review today, and where they left off. */
export function Today() {
  const data = useData();
  const rows = data.materials.map((m) => ({ m, s: reviewStatus(data, m) }));
  const due = rows.filter((r) => r.s.due).sort((a, b) => a.s.ready - b.s.ready);
  const upcoming = rows.filter((r) => !r.s.due && r.s.nextIn !== null).sort((a, b) => a.s.nextIn! - b.s.nextIn!)[0];
  const last = data.lastVisit;
  const showLast = last && last.path !== "/" && Date.now() - Date.parse(last.at) < 7 * 86400000;
  if (!rows.length) return null;

  return (
    <div className="mt-6 space-y-3">

      <section aria-labelledby="today-h" className="rounded-2xl border bg-card p-4">
        <h2 id="today-h" className="flex items-center gap-2 text-[14.5px] font-semibold">
          <CalendarDays className="size-[18px] text-muted-foreground" />
          {due.length ? `Due for review today (${due.length})` : "Nothing due today"}
        </h2>
        {due.length ? (
          <>
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">A few minutes on each now, just as they start to fade, makes them stick for much longer.</p>
            <ul className="mt-3 space-y-1.5">
              {due.slice(0, 4).map(({ m, s }) => (
                <li key={m.id}>
                  <Link to={`/questions?m=${m.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent focus-ring">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{m.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                        {madeAgo(s.age)} · {s.ready}% exam ready
                      </span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(3, s.ready)}%` }} />
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-[12.5px] font-semibold text-background">Review</span>
                  </Link>
                </li>
              ))}
            </ul>
            {due.length > 4 && <p className="mt-2 px-2 text-[12.5px] text-muted-foreground">And {due.length - 4} more in Notes.</p>}
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {upcoming ? (
              <>
                Next up: <span className="font-medium text-foreground">{upcoming.m.title}</span> {upcoming.s.nextIn === 1 ? "tomorrow" : `in ${upcoming.s.nextIn} days`}. You can still practise any time.
              </>
            ) : (
              "You're up to date. Practise any time, or add a new lecture."
            )}
          </p>
        )}
      </section>
      {showLast && (
        <Link to={last.path} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:border-foreground/25 focus-ring">
          <History className="size-[18px] shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-muted-foreground">Pick up where you left off · {relativeTime(last.at)}</span>
            <span className="block truncate text-[14.5px] font-medium">{last.label}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <CreditsNudge />
      <InstallNudge />
    </div>
  );
}

const NUDGE_KEY = "slidequiz:install-nudge";

/** After their first lecture: put SlideQuiz on the home screen, so it's one tap away (and a daily reminder). */
function InstallNudge() {
  const state = useInstallState();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(NUDGE_KEY) === "no";
    } catch {
      return true;
    }
  });
  if (hidden || (state !== "prompt" && state !== "ios")) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(NUDGE_KEY, "no");
    } catch {
      /* storage blocked */
    }
  };
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card px-4 py-3">
      <Download className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">Add SlideQuiz to your home screen</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          {state === "ios" ? (
            <>
              Tap the Share button in Safari, then <b>Add to Home Screen</b>. It opens like an app.
            </>
          ) : (
            "It opens like an app, one tap away when you want to revise."
          )}
        </p>
        {state === "prompt" && (
          <button type="button" onClick={() => promptInstall().then(close)} className="mt-2 rounded-full bg-foreground px-3 py-1.5 text-[12.5px] font-semibold text-background focus-ring">
            Add to home screen
          </button>
        )}
      </div>
      <button type="button" onClick={close} aria-label="Hide" className="-mr-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-ring">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Running low on free credits: say so before they run out, with what Pro gives. */
function CreditsNudge() {
  const a = useAllowance();
  if (!PLUS_ON || !a || a.plan !== "free" || a.eligible === false) return null;
  const left = lecturesLeft(a);
  if (left > 3) return null;
  return (
    <Link to="/pro" className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:border-foreground/25 focus-ring">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{left === 0 ? "You've used this month's free credits" : `${left} free ${left === 1 ? "credit" : "credits"} left this month`}</span>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">Pro gives you {PLUS.plusLectures} a month, plus notes from lecture recordings, for {PLUS.price} a {PLUS.period}.</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
