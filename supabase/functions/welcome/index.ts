// SlideQuiz welcome email for people who sign up with Google (or Apple).
// Email sign-ups already get a welcome in the "confirm your email" message, so this is only for
// accounts that don't need confirming. Sent once per account, only in its first hour.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   the API key from resend.com (the same Resend account used for the SMTP emails)
//   WELCOME_FROM     optional, e.g. "SlideQuiz <hello@slidequiz.co.uk>" (defaults to that)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

const ALLOWED = [/^https:\/\/(www\.)?slidequiz\.co\.uk$/, /^https:\/\/sam-bromley\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED.some((r) => r.test(origin)) ? origin : "https://slidequiz.co.uk",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});
const json = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function emailHtml(name: string) {
  const hey = name ? `Hey ${esc(name)},` : "Hey,";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;padding:8px 4px;">
  <p style="margin:0 0 16px;">${hey}</p>
  <p style="margin:0 0 16px;">Thanks for signing up to SlideQuiz. You're all set, so you can start revising straight away:</p>
  <p style="margin:0 0 20px;">
    <a href="https://slidequiz.co.uk" style="display:inline-block;background:#111;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">Open SlideQuiz</a>
  </p>
  <p style="margin:0 0 16px;">If you have any questions or concerns, please do not hesitate to contact us at <a href="mailto:slidequiz.help@outlook.com" style="color:#111;">slidequiz.help@outlook.com</a>.</p>
  <p style="margin:0 0 16px;">If there is anything you would like to see added or improved, we would love to hear it; we respond to every message.</p>
  <p style="margin:0 0 20px;">Cheers,<br>SlideQuiz team</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr>
      <td style="vertical-align:middle;padding-right:8px;"><img src="https://slidequiz.co.uk/icon-192.png" width="28" height="28" alt="SlideQuiz" style="display:block;border-radius:7px;"></td>
      <td style="vertical-align:middle;font-size:15px;font-weight:bold;color:#111;">SlideQuiz</td>
    </tr>
  </table>
  <p style="margin:0;font-size:12px;line-height:1.5;color:#999;">You're getting this because you created a SlideQuiz account at slidequiz.co.uk. If that wasn't you, you can ignore this email.</p>
</div>`;
}

function emailText(name: string) {
  return `${name ? `Hey ${name},` : "Hey,"}

Thanks for signing up to SlideQuiz. You're all set, so you can start revising straight away: https://slidequiz.co.uk

If you have any questions or concerns, please do not hesitate to contact us at slidequiz.help@outlook.com.

If there is anything you would like to see added or improved, we would love to hear it; we respond to every message.

Cheers,
SlideQuiz team

You're getting this because you created a SlideQuiz account at slidequiz.co.uk. If that wasn't you, you can ignore this email.`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, origin);

  const base = env("SUPABASE_URL");
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: req.headers.get("authorization") ?? "" } });
  if (!who.ok) return json({ error: "Not allowed." }, 401, origin);
  const u = await who.json();
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const provider = String(u.app_metadata?.provider ?? "email");

  const skip = (reason: string) => {
    console.log(`welcome: not sent to ${u.id}: ${reason}`);
    return json({ sent: false, reason }, 200, origin);
  };
  // Only once, only for brand-new accounts that didn't get the confirm-your-email welcome.
  if (meta.welcomed) return skip("already welcomed");
  if (provider === "email") return skip("email sign-up (they get the confirm-your-email message)");
  if (u.is_anonymous || !u.email) return skip("no email address");
  if (Date.now() - Date.parse(u.created_at) > 60 * 60 * 1000) return skip("account is more than an hour old");

  const key = env("RESEND_API_KEY");
  if (!key) return skip("RESEND_API_KEY secret is missing");
  const from = env("WELCOME_FROM") || "SlideQuiz <hello@slidequiz.co.uk>";

  const name = String(meta.name ?? meta.full_name ?? "").trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [u.email], subject: "Welcome to SlideQuiz", html: emailHtml(name), text: emailText(name) }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error(`welcome: Resend error ${r.status} (from ${from}): ${detail}`);
    return json({ sent: false, reason: `Resend error ${r.status}` }, 200, origin);
  }

  // Sent: remember it so they never get a second one.
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  await fetch(`${base}/auth/v1/admin/users/${u.id}`, {
    method: "PUT",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_metadata: { ...meta, welcomed: true } }),
  }).catch(() => {});
  console.log(`welcome: sent to ${u.id}`);
  return json({ sent: true }, 200, origin);
});
