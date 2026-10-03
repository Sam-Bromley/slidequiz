import { ArrowUp, Brain, Eraser, GraduationCap, Lightbulb, ListChecks, MessageSquareQuote, Microscope, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SourceChip } from "@/components/questions/source";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, nowISO, uid } from "@/lib/utils";
import { getAI } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { ChatMessage, ChatMode, Material } from "@/types/models";
import { LogoMark } from "@/components/layout/logo";

const MODES: { mode: ChatMode; label: string; icon: typeof Brain; prompt: string }[] = [
  { mode: "simple", label: "Explain simply", icon: SquarePen, prompt: "Explain simply" },
  { mode: "depth", label: "Explain in depth", icon: Microscope, prompt: "Explain in depth" },
  { mode: "analogy", label: "Give an analogy", icon: Lightbulb, prompt: "Give me an analogy" },
  { mode: "example", label: "Give an example", icon: MessageSquareQuote, prompt: "Give me an example" },
  { mode: "test", label: "Test me", icon: ListChecks, prompt: "Test me" },
];

/** "Ask your notes": answers only from the student's material, with slide citations. */
export function ChatPanel({ material, className, onClose, ask }: { material: Material; className?: string; onClose?: () => void; ask?: string }) {
  const data = useData();
  const messages = data.chats[material.id] ?? [];
  const [input, setInput] = useState("");
  const [tutor, setTutor] = useState(false);
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef<number | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  useEffect(
    () => () => {
      if (started.current) actions.addSession({ kind: "tutor", materialIds: [material.id], startedAt: new Date(started.current).toISOString(), durationMs: Date.now() - started.current, items: 1 });
    },
    [material.id],
  );

  const send = async (text: string, mode: ChatMode = "answer") => {
    const content = text.trim();
    if (!content || thinking) return;
    started.current ??= Date.now();
    const typed = input.trim();
    const user: ChatMessage = { id: uid("msg"), role: "user", content, mode, createdAt: nowISO() };
    const history = getState().chats[material.id] ?? [];
    actions.appendChat(material.id, user);
    setInput("");
    setThinking(true);
    try {
      const { pages } = groundingFor([material]);
      // Quick buttons act on what's typed, or else on the last question asked.
      const lastQ = [...history].reverse().find((m) => m.role === "user" && (m.mode ?? "answer") === "answer")?.content;
      const message = mode === "answer" ? content : typed || lastQ || material.title;
      const reply = await getAI().chat({ materialTitle: material.title, pages, history, message, mode, tutor });
      actions.appendChat(material.id, { id: uid("msg"), role: "assistant", content: reply.content, citations: reply.citations, expectedAnswer: reply.expectedAnswer, tutorStep: reply.tutorStep, mode, createdAt: nowISO() });
    } catch {
      actions.appendChat(material.id, { id: uid("msg"), role: "assistant", content: "Something went wrong. Try again.", createdAt: nowISO() });
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  // Opened from "Explain" on some highlighted text: ask about it straight away (once).
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || asked.current === ask) return;
    asked.current = ask;
    const quote = ask.trim().replace(/\s+/g, " ").slice(0, 600);
    send(`Explain this part of my notes: "${quote}"`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const suggestions = material.topics.slice(0, 3).map((t) => `What are the key ideas in ${t.name.toLowerCase()}?`);

  return (
    <div className={cn("flex h-[70dvh] min-h-[480px] flex-col overflow-hidden rounded-2xl border bg-card", className)}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">Ask about your notes</p>
          <p className="truncate text-[12px] text-muted-foreground">Answers come only from {material.title}, with citations</p>
        </div>
        <Tooltip content="Tutor mode teaches through questions instead of giving the answer straight away." side="bottom">
          <label className="flex items-center gap-2 text-[13px] font-medium" htmlFor={`tutor-${material.id}`}>
            <GraduationCap className="size-4 text-muted-foreground" />
            <span className="hidden sm:inline">Tutor mode</span>
            <Switch id={`tutor-${material.id}`} checked={tutor} onChange={setTutor} label="Tutor mode" />
          </label>
        </Tooltip>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon-sm" aria-label="Clear conversation" title="Clear conversation" onClick={() => actions.clearChat(material.id)}>
            <Eraser />
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 scrollbar-thin" aria-live="polite">
        {!messages.length && (
          <div className="mx-auto max-w-md py-6 text-center">
            <LogoMark className="mx-auto size-10" />
            <p className="mt-3 font-semibold">Ask anything about {material.title}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">I'll answer from your {material.unit} and show where each answer came from. If it isn't in your notes, I'll say so.</p>
            <div className="mt-5 flex flex-col gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border bg-subtle px-3 py-2 text-left text-[13.5px] transition-colors hover:border-primary/40 hover:bg-primary-soft">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex animate-fade-up gap-3", m.role === "user" && "justify-end")}>
            {m.role === "assistant" && <LogoMark className="size-7 shrink-0" />}
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-tl-md border bg-subtle")}>
              {m.role === "user" ? <p className="whitespace-pre-line text-[14px]">{m.content}</p> : <RichText text={m.content} />}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                  <span className="text-[11.5px] text-muted-foreground">Source:</span>
                  {m.citations.map((c) => <SourceChip key={c.pageId} source={c} />)}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex gap-3" role="status" aria-label="Thinking">
            <LogoMark className="size-7 shrink-0" />
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border bg-subtle px-4 py-3.5">
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />)}
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="no-scrollbar -mx-3 mb-2.5 flex gap-1.5 overflow-x-auto px-3">
          {MODES.map((m) => (
            <button key={m.mode} disabled={thinking || (!messages.length && !input.trim())} onClick={() => send(input.trim() ? `${m.prompt}: ${input.trim()}` : m.prompt, m.mode)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40 focus-ring">
              <m.icon className="size-3.5" /> {m.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={tutor ? "Ask a question and I'll guide you to the answer…" : "Ask a question about your notes…"}
            aria-label="Message"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
          />
          <Button type="submit" size="icon" className="size-[42px] rounded-xl" disabled={!input.trim() || thinking} aria-label="Send">
            <ArrowUp />
          </Button>
        </form>
      </div>
    </div>
  );
}
