import { CheckSquare, Eye, ImageIcon, ListFilter, Search, Square, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { highlightParts, truncate } from "@/lib/text";
import { cn, parseRange } from "@/lib/utils";
import type { Material, Page } from "@/types/models";
import { aiReady, usesBuiltIn } from "@/services/ai/ai-key";

function Highlight({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

function snippet(text: string, q: string, n = 150) {
  if (!q) return truncate(text.replace(/\n+/g, " · "), n);
  const flat = text.replace(/\n+/g, " · ");
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return truncate(flat, n);
  const start = Math.max(0, i - 50);
  return (start ? "…" : "") + flat.slice(start, start + n) + (start + n < flat.length ? "…" : "");
}

export interface PagePickerProps {
  material: Pick<Material, "pages" | "topics" | "unit">;
  onToggle: (pageIds: string[] | "all", included: boolean) => void;
  onSetText?: (pageId: string, text: string) => void;
  focusPageId?: string | null;
  compact?: boolean;
}

/** Choose which slides/pages/sections to use: select all/none, ranges, topics, search. */
export function PagePicker({ material, onToggle, onSetText, focusPageId }: PagePickerProps) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [onlyIncluded, setOnlyIncluded] = useState(false);
  const [preview, setPreview] = useState<Page | null>(null);
  const unit = material.unit === "slides" ? "slide" : material.unit === "pages" ? "page" : "section";
  const Unit = unit[0].toUpperCase() + unit.slice(1);
  const included = material.pages.filter((p) => p.included).length;
  const total = material.pages.length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return material.pages.filter((p) => (!q || (p.title + " " + p.text).toLowerCase().includes(q)) && (!onlyIncluded || p.included));
  }, [material.pages, query, onlyIncluded]);

  const applyRange = (mode: "only" | "exclude" | "add") => {
    const set = parseRange(range, total);
    if (!set || !set.size) {
      setRangeError(`Use ${unit} numbers like 1-5, 8, 10-12`);
      return;
    }
    setRangeError("");
    const ids = material.pages.filter((p) => set.has(p.index)).map((p) => p.id);
    if (mode === "only") {
      onToggle("all", false);
      onToggle(ids, true);
    } else onToggle(ids, mode === "add");
    toast(`${mode === "exclude" ? "Excluded" : "Selected"} ${ids.length} ${ids.length === 1 ? unit : unit + "s"}`);
  };

  return (
    <div className="space-y-4">
      {/* Summary + bulk actions */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-[15px] font-semibold" aria-live="polite">
            Using <span className="tabular-nums text-primary">{included}</span> of <span className="tabular-nums">{total}</span> {unit}s
          </p>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(included / Math.max(1, total)) * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onToggle("all", true)}>
            <CheckSquare /> Select all
          </Button>
          <Button variant="outline" size="sm" onClick={() => onToggle("all", false)}>
            <Square /> Deselect all
          </Button>
        </div>
      </div>

      {/* Topics */}
      {/* Topic names are shown once the AI has named them. */}
      {material.topics.length > 1 && (aiReady(material) || usesBuiltIn(material)) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            Sections & topics
            <span className="text-xs font-normal text-muted-foreground">detected automatically</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {material.topics.map((t) => {
              const ps = material.pages.filter((p) => t.pageIds.includes(p.id));
              const n = ps.filter((p) => p.included).length;
              const all = n === ps.length;
              const some = n > 0 && !all;
              return (
                <label key={t.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border py-1.5 pl-2.5 pr-3 text-[13px] transition-colors hover:bg-accent", all && "border-primary/40 bg-primary-soft/60", !n && "text-muted-foreground")}>
                  <Checkbox checked={all} indeterminate={some} onChange={() => onToggle(t.pageIds, !all)} aria-label={`Include topic ${t.name}`} />
                  <span className="font-medium">{t.name}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {n}/{ps.length}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + range */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search within the document…`} className="pl-9 pr-9" aria-label="Search within document" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyRange("only");
          }}
        >
          <div>
            <Input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`${Unit}s e.g. 1-5, 8`} className="w-40" aria-label={`${Unit} range`} aria-invalid={!!rangeError} aria-describedby={rangeError ? "range-err" : undefined} />
            {rangeError && (
              <p id="range-err" className="mt-1 text-xs text-destructive">
                {rangeError}
              </p>
            )}
          </div>
          <Tooltip content={`Use only these ${unit}s`}>
            <Button type="submit" variant="outline">Use only</Button>
          </Tooltip>
          <Button type="button" variant="ghost" onClick={() => applyRange("exclude")}>Exclude</Button>
        </form>
      </div>

      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        <span>
          {query ? `${visible.length} ${visible.length === 1 ? unit : unit + "s"} match “${query}”` : `${total} ${unit}s`}
        </span>
        <div className="flex items-center gap-2">
          {query && visible.length > 0 && (
            <>
              <button className="font-medium text-primary hover:underline" onClick={() => onToggle(visible.map((p) => p.id), true)}>Select matches</button>
              <span aria-hidden>·</span>
            </>
          )}
          <button className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => setOnlyIncluded((v) => !v)} aria-pressed={onlyIncluded}>
            <ListFilter className="size-3.5" /> {onlyIncluded ? "Show all" : "Show selected only"}
          </button>
        </div>
      </div>

      {/* Pages */}
      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((p) => {
          const topic = aiReady(material) || usesBuiltIn(material) ? material.topics.find((t) => t.id === p.topicId) : undefined;
          return (
            <li key={p.id} id={`page-${p.id}`}>
              <div
                className={cn(
                  "group relative flex h-full flex-col rounded-xl border bg-card p-3.5 transition-all",
                  p.included ? "border-border" : "border-dashed bg-subtle opacity-70",
                  focusPageId === p.id && "ring-2 ring-primary",
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox checked={p.included} onChange={() => onToggle([p.id], !p.included)} aria-label={`${p.label}: ${p.title}`} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[11.5px] font-medium", p.included ? "text-primary" : "text-muted-foreground")}>{p.label}</span>
                      {!p.included && <span className="text-[11px] text-muted-foreground">Excluded</span>}
                      {p.needsText && <Badge tone="warning" className="h-5"><ImageIcon /> Needs text</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-snug">
                      <Highlight text={p.title} q={query} />
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 opacity-60 group-hover:opacity-100" aria-label={`Preview ${p.label}`} onClick={() => setPreview(p)}>
                    <Eye />
                  </Button>
                </div>
                {p.imageDataUrl && <img src={p.imageDataUrl} alt={p.title} className="mt-2.5 max-h-36 w-full rounded-lg border object-cover" />}
                {p.text ? (
                  <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    <Highlight text={snippet(p.text, query)} q={query} />
                  </p>
                ) : (
                  onSetText && p.imageDataUrl && <ImageText page={p} onSetText={onSetText} />
                )}
                {topic && <span className="mt-auto pt-2.5 text-[11px] font-medium text-muted-foreground">{topic.name}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {!visible.length && <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No {unit}s match “{query}”.</p>}

      {preview && (
        <Dialog
          open
          onClose={() => setPreview(null)}
          title={preview.title}
          description={preview.label}
          size="lg"
          footer={
            <Button
              variant={preview.included ? "outline" : "default"}
              onClick={() => {
                onToggle([preview.id], !preview.included);
                setPreview(null);
              }}
            >
              {preview.included ? `Exclude this ${unit}` : `Include this ${unit}`}
            </Button>
          }
        >
          {preview.imageDataUrl && <img src={preview.imageDataUrl} alt={preview.title} className="mb-3 max-h-80 w-full rounded-lg border object-contain" />}
          <div className="whitespace-pre-line text-[14px] leading-relaxed">{preview.text ? <Highlight text={preview.text} q={query} /> : <span className="text-muted-foreground">No text on this {unit}.</span>}</div>
        </Dialog>
      )}
    </div>
  );
}

function ImageText({ page, onSetText }: { page: Page; onSetText: (id: string, t: string) => void }) {
  const [v, setV] = useState(page.text);
  return (
    <div className="mt-2 space-y-2">
      <Textarea value={v} onChange={(e) => setV(e.target.value)} placeholder="Type or paste the notes shown in this image…" className="min-h-[80px] text-[13px]" aria-label={`Text for ${page.label}`} />
      <Button size="xs" variant="subtle" disabled={!v.trim()} onClick={() => onSetText(page.id, v)}>
        Save text
      </Button>
    </div>
  );
}
