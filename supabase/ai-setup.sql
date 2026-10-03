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
-- CREDITS also pay for: flashcards (about the same as the lecture text), written answer questions
--   (half of that per set) and essay feedback (1 credit each).
-- BONUS CREDITS (from inviting friends) don't expire: they're used once the monthly credits run out.
--   Inviting a friend: both get 3 once the friend has confirmed their email and made their first
--   lecture (up to 10 friends a month).
--
-- FAIR USE ("Ask about these notes", marking written answers, essay questions; cheap): characters sent per day
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

-- ---------------------------------------------------------------- bonus credits and invites
-- Bonus credits, in characters (1 credit = 30,000). Only the database functions change these.
create table if not exists public.credit_bonus (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0)
);
alter table public.credit_bonus enable row level security;
-- How much of each charge came out of bonus credits (so this month's total stays right).
alter table public.ai_text add column if not exists from_bonus integer not null default 0;

-- Each student's invite code (the ?ref= in their link).
create table if not exists public.invite_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique
);
alter table public.invite_codes enable row level security;

-- Friends who joined through an invite (each friend only counts once).
create table if not exists public.invites (
  friend_id uuid primary key references auth.users(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists invites_inviter on public.invites (inviter_id, created_at);
alter table public.invites enable row level security;

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
  base integer := (case p when 'plus' then 100 when 'guest' then 2 else 10 end) * lecture;
  used integer;
  bonus_used integer;
  bonus integer;
begin
  select coalesce(sum(chars), 0), coalesce(sum(from_bonus), 0) into used, bonus_used
  from public.ai_text
  where user_id = p_user and (p = 'guest' or month = date_trunc('month', now())::date);
  select coalesce((select balance from public.credit_bonus where user_id = p_user), 0) into bonus;
  return json_build_object(
    'plan', p,
    'used', used,
    'allowance', base + bonus + bonus_used,
    'base', base,
    'bonus', bonus,
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

-- Gives the friend and whoever invited them 3 bonus credits each, once: the friend must have joined
-- in the last 30 days with an invite code, confirmed their email, and not be the inviter. Each
-- inviter is rewarded for up to 10 friends a month.
create or replace function public.reward_invite(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  inviter uuid;
  added integer;
  reward integer := 3 * 30000;
begin
  select raw_user_meta_data ->> 'ref' as ref, email_confirmed_at, created_at, coalesce(is_anonymous, false) as anon
  into u from auth.users where id = p_user;
  if u.ref is null or u.email_confirmed_at is null or u.anon or u.created_at < now() - interval '30 days' then
    return false;
  end if;
  if exists (select 1 from public.invites where friend_id = p_user) then
    return false;
  end if;
  select user_id into inviter from public.invite_codes where code = upper(trim(u.ref));
  if inviter is null or inviter = p_user then
    return false;
  end if;
  if (select count(*) from public.invites where inviter_id = inviter and created_at >= date_trunc('month', now())) >= 10 then
    return false;
  end if;
  insert into public.invites (friend_id, inviter_id) values (p_user, inviter) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 0 then
    return false;
  end if;
  insert into public.credit_bonus (user_id, balance) values (p_user, reward), (inviter, reward)
  on conflict (user_id) do update set balance = public.credit_bonus.balance + excluded.balance;
  return true;
end;
$$;

-- The student's invite link code (made the first time), and how many friends have joined.
create or replace function public.my_invite()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c text;
begin
  if me is null or public.plan_for(me) = 'guest' then
    return null;
  end if;
  select code into c from public.invite_codes where user_id = me;
  while c is null loop
    -- 7 letters and numbers, without ones that are easy to mix up (0/O, 1/I/L).
    c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 7));
    begin
      insert into public.invite_codes (user_id, code) values (me, c);
    exception when unique_violation then
      c := (select code from public.invite_codes where user_id = me);
    end;
  end loop;
  return json_build_object(
    'code', c,
    'month', (select count(*) from public.invites where inviter_id = me and created_at >= date_trunc('month', now())),
    'total', (select count(*) from public.invites where inviter_id = me),
    'max', 10,
    'reward', 3
  );
end;
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
  base integer;
  bonus integer;
  take integer;
  added integer;
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
  -- Past the monthly credits: the rest comes out of bonus credits.
  base := (a ->> 'base')::integer;
  bonus := (a ->> 'bonus')::integer;
  take := least(bonus, greatest(used + p_chars - base, 0) - greatest(used - base, 0));
  insert into public.ai_text (user_id, hash, chars, from_bonus) values (p_user, p_hash, p_chars, take)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 and take > 0 then
    update public.credit_bonus set balance = balance - take where user_id = p_user;
  end if;
  -- A friend who joined through an invite has now made their first lecture: reward them both.
  if added > 0 and p <> 'guest' then
    perform public.reward_invite(p_user);
  end if;
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
revoke execute on function public.reward_invite(uuid) from public, anon, authenticated;
grant execute on function public.reward_invite(uuid) to service_role;
revoke execute on function public.my_invite() from public, anon;
grant execute on function public.my_invite() to authenticated;
revoke execute on function public.sq_plan() from public, anon;
revoke execute on function public.ai_allowance() from public, anon;
grant execute on function public.sq_plan() to authenticated;
grant execute on function public.ai_allowance() to authenticated;
