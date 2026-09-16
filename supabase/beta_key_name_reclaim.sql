-- Beta testers reclaiming their own name on a new device --------------------------------------
--
-- claim_name() (see name_claim_security_fix.sql / international_names_feature.sql) only ever
-- released a name early for one reason: the holder hadn't signed on in 30 days. That's the right
-- default for strangers, but it broke a real workflow for beta testers: testing is invite-only
-- (access_keys_feature.sql), each tester has their own key, and every fresh join is anonymous
-- (join()/app.js signs in with signInAnonymously()), which mints a BRAND NEW auth.uid with no
-- link back to whatever uid this same person used last time. So a tester who signs in on a
-- second device -- or just clears their browser storage -- looks, to the database, exactly like
-- a stranger trying to steal an active name off someone else's still-live session, and gets
-- "That name is already taken." even though it's the same person typing their own name back in.
--
-- Fix: the invite key IS a reliable cross-device identity for a beta tester (one key per tester,
-- and it's already IP-locked -- see access_keys_ip_lock.sql), so let a name transfer immediately,
-- skipping the 30-day wait, whenever the account asking for a name and the account currently
-- holding it were both claimed with the SAME access key. Anyone without a matching key still
-- gets the original 30-day-stale rule -- this never lets a stranger take an active name.
--
-- Run this once in the Supabase SQL Editor (after access_keys_feature.sql, which it references).

-- 1. Remember which invite key a profile was claimed with -----------------------------------
alter table public.profiles
  add column if not exists access_key_id bigint references public.access_keys(id) on delete set null;

-- 2. claim_name(): now takes the invite key the client just verified at the gate, and uses it
--    only to decide whether an *early* release is justified -- everything else about the
--    function (identity from auth.uid(), the name-format check, the unique index doing the
--    actual enforcement) is unchanged from international_names_feature.sql.
drop function if exists public.claim_name(text);

create or replace function public.claim_name(p_name text, p_key text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  uid uuid := auth.uid();
  key_id bigint;
  holder record;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- same rule the client enforces: 2-16 letters (any script), numbers, spaces or . ' - or _
  if p_name is null or p_name !~ '^[[:alpha:][:digit:]_ .''-]{2,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Resolve the invite key this login presented to a real, non-revoked access_keys row. Runs as
  -- the function owner (security definer), so -- same as the profiles writes below -- this
  -- bypasses access_keys' own "no policies at all, service-role only" lockout; a plain
  -- anon/authenticated caller still can't read that table any other way.
  if p_key is not null and p_key <> '' then
    select id into key_id from public.access_keys where code = p_key and not revoked;
  end if;

  -- Whoever currently holds this name, if anyone other than the caller.
  select user_id, access_key_id, name_seen_at into holder
    from public.profiles where lower(name) = lower(p_name) and user_id <> uid;

  if holder.user_id is not null then
    if key_id is not null and holder.access_key_id is not null and holder.access_key_id = key_id then
      -- Same beta invite key as whoever holds the name right now -- this is that tester back on
      -- a different device (or a cleared browser), not a stranger squatting on it. Release it
      -- immediately; no need to wait out the 30-day staleness window below.
      update public.profiles set name = null where user_id = holder.user_id;
    else
      -- Can't prove it's the same person: fall back to the original rule -- only a name nobody
      -- has used in 30 days is up for grabs, so a live session can't be squatted out from under
      -- whoever's actually still using it.
      update public.profiles set name = null
        where user_id = holder.user_id
          and (name_seen_at is null or name_seen_at < now() - interval '30 days');
    end if;
  end if;

  begin
    insert into public.profiles (user_id, name, name_seen_at, access_key_id)
      values (uid, p_name, now(), key_id)
      on conflict (user_id) do update
        set name = excluded.name, name_seen_at = now(),
            -- Keep whatever key this uid was already linked to if this particular call didn't
            -- present one (e.g. a resumed session, which never re-sends the invite key) --
            -- never erase a real link with a null.
            access_key_id = coalesce(excluded.access_key_id, public.profiles.access_key_id);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'name', p_name);
end;
$fn$;

grant execute on function public.claim_name(text, text) to anon, authenticated;
