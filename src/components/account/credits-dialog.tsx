import { CalendarDays, Check, Copy, Crown, Gift, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthDialog } from "@/components/account/auth-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Link } from "@/lib/router";
import { useAccount } from "@/services/account";
import { lecturesLeft, useAllowance } from "@/services/ai/cloud";
import { closeCreditsDialog, inviteLink, myInvite, openInvite, useCreditsDialog, type InviteInfo } from "@/services/invites";
import { PLUS, PLUS_ON } from "@/services/plus";

/** Shown from anywhere: "Invite friends", or "You've run out of credits". Mounted once in the app shell. */
export function CreditsDialogHost() {
  const which = useCreditsDialog();
  const { user } = useAccount();
  if (!which) return null;
  if (!user) return <AuthDialog initial="signup" reason="Create a free account to get 10 credits a month and your own invite link." onClose={closeCreditsDialog} />;
  return which === "invite" ? <InviteDialog /> : which === "earn" ? <EarnCreditsDialog /> : <OutOfCreditsDialog />;
}

const resetText = (resets: string | null | undefined) => (resets ? new Date(resets).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "");

/** Option card used in the credit dialogs. */
function Option({ icon, title, text, onClick, to, tone = "soft" }: { icon: React.ReactNode; title: string; text: string; onClick?: () => void; to?: string; tone?: "soft" | "plain" }) {
  const cls = "flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors focus-ring";
  const body = (
    <>
      <span className={tone === "soft" ? "grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary" : "grid size-9 shrink-0 place-items-center rounded-lg bg-secondary"}>{icon}</span>
      <span>
        <span className="block text-[14.5px] font-semibold">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{text}</span>
      </span>
    </>
  );
  if (to)
    return (
      <Link to={to} onClick={closeCreditsDialog} className={cls + " hover:border-foreground/30"}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls + " hover:border-foreground/30"}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** "Free credits" from the top bar: how many are left, and every way to get more. */
function EarnCreditsDialog() {
  const a = useAllowance();
  const left = a ? lecturesLeft(a) : null;
  const bonus = a?.bonus ? Math.round(a.bonus / a.lecture) : 0;
  return (
    <Dialog
      open
      onClose={closeCreditsDialog}
      title="Free credits"
      description={left == null ? undefined : `You have ${left === 1 ? "1 credit" : `${left} credits`} left${bonus ? `, including ${bonus} bonus` : ""}.`}
      size="sm"
    >
      <div className="space-y-2.5">
        <Option icon={<Gift className="size-[18px]" />} title="Invite friends" text="Earn 3 free credits for every friend who signs up with your link and makes their first lecture. They get 3 too." onClick={openInvite} />
        <Option
          icon={<CalendarDays className="size-[18px]" />}
          title={`${a?.plan === "plus" ? PLUS.plusLectures : PLUS.freeLectures} new credits every month`}
          text={a?.resets ? `Your next ones arrive on ${resetText(a.resets)}.` : "They arrive on the 1st of every month."}
          tone="plain"
        />
        {PLUS_ON && a?.plan !== "plus" && <Option icon={<Crown className="size-[18px]" />} title="Get Pro" text={`${PLUS.plusLectures} credits every month for ${PLUS.price} a ${PLUS.period}.`} to="/pro" tone="plain" />}
      </div>
    </Dialog>
  );
}

function OutOfCreditsDialog() {
  const a = useAllowance();
  const left = a ? lecturesLeft(a) : 0;
  return (
    <Dialog open onClose={closeCreditsDialog} title={left > 0 ? "Not enough credits for this" : "You've run out of credits"} description={a?.resets ? `Your monthly credits come back on ${resetText(a.resets)}.` : undefined} size="sm">
      <div className="space-y-2.5">
        <button type="button" onClick={openInvite} className="flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-foreground/30 focus-ring">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Gift className="size-[18px]" />
          </span>
          <span>
            <span className="block text-[14.5px] font-semibold">Invite a friend</span>
            <span className="block text-[13px] text-muted-foreground">Earn 3 free credits when a friend signs up with your link and makes their first lecture. They get 3 too.</span>
          </span>
        </button>
        {PLUS_ON && a?.plan !== "plus" && (
          <Link to="/pro" onClick={closeCreditsDialog} className="flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-foreground/30 focus-ring">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
              <Crown className="size-[18px]" />
            </span>
            <span>
              <span className="block text-[14.5px] font-semibold">Get Pro</span>
              <span className="block text-[13px] text-muted-foreground">
                {PLUS.plusLectures} credits every month for {PLUS.price} a {PLUS.period}.
              </span>
            </span>
          </Link>
        )}
      </div>
    </Dialog>
  );
}

function InviteDialog() {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    myInvite()
      .then((i) => (i ? setInfo(i) : setError("Log in to get your invite link.")))
      .catch((e) => setError((e as Error).message));
  }, []);
  const link = info ? inviteLink(info.code) : "";
  const message = `I've been revising with SlideQuiz. It turns lecture slides into notes, practice questions and flashcards. Sign up with my link and we both get 3 free credits: ${link}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const full = info ? info.month >= info.max : false;

  return (
    <Dialog open onClose={closeCreditsDialog} title="Invite friends" size="sm" footer={<Button onClick={closeCreditsDialog}>Done</Button>}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Gift className="size-5" />
          </span>
          <p className="text-[14px] leading-relaxed">
            Earn <b>3 free credits</b> for every friend who signs up with your link and makes their first lecture. They get <b>3 free credits</b> too.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-[13.5px] font-medium text-destructive">
            {error}
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={link || "Loading your link…"} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 text-[13.5px]" />
              <Button variant="outline" onClick={copy} disabled={!info} className="shrink-0">
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {canShare && (
              <Button className="w-full" disabled={!info} onClick={() => navigator.share({ title: "SlideQuiz", text: message }).catch(() => {})}>
                <Share2 /> Share link
              </Button>
            )}
            {info && (
              <p className="text-[12.5px] text-muted-foreground">
                {full
                  ? `You've had ${info.max} friends join this month, the most that earn credits. Thank you! It resets next month.`
                  : `${info.total ? `${info.total === 1 ? "1 friend has" : `${info.total} friends have`} joined so far. ` : ""}Up to ${info.max} friends a month earn you credits. Bonus credits don't expire.`}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
