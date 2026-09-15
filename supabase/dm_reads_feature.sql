-- Read receipts for whispers ------------------------------------------------------------------
--
-- One row per (owner, peer) pair: owner's "read up to" timestamp for messages from peer. The
-- same table does double duty for two different features the client already half-expects (see
-- the dmRead comment in app.js, which has been waiting for this table to exist):
--
--   1. Read receipts -- when you read a whisper window, the client upserts your own row
--      (owner_id = you, peer_id = them, last_read_at = now). The person who sent you those
--      messages can see that row (peer_id = them's own id... no -- they see it because THEY are
--      the peer named in someone else's row: owner_id = you, peer_id = them), so their whisper
--      window can show "Seen HH:MM" under the last message they sent you.
--   2. Cross-device unread sync -- your own rows (owner_id = you) are also read back on sign-on
--      to seed the local "already seen" mark, so a whisper you already read on your phone doesn't
--      come back as a fresh unread badge when you sign on from a laptop.
--
-- Run this once in the Supabase SQL Editor.

create table if not exists public.dm_reads (
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  peer_id      uuid        not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (owner_id, peer_id)
);
create index if not exists dm_reads_peer on public.dm_reads (peer_id);

alter table public.dm_reads enable row level security;

-- You can see your own read-marks (for the cross-device sync above), and the read-marks OTHER
-- people have set naming you as the peer -- that second case is the read receipt itself: it's how
-- a sender finds out the person they whispered has read up to a given time.
create policy "see relevant read marks" on public.dm_reads for select to authenticated
  using (owner_id = auth.uid() or peer_id = auth.uid());

-- Only ever write your own read-mark, and only naming someone else (never yourself) as the peer.
create policy "set own read mark" on public.dm_reads for insert to authenticated
  with check (owner_id = auth.uid() and peer_id <> auth.uid());
create policy "update own read mark" on public.dm_reads for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- So a sender's whisper window flips to "Seen" live the moment the recipient reads it, the same
-- way new messages already arrive live.
alter publication supabase_realtime add table public.dm_reads;
