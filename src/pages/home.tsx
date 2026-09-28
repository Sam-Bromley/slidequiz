import { ArrowUp, Paperclip, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { handOffUpload } from "@/lib/handoff";
import { navigate } from "@/lib/router";
import { cn, formatBytes } from "@/lib/utils";
import { ACCEPT_ATTR } from "@/services/parsing";

/** Home: one quiet box in the middle. Drop files or paste notes, press go. */
export function HomePage() {
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
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center py-8">
      <div className="w-full max-w-2xl">

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

      </div>
    </div>
  );
}
