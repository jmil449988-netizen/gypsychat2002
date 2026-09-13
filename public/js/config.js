// rebuild-marker: force a fresh content hash so the deployed asset actually updates.
window.GC_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
  ROOM: "main",
  HISTORY: 200
  // GIPHY_API_KEY used to live here, but a client-side key can be lifted by anyone reading this
  // file, so GIF search now goes through the giphy-search Supabase Edge Function instead, which
  // holds the key as a server-only secret. See supabase/functions/giphy-search.
};
