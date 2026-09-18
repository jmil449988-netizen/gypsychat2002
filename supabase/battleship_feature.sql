-- Battleship in whispers (build 167) ------------------------------------------------------------------
--
-- Classic 10x10 sea, five ships each: Carrier 5 (A), Battleship 4 (B), Cruiser 3 (C), Submarine 3 (S),
-- Destroyer 2 (D). Chosen by the user on 18 Sept 2026:
--   * placement: each fleet starts in a random layout (dealt here, at accept); in the browser the
--     player can Shuffle, tap a ship to turn it, drag to move it, then Ready. 60 s to place; after
--     that anyone not Ready sails with the fleet they were dealt (battleship_timeout).
--   * turns: a HIT SHOOTS AGAIN -- you keep firing until you miss. The challenged player fires first,
--     as in the other games. 30 s a shot; running out fires one at random (battleship_timeout).
--   * XP: 10 for a win, 3 for a loss, under the shared 500-a-day game cap (game_points_today).
--     A resignation pays the winner 10 only once the battle is properly under way (20 shots fired
--     between the two of you); before that nobody gets XP, so start-and-resign can't mint XP.
--     The resigner gets nothing either way.
--
-- Each fleet lives in battleship_fleets. Its policy lets you read your own fleet at any time and
-- the other one only once the game is finished (the reveal), so an open game's ships can't be
-- read from the browser. What both players see is the two seas on battleship_games: 100
-- characters each, row by row (cell = row * 10 + column): '.' not fired at, 'o' a miss, 'x' a hit,
-- and a sunk ship's cells turn into its letter.
--
-- Everything that changes a game goes through the functions below (security definer). The
-- helpers they share (bs_apply, bs_award, bs_maybe_start, bs_random_layout) are NOT executable
-- by browsers: a security-definer caller still reaches them, but nobody can call bs_apply
-- directly to fire a shot in someone else's name.
--
-- Run once in the Supabase SQL Editor. Practice run first:
--   begin;  <this file>  <battleship_dryrun.sql>  rollback;

create table if not exists public.battleship_games (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  challenger_id     uuid        not null references auth.users(id) on delete cascade,
  challenger_name   text,
  opponent_id       uuid        not null references auth.users(id) on delete cascade,
  opponent_name     text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  phase             text        not null default 'placing' check (phase in ('placing', 'firing')),
  challenger_ready  boolean     not null default false,
  opponent_ready    boolean     not null default false,
  turn              uuid,
  turn_started_at   timestamptz not null default now(),   -- while placing: when placing began
  challenger_sea    text        not null default repeat('.', 100) check (challenger_sea ~ '^[.oxABCSD]{100}$'), -- the challenger's waters (the opponent fires here)
  opponent_sea      text        not null default repeat('.', 100) check (opponent_sea ~ '^[.oxABCSD]{100}$'),   -- the opponent's waters
  last_by           uuid,
  last_cell         integer     check (last_cell between 0 and 99),
  last_result       text        check (last_result in ('miss', 'hit', 'sunk')),
  last_action       text,
  winner            uuid,
  result            text        check (result in ('sunk', 'resign')),
  challenger_points integer     not null default 0,
  opponent_points   integer     not null default 0,
  check (challenger_id <> opponent_id)
);
create unique index if not exists battleship_one_open_per_pair on public.battleship_games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index if not exists battleship_games_challenger on public.battleship_games (challenger_id, status);
create index if not exists battleship_games_opponent on public.battleship_games (opponent_id, status);

create table if not exists public.battleship_fleets (
  game_id bigint not null references public.battleship_games(id) on delete cascade,
  user_id uuid   not null references auth.users(id) on delete cascade,
  layout  text   not null check (layout ~ '^[.ABCSD]{100}$'),
  primary key (game_id, user_id)
);

alter table public.battleship_games enable row level security;
alter table public.battleship_fleets enable row level security;
create policy "my battleship games" on public.battleship_games for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());
create policy "battleship challenge" on public.battleship_games for insert to authenticated
  with check (
    challenger_id = auth.uid() and opponent_id <> auth.uid() and status = 'pending' and phase = 'placing'
    and not challenger_ready and not opponent_ready and turn is null
    and challenger_sea = repeat('.', 100) and opponent_sea = repeat('.', 100)
    and last_by is null and last_cell is null and last_result is null and last_action is null
    and winner is null and result is null and challenger_points = 0 and opponent_points = 0
    and not public.is_banned(auth.uid()) and public.can_whisper(auth.uid(), opponent_id)
  );
create policy "my fleet, and theirs once it is over" on public.battleship_fleets for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.battleship_games g where g.id = game_id and g.status = 'finished'
      and (g.challenger_id = auth.uid() or g.opponent_id = auth.uid())));
revoke all on public.battleship_games, public.battleship_fleets from anon, authenticated;
grant select, insert on public.battleship_games to authenticated;
grant select on public.battleship_fleets to authenticated;
-- Only the games table: nobody's browser listens to the fleets (you already know your own), and a
-- table in a channel's list that is missing from this publication silently stops every other
-- listener on that channel (the build 154 outage) -- so what is listened to must be in here.
alter publication supabase_realtime add table public.battleship_games;

-- The daily cap counts Battleship too --------------------------------------------------------------------
create or replace function public.game_points_today(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.uno_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(greatest(0, case when challenger_id = p then challenger_points else opponent_points end))
              from public.holdem_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.hangman_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.battleship_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  )::int
$$;

-- Fleets ---------------------------------------------------------------------------------------------------
-- A legal fleet: exactly the five ships, each one straight (one row or one column) and unbroken.
-- Overlaps are impossible by construction (one character per cell). Touching is allowed, as in the
-- board game; the random layouts below just never do it, because touching fleets read badly.
create or replace function public.bs_valid_layout(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare ships text[] := array['A','B','C','S','D']; lens int[] := array[5,4,3,3,2];
  i int; k int; c int; cells int[]; horiz boolean;
begin
  if p is null or p !~ '^[.ABCSD]{100}$' then return false; end if;
  for i in 1..5 loop
    cells := '{}';
    for c in 0..99 loop
      if substr(p, c + 1, 1) = ships[i] then cells := cells || c; end if;
    end loop;
    if coalesce(array_length(cells, 1), 0) <> lens[i] then return false; end if;
    horiz := cells[2] = cells[1] + 1;
    for k in 2..lens[i] loop
      if horiz then
        if cells[k] <> cells[1] + (k - 1) or cells[k] / 10 <> cells[1] / 10 then return false; end if;
      elsif cells[k] <> cells[1] + (k - 1) * 10 then return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.bs_random_layout() returns text
language plpgsql volatile set search_path = public as $$
declare ships text[] := array['A','B','C','S','D']; lens int[] := array[5,4,3,3,2];
  grid text[]; attempt int; i int; k int; tries int; r int; c int; rr int; cc int; horiz boolean; ok boolean; placed boolean;
begin
  for attempt in 1..50 loop
    grid := array_fill('.'::text, array[100]);
    placed := true;
    for i in 1..5 loop
      ok := false; tries := 0;
      while not ok and tries < 300 loop
        tries := tries + 1;
        horiz := random() < 0.5;
        if horiz then r := floor(random() * 10)::int; c := floor(random() * (11 - lens[i]))::int;
        else r := floor(random() * (11 - lens[i]))::int; c := floor(random() * 10)::int; end if;
        ok := true;
        -- the ship's cells and the ring of cells around it must all be open water
        for rr in r - 1 .. r + (case when horiz then 0 else lens[i] - 1 end) + 1 loop
          for cc in c - 1 .. c + (case when horiz then lens[i] - 1 else 0 end) + 1 loop
            if rr between 0 and 9 and cc between 0 and 9 and grid[rr * 10 + cc + 1] <> '.' then ok := false; end if;
          end loop;
        end loop;
      end loop;
      if not ok then placed := false; exit; end if;
      for k in 0..lens[i] - 1 loop
        if horiz then grid[r * 10 + c + k + 1] := ships[i]; else grid[(r + k) * 10 + c + 1] := ships[i]; end if;
      end loop;
    end loop;
    if placed then return array_to_string(grid, ''); end if;
  end loop;
  -- never reached in practice (five ships in a 10x10 sea always fit); a fixed legal fleet regardless
  return 'AAAAA.....' || '..........' || 'BBBB......' || '..........' || 'CCC.......' || '..........' || 'SSS.......' || '..........' || 'DD........' || '..........';
end $$;

-- Starts the battle once both fleets are Ready. The challenged player fires first.
create or replace function public.bs_maybe_start(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.status = 'active' and g.phase = 'placing' and g.challenger_ready and g.opponent_ready then
    update public.battleship_games set phase = 'firing', turn = g.opponent_id, turn_started_at = now(),
      last_action = 'Both fleets are in position. ' || coalesce(g.opponent_name, 'They') || ' fires first.', updated_at = now()
      where id = p_game;
  end if;
end $$;

-- XP ---------------------------------------------------------------------------------------------------------
create or replace function public.bs_award(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games; cp int := 0; op int := 0; cap int := 500; shots int;
begin
  select * into g from public.battleship_games where id = p_game;
  if g.status <> 'finished' or g.winner is null then return; end if;
  shots := length(replace(g.challenger_sea, '.', '')) + length(replace(g.opponent_sea, '.', ''));
  if g.result = 'sunk' then
    if g.winner = g.challenger_id then cp := 10; op := 3; else op := 10; cp := 3; end if;
  elsif g.result = 'resign' and shots >= 20 then
    if g.winner = g.challenger_id then cp := 10; else op := 10; end if;
  end if;
  cp := greatest(0, least(cp, cap - public.game_points_today(g.challenger_id)));
  op := greatest(0, least(op, cap - public.game_points_today(g.opponent_id)));
  update public.battleship_games set challenger_points = cp, opponent_points = op where id = p_game;
  if cp > 0 then insert into public.user_stats (user_id, game_points) values (g.challenger_id, cp)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + cp; end if;
  if op > 0 then insert into public.user_stats (user_id, game_points) values (g.opponent_id, op)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + op; end if;
end $$;

-- One shot by p_by at p_cell. Internal: battleship_fire and battleship_timeout call it.
create or replace function public.bs_apply(p_game bigint, p_by uuid, p_cell integer) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games; target uuid; sea text; fleet text; ch text; whom text; shipname text;
  k int; sunk boolean; cs text; os text;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.id is null or g.status <> 'active' or g.phase <> 'firing' then raise exception 'That game is not in play.'; end if;
  if g.turn is distinct from p_by then raise exception 'Not your turn.'; end if;
  if p_cell is null or p_cell < 0 or p_cell > 99 then raise exception 'Pick a square on the grid.'; end if;
  target := case when g.challenger_id = p_by then g.opponent_id else g.challenger_id end;
  sea := case when g.challenger_id = p_by then g.opponent_sea else g.challenger_sea end;
  whom := case when g.challenger_id = p_by then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  if substr(sea, p_cell + 1, 1) <> '.' then raise exception 'You already fired there.'; end if;
  select f.layout into fleet from public.battleship_fleets f where f.game_id = p_game and f.user_id = target;
  if fleet is null then raise exception 'That fleet is missing.'; end if;
  ch := substr(fleet, p_cell + 1, 1);
  if ch = '.' then
    sea := overlay(sea placing 'o' from p_cell + 1 for 1);
  else
    sea := overlay(sea placing 'x' from p_cell + 1 for 1);
    sunk := true;
    for k in 0..99 loop
      if substr(fleet, k + 1, 1) = ch and substr(sea, k + 1, 1) = '.' then sunk := false; end if;
    end loop;
    if sunk then
      for k in 0..99 loop
        if substr(fleet, k + 1, 1) = ch then sea := overlay(sea placing ch from k + 1 for 1); end if;
      end loop;
    end if;
  end if;
  if g.challenger_id = p_by then cs := g.challenger_sea; os := sea; else cs := sea; os := g.opponent_sea; end if;
  shipname := case ch when 'A' then 'Carrier' when 'B' then 'Battleship' when 'C' then 'Cruiser' when 'S' then 'Submarine' else 'Destroyer' end;
  if ch = '.' then
    -- a miss: the turn crosses over
    update public.battleship_games set challenger_sea = cs, opponent_sea = os, turn = target, turn_started_at = now(),
      last_by = p_by, last_cell = p_cell, last_result = 'miss', last_action = whom || ' fired — a miss.', updated_at = now()
      where id = p_game;
  elsif length(regexp_replace(sea, '[^ABCSD]', '', 'g')) = 17 then
    -- that was the last ship afloat
    update public.battleship_games set challenger_sea = cs, opponent_sea = os, turn = null, status = 'finished', winner = p_by, result = 'sunk',
      last_by = p_by, last_cell = p_cell, last_result = 'sunk', last_action = whom || ' sank the ' || shipname || ' — the whole fleet is down!', updated_at = now()
      where id = p_game;
    perform public.bs_award(p_game);
  else
    -- a hit keeps the turn (hit = shoot again); the clock starts over for the next shot
    update public.battleship_games set challenger_sea = cs, opponent_sea = os, turn_started_at = now(),
      last_by = p_by, last_cell = p_cell, last_result = case when sunk then 'sunk' else 'hit' end,
      last_action = whom || case when sunk then ' sank the ' || shipname || '! Fires again.' else ' hit a ship! Fires again.' end, updated_at = now()
      where id = p_game;
  end if;
  select * into g from public.battleship_games where id = p_game;
  return g;
end $$;

-- What the browsers call ----------------------------------------------------------------------------------
create or replace function public.battleship_respond(p_game bigint, p_accept boolean) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if not p_accept then
    update public.battleship_games set status = 'declined', updated_at = now() where id = p_game returning * into g;
    return g;
  end if;
  insert into public.battleship_fleets (game_id, user_id, layout)
    values (p_game, g.challenger_id, public.bs_random_layout()), (p_game, g.opponent_id, public.bs_random_layout())
    on conflict (game_id, user_id) do nothing;
  update public.battleship_games set status = 'active', phase = 'placing', turn = null, turn_started_at = now(),
    last_action = 'Place your ships: tap one to turn it, drag to move it, then Ready.', updated_at = now()
    where id = p_game returning * into g;
  return g;
end $$;

-- Ready with p_layout (null = keep the fleet you were dealt).
create or replace function public.battleship_ready(p_game bigint, p_layout text) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games; is_c boolean;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.phase <> 'placing' then raise exception 'The fleets are already at sea.'; end if;
  is_c := g.challenger_id = auth.uid();
  if (is_c and g.challenger_ready) or (not is_c and g.opponent_ready) then raise exception 'Your fleet is already in position.'; end if;
  if p_layout is not null then
    if not public.bs_valid_layout(p_layout) then raise exception 'That fleet is not legal: five ships, each in one straight line, none overlapping.'; end if;
    insert into public.battleship_fleets (game_id, user_id, layout) values (p_game, auth.uid(), p_layout)
      on conflict (game_id, user_id) do update set layout = excluded.layout;
  else
    insert into public.battleship_fleets (game_id, user_id, layout) values (p_game, auth.uid(), public.bs_random_layout())
      on conflict (game_id, user_id) do nothing;
  end if;
  if is_c then update public.battleship_games set challenger_ready = true, updated_at = now() where id = p_game;
  else update public.battleship_games set opponent_ready = true, updated_at = now() where id = p_game; end if;
  perform public.bs_maybe_start(p_game);
  select * into g from public.battleship_games where id = p_game;
  return g;
end $$;

create or replace function public.battleship_fire(p_game bigint, p_cell integer) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games;
begin
  select * into g from public.battleship_games where id = p_game;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  return public.bs_apply(p_game, auth.uid(), p_cell);
end $$;

-- Either player's browser calls this when a clock runs out. Locked first, so two calls at once can't
-- both act on the same expired clock.
create or replace function public.battleship_timeout(p_game bigint) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games; sea text; open int[] := '{}'; k int;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then return g; end if;
  if g.phase = 'placing' then
    if g.turn_started_at > now() - interval '62 seconds' then return g; end if;
    -- anyone not Ready sails with the fleet they were dealt at accept
    insert into public.battleship_fleets (game_id, user_id, layout)
      values (p_game, g.challenger_id, public.bs_random_layout()), (p_game, g.opponent_id, public.bs_random_layout())
      on conflict (game_id, user_id) do nothing;
    update public.battleship_games set challenger_ready = true, opponent_ready = true, updated_at = now() where id = p_game;
    perform public.bs_maybe_start(p_game);
    select * into g from public.battleship_games where id = p_game;
    return g;
  end if;
  if g.turn is null or g.turn_started_at > now() - interval '29 seconds' then return g; end if;
  sea := case when g.challenger_id = g.turn then g.opponent_sea else g.challenger_sea end;
  for k in 0..99 loop
    if substr(sea, k + 1, 1) = '.' then open := open || k; end if;
  end loop;
  if coalesce(array_length(open, 1), 0) = 0 then return g; end if;
  return public.bs_apply(p_game, g.turn, open[1 + floor(random() * array_length(open, 1))::int]);
end $$;

create or replace function public.battleship_resign(p_game bigint) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games; other uuid; whom text;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = auth.uid() then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  update public.battleship_games set status = 'finished', winner = other, result = 'resign', turn = null,
    last_action = whom || ' struck their colours — resigned.', updated_at = now() where id = p_game;
  perform public.bs_award(p_game);
  select * into g from public.battleship_games where id = p_game;
  return g;
end $$;

create or replace function public.battleship_cancel(p_game bigint) returns public.battleship_games
language plpgsql security definer set search_path = public as $$
declare g public.battleship_games;
begin
  select * into g from public.battleship_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status = 'pending' and g.challenger_id = auth.uid() then
    update public.battleship_games set status = 'cancelled', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'pending' and g.created_at < now() - interval '10 minutes' then
    update public.battleship_games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'active' and g.updated_at < now() - interval '1 hour' then
    update public.battleship_games set status = 'expired', turn = null, updated_at = now() where id = p_game returning * into g;
  else
    raise exception 'That game cannot be cancelled right now.';
  end if;
  return g;
end $$;

create or replace function public.battleship_leaderboard(p_limit integer default 20)
returns table (user_id uuid, wins integer, losses integer, streak integer, played integer)
language sql stable security definer set search_path = public as $$
  with f as (select id, updated_at, challenger_id, opponent_id, winner from public.battleship_games where status = 'finished' and winner is not null),
  sides as (select id, updated_at, challenger_id as uid, winner from f union all select id, updated_at, opponent_id, winner from f),
  outcomes as (select uid, case when winner = uid then 'W' else 'L' end as o, row_number() over (partition by uid order by updated_at desc, id desc) as rn from sides),
  totals as (select uid, count(*) filter (where o = 'W')::int as wins, count(*) filter (where o = 'L')::int as losses, count(*)::int as played from outcomes group by uid),
  streaks as (select o.uid, count(*)::int as streak from outcomes o where o.o = 'W'
    and o.rn < coalesce((select min(o2.rn) from outcomes o2 where o2.uid = o.uid and o2.o <> 'W'), 2147483647) group by o.uid)
  select t.uid, t.wins, t.losses, coalesce(s.streak, 0), t.played from totals t left join streaks s on s.uid = t.uid
  order by t.wins desc, t.losses asc, t.uid limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

revoke execute on function public.bs_valid_layout(text), public.bs_random_layout(), public.bs_maybe_start(bigint), public.bs_award(bigint),
  public.bs_apply(bigint, uuid, integer), public.battleship_respond(bigint, boolean), public.battleship_ready(bigint, text),
  public.battleship_fire(bigint, integer), public.battleship_timeout(bigint), public.battleship_resign(bigint),
  public.battleship_cancel(bigint), public.battleship_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.battleship_respond(bigint, boolean), public.battleship_ready(bigint, text),
  public.battleship_fire(bigint, integer), public.battleship_timeout(bigint), public.battleship_resign(bigint),
  public.battleship_cancel(bigint), public.battleship_leaderboard(integer), public.bs_valid_layout(text) to authenticated, service_role;
grant execute on function public.bs_random_layout(), public.bs_maybe_start(bigint), public.bs_award(bigint),
  public.bs_apply(bigint, uuid, integer) to service_role;
