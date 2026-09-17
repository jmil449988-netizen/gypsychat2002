-- UNO in whispers (two-player, standard rules) ----------------------------------------------------
--
-- Same shape as Tic-Tac-Toe (tictactoe_feature.sql), with one big difference: hands are secret.
-- So the state is split three ways:
--   uno_games  -- what both players may see: whose turn, the top card and current colour, how
--                 many cards each side holds, UNO flags, pile counts, status, result. Published on
--                 realtime; RLS limits it to the two players.
--   uno_hands  -- one row per player per game holding THEIR cards. RLS: only the owner can read
--                 their row. Published on realtime (each client filters on its own user id).
--   uno_decks  -- the draw pile and the discard pile. No policies at all: only the security-definer
--                 functions below touch it.
-- Every move is a function call; clients have no UPDATE on anything, so a modified client can't
-- peek at the deck, play a card it doesn't hold, or play out of turn.
--
-- Cards are short strings: colour letter R G B Y + rank 0-9, '+2' (draw two), 'S' (skip), 'R'
-- (reverse -- in two-player it acts as a skip); 'W' (wild) and 'W4' (wild draw four). 108 cards.
--
-- Rules encoded (standard two-player): the challenged player goes first; Draw Two / Wild Draw
-- Four take effect at once (no stacking) and the victim loses their turn; Skip and Reverse give
-- the player another turn; a drawn card may be played immediately if it fits, otherwise the turn
-- passes; the draw pile is rebuilt from the discard pile (minus its top card) when it runs out;
-- a player down to one card must call UNO -- until they do, the other player may catch them for a
-- two-card penalty, but only before taking their own turn; first to empty their hand wins.
-- The opening card is redrawn until it is a plain number card (keeps the start simple).
--
-- XP: a win is worth 5 game points through the same daily cap as Tic-Tac-Toe (15 per 24 h), so
-- game_points_today() now counts both tables.
--
-- Run once in the Supabase SQL Editor, after tictactoe_feature.sql.

create table if not exists public.uno_games (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  challenger_id     uuid        not null references auth.users(id) on delete cascade,
  challenger_name   text,
  opponent_id       uuid        not null references auth.users(id) on delete cascade,
  opponent_name     text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  turn              uuid,
  phase             text        not null default 'play' check (phase in ('play', 'after_draw')),
  top_card          text,
  color             text        check (color is null or color in ('R', 'G', 'B', 'Y')),
  draw_count        integer     not null default 0,
  challenger_cards  integer     not null default 0,
  opponent_cards    integer     not null default 0,
  challenger_uno    boolean     not null default false,
  opponent_uno      boolean     not null default false,
  last_action       text,
  winner            uuid,
  result            text        check (result in ('win', 'resign')),
  challenger_points integer     not null default 0,
  opponent_points   integer     not null default 0,
  check (challenger_id <> opponent_id)
);
create unique index if not exists uno_one_open_per_pair on public.uno_games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index if not exists uno_games_challenger on public.uno_games (challenger_id, status);
create index if not exists uno_games_opponent on public.uno_games (opponent_id, status);

create table if not exists public.uno_hands (
  game_id  bigint not null references public.uno_games(id) on delete cascade,
  user_id  uuid   not null references auth.users(id) on delete cascade,
  cards    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.uno_decks (
  game_id bigint primary key references public.uno_games(id) on delete cascade,
  draw    text[] not null default '{}',
  discard text[] not null default '{}'
);

alter table public.uno_games enable row level security;
alter table public.uno_hands enable row level security;
alter table public.uno_decks enable row level security;   -- no policies: functions only

create policy "my uno games" on public.uno_games for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());
create policy "uno challenge" on public.uno_games for insert to authenticated
  with check (
    challenger_id = auth.uid() and opponent_id <> auth.uid()
    and status = 'pending' and turn is null and top_card is null and winner is null and result is null
    and challenger_cards = 0 and opponent_cards = 0 and challenger_points = 0 and opponent_points = 0
    and not public.is_banned(auth.uid())
    and public.can_whisper(auth.uid(), opponent_id)
  );
create policy "my uno hand" on public.uno_hands for select to authenticated using (user_id = auth.uid());

revoke all on public.uno_games, public.uno_hands, public.uno_decks from anon, authenticated;
grant select, insert on public.uno_games to authenticated;
grant select on public.uno_hands to authenticated;

alter publication supabase_realtime add table public.uno_games;
alter publication supabase_realtime add table public.uno_hands;

-- Cap now spans both games ----------------------------------------------------------------------
create or replace function public.game_points_today(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.uno_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  )::int
$$;

-- Helpers -----------------------------------------------------------------------------------------
create or replace function public.uno_new_deck() returns text[]
language sql volatile as $$
  select array_agg(c order by random()) from (
    select col || r as c from unnest(array['R','G','B','Y']) col,
      unnest(array['0','1','1','2','2','3','3','4','4','5','5','6','6','7','7','8','8','9','9','+2','+2','S','S','R','R']) r
    union all select 'W' from generate_series(1,4)
    union all select 'W4' from generate_series(1,4)
  ) d
$$;

create or replace function public.uno_card_color(c text) returns text language sql immutable as $$
  select case when c like 'W%' then null else left(c, 1) end $$;
create or replace function public.uno_card_rank(c text) returns text language sql immutable as $$
  select case when c like 'W%' then c else substr(c, 2) end $$;
-- Can `c` be laid on the current top card under the current colour?
create or replace function public.uno_playable(c text, top text, col text) returns boolean language sql immutable as $$
  select c like 'W%' or public.uno_card_color(c) = col or public.uno_card_rank(c) = public.uno_card_rank(top) $$;

create or replace function public.uno_award(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; cp int := 0; op int := 0; cap int := 15;
begin
  select * into g from public.uno_games where id = p_game;
  if g.status <> 'finished' or g.winner is null then return; end if;
  if g.winner = g.challenger_id then cp := 5; else op := 5; end if;
  cp := greatest(0, least(cp, cap - public.game_points_today(g.challenger_id)));
  op := greatest(0, least(op, cap - public.game_points_today(g.opponent_id)));
  update public.uno_games set challenger_points = cp, opponent_points = op where id = p_game;
  if cp > 0 then insert into public.user_stats (user_id, game_points) values (g.challenger_id, cp)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + cp; end if;
  if op > 0 then insert into public.user_stats (user_id, game_points) values (g.opponent_id, op)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + op; end if;
end $$;

-- Draw n cards for a player, rebuilding the pile from the discard when it runs dry. Returns the
-- cards drawn (in order). Internal.
create or replace function public.uno_draw_cards(p_game bigint, p_user uuid, n integer) returns text[]
language plpgsql security definer set search_path = public as $$
declare d public.uno_decks; drawn text[] := '{}'; i int; keep text; rest text[];
begin
  select * into d from public.uno_decks where game_id = p_game for update;
  for i in 1..n loop
    if coalesce(array_length(d.draw, 1), 0) = 0 then
      -- reshuffle the discard pile except its top card
      if coalesce(array_length(d.discard, 1), 0) <= 1 then exit; end if;
      keep := d.discard[array_length(d.discard, 1)];
      rest := d.discard[1:array_length(d.discard, 1) - 1];
      select array_agg(c order by random()) into d.draw from unnest(rest) c;
      d.discard := array[keep];
    end if;
    drawn := drawn || d.draw[1];
    d.draw := d.draw[2:];
  end loop;
  update public.uno_decks set draw = d.draw, discard = d.discard where game_id = p_game;
  update public.uno_hands set cards = cards || drawn, updated_at = now() where game_id = p_game and user_id = p_user;
  return drawn;
end $$;

-- Recount the public card counts / pile size from the private rows. Internal.
create or replace function public.uno_sync(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.uno_games;
begin
  select * into g from public.uno_games where id = p_game;
  update public.uno_games set
    challenger_cards = coalesce((select array_length(cards, 1) from public.uno_hands where game_id = p_game and user_id = g.challenger_id), 0),
    opponent_cards   = coalesce((select array_length(cards, 1) from public.uno_hands where game_id = p_game and user_id = g.opponent_id), 0),
    draw_count       = coalesce((select array_length(draw, 1) from public.uno_decks where game_id = p_game), 0),
    updated_at = now()
  where id = p_game;
  -- a hand that grew past one card loses its UNO call
  update public.uno_games set challenger_uno = false where id = p_game and challenger_cards > 1;
  update public.uno_games set opponent_uno = false where id = p_game and opponent_cards > 1;
end $$;

-- Names for the action log --------------------------------------------------------------------
create or replace function public.uno_color_name(c text) returns text language sql immutable as $$
  select case c when 'R' then 'Red' when 'G' then 'Green' when 'B' then 'Blue' when 'Y' then 'Yellow' else '' end $$;
create or replace function public.uno_card_name(c text) returns text language sql immutable as $$
  select case
    when c = 'W' then 'a Wild' when c = 'W4' then 'a Wild Draw Four'
    else public.uno_color_name(left(c,1)) || ' ' || case substr(c,2) when '+2' then 'Draw Two' when 'S' then 'Skip' when 'R' then 'Reverse' else substr(c,2) end
  end $$;

-- The verbs ---------------------------------------------------------------------------------------
create or replace function public.uno_respond(p_game bigint, p_accept boolean) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; deck text[]; first text; tries int := 0;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if not p_accept then
    update public.uno_games set status = 'declined', updated_at = now() where id = p_game returning * into g;
    return g;
  end if;
  -- deal: shuffle until the opening card is a plain number
  loop
    deck := public.uno_new_deck(); tries := tries + 1;
    first := deck[15];
    exit when first ~ '^[RGBY][0-9]$' or tries > 20;
  end loop;
  insert into public.uno_hands (game_id, user_id, cards) values (p_game, g.opponent_id, deck[1:7]), (p_game, g.challenger_id, deck[8:14]);
  insert into public.uno_decks (game_id, draw, discard) values (p_game, deck[16:], array[first]);
  update public.uno_games set status = 'active', turn = g.opponent_id, phase = 'play', top_card = first, color = left(first, 1),
    last_action = 'The game begins.', updated_at = now() where id = p_game;
  perform public.uno_sync(p_game);
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

create or replace function public.uno_play(p_game bigint, p_card text, p_color text default null) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; h public.uno_hands; other uuid; idx int; newcol text; rank text; act text; whom text;
  mine boolean; left_after int;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is over.'; end if;
  if g.turn <> auth.uid() then raise exception 'Not your turn.'; end if;
  select * into h from public.uno_hands where game_id = p_game and user_id = auth.uid() for update;
  idx := array_position(h.cards, p_card);
  if idx is null then raise exception 'You do not hold that card.'; end if;
  if g.phase = 'after_draw' and h.cards[array_length(h.cards, 1)] <> p_card then raise exception 'After drawing you may only play the card you drew.'; end if;
  if not public.uno_playable(p_card, g.top_card, g.color) then raise exception 'That card does not fit.'; end if;
  if p_card like 'W%' then
    if p_color is null or p_color not in ('R','G','B','Y') then raise exception 'Pick a colour for the wild.'; end if;
    newcol := p_color;
  else
    newcol := left(p_card, 1);
  end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  mine := g.challenger_id = auth.uid();
  whom := case when mine then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  -- take the card out of the hand (first matching copy) and onto the discard pile
  h.cards := h.cards[1:idx-1] || h.cards[idx+1:];
  update public.uno_hands set cards = h.cards, updated_at = now() where game_id = p_game and user_id = auth.uid();
  update public.uno_decks set discard = discard || p_card where game_id = p_game;
  left_after := coalesce(array_length(h.cards, 1), 0);
  rank := public.uno_card_rank(p_card);
  act := whom || ' played ' || public.uno_card_name(p_card) || case when p_card like 'W%' then ' (' || public.uno_color_name(newcol) || ')' else '' end;
  if left_after = 0 then
    update public.uno_games set top_card = p_card, color = newcol, turn = null, phase = 'play', status = 'finished', winner = auth.uid(), result = 'win',
      last_action = whom || ' played their last card and wins!', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
    perform public.uno_award(p_game);
  elsif rank = '+2' then
    perform public.uno_draw_cards(p_game, other, 2);
    update public.uno_games set top_card = p_card, color = newcol, turn = auth.uid(), phase = 'play', last_action = act || ' — draw two, turn skipped', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  elsif rank = 'W4' then
    perform public.uno_draw_cards(p_game, other, 4);
    update public.uno_games set top_card = p_card, color = newcol, turn = auth.uid(), phase = 'play', last_action = act || ' — draw four, turn skipped', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  elsif rank in ('S', 'R') then
    update public.uno_games set top_card = p_card, color = newcol, turn = auth.uid(), phase = 'play', last_action = act || ' — turn skipped', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  else
    update public.uno_games set top_card = p_card, color = newcol, turn = other, phase = 'play', last_action = act, updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  end if;
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

create or replace function public.uno_draw(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; drawn text[]; other uuid; whom text;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is over.'; end if;
  if g.turn <> auth.uid() then raise exception 'Not your turn.'; end if;
  if g.phase = 'after_draw' then raise exception 'You already drew — play it or pass.'; end if;
  drawn := public.uno_draw_cards(p_game, auth.uid(), 1);
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = auth.uid() then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  if coalesce(array_length(drawn, 1), 0) = 0 then
    -- nothing left to draw anywhere: the turn simply passes
    update public.uno_games set turn = other, phase = 'play', last_action = whom || ' could not draw — no cards left', updated_at = now() where id = p_game;
  elsif public.uno_playable(drawn[1], g.top_card, g.color) then
    update public.uno_games set phase = 'after_draw', last_action = whom || ' drew a card', updated_at = now() where id = p_game;
  else
    update public.uno_games set turn = other, phase = 'play', last_action = whom || ' drew a card', updated_at = now() where id = p_game;
  end if;
  perform public.uno_sync(p_game);
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

create or replace function public.uno_pass(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; other uuid;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.turn <> auth.uid() or g.phase <> 'after_draw' then raise exception 'You can only pass right after drawing.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  update public.uno_games set turn = other, phase = 'play', updated_at = now() where id = p_game;
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

-- "UNO!" -- allowed any time you hold one card (or are about to: two cards on your own turn).
create or replace function public.uno_call(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; n int; mine boolean;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is over.'; end if;
  mine := g.challenger_id = auth.uid();
  n := case when mine then g.challenger_cards else g.opponent_cards end;
  if not (n = 1 or (n = 2 and g.turn = auth.uid())) then raise exception 'You can call UNO with one card left (or two, on your turn).'; end if;
  if mine then update public.uno_games set challenger_uno = true, updated_at = now() where id = p_game;
  else update public.uno_games set opponent_uno = true, updated_at = now() where id = p_game; end if;
  update public.uno_games set last_action = (case when mine then coalesce(g.challenger_name,'They') else coalesce(g.opponent_name,'They') end) || ' called UNO!' where id = p_game;
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

-- Catch the other player on one card without an UNO call: they draw two. Only on your own turn,
-- before you act (so the window is exactly "before the next player begins their turn").
create or replace function public.uno_catch(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; other uuid; other_n int; other_uno boolean; whom text;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.turn <> auth.uid() or g.phase <> 'play' then raise exception 'You can only catch them at the start of your turn.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  other_n := case when g.challenger_id = auth.uid() then g.opponent_cards else g.challenger_cards end;
  other_uno := case when g.challenger_id = auth.uid() then g.opponent_uno else g.challenger_uno end;
  whom := case when g.challenger_id = auth.uid() then coalesce(g.opponent_name,'They') else coalesce(g.challenger_name,'They') end;
  if other_n <> 1 or other_uno then raise exception 'Nothing to catch.'; end if;
  perform public.uno_draw_cards(p_game, other, 2);
  update public.uno_games set last_action = whom || ' forgot to call UNO — draws two', updated_at = now() where id = p_game;
  perform public.uno_sync(p_game);
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

create or replace function public.uno_resign(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; other uuid; whom text;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = auth.uid() then coalesce(g.challenger_name,'They') else coalesce(g.opponent_name,'They') end;
  update public.uno_games set status = 'finished', winner = other, result = 'resign', turn = null, last_action = whom || ' resigned', updated_at = now() where id = p_game;
  perform public.uno_award(p_game);
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

create or replace function public.uno_cancel(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status = 'pending' and g.challenger_id = auth.uid() then
    update public.uno_games set status = 'cancelled', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'pending' and g.created_at < now() - interval '10 minutes' then
    update public.uno_games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'active' and g.updated_at < now() - interval '1 hour' then
    update public.uno_games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  else
    raise exception 'That game cannot be cancelled right now.';
  end if;
  return g;
end $$;

-- Ladder ---------------------------------------------------------------------------------------
create or replace function public.uno_leaderboard(p_limit integer default 20)
returns table (user_id uuid, wins integer, losses integer, streak integer, played integer)
language sql stable security definer set search_path = public as $$
  with f as (select id, updated_at, challenger_id, opponent_id, winner from public.uno_games where status = 'finished' and winner is not null),
  sides as (select id, updated_at, challenger_id as uid, winner from f union all select id, updated_at, opponent_id, winner from f),
  outcomes as (select uid, case when winner = uid then 'W' else 'L' end as o, row_number() over (partition by uid order by updated_at desc, id desc) as rn from sides),
  totals as (select uid, count(*) filter (where o = 'W')::int as wins, count(*) filter (where o = 'L')::int as losses, count(*)::int as played from outcomes group by uid),
  streaks as (select o.uid, count(*)::int as streak from outcomes o where o.o = 'W'
    and o.rn < coalesce((select min(o2.rn) from outcomes o2 where o2.uid = o.uid and o2.o <> 'W'), 2147483647) group by o.uid)
  select t.uid, t.wins, t.losses, coalesce(s.streak, 0), t.played from totals t left join streaks s on s.uid = t.uid
  order by t.wins desc, t.losses asc, t.uid limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- Privileges -------------------------------------------------------------------------------------
revoke execute on function public.uno_respond(bigint, boolean), public.uno_play(bigint, text, text), public.uno_draw(bigint), public.uno_pass(bigint),
  public.uno_call(bigint), public.uno_catch(bigint), public.uno_resign(bigint), public.uno_cancel(bigint), public.uno_leaderboard(integer),
  public.uno_award(bigint), public.uno_draw_cards(bigint, uuid, integer), public.uno_sync(bigint), public.uno_new_deck(),
  public.uno_card_color(text), public.uno_card_rank(text), public.uno_playable(text, text, text), public.uno_color_name(text), public.uno_card_name(text)
  from public, anon;
grant execute on function public.uno_respond(bigint, boolean), public.uno_play(bigint, text, text), public.uno_draw(bigint), public.uno_pass(bigint),
  public.uno_call(bigint), public.uno_catch(bigint), public.uno_resign(bigint), public.uno_cancel(bigint), public.uno_leaderboard(integer)
  to authenticated, service_role;
grant execute on function public.uno_award(bigint), public.uno_draw_cards(bigint, uuid, integer), public.uno_sync(bigint), public.uno_new_deck(),
  public.uno_card_color(text), public.uno_card_rank(text), public.uno_playable(text, text, text), public.uno_color_name(text), public.uno_card_name(text)
  to authenticated, service_role;
