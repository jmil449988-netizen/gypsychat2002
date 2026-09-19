// send-board-push — one push per person who follows a Threads board.
//
// Deliberately a SEPARATE function from send-push rather than a branch inside it. send-push is
// what carries every whisper, mention, friend request and game invite; it works, and a bug
// introduced while extending it would take all of that down at once. This function cannot affect
// it. It uses the same library and the same VAPID secrets, so nothing about the encryption or the
// signing is reimplemented here — web-push does that work in both places.
//
// The fan-out has to happen here rather than in the browser for one reason: nobody may read who
// follows what. thread_sub_targets() is SECURITY DEFINER and executable only by service_role, so
// the recipient list exists exclusively inside this function. The caller names a board; it never
// learns, and never could learn, who is on it.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// A ceiling on how many devices one post can wake. It is not a rate limit -- it is a blast-radius
// bound, so that a bug or a bad actor cannot turn a single thread into thousands of notifications.
// Well above any plausible board for a long time; revisit when a board approaches it.
const MAX_FANOUT = 300;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Who is asking. An unauthenticated caller gets nothing: this endpoint can wake a lot of phones,
  // so it is not open to the anon key alone.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'missing token' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'bad token' }, 401);
  const callerId = userData.user.id;

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const board = typeof payload.board === 'string' ? payload.board : '';
  let title = typeof payload.title === 'string' ? payload.title.slice(0, 120) : 'Gypsy Chat 2000';
  const body = (typeof payload.body === 'string' ? payload.body.slice(0, 200) : '').replace(/https?:\/\/\S+/gi, '[link]');
  const tag = typeof payload.tag === 'string' ? payload.tag.slice(0, 60) : 'gc-board';
  const threadId = Number(payload.thread);
  if (!board) return json({ error: 'no board' }, 400);
  if (!Number.isFinite(threadId) || threadId <= 0) return json({ error: 'no thread' }, 400);

  // Hardened 19 Sept 2026 (supabase/hardening_2026_09_19.sql): board_push_gate() only lets a push out
  // for a thread this caller really posted on this board in the last five minutes, once per thread,
  // one a minute per person -- before, any account could push any text to every follower of a board.
  const { data: verdict, error: gateErr } = await admin.rpc('board_push_gate', { p_from: callerId, p_thread: threadId, p_board: board });
  if (gateErr) return json({ error: 'gate failed', detail: gateErr.message }, 500);
  if (verdict !== 'ok') return json({ error: verdict }, 403);
  const { data: prof } = await admin.from('profiles').select('name').eq('user_id', callerId).maybeSingle();
  const senderName = prof && prof.name ? String(prof.name) : 'Someone';
  if (title.toLowerCase().indexOf(senderName.toLowerCase()) !== 0) title = (senderName + ': ' + title).slice(0, 120);

  // The exclude is always the caller, taken from the verified token rather than from the body.
  // The client sends its own id too, but trusting that would let anyone suppress or redirect a
  // notification for somebody else. You are never pushed your own post.
  const { data: targets, error: targetErr } = await admin.rpc('thread_sub_targets', {
    p_board: board,
    p_exclude: callerId,
  });
  if (targetErr) return json({ error: 'targets failed', detail: targetErr.message }, 500);

  const ids = (targets ?? []).map((r: { user_id: string }) => r.user_id).slice(0, MAX_FANOUT);
  if (!ids.length) return json({ sent: 0, followers: 0 });

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', ids);
  if (subErr) return json({ error: 'subs failed', detail: subErr.message }, 500);

  const note = JSON.stringify({ title, body, tag, url: './' });
  let sent = 0;
  const dead: string[] = [];
  const failed: number[] = [];

  // Sent in parallel: a slow or unreachable push service for one person must not delay everyone
  // else, and there is no ordering between recipients to preserve.
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        note,
        // 18 Sept 2026: this was missing, and it is why no board notification ever showed up.
        // Without an explicit urgency the push service is free to treat the message as low
        // priority and hold it until the device next wakes for some other reason -- FCM, which
        // carries every Chrome and Android push, does exactly that. send-push learned this long
        // ago (see the comment there) and passes the same two options; this function was written
        // later, from scratch, and left them out. "sent" below only ever meant "the push service
        // accepted it", which it always did, so the function reported success throughout.
        // TTL: how long an undeliverable push waits for an offline device -- 12 hours, as in
        // send-push, so a phone that was off all day does not wake to a pile of stale posts.
        { urgency: 'high', TTL: 43200 },
      );
      sent++;
    } catch (e) {
      // 404 and 410 mean the browser threw this subscription away -- the app was uninstalled, or
      // site data was cleared. Those rows are dead for good and are removed, or the table grows a
      // tail of endpoints that can never receive anything again.
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
      else failed.push(code ?? 0);
    }
  }));

  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead);

  // One line per call in the function's Logs tab: counts and status codes only, never who.
  console.log(JSON.stringify({ board, followers: ids.length, devices: (subs ?? []).length, sent, pruned: dead.length, failed }));
  return json({ sent, followers: ids.length, devices: (subs ?? []).length, pruned: dead.length, failed });
});
