-- Reactions + levels ------------------------------------------------------------------------
--
-- Reactions: a small emoji can be dropped on a main-room message, a thread's opening post, or a
-- thread reply. One polymorphic table (target_type + target_id) covers all three rather than
-- three near-identical tables, since the read/write/realtime shape is the same for all of them.
-- Deliberately NOT offered on whispers -- those are private 1:1, a reaction pill would leak "I
-- read this" information neither party asked for, and the insert policy below enforces that by
-- checking the target message has recipient_id is null.
--
-- Levels: reacting to someone's post credits THEM (not you) with one point of reputation in
-- public.user_stats. Level is a generated column derived purely from that point count, so there
-- is only ever one number (reactions_received) that can drift -- nothing to keep in sync by hand,
-- which is exactly the class of bug messages_trim_room/trim_main_chat just got cleaned up for.

create table if not exists public.reactions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  target_type text        not null check (target_type in ('message', 'thread', 'thread_post')),
  target_id   bigint      not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  emoji       text        not null check (char_length(emoji) between 1 and 8),
  unique (target_type, target_id, user_id, emoji)
);
create index if not exists reactions_target on public.reactions (target_type, target_id);

alter table public.reactions enable row level security;

-- Read: reactions aren't sensitive on their own (never exposed on whispers -- see insert check
-- below), so everyone signed in can see who reacted with what.
create policy "read reactions" on public.reactions for select to authenticated using (true);

-- Write: only as yourself, not banned, and only on something reactable --
--   message  -> must be a real, currently-existing MAIN-ROOM message (recipient_id is null;
--               whispers are excluded on purpose, see header note)
--   thread   -> must be a real thread (reacting to its opening post)
--   thread_post -> must be a real reply
create policy "react as self" on public.reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_banned(auth.uid())
    and (
      (target_type = 'message' and exists (select 1 from public.messages m where m.id = target_id and m.recipient_id is null))
      or (target_type = 'thread' and exists (select 1 from public.threads t where t.id = target_id))
      or (target_type = 'thread_post' and exists (select 1 from public.thread_posts tp where tp.id = target_id))
    )
  );

-- Un-react: remove your own reaction only.
create policy "remove own reaction" on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- Same blunt backstop the rest of the app uses -- generous enough that tapping through a handful
-- of emoji in a row never trips it, tight enough to stop a scripted reaction-flood.
create or replace function public.rate_limit_reactions() returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.reactions where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 15 then
    raise exception 'Slow down.';
  end if;
  return new;
end $$;
drop trigger if exists reactions_rate_limit on public.reactions;
create trigger reactions_rate_limit before insert on public.reactions for each row execute function public.rate_limit_reactions();

alter publication supabase_realtime add table public.reactions;

-- ---------------------------------------------------------------------------------------------
-- Levels: public.user_stats.reactions_received is the one number that moves; level is derived
-- from it via a generated column so it can never fall out of sync with the count that backs it.
-- floor(sqrt(n/3))+1 -> level 1 at 0, level 2 at 3, level 3 at 12, level 4 at 27, level 5 at 48...
-- a slow RPG-style curve, not a strict requirement of this app, just a reasonable default.
create table if not exists public.user_stats (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  reactions_received integer not null default 0 check (reactions_received >= 0),
  level              integer generated always as (floor(sqrt(reactions_received::numeric / 3))::int + 1) stored
);

alter table public.user_stats enable row level security;

-- Read: levels are shown next to names throughout the app, so everyone signed in can see them.
-- No insert/update/delete policy for `authenticated` at all -- the only writer is the
-- security-definer trigger below, so a client can never inflate its own (or anyone else's) level
-- by writing to this table directly.
create policy "read levels" on public.user_stats for select to authenticated using (true);

alter publication supabase_realtime add table public.user_stats;

-- Crediting: look up who OWNS the thing that got reacted to (not who did the reacting) and give
-- them the point. Self-reactions (reacting to your own message) are allowed client-side -- no
-- reason to forbid it -- but deliberately don't award a point, or leveling up would just be a
-- matter of reacting to your own posts a few hundred times.
create or replace function public.reactions_apply_insert() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare owner uuid;
begin
  if new.target_type = 'message' then
    select sender_id into owner from public.messages where id = new.target_id;
  elsif new.target_type = 'thread' then
    select op_id into owner from public.threads where id = new.target_id;
  elsif new.target_type = 'thread_post' then
    select sender_id into owner from public.thread_posts where id = new.target_id;
  end if;
  if owner is not null and owner <> new.user_id then
    insert into public.user_stats (user_id, reactions_received) values (owner, 1)
    on conflict (user_id) do update set reactions_received = public.user_stats.reactions_received + 1;
  end if;
  return new;
end $$;
drop trigger if exists reactions_after_insert on public.reactions;
create trigger reactions_after_insert after insert on public.reactions for each row execute function public.reactions_apply_insert();

-- Un-crediting: mirror of the above. Floored at 0 by the check constraint (greatest() guards the
-- update itself so a race can never try to insert a negative value).
create or replace function public.reactions_apply_delete() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare owner uuid;
begin
  if old.target_type = 'message' then
    select sender_id into owner from public.messages where id = old.target_id;
  elsif old.target_type = 'thread' then
    select op_id into owner from public.threads where id = old.target_id;
  elsif old.target_type = 'thread_post' then
    select sender_id into owner from public.thread_posts where id = old.target_id;
  end if;
  if owner is not null and owner <> old.user_id then
    update public.user_stats set reactions_received = greatest(reactions_received - 1, 0) where user_id = owner;
  end if;
  return old;
end $$;
drop trigger if exists reactions_after_delete on public.reactions;
create trigger reactions_after_delete after delete on public.reactions for each row execute function public.reactions_apply_delete();

-- ---------------------------------------------------------------------------------------------
-- Housekeeping: a reaction's target can disappear later (a room message ages out of the 100-cap
-- FIFO, a thread expires after 24h of inactivity, a reply gets deleted by an admin) without the
-- reaction row itself ever being touched -- there's no FK to target_id to cascade through, since
-- it's polymorphic. Left alone, those would be exactly the kind of orphaned row this whole feature
-- got built right after cleaning up a different kind of orphaned object. These triggers just
-- delete the now-pointless reaction rows -- they deliberately do NOT touch user_stats, because a
-- message scrolling out of the ring buffer (or a thread quietly expiring) isn't a moderation
-- action and shouldn't claw back reputation someone already earned.
create or replace function public.reactions_cleanup_message() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin delete from public.reactions where target_type = 'message' and target_id = old.id; return old; end $$;
drop trigger if exists messages_reactions_cleanup on public.messages;
create trigger messages_reactions_cleanup after delete on public.messages for each row execute function public.reactions_cleanup_message();

create or replace function public.reactions_cleanup_thread() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin delete from public.reactions where target_type = 'thread' and target_id = old.id; return old; end $$;
drop trigger if exists threads_reactions_cleanup on public.threads;
create trigger threads_reactions_cleanup after delete on public.threads for each row execute function public.reactions_cleanup_thread();

create or replace function public.reactions_cleanup_thread_post() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin delete from public.reactions where target_type = 'thread_post' and target_id = old.id; return old; end $$;
drop trigger if exists thread_posts_reactions_cleanup on public.thread_posts;
create trigger thread_posts_reactions_cleanup after delete on public.thread_posts for each row execute function public.reactions_cleanup_thread_post();
