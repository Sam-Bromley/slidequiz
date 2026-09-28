import { Braces, Copy, FileCode, FileDown, FileText, FileType, Globe, Printer, Table } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn, inArtifactHost, plural } from "@/lib/utils";
import { exportDoc, flashcardsCsv, flashcardsDoc, questionsCsv, questionsDoc, summaryDocument, toPlainText, type ExportDoc, type ExportFormat } from "@/services/export";
import { topicName } from "@/store/selectors";
import { getState } from "@/store/store";
import type { Flashcard, Question, SummaryDoc } from "@/types/models";

type Content = "questions" | "flashcards" | "summary";

export function ExportDialog({ open, onClose, title, questions, flashcards, summary }: { open: boolean; onClose: () => void; title: string; questions?: Question[]; flashcards?: Flashcard[]; summary?: SummaryDoc }) {
  const available: Content[] = [questions?.length ? "questions" : null, flashcards?.length ? "flashcards" : null, summary ? "summary" : null].filter(Boolean) as Content[];
  const [content, setContent] = useState<Content>(available[0] ?? "questions");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [answers, setAnswers] = useState(true);
  const [explanations, setExplanations] = useState(false);
  const [worksheet, setWorksheet] = useState(false);
  const [keyAtEnd, setKeyAtEnd] = useState(true);
  const [busy, setBusy] = useState(false);

  const build = (): { doc: ExportDoc; csv?: string; json?: unknown } => {
    const d = getState();
    if (content === "flashcards" && flashcards) return { doc: flashcardsDoc(`${title} flashcards`, flashcards), csv: flashcardsCsv(flashcards), json: flashcards.map((c) => ({ front: c.front, back: c.back, source: c.source?.label })) };
    if (content === "summary" && summary) return { doc: summaryDocument(`${title} summary`, summary), json: summary };
    return {
      csv: questionsCsv(questions ?? []),
      json: (questions ?? []).map(({ id, type, difficulty, prompt, options, correctIndex, pairs, answer, explanation, sources }) => ({ id, type, difficulty, prompt, options, correctIndex, pairs, answer, explanation, sources: sources.map((x) => x.label) })),
      doc: questionsDoc(questions ?? [], { title: worksheet ? `${title} worksheet` : title, includeAnswers: answers, includeExplanations: explanations, worksheet, answerKeyAtEnd: keyAtEnd }, (q) => topicName(d, q.materialId, q.topicId)),
    };
  };

  const run = async () => {
    setBusy(true);
    try {
      const { doc, csv, json } = build();
      await exportDoc(doc, format, { csv, json });
      toast(format === "print" ? "Opening print view" : `${formats.find((f) => f.value === format)?.label} file ready`, { description: format === "print" ? "Choose “Save as PDF” to keep a copy." : undefined });
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const text = toPlainText(build().doc);
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  const formats: { value: ExportFormat; label: string; icon: typeof FileText; hint: string }[] = [
    { value: "pdf", label: "PDF", icon: FileDown, hint: "Print-ready document" },
    { value: "docx", label: "Word", icon: FileText, hint: "Editable .docx" },
    { value: "txt", label: "Text", icon: FileType, hint: "Plain .txt file" },
    { value: "md", label: "Markdown", icon: FileCode, hint: "For Notion, Obsidian" },
    { value: "html", label: "Web page", icon: Globe, hint: "Opens in any browser" },
    ...(content !== "summary" ? [{ value: "csv" as const, label: "CSV", icon: Table, hint: content === "flashcards" ? "Anki, Quizlet, Excel" : "Excel, Google Sheets" }] : []),
    { value: "json", label: "JSON", icon: Braces, hint: "Raw data" },
    ...(inArtifactHost() ? [] : [{ value: "print" as const, label: "Print", icon: Printer, hint: "Printable worksheet" }]),
  ];

  const count = content === "questions" ? plural(questions?.length ?? 0, "question") : content === "flashcards" ? plural(flashcards?.length ?? 0, "flashcard") : "Summary";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export"
      description={`${title} · ${count}`}
      footer={
        <>
          <Button variant="ghost" onClick={copy} className="mr-auto">
            <Copy /> Copy as text
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={run} loading={busy}>
            Export {formats.find((f) => f.value === format)?.label}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {available.length > 1 && (
          <Segmented label="What to export" value={content} onChange={(c) => { setContent(c); if (c === "summary" && format === "csv") setFormat("pdf"); }} options={available.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))} />
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Format">
          {formats.map((f) => (
            <button key={f.value} role="radio" aria-checked={format === f.value} onClick={() => setFormat(f.value)} className={cn("flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors focus-ring", format === f.value ? "border-primary bg-primary-soft/70 ring-1 ring-primary" : "hover:bg-accent")}>
              <f.icon className={cn("size-[18px]", format === f.value ? "text-primary" : "text-muted-foreground")} />
              <span>
                <span className="block text-[13.5px] font-semibold">{f.label}</span>
                <span className="block text-[11.5px] leading-snug text-muted-foreground">{f.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {content === "questions" && (
          <ul className="divide-y rounded-xl border">
            {[
              ["Worksheet layout", "Adds answer lines and a name/date header", worksheet, setWorksheet],
              ["Include answers", "Model answers and correct options", answers, setAnswers],
              ["Answer key at the end", "Keeps the questions clean for practice", keyAtEnd, setKeyAtEnd],
              ["Include explanations", "Why each answer is right", explanations, setExplanations],
            ].map(([label, hint, val, set]) => (
              <li key={label as string} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block text-[13.5px] font-medium">{label as string}</span>
                  <span className="block text-[12px] text-muted-foreground">{hint as string}</span>
                </span>
                <Switch checked={val as boolean} onChange={set as (v: boolean) => void} label={label as string} disabled={(label === "Answer key at the end" || label === "Include explanations") && !answers} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
