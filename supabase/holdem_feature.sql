-- Texas Hold'em, heads-up, in whispers -- betting real XP ------------------------------------------
--
-- Same shape as UNO (uno_feature.sql): holdem_games is what both players may see, holdem_hands
-- holds each player's two hole cards (RLS: owner only), holdem_decks never leaves the server, and
-- every action is a security-definer function. What is different is the money: chips ARE XP.
--   * Two tables: LOW stakes (blinds 1/2, sit down with 5-10 XP) and HIGH (blinds 2/5, 10-50 XP).
--   * The buy-in comes out of user_stats.game_points the moment you sit down (an escrow), and your
--     whole stack goes back in when the game ends -- so what you win or lose really moves your XP
--     and your level. game_points may now go below zero as long as total XP stays >= 0; you can
--     never sit down with more than the XP you have.
--   * Winnings count toward the shared 500-a-day game cap (game_points_today); losses don't.
-- Rules: heads-up no-limit. The dealer (button) posts the small blind and acts first before the
-- flop, second after it; the button alternates every hand. Actions: fold, call (= check when
-- there is nothing to call), raise-to an amount (min raise = the last raise size, all-in for less
-- is allowed). A hand ends on a fold or at showdown (best five of seven). The game ends when one
-- stack hits zero, or when either player cashes out between hands (or folds out mid-hand by
-- cashing out). Slow players (30 s) are folded by holdem_timeout().
--
-- Run once in the Supabase SQL Editor, after games_timer_cap_status_2026_09_17.sql.

-- chips are XP: game_points may go negative, but total XP may not ------------------------------------
alter table public.user_stats drop constraint if exists user_stats_game_points_check;
alter table public.user_stats add constraint user_stats_xp_nonneg check (reactions_received + game_points >= 0);

create table if not exists public.holdem_games (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  challenger_id     uuid        not null references auth.users(id) on delete cascade,
  challenger_name   text,
  opponent_id       uuid        not null references auth.users(id) on delete cascade,
  opponent_name     text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  stakes            text        not null check (stakes in ('low', 'high')),
  sb                integer     not null,
  bb                integer     not null,
  buy_in            integer     not null,
  challenger_stack  integer     not null default 0,
  opponent_stack    integer     not null default 0,
  hand_no           integer     not null default 0,
  dealer            uuid,
  street            text        not null default 'between' check (street in ('between', 'preflop', 'flop', 'turn', 'river', 'showdown')),
  board             text[]      not null default '{}',
  pot               integer     not null default 0,
  challenger_bet    integer     not null default 0,
  opponent_bet      integer     not null default 0,
  challenger_acted  boolean     not null default false,
  opponent_acted    boolean     not null default false,
  min_raise         integer     not null default 0,
  turn              uuid,
  turn_started_at   timestamptz not null default now(),
  shown_challenger  text[],
  shown_opponent    text[],
  hand_result       text,
  last_action       text,
  winner            uuid,
  result            text        check (result in ('bust', 'cashout')),
  challenger_points integer     not null default 0,
  opponent_points   integer     not null default 0,
  check (challenger_id <> opponent_id)
);
create unique index if not exists holdem_one_open_per_pair on public.holdem_games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index if not exists holdem_games_challenger on public.holdem_games (challenger_id, status);
create index if not exists holdem_games_opponent on public.holdem_games (opponent_id, status);

create table if not exists public.holdem_hands (
  game_id  bigint not null references public.holdem_games(id) on delete cascade,
  user_id  uuid   not null references auth.users(id) on delete cascade,
  cards    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create table if not exists public.holdem_decks (
  game_id bigint primary key references public.holdem_games(id) on delete cascade,
  deck    text[] not null default '{}'
);

alter table public.holdem_games enable row level security;
alter table public.holdem_hands enable row level security;
alter table public.holdem_decks enable row level security;
create policy "my holdem games" on public.holdem_games for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());
create policy "my holdem hand" on public.holdem_hands for select to authenticated using (user_id = auth.uid());
revoke all on public.holdem_games, public.holdem_hands, public.holdem_decks from anon, authenticated;
grant select on public.holdem_games, public.holdem_hands to authenticated;   -- no insert: sitting down moves XP, so it is a function
alter publication supabase_realtime add table public.holdem_games;
alter publication supabase_realtime add table public.holdem_hands;

-- The cap now counts Hold'em winnings too -------------------------------------------------------------
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
  )::int
$$;

-- Cards & the hand evaluator -----------------------------------------------------------------------
-- A card is rank + suit: 'Ah', 'Td', '9c'. Ranks 2..9, T, J, Q, K, A.
create or replace function public.hd_new_deck() returns text[] language sql volatile as $$
  select array_agg(r || s order by random()) from unnest(array['2','3','4','5','6','7','8','9','T','J','Q','K','A']) r, unnest(array['h','d','c','s']) s
$$;
create or replace function public.hd_rank(c text) returns int language sql immutable as $$
  select position(left(c, 1) in '23456789TJQKA') + 1 $$;
-- Score of one five-card hand as an int[] that compares correctly with array comparison:
-- {category, then the ranks that break ties in order}. 8 straight flush, 7 quads, 6 full house,
-- 5 flush, 4 straight, 3 trips, 2 two pair, 1 pair, 0 high card.
create or replace function public.hd_score5(c text[]) returns int[]
language plpgsql immutable as $$
declare cnt int[] := array_fill(0, array[15]); i int; r int; flush boolean; straight boolean; hi int := 0;
  ordered int[] := '{}'; distinct_ranks int[]; n int;
begin
  for i in 1..5 loop r := public.hd_rank(c[i]); cnt[r] := cnt[r] + 1; end loop;
  flush := substr(c[1],2,1) = substr(c[2],2,1) and substr(c[2],2,1) = substr(c[3],2,1) and substr(c[3],2,1) = substr(c[4],2,1) and substr(c[4],2,1) = substr(c[5],2,1);
  select array_agg(x order by x desc) into distinct_ranks from (select distinct public.hd_rank(u) as x from unnest(c) u) d;
  n := array_length(distinct_ranks, 1);
  straight := false;
  if n = 5 then
    if distinct_ranks[1] - distinct_ranks[5] = 4 then straight := true; hi := distinct_ranks[1];
    elsif distinct_ranks[1] = 14 and distinct_ranks[2] = 5 and distinct_ranks[5] = 2 then straight := true; hi := 5; end if;
  end if;
  -- ranks ordered by count desc, then rank desc
  select array_agg(x order by cnt[x] desc, x desc) into ordered from unnest(distinct_ranks) x;
  if straight and flush then return array[8, hi]; end if;
  if cnt[ordered[1]] = 4 then return array[7, ordered[1], ordered[2]]; end if;
  if cnt[ordered[1]] = 3 and cnt[ordered[2]] = 2 then return array[6, ordered[1], ordered[2]]; end if;
  if flush then return array[5] || ordered; end if;
  if straight then return array[4, hi]; end if;
  if cnt[ordered[1]] = 3 then return array[3] || ordered; end if;
  if cnt[ordered[1]] = 2 and cnt[ordered[2]] = 2 then return array[2] || ordered; end if;
  if cnt[ordered[1]] = 2 then return array[1] || ordered; end if;
  return array[0] || ordered;
end $$;
-- Best five of seven (or five of six / five).
create or replace function public.hd_best(c text[]) returns int[]
language plpgsql immutable as $$
declare n int := array_length(c, 1); best int[] := null; s int[]; a int; b int; i int; hand text[];
begin
  if n = 5 then return public.hd_score5(c); end if;
  -- drop two (n = 7) or one (n = 6) cards in every way
  for a in 1..n loop
    for b in a..n loop
      if n = 7 and b = a then continue; end if;
      if n = 6 and b <> a then continue; end if;
      hand := '{}';
      for i in 1..n loop if i <> a and i <> b then hand := hand || c[i]; end if; end loop;
      s := public.hd_score5(hand);
      if best is null or s > best then best := s; end if;
    end loop;
  end loop;
  return best;
end $$;
create or replace function public.hd_rank_name(r int) returns text language sql immutable as $$
  select case r when 14 then 'Ace' when 13 then 'King' when 12 then 'Queen' when 11 then 'Jack' when 10 then 'Ten' else r::text end $$;
create or replace function public.hd_score_name(s int[]) returns text language sql immutable as $$
  select case s[1]
    when 8 then case when s[2] = 14 then 'a royal flush' else 'a straight flush, ' || public.hd_rank_name(s[2]) || ' high' end
    when 7 then 'four ' || public.hd_rank_name(s[2]) || 's'
    when 6 then 'a full house, ' || public.hd_rank_name(s[2]) || 's over ' || public.hd_rank_name(s[3]) || 's'
    when 5 then 'a flush, ' || public.hd_rank_name(s[2]) || ' high'
    when 4 then 'a straight, ' || public.hd_rank_name(s[2]) || ' high'
    when 3 then 'three ' || public.hd_rank_name(s[2]) || 's'
    when 2 then 'two pair, ' || public.hd_rank_name(s[2]) || 's and ' || public.hd_rank_name(s[3]) || 's'
    when 1 then 'a pair of ' || public.hd_rank_name(s[2]) || 's'
    else public.hd_rank_name(s[2]) || ' high' end $$;

-- Sitting down / leaving: XP escrow -----------------------------------------------------------------
create or replace function public.hd_stakes(p_stakes text, out sb int, out bb int, out min_buy int, out max_buy int)
language sql immutable as $$
  select case when p_stakes = 'high' then 2 else 1 end, case when p_stakes = 'high' then 5 else 2 end,
         case when p_stakes = 'high' then 10 else 5 end, case when p_stakes = 'high' then 50 else 10 end $$;
create or replace function public.hd_xp(p uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select reactions_received + game_points from public.user_stats where user_id = p), 0) $$;
-- move XP in or out of a stack (negative delta = pay in)
create or replace function public.hd_credit(p uuid, delta int) returns void language plpgsql security definer set search_path = public as $$
begin
  -- update first: an INSERT ... ON CONFLICT would evaluate the generated level column (a square
  -- root) on the proposed row before noticing the conflict, and a negative delta breaks that.
  update public.user_stats set game_points = game_points + delta where user_id = p;
  if not found then insert into public.user_stats (user_id, game_points) values (p, greatest(delta, 0)); end if;
end $$;

create or replace function public.holdem_challenge(p_opponent uuid, p_stakes text, p_buy_in int) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare st record; g public.holdem_games; oname text; myname text;
begin
  if auth.uid() is null then raise exception 'Sign on first.'; end if;
  if p_opponent = auth.uid() then raise exception 'You cannot play yourself.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'Not allowed.'; end if;
  if not public.can_whisper(auth.uid(), p_opponent) then raise exception 'They only take whispers from friends.'; end if;
  if p_stakes not in ('low', 'high') then raise exception 'Pick low or high stakes.'; end if;
  select * into st from public.hd_stakes(p_stakes);
  if p_buy_in is null or p_buy_in < st.min_buy or p_buy_in > st.max_buy then raise exception 'Sit down with % to % XP at this table.', st.min_buy, st.max_buy; end if;
  if public.hd_xp(auth.uid()) < p_buy_in then raise exception 'You do not have % XP to put on the table.', p_buy_in; end if;
  select name into myname from public.profiles where user_id = auth.uid();
  select name into oname from public.profiles where user_id = p_opponent;
  insert into public.holdem_games (challenger_id, challenger_name, opponent_id, opponent_name, stakes, sb, bb, buy_in, challenger_stack)
    values (auth.uid(), myname, p_opponent, oname, p_stakes, st.sb, st.bb, p_buy_in, p_buy_in) returning * into g;
  perform public.hd_credit(auth.uid(), -p_buy_in);   -- escrow
  return g;
end $$;

-- Realtime-visible refresh of the public row: turn clock, counters. Internal.
create or replace function public.hd_touch(p_game bigint) returns void language sql security definer set search_path = public as $$
  update public.holdem_games set updated_at = now() where id = p_game $$;

-- Deal a new hand. Internal.
create or replace function public.hd_deal(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; d text[]; btn uuid; oth uuid; dsb int; obb int; dname text;
begin
  select * into g from public.holdem_games where id = p_game for update;
  btn := case when g.dealer is null then g.opponent_id when g.dealer = g.challenger_id then g.opponent_id else g.challenger_id end;
  oth := case when btn = g.challenger_id then g.opponent_id else g.challenger_id end;
  d := public.hd_new_deck();
  delete from public.holdem_hands where game_id = p_game;
  insert into public.holdem_hands (game_id, user_id, cards) values (p_game, g.challenger_id, d[1:2]), (p_game, g.opponent_id, d[3:4]);
  insert into public.holdem_decks (game_id, deck) values (p_game, d[5:]) on conflict (game_id) do update set deck = d[5:];
  -- blinds (short stacks post what they have)
  dsb := least(g.sb, case when btn = g.challenger_id then g.challenger_stack else g.opponent_stack end);
  obb := least(g.bb, case when oth = g.challenger_id then g.challenger_stack else g.opponent_stack end);
  dname := case when btn = g.challenger_id then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  update public.holdem_games set
    hand_no = g.hand_no + 1, dealer = btn, street = 'preflop', board = '{}', pot = 0,
    challenger_bet = case when btn = g.challenger_id then dsb else obb end,
    opponent_bet   = case when btn = g.opponent_id then dsb else obb end,
    challenger_stack = g.challenger_stack - case when btn = g.challenger_id then dsb else obb end,
    opponent_stack   = g.opponent_stack   - case when btn = g.opponent_id then dsb else obb end,
    challenger_acted = false, opponent_acted = false, min_raise = g.bb,
    turn = btn, turn_started_at = now(), shown_challenger = null, shown_opponent = null, hand_result = null,
    last_action = 'Hand ' || (g.hand_no + 1) || ': ' || dname || ' has the button', updated_at = now()
  where id = p_game;
end $$;

create or replace function public.holdem_respond(p_game bigint, p_accept boolean) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games;
begin
  select * into g from public.holdem_games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if not p_accept then
    update public.holdem_games set status = 'declined', updated_at = now() where id = p_game returning * into g;
    perform public.hd_credit(g.challenger_id, g.buy_in);   -- refund the escrow
    return g;
  end if;
  if public.hd_xp(auth.uid()) < g.buy_in then raise exception 'You need % XP to sit down at this table.', g.buy_in; end if;
  perform public.hd_credit(auth.uid(), -g.buy_in);
  update public.holdem_games set status = 'active', opponent_stack = g.buy_in, updated_at = now() where id = p_game;
  perform public.hd_deal(p_game);
  select * into g from public.holdem_games where id = p_game;
  return g;
end $$;

-- Withdraw a pending challenge (challenger, refunded), or expire a stale one.
create or replace function public.holdem_cancel(p_game bigint) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games;
begin
  select * into g from public.holdem_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status = 'pending' and (g.challenger_id = auth.uid() or g.created_at < now() - interval '10 minutes') then
    update public.holdem_games set status = case when g.challenger_id = auth.uid() then 'cancelled' else 'expired' end, updated_at = now() where id = p_game returning * into g;
    perform public.hd_credit(g.challenger_id, g.buy_in);
    return g;
  end if;
  raise exception 'That game cannot be cancelled right now.';
end $$;

-- End the game: both stacks go back to XP (winnings under the daily cap), result recorded. Internal.
create or replace function public.hd_finish(p_game bigint, p_result text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; cn int; onn int; cap int := 500; croom int; oroom int;
begin
  select * into g from public.holdem_games where id = p_game for update;
  cn := g.challenger_stack - g.buy_in; onn := g.opponent_stack - g.buy_in;
  croom := greatest(0, cap - public.game_points_today(g.challenger_id));
  oroom := greatest(0, cap - public.game_points_today(g.opponent_id));
  if cn > 0 then cn := least(cn, croom); end if;
  if onn > 0 then onn := least(onn, oroom); end if;
  perform public.hd_credit(g.challenger_id, g.buy_in + cn);
  perform public.hd_credit(g.opponent_id, g.buy_in + onn);
  update public.holdem_games set status = 'finished', result = p_result, street = 'between', turn = null,
    winner = case when g.challenger_stack > g.opponent_stack then g.challenger_id when g.opponent_stack > g.challenger_stack then g.opponent_id else null end,
    challenger_points = cn, opponent_points = onn, updated_at = now() where id = p_game;
end $$;

-- Settle a hand: p_winner takes the pot (null = split at showdown). Internal.
create or replace function public.hd_settle(p_game bigint, p_winner uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; total int; half int;
begin
  select * into g from public.holdem_games where id = p_game for update;
  total := g.pot + g.challenger_bet + g.opponent_bet;
  if p_winner is null then
    half := total / 2;
    update public.holdem_games set challenger_stack = challenger_stack + half + (total - 2 * half) * (case when dealer = challenger_id then 0 else 1 end),
      opponent_stack = opponent_stack + half + (total - 2 * half) * (case when dealer = opponent_id then 0 else 1 end) where id = p_game;
  elsif p_winner = g.challenger_id then update public.holdem_games set challenger_stack = challenger_stack + total where id = p_game;
  else update public.holdem_games set opponent_stack = opponent_stack + total where id = p_game;
  end if;
  update public.holdem_games set pot = 0, challenger_bet = 0, opponent_bet = 0, street = 'between', turn = null, turn_started_at = now(),
    hand_result = p_text, last_action = p_text, updated_at = now() where id = p_game;
  select * into g from public.holdem_games where id = p_game;
  if g.challenger_stack = 0 or g.opponent_stack = 0 then perform public.hd_finish(p_game, 'bust'); end if;
end $$;

-- Showdown: reveal, compare, settle. Internal.
create or replace function public.hd_showdown(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; hc text[]; ho text[]; sc int[]; so int[]; w uuid; txt text;
begin
  select * into g from public.holdem_games where id = p_game;
  select cards into hc from public.holdem_hands where game_id = p_game and user_id = g.challenger_id;
  select cards into ho from public.holdem_hands where game_id = p_game and user_id = g.opponent_id;
  sc := public.hd_best(hc || g.board); so := public.hd_best(ho || g.board);
  update public.holdem_games set shown_challenger = hc, shown_opponent = ho, street = 'showdown' where id = p_game;
  if sc > so then w := g.challenger_id; txt := coalesce(g.challenger_name, 'They') || ' wins with ' || public.hd_score_name(sc) || ' over ' || public.hd_score_name(so);
  elsif so > sc then w := g.opponent_id; txt := coalesce(g.opponent_name, 'They') || ' wins with ' || public.hd_score_name(so) || ' over ' || public.hd_score_name(sc);
  else w := null; txt := 'Split pot — both hold ' || public.hd_score_name(sc); end if;
  perform public.hd_settle(p_game, w, txt);
end $$;

-- Move to the next street (or showdown), dealing from the deck. Internal.
create or replace function public.hd_next_street(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; d text[]; first uuid; allin boolean;
begin
  select * into g from public.holdem_games where id = p_game for update;
  select deck into d from public.holdem_decks where game_id = p_game;
  -- an uncalled part of a bet goes back to whoever bet it (the other side was all-in for less)
  if g.challenger_bet > g.opponent_bet then update public.holdem_games set challenger_stack = challenger_stack + (challenger_bet - opponent_bet), challenger_bet = opponent_bet where id = p_game;
  elsif g.opponent_bet > g.challenger_bet then update public.holdem_games set opponent_stack = opponent_stack + (opponent_bet - challenger_bet), opponent_bet = challenger_bet where id = p_game; end if;
  -- bets into the pot
  update public.holdem_games set pot = pot + challenger_bet + opponent_bet, challenger_bet = 0, opponent_bet = 0,
    challenger_acted = false, opponent_acted = false, min_raise = bb where id = p_game;
  first := case when g.dealer = g.challenger_id then g.opponent_id else g.challenger_id end; -- non-dealer acts first after the flop
  allin := g.challenger_stack = 0 or g.opponent_stack = 0;
  if g.street = 'preflop' then
    update public.holdem_games set street = 'flop', board = d[1:3], turn = first, turn_started_at = now() where id = p_game;
    update public.holdem_decks set deck = d[4:] where game_id = p_game;
  elsif g.street = 'flop' then
    update public.holdem_games set street = 'turn', board = board || d[1], turn = first, turn_started_at = now() where id = p_game;
    update public.holdem_decks set deck = d[2:] where game_id = p_game;
  elsif g.street = 'turn' then
    update public.holdem_games set street = 'river', board = board || d[1], turn = first, turn_started_at = now() where id = p_game;
    update public.holdem_decks set deck = d[2:] where game_id = p_game;
  else
    perform public.hd_showdown(p_game); return;
  end if;
  if allin then perform public.hd_next_street(p_game); end if;   -- nobody can bet: run it out
end $$;

-- The one action verb. p_action: 'fold' | 'call' (check when nothing to call) | 'raise' (p_amount =
-- the total you are raising TO on this street; all-in if it is everything you have).
create or replace function public.holdem_act(p_game bigint, p_action text, p_amount int default null) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; me uuid := auth.uid(); mine boolean; my_bet int; their_bet int; my_stack int; other uuid; whom text; oname text;
  to_call int; put int; target int; raise_by int;
begin
  select * into g from public.holdem_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> me and g.opponent_id <> me) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.street in ('between', 'showdown') then raise exception 'No hand is being played right now.'; end if;
  if g.turn <> me then raise exception 'Not your turn.'; end if;
  mine := g.challenger_id = me;
  my_bet := case when mine then g.challenger_bet else g.opponent_bet end;
  their_bet := case when mine then g.opponent_bet else g.challenger_bet end;
  my_stack := case when mine then g.challenger_stack else g.opponent_stack end;
  other := case when mine then g.opponent_id else g.challenger_id end;
  whom := case when mine then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  oname := case when mine then coalesce(g.opponent_name, 'They') else coalesce(g.challenger_name, 'They') end;
  to_call := greatest(0, their_bet - my_bet);
  if p_action = 'fold' then
    perform public.hd_settle(p_game, other, whom || ' folds — ' || oname || ' takes ' || (g.pot + g.challenger_bet + g.opponent_bet) || ' XP');
  elsif p_action = 'call' then
    put := least(to_call, my_stack);
    if mine then update public.holdem_games set challenger_bet = challenger_bet + put, challenger_stack = challenger_stack - put, challenger_acted = true where id = p_game;
    else update public.holdem_games set opponent_bet = opponent_bet + put, opponent_stack = opponent_stack - put, opponent_acted = true where id = p_game; end if;
    update public.holdem_games set last_action = whom || case when to_call = 0 then ' checks' when put < to_call then ' calls all-in for ' || put else ' calls ' || put end,
      turn = other, turn_started_at = now(), updated_at = now() where id = p_game;
    select * into g from public.holdem_games where id = p_game;
    -- street over when both have acted and the bets match (or someone is all-in and has been called)
    if (g.challenger_acted and g.opponent_acted and g.challenger_bet = g.opponent_bet)
       or (g.challenger_stack = 0 and g.opponent_bet >= g.challenger_bet) or (g.opponent_stack = 0 and g.challenger_bet >= g.opponent_bet) then
      perform public.hd_next_street(p_game);
    end if;
  elsif p_action = 'raise' then
    if p_amount is null then raise exception 'How much?'; end if;
    target := least(p_amount, my_bet + my_stack);           -- can't raise past your stack: that is all-in
    raise_by := target - their_bet;
    if target <= their_bet then raise exception 'A raise has to be more than %.', their_bet; end if;
    if raise_by < g.min_raise and target < my_bet + my_stack then raise exception 'Minimum raise is to %.', their_bet + g.min_raise; end if;
    put := target - my_bet;
    if mine then update public.holdem_games set challenger_bet = target, challenger_stack = challenger_stack - put, challenger_acted = true, opponent_acted = false where id = p_game;
    else update public.holdem_games set opponent_bet = target, opponent_stack = opponent_stack - put, opponent_acted = true, challenger_acted = false where id = p_game; end if;
    update public.holdem_games set min_raise = greatest(min_raise, raise_by),
      last_action = whom || case when target = my_bet + my_stack then ' goes all-in for ' || target else (case when their_bet = 0 then ' bets ' else ' raises to ' end) || target end,
      turn = other, turn_started_at = now(), updated_at = now() where id = p_game;
    select * into g from public.holdem_games where id = p_game;
    -- if the other player is already all-in and can't respond, the street is done
    if (case when mine then g.opponent_stack else g.challenger_stack end) = 0 then perform public.hd_next_street(p_game); end if;
  else
    raise exception 'Unknown action.';
  end if;
  select * into g from public.holdem_games where id = p_game;
  return g;
end $$;

-- Between hands: deal the next one (either player; the client asks a few seconds after a result).
create or replace function public.holdem_next(p_game bigint) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games;
begin
  select * into g from public.holdem_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.street <> 'between' then return g; end if;
  perform public.hd_deal(p_game);
  select * into g from public.holdem_games where id = p_game;
  return g;
end $$;

-- Cash out: leave the table with your stack. Mid-hand it counts as a fold first.
create or replace function public.holdem_leave(p_game bigint) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; other uuid; whom text;
begin
  select * into g from public.holdem_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = auth.uid() then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  if g.street not in ('between', 'showdown') then perform public.hd_settle(p_game, other, whom || ' leaves the table mid-hand — ' || (g.pot + g.challenger_bet + g.opponent_bet) || ' XP to the other side'); end if;
  select * into g from public.holdem_games where id = p_game;
  if g.status = 'active' then
    update public.holdem_games set last_action = whom || ' cashed out' where id = p_game;
    perform public.hd_finish(p_game, 'cashout');
  end if;
  select * into g from public.holdem_games where id = p_game;
  return g;
end $$;

-- 30 s clock: the slow player folds (mid-hand) or the next hand is dealt (between hands).
create or replace function public.holdem_timeout(p_game bigint) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; other uuid; whom text;
begin
  select * into g from public.holdem_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then return g; end if;
  if g.turn_started_at > now() - interval '29 seconds' then return g; end if;
  if g.street = 'between' then perform public.hd_deal(p_game);
  elsif g.turn is not null then
    other := case when g.challenger_id = g.turn then g.opponent_id else g.challenger_id end;
    whom := case when g.challenger_id = g.turn then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
    perform public.hd_settle(p_game, other, whom || ' ran out of time and folds — ' || (g.pot + g.challenger_bet + g.opponent_bet) || ' XP to the other side');
  end if;
  select * into g from public.holdem_games where id = p_game;
  return g;
end $$;

-- Ladder: games won / lost and net XP -------------------------------------------------------------------
create or replace function public.holdem_leaderboard(p_limit integer default 20)
returns table (user_id uuid, wins integer, losses integer, net integer, streak integer, played integer)
language sql stable security definer set search_path = public as $$
  with f as (select id, updated_at, challenger_id, opponent_id, winner, challenger_stack - buy_in as cn, opponent_stack - buy_in as onn from public.holdem_games where status = 'finished'),
  sides as (select id, updated_at, challenger_id as uid, winner, cn as net from f union all select id, updated_at, opponent_id, winner, onn from f),
  outcomes as (select uid, net, case when winner = uid then 'W' when winner is null then 'D' else 'L' end as o, row_number() over (partition by uid order by updated_at desc, id desc) as rn from sides),
  totals as (select uid, count(*) filter (where o = 'W')::int as wins, count(*) filter (where o = 'L')::int as losses, sum(net)::int as net, count(*)::int as played from outcomes group by uid),
  streaks as (select o.uid, count(*)::int as streak from outcomes o where o.o = 'W'
    and o.rn < coalesce((select min(o2.rn) from outcomes o2 where o2.uid = o.uid and o2.o <> 'W'), 2147483647) group by o.uid)
  select t.uid, t.wins, t.losses, t.net, coalesce(s.streak, 0), t.played from totals t left join streaks s on s.uid = t.uid
  order by t.net desc, t.wins desc, t.uid limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- Privileges -------------------------------------------------------------------------------------------
revoke execute on function public.holdem_challenge(uuid, text, int), public.holdem_respond(bigint, boolean), public.holdem_cancel(bigint), public.holdem_act(bigint, text, int),
  public.holdem_next(bigint), public.holdem_leave(bigint), public.holdem_timeout(bigint), public.holdem_leaderboard(integer),
  public.hd_new_deck(), public.hd_rank(text), public.hd_score5(text[]), public.hd_best(text[]), public.hd_rank_name(int), public.hd_score_name(int[]),
  public.hd_stakes(text), public.hd_xp(uuid), public.hd_credit(uuid, int), public.hd_touch(bigint), public.hd_deal(bigint), public.hd_finish(bigint, text),
  public.hd_settle(bigint, uuid, text), public.hd_showdown(bigint), public.hd_next_street(bigint) from public, anon;
grant execute on function public.holdem_challenge(uuid, text, int), public.holdem_respond(bigint, boolean), public.holdem_cancel(bigint), public.holdem_act(bigint, text, int),
  public.holdem_next(bigint), public.holdem_leave(bigint), public.holdem_timeout(bigint), public.holdem_leaderboard(integer), public.hd_stakes(text), public.hd_xp(uuid)
  to authenticated, service_role;
grant execute on function public.hd_new_deck(), public.hd_rank(text), public.hd_score5(text[]), public.hd_best(text[]), public.hd_rank_name(int), public.hd_score_name(int[]),
  public.hd_credit(uuid, int), public.hd_touch(bigint), public.hd_deal(bigint), public.hd_finish(bigint, text), public.hd_settle(bigint, uuid, text), public.hd_showdown(bigint), public.hd_next_street(bigint)
  to authenticated, service_role;
