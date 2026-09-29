/**
 * Reference-list entries and similar citation lines, e.g.
 *   Kim, Young Zoon. (2014). Altered Histone Modifications in Gliomas. Brain
 *   tumor research and treatment. 2. 7-21. 10.14791/btrt.2014.2.1.7
 * They're sources, not things to learn, so notes, questions and flashcards leave them out.
 */

const DOI = /\b(doi:\s*|https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+/i;
/** "Surname, A. (2014)." / "Surname, Given Name. (2014)" / "Surname A, Other B (2014)" / "Surname et al. (2014)" */
const AUTHOR_YEAR = /^[\p{Lu}][\p{L}'’-]+(?:,\s*|\s+)(?:[\p{Lu}][\p{L}.'’-]*\s*,?\s*){1,5}(?:(?:&|and)\s+[\p{Lu}][\p{L}'’-]+.*?)?\(?\s*(?:19|20)\d{2}[a-z]?\s*(?:\)[.,:]?|[.,:])/u;
const ET_AL_YEAR = /^[\p{Lu}][\p{L}'’-]+.{0,60}\bet al\.?,?\s*\(?(?:19|20)\d{2}/u;
/** Journal details: "2. 7-21", "12(3), 45–67", "vol. 4, pp. 12-19". */
const JOURNAL_BITS = /(\b\d+\s*\(\d+\)\s*[,:]\s*\d+\s*[-–]\s*\d+|\bpp?\.\s*\d+\s*[-–]\s*\d+|\bvol\.\s*\d+|\b\d+\.\s*\d+\s*[-–]\s*\d+\.)/i;
const PUBLISHER = /\b(retrieved from|available (at|from)|accessed\s+\d|isbn|publisher|press\.|edition|ed\.\)|\(eds?\.\))/i;

export function isReferenceLine(line: string): boolean {
  const l = line.replace(/^[\s•\-–*▪◦·●○■□➢➤►▶\d.)\]]+(?=\p{Lu})/u, "").trim();
  if (!l) return false;
  if (DOI.test(l)) return true;
  if ((AUTHOR_YEAR.test(l) || ET_AL_YEAR.test(l)) && (JOURNAL_BITS.test(l) || PUBLISHER.test(l) || /\)\.\s*\S/.test(l) || l.length > 60)) return true;
  if (JOURNAL_BITS.test(l) && PUBLISHER.test(l)) return true;
  return false;
}

/** The tail of an entry that wrapped onto the next line ("tumor research and treatment. 2. 7-21."). */
const isContinuation = (l: string) => /^[\p{Ll}(]/u.test(l.trim()) || JOURNAL_BITS.test(l) || DOI.test(l) || /^\d/.test(l.trim());

/** Removes reference entries (and their wrapped second lines) from a block of slide text. */
export function stripReferences(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inRef = false;
  for (const line of lines) {
    if (isReferenceLine(line)) {
      inRef = true;
      continue;
    }
    if (inRef && line.trim() && isContinuation(line)) continue;
    inRef = false;
    out.push(line);
  }
  return out.join("\n");
}

/** Slides that are only a list of sources. */
export const REFERENCE_TITLE = /^(references?|bibliography|sources?|works cited|citations?|further reading|reading list|recommended reading)\b/i;
