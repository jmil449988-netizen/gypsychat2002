-- Gypsy Chat 2000 — database setup
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Also enable: Authentication → Providers → Anonymous sign-ins (ON).

create table if not exists public.messages (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  room           text        not null default 'main',
  sender_id      uuid        not null references auth.users(id) on delete cascade,
  sender_name    text        not null check (char_length(sender_name) between 2 and 16),
  recipient_id   uuid        references auth.users(id) on delete set null,   -- null = room message
  recipient_name text,
  body           text        not null check (char_length(body) between 1 and 500)
);
create index if not exists messages_room_time on public.messages (room, created_at desc);
create index if not exists messages_recipient   on public.messages (recipient_id, created_at desc);

alter table public.messages enable row level security;

-- Read: room messages, or whispers you sent or received. This is what keeps whispers private.
create policy "read visible messages" on public.messages for select to authenticated
  using (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid());

-- Write: only as yourself, only with the name on your session.
create policy "send as self" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and (recipient_id is null or recipient_id <> auth.uid())
  );

-- Server-side rate limit: at most 5 messages per user per 5 seconds.
create or replace function public.rate_limit_messages() returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '5 seconds') >= 5 then
    raise exception 'Slow down.';
  end if;
  return new;
end $$;
drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages for each row execute function public.rate_limit_messages();

-- Realtime: broadcast inserts (RLS is applied to what each client receives).
alter publication supabase_realtime add table public.messages;

-- Housekeeping: keep the table small. Run manually or schedule via Database → Cron (pg_cron):
--   select cron.schedule('trim-messages', '0 4 * * *', $$delete from public.messages where created_at < now() - interval '30 days'$$);

-- =====================================================================
-- Blocks, bans and admins
-- =====================================================================

-- Personal blocks: I stop seeing this person's messages, and they can no longer whisper me.
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  blocked_name text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;
create policy "manage own blocks" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

-- Admins: people who can kick. Add yourself with:
--   insert into public.admins (user_id) values ('<your user id — type /whoami in the chat>');
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = auth.uid());

-- Bans (a kick is a ban). Banned users cannot send anything.
create table if not exists public.bans (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  banned_name text,
  reason      text,
  banned_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz            -- null = permanent
);
alter table public.bans enable row level security;

-- Helper checks that bypass RLS so policies can consult other people's rows.
create or replace function public.is_admin(u uuid) returns boolean language sql security definer stable as
  $$ select exists (select 1 from public.admins where user_id = u) $$;
create or replace function public.is_banned(u uuid) returns boolean language sql security definer stable as
  $$ select exists (select 1 from public.bans where user_id = u and (expires_at is null or expires_at > now())) $$;
create or replace function public.has_blocked(blocker uuid, target uuid) returns boolean language sql security definer stable as
  $$ select exists (select 1 from public.blocks where blocker_id = blocker and blocked_id = target) $$;

create policy "admins manage bans" on public.bans for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()) and user_id <> auth.uid() and not public.is_admin(user_id));
create policy "see own ban" on public.bans for select to authenticated using (user_id = auth.uid());

-- Replace the message policies so they honour blocks and bans.
drop policy if exists "read visible messages" on public.messages;
drop policy if exists "send as self" on public.messages;

create policy "read visible messages" on public.messages for select to authenticated
  using (
    (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid())
    and not public.has_blocked(auth.uid(), sender_id)          -- hide people I've blocked
  );

create policy "send as self" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '')
    and (recipient_id is null or recipient_id <> auth.uid())
    and not public.is_banned(auth.uid())                        -- kicked users are muted
    and (recipient_id is null or not public.has_blocked(recipient_id, auth.uid()))  -- can't whisper someone who blocked you
  );
