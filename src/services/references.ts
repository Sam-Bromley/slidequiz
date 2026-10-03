/**
 * References for essays: the source's details, formatted in the student's chosen style
 * (Harvard by default), with the matching in-text citation. Details can be filled in
 * automatically from a link, DOI or ISBN.
 */

import type { EssayReference, RefFields, RefStyle, RefType } from "@/types/models";

export type { EssayReference, RefFields, RefStyle, RefType };

export const STYLES: { value: RefStyle; label: string }[] = [
  { value: "harvard", label: "Harvard" },
  { value: "apa", label: "APA 7th" },
  { value: "mla", label: "MLA 9th" },
  { value: "chicago", label: "Chicago (author-date)" },
  { value: "ieee", label: "IEEE" },
  { value: "vancouver", label: "Vancouver" },
];

export const TYPES: { value: RefType; label: string }[] = [
  { value: "article", label: "Journal article" },
  { value: "book", label: "Book" },
  { value: "chapter", label: "Book chapter" },
  { value: "website", label: "Website" },
  { value: "report", label: "Report" },
  { value: "video", label: "Video" },
];

/** Numbered styles list references in the order they're cited; the others alphabetically. */
export const isNumbered = (s: RefStyle) => s === "ieee" || s === "vancouver";

/* ---------------------------------------------------------------- names */

interface Name {
  family: string;
  given: string;
  org: boolean;
}
const parseName = (raw: string): Name => {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.includes(",")) {
    const [family, ...rest] = s.split(",");
    return { family: family.trim(), given: rest.join(",").trim(), org: false };
  }
  // Without a comma it's an organisation or channel, written in full.
  return { family: s, given: "", org: true };
};

/** "Jane Smith" → "Smith, Jane" for names found on web pages (organisations are left as they are). */
const invert = (raw: string) => {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s || s.includes(",")) return s;
  const words = s.split(" ");
  const looksLikePerson = words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z\u00C0-\u017F][\w\u00C0-\u017F'.-]*$/.test(w) || /^(van|von|de|der|da|di|le|la)$/i.test(w)) && !/\b(news|press|ltd|inc|university|organi[sz]ation|council|agency|institute|association|society|department|ministry|nhs|bbc|team|staff|editors?|group|trust|foundation|office|centre|center|service|course|channel|academy|school|college|media|official)\b/i.test(s);
  return looksLikePerson ? `${words[words.length - 1]}, ${words.slice(0, -1).join(" ")}` : s;
};

const initials = (given: string, dots = true, space = true) =>
  given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => (g.replace(/\./g, "")[0] ?? "").toUpperCase() + (dots ? "." : ""))
    .join(space ? " " : "");

const names = (f: RefFields) => f.authors.map((a) => a.trim()).filter(Boolean).map(parseName);

function listNames(ns: Name[], style: RefStyle): string {
  if (!ns.length) return "";
  const harvard = (n: Name) => (n.org ? n.family : `${n.family}, ${initials(n.given)}`);
  const apa = (n: Name) => (n.org ? n.family : `${n.family}, ${initials(n.given)}`);
  const full = (n: Name, inverted: boolean) => (n.org ? n.family : inverted ? `${n.family}, ${n.given}` : `${n.given} ${n.family}`.trim());
  const ieee = (n: Name) => (n.org ? n.family : `${initials(n.given)} ${n.family}`.trim());
  const van = (n: Name) => (n.org ? n.family : `${n.family} ${initials(n.given, false, false)}`.trim());
  switch (style) {
    case "harvard":
      if (ns.length >= 4) return `${harvard(ns[0])} et al.`;
      return ns.length === 1 ? harvard(ns[0]) : `${ns.slice(0, -1).map(harvard).join(", ")} and ${harvard(ns[ns.length - 1])}`;
    case "apa":
      if (ns.length === 1) return apa(ns[0]);
      if (ns.length > 20) return `${ns.slice(0, 19).map(apa).join(", ")}, . . . ${apa(ns[ns.length - 1])}`;
      return `${ns.slice(0, -1).map(apa).join(", ")}, & ${apa(ns[ns.length - 1])}`;
    case "mla":
      if (ns.length === 1) return full(ns[0], true);
      if (ns.length === 2) return `${full(ns[0], true)}, and ${full(ns[1], false)}`;
      return `${full(ns[0], true)}, et al.`;
    case "chicago":
      if (ns.length === 1) return full(ns[0], true);
      if (ns.length > 10) return `${ns.slice(0, 7).map((n, i) => full(n, i === 0)).join(", ")}, et al.`;
      return `${ns.slice(0, -1).map((n, i) => full(n, i === 0)).join(", ")}, and ${full(ns[ns.length - 1], false)}`;
    case "ieee":
      if (ns.length > 6) return `${ieee(ns[0])} et al.`;
      if (ns.length === 1) return ieee(ns[0]);
      if (ns.length === 2) return `${ieee(ns[0])} and ${ieee(ns[1])}`;
      return `${ns.slice(0, -1).map(ieee).join(", ")}, and ${ieee(ns[ns.length - 1])}`;
    case "vancouver":
      return ns.length > 6 ? `${ns.slice(0, 6).map(van).join(", ")}, et al` : ns.map(van).join(", ");
  }
}

/** Editors, for a book chapter: "A. Editor (ed.)" and so on. */
function listEditors(f: RefFields, style: RefStyle): string {
  const eds = (f.editors ?? []).map((a) => a.trim()).filter(Boolean).map(parseName);
  if (!eds.length) return "";
  const many = eds.length > 1;
  const given = (n: Name) => (n.org ? n.family : `${n.given} ${n.family}`.trim());
  const join = (xs: string[], and = "and") => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
  switch (style) {
    case "harvard":
      return `${join(eds.map((n) => (n.org ? n.family : `${n.family}, ${initials(n.given)}`)))} (${many ? "eds." : "ed."})`;
    case "apa":
      return `${join(eds.map((n) => (n.org ? n.family : `${initials(n.given)} ${n.family}`)), "&")} (${many ? "Eds." : "Ed."})`;
    case "mla":
    case "chicago":
      return join(eds.map(given));
    case "ieee":
      return `${join(eds.map((n) => (n.org ? n.family : `${initials(n.given)} ${n.family}`)))}, ${many ? "Eds." : "Ed."}`;
    case "vancouver":
      return `${eds.map((n) => (n.org ? n.family : `${n.family} ${initials(n.given, false, false)}`)).join(", ")}, ${many ? "editors" : "editor"}`;
  }
}

/* ---------------------------------------------------------------- dates and bits */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MLA_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IEEE_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const parts = (d?: string) => {
  const m = (d ?? "").match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  return m ? { y: m[1], m: m[2] ? Number(m[2]) - 1 : undefined, d: m[3] ? Number(m[3]) : undefined } : null;
};
const yearOf = (f: RefFields) => f.year?.trim() || parts(f.date)?.y || "";

const fmtDate = (iso: string | undefined, style: RefStyle) => {
  const p = parts(iso);
  if (!p) return "";
  const { y, m, d } = p;
  if (m === undefined) return y;
  switch (style) {
    case "harvard":
      return `${d ? `${d} ` : ""}${MONTHS[m]} ${y}`;
    case "apa":
      return `${y}, ${MONTHS[m]}${d ? ` ${d}` : ""}`;
    case "mla":
      return `${d ? `${d} ` : ""}${MLA_MONTHS[m]} ${y}`;
    case "chicago":
      return `${MONTHS[m]}${d ? ` ${d}` : ""}, ${y}`;
    case "ieee":
      return `${IEEE_MONTHS[m]}${d ? ` ${d}` : ""}, ${y}`;
    case "vancouver":
      return `${y} ${SHORT[m]}${d ? ` ${d}` : ""}`;
  }
};

const pageRange = (p: string | undefined, dash = "–") => (p ?? "").trim().replace(/\s*[-–—]+\s*/g, dash);
const multiPage = (p?: string) => /[-–—,]/.test(p ?? "");
const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
const edition = (e: string | undefined, style: RefStyle) => {
  const n = (e ?? "").trim().replace(/(st|nd|rd|th)?\s*(edn?|edition)?\.?$/i, "").trim();
  if (!n || n === "1") return "";
  const ord = /^\d+$/.test(n) ? ordinal(Number(n)) : n;
  return style === "harvard" ? `${ord} edn` : style === "vancouver" ? `${ord} ed` : `${ord} ed.`;
};
const doiUrl = (doi?: string) => (doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : "");
const bareDoi = (doi?: string) => (doi ?? "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
const end = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
/** An italic title followed by its full stop (outside the italics). */
const itEnd = (s: string) => `*${s}*${/[.?!]$/.test(s) ? "" : "."}`;

/* ---------------------------------------------------------------- formatting */

/** A reference as runs of text, some in italics. */
export type Run = { t: string; i?: boolean };

/** Builds runs from a template where *text* is italic. */
function runs(template: string): Run[] {
  const out: Run[] = [];
  template.split(/(\*[^*]+\*)/).forEach((bit) => {
    if (!bit) return;
    if (bit.startsWith("*") && bit.endsWith("*") && bit.length > 2) out.push({ t: bit.slice(1, -1), i: true });
    else out.push({ t: bit });
  });
  return out;
}
/** Tidies doubled spaces and punctuation left by empty fields. */
const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/\*\s*\*/g, "")
    .replace(/,\s*\./g, ".")
    .trim();

/** The reference list entry, as runs (with italics). */
export function formatReference(r: EssayReference, style: RefStyle): Run[] {
  if (!r.fields || !r.type) return [{ t: r.text.trim() }];
  const f = r.fields;
  const type = r.type;
  const ns = names(f);
  const who = listNames(ns, style);
  const y = yearOf(f);
  const title = f.title.trim();
  const cont = (f.container ?? "").trim();
  const vol = (f.volume ?? "").trim();
  const iss = (f.issue ?? "").trim();
  const pp = pageRange(f.pages);
  const pub = (f.publisher ?? "").trim();
  const place = (f.place ?? "").trim();
  const ed = edition(f.edition, style);
  const eds = listEditors(f, style);
  const doi = bareDoi(f.doi);
  const url = (f.url ?? "").trim();
  const link = doi ? doiUrl(doi) : url;
  const acc = f.accessed ? fmtDate(f.accessed, style) : "";
  const date = fmtDate(f.date, style);
  const num = (f.number ?? "").trim();
  const pubPlace = place && pub ? `${place}: ${pub}` : pub || place;
  const nd = style === "apa" ? "n.d." : "no date";


  let s = "";
  switch (style) {
    case "harvard": {
      const yr = `(${y || nd})`;
      const online = link ? ` Available at: ${link}${!doi && acc ? ` (Accessed: ${acc})` : ""}.` : "";
      if (type === "article") s = `${who} ${yr} '${title}', *${cont}*${vol ? `, ${vol}` : ""}${iss ? `(${iss})` : ""}${pp ? `, ${multiPage(f.pages) ? "pp." : "p."} ${pp}` : ""}.${online}`;
      else if (type === "book") s = `${who} ${yr} *${title}*.${ed ? ` ${ed}.` : ""}${pubPlace ? ` ${pubPlace}.` : ""}${online}`;
      else if (type === "chapter") s = `${who} ${yr} '${title}', in ${eds ? `${eds} ` : ""}*${cont}*.${ed ? ` ${ed}.` : ""}${pubPlace ? ` ${pubPlace}` : ""}${pp ? `, ${multiPage(f.pages) ? "pp." : "p."} ${pp}` : ""}.${online}`;
      else if (type === "report") s = `${who} ${yr} *${title}*.${num ? ` Report no. ${num}.` : ""}${pubPlace ? ` ${pubPlace}.` : ""}${online}`;
      else if (type === "video") s = `${who || cont} ${yr} *${title}* [Video].${online}`;
      else s = who ? `${who} ${yr} *${title}*.${online}` : `${cont ? `${cont} ` : ""}${yr} *${title}*.${online}`;
      break;
    }
    case "apa": {
      const dt = type === "website" || type === "video" ? `(${date || y || nd}).` : `(${y || nd}).`;
      const tail = link ? ` ${link}` : "";
      const whoA = who ? end(who) : "";
      if (type === "article") s = `${whoA} ${dt} ${end(title)} *${cont}*${vol ? `, *${vol}*` : ""}${iss ? `(${iss})` : ""}${pp ? `, ${pp}` : ""}.${tail}`;
      else if (type === "book") s = `${whoA} ${dt} *${title}*${ed ? ` (${ed})` : ""}.${pub ? ` ${pub}.` : ""}${tail}`;
      else if (type === "chapter") s = `${whoA} ${dt} ${end(title)} In ${eds ? `${eds}, ` : ""}*${cont}*${pp ? ` (pp. ${pp})` : ""}.${pub ? ` ${pub}.` : ""}${tail}`;
      else if (type === "report") s = `${whoA} ${dt} *${title}*${num ? ` (Report No. ${num})` : ""}.${pub && pub !== who ? ` ${pub}.` : ""}${tail}`;
      else if (type === "video") s = `${who ? whoA : end(cont)} ${dt} *${title}* [Video].${cont ? ` ${cont}.` : ""}${tail}`;
      else s = who ? `${whoA} ${dt} *${title}*.${cont && cont !== who ? ` ${cont}.` : ""}${tail}` : `*${title}*. ${dt}${cont ? ` ${cont}.` : ""}${tail}`;
      break;
    }
    case "mla": {
      const web = url ? ` ${url.replace(/^https?:\/\//, "")}` : doi ? ` ${doiUrl(doi)}` : "";
      const accd = !doi && acc && (type === "website" || type === "video") ? ` Accessed ${acc}.` : "";
      const who2 = who ? `${end(who)} ` : "";
      if (type === "article") s = `${who2}"${end(title)}" *${cont}*${vol ? `, vol. ${vol}` : ""}${iss ? `, no. ${iss}` : ""}${y ? `, ${y}` : ""}${pp ? `, ${multiPage(f.pages) ? "pp." : "p."} ${pp}` : ""}${web ? `,${web}` : ""}.`;
      else if (type === "book") s = `${who2}${itEnd(title)}${ed ? ` ${ed},` : ""}${pub ? ` ${pub},` : ""}${y ? ` ${y}` : ""}${web ? `,${web}` : ""}.`;
      else if (type === "chapter") s = `${who2}"${end(title)}" *${cont}*${eds ? `, edited by ${eds}` : ""}${pub ? `, ${pub}` : ""}${y ? `, ${y}` : ""}${pp ? `, ${multiPage(f.pages) ? "pp." : "p."} ${pp}` : ""}.`;
      else if (type === "report") s = `${who2}${itEnd(title)}${pub && pub !== who ? ` ${pub},` : ""}${y ? ` ${y}` : ""}${web ? `,${web}` : ""}.`;
      else if (type === "video") s = `"${end(title)}" *${cont || "YouTube"}*${who ? `, uploaded by ${ns.map((n) => (n.org ? n.family : `${n.given} ${n.family}`.trim())).join(" and ")}` : ""}${date || y ? `, ${date || y}` : ""}${web ? `,${web}` : ""}.`;
      else s = `${who2}"${end(title)}" ${cont ? `*${cont}*, ` : ""}${date || y ? `${date || y}, ` : ""}${web.trim()}.${accd}`;
      if (type !== "website" && accd) s += accd;
      break;
    }
    case "chicago": {
      const who2 = who ? `${end(who)} ` : cont && type !== "article" && type !== "chapter" ? `${end(cont)} ` : "";
      const tail = link ? ` ${link}.` : "";
      const yr = y || "n.d.";
      if (type === "article") s = `${who2}${yr}. "${end(title)}" *${cont}*${vol ? ` ${vol}` : ""}${iss ? ` (${iss})` : ""}${pp ? `: ${pp}` : ""}.${tail}`;
      else if (type === "book") s = `${who2}${yr}. ${itEnd(title)}${ed ? ` ${ed}` : ""}${pubPlace ? ` ${pubPlace}.` : ""}${tail}`;
      else if (type === "chapter") s = `${who2}${yr}. "${end(title)}" In *${cont}*${eds ? `, edited by ${eds}` : ""}${pp ? `, ${pp}` : ""}.${pubPlace ? ` ${pubPlace}.` : ""}${tail}`;
      else if (type === "report") s = `${who2}${yr}. ${itEnd(title)}${num ? ` Report ${num}.` : ""}${pubPlace ? ` ${pubPlace}.` : ""}${tail}`;
      else if (type === "video") s = `${who2}${yr}. "${end(title)}" ${cont || "YouTube"} video.${date ? ` ${date}.` : ""}${tail}`;
      else s = `${who2}${yr}. "${end(title)}" ${cont ? `${cont}. ` : ""}${date ? `${date}. ` : acc ? `Accessed ${acc}. ` : ""}${link ? `${link}.` : ""}`;
      break;
    }
    case "ieee": {
      const online = link ? ` [Online]. Available: ${link}` : "";
      if (type === "article") s = `${who}, "${title}," *${cont}*${vol ? `, vol. ${vol}` : ""}${iss ? `, no. ${iss}` : ""}${pp ? `, ${multiPage(f.pages) ? "pp." : "p."} ${pp}` : ""}${y ? `, ${y}` : ""}${doi ? `, doi: ${doi}` : ""}.${!doi && url ? online : ""}`;
      else if (type === "book") s = `${who}, *${title}*${ed ? `, ${ed}` : ""}.${pubPlace ? ` ${pubPlace},` : ""}${y ? ` ${y}` : ""}.${online}`;
      else if (type === "chapter") s = `${who}, "${title}," in *${cont}*${eds ? `, ${eds}` : ""}.${pubPlace ? ` ${pubPlace},` : ""}${y ? ` ${y}` : ""}${pp ? `, ${multiPage(f.pages) ? "pp." : "p."} ${pp}` : ""}.`;
      else if (type === "report") s = `${who}, "${title}," ${pub ? `${pub}, ` : ""}${place ? `${place}, ` : ""}${num ? `Rep. ${num}, ` : ""}${y}.${online}`;
      else s = `${who ? `${who}, ` : ""}"${title}," ${cont ? `${cont}. ` : ""}${acc ? `Accessed: ${acc}.` : ""}${online}`;
      break;
    }
    case "vancouver": {
      const who2 = who ? `${who}. ` : "";
      const cited = acc ? ` [cited ${fmtDate(f.accessed, "vancouver")}]` : "";
      const from = link ? ` Available from: ${link}` : "";
      if (type === "article") s = `${who2}${end(title)} ${cont ? `${cont}. ` : ""}${y}${vol ? `;${vol}` : ""}${iss ? `(${iss})` : ""}${pp ? `:${pageRange(f.pages, "-")}` : ""}.${doi ? ` doi:${doi}` : from}`;
      else if (type === "book") s = `${who2}${end(title)}${ed ? ` ${ed}.` : ""}${pubPlace ? ` ${pubPlace};` : ""} ${y}.${from}`;
      else if (type === "chapter") s = `${who2}${end(title)} In: ${eds ? `${eds}. ` : ""}${end(cont)}${pubPlace ? ` ${pubPlace};` : ""} ${y}.${pp ? ` p. ${pageRange(f.pages, "-")}.` : ""}`;
      else if (type === "report") s = `${who2}${end(title)}${pubPlace ? ` ${pubPlace};` : ""} ${y}.${num ? ` Report No.: ${num}.` : ""}${from}`;
      else s = `${who2}${title} [${type === "video" ? "Video" : "Internet"}]. ${cont ? `${cont}; ` : ""}${y || ""}${cited}.${from}`;
      break;
    }
  }
  return runs(tidy(s));
}

export const plainReference = (r: EssayReference, style: RefStyle) =>
  formatReference(r, style)
    .map((x) => x.t)
    .join("");

/** The in-text citation, e.g. "(Smith and Jones, 2021)" or "[3]". */
export function inTextCitation(r: EssayReference, style: RefStyle, n?: number): string {
  if (isNumbered(style)) return style === "ieee" ? `[${n ?? 1}]` : `(${n ?? 1})`;
  if (!r.fields || !r.type) {
    // A typed reference: use what's before the year, if it looks like "Surname, X. (2020)".
    const m = r.text.match(/^([^,(]+)[^(]*\((\d{4}|n\.?d\.?)/);
    return m ? (style === "mla" ? `(${m[1].trim()})` : `(${m[1].trim()}${style === "chicago" ? "" : ","} ${m[2]})`) : "";
  }
  const ns = names(r.fields);
  const y = yearOf(r.fields) || (style === "apa" ? "n.d." : "no date");
  const short = (n: Name) => n.family;
  let who = "";
  const amp = style === "apa" ? "&" : "and";
  const shortTitle = r.fields.title.trim().split(/\s+/).slice(0, 6).join(" ");
  if (!ns.length) who = style === "mla" ? `"${shortTitle}"` : style === "apa" ? shortTitle : r.fields.container?.trim() || `'${shortTitle}'`;
  else if (ns.length === 1) who = short(ns[0]);
  else if (ns.length === 2) who = `${short(ns[0])} ${amp} ${short(ns[1])}`;
  else if (ns.length === 3 && (style === "harvard" || style === "chicago")) who = `${short(ns[0])}, ${short(ns[1])} and ${short(ns[2])}`;
  else who = `${short(ns[0])} et al.`;
  if (style === "mla") return `(${who})`;
  if (style === "chicago") return `(${who} ${y})`;
  return `(${who}, ${y})`;
}

/** References in the order the style lists them. */
export function orderedReferences(refs: EssayReference[], style: RefStyle): EssayReference[] {
  const real = refs.filter((r) => (r.fields ? r.fields.title.trim() || r.fields.authors.some((a) => a.trim()) : r.text.trim()));
  if (isNumbered(style)) return real;
  return [...real].sort((a, b) => plainReference(a, style).localeCompare(plainReference(b, style), "en", { sensitivity: "base" }));
}

/** The reference list as HTML (keeps the italics when pasted into Word or Google Docs). */
export function referencesHtml(refs: EssayReference[], style: RefStyle): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return orderedReferences(refs, style)
    .map((r, i) => `<p>${isNumbered(style) ? (style === "ieee" ? `[${i + 1}] ` : `${i + 1}. `) : ""}${formatReference(r, style).map((x) => (x.i ? `<i>${esc(x.t)}</i>` : esc(x.t))).join("")}</p>`)
    .join("");
}

export function referencesText(refs: EssayReference[], style: RefStyle): string {
  return orderedReferences(refs, style)
    .map((r, i) => `${isNumbered(style) ? (style === "ieee" ? `[${i + 1}] ` : `${i + 1}. `) : ""}${plainReference(r, style)}`)
    .join("\n");
}

/* ---------------------------------------------------------------- filling in from a link */

export const todayISO = () => new Date().toISOString().slice(0, 10);

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>?#]+)/i;
export const findDoi = (s: string) => {
  const m = decodeURIComponent(s).match(DOI_RE);
  return m ? m[1].replace(/[).,;\]]+$/, "") : null;
};
export const findIsbn = (s: string) => {
  const t = s.replace(/isbn[:\s]*/i, "").replace(/[\s-]/g, "");
  if (/^(97[89])?\d{9}[\dXx]$/.test(t)) return t.toUpperCase();
  const m = s.match(/(?:isbn[=/:\s]*)((97[89])?[\d-]{9,16}[\dXx])/i);
  return m ? m[1].replace(/-/g, "").toUpperCase() : null;
};

const CROSSREF_TYPE: Record<string, RefType> = {
  "journal-article": "article",
  "proceedings-article": "article",
  "posted-content": "article",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "book-part": "chapter",
  "reference-entry": "chapter",
  report: "report",
  "report-component": "report",
  dataset: "website",
};

const person = (a: { family?: string; given?: string; name?: string; literal?: string }) => (a.family ? `${a.family}${a.given ? `, ${a.given}` : ""}` : (a.name ?? a.literal ?? "").trim());

/** Looks a DOI up on Crossref. */
export async function fromDoi(doi: string): Promise<{ type: RefType; fields: RefFields }> {
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!r.ok) throw new Error("not found");
  const m = (await r.json()).message;
  const dp: number[] = (m.issued ?? m.published ?? m["published-print"] ?? m["published-online"])?.["date-parts"]?.[0] ?? [];
  const type = CROSSREF_TYPE[m.type] ?? "article";
  return {
    type,
    fields: {
      authors: (m.author ?? []).map(person).filter(Boolean),
      editors: (m.editor ?? []).map(person).filter(Boolean),
      year: dp[0] ? String(dp[0]) : "",
      title: String((m.title ?? [])[0] ?? "").replace(/<[^>]+>/g, "").trim(),
      container: String((m["container-title"] ?? [])[0] ?? "").trim(),
      volume: m.volume ?? "",
      issue: m.issue ?? "",
      pages: m.page ?? "",
      publisher: type === "article" ? "" : (m.publisher ?? ""),
      place: m["publisher-location"] ?? "",
      edition: m["edition-number"] ?? "",
      doi,
      url: "",
    },
  };
}

/** A PubMed Central (PMC…) or PubMed article id in a link or pasted text. */
export function findPubmedId(s: string): { pmcid?: string; pmid?: string } | null {
  const pmc = s.match(/\bPMC\d{4,9}\b/i);
  if (pmc) return { pmcid: pmc[0].toUpperCase() };
  const pm = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})/i) ?? s.match(/\bPMID:?\s*(\d{4,9})\b/i);
  return pm ? { pmid: pm[1] } : null;
}

/** Looks a PubMed / PubMed Central article up on Europe PMC. */
export async function fromEuropePmc(id: { pmcid?: string; pmid?: string }, link: string): Promise<{ type: RefType; fields: RefFields }> {
  const q = id.pmcid ? `PMCID:${id.pmcid}` : `EXT_ID:${id.pmid} AND SRC:MED`;
  const r = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&resultType=core&format=json`);
  const a = r.ok ? (await r.json())?.resultList?.result?.[0] : null;
  if (!a?.title) throw new Error("not found");
  const ji = a.journalInfo ?? {};
  return {
    type: "article",
    fields: {
      authors: (a.authorList?.author ?? []).map((x: { lastName?: string; firstName?: string; collectiveName?: string; fullName?: string }) => (x.lastName ? `${x.lastName}${x.firstName ? `, ${x.firstName}` : ""}` : (x.collectiveName ?? x.fullName ?? ""))).filter(Boolean),
      year: String(ji.yearOfPublication ?? a.pubYear ?? ""),
      title: String(a.title).replace(/<[^>]+>/g, "").replace(/\.$/, "").trim(),
      container: ji.journal?.title ?? "",
      volume: ji.volume ?? "",
      issue: ji.issue ?? "",
      pages: a.pageInfo ?? "",
      doi: a.doi ?? "",
      url: a.doi ? "" : link,
    },
  };
}

/** Looks an ISBN up on Open Library. */
export async function fromIsbn(isbn: string): Promise<{ type: RefType; fields: RefFields }> {
  const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const d = r.ok ? (await r.json())[`ISBN:${isbn}`] : null;
  if (!d) throw new Error("not found");
  const year = String(d.publish_date ?? "").match(/\d{4}/)?.[0] ?? "";
  return {
    type: "book",
    fields: {
      authors: (d.authors ?? []).map((a: { name: string }) => invert(a.name)),
      year,
      title: [d.title, d.subtitle].filter(Boolean).join(": "),
      publisher: d.publishers?.[0]?.name ?? "",
      place: d.publish_places?.[0]?.name ?? "",
      url: "",
    },
  };
}

/** What the server found on a web page (see the "cite" task in the ai function). */
export interface PageInfo {
  type?: RefType;
  title?: string;
  authors?: string[];
  site?: string;
  date?: string;
  doi?: string;
  container?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  url?: string;
}

export function fromPageInfo(p: PageInfo, url: string): { type: RefType; fields: RefFields } {
  const type = p.type ?? (/youtube\.com|youtu\.be|vimeo\.com/i.test(url) ? "video" : "website");
  const date = (p.date ?? "").slice(0, 10);
  return {
    type,
    fields: {
      // A video's "author" is the channel, kept as it is.
      authors: (p.authors ?? []).map((a) => (type === "video" ? a.trim() : invert(a))),
      year: date.slice(0, 4),
      date: type === "website" || type === "video" ? date : undefined,
      title: (p.title ?? "").trim(),
      container: (p.container || p.site || "").trim(),
      volume: p.volume ?? "",
      issue: p.issue ?? "",
      pages: p.pages ?? "",
      publisher: p.publisher ?? "",
      url: p.url || url,
      accessed: todayISO(),
    },
  };
}

/** When nothing can be looked up: at least the link, the site's name and today's date. */
export function fromBareUrl(url: string): { type: RefType; fields: RefFields } {
  let site = "";
  try {
    site = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* not a URL */
  }
  return { type: /youtube\.com|youtu\.be/i.test(url) ? "video" : "website", fields: { authors: [], title: "", container: site, url, accessed: todayISO() } };
}

export const emptyFields = (type: RefType): RefFields => ({ authors: [], title: "", accessed: type === "website" || type === "video" ? todayISO() : undefined });
