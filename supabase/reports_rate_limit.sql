-- Rate-limit filing reports --------------------------------------------------------------------
--
-- reports_feature.sql gave "report as self" an ownership check but no throttle -- unlike messages
-- and thread_posts, which have both a hard rate-limit trigger (5 per 5s) AND the shared
-- gc_check_and_record_send cooldown/mute system on top. A signed-in user (or anyone driving the
-- Supabase API directly with the public anon key) could flood the admin reports queue with
-- hundreds of rows with nothing to stop them.
--
-- Same shape as the existing thread_posts/threads rate-limit triggers (threads_feature.sql):
-- a hard per-user cap, checked before insert. Reports are meant to be an occasional action, not a
-- chat message, so the window is generous relative to messaging (5 per 60 seconds, not 5 per 5).
--
-- Run this once in the Supabase SQL Editor.

create or replace function public.rate_limit_reports() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '60 seconds') >= 5 then
    raise exception 'Slow down.';
  end if;
  return new;
end;
$function$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.rate_limit_reports();
