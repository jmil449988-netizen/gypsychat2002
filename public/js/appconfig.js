// Renamed from config.js: the old path got stuck serving a stale cached copy on Cloudflare's edge
// (a previous deploy's content kept coming back from /js/config.js even after several rebuilds
// and a build-cache clear, while every other asset updated normally) -- moving to a fresh path
// sidesteps whatever cached that one URL. See supabase/functions/giphy-search for why
// GIPHY_API_KEY isn't in here anymore either.
window.GC_CONFIG = {
  SUPABASE_URL: "https://joeopnxsxrwufqswidgq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_72zFG9caKqiDebIVNWppRA_h0Q1Vn5f",
  ROOM: "main",
  HISTORY: 200,
  // Release switches (build 177). INVITE_KEY_REQUIRED gates NEW characters behind an invite key
  // (the beta). Set it to false on release day and the sign-on screen drops the key field: plain
  // anonymous sign-on plus "Save with email", the Turnstile human check staying on. Resumed
  // sessions and email sign-ins never asked for a key, so flipping this touches nobody who is
  // already in. RELEASE_EPOCH: bump it (0 -> 1) with the release build and every device clears
  // its per-device settings (gc_* in localStorage: sound volume, first-run tips, dock layout,
  // the stored invite key) exactly once; the sign-in session itself is kept.
  INVITE_KEY_REQUIRED: true,
  RELEASE_EPOCH: 0,
  // The public half of the VAPID keypair used to sign Web Push subscriptions -- this one is meant
  // to be public (it's handed to pushManager.subscribe() in every browser that turns notifications
  // on) unlike its private counterpart, which only ever lives as a secret on the send-push edge
  // function and never reaches the client.
  VAPID_PUBLIC_KEY: "BBV2C2RPsbP27lQsR-eZUjMFD-UKAc2Zee2yiHZGGkGVouE5MA--Qt3b7O_3pUj9lPVauzUFkP6QB2odzbNSCMI"
};
