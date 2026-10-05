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

Write about ${b.count ?? 1} question(s) per slide that has real content, covering every important fact.${Array.isArray(b.avoid) && b.avoid.length ? ` These questions already exist, so write different ones (other facts, or the same facts from a new angle):\n${b.avoid.slice(0, 80).map((q: string) => "- " + String(q).slice(0, 160)).join("\n")}\n` : ""} Each has ONE correct answer and 4 wrong answers that are believable (same kind of thing, drawn from the same subject) but clearly wrong to someone who knows the material. Never use "all of the above" or "none of the above". Write each question directly about the subject (e.g. "What does transfusion and transplantation study?"), never "What does the slide say about…". Explanations state the fact itself, e.g. "Transfusion and transplantation is the study of blood, tissue and organ donation and transplants, including blood banking and histocompatibility." Keep options under 20 words. Every option starts with a capital letter. If a question's options are full sentences, end every one of them with a full stop; if they are short phrases or single terms, use no full stops. Treat all options of a question the same way. Questions end with a question mark, and explanations are full sentences ending with a full stop.
The right answer must NOT stand out: all 5 options must be about the same length (within a few words of each other), equally detailed, equally specific, equally technical and in the same grammatical form. Never make the correct option the longest, the most precise or the only one with a qualifier; often a wrong option should be the longest. Don't let the question's wording hint at the answer (no repeated keywords only in the right option).
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

/* ---------------------------------------------------------------- essays */

const LEVEL: Record<string, string> = { gcse: "GCSE", alevel: "A-level", uni: "university" };
/** The level, or (when the student hasn't said) a note to pitch it at the level of the lecture material. */
const levelOf = (b: any) => LEVEL[b.level] ?? "not given: pitch it at the level the lecture material suggests";
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
Level: ${levelOf(b)}${b.marks ? `. Typical essay: ${b.marks} marks` : ""}${b.words ? `, about ${b.words} words` : ""}.
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
Level: ${levelOf(b)}. Question (${Number(b.marks) || 25} marks${b.words ? `, about ${b.words} words` : ""}):
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

/* ---------------------------------------------------------------- essay feedback */

const ESSAY_GUIDE = `WHAT A GOOD ESSAY DOES

Structure. The introduction explains the focus and establishes why the subject matters. The body builds logical arguments supported by evidence and data, clearly organised. The conclusion wraps up the argument and reinforces the key points.

Introduction should have: 1) brief background context (why the topic matters, without detail that belongs in the body); 2) key terms defined; 3) the problem or question the essay addresses; 4) the scope (what it covers, sometimes what it won't); 5) a clear, concise thesis statement giving the main argument.
Introduction tips: start broad, then narrow to the specific focus; set the stage, don't tell the whole story; formal, objective language; no results or conclusions; concise, usually 10 to 15% of the word count.
Introduction mistakes: starting with a dictionary definition; vague openers like "In this essay I will talk about"; unsupported claims or opinions; so much background it overwhelms the reader; no thesis statement; exaggeration or sensationalism ("the perfect solution", "the most important").

Body: each paragraph focuses on one main idea that supports the thesis and starts with a topic sentence; evidence (data, examples, credible sources) supports each point; the evidence is explained and analysed, not just stated (what it means and how it relates to the argument); paragraphs are in a logical order with transitions; it stays focused and objective.
Body tips: one main idea per paragraph; evidence such as studies, data and experiments; objective analysis, not personal opinion; transitions like "Furthermore", "In contrast", "As a result"; concise and precise; the relevance is clear.
Body mistakes: several ideas in one paragraph; evidence without explaining its relevance; paragraphs too short (underdeveloped) or too long (confusing); not connecting the paragraph to the overall argument; informal or conversational language.

A paragraph is a mini essay: its topic sentence flows from the previous paragraph and its last sentence links to the next.

Conclusion should: 1) restate the thesis (not word for word); 2) summarise the key findings; 3) discuss implications (why the findings matter in the subject); 4) optionally suggest future directions or unanswered questions.
Conclusion tips: concise, usually one paragraph or about 10% of the essay; no new information or evidence; formal, objective language; a strong final sentence that reinforces why the argument matters.
Conclusion mistakes: repeating the introduction or body word for word; new data, citations or arguments; ending abruptly without summarising or reflecting; vague lines like "In conclusion, microbiology is important."; unsupported claims or personal opinions.

Coherent narrative: ideas flow logically and smoothly; each paragraph connects clearly to the next and the argument builds. Built by: topic sentences; logical order with transitions ("In contrast", "Furthermore", "This leads to"); staying focused (every paragraph supports the thesis); consistent terminology (terms defined early, used consistently); linking back to the thesis throughout.

Style for science subjects: third person (he, she, it, they, Smith et al.); past tense; correct grammar and spelling; abbreviations defined at first use, e.g. Polymerase Chain Reaction (PCR), then PCR thereafter; Latin species names italicised with a capital genus (Escherichia coli first, then E. coli). Avoid: clichés; contractions; subjective descriptions ("a fascinating discovery"); over-complicated language; mixing tenses; first person ("I propose that"); passive phrases like "it is believed that".
Figures and tables (science): only if they add value; clear title and caption (below a figure, above a table); numbered in order and referred to in the text; self-explanatory; cite the source at the end of the legend if copied.
For other subjects use the same principles in that subject's terms: evidence might be sources, quotations, case law or examples rather than experiments; keep formal, objective, consistent style and the subject's usual conventions.`;

Object.assign(TASKS, {
  essayFeedback: {
    maxTokens: 3500,
    system: `You are a supportive, precise essay tutor for UK students. Use UK spelling. You give feedback on a student's essay plan or draft, written in labelled boxes. Plain text only inside JSON strings (no markdown, no bullet characters). Speak to the student as "you". Never rewrite the essay for them; say what to change and why, briefly, quoting a few of their words where useful.`,
    prompt: (b: any, pages: string) => `Level: ${levelOf(b)}. Subject: ${String(b.subject ?? "General").slice(0, 80)}. Target length: about ${Number(b.words) || 1500} words.
Essay question: "${String(b.question ?? "").slice(0, 600)}"
${String(b.rubric ?? "").trim() ? `The student's own marking criteria (use them too):\n<<<\n${String(b.rubric).slice(0, 6000)}\n>>>\n` : ""}
${ESSAY_GUIDE}

Lecture material, for checking facts and suggesting evidence (each slide starts with [id]):
${pages}

The student's essay, box by box (empty boxes say "(empty)"):
<<<
${String(b.essay ?? "").slice(0, 20000)}
>>>

Give feedback against the guide above (use the science style and figures rules only if the subject is a science). It may be a plan with short notes or a full draft: judge it for what it is and don't punish note form in a plan. Check facts against the lecture. Point out empty boxes that matter (e.g. no thesis) but don't list every empty box. Each note goes on the exact box it's about, using the label in square brackets (e.g. "intro.thesis", "point2.evidence", "conclusion.final", "references"); use "flow" for how the paragraphs connect, "style" for language and tone across the essay, and "question" if the essay doesn't answer the question. Keep each note to one or two sentences and make it actionable. Up to 12 notes, most important first.
Reply with JSON only:
{"overall":"two or three sentences on how it's going and the single most important next step","strengths":["…"],"notes":[{"box":"intro.thesis","text":"…"}]}`,
  },
});

/* ---------------------------------------------------------------- written answers (free, fair use) */

Object.assign(TASKS, {
  writtenQuestions: {
    maxTokens: 6000,
    system: `${STYLE}
You are an experienced exam writer. You write short written-answer questions (worth 1 to 6 marks) with precise mark schemes, like real exam papers.`,
    prompt: (b: any, pages: string) => `Lecture: "${b.title}"
Slides (each starts with [id]):
${pages}

Write ${Math.min(10, Math.max(3, Number(b.count) || 6))} different written-answer questions on this lecture.
Questions:
- Each tests one clear idea from the lecture and can be fully answered from the slides alone. No trick questions, nothing vague ("Discuss X") and nothing trivial.
- Start each question (and each part of a two-part question) with one of these command words, used exactly as exams use them:
  - "State", "Name", "Give", "Identify": just the fact, term or item. No explanation is needed or credited. 1 mark per item asked for.
  - "Define": what the term means, in one sentence. 1 to 2 marks.
  - "Outline" or "Describe": what something is or what happens, with no reasons needed. 1 mark per relevant detail.
  - "Explain": a point plus why or how (the reason, cause or mechanism). Usually 2 marks per point explained: 1 for the point, 1 for the reason.
  - "Compare": similarities and/or differences between two named things.
  - "Evaluate": strengths and weaknesses (pros and cons). Ask for both sides; for 2 marks, one strength and one weakness.
- Two-part questions are fine when the parts are clearly separate, e.g. "State one strength of the multi-store model and evaluate its use of case studies." Make the marks add up exactly: e.g. 3 marks = 1 for stating + 1 for a strength + 1 for a weakness.
- Match the command word to what is actually wanted: never "Explain" for a bare fact, never "State" when a reason is needed. Mix sizes, mostly 1 to 4 marks.
- Say exactly how many things are wanted, e.g. "Name two…", "Explain one reason why…", "Give one strength and one weakness of…", so a student knows how much to write.
- Word every question clearly and simply, so a student understands it on first read: plain English, under 30 words, using the lecture's key terms.
- Ask one thing only. If more than one point is needed, say how many ("Give two…", "Describe three…").
- Name the topic in the question itself: never "it", "this process", "the above" or anything that needs context to understand.
- Leave out anything the student doesn't need to answer it, and never give the answer away in the question.
- Before replying, reread each question: if it could be misread or answered in different ways, rewrite it.
- Write each question as a full sentence: questions starting with a question word end with a question mark; command-word questions ("Explain why…") end with a full stop.
- Cover different topics across the lecture and don't repeat anything below.${Array.isArray(b.avoid) && b.avoid.length ? `\nAlready asked:\n${b.avoid.slice(0, 30).map((q: string) => "- " + String(q).slice(0, 200)).join("\n")}` : ""}
Mark scheme:
- One creditworthy point per mark: each point is a single, specific, checkable idea (not a vague theme), written as a full sentence ending with a full stop. Put acceptable alternatives and wordings in brackets, e.g. "(accept …)".
- The mark scheme follows the command word. "State"/"Name"/"Give" points are just the fact itself; never require an explanation for them. "Explain" points include the reason. For "Evaluate", label points "Strength: …" or "Weakness: …" and include one mark for each side asked for, with other valid strengths or weaknesses accepted in brackets. For two-part questions, start each point with its part, e.g. "State: …", "Strength: …", "Weakness: …".
- Give exactly as many points as marks, one per mark, unless a mark can be earned several ways; then list the alternatives inside that point's brackets rather than as extra points.
- Give each point the id of the slide it comes from.
- Model answer: a concise answer in full sentences, ending with full stops, that would get full marks and no more, the way a strong student would write it. For "State", "Name" or "Give", just the answer itself with no explanation.
Reply with JSON only:
{"questions":[{"question":"…","marks":3,"points":[{"text":"…","pageId":"…"}],"model":"…"}]}`,
  },
  markWritten: {
    maxTokens: 1200,
    system: `${STYLE}
You are a fair, experienced examiner marking a student's short written answer against a mark scheme. Speak to the student as "you", warmly and briefly.
How to mark:
- Award a mark scheme point only if the answer clearly gets that idea across and it is correct. Accept any wording that shows the same understanding, including spelling mistakes; never require exact phrases.
- Don't credit vague answers, keywords dropped in without meaning, or a point that is contradicted elsewhere in the answer.
- Mark to the command word. "State", "Name", "Give", "Identify": a correct fact, term or item gets the mark on its own, even as a single word or phrase; never ask for or expect an explanation, and never suggest adding one. "Explain": the reason or mechanism is needed for the explanation mark. "Evaluate": strength marks need a real strength and weakness marks a real weakness; two strengths can't earn a weakness mark.
- Only give as many items as the question asks for credit: if it asks for one and the answer lists several, mark the first one.
- One mark per point. Never award more than the marks available. A blank, off-topic or "don't know" answer gets 0.
- Feedback and "improve" must fit the command word: for "State" or "Name" questions, if the answer is right, it is complete.
- Feedback refers to the content itself, never to point numbers or "the mark scheme". Write full sentences that end with full stops.`,
    prompt: (b: any) => `Question (${Number(b.marks) || 1} marks): ${String(b.question ?? "").slice(0, 600)}
Mark scheme points (one mark each, up to the total):
${(Array.isArray(b.points) ? b.points : []).slice(0, 12).map((p: any, i: number) => `${i}. ${String(p?.text ?? p).slice(0, 300)}`).join("\n")}
Model answer: ${String(b.model ?? "").slice(0, 800)}

Student's answer:
<<<
${String(b.answer ?? "").slice(0, 3000)}
>>>

Mark it. List which mark scheme points (by number) the answer earns; "awarded" is how many marks that gives, up to the total. Then "feedback": one or two short sentences on what was good and what was missing. Then "improve": the single most useful thing to add or fix for more marks, as one sentence (empty if full marks).
Reply with JSON only:
{"awarded":2,"hit":[0,2],"feedback":"…","improve":"…"}`,
  },
});

/* ---------------------------------------------------------------- references: read a web page's details (no AI) */

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;
const safeUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname) || /^\d+$/.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
};
const decodeHtml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();

async function readPage(raw: string) {
  let u = safeUrl(raw.trim());
  if (!u) return { error: "That link doesn't look right." };
  // YouTube: its own small API gives the title and channel.
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(u.hostname)) {
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.href)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (o?.title) return { type: "video", title: o.title, authors: o.author_name ? [o.author_name] : [], site: "YouTube", url: u.href };
  }
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(u.href, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; SlideQuizCite/1.0; +https://slidequiz.co.uk)", Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res) return { error: "Couldn't open that page." };
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = safeUrl(new URL(res.headers.get("location")!, u).href);
      if (!next) return { error: "Couldn't open that page." };
      u = next;
      continue;
    }
    break;
  }
  if (!res || !res.ok || !/html/i.test(res.headers.get("content-type") ?? "html")) return { error: "Couldn't read that page." };
  // Only the start of the page is needed (the details are in the <head>).
  const reader = res.body!.getReader();
  let html = "";
  const dec = new TextDecoder();
  while (html.length < 600_000) {
    const { done, value } = await reader.read();
    if (done) break;
    html += dec.decode(value, { stream: true });
    if (/<\/head>/i.test(html) && html.length > 20_000) break;
  }
  reader.cancel().catch(() => {});

  const metas: [string, string][] = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/\b(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i) ?? [])[1];
    const val = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) ?? [])[1];
    if (key && val) metas.push([key.toLowerCase(), decodeHtml(val)]);
  }
  const one = (...keys: string[]) => keys.map((k) => metas.find(([n]) => n === k)?.[1]).find(Boolean) ?? "";
  const all = (k: string) => metas.filter(([n]) => n === k).map(([, v]) => v);

  // Structured data many news sites and blogs include.
  let ld: any = {};
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const items = (Array.isArray(j) ? j : j["@graph"] ?? [j]).flat();
      const best = items.find((x: any) => /Article|BlogPosting|Report|ScholarlyArticle|WebPage|VideoObject/i.test(String(x?.["@type"])) && (x.headline || x.name));
      if (best) {
        ld = best;
        break;
      }
    } catch {
      /* ignore broken JSON */
    }
  }
  const ldAuthors = (Array.isArray(ld.author) ? ld.author : ld.author ? [ld.author] : []).map((a: any) => (typeof a === "string" ? a : a?.name)).filter(Boolean);

  const scholarly = !!one("citation_title");
  const authors = scholarly ? all("citation_author") : ldAuthors.length ? ldAuthors : all("author").concat(all("article:author").filter((a) => !/^https?:/.test(a))).concat(all("dc.creator"));
  const title = one("citation_title", "og:title", "twitter:title", "dc.title") || String(ld.headline ?? ld.name ?? "") || decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "");
  const site = one("og:site_name", "application-name") || String(ld.publisher?.name ?? "");
  const date = one("citation_publication_date", "citation_date", "citation_online_date", "article:published_time", "dc.date", "date", "datepublished", "uploaddate") || String(ld.datePublished ?? "");
  const first = one("citation_firstpage"), last = one("citation_lastpage");
  const doi = one("citation_doi", "dc.identifier").replace(/^doi:\s*/i, "");
  return {
    type: scholarly && one("citation_journal_title") ? "article" : /video/i.test(one("og:type")) ? "video" : one("citation_technical_report_number") ? "report" : "website",
    title: title.replace(/\s+[|\-–—]\s+[^|\-–—]{2,40}$/, (m) => (site && m.toLowerCase().includes(site.toLowerCase()) ? "" : m)).slice(0, 400),
    authors: [...new Set(authors.map((a: string) => decodeHtml(a)).filter((a: string) => a && a.length < 100))].slice(0, 12),
    site,
    date: String(date).replace(/\//g, "-").slice(0, 10),
    doi: /^10\.\d{4,9}\//.test(doi) ? doi : "",
    container: one("citation_journal_title"),
    volume: one("citation_volume"),
    issue: one("citation_issue"),
    pages: first ? (last ? `${first}-${last}` : first) : "",
    publisher: one("citation_publisher", "dc.publisher"),
    url: one("og:url") && safeUrl(one("og:url")) ? one("og:url") : u.href,
  };
}

const PRO_ONLY = new Set<string>([]); // essays are free for everyone now

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
  const userId = String((await who.json().catch(() => null))?.id ?? "");
  if (!userId) return json({ error: "Not allowed." }, 401, origin);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400, origin);
  }
  // References: read a web page's title, authors and date. No AI, so it doesn't use any allowance.
  if (body?.task === "cite") {
    const info = await readPage(String(body.url ?? "")).catch(() => ({ error: "Couldn't read that page." }));
    return json(info, "error" in info ? 422 : 200, origin);
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
  // Usage is counted by the server only (students can't call these themselves).
  // SUPABASE_SERVICE_ROLE_KEY is provided to Edge Functions by Supabase automatically.
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  let left: number | null = null;
  const sha = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  // What uses credits, and how much (1 credit = 30,000 characters). The same request is only
  // charged once a month, so "Try again" after an error is free.
  let charge: { key: string; chars: number } | null = null;
  if (body.task === "notes" || body.task === "questions") charge = { key: await sha(pages), chars: pages.length };
  else if (body.task === "flashcards") charge = { key: "cards:" + (await sha(pages)), chars: pages.length };
  else if (body.task === "writtenQuestions") charge = { key: "written:" + (await sha(pages + JSON.stringify(body.avoid ?? []) + String(body.count ?? ""))), chars: Math.ceil(pages.length / 2) };
  else if (body.task === "essayFeedback") charge = { key: "essay:" + (await sha(String(body.essay ?? "") + String(body.question ?? ""))), chars: 30000 };
  if (charge) {
    const use = await fetch(`${base}/rest/v1/rpc/use_lecture_text`, { method: "POST", headers, body: JSON.stringify({ p_user: userId, p_hash: charge.key, p_chars: Math.max(1, charge.chars) }) });
    left = use.ok ? await use.json() : null;
    if (left === -1) return json({ error: "You've run out of credits.", limit: true, credits: true }, 429, origin);
  } else {
    const extra = String(body.message ?? "").length + String(body.rubric ?? "").slice(0, 8000).length + String(body.answer ?? "").slice(0, 3000).length + String(body.essay ?? "").slice(0, 20000).length + (body.task === "markWritten" ? 1500 : 0);
    const use = await fetch(`${base}/rest/v1/rpc/use_ai`, { method: "POST", headers, body: JSON.stringify({ p_user: userId, p_chars: Math.max(1, pages.length + extra) }) });
    left = use.ok ? await use.json() : null;
    if (left === -1) return json({ error: "You've reached today's limit. It resets tomorrow.", limit: true }, 429, origin);
  }
  if (left === null) return json({ error: "Couldn't check your credits. Try again." }, 500, origin);
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
    const busy = r.status === 429 || r.status === 529;
    return json({ error: busy ? "SlideQuiz is busy right now. Try again in a minute." : `Couldn't write this right now (error ${r.status}). Try again in a minute.` }, 502, origin);
  }
  const out = await r.json();
  const text: string = (out.content ?? []).map((c: any) => c.text ?? "").join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return json(JSON.parse(text.slice(start, end + 1)), 200, origin);
  } catch {
    return json({ error: "The reply was cut short. Try again." }, 502, origin);
  }
});
