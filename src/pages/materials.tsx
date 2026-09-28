import { Check, ChevronRight, Folder as FolderIcon, FolderPlus, Palette, Layers, MoreHorizontal, Pencil, Search, SquarePen, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { MaterialCard } from "@/components/materials/material-card";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import type { Folder } from "@/types/models";

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

const MIN_W = 200;
const MAX_W = 760;
export const DEFAULT_FOLDER_W = 300;

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

function FolderTile({ f, count, onDropMaterial }: { f: Folder; count: number; onDropMaterial: (id: string) => void }) {
  const [over, setOver] = useState(false);
  // Each folder has its own width; drag its right edge to change it.
  const [live, setLive] = useState<number | null>(null);
  const width = live ?? f.width ?? DEFAULT_FOLDER_W;
  const drag = useRef<{ x: number; w: number } | null>(null);
  const onResizeStart = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { x: e.clientX, w: width };
    document.body.style.cursor = "ew-resize";
    let last = width;
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      last = Math.round(Math.min(MAX_W, Math.max(MIN_W, drag.current.w + ev.clientX - drag.current.x)));
      setLive(last);
    };
    const up = () => {
      drag.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      actions.setFolderWidth(f.id, last);
      setLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [colouring, setColouring] = useState(false);
  const hex = colourOf(f.color);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(MATERIAL_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(MATERIAL_MIME);
        if (id) onDropMaterial(id);
      }}
      style={{ width: `min(100%, ${width}px)` }}
      className={cn("group relative flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors hover:border-foreground/20", over && "border-foreground/50 bg-accent")}
    >
      <FolderIcon className={cn("size-5 shrink-0", !hex && "text-muted-foreground")} style={hex ? { color: hex, fill: hex + "33" } : undefined} />
      <Link to={`/materials?f=${f.id}`} className="min-w-0 flex-1 rounded after:absolute after:inset-0 focus-ring">
        <span className="block truncate text-[14px] font-medium" title={f.name}>{f.name}</span>
        <span className="block text-[12px] text-muted-foreground">{count ? plural(count, "item") : "Empty"}</span>
      </Link>
      <div className="relative z-10">
        <Menu
          label={`${f.name} actions`}
          items={[
            { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
            { label: "Colour", icon: Palette, onSelect: () => setColouring(true) },
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
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to resize folders"
        title="Drag to resize"
        onPointerDown={onResizeStart}
        className="absolute -right-1.5 inset-y-0 z-20 hidden w-3 cursor-ew-resize touch-none sm:block"
      />
      {colouring && <ColourDialog f={f} onClose={() => setColouring(false)} />}
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

export function MaterialsPage() {

  const data = useData();
  const { query } = useLocation();
  const folderId = data.folders.some((f) => f.id === query.get("f")) ? query.get("f") : null;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
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
  const folders = searching ? [] : data.folders.filter((f) => (f.parentId ?? null) === folderId).sort((a, b) => a.name.localeCompare(b.name));
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = data.materials.filter((m) => (t ? `${m.title} ${m.subject} ${m.topics.map((x) => x.name).join(" ")} ${m.files.map((f) => f.name).join(" ")}`.toLowerCase().includes(t) : (m.folderId ?? null) === folderId));
    return out.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : (b.lastOpenedAt ?? b.lastStudiedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.lastStudiedAt ?? a.createdAt)));
  }, [data.materials, q, sort, folderId]);

  const countIn = (id: string) => data.materials.filter((m) => m.folderId === id).length + data.folders.filter((f) => f.parentId === id).length;
  const moveInto = (materialId: string, target: string | null) => {
    const m = data.materials.find((x) => x.id === materialId);
    if (!m || (m.folderId ?? null) === target) return;
    actions.moveMaterial(materialId, target);
    toast(target ? `Moved to ${data.folders.find((f) => f.id === target)?.name}` : "Moved to My Materials");
  };
  const selectedMaterials = data.materials.filter((m) => sel.includes(m.id));
  const empty = !folders.length && !list.length;

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
            className={cn("rounded-md px-1 focus-ring", trail.length ? "text-muted-foreground hover:text-foreground" : "", rootOver && "bg-accent")}
          >
            My Materials
          </Link>
          {trail.map((f, i) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              {i === trail.length - 1 ? (
                <h1 className="truncate px-1 text-[24px] font-semibold">{f.name}</h1>
              ) : (
                <Link to={`/materials?f=${f.id}`} className="truncate rounded-md px-1 text-muted-foreground hover:text-foreground focus-ring">
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

      {data.materials.length > 0 && (
        <div className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all materials" className="pl-9" aria-label="Search materials" />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort materials" className="w-40">
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
              <FolderTile key={f.id} f={f} count={countIn(f.id)} onDropMaterial={(id) => moveInto(id, f.id)} />
            ))}
          </div>
        </section>
      )}

      {list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <MaterialCard key={m.id} m={m} selectable={selecting} selected={sel.includes(m.id)} onSelect={(v) => setSel((s) => (v ? [...s, m.id] : s.filter((x) => x !== m.id)))} />
          ))}
        </div>
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
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-30 px-4 lg:bottom-6 lg:left-[248px]">
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
