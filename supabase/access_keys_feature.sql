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
-- Run this once in the Supabase SQL Editor.

create table if not exists public.access_keys (
  id            bigint generated always as identity primary key,
  code          text        not null unique,
  label         text,                          -- who this code was handed to, e.g. "tester 07"
  revoked       boolean     not null default false,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.access_keys enable row level security;
-- No policies created on purpose -- see note above. anon/authenticated get zero access;
-- only the verify-access-key edge function (using the service-role key, which bypasses RLS
-- entirely) can read or update rows here.
