import { oneWay, trackConversion } from "@/services/ads";
import { Check, Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthDialog } from "@/components/account/auth-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
import { toast } from "@/components/ui/toast";
import { navigate, useLocation } from "@/lib/router";
import { useAccount } from "@/services/account";
import { openBilling, PLUS, PLUS_ON, refreshPlan, setPlusTesting, startCheckout, usePlan } from "@/services/plus";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "");

function Plan({ name, price, points, highlight, children }: { name: string; price: string; points: string[]; highlight?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`flex flex-col rounded-xl border bg-card p-5 ${highlight ? "border-foreground/30 shadow-sm" : ""}`}>
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        {highlight && <Crown className="size-4" />} {name}
      </div>
      <div className="mt-1 text-[22px] font-semibold">{price}</div>
      <ul className="mt-4 flex-1 space-y-2 text-[14px]">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> <span>{p}</span>
          </li>
        ))}
      </ul>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/** SlideQuiz Plus: what you get, and the button to subscribe or manage it. */
export function PlusPage() {
  const account = useAccount();
  const plan = usePlan();
  const { query } = useLocation();
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const done = query.get("done") === "1";
  // Private testing before Plus is live: /#/pro?test=1 (and ?test=0 to stop).
  useEffect(() => {
    const t = query.get("test");
    if (t === "1" || t === "0") setPlusTesting(t === "1");
  }, [query]);
  const [waiting, setWaiting] = useState(done);
  useEffect(() => {
    if (done) setWaiting(true);
  }, [done]);

  // Back from paying: Stripe tells us a moment later, so check a few times.
  useEffect(() => {
    if (!waiting || !account.user) return;
    let tries = 0;
    let stop = false;
    const tick = async () => {
      const s = await refreshPlan(account.user!.id);
      if (stop) return;
      if (s.plus) {
        setWaiting(false);
        trackConversion("purchase", { value: 3.99, id: oneWay(`${account.user!.id}:${s.until ?? ""}`) });
        toast("Welcome to Pro! Thank you for supporting SlideQuiz.");
        navigate("/pro", { replace: true });
      } else if (++tries < 10) setTimeout(tick, 2000);
      else setWaiting(false);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [waiting, account.user?.id]);

  // Coming back from Stripe (including with the Back button) shouldn't leave a button spinning.
  useEffect(() => {
    setBusy(false);
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, [plan.plus]);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  let action: React.ReactNode;
  if (account.user && !plan.loaded) {
    action = <Shimmer className="h-9 w-full rounded-lg" />;
  } else if (!PLUS_ON && !plan.plus) {
    action = (
      <div className="space-y-2">
        <Button className="w-full" disabled>
          Coming soon
        </Button>
        <p className="text-center text-[12.5px] text-muted-foreground">Pro isn't available yet. Check back soon.</p>
      </div>
    );
  } else if (!account.user) {
    action = (
      <Button className="w-full" onClick={() => setAuth(true)}>
        Make an account to get Pro
      </Button>
    );
  } else if (waiting) {
    action = <p className="text-[13.5px] text-muted-foreground">Setting up your Pro…</p>;
  } else if (plan.plus) {
    action = (
      <div className="space-y-2">
        <p className="text-[13.5px] text-muted-foreground">{plan.cancelling ? `You have Pro until ${date(plan.until)}. It won't renew.` : "You have Pro. Thank you!"}</p>
        {plan.customer && (
          <Button variant="outline" className="w-full" loading={busy} onClick={() => go(openBilling)}>
            {plan.cancelling ? "Renew Pro" : "Manage or cancel"}
          </Button>
        )}
      </div>
    );
  } else {
    action = (
      <Button className="w-full" loading={busy} onClick={() => go(startCheckout)}>
        Get Pro
      </Button>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader back={{ to: "/settings", label: "Settings" }} title="SlideQuiz Pro" description="More credits every month, and you help keep SlideQuiz free for everyone." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Plan
          name="Free"
          price="£0"
          points={[
            `${PLUS.freeLectures} credits a month with a free account`,
            "1 credit makes notes, practice questions and flashcards for a normal lecture",
            "Everything you've made stays yours to revise from",
            "Practice, flashcards and everything else",
          ]}
        />
        <Plan
          name="Pro"
          price={`${PLUS.price} a ${PLUS.period}`}
          highlight
          points={[
            "Everything in Free",
            `${PLUS.plusLectures} credits a month`,
            "Notes from lecture recordings (audio and video) and YouTube videos",
            "Essay practice: exam-style essay questions and plans, aimed at your marking criteria",
            "Highlight your notes and add your own notes to them",
            "Download your notes as a designed PDF or Word document",
            "A weekly recap of how your revision is going",
            "Your own photo as the background, accent colours and coloured folders",
            "Never held up when SlideQuiz is busy",
            "Cancel any time",
          ]}
        >
          {action}
        </Plan>
      </div>

      <div className="mt-8 space-y-3 text-[13.5px] text-muted-foreground">
        <p>Payments are handled securely by Stripe. SlideQuiz never sees your card details.</p>
        <p>
          Pro renews every {PLUS.period} until you cancel. You can cancel any time with “Manage or cancel” (or Settings → Pro); you keep Pro until the end of the {PLUS.period} you've paid for. Credits reset on the 1st of each month. One credit covers up to about 5,000 words of slide text (a normal 50–60 slide lecture); longer files use more.
        </p>
        <p>
          Something wrong with a payment? Email <a className="font-medium underline underline-offset-2" href="mailto:slidequiz.help@outlook.com">slidequiz.help@outlook.com</a>.
        </p>
      </div>
      {auth && <AuthDialog initial="signup" onClose={() => setAuth(false)} />}
    </div>
  );
}
