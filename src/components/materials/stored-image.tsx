import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { imageStore } from "@/services/storage/images";

/** An image kept in the browser's image store. */
export function StoredImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    imageStore.url(id).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [id]);
  if (src === undefined) return <span className={cn("shimmer block", className)} aria-hidden />;
  if (!src)
    return (
      <span className={cn("grid place-items-center bg-muted text-muted-foreground", className)} role="img" aria-label={`${alt} (not available on this device)`}>
        <ImageOff className="size-4" />
      </span>
    );
  return <img src={src} alt={alt} className={className} loading="lazy" draggable={false} />;
}
