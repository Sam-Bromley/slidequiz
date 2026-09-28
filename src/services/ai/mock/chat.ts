import { answersMatch, capitalize, extractDefinitions, keywordSet, stripTrailingPunct, topKeywords, truncate } from "@/lib/text";
import type { SourceRef } from "@/types/models";
import type { ChatReply, ChatRequest, GroundingPage } from "../types";
import { coversPoint } from "./grading";
import { buildKnowledge, refOf, retrieve } from "./knowledge";

const ANALOGIES: { re: RegExp; text: (t: string) => string }[] = [
  { re: /\b(energy|atp|respiration|power)\b/i, text: (t) => `Think of ${t} like a power station for a city: it takes in fuel and converts it into a form everything else can actually use.` },
  { re: /\b(store|storage|stored|encod|memory|retain)\b/i, text: (t) => `Think of ${t} like saving a document: how well you label and file it decides how easily you can find it again later.` },
  { re: /\b(retriev|recall|cue|forget)\b/i, text: (t) => `Think of ${t} like searching a library: the book may be on the shelf, but without the right catalogue entry (a cue) you can't find it.` },
  { re: /\b(copy|replicat|duplicat|template)\b/i, text: (t) => `Think of ${t} like photocopying a master document: each strand acts as the original that a new copy is built against.` },
  { re: /\b(transport|move|carr|deliver|channel|travel)\b/i, text: (t) => `Think of ${t} like a postal network: items are packaged, addressed and moved to where they're needed.` },
  { re: /\b(produc|synthes|manufactur|factory|assembl|build)\b/i, text: (t) => `Think of ${t} like a production line: instructions come in, raw materials are assembled step by step, and a finished product comes out.` },
  { re: /\b(control|regulat|nucleus|govern|parliament|command)\b/i, text: (t) => `Think of ${t} like a control room: it holds the instructions and decides what happens and when.` },
  { re: /\b(barrier|membrane|protect|border|wall)\b/i, text: (t) => `Think of ${t} like a building's security desk: it decides what gets in and out, and keeps the inside stable.` },
  { re: /\b(capacity|limited|limit|rehearsal|short-term)\b/i, text: (t) => `Think of ${t} like a small desk: you can only work on a few things at once before something falls off.` },
  { re: /\b(steam|engine|machine|mechani|factor|industr|mill)\b/i, text: (t) => `Think of ${t} like upgrading from hand tools to power tools: the same work gets done far faster, which changes who does the work and where.` },
  { re: /\b(city|urban|migration|population|workers)\b/i, text: (t) => `Think of ${t} like a new business district opening: jobs pull people in faster than housing and services can keep up.` },
];

const QUESTION_START = /^(what|why|how|when|where|who|which|explain|describe|define|tell|can|could|is|are|does|do|give|compare|summar)/i;

function uniqRefs(pages: GroundingPage[]): SourceRef[] {
  return [...new Map(pages.map((p) => [p.id, refOf(p)])).values()];
}

function simplify(s: string) {
  return capitalize(
    stripTrailingPunct(
      s
        .replace(/\([^)]*\)/g, "")
        .split(/;|, which|, whereas| — /)[0]
        .replace(/\s+/g, " ")
        .trim(),
    ),
  ) + ".";
}

function lastAsk(req: ChatRequest) {
  return [...req.history].reverse().find((m) => m.role === "assistant" && m.expectedAnswer);
}

function lastUserQuestion(req: ChatRequest) {
  return [...req.history].reverse().find((m) => m.role === "user" && QUESTION_START.test(m.content.trim()))?.content;
}

export function chatReply(req: ChatRequest): ChatReply {
  const msg = req.message.trim();
  const pending = lastAsk(req);
  const lastMsg = req.history[req.history.length - 1];
  const isAnswering = pending && lastMsg?.id === pending.id && req.mode === "answer" && !/\?$/.test(msg) && !QUESTION_START.test(msg);

  if (isAnswering && pending?.expectedAnswer) {
    const expected = pending.expectedAnswer;
    const ok = answersMatch(msg, [expected]) || coversPoint(keywordSet(msg), expected);
    const cites = pending.citations ?? [];
    if (ok) {
      return {
        content: `**Yes, that's right.** ${capitalize(stripTrailingPunct(expected))}.\n\nWant to keep going? Tap **Test me** for another question, or ask about something else.`,
        citations: cites,
      };
    }
    if (req.tutor && (pending.tutorStep ?? 1) < 2) {
      const kw = topKeywords(expected, 3);
      return {
        content: `Not quite yet, but let's narrow it down. **Hint:** your answer should mention ${kw.length ? kw.map((k) => `“${k}”`).join(" and ") : "the key term"}. Have another look at ${cites.map((c) => c.label).join(", ") || "your notes"} and try again.`,
        citations: cites,
        expectedAnswer: expected,
        tutorStep: 2,
      };
    }
    return {
      content: `**Not quite.** The answer from your notes is: ${capitalize(stripTrailingPunct(expected))}.\n\nIt's worth adding this to your flashcards. We'll bring it back for review.`,
      citations: cites,
    };
  }

  const query = req.mode !== "answer" && (!msg || msg.length < 3) ? lastUserQuestion(req) ?? msg : msg;
  const raw = retrieve(req.pages, query, 6);
  const hits = raw.filter((h) => h.score >= raw[0].score * 0.5);
  if (!hits.length) {
    const topics = [...new Set(req.pages.map((p) => p.title))].slice(0, 4);
    return {
      content: `I couldn't find that in **${req.materialTitle}**. I only answer from your uploaded notes, so I won't guess.\n\nTry rephrasing, or ask about: ${topics.map((t) => `“${t}”`).join(", ")}.`,
      citations: [],
    };
  }
  const top = hits[0];
  const cites = uniqRefs(hits.slice(0, req.mode === "depth" ? 4 : 2).map((h) => h.page));
  const def = extractDefinitions(hits.map((h) => h.text).join("\n"))[0];
  const subject = def?.term ?? topKeywords(query, 2).join(" ") ?? "this";

  if (req.tutor && req.mode === "answer") {
    if (def) {
      return {
        content: `Let's work it out together rather than me just telling you.\n\n**Question:** In your own words, what is ${def.term}? Think about what it *does* or what it's *for*.\n\nHave a go. Even a partial answer is fine.`,
        citations: [refOf(top.page)],
        expectedAnswer: def.definition,
        tutorStep: 1,
      };
    }
    const kb = buildKnowledge([top.page]);
    const term = kb.keyTerms.find((t) => new RegExp(`\\b${t}\\b`, "i").test(top.text) && t.length > 4);
    if (term) {
      return {
        content: `Good question. Let's reason it through.\n\nYour notes say: “${top.text.replace(new RegExp(`\\b${term}\\b`, "i"), "_____")}”\n\n**What do you think fills the gap, and why?**`,
        citations: [refOf(top.page)],
        expectedAnswer: term,
        tutorStep: 1,
      };
    }
  }

  switch (req.mode) {
    case "simple":
      return {
        content: `**In simple terms:** ${simplify(top.text)}${def ? `\n\n**One-liner:** ${def.term} = ${truncate(stripTrailingPunct(def.definition.split(/[;,]/)[0]), 90)}.` : ""}`,
        citations: [refOf(top.page)],
      };
    case "depth": {
      const body = hits.slice(0, 4).map((h) => `- ${stripTrailingPunct(h.text)}. *(${h.page.label})*`).join("\n");
      const related = hits.slice(4).map((h) => h.page.title).filter((t, i, a) => a.indexOf(t) === i);
      return {
        content: `**In depth**\n\n${body}${related.length ? `\n\n**How it connects:** this links to ${related.map((r) => `“${r}”`).join(" and ")}.` : ""}`,
        citations: cites,
      };
    }
    case "analogy": {
      const a = ANALOGIES.find((x) => x.re.test(top.text + " " + query));
      const t = def?.term ?? capitalize(subject);
      return {
        content: `**Analogy:** this comparison is mine; the facts below come from your notes.\n\n${(a ?? { text: (x: string) => `Think of ${x} as one step in a recipe: it only makes sense in relation to what comes before and after it.` }).text(/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t)}\n\n**What your notes actually say:** ${top.text}`,
        citations: [refOf(top.page)],
      };
    }
    case "example": {
      const ex = hits.find((h) => /\b(for example|e\.g\.|such as|for instance)\b/i.test(h.text));
      return ex
        ? { content: `**Example from your notes:** ${ex.text}`, citations: [refOf(ex.page)] }
        : {
            content: `Your notes don't include a worked example for this, so I won't invent one. Here's the key idea to apply to your own example:\n\n${top.text}\n\nTry describing a situation where this happens, then ask me to check it.`,
            citations: [refOf(top.page)],
          };
    }
    case "test": {
      if (def)
        return {
          content: `**Quick check:** What is ${def.term}?\n\nType your answer below.`,
          citations: [refOf(top.page)],
          expectedAnswer: def.definition,
        };
      const kb = buildKnowledge([top.page]);
      const term = kb.keyTerms.find((t) => new RegExp(`\\b${t}\\b`, "i").test(top.text) && t.length > 4);
      if (term)
        return {
          content: `**Quick check:** Fill in the blank.\n\n“${top.text.replace(new RegExp(`\\b${term}\\b`, "i"), "_____")}”`,
          citations: [refOf(top.page)],
          expectedAnswer: term,
        };
      return { content: `**Quick check:** In one or two sentences, summarise what ${top.page.label} (“${top.page.title}”) says.`, citations: [refOf(top.page)], expectedAnswer: top.text };
    }
    default: {
      const extra = hits.slice(1, 3).filter((h) => h.text !== top.text);
      return {
        content: `${top.text}${extra.length ? "\n\n" + extra.map((h) => h.text).join(" ") : ""}`,
        citations: cites,
      };
    }
  }
}
