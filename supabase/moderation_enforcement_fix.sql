-- Closes a real gap found during a security review: the insert policies on messages, threads,
-- thread_posts, and the thread-images storage bucket only ever checked "not banned". None of them
-- checked "not muted" or "cooldown not active" -- meaning gc_check_and_record_send()'s spam
-- cooldown and mute system was being enforced only by the app's own JavaScript choosing to honor
-- its verdict. Anyone bypassing the app's normal send flow (e.g. calling the Supabase REST/JS API
-- directly) could post completely unthrottled and un-muted, limited only by the blunt "5 per 5
-- seconds" trigger backstop -- regardless of a mute or an active cooldown on their account.
--
-- This adds a is_muted_or_cooling() helper (same style as public.is_banned()) and wires it into
-- every write policy that public.is_banned() already guards, so a muted or cooling-down account
-- can no longer post, start a thread, reply, or upload a thread image through any path -- not just
-- the app's UI.

create or replace function public.is_muted_or_cooling(u uuid) returns boolean language sql security definer stable as
  $$ select exists (
       select 1 from public.chat_moderation
       where user_id = u
         and (muted or (cooldown_until is not null and cooldown_until > now()))
     ) $$;

-- messages (covers both room messages and whispers)
drop policy if exists "send as self" on public.messages;
create policy "send as self" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and (recipient_id is null or recipient_id <> auth.uid())
    and not public.is_banned(auth.uid())
    and (recipient_id is null or not public.has_blocked(recipient_id, auth.uid()))
    and not public.is_muted_or_cooling(auth.uid())
  );

-- starting a thread
drop policy if exists "start thread as self" on public.threads;
create policy "start thread as self" on public.threads for insert to authenticated
  with check (
    op_id = auth.uid()
    and op_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and not public.is_banned(auth.uid())
    and not public.is_muted_or_cooling(auth.uid())
  );

-- replying to a thread
drop policy if exists "reply as self" on public.thread_posts;
create policy "reply as self" on public.thread_posts for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and not public.is_banned(auth.uid())
    and not public.is_muted_or_cooling(auth.uid())
  );

-- uploading a thread image
drop policy if exists "upload own thread images" on storage.objects;
create policy "upload own thread images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thread-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.is_banned(auth.uid())
    and not public.is_muted_or_cooling(auth.uid())
  );
