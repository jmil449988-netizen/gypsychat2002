-- Stop trusting the client's display-name argument in gc_check_and_record_send ------------------
--
-- gc_check_and_record_send(p_name text) is the RPC every room message, thread, and reply send
-- goes through (app.js send()/post()), and it has always used the caller-supplied p_name verbatim
-- as chat_moderation.user_name -- the label an admin sees next to a mute/cooldown/offense count in
-- the moderation view. In the normal app flow p_name is always me.name, which is already
-- authoritative (profiles.name, enforced by claim_name() and the message/thread INSERT policies --
-- see name_claim_security_fix.sql). But the RPC itself never checked that: anyone calling it
-- directly with the public anon key could pass any string they liked and have it show up as their
-- name in the admin's moderation queue, independent of what they're actually named everywhere else.
-- Not an authorization bypass -- auth.uid() still drives every actual decision -- just a cosmetic
-- spoof of what an admin sees.
--
-- Fix: derive user_name from public.profiles instead of trusting the parameter. p_name is kept as
-- a fallback (coalesce) only for the unreachable-in-practice case where a profile row somehow has
-- no name yet, so the column doesn't go unexpectedly null; every real caller already has a claimed
-- name by the time they can send anything. No client-side change needed -- the RPC's signature and
-- the client's call site (still `sb.rpc('gc_check_and_record_send', { p_name: me.name })`) are
-- unchanged. Otherwise identical to disciplinary_actions_feature.sql's version.
--
-- Run this once in the Supabase SQL Editor.

create or replace function public.gc_check_and_record_send(p_name text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  uid uuid := auth.uid();
  v_name text;
  r record;
  now_ timestamptz := now();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  v_name := coalesce((select p.name from public.profiles p where p.user_id = uid), p_name);

  insert into chat_moderation (user_id, user_name)
    values (uid, v_name)
    on conflict (user_id) do update set user_name = excluded.user_name
    returning * into r;

  if r.muted and (r.muted_permanent or (r.muted_until is not null and r.muted_until > now_) or (r.cooldown_until is not null and r.cooldown_until > now_)) then
    return jsonb_build_object('ok', false, 'reason', 'muted', 'permanent', r.muted_permanent, 'muted_until', r.muted_until, 'offense_count', r.offense_count);
  end if;

  if r.cooldown_until is not null and r.cooldown_until > now_ then
    r.offense_count := r.offense_count + 1;
    r.cooldown_seconds := r.offense_count * 15;
    r.cooldown_until := now_ + make_interval(secs => r.cooldown_seconds);
    if r.offense_count >= 5 then
      r.muted := true; r.muted_permanent := true; r.muted_at := now_;
    end if;
    update chat_moderation set
      cooldown_seconds = r.cooldown_seconds, cooldown_until = r.cooldown_until,
      offense_count = r.offense_count, muted = r.muted, muted_permanent = r.muted_permanent,
      muted_at = r.muted_at, updated_at = now_
    where user_id = uid;
    return jsonb_build_object('ok', false, 'reason', case when r.muted then 'muted' else 'cooldown' end,
      'cooldown_seconds', r.cooldown_seconds, 'retry_at', r.cooldown_until, 'offense_count', r.offense_count,
      'permanent', r.muted_permanent, 'muted_until', r.muted_until);
  end if;

  if r.window_start is null or now_ - r.window_start > interval '4 seconds' then
    r.window_start := now_; r.window_count := 1;
  else
    r.window_count := r.window_count + 1;
  end if;

  if r.window_count > 3 then
    r.offense_count := r.offense_count + 1;
    r.cooldown_seconds := r.offense_count * 15;
    r.cooldown_until := now_ + make_interval(secs => r.cooldown_seconds);
    if r.offense_count >= 5 then
      r.muted := true; r.muted_permanent := true; r.muted_at := now_;
    end if;
    update chat_moderation set window_start = r.window_start, window_count = r.window_count,
      cooldown_seconds = r.cooldown_seconds, cooldown_until = r.cooldown_until, offense_count = r.offense_count,
      muted = r.muted, muted_permanent = r.muted_permanent, muted_at = r.muted_at, updated_at = now_
    where user_id = uid;
    return jsonb_build_object('ok', false, 'reason', case when r.muted then 'muted' else 'cooldown' end,
      'cooldown_seconds', r.cooldown_seconds, 'retry_at', r.cooldown_until, 'offense_count', r.offense_count,
      'permanent', r.muted_permanent, 'muted_until', r.muted_until);
  end if;

  update chat_moderation set window_start = r.window_start, window_count = r.window_count, updated_at = now_
    where user_id = uid;
  return jsonb_build_object('ok', true);
end;
$function$;
