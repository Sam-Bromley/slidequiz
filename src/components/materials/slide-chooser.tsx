import { Check, EyeOff } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/input";
import { cn, plural } from "@/lib/utils";
import { retopic } from "@/services/parsing";
import { unitWord } from "@/store/selectors";
import type { Material, Page } from "@/types/models";
import { StoredImage } from "./stored-image";

const preview = (p: Page) => {
  const first = p.text.split(/\n/).map((l) => l.replace(/^[\s•\-–*▪]+/, "").trim()).find((l) => l && !/^speaker notes:?$/i.test(l));
  return first ? (first.length > 90 ? first.slice(0, 89) + "…" : first) : "";
};

/**
 * Compact chooser: slides as a grid of small numbered tiles (tap to leave one out)
 * and the pictures found in them (tap to include or leave out).
 */
export function SlideChooser({ material, onChange }: { material: Material; onChange: (m: Material) => void }) {
  const [hover, setHover] = useState<Page | null>(null);
  const pages = material.pages;
  const included = pages.filter((p) => p.included).length;
  const word = unitWord(material, 1);
  const Word = word[0].toUpperCase() + word.slice(1);

  const setPages = (fn: (p: Page) => Page) => onChange({ ...material, pages: material.pages.map(fn) });
  const images = pages.flatMap((p) => (p.images ?? []).map((img) => ({ p, img })));
  // Show each picture once per slide; repeated logos are grouped at the end.
  const shown = images.filter(({ img }) => !img.repeated);
  const repeated = images.filter(({ img }) => img.repeated);
  const repeatedIds = [...new Set(repeated.map(({ img }) => img.id))];
  const imgIncluded = shown.filter(({ p, img }) => p.included && img.included).length;
  const needText = pages.filter((p) => p.needsText && !p.text.trim());

  const toggleImage = (pageId: string, imgId: string) => setPages((p) => (p.id !== pageId ? p : { ...p, images: p.images?.map((i) => (i.id === imgId ? { ...i, included: !i.included } : i)) }));
  const setAllImages = (on: boolean) => setPages((p) => ({ ...p, images: p.images?.map((i) => (i.repeated ? i : { ...i, included: on })) }));
  const toggleRepeated = (id: string, on: boolean) => setPages((p) => ({ ...p, images: p.images?.map((i) => (i.id === id ? { ...i, included: on } : i)) }));

  const info = hover ?? null;

  return (
    <div className="space-y-7">
      <section aria-labelledby="chooser-slides">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <h3 id="chooser-slides" className="text-[15px] font-semibold">{Word}s</h3>
            <p className="text-[13px] text-muted-foreground">
              Using {included} of {pages.length}. Tap a {word} to leave it out.
            </p>
          </div>
          <div className="flex shrink-0 gap-1 text-[13px]">
            <button type="button" className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" onClick={() => setPages((p) => ({ ...p, included: !(p.needsText && !p.text.trim()) || !!p.imageDataUrl }))}>
              All
            </button>
            <button type="button" className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" onClick={() => setPages((p) => ({ ...p, included: false }))}>
              None
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(42px,1fr))] gap-1.5" role="group" aria-label={`${Word}s to include`} onMouseLeave={() => setHover(null)}>
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.included}
              aria-label={`${p.label}: ${p.title}${p.included ? "" : " (left out)"}`}
              title={p.title}
              onMouseEnter={() => setHover(p)}
              onFocus={() => setHover(p)}
              onClick={() => {
                setHover(p);
                setPages((x) => (x.id === p.id ? { ...x, included: !x.included } : x));
              }}
              className={cn(
                "relative grid h-10 place-items-center rounded-lg border text-[13px] font-medium tabular-nums transition-colors focus-ring",
                p.included ? "border-border bg-card text-foreground hover:border-foreground/40" : "border-dashed bg-transparent text-muted-foreground/60 line-through hover:text-muted-foreground",
              )}
            >
              {p.index}
              {!!p.images?.some((i) => !i.repeated) && <span className={cn("absolute right-1 top-1 size-1 rounded-full", p.included ? "bg-foreground/50" : "bg-muted-foreground/30")} aria-hidden />}
            </button>
          ))}
        </div>
        <p className="mt-2 min-h-[20px] truncate text-[13px] text-muted-foreground" aria-live="polite">
          {info ? (
            <>
              <span className="font-medium text-foreground">{info.label}</span> · {info.title}
              {preview(info) && info.title !== preview(info) ? <span> · {preview(info)}</span> : null}
              {!info.included && <span> · left out</span>}
            </>
          ) : (
            <span className="hidden sm:inline">Hover over a {word} to see what's on it.</span>
          )}
        </p>
      </section>

      {shown.length > 0 && (
        <section aria-labelledby="chooser-images">
          <div className="mb-2.5 flex items-end justify-between gap-3">
            <div>
              <h3 id="chooser-images" className="text-[15px] font-semibold">Images</h3>
              <p className="text-[13px] text-muted-foreground">
                {imgIncluded} of {plural(shown.length, "image")} will appear in your notes. Tap one to include it or leave it out.
              </p>
            </div>
            <div className="flex shrink-0 gap-1 text-[13px]">
              <button type="button" className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" onClick={() => setAllImages(true)}>
                All
              </button>
              <button type="button" className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-ring" onClick={() => setAllImages(false)}>
                None
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {shown.map(({ p, img }) => {
              const on = p.included && img.included;
              return (
                <button
                  key={p.id + img.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!p.included}
                  aria-label={`Image on ${p.label}${on ? " (included)" : " (left out)"}`}
                  onClick={() => toggleImage(p.id, img.id)}
                  className={cn("group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted transition focus-ring", on ? "border-foreground/30" : "opacity-45", !p.included && "cursor-not-allowed")}
                  title={p.included ? `${p.label} · ${p.title}` : `${p.label} is left out`}
                >
                  <StoredImage id={img.id} alt={`Image on ${p.label}`} className="size-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-white">{p.index}</span>
                  <span className={cn("absolute right-1 top-1 grid size-5 place-items-center rounded-full", on ? "bg-foreground text-background" : "bg-black/50 text-white")}>
                    {on ? <Check className="size-3" strokeWidth={3} /> : <EyeOff className="size-3" />}
                  </span>
                </button>
              );
            })}
          </div>
          {repeatedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {repeatedIds.map((id) => {
                const on = repeated.some(({ img }) => img.id === id && img.included);
                return (
                  <label key={id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1">
                    <StoredImage id={id} alt="Repeated image" className="h-6 w-9 rounded object-contain" />
                    <input type="checkbox" className="accent-foreground" checked={on} onChange={(e) => toggleRepeated(id, e.target.checked)} />
                    On every {word} (like a logo)
                  </label>
                );
              })}
            </div>
          )}
        </section>
      )}

      {needText.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[15px] font-semibold">Type the text from your photo</h3>
          <p className="text-[13px] text-muted-foreground">Text in photos can't be read automatically yet. Type or paste the key points and they'll go into your notes.</p>
          {needText.map((p) => (
            <div key={p.id} className="flex gap-3">
              {p.imageDataUrl && <img src={p.imageDataUrl} alt={p.title} className="h-24 w-32 shrink-0 rounded-lg border object-cover" />}
              <Textarea
                aria-label={`Text for ${p.title}`}
                className="min-h-[96px] flex-1"
                placeholder="Type the notes from this photo…"
                onBlur={(e) => {
                  const text = e.target.value.trim();
                  if (text) onChange(retopic({ ...material, pages: material.pages.map((x) => (x.id === p.id ? { ...x, text, needsText: false, included: true } : x)) }));
                }}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
