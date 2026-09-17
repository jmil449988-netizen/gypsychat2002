-- Tic-Tac-Toe in whispers, with saved games, a per-pair record, and XP -----------------------------
--
-- A game is a row in public.games between two people who can whisper each other (the same
-- can_whisper() rule the messages policy uses -- friends, or an open door, or an admin). The
-- challenger inserts a 'pending' row; from then on EVERY state change goes through one of the
-- security-definer functions below, never a client update: the client has no UPDATE privilege at
-- all, so a modified client can't place two marks, move out of turn, declare itself the winner,
-- or hand itself XP. The board is a 9-character string of X / O / . read left to right, top to
-- bottom. The person who was challenged plays X and moves first.
--
-- XP: user_stats gains game_points, and both `xp` and `level` are now derived from
-- reactions_received + game_points (level keeps the same curve: floor(sqrt(xp/3)) + 1). A win is
-- worth 3, a draw 1 to each side, a loss 0 -- capped at 15 game points per person per rolling
-- 24 hours so two friends can't farm levels by trading wins all night.
--
-- Realtime: the games table is published; RLS limits each person to games they're in, so a
-- client subscribing with its own id in the filter only ever sees its own games.
--
-- Run once in the Supabase SQL Editor.

create table if not exists public.games (
  id                bigint generated always as identity primary key,
  kind              text        not null default 'ttt' check (kind = 'ttt'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  challenger_id     uuid        not null references auth.users(id) on delete cascade,
  challenger_name   text,
  opponent_id       uuid        not null references auth.users(id) on delete cascade,
  opponent_name     text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  board             text        not null default '.........' check (board ~ '^[XO.]{9}$'),
  x_player          uuid,
  turn              uuid,
  winner            uuid,
  result            text        check (result in ('win', 'draw', 'resign')),
  challenger_points integer     not null default 0,
  opponent_points   integer     not null default 0,
  check (challenger_id <> opponent_id)
);
create index if not exists games_pair_time on public.games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id), created_at desc);
-- one open game per pair at a time
create unique index if not exists games_one_open_per_pair on public.games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index if not exists games_opponent on public.games (opponent_id, status);
create index if not exists games_challenger on public.games (challenger_id, status);

alter table public.games enable row level security;

create policy "my games" on public.games for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());

-- The one client write: issuing a challenge. Everything else is fixed at its default.
create policy "challenge" on public.games for insert to authenticated
  with check (
    challenger_id = auth.uid() and opponent_id <> auth.uid()
    and status = 'pending' and board = '.........' and x_player is null and turn is null
    and winner is null and result is null and challenger_points = 0 and opponent_points = 0
    and not public.is_banned(auth.uid())
    and public.can_whisper(auth.uid(), opponent_id)
  );

revoke all on public.games from anon, authenticated;
grant select, insert on public.games to authenticated;

alter publication supabase_realtime add table public.games;

-- XP --------------------------------------------------------------------------------------------
alter table public.user_stats add column if not exists game_points integer not null default 0 check (game_points >= 0);
alter table public.user_stats drop column if exists level;
alter table public.user_stats drop column if exists xp;
alter table public.user_stats add column xp integer generated always as (reactions_received + game_points) stored;
alter table public.user_stats add column level integer generated always as (floor(sqrt((reactions_received + game_points)::numeric / 3))::int + 1) stored;

-- Helpers ---------------------------------------------------------------------------------------
create or replace function public.ttt_won(b text, m text) returns boolean
language sql immutable as $$
  select (substr(b,1,1) = m and substr(b,2,1) = m and substr(b,3,1) = m)
      or (substr(b,4,1) = m and substr(b,5,1) = m and substr(b,6,1) = m)
      or (substr(b,7,1) = m and substr(b,8,1) = m and substr(b,9,1) = m)
      or (substr(b,1,1) = m and substr(b,4,1) = m and substr(b,7,1) = m)
      or (substr(b,2,1) = m and substr(b,5,1) = m and substr(b,8,1) = m)
      or (substr(b,3,1) = m and substr(b,6,1) = m and substr(b,9,1) = m)
      or (substr(b,1,1) = m and substr(b,5,1) = m and substr(b,9,1) = m)
      or (substr(b,3,1) = m and substr(b,5,1) = m and substr(b,7,1) = m)
$$;

-- Game points earned by one person over the last 24 hours (for the cap).
create or replace function public.game_points_today(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when challenger_id = p then challenger_points else opponent_points end), 0)::int
  from public.games
  where status = 'finished' and updated_at > now() - interval '24 hours'
    and (challenger_id = p or opponent_id = p)
$$;

-- Credits a finished game: 3 to a winner, 1 each for a draw, capped at 15/24h per person.
create or replace function public.game_award(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.games; cp int := 0; op int := 0; cap int := 15;
begin
  select * into g from public.games where id = p_game;
  if g.status <> 'finished' then return; end if;
  if g.result = 'draw' then cp := 1; op := 1;
  elsif g.winner = g.challenger_id then cp := 3;
  elsif g.winner = g.opponent_id then op := 3;
  end if;
  cp := greatest(0, least(cp, cap - public.game_points_today(g.challenger_id)));
  op := greatest(0, least(op, cap - public.game_points_today(g.opponent_id)));
  update public.games set challenger_points = cp, opponent_points = op where id = p_game;
  if cp > 0 then
    insert into public.user_stats (user_id, game_points) values (g.challenger_id, cp)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + cp;
  end if;
  if op > 0 then
    insert into public.user_stats (user_id, game_points) values (g.opponent_id, op)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + op;
  end if;
end $$;

-- The moves ---------------------------------------------------------------------------------------
-- Accept or decline a challenge (opponent only). Accepting makes the challenged person X and gives
-- them the first move.
create or replace function public.game_respond(p_game bigint, p_accept boolean) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if p_accept then
    update public.games set status = 'active', x_player = g.opponent_id, turn = g.opponent_id, updated_at = now() where id = p_game returning * into g;
  else
    update public.games set status = 'declined', updated_at = now() where id = p_game returning * into g;
  end if;
  return g;
end $$;

-- Withdraw a pending challenge (challenger), or clear an active game that has gone quiet for an
-- hour (either side) so a new one can start. Neither awards anything.
create or replace function public.game_cancel(p_game bigint) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status = 'pending' and g.challenger_id = auth.uid() then
    update public.games set status = 'cancelled', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'pending' and g.created_at < now() - interval '10 minutes' then
    update public.games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'active' and g.updated_at < now() - interval '1 hour' then
    update public.games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  else
    raise exception 'That game cannot be cancelled right now.';
  end if;
  return g;
end $$;

-- Give up an active game: the other side wins (and is credited as a win).
create or replace function public.game_resign(p_game bigint) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games; other uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  update public.games set status = 'finished', winner = other, result = 'resign', turn = null, updated_at = now() where id = p_game returning * into g;
  perform public.game_award(p_game);
  select * into g from public.games where id = p_game;
  return g;
end $$;

-- Place a mark. p_cell is 0..8, left to right, top to bottom.
create or replace function public.game_move(p_game bigint, p_cell integer) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games; b text; m text; other uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is over.'; end if;
  if g.turn <> auth.uid() then raise exception 'Not your turn.'; end if;
  if p_cell is null or p_cell < 0 or p_cell > 8 or substr(g.board, p_cell + 1, 1) <> '.' then raise exception 'That square is taken.'; end if;
  m := case when g.x_player = auth.uid() then 'X' else 'O' end;
  b := overlay(g.board placing m from p_cell + 1 for 1);
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  if public.ttt_won(b, m) then
    update public.games set board = b, status = 'finished', winner = auth.uid(), result = 'win', turn = null, updated_at = now() where id = p_game;
    perform public.game_award(p_game);
  elsif position('.' in b) = 0 then
    update public.games set board = b, status = 'finished', winner = null, result = 'draw', turn = null, updated_at = now() where id = p_game;
    perform public.game_award(p_game);
  else
    update public.games set board = b, turn = other, updated_at = now() where id = p_game;
  end if;
  select * into g from public.games where id = p_game;
  return g;
end $$;

-- Privileges: signed-in people call the four verbs; nothing unsigned-in calls anything.
revoke execute on function public.game_respond(bigint, boolean), public.game_cancel(bigint), public.game_resign(bigint), public.game_move(bigint, integer),
  public.game_award(bigint), public.game_points_today(uuid), public.ttt_won(text, text) from public, anon;
grant execute on function public.game_respond(bigint, boolean), public.game_cancel(bigint), public.game_resign(bigint), public.game_move(bigint, integer)
  to authenticated, service_role;
grant execute on function public.game_award(bigint), public.game_points_today(uuid), public.ttt_won(text, text) to authenticated, service_role;
