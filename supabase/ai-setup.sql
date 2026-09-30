-- SlideQuiz AI: a daily allowance per student, so AI costs can't run away.
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  chars integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

drop policy if exists "Read own AI usage" on public.ai_usage;
create policy "Read own AI usage" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- Adds this request's size to today's totals. Returns what's left for this student,
-- -1 if they've used their own allowance, or -2 if the whole site has used today's allowance.
-- Limits (characters of slide text sent per day) can be changed here:
--   students with an account: 400,000 (roughly 6–10 lectures)
--   guests without an account: 200,000
--   the whole site together:  6,000,000 (a hard cap on the daily AI bill)
create or replace function public.use_ai(p_chars integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  site_total bigint;
  daily_limit integer := case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 200000 else 400000 end;
  site_limit bigint := 6000000;
begin
  select coalesce(sum(chars), 0) into site_total from public.ai_usage where day = current_date;
  if site_total + p_chars > site_limit then
    return -2;
  end if;
  insert into public.ai_usage (user_id, day, chars)
  values (auth.uid(), current_date, p_chars)
  on conflict (user_id, day) do update set chars = public.ai_usage.chars + excluded.chars
  returning chars into used;
  if used > daily_limit then
    update public.ai_usage set chars = chars - p_chars where user_id = auth.uid() and day = current_date;
    return -1;
  end if;
  return daily_limit - used;
end;
$$;

revoke execute on function public.use_ai(integer) from public, anon;
grant execute on function public.use_ai(integer) to authenticated;
