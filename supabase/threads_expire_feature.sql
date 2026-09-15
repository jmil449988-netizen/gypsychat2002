-- Threads board: expire after 24 hours of no comments -----------------------------------------
--
-- threads_feature.sql ended with the same dead suggestion messages/schema.sql had: a commented-out
-- select cron.schedule(...) line, dependent on the pg_cron extension -- which was never enabled on
-- this project (confirmed via select * from pg_extension where extname = 'pg_cron', 0 rows). So the
-- threads board has been growing forever too, exactly like the main room chat was before
-- messages_trim_room (see schema.sql).
--
-- Rather than a fixed row cap (like the room's 100-message FIFO), threads expire by TIME: a thread
-- with no reply in the last 24 hours is deleted. Replying resets that clock 24 hours forward from
-- the reply, because bumped_at is what's checked and bump_thread() (threads_feature.sql) already
-- updates bumped_at on every reply -- so "expires in 24 hours if no one comments on it" falls out
-- naturally from checking bumped_at, no separate "has activity" flag needed.
--
-- Same opportunistic-trigger approach as messages_trim_room, for the same reason: no pg_cron
-- dependency. Every new thread and every new reply is a chance to sweep anything stale. Two trigger
-- functions rather than one because "new.id" (a fresh thread) and "new.thread_id" (a fresh reply)
-- point at different things -- each explicitly excludes the thread it was just fired by from its
-- own delete, so posting to (or starting) a thread can never delete that same thread out from under
-- itself even before bump_thread() has had a chance to refresh its bumped_at.
--
-- Deleting a thread cascades to its replies (thread_posts.thread_id references threads(id) on
-- delete cascade, threads_feature.sql) -- same cascade admin thread-deletion already relies on
-- (admin_moderation_feature.sql).
--
-- Verified against production with synthetic rows before being relied on for real: a 25-hour-stale
-- thread was correctly swept by both the new-thread and new-reply trigger paths, a thread replied
-- to within the window correctly survived with its bumped_at refreshed, and the self-exclusion
-- guard correctly protected a just-inserted backdated row from deleting itself. Test rows were
-- removed afterward.
--
-- Run this once in the Supabase SQL Editor.

create or replace function public.expire_stale_threads_on_new_thread() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  delete from public.threads
  where bumped_at < now() - interval '24 hours'
    and id <> new.id;
  return new;
end;
$function$;

create or replace function public.expire_stale_threads_on_new_reply() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  delete from public.threads
  where bumped_at < now() - interval '24 hours'
    and id <> new.thread_id;
  return new;
end;
$function$;

drop trigger if exists threads_expire_stale on public.threads;
create trigger threads_expire_stale after insert on public.threads
  for each row execute function public.expire_stale_threads_on_new_thread();

drop trigger if exists thread_posts_expire_stale_parent on public.thread_posts;
create trigger thread_posts_expire_stale_parent after insert on public.thread_posts
  for each row execute function public.expire_stale_threads_on_new_reply();
