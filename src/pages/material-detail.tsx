import { Download, FileText, Layers, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { useMaterialMenu } from "@/components/materials/material-card";
import { SlideChooser } from "@/components/materials/slide-chooser";
import { NotesView } from "@/components/notes/notes-view";
import { PracticeView } from "@/components/practice/practice-view";
import { ProgressView } from "@/components/practice/progress-view";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu } from "@/components/ui/menu";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Link, useLocation } from "@/lib/router";
import { notesExportDoc } from "@/services/notes";
import { buildPracticeQuestions, overallProgress, practiceSet, shuffleOptions } from "@/services/practice";
import { actions } from "@/store/actions";
import { unitWord } from "@/store/selectors";
import { useData } from "@/store/store";
import type { ID, Material } from "@/types/models";

type Tab = "notes" | "practice" | "progress";

export function MaterialDetailPage({ id }: { id: string }) {
  const data = useData();
  const { query } = useLocation();
  const m = data.materials.find((x) => x.id === id);
  const initial = query.get("tab");
  const [tab, setTab] = useState<Tab>(initial === "practice" || initial === "progress" ? initial : "notes");
  const [topics, setTopics] = useState<ID[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [draft, setDraft] = useState<Material | null>(null);
  const [exporting, setExporting] = useState(false);
  const menu = useMaterialMenu(m ?? ({} as never));

  useEffect(() => {
    if (!m) return;
    actions.touchMaterial(m.id);
    actions.setLastVisit(`/materials/${m.id}`, `${m.subject} · ${m.title}`);
    // Materials from before the notes/practice update get their questions made on first open.
    if (!practiceSet(data, m.id).length && m.pages.some((p) => p.included && p.text.trim())) buildPracticeQuestions(m.id);
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
  const saveChoice = async () => {
    if (!draft) return;
    if (!draft.pages.some((p) => p.included)) {
      toast.error(`Choose at least one ${unitWord(m, 1)}`);
      return;
    }
    actions.updateMaterial(m.id, { pages: draft.pages, topics: draft.topics });
    setChoosing(false);
    await buildPracticeQuestions(m.id);
    toast("Notes and questions updated");
  };
  const count = Math.min(6, Math.max(3, data.settings.mcqOptions ?? 5));

  return (
    <div>
      <PageHeader
        back={{ to: "/materials", label: "My Materials" }}
        eyebrow={m.subject}
        title={m.title}
        description={`${included} of ${m.pages.length} ${unitWord(m)} · ${prog.total} questions · ${prog.pct}% covered`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(m);
                setChoosing(true);
              }}
            >
              <Layers /> Choose {unitWord(m)}
            </Button>
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

      {choosing && draft && (
        <Dialog
          open
          onClose={() => setChoosing(false)}
          title={`Choose ${unitWord(m)} and images`}
          description="Your notes and questions update to match. Progress on questions that stay is kept."
          size="xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setChoosing(false)}>
                Cancel
              </Button>
              <Button onClick={saveChoice}>Save</Button>
            </>
          }
        >
          <SlideChooser material={draft} onChange={setDraft} />
        </Dialog>
      )}

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
