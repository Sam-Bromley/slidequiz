import { BookOpen, Download, Image as ImageIcon, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StoredImage } from "@/components/materials/stored-image";
import { ChatPanel } from "@/components/tutor/chat-panel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildNotes, notesExportDoc, type NoteLine, type NoteSlide } from "@/services/notes";
import { ExportDialog } from "@/components/export/export-dialog";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { Material, PageImage } from "@/types/models";

const URL_RE = /((?:https?:\/\/|www\.)[^\s)]+[^\s).,;:!?'"])/g;

/** Plain text with any web addresses turned into links that open in a new tab. */
function linkify(text: string): ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.startsWith("www.") ? `https://${part}` : part;
    let shown = part.replace(/^https?:\/\//, "").replace(/^www\./, "");
    if (shown.length > 42) shown = shown.slice(0, 41) + "…";
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">
        {shown}
      </a>
    );
  });
}

function Line({ l }: { l: NoteLine }) {
  const body: ReactNode = l.term ? (
    <>
      <strong className="font-semibold text-foreground">{l.term}</strong>
      {l.sep ?? ": "}
      {linkify(l.text)}
    </>
  ) : (
    linkify(l.text)
  );
  if (l.kind === "sub") return <p className="mt-3 font-semibold text-foreground">{linkify(l.text)}</p>;
  if (l.kind === "para") return <p className="text-foreground/90">{body}</p>;
  return (
    <p className={cn("relative pl-5 text-foreground/90", l.depth === 1 && "ml-5")}>
      <span className={cn("absolute left-1 top-[0.72em] size-[5px] -translate-y-1/2 rounded-full", l.depth ? "border border-muted-foreground" : "bg-muted-foreground")} aria-hidden />
      {body}
    </p>
  );
}

function Figure({ img, label, open, className }: { img: PageImage; label: string; open: () => void; className?: string }) {
  return (
    <button type="button" onClick={open} className={cn("block overflow-hidden rounded-xl border bg-white p-1.5 transition-shadow hover:shadow-pop focus-ring", className)} aria-label={`Enlarge image from ${label}`}>
      <StoredImage id={img.id} alt={`Image from ${label}`} className="mx-auto max-h-80 w-full rounded-lg object-contain" />
    </button>
  );
}

function SlideBlock({ s, showImages, openImage }: { s: NoteSlide; showImages: boolean; openImage: (img: PageImage, label: string) => void }) {
  const hasText = s.lines.length > 0 || !!s.table;
  const imgs = showImages ? s.images : [];
  // One picture sits beside the text like a textbook figure; wide ones or several go underneath.
  const beside = hasText && imgs.length === 1 && imgs[0].width / imgs[0].height < 1.9;
  const text = (
    <div className="min-w-0">
      {s.lines.length > 0 && (
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          {s.lines.map((l, i) => (
            <Line key={i} l={l} />
          ))}
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
      <div className={cn(!s.title && "mt-4")}>
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
  const [asking, setAsking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [big, setBig] = useState<{ img: PageImage; label: string } | null>(null);

  useEffect(() => {
    if (!asking) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [asking]);

  if (!sections.length)
    return (
      <div className="rounded-2xl border border-dashed py-14 text-center">
        <BookOpen className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium">No notes yet</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Choose at least one slide with text to make notes from.</p>
      </div>
    );

  return (
    <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Contents" className="hidden lg:block">
        <div className="sticky top-20">
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Contents</p>
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

      <div className="min-w-0 max-w-[780px]">
        <div className="-ml-2.5 mb-2 flex flex-wrap items-center gap-2 py-1">
          <Button variant="ghost" size="sm" className="rounded-full bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground" onClick={() => setAsking(true)}>
            <MessageCircle /> Ask about these notes
          </Button>
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

        {sections.map((sec, si) => (
          <section key={sec.id} id={sec.id} className={cn("scroll-mt-28", si > 0 && "mt-12 border-t pt-10")}>
            <h2 className="text-[22px] font-semibold leading-tight">{sec.title}</h2>
            {sec.slides.map((s) => (
              <SlideBlock key={s.page.id} s={s} showImages={showImages} openImage={(img, label) => setBig({ img, label })} />
            ))}
          </section>
        ))}
      </div>

      {asking &&
        createPortal(
          <div className="fixed inset-0 z-[65] flex justify-end" role="dialog" aria-modal="true" aria-label="Ask about these notes">
            <div className="absolute inset-0 animate-fade-in bg-black/30" onClick={() => setAsking(false)} />
            <div className="relative h-[100dvh] w-full bg-background sm:w-[440px]">
              <ChatPanel material={material} className="h-full min-h-0 rounded-none border-0 border-l bg-background shadow-pop" onClose={() => setAsking(false)} />
            </div>
          </div>,
          document.body,
        )}

      {exporting && <ExportDialog open onClose={() => setExporting(false)} title={material.title} notes={notesExportDoc(material)} />}
      {big && (
        <Dialog open onClose={() => setBig(null)} title={`Image from ${big.label}`} size="xl">
          <StoredImage id={big.img.id} alt={`Image from ${big.label}`} className="max-h-[70vh] w-full rounded-lg bg-white object-contain" />
        </Dialog>
      )}
    </div>
  );
}
