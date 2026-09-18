-- The Game Room: tables with four player seats and four spectator seats, and UNO for 2-4 players --------
--
-- Build 169, Step 1 of the 4-player games. Decided with the user on 18 Sept 2026:
--   * The Game Room page lists the open tables. Anyone can sit down; the host can also invite
--     friends (with a push). A new table is announced in the main chat with a Join link -- the
--     client draws that from the realtime INSERT on game_tables, so it always names the real host.
--   * Each table has 4 player seats and 4 spectator seats. Spectators watch and chat only; to play
--     they take a free player seat between games. One table at a time per person.
--   * The host deals once 2-4 players are seated.
--   * Two missed turns in a row and you are out of the round and lose your seat.
--   * UNO is played until one player is left holding cards. XP goes by the order players get rid of
--     all their cards: 1st 10, 2nd 5, 3rd 2; whoever is left holding cards gets nothing. Only
--     players who actually play out their hand are paid, so a round "won" because everyone else
--     left or ran out of time pays nothing (no start-a-table-and-leave farming). Counts toward the
--     shared 500-a-day game cap (game_points_today reads table_results).
--   * Hold'em tables (Step 2) will reuse game_tables / table_seats / table_messages; table_open
--     refuses 'holdem' until then.
--
-- State, split by who may see it (the same idea as the 2-player UNO in uno_feature.sql):
--   game_tables      one row per table: game, host, open/playing/closed, round number. Everyone
--                    signed in can read it (that is the Game Room list). Published on realtime:
--                    every seat, host or status change touches its updated_at, and clients re-read
--                    that table's seats when it changes, so table_seats itself is not published.
--   table_seats      who sits where. Everyone can read it (the list shows names).
--   table_messages   the table's chat. Readable only by people seated at that table (and admins).
--   table_invites    "X invites you to their table". Readable by the invitee and the inviter.
--   uno_tables       the public part of an UNO round: seat order, card counts, UNO calls, places,
--                    whose turn, direction, top card and colour. Readable by everyone.
--   uno_table_hands  each player's cards. RLS: only the owner can read their row.
--   uno_table_decks  the draw and discard piles. No policies: only the functions touch it.
--   table_results    one row per player per finished place (for the cap, and a ladder later).
-- Every change goes through the security-definer functions below; browsers can't write any of
-- these tables directly. The internal helpers (ut_*, table_drop, table_shut, tables_sweep) are
-- executable only by service_role, so nobody can call them to act in someone else's name.
--
-- Housekeeping without a scheduler: while seated, each browser calls table_heartbeat() once a
-- minute. That stamps its seat and runs tables_sweep(), which drops seats not heard from for five
-- minutes (except players still holding cards in a running round -- the turn clock handles those),
-- shuts rounds nobody has touched for ten minutes, and deletes closed tables after a day.
--
-- Run once in the Supabase SQL Editor. Practice run first:
--   begin;  <this file>  <game_tables_dryrun.sql>  rollback;

-- Tables ------------------------------------------------------------------------------------------
create table if not exists public.game_tables (
  id          bigint      generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  game        text        not null check (game in ('uno', 'holdem')),
  opened_by   uuid        references auth.users(id) on delete set null,
  host_id     uuid        references auth.users(id) on delete set null,
  host_name   text,
  status      text        not null default 'open' check (status in ('open', 'playing', 'closed')),
  round       integer     not null default 0
);
create index if not exists game_tables_status on public.game_tables (status, created_at desc);
create index if not exists game_tables_opened_by on public.game_tables (opened_by, created_at desc);

create table if not exists public.table_seats (
  table_id  bigint      not null references public.game_tables(id) on delete cascade,
  user_id   uuid        not null references auth.users(id) on delete cascade,
  name      text,
  role      text        not null check (role in ('player', 'spectator')),
  seat      integer     not null check (seat between 1 and 4),
  joined_at timestamptz not null default now(),
  seen_at   timestamptz not null default now(),
  primary key (table_id, user_id),
  unique (table_id, role, seat)
);
create unique index if not exists table_seats_one_table_each on public.table_seats (user_id);

create table if not exists public.table_messages (
  id          bigint      generated always as identity primary key,
  table_id    bigint      not null references public.game_tables(id) on delete cascade,
  created_at  timestamptz not null default now(),
  sender_id   uuid        not null references auth.users(id) on delete cascade,
  sender_name text,
  body        text        not null check (char_length(body) between 1 and 300)
);
create index if not exists table_messages_table on public.table_messages (table_id, id desc);
create index if not exists table_messages_sender on public.table_messages (sender_id, created_at desc);

create table if not exists public.table_invites (
  table_id   bigint      not null references public.game_tables(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  from_id    uuid        not null references auth.users(id) on delete cascade,
  from_name  text,
  created_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

-- Arrays are all in seat order at the deal (index 1 = the first player dealt in).
create table if not exists public.uno_tables (
  table_id        bigint      primary key references public.game_tables(id) on delete cascade,
  round           integer     not null,
  status          text        not null check (status in ('playing', 'over')),
  players         uuid[]      not null,
  names           text[]      not null,
  cards           integer[]   not null,   -- how many cards each holds
  uno             boolean[]   not null,   -- has called UNO
  missed          integer[]   not null,   -- turns missed in a row
  place           integer[]   not null,   -- 0 while still holding cards; else their place
  outcome         text[]      not null,   -- '' playing, 'out' played out, 'last' left holding cards, 'left', 'idle'
  points          integer[]   not null,   -- XP paid this round
  turn            integer,                -- index into players; null once the round is over
  direction       integer     not null default 1 check (direction in (1, -1)),
  phase           text        not null default 'play' check (phase in ('play', 'after_draw')),
  top_card        text,
  color           text        check (color is null or color in ('R', 'G', 'B', 'Y')),
  draw_count      integer     not null default 0,
  exposed         integer,                -- index of a player on one card who didn't call UNO (catchable)
  last_action     text,
  turn_started_at timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.uno_table_hands (
  table_id   bigint      not null references public.game_tables(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  round      integer     not null,
  cards      text[]      not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

create table if not exists public.uno_table_decks (
  table_id bigint primary key references public.game_tables(id) on delete cascade,
  draw     text[] not null default '{}',
  discard  text[] not null default '{}'
);

-- No foreign key to game_tables on purpose: closed tables are deleted after a day, and these rows
-- must outlive them (the 24-hour cap and any ladder read them).
create table if not exists public.table_results (
  id         bigint      generated always as identity primary key,
  created_at timestamptz not null default now(),
  table_id   bigint      not null,
  round      integer     not null,
  game       text        not null,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  place      integer     not null,
  players    integer     not null,
  outcome    text        not null check (outcome in ('out', 'last', 'left', 'idle')),
  points     integer     not null default 0,
  unique (table_id, round, user_id)
);
create index if not exists table_results_user on public.table_results (user_id, created_at desc);

-- Who can read what ------------------------------------------------------------------------------
alter table public.game_tables     enable row level security;
alter table public.table_seats     enable row level security;
alter table public.table_messages  enable row level security;
alter table public.table_invites   enable row level security;
alter table public.uno_tables      enable row level security;
alter table public.uno_table_hands enable row level security;
alter table public.uno_table_decks enable row level security;   -- no policies: functions only
alter table public.table_results   enable row level security;

drop policy if exists "see the tables" on public.game_tables;
create policy "see the tables" on public.game_tables for select to authenticated using (true);
drop policy if exists "see who sits where" on public.table_seats;
create policy "see who sits where" on public.table_seats for select to authenticated using (true);
drop policy if exists "chat at my table" on public.table_messages;
create policy "chat at my table" on public.table_messages for select to authenticated
  using (exists (select 1 from public.table_seats s where s.table_id = table_messages.table_id and s.user_id = auth.uid())
         or public.is_admin(auth.uid()));
drop policy if exists "my invites" on public.table_invites;
create policy "my invites" on public.table_invites for select to authenticated
  using (user_id = auth.uid() or from_id = auth.uid());
drop policy if exists "see the uno tables" on public.uno_tables;
create policy "see the uno tables" on public.uno_tables for select to authenticated using (true);
drop policy if exists "my table hand" on public.uno_table_hands;
create policy "my table hand" on public.uno_table_hands for select to authenticated using (user_id = auth.uid());
drop policy if exists "my table results" on public.table_results;
create policy "my table results" on public.table_results for select to authenticated using (user_id = auth.uid());

revoke all on public.game_tables, public.table_seats, public.table_messages, public.table_invites, public.uno_tables,
  public.uno_table_hands, public.uno_table_decks, public.table_results from anon, authenticated;
grant select on public.game_tables, public.table_seats, public.table_messages, public.table_invites, public.uno_tables,
  public.uno_table_hands, public.table_results to authenticated;

-- Realtime: exactly the tables a browser listens to. They go on channels of their own in the
-- client (not the room channel), and each one must be in this publication -- a listened-to table
-- that is missing from it silently stops every other listener on the same channel (build 154).
do $$
declare t text;
begin
  foreach t in array array['game_tables', 'uno_tables', 'uno_table_hands', 'table_messages', 'table_invites'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The daily cap counts table UNO too (Hold'em and Prasta stay out: chips only change hands) ------
create or replace function public.game_points_today(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.uno_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.hangman_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.battleship_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(points) from public.table_results
              where user_id = p and game = 'uno' and created_at > now() - interval '24 hours'), 0)
  )::int
$$;

-- Small pure helpers --------------------------------------------------------------------------------
-- The next player still holding cards, p_steps players along in direction p_dir.
create or replace function public.ut_next(p_place integer[], p_from integer, p_dir integer, p_steps integer default 1) returns integer
language plpgsql immutable set search_path = public as $$
declare n int := coalesce(array_length(p_place, 1), 0); i int := p_from; k int; j int;
begin
  if n = 0 then return null; end if;
  for k in 1..greatest(p_steps, 1) loop
    for j in 1..n loop
      i := ((i - 1 + p_dir) % n + n) % n + 1;
      exit when p_place[i] = 0;
    end loop;
  end loop;
  return i;
end $$;

create or replace function public.ut_place_points(p_place integer) returns integer
language sql immutable set search_path = public as $$
  select case p_place when 1 then 10 when 2 then 5 when 3 then 2 else 0 end $$;

create or replace function public.ut_ordinal(n integer) returns text
language sql immutable set search_path = public as $$
  select n || case when n % 100 between 11 and 13 then 'th' when n % 10 = 1 then 'st' when n % 10 = 2 then 'nd'
                   when n % 10 = 3 then 'rd' else 'th' end $$;

-- Internal: cards and counts --------------------------------------------------------------------------
-- Draw n cards for one player, rebuilding the pile from the discard (all but its top card) when it
-- runs out. Returns what was drawn.
create or replace function public.ut_draw(p_table bigint, p_user uuid, n integer) returns text[]
language plpgsql security definer set search_path = public as $$
declare d public.uno_table_decks; drawn text[] := '{}'; i int; keep text; rest text[];
begin
  select * into d from public.uno_table_decks where table_id = p_table for update;
  for i in 1..n loop
    if coalesce(array_length(d.draw, 1), 0) = 0 then
      if coalesce(array_length(d.discard, 1), 0) <= 1 then exit; end if;
      keep := d.discard[array_length(d.discard, 1)];
      rest := d.discard[1:array_length(d.discard, 1) - 1];
      select array_agg(c order by random()) into d.draw from unnest(rest) c;
      d.discard := array[keep];
    end if;
    drawn := drawn || d.draw[1];
    d.draw := d.draw[2:];
  end loop;
  update public.uno_table_decks set draw = d.draw, discard = d.discard where table_id = p_table;
  update public.uno_table_hands set cards = cards || drawn, updated_at = now() where table_id = p_table and user_id = p_user;
  return drawn;
end $$;

-- Recount the public card counts and pile size from the private rows; a hand that grew past one
-- card loses its UNO call.
create or replace function public.ut_sync(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u public.uno_tables; i int; c int[]; un boolean[];
begin
  select * into u from public.uno_tables where table_id = p_table for update;
  c := u.cards; un := u.uno;
  for i in 1..array_length(u.players, 1) loop
    c[i] := coalesce((select array_length(h.cards, 1) from public.uno_table_hands h where h.table_id = p_table and h.user_id = u.players[i]), 0);
    if c[i] > 1 then un[i] := false; end if;
  end loop;
  update public.uno_tables set cards = c, uno = un,
    draw_count = coalesce((select array_length(d.draw, 1) from public.uno_table_decks d where d.table_id = p_table), 0),
    updated_at = now()
  where table_id = p_table;
end $$;

-- A place is settled: write the result, and pay XP for playing out (under the shared daily cap).
-- Returns the XP paid.
create or replace function public.ut_record(p_table bigint, p_round integer, p_user uuid, p_place integer, p_players integer, p_outcome text) returns integer
language plpgsql security definer set search_path = public as $$
declare pts int := 0;
begin
  if p_outcome = 'out' then
    pts := greatest(0, least(public.ut_place_points(p_place), 500 - public.game_points_today(p_user)));
  end if;
  insert into public.table_results (table_id, round, game, user_id, place, players, outcome, points)
    values (p_table, p_round, 'uno', p_user, p_place, p_players, p_outcome, pts)
    on conflict (table_id, round, user_id) do nothing;
  if not found then return 0; end if;
  if pts > 0 then
    insert into public.user_stats (user_id, game_points) values (p_user, pts)
      on conflict (user_id) do update set game_points = public.user_stats.game_points + pts;
  end if;
  return pts;
end $$;

-- Only one player still holds cards: they take the place that is left, and the round is over.
create or replace function public.ut_finish(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u public.uno_tables; n int; i int; pl int[]; oc text[]; top int;
begin
  select * into u from public.uno_tables where table_id = p_table for update;
  if u.status <> 'playing' then return; end if;
  n := array_length(u.players, 1); pl := u.place; oc := u.outcome;
  top := 1 + (select count(*) from unnest(u.outcome) o where o = 'out');
  for i in 1..n loop
    if pl[i] = 0 then
      pl[i] := top; oc[i] := 'last';
      perform public.ut_record(p_table, u.round, u.players[i], top, n, 'last');
    end if;
  end loop;
  update public.uno_tables set place = pl, outcome = oc, status = 'over', turn = null, exposed = null, phase = 'play', updated_at = now()
    where table_id = p_table;
  update public.game_tables set status = case when status = 'closed' then 'closed' else 'open' end, updated_at = now() where id = p_table;
end $$;

-- A player still holding cards leaves the round ('left') or times out of it ('idle'): they take the
-- lowest place still free (no XP), their cards go to the bottom of the draw pile, and if it was their
-- turn it moves on. Ends the round if only one player is left holding cards.
create or replace function public.ut_remove(p_table bigint, p_idx integer, p_why text) returns void
language plpgsql security definer set search_path = public as $$
declare u public.uno_tables; n int; pl int[]; oc text[]; bottom int; h text[]; t_now int; ph text; tsa timestamptz;
begin
  select * into u from public.uno_tables where table_id = p_table for update;
  if u.status <> 'playing' or p_idx is null or u.place[p_idx] <> 0 then return; end if;
  n := array_length(u.players, 1); pl := u.place; oc := u.outcome;
  bottom := n - (select count(*) from unnest(oc) o where o in ('left', 'idle'));
  pl[p_idx] := bottom; oc[p_idx] := p_why;
  perform public.ut_record(p_table, u.round, u.players[p_idx], bottom, n, p_why);
  select cards into h from public.uno_table_hands where table_id = p_table and user_id = u.players[p_idx] for update;
  update public.uno_table_decks set draw = draw || coalesce(h, '{}') where table_id = p_table;
  update public.uno_table_hands set cards = '{}', updated_at = now() where table_id = p_table and user_id = u.players[p_idx];
  t_now := u.turn; ph := u.phase; tsa := u.turn_started_at;
  if u.turn = p_idx then t_now := public.ut_next(pl, p_idx, u.direction); ph := 'play'; tsa := now(); end if;
  update public.uno_tables set place = pl, outcome = oc, turn = t_now, phase = ph, turn_started_at = tsa,
    exposed = case when exposed = p_idx then null else exposed end,
    last_action = coalesce(u.names[p_idx], 'Someone') || case when p_why = 'idle' then ' missed two turns in a row and is out' else ' left the table' end,
    updated_at = now()
  where table_id = p_table;
  perform public.ut_sync(p_table);
  if (select count(*) from unnest(pl) p where p = 0) <= 1 then perform public.ut_finish(p_table); end if;
end $$;

-- Internal: seats and tables -------------------------------------------------------------------------
-- Close a table: a round in play just stops (places already settled keep their XP), and everyone is
-- unseated.
create or replace function public.table_shut(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.game_tables where id = p_table for update;
  update public.uno_tables set status = 'over', turn = null, exposed = null, last_action = 'The table closed.', updated_at = now()
    where table_id = p_table and status = 'playing';
  delete from public.table_seats where table_id = p_table;
  delete from public.table_invites where table_id = p_table;
  update public.game_tables set status = 'closed', updated_at = now() where id = p_table;
end $$;

-- Take someone off a table: 'left' (they chose to), 'idle' (two missed turns), 'stale' (not heard
-- from for five minutes). A player still holding cards in a running round is out of it first. The
-- host's role passes to the longest-seated player (else spectator); an empty table closes.
create or replace function public.table_drop(p_table bigint, p_user uuid, p_why text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; s public.table_seats; u public.uno_tables; i int; nh uuid; nn text;
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into s from public.table_seats where table_id = p_table and user_id = p_user;
  if t.id is null or s.user_id is null then return; end if;
  if p_why = 'stale' and s.seen_at >= now() - interval '5 minutes' then return; end if;   -- heard from them since the sweep looked
  if t.game = 'uno' and t.status = 'playing' then
    select * into u from public.uno_tables where table_id = p_table for update;
    i := array_position(u.players, p_user);
    if u.status = 'playing' and i is not null and u.place[i] = 0 then
      perform public.ut_remove(p_table, i, case when p_why = 'idle' then 'idle' else 'left' end);
    end if;
  end if;
  delete from public.table_seats where table_id = p_table and user_id = p_user;
  if not exists (select 1 from public.table_seats where table_id = p_table) then
    perform public.table_shut(p_table);
    return;
  end if;
  if t.host_id is not distinct from p_user then
    select ts.user_id, ts.name into nh, nn from public.table_seats ts where ts.table_id = p_table
      order by (ts.role = 'player') desc, ts.joined_at, ts.seat limit 1;
    update public.game_tables set host_id = nh, host_name = nn where id = p_table;
  end if;
  update public.game_tables set updated_at = now() where id = p_table;
end $$;

create or replace function public.tables_sweep() returns void
language plpgsql security definer set search_path = public as $$
declare r record; x record; u public.uno_tables;
begin
  -- One sweep at a time (a second one running at the same moment just skips), and tables are
  -- visited in id order, so sweeps can't deadlock on each other.
  if not pg_try_advisory_xact_lock(hashtext('public.tables_sweep')) then return; end if;
  for r in
    select t.id from public.game_tables t
     where t.status <> 'closed'
       and (exists (select 1 from public.table_seats s where s.table_id = t.id and s.seen_at < now() - interval '5 minutes'
                     and s.user_id is distinct from auth.uid())
            or exists (select 1 from public.uno_tables v where v.table_id = t.id and v.status = 'playing'
                        and v.updated_at < now() - interval '10 minutes'))
     order by t.id
  loop
    perform 1 from public.game_tables where id = r.id for update;
    u := null;
    select * into u from public.uno_tables where table_id = r.id;
    -- a round nobody has touched for ten minutes: everyone has gone, so nobody is running the clock
    if u.status = 'playing' and u.updated_at < now() - interval '10 minutes' then
      perform public.table_shut(r.id);
      continue;
    end if;
    -- seats not heard from for five minutes, except players still holding cards in a running round
    -- (the turn clock deals with those: two missed turns and they're out)
    for x in
      select s.user_id from public.table_seats s
       where s.table_id = r.id and s.seen_at < now() - interval '5 minutes' and s.user_id is distinct from auth.uid()
         and not coalesce(s.role = 'player' and u.status = 'playing' and u.place[array_position(u.players, s.user_id)] = 0, false)
       order by s.user_id
    loop
      perform public.table_drop(r.id, x.user_id, 'stale');
    end loop;
  end loop;
  delete from public.table_invites where created_at < now() - interval '1 hour';
  delete from public.game_tables where status = 'closed' and updated_at < now() - interval '1 day';
end $$;

-- The verbs: tables ------------------------------------------------------------------------------------
create or replace function public.table_open(p_game text) returns public.game_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; nm text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_game = 'holdem' then raise exception 'Hold''em tables are coming soon.'; end if;
  if p_game is distinct from 'uno' then raise exception 'Unknown game.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'You can''t open a table right now.'; end if;
  perform public.tables_sweep();
  if exists (select 1 from public.table_seats where user_id = auth.uid()) then raise exception 'You''re already at a table. Leave it first.'; end if;
  if exists (select 1 from public.game_tables where opened_by = auth.uid() and created_at > now() - interval '1 minute') then
    raise exception 'You just opened a table. Give it a minute.';
  end if;
  select name into nm from public.profiles where user_id = auth.uid();
  insert into public.game_tables (game, opened_by, host_id, host_name) values (p_game, auth.uid(), auth.uid(), nm) returning * into t;
  insert into public.table_seats (table_id, user_id, name, role, seat) values (t.id, auth.uid(), nm, 'player', 1);
  return t;
exception when unique_violation then
  raise exception 'You''re already at a table. Leave it first.';
end $$;

create or replace function public.table_sit(p_table bigint, p_role text) returns public.game_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; s public.table_seats; u public.uno_tables; nm text; free int; i int;
begin
  if p_role is null or p_role not in ('player', 'spectator') then raise exception 'Pick a player seat or a spectator seat.'; end if;
  if auth.uid() is null or public.is_banned(auth.uid()) then raise exception 'You can''t join tables right now.'; end if;
  perform public.tables_sweep();
  select * into t from public.game_tables where id = p_table for update;
  if t.id is null or t.status = 'closed' then raise exception 'That table has closed.'; end if;
  select * into s from public.table_seats where user_id = auth.uid();
  if s.table_id is not null and s.table_id <> p_table then raise exception 'You''re at another table. Leave it first.'; end if;
  if s.table_id = p_table and s.role = p_role then return t; end if;
  if p_role = 'player' then
    if t.status = 'playing' then raise exception 'A game is on. Watch for now, and take a free seat when it ends.'; end if;
    select min(g) into free from generate_series(1, 4) g
      where not exists (select 1 from public.table_seats x where x.table_id = p_table and x.role = 'player' and x.seat = g);
    if free is null then raise exception 'All four player seats are taken.'; end if;
  else
    if s.table_id = p_table and t.status = 'playing' then
      select * into u from public.uno_tables where table_id = p_table;
      i := array_position(u.players, auth.uid());
      if u.status = 'playing' and i is not null and u.place[i] = 0 then
        raise exception 'You''re in the middle of a round. Finish it, or leave the table.';
      end if;
    end if;
    select min(g) into free from generate_series(1, 4) g
      where not exists (select 1 from public.table_seats x where x.table_id = p_table and x.role = 'spectator' and x.seat = g);
    if free is null then raise exception 'All four spectator seats are taken.'; end if;
  end if;
  select name into nm from public.profiles where user_id = auth.uid();
  if s.table_id = p_table then
    update public.table_seats set role = p_role, seat = free, name = nm, seen_at = now() where table_id = p_table and user_id = auth.uid();
  else
    insert into public.table_seats (table_id, user_id, name, role, seat) values (p_table, auth.uid(), nm, p_role, free);
  end if;
  delete from public.table_invites where table_id = p_table and user_id = auth.uid();
  update public.game_tables set updated_at = now() where id = p_table returning * into t;
  return t;
exception when unique_violation then
  raise exception 'You''re already at a table. Leave it first.';
end $$;

create or replace function public.table_leave(p_table bigint) returns public.game_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables;
begin
  perform public.table_drop(p_table, auth.uid(), 'left');
  select * into t from public.game_tables where id = p_table;
  return t;
end $$;

-- The host deals: everyone in a player seat, in seat order, seven cards each; a random player starts.
create or replace function public.table_start(p_table bigint) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; ps uuid[]; ns text[]; n int; deck text[]; first text; tries int := 0; i int; st int;
begin
  select * into t from public.game_tables where id = p_table for update;
  if t.id is null or t.status = 'closed' then raise exception 'That table has closed.'; end if;
  if t.host_id is distinct from auth.uid() then raise exception 'Only the host can deal.'; end if;
  if t.status = 'playing' then raise exception 'A game is already on.'; end if;
  if t.game <> 'uno' then raise exception 'Hold''em tables are coming soon.'; end if;
  select array_agg(user_id order by seat), array_agg(coalesce(name, 'Player') order by seat) into ps, ns
    from public.table_seats where table_id = p_table and role = 'player';
  n := coalesce(array_length(ps, 1), 0);
  if n < 2 then raise exception 'You need at least two players to deal.'; end if;
  loop
    deck := public.uno_new_deck(); tries := tries + 1;
    first := deck[n * 7 + 1];
    exit when first ~ '^[RGBY][0-9]$' or tries > 20;
  end loop;
  -- hands are updated in place where the player already had one here, so each browser gets its new
  -- hand as an UPDATE (it listens to INSERT and UPDATE only)
  delete from public.uno_table_hands where table_id = p_table and not (user_id = any (ps));
  for i in 1..n loop
    insert into public.uno_table_hands (table_id, user_id, round, cards) values (p_table, ps[i], t.round + 1, deck[(i - 1) * 7 + 1 : i * 7])
      on conflict (table_id, user_id) do update set round = excluded.round, cards = excluded.cards, updated_at = now();
  end loop;
  insert into public.uno_table_decks (table_id, draw, discard) values (p_table, deck[n * 7 + 2 :], array[first])
    on conflict (table_id) do update set draw = excluded.draw, discard = excluded.discard;
  st := 1 + floor(random() * n)::int;
  insert into public.uno_tables (table_id, round, status, players, names, cards, uno, missed, place, outcome, points,
      turn, direction, phase, top_card, color, draw_count, exposed, last_action, turn_started_at, updated_at)
    values (p_table, t.round + 1, 'playing', ps, ns, array_fill(7, array[n]), array_fill(false, array[n]), array_fill(0, array[n]),
      array_fill(0, array[n]), array_fill(''::text, array[n]), array_fill(0, array[n]),
      st, 1, 'play', first, left(first, 1), 0, null, 'Round ' || (t.round + 1) || ': cards dealt. ' || ns[st] || ' goes first.', now(), now())
    on conflict (table_id) do update set round = excluded.round, status = excluded.status, players = excluded.players, names = excluded.names,
      cards = excluded.cards, uno = excluded.uno, missed = excluded.missed, place = excluded.place, outcome = excluded.outcome,
      points = excluded.points, turn = excluded.turn, direction = excluded.direction, phase = excluded.phase, top_card = excluded.top_card,
      color = excluded.color, draw_count = excluded.draw_count, exposed = excluded.exposed, last_action = excluded.last_action,
      turn_started_at = excluded.turn_started_at, updated_at = excluded.updated_at;
  perform public.ut_sync(p_table);
  update public.game_tables set status = 'playing', round = t.round + 1, updated_at = now() where id = p_table;
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

create or replace function public.table_say(p_table bigint, p_body text) returns public.table_messages
language plpgsql security definer set search_path = public as $$
declare m public.table_messages; nm text; b text := btrim(coalesce(p_body, ''));
begin
  if not exists (select 1 from public.table_seats where table_id = p_table and user_id = auth.uid()) then raise exception 'Sit down at the table to chat.'; end if;
  if b = '' then raise exception 'Type something first.'; end if;
  b := left(b, 300);
  if public.is_banned(auth.uid()) or public.is_muted_or_cooling(auth.uid()) then raise exception 'You can''t chat right now.'; end if;
  if (select count(*) from public.table_messages where sender_id = auth.uid() and created_at > now() - interval '5 seconds') >= 5 then
    raise exception 'Slow down a little.';
  end if;
  select name into nm from public.profiles where user_id = auth.uid();
  insert into public.table_messages (table_id, sender_id, sender_name, body) values (p_table, auth.uid(), nm, b) returning * into m;
  delete from public.table_messages where table_id = p_table
    and id < (select min(k.id) from (select id from public.table_messages where table_id = p_table order by id desc limit 100) k);
  update public.table_seats set seen_at = now() where table_id = p_table and user_id = auth.uid();
  return m;
end $$;

-- The host invites a friend (someone they could whisper). The browser sends the push itself.
create or replace function public.table_invite(p_table bigint, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; nm text; prev timestamptz;
begin
  select * into t from public.game_tables where id = p_table;
  if t.id is null or t.status = 'closed' then raise exception 'That table has closed.'; end if;
  if t.host_id is distinct from auth.uid() then raise exception 'Only the host can invite people.'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'Pick a friend to invite.'; end if;
  if not exists (select 1 from public.friends where owner_id = auth.uid() and friend_id = p_user) then raise exception 'You can invite people on your friends list.'; end if;
  if not public.can_whisper(auth.uid(), p_user) or public.has_blocked(p_user, auth.uid()) then raise exception 'They aren''t taking invites from you.'; end if;
  if exists (select 1 from public.table_seats where table_id = p_table and user_id = p_user) then raise exception 'They''re already at your table.'; end if;
  select created_at into prev from public.table_invites where table_id = p_table and user_id = p_user;
  if prev > now() - interval '1 minute' then raise exception 'You just invited them.'; end if;
  select name into nm from public.profiles where user_id = auth.uid();
  insert into public.table_invites (table_id, user_id, from_id, from_name) values (p_table, p_user, auth.uid(), nm)
    on conflict (table_id, user_id) do update set created_at = now(), from_id = excluded.from_id, from_name = excluded.from_name;
  return true;
end $$;

create or replace function public.table_invite_dismiss(p_table bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.table_invites where table_id = p_table and user_id = auth.uid() $$;

-- Once a minute from every seated browser: "still here", plus the housekeeping.
create or replace function public.table_heartbeat() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.tables_sweep();
  update public.table_seats set seen_at = now() where user_id = auth.uid();
end $$;

create or replace function public.table_close(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only an admin can close a table.'; end if;
  perform public.table_shut(p_table);
end $$;

-- The verbs: UNO at a table -------------------------------------------------------------------------------
create or replace function public.uno_table_play(p_table bigint, p_card text, p_color text default null) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; h public.uno_table_hands; me int; idx int; newcol text; rnk text; act text; whom text;
  left_after int; n int; pl int[]; oc text[]; pts int[]; mis int[]; active int; top int; victim int; nxt int; dir int; expo int;
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into u from public.uno_tables where table_id = p_table for update;
  if t.id is null or u.table_id is null or u.status <> 'playing' then raise exception 'No game is on at this table.'; end if;
  me := array_position(u.players, auth.uid());
  if me is null or u.place[me] <> 0 then raise exception 'You aren''t in this round.'; end if;
  if u.turn <> me then raise exception 'Not your turn.'; end if;
  select * into h from public.uno_table_hands where table_id = p_table and user_id = auth.uid() for update;
  idx := array_position(h.cards, p_card);
  if idx is null then raise exception 'You don''t hold that card.'; end if;
  if u.phase = 'after_draw' and h.cards[array_length(h.cards, 1)] <> p_card then raise exception 'After drawing you may only play the card you drew.'; end if;
  if not public.uno_playable(p_card, u.top_card, u.color) then raise exception 'That card doesn''t fit.'; end if;
  if p_card like 'W%' then
    if p_color is null or p_color not in ('R', 'G', 'B', 'Y') then raise exception 'Pick a colour for the wild.'; end if;
    newcol := p_color;
  else
    newcol := left(p_card, 1);
  end if;
  n := array_length(u.players, 1); pl := u.place; oc := u.outcome; pts := u.points; mis := u.missed; dir := u.direction;
  whom := coalesce(u.names[me], 'They');
  h.cards := h.cards[1:idx - 1] || h.cards[idx + 1:];
  update public.uno_table_hands set cards = h.cards, updated_at = now() where table_id = p_table and user_id = auth.uid();
  update public.uno_table_decks set discard = discard || p_card where table_id = p_table;
  left_after := coalesce(array_length(h.cards, 1), 0);
  rnk := public.uno_card_rank(p_card);
  act := whom || ' played ' || public.uno_card_name(p_card) || case when p_card like 'W%' then ' (' || public.uno_color_name(newcol) || ')' else '' end;
  mis[me] := 0;
  expo := case when left_after = 1 and not u.uno[me] then me else null end;
  if left_after = 0 then
    top := 1 + (select count(*) from unnest(oc) o where o = 'out');
    pl[me] := top; oc[me] := 'out';
    pts[me] := public.ut_record(p_table, u.round, auth.uid(), top, n, 'out');
    act := act || ' and is out in ' || public.ut_ordinal(top) || ' place';
  end if;
  active := (select count(*) from unnest(pl) p where p = 0);
  if active <= 1 then
    update public.uno_tables set top_card = p_card, color = newcol, place = pl, outcome = oc, points = pts, missed = mis,
      exposed = null, last_action = act, updated_at = now() where table_id = p_table;
    perform public.ut_sync(p_table);
    perform public.ut_finish(p_table);
  else
    if rnk = 'R' then
      if active = 2 and pl[me] = 0 then      -- two players left: Reverse works like Skip
        nxt := me; act := act || ': turn skipped';
      else
        dir := -dir; nxt := public.ut_next(pl, me, dir); act := act || ': direction reversed';
      end if;
    elsif rnk = 'S' then
      victim := public.ut_next(pl, me, dir);
      nxt := public.ut_next(pl, victim, dir);
      act := act || ': ' || coalesce(u.names[victim], 'the next player') || ' is skipped';
    elsif rnk in ('+2', 'W4') then
      victim := public.ut_next(pl, me, dir);
      perform public.ut_draw(p_table, u.players[victim], case when rnk = '+2' then 2 else 4 end);
      nxt := public.ut_next(pl, victim, dir);
      act := act || ': ' || coalesce(u.names[victim], 'the next player') || ' draws ' || case when rnk = '+2' then 'two' else 'four' end || ' and is skipped';
    else
      nxt := public.ut_next(pl, me, dir);
    end if;
    update public.uno_tables set top_card = p_card, color = newcol, place = pl, outcome = oc, points = pts, missed = mis,
      direction = dir, turn = nxt, phase = 'play', exposed = expo, last_action = act, turn_started_at = now(), updated_at = now()
      where table_id = p_table;
    perform public.ut_sync(p_table);
  end if;
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

create or replace function public.uno_table_draw(p_table bigint) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; me int; drawn text[]; mis int[]; whom text;
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into u from public.uno_tables where table_id = p_table for update;
  if t.id is null or u.table_id is null or u.status <> 'playing' then raise exception 'No game is on at this table.'; end if;
  me := array_position(u.players, auth.uid());
  if me is null or u.place[me] <> 0 then raise exception 'You aren''t in this round.'; end if;
  if u.turn <> me then raise exception 'Not your turn.'; end if;
  if u.phase = 'after_draw' then raise exception 'You already drew. Play it or pass.'; end if;
  drawn := public.ut_draw(p_table, auth.uid(), 1);
  mis := u.missed; mis[me] := 0; whom := coalesce(u.names[me], 'They');
  if coalesce(array_length(drawn, 1), 0) = 0 then
    update public.uno_tables set turn = public.ut_next(u.place, me, u.direction), turn_started_at = now(), phase = 'play', exposed = null,
      missed = mis, last_action = whom || ' couldn''t draw: no cards left', updated_at = now() where table_id = p_table;
  elsif public.uno_playable(drawn[1], u.top_card, u.color) then
    update public.uno_tables set phase = 'after_draw', exposed = null, missed = mis, last_action = whom || ' drew a card', updated_at = now()
      where table_id = p_table;
  else
    update public.uno_tables set turn = public.ut_next(u.place, me, u.direction), turn_started_at = now(), phase = 'play', exposed = null,
      missed = mis, last_action = whom || ' drew a card', updated_at = now() where table_id = p_table;
  end if;
  perform public.ut_sync(p_table);
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

create or replace function public.uno_table_pass(p_table bigint) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; me int; mis int[];
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into u from public.uno_tables where table_id = p_table for update;
  if t.id is null or u.table_id is null or u.status <> 'playing' then raise exception 'No game is on at this table.'; end if;
  me := array_position(u.players, auth.uid());
  if me is null or u.turn is distinct from me or u.phase <> 'after_draw' then raise exception 'You can only pass right after drawing.'; end if;
  mis := u.missed; mis[me] := 0;
  update public.uno_tables set turn = public.ut_next(u.place, me, u.direction), turn_started_at = now(), phase = 'play', exposed = null,
    missed = mis, last_action = coalesce(u.names[me], 'They') || ' passed', updated_at = now() where table_id = p_table;
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

-- "UNO!" -- with one card, or with two on your own turn (about to play one).
create or replace function public.uno_table_call(p_table bigint) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; me int; un boolean[]; mis int[];
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into u from public.uno_tables where table_id = p_table for update;
  if t.id is null or u.table_id is null or u.status <> 'playing' then raise exception 'No game is on at this table.'; end if;
  me := array_position(u.players, auth.uid());
  if me is null or u.place[me] <> 0 then raise exception 'You aren''t in this round.'; end if;
  if not (u.cards[me] = 1 or (u.cards[me] = 2 and u.turn = me)) then raise exception 'You can call UNO with one card left (or two, on your turn).'; end if;
  un := u.uno; un[me] := true; mis := u.missed; mis[me] := 0;
  update public.uno_tables set uno = un, missed = mis, exposed = case when exposed = me then null else exposed end,
    last_action = coalesce(u.names[me], 'They') || ' called UNO!', updated_at = now() where table_id = p_table;
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

-- Catch the player who just went down to one card without calling UNO: they draw two. Anyone still
-- in the round may do it, until the next move is made.
create or replace function public.uno_table_catch(p_table bigint) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; me int; x int; mis int[];
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into u from public.uno_tables where table_id = p_table for update;
  if t.id is null or u.table_id is null or u.status <> 'playing' then raise exception 'No game is on at this table.'; end if;
  me := array_position(u.players, auth.uid());
  if me is null or u.place[me] <> 0 then raise exception 'You aren''t in this round.'; end if;
  x := u.exposed;
  if x is null or x = me or u.place[x] <> 0 or u.cards[x] <> 1 or u.uno[x] then raise exception 'Nothing to catch.'; end if;
  perform public.ut_draw(p_table, u.players[x], 2);
  mis := u.missed; mis[me] := 0;
  update public.uno_tables set exposed = null, missed = mis,
    last_action = coalesce(u.names[me], 'Someone') || ' caught ' || coalesce(u.names[x], 'them') || ' without an UNO call: ' || coalesce(u.names[x], 'they') || ' draws two',
    updated_at = now() where table_id = p_table;
  perform public.ut_sync(p_table);
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

-- The turn clock ran out (anyone seated at the table may ask; the server checks its own clock, 29 s
-- with a second of grace). First miss: draw a card (unless they already drew) and the turn passes.
-- Second miss in a row: out of the round, and off the table.
create or replace function public.uno_table_timeout(p_table bigint) returns public.uno_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; u public.uno_tables; i int; mis int[];
begin
  select * into t from public.game_tables where id = p_table for update;
  if not exists (select 1 from public.table_seats where table_id = p_table and user_id = auth.uid()) then raise exception 'You aren''t at this table.'; end if;
  select * into u from public.uno_tables where table_id = p_table for update;
  if u.table_id is null or u.status <> 'playing' or u.turn is null then return u; end if;
  if u.turn_started_at > now() - interval '29 seconds' then return u; end if;
  i := u.turn; mis := u.missed; mis[i] := mis[i] + 1;
  if mis[i] >= 2 then
    update public.uno_tables set missed = mis where table_id = p_table;
    perform public.table_drop(p_table, u.players[i], 'idle');
  else
    if u.phase = 'play' then perform public.ut_draw(p_table, u.players[i], 1); end if;
    update public.uno_tables set missed = mis, turn = public.ut_next(u.place, i, u.direction), turn_started_at = now(), phase = 'play', exposed = null,
      last_action = coalesce(u.names[i], 'They') || ' ran out of time' || case when u.phase = 'play' then ' and draws a card' else '' end
        || '. One more missed turn and they''re out.',
      updated_at = now() where table_id = p_table;
    perform public.ut_sync(p_table);
  end if;
  select * into u from public.uno_tables where table_id = p_table;
  return u;
end $$;

-- Privileges: browsers get the verbs; the helpers are for the functions above (and service_role) only.
revoke execute on function
  public.ut_next(integer[], integer, integer, integer), public.ut_place_points(integer), public.ut_ordinal(integer),
  public.ut_draw(bigint, uuid, integer), public.ut_sync(bigint), public.ut_record(bigint, integer, uuid, integer, integer, text),
  public.ut_finish(bigint), public.ut_remove(bigint, integer, text), public.table_shut(bigint), public.table_drop(bigint, uuid, text),
  public.tables_sweep(),
  public.table_open(text), public.table_sit(bigint, text), public.table_leave(bigint), public.table_start(bigint),
  public.table_say(bigint, text), public.table_invite(bigint, uuid), public.table_invite_dismiss(bigint), public.table_heartbeat(),
  public.table_close(bigint), public.uno_table_play(bigint, text, text), public.uno_table_draw(bigint), public.uno_table_pass(bigint),
  public.uno_table_call(bigint), public.uno_table_catch(bigint), public.uno_table_timeout(bigint)
  from public, anon, authenticated;
grant execute on function
  public.table_open(text), public.table_sit(bigint, text), public.table_leave(bigint), public.table_start(bigint),
  public.table_say(bigint, text), public.table_invite(bigint, uuid), public.table_invite_dismiss(bigint), public.table_heartbeat(),
  public.table_close(bigint), public.uno_table_play(bigint, text, text), public.uno_table_draw(bigint), public.uno_table_pass(bigint),
  public.uno_table_call(bigint), public.uno_table_catch(bigint), public.uno_table_timeout(bigint)
  to authenticated, service_role;
grant execute on function
  public.ut_next(integer[], integer, integer, integer), public.ut_place_points(integer), public.ut_ordinal(integer),
  public.ut_draw(bigint, uuid, integer), public.ut_sync(bigint), public.ut_record(bigint, integer, uuid, integer, integer, text),
  public.ut_finish(bigint), public.ut_remove(bigint, integer, text), public.table_shut(bigint), public.table_drop(bigint, uuid, text),
  public.tables_sweep()
  to service_role;
