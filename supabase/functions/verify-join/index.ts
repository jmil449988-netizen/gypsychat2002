// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Verifies a join attempt before letting an anonymous identity fully enter the room:
//   1. Confirms the caller has a valid Supabase session (JWT).
//   2. Verifies their Cloudflare Turnstile token server-side against the secret key.
//      A missing/failed token gets this brand-new identity permanently muted immediately --
//      it either skipped the widget or failed the challenge, so it is not a normal join.
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
    }

    if (!turnstileOk) {
      await admin.from("chat_moderation").upsert({
        user_id: userId,
        muted: true,
        muted_permanent: true,
        muted_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      return Response.json({ ok: false, reason: "turnstile_failed" }, { status: 403, headers: corsHeaders });
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
