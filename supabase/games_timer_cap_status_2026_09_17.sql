-- Turn clocks, the 500-a-day game XP cap, and status messages -----------------------------------
--
-- 1. profiles.status_message: a short line people set next to their Online/Away/Busy status
--    ("back in 5", "on my phone"). Shown under their name in whisper windows and carried in
--    presence; stored here so it survives a reload.
-- 2. games.turn_started_at / uno_games.turn_started_at: when the current turn began. Every verb
--    that hands the turn over stamps it, and the client draws a 30-second clock from it. When the
--    clock runs out EITHER player may call game_timeout() / uno_timeout(); the server checks the
--    clock itself (29 s, a second of grace for skew) and skips the slow player's turn: a random
--    free square in Tic-Tac-Toe, a drawn card and a passed turn in UNO. Nobody loses the game for
--    being slow, and the clock lives on the server so a modified client can't stall forever.
-- 3. The daily game-points cap goes from 15 to 500 (game_award / uno_award).
--
-- Run once in the Supabase SQL Editor, after uno_feature.sql.

alter table public.profiles add column if not exists status_message text
  check (status_message is null or char_length(status_message) <= 80);

grant update (status_message) on public.profiles to authenticated;  -- the existing "own profile" update policy scopes it

alter table public.games     add column if not exists turn_started_at timestamptz not null default now();
alter table public.uno_games add column if not exists turn_started_at timestamptz not null default now();

-- Cap ---------------------------------------------------------------------------------------------
create or replace function public.game_award(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.games; cp int := 0; op int := 0; cap int := 500;
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

create or replace function public.uno_award(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; cp int := 0; op int := 0; cap int := 500;
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

-- Tic-Tac-Toe: stamp the clock -------------------------------------------------------------------
create or replace function public.game_respond(p_game bigint, p_accept boolean) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if p_accept then
    update public.games set status = 'active', x_player = g.opponent_id, turn = g.opponent_id, turn_started_at = now(), updated_at = now() where id = p_game returning * into g;
  else
    update public.games set status = 'declined', updated_at = now() where id = p_game returning * into g;
  end if;
  return g;
end $$;

-- One mark, by whichever player p_by is (the caller for game_move, the slow player for
-- game_timeout). Internal.
create or replace function public.game_apply(p_game bigint, p_by uuid, p_cell integer) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games; b text; m text; other uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g.status <> 'active' then raise exception 'That game is over.'; end if;
  if g.turn <> p_by then raise exception 'Not your turn.'; end if;
  if p_cell is null or p_cell < 0 or p_cell > 8 or substr(g.board, p_cell + 1, 1) <> '.' then raise exception 'That square is taken.'; end if;
  m := case when g.x_player = p_by then 'X' else 'O' end;
  b := overlay(g.board placing m from p_cell + 1 for 1);
  other := case when g.challenger_id = p_by then g.opponent_id else g.challenger_id end;
  if public.ttt_won(b, m) then
    update public.games set board = b, status = 'finished', winner = p_by, result = 'win', turn = null, updated_at = now() where id = p_game;
    perform public.game_award(p_game);
  elsif position('.' in b) = 0 then
    update public.games set board = b, status = 'finished', winner = null, result = 'draw', turn = null, updated_at = now() where id = p_game;
    perform public.game_award(p_game);
  else
    update public.games set board = b, turn = other, turn_started_at = now(), updated_at = now() where id = p_game;
  end if;
  select * into g from public.games where id = p_game;
  return g;
end $$;

create or replace function public.game_move(p_game bigint, p_cell integer) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  return public.game_apply(p_game, auth.uid(), p_cell);
end $$;

-- The slow player's turn goes to a random free square. Either player may call it once 29 s have
-- passed on the server's clock.
create or replace function public.game_timeout(p_game bigint) returns public.games
language plpgsql security definer set search_path = public as $$
declare g public.games; cells int[] := '{}'; i int;
begin
  select * into g from public.games where id = p_game;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then return g; end if;
  if g.turn_started_at > now() - interval '29 seconds' then return g; end if;
  for i in 0..8 loop if substr(g.board, i + 1, 1) = '.' then cells := cells || i; end if; end loop;
  if coalesce(array_length(cells, 1), 0) = 0 then return g; end if;
  return public.game_apply(p_game, g.turn, cells[1 + floor(random() * array_length(cells, 1))::int]);
end $$;

-- UNO: stamp the clock ----------------------------------------------------------------------------
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
  loop
    deck := public.uno_new_deck(); tries := tries + 1;
    first := deck[15];
    exit when first ~ '^[RGBY][0-9]$' or tries > 20;
  end loop;
  insert into public.uno_hands (game_id, user_id, cards) values (p_game, g.opponent_id, deck[1:7]), (p_game, g.challenger_id, deck[8:14]);
  insert into public.uno_decks (game_id, draw, discard) values (p_game, deck[16:], array[first]);
  update public.uno_games set status = 'active', turn = g.opponent_id, turn_started_at = now(), phase = 'play', top_card = first, color = left(first, 1),
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
    update public.uno_games set top_card = p_card, color = newcol, turn = auth.uid(), turn_started_at = now(), phase = 'play', last_action = act || ' — draw two, turn skipped', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  elsif rank = 'W4' then
    perform public.uno_draw_cards(p_game, other, 4);
    update public.uno_games set top_card = p_card, color = newcol, turn = auth.uid(), turn_started_at = now(), phase = 'play', last_action = act || ' — draw four, turn skipped', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  elsif rank in ('S', 'R') then
    update public.uno_games set top_card = p_card, color = newcol, turn = auth.uid(), turn_started_at = now(), phase = 'play', last_action = act || ' — turn skipped', updated_at = now() where id = p_game;
    perform public.uno_sync(p_game);
  else
    update public.uno_games set top_card = p_card, color = newcol, turn = other, turn_started_at = now(), phase = 'play', last_action = act, updated_at = now() where id = p_game;
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
    update public.uno_games set turn = other, turn_started_at = now(), phase = 'play', last_action = whom || ' could not draw — no cards left', updated_at = now() where id = p_game;
  elsif public.uno_playable(drawn[1], g.top_card, g.color) then
    update public.uno_games set phase = 'after_draw', last_action = whom || ' drew a card', updated_at = now() where id = p_game;
  else
    update public.uno_games set turn = other, turn_started_at = now(), phase = 'play', last_action = whom || ' drew a card', updated_at = now() where id = p_game;
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
  update public.uno_games set turn = other, turn_started_at = now(), phase = 'play', updated_at = now() where id = p_game;
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

-- The slow player draws a card (if they hadn't already) and the turn passes.
create or replace function public.uno_timeout(p_game bigint) returns public.uno_games
language plpgsql security definer set search_path = public as $$
declare g public.uno_games; other uuid; whom text;
begin
  select * into g from public.uno_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.turn is null then return g; end if;
  if g.turn_started_at > now() - interval '29 seconds' then return g; end if;
  other := case when g.challenger_id = g.turn then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = g.turn then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  if g.phase = 'play' then perform public.uno_draw_cards(p_game, g.turn, 1); end if;
  update public.uno_games set turn = other, turn_started_at = now(), phase = 'play',
    last_action = whom || ' ran out of time' || case when g.phase = 'play' then ' — draws a card' else '' end, updated_at = now() where id = p_game;
  perform public.uno_sync(p_game);
  select * into g from public.uno_games where id = p_game;
  return g;
end $$;

-- Privileges ---------------------------------------------------------------------------------------
revoke execute on function public.game_apply(bigint, uuid, integer), public.game_timeout(bigint), public.uno_timeout(bigint) from public, anon;
grant execute on function public.game_timeout(bigint), public.uno_timeout(bigint), public.game_apply(bigint, uuid, integer) to authenticated, service_role;
