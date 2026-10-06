import { BookOpen, ChevronLeft, Download, Image as ImageIcon, ListTree, MessageCircle, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StoredImage } from "@/components/materials/stored-image";
import { imageStore } from "@/services/storage/images";
import { ChatPanel } from "@/components/tutor/chat-panel";
import { AIWaiting, hasText } from "@/components/ai/ai-waiting";
import { Button } from "@/components/ui/button";
import { ImageZoom } from "@/components/ui/image-zoom";
import { cn } from "@/lib/utils";
import { tidyLine, tidyTerm } from "@/lib/tidy";
import { buildNotes, lineKey, notesExportDoc, type NoteLine, type NoteSlide } from "@/services/notes";
import { Highlighter } from "@/components/notes/highlighter";
import { ExportDialog } from "@/components/export/export-dialog";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { Material, NoteMark, PageImage } from "@/types/models";

const URL_RE = /((?:https?:\/\/|www\.)[^\s)]+[^\s).,;:!?'"]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi;

/** Plain text with any web addresses turned into links that open in a new tab. */
function linkify(text: string): ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.includes("@") && !/^https?:/i.test(part) ? `mailto:${part}` : /^www\./i.test(part) ? `https://${part}` : part;
    let shown = part.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    if (shown.length > 42) shown = shown.slice(0, 41) + "…";
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">
        {shown}
      </a>
    );
  });
}

export const MARK_BG: Record<NoteMark["color"], string> = {
  yellow: "bg-yellow-200/80 dark:bg-yellow-400/30",
  green: "bg-emerald-200/80 dark:bg-emerald-400/25",
  blue: "bg-sky-200/80 dark:bg-sky-400/25",
  pink: "bg-pink-200/80 dark:bg-pink-400/25",
};

/**
 * The line's text with any highlights. Highlights are stored as character positions in the
 * line as shown ("Term: text"), so they survive page reloads and show in the same place.
 */
function marked(term: string, sep: string, text: string, marks: NoteMark[], onMark: (m: NoteMark, el: HTMLElement) => void): ReactNode {
  const full = term ? term + (text ? sep : "") + text : text;
  const termEnd = term.length;
  if (!marks.length) {
    return term ? (
      <>
        <strong className="font-semibold text-foreground">{term}</strong>
        {text && sep}
        {linkify(text)}
      </>
    ) : (
      linkify(text)
    );
  }
  const cuts = new Set([0, full.length, termEnd]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(full.length, m.start)));
    cuts.add(Math.max(0, Math.min(full.length, m.end)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === b) continue;
    const seg = full.slice(a, b);
    const inner = a < termEnd ? <strong className="font-semibold text-foreground">{seg}</strong> : seg;
    const m = marks.find((x) => x.start <= a && x.end >= b);
    if (!m) {
      out.push(<span key={a}>{inner}</span>);
      continue;
    }
    const last = m.end === b;
    out.push(
      <mark
        key={a}
        data-mark-id={m.id}
        onClick={(e) => onMark(m, e.currentTarget)}
        className={cn("cursor-pointer rounded-[3px] px-0 text-inherit shadow-none", MARK_BG[m.color])}
        title={m.note ? m.note : "Click to add a note or remove"}
      >
        {inner}
        {last && m.note && <StickyNote className="ml-0.5 inline size-3.5 -translate-y-px text-foreground/70" aria-label="Has a note" />}
      </mark>,
    );
  }
  return out;
}

function Line({ l, k, marks, onMark }: { l: NoteLine; k: string; marks: NoteMark[]; onMark: (m: NoteMark, el: HTMLElement) => void }) {
  const text = tidyLine(l.text);
  const term = l.kind === "sub" ? "" : l.term ? tidyTerm(l.term) : "";
  if (!text && !term) return null;
  const sep = l.sep ?? ": ";
  const full = term ? term + (text ? sep : "") + text : text;
  const body = marked(term, sep, text, marks, onMark);
  const notes = marks.filter((m) => m.note).sort((x, y) => x.start - y.start);
  const own = notes.length > 0 && (
    <span className={cn("mt-1 block space-y-1", l.kind === "bullet" && "pl-5", l.depth === 1 && "ml-5")}>
      {notes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={(e) => onMark(m, e.currentTarget)}
          className={cn("flex w-full items-start gap-2 rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[0.9em] text-foreground/85 focus-ring", NOTE_BOX[m.color])}
        >
          <StickyNote className="mt-[0.2em] size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="whitespace-pre-wrap">{m.note}</span>
        </button>
      ))}
    </span>
  );
  let p: ReactNode;
  if (l.kind === "sub") p = <p data-line-key={k} data-full={full} className="mt-3 font-semibold text-foreground">{body}</p>;
  else if (l.kind === "para") p = <p data-line-key={k} data-full={full} className="text-foreground/90">{body}</p>;
  else
    p = (
      <p data-line-key={k} data-full={full} className={cn("relative pl-5 text-foreground/90", l.depth === 1 && "ml-5")}>
        <span className={cn("absolute left-1 top-[0.8em] size-[5px] -translate-y-1/2 rounded-full", l.depth ? "border border-muted-foreground" : "bg-muted-foreground")} aria-hidden />
        {body}
      </p>
    );
  return own ? (
    <div>
      {p}
      {own}
    </div>
  ) : (
    p
  );
}

const NOTE_BOX: Record<NoteMark["color"], string> = {
  yellow: "border-yellow-400 bg-yellow-50 dark:bg-yellow-400/10",
  green: "border-emerald-400 bg-emerald-50 dark:bg-emerald-400/10",
  blue: "border-sky-400 bg-sky-50 dark:bg-sky-400/10",
  pink: "border-pink-400 bg-pink-50 dark:bg-pink-400/10",
};

function Figure({ img, label, open, className }: { img: PageImage; label: string; open: () => void; className?: string }) {
  return (
    <button type="button" onClick={open} className={cn("block overflow-hidden rounded-xl border bg-white p-1.5 transition-shadow hover:shadow-pop focus-ring", className)} aria-label={`Enlarge image from ${label}`}>
      <StoredImage id={img.id} alt={`Image from ${label}`} className="mx-auto max-h-80 w-full rounded-lg object-contain" />
    </button>
  );
}

function SlideBlock({ s, first, showImages, onDevice, openImage, marks, onMark }: { s: NoteSlide; first: boolean; showImages: boolean; onDevice: Set<string> | null; openImage: (img: PageImage, label: string) => void; marks: Map<string, NoteMark[]>; onMark: (m: NoteMark, el: HTMLElement) => void }) {
  const hasText = s.lines.length > 0 || !!s.table;
  // Pictures are saved on the device the slides were uploaded on; skip any that aren't here.
  const imgs = showImages && onDevice ? s.images.filter((i) => onDevice.has(i.id)) : [];
  // One picture sits beside the text like a textbook figure; wide ones or several go underneath.
  const beside = hasText && imgs.length === 1 && imgs[0].width / imgs[0].height < 1.9;
  const text = (
    <div className="min-w-0">
      {s.lines.length > 0 && (
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          {s.lines.map((l, i) => {
            const k = lineKey(s.page.id, i, l.text);
            return <Line key={i} l={l} k={k} marks={marks.get(k) ?? []} onMark={onMark} />;
          })}
        </div>
      )}
      {s.table && (
        <div className="mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-subtle">
              <tr>{s.table[0].map((c, i) => <th key={i} className="px-3 py-2 font-semibold">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {s.table.slice(1).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-foreground/90">{linkify(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  return (
    <div id={`note-${s.page.id}`} className="scroll-mt-28">
      {s.title && <h3 className="mb-2 mt-7 text-[16px] font-semibold">{s.title}</h3>}
      {/* Without its own heading, a slide carries straight on from the one before. */}
      <div className={cn(!s.title && (first ? "mt-4" : "mt-1.5"))}>
        {beside ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,40%)] sm:items-start">
            {text}
            <Figure img={imgs[0]} label={s.page.label} open={() => openImage(imgs[0], s.page.label)} />
          </div>
        ) : (
          <>
            {text}
            {imgs.length > 0 && (
              <div className={cn("mt-4 grid gap-3", imgs.length === 1 ? "max-w-xl" : "grid-cols-2")}>
                {imgs.map((img) => (
                  <Figure key={img.id} img={img} label={s.page.label} open={() => openImage(img, s.page.label)} />
                ))}
              </div>
            )}
          </>
        )}
        {s.photo && <img src={s.photo} alt={s.page.title} className="mt-4 max-h-72 rounded-xl border object-contain" />}
      </div>
    </div>
  );
}

/** The material as organised notes. */
export function NotesView({ material }: { material: Material }) {
  const data = useData();
  const sections = useMemo(() => buildNotes(material), [material]);
  const showImages = !!data.settings.notesImages;
  const hasImages = sections.some((sec) => sec.slides.some((x) => x.images.length));
  const imageIds = useMemo(() => sections.flatMap((sec) => sec.slides.flatMap((x) => x.images.map((i) => i.id))), [sections]);
  /** Which of the pictures are saved on this device (checked once pictures are switched on). */
  const [onDevice, setOnDevice] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!showImages || !imageIds.length) return;
    let live = true;
    Promise.all(imageIds.map(async (id) => ((await imageStore.get(id)) ? id : null))).then((r) => live && setOnDevice(new Set(r.filter((x): x is string => !!x))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImages, imageIds.join(",")]);
  const [asking, setAsking] = useState(false);
  // Text picked in the notes to ask about (explained as soon as the panel opens).
  const [askText, setAskText] = useState<string | null>(null);
  const [contents, setContents] = useState(() => {
    try {
      return localStorage.getItem("slidequiz:notes-contents") !== "off";
    } catch {
      return true;
    }
  });
  const toggleContents = () =>
    setContents((on) => {
      try {
        localStorage.setItem("slidequiz:notes-contents", on ? "off" : "on");
      } catch {
        /* storage blocked */
      }
      return !on;
    });
  const [exporting, setExporting] = useState(false);
  const [big, setBig] = useState<{ img: PageImage; label: string } | null>(null);
  // Pro: highlights and notes on the notes.
  const [activeMark, setActiveMark] = useState<{ mark: NoteMark; el: HTMLElement } | null>(null);
  const marksByLine = useMemo(() => {
    const map = new Map<string, NoteMark[]>();
    for (const m of material.marks ?? []) map.set(m.key, [...(map.get(m.key) ?? []), m]);
    return map;
  }, [material.marks]);
  const openMark = (mark: NoteMark, el: HTMLElement) => {
    if (window.getSelection()?.toString()) return;
    setActiveMark({ mark, el });
  };

  useEffect(() => {
    if (!asking) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [asking]);

  if (!sections.length && hasText(material)) return <AIWaiting material={material} what="notes" />;
  if (!sections.length)
    return (
      <div className="rounded-2xl border border-dashed py-14 text-center">
        <BookOpen className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium">No notes yet</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Choose at least one slide with text to make notes from.</p>
      </div>
    );

  return (
    <div className={cn(contents && "lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10")}>
      <nav aria-label="Contents" className={cn("hidden", contents && "lg:block")}>
        <div className="sticky top-20">
          <button type="button" onClick={toggleContents} title="Hide contents" aria-expanded className="-ml-1 mb-2 flex items-center gap-1 rounded-md px-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-ring">
            Contents <ChevronLeft className="size-3.5" />
          </button>
          <ul className="space-y-0.5 border-l">
            {sections.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })} className="-ml-px block w-full border-l border-transparent py-1 pl-3 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-ring">
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="min-w-0 max-w-[780px] pb-24 lg:pb-16">
        <div className="-ml-2.5 mb-2 flex flex-wrap items-center gap-2 py-1">
          {!contents && (
            <Button variant="ghost" size="sm" className="hidden rounded-full bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground lg:inline-flex" onClick={toggleContents} aria-expanded={false}>
              <ListTree /> Contents
            </Button>
          )}
          <Button variant="ghost" size="sm" className="rounded-full bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground" onClick={() => setExporting(true)}>
            <Download /> Export
          </Button>
          {hasImages && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={showImages}
              className={cn("rounded-full bg-transparent hover:bg-foreground/5 hover:text-foreground", showImages ? "text-foreground" : "text-muted-foreground")}
              onClick={() => actions.updateSettings({ notesImages: !showImages })}
            >
              <ImageIcon /> {showImages ? "Hide images" : "Include images"}
            </Button>
          )}
        </div>

        {showImages && onDevice && onDevice.size === 0 && (
          <p className="mb-4 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">Pictures from your slides are saved on the device you uploaded them on, so they only show there.</p>
        )}

        <Highlighter
          material={material}
          active={activeMark}
          onClose={() => setActiveMark(null)}
          onAsk={(text) => {
            setAskText(text);
            setAsking(true);
          }}
        />
        {sections.map((sec, si) => (
          <section key={sec.id} id={sec.id} className={cn("scroll-mt-28", si > 0 && "mt-12 border-t pt-10")}>
            <h2 className="text-[22px] font-semibold leading-tight">{sec.title}</h2>
            {sec.slides.map((s, i) => (
              <SlideBlock key={s.page.id} s={s} first={i === 0} showImages={showImages} onDevice={onDevice} openImage={(img, label) => setBig({ img, label })} marks={marksByLine} onMark={openMark} />
            ))}
          </section>
        ))}
      </div>

      {!asking &&
        createPortal(
          <button
            type="button"
            onClick={() => setAsking(true)}
            aria-label="Ask about these notes"
            title="Ask about these notes"
            className="group fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] left-4 z-40 flex h-14 animate-fade-up items-center gap-2 rounded-full bg-foreground pl-[17px] pr-[17px] text-background shadow-pop transition-[transform,padding] duration-200 hover:scale-[1.03] focus-ring lg:bottom-6 lg:left-[calc(var(--sb,248px)+24px)] lg:hover:pr-5"
          >
            <MessageCircle className="size-[22px] shrink-0" />
            <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-[14px] font-semibold transition-[max-width] duration-200 lg:inline lg:group-hover:max-w-[180px]">Ask about these notes</span>
          </button>,
          document.body,
        )}

      {asking &&
        createPortal(
          <div className="fixed inset-0 z-[65] flex justify-end" role="dialog" aria-modal="true" aria-label="Ask about these notes">
            <div
              className="absolute inset-0 animate-fade-in bg-black/30"
              onClick={() => {
                setAsking(false);
                setAskText(null);
              }}
            />
            <div className="relative h-[100dvh] w-full bg-background sm:w-[440px]">
              <ChatPanel
                material={material}
                ask={askText ?? undefined}
                className="h-full min-h-0 rounded-none border-0 border-l bg-background shadow-pop"
                onClose={() => {
                  setAsking(false);
                  setAskText(null);
                }}
              />
            </div>
          </div>,
          document.body,
        )}

      {exporting && <ExportDialog open onClose={() => setExporting(false)} title={material.title} notes={notesExportDoc(material)} />}
      {big && <ImageZoom id={big.img.id} alt={`Image from ${big.label}`} onClose={() => setBig(null)} />}
    </div>
  );
}
