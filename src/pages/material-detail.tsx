import { Download, FileText, Loader2, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { useMaterialMenu } from "@/components/materials/material-card";
import { NotesView } from "@/components/notes/notes-view";
import { PracticeView } from "@/components/practice/practice-view";
import { ProgressView } from "@/components/practice/progress-view";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu } from "@/components/ui/menu";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { Link, useLocation } from "@/lib/router";
import { notesExportDoc } from "@/services/notes";
import { aiQuestionsReady, aiReady, enhanceMaterial, usesBuiltIn } from "@/services/ai/cloud";
import { buildPracticeQuestions, overallProgress, practiceSet, shuffleOptions } from "@/services/practice";
import { actions } from "@/store/actions";
import { unitWord } from "@/store/selectors";
import { useData } from "@/store/store";
import type { ID } from "@/types/models";

type Tab = "notes" | "practice" | "progress";

export function MaterialDetailPage({ id }: { id: string }) {
  const data = useData();
  const { query } = useLocation();
  const m = data.materials.find((x) => x.id === id);
  const initial = query.get("tab");
  const [tab, setTab] = useState<Tab>(initial === "practice" || initial === "progress" ? initial : "notes");
  const [topics, setTopics] = useState<ID[]>([]);
  const [exporting, setExporting] = useState(false);
  const menu = useMaterialMenu(m ?? ({} as never));

  useEffect(() => {
    if (!m) return;
    actions.touchMaterial(m.id);
    actions.setLastVisit(`/materials/${m.id}`, `${m.subject} · ${m.title}`);
    // Materials from before the notes/practice update get their questions made on first open.
    if (!practiceSet(data, m.id).length && m.pages.some((p) => p.included && p.text.trim())) buildPracticeQuestions(m.id);
    enhanceMaterial(m.id);
    // Opened from search or mixed practice: jump to that slide in the notes.
    const target = query.get("p");
    if (target)
      setTimeout(() => {
        // A slide merged into the one before it has no heading of its own, so use the nearest earlier one.
        const idx = m.pages.findIndex((p) => p.id === target);
        const el = m.pages
          .slice(0, idx + 1)
          .reverse()
          .map((p) => document.getElementById(`note-${p.id}`))
          .find(Boolean);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.classList.add("animate-flash", "rounded-lg");
      }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!m) return <EmptyState icon={FileText} title="Material not found" description="It may have been deleted." action={<Link to="/materials" className={buttonClass()}>My Materials</Link>} />;

  const prog = overallProgress(data, m);
  const included = m.pages.filter((p) => p.included).length;
  const changeTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#/materials/${m.id}?tab=${t}`);
    window.scrollTo({ top: 0 });
  };
  const openNotes = (pageId: string) => {
    changeTab("notes");
    setTimeout(() => document.getElementById(`note-${pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const count = Math.min(6, Math.max(3, data.settings.mcqOptions ?? 5));

  return (
    <div>
      <PageHeader
        back={{ to: "/materials", label: "My Materials" }}
        eyebrow={aiReady(m) || usesBuiltIn(m) ? m.subject : undefined}
        title={m.title}
        description={prog.total ? `${included} of ${m.pages.length} ${unitWord(m)} · ${prog.total} questions · ${prog.pct}% covered` : `${included} of ${m.pages.length} ${unitWord(m)}`}
        actions={
          <>
            <Menu
              label="Material actions"
              items={[{ label: "Export", icon: Download, onSelect: () => setExporting(true) }, ...menu.items.filter((x) => ["Rename", "Move to folder", "Delete"].includes(x.label))]}
              trigger={(p) => (
                <Button variant="ghost" size="icon" aria-label="More actions" {...p}>
                  <MoreHorizontal />
                </Button>
              )}
            />
          </>
        }
        className="mb-4 sm:mb-5"
      />
      {m.ai?.status === "working" && aiReady(m) && !aiQuestionsReady(m) && (
        <p className="-mt-2 mb-4 flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" /> Writing your practice questions…
        </p>
      )}
      <Tabs
        idPrefix="mat"
        className="mb-6"
        value={tab}
        onChange={changeTab}
        items={[
          { value: "notes", label: "Notes" },
          { value: "practice", label: "Practice", count: prog.total || undefined },
          { value: "progress", label: "Progress" },
        ]}
      />
      <div {...tabPanelProps("mat", tab)}>
        {tab === "notes" && <NotesView material={m} />}
        {tab === "practice" && <PracticeView material={m} topicIds={topics} onTopicsChange={setTopics} onOpenNotes={openNotes} />}
        {tab === "progress" && (
          <ProgressView
            material={m}
            onPractise={(t) => {
              setTopics(t ? [t] : []);
              changeTab("practice");
            }}
          />
        )}
      </div>


      {exporting && (
        <ExportDialog
          open
          onClose={() => setExporting(false)}
          title={m.title}
          notes={notesExportDoc(m)}
          questions={practiceSet(data, m.id).map((q) => {
            const v = shuffleOptions(q, count);
            return { ...q, pool: false, options: v.options, correctIndex: v.correct };
          })}
        />
      )}
      {menu.dialogs}
    </div>
  );
}
