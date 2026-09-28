import { BookOpenText, Download, RefreshCw, SquarePen } from "lucide-react";
import { useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { SourceChip } from "@/components/questions/source";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";
import { getAI } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { Material, SummaryDoc } from "@/types/models";

type View = "tldr" | "notes" | "detailed";

export function SummaryView({ material }: { material: Material }) {
  const data = useData();
  const s = data.summaries[material.id];
  const [view, setView] = useState<View>("tldr");
  const [detail, setDetail] = useState<SummaryDoc["detail"]>(s?.detail ?? "standard");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const regenerate = async (d: SummaryDoc["detail"]) => {
    setBusy(true);
    try {
      const g = groundingFor([material]);
      if (!g.pages.length) throw new Error("empty");
      const next = await getAI().summarize(material.id, g.pages, g.topics, d);
      // Keep a hand-edited 30-second summary style if regenerating at the same level.
      actions.setSummary(next);
      setDetail(d);
      toast(s ? "Summary regenerated" : "Summary created");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!s)
    return (
      <EmptyState
        icon={BookOpenText}
        title="No summary yet"
        description="Create revision notes, key definitions and a 30-second summary from the slides you've included."
        action={
          <Button onClick={() => regenerate("standard")} loading={busy}>
            <SquarePen /> Create summary
          </Button>
        }
      />
    );

  return (
    <div className="space-y-6" aria-busy={busy}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Summary view"
          value={view}
          onChange={setView}
          options={[
            { value: "tldr", label: "30-second" },
            { value: "notes", label: "Revision notes" },
            { value: "detailed", label: "Detailed" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12.5px] text-muted-foreground" htmlFor="sum-detail">
            Detail
          </label>
          <select id="sum-detail" value={detail} onChange={(e) => setDetail(e.target.value as SummaryDoc["detail"])} className="h-8 rounded-md border bg-card px-2 text-[13px]">
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="detailed">In depth</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => regenerate(detail)} loading={busy}>
            {!busy && <RefreshCw />} Regenerate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExporting(true)}>
            <Download /> Export
          </Button>
        </div>
      </div>

      <div className={busy ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
        {view === "tldr" && (
          <div className="rounded-2xl border bg-card p-6">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">30-second summary</p>
            <p className="mt-3 max-w-[68ch] text-[18px] leading-relaxed">{s.tldr}</p>
          </div>
        )}
        {view === "notes" && (
          <div className="grid gap-3 md:grid-cols-2">
            {s.revisionNotes.map((n) => (
              <section key={n.heading} className="rounded-xl border bg-card p-5">
                <h3 className="text-[15px] font-semibold">{n.heading}</h3>
                <ul className="mt-2.5 space-y-2 text-[15px] leading-relaxed">
                  {n.points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-1.5">{n.sources.map((x) => <SourceChip key={x.pageId} source={x} />)}</div>
              </section>
            ))}
          </div>
        )}
        {view === "detailed" && (
          <div className="space-y-6 rounded-2xl border bg-card p-6">
            {s.detailed.map((d) => (
              <section key={d.heading}>
                <h3 className="text-[16px] font-semibold">{d.heading}</h3>
                <p className="mt-2 max-w-[70ch] text-[15.5px] leading-7">{d.body}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{d.sources.map((x) => <SourceChip key={x.pageId} source={x} />)}</div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h3 className="text-[15px] font-semibold">Key concepts</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.keyConcepts.map((k) => (
              <span key={k.term} className="rounded-lg border bg-subtle px-2.5 py-1.5 text-[13px]" title={k.note}>
                <span className="font-semibold">{k.term}</span>
                <span className="text-muted-foreground">: {k.note}</span>
              </span>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h3 className="text-[15px] font-semibold">Things to remember</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed marker:font-semibold marker:text-primary">
            {s.remember.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <h3 className="border-b px-5 py-3.5 text-[15px] font-semibold">Definitions</h3>
        <dl className="divide-y">
          {s.definitions.map((d) => (
            <div key={d.term} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr_auto] sm:gap-4">
              <dt className="text-[14px] font-semibold">{d.term}</dt>
              <dd className="text-[14px] text-muted-foreground">{d.definition}</dd>
              {d.source && <dd><SourceChip source={d.source} /></dd>}
            </div>
          ))}
        </dl>
      </section>

      {s.facts.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h3 className="text-[15px] font-semibold">Important facts & figures</h3>
          <ul className="mt-3 space-y-2.5">
            {s.facts.map((f) => (
              <li key={f.text} className="flex flex-col gap-1.5 text-[14px] sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span>{f.text}</span>
                {f.source && <SourceChip source={f.source} className="shrink-0" />}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[12px] text-muted-foreground">Generated {relativeTime(s.generatedAt)} from the {material.unit} you've included. Every line comes from your material.</p>
      {exporting && <ExportDialog open onClose={() => setExporting(false)} title={material.title} summary={s} />}
    </div>
  );
}
