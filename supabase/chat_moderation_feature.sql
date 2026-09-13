-- Chat moderation: the spam-cooldown / mute brain, keyed to each person's (anonymous) account.
--
-- Backfilling this file because the table, function, and two of the four policies below were
-- originally created directly in the Supabase SQL Editor and were never committed to the repo --
-- this file documents exactly what has been live in production. Safe to re-run: every statement
-- is idempotent (create table if not exists / create or replace function / drop-then-create
-- policy), so running this against a database that already has it changes nothing.
--
-- (The fourth policy, "admins insert moderation", was already committed in
-- admin_moderation_feature.sql, so it isn't repeated here.)

create table if not exists public.chat_moderation (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  user_name        text,
  window_start     timestamptz,
  window_count     integer not null default 0,
  cooldown_seconds integer not null default 0,
  cooldown_until   timestamptz,
  offense_count    integer not null default 0,
  muted            boolean not null default false,
  muted_permanent  boolean not null default false,
  muted_at         timestamptz,
  updated_at       timestamptz not null default now()
);

alter table public.chat_moderation enable row level security;

drop policy if exists "own moderation row" on public.chat_moderation;
create policy "own moderation row" on public.chat_moderation for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admins view all moderation" on public.chat_moderation;
create policy "admins view all moderation" on public.chat_moderation for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "admins update moderation" on public.chat_moderation;
create policy "admins update moderation" on public.chat_moderation for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- gc_check_and_record_send(): called by the client before every room message, thread post, and
-- reply. Tracks a rolling 4-second send window -- more than 3 sends in that window is an offense.
-- Each offense escalates the cooldown by 15s (15s, 30s, 45s, ...); the 5th offense in a session
-- mutes the account permanently (only an admin can lift it, via /unmute or the Online-list menu).
-- Sending again while an existing cooldown is still running is itself counted as another offense.
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

  if r.muted and (r.muted_permanent or (r.cooldown_until is not null and r.cooldown_until > now_)) then
    return jsonb_build_object('ok', false, 'reason', 'muted', 'permanent', r.muted_permanent, 'offense_count', r.offense_count);
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
      'permanent', r.muted_permanent);
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
      'permanent', r.muted_permanent);
  end if;

  update chat_moderation set window_start = r.window_start, window_count = r.window_count, updated_at = now_
    where user_id = uid;
  return jsonb_build_object('ok', true);
end;
$function$;
