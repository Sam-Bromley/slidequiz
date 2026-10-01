import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { ADS_READY, setAdConsent, useAdConsent } from "@/services/ads";

/** Asks once whether we may use ad cookies (to see which of our ads work). */
export function CookieBanner() {
  const consent = useAdConsent();
  if (!ADS_READY || consent) return null;
  return (
    <div
      role="dialog"
      aria-label="Cookies"
      className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-xl animate-fade-up rounded-2xl border bg-popover p-4 text-popover-foreground shadow-pop sm:p-5 lg:bottom-5 lg:left-[calc(var(--sb,248px)+12px)]"
    >
      <p className="text-[14px] font-semibold">Cookies</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        We'd like to use cookies to see which of our ads bring people to SlideQuiz. There are never any ads on SlideQuiz itself.{" "}
        <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">
          Privacy
        </Link>
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setAdConsent("no")}>
          No thanks
        </Button>
        <Button size="sm" onClick={() => setAdConsent("yes")}>
          Accept
        </Button>
      </div>
    </div>
  );
}
