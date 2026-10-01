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
Write tidily: plain text only, no bullet characters, numbering, markdown or stray symbols; no doubled or dangling punctuation; no unfinished brackets.
State facts directly, as facts. Never refer to the slides, lecture, notes or text themselves: never write "the slide defines", "the lecture states", "according to the slides", "as mentioned" or anything like it. Be concise: only the useful information, no filler.
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
Also give the subject in one or two words (e.g. "Biology", "Psychology", "Modern History").
Reply with JSON only:
{"subject":"…","sections":[{"title":"…","parts":[{"heading":"…","pageIds":["…"],"points":[{"term":"optional","text":"…","sub":false}]}]}]}`,
  },
  questions: {
    maxTokens: 12000,
    system: `${STYLE}
You write multiple-choice revision questions that test understanding, not just recall of wording.`,
    prompt: (b, pages) => `Lecture: "${b.title}"
Slides (each starts with [id]):
${pages}

Write about ${b.count ?? 1} question(s) per slide that has real content, covering every important fact. Each has ONE correct answer and 4 wrong answers that are believable (same kind of thing, similar length, drawn from the same subject) but clearly wrong to someone who knows the material. Never use "all of the above" or "none of the above". Write each question directly about the subject (e.g. "What does transfusion and transplantation study?"), never "What does the slide say about…". Explanations state the fact itself, e.g. "Transfusion and transplantation is the study of blood, tissue and organ donation and transplants, including blood banking and histocompatibility." Keep options under 20 words. Every option starts with a capital letter, has no full stop at the end, and is written in the same style and length as the others so the right one doesn't stand out.
Reply with JSON only:
{"questions":[{"pageId":"…","question":"…","correct":"…","wrong":["…","…","…","…"],"explanation":"one short sentence giving the key fact that makes the answer right, stated directly"}]}`,
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

/* ---------------------------------------------------------------- essays (Pro) */

const LEVEL: Record<string, string> = { gcse: "GCSE", alevel: "A-level", uni: "university" };
const rubricBlock = (b: any) => {
  const r = String(b.rubric ?? "").trim().slice(0, 8000);
  return r ? `The student's marking criteria / mark scheme (aim everything at these; use their own criterion names, e.g. "AO2" or "Critical analysis"):\n<<<\n${r}\n>>>` : "No marking criteria were given: use the usual criteria for this level (knowledge, application, analysis, evaluation, structure).";
};
const ESSAY_STYLE = `You help UK students prepare for essay questions on their own lecture material. Use UK spelling. Be accurate: base everything on the lecture text given. Plain text only inside JSON strings (no markdown, no bullet characters).`;

Object.assign(TASKS, {
  essayQuestions: {
    maxTokens: 4000,
    system: ESSAY_STYLE,
    prompt: (b: any, pages: string) => `Course material: "${b.title}"
Level: ${LEVEL[b.level] ?? "university"}${b.marks ? `. Typical essay: ${b.marks} marks` : ""}${b.words ? `, about ${b.words} words` : ""}.
${rubricBlock(b)}

Lecture text (each slide starts with [id]):
${pages}

Write ${Math.min(10, Math.max(3, Number(b.count) || 6))} different essay questions a student could be set on this material, like real exam questions. Use real command words (Evaluate, Discuss, To what extent, Compare, Analyse, Assess, Explain). Mix difficulty. Each must be answerable from the lecture, and together they should cover the main topics.${Array.isArray(b.avoid) && b.avoid.length ? `\nDon't repeat these existing questions:\n${b.avoid.slice(0, 20).map((q: string) => "- " + String(q).slice(0, 200)).join("\n")}` : ""}
For each, say which of the marking criteria it tests most (short names) and in a few words what it focuses on.
Reply with JSON only:
{"questions":[{"question":"…","command":"Evaluate","marks":${Number(b.marks) || 25},"difficulty":"easy|medium|hard","criteria":["…"],"focus":"…"}]}`,
  },
  essayPlan: {
    maxTokens: 5000,
    system: ESSAY_STYLE + " You write essay plans, never full essays: short, specific notes the student turns into their own writing.",
    prompt: (b: any, pages: string) => `Course material: "${b.title}"
Level: ${LEVEL[b.level] ?? "university"}. Question (${Number(b.marks) || 25} marks${b.words ? `, about ${b.words} words` : ""}):
"${String(b.question ?? "").slice(0, 600)}"
${rubricBlock(b)}

Lecture text (each slide starts with [id]):
${pages}

Write a plan for a top-band answer. Keep every line short (one sentence). Give:
- thesis: the one-sentence argument that answers the question directly
- intro: what the introduction should do (one or two short sentences)
- paragraphs: 3 to 5 main paragraphs in a sensible order; each has a point (topic sentence idea), 1 to 3 pieces of evidence from the lecture (each with the id of the slide it comes from), analysis (why it matters / how it answers the question), and the criteria it earns marks for
- counter: the strongest counter-argument and how to respond to it (evaluation)
- conclusion: the judgement to reach
- tips: 2 or 3 short tips for hitting the top band of these criteria
Reply with JSON only:
{"thesis":"…","intro":"…","paragraphs":[{"point":"…","evidence":[{"text":"…","pageId":"…"}],"analysis":"…","criteria":["…"]}],"counter":{"point":"…","response":"…"},"conclusion":"…","tips":["…"]}`,
  },
});

const PRO_ONLY = new Set(["essayQuestions", "essayPlan"]);

const json = (data: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, origin);

  const auth = req.headers.get("authorization") ?? "";
  const base = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Only SlideQuiz users: a logged-in student or a guest pass from the website.
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!who.ok) return json({ error: "Not allowed." }, 401, origin);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400, origin);
  }
  const task = TASKS[body?.task];
  if (!task || !Array.isArray(body.pages)) return json({ error: "Unknown task" }, 400, origin);

  // Essays are part of SlideQuiz Pro.
  if (PRO_ONLY.has(body.task)) {
    const plan = await fetch(`${base}/rest/v1/rpc/sq_plan`, { method: "POST", headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" }, body: "{}" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (plan !== "plus") return json({ error: "Essays are part of SlideQuiz Pro." }, 403, origin);
  }

  const pages = (body.pages as Page[])
    .map((p) => `[${String(p.id).slice(0, 40)}] ${p.label} — ${p.title}\n${String(p.text).slice(0, 4000)}`)
    .join("\n\n")
    .slice(0, MAX_INPUT);

  // 2. Allowance. Notes and questions count towards the student's AI lectures (the same text
  //    only once); flashcards and questions about the notes are fair use, counted per day.
  const headers = { apikey: anon, Authorization: auth, "Content-Type": "application/json" };
  let left: number | null = null;
  if (body.task === "notes" || body.task === "questions") {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pages));
    const hash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
    const use = await fetch(`${base}/rest/v1/rpc/use_lecture_text`, { method: "POST", headers, body: JSON.stringify({ p_hash: hash, p_chars: pages.length }) });
    left = use.ok ? await use.json() : null;
    if (left === -1) return json({ error: "You've used your AI lectures for now.", limit: true }, 429, origin);
  } else {
    const extra = String(body.message ?? "").length + String(body.rubric ?? "").slice(0, 8000).length;
    const use = await fetch(`${base}/rest/v1/rpc/use_ai`, { method: "POST", headers, body: JSON.stringify({ p_chars: pages.length + extra }) });
    left = use.ok ? await use.json() : null;
    if (left === -1) return json({ error: "You've used today's fair use of AI. It resets tomorrow.", limit: true }, 429, origin);
  }
  if (left === null) return json({ error: "Couldn't check your AI allowance." }, 500, origin);
  if (left === -2) return json({ error: "SlideQuiz is very busy today. Try again tomorrow.", limit: true, busy: true }, 429, origin);

  // 3. Ask Claude.
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: task.maxTokens, system: task.system, messages: [{ role: "user", content: task.prompt(body, pages) }] }),
  });
  if (!r.ok) {
    const detail = String((await r.json().catch(() => null))?.error?.message ?? r.status);
    console.error("Anthropic error:", detail);
    const reason = /credit|billing|balance/i.test(detail) ? "the AI account is out of credit" : r.status === 401 ? "the AI key isn't set up" : r.status === 429 || r.status === 529 ? "the AI is busy" : `AI error ${r.status}`;
    return json({ error: `Couldn't write this right now (${reason}). Try again in a minute.` }, 502, origin);
  }
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
