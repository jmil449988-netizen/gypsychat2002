-- Admins can't be blocked -------------------------------------------------------------------------
-- By anyone: a regular player can't block an admin, and admins can't block each other. The old
-- "manage own blocks" policy is split so the insert side can check the target. Existing blocks
-- that point at an admin are removed so the rule holds for old rows too.
-- Run once in the Supabase SQL Editor.
drop policy if exists "manage own blocks" on public.blocks;
create policy "read own blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "block someone" on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid() and not public.is_admin(blocked_id));
create policy "unblock someone" on public.blocks for delete to authenticated using (blocker_id = auth.uid());
delete from public.blocks where public.is_admin(blocked_id);
