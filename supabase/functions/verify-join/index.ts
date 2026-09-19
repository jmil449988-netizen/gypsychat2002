// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Verifies a join attempt before letting an anonymous identity fully enter the room:
//   1. Confirms the caller has a valid Supabase session (JWT).
//   2. Verifies their Cloudflare Turnstile token server-side against the secret key.
//      A missing/failed token REFUSES the join (the client shows "Verification failed") and
//      nothing else -- it no longer mutes the account permanently. That used to be
//      the rule, and on 2026-09-17 it muted a real person: a second tap on the join button
//      re-sent the same single-use token, siteverify answered "timeout-or-duplicate", and the
//      account was muted for good before the first (successful) join had even finished. A
//      failed human check is not proof of a bot -- tokens expire, get re-used by a double
//      submit, or fail to verify over a network blip -- so it costs a retry, not the account.
//      The error codes are logged so a real pattern can still be spotted.
//   3. Logs the join under a salted hash of the client IP (never the raw IP) and, if this is
//      the 4th+ new identity from that same IP within a short window, applies a brief shadow
//      cooldown -- enough friction to blunt "clear storage, rejoin" mute-dodging without
//      punishing shared networks (offices, families) for one-off reconnects.

const CHURN_THRESHOLD = 3;
const CHURN_WINDOW_MINUTES = 15;
const CHURN_COOLDOWN_SECONDS = 45;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

    let body = {};
    try { body = await req.json(); } catch (_e) { body = {}; }
    const turnstileToken = body.turnstileToken || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    const ipHashSalt = Deno.env.get("IP_HASH_SALT");

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData || !userData.user) {
      return Response.json({ ok: false, reason: "unauthenticated" }, { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = req.headers.get("cf-connecting-ip") || (forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown");
    const ipHash = await sha256Hex(ipHashSalt + "|" + clientIp);

    let turnstileOk = false;
    if (turnstileToken) {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: turnstileToken,
          remoteip: clientIp,
        }),
      });
      const verifyJson = await verifyRes.json();
      turnstileOk = verifyJson && verifyJson.success === true;
      if (!turnstileOk) console.warn("turnstile siteverify failed", userId, JSON.stringify(verifyJson && verifyJson["error-codes"]));
    } else {
      console.warn("turnstile token missing", userId);
    }

    if (!turnstileOk) {
      // No moderation write at all: a cooldown here would land on an account whose FIRST join
      // may have just succeeded (the double-submit case), and gc_check_and_record_send counts a
      // send during a cooldown as an offense -- the person would be punished for typing hello.
      return Response.json({ ok: false, reason: "turnstile_failed" }, { status: 403, headers: corsHeaders });
    }

    // Bans follow the network (supabase/ip_bans_feature.sql): an active ban stamped with this join's
    // ip_hash bans the new account too, before it is logged or let in. Fails open on a lookup error --
    // the ban still stands on the original account, this is the spread, not the ban itself.
    try {
      const nowIso = new Date().toISOString();
      const { data: hit } = await admin
        .from("bans")
        .select("user_id, banned_name, expires_at")
        .eq("ip_hash", ipHash)
        .neq("user_id", userId)
        .or("expires_at.is.null,expires_at.gt." + nowIso)
        .limit(1)
        .maybeSingle();
      if (hit) {
        const { data: prof } = await admin.from("profiles").select("name").eq("user_id", userId).maybeSingle();
        await admin.from("bans").upsert({
          user_id: userId,
          banned_name: prof && prof.name ? prof.name : null,
          reason: "same network as " + (hit.banned_name || "a banned account"),
          banned_by: null,
          expires_at: hit.expires_at,
          ip_hash: ipHash,
        }, { onConflict: "user_id" });
        console.warn("ip ban spread", userId, "from", hit.user_id);
        return Response.json({ ok: false, reason: "banned" }, { status: 403, headers: corsHeaders });
      }
    } catch (banErr) {
      console.error("ip ban check failed", banErr);
    }
    await admin.from("join_ip_log").insert({ ip_hash: ipHash, user_id: userId });

    const windowStart = new Date(Date.now() - CHURN_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await admin
      .from("join_ip_log")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", windowStart);

    if ((count || 0) > CHURN_THRESHOLD) {
      const cooldownUntil = new Date(Date.now() + CHURN_COOLDOWN_SECONDS * 1000).toISOString();
      await admin.from("chat_moderation").upsert({
        user_id: userId,
        cooldown_seconds: CHURN_COOLDOWN_SECONDS,
        cooldown_until: cooldownUntil,
      }, { onConflict: "user_id" });
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("verify-join error", err);
    return Response.json({ ok: false, reason: "server_error" }, { status: 500, headers: corsHeaders });
  }
});
