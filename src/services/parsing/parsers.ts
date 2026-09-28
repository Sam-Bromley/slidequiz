import { normalizeWhitespace, truncate } from "@/lib/text";
import { ParseError, type DocumentParser, type ParsedDocument, type ParsedImage, type ParsedPage } from "./types";

/* ------------------------------------------------------------------ images */

const MAX_IMAGE = 1200;
const MIN_IMAGE = 48;

function canvasToBlob(c: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((res) => c.toBlob((b) => res(b), type, 0.85));
}

/** Decode, shrink to a sensible size and re-encode. Returns null for icons or formats browsers can't show (EMF/WMF). */
async function prepareImage(key: string, source: CanvasImageSource & { width: number; height: number }, keepAlpha: boolean): Promise<ParsedImage | null> {
  const { width, height } = source;
  if (!width || !height || width < MIN_IMAGE || height < MIN_IMAGE) return null;
  const scale = Math.min(1, MAX_IMAGE / Math.max(width, height));
  const c = document.createElement("canvas");
  c.width = Math.round(width * scale);
  c.height = Math.round(height * scale);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (!keepAlpha) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const blob = await canvasToBlob(c, keepAlpha ? "image/png" : "image/jpeg");
  return blob ? { key, blob, width: c.width, height: c.height, detailed: hasDetail(c) } : null;
}

/** Plain colour blocks, gradients and near-empty images aren't worth showing. */
function hasDetail(src: HTMLCanvasElement) {
  const n = 32;
  const t = document.createElement("canvas");
  t.width = t.height = n;
  const ctx = t.getContext("2d");
  if (!ctx) return true;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, n, n);
  ctx.drawImage(src, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const lum: number[] = [];
  const buckets = new Set<number>();
  let edges = 0;
  for (let i = 0; i < d.length; i += 4) {
    lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    buckets.add(((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5));
  }
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  for (let y = 0; y < n; y++) for (let x = 1; x < n; x++) if (Math.abs(lum[y * n + x] - lum[y * n + x - 1]) > 24) edges++;
  return sd > 10 && buckets.size >= 4 && edges >= 12;
}

async function imageFromBytes(key: string, bytes: Blob, name: string): Promise<ParsedImage | null> {
  if (!/\.(png|jpe?g|gif|bmp|webp)$/i.test(name)) return null;
  try {
    const bmp = await createImageBitmap(bytes);
    const out = await prepareImage(key, bmp, /\.(png|gif)$/i.test(name));
    bmp.close?.();
    return out;
  } catch {
    return null;
  }
}

/** Web links on a slide: relationship id → URL. */
async function externalLinks(zip: import("jszip"), relsPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const f = zip.file(relsPath);
  if (!f) return map;
  const doc = xml(await f.async("string"));
  for (const r of all(doc, "Relationship")) if (r.getAttribute("TargetMode") === "External" && /^(https?:|mailto:|www\.)/i.test(r.getAttribute("Target") ?? "")) map.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
  return map;
}

/** Paragraph text, with any hyperlinked words followed by their address so the notes can link them. */
function paraWithLinks(p: Element, links: Map<string, string>) {
  let out = "";
  let pending: string | null = null;
  const flush = () => {
    if (pending && !out.includes(pending)) out += ` (${pending})`;
    pending = null;
  };
  for (const r of Array.from(p.getElementsByTagNameNS("*", "r"))) {
    const t = all(r, "t").map((x) => x.textContent ?? "").join("");
    const link = all(r, "hlinkClick")[0];
    const id = link ? link.getAttribute("r:id") ?? link.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "" : "";
    const url = id ? links.get(id) ?? null : null;
    if (url !== pending) flush();
    out += t;
    pending = url;
  }
  flush();
  return out || all(p, "t").map((x) => x.textContent ?? "").join("");
}

/** Map of relationship id → zip path, for a part's .rels file. */
async function relTargets(zip: import("jszip"), relsPath: string, baseDir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const f = zip.file(relsPath);
  if (!f) return map;
  const doc = xml(await f.async("string"));
  for (const r of all(doc, "Relationship")) {
    const target = r.getAttribute("Target") ?? "";
    if (r.getAttribute("TargetMode") === "External") continue;
    const parts = (target.startsWith("/") ? target.slice(1) : baseDir + "/" + target).split("/");
    const out: string[] = [];
    for (const p of parts) p === ".." ? out.pop() : p && p !== "." && out.push(p);
    map.set(r.getAttribute("Id") ?? "", out.join("/"));
  }
  return map;
}

const embedOf = (el: Element) => el.getAttribute("r:embed") ?? el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") ?? "";

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
    const mediaCache = new Map<string, ParsedImage | null>();
    let slideSize: { cx: number; cy: number } | null = null;
    try {
      const pres = xml(await zip.file("ppt/presentation.xml")!.async("string"));
      const sz = all(pres, "sldSz")[0];
      if (sz) slideSize = { cx: Number(sz.getAttribute("cx")), cy: Number(sz.getAttribute("cy")) };
    } catch {
      /* use defaults */
    }
    for (let i = 0; i < ordered.length; i++) {
      const doc = xml(await zip.file(ordered[i])!.async("string"));
      const links = await externalLinks(zip, ordered[i].replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"));
      let title = "";
      const body: string[] = [];
      for (const sp of all(doc, "sp")) {
        const ph = all(sp, "ph")[0];
        const phType = ph?.getAttribute("type") ?? "";
        const paras = all(sp, "p")
          .map((p) => paraWithLinks(p, links))
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
      // Speaker notes are deliberately not read.
      if (!title) title = body.shift() ?? `Slide ${i + 1}`;
      const text = normalizeWhitespace(body.join("\n"));
      // Pictures placed on this slide (layout/master decorations aren't in the slide's own rels).
      const images: ParsedImage[] = [];
      const rels = await relTargets(zip, ordered[i].replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"), "ppt/slides");
      const words = body.join(" ").split(/\s+/).filter(Boolean).length;
      for (const pic of all(doc, "pic")) {
        const blip = all(pic, "blip")[0];
        const path = blip && rels.get(embedOf(blip));
        if (!path || images.some((x) => x.key === path)) continue;
        let img = mediaCache.get(path);
        if (img === undefined) {
          const f = zip.file(path);
          img = f ? await imageFromBytes(path, await f.async("blob"), path) : null;
          mediaCache.set(path, img);
        }
        if (!img) continue;
        // How big the picture is on the slide decides whether it's content or decoration.
        const ext = all(pic, "ext").find((e) => e.getAttribute("cx"));
        const cx = Number(ext?.getAttribute("cx") ?? 0);
        const cy = Number(ext?.getAttribute("cy") ?? 0);
        const area = cx && cy && slideSize ? (cx * cy) / (slideSize.cx * slideSize.cy) : 0.2;
        const ratio = cx && cy ? cx / cy : img.width / img.height;
        const icon = area < 0.035;
        const background = area > 0.8 && words >= 8;
        const strip = ratio > 5 || ratio < 0.2;
        images.push({ ...img, useful: !!img.detailed && !icon && !background && !strip });
      }
      pages.push({ title: truncate(title, 120), text, images });
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
      const images = await pdfImages(pdfjs, page, n).catch(() => [] as ParsedImage[]);
      pages.push({ title, text, needsText: !text && !heading && !images.length, images });
      onProgress(n / doc.numPages, `Reading page ${n} of ${doc.numPages}`);
    }
    const empty = pages.filter((p) => p.needsText).length;
    const warnings = empty ? [`${empty} page${empty === 1 ? "" : "s"} had no selectable text (scanned pages need OCR).`] : [];
    return { fileType: "pdf", title: baseName(file.name), unit: "pages", pages, warnings };
  },
};

type PdfImageObj = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; kind?: number };

/** Pictures drawn on a PDF page, read from the page's drawing instructions. */
async function pdfImages(pdfjs: typeof import("pdfjs-dist"), page: import("pdfjs-dist").PDFPageProxy, n: number): Promise<ParsedImage[]> {
  const ops = await page.getOperatorList();
  const names: string[] = [];
  for (let j = 0; j < ops.fnArray.length; j++) {
    const fn = ops.fnArray[j];
    if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
      const name = ops.argsArray[j]?.[0];
      if (typeof name === "string" && !names.includes(name)) names.push(name);
    }
  }
  const out: ParsedImage[] = [];
  for (const name of names.slice(0, 12)) {
    const store = name.startsWith("g_") ? page.commonObjs : page.objs;
    const obj = await new Promise<PdfImageObj | null>((res) => {
      try {
        store.get(name, (o: PdfImageObj) => res(o ?? null));
        setTimeout(() => res(null), 3000);
      } catch {
        res(null);
      }
    });
    if (!obj || obj.width < MIN_IMAGE || obj.height < MIN_IMAGE) continue;
    const c = document.createElement("canvas");
    c.width = obj.width;
    c.height = obj.height;
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
    else if (obj.data) {
      const px = obj.width * obj.height;
      const rgba = new Uint8ClampedArray(px * 4);
      if (obj.kind === 3) rgba.set(obj.data.subarray(0, px * 4));
      else if (obj.kind === 2) for (let i = 0; i < px; i++) (rgba[i * 4] = obj.data[i * 3]), (rgba[i * 4 + 1] = obj.data[i * 3 + 1]), (rgba[i * 4 + 2] = obj.data[i * 3 + 2]), (rgba[i * 4 + 3] = 255);
      else if (obj.kind === 1) {
        const rowBytes = (obj.width + 7) >> 3;
        for (let y = 0; y < obj.height; y++)
          for (let x = 0; x < obj.width; x++) {
            const v = obj.data[y * rowBytes + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;
            const i = (y * obj.width + x) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
            rgba[i + 3] = 255;
          }
      } else continue;
      ctx.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0);
    } else continue;
    // A tiny fingerprint so the same logo on every page is recognised as one picture.
    const t = document.createElement("canvas");
    t.width = t.height = 6;
    t.getContext("2d")!.drawImage(c, 0, 0, 6, 6);
    const fp = Array.from(t.getContext("2d")!.getImageData(0, 0, 6, 6).data.filter((_, i) => i % 4 !== 3))
      .map((v) => (v >> 5).toString(8))
      .join("");
    const img = await prepareImage(`pdf:${obj.width}x${obj.height}:${fp}`, c, false);
    if (img) {
      const ratio = img.width / img.height;
      out.push({ ...img, useful: !!img.detailed && Math.min(obj.width, obj.height) >= 100 && ratio < 5 && ratio > 0.2 });
    }
  }
  void n;
  return out;
}

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
    let zip: InstanceType<typeof JSZip>;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
      const f = zip.file("word/document.xml");
      if (!f) throw new Error("missing document.xml");
      docXml = await f.async("string");
    } catch {
      throw new ParseError("docx", "We couldn't open this Word document. It may be corrupted or password-protected.");
    }
    onProgress(0.4, "Reading document");
    const doc = xml(docXml);
    const rels = await relTargets(zip, "word/_rels/document.xml.rels", "word");
    const mediaCache = new Map<string, ParsedImage | null>();
    type Block = { level: number; text: string; images: ParsedImage[] };
    const blocks: Block[] = [];
    for (const p of all(doc, "p")) {
      const style = all(p, "pStyle")[0]?.getAttribute("w:val") ?? all(p, "pStyle")[0]?.getAttributeNS("*", "val") ?? "";
      const text = all(p, "t").map((t) => t.textContent ?? "").join("").trim();
      const images: ParsedImage[] = [];
      for (const blip of all(p, "blip")) {
        const path = rels.get(embedOf(blip));
        if (!path) continue;
        let img = mediaCache.get(path);
        if (img === undefined) {
          const f = zip.file(path);
          img = f ? await imageFromBytes(path, await f.async("blob"), path) : null;
          mediaCache.set(path, img);
        }
        if (!img) continue;
        // Size on the page (EMU; 914400 per inch). Under ~1 inch is an icon or bullet picture.
        const ext = all(p, "extent")[0];
        const cx = Number(ext?.getAttribute("cx") ?? 0);
        const cy = Number(ext?.getAttribute("cy") ?? 0);
        const small = cx && cy ? cx < 914400 && cy < 914400 : false;
        const ratio = cx && cy ? cx / cy : img.width / img.height;
        images.push({ ...img, useful: !!img.detailed && !small && ratio < 5 && ratio > 0.2 });
      }
      if (!text && !images.length) continue;
      if (!text) {
        blocks.push({ level: 97, text: "", images });
        continue;
      }
      const m = style.match(/^(?:Heading|heading)\s?(\d)$/) ?? (style === "Title" ? ["", "0"] : null);
      const isList = all(p, "numPr").length > 0;
      blocks.push({ level: m ? Number(m[1]) : isList ? 98 : 99, text: isList ? "• " + text : text, images });
    }
    if (!blocks.some((b) => b.text)) throw new ParseError("empty", "This document doesn't contain any readable text.");
    onProgress(0.8, "Finding sections");

    // Sections start at level 1–2 headings. If there are none, fall back to ~180-word chunks.
    const headingLevels = blocks.filter((b) => b.level >= 1 && b.level <= 3).map((b) => b.level);
    const splitLevel = headingLevels.length ? Math.min(...headingLevels) + (headingLevels.filter((l) => l === Math.min(...headingLevels)).length < 3 ? 1 : 0) : 0;
    const pages: ParsedPage[] = [];
    let docTitle = blocks.find((b) => b.level === 0)?.text ?? baseName(file.name);
    if (splitLevel) {
      let cur: ParsedPage | null = null;
      let parentHeading = "";
      let loose: ParsedImage[] = [];
      for (const b of blocks) {
        if (b.level === 0) continue;
        if (b.level === 97) {
          if (cur) (cur.images ??= []).push(...b.images);
          else loose.push(...b.images);
          continue;
        }
        if (b.level < splitLevel) {
          parentHeading = b.text;
          continue;
        }
        if (b.level === splitLevel) {
          if (cur) pages.push(cur);
          cur = { title: b.text, text: parentHeading ? `(${parentHeading})\n` : "", images: [...loose, ...b.images] };
          loose = [];
        } else {
          if (!cur) cur = { title: firstLine(b.text).slice(0, 80), text: "", images: loose };
          cur.text += b.level <= 6 ? "\n" + b.text + "\n" : b.text + "\n";
          if (b.images.length) (cur.images ??= []).push(...b.images);
        }
      }
      if (cur) pages.push(cur);
    } else {
      const textBlocks = blocks.filter((b) => b.text);
      pages.push(...chunkBlocks(textBlocks.map((b) => b.text)));
      // Place each picture on the chunk nearest its position in the document.
      blocks.forEach((b, i) => {
        if (!b.images.length || !pages.length) return;
        const at = Math.min(pages.length - 1, Math.floor((i / blocks.length) * pages.length));
        (pages[at].images ??= []).push(...b.images);
      });
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
