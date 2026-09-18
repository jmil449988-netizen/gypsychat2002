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

**If a tester says notifications never come:** first make sure the receiving device does not have
Gypsy Chat open in front. Then check the function's Logs tab for their device count; 0 means the bell
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
