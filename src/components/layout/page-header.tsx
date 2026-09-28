import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

/** `compactActions`: on phones the actions sit in the top-right corner instead of their own row (for a single ⋯ button). */
export function PageHeader({ title, description, actions, back, eyebrow, className, compactActions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; eyebrow?: ReactNode; className?: string; compactActions?: boolean }) {
  return (
    <div className={cn("relative mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-3 inline-flex items-center gap-1 rounded text-[13px] font-medium text-muted-foreground hover:text-foreground focus-ring">
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-[13px] text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-balance text-[24px] font-semibold leading-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className={cn("flex flex-wrap items-center gap-2", compactActions && "absolute right-0 top-0 sm:static")}>{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className, id }: { children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}
