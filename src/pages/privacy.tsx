import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";

export const CONTACT_EMAIL = "slidequiz.help@outlook.com";
const UPDATED = "3 October 2026";

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

      <p>SlideQuiz turns your slides and notes into notes, practice questions and flashcards. This page explains what we keep about you, why, and how to get it removed. If you have a question, email {mail}.</p>

      <H>Without an account</H>
      <ul>
        <li>The files you upload are read on your own device. The files themselves (and their pictures) are never sent anywhere.</li>
        <li>To write your notes, questions and flashcards, the text of your slides is sent to our AI provider (see below). Nothing is kept on our servers.</li>
        <li>Your notes, questions, flashcards, progress and settings are saved in your browser on that device only. We can't see them.</li>
        <li>Clearing your browser's data deletes them. You can keep a copy with Settings → Download backup.</li>
      </ul>

      <H>With an account</H>
      <p>If you create an account, we keep:</p>
      <ul>
        <li>Your email address and password. Passwords are stored scrambled (hashed), so nobody can read them, including us.</li>
        <li>Your first name, if you choose to give it. We only use it to greet you, for example in the email that confirms your account.</li>
        <li>If you log in with Google: your email address, name and profile picture link from your Google account. We never see your Google password, and we can't access anything else in your Google account.</li>
        <li>Roughly how you found SlideQuiz when you signed up, for example “Google Ads”, “Google search” or “Direct”, and the page you arrived on. This helps us see which kinds of advertising work. It doesn't include anything that identifies you.</li>
        <li>Your study work: the text of your notes, your questions, flashcards, folders, progress and settings, so you can use them on any device.</li>
      </ul>
      <p className="mt-2">We don't keep your original files or the pictures from your slides. Those stay on your device.</p>
      <H>AI notes and questions</H>
      <p>SlideQuiz uses AI to write your notes, practice questions and flashcards, and to answer questions about your notes. To do that, the text of your slides (not the files or pictures) is sent to our AI provider, Anthropic, which processes it and sends back the result. We don't use your content for anything else.</p>
      <p className="mt-2">If you don't have an account, your browser gets an anonymous guest pass (no name or email) so we can give each person a fair allowance. We only store how much it has used.</p>
      <p className="mt-2">We use this only to run your account. We don't sell it, share it for advertising, or send you marketing emails. The only emails you'll get are about your account: one to confirm your email when you sign up, and ones you ask for, like a password reset.</p>

      <H>SlideQuiz Pro payments</H>
      <p>If you pay for Pro, the payment is handled by Stripe. You type your card details into Stripe's own page, so we never see or store them. We keep only whether you have Pro, when it renews or ends, and the reference numbers Stripe gives us for your subscription. Stripe keeps records of payments as the law requires; see Stripe's privacy policy at stripe.com/privacy.</p>

      <H>Visitor numbers</H>
      <p>We count visits with Cloudflare Web Analytics. It doesn't use cookies, doesn't track you across other websites and doesn't identify you. It tells us things like how many people visited and which pages they opened.</p>

      <H>Cookies and browser storage</H>
      <p>The site saves your work, your settings and (if you log in) your login in your browser's storage so it works when you come back.</p>
      <p className="mt-2">We advertise SlideQuiz on Google. Google's tag is on our pages so Google Ads can tell us when someone who clicked one of our ads creates an account or buys Pro. This helps us see which ads work. If you say yes to ad cookies, it can use cookies to do this. If you say no (or don't choose), it uses no ad cookies and sends Google nothing that identifies you or your device: only anonymous signals that a page was visited or a sign-up happened, which Google uses to estimate how well the ads work overall. We never use it to show you personalised ads. There are never any ads on SlideQuiz itself, and we don't share your notes or files with Google. You can change your choice any time in Settings → Appearance → Ad cookies.</p>

      <H>Who else handles your data</H>
      <p>We use a few services to run SlideQuiz. They only process data to provide their service to us:</p>
      <ul>
        <li>Supabase: accounts, saved work, allowances, and passing your slide text to the AI.</li>
        <li>Anthropic: the AI that writes notes, questions, flashcards and answers.</li>
        <li>Stripe: payments for SlideQuiz Pro.</li>
        <li>GitHub Pages: hosts the website. Like any web host, it may log visitors' IP addresses for security.</li>
        <li>Cloudflare: visitor numbers (see above).</li>
        <li>Google Ads: to measure which of our ads lead to sign-ups and Pro purchases. Cookies only if you accept ad cookies; otherwise only anonymous, cookieless signals.</li>
      </ul>

      <H>How long we keep it</H>
      <p>We keep your account data until you delete it. You can delete everything yourself at any time:</p>
      <ul>
        <li>Settings → Delete account removes your account, your email address and everything saved to it, straight away.</li>
        <li>Settings → Delete everything removes your work from this device (and from your account, if you're logged in).</li>
      </ul>

      <H>Your rights</H>
      <p>
        You can ask for a copy of your data, ask us to correct it, or ask us to delete it. Email {mail} and we'll reply within a month. If you're unhappy with how we've handled your data, you can complain to the Information Commissioner's Office (ICO) at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          ico.org.uk
        </a>
        .
      </p>

      <H>Children</H>
      <p>If you're under 13, ask a parent or guardian before creating an account.</p>

      <H>Changes</H>
      <p>If we change how we use your data, we'll update this page and the date at the top.</p>
    </div>
  );
}
