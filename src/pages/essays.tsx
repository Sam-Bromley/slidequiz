import { ChevronRight, Folder as FolderIcon, MoreHorizontal, PenLine, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EssaySetView, EssaysTeaser } from "@/components/essays/essays-view";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { deleteSet, migrateMaterialEssays, patchSet, setFor } from "@/services/essays";
import { hasPlus, usePlanQuiet } from "@/services/plus";
import { useData } from "@/store/store";
import type { EssaySet, ID } from "@/types/models";

/* ---------------------------------------------------------------- choose lectures */

/** Pick a folder (a whole module) or any lectures to write essays on. */
function NewEssaysDialog({ onClose, initial = [] }: { onClose: () => void; initial?: ID[] }) {
  const data = useData();
  const mats = data.materials;
  const [picked, setPicked] = useState<ID[]>(initial);
  const [folder, setFolder] = useState<ID | null>(null);
  const [name, setName] = useState("");
  const folders = data.folders.filter((f) => mats.some((m) => m.folderId === f.id));
  const suggested = folder ? (data.folders.find((f) => f.id === folder)?.name ?? "") : picked.length === 1 ? (mats.find((m) => m.id === picked[0])?.title ?? "") : picked.length > 1 ? `${picked.length} lectures` : "";

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
    const id = setFor(ids, name.trim() || suggested || "Essays", folder ?? undefined);
    if (name.trim()) patchSet(id, { title: name.trim() });
    onClose();
    navigate(`/essays/${id}`);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Essays on…"
      description="Choose a whole module folder, or any lectures."
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
          {picked.length > 0 && (
            <div>
              <label htmlFor="essay-set-name" className="mb-1.5 block text-[13px] font-medium">
                Name
              </label>
              <Input id="essay-set-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- list */

export function EssaysPage() {
  usePlanQuiet();
  const data = useData();
  const plus = hasPlus();
  const { query } = useLocation();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (plus) migrateMaterialEssays();
  }, [plus]);
  const sets = (data.essays ?? []).filter((s) => s.questions.length || s.rubric);

  if (!plus)
    return (
      <div>
        <PageHeader title="Essays" description="Essay questions and plans on a lecture or a whole module, aimed at your marking criteria." />
        <EssaysTeaser />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Essays"
        description={sets.length ? undefined : "Essay questions and plans on a lecture or a whole module, aimed at your marking criteria."}
        actions={
          sets.length ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New essays
            </Button>
          ) : null
        }
      />
      {!sets.length ? (
        <div className="flex min-h-[44vh] flex-col items-center justify-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <PenLine className="size-6" />
          </span>
          <Button size="lg" className="mt-2 h-12 rounded-full px-7 text-[15px]" onClick={() => setCreating(true)}>
            <Plus /> Start essay practice
          </Button>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">Pick a module folder or any lectures, add your marking criteria, and get essay questions with plans.</p>
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {sets.map((s) => (
            <SetTile key={s.id} s={s} />
          ))}
        </ul>
      )}
      {(creating || query.get("new") === "1") && (
        <NewEssaysDialog
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

function SetTile({ s }: { s: EssaySet }) {
  const plans = s.questions.filter((q) => q.plan).length;
  const [renaming, setRenaming] = useState(false);
  return (
    <li className="group relative rounded-2xl border bg-card transition-colors hover:border-foreground/20">
      <Link to={`/essays/${s.id}`} className="flex items-center gap-3 rounded-2xl p-4 pr-12 focus-ring">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{s.materialIds.length > 1 ? <FolderIcon className="size-5" /> : <PenLine className="size-5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{s.title}</span>
          <span className="block text-[12.5px] text-muted-foreground">
            {plural(s.materialIds.length, "lecture")} · {plural(s.questions.length, "question")}
            {plans ? ` · ${plural(plans, "plan")}` : ""}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <Menu
          label={`${s.title} actions`}
          items={[
            { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
            {
              label: "Delete",
              icon: Trash2,
              danger: true,
              onSelect: () => {
                const undo = deleteSet(s.id);
                toast.undo("Essays deleted", undo);
              },
            },
          ]}
          trigger={(p) => (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.title}`} {...p}>
              <MoreHorizontal />
            </Button>
          )}
        />
      </div>
      {renaming && <RenameSet s={s} onClose={() => setRenaming(false)} />}
    </li>
  );
}

function RenameSet({ s, onClose }: { s: EssaySet; onClose: () => void }) {
  const [name, setName] = useState(s.title);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Rename"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rename-set" disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="rename-set"
        onSubmit={(e) => {
          e.preventDefault();
          patchSet(s.id, { title: name.trim() });
          onClose();
        }}
      >
        <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- one set */

export function EssaySetPage({ id }: { id: ID }) {
  usePlanQuiet();
  const data = useData();
  const s = (data.essays ?? []).find((x) => x.id === id);
  if (!hasPlus())
    return (
      <div>
        <PageHeader title="Essays" back={{ to: "/essays", label: "Essays" }} />
        <EssaysTeaser />
      </div>
    );
  if (!s) return <EmptyState icon={PenLine} title="Not found" description="These essays may have been deleted." action={<Link to="/essays" className="font-medium underline">Essays</Link>} />;
  const mats = s.materialIds.map((mid) => data.materials.find((m) => m.id === mid)).filter((m): m is NonNullable<typeof m> => !!m);
  return (
    <div>
      <PageHeader
        title={s.title}
        back={{ to: "/essays", label: "Essays" }}
        description={
          <span className="flex flex-wrap gap-1.5 pt-1">
            {mats.map((m) => (
              <Link key={m.id} to={`/materials/${m.id}`} className="rounded-full border bg-card px-2.5 py-0.5 text-[12.5px] text-muted-foreground hover:text-foreground focus-ring">
                {m.title}
              </Link>
            ))}
          </span>
        }
      />
      {mats.length ? <EssaySetView set={s} /> : <p className="text-[14px] text-muted-foreground">The lectures for these essays have been deleted.</p>}
    </div>
  );
}
