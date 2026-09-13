-- Backs the IP-based churn detector used by the verify-join edge function: every successful
-- join is logged here keyed by a salted SHA-256 hash of the client IP (never the raw IP), so
-- the function can tell when the same network has spun up several fresh anonymous identities
-- in a short window -- a sign of deliberately dodging a mute rather than a normal reconnect.
--
-- No RLS policies are defined on purpose: only the verify-join edge function (using the
-- service role key, which bypasses RLS entirely) ever reads or writes this table. Regular
-- clients get nothing back from it either way.

create table if not exists public.join_ip_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists join_ip_log_ip_time on public.join_ip_log (ip_hash, created_at desc);

alter table public.join_ip_log enable row level security;
