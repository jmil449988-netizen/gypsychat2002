// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Sends a real Web Push notification (reaches the device even with the browser fully closed) for a
// whisper, a mention, a buzz, a challenge, a table invite. Called by the SENDER's client right after
// the thing happened -- only the sender's browser is guaranteed to be open at that moment. Looks up
// every push subscription the recipient has registered (phone, laptop...) and sends to all of them,
// cleaning up any the push service reports as gone (404/410).
//
// Hardened 19 Sept 2026 (see supabase/hardening_2026_09_19.sql): the browser still supplies the target
// and the text, but the database's push_gate() decides whether THIS caller may push to THIS target at
// all -- some standing between the two (whispers allowed, a live game or table, a pending friend
// request, a shared group), no block either way, the caller not banned or muted, at most 60 pushes an
// hour and none to the same person within 3 seconds. Before that, any signed-in account could push any
// text to any account: a spam and phishing channel wearing the app's own notification badge. The title
// is also prefixed with the caller's real name unless it already starts with it, so a push can never
// pretend to be the house.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return Response.json({ ok: false, reason: "unauthenticated" }, { status: 401, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData || !userData.user) {
      return Response.json({ ok: false, reason: "unauthenticated" }, { status: 401, headers: corsHeaders });
    }
    if (!vapidPublicKey || !vapidPrivateKey) {
      return Response.json({ ok: false, reason: "not_configured" }, { status: 503, headers: corsHeaders });
    }
    let body: any = {};
    try { body = await req.json(); } catch (_e) { body = {}; }
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
    let title = typeof body.title === "string" ? body.title.slice(0, 120) : "Gypsy Chat 2000";
    const msg = typeof body.body === "string" ? body.body.slice(0, 200) : "";
    const tag = typeof body.tag === "string" ? body.tag.slice(0, 60) : "gc-push";
    if (!targetUserId) {
      return Response.json({ ok: false, reason: "bad_request" }, { status: 400, headers: corsHeaders });
    }
    if (targetUserId === userData.user.id) {
      return Response.json({ ok: true, sent: 0, removed: 0, retried: 0 }, { headers: corsHeaders });
    }

    // the gate: who may push to whom, and how often (records the send when it says ok)
    const { data: verdict, error: gateErr } = await admin.rpc("push_gate", { p_from: userData.user.id, p_to: targetUserId });
    if (gateErr) {
      console.error("push_gate failed", gateErr);
      return Response.json({ ok: false, reason: "db_error" }, { status: 500, headers: corsHeaders });
    }
    if (verdict !== "ok") {
      return Response.json({ ok: false, reason: verdict }, { status: 403, headers: corsHeaders });
    }
    // the title carries the sender's real name, whatever the browser sent
    const { data: prof } = await admin.from("profiles").select("name").eq("user_id", userData.user.id).maybeSingle();
    const senderName = prof && prof.name ? String(prof.name) : "Someone";
    if (title.toLowerCase().indexOf(senderName.toLowerCase()) !== 0) title = (senderName + ": " + title).slice(0, 120);
    // no links ride in a push
    const cleanMsg = msg.replace(/https?:\/\/\S+/gi, "[link]");

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", targetUserId);
    if (subsErr) {
      return Response.json({ ok: false, reason: "db_error" }, { status: 500, headers: corsHeaders });
    }
    const payload = JSON.stringify({ title, body: cleanMsg, tag, url: "./" });
    // 'high' urgency so FCM wakes the device instead of queueing the push until the next natural
    // wake-up; TTL 12 h so a long-offline phone doesn't get a flood on return (RFC 8030)
    const sendOnce = (s: any) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { urgency: "high", TTL: 43200 },
      );
    let sent = 0, removed = 0, retried = 0;
    await Promise.all((subs || []).map(async (s: any) => {
      try {
        await sendOnce(s);
        sent++;
      } catch (err: any) {
        const status = err && (err.statusCode || (err.response && err.response.statusCode));
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          removed++;
          return;
        }
        // one retry after a short pause for anything else (a cold push service, a blip)
        await new Promise((r) => setTimeout(r, 800));
        try {
          await sendOnce(s);
          sent++; retried++;
        } catch (err2: any) {
          const status2 = err2 && (err2.statusCode || (err2.response && err2.response.statusCode));
          if (status2 === 404 || status2 === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
            removed++;
          } else {
            console.warn("push failed", status2 || err2);
          }
        }
      }
    }));
    return Response.json({ ok: true, sent, removed, retried }, { headers: corsHeaders });
  } catch (err) {
    console.error("send-push error", err);
    return Response.json({ ok: false, reason: "server_error" }, { status: 500, headers: corsHeaders });
  }
});
