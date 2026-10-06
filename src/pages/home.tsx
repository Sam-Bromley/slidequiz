import { ArrowUp, Check, FileText, Layers, ListChecks, Paperclip, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { handOffUpload } from "@/lib/handoff";
import { navigate } from "@/lib/router";
import { quoteOfTheDay } from "@/lib/quotes";
import { useData } from "@/store/store";
import { cn, formatBytes } from "@/lib/utils";
import { ACCEPT_ATTR } from "@/services/parsing";
import { useAccount } from "@/services/account";

/** Home: one quiet box in the middle. Drop files or paste notes, press go. */
export function HomePage() {
  const data = useData();
  const user = useAccount().user;
  /** Someone new (not logged in, nothing uploaded): say what SlideQuiz does. */
  const intro = !user && data.materials.length === 0;
  const showQuote = !intro && data.settings.showQuote !== false;
  const quote = quoteOfTheDay();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ready = files.length > 0 || text.trim().length > 20;

  const go = () => {
    if (!ready) {
      input.current?.click();
      return;
    }
    handOffUpload(files, text);
    navigate("/upload");
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)]);
  };

  return (
    <div className="home-page flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center py-8">
      <div className="w-full max-w-2xl">
        {intro && (
          <div className="mb-7 px-1 text-center">
            <h1 className="text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[46px]">Turn your lecture slides into revision</h1>
            <p className="mx-auto mt-3.5 max-w-xl text-balance text-[15.5px] leading-relaxed text-muted-foreground sm:text-[17px]">
              Upload your PowerPoint, PDF or Word file and get clean notes, flashcards and practice questions, with your written answers marked.
            </p>
          </div>
        )}
        {showQuote && (
          <figure className="home-quote mx-auto mb-6 w-fit max-w-full px-2 text-center">
            <blockquote className="text-[16px] italic leading-relaxed text-foreground/80">“{quote.text}”</blockquote>
            <figcaption className="mt-1.5 text-[13px] text-muted-foreground">{quote.by}</figcaption>
          </figure>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn("rounded-[26px] border bg-card p-3 shadow-pop transition-colors", drag && "border-primary ring-2 ring-primary/30")}
        >
          {files.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl border bg-subtle py-1.5 pl-3 pr-1.5 text-[13px]">
                  <span className="max-w-[200px] truncate">{f.name}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                  <button type="button" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && ready) {
                e.preventDefault();
                go();
              }
            }}
            rows={2}
            placeholder={drag ? "Drop to add" : "Drop your slides here, or paste your notes…"}
            aria-label="Paste notes or drop files"
            className="block max-h-60 min-h-[56px] w-full resize-none bg-transparent px-3 py-2 text-[15.5px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => input.current?.click()}>
              <Paperclip /> Add files
            </Button>
            <Button size="icon" className="size-9 rounded-full" onClick={go} aria-label={ready ? "Continue" : "Choose files"}>
              <ArrowUp />
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) setFiles((f) => [...f, ...Array.from(e.target.files!)]);
              e.target.value = "";
            }}
          />
        </div>

        {intro && (
          <>
            <p className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5" strokeWidth={2.5} /> Free to try
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5" strokeWidth={2.5} /> No card needed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5" strokeWidth={2.5} /> Phone and laptop
              </span>
            </p>
            <ul className="mt-10 grid gap-2.5 sm:grid-cols-3 sm:gap-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl border bg-card p-4 sm:flex-col sm:gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
                    <Icon className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: FileText, title: "Clean notes", text: "Every slide turned into tidy, organised notes." },
  { icon: Layers, title: "Flashcards", text: "The key terms and facts, ready to test yourself on." },
  { icon: ListChecks, title: "Practice questions", text: "Multiple choice, plus written answers marked like an exam." },
];
