-- Counts of things going wrong when SlideQuiz writes notes, questions or flashcards.
-- Paste into Supabase → SQL Editor and click Run once. Nothing about the student is saved: just when, which task and roughly why.
create table if not exists public.ai_failures (
  id bigserial primary key,
  at timestamptz not null default now(),
  task text not null,
  reason text not null
);
alter table public.ai_failures enable row level security;
create index if not exists ai_failures_at on public.ai_failures (at);

-- To see the last week (run this whenever you like):
-- select (at at time zone 'Europe/London')::date as day, task, reason, count(*)
-- from public.ai_failures where at > now() - interval '7 days'
-- group by 1, 2, 3 order by 1 desc, 4 desc;
