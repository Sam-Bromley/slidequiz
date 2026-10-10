import { ArrowRight, Download, X } from "lucide-react";
import { useState } from "react";
import { promptInstall, useInstallState } from "@/lib/install";
import { lecturesLeft, useAllowance } from "@/services/ai/cloud";
import { PLUS, PLUS_ON } from "@/services/plus";
import { Link } from "@/lib/router";
import { useData } from "@/store/store";

/** Home for someone who already has lectures: only small, occasional nudges (low credits, add to home screen). */
export function Today() {
  const data = useData();
  if (!data.materials.length) return null;
  return (
    <div className="mt-6 space-y-3 empty:hidden">
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
