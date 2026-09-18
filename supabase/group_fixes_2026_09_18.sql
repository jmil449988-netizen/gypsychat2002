-- Group fixes (v161)
--
-- Group lines (conversation_id set, recipient_id null) were being treated as MAIN-ROOM lines by two
-- older pieces of server code that only ever asked "is recipient_id null?":
--
--   1. messages_body_check capped them at 140 characters, the main room's limit, while the group
--      composer takes 500 like a whisper -- the browser cut anything longer down to 140 to fit.
--   2. trim_room_messages, the ring buffer that keeps the main room to its newest 100 lines,
--      counted group lines as room lines and DELETED them along with the room's oldest lines. A
--      group's history was being thrown away a hundred room messages later, and group lines were
--      pushing real room lines out of the room's hundred.
--
-- And a third thing, found through the "someone" in the test group:
--
--   3. An account with no character name could be added to a group. It can read everything and
--      can never post (the messages insert policy checks the sender's name against profiles), and
--      everyone else sees it as "someone". "No character name" means its profiles row has
--      name = null -- claim_name() empties the old row when the same invite key claims the name
--      again from another device -- or it has no profiles row at all. The test group's "someone"
--      was the first kind: the pre-18-Sept login of the user's own "Steve miller" test character.
--      Such accounts can no longer be added, and any already in a group are taken out (their row
--      stays, with left_at set, the same as leaving).
--
-- gc_create_group and gc_add_to_group below are the v154 bodies, verified identical to the live
-- ones by md5(prosrc) before this was written, with only the profiles check added.
--
-- Idempotent, in the style of every other migration here.

-- ---------------------------------------------------------------- 1. the 500 limit for groups
-- NOT VALID as before: new and updated rows are checked, old rows are left alone.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  (recipient_id is null and conversation_id is null and char_length(body) between 1 and 140)
  or ((recipient_id is not null or conversation_id is not null) and char_length(body) between 1 and 500)
) not valid;

-- ---------------------------------------------------------------- 2. the room's ring buffer
-- Only room lines count toward the room's hundred, and only room lines are ever trimmed. Group
-- lines, like whispers, are kept.
create or replace function public.trim_room_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recipient_id is null and new.conversation_id is null then
    delete from public.messages
    where id in (
      select id from public.messages
      where recipient_id is null and conversation_id is null and room = new.room
      order by created_at desc, id desc
      offset 100
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 3. no name, no seat
create or replace function public.gc_create_group(p_title text, p_members uuid[])
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me       uuid := auth.uid();
  my_name  text;
  cid      bigint;
  target   uuid;
  n        integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if public.is_banned(me) or public.is_muted_or_cooling(me) then
    raise exception 'You cannot start a group right now.';
  end if;

  select name into my_name from public.profiles where user_id = me;
  if my_name is null then raise exception 'You need a character name first.'; end if;

  -- distinct, never yourself
  select array_agg(distinct x) into p_members
    from unnest(coalesce(p_members, '{}'::uuid[])) as x where x <> me;
  n := coalesce(array_length(p_members, 1), 0);

  if n < 1 then raise exception 'Pick at least one person.'; end if;
  if n + 1 > 8 then raise exception 'A group holds 8 people.'; end if;

  -- Same reach rule as a whisper: you may add anyone you could have whispered. Checked here
  -- rather than in the client so a hand-made request cannot pull a stranger into a group.
  foreach target in array p_members loop
    if not public.can_whisper(me, target) then
      raise exception 'You can only add people you could whisper.';
    end if;
    if public.is_banned(target) then
      raise exception 'One of those people is not around any more.';
    end if;
    -- v161: no character name, no seat. See the header of group_fixes_2026_09_18.sql.
    if not exists (select 1 from public.profiles where user_id = target and name is not null) then
      raise exception 'One of those people has no character name right now, so they cannot be added.';
    end if;
  end loop;

  insert into public.conversations (created_by, title)
    values (me, nullif(btrim(coalesce(p_title, '')), ''))
    returning id into cid;

  insert into public.conversation_members (conversation_id, user_id, member_name, added_by)
    select cid, me, my_name, me;

  insert into public.conversation_members (conversation_id, user_id, member_name, added_by)
    select cid, u, (select name from public.profiles where user_id = u), me
      from unnest(p_members) as u;

  return cid;
end $$;

create or replace function public.gc_add_to_group(p_conversation bigint, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  live  integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.in_conversation(p_conversation) then
    raise exception 'That group is not yours to add to.';
  end if;
  if p_user = me then raise exception 'You are already in it.'; end if;
  if public.is_banned(me) or public.is_muted_or_cooling(me) then
    raise exception 'You cannot add anyone right now.';
  end if;
  if not public.can_whisper(me, p_user) then
    raise exception 'You can only add people you could whisper.';
  end if;
  if public.is_banned(p_user) then
    raise exception 'They are not around any more.';
  end if;
  -- v161: no character name, no seat. See the header of group_fixes_2026_09_18.sql.
  if not exists (select 1 from public.profiles where user_id = p_user and name is not null) then
    raise exception 'They have no character name right now, so they cannot be added.';
  end if;

  select count(*) into live from public.conversation_members
    where conversation_id = p_conversation and left_at is null;
  if live >= 8 then raise exception 'A group holds 8 people.'; end if;

  -- Someone who left and is being brought back keeps their row, and their read marker with it.
  insert into public.conversation_members (conversation_id, user_id, member_name, added_by)
    values (p_conversation, p_user, (select name from public.profiles where user_id = p_user), me)
  on conflict (conversation_id, user_id) do update
    set left_at = null, added_by = me, joined_at = now(),
        member_name = excluded.member_name;
end $$;

-- Anyone already sitting in a group without a character name is taken out.
update public.conversation_members m
   set left_at = now()
 where m.left_at is null
   and not exists (select 1 from public.profiles p where p.user_id = m.user_id and p.name is not null);

-- A group whose last named member was just taken out is closed, as if its last member had left.
update public.conversations c
   set closed_at = now()
 where c.closed_at is null
   and not exists (select 1 from public.conversation_members m
                    where m.conversation_id = c.id and m.left_at is null);
