-- Rolled-back tests for group_names_feature.sql.
-- Run as:  begin;  <group_names_feature.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident; the results come back
-- in the error text. Kept in the repo as the record of what renaming is supposed to permit.
-- now() is frozen for a whole transaction, which is what lets test 3 hit the five-second rule.

do $$
declare
  AA   uuid;
  SIG  uuid;
  STV  uuid;
  cid  bigint; o text := ''; n int; t text; r text; ok boolean;
begin
  select user_id into AA  from public.profiles where lower(name) = lower('AA.Romani.world') limit 1;
  select user_id into SIG from public.profiles where lower(name) = lower('S.S SIGINT') limit 1;
  select user_id into STV from public.profiles where user_id not in (AA, SIG) limit 1;
  if AA is null or SIG is null or STV is null then
    raise exception 'RESULT could not resolve three test users with profiles (AA=% SIG=% OUT=%)', AA, SIG, STV;
  end if;

  ------------------------------------------------------------------ plumbing
  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations';
  o := o || format('0a. conversations in the realtime feed: %s (want 1)%s', n, chr(10));
  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members';
  o := o || format('0b. conversation_members in the realtime feed: %s (for information)%s', n, chr(10));
  o := o || format('0c. anon may call it: %s (want f)%s',
    has_function_privilege('anon', 'public.gc_rename_group(bigint, text)', 'execute'), chr(10));
  o := o || format('0d. authenticated may call it: %s (want t)%s',
    has_function_privilege('authenticated', 'public.gc_rename_group(bigint, text)', 'execute'), chr(10));
  -- Supabase's default grants can make this t; RLS has no UPDATE policy on conversations, so
  -- test 5 below is the one that decides whether a direct write gets through.
  o := o || format('0e. UPDATE privilege on conversations: %s (for information -- see test 5)%s',
    has_table_privilege('authenticated', 'public.conversations', 'update'), chr(10));

  ------------------------------------------------------------------ as the first member
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cid := public.gc_create_group(null, array[SIG]);
  r := public.gc_rename_group(cid, '  Road   trip  ');
  o := o || format('1. member renamed it to %L (want ''Road trip'')%s', r, chr(10));
  select c.title, c.title_by = AA into t, ok from public.conversations c where c.id = cid;
  o := o || format('2. stored %L, recorded as renamed by them: %s (want t)%s', t, ok, chr(10));
  begin
    perform public.gc_rename_group(cid, 'Road trip 2');
    o := o || '3. SECOND RENAME INSIDE 5 s ACCEPTED -- the five-second rule is missing' || chr(10);
  exception when others then
    o := o || format('3. second rename inside 5 s refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  r := public.gc_rename_group(cid, 'Road trip');
  o := o || format('4. the same name again is a quiet no-op, not an error: %L%s', r, chr(10));
  begin
    update public.conversations set title = 'hacked' where id = cid;
    get diagnostics n = row_count;
    o := o || format('5. direct UPDATE changed %s row(s) (want 0 or refused)%s', n, chr(10));
  exception when others then
    o := o || format('5. direct UPDATE refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  reset role;

  ------------------------------------------------------------------ as the other member
  perform set_config('request.jwt.claims', json_build_object('sub', SIG, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.conversations where id = cid and title = 'Road trip';
  o := o || format('6. the other member sees the new name: %s (want 1)%s', n, chr(10));
  r := public.gc_rename_group(cid, 'Tab' || chr(9) || 'and' || chr(10) || 'newline' || chr(7));
  o := o || format('7. a different member is not held by the first one''s 5 s; tidied to %L (want ''Tab and newline'')%s', r, chr(10));
  begin
    perform public.gc_rename_group(cid, repeat('x', 41));
    o := o || '8. 41 CHARACTERS ACCEPTED -- length check missing' || chr(10);
  exception when others then
    o := o || format('8. 41 characters refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  reset role;

  ------------------------------------------------------------------ clearing it
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.gc_rename_group(cid, '   ');
  select c.title into t from public.conversations c where c.id = cid;
  o := o || format('9. blank clears the name: returned %L, stored %L (want NULL, NULL)%s', r, t, chr(10));
  reset role;

  ------------------------------------------------------------------ as a total outsider
  perform set_config('request.jwt.claims', json_build_object('sub', STV, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.gc_rename_group(cid, 'mine now');
    o := o || '10. OUTSIDER RENAMED THE GROUP -- HOLE' || chr(10);
  exception when others then
    o := o || format('10. outsider refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  reset role;

  ------------------------------------------------------------------ after leaving
  perform set_config('request.jwt.claims', json_build_object('sub', SIG, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.gc_leave_group(cid);
  begin
    perform public.gc_rename_group(cid, 'from outside');
    o := o || '11. SOMEONE WHO LEFT RENAMED IT -- HOLE' || chr(10);
  exception when others then
    o := o || format('11. someone who left refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  reset role;

  raise exception 'RESULT %', chr(10) || o;
end $$;
