-- Whispers: friends only by default, with a per-person "Everyone" switch -------------------------
--
-- Until now anyone in the room could open a whisper to anyone else. Now a whisper only goes
-- through when the person being whispered has ACCEPTED the sender -- i.e. the recipient has the
-- sender on their own friends list (the recipient's `friends` row, owner_id = recipient,
-- friend_id = sender, which acceptFriendRequest inserts on their side). Using the recipient's row
-- rather than the sender's is deliberate: that row is the recipient's consent, and it also keeps
-- the old one-sided "bookmark" adds from before friend requests existed from counting -- someone
-- who merely bookmarked you can't whisper you; someone you accepted can.
--
-- Each person can open the door instead: profiles.whisper_policy = 'everyone' takes whispers from
-- anyone (the "Whispers: Everyone" switch in the ... menu). Default is 'friends'.
--
-- Admins are exempt both ways, so anyone can always reach an admin for help and an admin can
-- always reach anyone for moderation. Blocks still apply on top of all of this, unchanged.
--
-- The rule lives in the messages INSERT policy, so it holds against a modified client or a direct
-- API call, not just the buttons in the UI. Buzz and typing pings go over the realtime broadcast
-- channel, which RLS can't see; those are gated in the client only (see sendBuzz / sendTyping).
--
-- Friend requests also gain an optional one-line intro (<= 100 chars), so a request to someone
-- you can't whisper yet isn't a silent knock -- it's shown in their bell and in the push.
--
-- Run this once in the Supabase SQL Editor. Replaces the "send as self" policy from
-- name_claim_security_fix.sql (+ the is_muted_or_cooling clause the moderation work added live).

alter table public.profiles add column if not exists whisper_policy text not null default 'friends';
alter table public.profiles drop constraint if exists profiles_whisper_policy_check;
alter table public.profiles add constraint profiles_whisper_policy_check
  check (whisper_policy in ('friends', 'everyone'));

alter table public.friend_requests add column if not exists intro text;
alter table public.friend_requests drop constraint if exists friend_requests_intro_check;
alter table public.friend_requests add constraint friend_requests_intro_check
  check (intro is null or char_length(intro) <= 100);

-- Security definer: `friends` is only selectable by its owner, and this has to read the
-- RECIPIENT's rows on the sender's behalf. Same pattern as is_admin/is_banned/ballot_tag_allowed.
create or replace function public.can_whisper(sender uuid, recipient uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_admin(sender)
      or public.is_admin(recipient)
      or coalesce((select p.whisper_policy from public.profiles p where p.user_id = recipient), 'friends') = 'everyone'
      or exists (select 1 from public.friends f where f.owner_id = recipient and f.friend_id = sender)
$$;

drop policy if exists "send as self" on public.messages;
create policy "send as self" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = (select p.name from public.profiles p where p.user_id = auth.uid())
    and (recipient_id is null or recipient_id <> auth.uid())
    and not public.is_banned(auth.uid())
    and (recipient_id is null or not public.has_blocked(recipient_id, auth.uid()))  -- can't whisper someone who blocked you
    and not public.is_muted_or_cooling(auth.uid())
    and (recipient_id is null or public.can_whisper(auth.uid(), recipient_id))       -- friends only (or their door is open, or an admin is involved)
  );
