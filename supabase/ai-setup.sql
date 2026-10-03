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

-- "guest", "free" or "plus" for a given account.
create or replace function public.plan_for(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.plans where user_id = p_user and plus_until > now()) then 'plus'
    when coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false) then 'guest'
    else 'free'
  end
$$;

-- The same, for whoever is asking.
create or replace function public.sq_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_for(auth.uid())
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

-- What an account has used and has left.
create or replace function public.allowance_for(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p text := public.plan_for(p_user);
  lecture integer := 30000;
  allowance integer := (case p when 'plus' then 100 when 'guest' then 2 else 10 end) * lecture;
  used integer;
begin
  select coalesce(sum(chars), 0) into used
  from public.ai_text
  where user_id = p_user and (p = 'guest' or month = date_trunc('month', now())::date);
  return json_build_object(
    'plan', p,
    'used', used,
    'allowance', allowance,
    'lecture', lecture,
    'resets', case when p = 'guest' then null else (date_trunc('month', now()) + interval '1 month')::date end
  );
end;
$$;

-- What the student asking has used and has left (the website shows this).
create or replace function public.ai_allowance()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select public.allowance_for(auth.uid())
$$;

-- Counts a piece of slide text against the allowance. Returns a positive number if it's fine,
-- -1 if the student's allowance is used up, or -2 if all free students have used today's safety net.
-- Only the AI helper (the server) can call this, so nobody can skip their own limits.
drop function if exists public.use_lecture_text(text, integer);
create or replace function public.use_lecture_text(p_user uuid, p_hash text, p_chars integer)
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
  if p_user is null or p_chars is null or p_chars <= 0 or coalesce(p_hash, '') = '' then
    return -1;
  end if;
  a := public.allowance_for(p_user);
  p := a ->> 'plan';
  used := (a ->> 'used')::integer;
  allowance := (a ->> 'allowance')::integer;
  -- Already counted (the questions after the notes, or a retry): free.
  if exists (
    select 1 from public.ai_text
    where user_id = p_user and hash = p_hash and (p = 'guest' or month = date_trunc('month', now())::date)
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
  insert into public.ai_text (user_id, hash, chars) values (p_user, p_hash, p_chars)
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
-- Only the AI helper (the server) can call this.
drop function if exists public.use_ai(integer);
create or replace function public.use_ai(p_user uuid, p_chars integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  site_total bigint;
  p text := public.plan_for(p_user);
  daily_limit integer := case p when 'plus' then 1500000 when 'guest' then 100000 else 300000 end;
  site_limit bigint := 1000000;
begin
  if p_user is null or p_chars is null or p_chars <= 0 then
    return -1;
  end if;
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
  values (p_user, current_date, p_chars)
  on conflict (user_id, day) do update set chars = public.ai_usage.chars + excluded.chars
  returning chars into used;
  if used > daily_limit then
    update public.ai_usage set chars = chars - p_chars where user_id = p_user and day = current_date;
    return -1;
  end if;
  return daily_limit - used;
end;
$$;

-- ---------------------------------------------------------------- who may call what
-- The website may read the student's own plan and allowance. Counting usage is server-only.
revoke execute on function public.plan_for(uuid) from public, anon, authenticated;
revoke execute on function public.allowance_for(uuid) from public, anon, authenticated;
revoke execute on function public.use_lecture_text(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.use_ai(uuid, integer) from public, anon, authenticated;
grant execute on function public.plan_for(uuid) to service_role;
grant execute on function public.allowance_for(uuid) to service_role;
grant execute on function public.use_lecture_text(uuid, text, integer) to service_role;
grant execute on function public.use_ai(uuid, integer) to service_role;
revoke execute on function public.sq_plan() from public, anon;
revoke execute on function public.ai_allowance() from public, anon;
grant execute on function public.sq_plan() to authenticated;
grant execute on function public.ai_allowance() to authenticated;
