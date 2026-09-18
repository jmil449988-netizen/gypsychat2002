-- ============================================================================
-- Regional boards + tags + subscriptions for the Threads board
-- ============================================================================
-- Until now there was one board, /gen/, and every thread landed on it. This splits it by region,
-- puts an optional subject tag on each thread, and lets a person subscribe to a board so that a new
-- thread there reaches their phone.
--
-- Three deliberate choices worth stating, because they are the ones that are painful to reverse:
--
-- 1. The board and the tag are COLUMNS on threads, not tables of their own. The list of boards is
--    fixed and short and is decided by people, not by data -- nobody is going to add a tenth region
--    at three in the morning -- and a lookup table would buy a join on every catalog query in
--    exchange for nothing. The check constraints below are the list. Adding a board later is one
--    `alter ... drop constraint / add constraint`, which is a smaller change than it looks.
--
-- 2. One tag per thread, so it is a column and not a join table. A post that is genuinely two
--    things picks the closer one. This was chosen over multi-tagging on the grounds that people
--    tick every box when you let them, and a filter that matches everything filters nothing.
--
-- 3. Existing threads keep working. board defaults to 'gen' and tag stays null, so nothing has to
--    be migrated, nothing is orphaned, and /gen/ survives as the board for anything that is not
--    about a place. A thread posted before today simply stays where it was.

-- ---------------------------------------------------------------------------
-- 1. board + tag on threads
-- ---------------------------------------------------------------------------
alter table public.threads add column if not exists board text not null default 'gen';
alter table public.threads add column if not exists tag   text;

alter table public.threads drop constraint if exists threads_board_check;
alter table public.threads add constraint threads_board_check check (board in (
  'gen',        -- the original board: anything that is not about a place
  'northeast',
  'southeast',
  'midwest',
  'texmex',     -- Texas and the border. Arizona and New Mexico are 'southwest'.
  'southwest',
  'pnw',
  'canada',
  'europe',
  'elsewhere'   -- the catch-all: California, the Mountain West, Australia, anywhere the map misses
));

alter table public.threads drop constraint if exists threads_tag_check;
alter table public.threads add constraint threads_tag_check check (tag is null or tag in (
  'work', 'trade', 'events', 'family', 'travel', 'hand', 'music', 'food', 'talk'
));

-- The catalog is always "this board, newest bump first", so the index leads with board. The older
-- threads_bumped index stays for the all-boards view.
create index if not exists threads_board_bumped on public.threads (board, bumped_at desc);
create index if not exists threads_board_tag on public.threads (board, tag) where tag is not null;

-- ---------------------------------------------------------------------------
-- 2. subscriptions
-- ---------------------------------------------------------------------------
-- One row per person per board they follow. No row means not subscribed, so unsubscribing is a
-- delete rather than a flag -- there is no such thing as a dormant subscription to reason about.
create table if not exists public.thread_subs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  board      text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, board)
);

alter table public.thread_subs drop constraint if exists thread_subs_board_check;
alter table public.thread_subs add constraint thread_subs_board_check check (board in (
  'gen','northeast','southeast','midwest','texmex','southwest','pnw','canada','europe','elsewhere'
));

-- Looking up "everyone subscribed to this board" is what the push fan-out does on every new
-- thread, so it gets its own index rather than scanning the primary key.
create index if not exists thread_subs_board on public.thread_subs (board);

alter table public.thread_subs enable row level security;

-- Your subscriptions are yours: you may add, see and remove your own rows and no one else's. The
-- send-push edge function reads this table with the service-role key, which bypasses RLS entirely
-- -- that is what lets it find OTHER people's subscriptions when somebody posts, without any
-- browser ever being able to see who follows what.
create policy "manage own thread subs" on public.thread_subs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. who to notify
-- ---------------------------------------------------------------------------
-- Security definer so the edge function can call it with one round trip, and so the logic for
-- "who should hear about this" lives next to the data rather than in three places in JavaScript.
-- The poster is excluded here rather than in the caller: you should never be pushed your own post,
-- and making that the function's job means no caller can forget it.
create or replace function public.thread_sub_targets(p_board text, p_exclude uuid)
returns table (user_id uuid)
language sql
security definer
set search_path = public
as $$
  select s.user_id
    from public.thread_subs s
   where s.board = p_board
     and s.user_id is distinct from p_exclude
     and not public.is_banned(s.user_id)
$$;

-- `authenticated` has to be named explicitly. Supabase grants EXECUTE on public-schema functions
-- to anon/authenticated/service_role by default, and revoking from PUBLIC does NOT remove an
-- explicit grant to a role -- so the first version of this file, which revoked only from public
-- and anon, left every signed-in browser able to call a SECURITY DEFINER function that returns
-- who is subscribed to any board. Caught by a rolled-back dry run rather than by reading it.
revoke all on function public.thread_sub_targets(text, uuid) from public, anon, authenticated;
grant execute on function public.thread_sub_targets(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. column privileges
-- ---------------------------------------------------------------------------
-- The insert policy on threads already pins op_id and op_name to the signed-in person; board and
-- tag are free-form by comparison, so the check constraints above are what keep them honest. A
-- browser may set them on insert but never rewrite them afterwards, which is why update is not
-- granted here -- an existing thread cannot be dragged onto another board after the fact.
grant insert (board, tag) on public.threads to authenticated;
-- Note, having checked the live database rather than assumed: `authenticated` already holds
-- column-level INSERT on every column of threads from Supabase's defaults, so the line above
-- changes nothing today. It is kept as a statement of intent in case those defaults are ever
-- tightened. What actually stops a thread being dragged onto another board after it is posted is
-- that threads has NO update policy at all -- verified by a dry run that updated zero rows.
