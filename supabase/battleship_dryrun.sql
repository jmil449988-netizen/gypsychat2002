-- Rolled-back tests for battleship_feature.sql.
-- Run as:  begin;  <battleship_feature.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident; the results come back
-- in the error text. now() is frozen for the whole transaction, so the clocks are tested by moving
-- turn_started_at back rather than by waiting.
-- Plays as the user's own two test characters, AA.Romani.world and Steve miller.

do $$
declare
  AA uuid; ST uuid; aa_name text; st_name text;
  gid bigint; g public.battleship_games; lay_aa text; lay_st text; custom text; bad text;
  n int; k int; w1 int; w2 int; o text := ''; xa0 int; xs0 int; xa1 int; xs1 int; before_shots int; after_shots int;
begin
  select user_id, name into AA, aa_name from public.profiles where lower(name) = lower('AA.Romani.world') limit 1;
  select user_id, name into ST, st_name from public.profiles where lower(name) = lower('Steve miller') limit 1;
  if AA is null or ST is null then raise exception 'RESULT could not resolve the test users (AA=% ST=%)', AA, ST; end if;
  xa0 := coalesce((select game_points from public.user_stats where user_id = AA), 0);
  xs0 := coalesce((select game_points from public.user_stats where user_id = ST), 0);

  ------------------------------------------------------------------ game 1: a full battle
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.battleship_games (challenger_id, challenger_name, opponent_id, opponent_name)
    values (AA, aa_name, ST, st_name) returning id into gid;
  o := o || '1. AA challenges Steve through the insert policy: ok' || chr(10);
  begin
    perform public.battleship_respond(gid, true);
    o := o || '2a. THE CHALLENGER ANSWERED HIS OWN CHALLENGE' || chr(10);
  exception when others then o := o || '2a. challenger cannot accept his own challenge: ok' || chr(10);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
  g := public.battleship_respond(gid, true);
  o := o || format('2. Steve accepts: status=%s phase=%s turn=%s%s', g.status, g.phase, coalesce(g.turn::text, 'none'), chr(10));
  select count(*) into n from public.battleship_fleets where game_id = gid;
  o := o || format('3. fleets Steve can read mid-game: %s (want 1, his own)%s', n, chr(10));
  begin
    perform public.bs_apply(gid, ST, 0);
    o := o || '4. BS_APPLY IS CALLABLE FROM A BROWSER' || chr(10);
  exception when insufficient_privilege then o := o || '4. bs_apply refused to browsers: ok' || chr(10);
  when others then o := o || '4. bs_apply refused: ' || sqlerrm || chr(10);
  end;
  begin
    perform public.battleship_ready(gid, repeat('.', 100));
    o := o || '5a. AN EMPTY FLEET WAS ACCEPTED' || chr(10);
  exception when others then o := o || '5a. empty fleet refused: ok' || chr(10);
  end;
  bad := 'AAAA.A...D' || '.........D' || 'BBBB......' || repeat('.', 10) || '.......C..' || '.......C..' || 'SSS....C..' || repeat('.', 30);
  begin
    perform public.battleship_ready(gid, bad);
    o := o || '5b. A BROKEN CARRIER WAS ACCEPTED' || chr(10);
  exception when others then o := o || '5b. broken carrier refused: ok' || chr(10);
  end;
  bad := 'AAAAAAAAAD' || '.........D' || 'BBBB......' || repeat('.', 10) || '.......C..' || '.......C..' || 'SSS....C..' || repeat('.', 30);
  begin
    perform public.battleship_ready(gid, bad);
    o := o || '5c. A NINE-CELL CARRIER WAS ACCEPTED' || chr(10);
  exception when others then o := o || '5c. wrong-length ship refused: ok' || chr(10);
  end;
  bad := '........AA' || 'AAA......D' || 'BBBB.....D' || repeat('.', 10) || '.......C..' || '.......C..' || 'SSS....C..' || repeat('.', 30);
  begin
    perform public.battleship_ready(gid, bad);
    o := o || '5d. A CARRIER WRAPPING ROUND THE EDGE WAS ACCEPTED' || chr(10);
  exception when others then o := o || '5d. ship wrapping round the edge refused: ok' || chr(10);
  end;
  custom := 'AAAAA....D' || '.........D' || 'BBBB......' || repeat('.', 10) || '.......C..' || '.......C..' || 'SSS....C..' || repeat('.', 30);
  g := public.battleship_ready(gid, custom);
  o := o || format('5. Steve Ready with his own layout: steve_ready=%s phase=%s%s', g.opponent_ready, g.phase, chr(10));
  begin
    perform public.battleship_ready(gid, null);
    o := o || '5e. READY TWICE WAS ACCEPTED' || chr(10);
  exception when others then o := o || '5e. Ready twice refused: ok' || chr(10);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  g := public.battleship_ready(gid, null);
  o := o || format('6. AA Ready with the dealt fleet: phase=%s, Steve fires first=%s%s', g.phase, g.turn = ST, chr(10));
  begin
    perform public.battleship_fire(gid, 0);
    o := o || '7a. AA FIRED OUT OF TURN' || chr(10);
  exception when others then o := o || '7a. firing out of turn refused: ok' || chr(10);
  end;

  reset role;
  select layout into lay_aa from public.battleship_fleets where game_id = gid and user_id = AA;
  select layout into lay_st from public.battleship_fleets where game_id = gid and user_id = ST;
  o := o || format('7. both fleets legal: AA=%s Steve=%s; Steve sails the layout he chose=%s; dealt fleets keep apart (AA''s has %s cells)%s',
    public.bs_valid_layout(lay_aa), public.bs_valid_layout(lay_st), lay_st = custom, length(replace(lay_aa, '.', '')), chr(10));

  w1 := position('.' in lay_aa) - 1;
  w2 := w1 + position('.' in substr(lay_aa, w1 + 2));
  perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
  set local role authenticated;
  g := public.battleship_fire(gid, w1);
  o := o || format('8. Steve fires into open water: result=%s, turn passes to AA=%s%s', g.last_result, g.turn = AA, chr(10));
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  g := public.battleship_fire(gid, position('.' in lay_st) - 1);
  o := o || format('8b. AA misses too: turn back to Steve=%s%s', g.turn = ST, chr(10));
  perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
  begin
    perform public.battleship_fire(gid, w1);
    o := o || '8c. FIRING TWICE AT ONE SQUARE WAS ACCEPTED' || chr(10);
  exception when others then o := o || '8c. firing twice at one square refused: ok' || chr(10);
  end;
  g := public.battleship_fire(gid, w2);
  o := o || format('8d. Steve misses again: turn to AA=%s; AA''s sea shows %s misses%s', g.turn = AA, length(regexp_replace(g.challenger_sea, '[^o]', '', 'g')), chr(10));

  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  n := 0;
  for k in 0..99 loop
    if substr(lay_st, k + 1, 1) <> '.' then
      g := public.battleship_fire(gid, k);
      if g.status = 'finished' then exit; end if;
      if g.turn <> AA then n := n + 1; end if;
    end if;
  end loop;
  o := o || format('9. AA fires at all 17 cells: every hit kept the turn=%s, status=%s, winner AA=%s, result=%s, sunk cells shown in the sea=%s%s',
    n = 0, g.status, g.winner = AA, g.result, length(regexp_replace(g.opponent_sea, '[^ABCSD]', '', 'g')), chr(10));
  begin
    perform public.battleship_fire(gid, 99);
    o := o || '9b. A SHOT AFTER THE GAME ENDED WAS ACCEPTED' || chr(10);
  exception when others then o := o || '9b. no shots after the end: ok' || chr(10);
  end;
  select count(*) into n from public.battleship_fleets where game_id = gid;
  o := o || format('10. fleets AA can read once it is over: %s (want 2, the reveal)%s', n, chr(10));

  reset role;
  xa1 := coalesce((select game_points from public.user_stats where user_id = AA), 0);
  xs1 := coalesce((select game_points from public.user_stats where user_id = ST), 0);
  o := o || format('11. XP: AA +%s (game row says %s), Steve +%s (game row says %s); want 10 and 3 unless a daily cap was hit%s',
    xa1 - xa0, g.challenger_points, xs1 - xs0, g.opponent_points, chr(10));

  ------------------------------------------------------------------ game 2: an early resignation pays nothing
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.battleship_games (challenger_id, challenger_name, opponent_id, opponent_name)
    values (AA, aa_name, ST, st_name) returning id into gid;
  perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
  perform public.battleship_respond(gid, true);
  perform public.battleship_ready(gid, null);
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  perform public.battleship_ready(gid, null);
  perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
  g := public.battleship_resign(gid);
  o := o || format('12. Steve resigns before a shot: result=%s, winner AA=%s, XP paid %s + %s (want 0 + 0)%s',
    g.result, g.winner = AA, g.challenger_points, g.opponent_points, chr(10));

  ------------------------------------------------------------------ game 3: the clocks
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  insert into public.battleship_games (challenger_id, challenger_name, opponent_id, opponent_name)
    values (AA, aa_name, ST, st_name) returning id into gid;
  perform set_config('request.jwt.claims', json_build_object('sub', ST, 'role', 'authenticated')::text, true);
  perform public.battleship_respond(gid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  g := public.battleship_timeout(gid);
  o := o || format('13a. placing clock not run out yet: still placing=%s%s', g.phase = 'placing', chr(10));
  reset role;
  update public.battleship_games set turn_started_at = now() - interval '70 seconds' where id = gid;
  set local role authenticated;
  g := public.battleship_timeout(gid);
  o := o || format('13. placing clock ran out: both sail with their dealt fleets, phase=%s, Steve first=%s%s', g.phase, g.turn = ST, chr(10));
  reset role;
  update public.battleship_games set turn_started_at = now() - interval '40 seconds' where id = gid;
  set local role authenticated;
  g := public.battleship_timeout(gid);
  after_shots := length(replace(g.challenger_sea, '.', '')) + length(replace(g.opponent_sea, '.', ''));
  o := o || format('14. Steve''s shot clock ran out: one shot fired for him=%s (%s)%s', after_shots = 1, g.last_action, chr(10));
  before_shots := after_shots;
  g := public.battleship_timeout(gid);
  after_shots := length(replace(g.challenger_sea, '.', '')) + length(replace(g.opponent_sea, '.', ''));
  o := o || format('15. a second call on a fresh clock does nothing: %s%s', after_shots = before_shots, chr(10));
  select count(*) into n from public.battleship_leaderboard(20);
  o := o || format('16. leaderboard rows: %s%s', n, chr(10));

  raise exception 'RESULT%', chr(10) || o;
end $$;
