import { MessageSquare, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ChatPanel } from "@/components/tutor/chat-panel";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Link, navigate, useLocation } from "@/lib/router";
import { recentMaterials } from "@/store/selectors";
import { useData } from "@/store/store";

export function AskPage() {
  const data = useData();
  const { query } = useLocation();
  const m = data.materials.find((x) => x.id === query.get("m")) ?? recentMaterials(data, 1)[0];
  if (!m)
    return (
      <div>
        <PageHeader title="Ask your notes" />
        <EmptyState icon={Upload} title="Upload your first study material to get started." description="Then ask questions and get answers with slide citations." action={<Link to="/upload" className={buttonClass()}>Upload material</Link>} />
      </div>
    );
  return (
    <div>
      <PageHeader
        title="Ask your notes"
        description="Get answers from your own material, with the slide or page each answer came from."
        actions={
          <Select aria-label="Choose material" value={m.id} onChange={(e) => navigate(`/ask?m=${e.target.value}`, { replace: true })} className="w-64">
            {data.materials.map((x) => (
              <option key={x.id} value={x.id}>
                {x.subject} · {x.title}
              </option>
            ))}
          </Select>
        }
      />
      <ChatPanel key={m.id} material={m} />
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <MessageSquare className="size-3.5" /> Only included {m.unit} are used. Change them on the material's {m.unit} tab.
      </p>
    </div>
  );
}
