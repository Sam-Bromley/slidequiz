import { ChevronDown, Folder as FolderIcon, ListChecks, PenLine, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PracticeView } from "@/components/practice/practice-view";
import { WrittenView } from "@/components/practice/written-view";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Link, navigate, useLocation } from "@/lib/router";
import { cn } from "@/lib/utils";
import { buildPracticeQuestions, practiceSet } from "@/services/practice";
import { useData } from "@/store/store";
import type { ID, Material } from "@/types/models";

type Mode = "mcq" | "written";
type Pick = { folderId?: ID; ids: ID[] };
const PICK_KEY = "slidequiz:questions-pick";

const loadPick = (): Pick | null => {
  try {
    const p = JSON.parse(localStorage.getItem(PICK_KEY) ?? "null");
    return p && Array.isArray(p.ids) ? p : null;
  } catch {
    return null;
  }
};
const savePick = (p: Pick) => {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
};

/** Practice questions from the sidebar: multiple choice or written answers, on any lectures or a whole module. */
export function QuestionsPage() {
  const data = useData();
  const { query } = useLocation();
  const [mode, setModeState] = useState<Mode>(query.get("mode") === "written" ? "written" : "mcq");
  const setMode = (m: Mode) => {
    setModeState(m);
    history.replaceState(null, "", `#/questions${m === "written" ? "?mode=written" : ""}`);
  };
  const [picking, setPicking] = useState(false);
  const recent = useMemo(() => [...data.materials].sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)), [data.materials]);
  const [pick, setPickState] = useState<Pick>(() => loadPick() ?? { ids: recent[0] ? [recent[0].id] : [] });
  const setPick = (p: Pick) => {
    setPickState(p);
    savePick(p);
  };

  // Lectures that still exist (a folder pick follows the folder as lectures are added to it).
  const folder = pick.folderId ? data.folders.find((f) => f.id === pick.folderId) : undefined;
  const mats: Material[] = folder ? data.materials.filter((m) => m.folderId === folder.id) : pick.ids.map((id) => data.materials.find((m) => m.id === id)).filter((m): m is Material => !!m);
  const fallback = !mats.length && recent[0] ? [recent[0]] : [];
  const shown = mats.length ? mats : fallback;
  const label = folder ? folder.name : shown.length === 1 ? shown[0].title : `${shown.length} lectures`;

  // Older lectures may not have their questions yet.
  const key = shown.map((m) => m.id).join(",");
  useEffect(() => {
    for (const m of shown) if (!practiceSet(data, m.id).length && m.pages.some((p) => p.included && p.text.trim())) buildPracticeQuestions(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [topics, setTopics] = useState<ID[]>([]);
  useEffect(() => setTopics([]), [key]);
  const [writtenFor, setWrittenFor] = useState<ID | null>(null);
  const writtenMat = shown.find((m) => m.id === writtenFor) ?? shown[0];

  if (!data.materials.length)
    return (
      <div>
        <PageHeader title="Questions" />
        <EmptyState
          icon={ListChecks}
          title="No lectures yet"
          description="Add your slides and your practice questions are made from them."
          action={
            <Link to="/upload" className={buttonClass()}>
              <Upload /> Add material
            </Link>
          }
        />
      </div>
    );

  const combined: Material | null = shown.length > 1 ? { ...shown[0], id: `mix-${key}`, title: label, pages: shown.flatMap((m) => m.pages), topics: [] } : null;

  return (
    <div>
      <PageHeader title="Questions" className="mb-5" />

      {/* The two kinds of questions */}
      <div className="mx-auto mb-5 grid max-w-2xl grid-cols-2 gap-2.5" role="group" aria-label="Question type">
        {(
          [
            { m: "mcq", icon: ListChecks, title: "Multiple choice", sub: "Pick the right answer" },
            { m: "written", icon: PenLine, title: "Written answers", sub: "Type it, get it marked" },
          ] as const
        ).map((o) => {
          const on = mode === o.m;
          return (
            <button
              key={o.m}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(o.m)}
              className={cn("flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition-colors focus-ring sm:gap-3 sm:px-4 sm:py-3.5", on ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30")}
            >
              <span className={cn("hidden size-9 shrink-0 place-items-center rounded-xl sm:grid", on ? "bg-background/15" : "bg-secondary")}>
                <o.icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold leading-tight sm:text-[14.5px]">
                  <o.icon className="size-4 shrink-0 sm:hidden" />
                  {o.title}
                </span>
                <span className={cn("hidden truncate text-[12.5px] sm:block", on ? "text-background/70" : "text-muted-foreground")}>{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* What's being practised */}
      <div className="mx-auto mb-5 flex max-w-2xl flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Practising</span>
        <button type="button" onClick={() => setPicking(true)} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium transition-colors hover:border-foreground/30 focus-ring">
          {folder && <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {mode === "written" && shown.length > 1 && (
          <Select aria-label="Lecture for written answers" value={writtenMat?.id} onChange={(e) => setWrittenFor(e.target.value)} className="h-8 w-auto max-w-full py-0 text-[13px]">
            {shown.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        )}
      </div>

      {mode === "mcq" ? (
        combined ? (
          <PracticeView key={combined.id} material={combined} mixed={shown} topicIds={topics} onTopicsChange={setTopics} onOpenNotes={(pageId, mid) => navigate(`/materials/${mid}?p=${pageId}`)} />
        ) : (
          shown[0] && <PracticeView key={shown[0].id} material={shown[0]} topicIds={topics} onTopicsChange={setTopics} onOpenNotes={(pageId, mid) => navigate(`/materials/${mid}?p=${pageId}`)} />
        )
      ) : (
        writtenMat && <WrittenView key={writtenMat.id} material={writtenMat} />
      )}

      {picking && <PickDialog current={pick} onClose={() => setPicking(false)} onPick={(p) => (setPick(p), setWrittenFor(null), setPicking(false))} />}
    </div>
  );
}

/** Choose a module folder or any lectures. */
function PickDialog({ current, onClose, onPick }: { current: Pick; onClose: () => void; onPick: (p: Pick) => void }) {
  const data = useData();
  const mats = data.materials;
  const [folder, setFolder] = useState<ID | null>(current.folderId ?? null);
  const [picked, setPicked] = useState<ID[]>(current.folderId ? mats.filter((m) => m.folderId === current.folderId).map((m) => m.id) : current.ids);
  const folders = data.folders.filter((f) => mats.some((m) => m.folderId === f.id));
  const toggle = (id: ID) => {
    setFolder(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const pickFolder = (fid: ID) => {
    const on = folder === fid;
    setFolder(on ? null : fid);
    setPicked(on ? [] : mats.filter((m) => m.folderId === fid).map((m) => m.id));
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="What to practise"
      description="A whole module folder, or any lectures."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked.length} onClick={() => onPick(folder ? { folderId: folder, ids: [] } : { ids: mats.map((m) => m.id).filter((id) => picked.includes(id)) })}>
            Practise
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {folders.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Folders</p>
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => {
                const on = folder === f.id;
                return (
                  <button key={f.id} type="button" aria-pressed={on} onClick={() => pickFolder(f.id)} className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors focus-ring", on ? "border-primary bg-primary-soft text-primary" : "hover:bg-accent")}>
                    <FolderIcon className="size-4" /> {f.name} <span className="text-muted-foreground">{mats.filter((m) => m.folderId === f.id).length}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Lectures</p>
          <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
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
    </Dialog>
  );
}
