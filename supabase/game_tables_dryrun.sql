-- Rolled-back tests for game_tables_feature.sql.
-- Run as:  begin;  <game_tables_feature.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident; the results come back
-- in the error text. Five throwaway people are created inside the transaction (and vanish with the
-- rollback), so no real account is touched. now() is frozen for the whole transaction, so the clocks
-- are tested by moving timestamps back rather than by waiting.

-- check(label, ok, info): appends a line to the log kept in a transaction-local setting.
create function pg_temp.ck(label text, ok boolean, info text default '') returns void language plpgsql as $f$
begin
  perform set_config('gr.log', coalesce(current_setting('gr.log', true), '')
    || case when coalesce(ok, false) then 'ok   ' else 'FAIL ' end || label
    || case when coalesce(info, '') <> '' then ' [' || info || ']' else '' end || chr(10), true);
  if not coalesce(ok, false) then
    perform set_config('gr.fails', (coalesce(nullif(current_setting('gr.fails', true), ''), '0')::int + 1)::text, true);
  end if;
end $f$;

-- Deal a known position (as the owner): one comma list of cards per player in deal order, the top
-- card and colour, whose turn, and the draw pile. Starts a fresh round number so results don't clash.
create function pg_temp.st(p_table bigint, p_hands text[], p_top text, p_color text, p_turn int, p_draw text) returns void language plpgsql as $f$
declare u public.uno_tables; i int; n int;
begin
  select * into u from public.uno_tables where table_id = p_table;
  n := array_length(u.players, 1);
  for i in 1..n loop
    update public.uno_table_hands set cards = case when p_hands[i] = '' then '{}'::text[] else string_to_array(p_hands[i], ',') end
      where table_id = p_table and user_id = u.players[i];
  end loop;
  update public.uno_table_decks set draw = case when p_draw = '' then '{}'::text[] else string_to_array(p_draw, ',') end, discard = array[p_top]
    where table_id = p_table;
  update public.uno_tables set status = 'playing', round = round + 1, top_card = p_top, color = p_color, turn = p_turn, direction = 1,
    phase = 'play', exposed = null, uno = array_fill(false, array[n]), missed = array_fill(0, array[n]), place = array_fill(0, array[n]),
    outcome = array_fill(''::text, array[n]), points = array_fill(0, array[n]), turn_started_at = now(), updated_at = now()
    where table_id = p_table;
  update public.game_tables set status = 'playing', round = round + 1 where id = p_table;
  perform public.ut_sync(p_table);
end $f$;

-- (security definer so the tests can look at any hand or result whoever they are acting as)
create function pg_temp.hand(p_table bigint, p_user uuid) returns text language sql security definer as $f$
  select array_to_string(cards, ',') from public.uno_table_hands where table_id = p_table and user_id = p_user $f$;

create function pg_temp.results(p_table bigint, p_round int) returns text language sql security definer as $f$
  select string_agg(place || ':' || outcome || ':' || points, ' ' order by place) from public.table_results
   where table_id = p_table and round = p_round $f$;

create function pg_temp.xp(p uuid) returns int language sql as $f$
  select coalesce((select game_points from public.user_stats where user_id = p), 0) $f$;

do $$
declare
  P uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  tid bigint; t2 bigint; t public.game_tables; u public.uno_tables; m public.table_messages; n int; i int; x0 int; x1 int; s text;
  helpers text[] := array['ut_draw($1, $2, 1)', 'ut_sync($1)', 'ut_record($1, 1, $2, 1, 2, ''out'')', 'ut_finish($1)', 'ut_remove($1, 1, ''left'')',
                          'table_shut($1)', 'table_drop($1, $2, ''left'')', 'tables_sweep()', 'ut_next(''{0,0}''::int[], 1, 1, 1)',
                          'ut_place_points(1)', 'ut_ordinal(1)'];
  f text; refused int := 0; allowed text := '';
begin
  perform set_config('gr.log', '', true); perform set_config('gr.fails', '0', true);
  for i in 1..5 loop
    insert into auth.users (id) values (P[i]);
    insert into public.profiles (user_id, name) values (P[i], 'zzTableTest' || i);
  end loop;
  insert into public.friends (owner_id, friend_id, friend_name) values (P[1], P[5], 'zzTableTest5'), (P[5], P[1], 'zzTableTest1');

  ------------------------------------------------------------------ tables and seats
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  t := public.table_open('uno'); tid := t.id;
  perform pg_temp.ck('1 open: host, open, seat 1', t.status = 'open' and t.host_id = P[1]
    and exists (select 1 from public.table_seats where table_id = tid and user_id = P[1] and role = 'player' and seat = 1));
  begin perform public.table_open('uno'); perform pg_temp.ck('2 second table refused', false);
  exception when others then perform pg_temp.ck('2 second table refused', sqlerrm like '%already at a table%', sqlerrm); end;
  begin perform public.table_open('holdem'); perform pg_temp.ck('3 holdem not yet', false);
  exception when others then perform pg_temp.ck('3 holdem not yet', sqlerrm like '%coming soon%' or sqlerrm like '%stakes and your buy-in%', sqlerrm); end;
  begin insert into public.game_tables (game, host_id) values ('uno', P[1]); perform pg_temp.ck('4 direct insert refused', false);
  exception when others then perform pg_temp.ck('4 direct insert refused', true, sqlerrm); end;

  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'player');
  begin perform public.table_start(tid); perform pg_temp.ck('5 only the host deals', false);
  exception when others then perform pg_temp.ck('5 only the host deals', sqlerrm like '%Only the host%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'player');
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'spectator');
  select string_agg(role || seat, ' ' order by role, seat) into s from public.table_seats where table_id = tid;
  perform pg_temp.ck('6 seats', s = 'player1 player2 player3 spectator1', s);

  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.table_start(tid);
  perform pg_temp.ck('7 deal: 3 players, 7 each, number on top, 86 left', u.round = 1 and array_length(u.players, 1) = 3 and u.cards = '{7,7,7}'
    and u.top_card ~ '^[RGBY][0-9]$' and u.draw_count = 86 and u.turn between 1 and 3 and u.status = 'playing'
    and (select status from public.game_tables where id = tid) = 'playing', format('round %s cards %s top %s left %s', u.round, u.cards, u.top_card, u.draw_count));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  select count(*) into n from public.uno_table_hands where table_id = tid;
  perform pg_temp.ck('8 a player sees only their own hand', n = 1, n || ' rows');
  begin perform count(*) from public.uno_table_decks; perform pg_temp.ck('9 deck unreadable', false);
  exception when insufficient_privilege then perform pg_temp.ck('9 deck unreadable', true); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  select count(*) into n from public.uno_table_hands where table_id = tid;
  perform pg_temp.ck('10 a spectator sees no hands', n = 0, n || ' rows');
  foreach f in array helpers loop
    begin
      execute 'select public.' || f using tid, P[4];
      allowed := allowed || f || ' ';
    exception when insufficient_privilege then refused := refused + 1;
    when others then allowed := allowed || f || ' (' || sqlerrm || ') ';
    end;
  end loop;
  perform pg_temp.ck('11 internal helpers refused to browsers', refused = array_length(helpers, 1), refused || ' of ' || array_length(helpers, 1) || ' ' || allowed);
  begin perform public.uno_table_draw(tid); perform pg_temp.ck('12 a spectator cannot play', false);
  exception when others then perform pg_temp.ck('12 a spectator cannot play', sqlerrm like '%aren''t in this round%', sqlerrm); end;
  begin perform public.table_sit(tid, 'player'); perform pg_temp.ck('13 no player seat mid-game', false);
  exception when others then perform pg_temp.ck('13 no player seat mid-game', sqlerrm like '%game is on%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  begin perform public.table_sit(tid, 'spectator'); perform pg_temp.ck('14 no ducking out to watch mid-round', false);
  exception when others then perform pg_temp.ck('14 no ducking out to watch mid-round', sqlerrm like '%middle of a round%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[5], 'role', 'authenticated')::text, true);
  begin perform public.uno_table_timeout(tid); perform pg_temp.ck('15 outsiders cannot run the clock', false);
  exception when others then perform pg_temp.ck('15 outsiders cannot run the clock', sqlerrm like '%aren''t at this table%', sqlerrm); end;

  ------------------------------------------------------------------ table chat
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  m := public.table_say(tid, '  hello table  ');
  perform pg_temp.ck('16 a spectator chats', m.body = 'hello table' and m.sender_name = 'zzTableTest4', m.body);
  perform set_config('request.jwt.claims', json_build_object('sub', P[5], 'role', 'authenticated')::text, true);
  begin perform public.table_say(tid, 'let me in'); perform pg_temp.ck('17 outsiders cannot chat', false);
  exception when others then perform pg_temp.ck('17 outsiders cannot chat', sqlerrm like '%Sit down%', sqlerrm); end;
  select count(*) into n from public.table_messages where table_id = tid;
  perform pg_temp.ck('18 outsiders cannot read the chat', n = 0, n || ' rows');
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  m := public.table_say(tid, repeat('x', 400));
  select count(*) into n from public.table_messages where table_id = tid;
  perform pg_temp.ck('19 players read it; long lines cut to 300', n = 2 and char_length(m.body) = 300, n || ' rows, ' || char_length(m.body));
  perform public.table_say(tid, 'a'); perform public.table_say(tid, 'b'); perform public.table_say(tid, 'c'); perform public.table_say(tid, 'd');
  begin perform public.table_say(tid, 'e'); perform pg_temp.ck('20 six lines in five seconds refused', false);
  exception when others then perform pg_temp.ck('20 six lines in five seconds refused', sqlerrm like '%Slow down%', sqlerrm); end;

  ------------------------------------------------------------------ UNO rules, three players (seat order P1, P2, P3)
  reset role;
  perform pg_temp.st(tid, array['R7,G7,B9', 'R3,BS,Y9,G1', 'RR,G+2,W4,Y2,B5'], 'R5', 'R', 1, 'R8,Y4,G2,G3,G4,G5,B1,B2');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  begin perform public.uno_table_play(tid, 'R3'); perform pg_temp.ck('21 out of turn refused', false);
  exception when others then perform pg_temp.ck('21 out of turn refused', sqlerrm like '%Not your turn%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  begin perform public.uno_table_play(tid, 'G7'); perform pg_temp.ck('22 a card that does not fit refused', false);
  exception when others then perform pg_temp.ck('22 a card that does not fit refused', sqlerrm like '%doesn''t fit%', sqlerrm); end;
  begin perform public.uno_table_play(tid, 'Y2'); perform pg_temp.ck('23 a card you do not hold refused', false);
  exception when others then perform pg_temp.ck('23 a card you do not hold refused', sqlerrm like '%don''t hold%', sqlerrm); end;
  u := public.uno_table_play(tid, 'R7');
  perform pg_temp.ck('24 R7 played, turn to P2', u.turn = 2 and u.top_card = 'R7' and u.cards = '{2,4,5}', format('turn %s cards %s', u.turn, u.cards));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R3');
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'RR');
  perform pg_temp.ck('25 Reverse with three: direction flips, back to P2', u.direction = -1 and u.turn = 2, format('dir %s turn %s', u.direction, u.turn));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.uno_table_draw(tid);
  perform pg_temp.ck('26 drew a card that fits: may play it', u.phase = 'after_draw' and u.turn = 2 and pg_temp.hand(tid, P[2]) like '%,R8', pg_temp.hand(tid, P[2]));
  begin perform public.uno_table_play(tid, 'BS'); perform pg_temp.ck('27 after drawing only that card', false);
  exception when others then perform pg_temp.ck('27 after drawing only that card', sqlerrm like '%only play the card you drew%', sqlerrm); end;
  u := public.uno_table_pass(tid);
  perform pg_temp.ck('28 pass: on to P1 (reversed)', u.turn = 1 and u.phase = 'play', format('turn %s', u.turn));
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.uno_table_draw(tid);
  perform pg_temp.ck('29 drew a card that does not fit: turn passes to P3', u.turn = 3 and u.phase = 'play' and pg_temp.hand(tid, P[1]) = 'G7,B9,Y4', pg_temp.hand(tid, P[1]));
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  begin perform public.uno_table_play(tid, 'W4'); perform pg_temp.ck('30 a wild needs a colour', false);
  exception when others then perform pg_temp.ck('30 a wild needs a colour', sqlerrm like '%Pick a colour%', sqlerrm); end;
  u := public.uno_table_play(tid, 'W4', 'G');
  perform pg_temp.ck('31 Wild Draw Four: P2 draws four and is skipped, green, P1 next', u.turn = 1 and u.color = 'G' and u.cards[2] = 8
    and pg_temp.hand(tid, P[2]) = 'BS,Y9,G1,R8,G2,G3,G4,G5', format('turn %s colour %s P2 %s', u.turn, u.color, pg_temp.hand(tid, P[2])));

  reset role;
  perform pg_temp.st(tid, array['RS,G1', 'R2,Y3', 'R4,B5'], 'R9', 'R', 1, 'G6,G7,G8');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'RS');
  perform pg_temp.ck('32 Skip: P2 skipped, P3 next', u.turn = 3, format('turn %s', u.turn));
  reset role;
  perform pg_temp.st(tid, array['R+2,G1', 'R2,Y3', 'R4,B5'], 'R9', 'R', 1, 'G6,G7,G8');
  set local role authenticated;
  u := public.uno_table_play(tid, 'R+2');
  perform pg_temp.ck('33 Draw Two: P2 draws two, P3 next', u.turn = 3 and u.cards = '{1,4,2}', format('turn %s cards %s', u.turn, u.cards));

  ------------------------------------------------------------------ UNO calls and catching
  reset role;
  perform pg_temp.st(tid, array['R7,G7', 'R3,B3,Y9', 'B1,B2,B4'], 'R5', 'R', 1, 'Y1,Y2,Y3,Y4,Y5,Y6');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R7');
  perform pg_temp.ck('34 one card, no UNO call: catchable', u.exposed = 1, format('exposed %s', u.exposed));
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  u := public.uno_table_catch(tid);
  perform pg_temp.ck('35 caught (by a player who is not next): draws two', u.cards[1] = 3 and u.exposed is null, format('cards %s', u.cards));
  begin perform public.uno_table_catch(tid); perform pg_temp.ck('36 nothing to catch twice', false);
  exception when others then perform pg_temp.ck('36 nothing to catch twice', sqlerrm like '%Nothing to catch%', sqlerrm); end;
  reset role;
  perform pg_temp.st(tid, array['R7,G7', 'R3,B3,Y9', 'B1,B2,B4'], 'R5', 'R', 1, 'Y1,Y2,Y3,Y4,Y5,Y6');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.uno_table_call(tid);
  u := public.uno_table_play(tid, 'R7');
  perform pg_temp.ck('37 UNO called with two on your turn: safe', u.uno[1] and u.exposed is null, format('uno %s exposed %s', u.uno, u.exposed));
  reset role;
  perform pg_temp.st(tid, array['R7,G7', 'R3,B3,Y9', 'B1,B2,B4'], 'R5', 'R', 1, 'Y1,Y2,Y3,Y4,Y5,Y6');
  set local role authenticated;
  u := public.uno_table_play(tid, 'R7');
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R3');
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  begin perform public.uno_table_catch(tid); perform pg_temp.ck('38 too late once the next move is made', false);
  exception when others then perform pg_temp.ck('38 too late once the next move is made', sqlerrm like '%Nothing to catch%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.uno_table_call(tid);
  perform pg_temp.ck('39 a late UNO call on one card is fine', u.uno[1], format('uno %s', u.uno));

  ------------------------------------------------------------------ playing out: places and XP, three players
  reset role;
  perform pg_temp.st(tid, array['R1', 'R2,G9', 'R3,B7,B8'], 'R5', 'R', 1, 'Y1,Y2,Y3,Y4,Y5,Y6');
  x0 := pg_temp.xp(P[1]);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R1');
  x1 := pg_temp.xp(P[1]);
  perform pg_temp.ck('40 P1 plays out first: 1st, +10 XP, P2 next', u.place[1] = 1 and u.outcome[1] = 'out' and u.points[1] = 10 and x1 - x0 = 10
    and u.turn = 2 and u.status = 'playing', format('place %s pts %s xp +%s turn %s', u.place, u.points, x1 - x0, u.turn));
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R2');
  perform pg_temp.ck('41 skips the player who is out: P3 next', u.turn = 3 and u.exposed = 2, format('turn %s exposed %s', u.turn, u.exposed));
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R3');
  perform pg_temp.ck('42 two left: the turn comes back to P2', u.turn = 2, format('turn %s', u.turn));
  reset role;
  update public.uno_table_decks set discard = discard || 'G3'::text where table_id = tid;
  update public.uno_tables set top_card = 'G3', color = 'G' where table_id = tid;
  x0 := pg_temp.xp(P[2]);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'G9');
  x1 := pg_temp.xp(P[2]);
  s := pg_temp.results(tid, u.round);
  perform pg_temp.ck('43 P2 out 2nd (+5); P3 is left holding cards: 3rd, nothing; round over', u.status = 'over' and u.turn is null
    and u.place = '{1,2,3}' and u.outcome = '{out,out,last}' and u.points = '{10,5,0}' and x1 - x0 = 5
    and (select status from public.game_tables where id = tid) = 'open' and s = '1:out:10 2:out:5 3:last:0', coalesce(s, 'no results') || format(' xp +%s', x1 - x0));

  ------------------------------------------------------------------ four players: 10 / 5 / 2 / 0
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'player');
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.table_start(tid);
  perform pg_temp.ck('44 four players dealt in', array_length(u.players, 1) = 4 and u.cards = '{7,7,7,7}' and u.draw_count = 79, format('%s players, %s left', array_length(u.players, 1), u.draw_count));
  reset role;
  perform pg_temp.st(tid, array['R1', 'R2', 'R3', 'B7,B8'], 'R5', 'R', 1, 'Y1,Y2');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  perform public.uno_table_play(tid, 'R1');
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  perform public.uno_table_play(tid, 'R2');
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R3');
  perform pg_temp.ck('45 four players: places 1 2 3 4 pay 10 5 2 0', u.status = 'over' and u.place = '{1,2,3,4}' and u.points = '{10,5,2,0}'
    and u.outcome = '{out,out,out,last}', format('place %s points %s', u.place, u.points));

  ------------------------------------------------------------------ the clock and the idle rule
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  u := public.table_start(tid);
  reset role;
  perform pg_temp.st(tid, array['R1,G1', 'R2,G2', 'R3,G3', 'B7,B8'], 'R5', 'R', 1, 'Y1,Y2,Y3,Y4,Y5,Y6');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.uno_table_timeout(tid);
  perform pg_temp.ck('46 the clock has not run out: nothing happens', u.turn = 1 and u.missed[1] = 0, format('turn %s missed %s', u.turn, u.missed));
  reset role;
  update public.uno_tables set turn_started_at = now() - interval '40 seconds' where table_id = tid;
  set local role authenticated;
  u := public.uno_table_timeout(tid);
  perform pg_temp.ck('47 first miss: draws a card, turn passes', u.turn = 2 and u.missed[1] = 1 and u.cards[1] = 3, format('turn %s missed %s cards %s', u.turn, u.missed, u.cards));
  u := public.uno_table_play(tid, 'R2');
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  u := public.uno_table_play(tid, 'R3');
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  u := public.uno_table_draw(tid);
  perform pg_temp.ck('48 round the table to P1 again', u.turn = 1, format('turn %s', u.turn));
  reset role;
  update public.uno_tables set turn_started_at = now() - interval '40 seconds' where table_id = tid;
  set local role authenticated;
  u := public.uno_table_timeout(tid);
  t := (select g from public.game_tables g where g.id = tid);
  perform pg_temp.ck('49 second miss in a row: P1 is out and off the table; host passes on', u.outcome[1] = 'idle' and u.place[1] = 4 and u.turn = 2
    and u.status = 'playing' and not exists (select 1 from public.table_seats where table_id = tid and user_id = P[1]) and t.host_id is not null
    and t.host_id <> P[1] and pg_temp.hand(tid, P[1]) = '', format('outcome %s place %s turn %s host P%s', u.outcome, u.place, u.turn, array_position(P, t.host_id)));

  ------------------------------------------------------------------ leaving
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  t := public.table_leave(tid);
  u := (select x from public.uno_tables x where x.table_id = tid);
  perform pg_temp.ck('50 P3 leaves mid-round: 3rd from the bottom, cards back in the pile', u.outcome[3] = 'left' and u.place[3] = 3 and u.status = 'playing'
    and pg_temp.hand(tid, P[3]) = '', format('outcome %s place %s', u.outcome, u.place));
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  t := public.table_leave(tid);
  u := (select x from public.uno_tables x where x.table_id = tid);
  perform pg_temp.ck('51 everyone else left: the last player gets no XP for it; round over', u.status = 'over' and u.outcome = '{idle,last,left,left}'
    and u.points = '{0,0,0,0}' and u.place = '{4,1,3,2}' and t.status = 'open', format('outcome %s place %s points %s', u.outcome, u.place, u.points));

  ------------------------------------------------------------------ housekeeping
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'spectator');
  reset role;
  update public.table_seats set seen_at = now() - interval '6 minutes' where table_id = tid and user_id = P[4];
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  perform public.table_heartbeat();
  perform pg_temp.ck('52 a seat not heard from for five minutes is freed', not exists (select 1 from public.table_seats where table_id = tid and user_id = P[4]));
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  perform public.table_sit(tid, 'player');
  perform set_config('request.jwt.claims', json_build_object('sub', P[2], 'role', 'authenticated')::text, true);
  u := public.table_start(tid);
  reset role;
  update public.table_seats set seen_at = now() - interval '6 minutes' where table_id = tid and user_id = P[3];
  set local role authenticated;
  perform public.table_heartbeat();
  perform pg_temp.ck('53 ...but not a player holding cards in a running round', exists (select 1 from public.table_seats where table_id = tid and user_id = P[3]));
  reset role;
  update public.uno_tables set updated_at = now() - interval '11 minutes' where table_id = tid;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[4], 'role', 'authenticated')::text, true);
  perform public.table_heartbeat();
  perform pg_temp.ck('54 a round nobody touched for ten minutes closes the table', (select status from public.game_tables where id = tid) = 'closed'
    and not exists (select 1 from public.table_seats where table_id = tid) and (select status from public.uno_tables where table_id = tid) = 'over');
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  begin perform public.table_open('uno'); perform pg_temp.ck('55 one new table a minute', false);
  exception when others then perform pg_temp.ck('55 one new table a minute', sqlerrm like '%Give it a minute%', sqlerrm); end;

  ------------------------------------------------------------------ invites
  perform set_config('request.jwt.claims', json_build_object('sub', P[5], 'role', 'authenticated')::text, true);
  t := public.table_open('uno'); t2 := t.id;
  perform public.table_invite(t2, P[1]);
  begin perform public.table_invite(t2, P[1]); perform pg_temp.ck('56 no re-invite within a minute', false);
  exception when others then perform pg_temp.ck('56 no re-invite within a minute', sqlerrm like '%just invited%', sqlerrm); end;
  begin perform public.table_invite(t2, P[2]); perform pg_temp.ck('57 friends only', false);
  exception when others then perform pg_temp.ck('57 friends only', sqlerrm like '%friends list%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  select count(*) into n from public.table_invites where table_id = t2 and user_id = P[1];
  perform pg_temp.ck('58 the invitee sees the invite', n = 1, n || ' rows');
  begin perform public.table_invite(t2, P[5]); perform pg_temp.ck('59 only the host invites', false);
  exception when others then perform pg_temp.ck('59 only the host invites', sqlerrm like '%Only the host%', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', P[3], 'role', 'authenticated')::text, true);
  select count(*) into n from public.table_invites;
  perform pg_temp.ck('60 nobody else sees it', n = 0, n || ' rows');
  perform set_config('request.jwt.claims', json_build_object('sub', P[1], 'role', 'authenticated')::text, true);
  perform public.table_sit(t2, 'player');
  select count(*) into n from public.table_invites where table_id = t2;
  perform pg_temp.ck('61 sitting down clears the invite', n = 0, n || ' rows');

  ------------------------------------------------------------------ the daily cap
  reset role;
  insert into public.games (challenger_id, challenger_name, opponent_id, opponent_name, status, winner, result, challenger_points, opponent_points)
    values (P[5], 'zzTableTest5', P[1], 'zzTableTest1', 'finished', P[5], 'win', 495, 0);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', P[5], 'role', 'authenticated')::text, true);
  u := public.table_start(t2);
  reset role;
  perform pg_temp.st(t2, array['R1', 'R2,G2'], 'R5', 'R', 1, 'Y1,Y2');
  x0 := pg_temp.xp(P[5]);
  set local role authenticated;
  u := public.uno_table_play(t2, 'R1');
  x1 := pg_temp.xp(P[5]);
  perform pg_temp.ck('62 at 495 today a first place pays only 5; cap total counts tables', u.points[1] = 5 and x1 - x0 = 5
    and public.game_points_today(P[5]) = 500 and u.status = 'over', format('points %s xp +%s today %s', u.points, x1 - x0, public.game_points_today(P[5])));

  reset role;
  raise exception 'RESULT % checks, % failed%', (select count(*) from regexp_matches(current_setting('gr.log'), chr(10), 'g')),
    current_setting('gr.fails'), chr(10) || current_setting('gr.log');
end $$;
