-- Group chats (v154)
--
-- Groups run as a PARALLEL path to one-to-one whispers, not as a replacement for them.
-- A message carries either recipient_id (a whisper, exactly as before) or conversation_id
-- (a group), never both. Nothing existing is migrated: can_whisper(), has_blocked(),
-- dm_reads, the pair-named voice-note folders and the ~139 peer-keyed places in app.js all
-- keep working untouched, and groups can be withdrawn without disturbing whispers.
--
-- Blocks: a block governs whispers and the room, and has no effect inside a group both
-- people chose to be in. That is a deliberate product decision -- the alternative (delivering
-- a group message to some members and not others) gives each member a different history of
-- the same conversation, silently, and makes every reply that answers an invisible message
-- look like a non-sequitur.
--
-- Idempotent, in the style of every other migration here.

-- ---------------------------------------------------------------- tables

create table if not exists public.conversations (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid        not null references auth.users(id) on delete cascade,
  title      text        check (title is null or char_length(title) between 1 and 40),
  closed_at  timestamptz
);

create table if not exists public.conversation_members (
  conversation_id bigint      not null references public.conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  member_name     text,
  added_by        uuid        references auth.users(id) on delete set null,
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user
  on public.conversation_members (user_id) where left_at is null;

alter table public.messages add column if not exists conversation_id bigint
  references public.conversations(id) on delete cascade;

create index if not exists messages_conversation
  on public.messages (conversation_id, created_at desc) where conversation_id is not null;

-- A message is a room line, a whisper, or a group line -- never two of those at once.
alter table public.messages drop constraint if exists messages_one_destination;
alter table public.messages add constraint messages_one_destination
  check (conversation_id is null or recipient_id is null);

-- ---------------------------------------------------------------- membership helper
--
-- Takes NO user argument on purpose. A two-argument version would let any signed-in browser
-- ask "is <uuid> in group <n>" and map out who talks to whom; this one can only ever answer
-- about its own caller. SECURITY DEFINER because the policy on conversation_members calls it
-- -- reading that table with its own RLS active would recurse.

create or replace function public.in_conversation(c bigint) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = c and m.user_id = auth.uid() and m.left_at is null
  );
$$;

revoke all on function public.in_conversation(bigint) from public, anon;
grant execute on function public.in_conversation(bigint) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;

drop policy if exists "see my groups" on public.conversations;
create policy "see my groups" on public.conversations for select to authenticated
  using (public.in_conversation(id));

drop policy if exists "see members of my groups" on public.conversation_members;
create policy "see members of my groups" on public.conversation_members for select to authenticated
  using (public.in_conversation(conversation_id));

-- Own membership row: the only direct write anyone gets, and only to mark it read.
drop policy if exists "mark my own membership read" on public.conversation_members;
create policy "mark my own membership read" on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Everything else -- creating a group, adding someone, leaving -- goes through the functions
-- below, so the size cap and the whisper check cannot be walked around by posting rows.

-- ---------------------------------------------------------------- message policies
--
-- Rebuilt from the live policies as they stood at build 153, with the group branch added and
-- every existing guard kept verbatim: sender_name still comes from profiles (not the JWT),
-- is_banned and is_muted_or_cooling still gate every write, and the whisper branch still
-- carries has_blocked and can_whisper.

drop policy if exists "read visible messages" on public.messages;
create policy "read visible messages" on public.messages for select to authenticated
  using (
    case
      when conversation_id is not null then public.in_conversation(conversation_id)
      else (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid())
           and not public.has_blocked(auth.uid(), sender_id)
    end
  );

drop policy if exists "send as self" on public.messages;
create policy "send as self" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = (select p.name from public.profiles p where p.user_id = auth.uid())
    and not public.is_banned(auth.uid())
    and not public.is_muted_or_cooling(auth.uid())
    and case
      when conversation_id is not null then public.in_conversation(conversation_id)
      else (recipient_id is null or recipient_id <> auth.uid())
           and (recipient_id is null or not public.has_blocked(recipient_id, auth.uid()))
           and (recipient_id is null or public.can_whisper(auth.uid(), recipient_id))
    end
  );

-- ---------------------------------------------------------------- the RPCs
--
-- GROUP_MAX is 8. Big enough to be a room rather than a wider whisper, and it leaves four
-- people to watch when four sit down at a game.

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

create or replace function public.gc_leave_group(p_conversation bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); live integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.conversation_members set left_at = now()
    where conversation_id = p_conversation and user_id = me and left_at is null;

  -- The last one out closes the group. Its messages go with it (on delete cascade), which is
  -- what everyone leaving a group is asking for.
  select count(*) into live from public.conversation_members
    where conversation_id = p_conversation and left_at is null;
  if live = 0 then
    update public.conversations set closed_at = now() where id = p_conversation;
  end if;
end $$;

create or replace function public.gc_mark_group_read(p_conversation bigint)
returns void language sql security definer set search_path = public as $$
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation and user_id = auth.uid();
$$;

revoke all on function public.gc_create_group(text, uuid[])       from public, anon;
revoke all on function public.gc_add_to_group(bigint, uuid)       from public, anon;
revoke all on function public.gc_leave_group(bigint)              from public, anon;
revoke all on function public.gc_mark_group_read(bigint)          from public, anon;
grant execute on function public.gc_create_group(text, uuid[])    to authenticated;
grant execute on function public.gc_add_to_group(bigint, uuid)    to authenticated;
grant execute on function public.gc_leave_group(bigint)           to authenticated;
grant execute on function public.gc_mark_group_read(bigint)       to authenticated;

grant select on public.conversations        to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant insert (conversation_id) on public.messages to authenticated;
