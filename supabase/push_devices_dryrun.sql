-- Rolled-back tests for push_devices_fix.sql.
-- Run as:  begin;  <push_devices_fix.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction cannot commit by accident.

do $$
declare
  AA  uuid;
  SIG uuid;
  ep  text := 'https://push.example.invalid/dryrun/' || md5(random()::text);
  o text := ''; n int; owner uuid;
begin
  select user_id into AA  from public.profiles where lower(name) = lower('AA.Romani.world') limit 1;
  select user_id into SIG from public.profiles where lower(name) = lower('S.S SIGINT') limit 1;
  if AA is null or SIG is null then raise exception 'RESULT could not resolve the test users'; end if;

  o := o || format('0. anon may call it: %s (want f)%s',
    has_function_privilege('anon', 'public.gc_save_push_subscription(text, text, text)', 'execute'), chr(10));

  -- a device first registered by one account ...
  perform set_config('request.jwt.claims', json_build_object('sub', SIG, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.gc_save_push_subscription(ep, repeat('k', 87), repeat('a', 22));
  reset role;
  select user_id into owner from public.push_subscriptions where endpoint = ep;
  o := o || format('1. first account registers the device: owner is them: %s (want t)%s', owner = SIG, chr(10));

  -- ... then used by another: the OLD way, a plain upsert, must still fail (this is the bug) ...
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values (AA, ep, repeat('k', 87), repeat('a', 22))
      on conflict (endpoint) do update set user_id = excluded.user_id;
    o := o || '2. plain upsert took the device over (the old bug is not reproducible)' || chr(10);
  exception when others then
    o := o || format('2. plain upsert refused, as the old client saw it: %s%s', sqlerrm, chr(10));
  end;
  -- ... the new way takes it over
  perform public.gc_save_push_subscription(ep, repeat('K', 87), repeat('A', 22));
  reset role;
  select user_id into owner from public.push_subscriptions where endpoint = ep;
  select count(*) into n from public.push_subscriptions where endpoint = ep;
  o := o || format('3. second account saves it: owner is now them: %s, rows for it: %s (want t, 1)%s', owner = AA, n, chr(10));

  -- nonsense is refused
  perform set_config('request.jwt.claims', json_build_object('sub', AA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.gc_save_push_subscription('javascript:alert(1)', repeat('k', 87), repeat('a', 22));
    o := o || '4. NON-HTTPS ENDPOINT ACCEPTED' || chr(10);
  exception when others then
    o := o || format('4. non-https endpoint refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  begin
    perform public.gc_save_push_subscription(ep, '', '');
    o := o || '5. EMPTY KEYS ACCEPTED' || chr(10);
  exception when others then
    o := o || format('5. empty keys refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  reset role;

  -- signed out: nothing
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.gc_save_push_subscription(ep, repeat('k', 87), repeat('a', 22));
    o := o || '6. ANON SAVED A DEVICE' || chr(10);
  exception when others then
    o := o || format('6. anon refused: ok (%s)%s', sqlerrm, chr(10));
  end;
  reset role;

  raise exception 'RESULT %', chr(10) || o;
end $$;
