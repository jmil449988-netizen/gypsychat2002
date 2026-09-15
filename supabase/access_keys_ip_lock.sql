-- Adds IP-locking to access_keys, for a site that already ran access_keys_feature.sql before
-- this column existed. See the updated comment block at the top of access_keys_feature.sql and
-- the verify-access-key edge function for the full explanation -- in short: `locked_ip_hash`
-- starts null and gets set (via a conditional UPDATE, so two simultaneous first-redemptions of
-- the same fresh code can't both win) to a salted hash of whichever IP first redeems a code.
-- Every later check of that code then has to come from the same IP hash.
--
-- Safe to run against a database that already has this column (the IF NOT EXISTS guards make it
-- a no-op there) as well as one that doesn't yet.
--
-- Run this once in the Supabase SQL Editor.

alter table public.access_keys add column if not exists locked_ip_hash text;
