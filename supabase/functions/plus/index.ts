// SlideQuiz Plus helper — a Supabase Edge Function that talks to Stripe.
// It does three things:
//   {action: "checkout"} → makes a Stripe payment page for the logged-in student and returns its link
//   {action: "portal"}   → returns a link to Stripe's page where they can cancel or change their card
//   Stripe webhook       → Stripe tells us when someone subscribes, renews or cancels, and we update `plans`
// Nobody's card details ever touch SlideQuiz; Stripe handles all of that.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      required (starts sk_live_ or sk_test_)
//   STRIPE_PRICE_ID        required (starts price_, the monthly Plus price)
//   STRIPE_WEBHOOK_SECRET  required (starts whsec_, from the webhook you add in Stripe)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

const ALLOWED = [/^https:\/\/(www\.)?slidequiz\.co\.uk$/, /^https:\/\/sam-bromley\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];
const HOME = "https://slidequiz.co.uk";
const siteFor = (origin: string | null) => (origin && ALLOWED.some((r) => r.test(origin)) ? origin : HOME);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": siteFor(origin),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});
const json = (data: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

const env = (k: string) => Deno.env.get(k) ?? "";
const base = () => env("SUPABASE_URL");

/* ------------------------------------------------------------------ Stripe */

/** Calls the Stripe API. `params` are flattened into Stripe's form format (a[b][0]=c). */
async function stripe(path: string, params: Record<string, unknown> = {}, method = "POST") {
  const form = new URLSearchParams();
  const add = (key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) add(`${key}[${k}]`, x);
    else form.append(key, String(v));
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  const url = `https://api.stripe.com/v1/${path}` + (method === "GET" && form.size ? `?${form}` : "");
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : form,
  });
  const out = await r.json();
  if (!r.ok) throw new Error(out?.error?.message ?? `Stripe error ${r.status}`);
  return out;
}

/** Checks a webhook really came from Stripe (the Stripe-Signature header). */
async function verified(raw: string, header: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("STRIPE_WEBHOOK_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

/* ------------------------------------------------------------------ database (as the server) */

const admin = () => ({ apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" });

async function getPlan(userId: string) {
  const r = await fetch(`${base()}/rest/v1/plans?select=*&user_id=eq.${userId}`, { headers: admin() });
  return ((await r.json()) as any[])[0] ?? null;
}

async function savePlan(row: Record<string, unknown>) {
  const r = await fetch(`${base()}/rest/v1/plans`, {
    method: "POST",
    headers: { ...admin(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (r.ok) return;
  const text = await r.text();
  // 23503: the student has since deleted their account, so there's nobody to update.
  if (text.includes("23503")) return;
  throw new Error(`Couldn't save plan: ${text}`);
}

/** Records a Stripe subscription against the student it belongs to. */
async function recordSubscription(sub: any, userId?: string) {
  const uid = userId ?? sub.metadata?.user_id;
  if (!uid) return;
  // Newer Stripe accounts keep the renewal date on the subscription item.
  const end: number = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0;
  const live = ["active", "trialing", "past_due"].includes(sub.status);
  // Two days' grace so a renewal that's a little late doesn't cut anyone off.
  const until = live && end ? new Date((end + 2 * 86400) * 1000).toISOString() : new Date().toISOString();
  await savePlan({
    user_id: uid,
    plus_until: until,
    cancel_at_period_end: !!sub.cancel_at_period_end || !!sub.cancel_at,
    stripe_customer: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    stripe_subscription: sub.id,
  });
}

/* ------------------------------------------------------------------ requests */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, origin);

  // Stripe telling us something changed.
  const signature = req.headers.get("stripe-signature");
  if (signature) {
    const raw = await req.text();
    if (!(await verified(raw, signature))) return new Response("Bad signature", { status: 400 });
    const event = JSON.parse(raw);
    const obj = event.data?.object ?? {};
    try {
      if (event.type === "checkout.session.completed" && obj.mode === "subscription" && obj.subscription) {
        const sub = await stripe(`subscriptions/${obj.subscription}`, {}, "GET");
        await recordSubscription(sub, obj.client_reference_id ?? obj.metadata?.user_id);
      } else if (event.type?.startsWith("customer.subscription.")) {
        await recordSubscription(obj);
      }
    } catch (e) {
      // A failure makes Stripe try again later.
      return new Response(String(e), { status: 500 });
    }
    return new Response("ok");
  }

  // The website, on behalf of a logged-in student.
  const who = await fetch(`${base()}/auth/v1/user`, { headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: req.headers.get("authorization") ?? "" } });
  if (!who.ok) return json({ error: "Log in first." }, 401, origin);
  const user = await who.json();
  if (user.is_anonymous || !user.email) return json({ error: "Make an account first." }, 401, origin);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const site = siteFor(origin);
  try {
    const plan = await getPlan(user.id);
    if (body.action === "checkout") {
      if (plan?.plus_until && new Date(plan.plus_until) > new Date() && !plan.cancel_at_period_end) return json({ error: "You already have Plus." }, 400, origin);
      const session = await stripe("checkout/sessions", {
        mode: "subscription",
        line_items: { 0: { price: env("STRIPE_PRICE_ID"), quantity: 1 } },
        client_reference_id: user.id,
        metadata: { user_id: user.id },
        subscription_data: { metadata: { user_id: user.id } },
        ...(plan?.stripe_customer ? { customer: plan.stripe_customer } : { customer_email: user.email }),
        allow_promotion_codes: true,
        success_url: `${site}/#/plus?done=1`,
        cancel_url: `${site}/#/plus`,
      });
      return json({ url: session.url }, 200, origin);
    }
    if (body.action === "portal") {
      if (!plan?.stripe_customer) return json({ error: "You don't have a subscription yet." }, 400, origin);
      const portal = await stripe("billing_portal/sessions", { customer: plan.stripe_customer, return_url: `${site}/#/plus` });
      return json({ url: portal.url }, 200, origin);
    }
    return json({ error: "Unknown action" }, 400, origin);
  } catch (e) {
    console.error(e);
    return json({ error: "Payments aren't working right now. Try again in a minute." }, 502, origin);
  }
});
