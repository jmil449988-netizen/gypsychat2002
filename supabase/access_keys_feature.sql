-- Access-key testing gate --------------------------------------------------------------------
--
-- The site is invite-only for now: the join screen (public/index.html #gateFields) asks for an
-- access code before showing the character-name form at all, and public/js/app.js checks that
-- code against this table through the verify-access-key edge function.
--
-- This table is deliberately given NO policies at all beyond enabling RLS. That means it is not
-- readable or writable by the anon or authenticated roles under any circumstance -- not even to
-- check whether a code is revoked -- only the edge function's service-role key can touch it.
-- Reading it any other way would let anyone with devtools open list every valid code.
--
-- Codes are reusable until revoked: there is no single-use consumption and no in-app
-- key-management page. To revoke a tester's access, open this table in the Supabase table
-- editor and set that row's `revoked` to true -- the next time their device silently re-checks
-- its stored code (or the next time they type it fresh), it will fail and they'll be sent back
-- to the gate screen.
--
-- Each code is also IP-locked on first use (see the verify-access-key edge function):
-- `locked_ip_hash` starts null and gets set to a salted hash of whichever IP first redeems the
-- code (same salted-hash approach join_ip_log_feature.sql already uses -- never the raw IP).
-- After that, the code only verifies from that same IP; anyone else typing it in gets
-- `ip_locked` back instead of getting in. Clearing `locked_ip_hash` back to null in the table
-- editor releases the lock, e.g. if a legitimate tester's IP changed and they need back in.
--
-- Run this once in the Supabase SQL Editor.

create table if not exists public.access_keys (
  id              bigint generated always as identity primary key,
  code            text        not null unique,
  label           text,                          -- who this code was handed to, e.g. "tester 07"
  revoked         boolean     not null default false,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  locked_ip_hash  text                            -- set on first redemption; see note above
);

alter table public.access_keys enable row level security;
-- No policies created on purpose -- see note above. anon/authenticated get zero access;
-- only the verify-access-key edge function (using the service-role key, which bypasses RLS
-- entirely) can read or update rows here.
