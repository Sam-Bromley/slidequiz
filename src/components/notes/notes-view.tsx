import { ArrowUp, BookOpen, Loader2, MessageCircle, Plus, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StoredImage } from "@/components/materials/stored-image";
import { ChatPanel } from "@/components/tutor/chat-panel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { getAI } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { buildNotes, type NoteLine, type NoteSlide } from "@/services/notes";
import { actions } from "@/store/actions";
import type { Material, NoteExtra, PageImage } from "@/types/models";

function Line({ l }: { l: NoteLine }) {
  const body: ReactNode = l.term ? (
    <>
      <strong className="font-semibold text-foreground">{l.term}</strong>
      {l.sep ?? ": "}
      {l.text}
    </>
  ) : (
    l.text
  );
  if (l.kind === "sub") return <p className="mt-3 font-semibold text-foreground">{l.text}</p>;
  if (l.kind === "para") return <p className="text-foreground/90">{body}</p>;
  return (
    <p className={cn("relative pl-5 text-foreground/90", l.depth === 1 && "ml-5")}>
      <span className={cn("absolute left-1 top-[0.72em] size-[5px] -translate-y-1/2 rounded-full", l.depth ? "border border-muted-foreground" : "bg-muted-foreground")} aria-hidden />
      {body}
    </p>
  );
}

function Extra({ x, onRemove, jump }: { x: NoteExtra; onRemove: () => void; jump: (pageId: string) => void }) {
  return (
    <div className="mt-4 animate-fade-up rounded-xl border border-dashed bg-subtle/60 p-4">
      <div className="mb-2 flex items-start gap-2">
        <p className="flex-1 text-[12.5px] font-medium text-muted-foreground">More detail · “{x.request}”</p>
        <button type="button" onClick={onRemove} className="-m-1 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" aria-label="Remove this detail">
          <X className="size-3.5" />
        </button>
      </div>
      {x.blocks.length ? (
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          {x.blocks.map((b, i) => (
            <p key={i} className="relative pl-5 text-foreground/90">
              <span className="absolute left-1 top-[0.72em] size-[5px] -translate-y-1/2 rounded-full bg-muted-foreground" aria-hidden />
              {b.kind === "note" && <span className="text-muted-foreground">Speaker notes: </span>}
              {b.text}{" "}
              <button type="button" onClick={() => jump(b.pageId)} className="whitespace-nowrap text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
                {b.label}
              </button>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-muted-foreground">Your slides don't say any more about this.</p>
      )}
    </div>
  );
}

function Images({ images, label, open }: { images: PageImage[]; label: string; open: (img: PageImage) => void }) {
  if (!images.length) return null;
  return (
    <div className={cn("mt-4 grid gap-3", images.length === 1 ? "grid-cols-1 sm:max-w-md" : "grid-cols-2")}>
      {images.map((img) => (
        <button key={img.id} type="button" onClick={() => open(img)} className="overflow-hidden rounded-xl border bg-white focus-ring" aria-label={`Enlarge image from ${label}`}>
          <StoredImage id={img.id} alt={`Image from ${label}`} className="max-h-72 w-full object-contain" />
        </button>
      ))}
    </div>
  );
}

function SlideBlock({ s, extras, onMore, onRemoveExtra, openImage, jump }: { s: NoteSlide; extras: NoteExtra[]; onMore: () => void; onRemoveExtra: (id: string) => void; openImage: (img: PageImage, label: string) => void; jump: (pageId: string) => void }) {
  return (
    <div id={`note-${s.page.id}`} className="group scroll-mt-28">
      {s.title && <h3 className="mb-2 mt-7 text-[16px] font-semibold">{s.title}</h3>}
      <div className={cn("space-y-1.5 text-[15px] leading-relaxed", !s.title && "mt-4")}>
        {s.lines.map((l, i) => (
          <Line key={i} l={l} />
        ))}
      </div>
      {s.table && (
        <div className="mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-subtle">
              <tr>{s.table[0].map((c, i) => <th key={i} className="px-3 py-2 font-semibold">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {s.table.slice(1).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-foreground/90">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.photo && <img src={s.photo} alt={s.page.title} className="mt-4 max-h-72 rounded-xl border object-contain" />}
      <Images images={s.images} label={s.page.label} open={(img) => openImage(img, s.page.label)} />
      {s.speaker.length > 0 && (
        <div className="mt-3 border-l-2 pl-3 text-[14px] text-muted-foreground">
          <span className="font-medium">Speaker notes: </span>
          {s.speaker.join(" ")}
        </div>
      )}
      {extras.map((x) => (
        <Extra key={x.id} x={x} onRemove={() => onRemoveExtra(x.id)} jump={jump} />
      ))}
      <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <span className="tabular-nums">{s.page.label}</span>
        <button type="button" onClick={onMore} className="inline-flex items-center gap-1 rounded hover:text-foreground focus-ring">
          <Plus className="size-3" /> More detail
        </button>
      </div>
    </div>
  );
}

/** The material as organised notes, with "more detail" and "ask" built in. */
export function NotesView({ material }: { material: Material }) {
  const sections = useMemo(() => buildNotes(material), [material]);
  const [asking, setAsking] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState<{ img: PageImage; label: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const extras = material.noteExtras ?? [];

  useEffect(() => {
    if (!asking) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [asking]);

  const jump = (pageId: string) => document.getElementById(`note-${pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const addDetail = async (text: string, pageId?: string) => {
    const req = text.trim();
    if (!req || busy) return;
    setBusy(true);
    try {
      const { pages } = groundingFor([material]);
      const res = await getAI().moreDetail({ request: req, pages, pageId });
      if (!res.pageId) {
        toast("Couldn't find that in your slides", { description: "Try the name of a topic or a term from your notes." });
        return;
      }
      actions.addNoteExtra(material.id, { request: req, pageId: res.pageId, blocks: res.blocks });
      setRequest("");
      setDetailOpen(false);
      setTimeout(() => jump(res.pageId!), 60);
    } finally {
      setBusy(false);
    }
  };

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

      <div className="min-w-0 max-w-[740px]">
        <div className="sticky top-14 z-10 -mx-1 mb-2 flex flex-wrap items-center gap-2 bg-background px-1 py-2">
          {detailOpen ? (
            <form
              className="flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addDetail(request);
              }}
            >
              <input
                ref={input}
                autoFocus
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setDetailOpen(false)}
                placeholder="What should have more detail? e.g. the Calvin cycle"
                aria-label="What should have more detail?"
                className="h-10 min-w-0 flex-1 rounded-full border bg-card px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={!request.trim() || busy} aria-label="Add detail">
                {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => setDetailOpen(false)} aria-label="Cancel">
                <X />
              </Button>
            </form>
          ) : (
            <>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setDetailOpen(true)}>
                <Plus /> More detail
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAsking(true)}>
                <MessageCircle /> Ask about these notes
              </Button>
            </>
          )}
        </div>

        {sections.map((sec, si) => (
          <section key={sec.id} id={sec.id} className={cn("scroll-mt-28", si > 0 && "mt-12 border-t pt-10")}>
            <h2 className="text-[22px] font-semibold leading-tight">{sec.title}</h2>
            {sec.slides.map((s) => (
              <SlideBlock
                key={s.page.id}
                s={s}
                extras={extras.filter((x) => x.pageId === s.page.id)}
                onMore={() => addDetail(s.title ?? sec.title, s.page.id)}
                onRemoveExtra={(id) => actions.removeNoteExtra(material.id, id)}
                openImage={(img, label) => setBig({ img, label })}
                jump={jump}
              />
            ))}
            {sec.terms.length > 0 && (
              <div className="mt-7 rounded-xl bg-subtle p-4">
                <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Key terms</p>
                <dl className="grid gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[minmax(110px,auto)_1fr]">
                  {sec.terms.map((t) => (
                    <Fragment key={t.term}>
                      <dt className="font-semibold">{t.term}</dt>
                      <dd className="text-foreground/85">{t.definition}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            )}
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

      {big && (
        <Dialog open onClose={() => setBig(null)} title={`Image from ${big.label}`} size="xl">
          <StoredImage id={big.img.id} alt={`Image from ${big.label}`} className="max-h-[70vh] w-full rounded-lg bg-white object-contain" />
        </Dialog>
      )}
    </div>
  );
}
