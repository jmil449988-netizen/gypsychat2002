// Renamed from config.js: the old path got stuck serving a stale cached copy on Cloudflare's edge
// (a previous deploy's content kept coming back from /js/config.js even after several rebuilds
// and a build-cache clear, while every other asset updated normally) -- moving to a fresh path
// sidesteps whatever cached that one URL. See supabase/functions/giphy-search for why
// GIPHY_API_KEY isn't in here anymore either.
window.GC_CONFIG = {
  SUPABASE_URL: "https://joeopnxsxrwufqswidgq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_72zFG9caKqiDebIVNWppRA_h0Q1Vn5f",
  ROOM: "main",
  HISTORY: 200
};
