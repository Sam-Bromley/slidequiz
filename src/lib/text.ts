/** Lightweight text-processing helpers shared by the parsing layer and the mock AI provider. */

export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both but by can cannot could did do does doing down during each either etc few for from further had has have having he her here hers herself him himself his how however i if in into is isn't it its itself just let like made make many may me might more most much must my myself no nor not now of off on once only or other ought our ours ourselves out over own per same she should so some such than that the their theirs them themselves then there these they this those through thus to too under until up upon us used using very via was we were what when where which while who whom why will with within without would yet you your yours yourself yourselves one two three four five first second third new key main different important include includes including called known often usually e.g i.e example examples slide page section lecture notes figure fig week also well way ways use uses`.split(
    /\s+/,
  ),
);

export function normalizeWhitespace(s: string) {
  return s.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function splitSentences(text: string): string[] {
  const lines = text.split(/\n+/).map((l) => l.replace(/^[\s•\-–*▪◦·]+/, "").trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const parts = line.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [line];
    for (let p of parts) {
      p = p.trim();
      if (p.length > 2) out.push(p);
    }
  }
  // Re-join fragments broken on abbreviations like "e.g." or "c."
  const merged: string[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev && (/\b(e\.g|i\.e|c|ca|approx|vs|Dr|Mr|Mrs|St|al|etc)\.$/i.test(prev) || /\b[A-Z]\.$/.test(prev))) merged[merged.length - 1] = prev + " " + s;
    else merged.push(s);
  }
  return merged;
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'\-]*[a-z]|[a-z]/g) ?? []).map((w) => w.replace(/'s$/, ""));
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function stem(w: string) {
  return w.replace(/(ies)$/, "y").replace(/(sses)$/, "ss").replace(/([^s])s$/, "$1").replace(/(ing|ed)$/, "");
}

export function keywordSet(text: string) {
  return new Set(contentWords(text).map(stem));
}

export function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => b.has(x) && inter++);
  return inter / (a.size + b.size - inter);
}

export function topKeywords(text: string, n = 8): string[] {
  const freq = new Map<string, number>();
  for (const w of contentWords(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([w]) => w);
}

export function titleCase(s: string) {
  return s.replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
}

export function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function stripTrailingPunct(s: string) {
  return s.replace(/[\s.;:,]+$/, "");
}

export interface Definition {
  term: string;
  definition: string;
  sentence: string;
}

const DEF_VERBS = /^(.{2,60}?)\s+(is|are|was|were|refers to|describes|means|is defined as|are defined as|is known as)\s+(.{12,})$/i;
const COLON_DEF = /^([A-Z][A-Za-z0-9'’\- ()]{1,48}?)\s*[:–—]\s+(.{8,})$/;
const BAD_TERM_START = /^(this|that|these|those|it|they|there|he|she|we|you|which|what|one|each|both|such|however|also|but|and|so|in|on|at|during|after|before|by|for|if|when|while|although|because|the result|a result)\b/i;

/** Extract "Term is definition" style statements. Deliberately conservative. */
export function extractDefinitions(text: string): Definition[] {
  const out: Definition[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\n+/).map((l) => l.replace(/^[\s•\-–*▪◦·]+/, "").trim());
  const candidates = [...lines.filter((l) => COLON_DEF.test(l)), ...splitSentences(text)];
  for (const raw of candidates) {
    const s = raw.trim();
    let term = "";
    let def = "";
    const c = s.match(COLON_DEF);
    const v = s.match(DEF_VERBS);
    if (c && c[1].split(" ").length <= 5) {
      term = c[1];
      def = c[2];
    } else if (v) {
      term = v[1];
      def = v[3];
      const strongVerb = /^(refers to|describes|means|is defined as|are defined as|is known as)$/i.test(v[2]);
      const pastTense = /^(was|were)$/i.test(v[2]);
      if (!strongVerb && !/^(a|an|the|when|one of|any|how|where)\s/i.test(def)) continue;
      if (pastTense && !/^(a|an|the)\s/i.test(def)) continue;
      if (/^(an?|the)\s+(example|result|reason|way|number|lot|range|problem|weakness|strength|consequence|case)\b/i.test(def)) continue;
    } else continue;
    term = term.replace(/^(the|a|an)\s+/i, "").replace(/[“”"]/g, "").trim();
    if (BAD_TERM_START.test(term)) continue;
    const tw = term.split(/\s+/);
    if (tw.length > 5 || term.length < 3) continue;
    if (/\d{3,}/.test(term) && tw.length > 2) continue;
    if (/[,;]/.test(term)) continue;
    if (/\s(and|or|of|to|as|with|by|for|in|on|at)$/i.test(term)) continue;
    if (/\b(act|acts|has|have|had|can|could|will|would|was|were|do|does|did|may|might|found|showed|shows|led|made)\b/i.test(term)) continue;
    def = stripTrailingPunct(def);
    if (def.split(/\s+/).length < 3) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term: capitalize(term), definition: capitalize(def), sentence: s });
  }
  return out;
}

export function normalizeAnswer(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Very small fuzzy match for fill-in-the-blank answers (handles plurals and one typo). */
export function answersMatch(given: string, accepted: string[]) {
  const g = normalizeAnswer(given);
  if (!g) return false;
  return accepted.some((a) => {
    const n = normalizeAnswer(a);
    if (g === n || stem(g) === stem(n)) return true;
    if (n.length > 5 && levenshtein(g, n) <= 1) return true;
    return false;
  });
}

export function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function wordCount(s: string) {
  return (s.trim().match(/\S+/g) ?? []).length;
}

/** Split text into highlight segments for a query (case-insensitive). */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return text.split(re).filter(Boolean).map((t) => ({ text: t, hit: t.toLowerCase() === q.toLowerCase() }));
}
