-- Game helpers locked down, and Hold'em no longer capped (18 Sept 2026) -----------------------------
--
-- 1. Sixteen security-definer helpers of the older games could be executed by any signed-in
--    browser (they had EXECUTE for `authenticated`, the default for a new function in this schema):
--      game_apply, game_award                          (Tic-Tac-Toe)
--      hd_credit, hd_deal, hd_finish, hd_next_street,
--      hd_settle, hd_showdown, hd_touch, hd_xp         (Hold'em; hd_credit/hd_xp shared with Prasta)
--      hm_apply, hm_award                              (Hangman)
--      pr_showdown                                     (Prasta)
--      uno_award, uno_draw_cards, uno_sync             (UNO)
--    None of them checks who is calling, so from a browser console:
--      * hd_credit(anyone, n) added or removed any amount of XP;
--      * the *_award functions paid a finished game again on every call;
--      * game_apply / hm_apply made moves in the other player's name, uno_draw_cards dealt cards
--        into anyone's hand;
--      * hd_settle / hd_next_street / hd_showdown ran a Hold'em table for whoever called them.
--    Nothing in the app calls them directly (app.js and the edge functions checked) -- only the
--    game functions do, and those are security definer, so they keep reaching the helpers as their
--    owner once browsers can't. No policy, view, trigger or non-definer function uses them either.
--    Found by auditing every security-definer function executable by `authenticated` whose source
--    never looks at auth.uid(); the rest of that list are trigger functions (can't be called) and
--    read-only checks the RLS policies themselves call (can_whisper, is_banned, ... -- must stay).
--
-- 2. Hold'em is a pure transfer from now on (user's decision, 18 Sept 2026: "remove the cap").
--    Chips only change hands, so nothing is created that a daily cap would need to limit -- and
--    trimming a winner's cash-out to the cap only ever deleted chips the loser had already paid.
--    hd_finish pays both stacks back in full, and game_points_today stops counting Hold'em, the
--    same as Prasta, so Hold'em winnings no longer use up the day's XP from the other games.
--
-- Practice run first:  begin;  <this file>  <game_helpers_lockdown_dryrun.sql>  rollback;

create or replace function public.hd_finish(p_game bigint, p_result text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.holdem_games; cn int; onn int;
begin
  select * into g from public.holdem_games where id = p_game for update;
  cn := g.challenger_stack - g.buy_in; onn := g.opponent_stack - g.buy_in;
  perform public.hd_credit(g.challenger_id, g.challenger_stack);
  perform public.hd_credit(g.opponent_id, g.opponent_stack);
  update public.holdem_games set status = 'finished', result = p_result, street = 'between', turn = null,
    winner = case when g.challenger_stack > g.opponent_stack then g.challenger_id when g.opponent_stack > g.challenger_stack then g.opponent_id else null end,
    challenger_points = cn, opponent_points = onn, updated_at = now() where id = p_game;
end $$;

create or replace function public.game_points_today(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.uno_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.hangman_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  + coalesce((select sum(case when challenger_id = p then challenger_points else opponent_points end)
              from public.battleship_games where status = 'finished' and updated_at > now() - interval '24 hours'
                and (challenger_id = p or opponent_id = p)), 0)
  )::int
$$;

revoke execute on function
  public.game_apply(bigint, uuid, integer), public.game_award(bigint),
  public.hd_credit(uuid, integer), public.hd_deal(bigint), public.hd_finish(bigint, text), public.hd_next_street(bigint),
  public.hd_settle(bigint, uuid, text), public.hd_showdown(bigint), public.hd_touch(bigint), public.hd_xp(uuid),
  public.hm_apply(bigint, uuid, text), public.hm_award(bigint), public.pr_showdown(bigint),
  public.uno_award(bigint), public.uno_draw_cards(bigint, uuid, integer), public.uno_sync(bigint)
  from public, anon, authenticated;
grant execute on function
  public.game_apply(bigint, uuid, integer), public.game_award(bigint),
  public.hd_credit(uuid, integer), public.hd_deal(bigint), public.hd_finish(bigint, text), public.hd_next_street(bigint),
  public.hd_settle(bigint, uuid, text), public.hd_showdown(bigint), public.hd_touch(bigint), public.hd_xp(uuid),
  public.hm_apply(bigint, uuid, text), public.hm_award(bigint), public.pr_showdown(bigint),
  public.uno_award(bigint), public.uno_draw_cards(bigint, uuid, integer), public.uno_sync(bigint)
  to service_role;
