-- The first-hour package: a welcome with names, waves, and a region on the profile (build 175) ---------
--
-- What a brand-new person with no friends yet can do in their first hour. Three server-side pieces:
--
--   * profiles.region      an optional, fixed-list region picked at sign-on (or later from your own name
--                          menu): usa, canada, uk_ie, europe, latam, anz, elsewhere. Shown as a small muted
--                          tag beside names; the welcome line lists people from the same region first.
--                          claim_name() takes it as a third, optional argument -- the old calls
--                          (p_name alone, or p_name + p_key) keep working, and a call without a region
--                          never erases one that is already set.
--
--   * welcome_newcomer()   called by the browser once, right after its first successful claim_name.
--                          The first time an account signs on with a name it stamps profiles.welcomed_at
--                          and writes one row to public.welcomes, which is on realtime: every open
--                          browser draws "🎉 <name> just walked in -- say hi!" from that INSERT (system
--                          lines are client-only in this app, so the row is the server-set, spoof-proof
--                          cue), and the newcomer's own browser draws its local "Here now: ..." line from
--                          the function's answer. A second call, a rename, or a reload does nothing:
--                          welcomed_at is set exactly once per account. Existing accounts are stamped by
--                          this migration, so nobody who was here before build 175 is welcomed twice.
--
--   * wave(p_target)       a one-tap 👋 that needs no friendship: one row in public.waves, which the
--                          target's browser gets live and shows as "<name> waved at you 👋" with a "Wave
--                          back". Throttled to 1 wave per target per day and 20 a day in all; refused for
--                          anyone banned, muted or cooling down (the same is_banned / is_muted_or_cooling
--                          every send policy uses) and across a block in either direction (has_blocked).
--                          The wave back is just wave() the other way, so it has its own daily slot.
--
-- Every function here is security definer with search_path = public; browsers can only call the three
-- verbs, and can only read (never write) the two tables. Run once in the Supabase SQL Editor, after
-- beta_key_name_reclaim.sql (it replaces claim_name) -- practice run first:
--   begin;  <this file>  <first_hour_dryrun.sql>  rollback;

-- 1. Region and the welcome stamp on profiles --------------------------------------------------------------
alter table public.profiles add column if not exists region text;
alter table public.profiles drop constraint if exists profiles_region_check;
alter table public.profiles add constraint profiles_region_check
  check (region is null or region in ('usa', 'canada', 'uk_ie', 'europe', 'latam', 'anz', 'elsewhere'));
alter table public.profiles add column if not exists welcomed_at timestamptz;

-- Everyone who already has a character is not a newcomer: stamp them now, so the welcome line fires only
-- for accounts that pick their first name after this runs. (The release reset recreates the profiles, so
-- everybody gets a proper welcome then.)
update public.profiles set welcomed_at = now() where welcomed_at is null and name is not null;

-- 2. claim_name(): now takes an optional region ------------------------------------------------------------
-- Same body as beta_key_name_reclaim.sql (identity from auth.uid(), the format check, the invite-key early
-- release, the unique index doing the enforcing) plus one thing: p_region, kept only when it is one of the
-- fixed list, written on a first claim, and on a later claim only when given (a resumed session or a
-- rename never sends one, and must not blank it). Both old overloads go, so PostgREST has exactly one
-- claim_name to pick whichever arguments the browser sends.
drop function if exists public.claim_name(text);
drop function if exists public.claim_name(text, text);

create or replace function public.claim_name(p_name text, p_key text default null, p_region text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  uid uuid := auth.uid();
  key_id bigint;
  holder record;
  reg text := case when p_region in ('usa', 'canada', 'uk_ie', 'europe', 'latam', 'anz', 'elsewhere') then p_region else null end;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- same rule the client enforces: 2-16 letters (any script), numbers, spaces or . ' - or _
  if p_name is null or p_name !~ '^[[:alpha:][:digit:]_ .''-]{2,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if p_key is not null and p_key <> '' then
    select id into key_id from public.access_keys where code = p_key and not revoked;
  end if;

  select user_id, access_key_id, name_seen_at into holder
    from public.profiles where lower(name) = lower(p_name) and user_id <> uid;

  if holder.user_id is not null then
    if key_id is not null and holder.access_key_id is not null and holder.access_key_id = key_id then
      -- the same beta tester back on another device: release the name at once
      update public.profiles set name = null where user_id = holder.user_id;
    else
      -- a stranger: only a name nobody has used in 30 days is up for grabs
      update public.profiles set name = null
        where user_id = holder.user_id
          and (name_seen_at is null or name_seen_at < now() - interval '30 days');
    end if;
  end if;

  begin
    insert into public.profiles (user_id, name, name_seen_at, access_key_id, region)
      values (uid, p_name, now(), key_id, reg)
      on conflict (user_id) do update
        set name = excluded.name, name_seen_at = now(),
            access_key_id = coalesce(excluded.access_key_id, public.profiles.access_key_id),
            region = coalesce(excluded.region, public.profiles.region);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'name', p_name, 'region', (select region from public.profiles where user_id = uid));
end;
$fn$;

revoke execute on function public.claim_name(text, text, text) from public;
grant execute on function public.claim_name(text, text, text) to anon, authenticated;

-- 3. The welcome ---------------------------------------------------------------------------------------------
create table if not exists public.welcomes (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  name       text        not null,
  region     text,
  created_at timestamptz not null default now()
);
create index if not exists welcomes_created on public.welcomes (created_at);

alter table public.welcomes enable row level security;
drop policy if exists "see the welcomes" on public.welcomes;
create policy "see the welcomes" on public.welcomes for select to authenticated using (true);
revoke all on public.welcomes from anon, authenticated;
grant select on public.welcomes to authenticated;

-- Once per account: stamp the profile and post the row the other browsers draw the line from. Answers
-- {ok, fresh, name, region}; fresh is true only on the one call that did the welcoming.
create or replace function public.welcome_newcomer() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.user_id is null or p.name is null then return jsonb_build_object('ok', false, 'reason', 'no_name'); end if;
  if p.welcomed_at is not null then return jsonb_build_object('ok', true, 'fresh', false, 'name', p.name, 'region', p.region); end if;
  if public.is_banned(auth.uid()) then return jsonb_build_object('ok', false, 'reason', 'banned'); end if;
  update public.profiles set welcomed_at = now() where user_id = auth.uid();
  delete from public.welcomes where created_at < now() - interval '1 day';     -- housekeeping, no scheduler
  insert into public.welcomes (user_id, name, region) values (auth.uid(), p.name, p.region)
    on conflict (user_id) do update set name = excluded.name, region = excluded.region, created_at = now();
  return jsonb_build_object('ok', true, 'fresh', true, 'name', p.name, 'region', p.region);
end $$;

revoke execute on function public.welcome_newcomer() from public, anon;
grant execute on function public.welcome_newcomer() to authenticated, service_role;

-- 4. Waves -------------------------------------------------------------------------------------------------------
create table if not exists public.waves (
  id         bigint      generated always as identity primary key,
  from_id    uuid        not null references auth.users(id) on delete cascade,
  from_name  text,
  to_id      uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists waves_from on public.waves (from_id, created_at desc);
create index if not exists waves_to on public.waves (to_id, created_at desc);

alter table public.waves enable row level security;
drop policy if exists "my waves" on public.waves;
create policy "my waves" on public.waves for select to authenticated using (to_id = auth.uid() or from_id = auth.uid());
revoke all on public.waves from anon, authenticated;
grant select on public.waves to authenticated;

-- Answers {ok:true, id} or {ok:false, reason}: self, unknown, muted (banned, muted or cooling down),
-- blocked (either direction), already (this person today), limit (20 today).
create or replace function public.wave(p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nm text; w public.waves;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  if p_target is null or p_target = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if public.is_banned(auth.uid()) or public.is_muted_or_cooling(auth.uid()) then return jsonb_build_object('ok', false, 'reason', 'muted'); end if;
  if not exists (select 1 from public.profiles where user_id = p_target and name is not null) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if public.has_blocked(p_target, auth.uid()) or public.has_blocked(auth.uid(), p_target) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
  delete from public.waves where created_at < now() - interval '2 days';      -- housekeeping, no scheduler
  if (select count(*) from public.waves where from_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;
  if exists (select 1 from public.waves where from_id = auth.uid() and to_id = p_target and created_at > now() - interval '1 day') then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  select name into nm from public.profiles where user_id = auth.uid();
  insert into public.waves (from_id, from_name, to_id) values (auth.uid(), nm, p_target) returning * into w;
  return jsonb_build_object('ok', true, 'id', w.id);
end $$;

revoke execute on function public.wave(uuid) from public, anon;
grant execute on function public.wave(uuid) to authenticated, service_role;

-- 5. PostgREST re-reads the function list (claim_name changed shape) and realtime: the two tables browsers listen to, on a channel of their own in the client -----------------
do $$
declare t text;
begin
  foreach t in array array['welcomes', 'waves'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
