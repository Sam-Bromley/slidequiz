-- Inviting a friend gives you both 2 credits. Run this once in Supabase → SQL Editor.
-- Gives the friend and whoever invited them 2 bonus credits each, once: the friend must have joined
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
  reward integer := 2 * 30000;
begin
  select raw_user_meta_data ->> 'ref' as ref, email_confirmed_at, created_at, coalesce(is_anonymous, false) as anon
  into u from auth.users where id = p_user;
  if u.ref is null or u.email_confirmed_at is null or u.anon or u.created_at < now() - interval '30 days' then
    return false;
  end if;
  if exists (select 1 from public.invites where friend_id = p_user) or not public.free_eligible(p_user) then
    return false;
  end if;
  -- This inbox already earned an invite reward on an account that was deleted.
  if exists (select 1 from public.inbox_history h, auth.users au where au.id = p_user and h.inbox_hash = public.inbox_hash(au.email) and h.invited) then
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
