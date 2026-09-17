-- Hold'em: refuse a challenge the other player cannot afford ----------------------------------
--
-- holdem_challenge only ever checked the CHALLENGER's XP. Inviting someone with less XP than the
-- buy-in created a table they could never sit down at: their Sit down button just errored with
-- "You need N XP" and the challenger was never told why nothing happened. Now the challenge
-- itself is refused with a plain message naming the shortfall (the client also warns before the
-- buy-in prompt, using the XP it already knows; this is the server-side truth).
--
-- Run once in the Supabase SQL Editor. Otherwise identical to holdem_feature.sql's version.

create or replace function public.holdem_challenge(p_opponent uuid, p_stakes text, p_buy_in int) returns public.holdem_games
language plpgsql security definer set search_path = public as $$
declare st record; g public.holdem_games; oname text; myname text; oxp int;
begin
  if auth.uid() is null then raise exception 'Sign on first.'; end if;
  if p_opponent = auth.uid() then raise exception 'You cannot play yourself.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'Not allowed.'; end if;
  if not public.can_whisper(auth.uid(), p_opponent) then raise exception 'They only take whispers from friends.'; end if;
  if p_stakes not in ('low', 'high') then raise exception 'Pick low or high stakes.'; end if;
  select * into st from public.hd_stakes(p_stakes);
  if p_buy_in is null or p_buy_in < st.min_buy or p_buy_in > st.max_buy then raise exception 'Sit down with % to % XP at this table.', st.min_buy, st.max_buy; end if;
  if public.hd_xp(auth.uid()) < p_buy_in then raise exception 'You do not have % XP to put on the table.', p_buy_in; end if;
  select name into myname from public.profiles where user_id = auth.uid();
  select name into oname from public.profiles where user_id = p_opponent;
  oxp := public.hd_xp(p_opponent);
  if oxp < st.min_buy then
    raise exception '% only has % XP — not enough for the % table (% XP minimum).', coalesce(oname, 'They'), oxp, p_stakes, st.min_buy;
  end if;
  if oxp < p_buy_in then
    raise exception '% only has % XP and cannot cover a %-XP buy-in. Try % or less.', coalesce(oname, 'They'), oxp, p_buy_in, oxp;
  end if;
  insert into public.holdem_games (challenger_id, challenger_name, opponent_id, opponent_name, stakes, sb, bb, buy_in, challenger_stack)
    values (auth.uid(), myname, p_opponent, oname, p_stakes, st.sb, st.bb, p_buy_in, p_buy_in) returning * into g;
  perform public.hd_credit(auth.uid(), -p_buy_in);   -- escrow
  return g;
end $$;
