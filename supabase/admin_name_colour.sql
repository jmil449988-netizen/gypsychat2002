-- Deep-red admin names -----------------------------------------------------------------------
--
-- To colour an admin's name everywhere it appears, each client needs to know WHICH user ids are
-- admins. The obvious shortcut is to put an "isAdmin" flag in the presence payload, but presence
-- is written by the client: anyone could set that flag from the browser console and wear an
-- admin-coloured name. That is the same impersonation problem the name claim closed, and a fake
-- moderator is worth more to a troll than a fake nickname, so the flag has to come from the
-- database instead.
--
-- public.admins currently has exactly one policy -- "see own admin row" (user_id = auth.uid()) --
-- so nobody can read the roster. This adds a second SELECT policy alongside it. Both are
-- permissive, so they OR together and every signed-in user can read the list. The old policy is
-- deliberately left in place rather than dropped: the new one is strictly broader, so nothing
-- that worked before can break.
--
-- What this exposes is the set of user ids that are admins -- no emails, no passwords, nothing
-- beyond the fact of being an admin, which is exactly what the red name announces anyway. Note
-- it grants SELECT only: INSERT/UPDATE/DELETE on admins are untouched, so this does not let
-- anyone make themselves an admin.

create policy "anyone signed in can see who the admins are"
  on public.admins for select to authenticated
  using (true);
