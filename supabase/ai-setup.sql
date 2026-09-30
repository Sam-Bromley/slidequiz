-- SlideQuiz AI allowances and SlideQuiz Plus.
-- Run in Supabase → SQL Editor. Safe to run again (it keeps everyone's usage).
--
-- AI LECTURES (notes and practice questions)
--   1 lecture = up to 30,000 characters of slide text (about 5,000 words, a normal 50–60 slide lecture).
--   Longer files count as more than one, so merging files into one big file doesn't get more.
--   The same text is only ever counted once a month (notes and questions for one lecture = one charge,
--   and "Try again" after a failure is free).
--     without an account: 2 lectures to try (in total, not monthly)
--     free account:      10 lectures a month
--     Pro:              100 lectures a month
--   Safety net: all free students together can use up to 2,000,000 characters of new text a day
--   (roughly 70–100 lectures, a few pounds). Plus students aren't limited by it.
--
-- FAIR USE (flashcards and "Ask about these notes", which are cheap): characters sent per day
--     without an account: 100,000 · free account: 300,000 · Plus: 1,500,000
--     all free students together: 1,000,000 a day

-- ---------------------------------------------------------------- who has Plus
-- Only the "plus" helper (with Stripe) writes here; students can read their own row.
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

-- "guest", "free" or "plus" for whoever is asking.
create or replace function public.sq_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.plans where user_id = auth.uid() and plus_until > now()) then 'plus'
    when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 'guest'
    else 'free'
  end
$$;

-- ---------------------------------------------------------------- AI lectures
create table if not exists public.ai_text (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null default date_trunc('month', now())::date,
  hash text not null,
  chars integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month, hash)
);
create index if not exists ai_text_created on public.ai_text (created_at);
alter table public.ai_text enable row level security;
drop policy if exists "Read own AI text" on public.ai_text;
create policy "Read own AI text" on public.ai_text
  for select to authenticated using ((select auth.uid()) = user_id);

-- What the student has used and has left (the website shows this).
create or replace function public.ai_allowance()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p text := public.sq_plan();
  lecture integer := 30000;
  allowance integer := (case p when 'plus' then 100 when 'guest' then 2 else 10 end) * lecture;
  used integer;
begin
  select coalesce(sum(chars), 0) into used
  from public.ai_text
  where user_id = auth.uid() and (p = 'guest' or month = date_trunc('month', now())::date);
  return json_build_object(
    'plan', p,
    'used', used,
    'allowance', allowance,
    'lecture', lecture,
    'resets', case when p = 'guest' then null else (date_trunc('month', now()) + interval '1 month')::date end
  );
end;
$$;

-- Counts a piece of slide text against the allowance. Returns a positive number if it's fine,
-- -1 if the student's allowance is used up, or -2 if all free students have used today's safety net.
create or replace function public.use_lecture_text(p_hash text, p_chars integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a json;
  p text;
  used integer;
  allowance integer;
  site bigint;
  site_limit bigint := 2000000;
begin
  if auth.uid() is null or p_chars < 0 then
    return -1;
  end if;
  a := public.ai_allowance();
  p := a ->> 'plan';
  used := (a ->> 'used')::integer;
  allowance := (a ->> 'allowance')::integer;
  -- Already counted (the questions after the notes, or a retry): free.
  if exists (
    select 1 from public.ai_text
    where user_id = auth.uid() and hash = p_hash and (p = 'guest' or month = date_trunc('month', now())::date)
  ) then
    return 1;
  end if;
  -- A little leeway so a lecture that only just fits isn't cut off halfway.
  if used + p_chars > allowance + 5000 then
    return -1;
  end if;
  if p <> 'plus' then
    select coalesce(sum(t.chars), 0) into site
    from public.ai_text t
    where t.created_at >= date_trunc('day', now())
      and not exists (select 1 from public.plans pl where pl.user_id = t.user_id and pl.plus_until > now());
    if site + p_chars > site_limit then
      return -2;
    end if;
  end if;
  insert into public.ai_text (user_id, hash, chars) values (auth.uid(), p_hash, p_chars)
  on conflict do nothing;
  return greatest(allowance - used - p_chars, 0) + 1;
end;
$$;

-- ---------------------------------------------------------------- fair use (flashcards, questions about notes)
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

-- Returns what's left today, -1 if this student has used today's fair use, -2 if everyone has.
create or replace function public.use_ai(p_chars integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  site_total bigint;
  p text := public.sq_plan();
  daily_limit integer := case p when 'plus' then 1500000 when 'guest' then 100000 else 300000 end;
  site_limit bigint := 1000000;
begin
  if p <> 'plus' then
    select coalesce(sum(u.chars), 0) into site_total
    from public.ai_usage u
    where u.day = current_date
      and not exists (select 1 from public.plans pl where pl.user_id = u.user_id and pl.plus_until > now());
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

-- ---------------------------------------------------------------- who may call what
revoke execute on function public.sq_plan() from public, anon;
revoke execute on function public.ai_allowance() from public, anon;
revoke execute on function public.use_lecture_text(text, integer) from public, anon;
revoke execute on function public.use_ai(integer) from public, anon;
grant execute on function public.sq_plan() to authenticated;
grant execute on function public.ai_allowance() to authenticated;
grant execute on function public.use_lecture_text(text, integer) to authenticated;
grant execute on function public.use_ai(integer) to authenticated;
