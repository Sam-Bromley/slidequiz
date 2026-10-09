// SlideQuiz review reminders. Run once a day by a schedule (see supabase/reminders.sql).
// Memory fades fast after you first learn something; reviewing just before it fades resets it and makes it last longer.
// So a student gets a short email 1, 3, 6, 14 and 30 days after making a lecture, unless they've already revised it that day.
// At most one email per student per day, listing what's due.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   the resend.com API key (the same one the welcome email uses)
//   REMINDERS_KEY    a long random code; the daily schedule sends it so nobody else can trigger emails
//   WELCOME_FROM     optional sender, defaults to "SlideQuiz <hello@slidequiz.co.uk>"
// In the dashboard, turn OFF "Verify JWT" for this function: the unsubscribe link in each email is opened without logging in.

const env = (k: string) => Deno.env.get(k) ?? "";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const SITE = "https://slidequiz.co.uk";
const DAYS = [1, 3, 6, 14, 30];
/** Resend's free plan allows 100 emails a day; leave room for sign-up emails. */
const MAX_PER_RUN = 80;

type Item = { id: string; title: string; days: number };

/** A signature for the unsubscribe link, so nobody can unsubscribe someone else. */
async function sign(userId: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("unsub:" + env("REMINDERS_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ago = (d: number) => (d === 1 ? "yesterday" : d === 14 ? "two weeks ago" : d === 30 ? "a month ago" : `${d} days ago`);

function subjectFor(items: Item[]) {
  const t = items[0].title.length > 50 ? items[0].title.slice(0, 48).trimEnd() + "…" : items[0].title;
  if (items.length === 1) return `Time to review: ${t}`;
  return `Time to review: ${t} and ${items.length - 1} more`;
}

/** Why now, in one line, based on how long ago the first lecture on the list was made. */
function why(d: number) {
  if (d === 1) return "You'll have forgotten a lot of it since yesterday. That's normal: a quick review now brings it back and makes it stick for longer.";
  if (d === 3) return "This is the point where it starts to slip. A few minutes of questions now locks it in for the week.";
  if (d === 6) return "One more review now and it'll stay with you for weeks, not days.";
  if (d === 14) return "It's been two weeks. A short review now keeps it fresh until your exams.";
  return "It's been a month. One more review and it's in your long-term memory.";
}

const MANY = "These lectures are due a review. Going over them now, just before they start to fade, makes them stick for much longer.";

function html(name: string, items: Item[], unsub: string) {
  const first = items[0];
  const list = items
    .slice(0, 5)
    .map(
      (it) => `<tr><td style="padding:10px 14px;border:1px solid #e5e5e5;border-radius:10px;">
        <a href="${SITE}/#/questions?m=${encodeURIComponent(it.id)}" style="color:#111;text-decoration:none;font-weight:bold;">${esc(it.title)}</a>
        <div style="font-size:12.5px;color:#777;margin-top:2px;">Made ${ago(it.days)}</div>
      </td></tr><tr><td style="height:8px;"></td></tr>`,
    )
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;padding:8px 4px;">
  <p style="margin:0 0 14px;">${name ? `Hey ${esc(name)},` : "Hey,"}</p>
  <p style="margin:0 0 14px;">${items.length === 1 ? `You made notes on <b>${esc(first.title)}</b> ${ago(first.days)}. ${why(first.days)}` : MANY}</p>
  ${items.length > 1 ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 12px;border-collapse:separate;">${list}</table>` : ""}
  <p style="margin:0 0 20px;">
    <a href="${SITE}/#/questions?m=${encodeURIComponent(first.id)}" style="display:inline-block;background:#111;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">Review now</a>
  </p>
  <p style="margin:0 0 20px;color:#555;">5 minutes is enough.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr>
      <td style="vertical-align:middle;padding-right:8px;"><img src="${SITE}/icon-192.png" width="28" height="28" alt="SlideQuiz" style="display:block;border-radius:7px;"></td>
      <td style="vertical-align:middle;font-size:15px;font-weight:bold;color:#111;">SlideQuiz</td>
    </tr>
  </table>
  <p style="margin:0;font-size:12px;line-height:1.5;color:#999;">You're getting this because you made lectures on SlideQuiz. Don't want these? <a href="${unsub}" style="color:#999;">Turn off review reminders</a>.</p>
</div>`;
}

function text(name: string, items: Item[], unsub: string) {
  const first = items[0];
  const lines = items.slice(0, 5).map((it) => `- ${it.title} (made ${ago(it.days)}): ${SITE}/#/questions?m=${encodeURIComponent(it.id)}`);
  return `${name ? `Hey ${name},` : "Hey,"}

${items.length === 1 ? `You made notes on ${first.title} ${ago(first.days)}. ${why(first.days)}` : MANY}

${items.length === 1 ? `Review now: ${SITE}/#/questions?m=${encodeURIComponent(first.id)}` : lines.join("\n")}

5 minutes is enough.

SlideQuiz

Don't want these? Turn off review reminders: ${unsub}`;
}

Deno.serve(async (req) => {
  const base = env("SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const admin = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const url = new URL(req.url);

  // Unsubscribe link from an email.
  if (req.method === "GET" && url.searchParams.get("u")) {
    const u = url.searchParams.get("u")!;
    const ok = /^[0-9a-f-]{36}$/.test(u) && url.searchParams.get("t") === (await sign(u));
    if (ok) {
      const cur = await fetch(`${base}/auth/v1/admin/users/${u}`, { headers: admin }).then((r) => (r.ok ? r.json() : null));
      if (cur) await fetch(`${base}/auth/v1/admin/users/${u}`, { method: "PUT", headers: admin, body: JSON.stringify({ user_metadata: { ...(cur.user_metadata ?? {}), no_reminders: true } }) });
    }
    return Response.redirect(`${SITE}/unsubscribed/${ok ? "" : "?error=1"}`, 302);
  }

  // The daily run: only the schedule (which knows the key) can start it.
  if (req.method !== "POST" || !env("REMINDERS_KEY") || req.headers.get("x-reminders-key") !== env("REMINDERS_KEY")) return new Response("Not allowed", { status: 401 });
  const resend = env("RESEND_API_KEY");
  if (!resend) return new Response("RESEND_API_KEY missing", { status: 500 });
  const from = env("WELCOME_FROM") || "SlideQuiz <hello@slidequiz.co.uk>";

  const due = await fetch(`${base}/rest/v1/rpc/reviews_due`, { method: "POST", headers: admin, body: JSON.stringify({ p_days: DAYS }) });
  if (!due.ok) {
    console.error("reminders: couldn't load who is due:", due.status, await due.text().catch(() => ""));
    return new Response("Couldn't load", { status: 500 });
  }
  const rows = (await due.json()) as { user_id: string; email: string; name: string; items: Item[] }[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  let sent = 0;
  for (const row of rows.slice(0, MAX_PER_RUN)) {
    const items = (row.items ?? []).filter((i) => i?.id && i?.title);
    if (!items.length) continue;
    // Claim today's slot first, so a second run can't email the same person twice.
    const claim = await fetch(`${base}/rest/v1/review_emails`, { method: "POST", headers: { ...admin, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: row.user_id, day: today }) });
    if (!claim.ok) continue;
    const unsub = `${base}/functions/v1/reminders?u=${row.user_id}&t=${await sign(row.user_id)}`;
    const name = (row.name ?? "").trim().slice(0, 40);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [row.email],
        subject: subjectFor(items),
        html: html(name, items, unsub),
        text: text(name, items, unsub),
        headers: { "List-Unsubscribe": `<${unsub}>` },
      }),
    });
    if (r.ok) sent++;
    else console.error(`reminders: Resend error ${r.status} for ${row.user_id}: ${await r.text().catch(() => "")}`);
  }
  console.log(`reminders: ${sent} sent, ${rows.length} due`);
  return new Response(JSON.stringify({ due: rows.length, sent }), { headers: { "Content-Type": "application/json" } });
});
