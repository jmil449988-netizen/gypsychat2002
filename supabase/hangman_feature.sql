-- Hangman in whispers: a race for one secret word -----------------------------------------------------
--
-- The server picks a word; the two players take turns guessing letters (or the whole word). A
-- right letter keeps your turn, a wrong one adds a miss to the shared gallows and passes the
-- turn. Whoever reveals the last letter -- or solves the word outright -- wins 3 XP. The sixth
-- miss hangs the man: whoever made it loses. A wrong whole-word guess is a miss. Running the
-- 30 s clock out counts as a miss too (hangman_timeout()). The word itself lives in
-- hangman_secrets (no policies: functions only); players see the masked word, the letters tried
-- and the miss count. Same daily XP cap as the other games.
--
-- Run once in the Supabase SQL Editor, after games_timer_cap_status_2026_09_17.sql.

create table if not exists public.hangman_games (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  challenger_id     uuid        not null references auth.users(id) on delete cascade,
  challenger_name   text,
  opponent_id       uuid        not null references auth.users(id) on delete cascade,
  opponent_name     text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  turn              uuid,
  turn_started_at   timestamptz not null default now(),
  mask              text        not null default '',
  guessed           text        not null default '',
  misses            integer     not null default 0,
  last_action       text,
  word              text,           -- revealed only once the game is over
  winner            uuid,
  result            text        check (result in ('solved', 'hanged', 'resign')),
  challenger_points integer     not null default 0,
  opponent_points   integer     not null default 0,
  check (challenger_id <> opponent_id)
);
create unique index if not exists hangman_one_open_per_pair on public.hangman_games (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index if not exists hangman_games_challenger on public.hangman_games (challenger_id, status);
create index if not exists hangman_games_opponent on public.hangman_games (opponent_id, status);
create table if not exists public.hangman_secrets (
  game_id bigint primary key references public.hangman_games(id) on delete cascade,
  word    text not null
);
alter table public.hangman_games enable row level security;
alter table public.hangman_secrets enable row level security;
create policy "my hangman games" on public.hangman_games for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());
create policy "hangman challenge" on public.hangman_games for insert to authenticated
  with check (
    challenger_id = auth.uid() and opponent_id <> auth.uid() and status = 'pending' and turn is null and mask = '' and guessed = ''
    and misses = 0 and word is null and winner is null and result is null and challenger_points = 0 and opponent_points = 0
    and not public.is_banned(auth.uid()) and public.can_whisper(auth.uid(), opponent_id)
  );
revoke all on public.hangman_games, public.hangman_secrets from anon, authenticated;
grant select, insert on public.hangman_games to authenticated;
alter publication supabase_realtime add table public.hangman_games;

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
  )::int
$$;

-- The word list ------------------------------------------------------------------------------------------
create or replace function public.hm_word() returns text language sql volatile as $$
  select w from unnest(array[
    'caravan','lantern','fortune','wanderer','campfire','tambourine','crystal','moonlight','whisper','bonfire',
    'compass','journey','harvest','festival','violin','accordion','tapestry','bracelet','amulet','saffron',
    'thunder','wildfire','meadow','blossom','horizon','twilight','midnight','sunrise','shadow','echo',
    'mystery','prophecy','destiny','miracle','treasure','pirate','castle','dragon','phoenix','griffin',
    'kingdom','empire','village','harbour','lighthouse','windmill','bridge','tunnel','mountain','valley',
    'river','forest','desert','island','volcano','glacier','canyon','jungle','prairie','swamp',
    'jasmine','lavender','rosemary','cinnamon','vanilla','pepper','ginger','honey','butter','cheese',
    'guitar','trumpet','piano','fiddle','drum','banjo','harp','flute','melody','rhythm',
    'balloon','circus','juggler','acrobat','magician','puppet','carnival','parade','trophy','medal',
    'penguin','dolphin','octopus','tiger','leopard','panther','falcon','raven','sparrow','swallow',
    'thimble','needle','ribbon','velvet','silk','leather','copper','silver','marble','crystal',
    'wagon','saddle','stirrup','harness','wheel','spoke','axle','anvil','hammer','chisel',
    'pumpkin','lantern','candle','scarecrow','haystack','orchard','vineyard','barley','clover','thistle',
    'blizzard','avalanche','tornado','monsoon','rainbow','drizzle','sunshine','frost','breeze','gale',
    'planet','galaxy','comet','meteor','eclipse','orbit','rocket','satellite','nebula','asteroid',
    'sandwich','pancake','waffle','noodle','pretzel','biscuit','muffin','pudding','custard','sherbet',
    'library','museum','theatre','gallery','stadium','bakery','tavern','chapel','palace','cottage',
    'umbrella','sweater','mitten','scarf','bonnet','slipper','goggles','helmet','apron','corset',
    'whistle','trumpet','bugle','anthem','chorus','ballad','lullaby','serenade','encore','overture',
    'cricket','beetle','firefly','dragonfly','butterfly','hornet','cicada','ladybird','termite','mantis',
    'gypsy','romani','vardo','fortune','tarot','crystal','palm','tealeaf','omen','charm',
    'secret','riddle','puzzle','cipher','enigma','labyrinth','quest','voyage','odyssey','legend'
  ]) w order by random() limit 1
$$;

create or replace function public.hm_mask(w text, guessed text) returns text language sql immutable as $$
  select string_agg(case when position(ch in guessed) > 0 then ch else '_' end, '') from regexp_split_to_table(w, '') ch $$;

create or replace function public.hm_award(p_game bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games; cp int := 0; op int := 0; cap int := 500;
begin
  select * into g from public.hangman_games where id = p_game;
  if g.status <> 'finished' or g.winner is null then return; end if;
  if g.winner = g.challenger_id then cp := 3; else op := 3; end if;
  cp := greatest(0, least(cp, cap - public.game_points_today(g.challenger_id)));
  op := greatest(0, least(op, cap - public.game_points_today(g.opponent_id)));
  update public.hangman_games set challenger_points = cp, opponent_points = op where id = p_game;
  if cp > 0 then insert into public.user_stats (user_id, game_points) values (g.challenger_id, cp)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + cp; end if;
  if op > 0 then insert into public.user_stats (user_id, game_points) values (g.opponent_id, op)
    on conflict (user_id) do update set game_points = public.user_stats.game_points + op; end if;
end $$;

create or replace function public.hangman_respond(p_game bigint, p_accept boolean) returns public.hangman_games
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games; w text;
begin
  select * into g from public.hangman_games where id = p_game for update;
  if g.id is null or g.opponent_id <> auth.uid() then raise exception 'That challenge is not yours to answer.'; end if;
  if g.status <> 'pending' then raise exception 'That challenge is no longer open.'; end if;
  if not p_accept then
    update public.hangman_games set status = 'declined', updated_at = now() where id = p_game returning * into g;
    return g;
  end if;
  w := public.hm_word();
  insert into public.hangman_secrets (game_id, word) values (p_game, w);
  update public.hangman_games set status = 'active', turn = g.opponent_id, turn_started_at = now(), mask = public.hm_mask(w, ''), guessed = '',
    misses = 0, last_action = 'A ' || length(w) || '-letter word. ' || coalesce(g.opponent_name, 'They') || ' guesses first.', updated_at = now() where id = p_game;
  select * into g from public.hangman_games where id = p_game;
  return g;
end $$;

-- One guess by p_by: a single letter, or a whole word. Internal (hangman_guess / hangman_timeout).
create or replace function public.hm_apply(p_game bigint, p_by uuid, p_guess text) returns public.hangman_games
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games; w text; other uuid; whom text; gs text; newmask text; hit boolean;
begin
  select * into g from public.hangman_games where id = p_game for update;
  if g.status <> 'active' then raise exception 'That game is over.'; end if;
  if g.turn <> p_by then raise exception 'Not your turn.'; end if;
  select word into w from public.hangman_secrets where game_id = p_game;
  other := case when g.challenger_id = p_by then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = p_by then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  gs := lower(regexp_replace(coalesce(p_guess, ''), '[^a-zA-Z]', '', 'g'));
  if gs = '' then
    -- a timeout: counts as a miss
    update public.hangman_games set misses = misses + 1, turn = other, turn_started_at = now(), last_action = whom || ' ran out of time — a miss', updated_at = now() where id = p_game;
  elsif length(gs) = 1 then
    if position(gs in g.guessed) > 0 then raise exception 'That letter has been tried.'; end if;
    hit := position(gs in w) > 0;
    newmask := public.hm_mask(w, g.guessed || gs);
    if hit then
      update public.hangman_games set guessed = g.guessed || gs, mask = newmask, turn_started_at = now(), last_action = whom || ' found ' || upper(gs) || ' — goes again', updated_at = now() where id = p_game;
    else
      update public.hangman_games set guessed = g.guessed || gs, misses = misses + 1, turn = other, turn_started_at = now(), last_action = whom || ' tried ' || upper(gs) || ' — a miss', updated_at = now() where id = p_game;
    end if;
  else
    if gs = w then newmask := w; hit := true;
      update public.hangman_games set mask = w, last_action = whom || ' solved it: ' || upper(w) || '!', updated_at = now() where id = p_game;
    else hit := false;
      update public.hangman_games set misses = misses + 1, turn = other, turn_started_at = now(), last_action = whom || ' guessed “' || upper(gs) || '” — wrong, a miss', updated_at = now() where id = p_game;
    end if;
  end if;
  select * into g from public.hangman_games where id = p_game;
  if position('_' in g.mask) = 0 then
    update public.hangman_games set status = 'finished', winner = p_by, result = 'solved', turn = null, word = w, updated_at = now() where id = p_game;
    perform public.hm_award(p_game);
  elsif g.misses >= 6 then
    update public.hangman_games set status = 'finished', winner = other, result = 'hanged', turn = null, word = w, mask = w,
      last_action = 'The sixth miss — hanged! The word was ' || upper(w) || '.', updated_at = now() where id = p_game;
    perform public.hm_award(p_game);
  end if;
  select * into g from public.hangman_games where id = p_game;
  return g;
end $$;

create or replace function public.hangman_guess(p_game bigint, p_guess text) returns public.hangman_games
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games;
begin
  select * into g from public.hangman_games where id = p_game;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if coalesce(p_guess, '') = '' then raise exception 'Guess a letter or the word.'; end if;
  return public.hm_apply(p_game, auth.uid(), p_guess);
end $$;

create or replace function public.hangman_timeout(p_game bigint) returns public.hangman_games
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games;
begin
  select * into g from public.hangman_games where id = p_game;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' or g.turn is null then return g; end if;
  if g.turn_started_at > now() - interval '29 seconds' then return g; end if;
  return public.hm_apply(p_game, g.turn, '');
end $$;

create or replace function public.hangman_resign(p_game bigint) returns public.hangman_games
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games; other uuid; whom text; w text;
begin
  select * into g from public.hangman_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status <> 'active' then raise exception 'That game is not in play.'; end if;
  other := case when g.challenger_id = auth.uid() then g.opponent_id else g.challenger_id end;
  whom := case when g.challenger_id = auth.uid() then coalesce(g.challenger_name, 'They') else coalesce(g.opponent_name, 'They') end;
  select word into w from public.hangman_secrets where game_id = p_game;
  update public.hangman_games set status = 'finished', winner = other, result = 'resign', turn = null, word = w, mask = w, last_action = whom || ' resigned — the word was ' || upper(w), updated_at = now() where id = p_game;
  perform public.hm_award(p_game);
  select * into g from public.hangman_games where id = p_game;
  return g;
end $$;

create or replace function public.hangman_cancel(p_game bigint) returns public.hangman_games
language plpgsql security definer set search_path = public as $$
declare g public.hangman_games;
begin
  select * into g from public.hangman_games where id = p_game for update;
  if g.id is null or (g.challenger_id <> auth.uid() and g.opponent_id <> auth.uid()) then raise exception 'Not your game.'; end if;
  if g.status = 'pending' and g.challenger_id = auth.uid() then
    update public.hangman_games set status = 'cancelled', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'pending' and g.created_at < now() - interval '10 minutes' then
    update public.hangman_games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'active' and g.updated_at < now() - interval '1 hour' then
    update public.hangman_games set status = 'expired', updated_at = now() where id = p_game returning * into g;
  else
    raise exception 'That game cannot be cancelled right now.';
  end if;
  return g;
end $$;

create or replace function public.hangman_leaderboard(p_limit integer default 20)
returns table (user_id uuid, wins integer, losses integer, streak integer, played integer)
language sql stable security definer set search_path = public as $$
  with f as (select id, updated_at, challenger_id, opponent_id, winner from public.hangman_games where status = 'finished' and winner is not null),
  sides as (select id, updated_at, challenger_id as uid, winner from f union all select id, updated_at, opponent_id, winner from f),
  outcomes as (select uid, case when winner = uid then 'W' else 'L' end as o, row_number() over (partition by uid order by updated_at desc, id desc) as rn from sides),
  totals as (select uid, count(*) filter (where o = 'W')::int as wins, count(*) filter (where o = 'L')::int as losses, count(*)::int as played from outcomes group by uid),
  streaks as (select o.uid, count(*)::int as streak from outcomes o where o.o = 'W'
    and o.rn < coalesce((select min(o2.rn) from outcomes o2 where o2.uid = o.uid and o2.o <> 'W'), 2147483647) group by o.uid)
  select t.uid, t.wins, t.losses, coalesce(s.streak, 0), t.played from totals t left join streaks s on s.uid = t.uid
  order by t.wins desc, t.losses asc, t.uid limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

revoke execute on function public.hangman_respond(bigint, boolean), public.hangman_guess(bigint, text), public.hangman_timeout(bigint), public.hangman_resign(bigint),
  public.hangman_cancel(bigint), public.hangman_leaderboard(integer), public.hm_word(), public.hm_mask(text, text), public.hm_award(bigint), public.hm_apply(bigint, uuid, text) from public, anon;
grant execute on function public.hangman_respond(bigint, boolean), public.hangman_guess(bigint, text), public.hangman_timeout(bigint), public.hangman_resign(bigint),
  public.hangman_cancel(bigint), public.hangman_leaderboard(integer) to authenticated, service_role;
grant execute on function public.hm_word(), public.hm_mask(text, text), public.hm_award(bigint), public.hm_apply(bigint, uuid, text) to authenticated, service_role;
