-- Group members in the realtime feed (v160)
--
-- group_chats_feature.sql (v154) never added conversation_members to the supabase_realtime
-- publication, but the app listens to it on the room channel (watchGroupMembership). Realtime
-- creates all of a channel's postgres_changes subscriptions in ONE transaction and rolls the
-- whole lot back when any table in it is missing from the publication. So from build 154 on,
-- the room channel had no live messages, whispers, group lines, reactions, read receipts, game
-- moves or XP updates at all -- while still reporting SUBSCRIBED, and with presence and
-- broadcasts (typing, buzz, sounds) still working, which is why it looked alive.
--
-- Found 18 Sept 2026: realtime.subscription had no rows for any of the room channel's tables
-- while three clients were connected. Confirmed with two probe channels -- threads alone:
-- "Subscribed to PostgreSQL"; threads + conversation_members: "Unable to subscribe to changes
-- with given parameters ... table: conversation_members".
--
-- Rule for every migration from here on: a table the client listens to goes into the
-- publication BEFORE the client that listens to it ships.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;
