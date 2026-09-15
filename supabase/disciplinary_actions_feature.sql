-- Timed disciplinary actions from the admin Reports panel -----------------------------------------
--
-- The Reports queue (renderReports() in app.js) used to offer admins only two choices per report:
-- Dismiss, or a single "Ban / Kick" button that always banned the reported user permanently.
-- Temporary bans were already fully supported here -- public.bans.expires_at exists and
-- public.is_banned() already honors it -- the client just never set it. Temporary MUTES were not
-- supported at all: public.chat_moderation only had muted / muted_permanent, both driven by the
-- spam-cooldown escalation in gc_check_and_record_send(), which always mutes permanently on the
-- 5th offense. There was no column for "muted until a specific time by an admin."
--
-- This adds that column and wires it into both places mute state is actually enforced, the same
-- way cooldown_until already works:
--   1. gc_check_and_record_send() -- the RPC every room/thread send goes through; it now treats an
--      unexpired muted_until the same as muted_permanent, and returns muted_until to the client so
--      the compose-lock bar can show "Muted until <time>" instead of a permanent-sounding message.
--   2. is_muted_or_cooling() -- the RLS helper (see moderation_enforcement_fix.sql) guarding the
--      messages/threads/thread_posts/thread-images insert policies, so a temp mute can't be
--      bypassed by talking to the Supabase API directly, and -- just as importantly -- so it stops
--      blocking sends on its own once muted_until has passed, with no admin action required.
--
-- A mute with no duration (the existing Mute button on a name, and the new "Mute — permanent"
-- report action) keeps working exactly as before: muted_permanent = true, muted_until = null.
-- A timed mute (the new "Mute — 1 hour" / "Mute — 24 hours" report actions) sets
-- muted_permanent = false and muted_until = now() + duration, and lifts itself.
--
-- Run this once in the Supabase SQL Editor.

alter table public.chat_moderation add column if not exists muted_until timestamptz; -- null = no timed expiry (permanent, or not muted)

create or replace function public.gc_check_and_record_send(p_name text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  uid uuid := auth.uid();
  r record;
  now_ timestamptz := now();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  insert into chat_moderation (user_id, user_name)
    values (uid, p_name)
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

create or replace function public.is_muted_or_cooling(u uuid) returns boolean language sql security definer stable as
  $$ select exists (
       select 1 from public.chat_moderation
       where user_id = u
         and (
           (muted and (muted_permanent or (muted_until is not null and muted_until > now())))
           or (cooldown_until is not null and cooldown_until > now())
         )
     ) $$;
