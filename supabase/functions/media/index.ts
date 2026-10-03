// SlideQuiz media helper (Pro only) — a Supabase Edge Function.
//   ?task=transcribe  body: a short WAV piece of a lecture recording → {text}   (Groq Whisper)
//   ?task=youtube     body: {"id": "<11-character video id>"}          → {title, text, seconds}
// The website turns the text into notes and questions in the usual way.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GROQ_API_KEY   required for recordings (console.groq.com → API keys)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.

const ALLOWED = [/^https:\/\/(www\.)?slidequiz\.co\.uk$/, /^https:\/\/sam-bromley\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED.some((r) => r.test(origin)) ? origin : "https://slidequiz.co.uk",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});
const json = (data: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

const env = (k: string) => Deno.env.get(k) ?? "";
const MAX_PIECE = 15 * 1024 * 1024;

/* ------------------------------------------------------------------ YouTube captions */

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

type Track = { baseUrl: string; languageCode?: string; kind?: string };

/** Picks English (a real track before auto-generated), otherwise the first track. */
const pick = (tracks: Track[]) =>
  tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ?? tracks.find((t) => t.languageCode?.startsWith("en")) ?? tracks[0];

async function captionText(track: Track): Promise<string> {
  const url = track.baseUrl.replace(/&fmt=[^&]*/, "");
  // json3 first, then the plain XML format.
  const j = await fetch(url + "&fmt=json3").then((r) => (r.ok ? r.text() : "")).catch(() => "");
  if (j.trim().startsWith("{")) {
    const data = JSON.parse(j);
    const text = (data.events ?? []).flatMap((e: any) => (e.segs ?? []).map((s: any) => s.utf8 ?? "")).join("");
    if (text.trim()) return text;
  }
  const x = await fetch(url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  return [...x.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, ""))).join(" ");
}

async function youtube(id: string): Promise<{ title: string; text: string; seconds: number } | null> {
  // 1. The player data, as YouTube's Android app asks for it (usually includes caption tracks).
  const player = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip" },
    body: JSON.stringify({ videoId: id, context: { client: { clientName: "ANDROID", clientVersion: "19.44.38", androidSdkVersion: 34, hl: "en", gl: "GB" } } }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  let tracks: Track[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  let title: string = player?.videoDetails?.title ?? "";
  let seconds = Number(player?.videoDetails?.lengthSeconds ?? 0);

  // 2. Otherwise the watch page itself.
  if (!tracks.length) {
    const html = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { "Accept-Language": "en-GB,en;q=0.9", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" } })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    const m = html.match(/"captionTracks":(\[.*?\])/);
    if (m) {
      try {
        tracks = JSON.parse(m[1]);
      } catch {
        /* ignore */
      }
    }
    title ||= decodeEntities(html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? "");
    seconds ||= Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0);
  }
  const track = pick(tracks);
  if (!track?.baseUrl) return null;
  const text = (await captionText(track)).replace(/\s+/g, " ").replace(/\[(music|applause|laughter)\]/gi, "").trim();
  return text ? { title, text, seconds } : null;
}

/* ------------------------------------------------------------------ requests */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, origin);

  const auth = req.headers.get("authorization") ?? "";
  const base = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const headers = { apikey: anon, Authorization: auth, "Content-Type": "application/json" };

  // Pro members only.
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!who.ok) return json({ error: "Log in with your Pro account first." }, 401, origin);
  const userId = String((await who.json().catch(() => null))?.id ?? "");
  if (!userId) return json({ error: "Log in with your Pro account first." }, 401, origin);
  // Usage is counted by the server only. SUPABASE_SERVICE_ROLE_KEY is provided by Supabase automatically.
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const admin = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const plan = await fetch(`${base}/rest/v1/rpc/sq_plan`, { method: "POST", headers, body: "{}" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (plan !== "plus") return json({ error: "Lecture recordings and YouTube videos are part of SlideQuiz Pro." }, 403, origin);

  const task = new URL(req.url).searchParams.get("task");

  if (task === "transcribe") {
    const key = env("GROQ_API_KEY");
    if (!key) return json({ error: "Recordings aren't switched on yet." }, 503, origin);
    const audio = await req.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > MAX_PIECE) return json({ error: "That piece of audio is too big." }, 400, origin);
    // Fair use: counted like the other extras (about 10 "characters" per second of audio).
    const seconds = Math.max(1, Math.min(900, Number(new URL(req.url).searchParams.get("seconds")) || audio.byteLength / 32000));
    const left = await fetch(`${base}/rest/v1/rpc/use_ai`, { method: "POST", headers: admin, body: JSON.stringify({ p_user: userId, p_chars: Math.max(1, Math.round(seconds * 10)) }) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (left === null) return json({ error: "Couldn't check your allowance. Try again." }, 500, origin);
    if (left < 0) return json({ error: "You've reached today's limit for recordings. It resets tomorrow.", limit: true }, 429, origin);

    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/wav" }), "piece.wav");
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) {
      console.error("Groq error", r.status, await r.text().catch(() => ""));
      return json({ error: r.status === 429 ? "The listening service is busy. Try again in a minute." : "Couldn't listen to this part of the recording. Try again." }, 502, origin);
    }
    const out = await r.json();
    return json({ text: String(out.text ?? "").trim() }, 200, origin);
  }

  if (task === "youtube") {
    let id = "";
    try {
      id = String((await req.json())?.id ?? "");
    } catch {
      /* bad body */
    }
    if (!/^[\w-]{11}$/.test(id)) return json({ error: "That doesn't look like a YouTube link." }, 400, origin);
    const got = await youtube(id).catch((e) => {
      console.error(e);
      return null;
    });
    if (!got) return json({ error: "Couldn't get captions for this video." }, 422, origin);
    return json(got, 200, origin);
  }

  return json({ error: "Unknown task" }, 400, origin);
});
