-- Rolled-back tests for suggestions_feature.sql.
-- Run as:  begin;  <suggestions_feature.sql>  <this file>  rollback;
-- It always ends by raising, so the transaction can't commit by accident; the results come back in the error
-- text. Four throwaway people are made inside the transaction (one of them an admin) and vanish with it.
-- Storage objects are written as rows only (no files), to test the bucket's rules; they vanish too.

create function pg_temp.ck(label text, ok boolean, info text default '') returns void language plpgsql as $f$
begin
  perform set_config('sg.log', coalesce(current_setting('sg.log', true), '')
    || case when coalesce(ok, false) then 'ok   ' else 'FAIL ' end || label
    || case when coalesce(info, '') <> '' then ' [' || info || ']' else '' end || chr(10), true);
  if not coalesce(ok, false) then
    perform set_config('sg.fails', (coalesce(nullif(current_setting('sg.fails', true), ''), '0')::int + 1)::text, true);
  end if;
end $f$;
-- run one statement as a signed-in person; returns the error text, or '' if it went through
create function pg_temp.try_as(p uuid, q text) returns text language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute q;
  exception when others then
    reset role;
    return sqlerrm;
  end;
  reset role;
  return '';
end $f$;
create function pg_temp.count_as(p uuid, q text) returns int language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute q into n;
  reset role;
  return n;
end $f$;

do $$
declare
  P uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  a uuid; b uuid; adm uuid; ban uuid;
  err text; s public.suggestions; n int; bk record; i int;
  att text;
begin
  perform set_config('sg.log', '', true); perform set_config('sg.fails', '0', true);
  a := P[1]; b := P[2]; adm := P[3]; ban := P[4];
  for i in 1..4 loop
    insert into auth.users (id) values (P[i]);
    insert into public.profiles (user_id, name) values (P[i], 'zzSuggestTest' || i);
  end loop;
  insert into public.admins (user_id) values (adm);
  insert into public.bans (user_id) values (ban);

  ------------------------------------------------------------------ filing
  err := pg_temp.try_as(a, format('insert into public.suggestions (author_id, author_name, body, status, resolved_by) values (%L, %L, %L, %L, %L)',
    a, 'The Admin', '  Add a dark mode for the Game Room  ', 'done', adm));
  select * into s from public.suggestions where author_id = a order by id desc limit 1;
  perform pg_temp.ck('01 text-only suggestion is filed', err = '' and s.id is not null, err);
  perform pg_temp.ck('02 the name comes from the profile, not the browser', s.author_name = 'zzSuggestTest1', s.author_name);
  perform pg_temp.ck('03 always starts open, whatever the browser sent', s.status = 'open' and s.resolved_by is null and s.resolved_at is null, s.status);
  perform pg_temp.ck('04 the text is trimmed', s.body = 'Add a dark mode for the Game Room', s.body);

  att := format('[{"path": "%s/1726600000000-ab12.png", "type": "image", "name": "idea.png", "url": "https://x", "junk": 1},
                  {"path": "%s/1726600000001-cd34.mp4", "type": "video", "name": "clip.mp4"}]', b, b);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body, attachments, context) values (%L, %L, %L::jsonb, %L)', b, 'Picture and video', att, 'Test browser — 390x844'));
  select * into s from public.suggestions where author_id = b order by id desc limit 1;
  perform pg_temp.ck('05 a picture and a video in your own folder are accepted', err = '' and jsonb_array_length(s.attachments) = 2, err);
  perform pg_temp.ck('06 only path, type and name are kept, in order', s.attachments->0 = jsonb_build_object('path', b || '/1726600000000-ab12.png', 'type', 'image', 'name', 'idea.png')
    and s.attachments->1->>'type' = 'video', s.attachments::text);
  perform pg_temp.ck('07 the context is kept', s.context = 'Test browser — 390x844', s.context);

  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body, attachments) values (%L, %L, %L::jsonb)', b, 'x',
    format('[{"path": "%s/steal.png", "type": "image"}]', a)));
  perform pg_temp.ck('08 an attachment in someone else''s folder is refused', err like '%attachments isn''t right%', err);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body, attachments) values (%L, %L, %L::jsonb)', b, 'x',
    format('[{"path": "%s/a.exe", "type": "program"}]', b)));
  perform pg_temp.ck('09 an attachment that isn''t a picture or video is refused', err like '%attachments isn''t right%', err);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body, attachments) values (%L, %L, %L::jsonb)', b, 'x',
    format('[{"path": "%s/../../x.png", "type": "image"}]', b)));
  perform pg_temp.ck('10 a path that climbs out of the folder is refused', err like '%attachments isn''t right%', err);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body, attachments) values (%L, %L, %L::jsonb)', b, 'x',
    (select jsonb_agg(jsonb_build_object('path', b || '/f' || g || '.png', 'type', 'image'))::text from generate_series(1, 6) g)));
  perform pg_temp.ck('11 six attachments are refused (five at most)', err <> '', err);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body) values (%L, %L)', b, '   '));
  perform pg_temp.ck('12 an empty suggestion is refused', err <> '', err);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body) values (%L, %L)', b, repeat('x', 2001)));
  perform pg_temp.ck('13 over 2,000 characters is refused', err <> '', err);
  err := pg_temp.try_as(b, format('insert into public.suggestions (author_id, body) values (%L, %L)', a, 'pretending to be someone else'));
  perform pg_temp.ck('14 filing as someone else is refused', err <> '', err);
  err := pg_temp.try_as(ban, format('insert into public.suggestions (author_id, body) values (%L, %L)', ban, 'banned'));
  perform pg_temp.ck('15 a banned person can''t file', err <> '', err);
  set local role anon;
  begin
    insert into public.suggestions (author_id, body) values (a, 'anon'); err := '';
  exception when others then err := sqlerrm;
  end;
  reset role;
  perform pg_temp.ck('16 someone not signed in can''t file', err <> '', err);

  ------------------------------------------------------------------ the throttle
  for i in 1..3 loop
    err := pg_temp.try_as(a, format('insert into public.suggestions (author_id, body) values (%L, %L)', a, 'more ' || i));
  end loop;
  perform pg_temp.ck('17 five in ten minutes go through', err = '' and (select count(*) from public.suggestions where author_id = a) = 4 + 0, err);
  err := pg_temp.try_as(a, format('insert into public.suggestions (author_id, body) values (%L, %L)', a, 'fifth'));
  perform pg_temp.ck('18 ...the fifth too', err = '', err);
  err := pg_temp.try_as(a, format('insert into public.suggestions (author_id, body) values (%L, %L)', a, 'sixth'));
  perform pg_temp.ck('19 the sixth in ten minutes is refused, kindly', err like '%lot of suggestions%', err);
  update public.suggestions set created_at = now() - interval '11 minutes' where author_id = a;
  err := pg_temp.try_as(a, format('insert into public.suggestions (author_id, body) values (%L, %L)', a, 'later'));
  perform pg_temp.ck('20 ...and goes through ten minutes later', err = '', err);
  update public.suggestions set created_at = now() - interval '2 hours' where author_id = a;
  for i in 1..14 loop                                   -- as the owner, aged as we go: twenty today, none recent
    insert into public.suggestions (author_id, body) values (a, 'filler ' || i);
    update public.suggestions set created_at = now() - interval '2 hours' where author_id = a;
  end loop;
  err := pg_temp.try_as(a, format('insert into public.suggestions (author_id, body) values (%L, %L)', a, 'twenty-first'));
  perform pg_temp.ck('21 twenty a day at most', err like '%lot of suggestions%', err || ' / ' || (select count(*) from public.suggestions where author_id = a));

  ------------------------------------------------------------------ who can see and change them
  n := pg_temp.count_as(a, 'select count(*) from public.suggestions');
  perform pg_temp.ck('22 people can''t read suggestions, not even their own', n = 0, n::text);
  err := pg_temp.try_as(b, format('update public.suggestions set status = %L where author_id = %L', 'done', b));
  perform pg_temp.ck('23 people can''t mark their own done', err = '' and (select status from public.suggestions where author_id = b limit 1) = 'open', err);
  err := pg_temp.try_as(b, format('delete from public.suggestions where author_id = %L', b));
  perform pg_temp.ck('24 people can''t delete them', (select count(*) from public.suggestions where author_id = b) = 1, err);
  n := pg_temp.count_as(adm, 'select count(*) from public.suggestions where status = ''open''');
  perform pg_temp.ck('25 an admin reads them all', n = (select count(*) from public.suggestions), n::text);
  err := pg_temp.try_as(adm, format('update public.suggestions set status = %L, resolved_by = %L, resolved_at = now() where author_id = %L', 'done', adm, b));
  perform pg_temp.ck('26 an admin marks one done', err = '' and (select status from public.suggestions where author_id = b limit 1) = 'done', err);
  err := pg_temp.try_as(adm, format('update public.suggestions set status = %L where author_id = %L', 'maybe', b));
  perform pg_temp.ck('27 only open / done / dismissed', err <> '', err);
  perform pg_temp.ck('28 the trigger function can''t be called from a browser', not has_function_privilege('authenticated', 'public.suggestions_before_insert()', 'execute')
    and not has_function_privilege('anon', 'public.suggestions_before_insert()', 'execute'));
  perform pg_temp.ck('29 in the realtime publication', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestions'));
  perform pg_temp.ck('30 anon has no rights on the table', not has_table_privilege('anon', 'public.suggestions', 'select') and not has_table_privilege('anon', 'public.suggestions', 'insert'));

  ------------------------------------------------------------------ the bucket
  select * into bk from storage.buckets where id = 'suggestions';
  perform pg_temp.ck('31 a private bucket, 50 MB a file, pictures and video only', bk.public = false and bk.file_size_limit = 52428800
    and bk.allowed_mime_types @> array['image/png', 'video/mp4', 'video/quicktime'] and not (bk.allowed_mime_types @> array['text/html']), format('%s %s', bk.public, bk.file_size_limit));
  err := pg_temp.try_as(a, format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'suggestions', a || '/1726600000000-zz.png'));
  perform pg_temp.ck('32 upload into your own folder', err = '', err);
  err := pg_temp.try_as(a, format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'suggestions', b || '/1726600000000-zz.png'));
  perform pg_temp.ck('33 upload into someone else''s folder is refused', err <> '', err);
  n := pg_temp.count_as(a, 'select count(*) from storage.objects where bucket_id = ''suggestions''');
  perform pg_temp.ck('34 people can''t list or read the bucket, not even their own uploads', n = 0, n::text);
  n := pg_temp.count_as(adm, format('select count(*) from storage.objects where bucket_id = %L and name like %L', 'suggestions', a || '/%'));
  perform pg_temp.ck('35 an admin can read them (to sign links)', n = 1, n::text);

  raise exception 'RESULT % checks, % failed%', (select count(*) from regexp_matches(current_setting('sg.log'), chr(10), 'g')),
    current_setting('sg.fails'), chr(10) || current_setting('sg.log');
end $$;
