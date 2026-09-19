-- Rolled-back tests for first_hour_feature.sql.
-- Run as:  begin;  <first_hour_feature.sql>  <this file>  rollback;
-- Ends by raising, so it can never commit; the results come back in the error text. Needs
-- beta_key_name_reclaim.sql (access_keys), the moderation helpers (is_banned, is_muted_or_cooling,
-- has_blocked) and starter_purse_feature.sql (its trigger on profiles) already in place.

create function pg_temp.ck(label text, ok boolean, info text default '') returns void language plpgsql as $f$
begin
  perform set_config('gr.log', coalesce(current_setting('gr.log', true), '')
    || case when coalesce(ok, false) then 'ok   ' else 'FAIL ' end || label
    || case when coalesce(info, '') <> '' then ' [' || info || ']' else '' end || chr(10), true);
  if not coalesce(ok, false) then
    perform set_config('gr.fails', (coalesce(nullif(current_setting('gr.fails', true), ''), '0')::int + 1)::text, true);
  end if;
end $f$;
create function pg_temp.as_user(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true) $f$;
create function pg_temp.as_nobody() returns void language sql as $f$
  select set_config('request.jwt.claims', '{}', true) $f$;
create function pg_temp.prof(p uuid) returns text language sql security definer as $f$
  select coalesce((select coalesce(name, '-') || '/' || coalesce(region, '-') || '/' || case when welcomed_at is null then 'new' else 'welcomed' end from public.profiles where user_id = p), 'none') $f$;
-- run one statement as a signed-in person (the real authenticated role, so RLS and grants apply);
-- returns the error text, or '' if it went through
create function pg_temp.try_as(p uuid, q text) returns text language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute q;
  exception when others then
    reset role;
    return sqlerrm;
  end;
  reset role;
  return '';
end $f$;
create function pg_temp.count_as(p uuid, q text) returns int language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute q into n;
  reset role;
  return n;
end $f$;
create function pg_temp.can_exec(r text, fn text) returns boolean language sql as $f$
  select has_function_privilege(r, fn, 'execute') $f$;
-- block a person in whichever shape the blocks table has (production: blocker_id / blocked_id)
create function pg_temp.block(blocker uuid, target uuid) returns void language plpgsql security definer as $f$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'blocks' and column_name = 'blocker_id') then
    insert into public.blocks (blocker_id, blocked_id) values (blocker, target);
  else
    execute 'insert into public.blocks (blocker, target) values ($1, $2)' using blocker, target;
  end if;
end $f$;
-- mute a person in whichever shape the moderation table has (production: chat_moderation)
create function pg_temp.mute(p uuid) returns void language plpgsql security definer as $f$
begin
  if to_regclass('public.chat_moderation') is not null then
    -- production's is_muted_or_cooling (disciplinary_actions_feature.sql) wants muted AND (muted_permanent or a
    -- live muted_until); the older scaffold only has muted
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_moderation' and column_name = 'muted_permanent') then
      execute 'insert into public.chat_moderation (user_id, muted, muted_permanent) values ($1, true, true) on conflict (user_id) do update set muted = true, muted_permanent = true' using p;
    else
      execute 'insert into public.chat_moderation (user_id, muted) values ($1, true) on conflict (user_id) do update set muted = true' using p;
    end if;
  else
    execute 'insert into public.mutes (user_id) values ($1)' using p;
  end if;
end $f$;

do $t$
declare
  A uuid := gen_random_uuid(); B uuid := gen_random_uuid(); C uuid := gen_random_uuid(); D uuid := gen_random_uuid(); E uuid := gen_random_uuid();
  r jsonb; n int; i int; wid_user uuid; k text := 'zz-first-hour-key-' || substr(gen_random_uuid()::text, 1, 8); kid bigint; wid bigint;
begin
  insert into auth.users (id) values (A), (B), (C), (D), (E);
  insert into public.access_keys (code) values (k) returning id into kid;

  -- 1. claim_name: the old ways of calling it still work, the region is optional and kept ----------------
  perform pg_temp.as_user(A);
  r := public.claim_name('zzFirstHourA');
  perform pg_temp.ck('1 claim_name(p_name) alone still works', r ->> 'ok' = 'true' and pg_temp.prof(A) = 'zzFirstHourA/-/new', pg_temp.prof(A));
  perform pg_temp.as_user(B);
  r := public.claim_name('zzFirstHourB', k);
  perform pg_temp.ck('2 claim_name(p_name, p_key) still works and links the key', r ->> 'ok' = 'true' and (select access_key_id from public.profiles where user_id = B) = kid, pg_temp.prof(B));
  perform pg_temp.as_user(C);
  r := public.claim_name('zzFirstHourC', null, 'europe');
  perform pg_temp.ck('3 a region is stored and echoed', r ->> 'region' = 'europe' and pg_temp.prof(C) = 'zzFirstHourC/europe/new', pg_temp.prof(C));
  r := public.claim_name('zzFirstHourC2');
  perform pg_temp.ck('4 a rename without a region keeps the region', pg_temp.prof(C) = 'zzFirstHourC2/europe/new', pg_temp.prof(C));
  r := public.claim_name('zzFirstHourC3', null, 'anz');
  perform pg_temp.ck('5 a claim with a new region changes it', pg_temp.prof(C) = 'zzFirstHourC3/anz/new', pg_temp.prof(C));
  r := public.claim_name('zzFirstHourC3', null, 'the moon');
  perform pg_temp.ck('6 a region off the list is ignored, not an error', r ->> 'ok' = 'true' and pg_temp.prof(C) = 'zzFirstHourC3/anz/new', pg_temp.prof(C));
  perform pg_temp.as_user(D);
  r := public.claim_name('zzFirstHourA', null, 'usa');
  perform pg_temp.ck('7 a live name is still refused', r ->> 'reason' = 'taken', r::text);
  perform pg_temp.ck('8 exactly one claim_name overload remains, the three-argument one',
    (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'claim_name') = 1
    and (select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'claim_name') = 'p_name text, p_key text, p_region text');
  begin
    update public.profiles set region = 'mars' where user_id = A; n := 0;
  exception when check_violation then n := 1; end;
  perform pg_temp.ck('9 the region column only takes the fixed list', n = 1);
  perform pg_temp.ck('10 a person can set their own region later (the existing update-own-profile policy)',
    pg_temp.try_as(A, format('update public.profiles set region = %L where user_id = %L', 'canada', A)) = '' and pg_temp.prof(A) = 'zzFirstHourA/canada/new', pg_temp.prof(A));
  perform pg_temp.try_as(A, format('update public.profiles set region = %L where user_id = %L', 'latam', B));
  perform pg_temp.ck('11 ...but nobody else''s', pg_temp.prof(B) = 'zzFirstHourB/-/new', pg_temp.prof(B));

  -- 2. the welcome: once per account -----------------------------------------------------------------------
  perform pg_temp.as_user(A);
  r := public.welcome_newcomer();
  perform pg_temp.ck('12 first welcome: fresh, with the name and region', r ->> 'fresh' = 'true' and r ->> 'name' = 'zzFirstHourA' and r ->> 'region' = 'canada', r::text);
  perform pg_temp.ck('13 the profile is stamped', pg_temp.prof(A) = 'zzFirstHourA/canada/welcomed', pg_temp.prof(A));
  perform pg_temp.ck('14 one welcomes row, readable by anyone signed in', (select count(*) from public.welcomes where user_id = A and name = 'zzFirstHourA' and region = 'canada') = 1);
  r := public.welcome_newcomer();
  perform pg_temp.ck('15 a second call (a reload) is not fresh', r ->> 'fresh' = 'false' and r ->> 'ok' = 'true', r::text);
  r := public.claim_name('zzFirstHourA9');
  r := public.welcome_newcomer();
  perform pg_temp.ck('16 a rename does not welcome again', r ->> 'fresh' = 'false' and (select count(*) from public.welcomes where user_id = A) = 1, r::text);
  perform pg_temp.as_user(E);
  r := public.welcome_newcomer();
  perform pg_temp.ck('17 no name, no welcome', r ->> 'reason' = 'no_name', r::text);
  perform pg_temp.as_nobody();
  r := public.welcome_newcomer();
  perform pg_temp.ck('18 not signed in, no welcome', r ->> 'reason' = 'unauthenticated', r::text);
  -- an account that already had a name when the migration ran counts as welcomed (checked on a row made
  -- the way the migration's backfill sees it)
  insert into public.profiles (user_id, name) values (E, 'zzFirstHourE');
  update public.profiles set welcomed_at = now() where welcomed_at is null and name is not null;
  perform pg_temp.as_user(E);
  r := public.welcome_newcomer();
  perform pg_temp.ck('20 the backfill stamps existing characters, so they are not welcomed', r ->> 'fresh' = 'false', r::text);
  perform pg_temp.as_nobody();
  insert into public.bans (user_id) values (D);
  perform pg_temp.as_user(D);
  r := public.claim_name('zzFirstHourD');
  r := public.welcome_newcomer();
  perform pg_temp.ck('19 a banned account is not announced', r ->> 'reason' = 'banned' and pg_temp.prof(D) = 'zzFirstHourD/-/new', r::text);
  delete from public.bans where user_id = D;
  perform pg_temp.as_nobody();
  update public.welcomes set created_at = now() - interval '2 days' where user_id = A;
  perform pg_temp.as_user(D);
  r := public.welcome_newcomer();
  perform pg_temp.ck('21 a fresh welcome sweeps rows older than a day', r ->> 'fresh' = 'true' and not exists (select 1 from public.welcomes where user_id = A) and exists (select 1 from public.welcomes where user_id = D));

  -- 3. waves --------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(A);
  r := public.wave(B);
  perform pg_temp.ck('22 a wave lands', r ->> 'ok' = 'true', r::text);
  wid := (r ->> 'id')::bigint;
  perform pg_temp.ck('23 the row names the sender by their profile name', (select from_name from public.waves where id = wid) = 'zzFirstHourA9');
  r := public.wave(B);
  perform pg_temp.ck('24 one wave per person per day', r ->> 'reason' = 'already', r::text);
  perform pg_temp.ck('25 the target can read it', pg_temp.count_as(B, 'select count(*) from public.waves where id = ' || wid) = 1);
  perform pg_temp.as_user(B);
  r := public.wave(A);
  perform pg_temp.ck('26 waving back is a wave of its own', r ->> 'ok' = 'true', r::text);
  perform pg_temp.ck('27 a third person sees neither', pg_temp.count_as(C, 'select count(*) from public.waves') = 0);
  perform pg_temp.ck('28 the sender sees their own', pg_temp.count_as(A, 'select count(*) from public.waves') = 2);
  perform pg_temp.as_user(A);
  r := public.wave(A);
  perform pg_temp.ck('29 no waving at yourself', r ->> 'reason' = 'self', r::text);
  r := public.wave(E);
  perform pg_temp.ck('30 a wave reaches a named character only', r ->> 'ok' = 'true', r::text);
  r := public.wave(gen_random_uuid());
  perform pg_temp.ck('31 nobody there, no wave', r ->> 'reason' = 'unknown', r::text);
  perform pg_temp.ck('32 browsers cannot write waves directly', pg_temp.try_as(A, format('insert into public.waves (from_id, to_id) values (%L, %L)', A, C)) like '%permission denied%');
  perform pg_temp.ck('32b nor welcomes', pg_temp.try_as(A, format('insert into public.welcomes (user_id, name) values (%L, %L)', A, 'x')) like '%permission denied%');
  perform pg_temp.ck('32c a browser reads the welcomes', pg_temp.count_as(C, 'select count(*) from public.welcomes') = (select count(*) from public.welcomes));
  -- blocks, both ways
  perform pg_temp.as_nobody();
  perform pg_temp.block(C, A);
  perform pg_temp.as_user(A);
  r := public.wave(C);
  perform pg_temp.ck('33 someone who blocked you gets no wave', r ->> 'reason' = 'blocked', r::text);
  perform pg_temp.as_user(C);
  r := public.wave(A);
  perform pg_temp.ck('34 and you cannot wave at someone you blocked', r ->> 'reason' = 'blocked', r::text);
  -- mutes and bans
  perform pg_temp.as_nobody();
  perform pg_temp.mute(C);
  perform pg_temp.as_user(C);
  r := public.wave(B);
  perform pg_temp.ck('35 a muted account cannot wave', r ->> 'reason' = 'muted', r::text);
  perform pg_temp.as_nobody();
  insert into public.bans (user_id) values (B);
  perform pg_temp.as_user(B);
  r := public.wave(C);
  perform pg_temp.ck('36 a banned account cannot wave', r ->> 'reason' = 'muted', r::text);
  perform pg_temp.as_nobody();
  delete from public.bans where user_id = B;
  -- the daily total: 20, counting waves in the last day only
  perform pg_temp.as_nobody();
  for i in 1..17 loop
    insert into auth.users (id) values (gen_random_uuid()) returning id into wid_user;
    insert into public.waves (from_id, to_id) values (D, wid_user);
  end loop;
  perform pg_temp.as_user(D);
  r := public.wave(A);
  perform pg_temp.ck('37 the 18th wave of the day goes', r ->> 'ok' = 'true', r::text);
  r := public.wave(B);
  perform pg_temp.ck('38 the 19th goes', r ->> 'ok' = 'true', r::text);
  r := public.wave(C);
  perform pg_temp.ck('39 the 20th goes', r ->> 'ok' = 'true', r::text);
  r := public.wave(E);
  perform pg_temp.ck('40 the 21st is refused', r ->> 'reason' = 'limit', r::text);
  perform pg_temp.as_nobody();
  update public.waves set created_at = now() - interval '25 hours' where from_id = D;
  perform pg_temp.as_user(D);
  r := public.wave(E);
  perform pg_temp.ck('41 a day later the count starts again (and the same person may be waved at)', r ->> 'ok' = 'true', r::text);
  perform pg_temp.as_nobody();
  update public.waves set created_at = now() - interval '3 days' where from_id = D and to_id <> E;
  perform pg_temp.as_user(A);
  r := public.wave(D);
  perform pg_temp.ck('42 a wave sweeps rows older than two days', r ->> 'ok' = 'true' and (select count(*) from public.waves where from_id = D and created_at < now() - interval '2 days') = 0);
  perform pg_temp.as_nobody();

  -- 4. privileges, RLS and realtime ---------------------------------------------------------------------------
  perform pg_temp.ck('43 browsers can call the three verbs',
    pg_temp.can_exec('authenticated', 'public.claim_name(text, text, text)') and pg_temp.can_exec('anon', 'public.claim_name(text, text, text)')
    and pg_temp.can_exec('authenticated', 'public.welcome_newcomer()') and pg_temp.can_exec('authenticated', 'public.wave(uuid)'));
  perform pg_temp.ck('44 anon cannot welcome or wave', not pg_temp.can_exec('anon', 'public.welcome_newcomer()') and not pg_temp.can_exec('anon', 'public.wave(uuid)'));
  perform pg_temp.ck('45 all three are security definer with search_path pinned',
    (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('claim_name', 'welcome_newcomer', 'wave') and p.prosecdef
        and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=public%')) = 3);
  perform pg_temp.ck('46 RLS on both tables', (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relname in ('welcomes', 'waves') and c.relrowsecurity) = 2);
  perform pg_temp.ck('47 one select policy each, nothing writable', (select count(*) from pg_policies where schemaname = 'public' and tablename in ('welcomes', 'waves')) = 2
    and (select count(*) from pg_policies where schemaname = 'public' and tablename in ('welcomes', 'waves') and cmd <> 'SELECT') = 0);
  perform pg_temp.ck('48 anon reads neither table', not has_table_privilege('anon', 'public.welcomes', 'select') and not has_table_privilege('anon', 'public.waves', 'select'));
  perform pg_temp.ck('49 authenticated reads but never writes', has_table_privilege('authenticated', 'public.waves', 'select') and not has_table_privilege('authenticated', 'public.waves', 'insert')
    and has_table_privilege('authenticated', 'public.welcomes', 'select') and not has_table_privilege('authenticated', 'public.welcomes', 'insert'));
  perform pg_temp.ck('50 both tables are in the realtime publication', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('welcomes', 'waves')) = 2);

  raise exception E'\n%fails: %', current_setting('gr.log', true), coalesce(nullif(current_setting('gr.fails', true), ''), '0');
end $t$;
