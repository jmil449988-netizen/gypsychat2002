-- Hold'em at the Game Room tables: no-limit, 2-4 players, betting real XP (Step 2) ------------------------
--
-- Build 170. Built on game_tables_feature.sql (seats, spectators, chat, invites, the sweep) and on the
-- heads-up game's pieces (holdem_feature.sql): the deck, the hand evaluator (hd_best / hd_score_name),
-- the stakes (hd_stakes) and the XP escrow (hd_xp / hd_credit). Decided with the user, 18 Sept 2026:
--   * Chips are XP and change hands as a PURE TRANSFER: no daily cap on Hold'em (table_results rows for
--     Hold'em carry game = 'holdem' and game_points_today only counts 'uno').
--   * Two missed turns in a row and you're out: your stack goes back to your XP and you leave the table.
--   * Spectators watch and chat only.
-- The same two stakes as the heads-up game, picked by whoever opens the table: LOW (blinds 1/2, sit down
-- with 5-10 XP) and HIGH (blinds 2/5, 10-50 XP). Your buy-in leaves your XP when you take a player seat
-- (an escrow) and your whole stack comes back when you give it up -- leaving, moving to watching, two
-- missed turns, a quiet device, or the table closing -- so wins and losses really move your level.
--
-- Rules: no-limit Texas Hold'em. The button moves one funded seat round each hand; the next two seats
-- post the blinds (heads-up the button posts the small blind and acts first before the flop). Actions:
-- fold, call (a check when there is nothing to call), raise-to (at least the last raise; all-in for less
-- is allowed). An uncalled bet goes back at the end of the betting round; with players all-in for
-- different amounts the pot splits into a main pot and side pots, each won by the best hand among the
-- players who covered it, split evenly on a tie with odd chips going round from the button. When at
-- most one player can still bet, the board is run out. The host deals the first hand; after that hands
-- come by themselves (anyone seated asks for the next one once the result has shown for a few seconds)
-- while two players have chips, and resume by themselves when a second player sits back down. A player
-- can sit down in the middle of a hand and is dealt in at the next one. Going bust moves you to the
-- watchers (or off the table, if that row is full): sit down again with a fresh buy-in to play on.
--
-- State (who may see what, as for UNO):
--   holdem_tables       the table's public state, one row per table, laid out by seat (arrays of four:
--                       index = player seat 1-4): who sits there, stacks, bets this street, total put in
--                       this hand, folded, cards shown at the showdown, what each won. Readable by all.
--   holdem_table_hands  each player's two hole cards. RLS: only the owner can read their row.
--   holdem_table_decks  the deck. No policies: functions only.
--   table_results       every cash-out, with the net result (outcome 'cashout', 'bust', 'idle' or 'left').
-- XP never leaves the system: at any moment, everyone's XP + every stack + every pot is constant.
--
-- Run once in the Supabase SQL Editor, after game_tables_feature.sql. Practice run first:
--   begin;  <this file>  <holdem_tables_dryrun.sql>  rollback;

alter table public.game_tables add column if not exists stakes text;
alter table public.game_tables drop constraint if exists game_tables_stakes_check;
alter table public.game_tables add constraint game_tables_stakes_check check (stakes is null or stakes in ('low', 'high'));

alter table public.table_results drop constraint if exists table_results_outcome_check;
alter table public.table_results add constraint table_results_outcome_check check (outcome in ('out', 'last', 'left', 'idle', 'cashout', 'bust'));

create table if not exists public.holdem_tables (
  table_id        bigint      primary key references public.game_tables(id) on delete cascade,
  stakes          text        not null check (stakes in ('low', 'high')),
  sb              integer     not null,
  bb              integer     not null,
  min_buy         integer     not null,
  max_buy         integer     not null,
  street          text        not null default 'idle' check (street in ('idle', 'waiting', 'preflop', 'flop', 'turn', 'river', 'between')),
  hand_no         integer     not null default 0,
  seat_user       uuid[]      not null default array[null, null, null, null]::uuid[],
  seat_name       text[]      not null default array[null, null, null, null]::text[],
  stack           integer[]   not null default '{0,0,0,0}',
  buy_in          integer[]   not null default '{0,0,0,0}',    -- what the player in the seat brought
  in_hand         boolean[]   not null default '{f,f,f,f}',     -- dealt into the current hand
  folded          boolean[]   not null default '{f,f,f,f}',
  acted           boolean[]   not null default '{f,f,f,f}',     -- acted since the last full raise
  bet             integer[]   not null default '{0,0,0,0}',     -- this street
  contrib         integer[]   not null default '{0,0,0,0}',     -- this hand, all streets (side pots)
  contrib_user    uuid[]      not null default array[null, null, null, null]::uuid[],  -- whose chips those are
  missed          integer[]   not null default '{0,0,0,0}',
  won             integer[]   not null default '{0,0,0,0}',     -- last hand
  shown           text[]      not null default array[null, null, null, null]::text[],  -- 'AhKd' at a showdown
  button          integer,
  sb_seat         integer,
  bb_seat         integer,
  turn            integer,
  min_raise       integer     not null default 0,
  board           text[]      not null default '{}',
  pot             integer     not null default 0,               -- chips from finished streets
  cashouts        integer     not null default 0,
  last_action     text,
  hand_result     text,
  turn_started_at timestamptz not null default now(),
  hand_ended_at   timestamptz,
  updated_at      timestamptz not null default now()
);

create table if not exists public.holdem_table_hands (
  table_id   bigint      not null references public.game_tables(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  hand_no    integer     not null,
  cards      text[]      not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

create table if not exists public.holdem_table_decks (
  table_id bigint primary key references public.game_tables(id) on delete cascade,
  deck     text[] not null default '{}'
);

alter table public.holdem_tables      enable row level security;
alter table public.holdem_table_hands enable row level security;
alter table public.holdem_table_decks enable row level security;   -- no policies: functions only
drop policy if exists "see the holdem tables" on public.holdem_tables;
create policy "see the holdem tables" on public.holdem_tables for select to authenticated using (true);
drop policy if exists "my holdem table hand" on public.holdem_table_hands;
create policy "my holdem table hand" on public.holdem_table_hands for select to authenticated using (user_id = auth.uid());
revoke all on public.holdem_tables, public.holdem_table_hands, public.holdem_table_decks from anon, authenticated;
grant select on public.holdem_tables, public.holdem_table_hands to authenticated;

do $$
declare t text;
begin
  foreach t in array array['holdem_tables', 'holdem_table_hands'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Pure helpers over one table's state ---------------------------------------------------------------------
create or replace function public.ht_seat_ok(h public.holdem_tables, i integer, p_mode text) returns boolean
language sql immutable set search_path = public as $$
  select case p_mode
    when 'funded' then h.seat_user[i] is not null and h.stack[i] > 0
    when 'live'   then h.in_hand[i] and not h.folded[i]
    when 'actor'  then h.in_hand[i] and not h.folded[i] and h.stack[i] > 0
    else false end $$;
create or replace function public.ht_count(h public.holdem_tables, p_mode text) returns integer
language sql immutable set search_path = public as $$
  select count(*)::int from generate_series(1, 4) i where public.ht_seat_ok(h, i, p_mode) $$;
-- the next seat after p_from (round the table, p_from itself last) that fits p_mode
create or replace function public.ht_next(h public.holdem_tables, p_from integer, p_mode text) returns integer
language plpgsql immutable set search_path = public as $$
declare i int := coalesce(p_from, 0); k int;
begin
  for k in 1..4 loop
    i := i % 4 + 1;
    if public.ht_seat_ok(h, i, p_mode) then return i; end if;
  end loop;
  return null;
end $$;
create or replace function public.ht_maxbet(h public.holdem_tables) returns integer
language sql immutable set search_path = public as $$
  select coalesce(max(h.bet[i]), 0) from generate_series(1, 4) i where h.in_hand[i] and not h.folded[i] $$;
-- the next player after p_from who still has to act on this street
create or replace function public.ht_next_to_act(h public.holdem_tables, p_from integer) returns integer
language plpgsql immutable set search_path = public as $$
declare m int := public.ht_maxbet(h); i int := coalesce(p_from, 0); k int;
begin
  for k in 1..4 loop
    i := i % 4 + 1;
    if public.ht_seat_ok(h, i, 'actor') and (not h.acted[i] or h.bet[i] < m) then return i; end if;
  end loop;
  return null;
end $$;
-- Is the betting round over? Everyone who can still bet has acted and matched the biggest bet -- or at
-- most one player can still bet and they aren't facing one.
create or replace function public.ht_round_done(h public.holdem_tables) returns boolean
language plpgsql immutable set search_path = public as $$
declare m int := public.ht_maxbet(h); i int; actors int := 0; pending int := 0; lone int;
begin
  for i in 1..4 loop
    if public.ht_seat_ok(h, i, 'actor') then
      actors := actors + 1; lone := i;
      if not h.acted[i] or h.bet[i] < m then pending := pending + 1; end if;
    end if;
  end loop;
  if actors = 0 then return true; end if;
  if actors = 1 then return h.bet[lone] >= m; end if;
  return pending = 0;
end $$;
-- a hand's score as text that sorts the same way as the int[] (two digits per element)
create or replace function public.ht_key(s integer[]) returns text
language sql immutable set search_path = public as $$
  select string_agg(lpad(x::text, 2, '0'), '' order by o) from unnest(s) with ordinality u(x, o) $$;

-- Internal: chips and seats --------------------------------------------------------------------------------
-- A player gives up their seat: their stack goes back to their XP and the result is written down.
-- Anything they put in this hand stays in the pot. The seat's live-hand flags are cleared, so the hand
-- carries on without them (callers fold them first, if they were still in it).
create or replace function public.ht_cashout(p_table bigint, p_seat integer, p_outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; u uuid; amt int; net int; n int;
  su uuid[]; sn text[]; st int[]; bi int[]; ih boolean[]; fo boolean[]; ac boolean[]; bt int[]; mi int[]; wo int[]; sh text[];
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  u := h.seat_user[p_seat];
  if u is null then return; end if;
  amt := h.stack[p_seat]; net := amt - h.buy_in[p_seat];
  n := public.ht_count(h, 'funded');
  if amt > 0 then perform public.hd_credit(u, amt); end if;
  insert into public.table_results (table_id, round, game, user_id, place, players, outcome, points)
    values (p_table, h.cashouts + 1, 'holdem', u, 0, greatest(n, 1), p_outcome, net);
  su := h.seat_user; sn := h.seat_name; st := h.stack; bi := h.buy_in; ih := h.in_hand; fo := h.folded; ac := h.acted;
  bt := h.bet; mi := h.missed; wo := h.won; sh := h.shown;
  su[p_seat] := null; sn[p_seat] := null; st[p_seat] := 0; bi[p_seat] := 0; ac[p_seat] := false; mi[p_seat] := 0; wo[p_seat] := 0; sh[p_seat] := null;
  if h.in_hand[p_seat] and h.street in ('preflop', 'flop', 'turn', 'river') then
    fo[p_seat] := true;                         -- out of the hand; their chips stay in the middle
  else
    ih[p_seat] := false; fo[p_seat] := false;
  end if;
  update public.holdem_tables set seat_user = su, seat_name = sn, stack = st, buy_in = bi, in_hand = ih, folded = fo, acted = ac,
    pot = pot + bt[p_seat], bet[p_seat] = 0, missed = mi, won = wo, shown = sh, cashouts = cashouts + 1,
    turn = case when turn = p_seat then null else turn end, updated_at = now()
  where table_id = p_table;
end $$;

-- End of a hand: show the result; the next deal is asked for by the players' browsers.
create or replace function public.ht_end_hand(p_table bigint, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.holdem_tables set street = 'between', turn = null, pot = 0, bet = '{0,0,0,0}', hand_result = p_text, last_action = p_text,
    hand_ended_at = now(), turn_started_at = now(), updated_at = now()
  where table_id = p_table;
end $$;

-- Everyone else folded: the last player standing takes everything in the middle.
create or replace function public.ht_award_fold(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; w int; total int; st int[]; wo int[];
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  w := public.ht_next(h, 0, 'live');
  total := h.pot + h.bet[1] + h.bet[2] + h.bet[3] + h.bet[4];
  st := h.stack; wo := array[0, 0, 0, 0];
  st[w] := st[w] + total; wo[w] := total;
  update public.holdem_tables set stack = st, won = wo where table_id = p_table;
  perform public.ht_end_hand(p_table, coalesce(h.seat_name[w], 'Someone') || ' takes ' || total || ' XP');
end $$;

-- Showdown: every player still in shows; the main pot and any side pots each go to the best hand among
-- the players who covered them (split on a tie, odd chips round from the button).
create or replace function public.ht_showdown(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; i int; k int; lv int; prev int := 0; amt int; carry int := 0; best text; nwin int; share int; odd int;
  hole text[]; keys text[] := array[null, null, null, null]; names text[] := array[null, null, null, null];
  levels int[]; st int[]; wo int[] := array[0, 0, 0, 0]; sh text[] := array[null, null, null, null]; txt text := ''; s int[];
  last_winners int[] := '{}'; winners int[];
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  st := h.stack;
  for i in 1..4 loop
    if public.ht_seat_ok(h, i, 'live') then
      select cards into hole from public.holdem_table_hands where table_id = p_table and user_id = h.contrib_user[i];
      s := public.hd_best(hole || h.board);
      keys[i] := public.ht_key(s); names[i] := public.hd_score_name(s); sh[i] := array_to_string(hole, '');
    end if;
  end loop;
  select array_agg(distinct c order by c) into levels from unnest(h.contrib) c where c > 0;
  foreach lv in array coalesce(levels, '{}') loop
    amt := carry;
    for i in 1..4 loop amt := amt + least(h.contrib[i], lv) - least(h.contrib[i], prev); end loop;
    prev := lv;
    best := null;
    for i in 1..4 loop
      if keys[i] is not null and h.contrib[i] >= lv and (best is null or keys[i] > best) then best := keys[i]; end if;
    end loop;
    if best is null then
      -- nobody still in the hand covered this much: it belongs with the pot below it
      if array_length(last_winners, 1) > 0 then
        winners := last_winners;
      else carry := amt; continue;
      end if;
    else
      winners := '{}';
      -- winners in order round the table from the button, so odd chips go to the first of them
      for k in 1..4 loop
        i := (coalesce(h.button, 0) + k - 1) % 4 + 1;
        if keys[i] = best and h.contrib[i] >= lv then winners := winners || i; end if;
      end loop;
    end if;
    carry := 0;
    nwin := array_length(winners, 1); share := amt / nwin; odd := amt - share * nwin;
    for k in 1..nwin loop
      i := winners[k];
      st[i] := st[i] + share + case when k <= odd then 1 else 0 end;
      wo[i] := wo[i] + share + case when k <= odd then 1 else 0 end;
    end loop;
    last_winners := winners;
  end loop;
  for k in 1..4 loop
    i := (coalesce(h.button, 0) + k - 1) % 4 + 1;
    if wo[i] > 0 then txt := txt || case when txt = '' then '' else ' · ' end || coalesce(h.seat_name[i], 'Someone') || ' wins ' || wo[i] || ' XP with ' || names[i]; end if;
  end loop;
  update public.holdem_tables set stack = st, won = wo, shown = sh where table_id = p_table;
  perform public.ht_end_hand(p_table, txt);
end $$;

-- After every action: the next player to act, or the end of the betting round (an uncalled bet goes
-- back, the bets go into the pot, the next street is dealt), running the board out when nobody is left
-- to bet against, down to the showdown -- or the last player standing wins.
create or replace function public.ht_advance(p_table bigint, p_from integer) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; d text[]; i int; m int; m2 int; top int; ntop int; give int; nxt int; guard int := 0; st int[]; bt int[]; ct int[];
begin
  loop
    guard := guard + 1;
    exit when guard > 6;
    select * into h from public.holdem_tables where table_id = p_table for update;
    if h.street not in ('preflop', 'flop', 'turn', 'river') then return; end if;
    if public.ht_count(h, 'live') <= 1 then perform public.ht_award_fold(p_table); return; end if;
    if not public.ht_round_done(h) then
      nxt := public.ht_next_to_act(h, p_from);
      update public.holdem_tables set turn = nxt, turn_started_at = case when turn is distinct from nxt then now() else turn_started_at end,
        updated_at = now() where table_id = p_table;
      return;
    end if;
    -- the round is over. An uncalled bet goes back to whoever made it.
    m := public.ht_maxbet(h); m2 := 0; ntop := 0; top := null;
    for i in 1..4 loop
      if public.ht_seat_ok(h, i, 'live') then
        if h.bet[i] = m then ntop := ntop + 1; top := i; elsif h.bet[i] > m2 then m2 := h.bet[i]; end if;
      end if;
    end loop;
    st := h.stack; bt := h.bet; ct := h.contrib;
    if ntop = 1 and m > m2 then
      give := m - m2;
      st[top] := st[top] + give; bt[top] := bt[top] - give; ct[top] := ct[top] - give;
    end if;
    update public.holdem_tables set stack = st, contrib = ct, pot = pot + bt[1] + bt[2] + bt[3] + bt[4], bet = '{0,0,0,0}',
      acted = '{f,f,f,f}', min_raise = bb, turn = null, updated_at = now()
    where table_id = p_table;
    if h.street = 'river' then perform public.ht_showdown(p_table); return; end if;
    select deck into d from public.holdem_table_decks where table_id = p_table for update;
    if h.street = 'preflop' then
      update public.holdem_tables set street = 'flop', board = d[1:3] where table_id = p_table;
      update public.holdem_table_decks set deck = d[4:] where table_id = p_table;
    elsif h.street = 'flop' then
      update public.holdem_tables set street = 'turn', board = board || d[1] where table_id = p_table;
      update public.holdem_table_decks set deck = d[2:] where table_id = p_table;
    else
      update public.holdem_tables set street = 'river', board = board || d[1] where table_id = p_table;
      update public.holdem_table_decks set deck = d[2:] where table_id = p_table;
    end if;
    select * into h from public.holdem_tables where table_id = p_table;
    if public.ht_count(h, 'actor') <= 1 then continue; end if;       -- nobody to bet against: run it out
    nxt := public.ht_next_to_act(h, h.button);
    update public.holdem_tables set turn = nxt, turn_started_at = now(), updated_at = now() where table_id = p_table;
    return;
  end loop;
end $$;

-- Deal a hand to every seat with chips. The button moves to the next of them (a random one for the first
-- hand); the next two post the blinds -- heads-up, the button posts the small blind.
create or replace function public.ht_deal(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; d text[]; n int; i int; k int; c int := 0; btn int; s_sb int; s_bb int; post int;
  ih boolean[] := '{f,f,f,f}'; st int[]; bt int[] := '{0,0,0,0}'; cu uuid[] := array[null, null, null, null]::uuid[];
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  n := public.ht_count(h, 'funded');
  if n < 2 then raise exception 'You need two players with chips to deal.'; end if;
  for i in 1..4 loop
    ih[i] := h.seat_user[i] is not null and h.stack[i] > 0;
    if ih[i] then cu[i] := h.seat_user[i]; end if;
  end loop;
  if h.button is null or h.hand_no = 0 then
    select s into btn from generate_series(1, 4) s where ih[s] order by random() limit 1;
  else
    btn := h.button;
    for k in 1..4 loop btn := btn % 4 + 1; exit when ih[btn]; end loop;
  end if;
  h.in_hand := ih; h.folded := '{f,f,f,f}';
  if n = 2 then s_sb := btn; else s_sb := public.ht_next(h, btn, 'live'); end if;
  s_bb := public.ht_next(h, s_sb, 'live');
  d := public.hd_new_deck();
  delete from public.holdem_table_hands where table_id = p_table and not (user_id = any (array_remove(cu, null)));
  for k in 1..4 loop
    i := (btn + k - 1) % 4 + 1;            -- cards go round from the seat after the button
    if ih[i] then
      insert into public.holdem_table_hands (table_id, user_id, hand_no, cards) values (p_table, cu[i], h.hand_no + 1, d[2 * c + 1 : 2 * c + 2])
        on conflict (table_id, user_id) do update set hand_no = excluded.hand_no, cards = excluded.cards, updated_at = now();
      c := c + 1;
    end if;
  end loop;
  insert into public.holdem_table_decks (table_id, deck) values (p_table, d[2 * c + 1 :])
    on conflict (table_id) do update set deck = excluded.deck;
  st := h.stack;
  post := least(h.sb, st[s_sb]); st[s_sb] := st[s_sb] - post; bt[s_sb] := post;
  post := least(h.bb, st[s_bb]); st[s_bb] := st[s_bb] - post; bt[s_bb] := post;
  update public.holdem_tables set hand_no = h.hand_no + 1, street = 'preflop', button = btn, sb_seat = s_sb, bb_seat = s_bb,
    in_hand = ih, folded = '{f,f,f,f}', acted = '{f,f,f,f}', stack = st, bet = bt, contrib = bt, contrib_user = cu,
    won = '{0,0,0,0}', shown = array[null, null, null, null]::text[], board = '{}', pot = 0, min_raise = bb, turn = null,
    hand_result = null, hand_ended_at = null,
    last_action = 'Hand ' || (h.hand_no + 1) || ': ' || coalesce(h.seat_name[btn], 'Someone') || ' has the button', turn_started_at = now(), updated_at = now()
  where table_id = p_table;
  update public.game_tables set status = 'playing', round = h.hand_no + 1, updated_at = now() where id = p_table;
  perform public.ht_advance(p_table, s_bb);            -- first to act: the seat after the big blind
end $$;

-- A player on 0 chips after a hand moves to the watchers (or off the table, when that row is full).
create or replace function public.ht_bust(p_table bigint, p_seat integer) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; u uuid; free int;
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  u := h.seat_user[p_seat];
  if u is null or h.stack[p_seat] > 0 then return; end if;
  perform public.ht_cashout(p_table, p_seat, 'bust');
  select min(g) into free from generate_series(1, 4) g
    where not exists (select 1 from public.table_seats x where x.table_id = p_table and x.role = 'spectator' and x.seat = g);
  if free is not null then
    update public.table_seats set role = 'spectator', seat = free where table_id = p_table and user_id = u;
  else
    perform public.table_drop(p_table, u, 'left');
  end if;
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
    update public.holdem_tables set last_action = coalesce(h.seat_name[p_seat], 'Someone') || case when p_outcome = 'idle' then ' missed two turns in a row and is out' else ' folds and leaves the table' end
      where table_id = p_table;
    -- carry on: from their seat if it was their turn, otherwise leave the turn where it was
    perform public.ht_advance(p_table, case when was_turn or t_now is null then p_seat else ((t_now + 2) % 4) + 1 end);
  end if;
end $$;

-- Close the table's game: a hand in play is called off (everyone gets back what they put in), then every
-- player seat is cashed out.
create or replace function public.ht_close(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h public.holdem_tables; i int; st int[];
begin
  select * into h from public.holdem_tables where table_id = p_table for update;
  if h.table_id is null then return; end if;
  if h.street in ('preflop', 'flop', 'turn', 'river') then
    st := h.stack;
    for i in 1..4 loop
      if h.contrib[i] > 0 then
        if h.seat_user[i] is not null and h.seat_user[i] = h.contrib_user[i] then st[i] := st[i] + h.contrib[i];
        elsif h.contrib_user[i] is not null then perform public.hd_credit(h.contrib_user[i], h.contrib[i]); end if;
      end if;
    end loop;
    update public.holdem_tables set stack = st, contrib = '{0,0,0,0}', bet = '{0,0,0,0}', pot = 0, in_hand = '{f,f,f,f}', folded = '{f,f,f,f}' where table_id = p_table;
  end if;
  for i in 1..4 loop
    perform public.ht_cashout(p_table, i, 'cashout');
  end loop;
  update public.holdem_tables set street = 'idle', turn = null, last_action = 'The table closed.', updated_at = now() where table_id = p_table;
end $$;

-- The table functions from game_tables_feature.sql, now Hold'em-aware -------------------------------------
create or replace function public.table_shut(p_table bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.game_tables where id = p_table for update;
  perform public.ht_close(p_table);
  update public.uno_tables set status = 'over', turn = null, exposed = null, last_action = 'The table closed.', updated_at = now()
    where table_id = p_table and status = 'playing';
  delete from public.table_seats where table_id = p_table;
  delete from public.table_invites where table_id = p_table;
  update public.game_tables set status = 'closed', updated_at = now() where id = p_table;
end $$;

create or replace function public.table_drop(p_table bigint, p_user uuid, p_why text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; s public.table_seats; u public.uno_tables; h public.holdem_tables; i int; nh uuid; nn text;
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
  elsif t.game = 'holdem' and s.role = 'player' then
    select * into h from public.holdem_tables where table_id = p_table for update;
    if h.seat_user[s.seat] = p_user then
      perform public.ht_leave_seat(p_table, s.seat, case when p_why = 'idle' then 'idle' else 'left' end);
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
declare r record; x record; u public.uno_tables; h public.holdem_tables;
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
                        and v.updated_at < now() - interval '10 minutes')
            or exists (select 1 from public.holdem_tables v where v.table_id = t.id and v.street in ('preflop', 'flop', 'turn', 'river', 'between')
                        and v.updated_at < now() - interval '10 minutes'))
     order by t.id
  loop
    perform 1 from public.game_tables where id = r.id for update;
    u := null; h := null;
    select * into u from public.uno_tables where table_id = r.id;
    select * into h from public.holdem_tables where table_id = r.id;
    -- a game nobody has touched for ten minutes: everyone has gone, so nobody is running the clock
    if (u.status = 'playing' and u.updated_at < now() - interval '10 minutes')
       or (h.street in ('preflop', 'flop', 'turn', 'river', 'between') and h.updated_at < now() - interval '10 minutes') then
      perform public.table_shut(r.id);
      continue;
    end if;
    -- seats not heard from for five minutes, except players still in a running round or hand
    -- (the turn clock deals with those: two missed turns and they're out)
    for x in
      select s.user_id from public.table_seats s
       where s.table_id = r.id and s.seen_at < now() - interval '5 minutes' and s.user_id is distinct from auth.uid()
         and not coalesce(s.role = 'player' and u.status = 'playing' and u.place[array_position(u.players, s.user_id)] = 0, false)
         and not coalesce(s.role = 'player' and h.street in ('preflop', 'flop', 'turn', 'river') and h.seat_user[s.seat] = s.user_id
                          and h.in_hand[s.seat] and not h.folded[s.seat], false)
       order by s.user_id
    loop
      perform public.table_drop(r.id, x.user_id, 'stale');
    end loop;
  end loop;
  delete from public.table_invites where created_at < now() - interval '1 hour';
  delete from public.game_tables where status = 'closed' and updated_at < now() - interval '1 day';
end $$;

create or replace function public.table_open(p_game text) returns public.game_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; nm text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_game = 'holdem' then raise exception 'Pick the stakes and your buy-in first.'; end if;
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
declare t public.game_tables; s public.table_seats; u public.uno_tables; h public.holdem_tables; nm text; free int; i int;
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
    if t.game = 'holdem' then raise exception 'Choose how much XP to sit down with.'; end if;
    if t.status = 'playing' then raise exception 'A game is on. Watch for now, and take a free seat when it ends.'; end if;
    select min(g) into free from generate_series(1, 4) g
      where not exists (select 1 from public.table_seats x where x.table_id = p_table and x.role = 'player' and x.seat = g);
    if free is null then raise exception 'All four player seats are taken.'; end if;
  else
    if s.table_id = p_table and t.game = 'uno' and t.status = 'playing' then
      select * into u from public.uno_tables where table_id = p_table;
      i := array_position(u.players, auth.uid());
      if u.status = 'playing' and i is not null and u.place[i] = 0 then
        raise exception 'You''re in the middle of a round. Finish it, or leave the table.';
      end if;
    end if;
    if s.table_id = p_table and t.game = 'holdem' and s.role = 'player' then
      select * into h from public.holdem_tables where table_id = p_table for update;
      if h.street in ('preflop', 'flop', 'turn', 'river') and h.seat_user[s.seat] = auth.uid() and h.in_hand[s.seat] and not h.folded[s.seat] then
        raise exception 'You''re in this hand. Fold or finish it first.';
      end if;
    end if;
    select min(g) into free from generate_series(1, 4) g
      where not exists (select 1 from public.table_seats x where x.table_id = p_table and x.role = 'spectator' and x.seat = g);
    if free is null then raise exception 'All four spectator seats are taken.'; end if;
    if s.table_id = p_table and t.game = 'holdem' and s.role = 'player' then
      perform public.ht_leave_seat(p_table, s.seat, 'cashout');          -- your stack goes back to your XP
    end if;
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

-- The verbs: Hold'em ----------------------------------------------------------------------------------------
create or replace function public.holdem_table_open(p_stakes text, p_buy_in integer) returns public.game_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; nm text; st record; su uuid[] := array[null, null, null, null]::uuid[]; sn text[] := array[null, null, null, null]::text[];
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'You can''t open a table right now.'; end if;
  if p_stakes is null or p_stakes not in ('low', 'high') then raise exception 'Pick low or high stakes.'; end if;
  select * into st from public.hd_stakes(p_stakes);
  if p_buy_in is null or p_buy_in < st.min_buy or p_buy_in > st.max_buy then raise exception 'Sit down with % to % XP at this table.', st.min_buy, st.max_buy; end if;
  perform public.tables_sweep();
  if exists (select 1 from public.table_seats where user_id = auth.uid()) then raise exception 'You''re already at a table. Leave it first.'; end if;
  if exists (select 1 from public.game_tables where opened_by = auth.uid() and created_at > now() - interval '1 minute') then
    raise exception 'You just opened a table. Give it a minute.';
  end if;
  if public.hd_xp(auth.uid()) < p_buy_in then raise exception 'You don''t have % XP to put on the table (you have %).', p_buy_in, public.hd_xp(auth.uid()); end if;
  select name into nm from public.profiles where user_id = auth.uid();
  insert into public.game_tables (game, stakes, opened_by, host_id, host_name) values ('holdem', p_stakes, auth.uid(), auth.uid(), nm) returning * into t;
  insert into public.table_seats (table_id, user_id, name, role, seat) values (t.id, auth.uid(), nm, 'player', 1);
  su[1] := auth.uid(); sn[1] := nm;
  insert into public.holdem_tables (table_id, stakes, sb, bb, min_buy, max_buy, seat_user, seat_name, stack, buy_in, min_raise, last_action)
    values (t.id, p_stakes, st.sb, st.bb, st.min_buy, st.max_buy, su, sn, array[p_buy_in, 0, 0, 0], array[p_buy_in, 0, 0, 0], st.bb,
            coalesce(nm, 'Someone') || ' sat down with ' || p_buy_in || ' XP');
  perform public.hd_credit(auth.uid(), -p_buy_in);                       -- the escrow
  return t;
exception when unique_violation then
  raise exception 'You''re already at a table. Leave it first.';
end $$;

-- Take a player seat with a buy-in (from watching, or straight from the list). Allowed mid-hand: you're
-- dealt in at the next one.
create or replace function public.holdem_table_sit(p_table bigint, p_buy_in integer) returns public.game_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; s public.table_seats; h public.holdem_tables; nm text; free int; su uuid[]; sn text[]; st int[]; bi int[]; mi int[];
begin
  if auth.uid() is null or public.is_banned(auth.uid()) then raise exception 'You can''t join tables right now.'; end if;
  perform public.tables_sweep();
  select * into t from public.game_tables where id = p_table for update;
  if t.id is null or t.status = 'closed' then raise exception 'That table has closed.'; end if;
  if t.game <> 'holdem' then raise exception 'That isn''t a Hold''em table.'; end if;
  select * into h from public.holdem_tables where table_id = p_table for update;
  select * into s from public.table_seats where user_id = auth.uid();
  if s.table_id is not null and s.table_id <> p_table then raise exception 'You''re at another table. Leave it first.'; end if;
  if s.table_id = p_table and s.role = 'player' then raise exception 'You''re already playing at this table.'; end if;
  if p_buy_in is null or p_buy_in < h.min_buy or p_buy_in > h.max_buy then raise exception 'Sit down with % to % XP at this table.', h.min_buy, h.max_buy; end if;
  if public.hd_xp(auth.uid()) < p_buy_in then raise exception 'You don''t have % XP to put on the table (you have %).', p_buy_in, public.hd_xp(auth.uid()); end if;
  select min(g) into free from generate_series(1, 4) g
    where not exists (select 1 from public.table_seats x where x.table_id = p_table and x.role = 'player' and x.seat = g)
      and h.seat_user[g] is null;
  if free is null then raise exception 'All four player seats are taken.'; end if;
  select name into nm from public.profiles where user_id = auth.uid();
  if s.table_id = p_table then
    update public.table_seats set role = 'player', seat = free, name = nm, seen_at = now() where table_id = p_table and user_id = auth.uid();
  else
    insert into public.table_seats (table_id, user_id, name, role, seat) values (p_table, auth.uid(), nm, 'player', free);
  end if;
  su := h.seat_user; sn := h.seat_name; st := h.stack; bi := h.buy_in; mi := h.missed;
  su[free] := auth.uid(); sn[free] := nm; st[free] := p_buy_in; bi[free] := p_buy_in; mi[free] := 0;
  update public.holdem_tables set seat_user = su, seat_name = sn, stack = st, buy_in = bi, missed = mi,
    last_action = coalesce(nm, 'Someone') || ' sat down with ' || p_buy_in || ' XP', updated_at = now()
  where table_id = p_table;
  perform public.hd_credit(auth.uid(), -p_buy_in);                       -- the escrow
  delete from public.table_invites where table_id = p_table and user_id = auth.uid();
  -- a game that stopped for want of players picks up again by itself
  select * into h from public.holdem_tables where table_id = p_table;
  if h.street = 'waiting' and public.ht_count(h, 'funded') >= 2 then
    update public.holdem_tables set street = 'between', hand_ended_at = now() - interval '3 seconds', hand_result = null where table_id = p_table;
    update public.game_tables set status = 'playing' where id = p_table;
  end if;
  update public.game_tables set updated_at = now() where id = p_table returning * into t;
  return t;
exception when unique_violation then
  raise exception 'You''re already at a table. Leave it first.';
end $$;

-- The host deals the first hand (and again after the table stopped for want of players, if they like).
create or replace function public.holdem_table_start(p_table bigint) returns public.holdem_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; h public.holdem_tables; i int;
begin
  select * into t from public.game_tables where id = p_table for update;
  if t.id is null or t.status = 'closed' then raise exception 'That table has closed.'; end if;
  if t.game <> 'holdem' then raise exception 'That isn''t a Hold''em table.'; end if;
  if t.host_id is distinct from auth.uid() then raise exception 'Only the host can deal.'; end if;
  select * into h from public.holdem_tables where table_id = p_table for update;
  if h.street not in ('idle', 'waiting', 'between') then raise exception 'A hand is already being played.'; end if;
  for i in 1..4 loop
    if h.seat_user[i] is not null and h.stack[i] = 0 then perform public.ht_bust(p_table, i); end if;
  end loop;
  select * into h from public.holdem_tables where table_id = p_table;
  if public.ht_count(h, 'funded') < 2 then raise exception 'You need at least two players with chips to deal.'; end if;
  perform public.ht_deal(p_table);
  select * into h from public.holdem_tables where table_id = p_table;
  return h;
end $$;

-- fold | call (a check when there is nothing to call) | raise (p_amount = what you raise TO on this
-- street; everything you have is all-in)
create or replace function public.holdem_table_act(p_table bigint, p_action text, p_amount integer default null) returns public.holdem_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; h public.holdem_tables; me int; m int; to_call int; put int; target int; raise_by int; whom text;
  st int[]; bt int[]; ct int[]; ac boolean[]; fo boolean[]; mi int[]; i int; full_raise boolean;
begin
  select * into t from public.game_tables where id = p_table for update;
  select * into h from public.holdem_tables where table_id = p_table for update;
  if t.id is null or h.table_id is null or h.street not in ('preflop', 'flop', 'turn', 'river') then raise exception 'No hand is being played right now.'; end if;
  me := array_position(h.seat_user, auth.uid());
  if me is null or not h.in_hand[me] or h.folded[me] then raise exception 'You aren''t in this hand.'; end if;
  if h.turn is distinct from me then raise exception 'Not your turn.'; end if;
  m := public.ht_maxbet(h); to_call := greatest(0, m - h.bet[me]); whom := coalesce(h.seat_name[me], 'Someone');
  st := h.stack; bt := h.bet; ct := h.contrib; ac := h.acted; fo := h.folded; mi := h.missed;
  mi[me] := 0;
  if p_action = 'fold' then
    fo[me] := true; ac[me] := true;
    update public.holdem_tables set folded = fo, acted = ac, missed = mi, last_action = whom || ' folds', updated_at = now() where table_id = p_table;
  elsif p_action = 'call' then
    put := least(to_call, st[me]);
    st[me] := st[me] - put; bt[me] := bt[me] + put; ct[me] := ct[me] + put; ac[me] := true;
    update public.holdem_tables set stack = st, bet = bt, contrib = ct, acted = ac, missed = mi,
      last_action = whom || case when to_call = 0 then ' checks' when put < to_call or st[me] = 0 then ' calls all-in for ' || put else ' calls ' || put end,
      updated_at = now() where table_id = p_table;
  elsif p_action = 'raise' then
    if p_amount is null then raise exception 'How much?'; end if;
    target := least(p_amount, h.bet[me] + h.stack[me]);                   -- past your stack is all-in
    if target <= m then raise exception 'A raise has to be more than %.', m; end if;
    raise_by := target - m;
    full_raise := raise_by >= h.min_raise;
    if not full_raise and target < h.bet[me] + h.stack[me] then raise exception 'The minimum raise is to %.', m + h.min_raise; end if;
    -- a raise needs someone who can still answer it
    if (select count(*) from generate_series(1, 4) g where g <> me and public.ht_seat_ok(h, g, 'actor')) = 0 then
      raise exception 'Nobody left can call a raise. Call or fold.';
    end if;
    put := target - h.bet[me];
    st[me] := st[me] - put; bt[me] := target; ct[me] := ct[me] + put;
    for i in 1..4 loop if i <> me then ac[i] := false; end if; end loop;   -- everyone gets to answer it
    ac[me] := true;
    update public.holdem_tables set stack = st, bet = bt, contrib = ct, acted = ac, missed = mi,
      min_raise = case when full_raise then raise_by else min_raise end,
      last_action = whom || case when st[me] = 0 then ' goes all-in for ' || target when m = 0 then ' bets ' || target else ' raises to ' || target end,
      updated_at = now() where table_id = p_table;
  else
    raise exception 'Unknown action.';
  end if;
  perform public.ht_advance(p_table, me);
  select * into h from public.holdem_tables where table_id = p_table;
  return h;
end $$;

-- Between hands: deal the next one once the result has been up a few seconds (anyone seated may ask;
-- the browsers do it by themselves). Players on 0 chips go to the watchers first; with fewer than two
-- players left with chips the table waits.
create or replace function public.holdem_table_next(p_table bigint) returns public.holdem_tables
language plpgsql security definer set search_path = public as $$
declare t public.game_tables; h public.holdem_tables; i int;
begin
  select * into t from public.game_tables where id = p_table for update;
  if not exists (select 1 from public.table_seats where table_id = p_table and user_id = auth.uid()) then raise exception 'You aren''t at this table.'; end if;
  select * into h from public.holdem_tables where table_id = p_table for update;
  if h.table_id is null or t.status = 'closed' then return h; end if;
  if not (h.street = 'between' and h.hand_ended_at <= now() - interval '4 seconds') and h.street <> 'waiting' then return h; end if;
  for i in 1..4 loop
    if h.seat_user[i] is not null and h.stack[i] = 0 then perform public.ht_bust(p_table, i); end if;
  end loop;
  select * into h from public.holdem_tables where table_id = p_table;
  if public.ht_count(h, 'funded') >= 2 then
    perform public.ht_deal(p_table);
  elsif h.street <> 'waiting' then
    update public.holdem_tables set street = 'waiting', turn = null, updated_at = now(),
      last_action = 'Waiting for another player with chips.' where table_id = p_table;
    update public.game_tables set status = 'open', updated_at = now() where id = p_table;
  end if;
  select * into h from public.holdem_tables where table_id = p_table;
  return h;
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
      last_action = whom || ' ran out of time and ' || case when can_check then 'checks' else 'folds' end || '. One more missed turn and they''re out.',
      updated_at = now() where table_id = p_table;
    perform public.ht_advance(p_table, i);
  end if;
  select * into h from public.holdem_tables where table_id = p_table;
  return h;
end $$;

-- Privileges -----------------------------------------------------------------------------------------------
revoke execute on function
  public.ht_seat_ok(public.holdem_tables, integer, text), public.ht_count(public.holdem_tables, text), public.ht_next(public.holdem_tables, integer, text),
  public.ht_maxbet(public.holdem_tables), public.ht_next_to_act(public.holdem_tables, integer), public.ht_round_done(public.holdem_tables), public.ht_key(integer[]),
  public.ht_cashout(bigint, integer, text), public.ht_end_hand(bigint, text), public.ht_award_fold(bigint), public.ht_showdown(bigint),
  public.ht_advance(bigint, integer), public.ht_deal(bigint), public.ht_bust(bigint, integer), public.ht_leave_seat(bigint, integer, text), public.ht_close(bigint),
  public.table_shut(bigint), public.table_drop(bigint, uuid, text), public.tables_sweep(),
  public.table_open(text), public.table_sit(bigint, text),
  public.holdem_table_open(text, integer), public.holdem_table_sit(bigint, integer), public.holdem_table_start(bigint),
  public.holdem_table_act(bigint, text, integer), public.holdem_table_next(bigint), public.holdem_table_timeout(bigint)
  from public, anon, authenticated;
grant execute on function
  public.table_open(text), public.table_sit(bigint, text),
  public.holdem_table_open(text, integer), public.holdem_table_sit(bigint, integer), public.holdem_table_start(bigint),
  public.holdem_table_act(bigint, text, integer), public.holdem_table_next(bigint), public.holdem_table_timeout(bigint)
  to authenticated, service_role;
grant execute on function
  public.ht_seat_ok(public.holdem_tables, integer, text), public.ht_count(public.holdem_tables, text), public.ht_next(public.holdem_tables, integer, text),
  public.ht_maxbet(public.holdem_tables), public.ht_next_to_act(public.holdem_tables, integer), public.ht_round_done(public.holdem_tables), public.ht_key(integer[]),
  public.ht_cashout(bigint, integer, text), public.ht_end_hand(bigint, text), public.ht_award_fold(bigint), public.ht_showdown(bigint),
  public.ht_advance(bigint, integer), public.ht_deal(bigint), public.ht_bust(bigint, integer), public.ht_leave_seat(bigint, integer, text), public.ht_close(bigint),
  public.table_shut(bigint), public.table_drop(bigint, uuid, text), public.tables_sweep()
  to service_role;
