# Build log

Rolling record of what shipped, why, and what it cost. Newest section last. Anything settled in
enough detail to deserve its own page gets one — see `thread-categories.md`,
`gypsy-roulette-plan.md`, `diagnostics-2026-09-17.md`.

---

# Builds 137 → 152 · 18 September 2026

Previous state: build 136, style.css 103, cache `gc2000-v167`, watermark Beta v0.7.0.
Current state: **app.js 152, style.css 113, cache `gc2000-v183`, APP_VERSION Beta v0.8.0.**

This was one long batch. Twelve things were asked for at once and all twelve shipped.

## The header buttons (138, 141)

Threads and Roulette used to float in their own boxes. On desktop they are now physically
reparented into whichever page header is on screen — `placeThreadBtn()` and `placeRouletteBtn()`
move the actual elements rather than drawing duplicates, so there is only ever one of each and its
state cannot diverge. Roulette goes in first, left of the lantern; Threads is appended on the
right. `markHeaderBtns()` puts `hb-left` / `hb-right` on the title so the CSS can add a balancing
spacer and the title stays centred.

The return-to-main-chat button on the threads page got the same treatment. Mobile is untouched —
the threads bubble still floats and drags, which was an explicit requirement.

## The first-run tour (139)

The introduction now points at the Threads board, which it had never mentioned.

## The hours: a bell and a reading (141, 148)

Every three hours, on the eight canonical hours of the Orthodox daily cycle, a bell rings and a
passage appears in chat on a parchment panel. The hours and their themes are the real ones —
Midnight Office, Matins, First, Third, Sixth and Ninth Hours, Vespers, Compline — and each hour's
passages match what that hour commemorates. The Sixth and Ninth carry the Crucifixion and the
death of Christ; the Third carries the descent of the Holy Spirit.

Twenty-four entries, three per hour, 52 verses, all NKJV. Every passage was fetched from the
source rather than written from memory, then audited line by line. The words of Christ are marked
per-segment in the data (`seg[].r`) and render in `#9c1c14` on the parchment. The NKJV copyright
notice sits in the ⋯ popover; the user approved its wording.

`readingFor(h)` picks by `Math.floor(Date.now() / 86400000) % list.length`, so every client in the
world sees the same passage in the same hour and it rotates on a three-day cycle. `bellTick()` runs
every 30 seconds, fires only in the first two minutes of a canonical hour, and keys on
`date + hour` so it cannot repeat. A tab that was asleep and wakes at 14:10 posts nothing rather
than dumping a stale reading. A hidden tab posts the reading silently.

The bell itself was cut from a 12-strike recording: `-ss 0.20 -t 10.15`, four strikes, fade from
9.05 s over 1.10 s, peak-matched at +10 dB rather than loudness-matched, because a bell is all
transient and loudness-matching would have buried it.

## Regional boards, tags and subscriptions (143, 144)

Ten boards, nine tags, one tag per thread. The reasoning, the boundary calls (Texas is Tex-Mex;
`elsewhere` exists because California and the Mountain West fell through the original seven) and
the decision that **posting does not subscribe you** are all in `thread-categories.md`.

The fan-out needed a server-side push, because a browser must never be able to read who follows
what. Rather than patch or duplicate `send-push`, which works and is load-bearing, a second edge
function `send-board-push` was written from scratch: it verifies the JWT, takes the exclude-list
from the *verified token* rather than the request body, caps fan-out at 300, and prunes dead 404 /
410 endpoints. `send-push` was re-tested afterwards and still works.

**A security hole was introduced and caught here, and it is worth remembering how.**
`thread_sub_targets()` is SECURITY DEFINER and must be service-role only. The migration revoked
EXECUTE from `public` and `anon` — and that is not enough, because Supabase grants EXECUTE to
`authenticated` explicitly, and revoking from PUBLIC does not remove an explicit role grant. Any
signed-in browser could have enumerated board subscribers. It was found by a rolled-back dry run
impersonating each role, not by re-reading the SQL. The lesson is that reading your own migration
back does not test it; assuming a role and calling the function does.

## Replies to specific messages (145 – 147)

Discord/Instagram style. `replyTo` is keyed per conversation, so a draft reply in one whisper does
not follow you into another. The stub above a message shows the quoted author and text, and
tapping it jumps to the original.

The jump took three attempts and the first two shipped broken. `scrollIntoView({block:'center'})`
does nothing when the target sits inside a nested scroll container, and neither does
`scrollTo({top, behavior:'smooth'})` — both computed the right number and moved nothing. Plain
`box.scrollTop = ...` works. The second broken fix shipped because the verification was a bad `||`
that was true whichever branch ran. A separate bug: `.closest('.log')` missed every whisper,
because whisper logs are `.ilog` — so a jump inside a whisper searched the whole document and
landed on the wrong message. Now `.closest('.log, .ilog')`.

## Voice notes in whispers (149)

Up to 120 seconds, whisper-only, in a private bucket capped at 3 MB per file.

The privacy boundary is the folder name: a note lives under `[me.id, peerId].sort().join('_')`, so
the storage policy can express "either of these two people" in one expression —
`auth.uid()::text = any(string_to_array((storage.foldername(name))[1], '_'))`. There is a select
policy and an insert policy and deliberately **no update or delete policy**, so a recording cannot
be altered or removed after the fact.

That last decision has a cost that needs revisiting: nobody can delete a voice note, including the
person who sent it and including you. Fine for a test, wrong for a product.

Verified with a dry run (sender sees 1, recipient sees 1, third party sees 0, third-party write
refused) and live (unsigned fetch 400, signed fetch 200 returning exactly the uploaded bytes,
delete refused). The user independently confirmed four real notes in both directions.

## Sharing a thread or a person into a whisper (150, 151)

Both send a card with a preview. The thread card opens the thread; the person card carries their
name and level.

151 exists because 150 was wrong in a way that only showed up with real data. `shareUserHtml`
resolved names from the people, friends and recent lists — all "visible right now" sets — and a
shared card is precisely the case where the person is *not* visible. It told you a real account
was "no longer around". It now falls back to `profiles`, with a `.sh-pending` state so it never
flashes a false error while the lookup is in flight.

## Fixes (141, 142)

Long-pressing a message made the emoji menu vanish on release, on both desktop and mobile:
`endPress()` now re-arms `suppressClickUntil` at release instead of only at press.

iPhone highlighted the emoji picker when you reacted (v106), and then still highlighted the
*message and the name* (v107) — the selection starts on the element being pressed, not the menu.
`-webkit-touch-callout:none` and `user-select:none` on `.log .m[data-mid]` and `.tp-posts
.tp-post`, scoped to `@media (hover:none) and (pointer:coarse)` so desktop text stays selectable,
with links keeping `callout:default`.

The anonymous ballot scroll now only makes a sound when you tap it on mobile, not when it appears.

## The leaving sound (152)

`signoff.mp3` re-rendered +5.7 dB into a limiter at −0.5 dBFS: −17.78 LUFS → −13.72 LUFS,
−3.54 dBTP → −0.93 dBTP. `SOUND_GAIN.signoff` went 0.8 → 1 so the *file* carries the level.

The obvious change — gain 0.8 → 1.6 — would have clipped. The file already peaked at −3.5 dBFS
and Web Audio clamps at 1.0, so 1.6× lands at +0.58 dBFS for anyone with the volume slider at
100%. Putting the level in the file instead means the gain can never push past the file's own
ceiling. Measured on the deployed file, decoded in the browser: +5.99 dB, 1.991× amplitude,
0.93 dB of headroom left.

**This was built to the wrong requirement.** The ask was twice as *fast*, not twice as loud. Two
1.5-second variants were cut — one time-stretched at the same pitch, one resampled an octave up —
and sent for a listen. Not yet chosen, not yet deployed.

## Schema and server changes, all applied

`thread_boards_feature.sql` (board and tag columns with check constraints, `thread_subs` + RLS,
`thread_sub_targets()` service-role only), `message_replies_feature.sql` (`reply_to` on `messages`
and `thread_posts`, partial indexes), `voice_notes_feature.sql` (`voice_path` / `voice_secs`, the
private bucket and its two policies), `shares_feature.sql` (`share_thread` / `share_user`,
whisper-only and one-kind-only constraints). Edge function `send-board-push` deployed from the
dashboard.

## Deploy notes worth keeping

`git push` is refused for this repo — the proxy will not inject a credential — so everything goes
through GitHub's web upload UI. The consequence that bit twice: **a local commit that is never
uploaded is silently destroyed by the next `git reset --hard origin/main`.** It cost a
build-number mismatch twice and the whole `docs/` folder once. Upload before syncing, always, and
check `git log origin/main` after each commit, because the web UI's commit-summary field sometimes
swallows the first typing attempt and the submit click sometimes does not register.

Direct `delete from storage.objects` is refused by Supabase — cleanup goes through the dashboard's
storage browser.

Fetching the live site with `curl` started returning a 403 from the agent proxy partway through the
session. Verifying a deploy through the browser's own `fetch` works and is better anyway: decoding
the mp3 with `decodeAudioData` measures what the app will actually play, not what the file claims.

## Not done

Nothing from the twelve-item list remains. Outstanding, in the order they matter:

A racial slur is sitting in the main-chat backlog and a thread on the board contains the same
word. Removal was offered twice and never authorised. It is visible to anyone who loads the room.

There is no block and no report, no flood control, no deletion path for voice notes, and no terms
or privacy policy — and the app now records people's voices and stores them, which is where "it's
just a chat room" stops being a sufficient answer, particularly with Canadian users and BC's own
privacy legislation on top of the federal one.

Eight accounts have no `profiles` row (two "HH", one "SIGINT", five others). The insert policy
checks the poster's name against `profiles`, so these accounts sign in, see everything, and
silently fail to post.

The black ball pit — a room for delinquents that all users vote someone into — was sketched and
not commissioned. Suggested shape: the vote plus the pit as a fishbowl panel first, escape
minigame second, every threshold in one tunable table.

Region subcategories were deferred with "we'll talk about those later" and later has not happened.
Replies and both share cards have only been tested on desktop. There is no production error
reporting, which is why two silent build-number mismatches went unnoticed until a manual check.

Small: `pm.mp3` has been unused since build 135; leftover "sound test" and sound-effect lines are
sitting in main chat from testing; the hourly bell will ring at 3 a.m. for anyone who left the tab
open and visible.

---

# Builds 153 → 160 · 18 September 2026

Previous state: build 152, style.css 113, cache `gc2000-v183`.
State at the end of this section: app.js 160, style.css 115, cache `gc2000-v191` (161 and 162
follow below).

153 – 158 were written up only in their commit messages, so this part is a summary of those:
153 kept the Messages pill from vanishing on a phone and got the hourly readings to phones;
154 – 155 added group chats (`group_chats_feature.sql`) with their own picker, window and composer
grid, and hid the composer buttons that are still one-to-one only (games, voice notes); 156 sent
group lines to the group's own window; 157 loaded the groups before the history replay, because
the replay was throwing every group's history away; 158 stopped the 👥 member menu closing on the
same click that opened it.

## Naming a group (159)

Anyone in a group can name it, rename it, or clear the name from the 👥 menu ("✎ Name this group",
or "✎ Rename this group" once it has one). Blank means no name: the group is called after the
people in it again. Tapping the group's name in its title bar opens the same menu — before this it
opened a person menu for the window key `g<id>`, whose Get Info, Block and Add Friend all failed.

The write goes through `gc_rename_group` (`group_names_feature.sql`), because `conversations` has
no UPDATE policy. It checks membership and mutes, tidies the text the same way the client does
(whitespace runs to one space, control characters out, trimmed), refuses more than 40 characters,
and records `title_by` / `title_at`. One person gets one rename every five seconds, since every
rename puts a line in up to seven other windows. The rename reaches the other members as a
realtime UPDATE on `conversations`: "Alice named the group “Road trip”." The renamer's own window
says "You named…". `catchUp()` re-reads the names after a dropped connection.

Tested in a rolled-back practice run first (11 checks: member rename, the five-second rule, a
direct UPDATE changing 0 rows, a second member, tidying, 41 characters refused, clearing, an
outsider refused, someone who left refused), then live in the user's own test group, including a
rename made from the SQL Editor that the open tab picked up without a reload.

## The outage this found (160)

**From build 154 until the fix, nothing on the room channel arrived live**: messages, whispers,
group lines, reactions, read receipts, game moves, XP. The channel still said SUBSCRIBED, and
presence and broadcasts (typing, buzz, sounds) kept working, which is why it looked alive. New
lines only showed up on a reload, or on a catch-up after a reconnect or a long spell in the
background.

The cause: v154's client listens to `conversation_members`, but `group_chats_feature.sql` never
added that table to the `supabase_realtime` publication. Realtime creates all of a channel's
postgres_changes subscriptions in one transaction and rolls the whole lot back when any table in
it is missing from the publication. Found because `realtime.subscription` had rows for the
threads, reports and friend-request channels but none at all for the room channel's tables, with
three clients connected. Proved with two probe channels: `threads` alone replied "Subscribed to
PostgreSQL"; `threads` + `conversation_members` replied "Unable to subscribe to changes with given
parameters … table: conversation_members".

Fixed by `group_members_realtime_fix.sql`, which adds the table to the publication. Clients get
live delivery back the next time they load the page.

**Rule from here on: a table the client listens to goes into the publication before the client
that listens to it ships. And a feature isn't verified until something has arrived live on a
second screen: the sender's own copy is drawn locally, so it proves nothing.**

With the membership feed working for the first time, 160 also:

- skips the membership reload when an UPDATE is only a read marker moving, which is most of
  them, because `gc_mark_group_read` runs whenever anyone reads the group;
- puts "3 in the group · 1 here now" under a group's name instead of "Offline". It used to treat
  the group as a person, and asked `profiles` about a user called `g<id>` on every window.

## The leaving sound, twice as fast (160)

The request in 152 was twice as fast, not twice as loud. `signoff.mp3` is now the original
recording played at double speed, an octave up (`asetrate=88200,aresample=44100`), 3.03 s → 1.54 s.
The user picked it over a same-pitch time-stretch. It is back at its original volume: the file is
matched to the original's peak momentary loudness, and `SOUND_GAIN.signoff` is back to 0.8,
undoing 152's +6 dB. Checked on the deployed file, decoded in the browser: 1.50 s, peak −4.4 dBFS.

## Found on the way, fixed in 161

- A group line was capped at 140 characters, the main room's limit.
- An @mention in a group line pushed the text to the person named, even when they were not in the
  group.
- One member of the test group showed as "someone".


---

# Builds 161 → 162 · 18 September 2026

State at the end of this section: app.js 162, style.css 115, cache `gc2000-v193` (163 follows
below).

The three things found in 160, fixed, plus a fourth that was worse than any of them.

## Group lines were being treated as room lines (161)

Two older pieces of server code decided "room line or not" with `recipient_id is null`, which is
also true of every group line:

- **`messages_body_check`** capped group lines at the room's 140 characters, and `post()` cut them
  to 140 in the browser to fit. Group lines now get 500 like a whisper, in both places.
- **`trim_room_messages`**, the ring buffer that keeps the main room to its newest 100 lines,
  counted group lines as room lines and **deleted them** with the room's oldest. Every group's
  history was being thrown away a hundred room messages later, and group lines were taking room
  lines' places in the hundred. When this was fixed the room held 98 room lines plus the test
  group's 2. It now trims room lines only; group lines are kept, like whispers.

`group_fixes_2026_09_18.sql`. Worth remembering for any future kind of message: search the SQL and
the client for `recipient_id is null` and `!recipient_id` and decide each one.

## Mentions stay inside the group (161)

A group line's @names are matched against the group's own members, `groupMentionedIds()`, not the
room's recent-people pool. So a member who is offline, the one a push is actually for, is found.
Nobody outside the group is ever pushed. The notification reads "X mentioned you in “Name”", or
"in a group" when it has no name.

## "someone", and accounts with no character name (161, 162)

The test group's "someone" was the user's own old "Steve miller" login. When the same invite key
claims a name from a new device, `claim_name()` sets the old login's `profiles.name` to null. The old
login keeps its uid, its friendships, its group seats and its XP, but no longer has a name. It can
read a group and can never post in one.

- `gc_create_group` / `gc_add_to_group` refuse an account whose profile has no name (or that has no
  profile row), and anyone like that already sitting in a group was taken out. That was just the
  old Steve login, from the test group.
- Group titles, the 👥 list and rename lines use the name a member goes by **now** (read from
  `profiles` in `loadMyGroups`). `member_name` is only the name they had the day they were added.
- The people picker drops nameless accounts and shows each person's current name. **162** exists
  because 161's picker check only dropped accounts with no profile row at all, so the emptied-name
  kind was still offered. The same mistake nearly shipped on the server too: the local test
  scaffold had `profiles.name not null`, so the first version of the migration was applied before
  the live row turned up. It was corrected, practice-run again and re-applied. The scaffold now
  matches live. 162 also stops "Add to this group" offering people already in it.

## Back-tested live, 18 Sept 2026 (build 162)

The "other person" side was driven from the SQL Editor as the user's own test account (Steve miller,
current login). The user's main account watched in the open tab. Every step appeared without a
reload:

- Steve starts a group with AA → "You were added to a group: Regression test" plus its inbox row.
  This is the membership feed, working for the first time since 154.
- Steve's group line → in AA's group window.
- Steve renames → "Steve miller renamed the group “Regression test 2”."
- AA renames from the 👥 menu (prefilled, selected, 40-char box, Save).
- AA's 300-character group line → stored and shown in full.
- AA's "@Steve miller …" → exactly one push request, to Steve, titled "mentioned you in “Regression
  test 3”". AA's "@S.S SIGINT …" (not a member) → none. Push requests were caught and held in the
  page for this test, so no real notification went out.
- Steve's whisper → inbox row with an unread badge. AA opening it moves AA's read marker.
- Steve marking AA's whisper read → "Seen 7:35 AM" under it.
- Steve's Tic-Tac-Toe challenge → card with Accept/Decline. Steve withdrawing it → "Challenge
  withdrawn."
- Steve leaves → "1 in the group". AA leaves (confirm asked, answered for the test) → row gone,
  group closed.
- The test group shows 2 members, no "someone". The picker offers neither the old Steve login nor
  people already in the group, and shows "Pastor Douglas" where the friends list still says
  "Gypsyinxlaptop".
- Threads board, Popularity Contest and Ballot Box open and close. No console errors on load or
  anywhere in the run.

Left behind by the test, all between the user's own two accounts: two whispers, a withdrawn
Tic-Tac-Toe challenge, and a closed group nobody can open.

## Still open

- **Switching devices strands everything but the name.** The old login keeps the friendships, group
  seats, whispers and XP. The XP board has an "Unknown" at #3 with 18 XP, very likely one of these.
  The real fix is for `claim_name()` to move those to the new login when the same key reclaims a
  name. It is load-bearing sign-in code, so it wants its own practice-run and tests.
- The friends list keeps the name a friend had when you friended them ("Gypsyinxlaptop" is "Pastor
  Douglas" now). The picker is fixed; the Friends panel is not.
- The reactions insert policy still calls a group line a "main-room message" (`recipient_id is
  null`). There is no button for it, but a hand-made request could react to a group line.
- Nobody else in a group is told when someone leaves or is added. A group line only pushes when
  someone is @mentioned. A group you were just added to lands at the bottom of the inbox.

---

# Build 163 · 18 September 2026 · board notifications

Current state: **app.js 163, style.css 115, cache `gc2000-v194`, APP_VERSION Beta v0.8.0.**
`send-board-push` redeployed.

The user had followed /gen/ on both of their accounts, posted, and never got a notification. It took
four separate faults, found one under the other, to explain that.

## 1. Your own posts never notify you (by design)

In the first test the poster was AA. The only other follower of /gen/ was Steve miller, and Steve had
**no device registered for push at all**. Calling the function by hand as AA answered
`{"sent":0,"followers":1}`: one follower, nowhere to send.

## 2. A device registered to one account could never move to another (fixed)

Steve's phone *had* been registered, for **AA**, since 17 Sept 06:40 UTC. `subscribeToPush()` saved a
device with a plain `upsert` on `endpoint`, and RLS on `push_subscriptions` only lets a browser touch
rows that are already its own. So once a device belonged to one account, any other account signing
in on it failed to save it. That covers a log out, a new anonymous login, or a second character on
the same phone. The error was never checked. AA's notifications, whisper previews included, kept
going to a phone now used as Steve, and Steve got nothing. The practice run reproduced it on live
data: "new row violates row-level security policy (USING expression)".

- `gc_save_push_subscription(endpoint, p256dh, auth)` (`push_devices_fix.sql`) is SECURITY DEFINER.
  It takes the endpoint over for whoever is signed in. This is safe because an endpoint is a secret
  only the owning browser knows. A thief could at most stop someone's pushes until their next
  sign-in, and could never read them: pushes are encrypted to keys the device holds.
- `subscribeToPush()` and the `pushsubscriptionchange` refresh both use it and log a failure.
- Logging out deletes this device's row (before `signOut`), so a device you left stops showing your
  notifications. The browser keeps its subscription; the next sign-in saves it under whoever that is.

When Steve opened 163 on the phone, the row moved from AA to Steve (its `created_at` still says 17
Sept).

## 3. The in-app gap (fixed)

`sw.js` drops a push whenever any Gypsy Chat window has focus. That is right for a whisper, which
the page already shows. For a board, nothing on the page said a word unless you were reading that
board, so a follower sitting in the app heard nothing. `boardPostArrived()` now shows a pop-up with
a ding for a new thread on a followed board, under the same condition the service worker drops the
push (`document.hasFocus()`), so the two never both fire. Tapping it opens the thread.

## 4. Board pushes went out at low priority (fixed; the real reason nothing showed)

With 2 and 3 fixed, pushes to the phone still reported `sent: 1` and never appeared. `send-push`, the
whisper function, passes `{ urgency: 'high', TTL: 43200 }`, with a comment explaining that without it
FCM treats a push as low priority and holds it until the device next wakes. `send-board-push` was
written later, from scratch, and left the options out. "sent" only ever meant "the push service
accepted it", which it always did. It now passes the same two options, and writes one line per call
to its Logs tab (board, followers, devices, sent, pruned, failed status codes; never who). Redeployed
from the dashboard; the repo copy is identical.

**Verified by the user:** AA posted a thread on /gen/ from the desktop and it arrived on Steve's
phone. The function log for AA's "test 1" read
`{"board":"gen","followers":1,"devices":1,"sent":1,"pruned":0,"failed":[]}`.

## 5. A dead desktop registration (fixed by turning the bell off and on)

Phone to desktop still failed after the priority fix. The server logged each send as `sent 1`,
nothing failed, and the stored keys matched the browser's (hashes compared). The user opened
**chrome://gcm-internals** and recorded while posting from the phone. Chrome was connected (a Chrome
Sync message arrived four seconds after the post), but no `wp:https://gypsychat2003…` message ever
came. Google was accepting pushes for that registration and delivering them nowhere. Turning the
Gypsy Chat bell off and on (unsubscribe, subscribe, new endpoint saved through
`gc_save_push_subscription`) fixed it at once. The next post arrived as
`wp:https://gypsychat2003.jmil449988.workers.dev/#…-V2  Data msg received` and the notification
showed. Why a registration only twelve hours old had gone dead is not known.

**Both directions now verified live:** desktop to phone, and phone to desktop.

**If a tester says notifications never come:** on Windows, first check Settings → System →
Notifications → Notifications from apps and other senders → Google Chrome is on (see build 164).
Then make sure the receiving device does not have Gypsy Chat open in front. Then check the function's Logs tab for their device count; 0 means the bell
was never turned on on that device. Then have them turn the bell off and on, which replaces a dead
registration. On desktop Chrome, chrome://gcm-internals → Start Recording shows whether a
`wp:` message arrives at all. On iPhone, only the Home Screen app can receive notifications.
A "send me a test notification" button would make this self-service: `send-push` refuses to send
to yourself, so it needs a small server change.

## How to test notifications from now on

A notification only appears when the Gypsy Chat window on the receiving device is **not** in front.
If it is, a whisper shows in the window and a followed board shows the in-app pop-up. Test with two
accounts on two devices: post from one, and have the other locked or switched away. The function's
Logs tab now says what was sent to how many devices.

Two low-priority test notifications from before the fix ("Push test from AA.Romani.world") may still
turn up late on the phone. The test threads on /gen/ ("Push test" ×2 by Steve miller, "test 1" and
"test" by AA) are ordinary posts and can be deleted from the board.

# Build 164: every push pops up, not just the first (18 Sept 2026)

## What the user saw

After the phone-to-desktop post at 09:12 PDT popped up, the next three posts from Steve's phone
(09:17:30, 09:18:06, 09:18:45) showed nothing on the desktop, although the function logged each one
as `sent 1`, nothing failed, and the registration was the one that had just worked. The user then
reset the site's cookies and permissions several times. Each reset killed that device's
registration, so the sends between 09:20 and 09:24 were logged as `pruned` or `devices 0`. The bell
at 09:25:09 made a fresh one, and Steve's post seventeen seconds later went out as `sent 1`.

## The cause: same tag, no renotify

Every board push carries one tag per board (`gc-board-gen`), and every whisper one per sender. On
Windows, Chrome marks a new toast *SuppressPopup* when `renotify` is not set and a toast with the
same tag is still in the notification centre (Chromium,
`chrome/browser/notifications/notification_platform_bridge_win.cc`). The 09:12 notification went to
the Windows notification centre and stayed there, so every later post on /gen/ replaced it with no
banner and no sound. On a phone the same rule stops the sound and the heads-up banner.

The 09:25 post is most likely the other, deliberate rule: the desktop Gypsy Chat window had focus
(the bell had been clicked there seventeen seconds before), and the service worker never pops a
system notification over a focused Gypsy Chat window. The in-app 📜 pop-up is meant to cover that
case.

Checked on the desktop after the deploy: permission granted, one service worker (cache
gc2000-v195), the browser's subscription is the one stored in the database, and no notifications
from the site are currently displayed.

## The fix

`sw.js` passes `renotify: true` to `showNotification` (the tag always falls back to `gc-push`,
which renotify requires). The tag still keeps one entry per board or person in the notification
centre; each new one now alerts. Cache gc2000-v195, app.js v164.

`notifyDesktop()` in the page deliberately does **not** get renotify. A page notification and a
service-worker notification never replace each other in Chrome, even with the same tag, so with
the tab open in the background a whisper can show both. A renotify on the page one would make that
happen for every whisper, not just the first.

## Still open

- With Gypsy Chat open in a background tab and the bell on, a whisper probably shows two desktop
  notifications (the page's and the push's). Untested; the fix is for the page to leave it to the
  push when this device has one.
- A notification click only brings the tab forward; it does not open the whisper or thread.

## Update: Windows had Chrome's notifications switched off

The user found Google Chrome switched off under Windows Settings → System → Notifications →
Notifications from apps and other senders. They had turned it off when the PC was new because
notifications were annoying. With it switched on, phone to desktop works perfectly.

A website cannot see this switch. The site permission still reads "granted" and pushes still
arrive, so every check from the page side looked healthy while Windows showed nothing. The 09:12
notification did appear, so it is not certain which of the later posts this switch hid and which
the same-tag rule hid. The renotify fix stands on its own: the Chromium code quoted above suppresses
the banner for a same-tag notification whenever renotify is off.

# Build 165: the bell names the Windows switch (18 Sept 2026)

On Windows, when notifications are on, the 🔔 button's tooltip (More options → Notifications) now
ends: "Nothing popping up? In Windows Settings → System → Notifications, make sure Google Chrome is
on under “Notifications from apps and other senders”." Microsoft Edge and Firefox are named as
Windows lists them. Other browsers (Brave, Opera, Vivaldi) get "your browser", because what Windows
calls each of them wasn't checked. Macs, phones, and the off and blocked states keep their old
tooltips. New helpers: `isWindowsDevice()` and `windowsBrowserName()`. Cache gc2000-v196,
app.js v165.

Checked on the user's desktop with the live code: the tooltip names Google Chrome. The service
worker updated to v196 and the push registration was kept.

# Build 166: the readings come back after a reload or a log out (18 Sept 2026)

**Reported:** after logging out and back in, the Bible verses were gone from the chat.

**Why:** a reading (the scripture card at each of the hours) is drawn in the page only and never
written to the database, which is on purpose (no row, no realtime traffic, none of the room's
100-message budget). The room log itself is never emptied inside a page. Logging out hides it, and
logging back in in the same page shows it again. But anything that builds the chat afresh from the
database — a refresh, the update banner's reload, reopening the app and signing in — came back
without a single reading. Not even the reading for the hour we were in came back, because the one
key the device kept (`gc_hour_shown`) said it had already been shown.

**Fix:** each device keeps a short list of the readings it has shown in `localStorage`
(`gc_hours_seen`: hour, passage index, when it was drawn; a week's worth, at most 60). The history
replay at sign-on merges them back among the messages by time, each where it stood, with the day
dividers still right. Readings older than the oldest room message in the backlog left with those
messages and stay gone. The reading for the hour we are in is always on screen once the room is.
If it didn't come back with the history, it is drawn at the bottom, quietly. Restoring never rings
the bell. Only readings this device showed come back, so "a bell you missed is a bell you missed"
still holds. `bellTick()` now waits for the history (`roomHistoryIn`, cleared by `leaveRoom`), so a
reading can no longer land above a backlog that is still arriving. The old `gc_hour_shown` key is
removed on load.

**Tested** in a jsdom harness that runs the real functions and the real replay snippet from
app.js across simulated page loads, 21 checks:
- the bell and reading at the strike
- a reload putting the reading back in place, quietly and with the same passage
- a whisper not deciding where the backlog starts
- a second hour striking
- an old reading leaving with its messages
- the current hour redrawn at the bottom when the backlog has moved past it
- the day divider across midnight, an empty room, and the week's pruning
- migration from the old key, and a corrupt list

**Live:** app.js and sw.js on the site match the repo byte for byte (SHA-256), and the desktop's
service worker is on gc2000-v197. Readings shown before this build were never recorded, so they
cannot come back. Recording starts with the first reading each device shows on build 166.

# Build 167: Battleship (18 Sept 2026)

Current state: **app.js 167, style.css 116, cache `gc2000-v198`.**
`supabase/battleship_feature.sql` applied (practice run first: `battleship_dryrun.sql`).

## The rules the user chose

- Classic 10×10 sea, five ships each: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.
- Placement: the server deals each fleet a random layout at accept (no two ships touching). In the
  whisper you can **Shuffle**, **tap a ship to turn it**, **drag it to move it**, then **Ready**. You
  get 60 s. A browser sends its own arranged fleet at 2 s left. After 62 s the server sails anyone not
  Ready with the fleet they were dealt. By hand, ships may touch but not overlap.
- **A hit shoots again**; a miss hands the turn over. The challenged player fires first. 30 s a
  shot; running out fires one at random.
- **10 XP a win, 3 XP a loss**, under the shared 500-a-day cap. A resignation pays the winner 10 only
  once 20 shots have been fired between the two players, and never pays the resigner. Without that
  rule, starting a game and resigning at once would mint 10 XP a round. Resign takes two taps.

## How it is built

- `battleship_games`: the public row. Both seas are 100 characters as the attacker sees them: `.`
  untouched, `o` miss, `x` hit, and a sunk ship's cells turn into its letter. It is in the realtime
  publication. It was applied BEFORE the client that listens to it shipped, because of the
  build 154 lesson.
- `battleship_fleets`: each layout. The policy lets you read your own fleet at any time and the
  other one only once the game is finished (the reveal at the end draws their surviving ships
  faintly).
- Every change is a security-definer function: `battleship_respond / ready / fire / timeout /
  resign / cancel / leaderboard`. The helpers they share (`bs_apply`, `bs_award`, `bs_maybe_start`,
  `bs_random_layout`) are **not** executable by browsers, so nobody can fire a shot in someone
  else's name. The timeout locks the row first, so two browsers can't both act on one expired
  clock. `game_points_today` now counts Battleship.
- Client: the 🎲 menu, a card in the whisper, a 🚢 Battleship tab in the Popularity Contest,
  toasts, a push for the challenge, and synth sounds (splash / boom / sinking) until recordings
  exist. Cell state classes are all `bs-` prefixed: the first draft used `.sh`, which is already
  the share-card class, and `.sunk`, which is already a global class. Both broke the layout.
  Also fixed: tapping a row on the Prasta ladder did nothing.

## Tests

- Local Postgres 16 with a scaffold: the dry run plus 500 dealt fleets (all legal, none touching,
  all different), a late resignation (10 + 0), and the cap (495 earned today → paid 5).
- Production practice run, rolled back, 16 checks as AA and Steve. They cover the insert policy,
  secrecy (Steve reads only his own fleet mid-game), `bs_apply` refused to browsers, four kinds of
  illegal fleet refused, Ready twice refused, turn order, firing twice at one square refused, hits
  keeping the turn, a full sinking (status finished, 17 sunk cells), the reveal, XP +10 / +3, an
  early resignation paying 0 + 0, both clocks, and the leaderboard.
- jsdom harness, 56 checks on the real module:
  - layouts, and turning/moving ships (including the blocked-rotation fallback)
  - drag previews in green and red, the snap back, and a re-render mid-drag being deferred
  - Ready sending the arranged fleet
  - sounds and nudges per event, the silent realtime echo, win/loss text with XP, the reveal
  - the two-tap resign, and both clocks' auto-Ready and timeout timing
- Rendered with the real CSS in Chromium at the dock width (300 px) and a phone width (390 px).
- Live: app.js, sw.js and style.css match the repo byte for byte (SHA-256).

## Release plan note

`battleship_games` and `battleship_fleets` join the release reset list.

## Found on the way: browsers can call the other games' internal helpers (NOT fixed yet)

Fourteen security-definer helpers of the older games can be executed by any signed-in browser
(`authenticated` has EXECUTE):

`game_apply, game_award, hd_credit, hd_deal, hd_finish, hd_settle, hd_showdown, hd_touch, hd_xp,
hm_apply, hm_award, pr_showdown, uno_award, uno_sync`

The worst of them:
- `hd_credit(p, delta)` adds any amount of XP to anyone, or takes it away.
- The `*_award` functions pay a finished game again every time they are called.
- `game_apply` / `hm_apply` make moves in the other player's name.
- `hd_settle` settles a Hold'em table for whoever the caller names.

Nothing in app.js calls any of them. No non-definer function, policy, view or trigger references
them, and pg_cron isn't installed, so revoking EXECUTE from `public, anon, authenticated` (keeping
`service_role`) should not break anything. `holdem_act` and `uno_pass` are called by the client and
must stay executable.

# Build 168: bigger conversation windows on desktop (18 Sept 2026)

Current state: **app.js 168, style.css 117, cache `gc2000-v199`.**

**Reported:** Battleship doesn't fit inside the whisper window in the browser. The user asked for it
"taller and a bit wider", for group chats too.

**Why:** the Messages dock was at most 340×480 on desktop, which left the log about 321 px tall.
Measured with the real CSS, a Battleship card needed 397–515 px depending on the width, so it
overflowed by 76–194 px.

**Fix (desktop only; phones already give the dock the whole screen):** an open conversation,
whisper or group, is now up to **400 px wide** (never under 280; from 260–340) and up to **760 px
tall** (from 480), limited by the window's height. The width still follows the gap beside the room
window, so it only reaches 400 where there's room. The inbox list keeps the old size. On a short
screen the Battleship sea shrinks a little inside the dock (`max-width … calc(100vh - 440px)`,
never under 200 px), so the whole card still fits. The roulette bubble steps left of the wider
panel (new `dm-thread` class on the root).

Measured after the change, the placing and in-play cards fit without scrolling at 1920×950,
1536×730, 1440×790, 1366×650 and 1280×650.

**Trade-off:** on screens wide enough for the Ballot Box gutter (1340 px+), a conversation that is
open now covers the lower part of the Ballot Box panel. It comes back as soon as the dock returns
to the list or is collapsed.

# Step 0 of the 4-player tables: game helpers locked down, Hold'em uncapped (18 Sept 2026)

Database only; no client change. Files: `supabase/game_helpers_lockdown.sql` (applied) and
`supabase/game_helpers_lockdown_dryrun.sql` (its rolled-back tests).

**Security fix.** The sixteen internal helpers of the older games are no longer executable from a
browser (EXECUTE revoked from `public, anon, authenticated`, kept for `service_role`):

`game_apply, game_award, hd_credit, hd_deal, hd_finish, hd_next_street, hd_settle, hd_showdown,
hd_touch, hd_xp, hm_apply, hm_award, pr_showdown, uno_award, uno_draw_cards, uno_sync`

(Two more than the fourteen listed under build 167: `hd_next_street` and `uno_draw_cards` turned up
when every security-definer function was re-audited.) The games' public functions are security
definer, so they still reach the helpers as their owner.

**Hold'em is a pure transfer** (the user's decision: "remove the cap"). Chips only change hands, so
nothing new is created that a daily cap would have to limit, and trimming a winner's cash-out to the
cap only ever deleted chips the loser had already paid. `hd_finish` now pays both stacks back in
full, and `game_points_today` no longer counts Hold'em, the same as Prasta. Hold'em winnings no
longer use up the day's 500 XP from the other games.

**Tested in production inside a rolled-back transaction:**
- 16 of 16 helpers refused to a signed-in browser.
- Tic-Tac-Toe, Hangman, UNO, Hold'em and Prasta still play through their own public functions.
- Hold'em XP conserved (444 before, 444 after) with both players already at the daily cap; the old
  code would have trimmed the winner's cash-out to nothing.
- The cap total no longer includes Hold'em.

Checked after applying: `still_callable 0, service_ok 16, client_rpcs_ok true,
cap_counts_holdem false, hd_finish_capped false`.

**Still to do:** the level text "(game XP caps at 500 a day)" should say that Hold'em and Prasta
chips just change hands. Planned for the Step 1 client build.

# Build 169: the Game Room, and UNO for 2-4 players (Step 1 of the 4-player games) (18 Sept 2026)

Current state: **app.js 169, style.css 118, cache `gc2000-v200`.** Database: `supabase/game_tables_feature.sql`
(tested by `supabase/game_tables_dryrun.sql`).

**Asked for:** 4-player UNO and Hold'em with 4 spectator seats. Decided with the user:
- A **Game Room** page. Desktop: 🎴 in the title bar beside Roulette. Phone: a 🎴 bubble above the other two.
- Each table: **4 player seats and 4 spectator seats**. Spectators watch and chat only; to play they take a free
  player seat between games. One table at a time per person.
- The host deals once **2-4 players** are seated. Anyone can sit down; the host can **invite friends** (with a push).
- A new table is **announced in the main chat** with a Join button.
- **Two missed turns in a row** and you're out of the round and off the table.
- UNO is played until one player is left holding cards. **XP by the order players get rid of their cards: 1st 10,
  2nd 5, 3rd 2**; whoever is left holding cards gets nothing. It counts toward the 500-a-day game cap.
- Hold'em comes next (Step 2), on the same tables; its button is there but disabled ("coming soon").

**How it works**
- Tables, seats, table chat, invites and the UNO round live in their own tables (see the migration's header for
  who may read what). Every change goes through security-definer functions; browsers can't write any of these
  tables, and the internal helpers can't be called from a browser.
- XP is paid only for playing out your hand, so a round "won" because everyone else left or timed out pays
  nothing: no start-a-table-and-leave farming. Leavers and timed-out players take the lowest places.
- UNO rules on top of the 2-player ones: direction and Reverse (with two players left it works like Skip); Skip,
  Draw Two and Wild Draw Four hit the next player still holding cards; a player who plays out leaves the round
  and play goes on. A player on one card who didn't call UNO can be caught by anyone still in the round, until
  the next move is made. UNO! stays on offer while a wild waits for its colour.
- The client listens on channels of its own (`gameroom`, and `gtable:<id>` while seated), not the room channel,
  so nothing here can stop the room's own realtime (the build 154 lesson). Every table it listens to is in the
  `supabase_realtime` publication.
- While seated, the browser says "still here" once a minute. A seat not heard from for five minutes is freed
  (except a player holding cards in a running round: the turn clock handles those). A round nobody has touched
  for ten minutes closes its table. Closed tables are deleted after a day; their results stay (the cap reads them).
- Table chat: 300 characters, the same spam cooldown as the room, 5 lines per 5 seconds, the last 100 kept,
  blocked people hidden. Admins can close a table from the list.
- Signing off, being removed or timing out of the room gives up your seat at once. A page reload while seated
  finds the table again and says so.
- The level explainer now says XP also comes from the Game Room tables, and that Hold'em and Prasta chips just
  change hands.

**Tested**
- Local Postgres, rolled back: 62 checks (seats, dealing, hand privacy, helpers refused to browsers, spectators,
  chat privacy and limits, every card effect, UNO calls and catching, places and XP for 3 and 4 players, the
  clock and the idle rule, leaving, the sweep, invites, the daily cap).
- Concurrency: 8 simulated players hammering 1,500 random moves each in parallel with clocks and seats being
  aged underneath them: no deadlocks, every deck still exactly 108 cards, places always 1..n with no gaps.
- Integration: five simulated browsers running the real Game Room code against the real migration, clicking the
  real buttons: two full rounds, invites, announcements, chat, a forfeit, the idle rule, a reload, host handover,
  closing. 53 checks; random play, so it was run repeatedly: every run passed (three on the final code).
- Rendered with the real CSS in Chromium at 1366x768 and 390x844; the title bar stays centred with three glyphs.
- The whole app loads in jsdom with no errors.
- Production, inside a rolled-back transaction with five throwaway accounts: the same 62 checks, 0 failed, and
  nothing left behind. Then applied. Checked after applying: 8 tables with RLS, 7 policies, the 5 listened-to
  tables in the publication, browsers can call exactly the 15 verbs and none of the 11 helpers, anon nothing,
  the deck unreadable, no direct inserts, and the daily cap counts table XP.
- Live: app.js, style.css, sw.js and index.html match the repo byte for byte (SHA-256).

**Not tested yet:** real phones and real realtime with people at a table. That is the user's UNO test, before
Step 2 (4-player Hold'em) is built on these tables.

**Release plan note:** `game_tables`, `table_seats`, `table_messages`, `table_invites`, `uno_tables`,
`uno_table_hands`, `uno_table_decks` and `table_results` join the release reset list.

# Build 170: Hold'em for 2-4 players at the Game Room tables (Step 2 of the 4-player games) (18 Sept 2026)

Current state: **app.js 170, style.css 119, cache `gc2000-v201`.** Database: `supabase/holdem_tables_feature.sql`
(tested by `supabase/holdem_tables_dryrun.sql`; `game_tables_dryrun.sql` updated to run on top of it).

**Asked for:** "go ahead and do holdem now", on the tables built in Step 1. Decided with the user earlier:
- No-limit Texas Hold'em for **2-4 players**, with the 4 spectator seats. Spectators watch and chat only.
- **Chips are XP and only change hands** ("remove the cap"): no daily cap, nothing created or destroyed.
- **Two missed turns in a row** and you're out: your stack goes back to your XP and you leave the table.
- The same two stakes as the heads-up game, picked by whoever opens the table: **Low** (blinds 1/2, sit down with
  5-10 XP) and **High** (blinds 2/5, sit down with 10-50 XP).

**How it works**
- Opening: the Hold'em button asks for the stakes, then the buy-in. Sitting down (from the list, the announcement,
  an invite, or from watching) asks for a buy-in too. The buy-in leaves your XP at once (an escrow) and your whole
  stack comes back when you give up the seat: leaving, "Cash out & watch", two missed turns, a quiet device, or
  the table closing. Every cash-out is written to `table_results` with its net result.
- A free player seat can be taken at any time, even mid-hand: you're dealt in at the next hand.
- The host deals the first hand. After that the browsers ask for the next hand by themselves, 5 seconds after a
  fold win and 8 after a showdown (the server deals no sooner than 4). With fewer than two players holding chips
  the table waits, and starts again by itself when someone sits back down.
- Rules: the button moves one funded seat a hand; the next two post the blinds (heads-up, the button posts the
  small blind). Fold, check/call, bet/raise-to with a minimum raise (all-in for less is allowed). An uncalled bet
  goes back. Side pots for players all-in for different amounts, each won by the best hand among those who
  covered it; ties split, odd chips from the button. When at most one player can still bet, the board runs out.
- A player on no chips after a hand moves to the watchers (or off the table if those four seats are full).
- The turn clock is the same 30 seconds: the first miss checks if it can, otherwise folds, with a warning;
  the second takes the player off the table.
- On screen: each seat shows the stack, the bet, D/SB/BB, face-down cards (your own face up), folded / all-in /
  won / plays next hand. The felt shows the board, the pot and street, whose move it is, the clock and the last
  action; between hands the result and a countdown. Under it, your two cards and the buttons: Fold (only when
  there is something to call), Check or Call, and Min / Pot / All-in with a box for any amount. Every hand's
  result goes into the table chat once.
- Leaving while still in a hand asks twice ("Fold and leave?"). What you already bet stays in the pot.
- Two small fixes found on the way: Escape in a dialog on top of the Game Room (like the buy-in box) no longer
  closes the Game Room too, and a small menu with no room above its button now opens below it.

**Tested**
- Local Postgres, rolled back: 47 checks (escrow and ranges, a three-way all-in run out, side pots with four
  stacks, a split pot with an odd chip, heads-up blind order, sitting down mid-hand, busting, the clock and the
  idle rule, leaving mid-hand, closing, high stakes, waiting and restarting). The UNO table tests (62) still pass
  on top.
- Concurrency: 8 simulated players with 200 XP each playing random moves in 8 parallel sessions, with a ninth
  aging clocks and seats underneath, three times over: 163 hands, no deadlocks, no negative stack, no hand stuck,
  and every XP accounted for (1,600 before, 1,600 after).
- Integration: five simulated browsers running the real Game Room code against the real migrations, clicking
  the real buttons (stakes menu, buy-ins, Fold / Call / presets / typed raises with Enter, Cash out & watch,
  Leave): after every single action it checks that XP is conserved, that every screen agrees with the database
  (the lit seat, the buttons only for the player on turn, the stacks, the board), and that nobody sees anyone
  else's cards. Random play, so it was run with six seeds: 213-276 checks per run, all passed. The UNO
  integration test (53) still passes.
- Rendered with the real CSS in Chromium at 1366x768 and 390x844 (lobby, waiting, my move, watching, showdown).
- The whole app loads in jsdom with no errors.
- Production, inside rolled-back transactions: the 47 Hold'em checks, 0 failed, and the 62 UNO table checks on
  top of the new SQL, 0 failed. Then applied. Checked after applying: 3 new tables with RLS, 2 policies, both
  listened-to tables in the publication, browsers can call the 8 verbs and none of the 16 new helpers (nor
  `table_shut`, `table_drop`, `tables_sweep`), anon nothing.
- Live: app.js, style.css, sw.js and index.html match the repo byte for byte (SHA-256).

**Not tested yet:** real phones and real realtime with people at a table. That is the user's Hold'em test.

**Release plan note:** `holdem_tables`, `holdem_table_hands` and `holdem_table_decks` join the release reset list.

# Build 171: new icons for the three page buttons (18 Sept 2026)

Current state: **app.js 171, style.css 120, cache `gc2000-v202`.** No database change.

**Asked for:** the Game Room button as a poker table, Threads as a purple @, and Roulette as a spinning red
Romani wagon wheel.

**Done:** all three are now small inline SVG drawings instead of emoji and text glyphs, so they look the same on
every phone and desktop. The markup is in `index.html` for the first paint and in `ICON_TABLE`, `ICON_AT` and
`ICON_WHEEL` in app.js for when the code redraws a button.
- **Game Room:** a poker table seen from above, with a wooden rail, green felt, a gold betting line and two cards.
  The same icon is in the Game Room page's header and on its toasts (invites, "you're still at a table").
- **Threads:** a purple @ with a purple glow. While the board is open the button still shows 💬, meaning "back to chat".
- **Roulette:** a red wheel with sixteen spokes, like the wheel on the Romani flag. It turns once every 9 seconds
  and stands still for anyone whose device asks for reduced motion.
- In the title bar each icon glows in its own colour instead of the old gold. The one-time tips now say "the purple
  @" and "the little poker table" (and that the Game Room has Hold'em).

**Checked:** rendered with the real CSS in Chromium in the desktop title bar (the name stays centred), as phone
bubbles, and on the sign-on screen. The whole app loads with no errors. The Game Room tests still pass
(Hold'em 253 checks, UNO 53). Live files match the repo byte for byte.

# Build 172: pixel-art icons, and a suggestion box (18 Sept 2026)

Current state: **app.js 172, style.css 121, cache `gc2000-v203`.** Database: `supabase/suggestions_feature.sql`
(tested by `supabase/suggestions_dryrun.sql`).

**Asked for:** the user sent three pixel-art pictures (a purple thread spool, a light bulb and an envelope)
and chose where they go:
- the spool on the Threads button, in place of the purple @;
- the envelope for Messages;
- for the light bulb: "a suggestions box that leads to the user report / bug report page with its own tab",
  taking video, pictures and text;
- the poker table and the wheel redrawn as pixel art to match.

**Icons.** `public/icons/ui-*.png`:
- The envelope and the bulb are the user's drawings taken back to their own pixel grid (24x26 and 22x29) and
  saved at four times that size.
- The spool is the user's 256x256 file as it came.
- The poker table (32x22) and the red wheel (32x32) are drawn new in the same style: 1-px black outline, flat
  colours, a few lit pixels. The wheel has sixteen spokes, as on the Romani flag, and still turns once every
  9 seconds (it stands still for reduced motion).

Where they show:
- **spool:** the Threads button, in the title bar and on the phone bubble;
- **table:** the Game Room button, the Game Room page header and its toasts;
- **wheel:** the Roulette button;
- **envelope:** the Messages button in the bottom bar, and the Messages bar;
- **bulb:** the new Suggestions button and the suggestion box's title.

The service worker caches all five icons.

**The suggestion box.**
- **Where it is:** a Suggestions button, first in the Help group next to Report a bug. On a desktop that's the
  bottom bar; on a phone, the ⋯ menu.
- **What you can send:** an idea up to 2,000 characters, plus up to five pictures (5 MB each) or videos (MP4,
  MOV or WEBM, up to 50 MB each). Each file uploads as soon as it's picked, and Send waits for uploads to
  finish. Problems (a file too big, the wrong type, a failed upload, too many sent) show inside the box, not in
  the chat behind it.
- **Where the files go:** a new private bucket, `suggestions`. People upload into their own folder; only
  admins can read.
- **What the server does to each row:**
  - takes the author's name from their profile, not from the browser;
  - always starts it as open;
  - accepts only attachments inside the author's own folder, and keeps just the file path, type and name;
  - allows at most 5 in 10 minutes or 20 a day per person;
  - refuses banned people.
- **Who can see them:** people can't read suggestions, not even their own; only admins can.
- **The admin side:** the Reports page has a third tab, Suggestions, with its own count, which is also added
  to the Reports badge.
  - Pictures show as thumbnails and videos play right in the list, both through one-hour signed links.
  - Done and Dismiss close a suggestion.
  - New ones arrive live.
  - The page opens on whichever tab has something waiting.

**Tested**
- **Database, locally (rolled back):** 35 checks, 0 failed. They cover:
  - name, status and trimming;
  - the attachment rules (someone else's folder, wrong type, a path that climbs out, six files);
  - text length limits;
  - filing as someone else, being banned, not being signed in;
  - both throttles;
  - who can read, update and delete;
  - the trigger's privileges and the publication;
  - the bucket's settings and its upload and read rules.
- **The box itself:** the real app.js running in jsdom against the real SQL, clicking the real buttons.
  23 checks, 0 failed: uploads, every refusal message, sending, the removed-file case, the throttle message,
  Escape, the admin badge and tab, signed media, Done and Dismiss, switching tabs.
- **Nothing else broke:** the UNO and Hold'em integration tests still pass. A test-harness bug that crashed
  the UNO test when the host was the one timed out is fixed.
- **Screenshots and page load:** rendered in Chromium on the real page at 1280 and 390 wide (title bar,
  bottom bar, phone bubbles, ⋯ menu, the box, the admin tab). The title stays centred, and the whole app
  loads with no errors.
- **Production:** the 35 checks in a rolled-back transaction, 0 failed, then applied. Checked after
  applying: 3 policies, RLS on, the trigger, in the publication, the bucket private at 50 MB, 2 storage
  policies, the trigger function not callable by browsers, anon can't insert, no rows.
- **Live:** all nine changed files (app.js, style.css, index.html, sw.js and the five icons) match the
  repo byte for byte (SHA-256).

**Not tested yet:** a real upload from a phone (the storage server itself isn't part of the local tests).

**Release plan note:** `suggestions` and the `suggestions` storage bucket join the release reset list.

# Build 173: idle players forfeit their stack (18 Sept 2026)

Current state: **app.js 173, style.css 121, cache `gc2000-v204`.** Database: `supabase/holdem_idle_forfeit.sql`
(applied; `holdem_tables_feature.sql` updated to match, `holdem_tables_dryrun.sql` check 36 rewritten).

**The first live Hold'em test** (the user on a phone as Steve miller, Claude on the desktop as AA.Romani.world,
table 11): opening, buy-in, deal, raise, call, all-in with the board run out, a showdown, a bust to the watchers,
buy-back, the table restarting by itself, a reload finding the seat again, a first miss (fold + warning) and the
second miss standing the player up. All as designed, XP conserved to the chip. One oddity: three seconds after
hand 4 the desktop seat cashed out without a click from Claude; the money settled correctly, cause unknown
(possibly a replayed click from the browser extension, which was misbehaving that evening).

**The user's call after it:** being stood up for two missed turns in a row should cost the stack. Now the whole
stack goes into the pot of the hand being played, counted as that seat's contribution so the side-pot arithmetic
sees it, and the result records the loss of the whole buy-in. Nothing is destroyed and nothing goes to the house:
whoever wins that hand takes it. Every other way of leaving a seat still sends the stack home.

Noted to the user before building it: the big poker sites never take a stack for idling (they auto-fold and mark
the player sitting out), so this is harsher than the norm, and a phone dying mid-hand hands the stack to whoever
is left. Kept "two misses in a row, same hand or the next" rather than "same hand only", because a first miss
that folds you ends your hand, so a same-hand rule could never fire and an idle player would squat in the seat.

Screen text updated: the seat-lost note, the rules blurb, and the first-miss warning ("...they're out, chips and all").

**Tested:** 47/47 locally and in a rolled-back production run (check 36 now asserts the forfeit lands in the pot
and the result reads idle:-buy_in; 37 that XP is conserved); the migration also tested on the previous schema;
the stress run (197 hands, 1,600 XP in and out); the UNO tables' 62 checks; the Hold'em integration test (241);
the page loads clean. Applied, then verified the new function bodies are live and the helpers stay
service_role-only. Live files match the repo.

Also this evening, at the user's request "for the time being before we go live": Steve miller set to level 85,
AA.Romani.world and S.S SIGINT to level 100, by setting game_points directly (level = floor(sqrt(XP/3)) + 1).

## Build 174 — the starter purse (19 Sept 2026)

Current state: **app.js 174, style.css 121, cache `gc2000-v205`.** Database: `supabase/starter_purse_feature.sql`
(with `starter_purse_dryrun.sql`, 26 checks).

The user: "give new users a 100 xp to begin with that doesnt affect their level." Every new character (the
AFTER INSERT trigger on `profiles`, which is where `claim_name` creates one) gets a 100 XP purse in
`user_stats.bonus`, once per account (`bonus_granted`). The purse is table money only: `hd_xp()` -- the
"can you cover this buy-in?" number every game uses -- now counts it, while `xp` and `level` stay generated
from reactions + game points exactly as before. `hd_credit()` does the bookkeeping in one place: a buy-in
takes from the purse first (`bonus_in_play` remembers how much), a payout refills the purse up to that and
only the remainder becomes level-counting XP. Lost purse chips are gone; the leftover `bonus_in_play` is
written off at the next buy-in when the player sits at no other table (`hd_seated_elsewhere`, which skips
rows touched in the same transaction, i.e. the game being created). XP conservation unchanged.

Existing accounts are not touched; the release reset recreates the profiles, so the trigger hands the purse
to everyone then. Known and accepted: two friends can pass a purse from one to the other at a table, turning
it into level XP for the winner -- 100 XP, once per account, about level 6.

Client: the level popover and the badge tooltip show the purse as its own line; the buy-in checks
(`xpOfUser`) count it, as the server does. `holdem_tables_dryrun.sql` now expects the trigger to have made
the test people's stats rows.

Tested: 26/26 locally and in a rolled-back production run; the seated-elsewhere branch against committed
rows locally; the Hold'em tables (47) and UNO tables (62) dry runs on top of the purse.

## Build 175 — the first-hour package (19 Sept 2026)

Current state: **app.js 175, style.css 122, cache `gc2000-v206`.** Database: `supabase/first_hour_feature.sql`
(with `first_hour_dryrun.sql`, 52 checks). Not yet applied to production or deployed: built on branch
`build-b` for the lead to merge.

**Asked for:** what a brand-new person with no friends can do in their first hour. Four things.

**A welcome with names.** The first time an account signs on with a name, everyone in the room sees
"🎉 Name just walked in — say hi!" with a 👋 Wave button on the line, and the newcomer alone sees "Here now:
A, B, C and 4 others" (people from their own region first, when they picked one) and "Tap a name to wave 👋,
or hit Quick seat in the Game Room". System lines are client-only in this app, so the room line is drawn from
a realtime INSERT on a new `welcomes` table that only the server writes: `welcome_newcomer()`, called by the
browser right after its first successful `claim_name`, stamps `profiles.welcomed_at` and writes the one row.
A reload, a rename or a second call does nothing; a banned account is not announced; the migration stamps
every existing character so nobody who was here before is welcomed twice (the release reset recreates the
profiles, so everybody gets a proper welcome then). Rows older than a day are swept by the next welcome.

**Waves.** "👋 Wave" on any name's menu (and on the newcomer line) says hello without a friend request. The
other person gets "Name waved at you 👋" with a "Wave back" button, a ding and a desktop notification.
`wave(p_target)` writes one row to `waves`, which only the two people involved can read; it allows one wave
per person a day and twenty a day in all, refuses across a block in either direction, and refuses anyone
banned, muted or cooling down (the same `is_banned` / `is_muted_or_cooling` every send policy uses). A wave
back is a wave of its own. Both tables sit on a channel of their own in the client (`firsthour-<id>`), never
the room channel, so a slip there could not take the room down (build 154).

**Quick seat.** One button at the top of the Game Room: sits you at the open table with the most people
waiting for a player; failing that at the newest table with a free player seat (a Hold'em hand in play still
takes a new player at the next deal); failing that it opens a low-stakes Hold'em table, announced in the main
chat as usual. Hold'em tables you can't cover are skipped. The buy-in is min(the table's max, what you have);
if you can't cover the minimum of a low table and there is nothing else to sit at, it says so and points at
UNO. Everything goes through the same `holdem_table_sit` / `holdem_table_open` / `table_sit` rpcs as the
buttons -- no money path of its own.

**A region.** An optional, fixed-list region on the sign-on screen (USA, Canada, UK & Ireland, Europe, Latin
America, Australia & NZ, Elsewhere), stored as `profiles.region` and remembered on the device. `claim_name`
takes it as an optional third argument (`p_region`); the old one- and two-argument calls still work, and a
call without a region never blanks one already set. The "Change name" pill in the bottom bar is now a small
menu: rename, or pick (or clear) your region. It shows as a small muted tag beside names in the Online list
and in the name menu's header, carried in presence like the status message. Cosmetic: the tag is whatever the
person's own browser says, the server-side copy is what the welcome uses.

**Tested**
- Database, locally (rolled back): 52 checks, 0 failed -- the three ways of calling `claim_name`, the region
  kept across a rename and only taking the fixed list, a person setting their own region and not anyone
  else's, the welcome firing once (not on a reload, a rename, a banned account, an existing character), the
  sweep, waves (throttles, wave back, blocks both ways, mutes, bans, the 20-a-day limit and its reset, the
  sweep, who can read what, browsers unable to write), grants, security definer + pinned search_path, RLS,
  the publication. The Hold'em tables (47) and UNO tables (62) dry runs still pass on top.
- Client: the whole app in jsdom against a stub Supabase, calling the real functions: 31 checks, 0 failed
  (region tags, the Wave item, the wave lines and the spent Wave back button, blocked senders, the newcomer
  lines with same-region-first ordering, the own-name menu and the region write, the Quick seat pick order,
  the clamped buy-ins through the real rpc names, the can't-cover message, the sign-on select). The page loads
  with no errors.

**Not tested yet:** production (the dry run should be run there in a rolled-back transaction first, as
usual), real realtime with two browsers, and how the region select and the tag look on a real phone.

**Release plan note:** `welcomes` and `waves` join the release reset list.

## Build 176 — joined/left lines, one notification not two, and clicks that land somewhere (19 Sept 2026)

Current state: **app.js 176, style.css 122, cache `gc2000-v207`.** No database change. Built on branch
`build-c` (on top of 175) for the lead to merge; not deployed. The service worker's shell list now names
`style.css?v=122` and `app.js?v=176` (it had drifted to 121 / 173 over the last few builds; the fetch
handler caches whatever is asked for, so it never mattered, but it was wrong).

Three small things from the "still open" lists of builds 162 and 164.

**"Alice joined the group" / "Bob left the group."** Since 162's back-test: "Nobody else in a group is
told when someone leaves or is added." The group's own log now says so, from the membership feed
(`conversation_members` on the room channel, the same events 160 made arrive). A member's row is never
deleted -- `gc_leave_group` sets `left_at`, and `gc_add_to_group` brings a leaver back by clearing it --
so every change is an INSERT or an UPDATE and the payload always carries `user_id`, `member_name` and
`left_at`. No `REPLICA IDENTITY FULL`, no migration. The name is the one the person goes by now
(presence, then the profile name `loadMyGroups` reads), falling back to the name on the row. A read
marker moving (most UPDATEs) still draws nothing; being added yourself still gets "You were added to a
group". The adder's own tab says "Carol joined the group" the moment `gc_add_to_group` returns (in place
of the old "Someone new is in the group."), and `groupMemberLine` remembers what it drew for 20 seconds so
the INSERT that follows does not say it twice. Should a hand-made DELETE ever happen, the key alone is
enough (the primary key is `(conversation_id, user_id)`). Nothing is drawn from a reload of the member
list, so the initial load and `catchUp()` never repeat a line.

**One desktop notification, not two.** Build 164 guessed it: "with Gypsy Chat open in a background tab
and the bell on, a whisper probably shows two desktop notifications (the page's and the push's)." It
does. `notifyDesktop()` fires the instant the realtime row lands whenever the tab is hidden or unfocused;
`sw.js` drops a push only while a Gypsy Chat window has *focus*, and a background tab has none; and
Chrome never lets a page notification and a service-worker notification replace each other, even with
the same tag. So every whisper and mention showed twice, a second or two apart, on any desktop with the
tab open somewhere behind. Design chosen: **the push is the one that shows** (it has renotify, it works
with the tab closed, and it is what a phone shows anyway). When this device holds a push subscription
(`pushSubscribed`, set by `subscribeToPush` once `gc_save_push_subscription` succeeds, cleared by
`unsubscribeFromPush`) and the event is one the sender also pushes -- whisper, buzz, mention, group
mention, friend request, game challenge, table invite -- the page waits six seconds and then asks the
service worker registration for a notification with the same tag (`getNotifications({tag})`). Found:
done. Not found -- a dead registration like build 163 #5, the push service slow, the sender's function
call failed -- the page shows its own, six seconds late rather than never. Anything nobody pushes (a
wave) and any device without a subscription shows at once as before. For the tag match to hold the
friend-request tag on the page is now `gc-friendreq-<sender id>`, which is what the push carries (it was
the request row's id). Phones are not touched: Android never showed page notifications (`new
Notification` throws there) and the Capacitor shell has no push path of its own.

Trade-off worth knowing: the fallback is six seconds late, and if someone dismisses the push within those
six seconds the page shows a second one. Both seemed better than the old certain double. Not tested with
real push on a real desktop -- it should be, with the tab in the background: exactly one notification
per whisper.

**Notification clicks go somewhere.** Build 164 also: "A notification click only brings the tab forward;
it does not open the whisper or thread." The tag is all a push carries that says what it was about
(`send-push` sends title, body, tag and a bare url), so the tag is the address, `routeNotification(tag)`:
`gc-whisper-<sender>` and `gc-buzz-<sender>` open that whisper; `gc-group-<id>` that group; `gc-game-`,
`gc-uno-`, `gc-hm-`, `gc-hd-`, `gc-pr-`, `gc-bs-<game id>` the whisper with the other player, scrolled to
that card (a game not in its store yet is fetched by id; the card is looked for a few times over three
seconds because the game loads after sign-on are not awaited); `gc-table-<id>` the Game Room;
`gc-friendreq-*` the friend requests; `gc-mention` the main room at the newest line that names you
(the Game Room, board, roulette, leaderboard or admin page closed in front of it; on a phone the
conversation dock collapsed too); `gc-board-<board>` that board; anything else the room. Two ways a
click gets there. With the app open anywhere, `sw.js`'s `notificationclick` focuses that window and
posts `{type:'NOTIFICATION_CLICK', tag}` to it, and the page routes it (or keeps it in
`pendingNotifTag` if sign-on has not finished). With nothing open it opens `./#n=<tag>`; app.js reads the
hash at load, takes it off the address bar, and routes it at the end of `join()` once the history is in
-- the hash rather than a query string so the request is the same `./` the shell cache holds. The page's
own notifications take the same route when they have no click handler of their own.

**Tested** (`scratchpad/bc/bc_test.js`, the real app in jsdom with a stub Supabase, 43 checks, 0 failed):
the initial member list drawing nothing; INSERT -> joined; the same event twice; a read marker; leaving;
a second leave update; coming back under the name presence knows; a key-only DELETE; reloads drawing
nothing; my own add; a group I am not in; the adder's own line and the INSERT after it dropped. Then no
subscription -> at once; subscribed and the push showed -> never; subscribed and no push -> after the
grace; focus regained during the grace -> nothing; a wave at once; a focused tab never. Then each tag's
route, an unloaded game fetched by id, unknown games and people routing nowhere, the tag kept before
sign-on and routed after, the service worker's message, a page notification's click, the hash read and
removed at load, and `sw.js` itself (focus + message with a window open, `./#n=<tag>` with none, the
plain page for the `gc-push` fallback tag). The 175 first-hour test (31) still passes on this tree, and
the page loads with no errors.

**Not tested:** anything live -- a real push on a real desktop, and a click on a real phone notification
with the app closed (the `#n=` hash through an installed PWA's start URL is the part to watch).

## Build 177 — the release cutover, built ahead of time (19 Sept 2026)

Current state: **app.js 177, style.css 122, appconfig.js v3, cache `gc2000-v208`.** Database (to apply before
release, in this order): `supabase/first_hour_feature.sql` (build 175), `supabase/ip_bans_feature.sql` (this build);
`supabase/release_reset.sql` is run on release day only. Edge function `verify-join` updated in the repo, to be
deployed from the dashboard. Builds 174–177 went up together.

The user asked for the work to be split up: Build A (this, the cutover) by the lead, Build B (175, the first-hour
package) and Build C (176, the small fixes) by helpers one after the other on the same file, and the suites run
by a tester. Decisions still marked open on 18 Sept were taken as recommended, since the user said to do what was
laid out: content is wiped at the reset (room history, whispers, groups, the board, Ballot Box notes — reactions
count toward XP, so keeping old messages would keep old levels); admins and bans are kept; mutes, strikes and
cooldowns are cleared; user and bug reports and suggestions are archived and cleared.

**The switch.** `appconfig.js` gains `INVITE_KEY_REQUIRED` (true today). False = the sign-on screen drops the key
field and its note, `join()` skips the key check and sends no key to `claim_name`; resumed sessions and email
sign-ins never asked for one, so nobody already in is affected. Turnstile stays. Flipping it means editing one
line, bumping `appconfig.js?v=` in index.html and sw.js (and the sw cache name), and uploading those three.

**Per-device settings clear once.** `RELEASE_EPOCH` (0 today). The release build sets it to 1; the first load on
each device removes every `gc_*` localStorage key (sound volume and mutes, first-run tips, dock layout, the stored
invite key, the remembered region) and stamps `gc_epoch`. The Supabase session is not a `gc_` key, so nobody is
signed out.

**The reset script** (`release_reset.sql`, one transaction, one DO block): copies every public table into a
`beta_archive` schema the app cannot see (plus `kept_logins` / `deleted_logins`), then one `truncate` of every
table except `profiles`, `admins`, `bans`, `access_keys` — a single statement without CASCADE, so a kept table
referencing a wiped one would refuse loudly rather than be emptied quietly; resets the kept profiles to login +
name + region (status, picture, bio, whisper setting and the welcome stamp cleared, so release day welcomes
everyone through build 175's line); deletes every nameless login; stamps `profiles.beta_tester` on the keepers;
hands each a fresh `user_stats` row with the 100 XP purse (the purse trigger only fires on a new profile). With
`set local gc.dryrun = '1'` it ends by raising, so `begin; set local gc.dryrun = '1'; <file> rollback;` is a
practice run whose error text is the report: every table's count before and after, the archive size, the
logins deleted and kept. Practice-run locally (29 tables archived; the purse handed to the keepers; everything
else 0). Storage buckets are emptied from the dashboard by hand — deleting `storage.objects` rows would orphan
the files.

**Bans follow the network** (`ip_bans_feature.sql` + `verify-join`). The IP-locked keys were what made bans
stick; without keys a banned person is one reload from a new character. `bans.ip_hash` is stamped by a trigger
from the account's latest `join_ip_log` row (backfilled for today's bans, kept through the reset because `bans`
is kept), and `verify-join` bans any fresh sign-on whose hash matches an active ban ("same network as <name>",
same expiry) and answers `reason: banned`; the client says "This network is banned from Gypsy Chat." and stops.
Also fixed on the way: the function's refusals are 403s, which supabase-js returns as an error with the Response
in `error.context` — the client never read the body, so `turnstile_failed` could not actually be seen. It reads
it now. Cost of the design: a shared NAT can catch a bystander; `/unban` lifts it like any ban.

**Release checklist** (the user's part marked ⚑):

1. ⚑ Email provider: Supabase Auth → SMTP settings → a real provider (Resend or Postmark: verified sending
   domain, API key as the SMTP password). Supabase's built-in mail is 2 an hour to team addresses only. Needed
   for password resets on "Save with email" accounts. Turn on "Confirm email" only if wanted (today it is off,
   which is why Save with email attaches at once).
2. ⚑ Supabase Auth → Attack protection → enable captcha (Turnstile, the same site key) for anonymous sign-ins,
   since no key will stop bots creating accounts. The client already renders Turnstile; the token must then also
   be passed to `signInAnonymously({ options: { captchaToken } })` — a one-line change to make when this is
   switched on (not done yet, so the sign-on keeps working today).
3. Apply `first_hour_feature.sql` and `ip_bans_feature.sql` (practice runs first), deploy `verify-join` from the
   dashboard Code tab, then upload builds 174–177 (done together).
4. ⚑ Ask testers to 🔑 Save with email before release day if they switch devices (no key = no early name reclaim).
5. Release day: warn the room → close it briefly → `release_reset.sql` practice run, read the report, real run →
   empty the five buckets from the dashboard → flip `INVITE_KEY_REQUIRED` to false and `RELEASE_EPOCH` to 1,
   bump `appconfig.js?v=4` in index.html and sw.js, new cache name, upload → sign on as a new anonymous character
   and as an email account, check the welcome line, a wave, Quick seat, the purse → reopen.
6. A month later: `drop schema beta_archive cascade;`

**Tested:** the reset script practice-run locally; the ban stamp trigger locally; app.js parses and the
build-175/176 client suites still pass (the tester's run). Not tested live: `verify-join` with a banned hash
(needs the function deployed), the switch off (needs a deploy with it off — the sign-on path it takes is the
existing resume/email path minus one check).

## Build 178 — a light pen test, and the doors it found (19 Sept 2026)

Current state: **app.js 178, style.css 122, cache `gc2000-v209`.** Database: `supabase/hardening_2026_09_19.sql`
(+ `hardening_2026_09_19_dryrun.sql`, 26 checks). Edge functions `send-push` (now in the repo) and
`send-board-push` rewritten, to be deployed from the dashboard.

The user asked for "a light pen test" and to "tighten up any back doors", with real-money payments in mind.
Scope: everything a signed-in browser can reach. Method: the effective grants, RLS and storage policies,
realtime publication and function privileges were read from the live catalogs; then a rolled-back session
as `authenticated` (a real uid in `request.jwt.claims`) tried the writes and reads a hostile browser would
try; then the edge functions and the client's HTML sinks and broadcast handlers were read.

**What held.** `user_stats` (XP, level, purse) has no write policy and every money helper (`hd_credit`,
`game_award`, the `ht_*`/`ut_*`/`bs_*` internals) refuses browsers — the lockdown of step 0 is in force.
`admins` and `bans` refuse. Other people's whispers, group lines, hole cards, hands, ships, push
subscriptions, read marks, the join IP log and the invite keys are invisible. Storage uploads are confined
to the caller's own folder; the private buckets are admin-only. Names on messages, threads and replies are
checked against `profiles`, so chat impersonation fails. Every HTML sink checked passes user text through
`esc()`; the autolinker only makes `http(s)` links from already-escaped text. `appconfig.js` holds only the
anon key and the VAPID public key.

**What did not hold — fixed:**

1. *profiles* (High): "update own profile" covered every column. A browser could rename itself past
   `claim_name`'s 2–16 rule, clear `welcomed_at` and call `welcome_newcomer` again for a "just walked in"
   line on demand, change `access_key_id`, set `avatar_url` to any host (every viewer's IP handed to it),
   and after the reset flip `beta_tester`. Now column-level UPDATE on avatar_url, bio, status_message,
   whisper_policy, region, updated_at only; no browser INSERT (the two client upserts became updates); a
   CHECK that the name matches the rule and the avatar lives in this project's bucket.
2. *Reaction XP* (High, and the real money risk): 15 reactions per 10 s, one XP per distinct emoji, free
   anonymous accounts — two browsers could mint ~5,000 XP an hour. Now a reaction counts for XP only while
   the author is under 60 awarded today and this reactor has given them fewer than 10 today; the reaction
   itself always shows. `reactions.awarded` records which counted, so removing one only takes back XP it
   gave (churn nets zero; the ledger `reaction_awards` is invisible to browsers).
3. *Push notifications* (High): `send-push` sent any title and text to any account for any caller, and
   `send-board-push` to every follower of any board — an untraceable spam/phishing channel wearing the
   app's badge. Now `push_gate()` decides (standing between the two: whispers allowed, a live game or table,
   a pending friend request, a shared group; no block; not banned/muted; 60 an hour, none to the same
   person within 3 s) and `board_push_gate()` only for a thread the caller posted on that board in the last
   five minutes, once. Titles are prefixed with the sender's real name; links in bodies become "[link]".
4. *The 'kick' broadcast* (Medium): any browser could broadcast a kick for any user id — the target's
   client threw itself out and everyone saw "X was removed by Admin". Now the target checks its own ban
   row before leaving (kick() writes the ban first), and only admins print the line, after checking the
   bans table. Regular viewers see the ordinary leave line instead.
5. *friend_requests* (Low): the sender could mark their own request accepted. Recipient only now, and
   only status/responded_at.
6. *conversation_members* (Low): an UPDATE policy let a member clear their own `left_at` and walk back
   into a group they left. Dropped (read marks use `gc_mark_group_read`).
7. *Storage volume* (Low): per-person ceilings — avatars 20/h, thread images 40/h, voice notes 60/h, bug
   reports 20/day, suggestions 30/day — via `my_uploads_since()`.
8. Trigger functions executable by anon (cosmetic): revoked.

**Left as is, on purpose, and worth knowing before money:** presence names are client-supplied (a browser
could show a fake name in the Online list; messages still can't be forged); game XP can still be farmed by
one person playing their own second account up to the 500-a-day cap per account — so XP must never be
redeemable for money or prizes, only bought; `verify-access-key` has no brute-force limit (moot at release);
anonymous account creation is unlimited until Supabase's captcha for anonymous sign-ins is switched on.

**Tested:** the dry run 26/26 in a rolled-back run on the live database (the rate limiters are muted inside
the test only); app.js parses; the earlier client suites still pass. Not testable here: the push gate end
to end (needs the functions deployed) — the SQL side is exercised by hand in the dry run's spirit once
applied.
