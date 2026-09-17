-- Tic-Tac-Toe leaderboard -------------------------------------------------------------------------
--
-- games rows are only readable by the two people in them (see tictactoe_feature.sql), so a
-- public ladder has to be computed on the server. This function returns the top players by
-- wins (ties broken by fewer losses, then more draws) with their current win streak -- the number
-- of most-recent finished games in a row that they won. Resignations count as a normal loss/win.
-- Read-only; callable by anyone signed in.
--
-- Run once in the Supabase SQL Editor.

create or replace function public.ttt_leaderboard(p_limit integer default 20)
returns table (user_id uuid, wins integer, losses integer, draws integer, streak integer, played integer)
language sql stable security definer set search_path = public as $$
  with f as (
    select id, updated_at, challenger_id, opponent_id, result, winner
    from public.games where status = 'finished'
  ),
  sides as (
    select f.id, f.updated_at, f.challenger_id as uid, f.result, f.winner from f
    union all
    select f.id, f.updated_at, f.opponent_id, f.result, f.winner from f
  ),
  outcomes as (
    select uid, updated_at,
      case when result = 'draw' then 'D' when winner = uid then 'W' else 'L' end as o,
      row_number() over (partition by uid order by updated_at desc, id desc) as rn
    from sides
  ),
  totals as (
    select uid,
      count(*) filter (where o = 'W')::int as wins,
      count(*) filter (where o = 'L')::int as losses,
      count(*) filter (where o = 'D')::int as draws,
      count(*)::int as played
    from outcomes group by uid
  ),
  streaks as (
    -- leading run of wins: games newer than the most recent non-win
    select o.uid, count(*)::int as streak
    from outcomes o
    where o.o = 'W'
      and o.rn < coalesce((select min(o2.rn) from outcomes o2 where o2.uid = o.uid and o2.o <> 'W'), 2147483647)
    group by o.uid
  )
  select t.uid, t.wins, t.losses, t.draws, coalesce(s.streak, 0), t.played
  from totals t left join streaks s on s.uid = t.uid
  order by t.wins desc, t.losses asc, t.draws desc, t.uid
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

revoke execute on function public.ttt_leaderboard(integer) from public, anon;
grant execute on function public.ttt_leaderboard(integer) to authenticated, service_role;
