import { Sunset, BookOpen, CornerDownLeft, FileText, Keyboard, Moon, Search, Upload, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { navigate } from "@/lib/router";
import { setUI, useUI } from "@/lib/ui";
import { cn, isMac } from "@/lib/utils";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  run: () => void;
  keywords?: string;
}

export function CommandMenu() {
  const ui = useUI();
  const data = useData();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setUI({ command: false });
    setQ("");
    setActive(0);
  };

  const items = useMemo<Item[]>(() => {
    const act: Item[] = [
      { id: "a-upload", group: "Actions", label: "Upload material", icon: Upload, run: () => navigate("/upload"), keywords: "add file pdf pptx" },
      { id: "a-theme", group: "Actions", label: "Toggle dark mode", icon: Moon, run: () => actions.updateSettings({ theme: document.documentElement.classList.contains("dark") ? "light" : "dark" }), keywords: "theme light" },
      { id: "a-night", group: "Actions", label: "Night light (warm colours)", icon: Sunset, run: () => actions.updateSettings({ theme: "warm" }), keywords: "theme blue light late night warm" },
      { id: "a-keys", group: "Actions", label: "Keyboard shortcuts", icon: Keyboard, run: () => setUI({ shortcuts: true }) },
    ];
    const mats: Item[] = data.materials.map((m) => ({ id: m.id, group: "Materials", label: `${m.subject} · ${m.title}`, sub: `${m.pages.length} ${m.unit}`, icon: FileText, run: () => navigate(`/materials/${m.id}`), keywords: m.topics.map((t) => t.name).join(" ") }));
    const topics: Item[] = data.materials.flatMap((m) => m.topics.map((t) => ({ id: t.id, group: "Topics", label: t.name, sub: m.title, icon: BookOpen, run: () => navigate(`/materials/${m.id}?tab=notes`) })));
    return [...act, ...mats, ...topics];
  }, [data]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items.filter((i) => i.group === "Actions" || i.group === "Materials");
    const words = t.split(/\s+/);
    const scored = items
      .map((i) => {
        const hay = `${i.label} ${i.sub ?? ""} ${i.keywords ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        return { i, s: (i.label.toLowerCase().startsWith(t) ? 3 : 0) + (i.label.toLowerCase().includes(t) ? 2 : 0) + (i.group === "Actions" ? 1 : 0) };
      })
      .filter(Boolean) as { i: Item; s: number }[];
    const groups = ["Actions", "Materials", "Topics", "Questions", "Flashcards"];
    const out: Item[] = [];
    for (const g of groups) out.push(...scored.filter((x) => x.i.group === g).sort((a, b) => b.s - a.s).slice(0, g === "Questions" || g === "Flashcards" ? 6 : 5).map((x) => x.i));
    return out;
  }, [q, items]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (i: Item) => {
    close();
    setTimeout(i.run, 0);
  };

  return (
    <Dialog open={ui.command} onClose={close} title={<span className="sr-only">Search</span>} hideClose size="lg" className="sm:mt-[-12vh]">
      <div className="-mx-5 -mt-4 flex flex-col">
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            data-autofocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                run(results[active]);
              }
            }}
            placeholder="Search materials, topics, questions, flashcards…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-label="Search"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-2 scrollbar-thin">
          {!results.length && <p className="px-3 py-10 text-center text-sm text-muted-foreground">No results for “{q}”.</p>}
          {results.map((r, idx) => (
            <div key={r.id}>
              {(idx === 0 || results[idx - 1].group !== r.group) && <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground first:pt-1">{r.group}</div>}
              <button
                id={`cmd-${r.id}`}
                data-idx={idx}
                role="option"
                aria-selected={idx === active}
                onMouseMove={() => setActive(idx)}
                onClick={() => run(r)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", idx === active ? "bg-accent" : "")}
              >
                <r.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{r.label}</span>
                  {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                </span>
                {idx === active && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="inline-flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto hidden sm:inline">{isMac ? "⌘" : "Ctrl"} K anywhere</span>
        </div>
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const ui = useUI();
  const rows: [string, string[]][] = [
    ["Search / command menu", [isMac ? "⌘" : "Ctrl", "K"]],
    ["Search (alternative)", ["/"]],
    ["Upload material", ["U"]],
    ["Show shortcuts", ["?"]],
    ["Quiz: choose option", ["1", "–", "4"]],
    ["Quiz: submit / next", ["Enter"]],
    ["Quiz: previous / next question", ["←", "→"]],
    ["Quiz: flag question", ["F"]],
    ["Flashcards: flip", ["Space"]],
    ["Flashcards: hard / good / easy", ["1", "2", "3"]],
  ];
  return (
    <Dialog open={ui.shortcuts} onClose={() => setUI({ shortcuts: false })} title="Keyboard shortcuts" size="sm">
      <ul className="divide-y">
        {rows.map(([l, k]) => (
          <li key={l} className="flex items-center justify-between py-2.5 text-sm">
            <span>{l}</span>
            <span className="flex gap-1">{k.map((x, i) => (x === "–" ? <span key={i} className="text-muted-foreground">–</span> : <Kbd key={i}>{x}</Kbd>))}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
