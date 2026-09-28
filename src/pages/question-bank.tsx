import { Bookmark, Download, FilterX, ListChecks, Play, Search, SlidersHorizontal, SquarePen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { DIFFICULTY_META, KIND_META, QUESTION_TYPES } from "@/components/questions/meta";
import { QuestionCard } from "@/components/questions/question-card";
import { startQuiz } from "@/components/quiz/start";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Link, useLocation } from "@/lib/router";
import { cn, plural } from "@/lib/utils";
import { isSaved } from "@/store/selectors";
import { useData } from "@/store/store";

type Result = "all" | "correct" | "incorrect" | "unanswered";

export function QuestionBankPage() {
  const data = useData();
  const { query } = useLocation();
  const focusId = query.get("q");
  const [search, setSearch] = useState("");
  const [material, setMaterial] = useState<string>(query.get("m")?.includes(",") ? "all" : query.get("m") ?? "all");
  const [topic, setTopic] = useState<string>(query.get("t") ?? "all");
  const [type, setType] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [result, setResult] = useState<Result>("all");
  const [saved, setSaved] = useState(query.get("saved") === "1");
  const [limit, setLimit] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const multi = query.get("m")?.includes(",") ? query.get("m")!.split(",") : null;

  const topics = data.materials.filter((m) => material === "all" || m.id === material).flatMap((m) => m.topics.map((t) => ({ ...t, m: m.title })));

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.questions.filter((q) => {
      if (focusId && q.id === focusId) return true;
      if (multi && !multi.includes(q.materialId)) return false;
      if (material !== "all" && q.materialId !== material) return false;
      if (topic !== "all" && q.topicId !== topic) return false;
      if (type !== "all" && q.type !== type) return false;
      if (difficulty !== "all" && q.difficulty !== difficulty) return false;
      if (saved && !isSaved(data, q.id)) return false;
      if (result === "correct" && q.stats.lastResult !== "correct") return false;
      if (result === "incorrect" && !(q.stats.lastResult === "incorrect" || q.stats.lastResult === "partial")) return false;
      if (result === "unanswered" && q.stats.attempts > 0) return false;
      if (s && !`${q.prompt} ${q.answer} ${q.options?.join(" ") ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [data, search, material, topic, type, difficulty, result, saved, focusId, multi]);

  useEffect(() => {
    if (focusId) setTimeout(() => document.getElementById(`q-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }, [focusId]);
  useEffect(() => setLimit(20), [search, material, topic, type, difficulty, result, saved]);

  const activeFilters = [material !== "all", topic !== "all", type !== "all", difficulty !== "all", result !== "all", saved].filter(Boolean).length;
  const clear = () => {
    setMaterial("all");
    setTopic("all");
    setType("all");
    setDifficulty("all");
    setResult("all");
    setSaved(false);
    setSearch("");
  };

  if (!data.questions.length)
    return (
      <div>
        <PageHeader title="Question Bank" />
        <EmptyState icon={ListChecks} title="Generate your first questions from your study material." description="Every question you create is saved here, searchable by topic, type and difficulty." action={<Link to="/materials" className={buttonClass()}><SquarePen /> Choose material</Link>} />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description={`${plural(data.questions.length, "question")} across ${plural(data.materials.length, "material")}. ${data.saved.length} bookmarked.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setExporting(true)} disabled={!list.length}>
              <Download /> Export
            </Button>
            <Button onClick={() => startQuiz({ title: "Question Bank practice", questionIds: list.slice(0, 30).map((q) => q.id), origin: "practice" })} disabled={!list.length}>
              <Play /> Practise {list.length > 30 ? "30" : list.length}
            </Button>
          </>
        }
      />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions and answers" className="pl-9" aria-label="Search questions" />
        </div>
        <Button variant={saved ? "subtle" : "outline"} aria-pressed={saved} onClick={() => setSaved((s) => !s)}>
          <Bookmark className={cn(saved && "fill-current")} /> <span className="hidden sm:inline">Bookmarked</span>
        </Button>
        <Button variant="outline" className="lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-label="Filters">
          <SlidersHorizontal /> {activeFilters > 0 && <span className="rounded bg-primary px-1.5 text-[11px] text-primary-foreground">{activeFilters}</span>}
        </Button>
      </div>

      <div className={cn("mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5", !showFilters && "hidden lg:grid")}>
        <Select aria-label="Material" value={material} onChange={(e) => { setMaterial(e.target.value); setTopic("all"); }}>
          <option value="all">All materials</option>
          {data.materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </Select>
        <Select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="all">All topics</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select aria-label="Question type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{KIND_META[t].label}</option>)}
        </Select>
        <Select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="all">All difficulties</option>
          {(["easy", "medium", "hard"] as const).map((d) => <option key={d} value={d}>{DIFFICULTY_META[d].label}</option>)}
        </Select>
        <Select aria-label="Result" value={result} onChange={(e) => setResult(e.target.value as Result)}>
          <option value="all">Any result</option>
          <option value="correct">Answered correctly</option>
          <option value="incorrect">Answered incorrectly</option>
          <option value="unanswered">Not answered yet</option>
        </Select>
      </div>

      <div className="mb-3 flex items-center justify-between text-[13px] text-muted-foreground" aria-live="polite">
        <span>{plural(list.length, "question")}{multi ? " from your new set" : ""}</span>
        {(activeFilters > 0 || search) && (
          <button onClick={clear} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
            <FilterX className="size-3.5" /> Clear filters
          </button>
        )}
      </div>

      {list.length ? (
        <div className="space-y-3">
          {list.slice(0, limit).map((q, i) => (
            <QuestionCard key={q.id} q={q} number={i + 1} showMaterial={material === "all"} defaultOpen={q.id === focusId} />
          ))}
          {list.length > limit && (
            <div className="pt-2 text-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + 20)}>Show {Math.min(20, list.length - limit)} more</Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={Search} title="No questions match these filters" description={saved ? "You haven't bookmarked any questions like this yet." : "Try removing a filter or searching for something else."} action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
      )}
      {exporting && <ExportDialog open onClose={() => setExporting(false)} title={material !== "all" ? data.materials.find((m) => m.id === material)?.title ?? "Questions" : "SlideQuiz questions"} questions={list} />}
    </div>
  );
}
