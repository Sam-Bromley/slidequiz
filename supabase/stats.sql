-- SlideQuiz stats. Paste into Supabase → SQL Editor and click Run.
-- Counts only: nothing here shows anyone's email, notes or files.

-- 1. Sign-ups per day, by where they came from
select
  u.created_at::date                                                         as day,
  coalesce(split_part(u.raw_user_meta_data->>'source', ' → ', 1), 'Before tracking') as came_from,
  count(*)                                                                   as sign_ups,
  count(*) filter (where u.email_confirmed_at is not null)                   as confirmed_email,
  count(*) filter (where jsonb_array_length(coalesce(d.data->'materials', '[]'::jsonb)) > 0) as made_a_lecture,
  count(*) filter (where d.updated_at > u.created_at + interval '1 day')     as came_back_another_day
from auth.users u
left join public.user_data d on d.user_id = u.id
where not coalesce(u.is_anonymous, false)
group by 1, 2
order by 1 desc, 3 desc;

-- 2. All time, by where they came from
select
  coalesce(split_part(u.raw_user_meta_data->>'source', ' → ', 1), 'Before tracking') as came_from,
  count(*)                                                                   as sign_ups,
  count(*) filter (where jsonb_array_length(coalesce(d.data->'materials', '[]'::jsonb)) > 0) as made_a_lecture,
  count(*) filter (where d.updated_at > u.created_at + interval '1 day')     as came_back_another_day
from auth.users u
left join public.user_data d on d.user_id = u.id
where not coalesce(u.is_anonymous, false)
group by 1
order by 2 desc;

-- 3. Which page people first landed on before signing up
select
  coalesce(nullif(split_part(u.raw_user_meta_data->>'source', ' → ', 2), ''), 'unknown') as landed_on,
  count(*) as sign_ups
from auth.users u
where not coalesce(u.is_anonymous, false)
group by 1
order by 2 desc;
