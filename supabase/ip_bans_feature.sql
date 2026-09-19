-- Bans follow the network (build 177, for the release) -------------------------------------------------
--
-- During the beta a ban stuck because every invite key was IP-locked: a banned tester could not just make
-- a new character. Without keys (INVITE_KEY_REQUIRED off) a new anonymous login is one reload away, so the
-- ban has to remember the network instead:
--   * bans.ip_hash -- the salted hash of the IP the banned account last joined from (the same hash the
--     verify-join edge function writes to join_ip_log; the salt is IP_HASH_SALT, a function secret, so
--     nothing here can be turned back into an address). Stamped by a trigger whenever a ban is written
--     (admins ban from the client with a plain upsert), backfilled for the bans that exist today, and
--     kept by the release reset (bans is a kept table; join_ip_log is wiped, which is why the stamp lives
--     on the ban itself).
--   * verify-join, on every fresh sign-on: if an active ban carries this join's ip_hash, the new account
--     is banned too (reason "same network as <name>", same expiry) and the join answers reason "banned";
--     the client tells them and stops. See supabase/functions/verify-join/index.ts.
-- A shared network (a family, a phone carrier's NAT) can catch a bystander: an admin lifts it with /unban
-- as with any ban, and lifting the original ban also stops it spreading further.
--
-- Run once in the Supabase SQL Editor, then deploy the updated verify-join function from the dashboard.

alter table public.bans add column if not exists ip_hash text;
create index if not exists bans_ip_hash on public.bans (ip_hash) where ip_hash is not null;

create or replace function public.bans_stamp_ip() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ip_hash is null then
    select ip_hash into new.ip_hash from public.join_ip_log where user_id = new.user_id order by created_at desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists bans_stamp_ip on public.bans;
create trigger bans_stamp_ip before insert or update of user_id on public.bans for each row execute function public.bans_stamp_ip();

-- the bans that exist today
update public.bans b set ip_hash = l.ip_hash
  from (select distinct on (user_id) user_id, ip_hash from public.join_ip_log order by user_id, created_at desc) l
  where l.user_id = b.user_id and b.ip_hash is null;
