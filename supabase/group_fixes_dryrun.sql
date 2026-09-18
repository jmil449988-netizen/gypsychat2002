-- Rolled-back tests for group_fixes_2026_09_18.sql.
-- Run as:  begin;  <group_fixes_2026_09_18.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident; the results come back
-- in the error text. now() is frozen for the whole transaction.

do $$
declare
  AA      uuid;
  SIG     uuid;
  NOPROF  uuid;
  NONAME  uuid;
  aa_name text;
  cid     bigint; gmid bigint; o text := ''; n int; ok boolean;
begin
  select user_id, name into AA, aa_name from public.profiles where lower(name) = lower('AA.Romani.world') limit 1;
  select user_id into SIG from public.profiles where lower(name) = lower('S.S SIGINT') limit 1;
  -- the two ways to have no character name: no profiles row at all, or a row whose name
  -- claim_name() emptied when the name was claimed again from another device
  select u.id into NOPROF from auth.users u
   where not exists (select 1 from public.profiles p where p.user_id = u.id) limit 1;
  select user_id into NONAME from public.profiles where name is null limit 1;
  if AA is null or SIG is null or (NOPROF is null and NONAME is null) then
    raise exception 'RESULT could not resolve the test users (AA=% SIG=% NOPROF=% NONAME=%)', AA, SIG, NOPROF, NONAME;
  end if;

  ------------------------------------------------------------------ as a group member
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cid := public.gc_create_group(null, array[SIG]);

  begin
    insert into public.messages (room, sender_id, sender_name, conversation_id, body)
      values ('main', AA, aa_name, cid, repeat('g', 300));
    o := o || '1. 300-character group line accepted: ok' || chr(10);
  exception when others then
    o := o || '1. 300-CHARACTER GROUP LINE REFUSED: ' || sqlerrm || chr(10);
  end;
  begin
    insert into public.messages (room, sender_id, sender_name, conversation_id, body)
      values ('main', AA, aa_name, cid, repeat('g', 501));
    o := o || '2. 501-CHARACTER GROUP LINE ACCEPTED -- cap missing' || chr(10);
  exception when others then
    o := o || format('2. 501-character group line refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  begin
    insert into public.messages (room, sender_id, sender_name, body)
      values ('main', AA, aa_name, repeat('r', 141));
    o := o || '3. 141-CHARACTER ROOM LINE ACCEPTED -- the room cap moved' || chr(10);
  exception when others then
    o := o || format('3. 141-character room line refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  begin
    insert into public.messages (room, sender_id, sender_name, recipient_id, recipient_name, body)
      values ('main', AA, aa_name, SIG, 'S.S SIGINT', repeat('w', 500));
    o := o || '4. 500-character whisper accepted: ok' || chr(10);
  exception when others then
    o := o || '4. 500-CHARACTER WHISPER REFUSED: ' || sqlerrm || chr(10);
  end;
  if NOPROF is null then
    o := o || '5a/6a. no account without a profiles row exists to test with: n/a' || chr(10);
  else
    begin
      perform public.gc_create_group(null, array[NOPROF]);
      o := o || '5a. GROUP STARTED WITH AN ACCOUNT THAT HAS NO PROFILE -- check missing' || chr(10);
    exception when others then
      o := o || format('5a. starting a group with an account that has no profile refused: ok (%s)%s', sqlerrm, chr(10));
    end;
    begin
      perform public.gc_add_to_group(cid, NOPROF);
      o := o || '6a. ACCOUNT WITH NO PROFILE ADDED -- check missing' || chr(10);
    exception when others then
      o := o || format('6a. adding an account that has no profile refused: ok (%s)%s', sqlerrm, chr(10));
    end;
  end if;
  if NONAME is null then
    o := o || '5b/6b. no profile with an emptied name exists to test with: n/a' || chr(10);
  else
    begin
      perform public.gc_create_group(null, array[NONAME]);
      o := o || '5b. GROUP STARTED WITH AN EMPTIED-NAME ACCOUNT -- check missing' || chr(10);
    exception when others then
      o := o || format('5b. starting a group with an emptied-name account refused: ok (%s)%s', sqlerrm, chr(10));
    end;
    begin
      perform public.gc_add_to_group(cid, NONAME);
      o := o || '6b. EMPTIED-NAME ACCOUNT ADDED -- check missing' || chr(10);
    exception when others then
      o := o || format('6b. adding an emptied-name account refused: ok (%s)%s', sqlerrm, chr(10));
    end;
  end if;
  reset role;

  ------------------------------------------------------------------ the room's ring buffer
  -- A group line older than everything in the room, then one room line to set the trim off.
  insert into public.messages (room, sender_id, sender_name, conversation_id, body, created_at)
    values ('main', AA, aa_name, cid, 'the oldest group line there is', timestamptz '2000-01-01')
    returning id into gmid;
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.messages (room, sender_id, sender_name, body) values ('main', AA, aa_name, 'trim probe');
  reset role;
  select count(*) into n from public.messages where id = gmid;
  o := o || format('7. the oldest group line survives a room insert: %s (want 1)%s', n, chr(10));
  select count(*) into n from public.messages where recipient_id is null and conversation_id is null and room = 'main';
  o := o || format('8. room lines kept: %s (want 100 or fewer)%s', n, chr(10));

  ------------------------------------------------------------------ the clean-up
  select count(*) into n from public.conversation_members m
   where m.left_at is null and not exists (select 1 from public.profiles p where p.user_id = m.user_id and p.name is not null);
  o := o || format('9. nameless accounts still sitting in a group: %s (want 0)%s', n, chr(10));

  raise exception 'RESULT %', chr(10) || o;
end $$;
