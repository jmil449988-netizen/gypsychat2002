-- Threads board: a single general-purpose board, 4chan-style — no topics, anyone signed in can
-- start a thread or reply. A thread bumps to the top of the list whenever it gets a new reply.

create table if not exists public.threads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  bumped_at   timestamptz not null default now(),
  op_id       uuid        not null references auth.users(id) on delete cascade,
  op_name     text        not null check (char_length(op_name) between 2 and 16),
  body        text        not null check (char_length(body) between 1 and 500),
  reply_count integer     not null default 0
);
create index if not exists threads_bumped on public.threads (bumped_at desc);

create table if not exists public.thread_posts (
  id          bigint generated always as identity primary key,
  thread_id   bigint      not null references public.threads(id) on delete cascade,
  created_at  timestamptz not null default now(),
  sender_id   uuid        not null references auth.users(id) on delete cascade,
  sender_name text        not null check (char_length(sender_name) between 2 and 16),
  body        text        not null check (char_length(body) between 1 and 500)
);
create index if not exists thread_posts_thread_time on public.thread_posts (thread_id, created_at);

alter table public.threads enable row level security;
alter table public.thread_posts enable row level security;

-- Read: it's a public board — everyone signed in sees every thread and post.
create policy "read threads" on public.threads for select to authenticated using (true);
create policy "read thread posts" on public.thread_posts for select to authenticated using (true);

-- Write: only as yourself, and only if you're not banned (reuses public.is_banned() from schema.sql).
create policy "start thread as self" on public.threads for insert to authenticated
  with check (
    op_id = auth.uid()
    and op_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and not public.is_banned(auth.uid())
  );

create policy "reply as self" on public.thread_posts for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and not public.is_banned(auth.uid())
  );

-- Bump the parent thread and keep its reply_count current whenever a reply lands.
create or replace function public.bump_thread() returns trigger language plpgsql security definer as $$
begin
  update public.threads set bumped_at = now(), reply_count = reply_count + 1 where id = new.thread_id;
  return new;
end $$;
drop trigger if exists thread_posts_bump on public.thread_posts;
create trigger thread_posts_bump after insert on public.thread_posts for each row execute function public.bump_thread();

-- Same hard server-side rate limit as the main room: at most 5 inserts per user per 5 seconds
-- (the real anti-spam cooldown/mute logic is the shared gc_check_and_record_send RPC the client
-- already calls before every post — this is just the same blunt backstop `messages` has).
create or replace function public.rate_limit_thread_posts() returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.thread_posts where sender_id = new.sender_id and created_at > now() - interval '5 seconds') >= 5 then
    raise exception 'Slow down.';
  end if;
  return new;
end $$;
drop trigger if exists thread_posts_rate_limit on public.thread_posts;
create trigger thread_posts_rate_limit before insert on public.thread_posts for each row execute function public.rate_limit_thread_posts();

create or replace function public.rate_limit_threads() returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.threads where op_id = new.op_id and created_at > now() - interval '30 seconds') >= 3 then
    raise exception 'Slow down.';
  end if;
  return new;
end $$;
drop trigger if exists threads_rate_limit on public.threads;
create trigger threads_rate_limit before insert on public.threads for each row execute function public.rate_limit_threads();

-- Realtime: broadcast inserts/updates so every open board updates live.
alter publication supabase_realtime add table public.threads;
alter publication supabase_realtime add table public.thread_posts;

-- Housekeeping: keep the board from growing forever. Run manually or schedule via Database → Cron:
--   select cron.schedule('trim-threads', '0 4 * * *', $$delete from public.threads where bumped_at < now() - interval '14 days'$$);
