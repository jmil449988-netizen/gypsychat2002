// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Checks an access code typed into the gate screen (public/index.html #gateFields) against the
// access_keys table (see supabase/access_keys_feature.sql). That table has no RLS policies at
// all, so it can't be read from the client directly -- this function, running with the
// service-role key, is the only thing that can look a code up. Deliberately unauthenticated:
// this runs BEFORE anonymous sign-in, on the very first screen a brand-new visitor sees, so
// there is no JWT to require yet.
//
// Codes are reusable until an admin flips `revoked` to true in the Supabase table editor, but
// each one is IP-locked on first use: whichever IP redeems a fresh code claims it (by writing a
// salted hash of that IP into `locked_ip_hash`, the same hashing approach verify-join already
// uses for its churn log -- never the raw IP), and every later check of that same code has to
// come from the same IP hash or it's rejected. This stops one code from being handed around to
// a bunch of different people/networks while still letting the person it was issued to reconnect
// (new tab, cleared storage, phone vs. laptop on the same network) freely.
//
// The claim itself is done as a conditional UPDATE ("claim this row only if it's still
// unclaimed") rather than a plain read-then-write, so two people racing to redeem the same fresh
// code at the same instant can't both win -- only one UPDATE actually matches, and the loser
// falls through to the normal "check who owns it" path and gets ip_locked like anyone else would.

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
    let body = {};
    try { body = await req.json(); } catch (_e) { body = {}; }
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!code || code.length > 40) {
      return Response.json({ ok: false, reason: "invalid" }, { status: 200, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ipHashSalt = Deno.env.get("IP_HASH_SALT");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = req.headers.get("cf-connecting-ip") || (forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown");
    const ipHash = await sha256Hex(ipHashSalt + "|" + clientIp);

    const { data: row, error } = await admin
      .from("access_keys")
      .select("id, revoked, locked_ip_hash")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("verify-access-key lookup error", error);
      return Response.json({ ok: false, reason: "server_error" }, { status: 500, headers: corsHeaders });
    }

    if (!row) {
      return Response.json({ ok: false, reason: "invalid" }, { headers: corsHeaders });
    }
    if (row.revoked) {
      return Response.json({ ok: false, reason: "revoked" }, { headers: corsHeaders });
    }

    let allowed;
    if (!row.locked_ip_hash) {
      // First redemption -- try to claim this code for the requesting IP. The `is(...null)`
      // guard means this only succeeds if nobody else claimed it in the meantime.
      const { data: claimed, error: claimErr } = await admin
        .from("access_keys")
        .update({ locked_ip_hash: ipHash })
        .eq("id", row.id)
        .is("locked_ip_hash", null)
        .select("id")
        .maybeSingle();
      if (claimErr) console.error("verify-access-key claim error", claimErr);
      if (claimed) {
        allowed = true;
      } else {
        // Lost the race -- see who actually got it.
        const { data: recheck } = await admin.from("access_keys").select("locked_ip_hash").eq("id", row.id).maybeSingle();
        allowed = !!recheck && recheck.locked_ip_hash === ipHash;
      }
    } else {
      allowed = row.locked_ip_hash === ipHash;
    }

    if (!allowed) {
      return Response.json({ ok: false, reason: "ip_locked" }, { headers: corsHeaders });
    }

    // Best-effort -- a failed stamp shouldn't block a valid tester from getting in.
    admin.from("access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id)
      .then(() => {}, () => {});

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("verify-access-key error", err);
    return Response.json({ ok: false, reason: "server_error" }, { status: 500, headers: corsHeaders });
  }
});
