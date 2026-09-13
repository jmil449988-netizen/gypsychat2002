// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Proxies GIF search/trending requests to Giphy so the API key never has to reach the browser.
// Anyone who can view page source or open devtools can lift a client-side key and burn through
// the app's Giphy quota (or get it rate-limited/banned) -- this keeps GIPHY_API_KEY as a
// server-only secret. The caller still needs a valid Supabase session (JWT) to use it, same as
// verify-join, so it isn't an open proxy for anonymous scraping either.

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
    const giphyApiKey = Deno.env.get("GIPHY_API_KEY");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData || !userData.user) {
      return Response.json({ ok: false, reason: "unauthenticated" }, { status: 401, headers: corsHeaders });
    }

    if (!giphyApiKey) {
      return Response.json({ ok: false, reason: "not_configured" }, { status: 503, headers: corsHeaders });
    }

    let body = {};
    try { body = await req.json(); } catch (_e) { body = {}; }
    const q = typeof body.q === "string" ? body.q.trim().slice(0, 60) : "";

    const base = q
      ? "https://api.giphy.com/v1/gifs/search?q=" + encodeURIComponent(q)
      : "https://api.giphy.com/v1/gifs/trending?";
    const url = base + "&api_key=" + encodeURIComponent(giphyApiKey) + "&limit=18&rating=pg-13&lang=en";

    const giphyRes = await fetch(url);
    const giphyJson = await giphyRes.json();
    if (!giphyRes.ok) {
      return Response.json({
        ok: false,
        reason: "giphy_error",
        message: (giphyJson.meta && giphyJson.meta.msg) || "Giphy error.",
      }, { status: 502, headers: corsHeaders });
    }

    return Response.json({ ok: true, data: giphyJson.data || [] }, { headers: corsHeaders });
  } catch (err) {
    console.error("giphy-search error", err);
    return Response.json({ ok: false, reason: "server_error" }, { status: 500, headers: corsHeaders });
  }
});
