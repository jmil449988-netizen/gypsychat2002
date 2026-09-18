-- The suggestion box (build 172) -------------------------------------------------------------------------
--
-- A 💡 Suggestions button (beside "Report a bug") opens a box for ideas: text, plus up to five pictures or
-- videos. They land on the admin Reports page in a tab of their own, next to user reports and bug reports.
-- Same shape as bug_reports_feature.sql (and the private bucket from hardening_2026_09_17.sql), with the
-- gaps that one had closed from the start:
--   * the author's name comes from their profile, not from the browser;
--   * a new suggestion always starts open (a browser can't file one already marked done);
--   * every attachment has to point into the author's own folder in the suggestions bucket;
--   * no more than 5 suggestions in 10 minutes, or 20 in a day, per person; banned people can't file any.
-- Media go to a PRIVATE bucket, 'suggestions': any file up to 50 MB, image and video types only (the page
-- also keeps pictures to 5 MB). People upload into their own folder; only admins can read, and the admin
-- page shows the files through short-lived signed links.
--
-- Run once in the Supabase SQL Editor. Practice run first:  begin;  <this file>  <suggestions_dryrun.sql>  rollback;

create table if not exists public.suggestions (
  id          bigint      generated always as identity primary key,
  created_at  timestamptz not null default now(),
  author_id   uuid        not null references auth.users(id) on delete cascade,
  author_name text,
  body        text        not null check (char_length(body) between 1 and 2000),
  -- [{"path": "<author uid>/<file>", "type": "image"|"video", "name": "..."}], at most 5
  attachments jsonb       not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  context     text        check (context is null or char_length(context) <= 400),   -- browser + screen size, for the admins
  status      text        not null default 'open' check (status in ('open', 'done', 'dismissed')),
  resolved_by uuid        references auth.users(id) on delete set null,
  resolved_at timestamptz
);
create index if not exists suggestions_status_time on public.suggestions (status, created_at desc);
create index if not exists suggestions_author_time on public.suggestions (author_id, created_at desc);

alter table public.suggestions enable row level security;
drop policy if exists "file a suggestion as self" on public.suggestions;
create policy "file a suggestion as self" on public.suggestions for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned(auth.uid()));
-- Only admins see the box (people don't see other people's ideas, or even their own after sending,
-- the same privacy shape as the reports).
drop policy if exists "admins read suggestions" on public.suggestions;
create policy "admins read suggestions" on public.suggestions for select to authenticated
  using (public.is_admin(auth.uid()));
drop policy if exists "admins update suggestions" on public.suggestions;
create policy "admins update suggestions" on public.suggestions for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
revoke all on public.suggestions from anon;

-- Before every insert: the throttle, the author's real name, a fresh open status, and attachments that
-- really are the author's own uploads (only the fields the admin page uses are kept).
create or replace function public.suggestions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  if (select count(*) from public.suggestions where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.suggestions where author_id = new.author_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of suggestions at once. Give it a little while.';
  end if;
  new.body := btrim(coalesce(new.body, ''));
  if new.body = '' then raise exception 'Write your suggestion first.'; end if;
  new.created_at := now(); new.status := 'open'; new.resolved_by := null; new.resolved_at := null;
  select name into new.author_name from public.profiles where user_id = new.author_id;
  for e in select value from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'type', '') not in ('image', 'video')
       or coalesce(e->>'path', '') !~ ('^' || new.author_id::text || '/[A-Za-z0-9._-]{1,120}$') then
      raise exception 'One of the attachments isn''t right. Remove it and add it again.';
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('path', x->>'path', 'type', x->>'type', 'name', left(coalesce(x->>'name', ''), 120)) order by o), '[]'::jsonb)
    into new.attachments from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) with ordinality t(x, o);
  return new;
end $$;
drop trigger if exists suggestions_before_insert on public.suggestions;
create trigger suggestions_before_insert before insert on public.suggestions
  for each row execute function public.suggestions_before_insert();
revoke execute on function public.suggestions_before_insert() from public, anon, authenticated;

-- So the admin Reports badge and the open page pick up new suggestions as they come in.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestions') then
    alter publication supabase_realtime add table public.suggestions;
  end if;
end $$;

-- Storage: the private 'suggestions' bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suggestions', 'suggestions', false, 52428800,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own suggestion attachments" on storage.objects;
create policy "upload own suggestion attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'suggestions' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "admins read suggestion attachments" on storage.objects;
create policy "admins read suggestion attachments" on storage.objects for select to authenticated
  using (bucket_id = 'suggestions' and public.is_admin(auth.uid()));
