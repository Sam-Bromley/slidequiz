import { Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Colours for folders and notes in My Materials. */
export const ITEM_COLOURS: { key: string; label: string; hex: string }[] = [
  { key: "red", label: "Red", hex: "#ef4444" },
  { key: "orange", label: "Orange", hex: "#f97316" },
  { key: "yellow", label: "Yellow", hex: "#eab308" },
  { key: "green", label: "Green", hex: "#22c55e" },
  { key: "teal", label: "Teal", hex: "#14b8a6" },
  { key: "blue", label: "Blue", hex: "#3b82f6" },
  { key: "purple", label: "Purple", hex: "#8b5cf6" },
  { key: "pink", label: "Pink", hex: "#ec4899" },
];

export const colourHex = (key?: string) => ITEM_COLOURS.find((c) => c.key === key)?.hex;

/** Pick a colour (or none) for a folder or a lecture. */
export function ColourDialog({ name, value, onPick, onClose }: { name: string; value?: string; onPick: (key: string | undefined) => void; onClose: () => void }) {
  const pick = (key?: string) => {
    onPick(key);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Colour for “${name}”`} size="sm">
      <div className="grid grid-cols-5 gap-2.5" role="radiogroup" aria-label="Colour">
        <button type="button" role="radio" aria-checked={!value} onClick={() => pick(undefined)} className={cn("grid aspect-square place-items-center rounded-full border-2 text-muted-foreground focus-ring", !value ? "border-foreground" : "border-border")} title="No colour">
          {!value ? <Check className="size-4" /> : <span className="h-0.5 w-5 rotate-45 rounded bg-muted-foreground/60" />}
        </button>
        {ITEM_COLOURS.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={value === c.key} aria-label={c.label} title={c.label} onClick={() => pick(c.key)} className={cn("grid aspect-square place-items-center rounded-full border-2 transition-transform hover:scale-105 focus-ring", value === c.key ? "border-foreground" : "border-transparent")} style={{ background: c.hex }}>
            {value === c.key && <Check className="size-4 text-white" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
