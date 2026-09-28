import { ArrowLeft, Bookmark, BookmarkCheck, Download, Layers, MoreHorizontal, Play, RotateCcw, Search, Shuffle, SquarePen, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { FlipCard } from "@/components/flashcards/flip-card";
import { PageHeader, SectionTitle } from "@/components/layout/page-header";
import { MaterialIcon } from "@/components/materials/material-card";
import { SourceChip } from "@/components/questions/source";
import { TodaysReview } from "@/components/study/widgets";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Menu } from "@/components/ui/menu";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn, formatDuration, plural, shuffle } from "@/lib/utils";
import { isDifficult, isDue, isMastered, isNew, nextIntervalLabel, reviewQueue } from "@/services/study/srs";
import { actions } from "@/store/actions";
import { topicName } from "@/store/selectors";
import { getState, useData } from "@/store/store";
import type { Flashcard, FlashcardRating } from "@/types/models";

function cardStatus(c: Flashcard): { label: string; tone: BadgeTone } {
  if (isNew(c)) return { label: "New", tone: "neutral" };
  if (isMastered(c)) return { label: "Mastered", tone: "success" };
  if (isDifficult(c)) return { label: "Difficult", tone: "danger" };
  if (isDue(c)) return { label: "Due", tone: "warning" };
  return { label: "Learning", tone: "primary" };
}

export function FlashcardsPage() {
  const data = useData();
  const { query } = useLocation();
  const [search, setSearch] = useState(query.get("q") ?? "");
  const [material, setMaterial] = useState("all");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(24);
  const [exporting, setExporting] = useState(false);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.flashcards.filter((c) => {
      if (material !== "all" && c.materialId !== material) return false;
      if (status === "bookmarked" && !c.bookmarked) return false;
      if (status !== "all" && status !== "bookmarked" && cardStatus(c).label.toLowerCase() !== status) return false;
      return !s || `${c.front} ${c.back}`.toLowerCase().includes(s);
    });
  }, [data.flashcards, search, material, status]);

  if (!data.flashcards.length)
    return (
      <div>
        <PageHeader title="Flashcards" />
        <EmptyState icon={Layers} title="No flashcards yet" description="Generate flashcards from any material. Difficult cards will come back more often." action={<Link to="/materials" className={buttonClass()}><SquarePen /> Choose material</Link>} />
      </div>
    );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Flashcards"
        description="Spaced repetition brings difficult cards back sooner and spaces out the ones you know."
        actions={
          <>
            <Button variant="outline" onClick={() => setExporting(true)}>
              <Download /> Export
            </Button>
            <Link to="/flashcards/review" className={buttonClass()}>
              <Play /> Start review
            </Link>
          </>
        }
        className="mb-0 sm:mb-0"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <TodaysReview />
        <section className="rounded-xl border bg-card p-5" aria-labelledby="decks-h">
          <h2 id="decks-h" className="text-[15px] font-semibold">Decks</h2>
          <ul className="mt-3 divide-y">
            {data.materials
              .filter((m) => data.flashcards.some((c) => c.materialId === m.id))
              .map((m) => {
                const cs = data.flashcards.filter((c) => c.materialId === m.id);
                const due = cs.filter((c) => !isNew(c) && isDue(c)).length;
                const mastered = cs.filter(isMastered).length;
                return (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <MaterialIcon m={m} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{m.title}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {cs.length} cards · {due} due · {mastered} mastered
                      </p>
                      <Progress value={mastered / cs.length} tone="success" size="sm" className="mt-1.5 max-w-[200px]" label={`${m.title} mastery`} />
                    </div>
                    <Button variant={due ? "subtle" : "ghost"} size="sm" onClick={() => navigate(`/flashcards/review?m=${m.id}`)}>
                      Review
                    </Button>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="all-cards-h">
        <SectionTitle id="all-cards-h">All cards</SectionTitle>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flashcards" className="pl-9" aria-label="Search flashcards" />
          </div>
          <div className="flex gap-2">
            <Select aria-label="Material" value={material} onChange={(e) => setMaterial(e.target.value)} className="sm:w-44">
              <option value="all">All materials</option>
              {data.materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </Select>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-40">
              <option value="all">Any status</option>
              <option value="difficult">Difficult</option>
              <option value="due">Due</option>
              <option value="learning">Learning</option>
              <option value="mastered">Mastered</option>
              <option value="new">New</option>
              <option value="bookmarked">Bookmarked</option>
            </Select>
          </div>
        </div>
        {list.length ? (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {list.slice(0, limit).map((c) => {
              const st = cardStatus(c);
              return (
                <li key={c.id} className="flex gap-3 rounded-xl border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-snug">{c.front}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{c.back}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge tone="outline">{topicName(data, c.materialId, c.topicId)}</Badge>
                      {c.source && <SourceChip source={c.source} />}
                    </div>
                  </div>
                  <div className="-mr-1.5 -mt-1 flex flex-col">
                    <Button variant="ghost" size="icon-sm" aria-pressed={c.bookmarked} aria-label={c.bookmarked ? "Remove bookmark" : "Bookmark card"} onClick={() => actions.toggleCardBookmark(c.id)}>
                      {c.bookmarked ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                    </Button>
                    <Menu
                      label="Card actions"
                      items={[
                        { label: "Reset progress", icon: RotateCcw, onSelect: () => { actions.resetCard(c.id); toast("Card reset to new"); } },
                        { label: "Remove", icon: Trash2, danger: true, onSelect: () => toast.undo("Flashcard removed", actions.deleteCard(c.id)) },
                      ]}
                      trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="More actions" {...p}><MoreHorizontal /></Button>}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Search} title="No cards match" action={<Button variant="outline" onClick={() => { setSearch(""); setMaterial("all"); setStatus("all"); }}>Clear filters</Button>} />
        )}
        {list.length > limit && (
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={() => setLimit((l) => l + 24)}>Show more</Button>
          </div>
        )}
      </section>
      {exporting && <ExportDialog open onClose={() => setExporting(false)} title={material !== "all" ? data.materials.find((m) => m.id === material)?.title ?? "Flashcards" : "SlideQuiz"} flashcards={list} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Review session */

export function FlashcardReviewPage() {
  const { query } = useLocation();
  const mid = query.get("m");
  const mode = query.get("mode");
  const initialQueue = useMemo(() => {
    const d = getState();
    const cards = d.flashcards.filter((c) => !mid || c.materialId === mid);
    if (mode === "difficult") return cards.filter(isDifficult).map((c) => c.id);
    const q = reviewQueue(cards, 25);
    return (q.length ? q : shuffle(cards).slice(0, 20)).map((c) => c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid, mode]);
  const data = useData();
  const [queue, setQueue] = useState<string[]>(initialQueue);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState<Record<FlashcardRating, number>>({ hard: 0, good: 0, easy: 0 });
  const started = useRef(Date.now());
  const saved = useRef(false);

  const total = initialQueue.length;
  const done = pos >= queue.length;
  const card = data.flashcards.find((c) => c.id === queue[pos]);
  const reviewed = tally.hard + tally.good + tally.easy;

  const saveSession = () => {
    if (saved.current || !reviewed) return;
    saved.current = true;
    actions.addSession({ kind: "flashcards", materialIds: mid ? [mid] : [...new Set(queue.map((id) => getState().flashcards.find((c) => c.id === id)?.materialId).filter(Boolean) as string[])], startedAt: new Date(started.current).toISOString(), durationMs: Date.now() - started.current, items: reviewed });
  };
  useEffect(() => () => saveSession());
  useEffect(() => {
    if (done) saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const rate = (r: FlashcardRating) => {
    if (!card) return;
    actions.rateCard(card.id, r);
    setTally((t) => ({ ...t, [r]: t[r] + 1 }));
    if (r === "hard") setQueue((q) => [...q, card.id]); // comes back this session
    setFlipped(false);
    setPos((p) => p + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea") || document.querySelector("[role=dialog]") || done) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3"].includes(e.key)) rate((["hard", "good", "easy"] as const)[Number(e.key) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const exit = () => {
    saveSession();
    navigate("/flashcards");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky z-20 border-b bg-background/90 backdrop-blur-md" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Button variant="ghost" size="icon" aria-label="Exit review" onClick={exit}>
            <X />
          </Button>
          <div className="flex-1">
            <Progress value={total ? Math.min(pos, total) / Math.max(total, queue.length) : 0} size="sm" label="Review progress" />
          </div>
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {Math.min(pos + 1, queue.length)} / {queue.length}
          </span>
          {!done && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Shuffle remaining cards"
              title="Shuffle"
              onClick={() => {
                setQueue((q) => [...q.slice(0, pos), ...shuffle(q.slice(pos))]);
                setFlipped(false);
                toast("Shuffled");
              }}
            >
              <Shuffle />
            </Button>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-8">
        {!total ? (
          <EmptyState icon={Layers} title="Nothing to review right now" description="You're all caught up. New and due cards will appear here." action={<Button onClick={exit}><ArrowLeft /> Back to flashcards</Button>} />
        ) : done || !card ? (
          <div className="animate-fade-up text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
              <Layers className="size-6" />
            </span>
            <h1 className="mt-5 text-[24px] font-bold">Session complete</h1>
            <p className="mt-1 text-muted-foreground">
              {plural(reviewed, "card")} reviewed in {formatDuration(Date.now() - started.current)}.
            </p>
            <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-2">
              {(["hard", "good", "easy"] as const).map((r) => (
                <div key={r} className="rounded-xl border bg-card p-3">
                  <p className={cn("font-display text-[22px] font-bold tabular-nums", r === "hard" ? "text-destructive" : r === "good" ? "text-primary" : "text-success")}>{tally[r]}</p>
                  <p className="text-[12px] capitalize text-muted-foreground">{r}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-5 max-w-sm text-[13.5px] text-muted-foreground">Hard cards will come back soon; easy ones are scheduled days or weeks away.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={exit}>Done</Button>
              {tally.hard > 0 && (
                <Button onClick={() => { navigate(`/flashcards/review?mode=difficult${mid ? `&m=${mid}` : ""}&r=${Date.now()}`); }}>
                  <RotateCcw /> Review difficult cards
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div key={card.id + pos} className="animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <Badge tone={cardStatus(card).tone}>{cardStatus(card).label}</Badge>
              <div className="flex">
                <Button variant="ghost" size="icon-sm" aria-pressed={card.bookmarked} aria-label={card.bookmarked ? "Remove bookmark" : "Bookmark card"} onClick={() => actions.toggleCardBookmark(card.id)}>
                  {card.bookmarked ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove card"
                  onClick={() => {
                    const undo = actions.deleteCard(card.id);
                    setQueue((q) => q.filter((x, i) => i < pos || x !== card.id));
                    setFlipped(false);
                    toast.undo("Flashcard removed", undo);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} topic={topicName(data, card.materialId, card.topicId)} />
            <div className="mt-6">
              {flipped ? (
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="How well did you know it?">
                  {([
                    ["hard", "Hard", "border-destructive/30 hover:bg-destructive-soft text-destructive"],
                    ["good", "Good", "border-primary/30 hover:bg-primary-soft text-primary"],
                    ["easy", "Easy", "border-success/30 hover:bg-success-soft text-success"],
                  ] as const).map(([r, label, cls], i) => (
                    <button key={r} onClick={() => rate(r)} className={cn("flex flex-col items-center gap-0.5 rounded-xl border bg-card py-3 transition-colors focus-ring", cls)}>
                      <span className="text-[15px] font-semibold">{label}</span>
                      <span className="text-[11.5px] text-muted-foreground">{nextIntervalLabel(card.srs, r)}</span>
                      <Kbd className="mt-1 hidden sm:inline-flex">{i + 1}</Kbd>
                    </button>
                  ))}
                </div>
              ) : (
                <Button size="lg" className="w-full" onClick={() => setFlipped(true)}>
                  Show answer
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
