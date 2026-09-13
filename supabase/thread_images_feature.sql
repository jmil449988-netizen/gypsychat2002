-- Adds picture support to the threads board: an uploaded image (own Storage bucket) or a picked
-- Giphy GIF, either way stored as a plain URL in a new image_url column. A thread/post may now be
-- image-only (body becomes nullable) as long as it has a body OR an image — never neither.

alter table public.threads add column if not exists image_url text;
alter table public.thread_posts add column if not exists image_url text;

alter table public.threads alter column body drop not null;
alter table public.thread_posts alter column body drop not null;

alter table public.threads drop constraint if exists threads_body_check;
alter table public.thread_posts drop constraint if exists thread_posts_body_check;
alter table public.threads add constraint threads_body_check check (body is null or char_length(body) <= 500);
alter table public.thread_posts add constraint thread_posts_body_check check (body is null or char_length(body) <= 500);

alter table public.threads add constraint threads_image_url_check check (image_url is null or char_length(image_url) <= 600);
alter table public.thread_posts add constraint thread_posts_image_url_check check (image_url is null or char_length(image_url) <= 600);

-- A post must have a body, an image, or both — never neither.
alter table public.threads add constraint threads_has_content check (coalesce(char_length(body), 0) > 0 or image_url is not null);
alter table public.thread_posts add constraint thread_posts_has_content check (coalesce(char_length(body), 0) > 0 or image_url is not null);

-- Storage: a public bucket for uploaded thread images (5MB cap, common image types only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thread-images', 'thread-images', true, 5242880, array['image/jpeg','image/png','image/gif','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: public (the bucket itself is public, but explicit policies keep intent clear and let RLS
-- stay enabled if the bucket is ever flipped private later).
drop policy if exists "public read thread images" on storage.objects;
create policy "public read thread images" on storage.objects for select using (bucket_id = 'thread-images');

-- Write: only as yourself (object path must be prefixed with your own auth.uid()), and only if
-- you're not banned (reuses public.is_banned() from schema.sql).
drop policy if exists "upload own thread images" on storage.objects;
create policy "upload own thread images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thread-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.is_banned(auth.uid())
  );
