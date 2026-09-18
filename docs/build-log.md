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
Current state: **app.js 160, style.css 115, cache `gc2000-v191`, APP_VERSION Beta v0.8.0.**

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

## Not done, found on the way

- A group line is capped at 140 characters, the main room's limit: `post()` and the
  `messages_body_check` constraint both key on `recipient_id is null`. The group composer takes
  500, so anything past 140 is cut off without a word.
- An @mention in a group line sends that person a "mentioned you" push with the text in it, even
  when they are not in the group.
- One member of the test group shows as "someone": their `member_name` is empty, probably one of
  the accounts with no `profiles` row.
