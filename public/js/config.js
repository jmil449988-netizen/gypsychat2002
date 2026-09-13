// Gypsy Chat 2000 — configuration
// Paste the values from your Supabase project: Settings → API.
// The anon key is safe to ship in a public site; row-level security (see supabase/schema.sql) does the protecting.
window.GC_CONFIG = {
  SUPABASE_URL: "https://joeopnxsxrwufqswidgq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_72zFG9caKqiDebIVNWppRA_h0Q1Vn5f",
  ROOM: "main",          // change to run more than one room from the same backend
  HISTORY: 200           // how many past room messages to load on sign-on
};
