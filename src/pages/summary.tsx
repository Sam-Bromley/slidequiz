import { ArrowUpRight, ChevronRight, Folder as FolderIcon, Lightbulb, RotateCcw, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { MaterialIcon } from "@/components/materials/material-card";
import { Button, buttonClass } from "@/components/ui/button";
import { colourHex } from "@/components/ui/colour-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link, useLocation } from "@/lib/router";
import { cn } from "@/lib/utils";
import { aiKey } from "@/services/ai/ai-key";
import { explainSlide } from "@/services/ai/cloud";
import { folderOrder } from "@/store/actions";
import { useData } from "@/store/store";
import type { ExplainedSlide, Folder, Material } from "@/types/models";

/* ---------------------------------------------------------------- all lectures */

/** Lectures sorted the same way as in Notes. */
function notesOrder(list: Material[], sort: string) {
  const out = [...list];
  if (sort === "custom") return out.sort((a, b) => (a.order ?? -1) - (b.order ?? -1) || b.createdAt.localeCompare(a.createdAt));
  if (sort === "newest") return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sort === "oldest") return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : (b.lastOpenedAt ?? b.lastStudiedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.lastStudiedAt ?? a.createdAt)));
}

/** Every uploaded lecture, in the same folders as Notes, to pick one and read its slides explained. */
export function SummaryPage() {
  const data = useData();
  const { query } = useLocation();
  const folderId = data.folders.some((f) => f.id === query.get("f")) ? query.get("f") : null;
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const sort = data.settings.materialsSort ?? "custom";

  const trail = useMemo(() => {
    const out: Folder[] = [];
    let cur = data.folders.find((f) => f.id === folderId);
    while (cur) {
      out.unshift(cur);
      const parent: string | null = cur.parentId;
      cur = data.folders.find((f) => f.id === parent);
    }
    return out;
  }, [data.folders, folderId]);

  const folders = t ? [] : data.folders.filter((f) => (f.parentId ?? null) === folderId).sort(folderOrder);
  const mats = useMemo(
    () => notesOrder(data.materials.filter((m) => (t ? `${m.title} ${m.subject}`.toLowerCase().includes(t) : (m.folderId ?? null) === folderId)), sort),
    [data.materials, t, folderId, sort],
  );
  const countIn = (id: string) => data.materials.filter((m) => m.folderId === id).length + data.folders.filter((f) => f.parentId === id).length;

  if (!data.materials.length)
    return (
      <div>
        <PageHeader title="Summary" />
        <EmptyState
          icon={Lightbulb}
          title="No lectures yet"
          description="Add your slides, then type any slide number to have it explained."
          action={
            <Link to="/upload" className={buttonClass()}>
              <Upload /> Add material
            </Link>
          }
        />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      {trail.length ? (
        <div className="mb-5">
          <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-[24px] font-semibold tracking-tight">
            <Link to="/summary" className="rounded text-muted-foreground hover:text-foreground focus-ring">
              Summary
            </Link>
            {trail.map((f, i) => (
              <span key={f.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                {i === trail.length - 1 ? (
                  <span className="truncate">{f.name}</span>
                ) : (
                  <Link to={`/summary?f=${f.id}`} className="truncate rounded text-muted-foreground hover:text-foreground focus-ring">
                    {f.name}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>
      ) : (
        <PageHeader title="Summary" description="Pick a lecture, then type the slide you want explained." className="mb-5" />
      )}
      {data.materials.length > 6 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lectures" aria-label="Search lectures" className="pl-9" />
        </div>
      )}
      {folders.length > 0 && (
        <ul className="mb-4 grid gap-2.5 sm:grid-cols-2">
          {folders.map((f) => {
            const hex = colourHex(f.color);
            const n = countIn(f.id);
            return (
              <li key={f.id}>
                <Link
                  to={`/summary?f=${f.id}`}
                  className="group flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition-colors hover:border-foreground/20 focus-ring"
                  style={hex ? { backgroundColor: hex + "12", borderColor: hex + "55" } : undefined}
                >
                  <FolderIcon className={cn("size-[22px] shrink-0", !hex && "text-muted-foreground")} style={hex ? { color: hex, fill: hex + "33" } : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{f.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{n === 1 ? "1 item" : `${n} items`}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {mats.map((m) => {
          const hex = colourHex(m.color);
          const ready = m.explained?.key === aiKey(m) && m.explained.slides.length > 0;
          return (
            <li key={m.id}>
              <Link
                to={`/summary/${m.id}`}
                className="group flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition-colors hover:border-foreground/20 focus-ring"
                style={hex ? { backgroundColor: hex + "12", borderColor: hex + "55" } : undefined}
              >
                <MaterialIcon m={m} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{m.title}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{ready ? `${m.explained!.slides.length} explained` : m.subject || `${m.pages.length} slides`}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
      {t && !mats.length && <p className="py-10 text-center text-[14px] text-muted-foreground">No lectures match “{q}”.</p>}
      {!t && !mats.length && !folders.length && <p className="py-10 text-center text-[14px] text-muted-foreground">This folder is empty.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- one lecture */

/** "Term = plain meaning": the term in bold. */
function Detail({ text }: { text: string }) {
  const i = text.indexOf(" = ");
  if (i > 0 && i < 60)
    return (
      <>
        <b className="font-semibold text-foreground">{text.slice(0, i)}</b> = {text.slice(i + 3)}
      </>
    );
  return <>{text}</>;
}

function SlideCard({ s, m, n }: { s: ExplainedSlide; m: Material; n: number }) {
  const page = m.pages.find((p) => p.id === s.pageId);
  return (
    <article id={`sum-${s.pageId}`} className="scroll-mt-32 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        <span>{page?.label || `Slide ${n}`}</span>
        <Link to={`/materials/${m.id}?p=${s.pageId}`} className="ml-auto inline-flex items-center gap-0.5 rounded hover:text-foreground focus-ring">
          In your notes <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <h2 className="text-[18px] font-bold leading-snug sm:text-[19px]">{s.title}</h2>

      <p className="mt-3 rounded-xl border-l-4 border-primary bg-primary-soft/60 px-4 py-2.5 text-[15px] font-medium leading-relaxed">
        <span className="mr-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-primary">Key point</span>
        {s.keyPoint}
      </p>

      <ol className="mt-4 space-y-3.5">
        {s.steps.map((st, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-bold text-background">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug">{st.point}</p>
              {st.details.length > 0 && (
                <ul className="mt-1.5 space-y-1 text-[14.5px] leading-relaxed text-foreground/85">
                  {st.details.map((d, k) => (
                    <li key={k} className="flex gap-2">
                      <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      <span>
                        <Detail text={d} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>

      {s.example && <p className="mt-4 rounded-xl bg-subtle px-4 py-3 text-[14.5px] leading-relaxed text-foreground/85">{s.example}</p>}

      {s.remember && s.remember.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Remember it like this</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.remember.map((r, i) => (
              <div key={i} className="rounded-xl border px-3.5 py-2.5">
                <p className="text-[14px]">
                  <b className="font-semibold">{r.term}</b> <span className="text-muted-foreground">=</span> <b className="font-bold text-primary">{r.role}</b>
                </p>
                {r.note && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{r.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

/** One lecture: type a slide number and just that slide is explained (saved, so it's instant next time). */
export function SummaryLecturePage({ id }: { id: string }) {
  const data = useData();
  const m = data.materials.find((x) => x.id === id);
  const [num, setNum] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ n: number; msg: string } | null>(null);
  const done = m && m.explained?.key === aiKey(m) ? m.explained.slides : [];
  const total = m?.pages.length ?? 0;
  const numOf = (pageId: string) => (m ? m.pages.findIndex((p) => p.id === pageId) + 1 : 0);

  const explain = (n: number) => {
    if (!m) return;
    setNote("");
    setError(null);
    if (!Number.isInteger(n) || n < 1 || n > total) {
      setNote(`Type a slide number from 1 to ${total}.`);
      return;
    }
    const page = m.pages[n - 1];
    if (done.some((x) => x.pageId === page.id)) {
      setShown(page.id);
      return;
    }
    setBusy(n);
    setShown(null);
    explainSlide(m.id, page.id)
      .then((r) => {
        if (r === "admin") setNote(`Slide ${n} is admin or has nothing to explain.`);
        else setShown(page.id);
      })
      .catch((e) => setError({ n, msg: (e as Error).message || "Couldn't explain this slide. Try again." }))
      .finally(() => setBusy(null));
  };

  if (!m)
    return (
      <div className="py-20 text-center">
        <p className="font-medium">This lecture doesn't exist any more.</p>
        <Link to="/summary" className={buttonClass("outline", "md", "mt-4")}>
          Back to Summary
        </Link>
      </div>
    );

  const current = done.find((x) => x.pageId === shown);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: m.folderId && data.folders.some((f) => f.id === m.folderId) ? `/summary?f=${m.folderId}` : "/summary", label: data.folders.find((f) => f.id === m.folderId)?.name ?? "Summary" }}
        eyebrow={m.subject || undefined}
        title={m.title}
        description={`Type the slide you want explained (1 to ${total}).`}
        className="mb-5"
      />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          explain(parseInt(num, 10));
        }}
      >
        <label htmlFor="slide-num" className="sr-only">
          Slide number
        </label>
        <Input id="slide-num" inputMode="numeric" autoComplete="off" value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="Slide number" className="max-w-[180px]" data-autofocus />
        <Button type="submit" disabled={!num.trim() || busy !== null}>
          Explain
        </Button>
      </form>

      {done.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Explained so far</p>
          <div className="flex flex-wrap gap-1.5">
            {done.map((x) => {
              const n = numOf(x.pageId);
              return (
                <button
                  key={x.pageId}
                  type="button"
                  onClick={() => (setShown(x.pageId), setNote(""), setError(null), setNum(String(n)))}
                  aria-current={shown === x.pageId ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12.5px] transition-colors focus-ring",
                    shown === x.pageId ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}. {x.title.length > 26 ? x.title.slice(0, 25) + "…" : x.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {busy !== null && (
        <div className="flex min-h-[30vh] items-center justify-center gap-2.5 text-[14px] text-muted-foreground" aria-live="polite">
          <Spinner className="size-4" /> Explaining slide {busy}…
        </div>
      )}
      {busy === null && note && <p className="rounded-xl bg-subtle px-4 py-3 text-[14px] text-muted-foreground" aria-live="polite">{note}</p>}
      {busy === null && error && (
        <div className="flex min-h-[25vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-[14px] text-muted-foreground">{error.msg}</p>
          <Button variant="outline" onClick={() => explain(error.n)}>
            <RotateCcw /> Try again
          </Button>
        </div>
      )}
      {busy === null && current && <SlideCard s={current} m={m} n={numOf(current.pageId)} />}
    </div>
  );
}
