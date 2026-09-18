-- Group names (v159)
--
-- Anyone in a group can name it, rename it, or clear the name from the 👥 menu. The column was
-- already there (conversations.title, 1-40 characters; null means "called after the people in
-- it"). What was missing:
--   * a way to change it -- conversations has no UPDATE policy and no UPDATE grant, on purpose,
--     so the only write path is the function below, which checks membership and moderation;
--   * who changed it and when (title_by / title_at), so every other member's window can say
--     "Alice named the group ..." and so one person can't fire renames in a tight loop;
--   * a realtime feed, so the new name reaches the other members without a reload.
--
-- Idempotent, in the style of every other migration here.

alter table public.conversations add column if not exists title_by uuid
  references auth.users(id) on delete set null;
alter table public.conversations add column if not exists title_at timestamptz;

create or replace function public.gc_rename_group(p_conversation bigint, p_title text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me       uuid := auth.uid();
  t        text;
  cur      text;
  last_by  uuid;
  last_at  timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.in_conversation(p_conversation) then
    raise exception 'That group is not yours to rename.';
  end if;
  -- Same gate as starting a group or adding to one: a muted person could otherwise post text to
  -- seven screens through the group's name.
  if public.is_banned(me) or public.is_muted_or_cooling(me) then
    raise exception 'You cannot rename the group right now.';
  end if;

  -- Tidied the same way the client tidies it: any run of whitespace (tabs and line breaks
  -- included) down to one space, other control characters out, ends trimmed. Blank means no
  -- name -- the group goes back to being called after the people in it.
  t := regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g');
  t := btrim(regexp_replace(t, '[[:cntrl:]]', '', 'g'));
  if t = '' then t := null; end if;
  if t is not null and char_length(t) > 40 then
    raise exception 'A group name is 40 characters at most.';
  end if;

  select c.title, c.title_by, c.title_at into cur, last_by, last_at
    from public.conversations c
   where c.id = p_conversation and c.closed_at is null
     for update;
  if not found then raise exception 'That group is closed.'; end if;

  -- Nothing to change means nothing to announce.
  if cur is not distinct from t then return t; end if;

  -- Every rename puts a line in every member's window, so one person gets one rename every
  -- five seconds: plenty to fix a typo, not enough to flood seven other screens.
  if last_by = me and last_at > now() - interval '5 seconds' then
    raise exception 'Give it a moment before renaming it again.';
  end if;

  update public.conversations
     set title = t, title_by = me, title_at = now()
   where id = p_conversation;
  return t;
end $$;

-- Named explicitly: Supabase grants EXECUTE on new functions to anon and authenticated by
-- default, and revoking from PUBLIC alone does not remove a grant made to a named role.
revoke all on function public.gc_rename_group(bigint, text) from public, anon;
grant execute on function public.gc_rename_group(bigint, text) to authenticated;

-- The rename reaches the other members as a realtime UPDATE on conversations. Realtime checks
-- the existing "see my groups" policy (in_conversation) per subscriber, so only members hear it.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
