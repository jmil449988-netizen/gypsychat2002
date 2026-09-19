-- Starter purse: 100 XP for every new character, spendable at the tables, never counted for level.
--
-- Decided with the user, 18 Sept 2026: "give new users a 100 xp to begin with that doesnt affect
-- their level." A brand-new account has 0 XP and so cannot sit down anywhere (Steve miller could
-- not buy in during the live test). Hand every new character 100 XP of table money instead:
--
--   * user_stats.bonus          -- the purse: what is left of the starter chips, off the table
--   * user_stats.bonus_in_play  -- how much of the purse is currently sitting on tables (escrow)
--   * user_stats.bonus_granted  -- one grant per account, ever
--
-- The purse is NOT part of `xp` and so not part of `level` (both stay generated from
-- reactions_received + game_points, exactly as before). It is part of what the tables will let
-- you bet: hd_xp() -- the "can you cover this buy-in?" number every game uses -- now returns
-- level XP + purse.
--
-- Money movement lives entirely in hd_credit(), which every game already routes through:
--   * buying in (delta < 0): the purse pays first, real XP covers the rest; what the purse paid
--     is remembered in bonus_in_play.
--   * being paid (delta > 0): the payout refills the purse up to what the purse has on the tables
--     (bonus_in_play), and ONLY the remainder becomes level-counting game_points. So a player who
--     sits down with 100 purse chips and cashes out 140 gets the 100 back in the purse and 40 XP
--     towards their level; one who cashes out 60 gets 60 back in the purse and nothing else. Purse
--     chips can never turn into level XP just by passing through a table.
--   * purse chips that are lost (bust, idle forfeit, a bad hand) are simply gone: the next time
--     the player buys in while sitting at no other table, whatever bonus_in_play was left over is
--     written off.
-- XP conservation is untouched: every chip a game moves is still one unit of bonus or game_points.
--
-- Grant: an AFTER INSERT trigger on public.profiles (where claim_name creates every character)
-- credits 100 once per account. Existing accounts are NOT touched here; the release reset should
-- run  `update public.user_stats set bonus = 100, bonus_granted = true`  (or simply rely on the
-- trigger, since the reset recreates the profiles).
--
-- Run once in the Supabase SQL Editor, after holdem_feature.sql (it replaces hd_xp / hd_credit,
-- same signatures, so the grants from game_helpers_lockdown.sql carry over unchanged).

alter table public.user_stats
  add column if not exists bonus         integer not null default 0 check (bonus >= 0),
  add column if not exists bonus_in_play integer not null default 0 check (bonus_in_play >= 0),
  add column if not exists bonus_granted boolean not null default false;

create or replace function public.hd_xp(p uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select reactions_received + game_points + bonus from public.user_stats where user_id = p), 0) $$;

-- Is this player sitting anywhere (money on a table) apart from the game the caller is creating
-- right now? Rows inserted or updated in the current transaction have age(xmin) = 0 and are
-- skipped, so a buy-in sees only the OTHER tables; a pending heads-up challenge only holds the
-- challenger's money, so it counts for the challenger alone.
create or replace function public.hd_seated_elsewhere(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.holdem_games g where age(g.xmin) <> 0
                   and ((g.status = 'active' and p in (g.challenger_id, g.opponent_id)) or (g.status = 'pending' and g.challenger_id = p)))
      or exists (select 1 from public.prasta_games g where age(g.xmin) <> 0
                   and ((g.status = 'active' and p in (g.challenger_id, g.opponent_id)) or (g.status = 'pending' and g.challenger_id = p)))
      or exists (select 1 from public.holdem_tables t where age(t.xmin) <> 0 and p = any(t.seat_user)) $$;

create or replace function public.hd_credit(p uuid, delta int) returns void language plpgsql security definer set search_path = public as $$
declare s public.user_stats%rowtype; take int; back int;
begin
  -- update first: an INSERT ... ON CONFLICT would evaluate the generated level column (a square
  -- root) on the proposed row before noticing the conflict, and a negative delta breaks that.
  select * into s from public.user_stats where user_id = p for update;
  if not found then
    insert into public.user_stats (user_id, game_points) values (p, greatest(delta, 0));
    return;
  end if;
  if delta < 0 then
    -- purse chips lost on earlier tables are written off before this buy-in
    if s.bonus_in_play > 0 and not public.hd_seated_elsewhere(p) then s.bonus_in_play := 0; end if;
    take := least(s.bonus, -delta);                       -- the purse pays first
    update public.user_stats
      set bonus = bonus - take, bonus_in_play = s.bonus_in_play + take, game_points = game_points + delta + take
      where user_id = p;
  else
    back := least(s.bonus_in_play, delta);                -- the purse's share of the table comes home
    update public.user_stats
      set bonus = bonus + back, bonus_in_play = bonus_in_play - back, game_points = game_points + delta - back
      where user_id = p;
  end if;
end $$;

revoke execute on function public.hd_seated_elsewhere(uuid) from public, anon, authenticated;

-- The grant: 100 purse chips the first time a character is created for an account.
create or replace function public.grant_starter_purse() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_stats (user_id, bonus, bonus_granted) values (new.user_id, 100, true)
    on conflict (user_id) do update set bonus = public.user_stats.bonus + 100, bonus_granted = true
    where not public.user_stats.bonus_granted;
  return new;
end $$;
drop trigger if exists profiles_grant_starter_purse on public.profiles;
create trigger profiles_grant_starter_purse after insert on public.profiles for each row execute function public.grant_starter_purse();
