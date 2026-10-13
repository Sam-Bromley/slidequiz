import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { ADS_READY, setAdConsent, useAdConsent } from "@/services/ads";
import { PageHeader } from "@/components/layout/page-header";

export const CONTACT_EMAIL = "slidequiz.help@outlook.com";
const UPDATED = "13 October 2026";

function H({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 text-[17px] font-semibold">{children}</h2>;
}

/** What SlideQuiz stores, where, and how to get it removed. Keep in step with how the site actually works. */
export function PrivacyPage() {
  const mail = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );
  return (
    <div className="max-w-2xl text-[15px] leading-relaxed text-foreground/90 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
      <PageHeader back={{ to: "/settings", label: "Settings" }} title="Privacy policy" description={`Last updated ${UPDATED}`} />

      <p>SlideQuiz (slidequiz.co.uk) is responsible for your data. Questions or requests: {mail}.</p>

      <H>What we collect</H>
      <ul>
        <li>Without an account: nothing. Your work is saved only in your browser. A guest gets an anonymous pass so we can count how many credits it has used.</li>
        <li>With an account: your email address, your password (stored hashed, so nobody can read it) and your first name if you give it. If you log in with Google or Apple, the email and name from that account.</li>
        <li>Your study work (notes, questions, flashcards, folders, progress and settings), so you can use it on any device.</li>
        <li>How many credits you've used, whether you have Pro, the invite code you joined with (if any), and roughly how you found us (for example “Google search”).</li>
      </ul>
      <p className="mt-2">Your original files and pictures stay on your device and are never uploaded.</p>

      <H>Why we use it</H>
      <ul>
        <li>To provide SlideQuiz to you: your account, saving your work, making notes and questions, Pro, and emails about your account and review reminders (turn these off in Settings). This is necessary to provide the service.</li>
        <li>To stop free credits being misused and to count visits and which ads lead to sign-ups, without identifying you. These are our legitimate interests.</li>
        <li>Ad cookies, only if you say yes (your consent).</li>
      </ul>
      <p className="mt-2">We never sell your data or use it for marketing.</p>

      <H>Who processes it for us</H>
      <ul>
        <li>Anthropic: the text of your slides is sent to its AI to write your notes, questions and flashcards. It isn't used for anything else.</li>
        <li>Groq (Pro recordings only): the audio of a recording, to turn it into text.</li>
        <li>Supabase: accounts and saved work.</li>
        <li>Stripe: Pro payments. Your card details go straight to Stripe; we never see them.</li>
        <li>Resend: sends our emails.</li>
        <li>GitHub Pages and Cloudflare: host the site and count visits without cookies.</li>
        <li>Google Ads: measures which of our ads lead to sign-ups (cookies only with your consent). There are no ads on SlideQuiz.</li>
      </ul>
      <p className="mt-2">Some of these are in the United States. Your data is protected there by the UK's approved safeguards (the UK–US data bridge or standard contractual clauses).</p>

      <H>Cookies</H>
      <p>Your work, settings and login are saved in your browser so the site works. Google's ad cookies are used only if you accept them. You can change your choice here:</p>
      <CookieChoice />

      <H>How long we keep it</H>
      <p>Until you delete your account (Settings → Delete account), which removes everything straight away. To stop free credits being claimed twice, we keep a one-way scrambled code made from your email address (it can't be turned back into the address), with that month's credit use. Stripe keeps payment records as the law requires.</p>

      <H>Your rights</H>
      <p>
        You can ask for a copy of your data, or ask us to correct, delete, restrict or stop using it, and withdraw consent at any time. Email {mail} and we'll reply within a month. You can also complain to the Information Commissioner's Office at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          ico.org.uk
        </a>
        .
      </p>

      <H>Children</H>
      <p>If you're under 13, ask a parent or guardian before creating an account.</p>

      <H>Changes</H>
      <p>If this changes, we'll update this page and the date at the top.</p>
    </div>
  );
}

/** Change the ad cookie choice (as easy to change as it was to make). */
function CookieChoice() {
  const consent = useAdConsent();
  if (!ADS_READY) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
      <label htmlFor="privacy-adcookies" className="text-[14px] font-medium">
        Cookies
      </label>
      <Switch id="privacy-adcookies" checked={consent === "yes"} onChange={(v) => setAdConsent(v ? "yes" : "no")} label="Cookies" />
    </div>
  );
}
