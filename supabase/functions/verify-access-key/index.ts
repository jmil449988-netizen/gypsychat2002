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
// Codes are reusable until an admin flips `revoked` to true in the Supabase table editor --
// this function only ever reads the row and stamps last_used_at, it never consumes or expires
// a code on its own.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: row, error } = await admin
      .from("access_keys")
      .select("id, revoked")
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

    // Best-effort -- a failed stamp shouldn't block a valid tester from getting in.
    admin.from("access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id)
      .then(() => {}, () => {});

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("verify-access-key error", err);
    return Response.json({ ok: false, reason: "server_error" }, { status: 500, headers: corsHeaders });
  }
});
