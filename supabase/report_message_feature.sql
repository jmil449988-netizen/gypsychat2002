-- Report a specific message ---------------------------------------------------------------------
--
-- The Report flow (name menu → Report, /report, and now the 🚩 on a message) has always filed a
-- report about a PERSON with a freeform reason -- there was no way to point at the exact message
-- that prompted it, so an admin reviewing the queue only ever saw a name and whatever the reporter
-- remembered to type. This adds two optional columns so a report can carry a snapshot of the
-- actual message: which one (message_id, best-effort -- see below) and its exact text
-- (message_body, so the queue still shows something even if the message is ever deleted).
--
-- Both columns are nullable on purpose: reports filed the old way (no specific message in hand)
-- still insert exactly as before with these left null, and renderReports()/the /reports command
-- on the client already only show the quote block when message_body is present.
--
-- message_id is "best-effort" rather than verified: like reporter_name/reported_name before it,
-- it's trusted client input, not re-derived server-side from sender_id/created_at. That's an
-- intentional match to how every other snapshot field on this table already works -- this is an
-- abuse-report queue for admins to act on quickly, not a court record.
--
-- Run this once in the Supabase SQL Editor.

alter table public.reports add column if not exists message_id bigint references public.messages(id) on delete set null;
alter table public.reports add column if not exists message_body text check (message_body is null or char_length(message_body) <= 500);
