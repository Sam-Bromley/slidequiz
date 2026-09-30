import { ArrowLeft, Home, Library } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/lib/router";

/** Friendly page for links that go nowhere. */
export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <p className="bg-gradient-to-b from-foreground to-foreground/30 bg-clip-text text-[96px] font-bold leading-none tracking-tighter text-transparent">404</p>
      <h1 className="mt-4 text-[22px] font-semibold">This page has wandered off</h1>
      <p className="mt-2 text-[14.5px] text-muted-foreground">The link might be old or mistyped. Your notes and questions are all safe.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link to="/" className={buttonClass()}>
          <Home /> Go home
        </Link>
        <Link to="/materials" className={buttonClass("outline")}>
          <Library /> My Materials
        </Link>
      </div>
      <button type="button" onClick={() => history.back()} className="mt-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground focus-ring rounded">
        <ArrowLeft className="size-3.5" /> Go back
      </button>
    </div>
  );
}
