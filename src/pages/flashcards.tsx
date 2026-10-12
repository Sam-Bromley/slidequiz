import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Folder as FolderIcon, FolderInput, FolderPlus, Layers, List, MoreHorizontal, Palette, Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { ColourDialog, colourHex } from "@/components/ui/colour-dialog";
import { AIError, costText, ensureCredits, refreshAllowance, textSizeFor } from "@/services/ai/cloud";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { DEFAULT_W, ResizeEdge, useResizableWidth } from "@/components/ui/resizable";
import { useDragReorder } from "@/components/ui/drag-reorder";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { tidyCard } from "@/lib/tidy";
import { cardsFor } from "@/services/flashcards";
import { aiReady, usesBuiltIn } from "@/services/ai/ai-key";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import { confetti } from "@/lib/confetti";
import { fanfare } from "@/lib/celebrate";
import type { Deck, DeckFolder, Flashcard, ID } from "@/types/models";


/* ---------------------------------------------------------------- create from materials */

function CreateDialog({ onClose, initial = [], folderId = null }: { onClose: () => void; initial?: ID[]; folderId?: ID | null }) {
  const data = useData();
  const mats = data.materials;
  const [picked, setPicked] = useState<Record<ID, ID[] | "all">>(() => Object.fromEntries(initial.filter((id) => mats.some((m) => m.id === id)).map((id) => [id, "all" as const])));
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

  // Roughly what this will use (flashcards from a whole lecture cost about the same as the lecture).
  const cost = chosen.reduce((n, mid) => {
    const m = mats.find((x) => x.id === mid);
    const sel = picked[mid];
    return m ? n + textSizeFor(m, sel === "all" || !sel ? [] : sel) : n;
  }, 0);

  const create = async () => {
    if (!ensureCredits(cost)) return;
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
      if (folderId) actions.moveDeckTo(id, folderId);
      toast(`${plural(cards.length, "flashcard")} made`);
      onClose();
      navigate(`/flashcards/${id}`);
    } catch (e) {
      if (!(e as AIError).credits) toast.error((e as Error).message);
    } finally {
      setBusy(false);
      refreshAllowance();
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
          {chosen.length > 0 && <span className="mr-auto self-center text-[12.5px] text-muted-foreground">Uses {costText(cost)}</span>}
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
              // Topics can be picked once the AI has named them; until then it's the whole lecture.
              const named = aiReady(m) || usesBuiltIn(m);
              const topicIds = named ? m.topics.filter((t) => m.pages.some((p) => p.included && p.topicId === t.id)).map((t) => t.id) : [];
              const sel = picked[m.id];
              const expanded = open === m.id;
              return (
                <li key={m.id} className="rounded-xl border">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <input type="checkbox" className="size-4 accent-foreground" checked={!!sel} onChange={() => toggleMaterial(m.id)} aria-label={`Use ${m.title}`} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : m.id)}>
                      <span className="block truncate text-[14px] font-medium">{m.title}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {!named ? "Whole lecture" : sel && sel !== "all" ? `${sel.length} of ${plural(topicIds.length, "topic")}` : plural(topicIds.length, "topic")}
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

/** Flattened flashcards folder tree for the move picker. */
function deckFolderTree(folders: DeckFolder[], parentId: ID | null = null, depth = 0): { folder: DeckFolder; depth: number }[] {
  return folders
    .filter((f) => (f.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((f) => [{ folder: f, depth }, ...deckFolderTree(folders, f.id, depth + 1)]);
}

function MoveDeckDialog({ d, onClose }: { d: Deck; onClose: () => void }) {
  const data = useData();
  const folders = data.deckFolders ?? [];
  const pick = (id: ID | null) => {
    actions.moveDeckTo(d.id, id);
    toast(id ? `Moved to ${folders.find((f) => f.id === id)?.name}` : "Moved to Flashcards");
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Move “${d.name}”`} size="sm">
      <ul className="space-y-0.5">
        {[{ folder: null, depth: 0 }, ...deckFolderTree(folders)].map(({ folder, depth }) => {
          const current = (d.folderId ?? null) === (folder?.id ?? null);
          return (
            <li key={folder?.id ?? "root"}>
              <button disabled={current} onClick={() => pick(folder?.id ?? null)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-accent disabled:opacity-50 focus-ring" style={{ paddingLeft: 10 + depth * 18 }}>
                <FolderIcon className="size-4 text-muted-foreground" style={colourHex(folder?.color) ? { color: colourHex(folder?.color) } : undefined} />
                <span className="flex-1 truncate">{folder ? folder.name : "Flashcards (no folder)"}</span>
                {current && <span className="text-[12px] text-muted-foreground">Current</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {!folders.length && <p className="mt-3 text-[13px] text-muted-foreground">You don't have any folders yet. Make one with New folder.</p>}
    </Dialog>
  );
}

/** One deck in the list. Drag its right edge to make it wider (it snaps to other decks' widths). */
function DeckTile({ d, count, otherWidths, drag }: { d: Deck; count: number; otherWidths: number[]; drag?: ReturnType<ReturnType<typeof useDragReorder>["itemProps"]> }) {
  const { width, start } = useResizableWidth(d.width, otherWidths, (w) => actions.setDeckWidth(d.id, w));
  const [moving, setMoving] = useState(false);
  const [colouring, setColouring] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hex = colourHex(d.color);
  return (
    <div {...drag} className={cn("group relative cursor-grab select-none rounded-xl border bg-card transition-colors hover:border-foreground/20 active:cursor-grabbing", drag?.["data-dragging"] !== undefined && "border-foreground/25")} style={{ ...drag?.style, width: `min(100%, ${width}px)`, ...(hex ? { backgroundColor: hex + "12", borderColor: hex + "55" } : {}) }}>
      <Link to={`/flashcards/${d.id}`} className="flex items-center gap-3 rounded-xl py-3 pl-3.5 pr-12 focus-ring">
        <Layers className={cn("size-5 shrink-0", !hex && "text-muted-foreground")} style={hex ? { color: hex } : undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium" title={d.name}>
            {d.name}
          </span>
          <span className="block text-[12px] text-muted-foreground">
            {plural(count, "card")}
          </span>
        </span>
      </Link>
      <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
        <Menu
          label={`${d.name} actions`}
          items={[
            { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
            { label: "Move to folder", icon: FolderInput, onSelect: () => setMoving(true) },
            { label: "Colour", icon: Palette, onSelect: () => setColouring(true) },
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
          ]}
          trigger={(p) => (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.name}`} {...p}>
              <MoreHorizontal />
            </Button>
          )}
        />
      </div>
      <ResizeEdge onPointerDown={start} label="Drag to resize" />
      {moving && <MoveDeckDialog d={d} onClose={() => setMoving(false)} />}
      {colouring && <ColourDialog name={d.name} value={d.color} onPick={(k) => actions.setDeckColor(d.id, k)} onClose={() => setColouring(false)} />}
      {renaming && <NameDialog title="Rename flashcards" initial={d.name} confirm="Save" onSave={(n) => actions.renameDeck(d.id, n)} onClose={() => setRenaming(false)} />}
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} title={`Delete “${d.name}”?`} description="These flashcards will be deleted." confirmLabel="Delete" onConfirm={() => toast.undo("Flashcards deleted", actions.deleteDeck(d.id))} />
    </div>
  );
}

/** A folder on the Flashcards page. Drop flashcards on it to move them in. */
function DeckFolderTile({ f, count, over }: { f: DeckFolder; count: number; over: boolean }) {
  const [colouring, setColouring] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hex = colourHex(f.color);
  return (
    <div
      data-drop-target={f.id}
      style={hex && !over ? { backgroundColor: hex + "12", borderColor: hex + "55" } : undefined}
      className={cn("group relative flex min-h-[68px] items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 transition-[background-color,border-color,transform] hover:border-foreground/20", over && "scale-[1.03] border-foreground/50 bg-accent")}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary" style={hex ? { backgroundColor: hex + "2e" } : undefined}>
        <FolderIcon className={cn("size-[20px]", !hex && "text-muted-foreground")} style={hex ? { color: hex, fill: hex + "33" } : undefined} />
      </span>
      <Link to={`/flashcards?f=${f.id}`} className="min-w-0 flex-1 rounded after:absolute after:inset-0 focus-ring">
        <span className="block truncate text-[15px] font-semibold" title={f.name}>{f.name}</span>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{count ? plural(count, "item") : "Empty"}</span>
      </Link>
      <div className="relative z-10">
        <Menu
          label={`${f.name} actions`}
          items={[
            { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
            { label: "Colour", icon: Palette, onSelect: () => setColouring(true) },
            { label: "Delete folder", icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
          ]}
          trigger={(p) => (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.name}`} {...p}>
              <MoreHorizontal />
            </Button>
          )}
        />
      </div>
      {colouring && <ColourDialog name={f.name} value={f.color} onPick={(k) => actions.setDeckFolderColor(f.id, k)} onClose={() => setColouring(false)} />}
      {renaming && <NameDialog title="Rename folder" initial={f.name} confirm="Save" onSave={(n) => actions.renameDeckFolder(f.id, n)} onClose={() => setRenaming(false)} />}
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} title={`Delete “${f.name}”?`} description="The folder is removed. Anything inside it moves up a level. Nothing is deleted." confirmLabel="Delete folder" onConfirm={() => toast.undo("Folder deleted", actions.deleteDeckFolder(f.id))} />
    </div>
  );
}

export function FlashcardsPage() {
  const data = useData();
  const decks = data.decks ?? [];
  const allFolders = data.deckFolders ?? [];
  const { query } = useLocation();
  const folderId = allFolders.some((f) => f.id === query.get("f")) ? query.get("f") : null;
  const from = (query.get("from") ?? "").split(",").filter(Boolean);
  const [creating, setCreating] = useState(from.length > 0);
  const [own, setOwn] = useState(false);
  const [newFolder, setNewFolder] = useState(false);

  const trail = useMemo(() => {
    const out: DeckFolder[] = [];
    let cur = allFolders.find((f) => f.id === folderId);
    while (cur) {
      out.unshift(cur);
      const parent: ID | null = cur.parentId;
      cur = allFolders.find((f) => f.id === parent);
    }
    return out;
  }, [allFolders, folderId]);
  const current = trail[trail.length - 1];
  const folders = allFolders.filter((f) => (f.parentId ?? null) === folderId).sort((a, b) => a.name.localeCompare(b.name));
  const shown = decks.filter((d) => (d.folderId ?? null) === folderId);
  const countIn = (id: ID) => decks.filter((d) => d.folderId === id).length + allFolders.filter((f) => f.parentId === id).length;

  const moveInto = (id: ID, target: ID | null) => {
    const d = decks.find((x) => x.id === id);
    if (!d || (d.folderId ?? null) === target) return;
    actions.moveDeckTo(id, target);
    toast(target ? `Moved to ${allFolders.find((f) => f.id === target)?.name}` : "Moved to Flashcards");
  };
  // Drag decks up and down to reorder them, or onto a folder to move them in.
  const shownIds = shown.map((d) => d.id);
  const reorder = useDragReorder(
    shownIds,
    (id, to) => {
      const rest = shownIds.filter((x) => x !== id);
      rest.splice(to, 0, id);
      actions.orderDecks(rest);
    },
    { onDropInto: (id, target) => moveInto(id, target === "root" ? null : target) },
  );

  const makeOwn = (name: string) => {
    const id = actions.createDeck(name, [], []);
    if (folderId) actions.moveDeckTo(id, folderId);
    navigate(`/flashcards/${id}?add=1`);
  };

  const nothing = !decks.length && !allFolders.length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-[24px] font-semibold tracking-tight">
          <Link to="/flashcards" data-drop-target={trail.length ? "root" : undefined} className={cn("rounded-md px-1 transition-colors focus-ring", trail.length && "text-muted-foreground hover:text-foreground", reorder.over === "root" && "bg-accent text-foreground")}>
            Flashcards
          </Link>
          {trail.map((f, i) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              {i === trail.length - 1 ? (
                <h1 className="truncate px-1 text-[24px] font-semibold">{f.name}</h1>
              ) : (
                <Link to={`/flashcards?f=${f.id}`} data-drop-target={f.id} className={cn("truncate rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-ring", reorder.over === f.id && "bg-accent text-foreground")}>
                  {f.name}
                </Link>
              )}
            </span>
          ))}
          {!trail.length && <h1 className="sr-only">Flashcards</h1>}
        </nav>
        {!nothing && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setNewFolder(true)}>
              <FolderPlus /> New folder
            </Button>
            <Button variant="outline" onClick={() => setOwn(true)}>
              <Pencil /> Make your own
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Create flashcards
            </Button>
          </div>
        )}
      </div>
      {nothing ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <Button size="lg" className="h-12 rounded-full px-7 text-[15px]" onClick={() => setCreating(true)}>
            <Plus /> Create flashcards
          </Button>
          <button type="button" onClick={() => setOwn(true)} className="text-[14px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
            or make your own
          </button>
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <section aria-label="Folders" className="mb-6 grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {folders.map((f) => (
                <DeckFolderTile key={f.id} f={f} count={countIn(f.id)} over={reorder.over === f.id} />
              ))}
            </section>
          )}
          {shown.length > 0 ? (
            <div className="flex flex-col items-start gap-2">
              {shown.map((d) => (
                <DeckTile key={d.id} d={d} drag={reorder.itemProps(d.id)} count={data.flashcards.filter((c) => c.deckId === d.id).length} otherWidths={decks.filter((o) => o.id !== d.id).map((o) => o.width ?? DEFAULT_W)} />
              ))}
            </div>
          ) : (
            !folders.length && <p className="py-12 text-center text-[14px] text-muted-foreground">{current ? "This folder is empty. Drag flashcards here, or use Move to folder." : "No flashcards here yet."}</p>
          )}
        </>
      )}
      {creating && (
        <CreateDialog
          initial={from}
          folderId={folderId}
          onClose={() => {
            setCreating(false);
            if (from.length) navigate("/flashcards", { replace: true });
          }}
        />
      )}
      {own && <NameDialog title="Make your own flashcards" confirm="Create" onSave={makeOwn} onClose={() => setOwn(false)} />}
      {newFolder && <NameDialog title="New folder" initial="" confirm="Create" onSave={(n) => actions.createDeckFolder(n, folderId)} onClose={() => setNewFolder(false)} />}
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

/** The card itself: click, tap or Space to flip. On touch screens, swipe left or right for the next or previous card. */
function FlipCard({ card, flipped, onFlip, onSwipe }: { card: Flashcard; flipped: boolean; onFlip: () => void; onSwipe?: (dir: 1 | -1) => void }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        // A swipe ends with a click on some phones; that shouldn't also flip the card.
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        onFlip();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" || !onSwipe) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        swiped.current = false;
      }}
      onPointerMove={(e) => {
        const s0 = start.current;
        if (!s0 || e.pointerId !== s0.id) return;
        const x = e.clientX - s0.x;
        if (Math.abs(x) > Math.abs(e.clientY - s0.y)) setDx(x);
      }}
      onPointerUp={(e) => {
        const s0 = start.current;
        start.current = null;
        setDx(0);
        if (!s0 || e.pointerId !== s0.id) return;
        const x = e.clientX - s0.x;
        if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(e.clientY - s0.y) * 1.5) {
          swiped.current = true;
          onSwipe?.(x < 0 ? 1 : -1);
          setTimeout(() => (swiped.current = false), 400);
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
      style={{ transform: dx ? `translateX(${dx * 0.6}px) rotate(${dx * 0.02}deg)` : undefined, transition: dx ? "none" : "transform 200ms ease-out", touchAction: "pan-y" }}
      className="group block w-full [perspective:1400px] focus-ring rounded-2xl"
      aria-label={flipped ? "Show front" : "Show answer"}
    >
      <div className={cn("relative min-h-[260px] w-full transition-transform duration-500 [transform-style:preserve-3d] sm:min-h-[300px]", flipped && "[transform:rotateY(180deg)]")}>
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-pop [backface-visibility:hidden]">
          <span className="absolute left-5 top-4 text-[12px] text-muted-foreground">Front</span>
          <p className="whitespace-pre-line text-[20px] font-semibold leading-snug sm:text-[22px]">{tidyCard(card.front)}</p>
          <span className="absolute bottom-4 text-[12px] text-muted-foreground">
            <span className="[@media(pointer:coarse)]:hidden">Click to flip</span>
            <span className="hidden [@media(pointer:coarse)]:inline">Tap to flip · swipe for next</span>
          </span>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-pop [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="absolute left-5 top-4 text-[12px] text-muted-foreground">Back</span>
          <p className="whitespace-pre-line text-[18px] leading-relaxed sm:text-[19px]">{tidyCard(card.back)}</p>
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

  // Keep the study order in step with added/removed cards.
  const ids = cards.map((c) => c.id).join(",");
  useEffect(() => {
    setOrder((o) => [...o.filter((x) => cards.some((c) => c.id === x)), ...cards.filter((c) => !o.includes(c.id)).map((c) => c.id)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const studyOrder = useMemo(() => order.filter((x) => cards.some((c) => c.id === x)), [order, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = Math.min(i, Math.max(0, studyOrder.length - 1));
  const card = cards.find((c) => c.id === studyOrder[pos]);

  // Each card turned over counts as revised (once per visit), with a little reward for getting through them all.
  const [seen, setSeen] = useState<Set<ID>>(() => new Set());
  useEffect(() => {
    if (!flipped || !card || seen.has(card.id)) return;
    const next = new Set(seen).add(card.id);
    setSeen(next);
    actions.rateCard(card.id, "good");
    const total = studyOrder.length;
    if (total >= 3 && next.size === total) {
      setTimeout(() => {
        confetti();
        if (getState().settings.soundEffects !== false) fanfare();
        toast("Deck complete 🎉", { description: `You went through all ${total} cards.` });
      }, 450);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, card?.id]);

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
        back={{ to: deck.folderId && (data.deckFolders ?? []).some((f) => f.id === deck.folderId) ? `/flashcards?f=${deck.folderId}` : "/flashcards", label: (data.deckFolders ?? []).find((f) => f.id === deck.folderId)?.name ?? "Flashcards" }}
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

      {card ? (
        <section aria-label="Study">
          {/* How many cards have been turned over this time. */}
          <div className="mx-auto mb-4 flex max-w-xl items-center gap-3" aria-label={`${seen.size} of ${studyOrder.length} cards revised`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", seen.size >= studyOrder.length ? "bg-success" : "bg-primary")} style={{ width: `${studyOrder.length ? (seen.size / studyOrder.length) * 100 : 0}%` }} />
            </div>
            <span className="text-[12px] font-medium tabular-nums text-muted-foreground">{seen.size >= studyOrder.length && studyOrder.length ? "All done ✓" : `${seen.size}/${studyOrder.length}`}</span>
          </div>
          <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} onSwipe={go} />
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
      )}

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
                    <p className="text-[14px] font-medium">{tidyCard(c.front)}</p>
                    <p className="text-[14px] text-foreground/80">{tidyCard(c.back)}</p>
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
