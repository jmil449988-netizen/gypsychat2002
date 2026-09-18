-- Push devices follow whoever is signed in on them (v163)
--
-- A device is registered for push by saving its subscription (endpoint + two keys) in
-- push_subscriptions, one row per endpoint. The browser used to do that with a plain upsert on
-- endpoint -- and RLS only lets a browser touch rows that are ALREADY its own. So a device that had
-- ever been registered under another account (a log out and back in as someone else, a new
-- anonymous login, a second character on the same phone) could never be registered again: the
-- upsert hit the other account's row, RLS refused it, and the error was never checked. The old
-- account went on getting that device's notifications -- whisper previews included -- and the
-- account actually using the device got none.
--
-- gc_save_push_subscription() takes the endpoint over for whoever is signed in. That is safe
-- because an endpoint is a secret only the browser that owns it knows (nobody can read anyone
-- else's rows, and push services issue unguessable URLs); the worst a thief of someone's endpoint
-- could do is stop that person's pushes until their app next saves it again, and they could not
-- read them -- a push is encrypted to the keys the device itself holds.
--
-- Idempotent, in the style of every other migration here.

create or replace function public.gc_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2000 then
    raise exception 'That is not a push endpoint.';
  end if;
  if p_p256dh is null or char_length(p_p256dh) not between 16 and 256
     or p_auth is null or char_length(p_auth) not between 8 and 128 then
    raise exception 'Those are not push keys.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (me, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- Named explicitly: Supabase grants EXECUTE on new functions to anon and authenticated by default,
-- and revoking from PUBLIC alone does not remove a grant made to a named role.
revoke all on function public.gc_save_push_subscription(text, text, text) from public, anon;
grant execute on function public.gc_save_push_subscription(text, text, text) to authenticated;
