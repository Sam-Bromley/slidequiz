/**
 * Folders laid out in columns (as many as fit, the same widths as the lectures below), where each folder can be
 * picked up and dropped into any column, at any spot: above, between or below the others.
 * Mouse drags start straight away; on touch screens, press and hold briefly first so scrolling still works.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Folder } from "@/types/models";

const GAP = 12;
const IGNORE = "button,input,textarea,select,[role=menu],[data-no-drag]";

export interface FolderDragProps {
  style?: React.CSSProperties;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  "data-dragging"?: string;
}

type Drag = { id: string; w: number; h: number; offX: number; offY: number; x: number; y: number; col: number; index: number };

/** Puts each folder in a column: its saved column (if it still fits), otherwise the column with the fewest folders. */
function layout(folders: Folder[], n: number): Folder[][] {
  const cols: Folder[][] = Array.from({ length: n }, () => []);
  const placed = folders.filter((f) => f.col !== undefined);
  const loose = folders.filter((f) => f.col === undefined);
  for (const f of placed) cols[Math.min(f.col!, n - 1)].push(f);
  for (const c of cols) c.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const f of loose) cols.reduce((a, b) => (b.length < a.length ? b : a)).push(f);
  return cols;
}

export function FolderColumns({
  folders,
  colWidth,
  render,
  onMove,
}: {
  folders: Folder[];
  colWidth: number;
  render: (f: Folder, drag: FolderDragProps) => ReactNode;
  /** Every folder's new column and position, after one was dropped somewhere. */
  onMove: (placement: { id: string; col: number; order: number }[]) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = Math.max(1, Math.floor((width + GAP) / (colWidth + GAP)) || 1);
  const cols = layout(folders, n);

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const colEls = useRef<(HTMLDivElement | null)[]>([]);
  const tileEls = useRef(new Map<string, HTMLElement>());
  const pending = useRef<{ id: string; x: number; y: number; touch: boolean; pointer: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const suppressClick = useRef(false);
  const colsRef = useRef(cols);
  colsRef.current = cols;

  /** Which column the pointer is over, and the spot in it (by the middles of the folders already there). */
  const target = (x: number, y: number, id: string) => {
    let col = 0;
    let best = Infinity;
    colEls.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < best) {
        best = d;
        col = i;
      }
    });
    const items = colsRef.current[col]?.filter((f) => f.id !== id) ?? [];
    let index = 0;
    for (const f of items) {
      const el = tileEls.current.get(f.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) index++;
    }
    return { col, index };
  };

  const begin = (id: string, x: number, y: number) => {
    const el = tileEls.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = target(x, y, id);
    setDrag({ id, w: r.width, h: r.height, offX: x - r.left, offY: y - r.top, x, y, ...t });
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointer) return;
      const d = dragRef.current;
      if (!d) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 6) return;
        if (p.touch) {
          // Moved before the hold finished: that's a scroll.
          clearTimeout(p.timer);
          pending.current = null;
          return;
        }
        begin(p.id, e.clientX, e.clientY);
        return;
      }
      setDrag({ ...d, x: e.clientX, y: e.clientY, ...target(e.clientX, e.clientY, d.id) });
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointer) return;
      clearTimeout(p.timer);
      pending.current = null;
      const d = dragRef.current;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (!d) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      setDrag(null);
      if (e.type !== "pointerup") return;
      const moving = folders.find((f) => f.id === d.id);
      if (!moving) return;
      const next = colsRef.current.map((c) => c.filter((f) => f.id !== d.id));
      next[d.col].splice(d.index, 0, moving);
      onMove(next.flatMap((c, col) => c.map((f, order) => ({ id: f.id, col, order }))));
    };
    const touchmove = (e: TouchEvent) => dragRef.current && e.cancelable && e.preventDefault();
    const click = (e: MouseEvent) => {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick.current = false;
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", touchmove, { passive: false });
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", touchmove);
      window.removeEventListener("click", click, true);
    };
  });

  const propsFor = (f: Folder): FolderDragProps => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || (e.target as Element).closest(IGNORE)) return;
      const touch = e.pointerType !== "mouse";
      pending.current = { id: f.id, x: e.clientX, y: e.clientY, touch, pointer: e.pointerId };
      if (touch) {
        const { clientX, clientY } = e;
        pending.current.timer = setTimeout(() => pending.current?.id === f.id && begin(f.id, clientX, clientY), 300);
      }
    },
    // Stop the browser's own link dragging from taking over.
    onDragStart: (e) => e.preventDefault(),
  });

  const dragged = drag ? folders.find((f) => f.id === drag.id) : undefined;
  const placeholder = drag && <div aria-hidden className="mb-3 rounded-2xl border-2 border-dashed border-foreground/25 bg-accent/40" style={{ height: drag.h }} />;

  return (
    <div ref={wrap} className="-mb-3 flex items-start" style={{ gap: GAP }}>
      {cols.map((c, ci) => {
        const items = drag ? c.filter((f) => f.id !== drag.id) : c;
        return (
          <div key={ci} ref={(el) => {
              colEls.current[ci] = el;
            }} className="min-h-[76px] min-w-0 flex-1">
            {items.map((f, i) => (
              <div key={f.id}>
                {drag?.col === ci && drag.index === i && placeholder}
                <div
                  ref={(el) => {
                    if (el) tileEls.current.set(f.id, el);
                    else tileEls.current.delete(f.id);
                  }}
                >{render(f, propsFor(f))}</div>
              </div>
            ))}
            {drag?.col === ci && drag.index >= items.length && placeholder}
          </div>
        );
      })}
      {/* The folder being carried, following the pointer (on the page itself, so nothing around it can offset it). */}
      {drag &&
        dragged &&
        createPortal(
          <div className="pointer-events-none fixed z-50" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w }}>
            <div className="rotate-[1.5deg] scale-[1.03] rounded-2xl shadow-[0_16px_40px_-10px_rgb(0_0_0/0.35)]">{render(dragged, { "data-dragging": "", style: { cursor: "grabbing" } })}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
