import { Compass } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/lib/router";

export function NotFound() {
  return <EmptyState className="mt-10" icon={Compass} title="This page doesn't exist" description="The link may be out of date." action={<Link to="/" className={buttonClass()}>Go home</Link>} />;
}
