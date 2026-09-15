-- Backfill: profiles + avatars storage bucket -------------------------------------------------
--
-- Like chat_moderation_feature.sql before it, this documents state that was created directly in
-- the Supabase SQL Editor / dashboard and never committed here. public.profiles (bio, avatar_url,
-- name, name_seen_at -- the name/name_seen_at half is already covered by name_claim_security_fix.sql
-- and international_names_feature.sql) and the 'avatars' storage bucket have been live for a while
-- with nothing in the repo to show for it. If this database ever needed to be rebuilt from this
-- repo, both would silently be missing. Safe to re-run.
--
-- Also folds in a security-review tightening done alongside this backfill: the avatars bucket had
-- no file_size_limit or allowed_mime_types (unlike thread-images, which has always had both), so
-- anyone calling the storage API directly with the public anon key -- not just through the app's
-- own upload flow, which already validates type/size and downscales client-side -- could push an
-- arbitrarily large file of any type into a public bucket. And public.profiles had zero check
-- constraints at all: bio's 300-character cap and avatar_url's length were both JS-only
-- (app.js .slice(0, 300)), enforced nowhere the database itself would ever refuse a write.

create table if not exists public.profiles (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  bio          text,
  avatar_url   text,
  name         text,
  name_seen_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "select any profile" on public.profiles;
create policy "select any profile" on public.profiles for select to authenticated using (true);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles_name_unique (on lower(name)) is created by name_claim_security_fix.sql, not here.

alter table public.profiles add constraint profiles_bio_check
  check (bio is null or char_length(bio) <= 300);
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or char_length(avatar_url) <= 600);

-- Storage: a public bucket for avatars, now capped the same way thread-images already is.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/gif','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read: public. Write: only into your own uid-prefixed folder (app.js uploads to
-- `${me.id}/avatar.png`), matching the thread-images pattern.
--
-- NOTE: production currently also has three older, functionally-identical duplicate policies
-- ("avatars own insert", "avatars own update", "avatars public read") left over from however this
-- was originally set up by hand. They agree with the ones below byte-for-byte, so they don't weaken
-- anything -- Postgres just evaluates the redundant OR -- but they should be dropped by hand in the
-- dashboard (Storage -> Policies) the next time someone's in there, since automation here is
-- deliberately blocked from dropping RLS policies on shared tables.
drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "update own avatar" on storage.objects;
create policy "update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
