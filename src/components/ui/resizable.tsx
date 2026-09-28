import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const MIN_W = 200;
export const MAX_W = 760;
export const DEFAULT_W = 300;
const SNAP = 16;

/**
 * Width that the user can change by dragging an item's right edge.
 * Snaps to another item's width when within a few pixels, so rows can line up evenly.
 */
export function useResizableWidth(saved: number | undefined, others: number[], onSave: (w: number) => void) {
  const [live, setLive] = useState<number | null>(null);
  const width = live ?? saved ?? DEFAULT_W;
  const drag = useRef<{ x: number; w: number } | null>(null);
  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { x: e.clientX, w: width };
    document.body.style.cursor = "ew-resize";
    let last = width;
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      last = Math.round(Math.min(MAX_W, Math.max(MIN_W, drag.current.w + ev.clientX - drag.current.x)));
      const near = others.reduce<number | null>((best, w) => (Math.abs(w - last) <= SNAP && (best === null || Math.abs(w - last) < Math.abs(best - last)) ? w : best), null);
      if (near !== null) last = near;
      setLive(last);
    };
    const up = () => {
      drag.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onSave(last);
      setLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return { width, start };
}

/** Invisible strip on an item's right edge: only the cursor changes. Place inside a `relative` element. */
export function ResizeEdge({ onPointerDown, label = "Drag to resize" }: { onPointerDown: (e: ReactPointerEvent) => void; label?: string }) {
  return <div role="separator" aria-orientation="vertical" aria-label={label} title="Drag to resize" onPointerDown={onPointerDown} className="absolute -right-1.5 inset-y-0 z-20 hidden w-3 cursor-ew-resize touch-none sm:block" />;
}
