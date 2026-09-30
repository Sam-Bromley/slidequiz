/**
 * Pick up an item in a vertical list and move it: it lifts, follows the pointer, and the others
 * slide out of the way to show where it will land. Mouse drags start straight away; on touch
 * screens, press and hold briefly first so normal scrolling still works.
 *
 * With `onDropInto`, an item can also be dropped onto anything marked `data-drop-target="…"`
 * (e.g. a material onto a folder); `over` says which target it's above.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface Drag {
  id: string;
  from: number;
  to: number;
  dy: number;
  dx: number;
  /** Height of the picked-up item plus the gap below it. */
  step: number;
}

const IGNORE = "button,input,textarea,select,[role=menu],[data-no-drag]";

export function useDragReorder(ids: string[], onDrop: (id: string, toIndex: number) => void, opts: { onDropInto?: (id: string, target: string) => void } = {}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);
  overRef.current = over;
  const els = useRef(new Map<string, HTMLElement>());
  const pending = useRef<{ id: string; x: number; y: number; timer?: ReturnType<typeof setTimeout>; touch: boolean; pointer: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const suppressClick = useRef(false);

  const begin = (id: string) => {
    const el = els.current.get(id);
    if (!el) return;
    const from = ids.indexOf(id);
    const next = els.current.get(ids[from + 1]) ?? els.current.get(ids[from - 1]);
    const r = el.getBoundingClientRect();
    const gap = next ? Math.abs(next.getBoundingClientRect().top - r.top) - r.height : 8;
    setDrag({ id, from, to: from, dy: 0, dx: 0, step: r.height + Math.max(0, gap) });
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointer) return;
      const d = dragRef.current;
      if (!d) {
        const far = Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6;
        if (!far) return;
        if (p.touch) {
          // Moved before the hold finished: it's a scroll, not a drag.
          clearTimeout(p.timer);
          pending.current = null;
          return;
        }
        begin(p.id);
        return;
      }
      const dy = e.clientY - p.y;
      const dx = opts.onDropInto ? e.clientX - p.x : 0;
      // Above a drop target (like a folder)? Then the list stays put.
      let target: string | null = null;
      if (opts.onDropInto) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drop-target]");
        target = el && !el.contains(els.current.get(d.id) ?? null) ? (el.dataset.dropTarget ?? null) : null;
      }
      if (target !== overRef.current) setOver(target);
      // Where it would land: count how far past the neighbours' middles it has moved.
      const to = target ? d.from : Math.max(0, Math.min(ids.length - 1, d.from + Math.round(dy / d.step)));
      setDrag({ ...d, dy, dx, to });
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
      const target = overRef.current;
      setDrag(null);
      setOver(null);
      if (e.type !== "pointerup") return;
      if (target && opts.onDropInto) opts.onDropInto(d.id, target);
      else if (d.to !== d.from) onDrop(d.id, d.to);
    };
    // While dragging on a touch screen, stop the page from scrolling underneath.
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

  /** Props for each item in the list. */
  const itemProps = (id: string) => {
    const i = ids.indexOf(id);
    let style: React.CSSProperties = { transition: "transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 180ms" };
    if (drag) {
      if (id === drag.id)
        style = {
          transform: `translate(${drag.dx}px, ${drag.dy}px) scale(${over ? 0.9 : 1.02})`,
          zIndex: 20,
          position: "relative",
          transition: "box-shadow 180ms, opacity 180ms",
          boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.28)",
          cursor: "grabbing",
          // Let the pointer "see through" it to find the folder underneath.
          pointerEvents: opts.onDropInto ? "none" : undefined,
          opacity: over ? 0.85 : 1,
        };
      else if (drag.from < drag.to && i > drag.from && i <= drag.to) style = { ...style, transform: `translateY(${-drag.step}px)` };
      else if (drag.from > drag.to && i < drag.from && i >= drag.to) style = { ...style, transform: `translateY(${drag.step}px)` };
    }
    return {
      ref: (el: HTMLElement | null) => {
        if (el) els.current.set(id, el);
        else els.current.delete(id);
      },
      style,
      "data-dragging": drag?.id === id ? "" : undefined,
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0 || (e.target as Element).closest(IGNORE)) return;
        const touch = e.pointerType !== "mouse";
        pending.current = { id, x: e.clientX, y: e.clientY, touch, pointer: e.pointerId };
        if (touch) pending.current.timer = setTimeout(() => pending.current?.id === id && begin(id), 300);
      },
      // Stop the browser's own drag-and-drop (link dragging) from taking over.
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
    };
  };

  return { itemProps, dragging: drag?.id ?? null, over };
}
