import { AlertCircle, CheckCircle2, ClipboardPaste, FilePlus2, FileUp, RefreshCw, Trash2, TriangleAlert, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { takeUpload } from "@/lib/handoff";
import { PageHeader } from "@/components/layout/page-header";
import { PagePicker } from "@/components/materials/page-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { navigate, useLocation } from "@/lib/router";
import { getState } from "@/store/store";
import { cn, formatBytes, plural, uid } from "@/lib/utils";
import { ACCEPT_ATTR, buildMaterial, FILE_TYPE_LABEL, ParseError, parseFile, parsePastedText, retopic, SUPPORTED_LABEL, validateFile, detectType } from "@/services/parsing";
import { fileStorage } from "@/services/storage";
import { actions } from "@/store/actions";
import type { Material } from "@/types/models";

interface Item {
  id: string;
  name: string;
  size: number;
  typeLabel: string;
  status: "uploading" | "parsing" | "ready" | "error";
  progress: number;
  label: string;
  error?: string;
  warnings?: string[];
  material?: Material;
}

export function UploadPage() {
  const { query } = useLocation();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const process = async (file: File, id: string) => {
    const v = validateFile(file);
    const typeLabel = detectType(file.name) ? FILE_TYPE_LABEL[detectType(file.name)!] : file.name.split(".").pop()?.toUpperCase() ?? "File";
    if (!v.ok) {
      patch(id, { status: "error", error: v.error, typeLabel, progress: 0 });
      return;
    }
    // "Upload" to file storage (instant locally; a real backend streams here).
    for (let p = 0.1; p <= 0.3; p += 0.1) {
      patch(id, { progress: p, label: "Uploading…" });
      await new Promise((r) => setTimeout(r, 90));
    }
    await fileStorage.put(id, file);
    patch(id, { status: "parsing", progress: 0.3, label: "Reading content…" });
    try {
      const doc = await parseFile(file, (f, label) => patch(id, { progress: 0.3 + f * 0.7, label: label ?? "Reading content…" }));
      const material = buildMaterial(doc, file);
      patch(id, { status: "ready", progress: 1, label: `${doc.pages.length} ${doc.unit} found`, material, warnings: doc.warnings });
      setActive((a) => a ?? id);
    } catch (e) {
      patch(id, { status: "error", progress: 0, error: e instanceof ParseError ? e.userMessage : "Something went wrong reading this file. Try again." });
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const newItems: Item[] = list.map((f) => ({ id: uid("up"), name: f.name, size: f.size, typeLabel: detectType(f.name) ? FILE_TYPE_LABEL[detectType(f.name)!] : "Unsupported", status: "uploading", progress: 0.05, label: "Uploading…" }));
    setItems((xs) => [...xs, ...newItems]);
    newItems.forEach((it, i) => process(list[i], it.id));
  };

  const replace = (file: File) => {
    const id = replacing.current;
    if (!id) return;
    patch(id, { name: file.name, size: file.size, status: "uploading", progress: 0.05, label: "Uploading…", error: undefined, material: undefined, warnings: undefined });
    process(file, id);
  };

  const remove = (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    fileStorage.remove(id);
    if (active === id) setActive(items.find((x) => x.id !== id && x.status === "ready")?.id ?? null);
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

  const addPasted = (text = pasteText, title = pasteTitle) => {
    try {
      const doc = parsePastedText(text, title.trim() || "My notes");
      const material = buildMaterial(doc, { name: `${title.trim() || "My notes"} (pasted)`, size: new Blob([text]).size });
      const id = uid("up");
      setItems((xs) => [...xs, { id, name: material.title, size: material.files[0].size, typeLabel: "Pasted text", status: "ready", progress: 1, label: `${doc.pages.length} sections found`, material }]);
      setActive(id);
      setPaste(false);
      setPasteText("");
      setPasteTitle("");
    } catch (e) {
      toast.error(e instanceof ParseError ? e.userMessage : "Couldn't read that text.");
    }
  };

  const ready = items.filter((i) => i.status === "ready" && i.material);
  const busy = items.some((i) => i.status === "uploading" || i.status === "parsing");
  const current = ready.find((i) => i.id === active) ?? ready[0];

  const updateMaterial = (id: string, fn: (m: Material) => Material) => setItems((xs) => xs.map((x) => (x.id === id && x.material ? { ...x, material: fn(x.material) } : x)));

  const save = (thenGenerate: boolean) => {
    const folderId = getState().folders.some((f) => f.id === query.get("f")) ? query.get("f") : null;
    const mats = ready.map((i) => i.material!).map((m) => ({ ...m, title: m.title.trim() || "Untitled material", folderId }));
    const empty = mats.find((m) => !m.pages.some((p) => p.included));
    if (empty) {
      toast.error(`Select at least one page in “${empty.title}”`);
      return;
    }
    actions.addMaterials(mats);
    toast(`${plural(mats.length, "material")} added to your library`);
    navigate(thenGenerate ? `/generate?m=${mats.map((m) => m.id).join(",")}` : mats.length === 1 ? `/materials/${mats[0].id}` : "/materials");
  };

  return (
    <div className={cn(ready.length > 0 && "pb-24")}>
      <PageHeader back={{ to: "/materials", label: "My Materials" }} title="Upload material" description="Add your lecture slides, PDFs, Word documents or notes. You'll choose which slides to use next." />

      <div className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn("relative rounded-2xl border-2 border-dashed bg-card transition-colors", drag ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40")}
        >
          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center focus-ring sm:py-14">
            <span className={cn("grid size-12 place-items-center rounded-2xl transition-colors", drag ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
              <UploadCloud className="size-6" />
            </span>
            <span className="text-[16px] font-semibold">{drag ? "Drop to upload" : "Drag files here, or click to browse"}</span>
            <span className="text-[13px] text-muted-foreground">{SUPPORTED_LABEL} · up to 25 MB each · multiple files welcome</span>
            <span className="mt-1 flex flex-wrap justify-center gap-1.5">
              {[".pptx", ".pdf", ".docx", ".txt", ".png / .jpg"].map((t) => (
                <Badge key={t} tone="outline">{t}</Badge>
              ))}
            </span>
          </button>
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={replaceInput} type="file" accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(f); e.target.value = ""; }} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPaste((p) => !p)} aria-expanded={paste}>
            <ClipboardPaste /> {paste ? "Hide text box" : "Paste text instead"}
          </Button>
        </div>
        {paste && (
          <div className="animate-fade-up space-y-3 rounded-xl border bg-card p-4">
            <Field label="Title" htmlFor="paste-title">
              <Input id="paste-title" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="e.g. Chemistry bonding notes" />
            </Field>
            <Field label="Notes" htmlFor="paste-text" hint="Use # headings to split your notes into sections.">
              <Textarea id="paste-text" value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="min-h-[160px]" placeholder={"# Ionic bonding\nIonic bonding is the electrostatic attraction between oppositely charged ions…"} />
            </Field>
            <Button onClick={() => addPasted()} disabled={pasteText.trim().length < 30}>Add notes</Button>
          </div>
        )}

        {/* File list */}
        {items.length > 0 && (
          <ul className="divide-y rounded-xl border bg-card" aria-label="Uploaded files">
            {items.map((it) => (
              <li key={it.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", it.status === "error" ? "bg-destructive-soft text-destructive" : it.status === "ready" ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>
                    {it.status === "error" ? <AlertCircle className="size-5" /> : it.status === "ready" ? <CheckCircle2 className="size-5" /> : <FileUp className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{it.name}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {it.typeLabel} · {formatBytes(it.size)}
                      {it.status !== "error" && <> · {it.label}</>}
                    </p>
                    {it.status === "error" && <p className="mt-0.5 text-[13px] font-medium text-destructive" role="alert">{it.error}</p>}
                    {(it.status === "uploading" || it.status === "parsing") && <Progress value={it.progress} size="sm" className="mt-2 max-w-sm" label={`${it.name} progress`} />}
                  </div>
                </div>
                <div className="flex gap-1.5 sm:justify-end">
                  {it.status === "ready" && ready.length > 1 && (
                    <Button variant={current?.id === it.id ? "secondary" : "ghost"} size="sm" onClick={() => setActive(it.id)}>Preview</Button>
                  )}
                  {it.typeLabel !== "Pasted text" && (
                    <Button variant="ghost" size="sm" onClick={() => { replacing.current = it.id; replaceInput.current?.click(); }} disabled={it.status === "uploading" || it.status === "parsing"}>
                      <RefreshCw /> Replace
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              </li>
            ))}
            <li className="p-2">
              <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => input.current?.click()}>
                <FilePlus2 /> Add another file
              </Button>
            </li>
          </ul>
        )}
      </div>

      {/* Content preview */}
      {current?.material && (
        <section className="mt-10" aria-labelledby="preview-h">
          <div className="mb-4">
            <h2 id="preview-h" className="text-[20px] font-bold">Content preview</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">Untick anything you don't want questions from, like title slides, reading lists, topics that aren't on your exam.</p>
          </div>
          {ready.length > 1 && (
            <Tabs idPrefix="files" className="mb-5" value={current.id} onChange={setActive} items={ready.map((r) => ({ value: r.id, label: r.material!.title, count: r.material!.pages.filter((p) => p.included).length }))} />
          )}
          {current.warnings?.map((w) => (
            <p key={w} className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[13.5px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> {w}
            </p>
          ))}
          <div className="mb-5 grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="Subject" htmlFor={`subj-${current.id}`}>
              <Input id={`subj-${current.id}`} value={current.material.subject} onChange={(e) => updateMaterial(current.id, (m) => ({ ...m, subject: e.target.value }))} />
            </Field>
            <Field label="Title" htmlFor={`title-${current.id}`}>
              <Input id={`title-${current.id}`} value={current.material.title} onChange={(e) => updateMaterial(current.id, (m) => ({ ...m, title: e.target.value }))} />
            </Field>
          </div>
          <PagePicker
            material={current.material}
            onToggle={(ids, inc) => updateMaterial(current.id, (m) => ({ ...m, pages: m.pages.map((p) => (ids === "all" || ids.includes(p.id) ? { ...p, included: inc } : p)) }))}
            onSetText={(pid, text) => updateMaterial(current.id, (m) => retopic({ ...m, pages: m.pages.map((p) => (p.id === pid ? { ...p, text, needsText: false, included: true } : p)) }))}
          />
        </section>
      )}

      {ready.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 border-t bg-background/92 backdrop-blur-md lg:bottom-0 lg:left-[248px]">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="hidden flex-1 text-[13px] text-muted-foreground sm:block">
              {ready.map((r) => `${r.material!.title}: ${r.material!.pages.filter((p) => p.included).length}/${r.material!.pages.length}`).join(" · ")}
            </p>
            <Button variant="outline" onClick={() => save(false)} disabled={busy} className="flex-1 sm:flex-none">
              Save to library
            </Button>
            <Button onClick={() => save(true)} disabled={busy} className="flex-1 sm:flex-none">
              Next: make questions
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
