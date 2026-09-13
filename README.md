# Gypsy Chat 2000

An old-school chat room: one public room, whispers that open in their own windows, emoji, and a dark-stone-and-gold look.

It is a plain static web app (no build step) backed by Supabase. The same files run as:

1. a website,
2. an installable PWA (Add to Home Screen on iPhone/Android), and
3. a native iOS/Android app via Capacitor, when you're ready.

## Folder layout

```
index.html               the page
css/style.css            all styling
js/config.js             your Supabase URL + anon key (the only file you must edit)
js/app.js                the app: sign-on, room, presence, whispers
manifest.webmanifest     PWA install metadata
sw.js                    service worker (caches the UI shell)
icons/                   app icons (SVG + 192/512 PNG)
supabase/schema.sql      database tables, security rules, rate limit
capacitor.config.json    native app config, used later
package.json             scripts for the native build, used later
```

## Step 1 — Backend (about 10 minutes)

1. Create a free project at https://supabase.com.
2. **Authentication → Providers → Anonymous sign-ins → turn ON.** (Users pick a name; no email or password.)
3. **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, click **Run**.
4. **Settings → API**: copy the *Project URL* and the *anon public* key into `js/config.js`.

That's the whole backend. What the SQL gives you:

- a `messages` table (room messages and whispers in one place, whispers have a `recipient_id`),
- **row-level security** so the server only ever sends a whisper to its two participants (this is real privacy, unlike the artifact version),
- a rate limit of 5 messages per 5 seconds per user, enforced in the database so it can't be bypassed from the browser,
- realtime broadcasting of new messages,
- **blocks**, **bans** and **admins** tables (see "Moderation" below).

## Moderation

**Block (anyone can do this).** Tap a name in the Present list → **Block**, or type `/block name`. From then on the server never sends you that person's messages, room or whisper, and it rejects any whisper they try to send you. They aren't told. `/unblock name` or the menu reverses it; `/blocks` lists who you've blocked. Blocks are tied to your session's account, so they persist across reloads.

**Kick (admins only).** A kick is a ban: the person is dropped from the room immediately, and the database refuses every message they try to send afterwards, even from a fresh page load. Tap a name → **Kick** (red) and optionally give a reason, or type `/kick name reason`. `/unban name` lifts it; `/bans` lists current bans.

**Making yourself an admin.** Sign on once, type `/whoami`, copy the id it prints, then in the Supabase SQL Editor run:

```sql
insert into public.admins (user_id) values ('paste-your-id-here');
```

Reload and the status bar shows `(admin)`. Admins can't be kicked and can't kick each other. To set a ban to expire, edit its `expires_at` in **Table Editor → bans**.

**The anonymous-account caveat.** Bans and blocks attach to a Supabase anonymous account, which lives in the browser's storage. A determined person can clear that storage (or open a private window) and come back as someone new. That's the trade-off of letting people in without sign-up. If it becomes a problem, switching to email or Google sign-in (Supabase → Authentication → Providers) makes bans stick to a real identity, and the only code change is in `join()`.

## Step 2 — Website

Any static host works. Cloudflare Pages is free and fast:

1. Push this folder to a GitHub repo.
2. https://pages.cloudflare.com → Create project → connect the repo.
3. Build command: *(leave empty)*. Output directory: `/`.
4. Deploy. Add your custom domain under the project's **Custom domains** tab.

Netlify and Vercel are the same three clicks. **It must be served over HTTPS** (all of these do that by default) or the service worker and PWA install won't activate.

To test locally: `npx serve .` then open http://localhost:3000. (The service worker skips itself on plain http, which is fine for local testing.)

### Restrict where the key works (recommended once live)

In Supabase, **Authentication → URL Configuration → Site URL**, set your domain. Anonymous sign-in then only works from your site.

## Step 3 — "Install" on phones (no store needed)

Once it's on HTTPS, the site is already a PWA:

- iPhone: Safari → Share → **Add to Home Screen**.
- Android: Chrome shows an **Install** prompt, or Menu → **Add to Home screen**.

It launches full-screen with the icon and no browser chrome. For most people this *is* the mobile app.

## Step 4 — Store apps, later

Everything is pre-wired for Capacitor, which wraps this exact web app in a native shell.

Prerequisites: Node.js; Xcode + a Mac + Apple Developer account ($99/yr) for iOS; Android Studio + Google Play account ($25 once) for Android.

```bash
npm install
npm run app:init      # builds www/ and creates ios/ and android/ projects
npm run app:ios       # opens Xcode  → run on device, archive, upload
npm run app:android   # opens Android Studio → build, sign, upload
```

After any change to the web files: `npm run app:sync`.

Things you'll want to add at that stage, all of which are Capacitor plugins that drop in without changing the app's structure:

- `@capacitor/push-notifications` so whispers reach people when the app is closed,
- `@capacitor/haptics` for a buzz on incoming whispers,
- `@capacitor/splash-screen` for a branded launch.

## Design decisions that keep the app-store path open

- **All paths are relative (`./css/...`)** so the files work from a web root, a subfolder, or inside the native bundle.
- **No build step, no framework** — nothing to migrate.
- **Identity is a Supabase anonymous user**, not a name. Whisper windows are keyed by user id, so two people with the same name can never receive each other's whispers, and the same session survives a reload. Swapping in real accounts later is a change to `join()` only.
- **`viewport-fit=cover` + safe-area padding** so the notch and home indicator are respected once wrapped.
- **The service worker never caches Supabase or CDN requests**, so chat is always live and you can't get stuck on stale data.

## Before you go public

- **Names**: anonymous means anyone can claim any name each session. If that becomes a problem, turn on email or Google sign-in in Supabase and store the name on a `profiles` table.
- **Moderation** is in (block and kick); consider adding a **report** button that writes to a `reports` table you can review.
- **Retention**: the schema file includes a one-line `pg_cron` job to delete messages older than 30 days. Enable it under Database → Extensions → pg_cron, then run that line.
- **Name of the app**: "Gypsy" is treated as a slur by many Roma people, and both app stores reject listings under offensive-content rules with some inconsistency. Decide early whether you'd rename if a store bounces it.
