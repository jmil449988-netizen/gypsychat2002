-- Raise/lower character caps to match the client:
--   * main room chat messages: 140 characters (was 500)
--   * whispers (DMs): unchanged at 500
--   * thread posts and replies: 1000 characters (was 500)
-- Run once in the Supabase SQL Editor.

-- messages.body's existing check constraint doesn't have a name we chose (it was declared inline
-- in CREATE TABLE), so find whatever Postgres auto-named it and drop that, then add a new one that
-- splits the cap by message type: room messages (recipient_id is null) get 140, whispers keep 500.
do $$
declare
  conname text;
begin
  select con.conname into conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'messages' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%body%';
  if conname is not null then
    execute format('alter table public.messages drop constraint %I', conname);
  end if;
end $$;

alter table public.messages add constraint messages_body_check check (
  (recipient_id is null and char_length(body) between 1 and 140)
  or (recipient_id is not null and char_length(body) between 1 and 500)
);

-- Thread posts/replies: raise the cap from 500 to 1000 characters. These constraint names are
-- known (added in thread_images_feature.sql), so a plain drop/recreate is enough.
alter table public.threads drop constraint if exists threads_body_check;
alter table public.threads add constraint threads_body_check check (body is null or char_length(body) <= 1000);

alter table public.thread_posts drop constraint if exists thread_posts_body_check;
alter table public.thread_posts add constraint thread_posts_body_check check (body is null or char_length(body) <= 1000);
