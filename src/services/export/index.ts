/**
 * Export pipeline: build a neutral document model, then render it to PDF (pdf-lib),
 * Word (docx), plain text, Markdown, a standalone web page, CSV, JSON or a print-friendly page.
 */
import { download, slug } from "@/lib/utils";
import type { Flashcard, Question, SummaryDoc } from "@/types/models";

export type Block =
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string; muted?: boolean }
  | { kind: "list"; items: string[] }
  | {
      kind: "question";
      number: number;
      meta: string;
      prompt: string;
      options?: string[];
      pairs?: { left: string; right: string }[];
      lines?: number;
      answer?: string;
      explanation?: string;
    }
  | { kind: "card"; front: string; back: string; meta?: string };

export interface ExportDoc {
  title: string;
  subtitle?: string;
  blocks: Block[];
}

export const TYPE_LABEL: Record<Question["type"], string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  long: "Long answer",
  essay: "Essay",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  matching: "Matching",
  scenario: "Scenario",
  compare: "Compare & contrast",
};

const LETTERS = "ABCDEFGH";

export interface QuestionExportOptions {
  title: string;
  includeAnswers: boolean;
  includeExplanations: boolean;
  worksheet: boolean;
  answerKeyAtEnd: boolean;
}

function correctText(q: Question) {
  if (q.options && q.correctIndex != null) return `${q.type === "mcq" ? LETTERS[q.correctIndex] + ". " : ""}${q.options[q.correctIndex]}`;
  if (q.pairs) return q.pairs.map((p) => `${p.left}: ${p.right}`).join("\n");
  return q.answer;
}

function linesFor(q: Question) {
  if (["mcq", "true_false", "matching"].includes(q.type)) return 0;
  if (q.type === "fill_blank") return 1;
  if (q.type === "short") return 4;
  if (q.type === "essay") return 22;
  if (q.type === "long") return 14;
  return 8;
}

export function questionsDoc(questions: Question[], opts: QuestionExportOptions, topicName: (q: Question) => string): ExportDoc {
  const inline = opts.includeAnswers && !opts.answerKeyAtEnd;
  const blocks: Block[] = questions.map((q, i) => ({
    kind: "question" as const,
    number: i + 1,
    meta: [TYPE_LABEL[q.type], q.difficulty[0].toUpperCase() + q.difficulty.slice(1), topicName(q), q.sources.map((s) => s.label).join(", "), q.marks && q.marks > 1 ? `${q.marks} marks` : ""].filter(Boolean).join(" · "),
    prompt: q.prompt,
    options: q.options && q.type === "mcq" ? q.options.map((o, j) => `${LETTERS[j]}. ${o}`) : q.type === "true_false" ? ["True", "False"] : undefined,
    pairs: q.pairs,
    lines: opts.worksheet ? linesFor(q) : 0,
    answer: inline ? correctText(q) : undefined,
    explanation: inline && opts.includeExplanations ? q.explanation : undefined,
  }));
  if (opts.includeAnswers && opts.answerKeyAtEnd) {
    blocks.push({ kind: "h2", text: "Answer key" });
    questions.forEach((q, i) => {
      blocks.push({ kind: "p", text: `${i + 1}. ${correctText(q).replace(/\n/g, "; ")}` });
      if (opts.includeExplanations) blocks.push({ kind: "p", text: q.explanation, muted: true });
    });
  }
  return {
    title: opts.title,
    subtitle: `${questions.length} questions${opts.worksheet ? " · Name: ______________________   Date: ____________" : ""}`,
    blocks,
  };
}

export function flashcardsDoc(title: string, cards: Flashcard[]): ExportDoc {
  return {
    title,
    subtitle: `${cards.length} flashcards`,
    blocks: cards.map((c) => ({ kind: "card", front: c.front, back: c.back, meta: c.source?.label })),
  };
}

export function summaryDocument(title: string, s: SummaryDoc): ExportDoc {
  const blocks: Block[] = [{ kind: "h2", text: "30-second summary" }, { kind: "p", text: s.tldr }];
  blocks.push({ kind: "h2", text: "Revision notes" });
  s.revisionNotes.forEach((n) => {
    blocks.push({ kind: "p", text: `${n.heading} (${n.sources.map((x) => x.label).join(", ")})` });
    blocks.push({ kind: "list", items: n.points });
  });
  if (s.definitions.length) {
    blocks.push({ kind: "h2", text: "Key definitions" });
    blocks.push({ kind: "list", items: s.definitions.map((d) => `${d.term}: ${d.definition}`) });
  }
  if (s.facts.length) {
    blocks.push({ kind: "h2", text: "Important facts" });
    blocks.push({ kind: "list", items: s.facts.map((f) => f.text) });
  }
  blocks.push({ kind: "h2", text: "Things to remember" });
  blocks.push({ kind: "list", items: s.remember });
  return { title, subtitle: "Summary generated from your material", blocks };
}

/* ------------------------------------------------------------------ PDF */

const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const MAP: Record<string, string> = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "μ": "u", "✓": "v", "✗": "x", "−": "-", "≈": "~", "′": "'", "″": '"', "​": "" };

function pdfSafe(s: string) {
  return [...s].map((ch) => MAP[ch] ?? (ch.charCodeAt(0) < 256 || WIN_ANSI_EXTRA.includes(ch) ? ch : "?")).join("").replace(/\t/g, "  ");
}

export async function toPdf(doc: ExportDoc): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setCreator("SlideQuiz");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56;
  const maxW = W - M * 2;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.11, 0.14), muted = rgb(0.42, 0.44, 0.5), rule = rgb(0.85, 0.86, 0.9), accent = rgb(0.29, 0.27, 0.86);

  const ensure = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, f: typeof font, size: number, width: number) => {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(test, size) > width && line) {
          out.push(line);
          line = word;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  };
  const text = (t: string, o: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = o.size ?? 10.5, f = o.f ?? font, indent = o.indent ?? 0, lh = size * 1.42;
    for (const line of wrap(t, f, size, maxW - indent)) {
      ensure(lh);
      page.drawText(line, { x: M + indent, y: y - size, size, font: f, color: o.color ?? ink });
      y -= lh;
    }
    y -= o.gap ?? 4;
  };

  text(doc.title, { size: 20, f: bold, gap: 2 });
  if (doc.subtitle) text(doc.subtitle, { size: 10, color: muted, gap: 6 });
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: rule });
  y -= 16;

  for (const b of doc.blocks) {
    if (b.kind === "h2") {
      ensure(40);
      y -= 8;
      text(b.text, { size: 13.5, f: bold, gap: 6 });
    } else if (b.kind === "p") text(b.text, { color: b.muted ? muted : ink, size: b.muted ? 9.5 : 10.5 });
    else if (b.kind === "list") b.items.forEach((it) => text("•  " + it, { indent: 6 }));
    else if (b.kind === "card") {
      ensure(60);
      text(b.front, { f: bold, gap: 2 });
      text(b.back, { indent: 10, gap: 2 });
      if (b.meta) text(b.meta, { size: 8.5, color: muted, indent: 10, gap: 2 });
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: rule, dashArray: [3, 3] });
      y -= 10;
    } else {
      ensure(70);
      text(`${b.number}.  ${b.prompt}`, { f: bold, size: 11, gap: 2 });
      text(b.meta, { size: 8.5, color: muted, indent: 16, gap: 6 });
      b.options?.forEach((o) => text((b.lines !== undefined && b.lines >= 0 ? "[  ]  " : "") + o, { indent: 16, gap: 2 }));
      if (b.pairs) {
        const rights = [...b.pairs.map((p) => p.right)].sort();
        b.pairs.forEach((p, i) => text(`${i + 1}. ${p.left}   ____`, { indent: 16, gap: 1 }));
        y -= 4;
        rights.forEach((r, i) => text(`${"ABCDEFGH"[i]}. ${r}`, { indent: 16, gap: 1, color: muted }));
      }
      for (let i = 0; i < (b.lines ?? 0); i++) {
        ensure(22);
        y -= 20;
        page.drawLine({ start: { x: M + 16, y }, end: { x: W - M, y }, thickness: 0.5, color: rule });
      }
      if (b.lines) y -= 6;
      if (b.answer) text("Answer: " + b.answer, { indent: 16, color: accent, gap: 2 });
      if (b.explanation) text(b.explanation, { indent: 16, size: 9.5, color: muted });
      y -= 10;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(pdfSafe(`SlideQuiz · ${doc.title} · ${i + 1}/${pages.length}`), { x: M, y: 28, size: 8, font, color: muted }));
  return new Blob([await pdf.save() as BlobPart], { type: "application/pdf" });
}

/* ------------------------------------------------------------------ DOCX */

export async function toDocx(doc: ExportDoc): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = d;
  const children: InstanceType<typeof Paragraph>[] = [];
  const muted = "6B7080";
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title, bold: true })] }));
  if (doc.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, color: muted })], spacing: { after: 240 } }));
  const line = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9CCD6", space: 1 } }, spacing: { before: 280 }, children: [] });
  for (const b of doc.blocks) {
    if (b.kind === "h2") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun(b.text)] }));
    else if (b.kind === "p") children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: b.text, color: b.muted ? muted : undefined, size: b.muted ? 19 : 22 })] }));
    else if (b.kind === "list") b.items.forEach((it) => children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(it)] })));
    else if (b.kind === "card") {
      children.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: b.front, bold: true })] }));
      children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun(b.back)] }));
      if (b.meta) children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: b.meta, color: muted, size: 18 })] }));
    } else {
      children.push(new Paragraph({ spacing: { before: 280, after: 40 }, keepNext: true, children: [new TextRun({ text: `${b.number}. `, bold: true }), new TextRun({ text: b.prompt, bold: true })] }));
      children.push(new Paragraph({ spacing: { after: 100 }, keepNext: true, children: [new TextRun({ text: b.meta, color: muted, size: 18 })] }));
      b.options?.forEach((o) => children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun("☐  " + o)] })));
      if (b.pairs) {
        b.pairs.forEach((p, i) => children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun(`${i + 1}. ${p.left}   ____`)] })));
        [...b.pairs.map((p) => p.right)].sort().forEach((r, i) => children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: `${"ABCDEFGH"[i]}. ${r}`, color: muted })] })));
      }
      for (let i = 0; i < (b.lines ?? 0); i++) children.push(line());
      if (b.answer) children.push(new Paragraph({ indent: { left: 360 }, spacing: { before: 100 }, children: [new TextRun({ text: "Answer: ", bold: true, color: "4B44D6" }), new TextRun({ text: b.answer, color: "4B44D6" })] }));
      if (b.explanation) children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: b.explanation, color: muted, size: 19 })] }));
    }
  }
  const file = new Document({
    creator: "SlideQuiz",
    title: doc.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(file);
}

/* ------------------------------------------------------------------ CSV + print */

export function flashcardsCsv(cards: Flashcard[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ["Front,Back,Source", ...cards.map((c) => [c.front, c.back, c.source?.label ?? ""].map(esc).join(","))].join("\n");
}

export function questionsCsv(questions: Question[]) {
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  return [
    "Question,Type,Difficulty,Options,Answer,Explanation,Source",
    ...questions.map((q) =>
      [q.prompt, TYPE_LABEL[q.type], q.difficulty, (q.options ?? []).join(" | "), correctText(q) ?? "", q.explanation ?? "", q.sources.map((x) => x.label).join("; ")].map(esc).join(","),
    ),
  ].join("\n");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function toPrintHtml(doc: ExportDoc) {
  const e = escapeHtml;
  const body = doc.blocks
    .map((b) => {
      if (b.kind === "h2") return `<h2>${e(b.text)}</h2>`;
      if (b.kind === "p") return `<p class="${b.muted ? "muted" : ""}">${e(b.text)}</p>`;
      if (b.kind === "list") return `<ul>${b.items.map((i) => `<li>${e(i)}</li>`).join("")}</ul>`;
      if (b.kind === "card") return `<div class="card"><div class="front">${e(b.front)}</div><div class="back">${e(b.back)}</div>${b.meta ? `<div class="muted small">${e(b.meta)}</div>` : ""}</div>`;
      return `<section class="q"><div class="prompt"><b>${b.number}.</b> ${e(b.prompt)}</div><div class="muted small">${e(b.meta)}</div>${
        b.options ? `<ol class="opts">${b.options.map((o) => `<li><span class="box"></span>${e(o)}</li>`).join("")}</ol>` : ""
      }${b.pairs ? `<div class="pairs"><ol>${b.pairs.map((p) => `<li>${e(p.left)} ____</li>`).join("")}</ol><ol type="A">${[...b.pairs.map((p) => p.right)].sort().map((r) => `<li>${e(r)}</li>`).join("")}</ol></div>` : ""}${Array.from({ length: b.lines ?? 0 }, () => '<div class="line"></div>').join("")}${
        b.answer ? `<div class="answer"><b>Answer:</b> ${e(b.answer).replace(/\n/g, "<br/>")}</div>` : ""
      }${b.explanation ? `<div class="muted small">${e(b.explanation)}</div>` : ""}</section>`;
    })
    .join("\n");
  return `<article class="sq-print"><header><h1>${e(doc.title)}</h1>${doc.subtitle ? `<p class="muted">${e(doc.subtitle)}</p>` : ""}</header>${body}<footer class="muted small">Made with SlideQuiz</footer></article>`;
}

const PRINT_CSS = `
#sq-print-root{display:none}
@media print{
  body>*:not(#sq-print-root){display:none!important}
  #sq-print-root{display:block;color:#111;font:11pt/1.5 Arial,Helvetica,sans-serif}
  .sq-print h1{font-size:20pt;margin:0 0 2pt}.sq-print h2{font-size:13pt;margin:18pt 0 6pt}
  .sq-print .muted{color:#666}.sq-print .small{font-size:8.5pt}
  .sq-print header{border-bottom:1px solid #ccc;margin-bottom:14pt;padding-bottom:8pt}
  .sq-print .q{break-inside:avoid;margin:0 0 14pt}.sq-print .prompt{font-weight:600}
  .sq-print .opts{list-style:none;padding-left:14pt;margin:4pt 0}.sq-print .opts li{margin:2pt 0}
  .sq-print .box{display:inline-block;width:9pt;height:9pt;border:1px solid #777;border-radius:2px;margin-right:6pt;vertical-align:-1pt}
  .sq-print .line{border-bottom:1px solid #bbb;height:20pt;margin-left:14pt}
  .sq-print .answer{color:#3b35c4;margin:4pt 0 0 14pt}
  .sq-print .card{border:1px dashed #aaa;border-radius:6px;padding:8pt 10pt;margin:0 0 8pt;break-inside:avoid}
  .sq-print .card .front{font-weight:600}.sq-print .pairs{display:flex;gap:24pt}
  .sq-print footer{margin-top:24pt}
}`;

export function printDoc(doc: ExportDoc) {
  let root = document.getElementById("sq-print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "sq-print-root";
    document.body.appendChild(root);
    const style = document.createElement("style");
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
  }
  root.innerHTML = toPrintHtml(doc);
  setTimeout(() => window.print(), 50);
}

/** A standalone .html file that opens in any browser. */
export function toHtmlFile(doc: ExportDoc) {
  const css = PRINT_CSS.replace(/#sq-print-root\{display:none\}/, "").replace(/@media print\{([\s\S]*)\}$/, "$1").replace(/body>\*:not\(#sq-print-root\)\{display:none!important\}/, "").replace("#sq-print-root{", "body{");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.title)}</title><style>${css} body{max-width:760px;margin:40px auto;padding:0 20px}</style></head><body>${toPrintHtml(doc)}</body></html>`;
}

export function toMarkdown(doc: ExportDoc) {
  const out: string[] = [`# ${doc.title}`, ...(doc.subtitle ? ["", `_${doc.subtitle}_`] : []), ""];
  for (const b of doc.blocks) {
    if (b.kind === "h2") out.push(`## ${b.text}`, "");
    else if (b.kind === "p") out.push(b.muted ? `_${b.text}_` : b.text, "");
    else if (b.kind === "list") out.push(...b.items.map((i) => `- ${i}`), "");
    else if (b.kind === "card") out.push(`**${b.front}**`, "", b.back, ...(b.meta ? ["", `_${b.meta}_`] : []), "", "---", "");
    else {
      out.push(`**${b.number}. ${b.prompt}**`, "", `_${b.meta}_`, "");
      b.options?.forEach((o) => out.push(`- [ ] ${o}`));
      if (b.options) out.push("");
      if (b.pairs) {
        b.pairs.forEach((p, i) => out.push(`${i + 1}. ${p.left} ____`));
        out.push("");
        [...b.pairs.map((p) => p.right)].sort().forEach((r, i) => out.push(`${"ABCDEFGH"[i]}. ${r}`));
        out.push("");
      }
      if (b.answer) out.push(`> **Answer:** ${b.answer.replace(/\n/g, "\n> ")}`, "");
      if (b.explanation) out.push(`> ${b.explanation}`, "");
    }
  }
  return out.join("\n");
}

export type ExportFormat = "pdf" | "docx" | "txt" | "md" | "html" | "csv" | "json" | "print";

export async function exportDoc(doc: ExportDoc, format: ExportFormat, extra?: { csv?: string; json?: unknown }) {
  const name = slug(doc.title);
  if (format === "pdf") await download(`${name}.pdf`, await toPdf(doc));
  else if (format === "docx") await download(`${name}.docx`, await toDocx(doc));
  else if (format === "txt") await download(`${name}.txt`, toPlainText(doc), "text/plain");
  else if (format === "md") await download(`${name}.md`, toMarkdown(doc), "text/markdown");
  else if (format === "html") await download(`${name}.html`, toHtmlFile(doc), "text/html");
  else if (format === "csv" && extra?.csv) await download(`${name}.csv`, extra.csv, "text/csv");
  else if (format === "json") await download(`${name}.json`, JSON.stringify(extra?.json ?? doc, null, 2), "application/json");
  else printDoc(doc);
}

export function toPlainText(doc: ExportDoc) {
  const lines: string[] = [doc.title, ...(doc.subtitle ? [doc.subtitle] : []), ""];
  for (const b of doc.blocks) {
    if (b.kind === "h2") lines.push("", b.text.toUpperCase(), "");
    else if (b.kind === "p") lines.push(b.text);
    else if (b.kind === "list") b.items.forEach((i) => lines.push(`• ${i}`));
    else if (b.kind === "card") lines.push(`${b.front}\n   → ${b.back}`, "");
    else {
      lines.push(`${b.number}. ${b.prompt}`, `   (${b.meta})`);
      b.options?.forEach((o) => lines.push(`   ${o}`));
      b.pairs?.forEach((p, i) => lines.push(`   ${i + 1}. ${p.left}  ____`));
      if (b.pairs) [...b.pairs.map((p) => p.right)].sort().forEach((r, i) => lines.push(`   ${"ABCDEFGH"[i]}. ${r}`));
      for (let i = 0; i < Math.min(b.lines ?? 0, 4); i++) lines.push("   ______________________________________________");
      if (b.answer) lines.push(`   Answer: ${b.answer.replace(/\n/g, "\n   ")}`);
      if (b.explanation) lines.push(`   ${b.explanation}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
