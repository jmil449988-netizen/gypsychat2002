-- Ballot Box: @tags in anonymous notes ---------------------------------------------------------
--
-- A note can @Name someone in the room (same matching rule as chat mentions, see mentionedUserIds
-- in app.js). The tagged person gets a push -- "Someone tagged you in the Ballot Box" -- with
-- nothing about who. The one guard against that being used to dog-pile someone: a person can be
-- tagged in the box at most 10 times an hour, total, across everyone. This table is the ledger
-- that rule is checked against; the client writes one row per tag right after casting the note and
-- only sends the push for rows the database accepted.
--
-- Nobody but admins can read it (it would otherwise be a way to see who is being talked about),
-- and it carries no author column of its own: the note it points at already records that, behind
-- the same column privileges (see ballot_box_feature.sql).
--
-- Run this once in the Supabase SQL Editor, after ballot_box_feature.sql.

create table if not exists public.ballot_tags (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  note_id    bigint      not null references public.ballot_notes(id) on delete cascade,
  tagged_id  uuid        not null references auth.users(id) on delete cascade
);
create index if not exists ballot_tags_target_time on public.ballot_tags (tagged_id, created_at desc);

alter table public.ballot_tags enable row level security;

-- Both checks need to read columns the caller can't (ballot_notes.author_id; this table at all),
-- so they run as security definer, same pattern as is_admin/is_banned/ballot_recently_cast.
create or replace function public.ballot_note_is_mine(n bigint) returns boolean
language sql security definer stable set search_path = public as
  $$ select exists (select 1 from public.ballot_notes where id = n and author_id = auth.uid()) $$;

create or replace function public.ballot_tag_allowed(target uuid) returns boolean
language sql security definer stable set search_path = public as
  $$ select (select count(*) from public.ballot_tags where tagged_id = target and created_at > now() - interval '1 hour') < 10 $$;

-- Tag someone (not yourself) from a note you just cast, while they're under the hourly cap.
create policy "tag from own note" on public.ballot_tags for insert to authenticated
  with check (tagged_id <> auth.uid() and public.ballot_note_is_mine(note_id) and public.ballot_tag_allowed(tagged_id));

-- Only admins can read the ledger.
create policy "admins read tags" on public.ballot_tags for select to authenticated
  using (public.is_admin(auth.uid()));

revoke all on public.ballot_tags from anon, authenticated;
grant insert (note_id, tagged_id) on public.ballot_tags to authenticated;
grant select on public.ballot_tags to authenticated;  -- still gated by the admin policy above
