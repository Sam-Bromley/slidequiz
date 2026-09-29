// SlideQuiz AI helper — a Supabase Edge Function.
// The website sends the text of a student's slides here; this asks Claude to write notes,
// questions, flashcards or an answer, and sends back plain JSON. The AI key never leaves Supabase.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  required
//   AI_MODEL           optional, defaults to claude-haiku-4-5-20251001
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.

const MODEL = Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5-20251001";
const MAX_INPUT = 60_000; // characters of slide text per request

const ALLOWED = [/^https:\/\/(www\.)?slidequiz\.co\.uk$/, /^https:\/\/sam-bromley\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED.some((r) => r.test(origin)) ? origin : "https://slidequiz.co.uk",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

type Page = { id: string; label: string; title: string; text: string };

const STYLE = `You write for UK students revising from their own lecture slides.
Use UK spelling. Be accurate: only use what the slides say (you may fix obvious typos and join text broken across lines).
Leave out course admin (module codes, lecturer names, reading lists, learning outcomes, activities, "next week" sign-posting) and reference-list entries or citations.`;

const TASKS: Record<string, { system: string; maxTokens: number; prompt: (b: any, pages: string) => string }> = {
  notes: {
    maxTokens: 16000,
    system: `${STYLE}
You turn slides into clear, concise revision notes that keep every fact.`,
    prompt: (b, pages) => `Lecture: "${b.title}"
Slides (each starts with [id]):
${pages}

Write revision notes grouped into 2–10 topics in lecture order. Each topic has short parts, each with a clear heading (a few words) and bullet points.
Keep every fact, figure and definition; drop filler words. A definition becomes {"term": "…", "text": "…"}. Sub-points use "sub": true.
List the ids of the slides each part comes from, in order, and every slide id must be used at least once.
Reply with JSON only:
{"sections":[{"title":"…","parts":[{"heading":"…","pageIds":["…"],"points":[{"term":"optional","text":"…","sub":false}]}]}]}`,
  },
  questions: {
    maxTokens: 12000,
    system: `${STYLE}
You write multiple-choice revision questions that test understanding, not just recall of wording.`,
    prompt: (b, pages) => `Lecture: "${b.title}"
Slides (each starts with [id]):
${pages}

Write about ${b.count ?? 1} question(s) per slide that has real content, covering every important fact. Each has ONE correct answer and 4 wrong answers that are believable (same kind of thing, similar length, drawn from the same subject) but clearly wrong to someone who knows the material. Never use "all of the above" or "none of the above". Keep options under 20 words.
Reply with JSON only:
{"questions":[{"pageId":"…","question":"…","correct":"…","wrong":["…","…","…","…"],"explanation":"one or two sentences on why the answer is right"}]}`,
  },
  flashcards: {
    maxTokens: 8000,
    system: `${STYLE}
You write flashcards whose answer is one short, specific thing (a term, name, number or short phrase).`,
    prompt: (b, pages) => `Lecture: "${b.title}"
Slides (each starts with [id]):
${pages}

Write flashcards for the facts most worth memorising. Front: a clear question or description. Back: the answer in 1–6 words. No duplicates.
Reply with JSON only:
{"cards":[{"pageId":"…","front":"…","back":"…"}]}`,
  },
  chat: {
    maxTokens: 1500,
    system: `${STYLE}
You answer a student's question about their lecture, using the slides. If the slides don't cover it, say so briefly, then give a short general answer marked as not from their slides. Be concise and friendly. Plain text, no markdown headings.`,
    prompt: (b, pages) => `Lecture: "${b.title}"
Slides (each starts with [id]):
${pages}

Conversation so far:
${(b.history ?? []).map((m: any) => `${m.role === "user" ? "Student" : "You"}: ${m.content}`).join("\n")}

Student: ${b.message}

Reply with JSON only: {"answer":"…","pageIds":["ids of the slides you used"]}`,
  },
};

const json = (data: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, origin);

  const auth = req.headers.get("authorization") ?? "";
  const base = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Only logged-in students.
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!who.ok) return json({ error: "Log in to use AI." }, 401, origin);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400, origin);
  }
  const task = TASKS[body?.task];
  if (!task || !Array.isArray(body.pages)) return json({ error: "Unknown task" }, 400, origin);

  const pages = (body.pages as Page[])
    .map((p) => `[${String(p.id).slice(0, 40)}] ${p.label} — ${p.title}\n${String(p.text).slice(0, 4000)}`)
    .join("\n\n")
    .slice(0, MAX_INPUT);

  // 2. Daily allowance per student (counted in characters sent).
  const use = await fetch(`${base}/rest/v1/rpc/use_ai`, {
    method: "POST",
    headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ p_chars: pages.length + String(body.message ?? "").length }),
  });
  const left = use.ok ? await use.json() : null;
  if (left === null) return json({ error: "Couldn't check your AI allowance." }, 500, origin);
  if (left < 0) return json({ error: "You've used today's AI allowance. It resets tomorrow.", limit: true }, 429, origin);

  // 3. Ask Claude.
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: task.maxTokens, system: task.system, messages: [{ role: "user", content: task.prompt(body, pages) }] }),
  });
  if (!r.ok) return json({ error: "The AI is busy. Try again in a minute." }, 502, origin);
  const out = await r.json();
  const text: string = (out.content ?? []).map((c: any) => c.text ?? "").join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return json(JSON.parse(text.slice(start, end + 1)), 200, origin);
  } catch {
    return json({ error: "The AI's reply was cut short. Try again." }, 502, origin);
  }
});
