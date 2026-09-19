-- Rolled-back checks for hardening_2026_09_19.sql.
-- Run as:  begin;  <hardening_2026_09_19.sql>  <this file>  rollback;   (ends by raising)
create function pg_temp.ck(label text, ok boolean, info text default '') returns void language plpgsql as $f$
begin
  perform set_config('gr.log', coalesce(current_setting('gr.log', true), '')
    || case when coalesce(ok, false) then 'ok   ' else 'FAIL ' end || label
    || case when coalesce(info, '') <> '' then ' [' || info || ']' else '' end || chr(10), true);
  if not coalesce(ok, false) then
    perform set_config('gr.fails', (coalesce(nullif(current_setting('gr.fails', true), ''), '0')::int + 1)::text, true);
  end if;
end $f$;
-- run one statement as a signed-in person; '' if it went through, else the error, or 'noop' if it matched nothing
create function pg_temp.try_as(p uuid, q text) returns text language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute q; get diagnostics n = row_count;
  exception when others then
    reset role; return sqlerrm;
  end;
  reset role;
  return case when n > 0 then '' else 'noop' end;
end $f$;
create function pg_temp.rr(p uuid) returns int language sql security definer as $f$
  select coalesce((select reactions_received from public.user_stats where user_id = p), 0) $f$;

do $t$
declare A uuid := gen_random_uuid(); B uuid := gen_random_uuid(); C uuid := gen_random_uuid();
        mid bigint; r text; i int; n int; ids bigint[] := '{}';
begin
  insert into auth.users (id) values (A), (B), (C);
  insert into public.profiles (user_id, name, name_seen_at) values (A, 'zzHardA', now()), (B, 'zzHardB', now()), (C, 'zzHardC', now());

  -- 1. profiles
  r := pg_temp.try_as(A, format('update public.profiles set name = %L where user_id = %L', 'zzHardA2', A));
  perform pg_temp.ck('1 a browser cannot rename itself through profiles', r like '%permission denied%', r);
  r := pg_temp.try_as(A, format('update public.profiles set welcomed_at = null where user_id = %L', A));
  perform pg_temp.ck('2 nor clear welcomed_at', r like '%permission denied%', r);
  r := pg_temp.try_as(A, format('update public.profiles set access_key_id = null where user_id = %L', A));
  perform pg_temp.ck('3 nor touch access_key_id', r like '%permission denied%', r);
  r := pg_temp.try_as(A, format('update public.profiles set status_message = %L, region = %L, whisper_policy = %L, bio = %L, updated_at = now() where user_id = %L', 'hi', 'usa', 'everyone', 'me', A));
  perform pg_temp.ck('4 status, region, whisper setting, bio still theirs to set', r = '', r);
  r := pg_temp.try_as(A, format('update public.profiles set status_message = %L where user_id = %L', 'x', B));
  perform pg_temp.ck('5 not someone else''s', r = 'noop', r);
  r := pg_temp.try_as(A, format('update public.profiles set avatar_url = %L where user_id = %L', 'https://evil.example/p.png', A));
  perform pg_temp.ck('6 avatar must live in the avatars bucket', r like '%profiles_avatar_in_bucket%', r);
  r := pg_temp.try_as(A, format('update public.profiles set avatar_url = %L where user_id = %L', 'https://joeopnxsxrwufqswidgq.supabase.co/storage/v1/object/public/avatars/' || A || '/a.png', A));
  perform pg_temp.ck('7 ...and then it is fine', r = '', r);
  r := pg_temp.try_as(A, format('insert into public.profiles (user_id, name) values (%L, %L)', gen_random_uuid(), 'zzHardX'));
  perform pg_temp.ck('8 no direct profile inserts', r like '%permission denied%', r);
  begin
    update public.profiles set name = 'this name is far too long for the room' where user_id = C; r := 'allowed';
  exception when check_violation then r := 'check'; end;
  perform pg_temp.ck('9 the name rule holds even for the owner role', r = 'check', r);
  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role', 'authenticated')::text, true);
  r := (public.claim_name('zzHardC2')) ->> 'ok';
  perform pg_temp.ck('10 claim_name still renames', r = 'true' and (select name from public.profiles where user_id = C) = 'zzHardC2', r);

  -- 2. reaction XP ceiling: B reacts to A's room messages
  insert into public.messages (sender_id, sender_name, body) values (A, 'zzHardA', 'hello') returning id into mid;
  perform set_config('request.jwt.claims', '{}', true);
  for i in 1..12 loop
    insert into public.messages (sender_id, sender_name, body) values (A, 'zzHardA', 'm' || i) returning id into mid;
    ids := ids || mid;
    r := pg_temp.try_as(B, format('insert into public.reactions (target_type, target_id, user_id, emoji) values (%L, %s, %L, %L)', 'message', mid, B, '👍'));
    if r <> '' then raise exception 'reaction % failed: %', i, r; end if;
    perform pg_sleep(0.05);
  end loop;
  perform pg_temp.ck('11 twelve reactions from one person award ten', pg_temp.rr(A) = 10, pg_temp.rr(A)::text);
  perform pg_temp.ck('12 the two over the line are kept but not awarded', (select count(*) from public.reactions where user_id = B and not awarded) = 2);
  perform set_config('request.jwt.claims', '{}', true);
  execute format('delete from public.reactions where user_id = %L and target_id = %s', B, ids[12]);
  perform pg_temp.ck('13 removing an unawarded reaction takes nothing back', pg_temp.rr(A) = 10, pg_temp.rr(A)::text);
  execute format('delete from public.reactions where user_id = %L and target_id = %s', B, ids[1]);
  perform pg_temp.ck('14 removing an awarded one takes one back', pg_temp.rr(A) = 9, pg_temp.rr(A)::text);
  r := pg_temp.try_as(B, format('insert into public.reactions (target_type, target_id, user_id, emoji) values (%L, %s, %L, %L)', 'message', ids[12], B, '🔥'));
  perform pg_temp.ck('15 the freed slot can be earned again (no net gain from churn)', r = '' and pg_temp.rr(A) = 10, r || ' ' || pg_temp.rr(A));
  -- the 60-a-day ceiling for the author, from many people
  n := 0;
  for i in 1..7 loop
    declare X uuid := gen_random_uuid(); j int;
    begin
      insert into auth.users (id) values (X);
      insert into public.profiles (user_id, name, name_seen_at) values (X, 'zzHardR' || i, now());
      for j in 1..10 loop
        r := pg_temp.try_as(X, format('insert into public.reactions (target_type, target_id, user_id, emoji) values (%L, %s, %L, %L)', 'message', ids[j], X, '👍'));
        if r <> '' then raise exception 'reactor % # % failed: %', i, j, r; end if;
        n := n + 1;
        perform pg_sleep(0.02);
      end loop;
    end;
  end loop;
  perform pg_temp.ck('16 seventy more reactions from seven people stop at the 60-a-day ceiling', pg_temp.rr(A) = 60, pg_temp.rr(A)::text);
  perform pg_temp.ck('17 every reaction still exists for the room to see', (select count(*) from public.reactions where target_id = any (ids)) = n + 11, (select count(*) from public.reactions where target_id = any (ids))::text);
  perform set_config('request.jwt.claims', '{}', true);
  r := pg_temp.try_as(B, 'select count(*) from public.reaction_awards');
  perform pg_temp.ck('18 the award ledger is not readable by browsers', r like '%permission denied%', r);

  -- 3. friend requests
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.friend_requests (sender_id, recipient_id, status) values (A, B, 'pending');
  r := pg_temp.try_as(A, format('update public.friend_requests set status = %L where sender_id = %L and recipient_id = %L', 'accepted', A, B));
  perform pg_temp.ck('19 the sender cannot accept their own request', r = 'noop', r);
  r := pg_temp.try_as(B, format('update public.friend_requests set sender_id = %L where sender_id = %L and recipient_id = %L', C, A, B));
  perform pg_temp.ck('20 the recipient cannot rewrite who sent it', r like '%permission denied%', r);
  r := pg_temp.try_as(B, format('update public.friend_requests set status = %L, responded_at = now() where sender_id = %L and recipient_id = %L', 'accepted', A, B));
  perform pg_temp.ck('21 the recipient accepts', r = '', r);
  r := pg_temp.try_as(B, format('update public.friend_requests set status = %L where sender_id = %L and recipient_id = %L', 'declined', A, B));
  perform pg_temp.ck('22 ...once', r = 'noop', r);

  -- 4. conversation members
  r := pg_temp.try_as(A, format('update public.conversation_members set left_at = null where user_id = %L', A));
  perform pg_temp.ck('23 members cannot rewrite their own membership row', r like '%permission denied%', r);

  -- 6. trigger functions
  perform pg_temp.ck('24 no trigger function is executable by browsers',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
                   and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))));
  perform pg_temp.ck('25 user_stats still has no write policy', not exists (select 1 from pg_policies where tablename = 'user_stats' and cmd <> 'SELECT'));
  perform pg_temp.ck('26 my_uploads_since answers for a signed-in person', pg_temp.try_as(A, 'select public.my_uploads_since(''avatars'', interval ''1 hour'')') = '');

  raise exception E'\n%fails: %', current_setting('gr.log', true), coalesce(nullif(current_setting('gr.fails', true), ''), '0');
end $t$;
