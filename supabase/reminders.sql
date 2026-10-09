-- SlideQuiz review reminders: emails at the points where memory fades (1, 3, 6, 14 and 30 days after a lecture is made).
-- Paste into Supabase → SQL Editor and click Run. Then set up the daily schedule (bottom of this file).

-- One email a day at most per student (this also stops a double send if the job runs twice).
create table if not exists public.review_emails (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.review_emails enable row level security;

-- Who is due a reminder today, and for which lectures. Only lecture titles and dates are read, nothing else from the notes.
-- Leaves out: people who turned reminders off (in Settings or from an email), guests, unconfirmed emails,
-- lectures already revised today, and anyone already emailed today.
create or replace function public.reviews_due(p_days int[])
returns table (user_id uuid, email text, name text, items jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select (now() at time zone 'Europe/London')::date as t),
  mats as (
    select d.user_id,
           m->>'id' as id,
           left(coalesce(m->>'title', 'your lecture'), 120) as title,
           ((m->>'createdAt')::timestamptz at time zone 'Europe/London')::date as made,
           case when m->>'lastStudiedAt' ~ '^\d{4}-\d{2}-\d{2}T' then ((m->>'lastStudiedAt')::timestamptz at time zone 'Europe/London')::date end as studied
    from public.user_data d
    cross join lateral jsonb_array_elements(coalesce(d.data->'materials', '[]'::jsonb)) m
    where m->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T'
      and coalesce(d.data->'settings'->>'reviewEmails', 'true') <> 'false'
  )
  select u.id,
         u.email::text,
         split_part(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', ''), ' ', 1),
         jsonb_agg(jsonb_build_object('id', mats.id, 'title', mats.title, 'days', today.t - mats.made) order by mats.made desc)
  from mats
  join auth.users u on u.id = mats.user_id
  cross join today
  where (today.t - mats.made) = any(p_days)
    and (mats.studied is null or mats.studied < today.t)
    and not coalesce(u.is_anonymous, false)
    and u.email is not null
    and u.email_confirmed_at is not null
    and coalesce(u.raw_user_meta_data->>'no_reminders', '') <> 'true'
    and not exists (select 1 from public.review_emails r where r.user_id = u.id and r.day = today.t)
  group by u.id, u.email, u.raw_user_meta_data;
$$;
revoke all on function public.reviews_due(int[]) from public, anon, authenticated;
grant execute on function public.reviews_due(int[]) to service_role;

-- ---------------------------------------------------------------- daily schedule
-- Runs the "reminders" Edge Function every day at 16:30 UTC (17:30 UK time in summer, 16:30 in winter).
-- Replace PASTE_REMINDERS_KEY with the same value as the REMINDERS_KEY secret. Don't save the key in GitHub.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('review-reminders', '30 16 * * *', $cron$
--   select net.http_post(
--     url := 'https://oksfbksrfrqsbtmjqtfz.supabase.co/functions/v1/reminders',
--     headers := '{"Content-Type": "application/json", "x-reminders-key": "PASTE_REMINDERS_KEY"}'::jsonb,
--     body := '{}'::jsonb
--   );
-- $cron$);
