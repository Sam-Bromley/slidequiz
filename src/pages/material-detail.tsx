import { CalendarDays, Download, Timer, FileText, Layers, ListChecks, MessageSquare, MoreHorizontal, Play, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { materialStatsLine, MaterialIcon, useMaterialMenu } from "@/components/materials/material-card";
import { PagePicker } from "@/components/materials/page-picker";
import { QuestionCard } from "@/components/questions/question-card";
import { startQuickStudy, startQuiz } from "@/components/quiz/start";
import { StatusPill } from "@/components/study/widgets";
import { SummaryView } from "@/components/summary/summary-view";
import { ChatPanel } from "@/components/tutor/chat-panel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu } from "@/components/ui/menu";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { Link, navigate, useLocation } from "@/lib/router";
import { openQuizSetup } from "@/lib/ui";
import { daysBetween, formatBytes, formatDate, pct, plural, relativeTime } from "@/lib/utils";
import { FILE_TYPE_LABEL, retopic } from "@/services/parsing";
import { topicStats } from "@/services/study/analytics";
import { isDue, isMastered, isNew } from "@/services/study/srs";
import { actions } from "@/store/actions";
import { materialCounts, unitWord } from "@/store/selectors";
import { getState, useData } from "@/store/store";

type Tab = "overview" | "content" | "questions" | "flashcards" | "summary" | "ask";

export function MaterialDetailPage({ id }: { id: string }) {
  const data = useData();
  const { query } = useLocation();
  const m = data.materials.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>((query.get("tab") as Tab) || "overview");
  const [exporting, setExporting] = useState(false);
  const focusPage = query.get("page");

  useEffect(() => {
    if (!m) return;
    actions.touchMaterial(m.id);
    actions.setLastVisit(`/materials/${m.id}`, `${m.subject} · ${m.title}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (focusPage) setTimeout(() => document.getElementById(`page-${focusPage}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 200);
  }, [focusPage]);

  const menu = useMaterialMenu(m ?? ({} as never));
  if (!m) return <EmptyState icon={FileText} title="Material not found" description="It may have been deleted." action={<Link to="/materials" className={buttonClass()}>My Materials</Link>} />;

  const c = materialCounts(data, m);
  const questions = data.questions.filter((q) => q.materialId === m.id);
  const cards = data.flashcards.filter((x) => x.materialId === m.id);
  const stats = topicStats(data).filter((t) => t.materialId === m.id);
  const changeTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#/materials/${m.id}?tab=${t}`);
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/materials", label: "My Materials" }}
        eyebrow={m.subject}
        title={m.title}
        description={materialStatsLine(m, c)}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/generate?m=${m.id}`)}>
              <SquarePen /> Make questions
            </Button>
            <Button variant="outline" onClick={() => setExporting(true)} disabled={!questions.length && !cards.length && !data.summaries[m.id]}>
              <Download /> Export
            </Button>
            <Button variant="outline" onClick={() => openQuizSetup({ materialIds: [m.id] })} disabled={!questions.length}>
              <Timer /> Quiz
            </Button>
            <Button onClick={() => startQuickStudy([m.id])} disabled={!questions.length}>
              <Play /> Study now
            </Button>
            <Menu
              label="Material actions"
              items={menu.items.slice(4)}
              trigger={(p) => <Button variant="ghost" size="icon" aria-label="More actions" {...p}><MoreHorizontal /></Button>}
            />
          </>
        }
        className="mb-4 sm:mb-5"
      />
      <Tabs
        idPrefix="mat"
        className="mb-6"
        value={tab}
        onChange={changeTab}
        items={[
          { value: "overview", label: "Overview" },
          { value: "content", label: `${m.unit[0].toUpperCase()}${m.unit.slice(1)}`, count: c.included },
          { value: "questions", label: "Questions", count: questions.length },
          { value: "flashcards", label: "Flashcards", count: cards.length },
          { value: "summary", label: "Summary" },
          { value: "ask", label: "Ask your notes" },
        ]}
      />

      <div {...tabPanelProps("mat", tab)}>
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Topics</h2>
                <button className="text-[13px] font-medium text-primary hover:underline" onClick={() => changeTab("content")}>
                  Using {c.included} of {c.pages} {unitWord(m)}
                </button>
              </div>
              <ul className="divide-y">
                {m.topics.map((t) => {
                  const st = stats.find((s) => s.topicId === t.id);
                  const inc = m.pages.filter((p) => t.pageIds.includes(p.id) && p.included).length;
                  const first = m.pages.find((p) => p.id === t.pageIds[0]);
                  const last = m.pages.find((p) => p.id === t.pageIds[t.pageIds.length - 1]);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium">{t.name}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {first && last && first !== last ? `${first.label}–${last.index}` : first?.label} · {inc ? `${inc} included` : "excluded"}
                          {st?.mastery != null && ` · ${pct(st.mastery)} mastery`}
                        </p>
                      </div>
                      {st && inc > 0 ? <StatusPill status={st.status} /> : <Badge tone="outline">Excluded</Badge>}
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="space-y-4">
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-[15px] font-semibold">Study this material</h2>
                <div className="grid gap-2">
                  <Button variant="outline" className="justify-start" onClick={() => startQuickStudy([m.id])} disabled={!questions.length}><Play /> Quick study · 10 questions</Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(`/flashcards/review?m=${m.id}`)} disabled={!cards.length}><Layers /> Review flashcards</Button>
                  <Button variant="outline" className="justify-start" onClick={() => changeTab("summary")}><FileText /> Read the summary</Button>
                  <Button variant="outline" className="justify-start" onClick={() => changeTab("ask")}><MessageSquare /> Ask your notes</Button>
                </div>
              </section>
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-[15px] font-semibold">Files</h2>
                <ul className="space-y-2.5">
                  {m.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3">
                      <MaterialIcon m={m} className="size-9" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{f.name}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {FILE_TYPE_LABEL[f.type]} · {formatBytes(f.size)} · {plural(f.pageCount, unitWord(m, 1))} · uploaded {relativeTime(f.uploadedAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {(m.examDate || m.course) && (
                  <p className="mt-4 flex items-center gap-2 border-t pt-3 text-[13px] text-muted-foreground">
                    <CalendarDays className="size-4" />
                    {m.course}
                    {m.examDate && ` · Exam ${formatDate(m.examDate)} (${plural(Math.max(0, daysBetween(new Date(), new Date(m.examDate))), "day")})`}
                  </p>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === "content" && (
          <PagePicker
            material={m}
            focusPageId={focusPage}
            onToggle={(ids, inc) => actions.setPagesIncluded(m.id, ids, inc)}
            onSetText={(pid, text) => {
              actions.setPageText(m.id, pid, text);
              const cur = getState().materials.find((x) => x.id === m.id)!;
              actions.updateMaterial(m.id, { topics: retopic(cur).topics, pages: retopic(cur).pages });
            }}
          />
        )}

        {tab === "questions" &&
          (questions.length ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-muted-foreground">{plural(questions.length, "question")} · {questions.filter((q) => q.stats.attempts).length} answered</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/generate?m=${m.id}`)}><SquarePen /> Generate more</Button>
                  <Button size="sm" onClick={() => startQuiz({ title: `${m.title}: all questions`, questionIds: questions.map((q) => q.id), origin: "practice" })}><ListChecks /> Practise all</Button>
                </div>
              </div>
              {questions.map((q, i) => <QuestionCard key={q.id} q={q} number={i + 1} />)}
            </div>
          ) : (
            <EmptyState icon={ListChecks} title="Generate your first questions from your study material." action={<Button onClick={() => navigate(`/generate?m=${m.id}`)}><SquarePen /> Generate questions</Button>} />
          ))}

        {tab === "flashcards" &&
          (cards.length ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
                <p className="text-[14px]">
                  <span className="font-semibold">{plural(cards.length, "card")}</span>
                  <span className="text-muted-foreground"> · {cards.filter((x) => !isNew(x) && isDue(x)).length} due · {cards.filter(isMastered).length} mastered · {cards.filter(isNew).length} new</span>
                </p>
                <Button onClick={() => navigate(`/flashcards/review?m=${m.id}`)}><Layers /> Review now</Button>
              </div>
              <ul className="grid gap-2.5 md:grid-cols-2">
                {cards.map((x) => (
                  <li key={x.id} className="rounded-xl border bg-card p-4">
                    <p className="text-[14px] font-semibold">{x.front}</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">{x.back}</p>
                    {x.source && <p className="mt-2 text-[11px] text-muted-foreground">{x.source.label}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={Layers} title="No flashcards yet" action={<Button onClick={() => navigate(`/generate?m=${m.id}`)}><SquarePen /> Generate flashcards</Button>} />
          ))}

        {tab === "summary" && <SummaryView material={m} />}
        {tab === "ask" && <ChatPanel material={m} />}
      </div>
      {exporting && <ExportDialog open onClose={() => setExporting(false)} title={m.title} questions={questions} flashcards={cards} summary={data.summaries[m.id]} />}
      {menu.dialogs}
    </div>
  );
}
