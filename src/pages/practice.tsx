import { Folder as FolderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PracticeView } from "@/components/practice/practice-view";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link, navigate, useLocation } from "@/lib/router";
import { examLabel, materialsIn } from "@/services/folders";
import { buildPracticeQuestions, practiceSet } from "@/services/practice";
import { useData } from "@/store/store";
import type { ID, Material } from "@/types/models";

/** Practice questions from every material in a folder, mixed together. */
export function MixedPracticePage() {
  const data = useData();
  const { query } = useLocation();
  const folder = data.folders.find((f) => f.id === query.get("f"));
  const mats = folder ? materialsIn(data, folder.id) : [];
  const [picked, setPicked] = useState<ID[]>([]);

  // Older materials may not have their questions yet.
  useEffect(() => {
    for (const m of mats) if (!practiceSet(data, m.id).length && m.pages.some((p) => p.included && p.text.trim())) buildPracticeQuestions(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder?.id]);

  if (!folder)
    return <EmptyState icon={FolderIcon} title="Folder not found" description="It may have been deleted." action={<Link to="/materials" className={buttonClass()}>My Materials</Link>} />;

  // A stand-in material so the practice screen can look up slides from any of them.
  const combined: Material = { ...mats[0], id: `folder-${folder.id}`, title: folder.name, pages: mats.flatMap((m) => m.pages), topics: [] };
  const exam = examLabel(folder.examDate);

  return (
    <div>
      <PageHeader back={{ to: `/materials?f=${folder.id}`, label: folder.name }} title={`Practise ${folder.name}`} description={[`${mats.length} material${mats.length === 1 ? "" : "s"}`, exam].filter(Boolean).join(" · ")} className="mb-5" />
      {mats.length ? (
        <PracticeView material={combined} mixed={mats} topicIds={picked} onTopicsChange={setPicked} onOpenNotes={(pageId, mid) => navigate(`/materials/${mid}?p=${pageId}`)} />
      ) : (
        <EmptyState icon={FolderIcon} title="This folder is empty" description="Add some material to it first." />
      )}
    </div>
  );
}
