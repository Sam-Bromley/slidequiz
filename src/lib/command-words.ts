/** Exam command words and what each one asks for, in plain words. */
const GUIDE: Record<string, string> = {
  state: "just say it, no explanation needed",
  name: "just name it, no explanation needed",
  give: "just give it, no explanation needed",
  identify: "just name it, no explanation needed",
  list: "just list them, no explanation needed",
  define: "say what it means in a sentence",
  outline: "briefly say what it is or what happens",
  describe: "say what it is or what happens, no need to say why",
  explain: "say why or how, with a reason",
  compare: "give similarities and differences",
  evaluate: "give strengths and weaknesses",
  assess: "give strengths and weaknesses",
};

const WORDS = Object.keys(GUIDE).join("|");
/** A command word at the start of the question or after "and", "then" or punctuation. */
const COMMAND = new RegExp(`(^|[.;,:]\\s+|\\band\\s+|\\bthen\\s+)(${WORDS})\\b`, "gi");

/** Splits a question into plain text and command words, in order. */
export function commandParts(question: string): { text: string; command?: boolean }[] {
  const parts: { text: string; command?: boolean }[] = [];
  let at = 0;
  for (const m of question.matchAll(COMMAND)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > at) parts.push({ text: question.slice(at, start) });
    parts.push({ text: m[2], command: true });
    at = start + m[2].length;
  }
  if (at < question.length) parts.push({ text: question.slice(at) });
  return parts;
}

/** One short line on what the question's command words ask for, e.g. "State: just say it… · Evaluate: …". */
export function commandHints(question: string): { word: string; hint: string }[] {
  const seen = new Set<string>();
  const out: { word: string; hint: string }[] = [];
  for (const p of commandParts(question)) {
    if (!p.command) continue;
    const key = p.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ word: key[0].toUpperCase() + key.slice(1), hint: GUIDE[key] });
  }
  return out;
}
