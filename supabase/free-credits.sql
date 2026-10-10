-- Free accounts get 5 credits a month (Pro 100). Run this once in Supabase → SQL Editor.
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
  -- Guests and accounts that aren't eligible for free credits start with none (Pro and bonus still count).
  base integer := (case when p = 'plus' then 100 when p = 'guest' then 0 when public.free_eligible(p_user) then 5 else 0 end) * lecture;
  used integer;
  bonus_used integer;
  bonus integer;
begin
  select coalesce(sum(chars), 0), coalesce(sum(from_bonus), 0) into used, bonus_used
  from public.ai_text
  where user_id = p_user and (p = 'guest' or month = date_trunc('month', now())::date);
  select coalesce((select balance from public.credit_bonus where user_id = p_user), 0) into bonus;
  -- Free credits already used this month by a deleted account on the same inbox.
  if p = 'free' then
    base := greatest(0, base - coalesce((
      select h.used from public.inbox_history h, auth.users u
      where u.id = p_user and h.inbox_hash = public.inbox_hash(u.email) and h.month = date_trunc('month', now())::date
    ), 0));
  end if;
  return json_build_object(
    'plan', p,
    'used', used,
    'allowance', base + bonus + bonus_used,
    'base', base,
    'bonus', bonus,
    'eligible', p = 'plus' or public.free_eligible(p_user),
    'lecture', lecture,
    'resets', case when p = 'guest' then null else (date_trunc('month', now()) + interval '1 month')::date end
  );
end;
$$;
