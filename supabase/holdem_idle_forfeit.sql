-- Build 173: two missed turns in a row forfeits the whole stack into the pot -----------------------------
--
-- The user's call after the first live Hold'em test (18 Sept 2026). Before this, being stood up for missing two
-- turns sent the stack back to the player's XP like any other cash-out. Now (ht_cashout, outcome 'idle') the
-- stack goes into the pot of the hand being played, counted as that seat's contribution so a showdown's side
-- pots see it, and the result records the loss of the whole buy-in. Nothing is destroyed: whoever wins the
-- hand takes it. Leaving, cashing out, busting, a quiet device and the table closing still send the stack home.
-- The three functions below are the same text as in holdem_tables_feature.sql (which is updated to match).
--
-- Run once in the Supabase SQL Editor, after holdem_tables_feature.sql. Practice run first:
--   begin;  <this file>  <holdem_tables_dryrun.sql>  rollback;

-- Internal: chips and seats --------------------------------------------------------------------------------
-- A player gives up their seat: their stack goes back to their XP and the result is written down.
-- Anything they put in this hand stays in the pot. The seat's live-hand flags are cleared, so the hand
-- carries on without them (callers fold them first, if they were still in it).
-- 'idle' (two missed turns in a row, build 173) is the exception: the whole stack is forfeited into the
-- hand's pot -- counted as that seat's contribution, so a showdown's side-pot arithmetic sees it and it
-- reaches whoever wins the hand -- and the result records the loss of the whole buy-in.
create or replace function public.ht_cashout(p_table bigint, p_seat integer, p_outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; u uuid; amt int; net int; n int; forfeit int := 0;
  su uuid[]; sn text[]; st int[]; bi int[]; ih boolean[]; fo boolean[]; ac boolean[]; bt int[]; ct int[]; mi int[]; wo int[]; sh text[];
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  u := h.seat_user[p_seat];
  if u is null then return; end if;
  amt := h.stack[p_seat];
  if p_outcome = 'idle' and h.street in ('preflop', 'flop', 'turn', 'river') then forfeit := amt; amt := 0; end if;
  net := amt - h.buy_in[p_seat];
  n := public.ht_count(h, 'funded');
  if amt > 0 then perform public.hd_credit(u, amt); end if;
  insert into public.table_results (table_id, round, game, user_id, place, players, outcome, points)
    values (p_table, h.cashouts + 1, 'holdem', u, 0, greatest(n, 1), p_outcome, net);
  su := h.seat_user; sn := h.seat_name; st := h.stack; bi := h.buy_in; ih := h.in_hand; fo := h.folded; ac := h.acted;
  bt := h.bet; ct := h.contrib; mi := h.missed; wo := h.won; sh := h.shown;
  su[p_seat] := null; sn[p_seat] := null; st[p_seat] := 0; bi[p_seat] := 0; ac[p_seat] := false; mi[p_seat] := 0; wo[p_seat] := 0; sh[p_seat] := null;
  ct[p_seat] := ct[p_seat] + forfeit;
  if h.in_hand[p_seat] and h.street in ('preflop', 'flop', 'turn', 'river') then
    fo[p_seat] := true;                         -- out of the hand; their chips stay in the middle
  else
    ih[p_seat] := false; fo[p_seat] := false;
  end if;
  update public.holdem_tables set seat_user = su, seat_name = sn, stack = st, buy_in = bi, in_hand = ih, folded = fo, acted = ac,
    pot = pot + bt[p_seat] + forfeit, bet[p_seat] = 0, contrib = ct, missed = mi, won = wo, shown = sh, cashouts = cashouts + 1,
    turn = case when turn = p_seat then null else turn end, updated_at = now()
  where table_id = p_table;
end $$;

-- A seated player leaves their player seat mid-game: folded if they were still in the hand, then cashed
-- out, and the hand carries on from wherever it was.
create or replace function public.ht_leave_seat(p_table bigint, p_seat integer, p_outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; live boolean; was_turn boolean; t_now int;
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  if h.seat_user[p_seat] is null then return; end if;
  live := h.street in ('preflop', 'flop', 'turn', 'river') and h.in_hand[p_seat] and not h.folded[p_seat];
  was_turn := h.turn = p_seat; t_now := h.turn;
  perform public.ht_cashout(p_table, p_seat, p_outcome);
  if live then
    update public.holdem_tables set last_action = coalesce(h.seat_name[p_seat], 'Someone') || case when p_outcome = 'idle' then ' missed two turns in a row and is out: their chips stay in the pot' else ' folds and leaves the table' end
      where table_id = p_table;
    -- carry on: from their seat if it was their turn, otherwise leave the turn where it was
    perform public.ht_advance(p_table, case when was_turn or t_now is null then p_seat else ((t_now + 2) % 4) + 1 end);
  end if;
end $$;

-- The 30-second clock ran out (anyone seated may ask; the server checks its own clock): the slow player
-- checks if they can, otherwise folds. A second miss in a row and they are out: stack back to XP, off
-- the table.
create or replace function public.holdem_table_timeout(p_table bigint) returns public.holdem_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; h public.holdem_tables; i int; mi int[]; ac boolean[]; fo boolean[]; whom text; can_check boolean;
begin
  select * into t from public.game_tables where id = p_table for update;
  if not exists (select 1 from public.table_seats where table_id = p_table and user_id = auth.uid()) then raise exception 'You aren''t at this table.'; end if;
  select * into h from public.holdem_tables where table_id = p_table for update;
  if h.table_id is null or h.street not in ('preflop', 'flop', 'turn', 'river') or h.turn is null then return h; end if;
  if h.turn_started_at > now() - interval '29 seconds' then return h; end if;
  i := h.turn; whom := coalesce(h.seat_name[i], 'Someone');
  mi := h.missed; mi[i] := mi[i] + 1;
  if mi[i] >= 2 then
    update public.holdem_tables set missed = mi where table_id = p_table;
    perform public.table_drop(p_table, h.seat_user[i], 'idle');
  else
    can_check := h.bet[i] >= public.ht_maxbet(h);
    ac := h.acted; fo := h.folded; ac[i] := true;
    if not can_check then fo[i] := true; end if;
    update public.holdem_tables set missed = mi, acted = ac, folded = fo,
      last_action = whom || ' ran out of time and ' || case when can_check then 'checks' else 'folds' end || '. One more missed turn and they''re out, chips and all.',
      updated_at = now() where table_id = p_table;
    perform public.ht_advance(p_table, i);
  end if;
  select * into h from public.holdem_tables where table_id = p_table;
  return h;
end $$;
