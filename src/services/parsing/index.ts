import type { Material, Page, SourceFile, SourceFileType, Topic } from "@/types/models";
import { nowISO, uid } from "@/lib/utils";
import { docxParser, imageParser, parsePlainText, pdfParser, pptxParser, txtParser } from "./parsers";
import { detectTopics, isLikelyIrrelevant } from "./sections";
import { ParseError, type DocumentParser, type ParsedDocument, type ProgressFn } from "./types";
import { validateFile } from "./validate";

export * from "./types";
export * from "./validate";
export { detectTopics, isLikelyIrrelevant } from "./sections";

const PARSERS: Partial<Record<SourceFileType, DocumentParser>> = {
  pptx: pptxParser,
  pdf: pdfParser,
  docx: docxParser,
  txt: txtParser,
  image: imageParser,
};

/** Parse a browser File into a normalised document. Throws ParseError with a friendly message. */
export async function parseFile(file: File, onProgress: ProgressFn = () => {}): Promise<ParsedDocument> {
  const v = validateFile(file);
  if (!v.ok) throw new ParseError("invalid", v.error);
  const parser = PARSERS[v.type];
  if (!parser) throw new ParseError("unsupported", "Please upload a supported file type.");
  try {
    const doc = await parser.parse(file, onProgress);
    if (!doc.pages.length) throw new ParseError("empty", "We couldn't find any content in this file.");
    return doc;
  } catch (e) {
    if (e instanceof ParseError) throw e;
    console.error(e);
    throw new ParseError(String(e), "Something went wrong reading this file. Try again, or save it in another format.");
  }
}

export function parsePastedText(text: string, title: string): ParsedDocument {
  const doc = parsePlainText(text, title || "Pasted notes");
  return { ...doc, fileType: "text" };
}

const LABEL: Record<ParsedDocument["unit"], string> = { slides: "Slide", pages: "Page", sections: "Section" };

/** Turn a parsed document into a Material draft with detected topics and sensible default selection. */
export function buildMaterial(doc: ParsedDocument, file: { name: string; size: number }, subject = ""): Material {
  const materialId = uid("mat");
  const sourceFile: SourceFile = {
    id: uid("file"),
    name: file.name,
    type: doc.fileType,
    size: file.size,
    uploadedAt: nowISO(),
    pageCount: doc.pages.length,
  };
  const pages: Page[] = doc.pages.map((p, i) => ({
    id: uid("pg"),
    fileId: sourceFile.id,
    index: i + 1,
    label: `${LABEL[doc.unit]} ${i + 1}`,
    title: p.title || `${LABEL[doc.unit]} ${i + 1}`,
    text: p.text,
    topicId: null,
    included: !isLikelyIrrelevant(p, i) && !(p.needsText && !p.imageDataUrl),
    imageDataUrl: p.imageDataUrl,
    needsText: p.needsText,
  }));
  const groups = detectTopics(doc.pages);
  const topics: Topic[] = groups.map((g) => ({ id: uid("top"), name: g.name, pageIds: g.pageIdxs.map((i) => pages[i].id) }));
  topics.forEach((t) => t.pageIds.forEach((pid) => (pages.find((p) => p.id === pid)!.topicId = t.id)));
  return {
    id: materialId,
    title: doc.title,
    subject: subject || guessSubject(doc),
    unit: doc.unit,
    files: [sourceFile],
    pages,
    topics,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

const SUBJECT_HINTS: [RegExp, string][] = [
  [/\b(cell|dna|protein|enzyme|organism|mitosis|gene|photosynth|biolog)/i, "Biology"],
  [/\b(atom|molecule|reaction|acid|bond|organic|chemi)/i, "Chemistry"],
  [/\b(force|energy|velocity|quantum|electric|physic)/i, "Physics"],
  [/\b(memory|cognitive|behaviou?r|psycholog|brain)/i, "Psychology"],
  [/\b(war|revolution|empire|century|treaty|histor)/i, "History"],
  [/\b(market|demand|supply|inflation|econom)/i, "Economics"],
  [/\b(poem|novel|shakespeare|literat|narrat)/i, "English"],
  [/\b(equation|theorem|integral|matrix|algebra|calculus)/i, "Maths"],
  [/\b(law|contract|tort|court|legal)/i, "Law"],
  [/\b(algorithm|program|software|data structure|computer)/i, "Computer Science"],
];

export function guessSubject(doc: ParsedDocument): string {
  const blob = doc.title + " " + doc.pages.slice(0, 8).map((p) => p.title + " " + p.text.slice(0, 400)).join(" ");
  const scores = SUBJECT_HINTS.map(([re, s]) => [s, (blob.match(new RegExp(re.source, "gi")) ?? []).length] as const);
  const best = scores.sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : "General";
}

/** Re-run topic detection after pages change (e.g. text added to image pages). */
export function retopic(material: Material): Material {
  const groups = detectTopics(material.pages);
  const topics = groups.map((g) => ({ id: uid("top"), name: g.name, pageIds: g.pageIdxs.map((i) => material.pages[i].id) }));
  const pages = material.pages.map((p) => ({ ...p, topicId: topics.find((t) => t.pageIds.includes(p.id))?.id ?? null }));
  return { ...material, topics, pages };
}
