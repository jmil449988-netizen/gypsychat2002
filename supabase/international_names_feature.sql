-- International character names ------------------------------------------------------------
--
-- claim_name() rejected anything outside \w (ASCII letters/digits/underscore), so a name like
-- "Δημήτρης", "Иван" or "田中太郎" was refused server-side even after the client-side regex in
-- app.js was loosened to match -- the two have to agree, since the client check alone is just a
-- courtesy (anyone can call the RPC directly with whatever they want).
--
-- Postgres's [[:alpha:]] and [[:digit:]] POSIX classes are Unicode-aware on a UTF8 database
-- (which every Supabase project is) -- they aren't limited to the OS locale's ctype tables the
-- way a naive read of "POSIX" might suggest, so this correctly accepts Greek, Cyrillic, Japanese,
-- Chinese, and everything else with a Unicode "Letter" or "Number" category, while still
-- rejecting invisible/formatting characters (zero-width joiners, bidi overrides) since those are
-- a different Unicode category and were never matched by \w either.
--
-- Only the regex line changes; the rest of the function is identical to name_claim_security_fix.sql.

create or replace function public.claim_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- same rule the client enforces: 2-16 letters (any script), numbers, spaces or . ' - or _
  if p_name is null or p_name !~ '^[[:alpha:][:digit:]_ .''-]{2,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- release the name if whoever holds it hasn't signed on in 30 days
  update public.profiles
    set name = null
    where lower(name) = lower(p_name)
      and user_id <> uid
      and (name_seen_at is null or name_seen_at < now() - interval '30 days');

  begin
    insert into public.profiles (user_id, name, name_seen_at)
      values (uid, p_name, now())
      on conflict (user_id) do update
        set name = excluded.name, name_seen_at = now();
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'name', p_name);
end;
$fn$;

grant execute on function public.claim_name(text) to anon, authenticated;
