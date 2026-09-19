-- The release reset: archive the beta, wipe everything but the logins, names, admins and bans --------
--
-- The plan decided with the user (18 Sept 2026, "Release plan" in docs/build-log.md): at release the
-- invite key goes away and every account starts over -- stats, friends, settings and chats -- while every
-- beta tester who has a name keeps their login and that name, so they walk straight in as themselves.
--
-- What this script does, in order, all inside one transaction:
--   1. beta_archive: a schema the app cannot see (no grants), holding a full copy of every public table
--      as it was the moment before the wipe, plus the list of logins deleted in step 3. Drop it about a
--      month after release:  drop schema beta_archive cascade;
--   2. Wipe: every public table is emptied EXCEPT
--        profiles     -- kept, but reset to login + name (+ the invite key link): status, picture,
--                        bio, whisper setting and the welcome stamp are cleared, so release day welcomes
--                        everybody; region is kept (they picked it, it isn't a "stat")
--        admins       -- kept (AA.Romani.world)
--        bans         -- kept: a ban is a ban
--        access_keys  -- kept for the record (nothing checks them once INVITE_KEY_REQUIRED is off)
--      Everything else goes: room history, whispers, group chats, the Threads board, Ballot Box notes,
--      reactions, XP and levels, friends and requests, blocks, mutes/strikes, user and bug reports,
--      suggestions, every game and table, push subscriptions, the join IP log, waves and welcomes.
--      Storage buckets (avatars, thread-images, voice-notes, bug-reports, suggestions) are emptied by
--      hand from the dashboard -- deleting the rows here would leave the files orphaned.
--   3. Logins: every auth.users row that has no name in profiles is deleted (husks left behind when a
--      tester reclaimed their name on another device). Named logins -- anonymous or email -- stay.
--   4. Fresh start for the keepers: a user_stats row with the 100 XP starter purse (the profiles
--      trigger only fires on a NEW profile, and these are kept), and profiles.beta_tester = true on
--      every one of them, for a "Beta" badge later if the user wants one (nothing shows it yet).
--
-- PRACTICE RUN (do this first, on release day too):
--      begin;  set local gc.dryrun = '1';  <this file>  rollback;
--   With gc.dryrun set the script ends by raising, so nothing is kept, and the error text is the report:
--   every table's row count before and after, the archive's counts, the logins deleted, the keepers.
-- REAL RUN:  begin;  <this file>  commit;   -- read the notice, then commit (or rollback if it looks wrong).
--
-- Written and practice-run in September 2026; run it only on release day, with the room closed.

create schema if not exists beta_archive;
revoke all on schema beta_archive from public, anon, authenticated;

do $reset$
declare
  keep_tables text[] := array['profiles', 'admins', 'bans', 'access_keys'];
  t record; n bigint; before_counts jsonb := '{}'; after_counts jsonb := '{}';
  wipe_list text[] := '{}'; report text := ''; stamp text := to_char(now(), 'YYYY-MM-DD HH24:MI');
  named int; husks int; archived int := 0;
begin
  -- 1. archive -------------------------------------------------------------------------------------------
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('select count(*) from public.%I', t.tablename) into n;
    before_counts := before_counts || jsonb_build_object(t.tablename, n);
    execute format('drop table if exists beta_archive.%I', t.tablename);
    execute format('create table beta_archive.%I as select * from public.%I', t.tablename, t.tablename);
    archived := archived + 1;
    if not (t.tablename = any (keep_tables)) then wipe_list := wipe_list || t.tablename; end if;
  end loop;
  drop table if exists beta_archive.deleted_logins;
  create table beta_archive.deleted_logins as
    select u.id, u.created_at, u.last_sign_in_at, u.email, u.is_anonymous
    from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id and p.name is not null);
  drop table if exists beta_archive.kept_logins;
  create table beta_archive.kept_logins as
    select u.id, u.created_at, u.last_sign_in_at, u.email, u.is_anonymous, p.name
    from auth.users u join public.profiles p on p.user_id = u.id where p.name is not null;
  execute format('comment on schema beta_archive is %L', 'Beta archive taken ' || stamp || ' by release_reset.sql. Drop about a month after release.');

  -- 2. wipe ----------------------------------------------------------------------------------------------
  -- one TRUNCATE for all of them: if a kept table referenced a wiped one this would refuse, loudly,
  -- instead of CASCADE quietly emptying a keeper
  execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(wipe_list) x) || ' restart identity';
  update public.profiles
     set status_message = null, avatar_url = null, bio = null, whisper_policy = 'friends', welcomed_at = null,
         updated_at = now();

  -- 3. logins --------------------------------------------------------------------------------------------
  delete from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id and p.name is not null);
  get diagnostics husks = row_count;
  delete from public.profiles where name is null;

  -- 4. the keepers start fresh ---------------------------------------------------------------------------
  alter table public.profiles add column if not exists beta_tester boolean not null default false;
  update public.profiles set beta_tester = true where name is not null;
  insert into public.user_stats (user_id, bonus, bonus_granted)
    select user_id, 100, true from public.profiles where name is not null
    on conflict (user_id) do update set bonus = 100, bonus_granted = true;
  select count(*) into named from public.profiles where name is not null;

  -- the report ---------------------------------------------------------------------------------------------
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('select count(*) from public.%I', t.tablename) into n;
    after_counts := after_counts || jsonb_build_object(t.tablename, n);
    report := report || rpad(t.tablename, 24) || lpad((before_counts ->> t.tablename), 7) || ' -> ' || lpad(n::text, 6)
           || case when t.tablename = any (keep_tables) then '   kept' else '' end || chr(10);
  end loop;
  report := 'release reset ' || stamp || chr(10) || archived || ' tables archived into beta_archive' || chr(10)
         || husks || ' nameless logins deleted, ' || named || ' named logins kept with a 100 XP purse' || chr(10) || report;
  if current_setting('gc.dryrun', true) = '1' then
    raise exception E'PRACTICE RUN, rolled back:\n%', report;
  end if;
  raise notice '%', report;
end $reset$;

-- what the editor shows after a real run (the DO block's report only goes to the notice log)
select (select count(*) from public.profiles where name is not null) as keepers_with_names,
       (select count(*) from auth.users) as logins_left,
       (select count(*) from public.messages) as messages_left,
       (select sum(bonus) from public.user_stats) as purse_xp_handed_out,
       (select count(*) from pg_tables where schemaname = 'beta_archive') as archive_tables;
