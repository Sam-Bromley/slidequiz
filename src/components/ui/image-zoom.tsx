import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { imageStore } from "@/services/storage/images";

const MIN = 1;
const MAX = 6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * A picture full screen: scroll (or pinch) to zoom in and out, drag to move around,
 * double-click (or double-tap) to zoom in or back out.
 */
export function ImageZoom({ id, alt, onClose }: { id: string; alt: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; mid: { x: number; y: number }; x: number; y: number } | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    let live = true;
    imageStore.url(id).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomBy(1.4);
      if (e.key === "-") zoomBy(1 / 1.4);
      if (e.key === "0") setView({ s: 1, x: 0, y: 0 });
    };
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Zoom by a factor, keeping the point under (cx, cy) (relative to the centre) where it is. */
  const zoomAt = (factor: number, cx = 0, cy = 0) =>
    setView((v) => {
      const s = clamp(v.s * factor, MIN, MAX);
      const k = s / v.s;
      if (s === 1) return { s: 1, x: 0, y: 0 };
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  const zoomBy = (f: number) => zoomAt(f);
  const centreOf = (clientX: number, clientY: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  };

  // Wheel zoom needs a non-passive listener so the page doesn't scroll.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = centreOf(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), c.x, c.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = centreOf((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, mid, x: view.x, y: view.y };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
      const now = Date.now();
      if (now - lastTap.current < 300) {
        const c = centreOf(e.clientX, e.clientY);
        if (view.s > 1.05) setView({ s: 1, x: 0, y: 0 });
        else zoomAt(2.5, c.x, c.y);
        drag.current = null;
      }
      lastTap.current = now;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const s = clamp((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist, MIN, MAX);
      const mid = centreOf((a.x + b.x) / 2, (a.y + b.y) / 2);
      const k = s / g.s;
      setView(s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: mid.x - (g.mid.x - g.x) * k, y: mid.y - (g.mid.y - g.y) * k });
      return;
    }
    const d = drag.current;
    if (d && view.s > 1) setView((v) => ({ ...v, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { px: p.x, py: p.y, x: view.x, y: view.y };
    } else if (!pointers.current.size) drag.current = null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-neutral-950" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center gap-1 p-2 text-white">
        <p className="min-w-0 flex-1 truncate px-2 text-[13.5px] text-white/80">{alt}</p>
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out" className="grid size-10 place-items-center rounded-full hover:bg-white/10 focus-ring">
          <Minus className="size-5" />
        </button>
        <span className="w-12 text-center text-[13px] tabular-nums text-white/80">{Math.round(view.s * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in" className="grid size-10 place-items-center rounded-full hover:bg-white/10 focus-ring">
          <Plus className="size-5" />
        </button>
        <button type="button" onClick={() => setView({ s: 1, x: 0, y: 0 })} aria-label="Reset zoom" className="grid size-10 place-items-center rounded-full hover:bg-white/10 focus-ring">
          <RotateCcw className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-white/10 focus-ring">
          <X className="size-5" />
        </button>
      </div>
      <div
        ref={stage}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: view.s > 1 ? (drag.current ? "grabbing" : "grab") : "zoom-in" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {src && (
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-h-[calc(100%-32px)] max-w-[calc(100%-32px)] rounded-md bg-white object-contain"
            style={{ transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "center", transition: pointers.current.size ? "none" : "transform 120ms ease-out" }}
          />
        )}
      </div>
      <p className="pb-3 text-center text-[12px] text-white/50">Scroll or pinch to zoom · drag to move · double-click to zoom in or out</p>
    </div>,
    document.body,
  );
}
