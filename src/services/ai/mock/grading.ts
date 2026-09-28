import { capitalize, contentWords, keywordSet, stem, stripTrailingPunct, topKeywords, truncate, wordCount } from "@/lib/text";
import type { Question, WrittenFeedback } from "@/types/models";

/** Does the response cover this key point? Checks overlap of meaningful (stemmed) words. */
export function coversPoint(response: Set<string>, point: string) {
  const pw = [...new Set(contentWords(point).map(stem))];
  if (!pw.length) return false;
  const hit = pw.filter((w) => response.has(w)).length;
  return hit / pw.length >= 0.4 || hit >= 4;
}

/** Keyword-coverage marker. A real provider would return the same WrittenFeedback shape. */
export function gradeWritten(q: Question, text: string): WrittenFeedback {
  const resp = keywordSet(text);
  const wc = wordCount(text);
  const points = q.keyPoints.length ? q.keyPoints : [q.answer];
  const hit = points.filter((p) => coversPoint(resp, p));
  const missing = points.filter((p) => !hit.includes(p));
  let score = hit.length / points.length;
  const [minW, maxW] = q.suggestedWords ?? [0, 0];
  if (minW && wc < minW * 0.5) score *= 0.75;
  if (wc < 4) score = 0;
  score = Math.round(score * 100) / 100;

  const marks = q.marks ?? points.length;
  const estimated = Math.round(score * marks);
  const band = q.rubric?.find((r) => {
    const m = r.band.match(/(\d+)–(\d+)/);
    return m ? estimated >= Number(m[1]) && estimated <= Number(m[2]) : false;
  });

  const missingConcepts = missing.map((p) => {
    const kw = topKeywords(p, 3);
    return kw.length ? capitalize(kw.join(", ")) + ` · “${truncate(stripTrailingPunct(p), 90)}”` : truncate(p, 90);
  });

  const improvements: string[] = [];
  if (missing.length) improvements.push(`Add the missing point${missing.length > 1 ? "s" : ""}. ${q.sources.map((s) => s.label).join(", ")} ${q.sources.length > 1 ? "cover" : "covers"} ${missing.length > 1 ? "them" : "it"}.`);
  if (minW && wc < minW) improvements.push(`Develop your answer further: aim for ${minW}–${maxW} words (you wrote ${wc}).`);
  if (maxW && wc > maxW * 1.4) improvements.push(`Tighten your answer: it's well over the suggested ${maxW} words.`);
  if (["essay", "long", "compare"].includes(q.type) && !/\b(however|whereas|although|on the other hand|in contrast|overall|therefore)\b/i.test(text))
    improvements.push("Use linking and evaluative language (however, therefore, overall) to show analysis, not just description.");
  if (q.type === "essay" && !/\b(conclusion|overall|in summary|to conclude)\b/i.test(text)) improvements.push("Finish with a clear judgement that directly answers the question.");
  if (!improvements.length) improvements.push("Strong answer. To push higher, add a precise example or figure from the material.");

  const feedback =
    score >= 0.85
      ? "Excellent, you covered the key points accurately."
      : score >= 0.6
        ? "Good answer. You covered most of the key points; a couple of details are missing."
        : score >= 0.3
          ? "A partial answer. You've got some of the right ideas, but important points are missing."
          : wc < 4
            ? "No answer was given for this question."
            : "This answer misses most of the key points. Compare it with the model answer below.";

  return {
    score,
    estimatedMark: `${estimated}/${marks}${band ? ` · ${band.band.split(" (")[0]}` : ""}`,
    keyPointsHit: hit,
    missingConcepts,
    feedback,
    improvements,
  };
}
