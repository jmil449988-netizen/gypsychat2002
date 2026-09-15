-- Bug reports ----------------------------------------------------------------------------------
--
-- A "Report a bug" button (status-bar "..." popover on mobile / inline row on desktop -- same
-- spot as "Change picture", see public/index.html #statusPopover) lets any signed-on player file
-- a bug: free text plus up to a handful of attached screenshots or a short screen recording. This
-- is deliberately a separate table/queue from public.reports -- that one is for reporting a
-- PERSON (abuse, spam) to be disciplined; this one is for reporting the APP (something broken) to
-- be fixed, and the two shouldn't share a "who gets disciplined" review flow.
--
-- Attachments are files the reporter already has (a screenshot they took, a screen recording made
-- with their phone/OS's own screen-record feature) rather than anything captured live from inside
-- the page -- there is no reliable, permission-free way to grab a screenshot or record the screen
-- from JS on mobile, so this reuses the same "pick a file, upload it, store the URL" flow the app
-- already uses for chat images and avatars instead of inventing an in-page capture mechanism.
--
-- Run this once in the Supabase SQL Editor.

create table if not exists public.bug_reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  reporter_id   uuid        not null references auth.users(id) on delete cascade,
  reporter_name text,
  description   text        not null check (char_length(description) between 1 and 1000),
  -- [{"url": "...", "type": "image"|"video"}, ...] -- up to 5, enforced client-side (see
  -- MAX_BUG_ATTACHMENTS in app.js); jsonb rather than a separate table since a bug report's
  -- attachments are never queried independently of the report itself.
  attachments   jsonb       not null default '[]'::jsonb,
  -- Auto-captured (navigator.userAgent + viewport size), not typed by the reporter -- the kind of
  -- thing you always want for a bug and always forget to mention.
  context       text,
  status        text        not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by   uuid        references auth.users(id) on delete set null,
  resolved_at   timestamptz
);
create index if not exists bug_reports_status_time on public.bug_reports (status, created_at desc);

alter table public.bug_reports enable row level security;

-- Anyone signed in can file a bug report, as themselves.
create policy "file bug report as self" on public.bug_reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- Only admins see the queue (reporters aren't shown other people's reports, or even their own
-- beyond the "thank you" message -- same privacy shape as public.reports).
create policy "admins read bug reports" on public.bug_reports for select to authenticated
  using (public.is_admin(auth.uid()));

-- Resolve / dismiss from the review modal.
create policy "admins update bug reports" on public.bug_reports for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- So the admin bug-reports button's badge and open modal update live as new ones come in, same as
-- public.reports already does.
alter publication supabase_realtime add table public.bug_reports;

-- Storage: a public bucket for attachments, same shape as thread-images/avatars (public bucket,
-- upload only into your own uid-prefixed folder -- see profiles_avatars_feature.sql for why
-- "public but the path is an unguessable per-upload name" is this app's established model for
-- user-submitted media rather than a private bucket + signed URLs). Capped larger than images
-- (25MB) to leave room for a short screen recording; MIME allowlist covers screenshots plus the
-- video formats iOS/Android screen recording actually produces.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-reports', 'bug-reports', true, 26214400,
  array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read bug report attachments" on storage.objects;
create policy "public read bug report attachments" on storage.objects for select
  using (bucket_id = 'bug-reports');

drop policy if exists "upload own bug report attachments" on storage.objects;
create policy "upload own bug report attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = auth.uid()::text);
