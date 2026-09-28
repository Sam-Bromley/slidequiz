import { ArrowLeft, ArrowRight, Check, ChevronDown, Layers, List, MoreHorizontal, Pencil, Plus, Repeat, Shuffle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { DEFAULT_W, ResizeEdge, useResizableWidth } from "@/components/ui/resizable";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { cardsFor } from "@/services/flashcards";
import { isDue, nextIntervalLabel, reviewQueue } from "@/services/study/srs";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { Deck, Flashcard, FlashcardRating, ID } from "@/types/models";

const dueCount = (cards: Flashcard[]) => cards.filter((c) => isDue(c)).length;

/** "in 3 days", "tomorrow", "later today" for the next card to come back. */
function nextDueLabel(cards: Flashcard[]) {
  const next = Math.min(...cards.map((c) => new Date(c.srs.due).getTime()));
  if (!isFinite(next)) return "";
  const days = Math.round((new Date(next).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? "later today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/* ---------------------------------------------------------------- create from materials */

function CreateDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const mats = data.materials;
  const [picked, setPicked] = useState<Record<ID, ID[] | "all">>({});
  const [open, setOpen] = useState<ID | null>(mats.length === 1 ? mats[0].id : null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = Object.keys(picked);
  const suggested = chosen.length === 1 ? mats.find((m) => m.id === chosen[0])?.title ?? "" : chosen.length > 1 ? "Mixed flashcards" : "";

  const toggleMaterial = (id: ID) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = "all";
      return next;
    });
  const toggleTopic = (mid: ID, tid: ID, all: ID[]) =>
    setPicked((p) => {
      const cur = p[mid] === "all" || !p[mid] ? all : (p[mid] as ID[]);
      const on = p[mid] && cur.includes(tid);
      const nextList = on ? cur.filter((x) => x !== tid) : [...cur, tid];
      const next = { ...p };
      if (!nextList.length) delete next[mid];
      else next[mid] = nextList.length === all.length ? "all" : nextList;
      return next;
    });

  const create = async () => {
    setBusy(true);
    try {
      const cards = [];
      for (const mid of chosen) {
        const m = mats.find((x) => x.id === mid);
        if (!m) continue;
        const sel = picked[mid];
        cards.push(...(await cardsFor(m, sel === "all" ? [] : sel)));
      }
      if (!cards.length) {
        toast.error("Couldn't find anything to make cards from", { description: "Try choosing more topics." });
        return;
      }
      const id = actions.createDeck(name || suggested, chosen, cards);
      toast(`${plural(cards.length, "flashcard")} made`);
      onClose();
      navigate(`/flashcards/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create flashcards"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!chosen.length} loading={busy}>
            Create
          </Button>
        </>
      }
    >
      {!mats.length ? (
        <p className="py-6 text-center text-[14px] text-muted-foreground">
          Add some material first.{" "}
          <Link to="/upload" className="font-medium text-foreground underline underline-offset-2" onClick={onClose}>
            Upload slides
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {mats.map((m) => {
              const topicIds = m.topics.filter((t) => m.pages.some((p) => p.included && p.topicId === t.id)).map((t) => t.id);
              const sel = picked[m.id];
              const expanded = open === m.id;
              return (
                <li key={m.id} className="rounded-xl border">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <input type="checkbox" className="size-4 accent-foreground" checked={!!sel} onChange={() => toggleMaterial(m.id)} aria-label={`Use ${m.title}`} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : m.id)}>
                      <span className="block truncate text-[14px] font-medium">{m.title}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {sel && sel !== "all" ? `${sel.length} of ${plural(topicIds.length, "topic")}` : plural(topicIds.length, "topic")}
                      </span>
                    </button>
                    {topicIds.length > 1 && (
                      <button type="button" onClick={() => setOpen(expanded ? null : m.id)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-ring" aria-label={expanded ? "Hide topics" : "Choose topics"} aria-expanded={expanded}>
                        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                      </button>
                    )}
                  </div>
                  {expanded && topicIds.length > 1 && (
                    <div className="space-y-0.5 border-t px-3 py-2">
                      {topicIds.map((tid) => {
                        const on = !!sel && (sel === "all" || sel.includes(tid));
                        return (
                          <label key={tid} className="flex cursor-pointer items-center gap-3 rounded-lg py-1.5 pl-7 text-[13.5px] hover:bg-accent">
                            <input type="checkbox" className="size-4 accent-foreground" checked={on} onChange={() => toggleTopic(m.id, tid, topicIds)} />
                            {m.topics.find((t) => t.id === tid)?.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {chosen.length > 0 && (
            <div>
              <label htmlFor="deck-name" className="mb-1.5 block text-[13px] font-medium">
                Name
              </label>
              <Input id="deck-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function NameDialog({ title, initial = "", confirm, onSave, onClose }: { title: string; initial?: string; confirm: string; onSave: (n: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="deck-name-form" disabled={!name.trim()}>
            {confirm}
          </Button>
        </>
      }
    >
      <form
        id="deck-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim());
          onClose();
        }}
      >
        <label htmlFor="deck-name-input" className="sr-only">
          Name
        </label>
        <Input id="deck-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Key dates, Vocab" data-autofocus />
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- decks list */

/** One deck in the list. Drag its right edge to make it wider (it snaps to other decks' widths). */
function DeckTile({ d, count, otherWidths }: { d: Deck; count: number; otherWidths: number[] }) {
  const { width, start } = useResizableWidth(d.width, otherWidths, (w) => actions.setDeckWidth(d.id, w));
  return (
    <div className="group relative rounded-xl border bg-card transition-colors hover:border-foreground/20" style={{ width: `min(100%, ${width}px)` }}>
      <Link to={`/flashcards/${d.id}`} className="flex items-center gap-3 rounded-xl px-3.5 py-3 focus-ring">
        <Layers className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium" title={d.name}>
            {d.name}
          </span>
          <span className="block text-[12px] text-muted-foreground">
            {plural(count, "card")}
          </span>
        </span>
      </Link>
      <ResizeEdge onPointerDown={start} label="Drag to resize" />
    </div>
  );
}

export function FlashcardsPage() {
  const data = useData();
  const decks = data.decks ?? [];
  const [creating, setCreating] = useState(false);
  const [own, setOwn] = useState(false);

  const makeOwn = (name: string) => {
    const id = actions.createDeck(name, [], []);
    navigate(`/flashcards/${id}?add=1`);
  };

  return (
    <div>
      <PageHeader
        title="Flashcards"
        actions={
          decks.length ? (
            <>
              <Button variant="outline" onClick={() => setOwn(true)}>
                <Pencil /> Make your own
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus /> Create flashcards
              </Button>
            </>
          ) : null
        }
      />
      {!decks.length ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <Button size="lg" className="h-12 rounded-full px-7 text-[15px]" onClick={() => setCreating(true)}>
            <Plus /> Create flashcards
          </Button>
          <button type="button" onClick={() => setOwn(true)} className="text-[14px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
            or make your own
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          {decks.map((d) => (
            <DeckTile key={d.id} d={d} count={data.flashcards.filter((c) => c.deckId === d.id).length} otherWidths={decks.filter((o) => o.id !== d.id).map((o) => o.width ?? DEFAULT_W)} />
          ))}
        </div>
      )}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {own && <NameDialog title="Make your own flashcards" confirm="Create" onSave={makeOwn} onClose={() => setOwn(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- one deck */

function CardEditor({ c, onDone }: { c?: Flashcard; onDone: (front: string, back: string) => void }) {
  const [front, setFront] = useState(c?.front ?? "");
  const [back, setBack] = useState(c?.back ?? "");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        if (!front.trim() || !back.trim()) return;
        onDone(front, back);
        if (!c) {
          setFront("");
          setBack("");
          (e.currentTarget.querySelector("textarea") as HTMLTextAreaElement | null)?.focus();
        }
      }}
    >
      <Textarea value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question or term)" aria-label="Front" className="min-h-[64px]" autoFocus={!!c} />
      <Textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back (answer)" aria-label="Back" className="min-h-[64px]" />
      <Button type="submit" disabled={!front.trim() || !back.trim()}>
        {c ? "Save" : <><Plus /> Add</>}
      </Button>
    </form>
  );
}

/** The card itself: click (or Space) to flip. */
function FlipCard({ card, flipped, onFlip }: { card: Flashcard; flipped: boolean; onFlip: () => void }) {
  return (
    <button
      type="button"
      onClick={onFlip}
      className="group block w-full [perspective:1400px] focus-ring rounded-2xl"
      aria-label={flipped ? "Show front" : "Show answer"}
    >
      <div className={cn("relative min-h-[260px] w-full transition-transform duration-500 [transform-style:preserve-3d] sm:min-h-[300px]", flipped && "[transform:rotateY(180deg)]")}>
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-pop [backface-visibility:hidden]">
          <span className="absolute left-5 top-4 text-[12px] text-muted-foreground">Front</span>
          <p className="whitespace-pre-line text-[20px] font-semibold leading-snug sm:text-[22px]">{card.front}</p>
          <span className="absolute bottom-4 text-[12px] text-muted-foreground">Click to flip</span>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-pop [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="absolute left-5 top-4 text-[12px] text-muted-foreground">Back</span>
          <p className="whitespace-pre-line text-[18px] leading-relaxed sm:text-[19px]">{card.back}</p>
        </div>
      </div>
    </button>
  );
}

export function DeckPage({ id }: { id: string }) {
  const data = useData();
  const deck: Deck | undefined = (data.decks ?? []).find((d) => d.id === id);
  const cards = data.flashcards.filter((c) => c.deckId === id);
  const [order, setOrder] = useState<ID[]>(() => cards.map((c) => c.id));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [adding, setAdding] = useState(() => /add=1/.test(location.hash));
  const [editing, setEditing] = useState<ID | null>(null);
  const [listing, setListing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Review session: cards still to go (a card marked "Again" goes to the back). */
  const [queue, setQueue] = useState<ID[] | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const due = dueCount(cards);
  const reviewCard = queue?.length ? cards.find((c) => c.id === queue[0]) : undefined;

  const startReview = () => {
    setQueue(reviewQueue(cards, 50).filter((c) => isDue(c)).map((c) => c.id));
    setReviewed(0);
    setFlipped(false);
  };
  const rate = (r: FlashcardRating) => {
    if (!reviewCard) return;
    actions.rateCard(reviewCard.id, r);
    setFlipped(false);
    setReviewed((n) => n + 1);
    setQueue((q) => (q ? (r === "hard" ? [...q.slice(1), q[0]] : q.slice(1)) : q));
  };

  // Keep the study order in step with added/removed cards.
  const ids = cards.map((c) => c.id).join(",");
  useEffect(() => {
    setOrder((o) => [...o.filter((x) => cards.some((c) => c.id === x)), ...cards.filter((c) => !o.includes(c.id)).map((c) => c.id)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const studyOrder = useMemo(() => order.filter((x) => cards.some((c) => c.id === x)), [order, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = Math.min(i, Math.max(0, studyOrder.length - 1));
  const card = cards.find((c) => c.id === studyOrder[pos]);

  const go = (d: number) => {
    setFlipped(false);
    setI((x) => (studyOrder.length ? (x + d + studyOrder.length) % studyOrder.length : 0));
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]") || document.querySelector("[role=dialog]")) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (queue) {
        if (flipped && e.key === "1") rate("hard");
        else if (flipped && e.key === "2") rate("good");
        else if (flipped && e.key === "3") rate("easy");
        else if (e.key === "Escape") setQueue(null);
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!deck)
    return (
      <div className="py-20 text-center">
        <p className="font-medium">These flashcards don't exist any more.</p>
        <Link to="/flashcards" className={buttonClass("outline", "md", "mt-4")}>
          Back to flashcards
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: "/flashcards", label: "Flashcards" }}
        title={deck.name}
        description={plural(cards.length, "card")}
        compactActions
        actions={
          <Menu
            label="Flashcard actions"
            items={[
              { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
              { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
            ]}
            trigger={(p) => (
              <Button variant="ghost" size="icon" aria-label="More actions" {...p}>
                <MoreHorizontal />
              </Button>
            )}
          />
        }
      />

      {queue ? (
        <section aria-label="Review">
          {reviewCard ? (
            <>
              <div className="mb-3 flex items-center justify-between text-[12.5px] text-muted-foreground">
                <span className="tabular-nums">{queue.length} left</span>
                <button type="button" className="rounded hover:text-foreground focus-ring" onClick={() => setQueue(null)}>
                  Stop reviewing
                </button>
              </div>
              <FlipCard card={reviewCard} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
              <div className="mt-5 flex min-h-[52px] items-center justify-center gap-2">
                {flipped ? (
                  ([["hard", "Again"], ["good", "Good"], ["easy", "Easy"]] as const).map(([r, label]) => (
                    <Button key={r} variant="outline" className="h-auto min-w-24 flex-col gap-0 rounded-xl py-2" onClick={() => rate(r)}>
                      <span>{label}</span>
                      <span className="text-[11.5px] font-normal text-muted-foreground">{nextIntervalLabel(reviewCard.srs, r)}</span>
                    </Button>
                  ))
                ) : (
                  <Button variant="outline" className="rounded-full" onClick={() => setFlipped(true)}>
                    Show answer
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border bg-card py-14 text-center">
              <Check className="mx-auto size-6 text-success" />
              <p className="mt-3 font-medium">All caught up</p>
              <p className="mt-1 text-[14px] text-muted-foreground">
                {plural(reviewed, "card")} reviewed. {cards.length ? `Next review ${nextDueLabel(cards)}.` : ""}
              </p>
              <Button variant="outline" className="mt-5 rounded-full" onClick={() => setQueue(null)}>
                Back to all cards
              </Button>
            </div>
          )}
        </section>
      ) : (card ? (
        <section aria-label="Study">
          <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => go(-1)} aria-label="Previous card">
              <ArrowLeft />
            </Button>
            <span className="min-w-16 text-center text-[13px] tabular-nums text-muted-foreground">
              {pos + 1} of {studyOrder.length}
            </span>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => go(1)} aria-label="Next card">
              <ArrowRight />
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[12.5px] text-muted-foreground">
            {due > 0 && (
              <button type="button" className="inline-flex items-center gap-1 rounded font-medium text-foreground hover:underline underline-offset-2 focus-ring" onClick={startReview}>
                <Repeat className="size-3.5" /> Review
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground focus-ring rounded"
              onClick={() => {
                setOrder((o) => [...o].sort(() => Math.random() - 0.5));
                setI(0);
                setFlipped(false);
              }}
            >
              <Shuffle className="size-3.5" /> Shuffle
            </button>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <p className="font-medium">No cards yet</p>
          <p className="mt-1 text-[14px] text-muted-foreground">Add your first card below.</p>
        </div>
      ))}

      <section className="mt-12" aria-labelledby="cards-h">
        <div className="mb-3 flex items-center justify-end">
          <h2 id="cards-h" className="sr-only">
            Cards
          </h2>
          <div className="flex gap-1">
            {cards.length > 0 && (
              <Button variant="ghost" size="sm" aria-expanded={listing} onClick={() => setListing((l) => !l)}>
                <List /> {listing ? "Hide cards" : `See all cards (${cards.length})`}
              </Button>
            )}
            {!adding && (
              <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                <Plus /> Add a card
              </Button>
            )}
          </div>
        </div>
        {adding && (
          <div className="mb-4 rounded-xl border bg-card p-3">
            <CardEditor onDone={(f, b) => actions.addCard(deck.id, f, b)} />
            <div className="mt-2 text-right">
              <button type="button" onClick={() => setAdding(false)} className="text-[12.5px] text-muted-foreground hover:text-foreground focus-ring rounded">
                Done adding
              </button>
            </div>
          </div>
        )}
        {(listing || !cards.length) && (
        <ul className="animate-fade-in divide-y rounded-xl border bg-card">
          {cards.map((c) => (
            <li key={c.id} className="group px-4 py-3">
              {editing === c.id ? (
                <CardEditor
                  c={c}
                  onDone={(f, b) => {
                    actions.updateCard(c.id, { front: f.trim(), back: b.trim() });
                    setEditing(null);
                  }}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                    <p className="text-[14px] font-medium">{c.front}</p>
                    <p className="text-[14px] text-foreground/80">{c.back}</p>
                  </div>
                  <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit card" onClick={() => setEditing(c.id)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete card" onClick={() => toast.undo("Card deleted", actions.deleteCard(c.id))}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!cards.length && <li className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">Cards you add will appear here.</li>}
        </ul>
        )}
      </section>

      {renaming && <NameDialog title="Rename" initial={deck.name} confirm="Save" onSave={(n) => actions.renameDeck(deck.id, n)} onClose={() => setRenaming(false)} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${deck.name}”?`}
        description={`This deletes ${plural(cards.length, "card")}.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const undo = actions.deleteDeck(deck.id);
          navigate("/flashcards");
          toast.undo("Flashcards deleted", undo);
        }}
      />
    </div>
  );
}
