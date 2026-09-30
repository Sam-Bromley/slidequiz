-- SlideQuiz AI and SlideQuiz Plus: a daily AI allowance per student, so AI costs can't run away,
-- and a bigger allowance for students who pay for Plus.
-- Run in Supabase → SQL Editor. Safe to run again.

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

-- Who has Plus. Only the "plus" helper (with Stripe) writes here; students can read their own row.
create table if not exists public.plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plus_until timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer text,
  stripe_subscription text,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

drop policy if exists "Read own plan" on public.plans;
create policy "Read own plan" on public.plans
  for select to authenticated using ((select auth.uid()) = user_id);

-- Adds this request's size to today's totals. Returns what's left for this student,
-- -1 if they've used their own allowance, or -2 if the whole site has used today's free allowance.
-- Limits (characters of slide text sent per day) can be changed here:
--   guests without an account:  200,000 (roughly 4–6 lectures)
--   students with an account:   400,000 (roughly 8–12 lectures)
--   students with Plus:       1,500,000 (roughly 30 lectures)
--   all free students together: 6,000,000 (a hard cap on the daily bill; Plus students don't count
--   towards it and aren't stopped by it, because they pay for their own use)
create or replace function public.use_ai(p_chars integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  site_total bigint;
  is_plus boolean := exists (select 1 from public.plans where user_id = auth.uid() and plus_until > now());
  daily_limit integer := case
    when is_plus then 1500000
    when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 200000
    else 400000 end;
  site_limit bigint := 6000000;
begin
  if not is_plus then
    select coalesce(sum(u.chars), 0) into site_total
    from public.ai_usage u
    where u.day = current_date
      and not exists (select 1 from public.plans p where p.user_id = u.user_id and p.plus_until > now());
    if site_total + p_chars > site_limit then
      return -2;
    end if;
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
