import { AlertCircle, ClipboardPaste, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { takeUpload } from "@/lib/handoff";
import { navigate, useLocation } from "@/lib/router";
import { cn, formatBytes, uid } from "@/lib/utils";
import { ACCEPT_ATTR, buildMaterial, detectType, FILE_TYPE_LABEL, ParseError, parseFile, parsePastedText, validateFile } from "@/services/parsing";
import { buildPracticeQuestions } from "@/services/practice";
import { persistPendingImages } from "@/services/storage/images";
import { enhanceMaterial } from "@/services/ai/cloud";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";
import type { Material } from "@/types/models";

interface Item {
  id: string;
  name: string;
  size: number;
  status: "reading" | "ready" | "error";
  progress: number;
  label: string;
  error?: string;
  material?: Material;
}

/** "Reading page 12 of 80 · about 20 seconds left", once there's enough to estimate from. */
function withTimeLeft(label: string, done: number, elapsedMs: number) {
  if (done < 0.08 || done >= 0.98 || elapsedMs < 2000) return label;
  const left = Math.round(((elapsedMs / done) * (1 - done)) / 1000);
  if (left < 3) return `${label} · almost done`;
  return `${label} · about ${left < 60 ? `${Math.max(5, Math.round(left / 5) * 5)} seconds` : `${Math.round(left / 60)} minute${Math.round(left / 60) === 1 ? "" : "s"}`} left`;
}

export function UploadPage() {
  const { query } = useLocation();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const process = async (file: File, id: string) => {
    const v = validateFile(file);
    if (!v.ok) {
      patch(id, { status: "error", error: v.error, progress: 0 });
      return;
    }
    try {
      const started = Date.now();
      const doc = await parseFile(file, (f, label) => patch(id, { progress: f, label: withTimeLeft(label ?? "Reading…", f, Date.now() - started) }));
      const material = buildMaterial(doc, file);
      patch(id, { status: "ready", progress: 1, label: `${doc.pages.length} ${doc.unit}`, material });
    } catch (e) {
      patch(id, { status: "error", progress: 0, error: e instanceof ParseError ? e.userMessage : "Something went wrong reading this file. Try again." });
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const newItems: Item[] = list.map((f) => ({ id: uid("up"), name: f.name, size: f.size, status: "reading", progress: 0.02, label: detectType(f.name) ? `Reading ${FILE_TYPE_LABEL[detectType(f.name)!]}…` : "Reading…" }));
    setItems((xs) => [...xs, ...newItems]);
    newItems.forEach((it, i) => process(list[i], it.id));
  };

  const addPasted = (text = pasteText, title = pasteTitle) => {
    try {
      const doc = parsePastedText(text, title.trim() || "My notes");
      const material = buildMaterial(doc, { name: `${title.trim() || "My notes"} (pasted)`, size: new Blob([text]).size });
      const id = uid("up");
      setItems((xs) => [...xs, { id, name: material.title, size: material.files[0].size, status: "ready", progress: 1, label: `${doc.pages.length} sections`, material }]);
      setPaste(false);
      setPasteText("");
      setPasteTitle("");
    } catch (e) {
      toast.error(e instanceof ParseError ? e.userMessage : "Couldn't read that text.");
    }
  };

  // Files or text handed over from the Home screen.
  useEffect(() => {
    const p = takeUpload();
    if (!p) return;
    if (p.files.length) addFiles(p.files);
    if (p.text.trim()) addPasted(p.text, p.text.trim().split("\n")[0].replace(/^#+\s*/, "").slice(0, 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  };

  const ready = items.filter((i) => i.status === "ready" && i.material);
  const busy = items.some((i) => i.status === "reading");

  const save = async () => {
    const folderId = getState().folders.some((f) => f.id === query.get("f")) ? query.get("f") : null;
    const mats = ready.map((i) => ({ ...i.material!, title: i.material!.title.trim() || "Untitled", folderId }));
    const empty = mats.find((m) => !m.pages.some((p) => p.included));
    if (empty) {
      toast.error(`Choose at least one slide in “${empty.title}”`);
      return;
    }
    setSaving(true);
    try {
      setStep("Saving pictures…");
      await persistPendingImages(mats.flatMap((m) => m.pages.flatMap((p) => (p.images ?? []).map((i) => i.id))));
      actions.addMaterials(mats);
      for (const [i, m] of mats.entries()) {
        setStep(mats.length > 1 ? `Making notes and questions (${i + 1} of ${mats.length})…` : "Making notes and questions…");
        await new Promise((r) => setTimeout(r, 0));
        await buildPracticeQuestions(m.id);
      }
      navigate(mats.length === 1 ? `/materials/${mats[0].id}` : "/materials");
      // Logged in: the AI rewrites the notes and questions in the background.
      for (const m of mats) enhanceMaterial(m.id);
    } finally {
      setSaving(false);
      setStep("");
    }
  };

  return (
    <div>
      <PageHeader back={{ to: "/", label: "Home" }} title="Add material" />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn("rounded-2xl border-2 border-dashed bg-card transition-colors", drag ? "border-foreground/50 bg-accent" : "border-border hover:border-foreground/30")}
      >
        <button type="button" onClick={() => input.current?.click()} className={cn("flex w-full items-center justify-center gap-3 rounded-2xl px-6 text-center focus-ring", items.length ? "py-5" : "flex-col py-12")}>
          <UploadCloud className={cn("text-muted-foreground", items.length ? "size-5" : "size-7")} />
          <span className="text-[15px] font-medium">{drag ? "Drop to add" : items.length ? "Add another file" : "Drop your slides here, or click to choose"}</span>
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      <p className="mt-2 text-[12.5px] text-muted-foreground">AI writes your notes and questions. The text of your slides is sent to our AI provider; your files and pictures stay on your device.</p>

      {!paste ? (
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setPaste(true)}>
          <ClipboardPaste /> Paste text instead
        </Button>
      ) : (
        <div className="mt-3 animate-fade-up space-y-3 rounded-xl border bg-card p-4">
          <Field label="Title" htmlFor="paste-title">
            <Input id="paste-title" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="e.g. Chemistry bonding notes" />
          </Field>
          <Field label="Notes" htmlFor="paste-text" hint="Use # headings to split your notes into sections.">
            <Textarea id="paste-text" value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="min-h-[160px]" />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => addPasted()} disabled={pasteText.trim().length < 30}>Add notes</Button>
            <Button variant="ghost" onClick={() => setPaste(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Files">
          {items.map((it) => {
            return (
              <li key={it.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{it.material?.title ?? it.name}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {formatBytes(it.size)} · {it.status === "error" ? <span className="font-medium text-destructive">{it.error}</span> : it.label}
                  </p>
                  {it.status === "reading" && <Progress value={it.progress} size="sm" className="mt-2 max-w-xs" label={`${it.name} progress`} />}
                </div>
                {it.status === "reading" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {it.status === "error" && <AlertCircle className="size-4 text-destructive" />}
                <Button variant="ghost" size="icon-sm" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.name}`}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button size="lg" onClick={save} disabled={busy || !ready.length} loading={saving} className="min-w-44 rounded-full">
            {busy ? "Reading…" : "Generate"}
          </Button>
          {saving && step && (
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {step}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
