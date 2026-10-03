import { Crown, MessageCircle, StickyNote, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { cn, uid } from "@/lib/utils";
import { hasPlus, usePlanQuiet } from "@/services/plus";
import { actions } from "@/store/actions";
import type { Material, NoteMark } from "@/types/models";

type Colour = NoteMark["color"];
const COLOURS: { id: Colour; label: string; swatch: string }[] = [
  { id: "yellow", label: "Yellow", swatch: "bg-yellow-300" },
  { id: "green", label: "Green", swatch: "bg-emerald-300" },
  { id: "blue", label: "Blue", swatch: "bg-sky-300" },
  { id: "pink", label: "Pink", swatch: "bg-pink-300" },
];

interface Picked {
  key: string;
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
}

/** Where a selection starts and ends within one line of the notes, or null. */
function readSelection(): Picked | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const el = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement);
  const a = el(range.startContainer)?.closest<HTMLElement>("[data-line-key]");
  const b = el(range.endContainer)?.closest<HTMLElement>("[data-line-key]");
  if (!a) return null;
  // A selection across lines keeps to the first line.
  const line = a;
  const before = document.createRange();
  before.selectNodeContents(line);
  before.setEnd(range.startContainer, range.startOffset);
  let start = before.toString().length;
  let text = range.toString();
  if (b !== a) {
    const all = document.createRange();
    all.selectNodeContents(line);
    text = all.toString().slice(start);
  }
  const full = line.dataset.full ?? line.textContent ?? "";
  const raw = text;
  text = text.trim();
  start += raw.length - raw.trimStart().length;
  if (!text) return null;
  // Web addresses are shortened on screen, so find the words in the full line near where they were picked.
  if (full.slice(start, start + text.length) !== text) {
    let best = -1;
    for (let i = full.indexOf(text); i >= 0; i = full.indexOf(text, i + 1)) if (best < 0 || Math.abs(i - start) < Math.abs(best - start)) best = i;
    if (best < 0) return null;
    start = best;
  }
  // Snap to whole words.
  let end = start + text.length;
  while (start > 0 && /[\w'’-]/.test(full[start - 1]) && /[\w'’-]/.test(full[start])) start--;
  while (end < full.length && /[\w'’-]/.test(full[end]) && /[\w'’-]/.test(full[end - 1])) end++;
  return { key: line.dataset.lineKey!, start, end, text: full.slice(start, end), rect: range.getBoundingClientRect() };
}

const goPro = (what: string) =>
  toast(`${what} are part of SlideQuiz Pro`, { tone: "info", action: { label: "See Pro", onClick: () => navigate("/pro") } });

/** Pick words in the notes to highlight them, and click a highlight to add a note. */
export function Highlighter({ material, active, onClose, onAsk }: { material: Material; active: { mark: NoteMark; el: HTMLElement } | null; onClose: () => void; onAsk?: (text: string) => void }) {
  usePlanQuiet();
  const plus = hasPlus();
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    let t = 0;
    const check = () => {
      clearTimeout(t);
      t = window.setTimeout(() => setPicked(readSelection()), 10);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicked(null);
    document.addEventListener("mouseup", check);
    document.addEventListener("touchend", check);
    document.addEventListener("keyup", check);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mouseup", check);
      document.removeEventListener("touchend", check);
      document.removeEventListener("keyup", check);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Hide the bar when the page scrolls (it would float in the wrong place).
  useEffect(() => {
    if (!picked) return;
    const hide = () => setPicked(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [picked]);

  const save = (color: Colour, withNote = false) => {
    if (!picked) return;
    if (!plus) return goPro("Highlights and your own notes");
    const mark: NoteMark = { id: uid("mk"), key: picked.key, start: picked.start, end: picked.end, text: picked.text, color, at: new Date().toISOString() };
    actions.saveMark(material.id, mark);
    window.getSelection()?.removeAllRanges();
    setPicked(null);
    if (withNote) {
      // Open the note box on the new highlight once it's drawn.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-mark-id="${mark.id}"]`);
        el?.click();
      });
    }
  };

  return (
    <>
      {picked &&
        !active &&
        createPortal(
          <div
            role="toolbar"
            aria-label="Highlight"
            onMouseDown={(e) => e.preventDefault()}
            style={{ left: Math.max(8, Math.min(window.innerWidth - (onAsk ? 328 : 248), picked.rect.left + picked.rect.width / 2 - (onAsk ? 160 : 120))), top: Math.max(8, picked.rect.top - 48) }}
            className="fixed z-[60] flex w-auto animate-scale-in items-center gap-1 rounded-full border bg-popover p-1 pl-2 text-popover-foreground shadow-pop"
          >
            {COLOURS.map((c) => (
              <button key={c.id} type="button" aria-label={`Highlight ${c.label.toLowerCase()}`} title={c.label} onClick={() => save(c.id)} className="grid size-8 place-items-center rounded-full hover:bg-accent focus-ring">
                <span className={cn("size-4 rounded-full ring-1 ring-black/10", c.swatch)} />
              </button>
            ))}
            <span className="mx-0.5 h-5 w-px bg-border" />
            <button type="button" onClick={() => save("yellow", true)} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium hover:bg-accent focus-ring">
              {plus ? <StickyNote className="size-3.5" /> : <Crown className="size-3.5 text-amber-500" />}
              Note
            </button>
            {onAsk && (
              <>
                <span className="mx-0.5 h-5 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    const text = picked.text;
                    window.getSelection()?.removeAllRanges();
                    setPicked(null);
                    onAsk(text);
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium hover:bg-accent focus-ring"
                >
                  <MessageCircle className="size-3.5" />
                  Explain
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {active && <MarkPopover key={active.mark.id} material={material} mark={active.mark} anchor={active.el} onClose={onClose} plus={plus} />}
    </>
  );
}

function MarkPopover({ material, mark, anchor, onClose, plus }: { material: Material; mark: NoteMark; anchor: HTMLElement; onClose: () => void; plus: boolean }) {
  const [note, setNote] = useState(mark.note ?? "");
  const [pos, setPos] = useState({ left: 0, top: 0, below: true });
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 200 < window.innerHeight;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - 296, r.left)), top: below ? r.bottom + 8 : r.top - 8, below });
    area.current?.focus();
  }, [anchor]);

  const commit = (patch: Partial<NoteMark> = {}) => {
    if (!plus) return goPro("Highlights and your own notes");
    const text = note.trim();
    actions.saveMark(material.id, { ...mark, note: text || undefined, ...patch });
  };

  useEffect(() => {
    const out = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
      if ((note.trim() || undefined) !== mark.note && plus) actions.saveMark(material.id, { ...mark, note: note.trim() || undefined });
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", key);
    };
  }, [note, mark, anchor, material.id, onClose, plus]);

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="Your note"
      style={{ left: pos.left, top: pos.top, transform: pos.below ? undefined : "translateY(-100%)" }}
      className="fixed z-[60] w-[288px] animate-scale-in rounded-2xl border bg-popover p-3 text-popover-foreground shadow-pop"
    >
      <div className="flex items-center gap-1">
        {COLOURS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={`Make it ${c.label.toLowerCase()}`}
            aria-pressed={mark.color === c.id}
            onClick={() => commit({ color: c.id })}
            className={cn("grid size-7 place-items-center rounded-full hover:bg-accent focus-ring", mark.color === c.id && "bg-accent")}
          >
            <span className={cn("size-3.5 rounded-full ring-1 ring-black/10", c.swatch)} />
          </button>
        ))}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          aria-label="Remove highlight"
          title="Remove highlight"
          onClick={() => {
            actions.removeMark(material.id, mark.id);
            onClose();
            toast.undo("Highlight removed", () => actions.saveMark(material.id, mark));
          }}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <textarea
        ref={area}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            commit();
            onClose();
          }
        }}
        placeholder="Add your own note…"
        rows={3}
        maxLength={1000}
        className="mt-2 w-full resize-none rounded-lg border bg-background px-2.5 py-2 text-[13.5px] leading-snug focus-ring"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            commit();
            onClose();
          }}
        >
          Save note
        </Button>
      </div>
    </div>,
    document.body,
  );
}
