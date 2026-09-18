-- ============================================================================
-- Reply to a specific message
-- ============================================================================
-- One nullable self-reference on messages. A reply is an ordinary message that happens to point at
-- an earlier one; it is not a different kind of row, so nothing about sending, reading, moderation,
-- rate limiting or the 140/500 character caps has to know this column exists.
--
-- Only the id is stored -- never a copy of the quoted text. That matters for more than tidiness:
-- a denormalised snippet would be written by the sender's browser, which means anyone could put
-- words in someone else's mouth simply by lying about what they were replying to. Storing the id
-- and looking the original up at render time means the quote is always the real message, and the
-- existing select policy decides whether the reader is allowed to see it at all. Someone who
-- crafts a reply_to pointing at a whisper they cannot read gets a stub that resolves to nothing --
-- for them and for everyone else, because the lookup is governed by RLS like any other read.
--
-- on delete set null, not cascade: deleting a message must not delete the replies to it. A
-- conversation with a hole in it is better than a conversation that silently loses the answers
-- along with the question. The stub renders as "message removed" when the target is gone.

alter table public.messages add column if not exists reply_to bigint
  references public.messages(id) on delete set null;

-- Threads get the same treatment, so a reply inside a thread can quote a specific post rather than
-- the thread as a whole.
alter table public.thread_posts add column if not exists reply_to bigint
  references public.thread_posts(id) on delete set null;

-- Finding "the replies to this message" is not something the app does yet, but the index is cheap
-- and partial -- only rows that actually are replies -- so it costs almost nothing on a table where
-- the overwhelming majority of rows will never have a value here.
create index if not exists messages_reply_to on public.messages (reply_to) where reply_to is not null;
create index if not exists thread_posts_reply_to on public.thread_posts (reply_to) where reply_to is not null;

-- The insert policies already pin sender_id and sender_name to the signed-in person and refuse a
-- banned or muted sender; reply_to adds no new authority, so it needs no policy of its own. The
-- column grants mirror what the rest of the row already has. As with the board columns, Supabase's
-- defaults already cover this -- it is written out so the intent survives a future tightening.
grant insert (reply_to) on public.messages to authenticated;
grant insert (reply_to) on public.thread_posts to authenticated;
