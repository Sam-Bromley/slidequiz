import { AlertCircle, CirclePlay, ClipboardPaste, Loader2, Trash2, UploadCloud } from "lucide-react";
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
import { persistPendingImages } from "@/services/storage/images";
import { enhanceMaterial, waitUntilReady } from "@/services/ai/cloud";
import { AllowanceNote } from "@/components/ai/allowance-note";
import { AuthDialog } from "@/components/account/auth-dialog";
import { useAccount } from "@/services/account";
import { transcribeFile, youtubeDocument } from "@/services/media";
import { hasPlus, usePlan } from "@/services/plus";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";
import type { Material } from "@/types/models";

/** A pasted YouTube link on its own (with or without https://, www., m., youtu.be, shorts). */
const YOUTUBE_ONLY = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?\S*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{11}\S*$/i;

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
  const [yt, setYt] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const pro = usePlan().plus;
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("");
  // Making material needs a free account: you can pick files first, then sign up to generate.
  const user = useAccount().user;
  const [auth, setAuth] = useState(false);
  const [wantSave, setWantSave] = useState(false);
  // Not logged in: ask them to log in or sign up as soon as they add something (once per visit).
  const asked = useRef(false);
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
      // Pro: recordings are listened to and turned into text first.
      if (v.type === "audio" || v.type === "video") {
        if (!hasPlus()) {
          patch(id, { status: "error", progress: 0, error: "Lecture recordings and videos are part of SlideQuiz Pro." });
          return;
        }
        const doc = await transcribeFile(file, (f, label) => patch(id, { progress: f, label: withTimeLeft(label ?? "Listening…", f, Date.now() - started) }));
        const material = buildMaterial(doc, file);
        patch(id, { status: "ready", progress: 1, label: `${doc.pages.length} sections`, material });
        return;
      }
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

  const addYoutube = async (link = ytUrl) => {
    const url = link.trim();
    if (!url) return;
    if (!hasPlus()) {
      toast("YouTube videos are part of SlideQuiz Pro");
      navigate("/pro");
      return;
    }
    setYt(false);
    setYtUrl("");
    const id = uid("up");
    setItems((xs) => [...xs, { id, name: url, size: 0, status: "reading", progress: 0.3, label: "Reading the video's captions…" }]);
    try {
      const doc = await youtubeDocument(url);
      const material = buildMaterial(doc, { name: doc.title, size: 0 });
      patch(id, { name: doc.title, status: "ready", progress: 1, label: `YouTube · ${doc.pages.length} sections`, material });
    } catch (e) {
      patch(id, {
        status: "error",
        progress: 0,
        error: `${e instanceof ParseError ? e.userMessage : "Couldn't read that video."} You can copy the transcript from YouTube (… → Show transcript) and use Paste text instead.`,
      });
    }
  };

  const addPasted = (text = pasteText, title = pasteTitle) => {
    // Just a YouTube link? Treat it as a video, not as notes.
    if (YOUTUBE_ONLY.test(text.trim())) {
      setPaste(false);
      setPasteText("");
      setPasteTitle("");
      addYoutube(text.trim());
      return;
    }
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

  useEffect(() => {
    if (items.length && !user && !asked.current) {
      asked.current = true;
      setAuth(true);
    }
  }, [items.length, user]);

  const ready = items.filter((i) => i.status === "ready" && i.material);
  const busy = items.some((i) => i.status === "reading");

  const generate = () => {
    if (user) return save();
    setWantSave(true);
    setAuth(true);
  };
  // Signed up or logged in (here or in another tab): carry on generating.
  useEffect(() => {
    if (user && wantSave) {
      setWantSave(false);
      setAuth(false);
      save();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, wantSave]);

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
      // Pictures save in the background (they show from memory meanwhile), so the lecture opens straight away.
      void persistPendingImages(mats.flatMap((m) => m.pages.flatMap((p) => (p.images ?? []).map((i) => i.id))));
      actions.addMaterials(mats);
      // Notes and questions are written one lecture at a time. The first lecture opens once its notes
      // and first questions are ready, so there's something to read and practise straight away.
      setStep("Writing your notes and questions…");
      (async () => {
        for (const m of mats) await enhanceMaterial(m.id);
      })();
      await waitUntilReady(mats[0].id);
      navigate(mats.length === 1 ? `/materials/${mats[0].id}` : "/materials");
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


      {!paste && !yt && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPaste(true)}>
            <ClipboardPaste /> Paste text instead
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              if (pro) setYt(true);
              else {
                toast("YouTube videos are part of SlideQuiz Pro");
                navigate("/pro");
              }
            }}
          >
            <CirclePlay /> Add a YouTube video
            {!pro && <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">Pro</span>}
          </Button>
        </div>
      )}
      {yt && (
        <div className="mt-3 animate-fade-up space-y-3 rounded-xl border bg-card p-4">
          <Field label="YouTube link" htmlFor="yt-url" hint="The video needs captions (most lectures and talks have them).">
            <Input id="yt-url" autoFocus value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addYoutube()} placeholder="https://www.youtube.com/watch?v=…" />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => addYoutube()} disabled={!ytUrl.trim()}>Add video</Button>
            <Button variant="ghost" onClick={() => setYt(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {!paste ? null : (
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
                    {it.size ? `${formatBytes(it.size)} · ` : ""}{it.status === "error" ? <span className="font-medium text-destructive">{it.error}</span> : it.label}
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
          <Button size="lg" onClick={generate} disabled={busy || !ready.length} loading={saving} className="min-w-44 rounded-full">
            {busy ? "Reading…" : "Generate"}
          </Button>
          {!saving && !busy && user && <AllowanceNote materials={ready.map((i) => i.material!)} />}
          {saving && step && (
            <p className="text-center text-[13px] text-muted-foreground" aria-live="polite">
              {step}
              <span className="block text-[12px]">This usually takes under a minute.</span>
            </p>
          )}
        </div>
      )}
      {auth && (
        <AuthDialog
          initial="signup"
          reason="Create a free account to make your notes, practice questions and flashcards. You get 10 credits a month, and your work is saved on any device."
          onClose={() => setAuth(false)}
        />
      )}
    </div>
  );
}
