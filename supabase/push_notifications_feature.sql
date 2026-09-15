-- Real Web Push notifications (whispers + mentions), reaching a device even with the browser fully
-- closed. Each browser installation that turns notifications on registers a "subscription" here
-- (the endpoint the push service gave it, plus the two keys needed to encrypt a message to it) --
-- one row per device/browser, so the same person can be subscribed on their phone and their laptop
-- at once. The send-push edge function reads this table (via its service-role key, so RLS below
-- only has to cover what the browser itself is allowed to do) whenever someone whispers or
-- mentions the row's owner.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, -- one browser installation = one endpoint, globally; re-subscribing updates the row in place (see the upsert below)
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A signed-in browser may only create, read, update or delete ITS OWN subscription rows (identified
-- by its own auth.uid()) -- it can never see or touch anyone else's. The edge function bypasses this
-- entirely with the service-role key, which is what lets it look up a *different* user's (the
-- recipient's) subscriptions when a whisper or mention comes in.
create policy "users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
