# SlideQuiz

Turn lecture slides, PDFs, Word documents and notes into questions, flashcards, summaries and personalised study sessions.

## Run it

```bash
npm install
npm run build      # outputs a static site to dist/
npm run preview    # serves dist/ on http://localhost:5173
npm run dev        # rebuilds on change
npm run typecheck
```

The app is a static single-page app (hash routing), so `dist/` can be deployed to any static host.

## Stack

React 19 · TypeScript (strict) · Tailwind CSS 3 · Arial everywhere · chatbot-style home (one upload box in the middle) · light and plain by default; the palette button (top right) picks Light, Dark or Night light and a background (Sunset, Forest, Peaks, Hills, Ocean, Canyon, Dunes, Aurora; Snowy peaks and Lake are drawn but hidden for now; src/components/layout/app-background.tsx). Stars in night scenes can be dragged and spring back · Settings is the gear button (top right) · automatic night light with your own start and end times · custom quiz timer (any number of minutes) · exports to PDF, Word, text, Markdown, web page, CSV and JSON · folders in My Materials · Study, Question Bank and History pages are hidden from navigation for now but still routable · shadcn/ui-style components (hand-written in `src/components/ui`, same variant + `cn()` pattern) · Lucide icons · esbuild. PDF parsing uses pdf.js, PPTX/DOCX parsing uses JSZip, exports use pdf-lib and docx. · Each material has three tabs: Notes (every line from the included slides, organised by topic with key terms, tables, speaker notes and slide images; “More detail” and “Ask about these notes”), Practice (multiple choice only, one at a time, covering every fact; 3–6 options, A–E by default, shuffled every time; wrong answers come back a few questions later and at the start of the next session) and Progress (% covered per topic) · Slide and image picker is a compact grid (src/components/materials/slide-chooser.tsx); images are extracted from PowerPoint, Word and PDF and kept in IndexedDB (src/services/storage/images.ts) · The question maker and “More detail” are rule-based and only use the slides' own text (src/services/ai/mock/coverage.ts, detail.ts); swap in a real model through src/services/ai (mcqSet, moreDetail).

> `scripts/gen-lucide-shim.mjs` only exists because the build environment was offline. With `lucide-react` installed from npm the build uses the real package automatically.

## Architecture

```
src/
  types/models.ts          Domain models: User, Material, SourceFile, Page, Topic, Question, Flashcard,
                           QuizAttempt, Answer, StudySession, SavedQuestion, StudyPlan, SummaryDoc…
  services/
    parsing/               File validation + PPTX / PDF / DOCX / TXT / image parsers, topic detection
    ai/                    AIProvider interface, grounded MockAIProvider, RemoteAIProvider, prompts + JSON schema
    db/                    Database interface + LocalDatabase (localStorage)
    storage/               FileStorage interface (session storage today)
    auth/                  AuthService interface (single local profile today)
    study/                 Spaced repetition (srs.ts), analytics & weak areas, revision planner
    export/                PDF, Word, CSV (Anki) and print worksheet renderers
    grounding.ts           Builds the page/topic payload sent to the AI (excluded pages are never sent)
  store/                   Immutable app state, actions (with undo), selectors
  components/              ui/ primitives, layout/, questions/, quiz/, flashcards/, tutor/, study/, …
  pages/                   One file per screen
```

The UI only talks to services through these interfaces, so each can be replaced without touching screens.

### Connecting a real AI model

`services/ai/index.ts` picks the provider. `RemoteAIProvider` posts to your backend (`POST {endpoint}/generate`, `/grade`, `/chat`, …) so API keys stay server-side. Use `GENERATION_SYSTEM_PROMPT`, `buildGenerationUserPrompt()` and `GENERATION_JSON_SCHEMA` from `services/ai/prompts.ts` on the server and return the same JSON shapes the mock returns. To try it in a browser: `localStorage.setItem("slidequiz:ai-endpoint", "https://your-api/ai")`.

The mock provider is deliberately grounded: every question, flashcard, summary line and chat answer is built from sentences in the selected pages and cites its slide/page.

### Database, auth, file storage

Implement `Database` (`services/db/types.ts`), `AuthService` and `FileStorage` against your backend (e.g. Postgres/Supabase, Clerk/Auth.js, S3) and swap the exported instances.

### Porting to Next.js

All screens are client components. Create `app/<route>/page.tsx` files marked `"use client"` that render the matching component from `src/pages`, replace `lib/router.tsx`'s `Link`/`navigate` with `next/link` / `useRouter`, and move `public/index.html`'s font links into `app/layout.tsx`.

## Keyboard shortcuts

`Ctrl/⌘ K` or `/` search · `U` upload · `?` shortcuts · Quiz: `1–4`, `Enter`, `←/→`, `F` · Flashcards: `Space`, `1/2/3`.
