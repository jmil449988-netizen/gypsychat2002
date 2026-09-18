-- Rolled-back permission tests for group_chats_feature.sql.
-- Run as:  begin;  <group_chats_feature.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident; the results
-- come back in the error text. Kept in the repo because it is the record of what the
-- group policies are actually supposed to permit.

-- ============================ ROLLED-BACK PERMISSION TESTS ============================
do $$
declare
  AA   uuid := '2187ffeb-b4e8-4e07-b4d8-2fdb5d1ca771';
  SIG  uuid := '96730189-d2ba-480e-a8ed-b193680e0e87';
  STV  uuid := 'c2af6f01-93b2-43cb-9517-1a2a12dbda58';
  cid  bigint; o text := ''; n int; ok boolean; mid bigint;
begin
  -- resolve the real admin uuid rather than trusting a pasted one
  select user_id into AA from public.profiles where lower(name) = lower('AA.Romani.world') limit 1;
  select user_id into SIG from public.profiles where lower(name) = lower('S.S SIGINT') limit 1;
  -- the outsider MUST have a profiles row of their own, or a refused insert would look like a
  -- passing test when it was really the not-null sender_name failing
  select user_id into STV from public.profiles where user_id not in (AA, SIG) limit 1;
  if AA is null or SIG is null or STV is null then
    raise exception 'RESULT could not resolve three test users with profiles (AA=% SIG=% OUT=%)', AA, SIG, STV;
  end if;
  o := o || format('0. outsider under test: %s%s', (select name from public.profiles where user_id = STV), chr(10));

  ------------------------------------------------------------------ as the creator
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role','authenticated')::text, true);
  set local role authenticated;
  cid := public.gc_create_group('Test group', array[SIG]);
  o := o || format('1. creator made group %s%s', cid, chr(10));
  o := o || format('2. creator is in it: %s (want t)%s', public.in_conversation(cid), chr(10));

  insert into public.messages (room, sender_id, sender_name, conversation_id, body)
    values ('main', AA, (select name from public.profiles where user_id = AA), cid, 'hello group')
    returning id into mid;
  o := o || format('3. creator posted message %s%s', mid, chr(10));
  reset role;

  ------------------------------------------------------------------ as the other member
  perform set_config('request.jwt.claims', json_build_object('sub', SIG, 'role','authenticated')::text, true);
  set local role authenticated;
  o := o || format('4. member is in it: %s (want t)%s', public.in_conversation(cid), chr(10));
  select count(*) into n from public.messages where conversation_id = cid;
  o := o || format('5. member reads %s message(s) (want 1)%s', n, chr(10));
  select count(*) into n from public.conversation_members where conversation_id = cid;
  o := o || format('6. member sees %s member row(s) (want 2)%s', n, chr(10));
  reset role;

  ------------------------------------------------------------------ as a total outsider
  perform set_config('request.jwt.claims', json_build_object('sub', STV, 'role','authenticated')::text, true);
  set local role authenticated;
  o := o || format('7. outsider is in it: %s (want f)%s', public.in_conversation(cid), chr(10));
  select count(*) into n from public.messages where conversation_id = cid;
  o := o || format('8. outsider reads %s message(s) (want 0)%s', n, chr(10));
  select count(*) into n from public.conversations where id = cid;
  o := o || format('9. outsider sees %s group row(s) (want 0)%s', n, chr(10));
  select count(*) into n from public.conversation_members where conversation_id = cid;
  o := o || format('10. outsider sees %s member row(s) (want 0)%s', n, chr(10));
  begin
    insert into public.messages (room, sender_id, sender_name, conversation_id, body)
      values ('main', STV, (select name from public.profiles where user_id = STV), cid, 'let me in');
    o := o || '11. outsider POSTED TO THE GROUP -- HOLE' || chr(10);
  exception when others then
    o := o || '11. outsider write refused: ok' || chr(10);
  end;
  begin
    perform public.gc_add_to_group(cid, STV);
    o := o || '12. outsider ADDED THEMSELF -- HOLE' || chr(10);
  exception when others then
    o := o || '12. outsider self-add refused: ok' || chr(10);
  end;
  reset role;

  ------------------------------------------------------------------ leaving
  perform set_config('request.jwt.claims', json_build_object('sub', SIG, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.gc_leave_group(cid);
  o := o || format('13. after leaving, still in it: %s (want f)%s', public.in_conversation(cid), chr(10));
  select count(*) into n from public.messages where conversation_id = cid;
  o := o || format('14. after leaving, reads %s message(s) (want 0)%s', n, chr(10));
  reset role;

  ------------------------------------------------------------------ the whisper path must be untouched
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.messages (room, sender_id, sender_name, recipient_id, recipient_name, body)
      values ('main', AA, (select name from public.profiles where user_id = AA), SIG,
              (select name from public.profiles where user_id = SIG), 'ordinary whisper');
    o := o || '15. ordinary whisper still sends: ok' || chr(10);
  exception when others then
    o := o || '15. ORDINARY WHISPER BROKE: ' || sqlerrm || chr(10);
  end;
  begin
    insert into public.messages (room, sender_id, sender_name, body)
      values ('main', AA, (select name from public.profiles where user_id = AA), 'ordinary room line');
    o := o || '16. ordinary room message still sends: ok' || chr(10);
  exception when others then
    o := o || '16. ORDINARY ROOM MESSAGE BROKE: ' || sqlerrm || chr(10);
  end;
  -- a message may not be both a whisper and a group line
  begin
    insert into public.messages (room, sender_id, sender_name, recipient_id, conversation_id, body)
      values ('main', AA, (select name from public.profiles where user_id = AA), SIG, cid, 'both at once');
    o := o || '17. BOTH destinations accepted -- constraint missing' || chr(10);
  exception when others then
    o := o || '17. both-destinations refused: ok' || chr(10);
  end;
  reset role;

  ------------------------------------------------------------------ the size cap
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.gc_create_group('too big', (select array_agg(user_id) from (select user_id from public.profiles where user_id <> AA limit 20) q));
    o := o || '18. group of 20 ACCEPTED -- cap missing' || chr(10);
  exception when others then
    o := o || '18. group over 8 refused: ok (' || sqlerrm || ')' || chr(10);
  end;
  reset role;

  raise exception 'RESULT %', chr(10) || o;
end $$;
