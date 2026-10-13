import { LevelBar } from "@/components/stats/level-card";
import { Check, ChevronDown, Folder as FolderIcon, ListChecks, PenLine, Search, Upload } from "lucide-react";
import { colourHex } from "@/components/ui/colour-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PracticeView } from "@/components/practice/practice-view";
import { WrittenView } from "@/components/practice/written-view";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
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

/** The lecture chosen for written answers, kept while switching between pages. */
let keptWritten: ID | null = null;
/** The topics picked for each practice, kept while switching between pages. */
const keptTopics = new Map<string, ID[]>();

function lastMode(): Mode {
  try {
    return localStorage.getItem("slidequiz:qmode") === "written" ? "written" : "mcq";
  } catch {
    return "mcq";
  }
}

/** Practice questions from the sidebar: multiple choice or written answers, on any lectures or a whole module. */
export function QuestionsPage() {
  const data = useData();
  const { query } = useLocation();
  // Opens on whichever was used last (multiple choice or written), unless a link asks for one.
  const [mode, setModeState] = useState<Mode>(() => {
    const asked = query.get("mode");
    if (asked === "written" || asked === "mcq") return asked;
    if (query.get("m")) return "mcq";
    return lastMode();
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("slidequiz:qmode", m);
    } catch {
      /* storage blocked */
    }
    history.replaceState(null, "", `#/questions${m === "written" ? "?mode=written" : ""}`);
  };
  const [picking, setPicking] = useState(false);
  const recent = useMemo(() => [...data.materials].sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)), [data.materials]);
  // Opened from a lecture's "Practise" button (?m=lecture, optionally &t=topic): practise that lecture.
  const fromLecture = query.get("m");
  const [pick, setPickState] = useState<Pick>(() => (fromLecture && data.materials.some((x) => x.id === fromLecture) ? { ids: [fromLecture] } : (loadPick() ?? { ids: recent[0] ? [recent[0].id] : [] })));
  useEffect(() => {
    if (fromLecture && data.materials.some((x) => x.id === fromLecture)) savePick({ ids: [fromLecture] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  const startTopic = query.get("t");
  const [topics, setTopicsState] = useState<ID[]>(() => (startTopic ? [startTopic] : keptTopics.get(key) ?? []));
  const setTopics = (t: ID[]) => {
    keptTopics.set(key, t);
    setTopicsState(t);
  };
  const firstKey = useRef(key);
  useEffect(() => {
    if (firstKey.current !== key) setTopics([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [writtenFor, setWrittenForState] = useState<ID | null>(() => keptWritten);
  const setWrittenFor = (id: ID | null) => {
    keptWritten = id;
    setWrittenForState(id);
  };
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
      <PageHeader title="Questions" className="mb-4" />

      {/* Your level, filling up as you answer. */}
      <div className="mx-auto mb-4 max-w-2xl">
        <LevelBar xp={data.user.xp} />
      </div>

      {/* The two kinds of questions, and what's being practised, on one line. */}
      <div className="mx-auto mb-4 flex max-w-2xl flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border bg-card p-1" role="group" aria-label="Question type">
          {(
            [
              { m: "mcq", icon: ListChecks, title: "Multiple choice" },
              { m: "written", icon: PenLine, title: "Written" },
            ] as const
          ).map((o) => {
            const on = mode === o.m;
            return (
              <button
                key={o.m}
                type="button"
                aria-pressed={on}
                onClick={() => setMode(o.m)}
                className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-medium transition-colors focus-ring", on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                <o.icon className="size-4" />
                {o.title}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setPicking(true)} aria-label={`Practising ${label}. Change`} className="ml-auto inline-flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13.5px] font-medium transition-colors hover:border-foreground/30 focus-ring max-sm:ml-0">
          {folder && <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {mode === "written" && shown.length > 1 && (
          <Select aria-label="Lecture for written answers" value={writtenMat?.id} onChange={(e) => setWrittenFor(e.target.value)} className="h-10 w-auto max-w-full py-0 text-[13px]">
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
  const [q, setQ] = useState("");
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
  // Lectures grouped under their folders, the way they're organised in Notes.
  const t = q.trim().toLowerCase();
  const shown = mats.filter((m) => !t || `${m.title} ${m.subject}`.toLowerCase().includes(t));
  const groups = [
    ...data.folders.map((f) => ({ id: f.id, name: f.name, colour: colourHex(f.color), items: shown.filter((m) => m.folderId === f.id) })),
    { id: "none", name: data.folders.length ? "Not in a folder" : "", colour: undefined, items: shown.filter((m) => !m.folderId || !data.folders.some((f) => f.id === m.folderId)) },
  ].filter((g) => g.items.length);
  const n = picked.length;
  return (
    <Dialog
      open
      onClose={onClose}
      title="What to practise"
      size="lg"
      footer={
        <>
          {n > 0 && (
            <button type="button" onClick={() => (setPicked([]), setFolder(null))} className="mr-auto text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
              Clear
            </button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!n} onClick={() => onPick(folder ? { folderId: folder, ids: [] } : { ids: mats.map((m) => m.id).filter((id) => picked.includes(id)) })}>
            {n ? `Practise ${n} ${n === 1 ? "lecture" : "lectures"}` : "Practise"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {folders.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Whole module</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {folders.map((f) => {
                const on = folder === f.id;
                const hex = colourHex(f.color);
                const count = mats.filter((m) => m.folderId === f.id).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickFolder(f.id)}
                    className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-ring", on ? "border-foreground bg-accent" : "hover:border-foreground/25 hover:bg-accent/50")}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary" style={hex ? { backgroundColor: hex + "26" } : undefined}>
                      <FolderIcon className={cn("size-[18px]", !hex && "text-muted-foreground")} style={hex ? { color: hex, fill: hex + "33" } : undefined} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{f.name}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {count} {count === 1 ? "lecture" : "lectures"}
                      </span>
                    </span>
                    <Tick on={on} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Or pick lectures</p>
            {mats.length > 6 && (
              <div className="relative w-44">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search lectures" className="h-8 pl-8 text-[13px]" />
              </div>
            )}
          </div>
          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            {groups.map((g) => (
              <div key={g.id}>
                {g.name && (
                  <p className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: g.colour ?? "hsl(var(--muted-foreground) / 0.4)" }} />
                    {g.name}
                  </p>
                )}
                <ul className="divide-y overflow-hidden rounded-xl border">
                  {g.items.map((m) => {
                    const on = picked.includes(m.id);
                    return (
                      <li key={m.id}>
                        <button type="button" aria-pressed={on} onClick={() => toggle(m.id)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-ring", on ? "bg-accent" : "hover:bg-accent/50")}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium">{m.title}</span>
                            {m.subject && <span className="block truncate text-[12px] text-muted-foreground">{m.subject}</span>}
                          </span>
                          <Tick on={on} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!groups.length && <p className="py-6 text-center text-[13px] text-muted-foreground">No lectures match “{q}”.</p>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** A round tick that fills in when chosen. */
function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors", on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/30")}>
      {on && <Check className="size-3" strokeWidth={3.5} />}
    </span>
  );
}
