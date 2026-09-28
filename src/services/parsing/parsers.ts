import { normalizeWhitespace, truncate } from "@/lib/text";
import { ParseError, type DocumentParser, type ParsedDocument, type ParsedPage } from "./types";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();

function xml(str: string) {
  return new DOMParser().parseFromString(str, "application/xml");
}

/** Children by local name, namespace-agnostic. */
function all(el: Element | Document, local: string): Element[] {
  return Array.from(el.getElementsByTagNameNS("*", local));
}

function firstLine(text: string) {
  return (text.split("\n").find((l) => l.trim().length > 0) ?? "").trim();
}

/* ------------------------------------------------------------------ PPTX */

export const pptxParser: DocumentParser = {
  type: "pptx",
  async parse(file, onProgress) {
    const { default: JSZip } = await import("jszip");
    let zip: InstanceType<typeof JSZip>;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
      throw new ParseError("zip", "We couldn't open this PowerPoint file. It may be corrupted or password-protected.");
    }
    const slidePaths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
    if (!slidePaths.length) throw new ParseError("no slides", "This presentation doesn't contain any slides.");

    // Respect presentation order when available.
    const order = await slideOrder(zip);
    const ordered = order.length ? order.filter((p) => slidePaths.includes(p)) : slidePaths;

    const pages: ParsedPage[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const doc = xml(await zip.file(ordered[i])!.async("string"));
      let title = "";
      const body: string[] = [];
      for (const sp of all(doc, "sp")) {
        const ph = all(sp, "ph")[0];
        const phType = ph?.getAttribute("type") ?? "";
        const paras = all(sp, "p")
          .map((p) => all(p, "t").map((t) => t.textContent ?? "").join(""))
          .map((s) => s.trim())
          .filter(Boolean);
        if (!paras.length) continue;
        if ((phType === "title" || phType === "ctrTitle") && !title) title = paras.join(" ");
        else body.push(...paras);
      }
      // Tables
      for (const tbl of all(doc, "tbl")) {
        for (const tr of all(tbl, "tr")) {
          const cells = all(tr, "tc").map((tc) => all(tc, "t").map((t) => t.textContent).join(" ").trim());
          if (cells.some(Boolean)) body.push(cells.join(": "));
        }
      }
      const notesPath = ordered[i].replace("slides/slide", "notesSlides/notesSlide");
      let notes = "";
      if (zip.file(notesPath)) {
        const nd = xml(await zip.file(notesPath)!.async("string"));
        notes = all(nd, "sp")
          .filter((sp) => (all(sp, "ph")[0]?.getAttribute("type") ?? "") === "body")
          .flatMap((sp) => all(sp, "p").map((p) => all(p, "t").map((t) => t.textContent).join("")))
          .filter((s) => s.trim())
          .join("\n");
      }
      if (!title) title = body.shift() ?? `Slide ${i + 1}`;
      const text = normalizeWhitespace([...body, notes ? `\nSpeaker notes:\n${notes}` : ""].join("\n"));
      pages.push({ title: truncate(title, 120), text });
      onProgress((i + 1) / ordered.length, `Reading slide ${i + 1} of ${ordered.length}`);
    }
    const warnings = pages.filter((p) => !p.text).length > pages.length / 2 ? ["Many slides contain little text. Images and diagrams can't be read yet."] : [];
    return { fileType: "pptx", title: baseName(file.name), unit: "slides", pages, warnings };
  },
};

async function slideOrder(zip: import("jszip")): Promise<string[]> {
  try {
    const pres = zip.file("ppt/presentation.xml");
    const rels = zip.file("ppt/_rels/presentation.xml.rels");
    if (!pres || !rels) return [];
    const relDoc = xml(await rels.async("string"));
    const map = new Map<string, string>();
    for (const r of all(relDoc, "Relationship")) map.set(r.getAttribute("Id") ?? "", "ppt/" + (r.getAttribute("Target") ?? "").replace(/^\/?ppt\//, ""));
    const presDoc = xml(await pres.async("string"));
    return all(presDoc, "sldId")
      .map((s) => map.get(s.getAttribute("r:id") ?? s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "") ?? "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ PDF */

export const pdfParser: DocumentParser = {
  type: "pdf",
  async parse(file, onProgress) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", document.baseURI).href;
    let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    } catch (e) {
      const msg = String((e as Error)?.name ?? e);
      if (/Password/i.test(msg)) throw new ParseError(msg, "This PDF is password-protected. Remove the password and try again.");
      throw new ParseError(msg, "We couldn't read this PDF. It may be corrupted.");
    }
    const pages: ParsedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      type Item = { str: string; y: number; x: number; h: number };
      const items: Item[] = [];
      for (const it of content.items as { str?: string; transform?: number[]; height?: number }[]) {
        if (!it.str || !it.transform) continue;
        items.push({ str: it.str, x: it.transform[4], y: Math.round(it.transform[5]), h: Math.abs(it.height || it.transform[3] || 0) });
      }
      // Group into lines by y (top to bottom), then x.
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { text: string; h: number }[] = [];
      let cur: Item[] = [];
      const flush = () => {
        if (!cur.length) return;
        const text = cur.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) lines.push({ text, h: Math.max(...cur.map((c) => c.h)) });
        cur = [];
      };
      for (const it of items) {
        if (cur.length && Math.abs(cur[0].y - it.y) > 3) flush();
        cur.push(it);
      }
      flush();
      const bodyH = median(lines.map((l) => l.h)) || 10;
      const top = lines.slice(0, 4);
      const heading = top.find((l) => l.h >= bodyH * 1.18 && l.text.length < 120);
      const title = heading?.text ?? truncate(lines[0]?.text ?? `Page ${n}`, 90);
      const rest = lines.filter((l) => l !== heading).map((l) => l.text);
      const text = normalizeWhitespace(joinWrapped(rest));
      pages.push({ title, text, needsText: !text && !heading });
      onProgress(n / doc.numPages, `Reading page ${n} of ${doc.numPages}`);
    }
    const empty = pages.filter((p) => p.needsText).length;
    const warnings = empty ? [`${empty} page${empty === 1 ? "" : "s"} had no selectable text (scanned pages need OCR).`] : [];
    return { fileType: "pdf", title: baseName(file.name), unit: "pages", pages, warnings };
  },
};

function median(ns: number[]) {
  if (!ns.length) return 0;
  const s = ns.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Join lines that were wrapped mid-sentence, keep bullets and headings on their own line. */
function joinWrapped(lines: string[]) {
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && !/[.:!?]$/.test(prev) && /^[a-z(]/.test(l) && !/^[•\-–*]/.test(l)) out[out.length - 1] = prev + " " + l;
    else out.push(l);
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ DOCX */

export const docxParser: DocumentParser = {
  type: "docx",
  async parse(file, onProgress) {
    const { default: JSZip } = await import("jszip");
    let docXml: string;
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const f = zip.file("word/document.xml");
      if (!f) throw new Error("missing document.xml");
      docXml = await f.async("string");
    } catch {
      throw new ParseError("docx", "We couldn't open this Word document. It may be corrupted or password-protected.");
    }
    onProgress(0.4, "Reading document");
    const doc = xml(docXml);
    type Block = { level: number; text: string };
    const blocks: Block[] = [];
    for (const p of all(doc, "p")) {
      const style = all(p, "pStyle")[0]?.getAttribute("w:val") ?? all(p, "pStyle")[0]?.getAttributeNS("*", "val") ?? "";
      const text = all(p, "t").map((t) => t.textContent ?? "").join("").trim();
      if (!text) continue;
      const m = style.match(/^(?:Heading|heading)\s?(\d)$/) ?? (style === "Title" ? ["", "0"] : null);
      const isList = all(p, "numPr").length > 0;
      blocks.push({ level: m ? Number(m[1]) : isList ? 98 : 99, text: isList ? "• " + text : text });
    }
    if (!blocks.length) throw new ParseError("empty", "This document doesn't contain any readable text.");
    onProgress(0.8, "Finding sections");

    // Sections start at level 1–2 headings. If there are none, fall back to ~180-word chunks.
    const headingLevels = blocks.filter((b) => b.level >= 1 && b.level <= 3).map((b) => b.level);
    const splitLevel = headingLevels.length ? Math.min(...headingLevels) + (headingLevels.filter((l) => l === Math.min(...headingLevels)).length < 3 ? 1 : 0) : 0;
    const pages: ParsedPage[] = [];
    let docTitle = blocks.find((b) => b.level === 0)?.text ?? baseName(file.name);
    if (splitLevel) {
      let cur: ParsedPage | null = null;
      let parentHeading = "";
      for (const b of blocks) {
        if (b.level === 0) continue;
        if (b.level < splitLevel) {
          parentHeading = b.text;
          continue;
        }
        if (b.level === splitLevel) {
          if (cur) pages.push(cur);
          cur = { title: b.text, text: parentHeading ? `(${parentHeading})\n` : "" };
        } else {
          if (!cur) cur = { title: firstLine(b.text).slice(0, 80), text: "" };
          cur.text += (b.level <= 6 ? "\n" + b.text + "\n" : b.text + "\n");
        }
      }
      if (cur) pages.push(cur);
    } else {
      pages.push(...chunkBlocks(blocks.map((b) => b.text)));
    }
    if (!docTitle) docTitle = baseName(file.name);
    onProgress(1);
    return { fileType: "docx", title: docTitle, unit: "sections", pages: pages.map((p) => ({ ...p, text: normalizeWhitespace(p.text) })), warnings: [] };
  },
};

function chunkBlocks(paras: string[], target = 170): ParsedPage[] {
  const pages: ParsedPage[] = [];
  let buf: string[] = [];
  let count = 0;
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join("\n");
    const first = firstLine(text);
    const title = first.length < 70 && !/[.]$/.test(first) ? first : truncate(first.split(/[.!?]/)[0], 60);
    pages.push({ title, text: first.length < 70 && !/[.]$/.test(first) ? buf.slice(1).join("\n") || text : text });
    buf = [];
    count = 0;
  };
  for (const p of paras) {
    const isHeading = p.length < 70 && !/[.!?:]$/.test(p) && /^[A-Z0-9#]/.test(p) && !p.startsWith("•");
    if (isHeading && count > 40) flush();
    buf.push(p.replace(/^#+\s*/, ""));
    count += p.split(/\s+/).length;
    if (count >= target) flush();
  }
  flush();
  return pages;
}

/* ------------------------------------------------------------------ TXT / pasted text */

export function parsePlainText(raw: string, title: string): ParsedDocument {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const hasMd = lines.some((l) => /^#{1,3}\s+\S/.test(l));
  let pages: ParsedPage[] = [];
  if (hasMd) {
    let cur: ParsedPage | null = null;
    for (const l of lines) {
      const m = l.match(/^#{1,3}\s+(.*)$/);
      if (m) {
        if (cur && (cur.text.trim() || cur.title)) pages.push(cur);
        cur = { title: m[1].trim(), text: "" };
      } else {
        if (!cur) cur = { title: "Introduction", text: "" };
        cur.text += l + "\n";
      }
    }
    if (cur) pages.push(cur);
    pages = pages.filter((p) => p.text.trim()).map((p) => ({ ...p, text: normalizeWhitespace(p.text) }));
  }
  if (!pages.length) pages = chunkBlocks(text.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean));
  if (!pages.length) throw new ParseError("empty", "There's no text to study here yet.");
  return { fileType: "txt", title, unit: "sections", pages, warnings: [] };
}

export const txtParser: DocumentParser = {
  type: "txt",
  async parse(file, onProgress) {
    const text = await file.text();
    onProgress(1);
    return parsePlainText(text, baseName(file.name));
  },
};

/* ------------------------------------------------------------------ Images */

export const imageParser: DocumentParser = {
  type: "image",
  async parse(file, onProgress) {
    const dataUrl = await downscale(file, 1400);
    onProgress(1);
    return {
      fileType: "image",
      title: baseName(file.name),
      unit: "pages",
      pages: [{ title: baseName(file.name), text: "", imageDataUrl: dataUrl, needsText: true }],
      warnings: ["Handwriting and scanned text recognition isn't connected yet. Type or paste the key text for this image below."],
    };
  },
};

async function downscale(file: File, max: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new ParseError("image", "We couldn't open this image."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
