import { CircleCheck, Folder as FolderIcon, MoreHorizontal, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EssayEditor } from "@/components/essays/essays-view";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { CONCLUSION_KEYS, INTRO_KEYS, POINT_KEYS, createEssay, deleteEssay, essayWords, migrateOldEssays, patchEssay } from "@/services/essays";
import { usePlanQuiet } from "@/services/plus";
import { useData } from "@/store/store";
import type { EssayDraft, ID } from "@/types/models";

/** How much of the plan is filled in, 0 to 1. */
function progressOf(e: EssayDraft) {
  const has = (t: string) => t.trim().split(/\s+/).filter(Boolean).length >= 3;
  if (e.mode === "simple") {
    const parts = [e.intro.text, ...e.points.map((p) => p.text), e.conclusion.text];
    return parts.filter(has).length / parts.length;
  }
  const parts = [...INTRO_KEYS.map((k) => e.intro[k]), ...e.points.flatMap((p) => POINT_KEYS.map((k) => p[k])), ...CONCLUSION_KEYS.filter((k) => k !== "future").map((k) => e.conclusion[k])];
  return parts.filter(has).length / parts.length;
}

/* ---------------------------------------------------------------- choose lectures */

/** Pick a folder (a whole module) or any lectures to write an essay on. */
function NewEssayDialog({ onClose, initial = [] }: { onClose: () => void; initial?: ID[] }) {
  const data = useData();
  const mats = data.materials;
  const [picked, setPicked] = useState<ID[]>(initial);
  const [folder, setFolder] = useState<ID | null>(null);
  const folders = data.folders.filter((f) => mats.some((m) => m.folderId === f.id));

  const toggle = (id: ID) => {
    setFolder(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const pickFolder = (fid: ID) => {
    const ids = mats.filter((m) => m.folderId === fid).map((m) => m.id);
    const on = folder === fid;
    setFolder(on ? null : fid);
    setPicked(on ? [] : ids);
  };
  const start = () => {
    const ids = mats.map((m) => m.id).filter((id) => picked.includes(id));
    const id = createEssay(ids);
    onClose();
    navigate(`/essays/${id}`);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New essay"
      description="Which lectures is it on? Choose a whole module folder, or any lectures."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!picked.length}>
            Start
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
          {folders.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Folders</p>
              <div className="flex flex-wrap gap-2">
                {folders.map((f) => {
                  const n = mats.filter((m) => m.folderId === f.id).length;
                  const on = folder === f.id;
                  return (
                    <button key={f.id} type="button" aria-pressed={on} onClick={() => pickFolder(f.id)} className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors focus-ring", on ? "border-primary bg-primary-soft text-primary" : "hover:bg-accent")}>
                      <FolderIcon className="size-4" /> {f.name} <span className="text-muted-foreground">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Lectures</p>
            <ul className="max-h-[40vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
              {mats.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 hover:bg-accent/60">
                    <input type="checkbox" className="size-4 accent-foreground" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{m.title}</span>
                      {m.subject && <span className="block text-[12px] text-muted-foreground">{m.subject}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- list */

export function EssaysPage() {
  usePlanQuiet();
  const data = useData();
  const { query } = useLocation();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"todo" | "done">("todo");
  useEffect(() => {
    migrateOldEssays();
  }, []);
  const all = data.essayDrafts ?? [];
  const todo = all.filter((e) => !e.completed);
  const done = all.filter((e) => e.completed);
  const shown = view === "done" ? done : todo;

  return (
    <div>
      <PageHeader
        title="Essays"
        description={all.length ? undefined : "Get an essay question on your lectures, then plan and write it step by step."}
        actions={
          all.length ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New essay
            </Button>
          ) : null
        }
      />
      {!all.length ? (
        <div className="flex min-h-[44vh] flex-col items-center justify-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <PenLine className="size-6" />
          </span>
          <Button size="lg" className="mt-2 h-12 rounded-full px-7 text-[15px]" onClick={() => setCreating(true)}>
            <Plus /> Start an essay
          </Button>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">Pick your lectures, generate a question, then fill in the introduction, your points and the conclusion one small box at a time.</p>
        </div>
      ) : (
        <>
          <Segmented
            className="mb-4"
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: "todo", label: `In progress${todo.length ? ` (${todo.length})` : ""}` },
              { value: "done", label: `Completed${done.length ? ` (${done.length})` : ""}` },
            ]}
          />
          {!shown.length ? (
            <p className="py-10 text-center text-[14px] text-muted-foreground">{view === "done" ? "Essays you mark as completed show up here." : "Nothing in progress. Start a new essay."}</p>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {shown.map((e) => (
                <EssayTile key={e.id} e={e} />
              ))}
            </ul>
          )}
        </>
      )}
      {(creating || query.get("new") === "1") && (
        <NewEssayDialog
          initial={(query.get("from") ?? "").split(",").filter(Boolean)}
          onClose={() => {
            setCreating(false);
            if (query.get("new")) navigate("/essays", { replace: true });
          }}
        />
      )}
    </div>
  );
}

function EssayTile({ e }: { e: EssayDraft }) {
  const data = useData();
  const titles = e.materialIds.map((id) => data.materials.find((m) => m.id === id)?.title).filter(Boolean) as string[];
  const p = progressOf(e);
  const words = essayWords(e).total;
  return (
    <li className="group relative rounded-2xl border bg-card transition-colors hover:border-foreground/20">
      <Link to={`/essays/${e.id}`} className="block rounded-2xl p-4 pr-12 focus-ring">
        <span className={cn("line-clamp-2 text-[14.5px] font-semibold leading-snug", !e.question.trim() && "text-muted-foreground")}>{e.question.trim() || "No question yet"}</span>
        <span className="mt-1 block truncate text-[12.5px] text-muted-foreground">
          {titles.length > 1 ? plural(titles.length, "lecture") : (titles[0] ?? "Lecture deleted")} · {plural(words, "word")}
        </span>
        <span className="mt-3 flex items-center gap-2">
          {e.completed ? (
            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-success">
              <CircleCheck className="size-4" /> Completed
            </span>
          ) : (
            <>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Plan filled in">
                <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(p * 100)}%` }} />
              </span>
              <span className="text-[12px] tabular-nums text-muted-foreground">{Math.round(p * 100)}%</span>
            </>
          )}
        </span>
      </Link>
      <div className="absolute right-2 top-2">
        <Menu
          label="Essay actions"
          items={[
            e.completed
              ? { label: "Mark as in progress", icon: RotateCcw, onSelect: () => patchEssay(e.id, { completed: false }) }
              : { label: "Mark as completed", icon: CircleCheck, onSelect: () => patchEssay(e.id, { completed: true }) },
            {
              label: "Delete",
              icon: Trash2,
              danger: true,
              onSelect: () => toast.undo("Essay deleted", deleteEssay(e.id)),
            },
          ]}
          trigger={(t) => (
            <Button variant="ghost" size="icon-sm" aria-label="Essay actions" {...t}>
              <MoreHorizontal />
            </Button>
          )}
        />
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- one essay */

export function EssayPage({ id }: { id: ID }) {
  usePlanQuiet();
  const data = useData();
  useEffect(() => {
    migrateOldEssays();
  }, []);
  const e = (data.essayDrafts ?? []).find((x) => x.id === id);
  if (!e) return <EmptyState icon={PenLine} title="Not found" description="This essay may have been deleted." action={<Link to="/essays" className="font-medium underline">Essays</Link>} />;
  const mats = e.materialIds.map((mid) => data.materials.find((m) => m.id === mid)).filter((m): m is NonNullable<typeof m> => !!m);
  return (
    <div>
      <PageHeader
        title="Essay"
        back={{ to: "/essays", label: "Essays" }}
        actions={
          <Menu
            label="Essay actions"
            items={[
              {
                label: "Delete essay",
                icon: Trash2,
                danger: true,
                onSelect: () => {
                  const undo = deleteEssay(e.id);
                  navigate("/essays");
                  toast.undo("Essay deleted", undo);
                },
              },
            ]}
            trigger={(t) => (
              <Button variant="ghost" size="icon-sm" aria-label="Essay actions" {...t}>
                <MoreHorizontal />
              </Button>
            )}
          />
        }
      />
      {mats.length ? <EssayEditor essay={e} materials={mats} /> : <p className="text-[14px] text-muted-foreground">The lectures for this essay have been deleted.</p>}
    </div>
  );
}
