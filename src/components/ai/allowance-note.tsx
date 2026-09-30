import { useState } from "react";
import { AuthDialog } from "@/components/account/auth-dialog";
import { Link } from "@/lib/router";
import { fits, lecturesFor, lecturesLeft, lecturesText, textSize, useAllowance, type Allowance } from "@/services/ai/cloud";
import type { Material } from "@/types/models";
import { PLUS_ON } from "@/services/plus";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const resetDate = (a: Allowance) => (a.resets ? new Date(a.resets).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "");

/** "Where it's from" for the lectures left: to try, this month, or this month on Plus. */
export function leftText(a: Allowance) {
  const left = lecturesLeft(a);
  if (a.plan === "guest") return `${plural(left, "credit")} left to try`;
  return `${plural(left, "credit")} left this month`;
}

/** What to do when there aren't enough lectures left. `fewer`: also suggest choosing fewer slides. */
export function UpgradeHint({ a, fewer }: { a: Allowance; fewer?: boolean }) {
  const [auth, setAuth] = useState(false);
  const link = "font-medium text-foreground underline underline-offset-2";
  if (a.plan === "guest")
    return (
      <>
        {fewer && "Choose fewer slides, or "}
        <button type="button" className={link} onClick={() => setAuth(true)}>
          {fewer ? "make" : "Make"} a free account
        </button>{" "}
        to get 10 a month.
        {auth && <AuthDialog initial="signup" onClose={() => setAuth(false)} />}
      </>
    );
  if (a.plan === "free" && !PLUS_ON)
    return (
      <>
        {fewer && "Choose fewer slides. "}Free credits reset on {resetDate(a)}.
      </>
    );
  if (a.plan === "free")
    return (
      <>
        {fewer && "Choose fewer slides, or "}
        <Link to="/pro" className={link}>
          {fewer ? "get" : "Get"} Pro
        </Link>{" "}
        for 60 a month. Free credits reset on {resetDate(a)}.
      </>
    );
  return (
    <>
      {fewer && "Choose fewer slides. "}Your credits reset on {resetDate(a)}.
    </>
  );
}

/** Under the files on the upload page: shown only when there aren't enough AI lectures left. */
export function AllowanceNote({ materials }: { materials: Material[] }) {
  const a = useAllowance();
  if (!a || !materials.length) return null;
  const chars = materials.reduce((n, m) => n + textSize(m), 0);
  const need = lecturesFor(chars, a);
  // Nothing to say until they've run out.
  if (fits(chars, a)) return null;
  return (
    <p className="max-w-md text-center text-[13px] text-muted-foreground" role="status">
      <span className="font-medium text-foreground">
        {lecturesLeft(a) ? `This needs ${lecturesText(need)} but you have ${lecturesLeft(a) === 1 ? "about 1" : `about ${lecturesLeft(a)}`} left.` : `You've used your ${a.plan === "guest" ? "free credits" : "credits for this month"}.`}
      </span>{" "}
      <UpgradeHint a={a} />
    </p>
  );
}
