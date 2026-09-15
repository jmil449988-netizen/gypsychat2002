-- Reports -------------------------------------------------------------------------------------
--
-- The Report menu item (name menu → Report, and /report) has been calling
-- sb.from('reports').insert(...) since it was written, but the reports table never existed --
-- every report has been silently failing with a "relation does not exist" error, shown to the
-- reporter as "Could not send report: ..." and going nowhere. This creates the table the
-- existing client code already expects, plus a `status` column and the RLS an admin review page
-- needs to list and act on them (see also the /reports slash command, which does a plain select
-- and works unmodified once this table exists).
--
-- Run this once in the Supabase SQL Editor.

create table if not exists public.reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  reporter_id   uuid        not null references auth.users(id) on delete cascade,
  reporter_name text,
  reported_id   uuid        not null references auth.users(id) on delete cascade,
  reported_name text,
  reason        text        not null check (char_length(reason) between 1 and 300),
  status        text        not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  resolved_by   uuid        references auth.users(id) on delete set null,
  resolved_at   timestamptz
);
create index if not exists reports_status_time on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Anyone signed in can file a report about someone else, as themselves, once.
create policy "report as self" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and reporter_id <> reported_id);

-- Only admins get to see the queue (reporters aren't shown other people's reports, or even that
-- their own went anywhere beyond the "thank you" message -- same as before this table existed).
create policy "admins read reports" on public.reports for select to authenticated
  using (public.is_admin(auth.uid()));

-- Dismiss / mark-actioned from the review page.
create policy "admins update reports" on public.reports for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- So the admin reports page updates live as new ones come in, the same way threads/messages do.
alter publication supabase_realtime add table public.reports;
