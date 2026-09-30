/**
 * Final tidy-up for anything shown to students: notes, questions, answer options,
 * explanations and flashcards. Slides are full of stray bullets, dangling dashes, doubled
 * punctuation and half-finished brackets; none of that should reach the screen.
 */

const BULLETS = /^[\s•●○■□▪◦·➢➤►▶✓✔\-–—*>]+/;
/** "1.", "2)", "(3)", "a)", "(b)", "iv." at the start of a line. */
const NUMBERING = /^(?:\(?\d{1,2}[.)]|\(?[a-h][.)]|\(?(?:i{1,3}|iv|v|vi{0,3}|ix|x)[.)])\s+/i;

function balance(t: string): string {
  // Remove unmatched brackets (keeps "(a) … (b)" style pairs intact).
  for (const [open, close] of [["(", ")"], ["[", "]"]] as const) {
    const opens = t.split(open).length - 1;
    const closes = t.split(close).length - 1;
    if (opens > closes && t.trimEnd().endsWith(open)) t = t.trimEnd().slice(0, -1);
    else if (opens > closes && opens - closes === 1) t = t.replace(new RegExp(`\\${open}(?![^${open}]*\\${close})`), "");
    else if (closes > opens && closes - opens === 1) t = t.replace(new RegExp(`\\${close}`), "");
  }
  // Wrapping quotes around the whole thing.
  const q = t.match(/^["“'‘](.*)["”'’]$/s);
  if (q && !/["“”]/.test(q[1])) t = q[1];
  // A lone opening or closing quote.
  if ((t.match(/[“”"]/g) ?? []).length === 1) t = t.replace(/[“”"]/, "");
  return t;
}

function common(raw: string): string {
  let t = String(raw ?? "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(BULLETS, "").replace(NUMBERING, "");
  t = t
    .replace(/\s+([,.;:!?)\]])/g, "$1") // "word ," → "word,"
    .replace(/([,;:])(?:\s*\1)+/g, "$1") // ",," / ", ," → ","
    .replace(/([(\[])\s+/g, "$1") // "( word" → "(word"
    .replace(/\(\s*\)|\[\s*\]/g, "") // empty brackets
    .replace(/([,;:])(?=[^\s\d/])/g, "$1 ") // "a,b" → "a, b" (not "1,000" or "3:1")
    .replace(/,(?=\s*\d{3}\b)/g, ",") // keep thousands
    .replace(/\.{4,}/g, "…")
    .replace(/(?<!\.)\.\.(?!\.)/g, ".") // ".." → "."
    .replace(/([,;:])\1+/g, "$1") // ",," → ","
    .replace(/[,;:]\s*([.!?])/g, "$1") // ",." → "."
    .replace(/([!?])\.+/g, "$1") // "?." → "?"
    .replace(/\s*[-–—]\s*$/, "") // dangling dash
    .replace(/^[,;:.\s]+/, "") // leading punctuation
    .replace(/\s{2,}/g, " ")
    .trim();
  return balance(t).trim();
}

/** A line in the notes: tidy, no trailing comma/semicolon/colon or dangling dash. */
export function tidyLine(raw: string): string {
  return common(raw)
    .replace(/(?:\.{3}|…)$/, "")
    .replace(/[,;:]+$/, "")
    .replace(/(?<!\b(?:etc|e\.g|i\.e|al|approx|vs|[A-Z]))\.$/, "")
    .trim();
}

/** A bold term in the notes: no trailing colon or dash. */
export function tidyTerm(raw: string): string {
  return common(raw).replace(/[\s,;:.–—-]+$/, "").trim();
}

/** A question: tidy, and ends with "?" if it's worded as one. */
export function tidyQuestion(raw: string): string {
  let t = common(raw).replace(/[,;:]+$/, "");
  if (/^(what|which|who|whom|whose|when|where|why|how|is|are|was|were|do|does|did|can|could|should|would|will)\b/i.test(t) && !/[?]$/.test(t)) t = t.replace(/\.$/, "") + "?";
  return t;
}

/**
 * An answer option: tidy, capital first letter, no full stop or trailing punctuation,
 * and no leftover question tacked on the end ("RNA stability - Which RNAs survive?").
 */
export function tidyOption(raw: string): string {
  let t = common(raw);
  const parts = t.split(/\s[-–—]\s/);
  if (parts.length > 1 && /\?$/.test(parts[parts.length - 1])) t = parts.slice(0, -1).join(" – ");
  t = t.replace(/[\s.,;:–—-]+$/, "").replace(/…$/, "").trim();
  // Capital first letter, except words like "mRNA", "pH", "iPhone".
  if (/^[a-z]/.test(t) && !/^[a-z]+[A-Z]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

/** An explanation or flashcard side: tidy sentence(s). */
export function tidySentence(raw: string): string {
  return common(raw).replace(/[,;:]+$/, "").trim();
}

/**
 * Shortens a long option without chopping it mid-word: stops at the end of the first
 * sentence or clause that fits, otherwise at the last whole word.
 */
export function shortenOption(raw: string, max = 170): string {
  const t = common(raw);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(" – "), cut.lastIndexOf(" - "));
  if (stop > max * 0.4) return cut.slice(0, stop).trim();
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:(–-]+$/, "");
}
