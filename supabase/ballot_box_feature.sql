-- The Ballot Box: anonymous notes ----------------------------------------------------------------
--
-- A slot on the desktop layout's right-hand gutter (see .ballot-panel in style.css) where anyone in
-- the room can drop a short note with no name on it. The notes then take turns scrolling across
-- the parchment strip at the bottom of that panel, one every 15 seconds.
--
-- "Anonymous" here means anonymous to everyone in the room, not untraceable: each note still
-- records who cast it, so an admin can deal with abuse the same way as anywhere else in the app --
-- but that column is never readable through the API. Postgres column-level privileges do that:
-- authenticated clients are granted SELECT on id/created_at/body ONLY, so `select *` is refused
-- outright and the client (loadBallot in app.js) asks for exactly those three columns. Deliberately
-- NOT added to the realtime publication, since a postgres_changes payload carries the whole row
-- (row-level policies apply there, column privileges don't) and would leak author_id; the client
-- polls instead, which at one note per 15 seconds is all the freshness the strip can show anyway.
--
-- Run this once in the Supabase SQL Editor (needs public.is_admin / public.is_banned from schema.sql).

create table if not exists public.ballot_notes (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  author_id  uuid        not null references auth.users(id) on delete cascade,
  body       text        not null check (char_length(body) between 1 and 140)
);
create index if not exists ballot_notes_time on public.ballot_notes (created_at desc);

alter table public.ballot_notes enable row level security;

-- Rate limit helper. A policy expression runs with the caller's own privileges, and the caller
-- can't read author_id (see the column grants below) -- so the "have you cast one in the last
-- minute" lookup has to go through a security-definer function, same pattern as is_admin/is_banned.
create or replace function public.ballot_recently_cast(u uuid) returns boolean
language sql security definer stable set search_path = public as
  $$ select exists (select 1 from public.ballot_notes where author_id = u and created_at > now() - interval '60 seconds') $$;

-- Cast a note as yourself, if you're not banned, and no more than one a minute.
create policy "cast a note" on public.ballot_notes for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned(auth.uid()) and not public.ballot_recently_cast(auth.uid()));

-- Everyone signed in can read the box (the columns they can read are limited below).
create policy "read the box" on public.ballot_notes for select to authenticated
  using (true);

-- Admins can pull a note out of the box.
create policy "admins remove notes" on public.ballot_notes for delete to authenticated
  using (public.is_admin(auth.uid()));

-- Column privileges: the table-level SELECT Supabase grants by default would expose author_id, so
-- take that away and grant just the columns the room is allowed to see. INSERT keeps the columns
-- the client actually sends (author_id and body; id/created_at are defaults).
revoke all on public.ballot_notes from anon, authenticated;
grant select (id, created_at, body) on public.ballot_notes to authenticated;
grant insert (author_id, body) on public.ballot_notes to authenticated;
grant delete on public.ballot_notes to authenticated;  -- still gated by the admin policy above
