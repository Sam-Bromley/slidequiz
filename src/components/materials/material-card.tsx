import { Folder as FolderIcon, FolderInput, FileImage, FileText, FileType2, MoreHorizontal, Pencil, Presentation, StickyNote, Trash2, AudioLines, Video, CirclePlay } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate } from "@/lib/router";
import { cn, relativeTime } from "@/lib/utils";
import { actions } from "@/store/actions";
import { materialCounts, unitWord } from "@/store/selectors";
import { useData } from "@/store/store";
import type { Folder, Material, SourceFileType } from "@/types/models";
import { overallProgress } from "@/services/practice";
import { ResizeEdge } from "@/components/ui/resizable";
import { aiReady, usesBuiltIn } from "@/services/ai/ai-key";

const TYPE_ICON: Record<SourceFileType, typeof FileText> = { pptx: Presentation, pdf: FileText, docx: FileType2, txt: StickyNote, text: StickyNote, image: FileImage, audio: AudioLines, video: Video, youtube: CirclePlay };


export function MaterialIcon({ m, className }: { m: Material; className?: string }) {
  const Icon = TYPE_ICON[m.files[0]?.type ?? "text"];
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground", className)} aria-hidden>
      <Icon className="size-[18px]" />
    </span>
  );
}

export function materialStatsLine(m: Material, c: ReturnType<typeof materialCounts>) {
  return [`${c.pages} ${unitWord(m, c.pages)}`, c.questions ? `${c.questions} questions` : null].filter(Boolean).join(" · ");
}

export function RenameDialog({ m, open, onClose }: { m: Material; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(m.title);
  const [subject, setSubject] = useState(m.subject);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename material"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            form="rename-form"
            type="submit"
            disabled={!title.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="rename-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          actions.updateMaterial(m.id, { title: title.trim(), subject: subject.trim() || "General" });
          toast("Material renamed");
          onClose();
        }}
      >
        <Field label="Subject" htmlFor="rn-subject">
          <Input id="rn-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Title" htmlFor="rn-title">
          <Input id="rn-title" value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
        </Field>
      </form>
    </Dialog>
  );
}

/** Flattened folder tree for pickers: [{folder, depth}]. */
export function folderTree(folders: Folder[], parentId: string | null = null, depth = 0): { folder: Folder; depth: number }[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((f) => [{ folder: f, depth }, ...folderTree(folders, f.id, depth + 1)]);
}

export function MoveDialog({ m, onClose }: { m: Material; onClose: () => void }) {
  const data = useData();
  const tree = folderTree(data.folders);
  const pick = (id: string | null) => {
    actions.moveMaterial(m.id, id);
    toast(id ? `Moved to ${data.folders.find((f) => f.id === id)?.name}` : "Moved to My Materials");
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Move “${m.title}”`} size="sm">
      <ul className="space-y-0.5">
        {[{ folder: null, depth: 0 }, ...tree].map(({ folder, depth }) => {
          const current = (m.folderId ?? null) === (folder?.id ?? null);
          return (
            <li key={folder?.id ?? "root"}>
              <button disabled={current} onClick={() => pick(folder?.id ?? null)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-accent disabled:opacity-50 focus-ring" style={{ paddingLeft: 10 + depth * 18 }}>
                <FolderIcon className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{folder ? folder.name : "My Materials (no folder)"}</span>
                {current && <span className="text-[12px] text-muted-foreground">Current</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {!data.folders.length && <p className="mt-3 text-[13px] text-muted-foreground">You don't have any folders yet. Create one from My Materials.</p>}
    </Dialog>
  );
}

export function useMaterialMenu(m: Material) {
  const [rename, setRename] = useState(false);
  const [del, setDel] = useState(false);
  const [move, setMove] = useState(false);
  const items = [
    { label: "Rename", icon: Pencil, onSelect: () => setRename(true) },
    { label: "Move to folder", icon: FolderInput, onSelect: () => setMove(true) },
    { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDel(true) },
  ];
  const dialogs = (
    <>
      {rename && <RenameDialog m={m} open={rename} onClose={() => setRename(false)} />}
      {move && <MoveDialog m={m} onClose={() => setMove(false)} />}
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title={`Delete “${m.title}”?`}
        description="This removes the material with its notes, questions and progress."
        onConfirm={() => {
          const undo = actions.deleteMaterial(m.id);
          toast.undo("Material deleted", undo);
          if (location.hash.includes(m.id)) navigate("/materials");
        }}
      />
    </>
  );
  return { items, dialogs };
}

/** `drag`: props from useDragReorder so it can be moved; `width`/`onResizeStart`: drag its right edge to resize. */
export function MaterialCard({ m, selectable, selected, onSelect, drag, width, onResizeStart }: { m: Material; selectable?: boolean; selected?: boolean; onSelect?: (v: boolean) => void; drag?: Record<string, unknown> & { style?: React.CSSProperties }; width?: number; onResizeStart?: (e: React.PointerEvent) => void }) {
  const data = useData();
  const c = materialCounts(data, m);
  const prog = overallProgress(data, m);
  const { items, dialogs } = useMaterialMenu(m);
  return (
    <article
      {...(selectable ? {} : drag)}
      style={{ ...(selectable ? {} : drag?.style), ...(width ? { width: `min(100%, ${width}px)` } : {}) }}
      className={cn("group relative flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20", drag && !selectable && "cursor-grab select-none active:cursor-grabbing", selected && "border-primary ring-1 ring-primary")}
    >
      <div className="flex items-start gap-3">
        {selectable ? (
          <div className="grid size-10 place-items-center">
            <Checkbox checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} aria-label={`Select ${m.title}`} />
          </div>
        ) : (
          <MaterialIcon m={m} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-muted-foreground">{aiReady(m) || usesBuiltIn(m) ? m.subject : "\u00a0"}</p>
          <h3 className="mt-0.5 font-sans text-[15px] font-semibold leading-snug">
            <Link to={`/materials/${m.id}`} className="rounded after:absolute after:inset-0 after:rounded-xl focus-ring">
              {m.title}
            </Link>
          </h3>
        </div>
        <div className="relative z-10 -mr-1.5 -mt-1">
          <Menu label={`${m.title} actions`} items={items} trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.title}`} {...p}><MoreHorizontal /></Button>} />
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>{prog.total ? `${prog.covered} of ${prog.total} covered` : `${c.included} of ${c.pages} ${unitWord(m)}`}</span>
          <span className="font-medium tabular-nums text-foreground">{prog.pct}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground" style={{ width: `${prog.pct}%` }} />
        </div>
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">{m.lastStudiedAt ? `Practised ${relativeTime(m.lastStudiedAt)}` : `Added ${relativeTime(m.createdAt)}`}</p>
      {onResizeStart && <ResizeEdge onPointerDown={onResizeStart} label="Drag to resize" />}
      {dialogs}
    </article>
  );
}
