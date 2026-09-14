-- Name-impersonation fix -------------------------------------------------------------------
--
-- The Supabase security advisor flagged three ERRORS ("RLS references user metadata") on
-- public.messages, public.threads and public.thread_posts. All three INSERT policies checked
-- the display name against auth.jwt() -> 'user_metadata' ->> 'name'.
--
-- user_metadata is written by the user, not by the server -- join() sets it with a single
-- sb.auth.updateUser({ data: { name: n } }) call, and the anon key needed to do that is public
-- by design. So "your sender_name must match your token name" meant "your sender_name must
-- match whatever you chose to put in your own token", i.e. nothing. Combined with name
-- uniqueness being enforced only in the browser (app.js nameTaken(), which just reads the
-- presence list), anyone could post, start threads and reply under any regular's name.
--
-- Fix: move the display name into public.profiles, which is writable only by its owner under
-- the existing "update own profile" / "insert own profile" policies, and give it a unique index
-- so one name maps to exactly one account. The policies then compare against that instead.
--
-- Claims are released after 30 days of not signing on: anonymous sessions churn (clearing
-- storage gets you a new user id), so a permanent claim would slowly burn the name pool and
-- lock regulars out of their own names after a browser reset.

-- 1. Storage for the authoritative name ------------------------------------------------------
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists name_seen_at timestamptz;

-- Backfill from the metadata names that were in use, keeping the most recently active account
-- when two users had claimed the same name (15 distinct names across 17 named accounts).
insert into public.profiles (user_id, name, name_seen_at)
select u.id, u.raw_user_meta_data ->> 'name', coalesce(u.last_sign_in_at, u.created_at)
from auth.users u
where u.raw_user_meta_data ->> 'name' is not null
  and u.id = (
    select u2.id from auth.users u2
    where lower(u2.raw_user_meta_data ->> 'name') = lower(u.raw_user_meta_data ->> 'name')
    order by coalesce(u2.last_sign_in_at, u2.created_at) desc, u2.id
    limit 1
  )
on conflict (user_id) do update
  set name = excluded.name, name_seen_at = excluded.name_seen_at;

create unique index if not exists profiles_name_unique
  on public.profiles (lower(name)) where name is not null;

-- 2. claim_name(): the only way a name gets written ------------------------------------------
-- SECURITY DEFINER so it can release another account's stale claim; identity always comes from
-- auth.uid(), never from a parameter. Returns {ok:false, reason:'taken'} rather than raising so
-- the client can show the same "that name is already taken" message it always has.
create or replace function public.claim_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- same rule the client enforces: 2-16 letters, numbers, spaces or . ' -
  if p_name is null or p_name !~ '^[\w .''-]{2,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- release the name if whoever holds it hasn't signed on in 30 days
  update public.profiles
    set name = null
    where lower(name) = lower(p_name)
      and user_id <> uid
      and (name_seen_at is null or name_seen_at < now() - interval '30 days');

  begin
    insert into public.profiles (user_id, name, name_seen_at)
      values (uid, p_name, now())
      on conflict (user_id) do update
        set name = excluded.name, name_seen_at = now();
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'name', p_name);
end;
$fn$;

grant execute on function public.claim_name(text) to anon, authenticated;

-- 3. Point the three INSERT policies at profiles.name ----------------------------------------
-- Everything else in each policy (ownership, the recipient rule on messages, the ban and
-- mute/cooldown checks) is unchanged; only the name source moves.
drop policy if exists "send as self" on public.messages;
create policy "send as self" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = (select p.name from public.profiles p where p.user_id = auth.uid())
    and (recipient_id is null or recipient_id <> auth.uid())
    and (not is_banned(auth.uid()))
    and (recipient_id is null or not has_blocked(recipient_id, auth.uid()))
    and (not is_muted_or_cooling(auth.uid()))
  );

drop policy if exists "start thread as self" on public.threads;
create policy "start thread as self" on public.threads for insert to authenticated
  with check (
    op_id = auth.uid()
    and op_name = (select p.name from public.profiles p where p.user_id = auth.uid())
    and (not is_banned(auth.uid()))
    and (not is_muted_or_cooling(auth.uid()))
  );

drop policy if exists "reply as self" on public.thread_posts;
create policy "reply as self" on public.thread_posts for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = (select p.name from public.profiles p where p.user_id = auth.uid())
    and (not is_banned(auth.uid()))
    and (not is_muted_or_cooling(auth.uid()))
  );
