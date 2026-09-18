-- ============================================================================
-- Sharing a thread, or somebody's card, into a whisper
-- ============================================================================
-- Two nullable columns on messages, and only an ID in each -- never a copy of what is being
-- shared. This is the same reasoning as reply_to and for the same reason: a denormalised snippet
-- or name would be written by the sender's browser, so anyone could hand a friend a card that
-- claimed to be a different person, or a thread preview whose text was never in that thread.
-- Storing the id and resolving it at render time means the card is always the real row, and the
-- reader's own select policies decide what resolves at all.
--
-- A share is a whisper thing. There is no way to drop a profile card into the main room, and the
-- constraint says so rather than trusting the client not to try. At most one kind per message, so
-- a row is either a thread share or a person share and never an ambiguous both.
--
-- on delete set null throughout: deleting a thread, or an account going away, must not delete the
-- conversation that mentioned it. The card renders as "no longer available" instead.

alter table public.messages add column if not exists share_thread bigint
  references public.threads(id) on delete set null;
alter table public.messages add column if not exists share_user uuid
  references auth.users(id) on delete set null;

alter table public.messages drop constraint if exists messages_share_is_whisper;
alter table public.messages add constraint messages_share_is_whisper
  check ((share_thread is null and share_user is null) or recipient_id is not null);

alter table public.messages drop constraint if exists messages_share_one_kind;
alter table public.messages add constraint messages_share_one_kind
  check (share_thread is null or share_user is null);

grant insert (share_thread, share_user) on public.messages to authenticated;
