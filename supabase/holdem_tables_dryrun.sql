-- Rolled-back tests for holdem_tables_feature.sql.
-- Run as:  begin;  <holdem_tables_feature.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident; the results come back in the
-- error text. Five throwaway people are created inside the transaction (and vanish with the rollback).
-- Known hands are set up by writing the cards and the button directly (as the owner), then played out
-- through the real functions. now() is frozen for the whole transaction, so the clocks are tested by
-- moving timestamps back. Throughout, XP is checked to be conserved: everyone's XP plus every stack and
-- every chip in the middle never changes.

create function pg_temp.ck(label text, ok boolean, info text default '') returns void language plpgsql as $f$
begin
  perform set_config('gr.log', coalesce(current_setting('gr.log', true), '')
    || case when coalesce(ok, false) then 'ok   ' else 'FAIL ' end || label
    || case when coalesce(info, '') <> '' then ' [' || info || ']' else '' end || chr(10), true);
  if not coalesce(ok, false) then
    perform set_config('gr.fails', (coalesce(nullif(current_setting('gr.fails', true), ''), '0')::int + 1)::text, true);
  end if;
end $f$;
-- (security definer, so the checks can see everything whoever the test is acting as)
create function pg_temp.xp(p uuid) returns int language sql security definer as $f$
  select coalesce((select reactions_received + game_points from public.user_stats where user_id = p), 0) $f$;
create function pg_temp.world(ps uuid[]) returns int language sql security definer as $f$
  select coalesce((select sum(reactions_received + game_points) from public.user_stats where user_id = any (ps)), 0)::int
       + coalesce((select sum(h.stack[1] + h.stack[2] + h.stack[3] + h.stack[4] + h.pot + h.bet[1] + h.bet[2] + h.bet[3] + h.bet[4]) from public.holdem_tables h), 0)::int $f$;
create function pg_temp.h(p_table bigint) returns public.holdem_tables language sql security definer as $f$
  select * from public.holdem_tables where table_id = p_table $f$;
create function pg_temp.res(p_table bigint, p_user uuid) returns text language sql security definer as $f$
  select outcome || ':' || points from public.table_results where table_id = p_table and user_id = p_user order by id desc limit 1 $f$;
-- play the current hand out properly: whoever is to act folds, until one player is left (as the owner)
create function pg_temp.fold_out(p_table bigint) returns void language plpgsql as $f$
declare h public.holdem_tables; k int := 0;
begin
  loop
    select * into h from public.holdem_tables where table_id = p_table;
    exit when h.street not in ('preflop', 'flop', 'turn', 'river') or h.turn is null or k > 8;
    perform set_config('request.jwt.claims', json_build_object('sub', h.seat_user[h.turn], 'role', 'authenticated')::text, true);
    perform public.holdem_table_act(p_table, 'fold');
    k := k + 1;
  end loop;
  update public.holdem_tables set hand_ended_at = now() - interval '6 seconds' where table_id = p_table and street = 'between';
end $f$;
-- Set up the next hand: stacks per seat, the button that the deal will move ON FROM, the hole cards per seat
-- ('' = not dealt) and the board. Called as the owner, before holdem_table_next / holdem_table_start deals.
create function pg_temp.rig(p_table bigint, p_stacks int[], p_prev_button int) returns void language plpgsql as $f$
begin
  update public.holdem_tables set stack = p_stacks, buy_in = p_stacks, button = p_prev_button, hand_no = greatest(hand_no, 1),
    street = 'between', hand_ended_at = now() - interval '10 seconds' where table_id = p_table;
end $f$;
-- after the deal: replace everyone's hole cards and the deck with known ones
create function pg_temp.cards(p_table bigint, p_holes text[], p_board text) returns void language plpgsql as $f$
declare h public.holdem_tables; i int;
begin
  select * into h from public.holdem_tables where table_id = p_table;
  for i in 1..4 loop
    if h.in_hand[i] and p_holes[i] <> '' then
      update public.holdem_table_hands set cards = array[left(p_holes[i], 2), right(p_holes[i], 2)] where table_id = p_table and user_id = h.seat_user[i];
    end if;
  end loop;
  update public.holdem_table_decks set deck = string_to_array(p_board, ',') where table_id = p_table;
end $f$;

do $$
declare
  P uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  tid bigint; t public.game_tables; h public.holdem_tables; w0 int; w1 int; x0 int; x1 int; n int; s text; i int;
  helpers text[] := array['ht_cashout($1, 1, ''cashout'')', 'ht_end_hand($1, ''x'')', 'ht_award_fold($1)', 'ht_showdown($1)', 'ht_advance($1, 1)',
                          'ht_deal($1)', 'ht_bust($1, 1)', 'ht_leave_seat($1, 1, ''left'')', 'ht_close($1)', 'ht_key(''{1,2}''::int[])'];
  f text; refused int := 0; allowed text := '';
begin
  perform set_config('gr.log', '', true); perform set_config('gr.fails', '0', true);
  for i in 1..5 loop
    insert into auth.users (id) values (P[i]);
    insert into public.profiles (user_id, name) values (P[i], 'zzHoldemTest' || i);
  end loop;
  insert into public.user_stats (user_id, game_points) values (P[1], 100), (P[2], 30), (P[3], 30), (P[4], 30), (P[5], 3);
  w0 := pg_temp.world(P);

  ------------------------------------------------------------------ opening and sitting down: the escrow
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  begin perform public.table_open('holdem'); perform pg_temp.ck('1 a Hold''em table needs stakes and a buy-in', false);
  exception when others then perform pg_temp.ck('1 a Hold''em table needs stakes and a buy-in', sqlerrm like '%stakes and your buy-in%', sqlerrm); end;
  begin perform public.holdem_table_open('low', 11); perform pg_temp.ck('2 buy-in above the range refused', false);
  exception when others then perform pg_temp.ck('2 buy-in above the range refused', sqlerrm like '%5 to 10%', sqlerrm); end;
  t := public.holdem_table_open('low', 10); tid := t.id;
  h := pg_temp.h(tid);
  perform pg_temp.ck('3 open: seat 1, 10 XP escrowed, blinds 1/2', t.game = 'holdem' and t.stakes = 'low' and h.seat_user[1] = P[1] and h.stack[1] = 10
    and pg_temp.xp(P[1]) = 90 and h.sb = 1 and h.bb = 2 and h.street = 'idle', format('xp %s stack %s', pg_temp.xp(P[1]), h.stack));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  begin perform public.table_sit(tid, 'player'); perform pg_temp.ck('4 a player seat needs a buy-in', false);
  exception when others then perform pg_temp.ck('4 a player seat needs a buy-in', sqlerrm like '%how much XP%', sqlerrm); end;
  perform public.holdem_table_sit(tid, 8);
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  perform public.holdem_table_sit(tid, 10);
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'spectator');
  perform set_config('request.jwt.claims', json_build_object('sub', P[5], 'role', 'authenticated')::text, true);
  begin perform public.holdem_table_sit(tid, 5); perform pg_temp.ck('5 can''t sit down with XP you don''t have', false);
  exception when others then perform pg_temp.ck('5 can''t sit down with XP you don''t have', sqlerrm like '%you have 3%', sqlerrm); end;
  h := pg_temp.h(tid);
  perform pg_temp.ck('6 seats and stacks', h.seat_user[2] = P[2] and h.seat_user[3] = P[3] and h.stack = '{10,8,10,0}' and pg_temp.xp(P[2]) = 22 and pg_temp.xp(P[3]) = 20
    and (select string_agg(role || seat, ' ' order by role, seat) from public.table_seats where table_id = tid) = 'player1 player2 player3 spectator1', format('stacks %s', h.stack));
  perform pg_temp.ck('7 XP conserved after sitting down', pg_temp.world(P) = w0, format('%s vs %s', pg_temp.world(P), w0));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  begin perform public.holdem_table_start(tid); perform pg_temp.ck('8 only the host deals', false);
  exception when others then perform pg_temp.ck('8 only the host deals', sqlerrm like '%Only the host%', sqlerrm); end;

  ------------------------------------------------------------------ hand 1: three players, known cards
  -- button to seat 1: small blind seat 2, big blind seat 3, the button acts first
  reset role;
  update public.holdem_tables set button = 3, hand_no = 1 where table_id = tid;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_start(tid);
  perform pg_temp.ck('9 deal: button 1, blinds from seats 2 and 3, seat 1 to act', h.street = 'preflop' and h.button = 1 and h.sb_seat = 2 and h.bb_seat = 3
    and h.bet = '{0,1,2,0}' and h.stack = '{10,7,8,0}' and h.turn = 1 and h.in_hand = '{t,t,t,f}', format('btn %s sb %s bb %s bet %s turn %s', h.button, h.sb_seat, h.bb_seat, h.bet, h.turn));
  select count(*) into n from public.holdem_table_hands where table_id = tid;
  perform pg_temp.ck('10 a player sees only their own two cards', n = 1, n || ' rows');
  begin perform count(*) from public.holdem_table_decks; perform pg_temp.ck('11 the deck is unreadable', false);
  exception when insufficient_privilege then perform pg_temp.ck('11 the deck is unreadable', true); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  select count(*) into n from public.holdem_table_hands where table_id = tid;
  perform pg_temp.ck('12 a watcher sees no cards', n = 0, n || ' rows');
  foreach f in array helpers loop
    begin execute 'select public.' || f using tid; allowed := allowed || f || ' ';
    exception when insufficient_privilege then refused := refused + 1;
    when others then allowed := allowed || f || ' (' || sqlerrm || ') ';
    end;
  end loop;
  perform pg_temp.ck('13 the internal helpers are refused to browsers', refused = array_length(helpers, 1), refused || ' of ' || array_length(helpers, 1) || ' ' || allowed);
  reset role;
  perform pg_temp.cards(tid, array['AhAd', 'KhKd', '2c7d', ''], 'As,Ks,3h,4c,9d');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  begin perform public.holdem_table_act(tid, 'call'); perform pg_temp.ck('14 out of turn refused', false);
  exception when others then perform pg_temp.ck('14 out of turn refused', sqlerrm like '%Not your turn%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  begin perform public.holdem_table_act(tid, 'raise', 3); perform pg_temp.ck('15 a raise under the minimum refused', false);
  exception when others then perform pg_temp.ck('15 a raise under the minimum refused', sqlerrm like '%minimum raise is to 4%', sqlerrm); end;
  h := public.holdem_table_act(tid, 'raise', 6);
  perform pg_temp.ck('16 raise to 6: small blind to act, minimum raise now 4', h.bet = '{6,1,2,0}' and h.turn = 2 and h.min_raise = 4, format('bet %s turn %s min %s', h.bet, h.turn, h.min_raise));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'fold');
  perform pg_temp.ck('17 bets into the pot, the flop comes, the small blind acts first', h.street = 'flop' and h.pot = 14 and h.bet = '{0,0,0,0}'
    and h.board = '{As,Ks,3h}' and h.turn = 2 and h.stack = '{4,2,8,0}', format('street %s pot %s board %s turn %s stack %s', h.street, h.pot, h.board, h.turn, h.stack));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'raise', 2);
  perform pg_temp.ck('18 a bet of the whole stack is all-in', h.stack[2] = 0 and h.bet[2] = 2 and h.last_action like '%all-in for 2', h.last_action);
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  begin perform public.holdem_table_act(tid, 'raise', 4); perform pg_temp.ck('19 no raising when nobody can answer', false);
  exception when others then perform pg_temp.ck('19 no raising when nobody can answer', sqlerrm like '%Nobody left%', sqlerrm); end;
  h := public.holdem_table_act(tid, 'call');
  perform pg_temp.ck('20 all-in and called: the board runs out, showdown, three aces beat three kings', h.street = 'between' and h.board = '{As,Ks,3h,4c,9d}'
    and h.stack = '{20,0,8,0}' and h.won = '{18,0,0,0}' and h.shown[1] = 'AhAd' and h.shown[2] = 'KhKd' and h.shown[3] is null and h.hand_result like '%three Aces%',
    format('stack %s won %s shown %s result %s', h.stack, h.won, h.shown, h.hand_result));
  perform pg_temp.ck('21 XP conserved through a hand', pg_temp.world(P) = w0, format('%s vs %s', pg_temp.world(P), w0));

  ------------------------------------------------------------------ bust, heads-up blinds, next hand
  h := public.holdem_table_next(tid);
  perform pg_temp.ck('22 no next hand before the result has shown for a few seconds', h.street = 'between', h.street);
  reset role;
  update public.holdem_tables set hand_ended_at = now() - interval '6 seconds' where table_id = tid;
  set local role authenticated;
  h := public.holdem_table_next(tid);
  perform pg_temp.ck('23 the busted player goes to the watchers; heads-up the button (seat 3) posts the small blind and acts first',
    h.seat_user[2] is null and (select role from public.table_seats where table_id = tid and user_id = P[2]) = 'spectator'
    and h.street = 'preflop' and h.button = 3 and h.sb_seat = 3 and h.bb_seat = 1 and h.turn = 3 and h.in_hand = '{t,f,t,f}',
    format('btn %s sb %s bb %s turn %s in %s', h.button, h.sb_seat, h.bb_seat, h.turn, h.in_hand));
  perform pg_temp.ck('24 the bust is written down: -8', pg_temp.res(tid, P[2]) = 'bust:-8', pg_temp.res(tid, P[2]));
  -- a new player sits down mid-hand: dealt in at the next one
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  perform public.holdem_table_sit(tid, 5);
  h := pg_temp.h(tid);
  perform pg_temp.ck('25 sitting down mid-hand: seat 2 again, not in this hand', h.seat_user[2] = P[2] and h.stack[2] = 5 and not h.in_hand[2] and pg_temp.xp(P[2]) = 17,
    format('in %s stack %s xp %s', h.in_hand, h.stack, pg_temp.xp(P[2])));
  -- the small blind folds: the big blind takes the blinds
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'fold');
  perform pg_temp.ck('26 everyone else folds: the last player takes the pot, no cards shown', h.street = 'between' and h.won[1] = 3 and h.shown[1] is null and h.stack = '{21,5,7,0}',
    format('won %s stack %s', h.won, h.stack));
  perform pg_temp.ck('27 XP conserved', pg_temp.world(P) = w0, format('%s vs %s', pg_temp.world(P), w0));

  ------------------------------------------------------------------ side pots: four players all-in for different amounts
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  perform public.holdem_table_sit(tid, 10);
  reset role;
  -- known stacks (the difference goes to/from the owner's side of the ledger, so re-base the world total)
  perform pg_temp.rig(tid, array[20, 5, 8, 12], 4);
  w0 := pg_temp.world(P);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_next(tid);
  perform pg_temp.ck('28 four players: button 1, blinds 2 and 3, seat 4 first', h.button = 1 and h.sb_seat = 2 and h.bb_seat = 3 and h.turn = 4 and h.in_hand = '{t,t,t,t}',
    format('btn %s sb %s bb %s turn %s', h.button, h.sb_seat, h.bb_seat, h.turn));
  reset role;
  -- seat 2 has the best hand, then 3, then 4, then 1
  perform pg_temp.cards(tid, array['4h5h', 'AsAc', 'KsKc', 'QsQc'], '2h,7d,9s,Jc,3d');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'raise', 12);                -- all-in 12
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'raise', 20);                -- all-in 20
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');                     -- all-in for 5 (had 4 after the small blind)
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');                     -- all-in for 8
  perform pg_temp.ck('29 side pots: main pot 20 to the aces, 9 to the kings, 8 to the queens, 8 uncalled back to seat 1',
    h.street = 'between' and h.stack = '{8,20,9,8}' and h.won = '{0,20,9,8}', format('stack %s won %s result %s', h.stack, h.won, h.hand_result));
  perform pg_temp.ck('30 XP conserved through side pots', pg_temp.world(P) = w0, format('%s vs %s', pg_temp.world(P), w0));

  ------------------------------------------------------------------ a split pot with an odd chip
  reset role;
  perform pg_temp.rig(tid, array[10, 10, 10, 0], 3);           -- button to seat 1 again; seat 4 has nothing
  update public.holdem_tables set stack[4] = 0 where table_id = tid;
  w0 := pg_temp.world(P);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_next(tid);
  perform pg_temp.ck('31 a player on 0 chips goes to the watchers at the next deal', h.seat_user[4] is null and h.in_hand = '{t,t,t,f}', format('in %s', h.in_hand));
  reset role;
  -- the board is a straight everyone plays (no flush possible): whoever is still in at the end splits
  perform pg_temp.cards(tid, array['2c3c', '4d4h', '5d5h'], 'Ts,Js,Qh,Kd,Ac');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'raise', 5);                 -- the button raises to 5
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');                     -- small blind calls
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');                     -- big blind calls
  perform pg_temp.ck('32 preflop done: flop dealt, pot 15, the small blind first', h.street = 'flop' and h.pot = 15 and h.turn = 2, format('street %s pot %s turn %s', h.street, h.pot, h.turn));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  begin perform public.holdem_table_act(tid, 'raise', 1); perform pg_temp.ck('32b a bet under the big blind refused', false);
  exception when others then perform pg_temp.ck('32b a bet under the big blind refused', sqlerrm like '%minimum raise is to 2%', sqlerrm); end;
  h := public.holdem_table_act(tid, 'call');                     -- checks
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');                     -- checks
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'raise', 2);                 -- bets 2
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'call');
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  h := public.holdem_table_act(tid, 'fold');
  -- check it down (seat 2, then the button)
  for i in 1..2 loop
    perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
    h := public.holdem_table_act(tid, 'call');
    perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
    h := public.holdem_table_act(tid, 'call');
  end loop;
  perform pg_temp.ck('33 split pot: 19 between two, the odd chip to the first after the button', h.street = 'between' and h.won = '{9,10,0,0}' and h.stack = '{12,13,5,0}',
    format('won %s stack %s result %s', h.won, h.stack, h.hand_result));
  perform pg_temp.ck('34 XP conserved through a split', pg_temp.world(P) = w0, format('%s vs %s', pg_temp.world(P), w0));

  ------------------------------------------------------------------ the clock, leaving mid-hand, closing
  reset role;
  update public.holdem_tables set hand_ended_at = now() - interval '6 seconds' where table_id = tid;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);   -- a watcher's browser asks
  h := public.holdem_table_next(tid);
  i := h.turn;
  reset role;
  update public.holdem_tables set turn_started_at = now() - interval '40 seconds' where table_id = tid;
  set local role authenticated;
  h := public.holdem_table_timeout(tid);
  perform pg_temp.ck('35 first miss: facing the big blind, they fold; warned', h.folded[i] and h.missed[i] = 1 and h.last_action like '%One more missed turn%', format('folded %s missed %s', h.folded, h.missed));
  -- finish that hand; next hand, make the same player time out twice
  reset role;
  perform pg_temp.fold_out(tid);
  set local role authenticated;
  h := public.holdem_table_next(tid);
  reset role;
  update public.holdem_tables set turn = i, turn_started_at = now() - interval '40 seconds' where table_id = tid;
  h := pg_temp.h(tid);
  x0 := pg_temp.xp(h.seat_user[i]); x1 := h.stack[i]; n := h.pot + h.bet[1] + h.bet[2] + h.bet[3] + h.bet[4] + x1; s := 'idle:' || (-h.buy_in[i])::text;
  set local role authenticated;
  f := h.seat_user[i];
  h := public.holdem_table_timeout(tid);
  perform pg_temp.ck('36 second miss in a row: out, off the table, the whole stack forfeited into the pot', h.seat_user[i] is null
    and not exists (select 1 from public.table_seats where table_id = tid and user_id = f::uuid) and pg_temp.xp(f::uuid) = x0
    and (h.street = 'between' or h.pot + h.bet[1] + h.bet[2] + h.bet[3] + h.bet[4] = n)
    and pg_temp.res(tid, f::uuid) = s, format('seat %s xp %s want %s pot %s want %s result %s', h.seat_user, pg_temp.xp(f::uuid), x0, h.pot, n, pg_temp.res(tid, f::uuid)));
  perform pg_temp.ck('37 XP conserved through the idle rule', pg_temp.world(P) = w0, format('%s vs %s', pg_temp.world(P), w0));
  -- whoever is left: a new hand, then someone leaves mid-hand, then the table closes mid-hand
  reset role;
  perform pg_temp.fold_out(tid);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  h := public.holdem_table_next(tid);
  if h.street = 'preflop' then
    i := h.turn; f := h.seat_user[i];
    x0 := pg_temp.xp(f::uuid) + h.stack[i];
    perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
    t := public.table_leave(tid);
    h := pg_temp.h(tid);
    perform pg_temp.ck('38 leaving mid-hand: folded, the rest of the stack back to XP, the hand goes on', pg_temp.xp(f::uuid) = x0 and h.seat_user[i] is null
      and pg_temp.world(P) = w0, format('xp %s want %s world %s want %s street %s', pg_temp.xp(f::uuid), x0, pg_temp.world(P), w0, h.street));
  else
    perform pg_temp.ck('38 (a hand to leave from)', false, h.street);
  end if;
  reset role;
  perform public.table_shut(tid);
  perform pg_temp.ck('39 closing the table cashes everyone out; nothing lost', pg_temp.world(P) = w0 and (select coalesce(sum(stack[1] + stack[2] + stack[3] + stack[4] + pot), 0) from public.holdem_tables where table_id = tid) = 0,
    format('world %s want %s', pg_temp.world(P), w0));
  perform pg_temp.ck('40 Hold''em never counts toward the daily cap', public.game_points_today(P[1]) = 0 and public.game_points_today(P[2]) = 0, format('%s %s', public.game_points_today(P[1]), public.game_points_today(P[2])));

  ------------------------------------------------------------------ a table that stops, and starts again by itself
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
    t := public.holdem_table_open('high', 20); tid := t.id;
    perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
    perform public.holdem_table_sit(tid, 10);
    perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
    h := public.holdem_table_start(tid);
    perform pg_temp.ck('41 high stakes: blinds 2/5', h.sb = 2 and h.bb = 5 and (h.bet[1] + h.bet[2]) = 7, format('bets %s', h.bet));
    perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
    begin t := public.table_sit(tid, 'spectator'); perform pg_temp.ck('42 moving to watching while in the hand refused', false);
    exception when others then perform pg_temp.ck('42 moving to watching while in the hand refused', sqlerrm like '%Fold or finish it first%', sqlerrm); end;
    -- whoever is to act folds; then watching is fine and cashes you out
    h := pg_temp.h(tid);
    perform set_config('request.jwt.claims', json_build_object('sub', h.seat_user[h.turn], 'role', 'authenticated')::text, true);
    h := public.holdem_table_act(tid, 'fold');
    reset role;
    update public.holdem_tables set hand_ended_at = now() - interval '6 seconds' where table_id = tid;
    set local role authenticated;
    x0 := pg_temp.xp(P[4]) + (pg_temp.h(tid)).stack[2];
    perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
    t := public.table_sit(tid, 'spectator');
    h := pg_temp.h(tid);
    perform pg_temp.ck('43 between hands: to the watchers, stack back to XP', h.seat_user[2] is null and pg_temp.xp(P[4]) = x0
      and (select role from public.table_seats where table_id = tid and user_id = P[4]) = 'spectator', format('seats %s xp %s want %s', h.seat_user, pg_temp.xp(P[4]), x0));
    perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
    h := public.holdem_table_next(tid);
    perform pg_temp.ck('44 one player with chips: the table waits', h.street = 'waiting' and (select status from public.game_tables where id = tid) = 'open', h.street);
    reset role;
    update public.user_stats set game_points = 30 where user_id = P[5];
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', P[5], 'role', 'authenticated')::text, true);
    perform public.holdem_table_sit(tid, 10);
    h := pg_temp.h(tid);
    perform pg_temp.ck('45 a second player sits down: the next hand is on its way by itself', h.street = 'between' and (select status from public.game_tables where id = tid) = 'playing', h.street);
    reset role;
    update public.holdem_tables set hand_ended_at = now() - interval '6 seconds' where table_id = tid;
    set local role authenticated;
    h := public.holdem_table_next(tid);
    perform pg_temp.ck('46 ...and it deals', h.street = 'preflop' and h.in_hand = '{t,t,f,f}', format('%s %s', h.street, h.in_hand));
  exception when others then
    perform pg_temp.ck('41-46 ran', false, sqlerrm);
  end;
  reset role;
  raise exception 'RESULT % checks, % failed%', (select count(*) from regexp_matches(current_setting('gr.log'), chr(10), 'g')),
    current_setting('gr.fails'), chr(10) || current_setting('gr.log');
end $$;
