-- Prasta (Gilet), heads-up, in whispers -- one agreed stake, winner takes all -----------------------
--
-- Gilet is a 16th-century ITALIAN gambling game (Rabelais 1534; Cardano 1564 calls it "Geleus",
-- from a word meaning "I have it"), the ancestor of French Brelan and a cousin of Primero. It is
-- not, as far as any source I could find says, a Romani game -- the room calls this version
-- "Prasta" as its own name for it.
--
-- The historical game: a 32-card piquet deck (7..A, ace high), three cards each, and hands rank
--   TRICON (three of a kind)  >  PAIR  >  POINT (cards of one suit, added up).
-- The original splits the money into two pots, one for the best pair and one for the best point.
-- This version is heads-up with ONE agreed stake (1-9000 XP) and winner takes all, plus a single
-- exchange round so a hand has a decision in it:
--   1. Challenger names a stake; it is escrowed from their XP right away.
--   2. Opponent accepts (their stake is escrowed too) and is dealt 3 cards each from a fresh deck.
--   3. Each player, opponent first, may discard up to 2 and draw replacements -- once.
--   4. Showdown: Tricon > Pair > Point. Equal pairs are split by the third card; equal points by
--      the high card. A true tie returns both stakes.
--   5. The winner takes both stakes. A slow player (30 s) simply stands pat.
--
-- XP: unlike the other games, Prasta winnings are NOT trimmed by the 500-a-day cap. The cap exists
-- to stop two friends MINTING XP by trading wins; Prasta only ever moves XP from one player to the
-- other, so the room's total is unchanged and capping the winner while the loser pays in full would
-- just destroy XP. A stake you cannot cover is refused, on both sides.
--
-- Run once in the Supabase SQL Editor, after holdem_feature.sql (it reuses hd_xp / hd_credit).

create table if not exists public.prasta_games (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  challenger_id     uuid        not null references auth.users(id) on delete cascade,
  challenger_name   text,
  opponent_id       uuid        not null references auth.users(id) on delete cascade,
  opponent_name     text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  stake             integer     not null check (stake between 1 and 9000),
  turn              uuid,
  turn_started_at   timestamptz not null default now(),
  challenger_done   boolean     not null default false,
  opponent_done     boolean     not null default false,
  challenger_drew   integer     not null default 0,
  opponent_drew     integer     not null default 0,
  shown_challenger  text[],
  shown_opponent    text[],
  last_action       text,
  winner            uuid,
  result            text        check (result in ('showdown', 'draw', 'resign')),
  challenger_points integer     not null default 0,
  opponent_points   integer     not null default 0,
  check (challenger_id <> opponent_id)
);
create unique index if not exists prasta_one_open_per_pair on public.prasta_games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index if not exists prasta_games_challenger on public.prasta_games (challenger_id, status);
create index if not exists prasta_games_opponent on public.prasta_games (opponent_id, status);

create table if not exists public.prasta_hands (
  game_id    bigint not null references public.prasta_games(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  cards      text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create table if not exists public.prasta_decks (
  game_id bigint primary key references public.prasta_games(id) on delete cascade,
  deck    text[] not null default '{}'
);

alter table public.prasta_games enable row level security;
alter table public.prasta_hands enable row level security;
alter table public.prasta_decks enable row level security;
drop policy if exists "my prasta games" on public.prasta_games;
create policy "my prasta games" on public.prasta_games for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());
drop policy if exists "my prasta hand" on public.prasta_hands;
create policy "my prasta hand" on public.prasta_hands for select to authenticated using (user_id = auth.uid());
revoke all on public.prasta_games, public.prasta_hands, public.prasta_decks from anon, authenticated;
grant select on public.prasta_games, public.prasta_hands to authenticated;  -- no insert: staking moves XP, so it is a function
do $$ begin
  alter publication supabase_realtime add table public.prasta_games;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.prasta_hands;
exception when duplicate_object then null; end $$;

-- Cards ----------------------------------------------------------------------------------------------
-- 32-card piquet deck: 7 8 9 T J Q K A in four suits. Same 'Ah' / 'Td' notation as Hold'em.
create or replace function public.pr_new_deck() returns text[] language sql volatile as $$
  select array_agg(r || s order by random()) from unnest(array['7','8','9','T','J','Q','K','A']) r, unnest(array['h','d','c','s']) s
$$;
create or replace function public.pr_rank(c text) returns int language sql immutable as $$
  select position(left(c, 1) in '789TJQKA') $$;
-- Point value: ace 11, court cards and the ten 10, the rest their face value.
create or replace function public.pr_pt(c text) returns int language sql immutable as $$
  select case left(c, 1) when 'A' then 11 when 'K' then 10 when 'Q' then 10 when 'J' then 10 when 'T' then 10
         else left(c, 1)::int end $$;
create or replace function public.pr_rank_name(r int) returns text language sql immutable as $$
  select (array['7','8','9','10','jack','queen','king','ace'])[r] $$;

-- Score of a three-card hand as an int[] that compares correctly with plain array comparison:
--   {2, rank, 0,      point}  tricon  (three of a kind)
--   {1, pair, kicker, point}  pair
--   {0, point, high,  0}      point   (largest same-suit total; three of a suit is the max, 31)
create or replace function public.pr_score(c text[]) returns int[]
language plpgsql immutable as $$
declare r1 int; r2 int; r3 int; pt int; hi int; pr int; kk int;
begin
  r1 := public.pr_rank(c[1]); r2 := public.pr_rank(c[2]); r3 := public.pr_rank(c[3]);
  hi := greatest(r1, r2, r3);
  select max(s) into pt from (select sum(public.pr_pt(u)) as s from unnest(c) u group by substr(u, 2, 1)) x;
  if r1 = r2 and r2 = r3 then return array[2, r1, 0, pt]; end if;
  if    r1 = r2 then pr := r1; kk := r3;
  elsif r1 = r3 then pr := r1; kk := r2;
  elsif r2 = r3 then pr := r2; kk := r1;
  else return array[0, pt, hi, 0];
  end if;
  return array[1, pr, kk, pt];
end $$;
create or replace function public.pr_score_name(s int[]) returns text language sql immutable as $$
  select case s[1]
    when 2 then 'three ' || public.pr_rank_name(s[2]) || 's'
    when 1 then 'a pair of ' || public.pr_rank_name(s[2]) || 's'
    else 'point ' || s[2] end $$;

-- Verbs ------------------------------------------------------------------------------------------------
create or replace function public.prasta_challenge(p_opponent uuid, p_stake int) returns public.prasta_games
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games; oname text; myname text; oxp int;
begin
  if auth.uid() is null then raise exception 'Sign on first.'; end if;
  if p_opponent = auth.uid() then raise exception 'You cannot play yourself.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'Not allowed.'; end if;
  if not public.can_whisper(auth.uid(), p_opponent) then raise exception 'They only take whispers from friends.'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 9000 then raise exception 'The stake has to be between 1 and 9000 XP.'; end if;
  if public.hd_xp(auth.uid()) < p_stake then raise exception 'You only have % XP to stake.', public.hd_xp(auth.uid()); end if;
  select name into myname from public.profiles where user_id = auth.uid();
  select name into oname from public.profiles where user_id = p_opponent;
  oxp := public.hd_xp(p_opponent);
  if oxp < p_stake then
    raise exception '% only has % XP and cannot match a %-XP stake. Try % or less.', coalesce(oname, 'They'), oxp, p_stake, oxp;
  end if;
  insert into public.prasta_games (challenger_id, challenger_name, opponent_id, opponent_name, stake, last_action)
    values (auth.uid(), myname, p_opponent, oname, p_stake, coalesce(myname, 'They') || ' stakes ' || p_stake || ' XP')
    returning * into g;
  perform public.hd_credit(auth.uid(), -p_stake);   -- escrow
  return g;
end $$;

create or replace function public.prasta_respond(p_game bigint, p_accept boolean) returns public.prasta_games
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games; d text[];
begin
  select * into g from public.prasta_games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if not p_accept then
    update public.prasta_games set status = 'declined', last_action = coalesce(g.opponent_name, 'They') || ' walked away', updated_at = now()
      where id = p_game returning * into g;
    perform public.hd_credit(g.challenger_id, g.stake);   -- refund
    return g;
  end if;
  if public.hd_xp(auth.uid()) < g.stake then raise exception 'You need % XP to match that stake.', g.stake; end if;
  perform public.hd_credit(auth.uid(), -g.stake);
  d := public.pr_new_deck();
  delete from public.prasta_hands where game_id = p_game;
  insert into public.prasta_hands (game_id, user_id, cards) values (p_game, g.challenger_id, d[1:3]), (p_game, g.opponent_id, d[4:6]);
  insert into public.prasta_decks (game_id, deck) values (p_game, d[7:]) on conflict (game_id) do update set deck = d[7:];
  -- the player who accepted draws first, the way the challenged player moves first in UNO
  update public.prasta_games set status = 'active', turn = g.opponent_id, turn_started_at = now(),
    last_action = 'Three cards each for ' || g.stake || ' XP. ' || coalesce(g.opponent_name, 'They') || ' draws first.', updated_at = now()
    where id = p_game;
  select * into g from public.prasta_games where id = p_game;
  return g;
end $$;

create or replace function public.prasta_cancel(p_game bigint) returns public.prasta_games
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games;
begin
  select * into g from public.prasta_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status = 'pending' and (g.challenger_id = auth.uid() or g.created_at < now() - interval '10 minutes') then
    update public.prasta_games set status = case when g.challenger_id = auth.uid() then 'cancelled' else 'expired' end, updated_at = now()
      where id = p_game returning * into g;
    perform public.hd_credit(g.challenger_id, g.stake);
    return g;
  end if;
  raise exception 'That game cannot be called off right now.';
end $$;

-- Showdown: reveal both hands, pay out, close the game. Internal.
create or replace function public.pr_showdown(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games; hc text[]; ho text[]; sc int[]; so int[]; w uuid; txt text; cn int; onn int;
begin
  select * into g from public.prasta_games where id = p_game for update;
  select cards into hc from public.prasta_hands where game_id = p_game and user_id = g.challenger_id;
  select cards into ho from public.prasta_hands where game_id = p_game and user_id = g.opponent_id;
  sc := public.pr_score(hc); so := public.pr_score(ho);
  if sc > so then
    w := g.challenger_id; cn := g.stake; onn := -g.stake;
    txt := coalesce(g.challenger_name, 'They') || ' takes ' || (2 * g.stake) || ' XP with ' || public.pr_score_name(sc) || ' over ' || public.pr_score_name(so);
  elsif so > sc then
    w := g.opponent_id; cn := -g.stake; onn := g.stake;
    txt := coalesce(g.opponent_name, 'They') || ' takes ' || (2 * g.stake) || ' XP with ' || public.pr_score_name(so) || ' over ' || public.pr_score_name(sc);
  else
    w := null; cn := 0; onn := 0;
    txt := 'Dead heat — both hold ' || public.pr_score_name(sc) || '. Stakes come back.';
  end if;
  -- pure transfer: the winner gets both stakes back, the loser nothing (see the header on the cap)
  perform public.hd_credit(g.challenger_id, g.stake + cn);
  perform public.hd_credit(g.opponent_id, g.stake + onn);
  update public.prasta_games set status = 'finished', result = case when w is null then 'draw' else 'showdown' end,
    winner = w, turn = null, shown_challenger = hc, shown_opponent = ho,
    challenger_points = cn, opponent_points = onn, last_action = txt, updated_at = now()
  where id = p_game;
end $$;

-- Discard up to two and draw replacements (an empty array stands pat).
create or replace function public.prasta_exchange(p_game bigint, p_discard text[] default '{}') returns public.prasta_games
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games; me uuid := auth.uid(); mine boolean; d text[]; n int; c text; pos int; keep text[]; other uuid; whom text;
begin
  select * into g from public.prasta_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> me and g.opponent_id <> me) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  if g.turn <> me then raise exception 'Not your turn.'; end if;
  mine := g.challenger_id = me;
  other := case when mine then g.opponent_id else g.challenger_id end;
  whom := case when mine then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  p_discard := coalesce(p_discard, '{}');
  n := coalesce(array_length(p_discard, 1), 0);
  if n > 2 then raise exception 'You may change at most two cards.'; end if;
  select cards into keep from public.prasta_hands where game_id = p_game and user_id = me;
  -- take each discard out of the hand once; anything that is not there is a bad request
  foreach c in array p_discard loop
    pos := array_position(keep, c);
    if pos is null then raise exception 'Those cards are not in your hand.'; end if;
    keep := keep[1:pos - 1] || keep[pos + 1:];
  end loop;
  n := 3 - coalesce(array_length(keep, 1), 0);
  if n > 0 then
    select deck into d from public.prasta_decks where game_id = p_game;
    if coalesce(array_length(d, 1), 0) < n then raise exception 'The deck is spent.'; end if;
    keep := keep || d[1:n];
    update public.prasta_decks set deck = d[n + 1:] where game_id = p_game;
  end if;
  update public.prasta_hands set cards = keep, updated_at = now() where game_id = p_game and user_id = me;
  if mine then update public.prasta_games set challenger_done = true, challenger_drew = n where id = p_game;
  else update public.prasta_games set opponent_done = true, opponent_drew = n where id = p_game; end if;
  update public.prasta_games set
    last_action = whom || case when n = 0 then ' stands pat' when n = 1 then ' changes one card' else ' changes two cards' end,
    turn = case when (case when mine then g.opponent_done else g.challenger_done end) then null else other end,
    turn_started_at = now(), updated_at = now()
  where id = p_game;
  select * into g from public.prasta_games where id = p_game;
  if g.challenger_done and g.opponent_done then perform public.pr_showdown(p_game); end if;
  select * into g from public.prasta_games where id = p_game;
  return g;
end $$;

-- 30 s clock: a slow player simply stands pat, the way a slow turn is skipped in the other games.
create or replace function public.prasta_timeout(p_game bigint) returns public.prasta_games
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games; slow uuid; other uuid; whom text;
begin
  select * into g from public.prasta_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.turn is null then return g; end if;
  if g.turn_started_at > now() - interval '29 seconds' then return g; end if;
  slow := g.turn;
  other := case when slow = g.challenger_id then g.opponent_id else g.challenger_id end;
  whom := case when slow = g.challenger_id then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  if slow = g.challenger_id then update public.prasta_games set challenger_done = true, challenger_drew = 0 where id = p_game;
  else update public.prasta_games set opponent_done = true, opponent_drew = 0 where id = p_game; end if;
  update public.prasta_games set last_action = whom || ' ran out of time and stands pat',
    turn = case when (case when slow = g.challenger_id then g.opponent_done else g.challenger_done end) then null else other end,
    turn_started_at = now(), updated_at = now() where id = p_game;
  select * into g from public.prasta_games where id = p_game;
  if g.challenger_done and g.opponent_done then perform public.pr_showdown(p_game); end if;
  select * into g from public.prasta_games where id = p_game;
  return g;
end $$;

-- Throw the hand in: the other side takes both stakes.
create or replace function public.prasta_resign(p_game bigint) returns public.prasta_games
language plpgsql security definer set search_path = public as $$
declare g public.prasta_games; me uuid := auth.uid(); mine boolean; other uuid; whom text; cn int; onn int;
begin
  select * into g from public.prasta_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> me and g.opponent_id <> me) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  mine := g.challenger_id = me;
  other := case when mine then g.opponent_id else g.challenger_id end;
  whom := case when mine then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  cn := case when mine then -g.stake else g.stake end;
  onn := -cn;
  perform public.hd_credit(g.challenger_id, g.stake + cn);
  perform public.hd_credit(g.opponent_id, g.stake + onn);
  update public.prasta_games set status = 'finished', result = 'resign', winner = other, turn = null,
    challenger_points = cn, opponent_points = onn,
    last_action = whom || ' throws the hand in — ' || (2 * g.stake) || ' XP to the other side', updated_at = now()
  where id = p_game;
  select * into g from public.prasta_games where id = p_game;
  return g;
end $$;

-- Ladder: hands won / lost and net XP -------------------------------------------------------------------
create or replace function public.prasta_leaderboard(p_limit integer default 20)
returns table (user_id uuid, wins integer, losses integer, net integer, streak integer, played integer)
language sql stable security definer set search_path = public as $$
  with f as (select id, updated_at, challenger_id, opponent_id, winner, challenger_points as cn, opponent_points as onn
             from public.prasta_games where status = 'finished'),
  sides as (select id, updated_at, challenger_id as uid, winner, cn as net from f
            union all select id, updated_at, opponent_id, winner, onn from f),
  outcomes as (select uid, net, case when winner = uid then 'W' when winner is null then 'D' else 'L' end as o,
               row_number() over (partition by uid order by updated_at desc, id desc) as rn from sides),
  totals as (select uid, count(*) filter (where o = 'W')::int as wins, count(*) filter (where o = 'L')::int as losses,
             sum(net)::int as net, count(*)::int as played from outcomes group by uid),
  streaks as (select o.uid, count(*)::int as streak from outcomes o where o.o = 'W'
    and o.rn < coalesce((select min(o2.rn) from outcomes o2 where o2.uid = o.uid and o2.o <> 'W'), 2147483647) group by o.uid)
  select t.uid, t.wins, t.losses, t.net, coalesce(s.streak, 0), t.played from totals t left join streaks s on s.uid = t.uid
  order by t.net desc, t.wins desc, t.uid limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- Privileges -------------------------------------------------------------------------------------------
revoke execute on function public.prasta_challenge(uuid, int), public.prasta_respond(bigint, boolean), public.prasta_cancel(bigint),
  public.prasta_exchange(bigint, text[]), public.prasta_timeout(bigint), public.prasta_resign(bigint), public.prasta_leaderboard(integer),
  public.pr_new_deck(), public.pr_rank(text), public.pr_pt(text), public.pr_rank_name(int), public.pr_score(text[]), public.pr_score_name(int[]),
  public.pr_showdown(bigint) from public, anon;
grant execute on function public.prasta_challenge(uuid, int), public.prasta_respond(bigint, boolean), public.prasta_cancel(bigint),
  public.prasta_exchange(bigint, text[]), public.prasta_timeout(bigint), public.prasta_resign(bigint), public.prasta_leaderboard(integer)
  to authenticated, service_role;
grant execute on function public.pr_new_deck(), public.pr_rank(text), public.pr_pt(text), public.pr_rank_name(int), public.pr_score(text[]),
  public.pr_score_name(int[]), public.pr_showdown(bigint) to authenticated, service_role;
