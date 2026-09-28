import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Renders the small markdown subset the AI layer returns: **bold**, *italic*, "- " bullets, paragraphs. */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={`${key}-${i++}`} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong> : <em key={`${key}-${i++}`} className="text-muted-foreground">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-2.5 text-[15.5px] leading-relaxed", className)}>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*- /.test(l)))
          return (
            <ul key={bi} className="ml-4 list-disc space-y-1 marker:text-muted-foreground">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*- /, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {/^\s*- /.test(l) ? <span className="block pl-3">• {inline(l.replace(/^\s*- /, ""), `${bi}-${li}`)}</span> : inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
