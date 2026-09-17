-- Hardening pass, 17 Sept 2026 -- from the diagnostics report of the same date -------------------
--
-- 1. Two security-definer functions had no fixed search_path (Supabase linter: "Function Search
--    Path Mutable"). Pin them like every other helper here.
-- 2. All 25 security-definer functions were executable by PUBLIC/anon (linter: "Public Can
--    Execute SECURITY DEFINER Function"). Nothing unsigned-in should be able to call them at all;
--    signed-in users keep EXECUTE because the row-level-security policies call these helpers as
--    the calling role, and service_role keeps it for the edge functions.
-- 3. Ballot Box notes now expire after ONE HOUR: the read policy stops returning them, and a
--    per-statement trigger on insert sweeps anything older out of the table (same "keep the table
--    small as a side effect of normal use" pattern as messages_trim_room). ballot_tags rows go
--    with their note via the existing ON DELETE CASCADE.
-- 4. The bug-reports storage bucket was public and listable, so anyone with the site's anon key
--    could enumerate and download every tester screenshot/recording. It is private now: reporters
--    still upload into their own folder; only admins can read, and the client fetches attachments
--    through short-lived signed URLs (see renderBugReports in app.js).
--
-- Run once in the Supabase SQL Editor.

-- 1 ---------------------------------------------------------------------------------------------
alter function public.is_muted_or_cooling(uuid) set search_path = public;
alter function public.rate_limit_reactions() set search_path = public;

-- 2 ---------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- 3 ---------------------------------------------------------------------------------------------
drop policy if exists "read the box" on public.ballot_notes;
create policy "read the box" on public.ballot_notes for select to authenticated
  using (created_at > now() - interval '1 hour');

create or replace function public.ballot_sweep() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ballot_notes where created_at < now() - interval '1 hour';
  return null;
end $$;
revoke execute on function public.ballot_sweep() from public, anon;
grant execute on function public.ballot_sweep() to authenticated, service_role;

drop trigger if exists ballot_notes_sweep on public.ballot_notes;
create trigger ballot_notes_sweep after insert on public.ballot_notes
  for each statement execute function public.ballot_sweep();

-- 4 ---------------------------------------------------------------------------------------------
update storage.buckets set public = false where id = 'bug-reports';
drop policy if exists "public read bug report attachments" on storage.objects;
create policy "admins read bug report attachments" on storage.objects for select to authenticated
  using (bucket_id = 'bug-reports' and public.is_admin(auth.uid()));
