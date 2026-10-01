import { CalendarDays, Check, ChevronRight, Folder as FolderIcon, FolderPlus, Palette, Layers, MoreHorizontal, PenLine, Pencil, Play, Search, SquarePen, Trash2, Upload, X } from "lucide-react";
import { setFor } from "@/services/essays";
import { hasPlus } from "@/services/plus";
import { getState } from "@/store/store";
import { useMemo, useState, type DragEvent } from "react";
import { MaterialCard } from "@/components/materials/material-card";
import { DEFAULT_W, ResizeEdge, useResizableWidth } from "@/components/ui/resizable";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { actions, folderOrder } from "@/store/actions";
import { useDragReorder } from "@/components/ui/drag-reorder";
import { usePlanQuiet } from "@/services/plus";
import { highlightParts, searchNotes } from "@/services/search";
import { daysUntil, examLabel, folderCoverage, materialsIn } from "@/services/folders";
import { useData } from "@/store/store";
import type { Folder, Material } from "@/types/models";

const MATERIAL_MIME = "application/x-slidequiz-material";

export const FOLDER_COLOURS: { key: string; label: string; hex: string }[] = [
  { key: "red", label: "Red", hex: "#ef4444" },
  { key: "orange", label: "Orange", hex: "#f97316" },
  { key: "yellow", label: "Yellow", hex: "#eab308" },
  { key: "green", label: "Green", hex: "#22c55e" },
  { key: "teal", label: "Teal", hex: "#14b8a6" },
  { key: "blue", label: "Blue", hex: "#3b82f6" },
  { key: "purple", label: "Purple", hex: "#8b5cf6" },
  { key: "pink", label: "Pink", hex: "#ec4899" },
];
const colourOf = (key?: string) => FOLDER_COLOURS.find((c) => c.key === key)?.hex;

export const DEFAULT_FOLDER_W = DEFAULT_W;

function ColourDialog({ f, onClose }: { f: Folder; onClose: () => void }) {
  const pick = (key?: string) => {
    actions.setFolderColor(f.id, key);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Colour for “${f.name}”`} size="sm">
      <div className="grid grid-cols-5 gap-2.5" role="radiogroup" aria-label="Folder colour">
        <button type="button" role="radio" aria-checked={!f.color} onClick={() => pick(undefined)} className={cn("grid aspect-square place-items-center rounded-full border-2 text-muted-foreground focus-ring", !f.color ? "border-foreground" : "border-border")} title="No colour">
          {!f.color ? <Check className="size-4" /> : <span className="h-0.5 w-5 rotate-45 rounded bg-muted-foreground/60" />}
        </button>
        {FOLDER_COLOURS.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={f.color === c.key} aria-label={c.label} title={c.label} onClick={() => pick(c.key)} className={cn("grid aspect-square place-items-center rounded-full border-2 transition-transform hover:scale-105 focus-ring", f.color === c.key ? "border-foreground" : "border-transparent")} style={{ background: c.hex }}>
            {f.color === c.key && <Check className="size-4 text-white" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function ExamDialog({ f, onClose }: { f: Folder; onClose: () => void }) {
  const [date, setDate] = useState(f.examDate ?? "");
  const today = new Date();
  const min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Exam date for “${f.name}”`}
      size="sm"
      footer={
        <>
          {f.examDate && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                actions.setFolderExam(f.id, undefined);
                onClose();
              }}
            >
              Remove date
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="exam-date" disabled={!date}>Save</Button>
        </>
      }
    >
      <form
        id="exam-date"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date) return;
          actions.setFolderExam(f.id, date);
          onClose();
        }}
      >
        <label htmlFor="exam-date-input" className="sr-only">Exam date</label>
        <Input id="exam-date-input" type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()} className="cursor-pointer" data-autofocus />
      </form>
    </Dialog>
  );
}

function NameDialog({ title, initial, confirm, onSave, onClose }: { title: string; initial: string; confirm: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="folder-name" disabled={!name.trim()}>{confirm}</Button>
        </>
      }
    >
      <form
        id="folder-name"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim());
          onClose();
        }}
      >
        <label htmlFor="folder-name-input" className="sr-only">Folder name</label>
        <Input id="folder-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biology, Year 12, Exam prep" data-autofocus />
      </form>
    </Dialog>
  );
}


const DEFAULT_MATERIAL_W = 360;

/** A material in the list: drag to move (or onto a folder), drag its right edge to resize. */
function MaterialTile({ m, otherWidths, drag, selectable, selected, onSelect }: { m: Material; otherWidths: number[]; drag?: ReturnType<ReturnType<typeof useDragReorder>["itemProps"]>; selectable: boolean; selected: boolean; onSelect: (v: boolean) => void }) {
  const { width, start } = useResizableWidth(m.width ?? DEFAULT_MATERIAL_W, otherWidths, (w) => actions.setMaterialWidth(m.id, w));
  return <MaterialCard m={m} drag={drag} width={width} onResizeStart={start} selectable={selectable} selected={selected} onSelect={onSelect} />;
}

function FolderTile({ f, count, onDropMaterial, otherWidths, drag, dropOver }: { f: Folder; count: number; onDropMaterial: (id: string) => void; otherWidths: number[]; drag: ReturnType<ReturnType<typeof useDragReorder>["itemProps"]>; dropOver?: boolean }) {
  const [nativeOver, setOver] = useState(false);
  const over = nativeOver || !!dropOver;
  // Each folder has its own width; drag its right edge to change it.
  const { width, start: onResizeStart } = useResizableWidth(f.width, otherWidths, (w) => actions.setFolderWidth(f.id, w));
  const [colouring, setColouring] = useState(false);
  // Folder colours are a Pro feature.
  const pro = usePlanQuiet().plus;
  const hex = pro ? colourOf(f.color) : undefined;
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dating, setDating] = useState(false);
  const exam = examLabel(f.examDate);
  const soon = (daysUntil(f.examDate) ?? 99) <= 7 && (daysUntil(f.examDate) ?? -1) >= 0;
  return (
    <div
      {...drag}
      data-drop-target={f.id}
      onDragOver={(e) => {
        // Materials can be dropped onto a folder to move them in.
        if (e.dataTransfer.types.includes(MATERIAL_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        setOver(false);
        const mid = e.dataTransfer.getData(MATERIAL_MIME);
        if (mid) onDropMaterial(mid);
      }}
      style={{ ...drag.style, width: `min(100%, ${width}px)` }}
      className={cn("group relative flex cursor-grab select-none items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-[background-color,border-color,transform] hover:border-foreground/20 active:cursor-grabbing", over && "scale-[1.03] border-foreground/50 bg-accent", drag["data-dragging"] !== undefined && "border-foreground/25")}
    >
      <FolderIcon className={cn("size-5 shrink-0", !hex && "text-muted-foreground")} style={hex ? { color: hex, fill: hex + "33" } : undefined} />
      <Link to={`/materials?f=${f.id}`} className="min-w-0 flex-1 rounded after:absolute after:inset-0 focus-ring">
        <span className="block truncate text-[14px] font-medium" title={f.name}>{f.name}</span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {count ? plural(count, "item") : "Empty"}
          {exam && <span className={cn(soon && "font-medium text-warning")}> · {exam}</span>}
        </span>
      </Link>
      <div className="relative z-10">
        <Menu
          label={`${f.name} actions`}
          items={[
            { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
            {
              label: pro ? "Colour" : "Colour (Pro)",
              icon: Palette,
              onSelect: () => {
                if (pro) setColouring(true);
                else {
                  toast("Folder colours are part of SlideQuiz Pro");
                  navigate("/pro");
                }
              },
            },
            { label: f.examDate ? "Change exam date" : "Add exam date", icon: CalendarDays, onSelect: () => setDating(true) },
            { label: "Flashcards from this folder", icon: Layers, onSelect: () => openFolderFlashcards(f.id) },
            { label: "Essays on this folder", icon: PenLine, onSelect: () => openFolderEssays(f.id, f.name) },
            { label: "Delete folder", icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
          ]}
          trigger={(p) => (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.name}`} {...p}>
              <MoreHorizontal />
            </Button>
          )}
        />
      </div>
      {/* Drag the right edge to make folders wider. */}
      <ResizeEdge onPointerDown={onResizeStart} label="Drag to resize folders" />
      {colouring && <ColourDialog f={f} onClose={() => setColouring(false)} />}
      {dating && <ExamDialog f={f} onClose={() => setDating(false)} />}
      {renaming && <NameDialog title="Rename folder" initial={f.name} confirm="Save" onSave={(n) => actions.renameFolder(f.id, n)} onClose={() => setRenaming(false)} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${f.name}”?`}
        description="The folder is removed. Anything inside it moves up a level. Nothing is deleted."
        confirmLabel="Delete folder"
        onConfirm={() => toast.undo("Folder deleted", actions.deleteFolder(f.id))}
      />
    </div>
  );
}

/** Inside a folder: exam countdown, how much is covered, and practice across everything in it. */
function FolderBar({ f }: { f: Folder }) {
  const data = useData();
  const [dating, setDating] = useState(false);
  const mats = materialsIn(data, f.id);
  const cov = folderCoverage(data, f.id);
  const exam = examLabel(f.examDate);
  if (!mats.length) return null;
  return (
    <div className="-mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-muted-foreground">
      <button type="button" onClick={() => setDating(true)} className="inline-flex items-center gap-1.5 rounded hover:text-foreground focus-ring">
        <CalendarDays className="size-4" />
        {exam ?? "Add exam date"}
      </button>
      {cov.total > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>{cov.pct}% covered</span>
          <Link to={`/practice?f=${f.id}`} className={buttonClass("outline", "sm", "ml-auto rounded-full")}>
            <Play /> Practise all
          </Link>
        </>
      )}
      {dating && <ExamDialog f={f} onClose={() => setDating(false)} />}
    </div>
  );
}

export function MaterialsPage() {

  const data = useData();
  const { query } = useLocation();
  const folderId = data.folders.some((f) => f.id === query.get("f")) ? query.get("f") : null;
  const [q, setQ] = useState("");
  const sort = data.settings.materialsSort ?? "custom";
  const setSort = (v: string) => actions.updateSettings({ materialsSort: v as "custom" | "recent" | "name" });
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [rootOver, setRootOver] = useState(false);

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
  const current = trail[trail.length - 1];

  const searching = q.trim().length > 0;
  const folders = searching ? [] : data.folders.filter((f) => (f.parentId ?? null) === folderId).sort(folderOrder);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = data.materials.filter((m) => (t ? `${m.title} ${m.subject} ${m.topics.map((x) => x.name).join(" ")} ${m.files.map((f) => f.name).join(" ")}`.toLowerCase().includes(t) : (m.folderId ?? null) === folderId));
    // "Your order": as dragged; new ones (not placed yet) go first, newest first.
    if (sort === "custom") return out.sort((a, b) => (a.order ?? -1) - (b.order ?? -1) || b.createdAt.localeCompare(a.createdAt));
    return out.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : (b.lastOpenedAt ?? b.lastStudiedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.lastStudiedAt ?? a.createdAt)));
  }, [data.materials, q, sort, folderId]);

  // Drag folders up and down to reorder them.
  const folderIds = folders.map((f) => f.id);
  const reorder = useDragReorder(folderIds, (id, to) => {
    const rest = folderIds.filter((x) => x !== id);
    if (to >= rest.length) actions.reorderFolder(id, rest[rest.length - 1], true);
    else actions.reorderFolder(id, rest[to], false);
  });
  const countIn = (id: string) => data.materials.filter((m) => m.folderId === id).length + data.folders.filter((f) => f.parentId === id).length;
  const moveInto = (materialId: string, target: string | null) => {
    const m = data.materials.find((x) => x.id === materialId);
    if (!m || (m.folderId ?? null) === target) return;
    actions.moveMaterial(materialId, target);
    toast(target ? `Moved to ${data.folders.find((f) => f.id === target)?.name}` : "Moved to My Materials");
  };
  // Drag materials to reorder them (switches to "Your order"), or onto a folder to move them in.
  const materialIds = list.map((m) => m.id);
  const moveMaterial = useDragReorder(
    materialIds,
    (id, to) => {
      const rest = materialIds.filter((x) => x !== id);
      rest.splice(to, 0, id);
      actions.orderMaterials(rest);
      if (sort !== "custom") setSort("custom");
    },
    { onDropInto: (id, target) => moveInto(id, target === "root" ? null : target) },
  );
  const selectedMaterials = data.materials.filter((m) => sel.includes(m.id));
  const hits = useMemo(() => (searching ? searchNotes(data.materials, q) : []), [data.materials, q, searching]);
  const empty = !folders.length && !list.length && !hits.length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-[24px] font-semibold tracking-tight">
          <Link
            to="/materials"
            onDragOver={(e) => {
              if (trail.length && e.dataTransfer.types.includes(MATERIAL_MIME)) {
                e.preventDefault();
                setRootOver(true);
              }
            }}
            onDragLeave={() => setRootOver(false)}
            onDrop={(e) => {
              setRootOver(false);
              const id = e.dataTransfer.getData(MATERIAL_MIME);
              if (id) moveInto(id, null);
            }}
            data-drop-target={trail.length ? "root" : undefined}
            className={cn("rounded-md px-1 transition-colors focus-ring", trail.length ? "text-muted-foreground hover:text-foreground" : "", (rootOver || moveMaterial.over === "root") && "bg-accent text-foreground")}
          >
            My Materials
          </Link>
          {trail.map((f, i) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              {i === trail.length - 1 ? (
                <h1 className="truncate px-1 text-[24px] font-semibold">{f.name}</h1>
              ) : (
                <Link to={`/materials?f=${f.id}`} data-drop-target={f.id} className={cn("truncate rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-ring", moveMaterial.over === f.id && "bg-accent text-foreground")}>
                  {f.name}
                </Link>
              )}
            </span>
          ))}
          {!trail.length && <h1 className="sr-only">My Materials</h1>}
        </nav>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCreating(true)}>
            <FolderPlus /> New folder
          </Button>
          {data.materials.length > 1 && (
            <Button
              variant={selecting ? "secondary" : "outline"}
              onClick={() => {
                setSelecting((s) => !s);
                setSel([]);
              }}
            >
              <Layers /> {selecting ? "Cancel" : "Combine"}
            </Button>
          )}
          <Link to={current ? `/upload?f=${current.id}` : "/upload"} className={buttonClass()}>
            <Upload /> Upload
          </Link>
        </div>
      </div>

      {current && !searching && <FolderBar f={current} />}

      {data.materials.length > 0 && (
        <div className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" aria-label="Search materials" />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort materials" className="w-36 sm:w-40">
            <option value="custom">Your order</option>
            <option value="recent">Recently used</option>
            <option value="name">Name</option>
          </Select>
        </div>
      )}

      {selecting && <p className="mb-4 text-[13.5px] text-muted-foreground">Pick two or more materials to make one set of questions from all of them.</p>}

      {folders.length > 0 && (
        <section aria-label="Folders" className="mb-6">
          <div className="flex flex-col items-start gap-2">
            {folders.map((f) => (
              <FolderTile key={f.id} f={f} count={countIn(f.id)} dropOver={moveMaterial.over === f.id} drag={reorder.itemProps(f.id)} onDropMaterial={(id) => moveInto(id, f.id)} otherWidths={folders.filter((o) => o.id !== f.id).map((o) => o.width ?? DEFAULT_FOLDER_W)} />
            ))}
          </div>
        </section>
      )}

      {list.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          {list.map((m) => (
            <MaterialTile
              key={m.id}
              m={m}
              otherWidths={list.filter((o) => o.id !== m.id).map((o) => o.width ?? DEFAULT_MATERIAL_W)}
              drag={searching ? undefined : moveMaterial.itemProps(m.id)}
              selectable={selecting}
              selected={sel.includes(m.id)}
              onSelect={(v) => setSel((s) => (v ? [...s, m.id] : s.filter((x) => x !== m.id)))}
            />
          ))}
        </div>
      )}

      {hits.length > 0 && (
        <section aria-labelledby="hits-h" className={cn(list.length > 0 && "mt-8")}>
          <h2 id="hits-h" className="mb-2 text-[13px] font-medium text-muted-foreground">
            In your notes · {hits.length}
            {hits.length >= 60 ? "+" : ""}
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {hits.map((h, i) => (
              <li key={i}>
                <Link to={`/materials/${h.materialId}?p=${h.pageId}`} className="block px-4 py-3 transition-colors hover:bg-accent focus-ring">
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {h.materialTitle} · {h.pageTitle}
                  </span>
                  <span className="mt-0.5 block text-[14px] leading-snug">
                    {highlightParts(h.snippet, q).map((part, j) => (part.hit ? <mark key={j} className="rounded bg-warning-soft px-0.5 text-foreground">{part.text}</mark> : <span key={j}>{part.text}</span>))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty &&
        (searching ? (
          <EmptyState icon={Search} title="Nothing matches that search" action={<Button variant="outline" onClick={() => setQ("")}>Clear search</Button>} />
        ) : current ? (
          <EmptyState icon={FolderIcon} title="This folder is empty" description="Upload into it, or drag materials onto a folder to move them." action={<Link to={`/upload?f=${current.id}`} className={buttonClass()}><Upload /> Upload here</Link>} />
        ) : (
          <EmptyState icon={Upload} title="Nothing here yet" description="Upload slides, PDFs or notes, and use folders to keep subjects apart." action={<Link to="/upload" className={buttonClass()}><Upload /> Upload</Link>} />
        ))}

      {!searching && !current && data.folders.length === 0 && data.materials.length > 1 && <p className="mt-6 text-[13px] text-muted-foreground">Tip: create a folder, then drag materials onto it.</p>}

      {creating && (
        <NameDialog
          title={current ? `New folder in ${current.name}` : "New folder"}
          initial=""
          confirm="Create"
          onSave={(n) => {
            actions.createFolder(n, folderId);
            toast("Folder created");
          }}
          onClose={() => setCreating(false)}
        />
      )}

      {selecting && sel.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-30 px-4 lg:bottom-6 lg:left-[var(--sb,248px)]">
          <div className="mx-auto flex max-w-3xl animate-fade-up flex-col gap-3 rounded-2xl border bg-popover p-4 shadow-pop sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-muted-foreground">Make questions from:</p>
              <p className="truncate text-[14px] font-semibold">{selectedMaterials.map((m) => m.title).join(" · ")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSel([])}>
                <X />
              </Button>
              <Button onClick={() => navigate(`/generate?m=${sel.join(",")}`)}>
                <SquarePen /> Make questions from {plural(sel.length, "material")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lectures in a folder and its subfolders. */
function folderMaterialIds(fid: string): string[] {
  const d = getState();
  const ids = new Set([fid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of d.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
  }
  return d.materials.filter((m) => m.folderId && ids.has(m.folderId)).map((m) => m.id);
}

function openFolderFlashcards(fid: string) {
  const ids = folderMaterialIds(fid);
  if (!ids.length) return toast("This folder is empty");
  navigate(`/flashcards?from=${ids.join(",")}`);
}

function openFolderEssays(fid: string, name: string) {
  const ids = folderMaterialIds(fid);
  if (!ids.length) return toast("This folder is empty");
  if (!hasPlus()) return navigate("/essays");
  navigate(`/essays/${setFor(ids, name, fid)}`);
}
