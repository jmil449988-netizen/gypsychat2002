-- Rolled-back tests for game_helpers_lockdown.sql.
-- Run as:  begin;  <game_helpers_lockdown.sql>  <this file>  rollback;
-- Always ends by raising, so it cannot commit; results come back in the error text.
-- Plays AA.Romani.world against Steve miller. Both are given 200 XP first (rolled back with the
-- rest), and both are recorded as having earned 500 game XP today, so the OLD Hold'em code would
-- have trimmed any winnings to nothing -- which is what the XP totals below would show.

do $$
declare
  AA uuid; ST uuid; aa_name text; st_name text; o text := ''; f text; gid bigint; n int;
  helpers text[] := array[
    'game_apply($1, $2, 0)', 'game_award($1)', 'hd_credit($2, 1000)', 'hd_deal($1)', 'hd_finish($1, ''x'')', 'hd_next_street($1)',
    'hd_settle($1, $2, ''x'')', 'hd_showdown($1)', 'hd_touch($1)', 'hd_xp($2)', 'hm_apply($1, $2, ''e'')', 'hm_award($1)',
    'pr_showdown($1)', 'uno_award($1)', 'uno_draw_cards($1, $2, 3)', 'uno_sync($1)'];
  refused int := 0; allowed text := '';
  t_games public.games; t_hm public.hangman_games; t_uno public.uno_games; t_hd public.holdem_games; t_pr public.prasta_games;
  xp_before int; xp_after int;
begin
  select user_id, name into AA, aa_name from public.profiles where lower(name) = lower('AA.Romani.world') limit 1;
  select user_id, name into ST, st_name from public.profiles where lower(name) = lower('Steve miller') limit 1;
  if AA is null or ST is null then raise exception 'RESULT could not resolve the test users'; end if;
  insert into public.user_stats (user_id, game_points) values (AA, 200), (ST, 200)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + 200;
  insert into public.games (challenger_id, challenger_name, opponent_id, opponent_name, status, winner, result, challenger_points, opponent_points)
    values (AA, aa_name, ST, st_name, 'finished', AA, 'win', 500, 500);

  ------------------------------------------------------------------ 1. every helper refused to a browser
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach f in array helpers loop
    begin
      execute 'select public.' || f using 0::bigint, AA;
      allowed := allowed || f || ' ';
    exception when insufficient_privilege then refused := refused + 1;
    when others then allowed := allowed || f || ' (' || sqlerrm || ') ';
    end;
  end loop;
  o := o || format('1. helpers refused to a browser: %s of 16%s%s', refused, case when allowed <> '' then ' -- STILL CALLABLE: ' || allowed else '' end, chr(10));

  ------------------------------------------------------------------ 2. Tic-Tac-Toe through its own functions
  begin
    insert into public.games (challenger_id, challenger_name, opponent_id, opponent_name) values (AA, aa_name, ST, st_name) returning id into gid;
    perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
    t_games := public.game_respond(gid, true);
    reset role; update public.games set turn_started_at = now() - interval '40 seconds' where id = gid; set local role authenticated;
    t_games := public.game_timeout(gid);
    n := length(replace(t_games.board, '.', ''));
    t_games := public.game_resign(gid);
    o := o || format('2. Tic-Tac-Toe: accept, a timed-out move (game_apply) placed %s mark, resign paid out (game_award): status %s, winner AA %s%s', n, t_games.status, t_games.winner = AA, chr(10));
  exception when others then o := o || '2. TIC-TAC-TOE FAILED: ' || sqlerrm || chr(10);
  end;

  ------------------------------------------------------------------ 3. Hangman
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
    insert into public.hangman_games (challenger_id, challenger_name, opponent_id, opponent_name) values (AA, aa_name, ST, st_name) returning id into gid;
    perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
    t_hm := public.hangman_respond(gid, true);
    t_hm := public.hangman_guess(gid, 'e');
    perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
    t_hm := public.hangman_resign(gid);
    o := o || format('3. Hangman: accept, a guess (hm_apply) tried "%s", resign paid out (hm_award): status %s, Steve won %s%s', t_hm.guessed, t_hm.status, t_hm.winner = ST, chr(10));
  exception when others then o := o || '3. HANGMAN FAILED: ' || sqlerrm || chr(10);
  end;

  ------------------------------------------------------------------ 4. UNO
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
    insert into public.uno_games (challenger_id, challenger_name, opponent_id, opponent_name) values (AA, aa_name, ST, st_name) returning id into gid;
    perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
    t_uno := public.uno_respond(gid, true);
    n := t_uno.challenger_cards + t_uno.opponent_cards;
    reset role; update public.uno_games set turn_started_at = now() - interval '40 seconds' where id = gid; set local role authenticated;
    t_uno := public.uno_timeout(gid);
    o := o || format('4a. UNO: accept dealt %s cards (uno_draw_cards / uno_sync); after a timed-out turn %s cards%s', n, t_uno.challenger_cards + t_uno.opponent_cards, chr(10));
    t_uno := public.uno_resign(gid);
    o := o || format('4b. UNO: resign paid out (uno_award): status %s, AA won %s%s', t_uno.status, t_uno.winner = AA, chr(10));
  exception when others then o := o || '4. UNO FAILED: ' || sqlerrm || chr(10);
  end;

  ------------------------------------------------------------------ 5. Hold'em: a hand, cash out, and no cap
  begin
    reset role;
    select sum(reactions_received + game_points) into xp_before from public.user_stats where user_id in (AA, ST);
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
    t_hd := public.holdem_challenge(ST, 'low', 10);
    gid := t_hd.id;
    perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
    t_hd := public.holdem_respond(gid, true);
    perform set_config('request.jwt.claims', json_build_object('sub', t_hd.turn, 'role', 'authenticated')::text, true);
    t_hd := public.holdem_act(gid, 'fold', null);
    t_hd := public.holdem_leave(gid);
    reset role;
    select sum(reactions_received + game_points) into xp_after from public.user_stats where user_id in (AA, ST);
    o := o || format('5. Hold''em: deal (hd_deal), fold (hd_settle), cash out (hd_finish/hd_credit): status %s, nets %s / %s, XP before %s after %s -- conserved %s (the old cap would have deleted the winner''s chips here)%s',
      t_hd.status, t_hd.challenger_points, t_hd.opponent_points, xp_before, xp_after, xp_before = xp_after, chr(10));
  exception when others then o := o || '5. HOLD''EM FAILED: ' || sqlerrm || chr(10);
  end;

  ------------------------------------------------------------------ 6. Prasta
  begin
    reset role;
    select sum(reactions_received + game_points) into xp_before from public.user_stats where user_id in (AA, ST);
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
    t_pr := public.prasta_challenge(ST, 5);
    gid := t_pr.id;
    perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
    t_pr := public.prasta_respond(gid, true);
    for n in 1..2 loop
      exit when t_pr.status <> 'active' or t_pr.turn is null;
      perform set_config('request.jwt.claims', json_build_object('sub', t_pr.turn, 'role', 'authenticated')::text, true);
      t_pr := public.prasta_exchange(gid, '{}');
    end loop;
    reset role;
    select sum(reactions_received + game_points) into xp_after from public.user_stats where user_id in (AA, ST);
    o := o || format('6. Prasta: both stand pat, showdown (pr_showdown): status %s, XP conserved %s%s', t_pr.status, xp_before = xp_after, chr(10));
  exception when others then o := o || '6. PRASTA FAILED: ' || sqlerrm || chr(10);
  end;

  o := o || format('7. the daily cap no longer counts Hold''em: %s%s',
    position('holdem_games' in pg_get_functiondef('public.game_points_today(uuid)'::regprocedure)) = 0, chr(10));
  raise exception 'RESULT%', chr(10) || o;
end $$;
