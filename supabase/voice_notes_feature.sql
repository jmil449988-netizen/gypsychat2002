-- ============================================================================
-- Voice notes in whispers
-- ============================================================================
-- Two columns on messages and one private storage bucket.
--
-- The bucket is private, and that is a deliberate departure from how pictures work here. Whisper
-- images go to the public 'thread-images' bucket, so anybody holding the URL can fetch one without
-- signing in at all -- tolerable for a GIF, not for a recording of someone's voice. Voice notes are
-- served through short-lived signed URLs instead, and the object itself is unreachable without one.
--
-- Access is keyed to the CONVERSATION, not the uploader, because both people must be able to play
-- the file and only they may. The path carries the pair: the two user ids, sorted so that either
-- participant computes the same folder, joined with an underscore:
--     voice-notes/<id-a>_<id-b>/<random>.webm
-- The policies below split that folder back apart and require auth.uid() to be one of the two. A
-- folder named after only the sender could not have expressed "and the person he sent it to".
--
-- body is NOT the path. It holds a readable line -- "Voice note (0:07)" -- so that a client which
-- does not understand voice notes, a push notification, or the inbox snippet all still say
-- something sensible instead of leaking a storage path as gibberish text.

alter table public.messages add column if not exists voice_path text;
alter table public.messages add column if not exists voice_secs integer;

alter table public.messages drop constraint if exists messages_voice_secs_check;
alter table public.messages add constraint messages_voice_secs_check
  check (voice_secs is null or (voice_secs > 0 and voice_secs <= 120));

-- A voice note is only ever a whisper. There is no way to leave one in the main room, and the
-- constraint says so rather than relying on the client never trying.
alter table public.messages drop constraint if exists messages_voice_is_whisper;
alter table public.messages add constraint messages_voice_is_whisper
  check (voice_path is null or recipient_id is not null);

grant insert (voice_path, voice_secs) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- the bucket
-- ---------------------------------------------------------------------------
-- 3 MB is generous for two minutes of Opus at the bitrate a browser picks (roughly 24-40 kbps),
-- and small enough that a stuck recording cannot fill the project's storage. iOS Safari cannot
-- record webm at all and produces mp4/aac, which is why both are allowed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 3145728,
        array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read voice notes in your own whispers" on storage.objects;
create policy "read voice notes in your own whispers" on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and auth.uid()::text = any(string_to_array((storage.foldername(name))[1], '_'))
  );

-- Same test on the way in: you may only put a file into a conversation you are part of, which stops
-- anyone dropping audio into somebody else's whisper folder.
drop policy if exists "send voice notes to your own whispers" on storage.objects;
create policy "send voice notes to your own whispers" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and auth.uid()::text = any(string_to_array((storage.foldername(name))[1], '_'))
  );

-- No update and no delete policy on purpose: a voice note cannot be swapped for different audio
-- after the fact, and it cannot be removed from under the person it was sent to. Admin cleanup, if
-- it is ever wanted, goes through the service role.
