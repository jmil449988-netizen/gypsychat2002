-- Hardening pass, 19 Sept 2026 -- what a light pen test of the live project turned up ----------------
--
-- Method: the effective grants, RLS policies, storage policies and function privileges were read
-- straight from the live catalogs, then a rolled-back session as `authenticated` (a real tester's uid
-- in request.jwt.claims) tried the things a signed-in browser could try. What held: user_stats (XP,
-- level, purse) cannot be written by a browser; the game helpers (hd_credit, game_award, ...) refuse;
-- admins and bans refuse; other people's whispers, hands, push subscriptions, the join IP log and the
-- invite keys are invisible; storage uploads are confined to the caller's own folder. What did not
-- hold, fixed here:
--
--   1. profiles: "update own profile" let a browser change ANY column of its own row -- the name
--      (skipping claim_name's 2-16 character rule), welcomed_at (clear it, call welcome_newcomer again,
--      repeat: a "just walked in" line on demand), access_key_id, avatar_url (any URL at all, so every
--      viewer's IP goes to whoever hosts the picture), and beta_tester after the release reset.
--      Now: column-level UPDATE on just avatar_url, bio, status_message, whisper_policy, region and
--      updated_at; no INSERT from browsers at all (claim_name makes the row; build 178 turns the two
--      client upserts into updates); a CHECK that name matches claim_name's rule and that avatar_url
--      points into this project's avatars bucket.
--   2. Reaction XP had no ceiling: 15 reactions per 10 seconds, every distinct emoji on a message is
--      one more XP for its author, and anonymous accounts are free -- two browsers could mint about
--      5,000 XP an hour. Now a reaction is AWARDED (counts for XP) only while the author is under
--      60 awarded reactions today and this particular reactor has given them fewer than 10 today;
--      the reaction still shows either way. reactions.awarded remembers which ones counted, so a
--      removed reaction only takes back XP it actually gave.
--   3. friend_requests: the sender could set their own request to 'accepted' (harmless to the other
--      side, whose friend row never appears, but wrong). Now only the recipient answers, and only
--      status / responded_at can change.
--   4. conversation_members: an UPDATE policy let a member rewrite their own row (clear left_at to
--      walk back into a group they left, change member_name). Read marks go through
--      gc_mark_group_read(), so the policy goes.
--   5. Storage: uploads were confined to your own folder but unlimited in number. Now per-bucket
--      ceilings per person: avatars 20/hour, thread-images 40/hour, voice-notes 60/hour, bug-reports
--      20/day, suggestions 30/day (counted by a definer helper, since a person cannot even see their
--      own rows in the private buckets).
--   6. Trigger functions were executable by anon/public (harmless -- PostgREST refuses to call a
--      function that returns trigger -- but tidy): revoked.
--
-- Two more findings live outside SQL: the send-push / send-board-push edge functions accept any
-- target and any text from any signed-in caller (fixed in supabase/functions/*, to be deployed), and
-- the 'kick' broadcast is trusted by every browser (fixed in build 178, the client checks its own
-- ban row before leaving). See docs/build-log.md, build 178.
--
-- Practice run first:  begin;  <this file>  <hardening_2026_09_19_dryrun.sql>  rollback;

-- 1. profiles ---------------------------------------------------------------------------------------------
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant update (avatar_url, bio, status_message, whisper_policy, region, updated_at) on public.profiles to authenticated;
drop policy if exists "insert own profile" on public.profiles;
alter table public.profiles drop constraint if exists profiles_name_format;
alter table public.profiles add constraint profiles_name_format
  check (name is null or name ~ '^[[:alpha:][:digit:]_ .''-]{2,16}$');
alter table public.profiles drop constraint if exists profiles_avatar_in_bucket;
alter table public.profiles add constraint profiles_avatar_in_bucket
  check (avatar_url is null or avatar_url like 'https://joeopnxsxrwufqswidgq.supabase.co/storage/v1/object/public/avatars/%');

-- 2. reaction XP ceiling ----------------------------------------------------------------------------------
alter table public.reactions add column if not exists awarded boolean not null default false;
create table if not exists public.reaction_awards (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  day        date not null default current_date,
  n          integer not null default 0,
  primary key (owner_id, reactor_id, day)
);
alter table public.reaction_awards enable row level security;
revoke all on public.reaction_awards from public, anon, authenticated;   -- nobody reads or writes it directly

create or replace function public.reactions_apply_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; pair int; total int;
begin
  if new.target_type = 'message' then
    select sender_id into owner from public.messages where id = new.target_id;
  elsif new.target_type = 'thread' then
    select op_id into owner from public.threads where id = new.target_id;
  elsif new.target_type = 'thread_post' then
    select sender_id into owner from public.thread_posts where id = new.target_id;
  end if;
  new.awarded := false;
  if owner is not null and owner <> new.user_id then
    delete from public.reaction_awards where day < current_date - 2;               -- housekeeping, no scheduler
    select coalesce(sum(n), 0) into total from public.reaction_awards where owner_id = owner and day = current_date;
    select n into pair from public.reaction_awards where owner_id = owner and reactor_id = new.user_id and day = current_date;
    if total < 60 and coalesce(pair, 0) < 10 then
      insert into public.reaction_awards (owner_id, reactor_id, day, n) values (owner, new.user_id, current_date, 1)
        on conflict (owner_id, reactor_id, day) do update set n = public.reaction_awards.n + 1;
      insert into public.user_stats (user_id, reactions_received) values (owner, 1)
        on conflict (user_id) do update set reactions_received = public.user_stats.reactions_received + 1;
      new.awarded := true;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reactions_after_insert on public.reactions;
drop trigger if exists reactions_award on public.reactions;
create trigger reactions_award before insert on public.reactions for each row execute function public.reactions_apply_insert();

create or replace function public.reactions_apply_delete() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if not old.awarded then return old; end if;
  if old.target_type = 'message' then
    select sender_id into owner from public.messages where id = old.target_id;
  elsif old.target_type = 'thread' then
    select op_id into owner from public.threads where id = old.target_id;
  elsif old.target_type = 'thread_post' then
    select sender_id into owner from public.thread_posts where id = old.target_id;
  end if;
  if owner is not null and owner <> old.user_id then
    update public.user_stats set reactions_received = greatest(reactions_received - 1, 0) where user_id = owner;
    update public.reaction_awards set n = greatest(n - 1, 0)
      where owner_id = owner and reactor_id = old.user_id and day = old.created_at::date;
  end if;
  return old;
end $$;
-- (the after-delete trigger stays as it is; only its function changed)

-- the reactions that already counted keep counting: mark everything before today as awarded, so a
-- removal still takes its XP back
update public.reactions set awarded = true where not awarded;

-- 3. friend_requests ----------------------------------------------------------------------------------------
revoke update on public.friend_requests from public, anon, authenticated;
grant update (status, responded_at) on public.friend_requests to authenticated;
drop policy if exists "respond to own friend requests" on public.friend_requests;
create policy "respond to own friend requests" on public.friend_requests for update to authenticated
  using (recipient_id = auth.uid() and status = 'pending')
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined'));

-- 4. conversation_members -------------------------------------------------------------------------------------
drop policy if exists "mark my own membership read" on public.conversation_members;
revoke update on public.conversation_members from public, anon, authenticated;

-- 5. storage upload ceilings ------------------------------------------------------------------------------------
create or replace function public.my_uploads_since(p_bucket text, p_since interval) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = p_bucket and (o.owner_id = auth.uid()::text or o.owner = auth.uid()) and o.created_at > now() - p_since $$;
revoke execute on function public.my_uploads_since(text, interval) from public, anon;
grant execute on function public.my_uploads_since(text, interval) to authenticated, service_role;

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  and not public.is_banned(auth.uid()) and not public.is_muted_or_cooling(auth.uid())
  and public.my_uploads_since('avatars', interval '1 hour') < 20);
drop policy if exists "avatars own insert" on storage.objects;      -- an older duplicate of the same rule
drop policy if exists "upload own thread images" on storage.objects;
create policy "upload own thread images" on storage.objects for insert to authenticated with check (
  bucket_id = 'thread-images' and (storage.foldername(name))[1] = auth.uid()::text
  and not public.is_banned(auth.uid()) and not public.is_muted_or_cooling(auth.uid())
  and public.my_uploads_since('thread-images', interval '1 hour') < 40);
drop policy if exists "send voice notes to your own whispers" on storage.objects;
create policy "send voice notes to your own whispers" on storage.objects for insert to authenticated with check (
  bucket_id = 'voice-notes' and auth.uid()::text = any (string_to_array((storage.foldername(name))[1], '_'))
  and not public.is_banned(auth.uid()) and not public.is_muted_or_cooling(auth.uid())
  and public.my_uploads_since('voice-notes', interval '1 hour') < 60);
drop policy if exists "upload own bug report attachments" on storage.objects;
create policy "upload own bug report attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'bug-reports' and (storage.foldername(name))[1] = auth.uid()::text
  and public.my_uploads_since('bug-reports', interval '1 day') < 20);
drop policy if exists "upload own suggestion attachments" on storage.objects;
create policy "upload own suggestion attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'suggestions' and (storage.foldername(name))[1] = auth.uid()::text
  and public.my_uploads_since('suggestions', interval '1 day') < 30);

-- 6. trigger functions are not for calling -----------------------------------------------------------------
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
