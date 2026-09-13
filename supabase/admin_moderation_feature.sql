-- Admin moderation additions: manually muting someone (not just lifting an auto-mute), and
-- deleting threads/replies from the threads board. Run once in the Supabase SQL Editor.

-- Muting someone who has never tripped the spam filter has no row in chat_moderation yet, so the
-- client does an upsert. An UPDATE policy for admins already exists; this adds the matching INSERT
-- half so the "insert" side of that upsert is allowed too.
drop policy if exists "admins insert moderation" on public.chat_moderation;
create policy "admins insert moderation" on public.chat_moderation for insert to authenticated
  with check (public.is_admin(auth.uid()));

-- Admins can delete a whole thread (its replies cascade-delete via the existing FK) or a single
-- reply. No policy existed for delete on either table before this, so both were previously
-- impossible for anyone, admin or not.
drop policy if exists "admins delete threads" on public.threads;
create policy "admins delete threads" on public.threads for delete to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins delete thread posts" on public.thread_posts;
create policy "admins delete thread posts" on public.thread_posts for delete to authenticated
  using (public.is_admin(auth.uid()));

-- By default Postgres only includes primary-key columns in a DELETE's "old row" realtime payload.
-- Full replica identity means every open board gets the full old row (including thread_id on a
-- deleted reply), so it can find the right thread to update its reply count without a re-fetch.
alter table public.threads replica identity full;
alter table public.thread_posts replica identity full;
