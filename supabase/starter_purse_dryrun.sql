-- Rolled-back tests for starter_purse_feature.sql.
-- Run as:  begin;  <starter_purse_feature.sql>  <this file>  rollback;
-- Ends by raising, so it can never commit; the results come back in the error text. Needs
-- holdem_feature.sql, prasta_feature.sql and holdem_tables_feature.sql already in place.

create function pg_temp.ck(label text, ok boolean, info text default '') returns void language plpgsql as $f$
begin
  perform set_config('gr.log', coalesce(current_setting('gr.log', true), '')
    || case when coalesce(ok, false) then 'ok   ' else 'FAIL ' end || label
    || case when coalesce(info, '') <> '' then ' [' || info || ']' else '' end || chr(10), true);
  if not coalesce(ok, false) then
    perform set_config('gr.fails', (coalesce(nullif(current_setting('gr.fails', true), ''), '0')::int + 1)::text, true);
  end if;
end $f$;
create function pg_temp.row(p uuid) returns text language sql security definer as $f$
  select coalesce((select game_points || '/' || bonus || '/' || bonus_in_play || '/' || level from public.user_stats where user_id = p), 'none') $f$;
create function pg_temp.as_user(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true) $f$;
create function pg_temp.money(ps uuid[]) returns int language sql security definer as $f$
  select coalesce((select sum(reactions_received + game_points + bonus) from public.user_stats where user_id = any (ps)), 0)::int
       + coalesce((select sum(challenger_stack + opponent_stack + pot + challenger_bet + opponent_bet) from public.holdem_games where status in ('pending', 'active')), 0)::int
       + coalesce((select sum(stake * case status when 'pending' then 1 else 2 end) from public.prasta_games where status in ('pending', 'active')), 0)::int $f$;

do $t$
declare
  A uuid := gen_random_uuid(); B uuid := gen_random_uuid(); C uuid := gen_random_uuid();
  g public.holdem_games; pg public.prasta_games; m0 int; s public.user_stats%rowtype; msg text;
begin
  insert into auth.users (id) values (A), (B), (C);

  -- 1. the grant: creating a character hands over 100 purse chips, once
  insert into public.profiles (user_id, name) values (A, 'zzPurseTestA'), (B, 'zzPurseTestB');
  perform pg_temp.ck('1 new character gets a 100 purse and level 1', pg_temp.row(A) = '0/100/0/1', pg_temp.row(A));
  update public.profiles set name = 'zzPurseTestA2' where user_id = A;
  delete from public.profiles where user_id = A;
  insert into public.profiles (user_id, name) values (A, 'zzPurseTestA');
  perform pg_temp.ck('2 a renamed / re-created character is not paid twice', pg_temp.row(A) = '0/100/0/1', pg_temp.row(A));
  -- an old account with XP and no purse yet gets one when it picks a name
  insert into public.user_stats (user_id, game_points) values (C, 50);
  insert into public.profiles (user_id, name) values (C, 'zzPurseTestC');
  perform pg_temp.ck('3 an existing stats row is topped up, level untouched', pg_temp.row(C) = '50/100/0/5', pg_temp.row(C));

  -- 2. hd_xp counts the purse, xp / level do not
  perform pg_temp.ck('4 hd_xp = level XP + purse', public.hd_xp(C) = 150 and public.hd_xp(A) = 100, public.hd_xp(C)::text);
  select * into s from public.user_stats where user_id = C;
  perform pg_temp.ck('5 xp column excludes the purse', s.xp = 50, s.xp::text);

  -- 3. buying in: purse first, then real XP
  perform public.hd_credit(C, -120);
  perform pg_temp.ck('6 buy-in of 120 takes 100 from the purse and 20 real', pg_temp.row(C) = '30/0/100/4', pg_temp.row(C));
  perform public.hd_credit(C, 160);                     -- won 40
  perform pg_temp.ck('7 cash-out 160: purse refilled to 100, the 20 real + 40 won are level XP', pg_temp.row(C) = '90/100/0/6', pg_temp.row(C));
  perform public.hd_credit(C, -100);
  perform public.hd_credit(C, 60);                      -- lost 40
  perform pg_temp.ck('8 cash-out 60 after a 100 purse buy-in: 60 back in the purse, no level XP, 40 noted as lost', pg_temp.row(C) = '90/60/40/6', pg_temp.row(C));
  -- bust: no payout at all, then the next buy-in (seated nowhere) writes the loss off
  perform public.hd_credit(C, -60);
  perform pg_temp.ck('9 buy-in seated nowhere: the 40 lost is written off, 60 purse goes on the table', pg_temp.row(C) = '90/0/60/6', pg_temp.row(C));
  perform public.hd_credit(C, -30);
  perform pg_temp.ck('10 bust, then a buy-in from real XP writes the lost purse off', pg_temp.row(C) = '60/0/0/5', pg_temp.row(C));
  perform public.hd_credit(C, 90);                      -- won 60
  perform pg_temp.ck('11 winnings with an empty purse are all level XP', pg_temp.row(C) = '150/0/0/8', pg_temp.row(C));
  perform pg_temp.ck('12 the purse never exceeds the grant', (select bonus + bonus_in_play from public.user_stats where user_id = C) = 0);

  -- 4. through the real games: heads-up Hold'em between two fresh characters
  m0 := pg_temp.money(array[A, B, C]);
  insert into public.friends (owner_id, friend_id, friend_name) values (A, B, 'zzPurseTestB'), (B, A, 'zzPurseTestA');
  perform pg_temp.as_user(A);
  g := public.holdem_challenge(B, 'high', 50);
  perform pg_temp.ck('13 a fresh character can sit down on the purse', g.status = 'pending' and pg_temp.row(A) = '0/50/50/1', pg_temp.row(A));
  perform pg_temp.as_user(B);
  g := public.holdem_respond(g.id, false);
  perform pg_temp.ck('14 a declined challenge puts the purse back', pg_temp.row(A) = '0/100/0/1', pg_temp.row(A));
  perform pg_temp.as_user(A);
  g := public.holdem_challenge(B, 'high', 50);
  perform pg_temp.as_user(B);
  g := public.holdem_respond(g.id, true);
  perform pg_temp.ck('15 both purses on the table', g.status = 'active' and pg_temp.row(A) = '0/50/50/1' and pg_temp.row(B) = '0/50/50/1', pg_temp.row(A) || ' ' || pg_temp.row(B));
  perform pg_temp.ck('16 money conserved into the game', pg_temp.money(array[A, B, C]) = m0, pg_temp.money(array[A, B, C])::text || ' vs ' || m0);
  -- settle it by hand: A takes B's whole stack (as the owner, the way a finished game pays out)
  perform set_config('request.jwt.claims', '', true);
  update public.holdem_games set challenger_stack = 100, opponent_stack = 0, pot = 0, challenger_bet = 0, opponent_bet = 0 where id = g.id;
  perform public.hd_finish(g.id, 'bust');
  perform pg_temp.ck('17 winner: purse home, 50 XP towards level (level 5)', pg_temp.row(A) = '50/100/0/5', pg_temp.row(A));
  perform pg_temp.ck('18 loser: nothing back, level still 1', pg_temp.row(B) = '0/50/50/1', pg_temp.row(B));
  perform pg_temp.ck('19 money conserved out of the game', pg_temp.money(array[A, B, C]) = m0, pg_temp.money(array[A, B, C])::text || ' vs ' || m0);
  perform public.hd_credit(B, -50);  -- and the rest of the purse goes the same way at another table

  -- 5. a busted player cannot sit down again with nothing
  perform pg_temp.as_user(B);
  begin
    g := public.holdem_challenge(A, 'high', 10); msg := 'sat down';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.ck('20 no purse, no XP: cannot buy in', msg like '%do not have%', msg);

  -- 6. Prasta: a stake paid from a mixed purse / real balance, lost, then the write-off
  perform set_config('request.jwt.claims', '', true);
  update public.user_stats set game_points = 30 where user_id = B;          -- B earns 30 from reactions/games
  perform pg_temp.as_user(B);
  perform pg_temp.ck('21 stale purse-in-play stays until a buy-in', pg_temp.row(B) = '30/0/50/4', pg_temp.row(B));
  pg := public.prasta_challenge(A, 20);
  perform pg_temp.ck('22 stake from real XP writes off the lost purse first', pg_temp.row(B) = '10/0/0/2', pg_temp.row(B));
  perform pg_temp.as_user(A);
  pg := public.prasta_respond(pg.id, true);
  perform pg_temp.ck('23 A pays the stake from the purse', pg_temp.row(A) = '50/80/20/5', pg_temp.row(A));
  perform set_config('request.jwt.claims', '', true);
  perform public.hd_credit(A, 40);  -- A wins the pot (as prasta finish would pay: stake + winnings)
  perform pg_temp.ck('24 Prasta win: purse back to 100, 20 XP more towards level', pg_temp.row(A) = '70/100/0/5', pg_temp.row(A));

  -- 7. the seated-elsewhere test (a committed live game keeps a loss from being written off) cannot
  -- run inside a rolled-back transaction: rows made in this transaction have age(xmin) = 0 and are
  -- meant to be ignored (they are the game being created). Check that much here.
  update public.user_stats set bonus_in_play = 30 where user_id = A;          -- a leftover from a bust
  insert into public.holdem_games (challenger_id, opponent_id, status, stakes, sb, bb, buy_in, challenger_stack) values (A, C, 'active', 'low', 1, 2, 30, 30);
  perform pg_temp.ck('25 hd_seated_elsewhere ignores a game made in this transaction', not public.hd_seated_elsewhere(A));
  perform public.hd_credit(A, -10);
  perform pg_temp.ck('26 so the leftover is written off and the purse pays', pg_temp.row(A) = '70/90/10/5', pg_temp.row(A));

  raise exception E'\n%fails: %', current_setting('gr.log', true), coalesce(nullif(current_setting('gr.fails', true), ''), '0');
end $t$;
