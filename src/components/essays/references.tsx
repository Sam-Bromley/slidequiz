import { Copy, Link2, Pencil, Plus, Quote, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn, uid } from "@/lib/utils";
import { cloudCite } from "@/services/ai/cloud";
import { patchEssay } from "@/services/essays";
import {
  STYLES,
  TYPES,
  emptyFields,
  findDoi,
  findIsbn,
  formatReference,
  fromBareUrl,
  fromDoi,
  fromEuropePmc,
  findPubmedId,
  fromIsbn,
  fromPageInfo,
  inTextCitation,
  isNumbered,
  orderedReferences,
  referencesHtml,
  referencesText,
  type EssayReference,
  type RefFields,
  type RefStyle,
  type RefType,
  type Run,
} from "@/services/references";
import type { EssayDraft } from "@/types/models";

/* ---------------------------------------------------------------- putting a citation into the essay */

/** The writing box the student was last in, so a citation can go where they were typing. */
let lastBox: HTMLTextAreaElement | null = null;
let lastPos = 0;
const watched = new WeakSet<HTMLTextAreaElement>();
export function rememberBox(el: HTMLTextAreaElement) {
  lastBox = el;
  const keep = () => {
    if (lastBox === el) lastPos = el.selectionStart ?? el.value.length;
  };
  keep();
  if (watched.has(el)) return;
  watched.add(el);
  for (const ev of ["keyup", "click", "select", "blur"]) el.addEventListener(ev, keep);
}

function insertCitation(text: string) {
  const el = lastBox;
  if (!el || !document.contains(el)) {
    navigator.clipboard?.writeText(text).then(() => toast(`Copied ${text}. Click in your essay and paste it.`), () => toast(text));
    return;
  }
  const pos = Math.min(lastPos, el.value.length);
  const before = el.value.slice(0, pos);
  // A space before it unless it starts a line or follows a space; full stop goes after the citation.
  const needSpace = before && !/\s$/.test(before);
  const ins = `${needSpace ? " " : ""}${text}`;
  el.focus();
  el.setSelectionRange(pos, pos);
  el.setRangeText(ins, pos, pos, "end");
  // Let the box know its text changed, so it saves.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  lastPos = pos + ins.length;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  toast(`Added ${text}`);
}

/* ---------------------------------------------------------------- showing a reference */

export function RefRuns({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.i ? (
          <i key={i}>{r.t}</i>
        ) : (
          <span key={i} className="break-words">
            {r.t}
          </span>
        ),
      )}
    </>
  );
}

/* ---------------------------------------------------------------- the editor for one source */

type FieldKey = keyof RefFields;
type Def = { key: FieldKey; label: string; ph?: string; half?: boolean; type?: string };
const AUTH: Def = { key: "authors", label: "Authors", ph: "One per line: Surname, First name\nor an organisation, e.g. World Health Organization" };
const FIELDS: Record<RefType, Def[]> = {
  article: [AUTH, { key: "year", label: "Year", half: true, ph: "2021" }, { key: "title", label: "Article title" }, { key: "container", label: "Journal" }, { key: "volume", label: "Volume", half: true }, { key: "issue", label: "Issue", half: true }, { key: "pages", label: "Pages", half: true, ph: "45-60" }, { key: "doi", label: "DOI", half: true, ph: "10.1000/xyz123" }, { key: "url", label: "Link (if no DOI)" }],
  book: [AUTH, { key: "year", label: "Year", half: true }, { key: "edition", label: "Edition", half: true, ph: "2" }, { key: "title", label: "Book title" }, { key: "publisher", label: "Publisher", half: true }, { key: "place", label: "Place published", half: true, ph: "London" }, { key: "doi", label: "DOI (optional)", half: true }, { key: "url", label: "Link (e-books)", half: true }],
  chapter: [AUTH, { key: "year", label: "Year", half: true }, { key: "pages", label: "Pages", half: true, ph: "12-30" }, { key: "title", label: "Chapter title" }, { key: "editors", label: "Editors", ph: "One per line: Surname, First name" }, { key: "container", label: "Book title" }, { key: "edition", label: "Edition", half: true }, { key: "publisher", label: "Publisher", half: true }, { key: "place", label: "Place published", half: true }, { key: "doi", label: "DOI (optional)", half: true }],
  website: [{ ...AUTH, label: "Author or organisation" }, { key: "title", label: "Page title" }, { key: "container", label: "Website name", half: true, ph: "BBC News" }, { key: "date", label: "Published", half: true, type: "date" }, { key: "url", label: "Link" }, { key: "accessed", label: "Accessed", half: true, type: "date" }],
  report: [{ ...AUTH, label: "Author or organisation" }, { key: "year", label: "Year", half: true }, { key: "number", label: "Report number", half: true }, { key: "title", label: "Report title" }, { key: "publisher", label: "Publisher", half: true }, { key: "place", label: "Place published", half: true }, { key: "url", label: "Link" }, { key: "accessed", label: "Accessed", half: true, type: "date" }],
  video: [{ ...AUTH, label: "Creator or channel" }, { key: "title", label: "Video title" }, { key: "container", label: "Platform", half: true, ph: "YouTube" }, { key: "date", label: "Uploaded", half: true, type: "date" }, { key: "url", label: "Link" }, { key: "accessed", label: "Accessed", half: true, type: "date" }],
};

function RefEditor({ initial, style, onSave, onCancel }: { initial: EssayReference; style: RefStyle; onSave: (r: EssayReference) => void; onCancel: () => void }) {
  const [type, setType] = useState<RefType>(initial.type ?? "website");
  const [f, setF] = useState<RefFields>(initial.fields ?? emptyFields(initial.type ?? "website"));
  const [listText, setListText] = useState({ authors: (f.authors ?? []).join("\n"), editors: (f.editors ?? []).join("\n") });
  const set = (k: FieldKey, v: string) => setF((x) => ({ ...x, [k]: v }));
  const current: EssayReference = { ...initial, type, fields: { ...f, authors: listText.authors.split("\n").map((a) => a.trim()).filter(Boolean), editors: listText.editors.split("\n").map((a) => a.trim()).filter(Boolean) } };
  const ok = !!current.fields!.title.trim();
  return (
    <div className="rounded-xl border bg-subtle/50 p-3.5 sm:p-4">
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type of source">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => {
              setType(t.value);
              if ((t.value === "website" || t.value === "video" || t.value === "report") && !f.accessed) set("accessed", new Date().toISOString().slice(0, 10));
            }}
            className={cn("h-8 rounded-full border px-3 text-[13px] transition-colors focus-ring", type === t.value ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:bg-accent")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[type].map((d) => {
          const id = `ref-${initial.id}-${d.key}`;
          const list = d.key === "authors" || d.key === "editors";
          return (
            <div key={d.key} className={cn(!d.half && "sm:col-span-2")}>
              <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
                {d.label}
              </label>
              {list ? (
                <textarea
                  id={id}
                  rows={2}
                  value={listText[d.key as "authors" | "editors"]}
                  onChange={(e) => setListText((x) => ({ ...x, [d.key]: e.target.value }))}
                  placeholder={d.ph}
                  className="block w-full resize-y rounded-lg border bg-background px-3 py-2 text-[14px] leading-relaxed placeholder:text-muted-foreground/60 focus-ring"
                />
              ) : (
                <Input id={id} type={d.type ?? "text"} value={(f[d.key] as string | undefined) ?? ""} onChange={(e) => set(d.key, e.target.value)} placeholder={d.ph} />
              )}
            </div>
          );
        })}
      </div>
      {ok && (
        <div className="mt-3 rounded-lg border bg-card px-3 py-2.5 text-[13.5px] leading-relaxed">
          <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">How it will look</p>
          <RefRuns runs={formatReference(current, style)} />
          <p className="mt-1 text-[12.5px] text-muted-foreground">In the text: {inTextCitation(current, style, 1)}</p>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!ok} onClick={() => onSave(current)}>
          Save reference
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the references section */

export function ReferencesPanel({ e }: { e: EssayDraft }) {
  const style = e.refStyle ?? "harvard";
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EssayReference | null>(null);
  const refs = orderedReferences(e.references, style);

  const save = (r: EssayReference) => {
    patchEssay(e.id, (cur) => ({ references: cur.references.some((x) => x.id === r.id) ? cur.references.map((x) => (x.id === r.id ? r : x)) : [...cur.references.filter((x) => x.text.trim() || x.fields), r] }));
    setEditing(null);
  };

  const cite = async () => {
    const input = link.trim();
    if (!input) return;
    setBusy(true);
    let found: { type: RefType; fields: RefFields } | null = null;
    try {
      const doi = findDoi(input);
      const isbn = !/^https?:/i.test(input) || /isbn/i.test(input) ? findIsbn(input) : null;
      const pubmed = !doi ? findPubmedId(input) : null;
      if (doi) found = await fromDoi(doi).catch(() => null);
      else if (pubmed) found = await fromEuropePmc(pubmed, /^https?:/i.test(input) ? input : "").catch(() => null);
      else if (isbn) found = await fromIsbn(isbn).catch(() => null);
      if (!found) {
        const url = /^https?:\/\//i.test(input) ? input : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(input) ? `https://${input}` : "";
        if (url) {
          const info = await cloudCite(url).catch(() => null);
          if (info?.doi) found = await fromDoi(info.doi).catch(() => null);
          if (found && info?.url) found.fields.url = found.fields.doi ? "" : info.url;
          if (!found && info && info.title) found = fromPageInfo(info, url);
          if (!found) {
            found = fromBareUrl(url);
            toast("Couldn't read all the details from that page. Fill in the rest below.");
          }
        } else if (!doi && !isbn && !pubmed) toast.error("Paste a link, a DOI (10.xxxx/…) or an ISBN.");
        else toast.error(doi ? "Couldn't find that DOI." : "Couldn't find that ISBN.");
      }
    } finally {
      setBusy(false);
    }
    if (found) {
      setEditing({ id: uid("ref"), text: "", type: found.type, fields: found.fields });
      setLink("");
      setTimeout(() => document.getElementById("ref-editor-new")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    }
  };

  const copyAll = async () => {
    const html = referencesHtml(e.references, style);
    const text = referencesText(e.references, style);
    try {
      if ("ClipboardItem" in window) await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      else await navigator.clipboard.writeText(text);
      toast("Reference list copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`style-${e.id}`} className="text-[13px] font-medium">
          Style
        </label>
        <Select id={`style-${e.id}`} value={style} onChange={(x) => patchEssay(e.id, { refStyle: x.target.value as RefStyle })} className="h-8 w-auto py-0 text-[13px]">
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        {refs.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={copyAll}>
            <Copy /> Copy list
          </Button>
        )}
      </div>

      {/* Add a source from a link */}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(x) => {
          x.preventDefault();
          cite();
        }}
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Link, DOI or ISBN" value={link} onChange={(x) => setLink(x.target.value)} placeholder="Paste a link, DOI or ISBN" className="pl-9" />
        </div>
        <Button type="submit" loading={busy} disabled={!link.trim()}>
          <Quote /> Cite
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <span>Or add by hand:</span>
        {TYPES.map((t) => (
          <button key={t.value} type="button" onClick={() => setEditing({ id: uid("ref"), text: "", type: t.value, fields: emptyFields(t.value) })} className="rounded-full border px-2.5 py-1 transition-colors hover:bg-accent hover:text-foreground focus-ring">
            {t.label}
          </button>
        ))}
      </div>

      {editing && !e.references.some((r) => r.id === editing.id) && <div id="ref-editor-new" />}
      {editing && !e.references.some((r) => r.id === editing.id) && <RefEditor initial={editing} style={style} onSave={save} onCancel={() => setEditing(null)} />}

      {refs.length > 0 ? (
        <ol className="space-y-2">
          {refs.map((r, i) =>
            editing?.id === r.id && r.fields ? (
              <li key={r.id}>
                <RefEditor initial={editing} style={style} onSave={save} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <RefRow key={r.id} e={e} r={r} n={i + 1} style={style} onEdit={() => setEditing(r)} />
            ),
          )}
        </ol>
      ) : (
        !editing && <p className="text-[13px] text-muted-foreground">No references yet. Paste a link above and it's referenced for you in {STYLES.find((s) => s.value === style)?.label}.</p>
      )}
    </div>
  );
}

function RefRow({ e, r, n, style, onEdit }: { e: EssayDraft; r: EssayReference; n: number; style: RefStyle; onEdit: () => void }) {
  const [editingText, setEditingText] = useState(false);
  const [text, setText] = useState(r.text);
  const cite = inTextCitation(r, style, n);
  const remove = () => {
    const before = e.references;
    patchEssay(e.id, (cur) => ({ references: cur.references.filter((x) => x.id !== r.id) }));
    toast.undo("Reference removed", () => patchEssay(e.id, { references: before }));
  };
  return (
    <li className="group flex items-start gap-2.5 rounded-xl border bg-card px-3.5 py-3">
      {isNumbered(style) && <span className="mt-px w-6 shrink-0 text-[13px] tabular-nums text-muted-foreground">{style === "ieee" ? `[${n}]` : `${n}.`}</span>}
      <div className="min-w-0 flex-1">
        {editingText ? (
          <div className="space-y-2">
            <textarea value={text} onChange={(x) => setText(x.target.value)} rows={3} aria-label="Reference" className="block w-full rounded-lg border bg-background px-3 py-2 text-[14px] leading-relaxed focus-ring" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={() => (setEditingText(false), setText(r.text))}>
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  patchEssay(e.id, (cur) => ({ references: cur.references.map((x) => (x.id === r.id ? { ...x, text } : x)) }));
                  setEditingText(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[14px] leading-relaxed" style={{ paddingLeft: isNumbered(style) ? 0 : "1.5em", textIndent: isNumbered(style) ? 0 : "-1.5em" }}>
            <RefRuns runs={formatReference(r, style)} />
          </p>
        )}
        {cite && !editingText && (
          <button type="button" onMouseDown={(x) => x.preventDefault()} onClick={() => insertCitation(cite)} title="Put this citation where you were last typing" className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-0.5 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/15 focus-ring">
            <Plus className="size-3" /> Cite in essay {cite}
          </button>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5">
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Edit reference" onClick={() => (r.fields ? onEdit() : setEditingText(true))}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Remove reference" onClick={remove}>
          <X />
        </Button>
      </div>
    </li>
  );
}
