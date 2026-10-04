import { Bookmark, BookmarkCheck, ChevronDown, ChevronsDown, ChevronsUp, CircleCheck, CircleX, Lightbulb, MoreHorizontal, PencilLine, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { RichText } from "@/components/ui/rich-text";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAI, type QuestionChange } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { isSaved, topicName } from "@/store/selectors";
import { getState, useData } from "@/store/store";
import type { Answer, Question } from "@/types/models";
import { QuestionAnswerer } from "./answerer";
import { DIFFICULTY_META, KIND_META } from "./meta";
import { SourceChip } from "./source";
import { Spinner } from "@/components/ui/spinner";

export function QuestionMeta({ q, number, showMaterial }: { q: Question; number?: number; showMaterial?: boolean }) {
  const data = useData();
  const m = data.materials.find((x) => x.id === q.materialId);
  const parts = [KIND_META[q.type].label, DIFFICULTY_META[q.difficulty].label, topicName(data, q.materialId, q.topicId), showMaterial ? m?.title : null].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
      {number != null && <span className="font-medium text-foreground">{number}.</span>}
      <span>{parts.join(" · ")}</span>
      {q.sources.slice(0, 2).map((s) => (
        <SourceChip key={s.pageId} source={s} />
      ))}
    </div>
  );
}

function LastResult({ q }: { q: Question }) {
  if (!q.stats.lastResult) return null;
  const r = q.stats.lastResult;
  const Icon = r === "correct" ? CircleCheck : r === "partial" ? TriangleAlert : CircleX;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", r === "correct" ? "text-success" : r === "partial" ? "text-warning" : "text-destructive")}>
      <Icon className="size-3.5" /> {r === "correct" ? "Last: correct" : r === "partial" ? "Last: partly correct" : "Last: incorrect"}
    </span>
  );
}

export async function reviseQuestion(q: Question, change: QuestionChange) {
  const d = getState();
  const m = d.materials.find((x) => x.id === q.materialId);
  if (!m) return;
  const { pages, topics } = groundingFor([m]);
  try {
    const draft = await getAI().reviseQuestion(q, change, pages, topics);
    actions.replaceQuestion(q.id, draft);
    toast(change === "regenerate" ? "Question regenerated" : change === "easier" ? "Made easier" : "Made harder");
  } catch {
    toast.error(change === "regenerate" ? "Couldn't find a different question in the selected pages." : "Something went wrong. Try again.");
  }
}

export function ExplainDialog({ q, open, onClose }: { q: Question; open: boolean; onClose: () => void }) {
  const [state, setState] = useState<{ loading: boolean; content?: string }>({ loading: false });
  const load = async () => {
    setState({ loading: true });
    const m = getState().materials.find((x) => x.id === q.materialId);
    const { pages } = groundingFor(m ? [m] : [], { includeExcluded: true });
    try {
      const r = await getAI().explainQuestion(q, pages);
      setState({ loading: false, content: r.content });
    } catch {
      setState({ loading: false, content: "Something went wrong. Try again." });
    }
  };
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q.id]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Explanation"
      description={q.prompt}
      size="lg"
    >
      <ExplainBody q={q} state={state} />
    </Dialog>
  );
}

function ExplainBody({ q, state }: { q: Question; state: { loading: boolean; content?: string } }) {
  if (state.loading || !state.content)
    return (
      <div className="space-y-2.5 py-2" aria-busy>
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-16 w-full" />
      </div>
    );
  return (
    <div className="space-y-4">
      <RichText text={state.content} />
      <div className="flex flex-wrap gap-1.5">
        {q.sources.map((s) => (
          <SourceChip key={s.pageId} source={s} />
        ))}
      </div>
    </div>
  );
}

export function QuestionCard({ q, number, showMaterial, defaultOpen }: { q: Question; number?: number; showMaterial?: boolean; defaultOpen?: boolean }) {
  const data = useData();
  const saved = isSaved(data, q.id);
  const [open, setOpen] = useState(!!defaultOpen);
  const [answer, setAnswer] = useState<Answer | undefined>();
  const [busy, setBusy] = useState<QuestionChange | null>(null);
  const [explain, setExplain] = useState(false);

  const revise = async (c: QuestionChange) => {
    setBusy(c);
    await reviseQuestion(q, c);
    setBusy(null);
    setAnswer(undefined);
  };

  return (
    <article id={`q-${q.id}`} className={cn("group rounded-xl border bg-card", busy && "opacity-70")} aria-busy={!!busy}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2.5">
            <QuestionMeta q={q} number={number} showMaterial={showMaterial} />
            <p className="whitespace-pre-line text-[16.5px] leading-relaxed">{q.prompt}</p>
          </div>
          <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
            <Tooltip content={saved ? "Remove bookmark" : "Bookmark"}>
              <Button variant="ghost" size="icon-sm" aria-pressed={saved} aria-label={saved ? "Remove bookmark" : "Bookmark question"} onClick={() => {
                actions.toggleBookmark(q.id);
                toast(saved ? "Bookmark removed" : "Saved to bookmarks");
              }}>
                {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
              </Button>
            </Tooltip>
            <Menu
              label="Question actions"
              items={[
                { label: "Explain", icon: Lightbulb, onSelect: () => setExplain(true) },
                { label: "Regenerate", icon: RefreshCw, onSelect: () => revise("regenerate"), separatorBefore: true },
                { label: "Make easier", icon: ChevronsDown, onSelect: () => revise("easier"), disabled: q.difficulty === "easy" },
                { label: "Make harder", icon: ChevronsUp, onSelect: () => revise("harder"), disabled: q.difficulty === "hard" },
                {
                  label: "Delete",
                  icon: Trash2,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => {
                    const undo = actions.deleteQuestion(q.id);
                    toast.undo("Question deleted", undo);
                  },
                },
              ]}
              trigger={(p) => (
                <Button variant="ghost" size="icon-sm" aria-label="More actions" {...p}>
                  {busy ? <Spinner /> : <MoreHorizontal />}
                </Button>
              )}
            />
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button variant={open ? "secondary" : "outline"} size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <PencilLine /> {open ? "Hide" : "Answer"}
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExplain(true)}>
            <Lightbulb /> Explain
          </Button>
          <span className="ml-auto">
            <LastResult q={q} />
          </span>
        </div>
      </div>
      {open && (
        <div className="animate-fade-in border-t bg-subtle/60 p-4 sm:p-5">
          <QuestionAnswerer
            key={q.id + (answer ? "a" : "")}
            question={q}
            answer={answer}
            reveal
            showExplanation={data.settings.showExplanations}
            onAnswer={(a) => {
              setAnswer(a);
              if (a.selfMarked) return;
              actions.recordAnswer(a);
            }}
          />
          {answer && (
            <Button variant="link" size="sm" className="mt-3" onClick={() => setAnswer(undefined)}>
              Try again
            </Button>
          )}
        </div>
      )}
      {explain && <ExplainDialog q={q} open={explain} onClose={() => setExplain(false)} />}
    </article>
  );
}
