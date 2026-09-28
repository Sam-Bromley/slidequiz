import { FileText } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useData } from "@/store/store";
import type { SourceRef } from "@/types/models";

/** Clickable "Slide 14" citation that previews the source page. */
export function SourceChip({ source, className }: { source: SourceRef; className?: string }) {
  const [open, setOpen] = useState(false);
  const data = useData();
  const material = data.materials.find((m) => m.pages.some((p) => p.id === source.pageId));
  const page = material?.pages.find((p) => p.id === source.pageId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex h-6 items-center gap-1 rounded-md border bg-card px-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-ring", className)}
        aria-label={`View source: ${source.label}`}
      >
        <FileText className="size-3" /> {source.label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={page ? page.title : source.label}
        description={material ? `${material.title} · ${source.label}` : "This source is no longer available."}
        footer={
          material && (
            <Link to={`/materials/${material.id}?tab=content&page=${source.pageId}`} className={buttonClass("outline", "sm")} onClick={() => setOpen(false)}>
              Open in material
            </Link>
          )
        }
      >
        {page ? (
          <div className="space-y-3">
            {page.imageDataUrl && <img src={page.imageDataUrl} alt={page.title} className="max-h-72 w-full rounded-lg border object-contain" />}
            <div className="whitespace-pre-line rounded-lg border bg-subtle p-4 text-[14px] leading-relaxed">{page.text || "No text on this page."}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">The material this came from has been deleted.</p>
        )}
      </Dialog>
    </>
  );
}

export function Sources({ sources, className }: { sources: SourceRef[]; className?: string }) {
  if (!sources.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">Source:</span>
      {sources.map((s) => (
        <SourceChip key={s.pageId} source={s} />
      ))}
    </div>
  );
}
