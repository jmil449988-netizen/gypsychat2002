/* Gypsy Chat 2000 — app
Backend: Supabase (anonymous auth + Postgres + Realtime).
Same file runs as a website, an installed PWA, or inside a Capacitor shell. */
(function () {
'use strict';
var C = window.GC_CONFIG || {};
var $ = function (id) { return document.getElementById(id); };
var log = $('log'), msg = $('msg'), st = $('st'), ulist = $('ulist'), flist = $('flist'), picker = $('picker');
var gifBtn = $('gifBtn'), gifPicker = $('gifPicker'), gifQ = $('gifQ'), gifGo = $('gifGo'), gifResults = $('gifResults');
var tray = $('imTray');
var gcRoot = document.querySelector('.gc-root');
var threadsPanel = $('threadsPanel'), tpList = $('tpList'), tpDetail = $('tpDetail'), tpItems = $('tpItems'), tpPages = $('tpPages');
var tpNewBtn = $('tpNewBtn'), tpNewPost = $('tpNewPost'), tpNewBody = $('tpNewBody'), tpNewCancel = $('tpNewCancel'), tpNewSubmit = $('tpNewSubmit');
var tpBoards = $('tpBoards'), tpTags = $('tpTags'), tpSub = $('tpSub'), tpBoardName = $('tpBoardName'), tpNewBoard = $('tpNewBoard'), tpNewTag = $('tpNewTag');
var tpBack = $('tpBack'), tpPosts = $('tpPosts'), tpReplyBody = $('tpReplyBody'), tpReplySend = $('tpReplySend');
var threadToggleBtn = $('threadToggleBtn'), dmToggleBtn = $('dmToggleBtn');
var tpNewImgBtn = $('tpNewImgBtn'), tpNewImgFile = $('tpNewImgFile'), tpNewGifBtn = $('tpNewGifBtn');
var tpNewPreviewWrap = $('tpNewPreviewWrap'), tpNewPreviewImg = $('tpNewPreviewImg'), tpNewImgRemove = $('tpNewImgRemove');
var tpReplyImgBtn = $('tpReplyImgBtn'), tpReplyImgFile = $('tpReplyImgFile'), tpReplyGifBtn = $('tpReplyGifBtn');
var tpReplyPreviewWrap = $('tpReplyPreviewWrap'), tpReplyPreviewImg = $('tpReplyPreviewImg'), tpReplyImgRemove = $('tpReplyImgRemove');
var adminToggle = $('adminToggle'), adminFields = $('adminFields'), adminEmail = $('adminEmail'), adminPassword = $('adminPassword');
var reportsBtn = $('reportsBtn'), reportsBadge = $('reportsBadge'), reportsList = $('reportsList');
var adminPanel = $('adminPanel'), adminBack = $('adminBack'), admTabUsers = $('admTabUsers'), admTabBugs = $('admTabBugs'), admUsers = $('admUsers'), admBugs = $('admBugs'), admUsersCount = $('admUsersCount'), admBugsCount = $('admBugsCount');
var admTabIdeas = $('admTabIdeas'), admIdeas = $('admIdeas'), admIdeasCount = $('admIdeasCount'), ideasList = $('ideasList'); // v172: the Suggestions tab
var bugBtn = $('bugBtn'), bugFile = $('bugFile'), bugReportOverlay = $('bugReportOverlay'), bugDesc = $('bugDesc'),
    bugAttachBtn = $('bugAttachBtn'), bugAttachList = $('bugAttachList'), bugReportCancel = $('bugReportCancel'), bugReportSubmit = $('bugReportSubmit');
var bugReportsList = $('bugReportsList');
var leaderboardBtn = $('leaderboardBtn'), leaderboardPanel = $('leaderboardPanel'), leaderboardList = $('leaderboardList'), leaderboardBack = $('leaderboardBack');
var tttLeaderboardList = $('tttLeaderboardList'), lbTabXp = $('lbTabXp'), lbTabTtt = $('lbTabTtt');
var unoLeaderboardList = $('unoLeaderboardList'), lbTabUno = $('lbTabUno');
var hmLeaderboardList = $('hmLeaderboardList'), lbTabHm = $('lbTabHm'), hdLeaderboardList = $('hdLeaderboardList'), lbTabHd = $('lbTabHd');
var prLeaderboardList = $('prLeaderboardList'), lbTabPr = $('lbTabPr');
var bsLeaderboardList = $('bsLeaderboardList'), lbTabBs = $('lbTabBs');
var gateFields = $('gateFields'), accessCode = $('accessCode');
var updateBanner = $('updateBanner'), updateBannerBtn = $('updateBannerBtn');
var frqSection = $('frqSection'), frqCount = $('frqCount'), friendReqList = $('friendReqList');

var EMOJI = ['😊','😂','😎','😉','😢','😡','😱','😴','🤔','😍','🙃','😜','🤣','😭','🥺','😏','👍','👎','👋','🙏','💯','🔥','✨','🎉','❤️','💔','💀','👀','🤷','🤯','⚔️','🛡️','🧙','🐉','🏹','💎','🕯️','🌙','🙌','😤'];

/* A name used to be \w only (ASCII letters/digits/underscore), which silently rejected every
   non-Latin script -- Greek, Cyrillic, Japanese, Chinese, etc. \p{L} matches a "letter" in any
   Unicode script, so this opens the door to all of them at once instead of enumerating scripts
   one at a time; \p{N} covers native digits (e.g. Devanagari) and \p{M} the combining marks
   several of those scripts need (diacritics, Japanese dakuten). The server's copy of this same
   rule lives in claim_name() -- see supabase/international_names_feature.sql. */
var NAME_RE = /^[\p{L}\p{N}\p{M}_ .'-]{2,16}$/u;

/* The public-facing version shown to players (login footer + room/threads/roulette watermarks) --
   deliberately separate from the ?v=NN cache-busting numbers on app.js/style.css in index.html/
   sw.js, which bump on every small deploy and would be a meaningless, constantly-churning number
   to show someone in the room. Bump this by hand only for a release worth calling out. Single
   source of truth: every spot below reads this rather than having the string baked in repeatedly.
   Version history (the ones worth calling out):
     0.6.x -- invite-key beta, threads, whispers-in-windows, friends, push.
     0.7.0 -- the September overhaul: phones fit the screen, the Messages dock, the Ballot Box
              (with @tags), the caravan wheel, the mobile scroll.
     0.8.0 -- the arcade and the sound pack. Five games now play inside a whisper window --
              Tic-Tac-Toe, UNO, Hangman, Texas Hold'em and Prasta -- each one server-authoritative,
              staked in XP, on a turn clock, with its own ladder tab on the Popularity Contest
              (which is what the Leaderboard is called now). Every synthesised beep was replaced
              with a recorded one: 43 files, loudness-matched, with a volume slider in the menu.
              The UX pass added day dividers, room peek, the reconnect bar, the command palette,
              the new-message pill and the first-run tour. Accounts got a log out button and a
              remember-me box. Admin names carry flames everywhere they appear -- lists, menus,
              main chat, threads. Early access is aimed at October 31st; that's the release that
              should turn this into a 1.0. */
var APP_VERSION = 'Beta v0.8.0';
var WATERMARK_TEXT = 'Yogg Squad © 2027 · ' + APP_VERSION;
if ($('madeBy')) $('madeBy').textContent = 'created by Yogg Squad © 2027 · ' + APP_VERSION;
if ($('roomWatermark')) $('roomWatermark').textContent = WATERMARK_TEXT;
if ($('threadsWatermark')) $('threadsWatermark').textContent = WATERMARK_TEXT;
if ($('rouletteWatermark')) $('rouletteWatermark').textContent = WATERMARK_TEXT;
/* BUILD_NUMBER is a different thing from APP_VERSION above on purpose: APP_VERSION is a curated
   label bumped by hand for a release worth naming, while BUILD_NUMBER mirrors the ?v=NN
   cache-busting number on app.js/index.html/sw.js and moves on every deploy, however small. That
   makes it the one honest answer to "which code is this browser actually running right now" --
   exactly the question that turned a real, already-shipped fix into a confusing "still broken"
   report earlier, purely because a phone was still running yesterday's cached build. Shown in two
   low-key spots (the sign-on screen and the "more" popover) rather than announced anywhere, so
   it's there to check the moment it's needed without normally being visible enough to matter. */
var BUILD_NUMBER = 172;
/* v172: pixel-art icons (public/icons/ui-*.png, drawn at 4x their pixel grid so a browser only ever scales them
   down): a thread spool for Threads, a poker table for the Game Room (its page header and toasts too), a red
   Romani wagon wheel -- sixteen spokes, as on the flag -- for Roulette, which turns slowly, an envelope for
   Messages and a light bulb for the suggestion box. index.html carries the same markup for the first paint;
   these are for when the code redraws a button. Sizes and glows: .fab-ico / .px-ico in style.css. */
var ICON_TABLE = '<img class="fab-ico ico-table" src="./icons/ui-table.png" alt="" width="35" height="24" draggable="false">';
var ICON_SPOOL = '<img class="fab-ico ico-spool" src="./icons/ui-spool.png" alt="" width="30" height="30" draggable="false">';
var ICON_WHEEL = '<img class="fab-ico ico-wheel" src="./icons/ui-wheel.png" alt="" width="30" height="30" draggable="false">';
var ICON_ENVELOPE = '<img class="px-ico ico-env" src="./icons/ui-envelope.png" alt="" width="20" height="22" draggable="false">';
if (isIOSDevice()) document.documentElement.classList.add('ios'); // see the iOS top-tap rules in style.css
if ($('buildTag')) $('buildTag').textContent = 'build ' + BUILD_NUMBER;
if ($('popoverVersion')) $('popoverVersion').textContent = APP_VERSION + ' · build ' + BUILD_NUMBER;
if ($('leaderboardWatermark')) $('leaderboardWatermark').textContent = WATERMARK_TEXT;

var sb = null, me = null, channel = null;
var people = {}; // user id -> presence object {name, status, awayMsg} (from presence)
/* Mobile browsers throw a phone's realtime connection around constantly -- backgrounding the tab,
   the OS freezing background network activity, a flaky signal dropping and reconnecting -- and any
   of those makes `people` (this client's live view of who's in the room right now) instantly forget
   someone who never actually left. That's a minor cosmetic flicker for the room list, but it's fatal
   for @mention push: someone who steps away from their phone for a minute becomes un-@-mentionable
   and never gets notified, which defeats the entire point of Web Push. recentPeople keeps a
   short-lived memory of the last known presence data for anyone seen this session, so a mention
   still resolves to a real user id for a grace window after they drop out of live `people`. */
/* Kept in localStorage (same pattern as dmRead/dmDismissed above) for a specific reason: joining
   is a fresh page load with a brand-new, empty `people`/`recentPeople` in memory, but restoreIdentity()
   already treats a refresh as resuming the SAME sitting, not starting a new one -- so from the
   person's point of view, someone they were just able to whisper a second before they hit refresh
   should still be whisperable a second after. Without persistence, reloading wipes this cache
   back to empty, and since the person who minimized their window a moment ago is (correctly, by
   design) no longer in live `people` either, nothing would ever re-add them -- the whisper option
   would vanish for the rest of what should have been their 30-minute grace window, purely because
   YOU happened to refresh, not because THEY actually dropped out of it. Reviving the saved cache
   at load time (further down) closes that gap; recentPeopleEntries()'s own lastSeen sweep still
   throws out anything that's actually past its 30 minutes, so a stale save from days ago is harmless. */
var recentPeople = {}; // user id -> { ...presence data, lastSeen }
try { recentPeople = JSON.parse(localStorage.getItem('gc_recent_people') || '{}') || {}; } catch (e) { recentPeople = {}; }
function saveRecentPeople() { try { localStorage.setItem('gc_recent_people', JSON.stringify(recentPeople)); } catch (e) {} }
var RECENT_GRACE_MS = 30 * 60 * 1000; // matches IDLE_DISCONNECT_MS below -- if a quiet connection isn't kicked from the room until 30 minutes of inactivity, there's no reason to treat someone as "gone" for whisper/mention purposes any sooner than that
function touchRecentPeople() {
  var now = Date.now();
  Object.keys(people).forEach(function (id) {
    var p = people[id]; if (!p) return;
    recentPeople[id] = { name: p.name, status: p.status, awayMsg: p.awayMsg, lastSeen: now };
  });
  saveRecentPeople();
}
/* Lazily sweeps out anything past its grace window before handing back the pool -- called right
   before it's read rather than on a timer, so it's always accurate at the moment it matters. */
function recentPeopleEntries() {
  var now = Date.now();
  var changed = false;
  Object.keys(recentPeople).forEach(function (id) { if (now - recentPeople[id].lastSeen > RECENT_GRACE_MS) { delete recentPeople[id]; changed = true; } });
  if (changed) saveRecentPeople();
  return recentPeople;
}
/* touchRecentPeople() above only ever runs from the presence 'sync' handler below, which fires
   when someone's presence state changes -- a busy room gets plenty of those for free, but a quiet
   one (or two people who are both already sitting idle) can go long stretches with no presence
   churn at all. Left alone, that means a quietly-connected phone's lastSeen can already be several
   minutes stale by the moment it actually disconnects, so the 30-minute RECENT_GRACE_MS window
   ends up counted from that stale stamp instead of from when they really went offline -- someone
   who minimizes their browser can fall out of the "reachable" pool, and lose the Whisper option,
   well short of the full 30 minutes anyone would expect from that cache. This tick re-stamps
   everyone currently in `people` on its own fixed clock, independent of how chatty the room is, so
   lastSeen is never more than ~30 seconds stale at the moment a connection actually drops --
   which is what makes the 30-minute grace window and the 30-minute idle-kick (IDLE_DISCONNECT_MS)
   actually line up the way the comment on RECENT_GRACE_MS always intended. */
var recentPeopleHeartbeatTimer = null;
function startRecentPeopleHeartbeat() {
  stopRecentPeopleHeartbeat();
  recentPeopleHeartbeatTimer = setInterval(touchRecentPeople, 30 * 1000);
}
function stopRecentPeopleHeartbeat() {
  if (recentPeopleHeartbeatTimer) { clearInterval(recentPeopleHeartbeatTimer); recentPeopleHeartbeatTimer = null; }
}
var wins = {}, unread = {}, seen = {};
var typingRoom = {}; // user id -> {name, timer} -- who's currently typing in the main room; see the typing-indicator section below
/* Message metadata cache, keyed by message id -- just enough (sender, raw body, when) for the 🚩
   "report this message" action below to file an exact snapshot without scraping it back out of
   the rendered/escaped HTML. Populated as each message is rendered (room or whisper), never
   pruned -- same lifetime as the seen{} id-dedupe map above, which has the same shape of growth
   and has never needed trimming in practice. */
var msgCache = {};
/* Per-conversation "last read" marks. Sign-on replays your recent whispers through the very
   same renderIM() that handles live ones, so every whisper you had already read came back as a
   fresh red badge (and a fresh ding). These marks are what tell the two apart.
   Kept in this browser too (so it still works the instant you read something, offline or not),
   but now also pushed to the dm_reads table -- see supabase/dm_reads_feature.sql -- which is what
   makes the mark follow you between devices instead of starting over on each one, AND is what
   lets the other person's whisper window show "Seen" under the message you just read. */
var dmRead = {};
try { dmRead = JSON.parse(localStorage.getItem('gc_dm_read') || '{}') || {}; } catch (e) { dmRead = {}; }
function saveDmRead() { try { localStorage.setItem('gc_dm_read', JSON.stringify(dmRead)); } catch (e) {} }
/* Per-conversation "dismissed" marks (peer id -> ms timestamp), same idea and same storage
   pattern as dmRead just above, for a different problem: swiping away, ✕-ing, or Backspacing a
   minimized whisper tab (see dismissTab below) only ever removed it from the in-memory wins{}
   map, with nothing recorded anywhere else. That was invisible when a page refresh meant a full
   logout -- reopening the app was a fresh login you'd expect to rebuild your tray from scratch
   -- but now that restoreIdentity() resumes silently on every refresh (see join({resuming:true})
   below), the exact same history replay runs far more often, and it has always recreated a tab
   for every whisper conversation still in the last C.HISTORY messages with no memory of what
   you'd previously dismissed. These marks are what let renderIM() below tell "a conversation
   you closed and nothing new has happened in since" apart from "a conversation you closed but
   which now has something new" -- the latter still needs to come back, same as any other unread
   whisper waiting in the tray. */
var dmDismissed = {};
try { dmDismissed = JSON.parse(localStorage.getItem('gc_dm_dismissed') || '{}') || {}; } catch (e) { dmDismissed = {}; }
function saveDmDismissed() { try { localStorage.setItem('gc_dm_dismissed', JSON.stringify(dmDismissed)); } catch (e) {} }
function markDmRead(id, when) {
var t = when ? new Date(when).getTime() : Date.now();
if (!(dmRead[id] >= t)) { dmRead[id] = t; saveDmRead(); syncReadReceipt(id, t); }
}
/* Pushes a "read up to" mark to the dm_reads table so the OTHER person's whisper window can show
   a "Seen" mark under the last message they sent you. markDmRead() above only calls this when
   the local mark actually advances, so a burst of messages while the window is open/focused
   upserts once, not once per message. Best-effort and silent: a failed write just means the
   receipt doesn't show up for them yet (it'll catch up next time this fires), nothing else in
   the app depends on it. */
function syncReadReceipt(id, t) {
if (!sb || !me) return;
/* dm_reads is keyed by a peer uuid; a group's read marker lives on my own membership row. */
if (isGroupKey(id)) { sb.rpc('gc_mark_group_read', { p_conversation: groupIdOf(id) }).then(function () {}, function () {}); return; }
sb.from('dm_reads').upsert({ owner_id: me.id, peer_id: id, last_read_at: new Date(t).toISOString() })
.then(function (r) { if (r.error) console.warn('read receipt not saved:', r.error.message); });
}
/* The mirror image of dmRead: how far the OTHER person in each whisper has read what I sent them
   (peer's user id -> ms timestamp). Seeded at sign-on from dm_reads (loadDmReads) and kept live
   by the dm_reads realtime subscription (see handleDmRead). */
var dmSeenBy = {};
/* Shows a single "Seen HH:MM" line under the LAST message I sent in a whisper window, once (and
   only once) the other person has read up to it -- same convention as iMessage/WhatsApp: earlier
   messages of mine don't each get their own mark, since dm_reads is a high-water mark, not a
   per-message flag, and being caught up to the newest implies every older one too. Called after
   any message I send is rendered, and again whenever a fresher dm_reads row for that person comes
   in, so it moves to the new last message or appears/disappears as appropriate. */
function updateSeenMark(id) {
if (isGroupKey(id)) return; // "Seen" means one other person read it; in a group it would be a lie
var w = wins[id]; if (!w) return;
var old = w.log.querySelector('.dm-seen'); if (old) old.remove();
var mineEls = w.log.querySelectorAll('.m.me'); if (!mineEls.length) return;
var last = mineEls[mineEls.length - 1];
var seenAt = dmSeenBy[id], lastAt = +last.dataset.at;
if (seenAt && lastAt && seenAt >= lastAt) {
var mark = document.createElement('div'); mark.className = 'dm-seen'; mark.textContent = 'Seen ' + fmt(seenAt);
last.insertAdjacentElement('afterend', mark);
}
}
/* Bulk-loaded once at sign-on (see loadDmReads below) and topped up live per-row after that by
   the dm_reads realtime subscription registered alongside the messages one. */
function handleDmRead(row) {
if (!row || row.peer_id !== me.id) return; // not a receipt for anything I sent
var t = new Date(row.last_read_at).getTime();
if (!(dmSeenBy[row.owner_id] >= t)) { dmSeenBy[row.owner_id] = t; updateSeenMark(row.owner_id); }
}
/* One query, both directions: rows where I'm the owner are my own read-marks (merged into dmRead
   so unread badges pick up where another device already left off -- never move a mark backwards,
   in case this device has a newer local mark not yet synced), and rows where I'm the peer are
   receipts for messages I sent (seed dmSeenBy so "Seen" can show up immediately on sign-on rather
   than waiting for the next live update). */
async function loadDmReads() {
var r = await sb.from('dm_reads').select('owner_id, peer_id, last_read_at'); if (r.error) return;
r.data.forEach(function (row) {
var t = new Date(row.last_read_at).getTime();
if (row.owner_id === me.id) { if (!(dmRead[row.peer_id] >= t)) dmRead[row.peer_id] = t; }
else if (row.peer_id === me.id) dmSeenBy[row.owner_id] = t;
});
saveDmRead();
}
function alreadyRead(id, created) { return !!dmRead[id] && new Date(created).getTime() <= dmRead[id]; }
/* True only while the sign-on history is being poured into the log, so the arrival reactions
   (ding, flashing tab, raising the window, the away auto-reply) fire for live messages only. */
var replayingHistory = false;
var blocked = {}; // user id -> name (people I've blocked)
var friends = {}; // user id -> {name, group} (my buddy list; persists across sessions, independent of who's here now)
/* ---------- friend requests ----------
   Adding a friend used to write straight into `friends` with no involvement from the other person
   at all. These three maps back the request/accept flow that replaced that: incomingRequests is
   what shows up in the inbox dropdown (someone else asked ME), outgoingPending is requests I've
   sent that nobody has answered yet (so "Add Friend" doesn't get re-sent every time the menu
   reopens), and friendReqChannel is the realtime subscription that keeps both live without a
   reload -- see subscribeFriendRequests. */
var incomingRequests = {}; // request id -> {id, senderId, senderName, createdAt}
var outgoingPending = {}; // recipient id -> request id
var friendReqChannel = null;
var isAdmin = false, bans = {}, mutedUsers = {}; // bans/mutedUsers only loaded for admins
/* Every admin's user id, so their names can be shown in red to everyone. Read from the admins
   table rather than carried in presence on purpose: presence is written by each client, so a
   self-reported "I'm an admin" flag could be faked from the console by anyone who wanted the
   badge -- the same impersonation hole the name claim closed. The table is the authority. */
var adminIds = {};
function isAdminId(id) { return !!adminIds[id]; }

/* Levels: public.user_stats.level is a generated column derived purely from reactions_received
   (see reactions_and_levels_feature.sql), so this cache only ever needs to mirror that one row
   per user -- nothing computed or reconciled on the client. Absence from this map means "never
   reacted to" rather than "level 0" (level is generated as 1 at zero reactions), which is what
   lets levelBadgeHtml skip the badge entirely for someone nobody's ever reacted to instead of
   showing "Lv1" on literally everyone. */
var userStats = {};
var lastSend = 0;

/* ---------- threads board state (a single flat "general" board, 4chan-style — no topics) ---------- */
var threadsCache = {}; // thread id -> thread row {id, op_id, op_name, body, created_at, bumped_at, reply_count}
var threadsOrder = []; // thread ids, kept sorted by bumped_at desc
var openThreadId = null;
var threadsChannel = null;
var threadsPage = 0; // current page (0-based) of the catalog list
var THREADS_PAGE_SIZE = 12;
var reportsChannel = null;
var bugReportsChannel = null;
var threadPostsSeen = {};
var lastThreadSend = 0;
var tpNewImageUrl = null, tpReplyImageUrl = null; // pending image_url for the post currently being composed
var MAX_IMG_BYTES = 5 * 1024 * 1024;
var MAX_BUG_ATTACH_BYTES = 25 * 1024 * 1024; // room for a short screen recording, not just a screenshot
var MAX_BUG_ATTACHMENTS = 5;
var bugAttachments = []; // [{url, type: 'image'|'video', name}] for the report currently being composed
var ALLOWED_IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

/* ---------- my status (Online / Away / Busy, plus auto-Idle) ----------
   manualStatus is what I chose; autoIdle layers "idle" on top of Online after inactivity.
   The effective status (what others see) is computed by effectiveStatus() and pushed to
   presence via updateMyPresence() whenever either input changes. */
var manualStatus = 'online', myAwayMsg = '', autoIdle = false, awayReplied = {};
var myStatusMsg = ''; // free-text line shown beside my status (profiles.status_message, carried in presence)
function effectiveStatus() { return (manualStatus === 'online' && autoIdle) ? 'idle' : manualStatus; }
function updateMyPresence() {
if (!channel || !me) return;
channel.track({ name: me.name, status: effectiveStatus(), awayMsg: manualStatus === 'away' ? myAwayMsg : '', statusMsg: myStatusMsg || '', avatarUrl: me.avatarUrl || '' });
}
function updateStatusBtn() {
var b = $('statusBtn'); if (!b) return;
var eff = effectiveStatus();
var label = eff.charAt(0).toUpperCase() + eff.slice(1);
/* Just the colored dot on the button itself -- .statusbtn[data-status] already colors it
   green/yellow/red per status (see style.css), so the dot alone carries the same information
   the word used to. The word still appears in the dropdown this opens (Online/Away/Busy), and
   lives on here as the title/aria-label so it's not lost for anyone hovering or using a screen
   reader. */
var bi = b.querySelector('.btn-icon'); if (bi) bi.textContent = '●'; else b.textContent = '●';
b.title = 'Status: ' + label + ' — click to change';
b.setAttribute('aria-label', 'Status: ' + label + '. Click to change your status.');
b.setAttribute('data-status', eff);
}
function setMyStatus(status, awayMsg) {
if (manualStatus === 'away' && status !== 'away') awayReplied = {}; // fresh away-reply window next time I go away
manualStatus = status; myAwayMsg = awayMsg || ''; autoIdle = false;
updateMyPresence(); updateStatusBtn(); resetIdle();
}
async function setMyStatusMsg(text) {
myStatusMsg = (text || '').slice(0, 80);
updateMyPresence(); updateWinBanners();
var r = await sb.from('profiles').update({ status_message: myStatusMsg || null, updated_at: new Date().toISOString() }).eq('user_id', me.id);
if (r.error) addSys('Could not save your status message: ' + r.error.message);
else addSys(myStatusMsg ? 'Status message set: “' + myStatusMsg + '”' : 'Status message cleared.');
}
var IDLE_MS = 3 * 60 * 1000; // auto-idle after 3 minutes of no activity, AIM-style
/* Auto-disconnect after 30 minutes of no activity at all -- a harder timeout than the 3-minute
   idle marker above, and a different kind of thing: autoIdle only changes what your presence
   *shows* (still fully connected, still holding your name and your spot in the room), while this
   actually leaves the room the same way an admin kick does (see idleDisconnect() and leaveRoom()
   near kicked() below), freeing the name and the realtime seat for someone else once a device has
   plainly been left open and unattended. Deliberately independent of manualStatus/autoIdle: going
   AWAY on purpose doesn't reset real inactivity, so someone who sets themselves Away and then
   genuinely walks off still times out on the same clock as anyone else. */
var IDLE_DISCONNECT_MS = 30 * 60 * 1000;
var idleTimer = null, idleDisconnectTimer = null;
function resetIdle() {
if (!me) return;
if (autoIdle) { autoIdle = false; updateMyPresence(); updateStatusBtn(); }
clearTimeout(idleTimer);
clearTimeout(idleDisconnectTimer);
idleTimer = setTimeout(function () {
if (manualStatus === 'online') { autoIdle = true; updateMyPresence(); updateStatusBtn(); }
}, IDLE_MS);
idleDisconnectTimer = setTimeout(function () { if (me) idleDisconnect(); }, IDLE_DISCONNECT_MS);
}
['mousemove', 'keydown', 'touchstart', 'scroll', 'pointerdown'].forEach(function (evt) { document.addEventListener(evt, resetIdle, { passive: true }); });

/* A small anchored menu for a button that has a few choices behind it (the whisper composer's
   📎 and 🎲 buttons). Same .nmenu look as the status dropdown below. */
var miniMenu = document.createElement('div'); miniMenu.className = 'nmenu'; miniMenu.setAttribute('role', 'menu'); document.body.appendChild(miniMenu);
function closeMiniMenu() { miniMenu.classList.remove('open'); }
function showMiniMenu(anchor, title, items) {
if (miniMenu.classList.contains('open') && miniMenu._anchor === anchor) { closeMiniMenu(); return; }
miniMenu._anchor = anchor;
miniMenu.innerHTML = (title ? '<div class="hd">' + esc(title) + '</div>' : '') + items.map(function (it, i) { return '<button type="button" role="menuitem" data-i="' + i + '">' + it[0] + '</button>'; }).join('');
miniMenu.querySelectorAll('button').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); closeMiniMenu(); items[+b.dataset.i][1](); }; });
miniMenu.classList.add('open');
var r = anchor.getBoundingClientRect();
miniMenu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - miniMenu.offsetWidth - 4)) + 'px';
var top = r.top - miniMenu.offsetHeight - 4;
if (top < 4) top = r.bottom + 4 + miniMenu.offsetHeight <= window.innerHeight ? r.bottom + 4 : 4; // v170: no room above the anchor
miniMenu.style.top = top + 'px';
miniMenu.querySelector('button').focus();
}
document.addEventListener('click', function (e) { if (!miniMenu.contains(e.target)) closeMiniMenu(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMiniMenu(); });
/* v121: a read-only bubble in the same .nmenu shell -- a title and a few lines, no choices. Used
   by the level badge (below) so a tap on a phone gets the same facts a mouse hover already got. */
function showInfoBubble(anchor, title, lines) {
if (miniMenu.classList.contains('open') && miniMenu._anchor === anchor) { closeMiniMenu(); return; }
miniMenu._anchor = anchor;
miniMenu.innerHTML = '<div class="hd">' + esc(title) + '</div>' + lines.filter(Boolean).map(function (l) { return '<div class="note">' + esc(l) + '</div>'; }).join('');
miniMenu.classList.add('open');
var r = anchor.getBoundingClientRect();
miniMenu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - miniMenu.offsetWidth - 4)) + 'px';
var top = r.top - miniMenu.offsetHeight - 4; if (top < 4) top = r.bottom + 4;
miniMenu.style.top = top + 'px';
}
/* The level badge explains itself: level = floor(sqrt(xp / 3)) + 1 (reactions_and_levels /
   tictactoe SQL), so the next level lands at 3 * level^2 XP. Capture phase so the click never
   reaches the name underneath it (which would open the name menu instead). */
function xpOf(s) { return s.xp != null ? s.xp : (s.reactions_received || 0) + (s.game_points || 0); }
function xpToNext(s) { return Math.max(0, 3 * s.level * s.level - xpOf(s)); }
document.addEventListener('click', function (e) {
var b = e.target.closest ? e.target.closest('.lvl[data-lvl-for]') : null; if (!b || b.hidden) return;
var id = b.dataset.lvlFor, s = userStats[id]; if (!s) return;
e.stopPropagation(); e.preventDefault();
var who = me && id === me.id ? 'You' : ((people[id] && people[id].name) || 'They');
showInfoBubble(b, 'Level ' + s.level + ' · ' + xpOf(s) + ' XP', [
(s.reactions_received || 0) + ' XP from reactions on ' + (who === 'You' ? 'your' : 'their') + ' messages',
(s.game_points || 0) + ' XP from winning games',
xpToNext(s) ? xpToNext(s) + ' XP to level ' + (s.level + 1) : 'Level ' + (s.level + 1) + ' is next',
'XP comes from reactions to what you say and from winning games, in whispers and at the Game Room tables (game XP caps at 500 a day; Hold’em and Prasta chips just change hands).'
]);
}, true);
/* The 🎲 menu -- one place to add a game. */
function gameMenuItems(id, name) {
return [
['⚔ Tic-Tac-Toe', function () { challengeGame(id, name); }],
['🃏 UNO', function () { challengeUno(id, name); }],
['🪢 Hangman', function () { challengeHangman(id, name); }],
['♠ Texas Hold’em', function () { setTimeout(function () { holdemStakesMenu(id, name); }, 0); }],
['🂡 Prasta', function () { challengePrasta(id, name); }],
['🚢 Battleship', function () { challengeBattleship(id, name); }]
];
}

/* status dropdown (Online / Away / Busy) anchored off the status-bar pill */
var statusMenu = document.createElement('div'); statusMenu.className = 'nmenu'; statusMenu.setAttribute('role', 'menu'); document.body.appendChild(statusMenu);
function closeStatusMenu() { statusMenu.classList.remove('open'); }
function openStatusMenu(anchor) {
var items = [
['Online', function () { setMyStatus('online', ''); }],
['Away', async function () { var m = await showPromptModal('Away Message', { value: myAwayMsg || '', placeholder: 'optional', hint: 'Shown to anyone who whispers you while you’re away.' }); if (m === null) return; setMyStatus('away', m); }],
['Busy', function () { setMyStatus('busy', ''); }],
[myStatusMsg ? 'Status message: “' + myStatusMsg + '”' : 'Set a status message…', async function () {
var m = await showPromptModal('Status message', { value: myStatusMsg || '', placeholder: 'e.g. back in 5, on my phone', maxLength: 80, hint: 'A short line shown under your name in whispers, next to Online / Away / Busy. Leave it empty to clear it.' });
if (m === null) return; setMyStatusMsg(m.trim());
}]
];
statusMenu.innerHTML = '<div class="hd">Set status</div>' + items.map(function (it, i) { return '<button type="button" role="menuitem" data-i="' + i + '">' + it[0] + '</button>'; }).join('');
statusMenu.querySelectorAll('button').forEach(function (b) { b.onclick = function () { closeStatusMenu(); items[+b.dataset.i][1](); }; });
statusMenu.classList.add('open');
var r = anchor.getBoundingClientRect();
statusMenu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - statusMenu.offsetWidth - 4)) + 'px';
statusMenu.style.top = Math.max(4, r.top - statusMenu.offsetHeight - 4) + 'px';
statusMenu.querySelector('button').focus();
}
if ($('statusBtn')) {
$('statusBtn').onclick = function (e) { e.stopPropagation(); if (statusMenu.classList.contains('open')) closeStatusMenu(); else openStatusMenu($('statusBtn')); };
}
document.addEventListener('click', function (e) { if (!statusMenu.contains(e.target) && e.target !== $('statusBtn')) closeStatusMenu(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeStatusMenu(); });

/* ---------- sounds (Web Audio tones — no audio files to host) ---------- */
var audioCtx = null, soundMuted = false, sfxMuted = false, soundVolume = 0.8, masterGain = null;
try { soundMuted = localStorage.getItem('gc_sound_muted') === '1'; sfxMuted = localStorage.getItem('gc_sfx_muted') === '1'; var sv = parseFloat(localStorage.getItem('gc_sound_vol')); if (!isNaN(sv)) soundVolume = Math.max(0, Math.min(1, sv)); } catch (e) {}
/* v121: every sound goes through one master gain so a single volume slider (the 🔊 menu) scales
   all of it -- dings, game clock, sound-effect commands -- instead of on/off being the only choice. */
function masterOut(ctx) {
if (!masterGain || masterGain.context !== ctx) { masterGain = ctx.createGain(); masterGain.gain.value = soundVolume; masterGain.connect(ctx.destination); } // v131: to the speakers. (Builds 121-130 had this as masterGain.connect(masterOut(ctx)) -- the master feeding itself in a loop and never reaching the output -- which is why every sound was silent on every device.)
return masterGain;
}
function setSoundVolume(v) {
soundVolume = Math.max(0, Math.min(1, v));
if (masterGain) masterGain.gain.value = soundVolume;
try { localStorage.setItem('gc_sound_vol', String(soundVolume)); } catch (e) {}
}
function ensureAudioCtx() { if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} } return audioCtx; }
function tone(freq, dur, delay, type, vol) {
var ctx = ensureAudioCtx(); if (!ctx) return;
var t0 = ctx.currentTime + (delay || 0);
var osc = ctx.createOscillator(), gain = ctx.createGain();
osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, t0);
gain.gain.setValueAtTime(0, t0);
gain.gain.linearRampToValueAtTime(vol || 0.15, t0 + 0.01);
gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
osc.connect(gain); gain.connect(masterOut(ctx));
osc.start(t0); osc.stop(t0 + dur + 0.02);
}
/* v135: the message swoosh -- 'send' when I post, the same sound reversed ('recv') when one
   arrives. Both fire far more often than any other sound, so arrivals are floored at one per
   250 ms; a burst of five messages is one swoosh, not five. */
var lastRecvSound = 0;
function messageSound(incoming) {
if (!incoming) { playSound('send'); return; }
var now = Date.now(); if (now - lastRecvSound < 250) return; lastRecvSound = now;
playSound('recv');
}
var SOUND_KIND_FILE = { signon: 'login', friendon: 'friend-logon', whisper: 'pm', friendreq: 'friend-request', challenge: 'game-invite' };
var SOUND_KIND_SYNTH = { friendon: 'signon', whisper: 'ding', friendreq: 'ding', challenge: 'ding' }; // what each new kind sounds like without its file
function playSound(kind) {
if (soundMuted) return;
var file = SOUND_KIND_FILE[kind] || kind; // ding / buzz / turn have files under their own names
if (SOUND_FILES[file] && playFile(file, function () { playSynth(SOUND_KIND_SYNTH[kind] || kind); })) return;
playSynth(SOUND_KIND_SYNTH[kind] || kind);
}
function playSynth(kind) {
if (kind === 'signon') { tone(660, 0.09, 0, 'triangle'); tone(880, 0.12, 0.09, 'triangle'); }
else if (kind === 'ding') { tone(1050, 0.14, 0, 'sine'); }
else if (kind === 'turn') { tone(880, 0.08, 0, 'triangle', 0.14); tone(1320, 0.16, 0.09, 'triangle', 0.14); } // v121: "your move" -- a rising two-note chime, distinct from the whisper ding
else if (kind === 'buzz') { tone(120, 0.5, 0, 'sawtooth', 0.2); tone(90, 0.5, 0.05, 'sawtooth', 0.2); }
/* v167 Battleship: a splash for a miss, a boom for a hit, a longer rumble with a sinking groan for a
   ship going down. Synth until the user supplies recordings (they would go in SOUND_FILES as usual). */
else if (kind === 'bs-splash') { noiseBurst(0.5, 1100, 0.7, 0.3, 0, 'lowpass'); sweep(900, 220, 0.35, 0, 'sine', 0.05); }
else if (kind === 'bs-boom') { noiseBurst(0.7, 200, 0.7, 0.55, 0, 'lowpass'); sweep(150, 38, 0.55, 0, 'sine', 0.35); }
else if (kind === 'bs-sunk') { noiseBurst(1.1, 160, 0.6, 0.6, 0, 'lowpass'); sweep(140, 30, 0.9, 0, 'sine', 0.35); sweep(520, 110, 1.2, 0.2, 'sawtooth', 0.04); }
}
/* ---------- sound-effect commands (/slap, /fart, /gunshot ... v113) ----------
   Every sound is synthesized here with Web Audio in an 8-bit-ish style -- no files to host,
   nothing to download. A command typed in the main room plays for everyone in it (with a
   "* name slaps whoever" line); typed in a whisper it plays for the two of you. They ride the
   same broadcast channel as buzz and typing, so they never touch the messages table. */
function noiseBurst(dur, freq, q, vol, delay, type) {
var ctx = ensureAudioCtx(); if (!ctx) return;
var t0 = ctx.currentTime + (delay || 0), len = Math.max(1, Math.floor(ctx.sampleRate * dur));
var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
var src = ctx.createBufferSource(); src.buffer = buf;
var f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
var g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
src.connect(f); f.connect(g); g.connect(masterOut(ctx)); src.start(t0); src.stop(t0 + dur + 0.02);
}
function sweep(f1, f2, dur, delay, type, vol, wobble) {
var ctx = ensureAudioCtx(); if (!ctx) return;
var t0 = ctx.currentTime + (delay || 0);
var osc = ctx.createOscillator(), g = ctx.createGain();
osc.type = type || 'sine'; osc.frequency.setValueAtTime(f1, t0); osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
if (wobble) { var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = wobble; lg.gain.value = f1 * 0.08; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur); }
g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || 0.15, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
osc.connect(g); g.connect(masterOut(ctx)); osc.start(t0); osc.stop(t0 + dur + 0.02);
}
/* ---------- v125: recorded sound pack ----------
   Real recordings (the user's) live in /sounds/<name>.mp3 -- trimmed, loudness-matched to about
   -16 LUFS, mono 96 kbps. Each is fetched and decoded once, then played through the same master
   gain as the synth sounds, so the volume slider and both mutes apply. Any name whose file is
   missing or fails to decode falls back to its synth recipe, so nothing ever goes silent -- which
   also means a new recording can be added just by dropping the file in and listing it here. */
var SOUND_FILES = { slap: 1, kiss: 1, laugh: 1, cry: 1, gunshot: 1, clap: 1, boo: 1, airhorn: 1, badum: 1, crickets: 1, knock: 1, howl: 1, sneeze: 1, burp: 1, cheers: 1, spit: 1, fart: 1, drumroll: 1,
'friend-logon': 1, 'login': 1, 'friend-request': 1, 'game-invite': 1, 'pm': 1, ding: 1, buzz: 1, turn: 1, tick: 1, tock: 1,
coin: 1, win: 1, lose: 1, 'hm-right': 1, 'hm-wrong': 1, levelup: 1, intro: 1, logout: 1, signoff: 1, unroll: 1, wheel: 1, card: 1, chips: 1, trapdoor: 1, fortune: 1, send: 1, recv: 1, bell: 1 };
/* v129: table sounds (a card, chips) can fire twice for one move when a multi-statement rpc relays
   an intermediate row -- one per game per sound within 400 ms is plenty */
var gameSfxAt = {};
function gameSfx(gid, name) { var k = gid + ':' + name, now = Date.now(); if (gameSfxAt[k] && now - gameSfxAt[k] < 400) return; gameSfxAt[k] = now; playSound(name); }
var SOUND_GAIN = { 'friend-logon': 1.4, knock: 1.3, badum: 1.2, kiss: 1.2, gunshot: 1.1, laugh: 1.1, login: 1.3, 'game-invite': 1.2, tick: 0.6, tock: 0.5, unroll: 0.6, signoff: 0.8, coin: 0.9, bell: 1.25 }; // the punchy ones sat a few dB under the rest after limiting
var soundBuf = {}, soundFail = {};
function loadSoundFile(name) {
if (soundBuf[name]) return soundBuf[name];
var ctx = ensureAudioCtx(); if (!ctx) return Promise.reject(new Error('no audio'));
soundBuf[name] = fetch('./sounds/' + name + '.mp3').then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
.then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
.catch(function (e) { soundFail[name] = true; delete soundBuf[name]; throw e; });
return soundBuf[name];
}
/* Plays the file if there is one; returns false when the caller should run its synth version
   instead. If the file only turns out to be missing after the fetch, the fallback runs then. */
function playFile(name, fallback) {
if (!SOUND_FILES[name] || soundFail[name]) return false;
var ctx = ensureAudioCtx(); if (!ctx) return false;
loadSoundFile(name).then(function (buf) {
var src = ctx.createBufferSource(); src.buffer = buf;
var g = ctx.createGain(); g.gain.value = SOUND_GAIN[name] || 1;
src.connect(g); g.connect(masterOut(ctx)); src.start();
}).catch(function () { if (fallback) { try { fallback(); } catch (e) {} } });
return true;
}
function preloadSounds() { if (!ensureAudioCtx()) return; Object.keys(SOUND_FILES).forEach(function (n) { if (!soundFail[n]) loadSoundFile(n).catch(function () {}); }); }
var SFX = {
slap:    { line: 'slaps {t}', solo: 'slaps the table', play: function () { noiseBurst(0.09, 1400, 1.2, 0.7); tone(140, 0.12, 0, 'triangle', 0.3); } },
kiss:    { line: 'blows {t} a kiss', solo: 'blows a kiss', play: function () { sweep(700, 1500, 0.16, 0, 'sine', 0.2); noiseBurst(0.03, 3000, 2, 0.4, 0.16); tone(1800, 0.05, 0.16, 'sine', 0.2); } },
laugh:   { line: 'laughs at {t}', solo: 'laughs', play: function () { for (var i = 0; i < 5; i++) sweep(340 - i * 18, 250 - i * 14, 0.11, i * 0.14, 'sawtooth', 0.09); } },
cry:     { line: 'cries on {t}’s shoulder', solo: 'cries', play: function () { sweep(620, 300, 0.55, 0, 'sine', 0.16, 7); sweep(560, 260, 0.6, 0.6, 'sine', 0.14, 7); } },
spit:    { line: 'spits at {t}', solo: 'spits', play: function () { noiseBurst(0.05, 4000, 0.8, 0.5, 0, 'highpass'); sweep(900, 200, 0.12, 0.05, 'square', 0.06); } },
fart:    { line: 'farts in {t}’s direction', solo: 'farts', play: function () { sweep(110, 60, 0.45, 0, 'sawtooth', 0.22, 14); noiseBurst(0.4, 250, 0.7, 0.15, 0, 'lowpass'); } },
gunshot: { line: 'fires a shot past {t}', solo: 'fires a shot into the air', play: function () { noiseBurst(0.22, 900, 0.5, 0.9); noiseBurst(0.5, 200, 0.6, 0.5, 0.02, 'lowpass'); sweep(90, 35, 0.4, 0, 'sine', 0.5); } },
clap:    { line: 'applauds {t}', solo: 'claps', play: function () { for (var i = 0; i < 4; i++) noiseBurst(0.06, 1800 + i * 150, 1.4, 0.45, i * 0.13); } },
boo:     { line: 'boos {t}', solo: 'boos', play: function () { sweep(220, 150, 0.7, 0, 'sawtooth', 0.12, 5); sweep(230, 160, 0.7, 0.05, 'triangle', 0.1, 5); } },
airhorn: { line: 'blasts an airhorn at {t}', solo: 'blasts an airhorn', play: function () { [440, 554, 659].forEach(function (f) { sweep(f * 0.9, f, 0.9, 0, 'sawtooth', 0.09, 6); }); } },
badum:   { line: 'ba-dum-tss at {t}', solo: 'ba-dum-tss', play: function () { sweep(180, 90, 0.16, 0, 'sine', 0.4); sweep(150, 70, 0.16, 0.18, 'sine', 0.4); noiseBurst(0.7, 6000, 0.4, 0.35, 0.38, 'highpass'); } },
crickets:{ line: '… crickets for {t}', solo: '… crickets', play: function () { for (var i = 0; i < 6; i++) tone(4200, 0.035, i * 0.09 + Math.floor(i / 3) * 0.25, 'sine', 0.08); } },
knock:   { line: 'knocks on {t}’s door', solo: 'knocks', play: function () { for (var i = 0; i < 3; i++) { noiseBurst(0.05, 300, 1, 0.5, i * 0.22, 'lowpass'); tone(110, 0.08, i * 0.22, 'triangle', 0.25); } } },
howl:    { line: 'howls at {t}', solo: 'howls at the moon', play: function () { sweep(300, 640, 0.5, 0, 'sine', 0.16, 4); sweep(640, 380, 0.7, 0.5, 'sine', 0.16, 5); } },
sneeze:  { line: 'sneezes on {t}', solo: 'sneezes', play: function () { sweep(500, 800, 0.22, 0, 'triangle', 0.08); noiseBurst(0.18, 2500, 0.6, 0.6, 0.22, 'highpass'); sweep(400, 150, 0.2, 0.24, 'sawtooth', 0.08); } },
burp:    { line: 'burps at {t}', solo: 'burps', play: function () { sweep(160, 70, 0.35, 0, 'sawtooth', 0.18, 22); } },
cheers:  { line: 'raises a glass to {t}', solo: 'raises a glass', play: function () { tone(2200, 0.5, 0, 'sine', 0.12); tone(3300, 0.45, 0.01, 'sine', 0.06); tone(2200, 0.5, 0.25, 'sine', 0.1); } },
drumroll:{ line: 'drumrolls for {t}', solo: 'drumrolls', play: function () { for (var i = 0; i < 16; i++) noiseBurst(0.04, 700, 1.2, 0.3, i * 0.055, 'lowpass'); noiseBurst(0.6, 5000, 0.4, 0.3, 0.9, 'highpass'); } }
};
var SFX_LIST = Object.keys(SFX);
function playSfx(kind) { if (soundMuted || sfxMuted || !SFX[kind]) return; if (playFile(kind, SFX[kind].play)) return; try { SFX[kind].play(); } catch (e) {} }
function sfxLine(name, kind, target) {
var sf = SFX[kind]; return '* ' + name + ' ' + (target ? sf.line.replace('{t}', target) : sf.solo);
}
var lastSfxSent = 0, lastSfxFrom = {};
/* to: null = the main room, a user id = that whisper. targetName: optional "/slap Perry". */
async function sendSfx(kind, to, targetName) {
if (!me || !SFX[kind]) return;
var now = Date.now();
if (now - lastSfxSent < 3000) { if (to) imSys(to, 'One sound every few seconds — give it a moment.'); else addSys('One sound every few seconds — give it a moment.'); return; }
if (moderation.muted || moderation.cooldownUntil > now) { if (to) imSys(to, 'You are muted right now.'); else addSys('You are muted right now.'); return; }
if (to && !(await whisperAllowed(to))) { imSys(to, 'Add ' + (wins[to] ? wins[to].name : 'them') + ' as a friend first.'); return; }
lastSfxSent = now;
var target = to ? (wins[to] ? wins[to].name : '') : (targetName || '');
if (!to && target) { var tid = findId(target); if (!tid) { addSys('No one here is named ' + target + '.'); lastSfxSent = 0; return; } target = people[tid].name; }
channel.send({ type: 'broadcast', event: 'sfx', payload: { kind: kind, from: me.id, name: me.name, to: to || null, target: target } });
playSfx(kind);
if (to) imSys(to, sfxLine(me.name, kind, target)); else addSys(sfxLine(me.name, kind, target));
}
function sfxArrived(d) {
if (!d || !me || d.from === me.id || !SFX[d.kind]) return;
if (blocked[d.from]) return;
if (d.to != null && d.to !== me.id) return;
var now = Date.now(); if (lastSfxFrom[d.from] && now - lastSfxFrom[d.from] < 2000) return; lastSfxFrom[d.from] = now;
playSfx(d.kind);
if (d.to == null) addSys(sfxLine(d.name, d.kind, d.target));
else { var w = wins[d.from] || ensureWin(d.from, d.name); imSys(d.from, sfxLine(d.name, d.kind, d.target)); if (w.minimized) { unread[d.from] = (unread[d.from] || 0) + 1; renderPeople(); updateTab(d.from); } }
}
function updateSoundBtn() {
var b = $('soundBtn'); if (!b) return;
var icon = b.querySelector('.btn-icon');
if (icon) icon.textContent = soundMuted ? '🔇' : '🔊'; else b.textContent = soundMuted ? '🔇' : '🔊';
b.setAttribute('aria-pressed', soundMuted ? 'false' : 'true'); // pressed = sound ON (the phone menu draws an ON/OFF switch from this)
}
/* v121: the 🔊 button opens a small Sound menu -- all sounds on/off, sound-effect commands on/off
   (so /fart can be silenced without losing whisper dings), and a volume slider. Built by hand in
   the miniMenu shell because showMiniMenu only knows buttons. */
function openSoundMenu(anchor) {
if (miniMenu.classList.contains('open') && miniMenu._anchor === anchor) { closeMiniMenu(); return; }
miniMenu._anchor = anchor;
miniMenu.innerHTML = '<div class="hd">Sound</div>'
+ '<button type="button" role="menuitemcheckbox" data-k="all" aria-checked="' + (!soundMuted) + '">' + (soundMuted ? '🔇 All sounds: off' : '🔊 All sounds: on') + '</button>'
+ '<button type="button" role="menuitemcheckbox" data-k="sfx" aria-checked="' + (!sfxMuted) + '">' + (sfxMuted ? '🎺 Sound effects (/slap, /fart…): off' : '🎺 Sound effects (/slap, /fart…): on') + '</button>'
+ '<div class="note vol-row"><label for="volRange">Volume</label><input type="range" id="volRange" min="0" max="100" step="5" value="' + Math.round(soundVolume * 100) + '" aria-label="Volume"><span id="volPct">' + Math.round(soundVolume * 100) + '%</span></div>';
miniMenu.querySelectorAll('button').forEach(function (b) {
b.onclick = function (e) {
e.stopPropagation();
if (b.dataset.k === 'all') { soundMuted = !soundMuted; try { localStorage.setItem('gc_sound_muted', soundMuted ? '1' : '0'); } catch (err) {} updateSoundBtn(); if (!soundMuted) playSound('ding'); }
else { sfxMuted = !sfxMuted; try { localStorage.setItem('gc_sfx_muted', sfxMuted ? '1' : '0'); } catch (err) {} }
var a = miniMenu._anchor; miniMenu._anchor = null; openSoundMenu(a); // repaint in place
};
});
var range = miniMenu.querySelector('#volRange'), pct = miniMenu.querySelector('#volPct');
range.oninput = function () { setSoundVolume(range.value / 100); pct.textContent = range.value + '%'; };
range.onchange = function () { if (!soundMuted) playSound('ding'); };
miniMenu.classList.add('open');
var r = anchor.getBoundingClientRect();
if (!r.width && moreBtn) r = moreBtn.getBoundingClientRect();
miniMenu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - miniMenu.offsetWidth - 4)) + 'px';
var top = r.top - miniMenu.offsetHeight - 4; if (top < 4) top = r.bottom + 4;
miniMenu.style.top = top + 'px';
}
if ($('soundBtn')) {
updateSoundBtn();
$('soundBtn').onclick = function (e) {
e.stopPropagation();
var anchor = $('soundBtn');
closeMoreMenu(); // on a phone this button lives inside the ⋯ popover, which should fold away first
openSoundMenu(anchor);
};
}
/* iOS Safari (and other WebKit browsers) only lets an AudioContext leave its initial "suspended"
   state when resume() runs synchronously inside a real, direct user gesture -- a click/tap event
   handler, nothing async in between. The join-button flow below (search "warm up audio on this
   user gesture") covers a fresh sign-on, but most visits never go through it: restoreIdentity()
   auto-resumes returning devices straight from page load with no user gesture at all, so the
   context it creates is born suspended and stays that way for the rest of the session -- every
   playSound() afterward runs without error but is silently inaudible. Resuming on the very first
   real tap/click anywhere on the page (compose box, a message, anything) catches that case too,
   without needing to know in advance which element the user will touch first.
   Two things that made the original version of this unreliable on iOS, fixed here: (1) it marked
   itself "unlocked" after the very first gesture regardless of whether resume() actually succeeded
   -- if that first tap landed on an element whose own handler never let the gesture reach a
   bubble-phase listener, or resume() simply hadn't taken effect synchronously, audio stayed silent
   for the rest of the session with no retry. Now it keeps trying on every gesture until the context
   is confirmed 'running'. (2) it listened on the bubble phase, so any element's own
   e.stopPropagation() (several exist in this file, e.g. the online-list/menu handlers) could keep
   the gesture from ever reaching this document-level listener at all. Listening on the CAPTURE
   phase instead runs this before any such handler gets a chance to stop it. */
(function () {
function tryUnlockAudio() {
var ctx = ensureAudioCtx();
if (ctx && ctx.state === 'running') {
if (me) preloadSounds(); // v125: the recorded pack decodes once the context is live
document.removeEventListener('pointerdown', tryUnlockAudio, true);
document.removeEventListener('touchend', tryUnlockAudio, true);
document.removeEventListener('click', tryUnlockAudio, true);
}
}
document.addEventListener('pointerdown', tryUnlockAudio, { capture: true, passive: true });
document.addEventListener('touchend', tryUnlockAudio, { capture: true, passive: true });
document.addEventListener('click', tryUnlockAudio, { capture: true, passive: true });
})();

/* ---------- desktop/OS notifications (Notification API) ----------
   Fires for whispers and @mentions when the person isn't actually looking at this tab -- switched
   to another tab/app, or the window just isn't focused even if this tab is the visible one (hence
   checking both document.hidden and document.hasFocus() at the call site below). This is the
   "while the site is open somewhere" tier: it does NOT reach someone once they've closed the tab
   or browser, which would need a real Push subscription and a server to send from -- out of scope
   here. notifEnabled is the user's own on/off choice, remembered like the sound-mute toggle above;
   Notification.permission is the browser's separate, one-way (except via site settings) grant.

   iOS Safari has an extra wrinkle no other mobile browser does: window.Notification does not exist
   at all in a plain Safari tab, on any iOS version, for any site. Apple only turns it on once a page
   has been added to the Home Screen (Share -> Add to Home Screen) and is then launched from that
   icon, running standalone -- that's an OS-level restriction, nothing a site can request or work
   around in JS. This site already ships a manifest.webmanifest with display:"standalone" and icons,
   so it's a valid install target; the two helpers below just detect "iOS, but not installed yet" so
   the button can say what to do instead of a dead-end "not supported". Android Chrome/Firefox/Edge
   and desktop browsers all support Notification directly in a regular tab -- no install needed there. */
function isIOSDevice() {
return /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+ reports as a Mac unless you check touch points
}
function isAndroidDevice() {
return /Android/.test(navigator.userAgent);
}
function isStandaloneDisplay() {
return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
/* v165: Windows has its own on/off switch for each browser's notifications, separate from the
   site permission: Settings -> System -> Notifications -> "Notifications from apps and other
   senders". No website can read it. With the browser switched off there, the permission still
   says "granted" and pushes still arrive, but nothing appears on screen -- which is what kept the
   desktop silent through a morning of push testing on 18 Sept 2026 (docs/build-log.md, build 164).
   So on Windows the bell's tooltip names the switch, and the browser as Windows lists it. */
function isWindowsDevice() {
var d = navigator.userAgentData;
if (d && d.platform) return d.platform === 'Windows';
return /Windows/.test(navigator.userAgent);
}
function windowsBrowserName() {
var d = navigator.userAgentData;
var brands = (d && d.brands ? d.brands : []).map(function (b) { return b.brand; });
if (brands.indexOf('Microsoft Edge') !== -1 || /Edg\//.test(navigator.userAgent)) return 'Microsoft Edge';
if (brands.indexOf('Google Chrome') !== -1) return 'Google Chrome';
if (/Firefox\//.test(navigator.userAgent)) return 'Firefox';
return 'your browser'; // Brave, Opera, Vivaldi...: not sure what Windows calls each, so no guess
}
/* Converts the VAPID public key (a URL-safe base64 string, the form the `web-push` tooling and
   appconfig.js both use) into the raw byte array pushManager.subscribe() actually wants. */
function urlBase64ToUint8Array(base64String) {
var padding = '='.repeat((4 - base64String.length % 4) % 4);
var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
var raw = atob(base64);
var arr = new Uint8Array(raw.length);
for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
return arr;
}
/* Registers this browser installation with the push service (Chrome's, Firefox's, Apple's...) and
   hands the resulting endpoint + keys to Supabase so send-push can find it later. This is what
   actually makes closed-browser delivery possible -- notifyDesktop()'s plain `new Notification(...)`
   a few lines down only ever works while this tab is still open somewhere. Safe to call again for an
   already-subscribed browser: pushManager.subscribe() just hands back the same subscription, and the
   upsert (conflict target: endpoint) overwrites the same row instead of duplicating it. */
async function subscribeToPush() {
if (!('serviceWorker' in navigator) || !('PushManager' in window) || !C.VAPID_PUBLIC_KEY || !sb || !me) return;
try {
var reg = await navigator.serviceWorker.ready;
var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(C.VAPID_PUBLIC_KEY) });
var j = sub.toJSON();
/* v163: through gc_save_push_subscription, which hands the device to whoever is signed in on it.
   The plain upsert this replaced could not: RLS only lets a browser touch rows that are already
   its own, so a device that had ever been registered under another account (a log out, a new
   anonymous login, a second character on the same phone) failed here every time -- and the
   error was never looked at. The old account kept getting this device's notifications and the
   one actually using it got none. See supabase/push_devices_fix.sql. */
var r = await sb.rpc('gc_save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
if (r.error) console.warn('push: this device could not be saved:', r.error.message);
} catch (e) { /* a failed subscribe just means no closed-browser delivery this session -- the in-tab path still works */ }
}
/* The reverse: turning the bell off means "stop reaching me", including on other devices this
   browser previously subscribed -- so this actually tells the push service to drop the
   subscription and deletes the matching row, rather than just flipping a local flag. */
async function unsubscribeFromPush() {
if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
try {
var reg = await navigator.serviceWorker.ready;
var sub = await reg.pushManager.getSubscription();
if (sub) {
if (sb) { try { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch (e2) {} }
await sub.unsubscribe();
}
} catch (e) {}
}
/* Fire-and-forget call to the send-push edge function -- never awaited by its callers below, and
   any failure (offline, function cold-start error, whatever) is swallowed here so a push hiccup can
   never block or break sending the actual chat message it's reporting on. */
function triggerPush(targetUserId, title, body, tag) {
if (!targetUserId || !sb || !C.SUPABASE_URL) return;
sb.auth.getSession().then(function (s) {
var jwt = s && s.data && s.data.session && s.data.session.access_token;
if (!jwt) return;
return fetch(C.SUPABASE_URL + '/functions/v1/send-push', {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
body: JSON.stringify({ targetUserId: targetUserId, title: title, body: body, tag: tag })
});
}).catch(function () {});
}
/* The board version of the same thing (v143). Unlike triggerPush, which names one recipient, this
   names a BOARD and lets the edge function work out who is subscribed to it -- because a browser
   must never be able to read who follows what, and because the sender should not be firing one
   request per subscriber. The fan-out happens server-side against thread_sub_targets(), which is
   SECURITY DEFINER and executable only by the service role. Fire-and-forget for the same reason
   as triggerPush: a push that fails must never take the post down with it.

   It goes to send-board-push, a different function from the send-push that triggerPush uses. That
   separation is on purpose rather than incidental: send-push carries every whisper, mention,
   friend request and game invite, and a mistake made while extending it would take all of that
   down at once. No `exclude` is sent -- the function takes the caller's id from the verified
   token instead, because a client-supplied exclude would let anyone suppress somebody else's
   notification. */
function triggerBoardPush(board, thread) {
if (!board || !thread || !sb || !C.SUPABASE_URL) return;
var blurb = thread.body ? String(thread.body).slice(0, 90) : (thread.image_url ? 'Posted a picture' : 'Started a thread');
if (thread.body && String(thread.body).length > 90) blurb += '…';
sb.auth.getSession().then(function (s) {
var jwt = s && s.data && s.data.session && s.data.session.access_token;
if (!jwt) return;
return fetch(C.SUPABASE_URL + '/functions/v1/send-board-push', {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
body: JSON.stringify({ board: board, title: me.name + ' posted on ' + boardById(board).name, body: blurb, tag: 'gc-board-' + board })
});
}).catch(function () {});
}
var notifBtn = $('notifBtn');
var notifEnabled = false;
try { notifEnabled = localStorage.getItem('gc_notif_enabled') === '1'; } catch (e) {}
function updateNotifBtn() {
if (!notifBtn) return;
var supported = 'Notification' in window;
var iosNeedsInstall = !supported && isIOSDevice() && !isStandaloneDisplay();
var icon = notifBtn.querySelector('.btn-icon');
var on = supported && notifEnabled && Notification.permission === 'granted';
if (icon) icon.textContent = on ? '🔔' : (iosNeedsInstall ? '📲' : '🔕'); else notifBtn.textContent = on ? '🔔' : (iosNeedsInstall ? '📲' : '🔕');
notifBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
notifBtn.title = iosNeedsInstall ? 'On iPhone/iPad: tap Share, then Add to Home Screen, then open Gypsy Chat from that icon to turn on notifications' :
!supported ? 'Notifications are not supported in this browser' :
Notification.permission === 'denied' ? (isAndroidDevice() && isStandaloneDisplay() ? 'Notifications are off — allow them in your phone’s Settings → Apps → Gypsy Chat → Notifications' : 'Notifications are blocked — allow them in your browser’s site settings to turn this on') :
on ? 'Notifications on for whispers & mentions — click to turn off' + (isWindowsDevice() ? '. Nothing popping up? In Windows Settings → System → Notifications, make sure ' + windowsBrowserName() + ' is on under “Notifications from apps and other senders”.' : '') :
'Turn on notifications for whispers & mentions';
}
if (notifBtn) {
updateNotifBtn();
notifBtn.onclick = async function () {
if (!('Notification' in window)) {
if (isIOSDevice() && !isStandaloneDisplay()) { addSys('iPhone/iPad notifications need this page added to your Home Screen first: tap the Share icon, choose "Add to Home Screen", then open Gypsy Chat from that icon and tap the bell again.'); }
else { addSys('Your browser does not support notifications.'); }
return;
}
if (Notification.permission === 'denied') {
/* Once a browser has recorded "denied" for this site, it will never show the real permission
   popup again no matter how many times JS calls requestPermission() -- that decision can only be
   reversed by the person, in the browser's own settings, which is why this can look like "the bell
   does nothing" even though it's working as designed. Android Chrome buries that toggle a bit
   differently than desktop, so it gets its own exact steps here. */
if (isAndroidDevice() && isStandaloneDisplay()) { addSys('Notifications are off for Gypsy Chat. Once this is installed to your Home Screen, Chrome hands the on/off switch to Android itself -- Chrome’s own site settings will just say "Managed by Gypsy Chat 2000" and won’t have a working toggle. Go to your phone’s Settings → Apps → Gypsy Chat → Notifications → Allow, then come back and tap the bell again.'); }
else if (isAndroidDevice()) { addSys('Notifications are blocked for this site. Tap the ⓘ or 🔒 icon at the left of the address bar → Permissions (or "Site settings") → Notifications → Allow, then reload this page and tap the bell again.'); }
else { addSys('Notifications are blocked for this site — allow them in your browser’s site settings to turn this on.'); }
return;
}
if (Notification.permission === 'default') {
var perm = await Notification.requestPermission(); // must run inside this click handler, not after any await before it, or some browsers silently ignore the prompt
notifEnabled = perm === 'granted';
} else {
notifEnabled = !notifEnabled; // already granted -- this button is just the user's own mute switch from here on
}
try { localStorage.setItem('gc_notif_enabled', notifEnabled ? '1' : '0'); } catch (e) {}
updateNotifBtn();
if (notifEnabled) subscribeToPush(); else unsubscribeFromPush();
};
}
/* Shows a real OS notification, only when on, granted, and the person genuinely isn't looking at
   this tab right now -- never while they're sitting right here (that's what the in-page ding/badge
   is for). tag lets a burst of whispers from the same person, or repeated mentions, update one
   notification in place instead of piling up a stack of them.
   v164: deliberately no renotify here, unlike sw.js. This page's notification and the service
   worker's push for the same whisper are separate notifications to Chrome (a page one and a
   service-worker one never replace each other, even with the same tag), so a renotify here would
   make every whisper pop twice while the tab sits in the background. The push already pops for
   each new one. */
function notifyDesktop(title, body, tag, onClick) {
if (!notifEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
if (!(document.hidden || !document.hasFocus())) return;
try {
var n = new Notification(title, { body: body, icon: './icons/icon-192.png', tag: tag });
n.onclick = function () { window.focus(); if (onClick) onClick(); n.close(); };
} catch (e) {}
}
function notifPreview(body) {
var t = String(body || '').trim();
if (GIF_RE.test(t) || (OWN_IMG_RE && OWN_IMG_RE.test(t))) return '📷 sent an image';
return t.length > 140 ? t.slice(0, 140) + '…' : t;
}

/* ---------- who can whisper me: friends only (default) or everyone ----------
   The rule itself is enforced in the database (see friends_only_whispers.sql: the messages insert
   policy calls can_whisper(sender, recipient)), so nothing here is load-bearing for safety -- this
   is the switch that sets my own profiles.whisper_policy, plus the client-side mirror of the rule
   that lets the UI say "add them as a friend first" up front instead of letting a whisper bounce
   off the policy with a raw error. Admins are exempt both ways, same as the database.
   Someone else's setting is public (profiles are readable by anyone signed on), so whisperAllowed
   looks it up when the fast checks don't already answer, and remembers it for a minute. */
var whisperPolicy = 'friends';
var whisperBtn = $('whisperBtn');
var whisperPolicyCache = {}; // user id -> {policy, at}
var WHISPER_POLICY_CACHE_MS = 60 * 1000;
function updateWhisperBtn() {
if (!whisperBtn) return;
var open = whisperPolicy === 'everyone';
var icon = whisperBtn.querySelector('.btn-icon'), label = whisperBtn.querySelector('.popover-label');
if (icon) icon.textContent = open ? '📬' : '🔒';
if (label) label.textContent = open ? 'Whispers: Everyone' : 'Whispers: Friends only';
whisperBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
whisperBtn.title = open ? 'Anyone in the room can whisper you — click to allow friends only' : 'Only friends can whisper you — click to allow everyone';
}
if (whisperBtn) {
updateWhisperBtn();
whisperBtn.onclick = async function () {
if (!me) return;
var next = whisperPolicy === 'everyone' ? 'friends' : 'everyone';
var r = await sb.from('profiles').update({ whisper_policy: next, updated_at: new Date().toISOString() }).eq('user_id', me.id);
if (r.error) { addSys('Could not change who can whisper you: ' + r.error.message); return; }
whisperPolicy = next; updateWhisperBtn();
addSys(next === 'everyone' ? 'Anyone in the room can whisper you now.' : 'Only your friends can whisper you now. (Admins always can.)');
};
}
/* Synchronous half of the rule: true when a whisper to `id` is certain to go through without
   asking the database (they're on my friends list, or an admin is on either end). */
function whisperAllowedSync(id) {
return !!(me && (isAdmin || isAdminId(id) || friends[id]));
}
/* Full rule: the sync checks, then their own whisper_policy if that's what decides it. */
async function whisperAllowed(id) {
if (whisperAllowedSync(id)) return true;
var c = whisperPolicyCache[id];
if (c && Date.now() - c.at < WHISPER_POLICY_CACHE_MS) return c.policy === 'everyone';
var r = await sb.from('profiles').select('whisper_policy').eq('user_id', id).maybeSingle();
var policy = (!r.error && r.data && r.data.whisper_policy) || 'friends';
whisperPolicyCache[id] = { policy: policy, at: Date.now() };
return policy === 'everyone';
}
/* Opens a whisper to `id` if the rule allows it; otherwise offers a friend request (with the
   optional intro line) in its place. Every "start a whisper" path goes through here -- the name
   menus, /w, and the inbox rows -- so the "friends first" moment always looks the same. */
async function tryWhisper(id, name, focus) {
if (await whisperAllowed(id)) { unread[id] = 0; return openIM(id, name, focus); }
var incomingReqId = incomingRequestIdFrom(id);
if (incomingReqId) { addSys(name + ' only takes whispers from friends — and they already sent you a request. Accept it from the 🤝 bell and you can whisper away.'); return null; }
if (outgoingPending[id]) { addSys(name + ' only takes whispers from friends. Your friend request to them is still pending.'); return null; }
var intro = await showPromptModal(name + ' only takes whispers from friends', { placeholder: 'Say hi (optional)', maxLength: 100, hint: 'Send a friend request instead? Once they accept, you can whisper each other.', okLabel: 'Send request' });
if (intro === null) return null;
sendFriendRequest(id, name, intro);
return null;
}
/* Maps the database's refusal of a whisper (the "send as self" policy) to a sentence a person can
   act on. Anything else keeps the raw message, same as before. */
function whisperErrorText(err, name) {
var m = (err && err.message) || String(err);
if (/row-level security/i.test(m)) return (name || 'They') + ' only takes whispers from friends. Send them a friend request from their name menu.';
return 'Your words were lost: ' + m;
}

/* ---------- option to completely hide DM (whisper) tabs and windows ----------
   Purely a client-side/visual toggle, same pattern as sound mute: whispers still arrive and are
   remembered under the hood (unread counts, history) — they're just not shown on screen while
   this is on, and everything reappears the moment it's switched back off. */
var dmTabsOff = false;
try { dmTabsOff = localStorage.getItem('gc_dm_tabs_off') === '1'; } catch (e) {}
/* The toggle button always reflects the raw preference the person picked ("I don't want to see DM
   tabs"), but that preference only actually hides the TRAY/minimized tabs while nothing is actively
   open -- opening (or receiving) a new whisper while the toggle is off should still show it, since
   the person is looking right at it; the moment every whisper window is minimized or fully closed,
   the DM UI goes back to hidden if the preference is still on.
   This checks for a non-minimized window specifically, not just "wins isn't empty" -- a stale
   minimized/background tab sitting in wins (nobody's actively looking at it) used to keep the whole
   DM UI pinned visible forever, which is what made the toggle look broken ("tabs persist even
   after being toggled off"): the tray never actually went away because *something* was always
   sitting in wins, even with every window minimized. */
function applyDmVisibility() {
var anyOpen = Object.keys(wins).some(function (id) { return !wins[id].minimized; });
/* a waiting friend request keeps the dock on screen too -- it's the only place requests show now */
var pending = typeof pendingRequestCount === 'function' && pendingRequestCount() > 0;
/* v153: the hide-messages toggle lives in the status bar, which phones do not show, so a phone
   carrying this flag would have no way on earth to turn messages back on. Ignore it at pill
   widths rather than leaving people stranded. */
if (gcRoot) gcRoot.classList.toggle('no-dms', dmTabsOff && !pillActive() && !anyOpen && !pending);
}
function updateDmToggleBtn() {
applyDmVisibility();
if (!dmToggleBtn) return;
var dmi = dmToggleBtn.querySelector('.btn-icon'); if (dmi) dmi.innerHTML = dmTabsOff ? '🚫' : ICON_ENVELOPE; else dmToggleBtn.innerHTML = dmTabsOff ? '🚫' : ICON_ENVELOPE;
dmToggleBtn.setAttribute('aria-pressed', dmTabsOff ? 'true' : 'false');
dmToggleBtn.title = dmTabsOff ? 'Messages hidden — click to show them again' : 'Hide messages';
}
if (dmToggleBtn) {
updateDmToggleBtn();
dmToggleBtn.onclick = function () {
dmTabsOff = !dmTabsOff;
try { localStorage.setItem('gc_dm_tabs_off', dmTabsOff ? '1' : '0'); } catch (e) {}
updateDmToggleBtn();
};
}

/* ---------- "more" popover (mobile bottom-bar declutter) ----------
   Below 500px, style.css pulls #statusPopover out of the status bar's flex row into a small
   floating panel holding the avatar/save/sound/reports buttons, so the row itself only ever shows
   the sign-on text, the status dot, and the DM toggle -- everything else is one tap away behind
   "...". Above 500px #statusPopover is display:contents (its buttons render inline exactly as
   before) and #moreBtn stays hidden by CSS, so none of this code does anything on desktop. */
var moreBtn = $('moreBtn'), statusPopover = $('statusPopover');
function closeMoreMenu() { if (!statusPopover) return; statusPopover.classList.remove('open'); if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false'); }
function openMoreMenu() { if (!statusPopover) return; statusPopover.classList.add('open'); if (moreBtn) moreBtn.setAttribute('aria-expanded', 'true'); }
if (moreBtn) {
moreBtn.onclick = function (e) { e.stopPropagation(); if (statusPopover.classList.contains('open')) closeMoreMenu(); else openMoreMenu(); };
}
if (statusPopover) {
// picking any action inside (change picture, save, sound, reports) closes the popover behind it
statusPopover.addEventListener('click', function (e) { if (e.target.closest('button')) closeMoreMenu(); });
}
document.addEventListener('click', function (e) { if (statusPopover && !statusPopover.classList.contains('open')) return; if (statusPopover && !statusPopover.contains(e.target) && e.target !== moreBtn) closeMoreMenu(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMoreMenu(); });

/* ---------- width of the Online/Friends panel ----------
   Horizontal only, deliberately: the panel is a grid cell whose height already tracks the chat
   log beside it, so there is nothing sensible for a vertical drag to do. The width lives in a
   CSS variable on .body rather than as an inline width on the panel itself, so the grid track
   and the panel can never disagree about how wide the column is -- one value moves both.
   Remembered per browser, like the sound and DM-tab preferences above. */
var USERS_W_MIN = 120, USERS_W_MAX = 380, USERS_W_DEFAULT = 160;
var usersW = USERS_W_DEFAULT;
function applyUsersWidth() {
var bodyEl = document.querySelector('.body');
if (bodyEl) bodyEl.style.setProperty('--users-w', usersW + 'px');
}
try {
var savedW = parseInt(localStorage.getItem('gc_users_w'), 10);
if (savedW >= USERS_W_MIN && savedW <= USERS_W_MAX) usersW = savedW;
} catch (e) {}
applyUsersWidth();

(function () {
var grip = $('usersResize');
if (!grip) return;
var startX = 0, startW = 0, dragging = false;
function clampW(w) { return Math.max(USERS_W_MIN, Math.min(USERS_W_MAX, Math.round(w))); }
function saveW() { try { localStorage.setItem('gc_users_w', String(usersW)); } catch (e) {} }
grip.addEventListener('pointerdown', function (e) {
if (window.matchMedia('(max-width:430px)').matches) return; // no side panel to size on a phone
dragging = true; startX = e.clientX; startW = usersW;
try { grip.setPointerCapture(e.pointerId); } catch (err) {}
if (gcRoot) gcRoot.classList.add('users-resizing');
e.preventDefault();
});
grip.addEventListener('pointermove', function (e) {
if (!dragging) return;
/* the grip sits on the panel's LEFT edge, so dragging left (negative dx) widens it */
usersW = clampW(startW - (e.clientX - startX));
applyUsersWidth();
});
function endDrag(e) {
if (!dragging) return;
dragging = false;
try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
if (gcRoot) gcRoot.classList.remove('users-resizing');
saveW();
}
grip.addEventListener('pointerup', endDrag);
grip.addEventListener('pointercancel', endDrag);
/* keyboard parity, since the grip is focusable; double-click restores the default width */
grip.addEventListener('keydown', function (e) {
var step = e.shiftKey ? 24 : 8;
if (e.key === 'ArrowLeft') usersW = clampW(usersW + step);
else if (e.key === 'ArrowRight') usersW = clampW(usersW - step);
else if (e.key === 'Home') usersW = USERS_W_DEFAULT;
else return;
e.preventDefault(); applyUsersWidth(); saveW();
});
grip.addEventListener('dblclick', function () { usersW = USERS_W_DEFAULT; applyUsersWidth(); saveW(); });
})();

/* ---------- height of the Online/Friends panel, on a phone ----------
   Below 431px the layout collapses to one column and the panel stops being a side column: it
   becomes a block sitting between the chat log and the composer, where every pixel it takes is
   a pixel of conversation you cannot see. So on that layout it gets the opposite control from
   the desktop one -- a vertical drag on its top edge, and a button to fold it away entirely.
   Folding leaves the "Online" bar in place rather than hiding the panel outright, so there is
   always something to press to bring it back. Both the height and the folded state are
   remembered per browser, like the width above. */
/* Is the panel stacked UNDER the chat log, or standing beside it as a column? The fold button
   and the top-edge grip only make sense in the stacked layout, and the first version decided
   that with a max-width:430px media query -- which the newest large phones sit just outside, so
   on those neither control ever appeared. This measures the result instead of predicting it:
   if the panel's top edge is at or below the log's bottom edge, they are stacked. That stays
   correct whatever the breakpoint is, and through a rotation. */
function updateUsersStacked() {
var u = $('users');
if (!gcRoot || !u || u.classList.contains('hidden')) return;
var ur = u.getBoundingClientRect(), lr = log.getBoundingClientRect();
if (!ur.width || !lr.width) return; // nothing laid out yet; leave the last answer alone
gcRoot.classList.toggle('users-stacked', ur.top >= lr.bottom - 2);
}
window.addEventListener('resize', updateUsersStacked);
/* iOS reports the new size a beat after orientationchange fires, so re-measure once it settles.
   That lag is also why the scroll snapshot below is taken right here, synchronously, rather than
   inside the timeout: at the moment this event fires the old (pre-rotation) layout and scroll
   position are still in effect, which is exactly the "before" picture rememberChatScroll()/
   returnToChat() (defined further down) need to put you back where you were instead of dumping
   you at the top of the chat once the new orientation settles. */
window.addEventListener('orientationchange', function () {
rememberChatScroll();
setTimeout(function () { updateUsersStacked(); returnToChat(); }, 300);
});

/* 190 rather than the old 150: the height only ever applies in the stacked (phone) layout, and
   150px left the Online list showing barely a name and a half once the Friends heading and the
   hint had taken their share. The panel now starts folded there (see below), so a taller
   unfolded size no longer costs anyone who never opens it. Anyone who already dragged it to a
   height they like keeps that (gc_users_h). */
var USERS_H_MIN = 84, USERS_H_DEFAULT = 190;
var usersH = USERS_H_DEFAULT, usersFolded = false;
function usersHMax() { return Math.max(USERS_H_MIN + 40, Math.round(window.innerHeight * 0.6)); }
function applyUsersHeight() {
var bodyEl = document.querySelector('.body');
if (bodyEl) bodyEl.style.setProperty('--users-h', usersH + 'px');
}
function applyUsersFold() {
if (gcRoot) gcRoot.classList.toggle('users-folded', usersFolded);
var b = $('usersMin');
if (!b) return;
b.textContent = usersFolded ? '▲' : '▼';
b.setAttribute('aria-expanded', usersFolded ? 'false' : 'true');
b.title = usersFolded ? 'Show the online and friends list' : 'Hide the online and friends list';
b.setAttribute('aria-label', b.title);
}
try {
var savedH = parseInt(localStorage.getItem('gc_users_h'), 10);
if (savedH >= USERS_H_MIN) usersH = savedH;
/* First visit on a phone-width screen: start with the panel folded to its one-line "Online"
   bar (which carries the head count, see renderPeople), so the conversation gets the room
   and the list is one tap away. Once someone has pressed the fold button their choice is
   what's remembered, on any screen size -- this default only fills in until then. On a wide
   screen the panel is a side column and folding never applies, so `false` there is moot. */
var savedFold = localStorage.getItem('gc_users_folded');
usersFolded = savedFold === null ? window.innerWidth <= 500 : savedFold === '1';
} catch (e) {}
applyUsersHeight(); applyUsersFold();

(function () {
var btn = $('usersMin');
function toggleFold() {
usersFolded = !usersFolded;
try { localStorage.setItem('gc_users_folded', usersFolded ? '1' : '0'); } catch (e) {}
applyUsersFold();
}
if (btn) btn.onclick = toggleFold;
/* On a phone the whole "Online" bar is the natural thing to tap, not just the small arrow at
   its end -- so the bar toggles too, but only in the stacked layout where folding exists (on a
   wide screen the bar is a plain column heading and a tap there should do nothing). Taps on the
   arrow itself already toggled above; skip those so one tap doesn't fold and unfold. */
var hd = btn ? btn.parentNode : null;
if (hd) hd.addEventListener('click', function (e) {
if (e.target === btn || btn.contains(e.target)) return;
if (!gcRoot || !gcRoot.classList.contains('users-stacked')) return;
toggleFold();
});
var grip = $('usersResizeV');
if (!grip) return;
var startY = 0, startH = 0, dragging = false;
function clampH(h) { return Math.max(USERS_H_MIN, Math.min(usersHMax(), Math.round(h))); }
grip.addEventListener('pointerdown', function (e) {
/* dragging the folded panel open is the same gesture as resizing it, so unfold first rather
   than making people press the button before they can drag */
if (usersFolded) { usersFolded = false; try { localStorage.setItem('gc_users_folded', '0'); } catch (err) {} applyUsersFold(); }
dragging = true; startY = e.clientY; startH = usersH;
try { grip.setPointerCapture(e.pointerId); } catch (err) {}
if (gcRoot) gcRoot.classList.add('users-resizing-v');
e.preventDefault();
});
grip.addEventListener('pointermove', function (e) {
if (!dragging) return;
/* the grip is on the panel's TOP edge, so dragging up (negative dy) makes it taller */
usersH = clampH(startH - (e.clientY - startY));
applyUsersHeight();
});
function endDragV(e) {
if (!dragging) return;
dragging = false;
try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
if (gcRoot) gcRoot.classList.remove('users-resizing-v');
try { localStorage.setItem('gc_users_h', String(usersH)); } catch (err) {}
}
grip.addEventListener('pointerup', endDragV);
grip.addEventListener('pointercancel', endDragV);
grip.addEventListener('keydown', function (e) {
var step = e.shiftKey ? 40 : 16;
if (e.key === 'ArrowUp') usersH = clampH(usersH + step);
else if (e.key === 'ArrowDown') usersH = clampH(usersH - step);
else if (e.key === 'Home') usersH = USERS_H_DEFAULT;
else return;
e.preventDefault(); applyUsersHeight();
try { localStorage.setItem('gc_users_h', String(usersH)); } catch (err) {}
});
})();

/* ---------- tab title flash for unseen activity while the tab isn't focused ---------- */
var BASE_TITLE = document.title, unreadTitle = 0;
function bumpTitle() { unreadTitle++; document.title = '(' + unreadTitle + ') ' + BASE_TITLE; }
function clearTitle() { unreadTitle = 0; document.title = BASE_TITLE; }
/* Phones suspend background tabs and can silently drop the realtime socket; when the tab comes
   back to the foreground, re-announce presence in case the reconnect didn't already do it, so the
   person doesn't quietly vanish from other people's Online list while they were still around. */
document.addEventListener('visibilitychange', function () { if (!document.hidden) { clearTitle(); updateMyPresence(); } });
window.addEventListener('focus', clearTitle);

/* ---------- helpers ----------
   Note on SQL injection: this app never builds SQL strings on the client — every read/write goes
   through the Supabase query builder (.select/.insert/.eq/.rpc), which sends parameterized
   requests to PostgREST, and the server-side functions below bind their inputs as plain PL/pgSQL
   variables rather than concatenating text into dynamic SQL. sanitizeInput() below is an extra,
   defense-in-depth strip of control characters from user text; it isn't what stops injection —
   never building raw SQL from user input is. */
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
/* Focus a field for the person's convenience -- but only where that convenience is real. On a
   touch screen, focusing a field programmatically throws the keyboard up over half the screen
   the moment a view opens (signing on, opening a thread, the report/bug/ballot dialogs...), which
   was the most-complained-about thing on phones. So this is a no-op on touch-primary devices;
   the field is one tap away. Focus that follows something the person just did IN a field
   (sending a message, picking an emoji, completing an @name) still calls .focus() directly. */
function isTouchDevice() { return !!(window.matchMedia && window.matchMedia('(hover:none) and (pointer:coarse)').matches); }
function autoFocus(el) { if (el && !isTouchDevice()) el.focus(); }
function sanitizeInput(s) { return String(s || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); }
/* getHours()/getMinutes() already read the LOCAL clock -- a Date parses the stored UTC
   created_at and these getters convert it to whatever timezone the browser/device is set to, so
   every timestamp already lands in each viewer's own timezone with zero server-side work. The
   only thing this used to get wrong was the format: plain 24-hour "HH:MM". This converts that to
   12-hour clock face + AM/PM (never military time), same local-timezone value either way. */
function fmt(t) {
var d = new Date(t), h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
h = h % 12; if (!h) h = 12;
return h + ':' + ('0' + m).slice(-2) + ' ' + ap;
}
/* Date + time for contexts that span more than one day (the admin reports queue) -- the date part
   uses the browser's own locale/timezone via toLocaleDateString, the time part is always the same
   12-hour fmt() above so it never flips to 24-hour just because a locale prefers that. */
function fmtDateTime(t) { return new Date(t).toLocaleDateString() + ' ' + fmt(t); }
/* v121: a "Today / Yesterday / Mon, Sep 14" divider whenever the calendar day changes between
   consecutive messages in a log (room or whisper), so nobody has to guess whether "9:12 PM" was
   tonight or last Tuesday. One key per log; the label is computed when the divider is drawn. */
var lastDayKey = {};
function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function dayLabel(t) {
var d = new Date(t), now = new Date(), k = dayKey(t);
if (k === dayKey(now)) return 'Today';
var y = new Date(now); y.setDate(now.getDate() - 1); if (k === dayKey(y)) return 'Yesterday';
return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + (d.getFullYear() !== now.getFullYear() ? ', ' + d.getFullYear() : '');
}
function dayDivider(logEl, key, t) {
if (!t) return; var k = dayKey(t); if (lastDayKey[key] === k) return; lastDayKey[key] = k;
var el = document.createElement('div'); el.className = 'day-div'; el.innerHTML = '<span>' + esc(dayLabel(t)) + '</span>'; logEl.appendChild(el);
}
function wrapEmoji(h) { return h.replace(/(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu, '<span class="e">$1</span>'); }
var URL_RE = /(https?:\/\/[^\s<]+)/g;
function linkify(html) {
return html.replace(URL_RE, function (u) {
var trail = '', m = u.match(/[)\]}>.,!?;:'"]+$/);
if (m) { trail = m[0]; u = u.slice(0, -trail.length); }
if (!u) return trail;
return '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + u + '</a>' + trail;
});
}
function setStatus(t) { st.textContent = t; }

/* Once signed in, the status bar's only job is to double as the rename control (see
   renameCharacter/promptRename below), so it shows "Change name" -- in the neon-orange
   .renamable styling (style.css) -- rather than restating who you are, which is already visible
   in the room itself. The name isn't lost, just moved to a hover tooltip via title. */
function setSignedOnStatus() {
if (!me) return;
var who = 'Signed on as ' + me.name + (isAdmin ? ' (admin)' : '');
setStatus('Change name');
if (st) { st.title = who; st.classList.add('renamable'); }
}

/* ---------- changing your character name ----------
   Renaming keeps the account: same id, so the friends list, whispers and saved email all stay
   put, and anyone who has added you sees the new name appear the moment presence updates.
   profiles.name is the single source of truth the INSERT policies check, so it is written
   FIRST via claim_name (which enforces the unique index and rejects a name someone else holds)
   and only then mirrored into me.name and presence. Messages already in the log keep the name
   you wore when you sent them -- sender_name is a snapshot on each row, not a live lookup. */
async function renameCharacter(raw) {
var n = (raw || '').trim();
if (!me || !sb) return;
if (!n) { addSys('Usage: /nick YourNewName'); return; }
if (n === me.name) { addSys('That is already your name.'); return; }
if (!NAME_RE.test(n)) { addSys('A name is 2–16 letters (any language), numbers, spaces or . \' -'); return; }
var r = await sb.rpc('claim_name', { p_name: n });
if (r.error) { addSys('Could not change your name: ' + r.error.message); return; }
if (r.data && r.data.ok === false) {
addSys(r.data.reason === 'taken' ? 'Someone else is using the name ' + n + '.' : 'That name can’t be used.');
return;
}
var was = me.name;
me.name = n;
lockedName = n; // so the sign-on screen offers the new name next time
try { await sb.auth.updateUser({ data: { name: n } }); await sb.auth.refreshSession(); } catch (e) { /* display-only mirror */ }
updateMyPresence();
renderPeople();
setSignedOnStatus();
addSys('You are now known as ' + n + '. (Previously ' + was + '.)');
}

function promptRename() {
if (!me) return;
var n = prompt('Change your character name:', me.name);
if (n !== null) renameCharacter(n);
}
if (st) st.onclick = function () { if (me) promptRename(); };
function fail(t) { $('err').textContent = t; }

/* ---------- spam cooldown / mute ----------
   Real enforcement lives in Postgres (see the gc_check_and_record_send RPC and the
   trg_gc_enforce_moderation trigger on `messages`) so it can't be bypassed by editing this file:
   this client-side state just mirrors what the server told us, to disable the compose box and
   show a countdown without waiting on a round trip for every keystroke. */
var moderation = { cooldownUntil: 0, muted: false, mutedPermanent: false, mutedUntil: 0, offenseCount: 0 };
var modTimer = null;
function clearModTimer() { if (modTimer) { clearInterval(modTimer); modTimer = null; } }
function lockThreadCompose(locked) {
if (tpNewBody) tpNewBody.disabled = locked;
if (tpNewSubmit) tpNewSubmit.disabled = locked;
if (tpReplyBody) tpReplyBody.disabled = locked;
if (tpReplySend) tpReplySend.disabled = locked;
}
function updateComposeLock() {
var bar = $('cooldownMsg'), now = Date.now();
if (moderation.muted) {
msg.disabled = true; $('send').disabled = true; lockThreadCompose(true);
/* mutedUntil is only set for a timed admin mute (see muteUser()'s durationMs) -- a mute from
   repeated spam, or one an admin imposed with no duration, is permanent and has no expiry. */
bar.textContent = moderation.mutedPermanent ? '🔇 Muted. Only an admin can lift this.' :
(moderation.mutedUntil > now ? '🔇 Muted until ' + fmt(moderation.mutedUntil) + '.' : '🔇 Muted. Only an admin can lift this.');
bar.classList.remove('hidden'); bar.classList.add('muted');
clearModTimer();
renderRoomTyping(); // this bar just took over the spot above the composer -- let it hide the typing indicator too
return;
}
if (moderation.cooldownUntil > now) {
msg.disabled = true; $('send').disabled = true; lockThreadCompose(true);
bar.textContent = '⏳ Cooldown: ' + Math.max(1, Math.ceil((moderation.cooldownUntil - now) / 1000)) + 's remaining';
bar.classList.remove('hidden'); bar.classList.remove('muted');
renderRoomTyping();
} else {
msg.disabled = false; $('send').disabled = false; lockThreadCompose(false);
bar.classList.add('hidden'); bar.classList.remove('muted');
clearModTimer();
renderRoomTyping(); // cooldown just cleared -- give the spot back to the typing indicator if it's due
}
}
function applyModeration(state) {
moderation.muted = !!state.muted;
moderation.mutedPermanent = !!state.mutedPermanent;
moderation.mutedUntil = state.mutedUntil || 0;
moderation.offenseCount = state.offenseCount || 0;
moderation.cooldownUntil = state.cooldownUntil || 0;
updateComposeLock();
clearModTimer();
if (!moderation.muted && moderation.cooldownUntil > Date.now()) modTimer = setInterval(updateComposeLock, 500);
}
function warnPopup(offenseCount, muted, mutedPermanent, cooldownSeconds) {
var body = $('warnBody'), title = $('warnTitle');
if (muted) {
title.textContent = 'Muted';
body.textContent = 'You sent messages too fast ' + offenseCount + ' time' + (offenseCount === 1 ? '' : 's') + ' this session. You are now muted' + (mutedPermanent ? ' permanently — only an admin can unmute you.' : '.');
} else {
title.textContent = 'Slow down';
body.textContent = 'You are sending messages too quickly. Cooldown: ' + cooldownSeconds + 's. (Warning ' + offenseCount + ' of 5)';
}
$('warnOverlay').classList.remove('hidden');
$('warnOk').focus();
}
$('warnOk').onclick = function () { $('warnOverlay').classList.add('hidden'); if (!msg.disabled) msg.focus(); };
$('warnOverlay').onclick = function (e) { if (e.target === $('warnOverlay')) $('warnOk').click(); };

/* ---------- Get Info popup (profile bio, works for online people and offline friends alike) ---------- */
async function showInfo(id, name) {
$('infoTitle').textContent = name;
$('infoBody').textContent = 'Loading…';
$('infoOverlay').classList.remove('hidden');
$('infoOk').focus();
var r = await sb.from('profiles').select('bio').eq('user_id', id).maybeSingle();
var bio = (!r.error && r.data && r.data.bio) ? r.data.bio : '';
$('infoBody').textContent = bio || 'No profile info set.';
}
$('infoOk').onclick = function () { $('infoOverlay').classList.add('hidden'); };
$('infoOverlay').onclick = function (e) { if (e.target === $('infoOverlay')) $('infoOk').click(); };

/* ---------- generic prompt modal -- stands in for window.prompt() everywhere the app needs one
   line of text back. Native prompt() renders as a bare OS/browser dialog (on some mobile browsers
   it shows up tucked in near the address bar, looking like it belongs to the browser chrome rather
   than the room), so this keeps the same one-question-one-answer flow but inside a window styled
   like the rest of the app. Returns a Promise: the trimmed string, or null if cancelled. */
var promptMentions = false;
function showPromptModal(title, opts) {
opts = opts || {};
return new Promise(function (resolve) {
var overlay = $('promptOverlay'), input = $('promptInput'), body = $('promptBody'),
okBtn = $('promptOk'), cancelBtn = $('promptCancel');
$('promptTitle').textContent = title;
if (opts.hint) { body.textContent = opts.hint; body.classList.remove('hidden'); }
else { body.textContent = ''; body.classList.add('hidden'); }
input.value = opts.value || '';
input.placeholder = opts.placeholder || '';
input.maxLength = opts.maxLength || 100;
okBtn.textContent = opts.okLabel || 'OK'; // e.g. "Send request" when the field is a friend-request intro
/* opts.mentions: the field gets the composer's @Name autocomplete for as long as the dialog is up
   (the Ballot Box uses this on phones) */
promptMentions = !!opts.mentions;
if (promptMentions) mentionTa = input;
overlay.classList.remove('hidden');
if (!isTouchDevice()) { input.focus(); input.select(); }
function done(val) {
overlay.classList.add('hidden');
okBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null; input.onkeydown = null;
if (promptMentions) { closeMention(); mentionTa = null; promptMentions = false; }
resolve(val);
}
okBtn.onclick = function () { done(input.value.trim()); };
cancelBtn.onclick = function () { done(null); };
overlay.onclick = function (e) { if (e.target === overlay) done(null); };
input.onkeydown = function (e) { if (promptMentions && mentionKeydown(e)) return; if (e.key === 'Enter') { e.preventDefault(); okBtn.onclick(); } };
});
}

/* the prompt dialog's field drives the @ menu only while a caller asked for it (opts.mentions) */
if ($('promptInput')) {
$('promptInput').addEventListener('input', function () { if (promptMentions) updateMentionMenu(); });
$('promptInput').addEventListener('click', function () { if (promptMentions) updateMentionMenu(); });
}
document.addEventListener('keydown', function (e) {
if (e.key !== 'Escape') return;
var dialogUp = !$('warnOverlay').classList.contains('hidden') || !$('infoOverlay').classList.contains('hidden') || !!($('promptOverlay') && !$('promptOverlay').classList.contains('hidden')) || !!(ideaOverlay && !ideaOverlay.classList.contains('hidden'));
if (!$('warnOverlay').classList.contains('hidden')) $('warnOk').click();
if (!$('infoOverlay').classList.contains('hidden')) $('infoOk').click();
if ($('promptOverlay') && !$('promptOverlay').classList.contains('hidden')) $('promptCancel').click();
if ($('saveOverlay') && !$('saveOverlay').classList.contains('hidden')) $('saveOverlay').classList.add('hidden');
if ($('imgLightbox') && !$('imgLightbox').classList.contains('hidden')) closeLightbox();
if (bugReportOverlay && !bugReportOverlay.classList.contains('hidden')) closeBugReportModal();
if (ideaOverlay && !ideaOverlay.classList.contains('hidden')) closeIdeaModal();
if (typeof closeAdminPanel === 'function' && gcRoot && gcRoot.classList.contains('admin-open')) closeAdminPanel();
if (!dialogUp && typeof grOpen === 'function' && grOpen() && !(e.target && e.target.classList && (e.target.classList.contains('gr-hd-in') || (e.target.classList.contains('gr-chatin') && e.target.value)))) closeGameRoom();
});

/* ---------- image lightbox: click any posted picture (room, whispers, threads) to see it full
   size -- everywhere a picture is posted it's shown as a small thumbnail (see the img.gif/.tp-thumb/
   .tp-posted-img size rules in the CSS), never at its native size, so this is the only way to see
   the whole thing without leaving the page. Shared by every image click handler below rather than
   each one building its own popup. */
function openLightbox(src) {
if (!src || !$('imgLightbox')) return;
$('imgLightboxImg').src = src;
$('imgLightbox').classList.remove('hidden');
}
function closeLightbox() {
if (!$('imgLightbox')) return;
$('imgLightbox').classList.add('hidden');
$('imgLightboxImg').src = '';
}
if ($('imgLightboxClose')) $('imgLightboxClose').onclick = closeLightbox;
if ($('imgLightbox')) $('imgLightbox').onclick = function (e) { if (e.target === $('imgLightbox')) closeLightbox(); };

/* Giphy CDN links, or our own "thread-images" Storage bucket (see uploadImage below), only —
   keeps the message body allowlist tight so we never turn arbitrary pasted URLs into <img> tags.
   Our own bucket is safe to trust the same way Giphy is: storage.objects RLS only lets someone
   upload under their own user-id folder, in a fixed set of image types, so a URL that matches this
   prefix can't have been forged into pointing anywhere else. This is what lets a whisper photo-send
   (and a thread image) show up as an embedded picture instead of a bare link. */
var GIF_RE = /^https:\/\/(?:media\d{0,3}\.giphy\.com|i\.giphy\.com)\/media\/[^\s"'<>]+\.gif(?:\?[^\s"'<>]*)?$/i;
var OWN_IMG_RE = C.SUPABASE_URL ? new RegExp('^' + C.SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/storage/v1/object/public/thread-images/[^\\s"\'<>]+$', 'i') : null;
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/* @mentions: names aren't restricted to word-characters (a name can have spaces, punctuation,
   emoji...), so there's no context-free regex for "a mention" -- instead we match against a pool
   of names, longest name first so e.g. "@Jo" can't eat the front of "@John" (the trailing
   (?![\w-]) guard on every match does the same job the other way: it keeps "@Jo" from matching
   the "Jo" inside "@John"). The pool is recentPeopleEntries(), not just `people` -- the same
   30-minute reachable pool the whisper picker and mentionedUserIds() push resolution already use
   (see recentPeopleEntries above). Without this, someone who stepped away for a minute would drop
   out of highlighting/autocomplete the moment they went offline, even though @mentioning them
   still actually pushes a notification -- a confusing mismatch between what the UI shows is
   possible and what actually works. */
function mentionableNames() {
  var pool = recentPeopleEntries();
  return Object.keys(pool).map(function (id) { return pool[id].name; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
}
function highlightMentions(html) {
  mentionableNames().forEach(function (n) {
    var re = new RegExp('@' + escRe(esc(n)) + '(?![\\w-])', 'g');
    html = html.replace(re, '<span class="mention">@' + esc(n) + '</span>');
  });
  return html;
}
function bodyMentionsMe(body) {
  if (!me) return false;
  return new RegExp('@' + escRe(me.name) + '(?![\\w-])', 'i').test(String(body || ''));
}
/* Similar matching rule to bodyMentionsMe/highlightMentions, but resolved against recentPeople
   (anyone seen in the last RECENT_GRACE_MS, not just who's live in `people` this instant) and
   returning every matched user id instead of just a yes/no for "me" -- used right after sending a
   room message to work out who to push-notify, since the sender's client is the only one guaranteed
   to be online at that moment to trigger it. Excludes the sender themselves so mentioning your own
   name can't push-notify you. The wider pool matters specifically for mobile: someone whose phone
   dropped its realtime connection a moment ago (backgrounded, weak signal) is exactly who needs the
   push to actually reach them -- if @mentions only worked for people already live in `people`, the
   push would only ever fire for people who didn't need it. */
function mentionedUserIds(body) {
  var text = String(body || ''); var ids = [];
  var pool = recentPeopleEntries();
  Object.keys(pool).forEach(function (id) {
    if (id === (me && me.id)) return;
    var n = pool[id] && pool[id].name; if (!n) return;
    if (new RegExp('@' + escRe(n) + '(?![\\w-])', 'i').test(text)) ids.push(id);
  });
  return ids;
}
function bodyHtml(body) {
  var t = String(body || '').trim();
  if (GIF_RE.test(t) || (OWN_IMG_RE && OWN_IMG_RE.test(t))) return '<img class="gif" src="' + esc(t) + '" alt="Image" loading="lazy">';
  return highlightMentions(linkify(wrapEmoji(esc(body))));
}

/* A GIF or photo arrives as an <img> with no width or height yet. The browser lays it out at
   zero height, we scroll to the bottom, and only THEN does the picture load -- growing the log
   underneath us and pushing the newest message back up out of view. So whenever a message
   carries images, re-stick to the bottom as each one finishes loading.
   The guard matters: someone may have scrolled up to read back while the picture was still
   downloading, and yanking them to the bottom then would be worse than the original bug. Only
   re-stick if they are still within roughly that image's own height of the bottom, which is
   true exactly when the loading image is what pushed them away. */
function stickImages(container, el) {
var imgs = el.querySelectorAll ? el.querySelectorAll('img') : null;
if (!imgs || !imgs.length) return;
for (var i = 0; i < imgs.length; i++) {
(function (im) {
if (im.complete) return;
var after = function () {
var gap = container.scrollHeight - container.scrollTop - container.clientHeight;
if (gap <= (im.offsetHeight || 0) + 60) container.scrollTop = container.scrollHeight;
};
im.addEventListener('load', after);
im.addEventListener('error', after);
})(imgs[i]);
}
}

/* Landing on the newest message at sign-on is harder than one scrollTop assignment, because the
   log keeps growing for a second or two AFTER the history is in it: avatars and GIFs finish
   downloading, and the two webfonts arrive and re-flow every line. Each of those pushes the
   bottom further down, leaving you parked short of it.
   So hold the bottom for a short settling window rather than jumping once -- on each image that
   loads inside the log, and once the fonts report ready. It lets go the moment you scroll away
   yourself, so it can never fight someone who has started reading back through the backlog. */
function pinLogBottom(ms) {
var released = false;
/* Below the 500px breakpoint .log has no scrollbox of its own -- height:auto, min-height:0 --
   so it never overflows and log.scrollTop is a permanent no-op there; it's the whole PAGE that
   scrolls instead. Sign-on was only ever moving log.scrollTop, so on a real phone it silently
   did nothing and you landed wherever a fresh page load starts: the very top. Move the page too
   whenever this layout is active (same test the mobile threads/roulette toggle uses). */
function jump() {
if (released) return;
log.scrollTop = log.scrollHeight;
if (isNarrow()) window.scrollTo(0, document.documentElement.scrollHeight);
}
function atBottom() {
var logOk = log.scrollHeight - log.scrollTop - log.clientHeight <= 80;
var pageOk = !isNarrow() || document.documentElement.scrollHeight - window.scrollY - window.innerHeight <= 80;
return logOk && pageOk;
}
function onScroll() { if (!atBottom()) release(); }
function release() {
if (released) return;
released = true;
log.removeEventListener('scroll', onScroll);
window.removeEventListener('scroll', onScroll);
log.removeEventListener('load', jump, true);
}
log.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('scroll', onScroll, { passive: true });
log.addEventListener('load', jump, true); // capture: 'load' from an <img> does not bubble
if (document.fonts && document.fonts.ready) document.fonts.ready.then(jump);
requestAnimationFrame(function () { requestAnimationFrame(jump); });
setTimeout(release, ms || 4000);
}

/* ---------- profile pictures (small, persistent avatars) ----------
   The URL lives in two places: profiles.avatar_url (loaded on join, so it survives across
   sessions) and, for whoever is currently in the room, presence (so everyone sees a change live
   without a page reload -- same trick already used for name/status/awayMsg). Someone who has left
   the room has no presence entry, so their avatar only shows up where we already have a cached
   people[] record for them (e.g. an open whisper window); otherwise we fall back to a plain
   initial-letter badge rather than making an extra query per name. */
function avatarUrlFor(id) {
  if (me && id === me.id) return me.avatarUrl || null;
  return (people[id] && people[id].avatarUrl) || null;
}
function avatarHtml(id, name, extraClass) {
  var url = avatarUrlFor(id);
  var cls = extraClass ? ' ' + extraClass : '';
  if (url) return '<img class="ava' + cls + '" src="' + esc(url) + '" alt="" loading="lazy">';
  var initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return '<span class="ava-fallback' + cls + '" aria-hidden="true">' + esc(initial) + '</span>';
}

/* ---------- main room log ---------- */
function addSys(text, t) {
var d = document.createElement('div'); d.className = 'm sys';
d.innerHTML = '<span class="t">' + fmt(t || Date.now()) + '</span>' + esc(text);
dayDivider(log, 'room', t || Date.now()); // v124: system lines count too -- the 'Today' divider was never drawn when the only messages today were the welcome lines
log.appendChild(d); log.scrollTop = log.scrollHeight;
}
function renderRoom(m) {
if (seen[m.id]) return; seen[m.id] = 1;
var mine = m.sender_id === me.id;
msgCache[m.id] = { senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at };
var mentionsMe = !mine && bodyMentionsMe(m.body);
var stub = replyStubHtml(m.reply_to);
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them') + (mentionsMe ? ' mention-me' : ''); d.dataset.mid = m.id;
var flag = mine ? '' : '<button type="button" class="rpt-msg" data-mid="' + m.id + '" title="Report this message" aria-label="Report this message from ' + esc(m.sender_name) + '">🚩</button>';
d.innerHTML = stub + '<span class="t">' + fmt(m.created_at) + '</span>' + flag + avatarHtml(m.sender_id, m.sender_name) + '<b class="who' + (isAdminId(m.sender_id) ? ' admin' : '') + '" data-id="' + esc(m.sender_id) + '" data-name="' + esc(m.sender_name) + '" tabindex="0"><span class="nmt">' + esc(m.sender_name) + '</span>' + levelBadgeHtml(m.sender_id) + ':</b> ' + bodyHtml(m.body) + reactionsHtml('message', m.id);
if (m.reply_to) fillReplyStub(m.reply_to);
var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
dayDivider(log, 'room', m.created_at);
log.appendChild(d);
if (atBottom || mine) { log.scrollTop = log.scrollHeight; stickImages(log, d); }
else if (!replayingHistory) bumpNewPill();
if (!mine && document.hidden && !replayingHistory) bumpTitle();
if (mentionsMe && !replayingHistory) { playSound('ding'); notifyDesktop(m.sender_name + ' mentioned you', notifPreview(m.body), 'gc-mention'); }
else if (!mine && !replayingHistory) messageSound(true); // v135
}
/* v121: scrolled up reading older messages while new ones land? A "3 new messages ↓" pill sits at
   the bottom edge of the log instead of yanking the view down (or letting them go unnoticed).
   Tap it, or scroll to the bottom yourself, and it goes away. */
var newMsgPill = $('newMsgPill'), newBelow = 0;
function placeNewPill() {
if (!newMsgPill || newMsgPill.classList.contains('hidden')) return;
var r = log.getBoundingClientRect();
newMsgPill.style.display = r.width ? '' : 'none'; // the log is hidden behind a full-screen panel -- keep the count, hide the pill
newMsgPill.style.top = (r.bottom - 34) + 'px'; newMsgPill.style.left = (r.left + r.width / 2) + 'px';
}
function bumpNewPill() {
if (!newMsgPill) return; newBelow++;
newMsgPill.textContent = newBelow + ' new message' + (newBelow === 1 ? '' : 's') + ' ↓';
newMsgPill.classList.remove('hidden'); placeNewPill();
}
function clearNewPill() { newBelow = 0; if (newMsgPill) newMsgPill.classList.add('hidden'); }
if (newMsgPill) {
newMsgPill.onclick = function () { log.scrollTop = log.scrollHeight; clearNewPill(); };
log.addEventListener('scroll', function () { if (newBelow && log.scrollHeight - log.scrollTop - log.clientHeight < 40) clearNewPill(); }, { passive: true });
window.addEventListener('resize', placeNewPill);
}
var lastMsgAt = null; // newest created_at seen -- catchUp() fetches anything after it
/* v155: a group line has no recipient_id -- it is addressed to the conversation -- so routing on
   recipient_id alone sent every one of them to the room renderer, where renderRoom had nothing to
   do with it and the group window stayed empty.
   The block check is skipped for a group on purpose: a block governs whispers and the room, and
   hiding a member's lines from one person only would give that person a different history of the
   same conversation, with replies answering messages they cannot see. */
function handleMessage(m) {
if (m.created_at && (!lastMsgAt || m.created_at > lastMsgAt)) lastMsgAt = m.created_at;
if (!m.conversation_id && blocked[m.sender_id]) return;
if (m.recipient_id || m.conversation_id) renderIM(m); else renderRoom(m);
}
/* v121: connection state. The realtime socket reconnects on its own (and the channel re-joins,
   which fires SUBSCRIBED again -- see channel.subscribe in join()), but nothing that happened
   while it was down ever arrives: those events are gone. So while the link is down a small
   "Reconnecting…" bar says so, and when it comes back everything is quietly re-read: messages
   newer than the last one seen (handleMessage dedupes by id), the four game tables, and my
   stats. The same catch-up runs when a phone comes back to the foreground after a long sleep,
   where iOS often freezes the socket without ever reporting it closed. */
var connBar = $('connBar'), connText = $('connText'), connDown = false, connHideTimer = null, hiddenSince = 0;
function showConnBar(text, ok) {
if (!connBar) return; clearTimeout(connHideTimer);
connText.textContent = text; connBar.classList.toggle('ok', !!ok); connBar.classList.add('show');
if (ok) connHideTimer = setTimeout(function () { connBar.classList.remove('show'); }, 1800);
}
function connLost(why) { if (!me || !channel || connDown) return; connDown = true; showConnBar(why || 'Reconnecting…'); }
function hideConnBar() { connDown = false; clearTimeout(connHideTimer); if (connBar) connBar.classList.remove('show'); }
async function catchUp(reason) {
if (!me || !sb) return;
try {
if (lastMsgAt) {
var r = await sb.from('messages').select('*').eq('room', C.ROOM || 'main').gt('created_at', lastMsgAt).order('created_at', { ascending: true }).limit(200);
if (!r.error && r.data) r.data.forEach(handleMessage);
}
await Promise.all([loadGames(), loadUno(), loadHangman(), loadHoldem(), loadBattleship(), refreshGroupNames(), loadGameRoom()]);
if (typeof refreshMyStats === 'function') refreshMyStats();
} catch (e) {}
}
function connBack() {
if (!connDown) return; connDown = false;
showConnBar('Back online', true);
catchUp('reconnect');
}
window.addEventListener('offline', function () { connLost('Offline — waiting for a connection…'); });
document.addEventListener('visibilitychange', function () {
if (document.hidden) { hiddenSince = Date.now(); return; }
if (me && hiddenSince && Date.now() - hiddenSince > 60000) catchUp('resume');
hiddenSince = 0;
});

/* ---------- reactions (main room messages + thread posts -- never whispers, see
   reactions_and_levels_feature.sql's header note on why) ----------
   reactions[type+':'+id] = { emoji -> Set<userId> }. Populated in bulk right after history/a
   thread loads (loadReactionsFor), then kept live purely by patching in place -- applyReactionRow
   updates the cache and re-renders just the one .reactions element for that target, never the
   whole message, whether the change came from this tab's own click or the realtime feed. */
var REACTION_SET = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '💯'];
var reactions = {};
function reactKey(type, id) { return type + ':' + id; }
function reactionCell(type, id) { var k = reactKey(type, id); return reactions[k] || (reactions[k] = {}); }
function applyReactionRow(row, added) {
var cell = reactionCell(row.target_type, row.target_id);
var set = cell[row.emoji] || (cell[row.emoji] = new Set());
if (added) set.add(row.user_id); else { set.delete(row.user_id); if (!set.size) delete cell[row.emoji]; }
paintReactions(row.target_type, row.target_id);
}
function reactionsHtml(type, id) {
var cell = reactions[reactKey(type, id)] || {};
var pills = Object.keys(cell).map(function (e) {
var set = cell[e], mine = !!(me && set.has(me.id));
return '<button type="button" class="react-pill' + (mine ? ' mine' : '') + '" data-emoji="' + esc(e) + '" title="' + set.size + ' reaction' + (set.size === 1 ? '' : 's') + '">' + e + ' <span>' + set.size + '</span></button>';
}).join('');
return '<span class="reactions" data-rtype="' + esc(type) + '" data-rid="' + id + '">' + pills + '</span>';
}
/* Every rendered .reactions span for this target gets replaced in one pass -- normally there's
   only ever one on screen at a time, but this stays correct even if that ever changes (e.g. the
   same thread post rendered in two places). */
function paintReactions(type, id) {
document.querySelectorAll('.reactions[data-rtype="' + type + '"][data-rid="' + id + '"]').forEach(function (el) { el.outerHTML = reactionsHtml(type, id); });
}
async function loadReactionsFor(type, ids) {
if (!ids || !ids.length) return;
var r = await sb.from('reactions').select('target_type, target_id, user_id, emoji').eq('target_type', type).in('target_id', ids);
if (r.error || !r.data) return;
r.data.forEach(function (row) { applyReactionRow(row, true); });
}
async function toggleReaction(type, id, emoji) {
var cell = reactionCell(type, id);
var mine = !!(cell[emoji] && me && cell[emoji].has(me.id));
if (mine) {
var del = await sb.from('reactions').delete().eq('target_type', type).eq('target_id', id).eq('user_id', me.id).eq('emoji', emoji);
if (!del.error) applyReactionRow({ target_type: type, target_id: id, user_id: me.id, emoji: emoji }, false);
} else {
var ins = await sb.from('reactions').insert({ target_type: type, target_id: id, user_id: me.id, emoji: emoji });
/* A duplicate-key error here just means another tab/click already landed the same reaction a
   moment ago -- the realtime INSERT event will paint it, so this isn't a real failure. */
if (!ins.error) applyReactionRow({ target_type: type, target_id: id, user_id: me.id, emoji: emoji }, true);
else if (!/duplicate|unique/i.test(ins.error.message || '')) addSys('Could not react: ' + ins.error.message);
}
}
/* Quick-pick popup -- same detached-div-appended-to-body, position-near-anchor pattern as .nmenu
   (openMenu) and the emoji/GIF pickers (positionPicker), just with its own small fixed emoji set
   rather than the full compose-box EMOJI list, since a reaction is a much quicker, lower-stakes
   pick than composing a message. */
var reactPicker = document.createElement('div'); reactPicker.className = 'rpicker'; document.body.appendChild(reactPicker);
var reactPickerTarget = null, replyAnchorEl = null;
/* Reply shares the long-press that already opens this picker, rather than getting a gesture of
   its own. One hold, then either react or reply -- a second gesture to learn (a swipe, say) for
   something this adjacent would be a worse trade than one extra button. It is styled apart from
   the emoji so it does not read as a tenth reaction. */
var replyBtn = document.createElement('button');
replyBtn.type = 'button'; replyBtn.className = 'rp-reply'; replyBtn.textContent = '\u21A9 Reply';
replyBtn.onclick = function () {
var t = reactPickerTarget, anchor = replyAnchorEl;
closeReactPicker();
if (!t || t.type !== 'message') return; // thread posts keep the column but have no UI yet
setReplyTarget(t.id, replyKeyFor(anchor));
};
reactPicker.appendChild(replyBtn);
REACTION_SET.forEach(function (e) {
var b = document.createElement('button'); b.type = 'button'; b.textContent = e;
b.onclick = function () { var t = reactPickerTarget; closeReactPicker(); if (t) toggleReaction(t.type, t.id, e); };
reactPicker.appendChild(b);
});
function closeReactPicker() { reactPicker.classList.remove('open'); reactPickerTarget = null; }

/* ---------- replying to a specific message (v145) ----------
   A reply is an ordinary message carrying the id of the one it answers -- never a copy of its
   text, so nobody can put words in somebody else's mouth by lying about what they replied to (see
   supabase/message_replies_feature.sql). The quote you see is always looked up from the real
   message, and whether you are allowed to see it at all is the select policy's decision, not this
   code's.

   replyTo is per conversation rather than global: the room has one, and every whisper window has
   its own, keyed by the other person's id. Picking a reply in one place must not quietly arm a
   reply in another -- that is how you answer the wrong person. */
var replyTo = {}; // 'room' or a peer id -> the message id being answered
function replyKeyFor(el) {
var win = el && el.closest && el.closest('.im');
return win && win.dataset.peer ? win.dataset.peer : 'room';
}
/* The stub drawn above a reply. Resolved from msgCache when the original is already on screen;
   otherwise left as a placeholder and filled in by fillReplyStub() once the fetch lands, so a
   reply to something scrolled far up does not block the message it belongs to from rendering. */
function replyStubHtml(rid) {
if (!rid) return '';
var m = msgCache[rid];
var inner = m
? '<b>' + esc(m.senderName) + '</b> ' + esc(String(m.body || '').slice(0, 90))
: '<span class="rq-load">…</span>';
return '<button type="button" class="rq" data-rq="' + rid + '">' + inner + '</button>';
}
var replyFetching = {};
async function fillReplyStub(rid) {
if (!rid || msgCache[rid] || replyFetching[rid] || !sb) return;
replyFetching[rid] = 1;
var r = await sb.from('messages').select('id, sender_id, sender_name, body, created_at').eq('id', rid).maybeSingle();
var m = (!r.error && r.data) ? r.data : null;
if (m) msgCache[m.id] = { senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at };
document.querySelectorAll('.rq[data-rq="' + rid + '"]').forEach(function (b) {
b.innerHTML = m ? '<b>' + esc(m.sender_name) + '</b> ' + esc(String(m.body || '').slice(0, 90))
: '<span class="rq-gone">message removed</span>';
});
}
/* Jump to the message a stub quotes, and mark it so the eye can find it. If it is not on screen at
   all -- older than the loaded history, or in a conversation that is not open -- say so rather than
   doing nothing, because a button that silently ignores you reads as broken. */
function jumpToMessage(rid, from) {
/* '.log, .ilog' -- the room's log and a whisper window's log are different classes, and matching
   only the first sent every jump inside a whisper hunting through the whole document instead of
   the conversation it was clicked in. */
var scope = (from && from.closest && from.closest('.log, .ilog')) || null;
var el = (scope && scope.querySelector('.m[data-mid="' + rid + '"]')) || document.querySelector('.m[data-mid="' + rid + '"]');
if (!el) { addSys('That message is further back than this window goes.'); return; }
/* Plain scrollTop, deliberately -- both of the obvious ways to do this turned out to be no-ops on
   this element, and each was measured rather than guessed:
     el.scrollIntoView({block:'center'})      -- target 632px above the log's top edge, scrollTop
                                                 unmoved. The log is a nested scroll container and
                                                 the browser goes looking at some ancestor instead.
     box.scrollTo({top, behavior:'smooth'})   -- correct target computed (1912 from 2790), scrollTop
                                                 still unmoved a second and a half later. Setting
                                                 box.scrollTop = 1912 on the very next line worked.
   So the arithmetic was never the problem; the animated setter is. Assigning scrollTop is the one
   form that actually moves this box. The jump is instant now, which for a "take me to it" action is
   arguably right anyway -- the flash below is what shows you where you landed. */
var box = scope || el.parentNode;
if (box && box.scrollHeight > box.clientHeight) {
var br = box.getBoundingClientRect(), er = el.getBoundingClientRect();
var top = box.scrollTop + (er.top - br.top) - (box.clientHeight - el.offsetHeight) / 2;
box.scrollTop = Math.max(0, Math.min(top, box.scrollHeight - box.clientHeight));
}
el.classList.remove('rq-flash'); void el.offsetWidth; el.classList.add('rq-flash');
setTimeout(function () { el.classList.remove('rq-flash'); }, 1600);
}
function setReplyTarget(rid, key) {
replyTo[key] = rid;
renderReplyBar(key);
var box = key === 'room' ? msg : (wins[key] && wins[key].ta);
if (box) box.focus();
}
function clearReplyTarget(key) { delete replyTo[key]; renderReplyBar(key); }
function renderReplyBar(key) {
var host = key === 'room' ? $('replyBar') : (wins[key] && wins[key].replyBar);
if (!host) return;
var rid = replyTo[key];
if (!rid) { host.classList.add('hidden'); host.innerHTML = ''; return; }
var m = msgCache[rid];
host.classList.remove('hidden');
host.innerHTML = '<span class="rb-icon" aria-hidden="true">\u21A9</span><span class="rb-txt">Replying to <b>' +
esc(m ? m.senderName : 'someone') + '</b>' + (m ? ' \u00B7 ' + esc(String(m.body || '').slice(0, 60)) : '') +
'</span><button type="button" class="rb-x" aria-label="Cancel reply">\u2715</button>';
}
function openReactPicker(type, id, anchorEl) {
var opening = !reactPicker.classList.contains('open') || !reactPickerTarget || reactPickerTarget.type !== type || reactPickerTarget.id !== id;
if (!opening) { closeReactPicker(); return; }
reactPickerTarget = { type: type, id: id };
replyAnchorEl = anchorEl;
reactPicker.classList.add('open');
positionPicker(reactPicker, anchorEl);
}
/* suppressClickUntil: a long-press (below) fires the picker from a timer/contextmenu, not a click --
   but the mouseup/touchend that ends the press still produces a real 'click' a moment later, which
   would otherwise reach this same-tick outside-click listener and instantly close what the press
   just opened. Anything that opens the picker via a press sets this a few hundred ms into the
   future; every click-based listener below bails out while it's still in effect. */
var suppressClickUntil = 0;
document.addEventListener('click', function (e) { if (Date.now() < suppressClickUntil || reactPicker.contains(e.target)) return; closeReactPicker(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeReactPicker(); });
/* One delegated listener rather than a handler per message: the room repaints constantly and
   whisper windows come and go, and re-binding on every render is how you end up with a hundred
   stale listeners on the same log. */
document.addEventListener('click', function (e) {
var x = e.target.closest && e.target.closest('.rb-x');
if (x) { var bar = x.closest('.reply-bar'); clearReplyTarget(bar && bar.id === 'replyBar' ? 'room' : replyKeyFor(bar)); return; }
var q = e.target.closest && e.target.closest('.rq');
if (q) { e.preventDefault(); e.stopPropagation(); jumpToMessage(Number(q.dataset.rq), q); }
});
/* Escape backs out of a reply as well as closing the picker -- the composer is where your hands
   already are, so reaching for the ✕ to undo a mis-tap is a detour. */
document.addEventListener('keydown', function (e) {
if (e.key !== 'Escape') return;
var el = document.activeElement;
var key = (el && el.id === 'msg') ? 'room' : replyKeyFor(el);
if (replyTo[key]) clearReplyTarget(key);
});

/* ---------- long-press (or right-click) a message to react ----------
   Replaces a permanent "+" control on every single message with the gesture chat apps actually use:
   tap-and-hold (touch), press-and-hold the mouse, or right-click, anywhere on the message bubble
   (outside its own interactive bits -- an existing reaction pill, the report flag, a delete button,
   a link/image) opens the same quick-pick popup used above. The message's own .reactions span --
   present even when empty, see reactionsHtml -- is reused as the anchor so the popup lands in the
   same spot a click on the old "+" used to put it. */
var LONG_PRESS_MS = 450, LONG_PRESS_SLOP = 10;
function attachLongPress(container, itemSelector, skipSelector) {
if (!container) return;
var timer = null, startX = 0, startY = 0, pressEl = null, fired = false;
function targetFor(e) {
var skip = skipSelector && e.target.closest(skipSelector); if (skip) return null;
return e.target.closest(itemSelector);
}
function fire(el) {
var rc = el.querySelector('.reactions'); if (!rc) return;
fired = true;
suppressClickUntil = Date.now() + 500;
if (navigator.vibrate) navigator.vibrate(10);
openReactPicker(rc.dataset.rtype, Number(rc.dataset.rid), rc);
}
/* v141: the picker used to vanish again if you held on past about a second. suppressClickUntil
   was armed when the picker OPENED, 450 ms into the press, and only covered the next 500 ms --
   but the click that has to be suppressed is not dispatched until you LET GO, which on a longer
   hold is well after that window has closed. So the stray click reached the outside-click
   listener and shut the picker the instant the finger came up. Re-arming the guard at release
   fixes it for a hold of any length, because the window now starts at the moment the only click
   it needs to swallow is actually generated. */
function endPress() {
if (fired) { suppressClickUntil = Date.now() + 400; fired = false; }
cancel();
}
function begin(x, y, el) {
cancel();
startX = x; startY = y; pressEl = el; pressEl.classList.add('pressing');
timer = setTimeout(function () { timer = null; pressEl.classList.remove('pressing'); fire(el); }, LONG_PRESS_MS);
}
function cancel() {
if (timer) { clearTimeout(timer); timer = null; }
if (pressEl) { pressEl.classList.remove('pressing'); pressEl = null; }
}
function moved(x, y) { return Math.abs(x - startX) > LONG_PRESS_SLOP || Math.abs(y - startY) > LONG_PRESS_SLOP; }
container.addEventListener('touchstart', function (e) { var el = targetFor(e); if (!el) return; var t = e.touches[0]; begin(t.clientX, t.clientY, el); }, { passive: true });
container.addEventListener('touchmove', function (e) { if (timer && moved(e.touches[0].clientX, e.touches[0].clientY)) cancel(); }, { passive: true });
container.addEventListener('touchend', endPress);
container.addEventListener('touchcancel', endPress);
container.addEventListener('mousedown', function (e) { if (e.button !== 0) return; var el = targetFor(e); if (!el) return; begin(e.clientX, e.clientY, el); });
container.addEventListener('mousemove', function (e) { if (timer && moved(e.clientX, e.clientY)) cancel(); });
container.addEventListener('mouseup', endPress);
container.addEventListener('mouseleave', endPress);
container.addEventListener('contextmenu', function (e) { var el = targetFor(e); if (!el) return; e.preventDefault(); cancel(); fire(el); });
}
var LONG_PRESS_SKIP = '.react-pill, .rpt-msg, .tp-del, a, button';
attachLongPress(log, '.m[data-mid]', LONG_PRESS_SKIP);
attachLongPress(tpPosts, '.tp-post[data-post-id]', LONG_PRESS_SKIP);

/* ---------- level badges ----------
   userStats is only ever written wholesale on join (loadUserStats) and patched per-user by the
   'user_stats' realtime subscription (see joinRoom) -- refreshLevelBadges finds every badge for
   that one user id (room log, thread posts, the online list) and updates it in place rather than
   re-rendering anything wholesale. The badge element is always emitted (see levelBadgeHtml) even
   for someone with no row yet, just left [hidden], so there's a stable node to reveal the moment
   their first reaction lands instead of having to splice new markup into an existing message.

   Ten-wide tiers, each a distinct color, plus a small icon for the top three so a high level reads
   at a glance without having to parse the number: 1-9 white, 10-19 dark blue, 20-29 purple, 30-39
   gold, 40-49 pink, 50-59 cyan, 60-69 neon green, 70-79 "legendary" orange, 80-89 a crescent moon,
   90-99 a full moon, 100+ a full gold moon -- the actual colors live in style.css as --lvl-t1..t11,
   this just decides which one applies. */
var LEVEL_TIERS = ['lvl-t1', 'lvl-t2', 'lvl-t3', 'lvl-t4', 'lvl-t5', 'lvl-t6', 'lvl-t7', 'lvl-t8', 'lvl-t9', 'lvl-t10', 'lvl-t11']
.map(function (cls, i) { return { cls: cls, icon: i === 8 ? '🌙' : (i >= 9 ? '🌕' : '') }; });
function levelTier(lvl) {
var i = Math.min(10, Math.floor(lvl / 10)); // 1-9->0, 10-19->1, ... 90-99->9, 100+->10 (capped)
return LEVEL_TIERS[i];
}
function levelBadgeHtml(id) {
var s = userStats[id];
var title = s ? xpTitle(s) : '';
var tier = levelTier(s ? s.level : 1);
return '<span class="lvl ' + tier.cls + '" data-lvl-for="' + esc(id) + '"' + (s ? '' : ' hidden') + ' title="' + esc(title) + '">' + (s ? (tier.icon + 'Lv' + s.level) : '') + '</span>';
}
function refreshLevelBadges(id) {
var s = userStats[id];
document.querySelectorAll('[data-lvl-for="' + id + '"]').forEach(function (el) {
if (s) { var tier = levelTier(s.level); el.hidden = false; el.className = 'lvl ' + tier.cls; el.textContent = tier.icon + 'Lv' + s.level; el.title = xpTitle(s); }
else { el.hidden = true; el.textContent = ''; el.title = ''; el.className = 'lvl'; }
});
renderPeople();
if (wins[id]) updateWinBanner(id);
}
/* "Level 3 — 14 XP (12 reactions, 2 from games)" */
function xpTitle(s) {
var xp = s.xp != null ? s.xp : (s.reactions_received || 0) + (s.game_points || 0);
return 'Level ' + s.level + ' — ' + xp + ' XP (' + (s.reactions_received || 0) + ' reaction' + (s.reactions_received === 1 ? '' : 's') + ', ' + (s.game_points || 0) + ' from games)' + (xpToNext(s) ? ' — ' + xpToNext(s) + ' XP to level ' + (s.level + 1) : '') + '. Tap for details.';
}
async function loadUserStats() {
var r = await sb.from('user_stats').select('user_id, reactions_received, game_points, xp, level');
if (r.error || !r.data) return;
userStats = {};
r.data.forEach(function (x) { userStats[x.user_id] = x; });
}

/* ---------- leaderboard ----------
   Top 20 by reactions_received, reachable by anyone (not admin-gated) from the "more options"
   popover. user_stats alone has no name/avatar -- those live in profiles, and only for people
   who are currently online is there already a live copy in people[] -- so this does one query
   against each: user_stats for the ranking, then profiles for just those ids' name/avatar_url,
   preferring the live people[] copy when someone happens to be online right now. Loads fresh
   every time the modal opens rather than staying subscribed -- a leaderboard doesn't need to
   reorder itself under someone's cursor the way the reports queue needs its badge to. */
var LB_MEDAL = ['🥇', '🥈', '🥉'];
function renderLeaderboard(rows, profById) {
if (!leaderboardList) return;
if (!rows.length) { leaderboardList.innerHTML = '<div class="empty">Nobody has earned a reaction yet — be the first.</div>'; return; }
leaderboardList.innerHTML = rows.map(function (x, i) {
var prof = profById[x.user_id] || {};
var live = people[x.user_id];
var name = (live && live.name) || prof.name || 'Unknown';
var avaUrl = (live && live.avatarUrl) || prof.avatar_url;
var ava = avaUrl ? '<img class="ava lb-ava" src="' + esc(avaUrl) + '" alt="" loading="lazy">' : '<span class="ava-fallback lb-ava" aria-hidden="true">' + esc(String(name).trim().charAt(0).toUpperCase() || '?') + '</span>';
var tier = levelTier(x.level);
var rank = i < 3 ? '<span class="lb-medal">' + LB_MEDAL[i] + '</span>' : '<span class="lb-rank">#' + (i + 1) + '</span>';
return '<div class="lb-row' + (i < 3 ? ' lb-top' : '') + '" data-id="' + esc(x.user_id) + '" data-name="' + esc(name) + '" tabindex="0">' + rank + ava +
'<span class="lb-name' + (isAdminId(x.user_id) ? ' admin' : '') + '">' + esc(name) + '</span>' +
'<span class="lvl ' + tier.cls + '">' + tier.icon + 'Lv' + x.level + '</span>' +
'<span class="lb-count" title="' + esc(xpTitle(x)) + '">' + (x.xp || 0).toLocaleString() + ' XP</span></div>';
}).join('');
}
async function loadLeaderboard() {
if (!leaderboardList) return;
leaderboardList.innerHTML = '<div class="empty">Loading…</div>';
var r = await sb.from('user_stats').select('user_id, level, reactions_received, game_points, xp').order('xp', { ascending: false }).limit(20);
if (r.error) { leaderboardList.innerHTML = '<div class="empty">Could not load the Popularity Contest: ' + esc(r.error.message) + '</div>'; return; }
var rows = (r.data || []).filter(function (x) { return (x.xp || 0) > 0; });
var profById = {};
if (rows.length) {
var pr = await sb.from('profiles').select('user_id, name, avatar_url').in('user_id', rows.map(function (x) { return x.user_id; }));
(pr.data || []).forEach(function (p) { profById[p.user_id] = p; });
}
renderLeaderboard(rows, profById);
}
/* ---------- the Tic-Tac-Toe ladder (v110) ----------
   Top players by wins (ties: fewer losses, then more draws) with their current win streak, from
   ttt_leaderboard() on the server -- game rows are only readable by their two players, so the
   ladder can't be counted in the browser. The W·L·D line in each whisper stays as it was. */
/* One renderer for both game ladders: rows come from ttt_leaderboard() / uno_leaderboard(), the
   `count` callback formats the record column (W·L·D for Tic-Tac-Toe, W·L for UNO). */
function renderGameLadder(list, rows, profById, empty, count) {
if (!list) return;
if (!rows.length) { list.innerHTML = '<div class="empty">' + empty + '</div>'; return; }
list.innerHTML = rows.map(function (x, i) {
var prof = profById[x.user_id] || {};
var live = people[x.user_id];
var name = (live && live.name) || prof.name || 'Unknown';
var avaUrl = (live && live.avatarUrl) || prof.avatar_url;
var ava = avaUrl ? '<img class="ava lb-ava" src="' + esc(avaUrl) + '" alt="" loading="lazy">' : '<span class="ava-fallback lb-ava" aria-hidden="true">' + esc(String(name).trim().charAt(0).toUpperCase() || '?') + '</span>';
var st = userStats[x.user_id]; var lvl = st ? '<span class="lvl ' + levelTier(st.level).cls + '">' + levelTier(st.level).icon + 'Lv' + st.level + '</span>' : '';
var rank = i < 3 ? '<span class="lb-medal">' + LB_MEDAL[i] + '</span>' : '<span class="lb-rank">#' + (i + 1) + '</span>';
var pct = x.played ? Math.round(100 * x.wins / x.played) : 0;
var streak = x.streak >= 2 ? '<span class="lb-streak" title="' + x.streak + ' wins in a row">🔥' + x.streak + '</span>' : '';
return '<div class="lb-row' + (i < 3 ? ' lb-top' : '') + '" data-id="' + esc(x.user_id) + '" data-name="' + esc(name) + '" tabindex="0">' + rank + ava +
'<span class="lb-name' + (isAdminId(x.user_id) ? ' admin' : '') + '">' + esc(name) + '</span>' + lvl + streak +
'<span class="lb-count" title="' + x.played + ' game' + (x.played === 1 ? '' : 's') + ', ' + pct + '% won">' + count(x) + '</span></div>';
}).join('');
}
async function loadGameLadder(list, fn, empty, count) {
if (!list) return;
list.innerHTML = '<div class="empty">Loading…</div>';
var r = await sb.rpc(fn, { p_limit: 20 });
if (r.error) { list.innerHTML = '<div class="empty">Could not load the ladder: ' + esc(r.error.message) + '</div>'; return; }
var rows = r.data || [];
var profById = {};
if (rows.length) {
var pr = await sb.from('profiles').select('user_id, name, avatar_url').in('user_id', rows.map(function (x) { return x.user_id; }));
(pr.data || []).forEach(function (p) { profById[p.user_id] = p; });
}
renderGameLadder(list, rows, profById, empty, count);
}
function loadTttLeaderboard() { return loadGameLadder(tttLeaderboardList, 'ttt_leaderboard', 'No Tic-Tac-Toe games finished yet — open a whisper, tap 🎲 and pick Tic-Tac-Toe. Winner gets 3 XP.', function (x) { return x.wins + 'W · ' + x.losses + 'L · ' + x.draws + 'D'; }); }
function loadUnoLeaderboard() { return loadGameLadder(unoLeaderboardList, 'uno_leaderboard', 'No UNO games finished yet — open a whisper, tap 🎲 and pick UNO.', function (x) { return x.wins + 'W · ' + x.losses + 'L'; }); }
function loadHmLeaderboard() { return loadGameLadder(hmLeaderboardList, 'hangman_leaderboard', 'No Hangman games finished yet — open a whisper, tap 🎲 and pick Hangman.', function (x) { return x.wins + 'W · ' + x.losses + 'L'; }); }
function loadHdLeaderboard() { return loadGameLadder(hdLeaderboardList, 'holdem_leaderboard', 'Nobody has cashed out of a Hold’em table yet — open a whisper, tap 🎲, pick Texas Hold’em and choose your stakes.', function (x) { return x.wins + 'W · ' + x.losses + 'L · ' + (x.net >= 0 ? '+' : '') + x.net + ' XP'; }); }
function loadPrLeaderboard() { return loadGameLadder(prLeaderboardList, 'prasta_leaderboard', 'No hands of Prasta yet — open a whisper, tap 🎲, pick Prasta and name a stake.', function (x) { return x.wins + 'W · ' + x.losses + 'L · ' + (x.net >= 0 ? '+' : '') + x.net + ' XP'; }); }
function loadBsLeaderboard() { return loadGameLadder(bsLeaderboardList, 'battleship_leaderboard', 'No Battleship games finished yet — open a whisper, tap 🎲 and pick Battleship. A win is worth 10 XP, a loss 3.', function (x) { return x.wins + 'W · ' + x.losses + 'L'; }); }
var LB_TABS = [['xp', function () { return lbTabXp; }, function () { return leaderboardList; }, function () { loadLeaderboard(); }],
['ttt', function () { return lbTabTtt; }, function () { return tttLeaderboardList; }, loadTttLeaderboard],
['uno', function () { return lbTabUno; }, function () { return unoLeaderboardList; }, loadUnoLeaderboard],
['hm', function () { return lbTabHm; }, function () { return hmLeaderboardList; }, loadHmLeaderboard],
['hd', function () { return lbTabHd; }, function () { return hdLeaderboardList; }, loadHdLeaderboard],
['pr', function () { return lbTabPr; }, function () { return prLeaderboardList; }, loadPrLeaderboard],
['bs', function () { return lbTabBs; }, function () { return bsLeaderboardList; }, loadBsLeaderboard]];
function showLeaderboardTab(which) {
if (!LB_TABS.some(function (t) { return t[0] === which; })) which = 'xp';
LB_TABS.forEach(function (t) {
var on = t[0] === which, tab = t[1](), list = t[2]();
if (tab) { tab.classList.toggle('active', on); tab.setAttribute('aria-selected', on ? 'true' : 'false'); }
if (list) list.classList.toggle('hidden', !on);
if (on) t[3]();
});
}
function activeLeaderboardTab() { var hit = LB_TABS.filter(function (t) { var tab = t[1](); return tab && tab.classList.contains('active'); })[0]; return hit ? hit[0] : 'xp'; }
LB_TABS.forEach(function (t) { var tab = t[1](); if (tab) tab.onclick = function () { showLeaderboardTab(t[0]); }; });
[leaderboardList, tttLeaderboardList, unoLeaderboardList, hmLeaderboardList, hdLeaderboardList, prLeaderboardList, bsLeaderboardList].forEach(function (list) { // v167: + Prasta (tapping a Prasta row did nothing) and Battleship
if (!list) return;
/* Tapping a row opens the same Get Info / Whisper / Block / ... menu as tapping their name
   anywhere else, rather than the leaderboard being a dead-end list. The panel sits at z-index 40,
   well below .nmenu's 60, so no rect-capture workaround is needed here the way the old modal
   overlay (z-index 70) required. */
list.addEventListener('click', function (e) {
var row = e.target.closest('.lb-row[data-id]'); if (!row || row.dataset.id === me.id) return;
/* Without this, the same click that opens the menu also bubbles up to the document-level
   "click outside closes the menu" listener (see openMenu below), which would strip the 'open'
   class in the same tick and make the menu flash open and shut. ulist/flist do the same. */
e.stopPropagation();
openMenu(row.dataset.id, row, row.dataset.name);
});
list.addEventListener('keydown', function (e) {
if (e.key !== 'Enter' && e.key !== ' ') return;
var row = e.target.closest('.lb-row[data-id]'); if (!row) return;
e.preventDefault(); row.click();
});
});

/* ---------- presence list ---------- */
function renderPeople() {
var ids = Object.keys(people).sort(function (a, b) { return people[a].name.localeCompare(people[b].name); });
ulist.innerHTML = ids.map(function (id) {
var p = people[id], isSelf = id === me.id, status = p.status || 'online';
var showStatus = !isSelf && !blocked[id] && status !== 'online';
var classes = [isSelf ? 'self' : (blocked[id] ? 'blocked' : (unread[id] ? 'unread' : ''))];
if (isAdminId(id)) classes.push('admin');
if (showStatus) classes.push('st-' + status);
var tag = showStatus ? ' <span class="stag">(' + status + ')</span>' : '';
var title = (status === 'away' && p.awayMsg) ? ' title="' + esc(p.awayMsg) + '"' : '';
return '<div class="' + classes.join(' ').trim() + '" tabindex="' + (isSelf ? -1 : 0) + '" data-id="' + esc(id) + '"' + title + '>' + avatarHtml(id, p.name) + '<span class="nmt">' + esc(p.name) + '</span>' + levelBadgeHtml(id) + tag + '</div>';
}).join('');
/* The online count used to live in the icon-heavy status bar up top; it now lives in the main
   chat's own footer line (directly below that bar), alongside the watermark -- threads and
   roulette have their own separate watermark footers (threadsWatermark/rouletteWatermark) that
   intentionally don't get an online count, since that count is specific to who's in the room. */
if ($('roomWatermark')) $('roomWatermark').textContent = ids.length + ' online · ' + WATERMARK_TEXT;
/* Same count again in the panel's own "Online" bar -- shown only when the panel is stacked
   under the log on a phone (.ucount is display:none otherwise, see style.css), where that bar
   is usually all of the panel that's visible, folded as it starts out there. */
if ($('ucount')) $('ucount').textContent = '· ' + ids.length;
/* "here" for whisper-delivery purposes uses the same recently-seen pool as @mention push (see
   recentPeopleEntries above): a phone that dropped its realtime connection a moment ago is still
   reachable, not gone, right up until the same 30-minute window the server itself uses to kick a
   truly-idle connection (IDLE_DISCONNECT_MS). Without this, sendIM's w.gone guard would silently
   refuse to deliver a whisper to someone who never actually left. */
var reachablePool = recentPeopleEntries();
Object.keys(wins).forEach(function (id) {
if (isGroupKey(id)) return; // v155: a group does not come and go, and its name is not a person's
var w = wins[id], here = !!(people[id] || reachablePool[id]);
if (!here && !w.gone) { w.gone = true; imSys(id, w.name + ' has left the room.'); }
if (here && w.gone) { w.gone = false; imSys(id, w.name + ' is back.'); }
});
renderFriends();
}
/* buddy list: shows everyone you've added, grouped, online (bright, live name + status) or offline
   (dim, last-known name) regardless of who's currently in the room — kept in sync with `people`
   on every presence change since renderPeople() calls this each time. */
function renderFriends() {
if (!flist) return;
var ids = Object.keys(friends);
if (!ids.length) { flist.innerHTML = '<div class="empty">No friends yet.<br><small>Tap a name in the Online list (or in the chat) and choose <b>Add friend</b>. Friends can whisper you even when whispers are set to friends-only, and you’ll see when they’re online.</small></div>'; return; }
var groups = {};
ids.forEach(function (id) { var g = friends[id].group || 'Friends'; (groups[g] = groups[g] || []).push(id); });
var groupNames = Object.keys(groups).sort(function (a, b) { if (a === 'Friends') return -1; if (b === 'Friends') return 1; return a.localeCompare(b); });
flist.innerHTML = groupNames.map(function (g) {
var members = groups[g].sort(function (a, b) {
var na = people[a] ? people[a].name : friends[a].name, nb = people[b] ? people[b].name : friends[b].name;
return na.localeCompare(nb);
});
var rows = members.map(function (id) {
var p = people[id], online = !!p, status = online ? (p.status || 'online') : null;
var label = online ? p.name : friends[id].name;
var cls = (online ? ('f-' + status) : 'f-offline') + (isAdminId(id) ? ' admin' : '');
var suffix = online ? (status !== 'online' ? ' <span class="off">(' + status + ')</span>' : '') : ' <span class="off">(offline)</span>';
return '<div class="' + cls + '" tabindex="0" data-id="' + esc(id) + '">' + avatarHtml(id, label) + '<span class="nmt">' + esc(label) + '</span>' + suffix + '</div>';
}).join('');
return '<div class="fg-hd">' + esc(g) + '</div>' + rows;
}).join('');
}
function nameTaken(n) { return Object.keys(people).some(function (id) { return id !== me.id && people[id].name.toLowerCase() === n.toLowerCase(); }); }

/* ---------- whisper conversations (keyed by user id) ----------
   A conversation is never forced open on its own — history replay on login and any incoming
   message while it's closed just update its row in the dock's inbox (and the bar's badge)
   instead of popping the panel open over the room. Only a deliberate action (tapping a name >
   Whisper, /w, or tapping its inbox row) opens it. */
/* ---------- the Messages dock ----------
   v96: whispers moved out of separate draggable/resizable windows (plus a tray of minimized tabs)
   into ONE panel anchored at the bottom-right corner, Instagram-web style -- see #dmDock in
   index.html. dockOpen is whether the panel is expanded at all; activeDm is which conversation
   is showing inside it (null = the inbox list). Every wins[id] still has its own .im element
   (the conversation view) and its own .im-tab (now an inbox row); syncDock() is the single place
   that turns those two variables into what's on screen, including each window's `minimized`
   flag, which the rest of the whisper code (unread counting, buzz, the DM-hide toggle) reads. */
var dmDock = $('dmDock'), dmBar = $('dmBar'), dmBarBadge = $('dmBarBadge'), dmEmpty = $('dmEmpty');
var dockOpen = false, activeDm = null;
try { dockOpen = localStorage.getItem('gc_dm_dock_open') === '1'; } catch (e) {}
function saveDockOpen() { try { localStorage.setItem('gc_dm_dock_open', dockOpen ? '1' : '0'); } catch (e) {} }
function syncDock() {
if (!dmDock) return;
var ids = Object.keys(wins);
if (activeDm && !wins[activeDm]) activeDm = null;
var inThread = dockOpen && !!activeDm;
dmDock.classList.toggle('collapsed', !dockOpen);
dmDock.classList.toggle('thread', inThread);
if (gcRoot) gcRoot.classList.toggle('dm-open', dockOpen); // style.css moves/hides the floating bubbles out of the expanded panel's way
if (gcRoot) gcRoot.classList.toggle('dm-thread', inThread); // v168: an open conversation is a bigger panel (style.css), so the bubble steps further left
var total = 0;
ids.forEach(function (id) {
var w = wins[id], shown = inThread && id === activeDm;
w.el.classList.toggle('hidden', !shown);
w.minimized = !shown;
if (w.tab) w.tab.classList.toggle('active', id === activeDm);
total += unread[id] || 0;
});
total += pendingRequestCount(); // friend requests waiting in the inbox count on the bar too
if (dmBarBadge) { dmBarBadge.textContent = total > 9 ? '9+' : String(total); dmBarBadge.classList.toggle('hidden', !total); }
if (dmBar) dmBar.setAttribute('aria-expanded', dockOpen ? 'true' : 'false');
if (dmEmpty) dmEmpty.classList.toggle('hidden', ids.length > 0 || pendingRequestCount() > 0);
applyDmVisibility();
if (typeof applyPill === 'function') applyPill();
}
function toggleDock() { dockOpen = !dockOpen; saveDockOpen(); syncDock(); }
function showInbox() { activeDm = null; syncDock(); }
if (dmBar) {
dmBar.onclick = function () {
if (pillMoved) { pillMoved = false; return; } // a drag's trailing click doesn't toggle
if (pillPos && pillPos.docked && pillActive()) { pillPos = clampPill(pillPos.x, pillPos.y); applyPill(); savePill(); return; } // swept aside: a tap brings it back, nothing more
toggleDock();
};
dmBar.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDock(); } };
}
/* ---------- the collapsed pill is draggable on a phone ----------
   Below 500px the collapsed dock is a small pill floating over the chat; drag it by its bar to
   wherever it's least in the way. The spot is kept as two CSS variables on the dock plus a .moved
   class (style.css: .dm-dock.collapsed.moved uses them for left/top), so the expanded, full-screen
   layout is untouched -- expand and the pill's position simply stops applying until it collapses
   again. Remembered per browser (gc_dm_pill). A press that doesn't travel 6px is a tap and toggles
   the dock as ever; a real drag swallows the click that follows it (pillMoved, above). */
var pillMoved = false, pillPos = null;
var PILL_TAB = 16, PILL_DOCK_FRACTION = 0.55;
function pillActive() { return window.innerWidth <= 500; }
/* v153: pillSize() measures the PILL, never the expanded panel. syncDock() ends by calling
   applyPill() on every sync -- including the syncs that happen while a whisper is open, which is
   most of them -- and the old version measured whatever the dock was at that moment. Open a
   whisper on a phone and that is a 402x840 box, so clampPill's "keep it on screen" arithmetic
   (innerWidth - w - 4, innerHeight - h - 4) collapsed to roughly (8, 52) and rewrote the pill's
   position to the top-left corner. On an iPhone that corner is under Safari's address bar -- the
   same strip build 116 had to clear for the panel headers -- so the pill was neither visible nor
   tappable, and it happened every single time a whisper was opened and minimised again. */
var lastPillSize = { w: 127, h: 36 };
function pillSize() {
if (dmDock && dmDock.classList.contains('collapsed')) {
var r = dmDock.getBoundingClientRect();
if (r.width > 1 && r.height > 1) lastPillSize = { w: r.width, h: r.height };
}
return lastPillSize;
}
/* Taps in iOS Safari's top strip don't reach the page, so the pill is never allowed to settle
   there however the numbers come out. */
function pillTopMin() { return document.documentElement.classList.contains('ios') ? 56 : 4; }
/* visualViewport is what is actually on screen once iOS's bars are counted; innerHeight includes
   the part hidden behind them, which is how a pill can be placed somewhere you cannot see. */
function pillViewport() {
var vv = window.visualViewport;
return { w: (vv && vv.width) || window.innerWidth, h: (vv && vv.height) || window.innerHeight };
}
function clampPill(x, y) {
var sz = pillSize(), vp = pillViewport(), top = pillTopMin();
return { x: Math.max(4, Math.min(vp.w - sz.w - 4, x)), y: Math.max(top, Math.min(vp.h - sz.h - 4, y)) };
}
/* pillPos: { x, y } for a free-floating pill, plus docked:'left'|'right' when it's been swept
   to an edge -- then only PILL_TAB px of it peek in (like the threads/roulette bubbles) and x/y
   remember where it floated before, for when it's tapped back out. */
function applyPill() {
if (!dmDock) return;
/* v153: there is no pill on screen while the panel is open, so there is nothing to place -- and
   running the geometry here against the open panel is exactly what used to lose it. */
if (dockOpen && pillActive()) return;
if (!pillPos || !pillActive()) { dmDock.classList.remove('moved', 'pill-docked'); return; }
var sz = pillSize(), c = clampPill(pillPos.x, pillPos.y), x = c.x;
if (pillPos.docked === 'left') x = -(sz.w - PILL_TAB);
else if (pillPos.docked === 'right') x = pillViewport().w - PILL_TAB;
dmDock.style.setProperty('--pill-x', x + 'px'); dmDock.style.setProperty('--pill-y', c.y + 'px');
dmDock.classList.add('moved');
dmDock.classList.toggle('pill-docked', !!pillPos.docked);
if (dmBar) dmBar.setAttribute('aria-label', pillPos.docked ? 'Bring back Messages' : 'Messages');
}
function savePill() { try { localStorage.setItem('gc_dm_pill', JSON.stringify(pillPos)); } catch (e) {} }
try { var savedPill = JSON.parse(localStorage.getItem('gc_dm_pill') || 'null'); if (savedPill && typeof savedPill.x === 'number') pillPos = savedPill; } catch (e) {}
applyPill();
window.addEventListener('resize', applyPill);
if (dmBar) (function () {
var startX = 0, startY = 0, originX = 0, originY = 0, dragging = false, pid = null;
dmBar.addEventListener('pointerdown', function (e) {
if (!pillActive() || dockOpen || e.isPrimary === false) return;
var r = dmDock.getBoundingClientRect();
startX = e.clientX; startY = e.clientY; originX = r.left; originY = r.top;
dragging = true; pid = e.pointerId;
try { dmBar.setPointerCapture(pid); } catch (err) {}
});
dmBar.addEventListener('pointermove', function (e) {
if (!dragging || e.pointerId !== pid) return;
var dx = e.clientX - startX, dy = e.clientY - startY;
if (!pillMoved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
pillMoved = true; e.preventDefault();
/* while the finger's down the pill may run past either edge (that's the sweep); it settles on release */
var sz = pillSize();
var x = Math.max(-sz.w, Math.min(window.innerWidth, originX + dx)), y = Math.max(4, Math.min(window.innerHeight - sz.h - 4, originY + dy));
dmDock.style.setProperty('--pill-x', x + 'px'); dmDock.style.setProperty('--pill-y', y + 'px');
dmDock.classList.add('moved', 'pill-dragging'); dmDock.classList.remove('pill-docked');
});
function end(e) {
if (!dragging || (e && e.pointerId !== pid)) return;
dragging = false;
try { dmBar.releasePointerCapture(pid); } catch (err) {}
dmDock.classList.remove('pill-dragging');
if (!pillMoved) return;
var r = dmDock.getBoundingClientRect(), sz = pillSize();
var prevFree = pillPos && !pillPos.docked ? pillPos : null;
if (r.left <= -(sz.w * PILL_DOCK_FRACTION)) pillPos = { x: prevFree ? prevFree.x : 4, y: r.top, docked: 'left' };
else if (r.right >= window.innerWidth + sz.w * PILL_DOCK_FRACTION) pillPos = { x: prevFree ? prevFree.x : window.innerWidth - sz.w - 4, y: r.top, docked: 'right' };
else pillPos = clampPill(r.left, r.top);
applyPill(); savePill();
}
dmBar.addEventListener('pointerup', end);
dmBar.addEventListener('pointercancel', end);
})();
var lastBuzz = {};
/* ==================== group chats (v154) ====================
   Groups are a PARALLEL path to whispers, not a replacement. A message carries either a
   recipient_id (a whisper, exactly as before) or a conversation_id (a group), never both, so
   none of the pairwise machinery below -- can_whisper, has_blocked, dm_reads, the pair-named
   voice-note folders -- had to be touched or migrated.

   The one piece of shared plumbing is wins{}: a group's window lives there under the key
   'g<id>' instead of a peer's uuid, so the dock, the inbox rows, unread counting and the
   day dividers all work on a group without knowing what a group is. Anything that genuinely
   needs to tell them apart asks isGroupKey(). */
var GROUP_MAX = 8;
var myGroups = {};            // conversation id -> { id, title, members: [{ user_id, member_name }] }
function isGroupKey(k) { return typeof k === 'string' && k.charAt(0) === 'g' && /^g\d+$/.test(k); }
function groupKey(cid) { return 'g' + cid; }
function groupIdOf(key) { return isGroupKey(key) ? Number(key.slice(1)) : null; }
function liveMembers(g) { return (g && g.members || []).filter(function (m) { return !m.left_at; }); }
/* v161: one answer to "what is this member called", used everywhere a group shows a name. Live
   presence first, then the name they go by NOW (profile_name, read from profiles in loadMyGroups --
   member_name is only the name they had on the day they were added), then that old name. */
function memberDisplayName(m) {
return (people[m.user_id] && people[m.user_id].name) || m.profile_name || m.member_name || '(no name)';
}
/* A group with no name of its own is called after the people in it -- the same thing every
   messenger does, and better than "Group 14" because the useful information is who is in it. */
function groupTitleFor(cid) {
var g = myGroups[cid]; if (!g) return 'Group';
if (g.title) return g.title;
var others = liveMembers(g).filter(function (m) { return m.user_id !== me.id; }).map(memberDisplayName);
if (!others.length) return 'Group';
if (others.length <= 3) return others.join(', ');
return others.slice(0, 2).join(', ') + ' and ' + (others.length - 2) + ' more';
}
async function loadMyGroups() {
if (!sb || !me) return;
var r = await sb.from('conversation_members').select('conversation_id, user_id, member_name, left_at, conversations(id, title, closed_at)');
if (r.error) { return; }
myGroups = {};
(r.data || []).forEach(function (row) {
var c = row.conversations; if (!c || c.closed_at) return;
if (!myGroups[c.id]) myGroups[c.id] = { id: c.id, title: c.title, members: [] };
myGroups[c.id].members.push({ user_id: row.user_id, member_name: row.member_name, left_at: row.left_at });
});
/* Only groups I am still in. A row for a group I left comes back too (my own row is still
   there, with left_at set) and must not turn into a window. */
Object.keys(myGroups).forEach(function (cid) {
var mine = myGroups[cid].members.filter(function (m) { return m.user_id === me.id && !m.left_at; });
if (!mine.length) delete myGroups[cid];
});
/* v161: the names people go by now. member_name is frozen on the day someone was added, so a
   member who has since changed their character name kept the old one in every title, and an
   account with no name at all came out as "someone". */
var memberIds = {};
Object.keys(myGroups).forEach(function (cid) { myGroups[cid].members.forEach(function (m) { memberIds[m.user_id] = 1; }); });
if (Object.keys(memberIds).length) {
var pr = await sb.from('profiles').select('user_id, name').in('user_id', Object.keys(memberIds));
if (!pr.error && pr.data) {
var nowCalled = {}; pr.data.forEach(function (x) { nowCalled[x.user_id] = x.name; });
Object.keys(myGroups).forEach(function (cid) { myGroups[cid].members.forEach(function (m) { m.profile_name = nowCalled[m.user_id] || null; }); });
}
}
Object.keys(myGroups).forEach(function (cid) { ensureWin(groupKey(cid), groupTitleFor(cid), true); });
Object.keys(myGroups).forEach(function (cid) { updateTab(groupKey(cid)); updateWinBanner(groupKey(cid)); });
}
/* ---- creating one ---------------------------------------------------------------------- */
/* pickPeople is pickPerson's multiple-choice sibling: same list, same rows, but tapping a row
   toggles it and the modal stays open until Done. */
var multiPickOverlay = null;
function pickPeople(title, max, exclude) {
return new Promise(function (resolve) {
/* exclude (v162): ids not to offer at all -- "Add to this group" listed the people already in it. */
var list = shareableTargets().filter(function (x) { return !(exclude && exclude[x.id]); }), chosen = {};
if (!multiPickOverlay) {
multiPickOverlay = document.createElement('div');
multiPickOverlay.className = 'modal-overlay hidden';
multiPickOverlay.innerHTML = '<div class="modal pick-modal" role="dialog" aria-modal="true">' +
'<div class="modal-hd"></div><div class="pick-list"></div>' +
'<div class="pick-actions"><button class="btn pick-cancel" type="button">Cancel</button>' +
'<button class="btn pick-done" type="button">Done</button></div></div>';
document.body.appendChild(multiPickOverlay);
}
var hd = multiPickOverlay.querySelector('.modal-hd');
var box = multiPickOverlay.querySelector('.pick-list');
var done = multiPickOverlay.querySelector('.pick-done');
function count() { return Object.keys(chosen).length; }
function paint() {
done.textContent = count() ? 'Done (' + count() + ')' : 'Done';
done.disabled = !count();
[].forEach.call(box.querySelectorAll('.pick-row'), function (row) {
row.classList.toggle('picked', !!chosen[row.dataset.id]);
});
}
hd.textContent = title;
if (!list.length) {
box.innerHTML = '<div class="pick-empty">Nobody to add yet. Make a friend first.</div>';
} else {
box.innerHTML = list.map(function (p) {
return '<button type="button" class="pick-row" data-id="' + esc(p.id) + '">' +
avatarHtml(p.id, p.name) +
'<span class="pick-nm' + (isAdminId(p.id) ? ' admin' : '') + '">' + esc(p.name) + '</span>' +
(p.friend ? '<span class="pick-tag">friend</span>' : '') +
(p.online ? '<span class="pick-dot" title="online"></span>' : '') +
'<span class="pick-check" aria-hidden="true">✓</span></button>';
}).join('');
}
function close(v) { multiPickOverlay.classList.add('hidden'); resolve(v); }
/* v161: an account with no character name -- usually an old anonymous login whose name has since
   been claimed from another device -- cannot be added (gc_create_group and gc_add_to_group refuse
   it), so it is not offered. The list shows at once and this thins it a moment later. The token
   stops a slow answer for an earlier opening of the picker from pruning a later one.
   v162: "no character name" includes a profiles row whose name claim_name() emptied -- v161 only
   dropped accounts with no row at all, so the old "Steve miller" login was still offered. The same
   answer also puts each row's CURRENT name on it: the friends list keeps the name someone had when
   the friendship was made, so a friend who has renamed since showed up under the old one. */
var pickToken = {}; multiPickOverlay._token = pickToken;
if (list.length) {
sb.from('profiles').select('user_id, name').in('user_id', list.map(function (x) { return x.id; })).then(function (r) {
if (r.error || !r.data || multiPickOverlay._token !== pickToken) return;
var named = {}; r.data.forEach(function (x) { if (x.name) named[x.user_id] = x.name; });
[].forEach.call(box.querySelectorAll('.pick-row'), function (row) {
if (!named[row.dataset.id]) { delete chosen[row.dataset.id]; row.parentNode.removeChild(row); return; }
var nmEl = row.querySelector('.pick-nm');
if (nmEl && nmEl.textContent !== named[row.dataset.id]) nmEl.textContent = named[row.dataset.id];
});
if (!box.querySelector('.pick-row')) box.innerHTML = '<div class="pick-empty">Nobody to add yet. Make a friend first.</div>';
paint();
});
}
box.onclick = function (e) {
var row = e.target.closest('.pick-row'); if (!row) return;
var id = row.dataset.id;
if (chosen[id]) delete chosen[id];
else {
if (count() >= (max || GROUP_MAX - 1)) { return; }
chosen[id] = 1;
}
paint();
};
multiPickOverlay.querySelector('.pick-cancel').onclick = function () { close(null); };
done.onclick = function () { close(Object.keys(chosen)); };
multiPickOverlay.classList.remove('hidden');
paint();
});
}
async function startGroup(seedId) {
if (!me) return;
var picked = await pickPeople('Start a group with…', GROUP_MAX - 1);
if (!picked || !picked.length) return;
if (seedId && picked.indexOf(seedId) < 0 && picked.length < GROUP_MAX - 1) picked.push(seedId);
var r = await sb.rpc('gc_create_group', { p_title: null, p_members: picked });
if (r.error) { addSys(groupErrorText(r.error)); return; }
var cid = r.data;
await loadMyGroups();
openIM(groupKey(cid), groupTitleFor(cid), true);
imSys(groupKey(cid), 'You started this group. Anyone in it can add someone else (up to ' + GROUP_MAX + ') or give it a name: tap \uD83D\uDC65.');
}
/* The database speaks in its own words when it refuses; these are the ones worth translating. */
function groupErrorText(err) {
var m = (err && err.message) || '';
if (/holds 8 people/.test(m)) return 'A group holds ' + GROUP_MAX + ' people.';
if (/could only add people you could whisper|only add people you could whisper/.test(m)) return 'You can only add people you could whisper.';
if (/character name/.test(m)) return 'You need a character name before you can start a group.';
if (/at least one person/.test(m)) return 'Pick at least one person.';
return m || 'That did not work.';
}
/* ---- the member sheet: who is in it, add, leave ----------------------------------------- */
/* Reuses the same .nmenu element the name menu uses, so a group's menu looks and behaves like
   every other menu in the app rather than becoming a second kind of popup. */
function showListMenu(anchor, headerText, items) {
menu.innerHTML = '<div class="hd"><span class="hd-name">' + esc(headerText) + '</span></div>' +
items.map(function (it, i) { return '<button type="button" role="menuitem" class="' + (it[2] || '') + '" data-i="' + i + '">' + esc(it[0]) + '</button>'; }).join('');
menu.querySelectorAll('button').forEach(function (b) { b.onclick = function () { closeMenu(); items[+b.dataset.i][1](); }; });
menu.classList.add('open');
var r = anchor.getBoundingClientRect();
menu.style.top = Math.max(4, Math.min(r.bottom + 2, window.innerHeight - menu.offsetHeight - 4)) + 'px';
menu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4)) + 'px';
var first = menu.querySelector('button'); if (first) first.focus();
}
function openGroupMembers(cid, anchor) {
var g = myGroups[cid]; if (!g) return;
var live = liveMembers(g);
var items = live.map(function (m) {
var nm = memberDisplayName(m);
return [nm + (m.user_id === me.id ? ' (you)' : ''), function () {
if (m.user_id !== me.id && anchor) openMenu(m.user_id, anchor, nm);
}];
});
items.push([g.title ? '\u270E Rename this group' : '\u270E Name this group', function () { nameGroup(cid); }]); // v159
if (live.length < GROUP_MAX) items.push(['\uff0b Add someone', function () { addToGroup(cid); }]);
items.push(['Leave this group', function () { leaveGroup(cid); }, 'danger']);
showListMenu(anchor, live.length + ' of ' + GROUP_MAX + ' in this group', items);
}
async function addToGroup(cid) {
var g = myGroups[cid]; if (!g) return;
if (liveMembers(g).length >= GROUP_MAX) { imSys(groupKey(cid), 'A group holds ' + GROUP_MAX + ' people.'); return; }
var already = {};
liveMembers(g).forEach(function (m) { already[m.user_id] = 1; });
var picked = await pickPeople('Add to this group…', GROUP_MAX - liveMembers(g).length, already);
if (!picked || !picked.length) return;
var added = 0, failed = null;
for (var i = 0; i < picked.length; i++) {
if (already[picked[i]]) continue;
var r = await sb.rpc('gc_add_to_group', { p_conversation: cid, p_user: picked[i] });
if (r.error) { failed = r.error; break; }
added++;
}
await loadMyGroups();
renameWin(groupKey(cid), groupTitleFor(cid));
if (failed) imSys(groupKey(cid), groupErrorText(failed));
else if (added) imSys(groupKey(cid), added === 1 ? 'Someone new is in the group.' : added + ' people joined the group.');
}
async function leaveGroup(cid) {
if (!confirm('Leave this group? You will stop seeing it, and everything in it.')) return;
var r = await sb.rpc('gc_leave_group', { p_conversation: cid });
if (r.error) { imSys(groupKey(cid), groupErrorText(r.error)); return; }
var key = groupKey(cid);
delete myGroups[cid];
if (wins[key]) { if (wins[key].tab && wins[key].tab.parentNode) wins[key].tab.parentNode.removeChild(wins[key].tab);
if (wins[key].el && wins[key].el.parentNode) wins[key].el.parentNode.removeChild(wins[key].el);
delete wins[key]; }
if (activeDm === key) showInbox();
delete unread[key];
syncDock();
addSys('You left the group.');
}
/* ---- naming it (v159) -------------------------------------------------------------------
   Anyone in the group can name it, rename it, or clear the name (blank = called after the people
   in it again). The write goes through gc_rename_group -- conversations has no UPDATE policy --
   which checks membership and mutes, tidies the text the same way tidyGroupTitle does, and
   records who did it, so every other member's window can say so when the change arrives over
   realtime (watchGroupNames, below). */
var GROUP_TITLE_MAX = 40; // conversations.title's own check constraint
function tidyGroupTitle(s) { return sanitizeInput(s).replace(/\s+/g, ' ').trim(); }
function groupMemberName(g, uid) {
var m = ((g && g.members) || []).filter(function (x) { return x.user_id === uid; })[0];
return m ? memberDisplayName(m) : ((people[uid] && people[uid].name) || 'Someone');
}
/* v161: who an @name in a group line points at -- live members only, never me, never anyone
   outside the group. Same match as the room's mentionedUserIds. */
function groupMentionedIds(cid, body) {
var text = String(body || ''), ids = [];
liveMembers(myGroups[cid]).forEach(function (m) {
if (m.user_id === me.id) return;
var n = memberDisplayName(m);
if (n && n !== '(no name)' && new RegExp('@' + escRe(n) + '(?![\\w-])', 'i').test(text)) ids.push(m.user_id);
});
return ids;
}
/* The one place a group's current name is pushed onto its window and its inbox row. */
function applyGroupTitle(cid) { var key = groupKey(cid); if (wins[key]) renameWin(key, groupTitleFor(cid)); }
function groupRenameLine(who, had, now) {
if (!now) return who + ' took the group’s name off. It goes by who is in it again.';
return who + (had ? ' renamed the group “' : ' named the group “') + now + '”.';
}
async function nameGroup(cid) {
var g = myGroups[cid]; if (!g) return;
var raw = await showPromptModal(g.title ? 'Rename this group' : 'Name this group', {
value: g.title || '', placeholder: 'e.g. Road trip crew', maxLength: GROUP_TITLE_MAX, okLabel: 'Save',
hint: 'Everyone in the group sees the new name. Leave it blank to go back to calling it by who is in it.'
});
if (raw === null) return;                  // cancelled
g = myGroups[cid]; if (!g) return;         // left, or the group closed, while the box was up
var t = tidyGroupTitle(raw);
var had = g.title || null;                 // read now: someone else may have renamed it meanwhile
if ((t || null) === had) return;           // nothing changed, nothing to announce
var r = await sb.rpc('gc_rename_group', { p_conversation: cid, p_title: t });
if (r.error) { imSys(groupKey(cid), groupErrorText(r.error)); return; }
if (myGroups[cid]) myGroups[cid].title = r.data || null;
applyGroupTitle(cid);
imSys(groupKey(cid), groupRenameLine('You', had, r.data || null));
}
/* A rename reaches everyone else as an UPDATE on conversations (group_names_feature.sql put the
   table in the realtime feed, and the "see my groups" policy means only members hear it). The
   renamer's own window said so when the call came back, so this line is for everybody else;
   the renamer's other tabs just take the new name quietly. */
function watchGroupNames(channel) {
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, function (p) {
var row = p.new; if (!row || row.closed_at) return;
var g = myGroups[row.id]; if (!g) return;
var had = g.title || null, now = row.title || null;
if (had === now) return;
g.title = now;
applyGroupTitle(row.id);
if (row.title_by && row.title_by !== me.id) imSys(groupKey(row.id), groupRenameLine(groupMemberName(g, row.title_by), had, now));
});
}
/* An UPDATE that happened while the connection was down never arrives, so catchUp() re-reads the
   names. It only touches windows that exist -- it must not bring back a group row you swiped away. */
async function refreshGroupNames() {
var ids = Object.keys(myGroups); if (!sb || !ids.length) return;
var r = await sb.from('conversations').select('id, title').in('id', ids);
if (r.error || !r.data) return;
r.data.forEach(function (c) {
var g = myGroups[c.id]; if (!g || (g.title || null) === (c.title || null)) return;
g.title = c.title || null; applyGroupTitle(c.id);
});
}
/* ---- being added to one while you are sitting there ------------------------------------- */
/* Without this, someone adding you to a group does nothing visible until you reload: the group's
   messages are readable the moment the membership row lands, but the client has never heard of
   the group so renderIM has nowhere to put them. */
function watchGroupMembership(channel) {
channel.on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, async function (p) {
var row = p.new || p.old; if (!row) return;
var mine = row.user_id === me.id;
var known = !!myGroups[row.conversation_id];
if (!mine && !known) return;             // a group I am not in and have never heard of
/* v160: most UPDATEs on this table are a read marker moving (gc_mark_group_read runs whenever
   anyone reads the group). Who is in the group has not changed, so there is nothing to reload. */
if (p.eventType === 'UPDATE' && known) {
var wasIn = liveMembers(myGroups[row.conversation_id]).some(function (m) { return m.user_id === row.user_id; });
if (wasIn === !row.left_at) return;
}
var before = known;
await loadMyGroups();
var nowIn = !!myGroups[row.conversation_id];
if (mine && nowIn && !before) {
var key = groupKey(row.conversation_id);
ensureWin(key, groupTitleFor(row.conversation_id), true);
updateTab(key);
syncDock();
addSys('You were added to a group: ' + groupTitleFor(row.conversation_id) + '. It is in your Messages.');
try { playSound('friend-request'); } catch (e) {}
} else if (nowIn) {
renameWin(groupKey(row.conversation_id), groupTitleFor(row.conversation_id));
}
});
}

function ensureWin(id, name, isGroup) {
if (wins[id]) { if (name) renameWin(id, name); return wins[id]; }
var el = document.createElement('div'); el.className = 'im hidden' + (isGroup ? ' im-group' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', (isGroup ? 'Group: ' : 'Whisper with ') + name);
el.dataset.peer = id; // replyKeyFor() reads this to keep each conversation's reply target its own
el.innerHTML = '<div class="bar"><button class="back" type="button" title="Back to messages" aria-label="Back to messages">‹</button><span class="wava" aria-hidden="true"></span><span class="nmwrap"><span class="nm" tabindex="0" role="button" aria-label="' + esc(name) + ' options"></span><span class="im-sub" aria-live="polite"></span></span><button class="buzz" type="button" title="Buzz" aria-label="Buzz ' + esc(name) + '">⚡</button><button class="x" type="button" title="Collapse messages" aria-label="Collapse messages">–</button></div>' +
'<div class="ilog" aria-live="polite"></div><div class="reply-bar hidden"></div><div class="vn-bar hidden"></div><div class="icomp"><div class="typing-indicator hidden" aria-live="polite"></div>' +
'<button class="btn emo" type="button" title="Insert emoji" aria-label="Insert emoji">😊</button>' +
'<button class="btn media" type="button" title="Send a photo or GIF" aria-label="Send a photo or GIF" aria-haspopup="menu">📎</button>' +
'<button class="btn games" type="button" title="Play a game" aria-label="Challenge ' + esc(name) + ' to a game" aria-haspopup="menu">🎲</button>' +
'<button class="btn mic" type="button" title="Record a voice note" aria-label="Record a voice note">🎤</button>' +
'<input type="file" class="im-img-file hidden" accept="image/*,.heic,.heif">' +
'<textarea maxlength="500"></textarea><button class="btn" type="button">Send</button></div>';
el.querySelector('.nm').textContent = name;
if (isAdminId(id)) el.querySelector('.nm').classList.add('admin');
// typingPeer/typingTimer track whether -- and until when -- the OTHER person in this whisper is
// shown as typing; see markImTyping/clearImTyping in the typing-indicator section below.
// snippet: the last line of the conversation, for this conversation's inbox row (see updateTab).
var win = { el: el, log: el.querySelector('.ilog'), replyBar: el.querySelector('.reply-bar'), voiceBar: el.querySelector('.vn-bar'), micBtn: el.querySelector('.icomp .mic'), ta: el.querySelector('textarea'), typingEl: el.querySelector('.icomp .typing-indicator'), typingPeer: false, typingTimer: null, gone: isGroup ? false : !(people[id] || recentPeopleEntries()[id]), name: name, minimized: true, tab: null, snippet: '', group: isGroup ? groupIdOf(id) : null };
/* A group's header carries a 👥 that opens the member list instead of a ⚡ that buzzes one
   person, and the buttons that are still one-to-one only -- games, voice notes -- are taken out
   rather than left there doing nothing. They come back as each one learns to count past two. */
if (isGroup) {
var buzzBtn = el.querySelector('.bar .buzz');
if (buzzBtn) {
buzzBtn.className = 'buzz gmembers';
buzzBtn.textContent = '\uD83D\uDC65';
buzzBtn.title = 'Who is in this group';
buzzBtn.setAttribute('aria-label', 'Who is in this group');
}
['.icomp .games', '.icomp .mic'].forEach(function (sel) {
var b = el.querySelector(sel); if (b) { b.classList.add('hidden'); b.disabled = true; }
});
}
win.ta.placeholder = isGroup ? 'Message the group...' : ('Whisper to ' + name + '...');
win.ta.addEventListener('input', function () { sendTyping(id, !!win.ta.value); });
el.querySelector('.back').onclick = function () { showInbox(); };
el.querySelector('.x').onclick = function () { minimizeIM(id); };
el.querySelector('.buzz').onclick = function (e) {
if (!isGroup) { sendBuzz(id); return; }
e.stopPropagation(); // else the document handler closes the menu on the same click that opened it
openGroupMembers(groupIdOf(id), e.currentTarget);
};
el.querySelector('.icomp .btn:last-child').onclick = function () { sendIM(id); };
var micBtnWin = el.querySelector('.icomp .mic');
if (micBtnWin) micBtnWin.onclick = function () { if (voiceRec[id]) finishVoice(id, true); else startVoice(id); };
el.querySelector('.vn-bar').onclick = function (e) {
if (e.target.closest('.vn-cancel')) { finishVoice(id, false); return; }
if (e.target.closest('.vn-send')) finishVoice(id, true);
};
var emoBtnWin = el.querySelector('.icomp .emo');
emoBtnWin.onclick = function () { openEmojiPicker(win.ta, emoBtnWin); };
var imgFile = el.querySelector('.im-img-file');
/* 📎 = photo or GIF; 🎲 = the games. Each opens a small menu (v113 -- they used to be four
   separate buttons, which got crowded once UNO arrived). The GIF picker is the one shared picker,
   told to deliver into this conversation. */
var mediaBtn = el.querySelector('.icomp .media'), gamesBtn = el.querySelector('.icomp .games');
mediaBtn.onclick = function (e) {
e.stopPropagation();
if (gifPicker.classList.contains('open') && gifTarget === 'dm:' + id) { closeGif(); return; }
showMiniMenu(mediaBtn, 'Send', [
['🖼️ Photo', function () { imgFile.click(); }],
['GIF', function () { openGifPicker('', 'dm:' + id, mediaBtn); }]
]);
};
gamesBtn.onclick = function (e) {
e.stopPropagation();
showMiniMenu(gamesBtn, 'Play with ' + name, gameMenuItems(id, name));
};
var gifBtnWin = mediaBtn;
imgFile.onchange = function () {
var f = imgFile.files && imgFile.files[0]; imgFile.value = '';
if (f) sendIMImage(id, f);
};
win.ta.onkeydown = function (e) { if (cmdKeydown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIM(id); } if (e.key === 'Escape') minimizeIM(id); };
attachCmdMenu(win.ta, 'pm');
win.log.onclick = function (e) {
if (gameCardClick(e, id)) return;
if (unoCardClick(e, id)) return;
if (hmCardClick(e, id)) return;
if (hdCardClick(e, id)) return;
if (prCardClick(e, id)) return;
if (bsCardClick(e, id)) return;
var img = e.target.closest('img.gif'); if (img) { openLightbox(img.src); return; }
var rpt = e.target.closest('.rpt-msg[data-mid]'); if (rpt) { reportMessage(rpt.dataset.mid); return; }
/* Same Get Info / Whisper / Tag in Chat / Block menu a name click opens everywhere else (main
   chat log, threads board, online/friends lists, leaderboard) -- see openMenu. */
var who = e.target.closest('.who[data-id]');
if (who && who.dataset.id !== me.id) { e.stopPropagation(); openMenu(who.dataset.id, who, who.dataset.name); }
};
win.log.addEventListener('keydown', function (e) {
if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.closest('.who[data-id]')) return;
e.preventDefault(); win.log.onclick(e);
});
/* The header name is a shortcut to the same menu, for the one person this whole window is
   already about -- no need to go find their name in a message first. */
var nmEl = el.querySelector('.nm');
/* fallbackName keeps this working even for someone who's dropped out of both `people` and the
   30-minute recentPeople pool and was never a friend -- without it openMenu has no name to fall
   back on for them and silently declines to open at all (see its `if (!name) return`). The window
   itself always still knows their last-known name (wins[id].name), whisper history or not. */
nmEl.onclick = function (e) {
e.stopPropagation();
/* v159: a group's name is not a person. It opens the same sheet as the 👥 button (members, name,
   add, leave) -- before this it opened a person menu for the window key "g<id>", whose Get Info,
   Block and Add Friend all failed because that is nobody's id. */
if (isGroup) { openGroupMembers(groupIdOf(id), nmEl); return; }
openMenu(id, nmEl, wins[id] && wins[id].name);
};
nmEl.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nmEl.click(); } };
$('ims').appendChild(el); wins[id] = win;
makeTab(id); updateTab(id); updateWinAvatar(id); updateWinPresenceDot(id);
syncDock(); // a new conversation exists -- give it its inbox row, and show the dock even if the DM-hide preference is on
return win;
}
function makeTab(id) {
var w = wins[id];
// An inbox row in the Messages dock. A <div role="button"> rather than a real <button> -- the
// close "x" inside it is its own real button, and a button can't contain another button (the
// browser would silently pop it back out as a sibling, breaking both the layout and the click
// handling below). .tava is kept current by updateWinAvatar, .snippet by updateTab.
var b = document.createElement('div'); b.className = 'im-tab'; b.tabIndex = 0; b.setAttribute('role', 'button');
b.innerHTML = '<span class="tava" aria-hidden="true"></span><span class="tmeta"><span class="nm"></span><span class="snippet"></span></span><span class="badge hidden">0</span>' +
'<button type="button" class="tab-close" title="Remove this conversation" aria-label="Remove conversation with ' + esc(w.name) + '">✕</button>';
b.querySelector('.nm').textContent = w.name;
b.setAttribute('aria-label', (isGroupKey(id) ? 'Open group ' : 'Open whisper with ') + w.name);
b.addEventListener('click', function (e) {
if (e.target.closest('.tab-close')) return; // handled by its own onclick below
if (b._swiped) { b._swiped = false; return; } // just finished a real drag -- don't also open it
openIM(id, w.name, true);
});
b.addEventListener('keydown', function (e) {
if (e.target !== b) return; // let the close button field its own Enter/Space
if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIM(id, w.name, true); }
else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); dismissTab(id); }
});
b.querySelector('.tab-close').onclick = function (e) { e.stopPropagation(); dismissTab(id); };
makeSwipeToDismiss(b, id);
tray.appendChild(b);
w.tab = b;
}
/* ---------- swipe-away for minimized whisper tabs ----------
   Drag a tab sideways -- touch or a mouse drag both work, via Pointer Events -- and past a small
   threshold it slides the rest of the way off and closes that conversation for good, same as
   tapping its ✕ or pressing Delete/Backspace while it's focused. A short drag that doesn't cross
   the threshold just snaps back. Either way a real drag never also opens the whisper window
   afterward (see the _swiped guard in makeTab's click handler). */
var SWIPE_DISMISS_PX = 70;
function dismissTab(id) {
var w = wins[id]; if (!w || !w.tab) return;
var el = w.tab;
el.style.transform = 'translateX(' + ((el._dismissDir || 1) * 120) + '%)';
el.style.opacity = '0';
dmDismissed[id] = Date.now(); saveDmDismissed(); // see dmDismissed above -- keeps history replay from bringing this tab straight back
setTimeout(function () { destroyWin(id); }, 180);
}
function makeSwipeToDismiss(el, id) {
var startX = 0, dx = 0, dragging = false, pid = null;
el.addEventListener('pointerdown', function (e) {
// Letting the tab claim pointer capture here too would retarget the close button's own click
// at the tab itself once the button releases (pointer capture carries the whole mouse sequence
// with it, click included) -- which is why tapping x was reopening the whisper instead of
// closing it. Simplest fix: the drag/swipe logic never engages for a press that started on x.
if (e.target.closest('.tab-close')) return;
if (e.pointerType === 'mouse' && e.button !== 0) return;
startX = e.clientX; dx = 0; dragging = true; pid = e.pointerId;
el.classList.add('dragging');
try { el.setPointerCapture(pid); } catch (err) {}
});
el.addEventListener('pointermove', function (e) {
if (!dragging || e.pointerId !== pid) return;
dx = e.clientX - startX;
el.style.transform = 'translateX(' + dx + 'px)';
el.style.opacity = String(Math.max(.15, 1 - Math.abs(dx) / 160));
el.classList.toggle('past-threshold', Math.abs(dx) > SWIPE_DISMISS_PX);
});
function end(e) {
if (!dragging || (e && e.pointerId !== pid)) return;
dragging = false; el.classList.remove('dragging');
try { el.releasePointerCapture(pid); } catch (err) {}
if (Math.abs(dx) > SWIPE_DISMISS_PX) {
el._swiped = true; el._dismissDir = dx < 0 ? -1 : 1;
dismissTab(id);
} else {
if (Math.abs(dx) > 6) el._swiped = true; // a real drag that snapped back shouldn't also open the tab
el.classList.remove('past-threshold');
el.style.transform = ''; el.style.opacity = '';
}
}
el.addEventListener('pointerup', end);
el.addEventListener('pointercancel', end);
}
/* Keeps a whisper window's title bar, tray tab, and aria-labels showing the name that user
   currently has chosen — called whenever we learn a (possibly updated) name for an open
   window, e.g. on every presence sync, so a rename shows up even if no new message arrives. */
function renameWin(id, name) {
var w = wins[id]; if (!w || !name || w.name === name) return;
w.name = name;
/* v159: a group window keeps its group wording -- its 👥 button is not a buzz and its composer
   says "Message the group", whatever the group is called now. */
var grp = isGroupKey(id);
w.el.setAttribute('aria-label', (grp ? 'Group: ' : 'Whisper with ') + name);
var nmEl2 = w.el.querySelector('.nm'); nmEl2.textContent = name; nmEl2.setAttribute('aria-label', name + ' options');
var buzzBtn = w.el.querySelector('.buzz'); if (buzzBtn && !grp) buzzBtn.setAttribute('aria-label', 'Buzz ' + name);
if (!grp) w.ta.placeholder = 'Whisper to ' + name + '...';
if (w.tab) {
w.tab.querySelector('.nm').textContent = name; w.tab.setAttribute('aria-label', (grp ? 'Open group ' : 'Open whisper with ') + name);
var closeBtn = w.tab.querySelector('.tab-close'); if (closeBtn) closeBtn.setAttribute('aria-label', 'Remove conversation with ' + name);
}
}
/* Keeps a whisper window's title-bar avatar in sync with presence -- called once when the window
   is created and again on every presence sync (a person can change their picture mid-conversation). */
function updateWinAvatar(id) {
var w = wins[id]; if (!w) return;
if (isGroupKey(id)) { // a group has no face of its own
var gs = w.el.querySelector('.wava'); if (gs) gs.textContent = '\uD83D\uDC65';
var gt = w.tab && w.tab.querySelector('.tava'); if (gt) gt.textContent = '\uD83D\uDC65';
return;
}
var span = w.el.querySelector('.wava'); if (span) span.innerHTML = avatarHtml(id, w.name);
var tava = w.tab && w.tab.querySelector('.tava'); if (tava) tava.innerHTML = avatarHtml(id, w.name); // the inbox row's picture too
}
/* Keeps a whisper window's title-bar status dot in sync with presence -- same green/yellow/red/
   grey vocabulary as the threads board (see presenceDotClass), just parked in the header instead
   of next to every message, since a whisper is always with one specific person: this is the
   at-a-glance answer to "are they actually going to see this right now." Called once when the
   window is created and again on every presence sync via refreshPresenceDots(). */
function updateWinPresenceDot(id) { updateWinBanner(id); }
/* The line under the name in a whisper's title bar: status dot + word, their status message (if
   they set one), their level badge, and a scripted "Admin" title for admins. Presence is the
   live source; for someone offline the status message comes from their profile (cached). */
var statusMsgCache = {};
function updateWinBanner(id) {
var w = wins[id]; if (!w) return;
var sub = w.el.querySelector('.im-sub'); if (!sub) return;
/* v160: a group is not a person, so it has no status of its own -- it said "Offline" and asked
   the profiles table about a user called "g<id>". It shows how many are in it and how many of
   the others are here now instead. */
if (isGroupKey(id)) {
var live = liveMembers(myGroups[groupIdOf(id)]);
var here = live.filter(function (m) { return m.user_id !== me.id && people[m.user_id]; }).length;
sub.innerHTML = '<span class="presence-dot presence-dot-' + (here ? 'online' : 'offline') + '"></span><span class="im-st">' +
live.length + ' in the group' + (here ? ' \u00b7 ' + here + ' here now' : '') + '</span>';
return;
}
var p = people[id], rec = recentPeopleEntries()[id];
var status = p ? (p.status || 'online') : (rec ? 'recent' : 'offline');
var word = { online: 'Online', idle: 'Idle', away: 'Away', busy: 'Busy', recent: 'Just left', offline: 'Offline' }[status] || status;
var msg = p ? (p.statusMsg || '') : (statusMsgCache[id] || '');
if (!p && statusMsgCache[id] === undefined) {
statusMsgCache[id] = '';
sb.from('profiles').select('status_message').eq('user_id', id).maybeSingle().then(function (r) {
statusMsgCache[id] = (!r.error && r.data && r.data.status_message) || '';
if (statusMsgCache[id]) updateWinBanner(id);
});
}
var html = '<span class="presence-dot presence-dot-' + status + '"></span><span class="im-st">' + word + '</span>';
if (p && status === 'away' && p.awayMsg && !msg) msg = p.awayMsg;
if (msg) html += '<span class="im-msg">“' + esc(msg) + '”</span>';
html += levelBadgeHtml(id);
if (isAdminId(id)) html += '<span class="adm-title" title="Admin">Admin</span>';
sub.innerHTML = html;
}
function updateWinBanners() { Object.keys(wins).forEach(updateWinBanner); }
/* Refreshes one conversation's inbox row: unread badge and last-line snippet. Rows are always
   listed (the inbox shows every conversation, open or not); which one is currently open is
   syncDock's business. Also re-sums the bar's total badge, since that's derived from the same
   per-conversation counts. */
function updateTab(id) {
var w = wins[id]; if (!w || !w.tab) return;
var n = unread[id] || 0;
var badge = w.tab.querySelector('.badge');
badge.textContent = n > 9 ? '9+' : String(n);
badge.classList.toggle('hidden', !n);
w.tab.classList.toggle('unread', !!n);
var sn = w.tab.querySelector('.snippet'); if (sn) sn.textContent = w.snippet || '';
if (dmBarBadge) {
var total = pendingRequestCount(); Object.keys(wins).forEach(function (k) { total += unread[k] || 0; });
dmBarBadge.textContent = total > 9 ? '9+' : String(total); dmBarBadge.classList.toggle('hidden', !total);
}
}
/* Opens one conversation inside the dock (expanding the dock if it was collapsed) and marks it
   read. Every route into a whisper -- a name's "Whisper" menu item, an inbox row, /w, a tapped
   notification -- comes through here. */
function openIM(id, name, focus) {
var w = ensureWin(id, name);
dismissToasts(id);
activeDm = id; dockOpen = true; saveDockOpen();
unread[id] = 0; markDmRead(id); renderPeople();
updateTab(id);
syncDock();
if (focus) autoFocus(w.ta);
/* A hidden element has no layout, so while the conversation wasn't showing the browser had
   nowhere to keep its scroll offset and clamped it to zero -- reopening it dropped you at the
   OLDEST message. Put it back on the newest, a frame later so it has been laid out again. */
requestAnimationFrame(function () { w.log.scrollTop = w.log.scrollHeight; });
return w;
}
/* "Minimize" in the dock model means collapse the whole panel to its bar. The conversation stays
   selected, so expanding the bar again lands straight back in it -- same as Instagram. */
function minimizeIM(id) {
if (!wins[id]) return;
dockOpen = false; saveDockOpen(); syncDock(); autoFocus(msg);
}
function destroyWin(id) {
var w = wins[id]; if (!w) return;
clearTimeout(w.typingTimer);
w.el.remove(); if (w.tab) w.tab.remove(); delete wins[id];
if (activeDm === id) activeDm = null; // back to the inbox if that conversation was the one showing
syncDock();
}
/* Kept as a no-op so the call sites that used to raise a floating window still read naturally:
   there is only one panel now, and nothing inside it stacks. */
function front() {}
function imSys(id, text) { var w = wins[id]; if (!w) return; var d = document.createElement('div'); d.className = 'm sys'; d.textContent = text; dayDivider(w.log, 'im:' + id, Date.now()); w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight; }
async function sendBuzz(id) {
var now = Date.now();
if (lastBuzz[id] && now - lastBuzz[id] < 3000) return;
/* Buzz rides the broadcast channel, which the database's whisper rule can't see -- so the same
   friends-first rule is applied here, client-side (see the whisper-policy section above). */
if (!(await whisperAllowed(id))) { imSys(id, 'Add ' + (wins[id] ? wins[id].name : 'them') + ' as a friend to buzz them.'); return; }
lastBuzz[id] = now;
channel.send({ type: 'broadcast', event: 'buzz', payload: { to: id, from: me.id, name: me.name } });
imSys(id, 'You sent a buzz.');
/* Unlike whispers/mentions, a buzz is a pure realtime broadcast -- it never touches the messages
   table, so it only ever reached someone whose tab already had the realtime channel open. That's
   the same "closed browser never hears it" gap Web Push was built to close for whispers, just
   never wired up here too. Trigger it the same way: from the sender's client, right after the
   broadcast goes out. */
triggerPush(id, me.name, 'sent you a buzz ⚡', 'gc-buzz-' + id);
}
function renderIM(m) {
if (seen[m.id]) return; seen[m.id] = 1;
var mine = m.sender_id === me.id;
msgCache[m.id] = { senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at };
/* A group line is addressed to the conversation, not to a person, so the window it belongs in
   is the same one for everybody in it -- including the sender, who would otherwise land in a
   whisper window with themselves. */
var isG = !!m.conversation_id;
var otherId = isG ? groupKey(m.conversation_id) : (mine ? m.recipient_id : m.sender_id);
var otherName = isG ? groupTitleFor(m.conversation_id)
: (mine ? ((people[otherId] && people[otherId].name) || m.recipient_name || 'unknown') : m.sender_name);
if (isG && !myGroups[m.conversation_id]) return; // a group this client has not loaded yet
// A conversation dismissed on this device stays gone through replay unless something in it is
// actually newer than the dismissal -- see dmDismissed above. Once a window exists, this never
// applies again until it's dismissed afresh (the wins[otherId] check short-circuits first).
if (!wins[otherId] && dmDismissed[otherId] && new Date(m.created_at).getTime() <= dmDismissed[otherId]) return;
var w = ensureWin(otherId, otherName, isG); // never pops the window open on its own — see note above
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them'); d.dataset.mid = m.id;
if (mine) d.dataset.at = new Date(m.created_at).getTime(); // read receipts compare against this — see updateSeenMark
var flag = mine ? '' : '<button type="button" class="rpt-msg" data-mid="' + m.id + '" title="Report this message" aria-label="Report this message from ' + esc(m.sender_name) + '">🚩</button>';
d.innerHTML = replyStubHtml(m.reply_to) + '<span class="t">' + fmt(m.created_at) + '</span>' + flag + avatarHtml(m.sender_id, m.sender_name) + '<b class="who' + (isAdminId(m.sender_id) ? ' admin' : '') + '" data-id="' + esc(m.sender_id) + '" data-name="' + esc(m.sender_name) + '" tabindex="0">' + presenceDotHtml(m.sender_id) + '<span class="nmt">' + esc(m.sender_name) + '</span>:</b> ' + (m.voice_path ? voiceHtml(m) : m.share_thread ? shareThreadHtml(m.share_thread) : m.share_user ? shareUserHtml(m.share_user) : bodyHtml(m.body));
if (m.reply_to) fillReplyStub(m.reply_to);
if (m.share_thread) fillShareThread(m.share_thread);
if (m.share_user) fillShareUser(m.share_user);
dayDivider(w.log, 'im:' + otherId, m.created_at);
w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight; stickImages(w.log, d);
/* Inbox row: last line as its snippet, and newest activity floats to the top of the list.
   updateTab always runs here (not only when unread changes) so the snippet is current -- but
   during history replay hold off on both the re-sort and the repaint until the end (rows are
   inserted newest-first anyway, and openIM/syncDock repaint after the replay). */
w.snippet = (mine ? 'You: ' : '') + notifPreview(m.body);
if (w.tab && tray && w.tab.parentNode === tray && tray.firstChild !== w.tab) tray.insertBefore(w.tab, tray.firstChild);
if (mine) updateSeenMark(otherId); // this may now be the new last message of mine -- move/(re)show the mark
if (!mine && !alreadyRead(otherId, m.created_at)) {
if (w.minimized || document.activeElement !== w.ta) { unread[otherId] = (unread[otherId] || 0) + 1; if (!replayingHistory) renderPeople(); }
else markDmRead(otherId, m.created_at); // you are sitting in the conversation with the cursor in it
}
if (!replayingHistory) updateTab(otherId);
if (!mine && !replayingHistory) {
if (w.minimized) {
/* Not looking at this conversation: flash its inbox row, and the collapsed bar too if the
   whole dock is shut, so the arrival registers wherever the person's eye is. */
if (w.tab) { w.tab.classList.remove('flash'); void w.tab.offsetWidth; w.tab.classList.add('flash'); }
if (!dockOpen && dmBar) { dmBar.classList.remove('flash'); void dmBar.offsetWidth; dmBar.classList.add('flash'); }
}
messageSound(true); // v135 (was the 'pm' alert; the swoosh is the same sound the sender heard, reversed)
if (document.hidden) bumpTitle();
notifyDesktop(otherName, notifPreview(m.body), 'gc-whisper-' + otherId, function () { openIM(otherId, otherName, true); });
if (manualStatus === 'away' && !awayReplied[otherId]) {
awayReplied[otherId] = true;
post('[Away] ' + (myAwayMsg || (me.name + ' is currently away.')), otherId, otherName);
}
}
}
async function sendIM(id) {
var w = wins[id]; var t = w.ta.value.trim(); if (!t) return;
var sc = t.match(/^\/(\w+)\s*$/);
if (sc && SFX[sc[1].toLowerCase()]) { w.ta.value = ''; sendTyping(id, false); sendSfx(sc[1].toLowerCase(), id); return; }
if (sc && sc[1].toLowerCase() === 'sounds') { w.ta.value = ''; imSys(id, 'Sounds: ' + SFX_LIST.map(function (k) { return '/' + k; }).join(' · ')); return; }
/* A group has no single recipient to check reachability or a whisper policy against: the
   membership row is the permission, and the insert policy checks it server-side. */
if (isGroupKey(id)) {
w.ta.value = ''; sendTyping(id, false);
await post(t, null, null, { conversation_id: groupIdOf(id) });
w.ta.focus();
return;
}
if (w.gone) { imSys(id, w.name + ' is not here to hear you.'); return; }
/* An old conversation can outlive the friendship (or they may have closed their whispers since):
   check before sending so the text isn't thrown away on a policy refusal. */
if (!(await whisperAllowed(id))) { imSys(id, w.name + ' only takes whispers from friends. Send them a friend request from their name above.'); return; }
w.ta.value = ''; sendTyping(id, false);
await post(t, id, w.name);
w.ta.focus();
}
/* Photo-send in a whisper: reuses the same upload (and the same "thread-images" bucket) as thread
   image posts, then sends the resulting URL as an ordinary whisper message -- bodyHtml's OWN_IMG_RE
   is what makes it show up embedded rather than as a bare link. */
/* ---------- sharing a thread or a person into a whisper (v150) ----------
   Both work the same way and deliberately so: the message carries an id, and the card is drawn
   from the live row when it is read. Nothing about the thread or the person is copied into the
   message, so a share cannot be forged to say something the original never said, and what the
   reader is allowed to see is decided by the ordinary select policies rather than by whatever the
   sender chose to paste in.

   Both go through pickPerson(), which is the only new piece of chrome either feature needed. */
function shareableTargets() {
/* Friends first, then anyone reachable right now. Friends come first because sharing is almost
   always with somebody you already talk to, and a list that opens on the people you know is
   faster than one sorted by who happens to be online. Yourself excluded -- a card sent to
   yourself is a dead end, and the whisper insert policy refuses it anyway. */
var seen = {}, out = [];
Object.keys(friends).forEach(function (id) {
if (id === me.id || blocked[id]) return;
seen[id] = 1;
out.push({ id: id, name: (people[id] && people[id].name) || friends[id].name, friend: true, online: !!people[id] });
});
var recent = recentPeopleEntries();
Object.keys(recent).forEach(function (id) {
if (id === me.id || seen[id] || blocked[id]) return;
out.push({ id: id, name: recent[id].name, friend: false, online: !!people[id] });
});
out.sort(function (a, b) {
if (a.friend !== b.friend) return a.friend ? -1 : 1;
if (a.online !== b.online) return a.online ? -1 : 1;
return a.name.localeCompare(b.name);
});
return out;
}
var pickOverlay = null;
function pickPerson(title) {
return new Promise(function (resolve) {
var list = shareableTargets();
if (!pickOverlay) {
pickOverlay = document.createElement('div');
pickOverlay.className = 'modal-overlay hidden';
pickOverlay.innerHTML = '<div class="modal pick-modal" role="dialog" aria-modal="true">' +
'<div class="modal-hd"></div><div class="pick-list"></div>' +
'<button class="btn pick-cancel" type="button">Cancel</button></div>';
document.body.appendChild(pickOverlay);
}
pickOverlay.querySelector('.modal-hd').textContent = title;
var box = pickOverlay.querySelector('.pick-list');
box.innerHTML = list.length
? list.map(function (p) {
return '<button type="button" class="pick-row" data-id="' + esc(p.id) + '">' +
avatarHtml(p.id, p.name) +
'<span class="pick-nm' + (isAdminId(p.id) ? ' admin' : '') + '">' + esc(p.name) + '</span>' +
(p.friend ? '<span class="pick-tag">friend</span>' : '') +
(p.online ? '<span class="pick-dot" title="online"></span>' : '') + '</button>';
}).join('')
: '<div class="pick-empty">Nobody to send this to yet. Add a friend first.</div>';
pickOverlay.classList.remove('hidden');
function done(v) {
pickOverlay.classList.add('hidden');
box.onclick = null; pickOverlay.onclick = null;
pickOverlay.querySelector('.pick-cancel').onclick = null;
resolve(v);
}
box.onclick = function (e) { var b = e.target.closest('.pick-row'); if (b) done(b.dataset.id); };
pickOverlay.querySelector('.pick-cancel').onclick = function () { done(null); };
pickOverlay.onclick = function (e) { if (e.target === pickOverlay) done(null); };
});
}

/* The body text is what a client that knows nothing about shares would show, and what goes in the
   push notification and the inbox snippet -- so it is a readable sentence, not a marker. */
async function shareThreadWith(threadId) {
if (!me) return;
var t = threadsCache[threadId];
var to = await pickPerson('Send this thread to\u2026');
if (!to) return;
var w = await tryWhisper(to, (people[to] && people[to].name) || (friends[to] && friends[to].name) || 'them', true);
if (!w) return; // turned into a friend-request offer instead
var who = (people[to] && people[to].name) || (friends[to] && friends[to].name) || 'them';
await post('\uD83E\uDDF5 Shared a thread' + (t && t.op_name ? ' by ' + t.op_name : ''), to, who, { share_thread: threadId });
}
async function shareUserWith(userId, userName) {
if (!me) return;
var to = await pickPerson('Send ' + userName + '\u2019s card to\u2026');
if (!to) return;
if (to === userId) { addSys('That is the same person.'); return; }
var who = (people[to] && people[to].name) || (friends[to] && friends[to].name) || 'them';
var w = await tryWhisper(to, who, true);
if (!w) return;
await post('\uD83D\uDC64 Shared ' + userName + '\u2019s card', to, who, { share_user: userId });
}

/* Cards are painted from whatever the reader can actually see. A thread that has since been
   deleted, or a person whose account is gone, resolves to nothing and says so rather than
   rendering a card full of blanks. */
var shareThreadCache = {};
function shareThreadHtml(id) {
var t = threadsCache[id] || shareThreadCache[id];
if (!t) return '<button type="button" class="sh sh-thread" data-sht="' + id + '"><span class="sh-load">\u2026</span></button>';
var img = t.image_url ? '<img class="sh-thumb" src="' + esc(t.image_url) + '" alt="" loading="lazy">' : '';
var n = t.reply_count || 0;
return '<button type="button" class="sh sh-thread" data-sht="' + id + '">' + img +
'<span class="sh-body"><span class="sh-kind">Thread \u00B7 ' + esc(boardById(t.board || 'gen').label) + '</span>' +
'<span class="sh-op">' + esc(t.op_name) + '</span>' +
'<span class="sh-txt">' + esc(String(t.body || '').slice(0, 90)) + '</span>' +
'<span class="sh-meta">' + n + ' repl' + (n === 1 ? 'y' : 'ies') + '</span></span></button>';
}
async function fillShareThread(id) {
if (!id || threadsCache[id] || shareThreadCache[id] || !sb) return;
var r = await sb.from('threads').select('*').eq('id', id).maybeSingle();
if (!r.error && r.data) shareThreadCache[id] = r.data;
document.querySelectorAll('.sh-thread[data-sht="' + id + '"]').forEach(function (b) {
b.outerHTML = (!r.error && r.data) ? shareThreadHtml(id)
: '<span class="sh sh-gone">That thread is no longer there.</span>';
});
}
/* The name is looked up from profiles when the live sets do not have it. Those sets -- who is in
   the room, your own friends, who was seen in the last half hour -- are all "visible right now"
   sets, and a shared card is precisely the case where the person usually is not: you send somebody
   a card so they can find a person they have not met. The first version resolved from those three
   alone and rendered "no longer around" for anybody else, which was wrong about real accounts.
   profiles is the durable record, so it is what the card falls back to, the same way a shared
   thread is fetched rather than assumed to be in the catalog you happen to be looking at. */
var shareUserCache = {};
function shareUserName(uid) {
return (people[uid] && people[uid].name) || (friends[uid] && friends[uid].name) ||
(recentPeopleEntries()[uid] && recentPeopleEntries()[uid].name) || shareUserCache[uid] || null;
}
async function fillShareUser(uid) {
if (!uid || shareUserName(uid) || !sb) return;
var r = await sb.from('profiles').select('user_id, name').eq('user_id', uid).maybeSingle();
if (!r.error && r.data && r.data.name) shareUserCache[uid] = r.data.name;
document.querySelectorAll('.sh-user[data-shu="' + uid + '"], .sh-pending[data-shu="' + uid + '"]').forEach(function (b) {
b.outerHTML = shareUserHtml(uid);
});
}
function shareUserHtml(uid) {
var nm = shareUserName(uid);
/* Not "gone" -- not looked up yet. The distinction matters: the first version declared a real
   account missing before it had asked anybody. */
if (!nm) return '<span class="sh sh-pending" data-shu="' + esc(uid) + '"><span class="sh-load">\u2026</span></span>';
return '<button type="button" class="sh sh-user" data-shu="' + esc(uid) + '" data-shn="' + esc(nm) + '">' +
avatarHtml(uid, nm, 'ava-menu') +
'<span class="sh-body"><span class="sh-kind">Person</span>' +
'<span class="sh-op' + (isAdminId(uid) ? ' admin' : '') + '">' + esc(nm) + '</span>' +
(levelTextFor(uid) ? '<span class="sh-meta">' + esc(levelTextFor(uid)) + '</span>' : '') + '</span></button>';
}
/* userStats already holds the computed level -- the server keeps it, the client never derives it.
   An account nobody has reacted to yet has no row at all, which is not the same as level zero, so
   say nothing rather than inventing a number. */
function levelTextFor(uid) {
var st = userStats && userStats[uid];
return st && st.level ? 'Level ' + st.level : '';
}
document.addEventListener('click', function (e) {
var t = e.target.closest && e.target.closest('.sh-thread');
if (t && t.dataset.sht) { openThreadFromShare(Number(t.dataset.sht)); return; }
var u = e.target.closest && e.target.closest('.sh-user');
if (u && u.dataset.shu) { e.preventDefault(); openMenu(u.dataset.shu, u, u.dataset.shn); }
});
/* Opening a shared thread has to get you onto the right board first, or the board switch that
   follows would drop you somewhere the thread is not. */
async function openThreadFromShare(id) {
var t = threadsCache[id] || shareThreadCache[id];
if (!t) { addSys('That thread is no longer there.'); return; }
if (!gcRoot.classList.contains('mobile-threads-open') && threadToggleBtn) threadToggleBtn.click();
if ((t.board || 'gen') !== curBoard) await switchBoard(t.board || 'gen');
if (!threadsCache[id]) { threadsCache[id] = t; if (threadsOrder.indexOf(id) === -1) threadsOrder.push(id); }
openThread(id);
}

/* ---------- voice notes (v149) ----------
   Hold nothing, tap twice: 🎤 starts, ⏹ stops and sends, ✕ throws it away. Press-and-hold is what
   the phone apps do, but it is miserable with a mouse and it makes a sixty-second note impossible
   to record without cramp, so the same two-tap works identically on both.

   The file goes to a PRIVATE bucket, unlike the pictures in these same windows, which sit in a
   public one where the URL alone is enough to fetch them. That is tolerable for a GIF and not for
   a recording of somebody's voice. Playback therefore needs a signed URL, minted on demand and
   short-lived; the object cannot be reached without one.

   The folder is named after the pair -- both ids, sorted so either person computes the same string.
   That is what lets the storage policy say "you may read this if you are one of the two people in
   this conversation", which a folder named after only the sender could never have expressed. */
var VOICE_MAX_SECS = 120, voiceRec = {}; // peer id -> { rec, chunks, started, timer, stream, mime }

/* Browsers disagree about what a MediaRecorder can produce and there is no format all of them
   share. Chrome and Firefox do Opus in WebM; Safari, on the Mac and on the iPhone, cannot write
   WebM at all and gives mp4/AAC. So ask rather than assume, and let the bucket accept both. */
function voiceMime() {
if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
var want = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/mpeg'];
for (var i = 0; i < want.length; i++) if (MediaRecorder.isTypeSupported(want[i])) return want[i];
return '';
}
function voiceExt(mime) {
if (mime.indexOf('webm') >= 0) return 'webm';
if (mime.indexOf('mp4') >= 0) return 'mp4';
if (mime.indexOf('ogg') >= 0) return 'ogg';
if (mime.indexOf('mpeg') >= 0) return 'mp3';
return 'webm';
}
function voiceFolder(peerId) { return [me.id, peerId].sort().join('_'); }
function mmss(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

function voiceBar(w, on) {
if (!w || !w.voiceBar) return;
w.voiceBar.classList.toggle('hidden', !on);
if (on) w.voiceBar.innerHTML = '<span class="vn-dot" aria-hidden="true"></span><span class="vn-time">0:00</span>' +
'<span class="vn-hint">recording\u2026</span>' +
'<button type="button" class="vn-cancel" aria-label="Discard this recording">\u2715</button>' +
'<button type="button" class="vn-send" aria-label="Stop and send">\u23F9 Send</button>';
}
async function startVoice(id) {
var w = wins[id]; if (!w || voiceRec[id]) return;
if (w.gone) { imSys(id, w.name + ' is not here to hear you.'); return; }
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
imSys(id, 'This browser cannot record audio. On an iPhone this needs Gypsy Chat added to the Home Screen and opened from there.'); return;
}
var mime = voiceMime();
if (!mime) { imSys(id, 'This browser has no audio format I can record in.'); return; }
var stream;
try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
catch (e) {
/* Refused, or no microphone at all. Both arrive here as an exception and both need saying out
   loud -- a 🎤 button that does nothing when pressed is the worst of the possible outcomes. */
imSys(id, e && e.name === 'NotAllowedError'
? 'Microphone access was refused. Allow it for this site in your browser settings, then try again.'
: 'No microphone was found.');
return;
}
var rec;
try { rec = new MediaRecorder(stream, { mimeType: mime }); }
catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); imSys(id, 'Could not start recording.'); return; }
var st = { rec: rec, chunks: [], started: Date.now(), stream: stream, mime: mime, timer: null };
voiceRec[id] = st;
rec.ondataavailable = function (e) { if (e.data && e.data.size) st.chunks.push(e.data); };
rec.start();
voiceBar(w, true);
if (w.micBtn) { w.micBtn.classList.add('on'); w.micBtn.textContent = '\u23F9'; }
st.timer = setInterval(function () {
var secs = (Date.now() - st.started) / 1000;
var t = w.voiceBar && w.voiceBar.querySelector('.vn-time');
if (t) t.textContent = mmss(secs);
if (secs >= VOICE_MAX_SECS) finishVoice(id, true); // a forgotten recording stops itself and sends
}, 250);
}
function teardownVoice(id) {
var st = voiceRec[id]; if (!st) return;
clearInterval(st.timer);
try { st.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} // releases the mic indicator
delete voiceRec[id];
var w = wins[id];
if (w) { voiceBar(w, false); if (w.micBtn) { w.micBtn.classList.remove('on'); w.micBtn.textContent = '\uD83C\uDFA4'; } }
}
async function finishVoice(id, send) {
var st = voiceRec[id]; if (!st) return;
var secs = Math.max(1, Math.round((Date.now() - st.started) / 1000));
var mime = st.mime, chunks = st.chunks, rec = st.rec;
clearInterval(st.timer);
var done = new Promise(function (res) { rec.onstop = res; });
try { rec.stop(); } catch (e) {}
await done;
teardownVoice(id);
if (!send) return;
var blob = new Blob(chunks, { type: mime.split(';')[0] });
if (!blob.size) { imSys(id, 'That recording came out empty.'); return; }
var w = wins[id]; if (!w) return;
var path = voiceFolder(id) + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + voiceExt(mime);
if (w.micBtn) w.micBtn.disabled = true;
var up = await sb.storage.from('voice-notes').upload(path, blob, { contentType: mime.split(';')[0], upsert: false });
if (w.micBtn) w.micBtn.disabled = false;
if (up.error) { imSys(id, 'That voice note did not send: ' + up.error.message); return; }
/* The body is readable text, not the path. A client that knows nothing about voice notes, a push
   notification and the inbox snippet all then say something sensible rather than showing a storage
   key as gibberish. */
await post('\uD83C\uDFA4 Voice note (' + mmss(secs) + ')', id, w.name, { voice_path: path, voice_secs: secs });
}

/* Playback. The signed URL is minted when the bubble is drawn rather than stored with the message,
   because a signed URL expires and a message does not -- baking one into the row would leave every
   old voice note pointing at a dead link an hour later. */
var voiceUrlCache = {};
async function voiceSrc(path) {
if (voiceUrlCache[path]) return voiceUrlCache[path];
var r = await sb.storage.from('voice-notes').createSignedUrl(path, 3600);
var u = (!r.error && r.data && r.data.signedUrl) || null;
if (u) voiceUrlCache[path] = u;
return u;
}
function voiceHtml(m) {
return '<span class="vn" data-vn="' + esc(m.voice_path) + '">' +
'<button type="button" class="vn-play" aria-label="Play voice note">\u25B6</button>' +
'<span class="vn-len">' + esc(mmss(m.voice_secs || 0)) + '</span></span>';
}
/* One delegated handler, like the reply stubs: whisper windows are created and destroyed freely and
   binding per bubble would leave listeners behind on every one of them. */
document.addEventListener('click', async function (e) {
var b = e.target.closest && e.target.closest('.vn-play'); if (!b) return;
var host = b.closest('.vn'); if (!host) return;
var au = host.querySelector('audio');
if (au) { if (au.paused) au.play(); else { au.pause(); au.currentTime = 0; b.textContent = '\u25B6'; } return; }
b.disabled = true;
var url = await voiceSrc(host.dataset.vn);
b.disabled = false;
if (!url) { host.insertAdjacentHTML('beforeend', '<span class="vn-gone">unavailable</span>'); return; }
au = document.createElement('audio'); au.src = url; au.preload = 'none';
au.onplay = function () { b.textContent = '\u23F8'; };
au.onpause = function () { b.textContent = '\u25B6'; };
au.onended = function () { b.textContent = '\u25B6'; au.currentTime = 0; };
host.appendChild(au);
au.play().catch(function () { b.textContent = '\u25B6'; });
});

async function sendIMImage(id, file) {
var w = wins[id]; if (!w) return;
if (w.gone) { imSys(id, w.name + ' is not here to hear you.'); return; }
var imgBtn = w.el.querySelector('.icomp .img');
if (imgBtn) imgBtn.disabled = true;
var url = await uploadImage(file);
if (imgBtn) imgBtn.disabled = false;
if (url) await post(url, id, w.name);
w.ta.focus();
}
/* ---------- name menu: Get Info / Whisper / Tag in Chat / Block / Report / Friend / Kick ---------- */
var menu = document.createElement('div'); menu.className = 'nmenu'; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
function closeMenu() { menu.classList.remove('open'); }
/* Drops "@Name " into the main chat box and focuses it -- the requested shortcut for tagging
   someone straight from their context menu instead of hand-typing "@" and their name. Always
   targets the main room composer, which every entry point that can open this menu (online list,
   friends list, leaderboard, threads board, chat log) can reach -- but the threads board and
   leaderboard are full-screen takeovers on mobile that hide the composer entirely (see
   threadToggleBtn/closeLeaderboard), so tagging from inside either of them first switches back to
   the chat view -- same toggle those panels' own close buttons use -- otherwise the mention would
   land in a box nobody can see. Inserts at the cursor rather than always appending, and
   adds a leading space only if the text before the cursor needs one, so tagging mid-sentence
   doesn't run words together or clobber whatever was already being typed. */
function tagInChat(name) {
  if (!msg) return;
  if (gcRoot.classList.contains('mobile-threads-open') && threadToggleBtn) threadToggleBtn.click();
  if (gcRoot.classList.contains('leaderboard-open')) closeLeaderboard();
  if (gcRoot.classList.contains('admin-open')) closeAdminPanel();
  if (grOpen()) closeGameRoom();
  var v = msg.value;
  var s = typeof msg.selectionStart === 'number' ? msg.selectionStart : v.length;
  var e = typeof msg.selectionEnd === 'number' ? msg.selectionEnd : v.length;
  var before = v.slice(0, s);
  var needsSpace = before.length > 0 && !/\s$/.test(before);
  var insert = (needsSpace ? ' ' : '') + '@' + name + ' ';
  msg.value = before + insert + v.slice(e);
  var newPos = (before + insert).length;
  closeMention();
  msg.focus();
  msg.selectionStart = msg.selectionEnd = newPos;
}
function openMenu(id, anchor, fallbackName) {
var online = !!people[id];
/* Reachable (can still receive a whisper) is a wider set than online (live in the room right now)
   -- it also includes anyone seen within the last RECENT_GRACE_MS, so a phone that just dropped its
   connection doesn't lock you out of even starting a whisper to them. See recentPeopleEntries. */
var recent = recentPeopleEntries()[id];
var reachable = online || !!recent;
var name = (online && people[id].name) || (recent && recent.name) || (friends[id] && friends[id].name) || fallbackName; if (!name) return;
var items = [];
items.push(['Get Info', function () { showInfo(id, name); }]);
/* Whisper goes through tryWhisper: friends (and admins) open straight away; anyone else is
   offered a friend request instead, unless that person has opened their whispers to everyone. */
if (reachable && !blocked[id]) items.push(['Whisper', function () { tryWhisper(id, name, true); }]);
if (reachable && !blocked[id]) items.push(['Tag in Chat', function () { tagInChat(name); }]);
/* Sharing someone's card does not require them to be reachable -- you are sending a pointer to a
   person, not a message to them, and the card resolves from whoever the reader can see. */
if (id !== me.id) items.push(['Send Their Card To\u2026', function () { shareUserWith(id, name); }]);
if (id !== me.id) items.push(['Start a Group With\u2026', function () { startGroup(id); }]);
/* Admins can't be blocked -- by anyone, admins included (the blocks insert policy enforces it too). */
if (blocked[id]) items.push(['Unblock', function () { unblock(id); }]); else if (!isAdminId(id)) items.push(['Block', function () { block(id, name); }]);
items.push(['Report', async function () { var rr = await showPromptModal('Report ' + name, { placeholder: 'e.g. spam, harassment', maxLength: 300 }); if (rr) report(id, name, rr); }]);
var incomingReqId = friends[id] ? null : incomingRequestIdFrom(id);
if (friends[id]) items.push(['Remove Friend', function () { removeFriend(id, name); }]);
else if (incomingReqId) items.push(['Accept Friend Request', function () { acceptFriendRequest(incomingReqId, id, name); }]);
else if (outgoingPending[id]) items.push(['Friend Request Sent', function () { addSys('Your friend request to ' + name + ' is still pending.'); }]);
else items.push(['Add Friend', function () { sendFriendRequest(id, name); }]);
if (friends[id]) items.push(['Move to Group', async function () { var g = await showPromptModal('Move to Group', { value: friends[id].group || '', placeholder: 'blank for none', maxLength: 40 }); if (g !== null) moveFriendGroup(id, g); }]);
/* Kick/Mute/Unmute don't require the target to still be online — most of the time an admin is
   acting on something said in the chat log by someone who has since left the room. */
if (isAdmin && mutedUsers[id]) items.push(['Unmute', function () { unmute(id, name); }]);
if (isAdmin && !mutedUsers[id]) items.push(['Mute', function () { muteUser(id, name); }, 'danger']);
if (isAdmin) items.push(['Kick', function () { var r = prompt('Reason for kicking ' + name + '? (optional)'); if (r !== null) kick(id, name, r); }, 'danger']);
menu.innerHTML = '<div class="hd">' + avatarHtml(id, name, 'ava-menu') + '<span class="hd-name' + (isAdminId(id) ? ' admin' : '') + '">' + esc(name) + '</span>' + levelBadgeHtml(id) + '</div>' + items.map(function (it, i) { return '<button type="button" role="menuitem" class="' + (it[2] || '') + '" data-i="' + i + '">' + it[0] + '</button>'; }).join('');
menu.querySelectorAll('button').forEach(function (b) { b.onclick = function () { closeMenu(); items[+b.dataset.i][1](); }; });
menu.classList.add('open');
var r = anchor.getBoundingClientRect();
menu.style.top = Math.max(4, Math.min(r.bottom + 2, window.innerHeight - menu.offsetHeight - 4)) + 'px';
menu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4)) + 'px';
menu.querySelector('button').focus();
}
ulist.onclick = function (e) {
var d = e.target.closest('div[data-id]'); if (!d || d.dataset.id === me.id) return;
e.stopPropagation(); openMenu(d.dataset.id, d);
};
ulist.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ulist.onclick(e); } };
if (flist) {
flist.onclick = function (e) {
var d = e.target.closest('div[data-id]'); if (!d) return;
e.stopPropagation(); openMenu(d.dataset.id, d);
};
flist.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flist.onclick(e); } };
}
document.addEventListener('click', function (e) { if (!menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
/* Click a name right in the chat log to bring up the same menu (Whisper/Block/Report/Friend, plus
   Kick/Mute for admins) — no need to go hunting for them in the Online list first. */
log.onclick = function (e) {
if (Date.now() < suppressClickUntil) return; // this click is the tail end of a long-press that already acted
var img = e.target.closest('img.gif'); if (img) { openLightbox(img.src); return; }
var rpt = e.target.closest('.rpt-msg[data-mid]'); if (rpt) { e.stopPropagation(); reportMessage(rpt.dataset.mid); return; }
var rpill = e.target.closest('.react-pill'); if (rpill) { e.stopPropagation(); var rc2 = rpill.closest('.reactions'); toggleReaction(rc2.dataset.rtype, Number(rc2.dataset.rid), rpill.dataset.emoji); return; }
var b = e.target.closest('.who[data-id]'); if (!b || b.dataset.id === me.id) return;
e.stopPropagation(); openMenu(b.dataset.id, b, b.dataset.name);
};
log.addEventListener('keydown', function (e) {
if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.closest('.who[data-id]')) return;
e.preventDefault(); log.onclick(e);
});

/* ---------- block / unblock (personal) ---------- */
async function loadBlocks() {
var r = await sb.from('blocks').select('blocked_id, blocked_name'); if (r.error) return;
blocked = {}; r.data.forEach(function (b) { blocked[b.blocked_id] = b.blocked_name || '?'; });
}
async function block(id, name) {
if (isAdminId(id)) { addSys(name + ' is an admin — admins can’t be blocked. Use Report if something is wrong.'); return; }
var r = await sb.from('blocks').insert({ blocker_id: me.id, blocked_id: id, blocked_name: name });
if (r.error) { addSys('Could not block: ' + r.error.message); return; }
blocked[id] = name;
destroyWin(id);
addSys('You have blocked ' + name + '. Their words no longer reach you.');
renderPeople();
}
async function unblock(id) {
var name = blocked[id] || (people[id] && people[id].name) || 'them';
var r = await sb.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', id);
if (r.error) { addSys('Could not unblock: ' + r.error.message); return; }
delete blocked[id]; addSys('You have unblocked ' + name + '.'); renderPeople();
}

/* ---------- report abuse ----------
   messageId/messageBody are optional -- present only when the report was filed by tapping the 🚩
   on a specific message (reportMessage below), so the admin queue can show exactly what was said
   instead of just a name and a freeform reason. See supabase/report_message_feature.sql for the
   columns this writes to. */
async function report(id, name, reason, messageId, messageBody) {
var row = { reporter_id: me.id, reporter_name: me.name, reported_id: id, reported_name: name, reason: sanitizeInput(reason).slice(0, 300) };
if (messageId) { row.message_id = messageId; row.message_body = sanitizeInput(messageBody || '').slice(0, 500); }
var r = await sb.from('reports').insert(row);
if (r.error) { addSys('Could not send report: ' + r.error.message); return; }
addSys('Report sent. Thank you — an admin will review it.');
}
/* Tapping 🚩 on a specific message (room or whisper) -- lets you point at exactly which message
   you're reporting instead of just naming the person and describing it from memory. Pulls the
   original text from msgCache (populated in renderRoom/renderIM) rather than the rendered HTML,
   so what gets attached is the real message, not a formatted/escaped copy of it. */
async function reportMessage(mid) {
var mm = msgCache[mid]; if (!mm) return;
if (mm.senderId === me.id) { addSys('You cannot report your own message.'); return; }
var quote = mm.body.length > 140 ? mm.body.slice(0, 140) + '…' : mm.body;
var rr = await showPromptModal('Report ' + mm.senderName, { placeholder: 'e.g. spam, harassment', hint: 'Reporting this message: “' + quote + '”', maxLength: 300 });
if (rr) report(mm.senderId, mm.senderName, rr, mid, mm.body);
}

/* ---------- report a bug ----------
   Reachable from the same popover as "Change picture" (#statusPopover), for any signed-on player
   -- unlike report()/the reports queue above, this isn't admin-gated at all on the filing side.
   Free text (bugDesc) plus up to MAX_BUG_ATTACHMENTS attachments: screenshots or a short screen
   recording the reporter already has on their device, picked via bugFile and uploaded to the
   'bug-reports' storage bucket the moment each one is chosen -- the same "upload immediately, hold
   onto just the URL" shape uploadImage/uploadAvatar already use below, so Send only ever has to
   write one row (see supabase/bug_reports_feature.sql), never wait on an upload itself.
   There's deliberately no in-page screenshot/recording capture here: no permission-free way to
   grab either from JS on mobile exists, so this is a file picker, same as every other attachment
   flow in this app.
   context is auto-captured (browser + viewport) rather than asked for -- exactly the kind of
   detail a bug report always needs and a reporter always forgets to mention. */
function bugKindFor(file) {
if (file.type === 'video/mp4' || file.type === 'video/quicktime' || file.type === 'video/webm') return 'video';
if (/\.(mp4|mov|webm)$/i.test(file.name || '')) return 'video';
return 'image'; // includes HEIC/blank-type files -- normalizeImageFile/sniffImageType below sort those out
}
async function uploadBugAttachment(file) {
var kind = bugKindFor(file), contentType, ext;
if (kind === 'image') {
try { file = await normalizeImageFile(file); } catch (e) { addSys(e.message || 'Could not read that photo.'); return null; }
if (file.size > MAX_IMG_BYTES) { addSys('Screenshots must be 5MB or smaller.'); return null; }
contentType = ALLOWED_IMG_TYPES[file.type] ? file.type : await sniffImageType(file);
ext = ALLOWED_IMG_TYPES[contentType];
if (!ext) { addSys('Screenshots must be JPG, PNG, GIF, or WEBP.'); return null; }
} else {
if (file.size > MAX_BUG_ATTACH_BYTES) { addSys('Recordings must be 25MB or smaller.'); return null; }
var VIDEO_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
ext = VIDEO_EXT[file.type] || ((file.name || '').match(/\.(mp4|mov|webm)$/i) || [])[1] || 'mp4';
contentType = file.type || (ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4');
}
var path = me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
var up = await sb.storage.from('bug-reports').upload(path, file, { contentType: contentType, upsert: false });
if (up.error) { addSys('Attachment upload failed: ' + up.error.message); return null; }
var pub = sb.storage.from('bug-reports').getPublicUrl(path);
var url = pub.data && pub.data.publicUrl;
if (!url) { addSys('Attachment upload failed.'); return null; }
/* the bucket is private now: url is kept for older readers, path is what admins sign; preview is
   a local blob URL for the composer's own thumbnail and never leaves this page */
return { url: url, path: path, type: kind, name: file.name || ('attachment.' + ext), preview: kind === 'image' ? URL.createObjectURL(file) : '' };
}
function renderBugAttachList() {
if (!bugAttachList) return;
bugAttachList.innerHTML = bugAttachments.map(function (a, i) {
var thumb = a.type === 'image' ? '<img src="' + esc(a.preview || a.url) + '" alt="">' : '<span class="bug-attach-video">🎥</span>';
return '<div class="bug-attach-chip" data-i="' + i + '">' + thumb + '<span class="bug-attach-name">' + esc(a.name) + '</span>' +
'<button type="button" class="bug-attach-remove" data-i="' + i + '" aria-label="Remove attachment">✕</button></div>';
}).join('');
}
function resetBugReportForm() {
if (bugDesc) bugDesc.value = '';
bugAttachments = [];
renderBugAttachList();
if (bugFile) bugFile.value = '';
}
function openBugReportModal() {
if (!bugReportOverlay || !me) return;
resetBugReportForm();
bugReportOverlay.classList.remove('hidden');
autoFocus(bugDesc);
}
function closeBugReportModal() { if (bugReportOverlay) bugReportOverlay.classList.add('hidden'); }
if (bugBtn) bugBtn.onclick = openBugReportModal;
if (bugReportCancel) bugReportCancel.onclick = closeBugReportModal;
if (bugReportOverlay) bugReportOverlay.onclick = function (e) { if (e.target === bugReportOverlay) closeBugReportModal(); };
if (bugAttachBtn) bugAttachBtn.onclick = function () {
if (bugAttachments.length >= MAX_BUG_ATTACHMENTS) { addSys('You can attach up to ' + MAX_BUG_ATTACHMENTS + ' files.'); return; }
bugFile.click();
};
if (bugFile) bugFile.onchange = async function () {
var files = Array.prototype.slice.call(bugFile.files || []);
bugFile.value = '';
if (!files.length) return;
var room = MAX_BUG_ATTACHMENTS - bugAttachments.length;
if (room <= 0) { addSys('You can attach up to ' + MAX_BUG_ATTACHMENTS + ' files.'); return; }
if (files.length > room) { addSys('Only attaching the first ' + room + ' -- ' + MAX_BUG_ATTACHMENTS + ' max per report.'); files = files.slice(0, room); }
bugAttachBtn.disabled = true;
for (var i = 0; i < files.length; i++) {
var att = await uploadBugAttachment(files[i]);
if (att) { bugAttachments.push(att); renderBugAttachList(); }
}
bugAttachBtn.disabled = false;
};
if (bugAttachList) bugAttachList.addEventListener('click', function (e) {
var rBtn = e.target.closest('.bug-attach-remove'); if (!rBtn) return;
bugAttachments.splice(Number(rBtn.dataset.i), 1);
renderBugAttachList();
});
async function submitBugReport() {
var desc = sanitizeInput(bugDesc ? bugDesc.value.trim() : '').slice(0, 1000);
if (!desc) { addSys('Describe what went wrong before sending.'); if (bugDesc) bugDesc.focus(); return; }
if (bugReportSubmit) bugReportSubmit.disabled = true;
try {
var context = navigator.userAgent + ' — ' + window.innerWidth + 'x' + window.innerHeight;
var stored = bugAttachments.map(function (a) { return { url: a.url, path: a.path, type: a.type, name: a.name }; }); // no blob previews in the row
var row = { reporter_id: me.id, reporter_name: me.name, description: desc, attachments: stored, context: context };
var r = await sb.from('bug_reports').insert(row);
if (r.error) { addSys('Could not send bug report: ' + r.error.message); return; }
closeBugReportModal();
addSys('Bug report sent. Thank you!');
} finally {
if (bugReportSubmit) bugReportSubmit.disabled = false;
}
}
if (bugReportSubmit) bugReportSubmit.onclick = submitBugReport;

/* ---------- bug reports queue (admins only) ----------
   Same shape as the abuse-reports queue just below: a badge on a status-bar button, a modal
   listing open reports, resolving actions on each row -- just Resolve/Dismiss instead of
   Dismiss/Discipline, since a bug report doesn't point at a person to act on. */
/* ---------- the admin Reports page (v108) ----------
   User reports and bug reports share one full-page takeover (#adminPanel, two tabs) and one 🛡️
   item in the ⋯ menu, whose badge is the sum of both open counts. The counts come from HEAD
   count queries; those were seen returning a transient 503 right after sign-on (diagnostics,
   17 Sept), which used to leave the badge silently at 0 -- so each one now retries once. */
var openCounts = { users: 0, bugs: 0, ideas: 0 };
function countOpen(table, attempt) {
return sb.from(table).select('id', { count: 'exact', head: true }).eq('status', 'open').then(function (r) {
if (r.error && !attempt) return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return countOpen(table, 1); });
return r.error ? null : (r.count || 0);
});
}
function paintAdminCounts() {
var total = openCounts.users + openCounts.bugs + openCounts.ideas;
if (reportsBadge) { reportsBadge.textContent = String(total > 99 ? '99+' : total); reportsBadge.classList.toggle('hidden', total === 0); }
if (admUsersCount) { admUsersCount.textContent = String(openCounts.users); admUsersCount.classList.toggle('hidden', !openCounts.users); }
if (admBugsCount) { admBugsCount.textContent = String(openCounts.bugs); admBugsCount.classList.toggle('hidden', !openCounts.bugs); }
if (admIdeasCount) { admIdeasCount.textContent = String(openCounts.ideas); admIdeasCount.classList.toggle('hidden', !openCounts.ideas); }
}
function refreshBugReportsBadge() {
if (!isAdmin || !sb) return;
countOpen('bug_reports').then(function (n) { if (n !== null) { openCounts.bugs = n; paintAdminCounts(); } });
}
function adminOpen() { return !!(gcRoot && gcRoot.classList.contains('admin-open')); }
function showAdminTab(which) {
var tabs = { users: [admTabUsers, admUsers], bugs: [admTabBugs, admBugs], ideas: [admTabIdeas, admIdeas] };
if (!tabs[which]) which = 'users';
Object.keys(tabs).forEach(function (k) {
var tab = tabs[k][0], pane = tabs[k][1], on = k === which;
if (tab) { tab.classList.toggle('active', on); tab.setAttribute('aria-selected', on ? 'true' : 'false'); }
if (pane) pane.classList.toggle('hidden', !on);
});
if (which === 'users') loadReports(); else if (which === 'bugs') loadBugReports(); else loadIdeas();
}
function openAdminPanel(which) {
if (!isAdmin || !adminPanel) return;
closeGif();
if (grOpen()) closeGameRoom();
if (gcRoot.classList.contains('mobile-threads-open')) threadToggleBtn.click();
if (gcRoot.classList.contains('mobile-roulette-open')) closeMobileRoulette();
if (gcRoot.classList.contains('leaderboard-open')) closeLeaderboard();
rememberChatScroll();
gcRoot.classList.add('admin-open');
if (adminWatermark) adminWatermark.textContent = WATERMARK_TEXT;
showAdminTab(which || (openCounts.users ? 'users' : openCounts.bugs ? 'bugs' : openCounts.ideas ? 'ideas' : 'users'));
}
function closeAdminPanel() {
if (!adminOpen()) return;
gcRoot.classList.remove('admin-open');
returnToChat();
}
var adminWatermark = $('adminWatermark');
if (adminBack) adminBack.onclick = closeAdminPanel;
if (admTabUsers) admTabUsers.onclick = function () { showAdminTab('users'); };
if (admTabBugs) admTabBugs.onclick = function () { showAdminTab('bugs'); };
if (admTabIdeas) admTabIdeas.onclick = function () { showAdminTab('ideas'); };
function renderBugReports(rows) {
if (!bugReportsList) return;
if (!rows.length) { bugReportsList.innerHTML = '<div class="empty">No open bug reports.</div>'; return; }
bugReportsList.innerHTML = rows.map(function (r) {
var when = fmtDateTime(r.created_at);
var atts = Array.isArray(r.attachments) ? r.attachments : [];
/* The bug-reports bucket is private (hardening_2026_09_17.sql): the stored url no longer opens on
   its own, so each attachment is drawn with its object path and resolved to a signed URL right
   after the list is painted -- see signBugAttachments below. */
var attHtml = atts.length ? '<div class="rr-attachments">' + atts.map(function (a) {
var path = bugAttachmentPath(a);
return a.type === 'video'
? '<a href="#" data-path="' + esc(path) + '" target="_blank" rel="noopener" class="rr-att rr-att-video" title="' + esc(a.name || 'recording') + '">🎥</a>'
: '<a href="#" data-path="' + esc(path) + '" target="_blank" rel="noopener" class="rr-att"><img data-path="' + esc(path) + '" alt="' + esc(a.name || 'screenshot') + '"></a>';
}).join('') + '</div>' : '';
var ctx = r.context ? '<div class="rr-context">' + esc(r.context) + '</div>' : '';
return '<div class="report-row" data-id="' + r.id + '">' +
'<div class="rr-hd">' + esc(when) + ' — <b>' + esc(r.reporter_name || '?') + '</b></div>' +
'<div class="rr-reason">' + esc(r.description) + '</div>' +
attHtml + ctx +
'<div class="rr-actions"><button type="button" class="btn rr-dismiss" data-id="' + r.id + '">Dismiss</button>' +
'<button type="button" class="btn rr-resolve" data-id="' + r.id + '">Resolve</button></div>' +
'</div>';
}).join('');
signBugAttachments();
}
/* An attachment row stores the object path from v108 on; older rows only have the old public URL,
   whose tail after "bug-reports/" is that same path. */
function bugAttachmentPath(a) {
if (a.path) return a.path;
var m = String(a.url || '').match(/\/bug-reports\/(.+)$/);
return m ? decodeURIComponent(m[1]) : '';
}
async function signBugAttachments() {
if (!bugReportsList) return;
var els = Array.prototype.slice.call(bugReportsList.querySelectorAll('[data-path]'));
var paths = []; els.forEach(function (el) { var p = el.dataset.path; if (p && paths.indexOf(p) < 0) paths.push(p); });
if (!paths.length) return;
var r = await sb.storage.from('bug-reports').createSignedUrls(paths, 3600);
if (r.error || !r.data) return;
var byPath = {}; r.data.forEach(function (x) { if (x.signedUrl && x.path) byPath[x.path] = x.signedUrl; });
els.forEach(function (el) {
var u = byPath[el.dataset.path]; if (!u) return;
if (el.tagName === 'IMG') el.src = u; else el.href = u;
});
}
async function loadBugReports() {
if (!isAdmin || !bugReportsList) return;
var r = await sb.from('bug_reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100);
if (r.error) { bugReportsList.innerHTML = '<div class="empty">Could not load bug reports: ' + esc(r.error.message) + '</div>'; return; }
renderBugReports(r.data || []);
}
async function resolveBugReport(id, status) {
var r = await sb.from('bug_reports').update({ status: status, resolved_by: me.id, resolved_at: new Date().toISOString() }).eq('id', id);
if (r.error) { addSys('Could not update the bug report: ' + r.error.message); return; }
var row = bugReportsList && bugReportsList.querySelector('.report-row[data-id="' + id + '"]');
if (row) row.remove();
if (bugReportsList && !bugReportsList.querySelector('.report-row')) bugReportsList.innerHTML = '<div class="empty">No open bug reports.</div>';
refreshBugReportsBadge();
}
if (bugReportsList) {
bugReportsList.addEventListener('click', function (e) {
var dBtn = e.target.closest('.rr-dismiss');
if (dBtn) { resolveBugReport(dBtn.dataset.id, 'dismissed'); return; }
var rBtn = e.target.closest('.rr-resolve');
if (rBtn) resolveBugReport(rBtn.dataset.id, 'resolved');
});
}
function subscribeBugReports() {
if (bugReportsChannel || !isAdmin) return;
bugReportsChannel = sb.channel('bug-reports-queue');
bugReportsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bug_reports' }, function () {
refreshBugReportsBadge();
if (adminOpen()) loadBugReports();
});
bugReportsChannel.subscribe();
}
function unsubscribeBugReports() {
if (bugReportsChannel) { bugReportsChannel.unsubscribe(); bugReportsChannel = null; }
}

/* ---------- the suggestion box (v172) ----------
   The light-bulb Suggestions button (first in the Help group, beside Report a bug) opens a box for ideas:
   words, plus up to five pictures or videos. Each file goes up the moment it is picked, into the private
   'suggestions' bucket (your own folder); Send writes one row to public.suggestions. The server takes the
   author's name from their profile, starts every suggestion open, checks every attachment is the author's
   own upload, and allows 5 in 10 minutes / 20 a day (supabase/suggestions_feature.sql). Admins read them on
   the Reports page, in the Suggestions tab below, with pictures and videos shown right in the list.
   Problems are shown inside the box itself, not in the chat behind it. */
var ideaBtn = $('ideaBtn'), ideaOverlay = $('ideaOverlay'), ideaText = $('ideaText'), ideaFile = $('ideaFile'), ideaAttachBtn = $('ideaAttachBtn'),
    ideaAttachHint = $('ideaAttachHint'), ideaAttachList = $('ideaAttachList'), ideaErr = $('ideaErr'), ideaCancel = $('ideaCancel'), ideaSubmit = $('ideaSubmit');
var MAX_IDEA_ATTACHMENTS = 5, MAX_IDEA_VIDEO_BYTES = 50 * 1024 * 1024;
var IDEA_VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
var ideaAttachments = [], ideaUploading = 0, ideaChannel = null;
function ideaSay(text) { if (!ideaErr) { if (text) addSys(text); return; } ideaErr.textContent = text || ''; ideaErr.classList.toggle('hidden', !text); }
function ideaKindFor(file) { return /^video\//.test(file.type || '') || /\.(mp4|m4v|mov|webm|3gp|mkv|avi)$/i.test(file.name || '') ? 'video' : 'image'; }
async function uploadIdeaAttachment(file) {
var kind = ideaKindFor(file), contentType, ext;
if (kind === 'image') {
try { file = await normalizeImageFile(file); } catch (e) { ideaSay(e.message || 'Could not read that picture.'); return null; }
if (file.size > MAX_IMG_BYTES) { ideaSay('Pictures must be 5 MB or smaller.'); return null; }
contentType = ALLOWED_IMG_TYPES[file.type] ? file.type : await sniffImageType(file);
ext = ALLOWED_IMG_TYPES[contentType];
if (!ext) { ideaSay('Pictures must be JPG, PNG, GIF or WEBP.'); return null; }
} else {
var nameExt = ((file.name || '').match(/\.(mp4|m4v|mov|webm)$/i) || [])[1];
ext = IDEA_VIDEO_TYPES[file.type] || (nameExt ? (nameExt.toLowerCase() === 'm4v' ? 'mp4' : nameExt.toLowerCase()) : '');
if (!ext) { ideaSay('Videos must be MP4, MOV or WEBM.'); return null; }
if (file.size > MAX_IDEA_VIDEO_BYTES) { ideaSay('Videos must be 50 MB or smaller (' + Math.round(file.size / 1048576) + ' MB).'); return null; }
contentType = ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';
}
var path = me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.' + ext;
var up = await sb.storage.from('suggestions').upload(path, file, { contentType: contentType, upsert: false });
if (up.error) { ideaSay('Upload failed: ' + up.error.message); return null; }
return { path: path, type: kind, name: (file.name || ('attachment.' + ext)).slice(0, 120), preview: kind === 'image' ? URL.createObjectURL(file) : '' };
}
function renderIdeaAttachList() {
if (ideaAttachList) ideaAttachList.innerHTML = ideaAttachments.map(function (a, i) {
var thumb = a.type === 'image' ? '<img src="' + esc(a.preview) + '" alt="">' : '<span class="bug-attach-video">🎥</span>';
return '<div class="bug-attach-chip" data-i="' + i + '">' + thumb + '<span class="bug-attach-name">' + esc(a.name) + '</span>' +
'<button type="button" class="bug-attach-remove" data-i="' + i + '" aria-label="Remove attachment">✕</button></div>';
}).join('');
var busy = ideaUploading > 0;
if (ideaAttachBtn) { ideaAttachBtn.disabled = busy; ideaAttachBtn.textContent = busy ? 'Uploading…' : '📎 Attach files'; }
if (ideaSubmit) ideaSubmit.disabled = busy;
if (ideaAttachHint) ideaAttachHint.textContent = busy ? 'Big videos take a moment' : 'Pictures or videos, up to ' + MAX_IDEA_ATTACHMENTS;
}
function resetIdeaForm() {
if (ideaText) ideaText.value = '';
ideaAttachments.forEach(function (a) { if (a.preview) { try { URL.revokeObjectURL(a.preview); } catch (e) {} } });
ideaAttachments = [];
if (ideaFile) ideaFile.value = '';
ideaSay('');
renderIdeaAttachList();
}
function openIdeaModal() {
if (!ideaOverlay || !me) return;
if (!ideaUploading) resetIdeaForm();
ideaOverlay.classList.remove('hidden');
autoFocus(ideaText);
}
function closeIdeaModal() { if (ideaOverlay) ideaOverlay.classList.add('hidden'); }
if (ideaBtn) ideaBtn.onclick = openIdeaModal; // (a click inside the ⋯ popover already closes it)
if (ideaCancel) ideaCancel.onclick = closeIdeaModal;
if (ideaOverlay) ideaOverlay.onclick = function (e) { if (e.target === ideaOverlay) closeIdeaModal(); };
if (ideaAttachBtn) ideaAttachBtn.onclick = function () {
if (ideaAttachments.length >= MAX_IDEA_ATTACHMENTS) { ideaSay('You can attach up to ' + MAX_IDEA_ATTACHMENTS + ' files.'); return; }
ideaFile.click();
};
if (ideaFile) ideaFile.onchange = async function () {
var files = Array.prototype.slice.call(ideaFile.files || []);
ideaFile.value = '';
if (!files.length) return;
ideaSay('');
var room = MAX_IDEA_ATTACHMENTS - ideaAttachments.length;
if (room <= 0) { ideaSay('You can attach up to ' + MAX_IDEA_ATTACHMENTS + ' files.'); return; }
if (files.length > room) { ideaSay('Only the first ' + room + ' were added: ' + MAX_IDEA_ATTACHMENTS + ' at most.'); files = files.slice(0, room); }
ideaUploading++; renderIdeaAttachList();
try {
for (var i = 0; i < files.length; i++) {
var att = await uploadIdeaAttachment(files[i]);
if (att) { ideaAttachments.push(att); renderIdeaAttachList(); }
}
} finally { ideaUploading--; renderIdeaAttachList(); }
};
if (ideaAttachList) ideaAttachList.addEventListener('click', function (e) {
var rBtn = e.target.closest('.bug-attach-remove'); if (!rBtn) return;
var gone = ideaAttachments.splice(Number(rBtn.dataset.i), 1)[0];
if (gone && gone.preview) { try { URL.revokeObjectURL(gone.preview); } catch (e2) {} }
renderIdeaAttachList();
});
async function submitIdea() {
if (ideaUploading) { ideaSay('Hang on: a file is still uploading.'); return; }
var body = sanitizeInput(ideaText ? ideaText.value.trim() : '').slice(0, 2000);
if (!body) { ideaSay('Write your idea before sending.'); if (ideaText) ideaText.focus(); return; }
if (ideaSubmit) ideaSubmit.disabled = true;
try {
var context = (navigator.userAgent + ' — ' + window.innerWidth + 'x' + window.innerHeight).slice(0, 400);
var stored = ideaAttachments.map(function (a) { return { path: a.path, type: a.type, name: a.name }; });
var r = await sb.from('suggestions').insert({ author_id: me.id, body: body, attachments: stored, context: context });
if (r.error) { ideaSay('Could not send it: ' + r.error.message); return; }
closeIdeaModal();
resetIdeaForm();
addSys('Suggestion sent to the admins. Thank you!');
} finally {
if (ideaSubmit) ideaSubmit.disabled = ideaUploading > 0;
}
}
if (ideaSubmit) ideaSubmit.onclick = submitIdea;

/* ----- the Suggestions tab (admins) ----- */
function refreshIdeasBadge() {
if (!isAdmin || !sb) return;
countOpen('suggestions').then(function (n) { if (n !== null) { openCounts.ideas = n; paintAdminCounts(); } });
}
function renderIdeas(rows) {
if (!ideasList) return;
if (!rows.length) { ideasList.innerHTML = '<div class="empty">No open suggestions.</div>'; return; }
ideasList.innerHTML = rows.map(function (r) {
var atts = Array.isArray(r.attachments) ? r.attachments : [];
/* the bucket is private: each file is drawn with its object path, and signed right after (signIdeaMedia) */
var media = atts.length ? '<div class="rr-attachments rr-media">' + atts.map(function (a) {
var p = esc(a.path || '');
return a.type === 'video'
? '<video class="rr-video" data-path="' + p + '" controls playsinline preload="metadata" title="' + esc(a.name || 'video') + '"></video>'
: '<a href="#" data-path="' + p + '" target="_blank" rel="noopener" class="rr-att"><img data-path="' + p + '" alt="' + esc(a.name || 'picture') + '"></a>';
}).join('') + '</div>' : '';
return '<div class="report-row" data-id="' + r.id + '">' +
'<div class="rr-hd">' + esc(fmtDateTime(r.created_at)) + ' — <b>' + esc(r.author_name || '?') + '</b></div>' +
'<div class="rr-reason">' + esc(r.body) + '</div>' + media +
(r.context ? '<div class="rr-context">' + esc(r.context) + '</div>' : '') +
'<div class="rr-actions"><button type="button" class="btn rr-dismiss" data-id="' + r.id + '">Dismiss</button>' +
'<button type="button" class="btn rr-resolve" data-id="' + r.id + '">Done</button></div>' +
'</div>';
}).join('');
signIdeaMedia();
}
async function signIdeaMedia() {
if (!ideasList) return;
var els = Array.prototype.slice.call(ideasList.querySelectorAll('[data-path]'));
var paths = []; els.forEach(function (el) { var p = el.dataset.path; if (p && paths.indexOf(p) < 0) paths.push(p); });
if (!paths.length) return;
var r = await sb.storage.from('suggestions').createSignedUrls(paths, 3600);
if (r.error || !r.data) return;
var byPath = {}; r.data.forEach(function (x) { if (x.signedUrl && x.path) byPath[x.path] = x.signedUrl; });
els.forEach(function (el) {
var u = byPath[el.dataset.path]; if (!u) return;
if (el.tagName === 'A') el.href = u; else el.src = u;
});
}
async function loadIdeas() {
if (!isAdmin || !ideasList) return;
var r = await sb.from('suggestions').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100);
if (r.error) { ideasList.innerHTML = '<div class="empty">Could not load suggestions: ' + esc(r.error.message) + '</div>'; return; }
renderIdeas(r.data || []);
}
async function resolveIdea(id, status) {
var r = await sb.from('suggestions').update({ status: status, resolved_by: me.id, resolved_at: new Date().toISOString() }).eq('id', id);
if (r.error) { addSys('Could not update the suggestion: ' + r.error.message); return; }
var row = ideasList && ideasList.querySelector('.report-row[data-id="' + id + '"]');
if (row) row.remove();
if (ideasList && !ideasList.querySelector('.report-row')) ideasList.innerHTML = '<div class="empty">No open suggestions.</div>';
refreshIdeasBadge();
}
if (ideasList) {
ideasList.addEventListener('click', function (e) {
var dBtn = e.target.closest('.rr-dismiss');
if (dBtn) { resolveIdea(dBtn.dataset.id, 'dismissed'); return; }
var rBtn = e.target.closest('.rr-resolve');
if (rBtn) resolveIdea(rBtn.dataset.id, 'done');
});
}
function subscribeIdeas() {
if (ideaChannel || !isAdmin) return;
ideaChannel = sb.channel('suggestions-queue');
ideaChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions' }, function () {
refreshIdeasBadge();
if (adminOpen() && admIdeas && !admIdeas.classList.contains('hidden')) loadIdeas();
});
ideaChannel.subscribe();
}
function unsubscribeIdeas() {
if (ideaChannel) { ideaChannel.unsubscribe(); ideaChannel = null; }
}

/* ---------- reports queue (admins only) ----------
   report() above already worked client-side; it just had nowhere to write to until the reports
   table existed (see supabase/reports_feature.sql). This is the review side: a badge on a
   status-bar button, a modal listing open reports, and Dismiss / Discipline actions right on each
   row -- the discipline picker below reuses the existing kick()/muteUser() (see further down,
   both now take an optional duration) rather than duplicating the bans/chat_moderation writes. */
var DISCIPLINE_OPTIONS = [
['warn', 'Warn only (no punishment)'],
['mute1h', 'Mute — 1 hour'],
['mute24h', 'Mute — 24 hours'],
['mutePerm', 'Mute — permanent'],
['ban24h', 'Kick — 24 hours'],
['ban7d', 'Kick — 7 days'],
['banPerm', 'Kick — permanent']
];
function humanDuration(ms) {
if (ms >= 86400000) { var d = Math.round(ms / 86400000); return d + ' day' + (d === 1 ? '' : 's'); }
var h = Math.round(ms / 3600000); return h + ' hour' + (h === 1 ? '' : 's');
}
/* Applies whichever tier the admin picked in a report row's <select> and then resolves the
   report as 'actioned'. 'warn' takes no punitive action at all -- it exists so an admin can
   close out a report that had merit without muting/banning, distinct from Dismiss (which implies
   the report didn't hold up). */
async function applyDiscipline(action, id, name, reportId) {
var HOUR = 3600000, DAY = 86400000;
switch (action) {
case 'warn': addSys('Noted -- ' + name + ' was warned (no punishment applied).'); break;
case 'mute1h': await muteUser(id, name, HOUR); break;
case 'mute24h': await muteUser(id, name, DAY); break;
case 'mutePerm': await muteUser(id, name); break;
case 'ban24h': await kick(id, name, 'Reported and kicked by ' + me.name, DAY); break;
case 'ban7d': await kick(id, name, 'Reported and kicked by ' + me.name, 7 * DAY); break;
case 'banPerm': await kick(id, name, 'Reported and banned by ' + me.name); break;
default: return;
}
resolveReport(reportId, 'actioned');
}
function refreshReportsBadge() {
if (!isAdmin || !sb) return;
countOpen('reports').then(function (n) { if (n !== null) { openCounts.users = n; paintAdminCounts(); } });
}
function renderReports(rows) {
if (!reportsList) return;
if (!rows.length) { reportsList.innerHTML = '<div class="empty">No open reports.</div>'; return; }
reportsList.innerHTML = rows.map(function (r) {
var when = fmtDateTime(r.created_at);
/* message_id/message_body are only present when the report came from the new 🚩 tap on a
   specific message (see reportMessage below) -- older reports and ones filed via /report or the
   name-menu Report item have neither, so this quote block just doesn't render for those. */
var quote = r.message_body ? '<div class="rr-msg">“' + esc(r.message_body) + '”</div>' : '';
return '<div class="report-row" data-id="' + r.id + '">' +
'<div class="rr-hd">' + esc(when) + ' — <b>' + esc(r.reporter_name || '?') + '</b> reported <b>' + esc(r.reported_name || '?') + '</b></div>' +
quote +
'<div class="rr-reason">' + esc(r.reason) + '</div>' +
'<div class="rr-actions"><button type="button" class="btn rr-dismiss" data-id="' + r.id + '">Dismiss</button>' +
'<select class="rr-select" data-id="' + r.id + '" aria-label="Disciplinary action for ' + esc(r.reported_name || 'this user') + '">' +
DISCIPLINE_OPTIONS.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
'</select>' +
'<button type="button" class="btn rr-apply" data-id="' + r.id + '" data-uid="' + esc(r.reported_id) + '" data-name="' + esc(r.reported_name || '') + '">Apply</button></div>' +
'</div>';
}).join('');
}
async function loadReports() {
if (!isAdmin || !reportsList) return;
var r = await sb.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100);
if (r.error) { reportsList.innerHTML = '<div class="empty">Could not load reports: ' + esc(r.error.message) + '</div>'; return; }
renderReports(r.data || []);
}
async function resolveReport(id, status) {
var r = await sb.from('reports').update({ status: status, resolved_by: me.id, resolved_at: new Date().toISOString() }).eq('id', id);
if (r.error) { addSys('Could not update the report: ' + r.error.message); return; }
var row = reportsList && reportsList.querySelector('.report-row[data-id="' + id + '"]');
if (row) row.remove();
if (reportsList && !reportsList.querySelector('.report-row')) reportsList.innerHTML = '<div class="empty">No open reports.</div>';
refreshReportsBadge();
}
if (reportsList) {
reportsList.addEventListener('click', function (e) {
var dBtn = e.target.closest('.rr-dismiss');
if (dBtn) { resolveReport(dBtn.dataset.id, 'dismissed'); return; }
var aBtn = e.target.closest('.rr-apply');
if (aBtn) {
var row = aBtn.closest('.report-row');
var sel = row && row.querySelector('.rr-select');
applyDiscipline(sel ? sel.value : 'warn', aBtn.dataset.uid, aBtn.dataset.name || 'them', aBtn.dataset.id);
}
});
}
if (reportsBtn) reportsBtn.onclick = function () { openAdminPanel(); };
function subscribeReports() {
if (reportsChannel || !isAdmin) return;
reportsChannel = sb.channel('reports-queue');
reportsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, function () {
refreshReportsBadge();
if (adminOpen()) loadReports();
});
reportsChannel.subscribe();
}
function unsubscribeReports() {
if (reportsChannel) { reportsChannel.unsubscribe(); reportsChannel = null; }
}

/* ---------- friends (a persistent, grouped buddy list, independent of the current room) ---------- */
async function loadFriends() {
var r = await sb.from('friends').select('friend_id, friend_name, group_name'); if (r.error) return;
friends = {}; r.data.forEach(function (f) { friends[f.friend_id] = { name: f.friend_name || '?', group: f.group_name || null }; });
}
async function removeFriend(id, name) {
var r = await sb.from('friends').delete().eq('owner_id', me.id).eq('friend_id', id);
if (r.error) { addSys('Could not remove friend: ' + r.error.message); return; }
delete friends[id]; addSys((name || 'They') + ' was removed from your friends list.'); renderPeople();
}
async function moveFriendGroup(id, group) {
var g = group || null;
var r = await sb.from('friends').update({ group_name: g }).eq('owner_id', me.id).eq('friend_id', id);
if (r.error) { addSys('Could not update group: ' + r.error.message); return; }
friends[id].group = g; addSys(friends[id].name + ' moved to ' + (g || 'Friends') + '.'); renderPeople();
}

/* ---------- friend requests: "Add Friend" needs the other person's say-so now, not just a click.
   See friend_requests_feature.sql for the table/RLS this all rests on, and the big comment there
   for the two-sided mirror-insert dance that turns an accepted request into a real friendship. */
async function loadFriendRequests() {
incomingRequests = {}; outgoingPending = {};
var inc = await sb.from('friend_requests').select('id, sender_id, sender_name, created_at, intro').eq('recipient_id', me.id).eq('status', 'pending');
if (!inc.error) inc.data.forEach(function (r) { incomingRequests[r.id] = { id: r.id, senderId: r.sender_id, senderName: r.sender_name || '?', createdAt: r.created_at, intro: r.intro || '' }; });
var out = await sb.from('friend_requests').select('id, recipient_id').eq('sender_id', me.id).eq('status', 'pending');
if (!out.error) out.data.forEach(function (r) { outgoingPending[r.recipient_id] = r.id; });
updateFriendReqBadge(); renderFriendReqPanel();
}
function subscribeFriendRequests() {
if (friendReqChannel) return;
friendReqChannel = sb.channel('friend-requests-' + me.id);
/* Someone sent ME a request -- straight into the inbox, live, the same way a whisper arrives. */
friendReqChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: 'recipient_id=eq.' + me.id }, function (p) {
var row = p.new; if (row.status !== 'pending') return;
incomingRequests[row.id] = { id: row.id, senderId: row.sender_id, senderName: row.sender_name || '?', createdAt: row.created_at, intro: row.intro || '' };
playSound('friendreq');
if (!dockOpen && dmBar) { dmBar.classList.remove('flash'); void dmBar.offsetWidth; dmBar.classList.add('flash'); }
notifyDesktop((row.sender_name || 'Someone') + ' wants to be friends', row.intro || 'Tap to see your friend requests', 'gc-friendreq-' + row.id, function () { openFriendReqPanel(); });
addSys((row.sender_name || 'Someone') + ' sent you a friend request. 🤝' + (row.intro ? ' “' + row.intro + '”' : ''));
updateFriendReqBadge(); renderFriendReqPanel();
});
/* A request I sent got answered elsewhere (their client, or my own other tab/device). Accepting
   is a two-sided mirror: THEIR client already inserted their half of `friends` before flipping
   this row to accepted (see acceptFriendRequest), so all my side has to do is insert my own half
   naming them -- the RLS on `friends` only ever lets me insert a row with owner_id = myself, which
   is exactly what this is. Declined/cancelled just needs the pending state cleared, quietly. */
friendReqChannel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_requests', filter: 'sender_id=eq.' + me.id }, function (p) {
var row = p.new; if (!outgoingPending[row.recipient_id] || outgoingPending[row.recipient_id] !== row.id) return;
delete outgoingPending[row.recipient_id];
if (row.status === 'accepted' && !friends[row.recipient_id]) {
sb.from('friends').insert({ owner_id: me.id, friend_id: row.recipient_id, friend_name: row.recipient_name || '?' }).then(function (r2) {
if (r2.error) return;
friends[row.recipient_id] = { name: row.recipient_name || '?', group: null };
addSys((row.recipient_name || 'They') + ' accepted your friend request!'); renderPeople();
});
}
});
/* Multi-tab/device tidiness: if the SAME account handles a request from somewhere else, drop it
   from this tab's inbox too instead of leaving a stale accept/decline row sitting there. */
friendReqChannel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_requests', filter: 'recipient_id=eq.' + me.id }, function (p) {
var row = p.new; if (row.status === 'pending' || !incomingRequests[row.id]) return;
delete incomingRequests[row.id]; updateFriendReqBadge(); renderFriendReqPanel();
});
friendReqChannel.subscribe();
}
function unsubscribeFriendRequests() {
if (friendReqChannel) { friendReqChannel.unsubscribe(); friendReqChannel = null; }
}
/* Shared by sendFriendRequest and the "Add Friend" menu item -- finds the pending incoming
   request (if any) from a given sender, so both places can offer "Accept" instead of sending a
   redundant second request in the other direction. */
function incomingRequestIdFrom(senderId) {
return Object.keys(incomingRequests).filter(function (k) { return incomingRequests[k].senderId === senderId; })[0] || null;
}
/* intro: an optional one-liner that travels with the request (<= 100 chars, see
   friends_only_whispers.sql). Passed in by tryWhisper's dialog; the plain "Add Friend" menu item
   asks for it here instead (undefined = ask, '' = deliberately none). */
async function sendFriendRequest(id, name, intro) {
if (friends[id]) { addSys(name + ' is already on your friends list.'); return; }
if (outgoingPending[id]) { addSys('You already sent ' + name + ' a friend request.'); return; }
var pendingFromThem = incomingRequestIdFrom(id);
if (pendingFromThem) {
addSys(name + ' already sent you a request -- accepting it instead.');
acceptFriendRequest(pendingFromThem, id, name);
return;
}
if (intro === undefined) {
intro = await showPromptModal('Add ' + name + ' as a friend', { placeholder: 'Say hi (optional)', maxLength: 100, hint: 'A line to go with your request. Once they accept, you can whisper each other.', okLabel: 'Send request' });
if (intro === null) return;
}
intro = sanitizeInput(intro || '').slice(0, 100);
var row = { sender_id: me.id, sender_name: me.name, recipient_id: id, recipient_name: name, status: 'pending' };
if (intro) row.intro = intro;
var r = await sb.from('friend_requests').insert(row).select().single();
if (r.error) {
if (r.error.code === '23505') addSys('You already sent ' + name + ' a friend request.');
else addSys('Could not send friend request: ' + r.error.message);
return;
}
outgoingPending[id] = r.data.id;
addSys('Friend request sent to ' + name + '.');
/* Same sender-side push as whispers use (see post): a closed phone still hears the knock. */
triggerPush(id, me.name + ' wants to be friends', intro || 'Tap to see your friend requests', 'gc-friendreq-' + me.id);
}
async function acceptFriendRequest(reqId, senderId, senderName) {
var req = incomingRequests[reqId]; var name = senderName || (req && req.senderName) || '?';
var fr = await sb.from('friends').insert({ owner_id: me.id, friend_id: senderId, friend_name: name });
if (fr.error) { addSys('Could not accept: ' + fr.error.message); return; }
var ur = await sb.from('friend_requests').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', reqId);
if (ur.error) { addSys('Added ' + name + ', but could not update the request: ' + ur.error.message); }
friends[senderId] = { name: name, group: null };
delete incomingRequests[reqId];
addSys('You and ' + name + ' are now friends.');
updateFriendReqBadge(); renderFriendReqPanel(); renderPeople();
}
async function declineFriendRequest(reqId) {
var ur = await sb.from('friend_requests').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', reqId);
if (ur.error) { addSys('Could not decline: ' + ur.error.message); return; }
delete incomingRequests[reqId];
updateFriendReqBadge(); renderFriendReqPanel();
}
/* Friend requests live at the top of the Messages inbox now (v107; see #frqSection in index.html)
   instead of behind their own floating 🤝 bell. The section only shows while something is
   waiting; its count, and the dock bar's badge (which adds pending requests to unread whispers),
   both come from here. syncDock() is what folds the count into the bar. */
function pendingRequestCount() { return Object.keys(incomingRequests).length; }
function updateFriendReqBadge() {
var n = pendingRequestCount();
if (frqSection) frqSection.classList.toggle('hidden', !n);
if (frqCount) frqCount.textContent = n > 9 ? '9+' : String(n);
syncDock();
}
/* "Open the requests" now means: expand the dock on its inbox, where the section sits first. */
function openFriendReqPanel() {
renderFriendReqPanel();
activeDm = null; dockOpen = true; saveDockOpen(); syncDock();
if (frqSection) frqSection.scrollIntoView({ block: 'start' });
}
function closeFriendReqPanel() {} // nothing separate to close any more; kept for the call sites
/* Renders the inbox list and wires up each row's swipe gesture -- right = accept, left = decline,
   matching the request, with Accept/Decline buttons on every row too since a swipe-only control
   would shut out a mouse user or anyone on a screen reader. */
function renderFriendReqPanel() {
if (!friendReqList) return;
var ids = Object.keys(incomingRequests).sort(function (a, b) { return new Date(incomingRequests[b].createdAt) - new Date(incomingRequests[a].createdAt); });
if (!ids.length) { friendReqList.innerHTML = ''; return; }
friendReqList.innerHTML = ids.map(function (reqId) {
var req = incomingRequests[reqId];
return '<div class="frq-row" data-req="' + esc(reqId) + '">' +
'<div class="frq-bg accept">✓ Accept</div><div class="frq-bg decline">✕ Decline</div>' +
'<div class="frq-content">' + avatarHtml(req.senderId, req.senderName) +
'<span class="frq-name">' + esc(req.senderName) + (req.intro ? '<span class="frq-intro">“' + esc(req.intro) + '”</span>' : '') + '</span>' +
'<span class="frq-actions"><button type="button" class="frq-accept">Accept</button><button type="button" class="frq-decline">Decline</button></span>' +
'</div></div>';
}).join('');
friendReqList.querySelectorAll('.frq-row').forEach(wireFriendReqRow);
}
var FRQ_SWIPE_THRESHOLD = 72;
function wireFriendReqRow(row) {
var reqId = row.dataset.req;
var content = row.querySelector('.frq-content'), bgAccept = row.querySelector('.frq-bg.accept'), bgDecline = row.querySelector('.frq-bg.decline');
function respond(accept) {
var req = incomingRequests[reqId];
row.style.transition = 'transform .18s ease, opacity .18s ease';
content.style.transform = 'translateX(' + (accept ? '120%' : '-120%') + ')';
row.style.opacity = '0';
setTimeout(function () { if (accept && req) acceptFriendRequest(reqId, req.senderId, req.senderName); else declineFriendRequest(reqId); }, 160);
}
row.querySelector('.frq-accept').onclick = function (e) { e.stopPropagation(); respond(true); };
row.querySelector('.frq-decline').onclick = function (e) { e.stopPropagation(); respond(false); };
var startX = null, dx = 0, dragging = false;
content.addEventListener('pointerdown', function (e) {
if (e.target.closest('button')) return;
startX = e.clientX; dx = 0; dragging = true; content.style.transition = 'none'; content.setPointerCapture(e.pointerId);
});
content.addEventListener('pointermove', function (e) {
if (!dragging) return;
dx = e.clientX - startX;
content.style.transform = 'translateX(' + dx + 'px)';
var t = Math.min(Math.abs(dx) / FRQ_SWIPE_THRESHOLD, 1);
bgAccept.style.opacity = dx > 0 ? String(t) : '0';
bgDecline.style.opacity = dx < 0 ? String(t) : '0';
});
function endDrag() {
if (!dragging) return;
dragging = false; content.style.transition = 'transform .18s ease';
if (dx > FRQ_SWIPE_THRESHOLD) respond(true);
else if (dx < -FRQ_SWIPE_THRESHOLD) { respond(false); }
else { content.style.transform = 'translateX(0)'; bgAccept.style.opacity = '0'; bgDecline.style.opacity = '0'; }
}
content.addEventListener('pointerup', endDrag);
content.addEventListener('pointercancel', endDrag);
}

/* ---------- kick (admins only; a kick is a ban) ---------- */
async function loadAdmin() {
var a = await sb.from('admins').select('user_id');
adminIds = {};
if (!a.error && a.data) a.data.forEach(function (x) { adminIds[x.user_id] = true; });
isAdmin = isAdminId(me.id);
if (isAdmin) {
/* Only pull currently-active bans/mutes -- a temp ban or temp mute that already expired
   shouldn't linger in these local maps (it would otherwise still show as banned/muted in the
   admin UI, and a stale ban entry would wrongly re-kick the person the moment they rejoin). */
var nowIso = new Date().toISOString();
var b = await sb.from('bans').select('user_id, banned_name, expires_at').or('expires_at.is.null,expires_at.gt.' + nowIso);
if (!b.error) b.data.forEach(function (x) { bans[x.user_id] = x; });
var mu = await sb.from('chat_moderation').select('user_id, user_name, muted, muted_permanent, muted_until, offense_count').eq('muted', true).or('muted_permanent.eq.true,muted_until.gt.' + nowIso);
if (!mu.error) mu.data.forEach(function (x) { mutedUsers[x.user_id] = x; });
if (reportsBtn) reportsBtn.classList.remove('hidden');
refreshReportsBadge();
subscribeReports();
refreshBugReportsBadge();
subscribeBugReports();
refreshIdeasBadge(); // v172
subscribeIdeas();
}
}
async function loadMyModeration() {
var r = await sb.from('chat_moderation').select('*').eq('user_id', me.id).maybeSingle();
if (r.error || !r.data) return;
var row = r.data;
applyModeration({
muted: !!row.muted, mutedPermanent: !!row.muted_permanent, offenseCount: row.offense_count || 0,
cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0,
mutedUntil: row.muted_until ? new Date(row.muted_until).getTime() : 0
});
}
/* ---------- unmute (admins only) ---------- */
async function unmute(id, name) {
var r = await sb.from('chat_moderation').update({ muted: false, muted_permanent: false, muted_until: null, cooldown_until: null, cooldown_seconds: 0, offense_count: 0, window_count: 0, window_start: null }).eq('user_id', id);
if (r.error) { addSys('Could not unmute: ' + r.error.message); return; }
delete mutedUsers[id]; addSys(name + ' has been unmuted.');
}
/* ---------- mute (admins only) — muting someone who has never tripped the spam filter has no
   row in chat_moderation yet, so this upserts one straight in. durationMs is optional: omitted
   (or falsy) means permanent, same as before; a duration sets muted_until instead and leaves
   muted_permanent false, so it lifts on its own (both gc_check_and_record_send() and the
   is_muted_or_cooling() RLS check honor muted_until the same way they already honor
   cooldown_until -- see supabase/disciplinary_actions_feature.sql). ---------- */
async function muteUser(id, name, durationMs) {
var permanent = !durationMs;
var untilIso = permanent ? null : new Date(Date.now() + durationMs).toISOString();
var r = await sb.from('chat_moderation').upsert({ user_id: id, user_name: name, muted: true, muted_permanent: permanent, muted_until: untilIso, muted_at: new Date().toISOString() }, { onConflict: 'user_id' });
if (r.error) { addSys('Could not mute: ' + r.error.message); return; }
mutedUsers[id] = { user_id: id, user_name: name, muted: true, muted_permanent: permanent, muted_until: untilIso };
addSys(name + ' has been muted' + (permanent ? '. Only an admin can lift it.' : ' for ' + humanDuration(durationMs) + '.'));
}
/* durationMs optional: omitted (or falsy) means a permanent ban (expires_at left null), same as
   before; a duration sets expires_at instead. Enforcement already fully honors expires_at
   server-side via public.is_banned() (see schema.sql) -- no migration needed for temp bans. */
async function kick(id, name, reason, durationMs) {
var expiresAt = durationMs ? new Date(Date.now() + durationMs).toISOString() : null;
var r = await sb.from('bans').upsert({ user_id: id, banned_name: name, reason: reason || null, banned_by: me.id, expires_at: expiresAt });
if (r.error) { addSys('Could not kick: ' + r.error.message); return; }
bans[id] = { user_id: id, banned_name: name, expires_at: expiresAt };
await channel.send({ type: 'broadcast', event: 'kick', payload: { user_id: id, name: name, reason: reason || '', by: me.name } });
addSys(name + ' has been ' + (expiresAt ? 'kicked for ' + humanDuration(durationMs) : 'banned permanently') + '.');
}
async function unban(id, name) {
var r = await sb.from('bans').delete().eq('user_id', id);
if (r.error) { addSys('Could not lift the ban: ' + r.error.message); return; }
delete bans[id]; addSys(name + ' may return.');
}
/* Shared teardown for "no longer in the room" -- an admin kick/ban and an idle timeout end up in
   exactly the same place (channel torn down, every panel that only makes sense while signed on
   hidden again, whisper windows closed, back on the login screen) and differ only in what they
   say and whether tapping back in should be immediate or blocked. Keeping one function for both
   means neither can quietly drift out of sync with the other as the room gains more signed-on-only
   UI over time -- something that would otherwise show up as, say, the threads bubble or the
   mobile watermark's layout (.gc-root.signed-on, see style.css) still thinking it's signed on
   after one path removed it and the other didn't. */
function leaveRoom(message, rejoinable) {
hideConnBar(); clearNewPill();
/* v169: signing off (or being removed) gives up a Game Room seat at once, rather than leaving it
   to the five-minute sweep -- best effort, the session may already be on its way out */
if (grMySeat && sb) { try { sb.rpc('table_leave', { p_table: grMySeat.table_id }).then(function () {}, function () {}); } catch (e) {} }
grUnsubscribe();
roomHistoryIn = false; // v166: no reading goes into a room that is not there (bellTick)
if (channel) { channel.unsubscribe(); channel = null; }
unsubscribeThreads();
unsubscribeReports();
if (reportsBtn) reportsBtn.classList.add('hidden');
if (reportsBadge) reportsBadge.classList.add('hidden');
unsubscribeBugReports();
unsubscribeIdeas();
unsubscribeFriendRequests();
closeFriendReqPanel();
incomingRequests = {}; outgoingPending = {};
if (bugBtn) bugBtn.classList.add('hidden');
if (bugReportOverlay) bugReportOverlay.classList.add('hidden');
if (ideaBtn) ideaBtn.classList.add('hidden');
if (ideaOverlay) ideaOverlay.classList.add('hidden');
if (gcRoot) gcRoot.classList.remove('admin-open');
if (threadsPanel) { threadsPanel.classList.remove('ready'); }
if (threadToggleBtn) { threadToggleBtn.classList.remove('ready', 'open'); threadToggleBtn.innerHTML = ICON_SPOOL; threadToggleBtn.setAttribute('aria-label', 'Open threads board'); }
if (gcRoot) { gcRoot.classList.remove('thread-open'); gcRoot.classList.remove('mobile-threads-open'); gcRoot.classList.remove('mobile-roulette-open'); gcRoot.classList.remove('leaderboard-open'); gcRoot.classList.remove('signed-on'); }
openThreadId = null;
placeThreadBtn(); // signed off: the threads takeover is gone, so the button belongs to .title again
/* Reaction/level caches are keyed off ids that only mean something while this particular room
   channel is live -- a stale "mine" flag surviving a kick/reconnect into a fresh join would show
   someone's OWN reaction state on whatever new message happens to reuse a cached target id. */
reactions = {}; userStats = {}; closeReactPicker();
clearTimeout(idleTimer);
clearTimeout(idleDisconnectTimer);
stopRecentPeopleHeartbeat();
log.classList.add('hidden'); $('users').classList.add('hidden'); $('compose').classList.add('hidden');
if ($('roomWatermark')) $('roomWatermark').classList.add('hidden');
if ($('statusBtn')) $('statusBtn').classList.add('hidden');
if ($('avaBtn')) $('avaBtn').classList.add('hidden');
if ($('saveBtn')) $('saveBtn').classList.add('hidden');
if ($('logoutBtn')) $('logoutBtn').classList.add('hidden');
if ($('moreBtn')) { $('moreBtn').classList.add('hidden'); closeMoreMenu(); }
if (st) { st.classList.remove('renamable'); st.removeAttribute('title'); }
Object.keys(wins).forEach(function (k) { wins[k].el.remove(); if (wins[k].tab) wins[k].tab.remove(); }); wins = {};
activeDm = null; if (dmDock) dmDock.classList.add('hidden'); syncDock(); // the Messages dock goes with the room
stopBallot();
Object.keys(typingRoom).forEach(function (k) { clearTimeout(typingRoom[k].timer); }); typingRoom = {};
Object.keys(typingSendState).forEach(function (k) { clearTimeout(typingSendState[k].stopTimer); }); typingSendState = {};
if ($('typingIndicator')) { $('typingIndicator').classList.add('hidden'); $('typingIndicator').textContent = ''; }
if ($('joinFields')) $('joinFields').classList.remove('hidden'); // undo restoreIdentity()'s auto-resume hiding, if it was mid-flight
if ($('loginTag')) $('loginTag').textContent = 'Stay awhile, and chat.'; // undo restoreIdentity()'s "Reconnecting as X…", if this is being shown after a successful auto-resume
$('login').classList.remove('hidden'); $('join').disabled = !rejoinable;
fail(message);
setStatus(rejoinable ? 'Not signed on' : 'Removed'); me = null;
}
function kicked(reason) {
leaveRoom('You have been removed from the room.' + (reason ? ' Reason: ' + reason : ''), false);
}
/* 30 minutes with no mouse/keyboard/touch/scroll activity at all -- see IDLE_DISCONNECT_MS above.
   Unlike a kick, this is nobody's fault and nothing stops the same person from walking straight
   back in, so the join button comes back enabled and the name box already shows "Enter as
   <name>" (restoreIdentity() set that once at page load and nothing here unlocks it again). */
function idleDisconnect() {
leaveRoom('You were disconnected after 30 minutes of inactivity. Tap in again whenever you’re ready.', true);
}

/* ---------- sending ---------- */
async function post(body, recipientId, recipientName, extra) {
var now = Date.now();
if (now - lastSend < 700) { return; } // gentle client-side throttle; the DB enforces its own too
if (moderation.muted) { updateComposeLock(); warnPopup(moderation.offenseCount, true, moderation.mutedPermanent, 0); return; }
if (moderation.cooldownUntil > now) { updateComposeLock(); return; }
lastSend = now;
var chk = await sb.rpc('gc_check_and_record_send', { p_name: me.name });
if (chk.error) { addSys('Your words were lost: ' + chk.error.message); return; }
var d = chk.data || {};
if (!d.ok) {
var cdUntil = d.retry_at ? new Date(d.retry_at).getTime() : (Date.now() + (d.cooldown_seconds || 0) * 1000);
applyModeration({ muted: d.reason === 'muted', mutedPermanent: !!d.permanent, offenseCount: d.offense_count || moderation.offenseCount, cooldownUntil: cdUntil, mutedUntil: d.muted_until ? new Date(d.muted_until).getTime() : 0 });
warnPopup(d.offense_count || moderation.offenseCount, d.reason === 'muted', !!d.permanent, d.cooldown_seconds || 0);
return;
}
/* main room chat is capped at 140; whispers and (v161) group lines keep 500 -- a group line has no
   recipientId, so it used to be cut to the room's 140 without a word */
var cap = (recipientId || (extra && extra.conversation_id)) ? 500 : 140;
var row = { room: C.ROOM || 'main', sender_id: me.id, sender_name: me.name, body: sanitizeInput(body).slice(0, cap) };
if (recipientId) { row.recipient_id = recipientId; row.recipient_name = recipientName; }
/* The reply target is read and cleared here, at the moment the message is actually accepted for
   sending, so a reply cannot leak onto the next thing you type if this send is refused. */
/* Each conversation keeps its own pending reply. A group line has no recipientId, so without
   its own key here it would pick up -- and consume -- the main room's reply target. */
var rkey = recipientId || (extra && extra.conversation_id ? 'g' + extra.conversation_id : 'room');
if (replyTo[rkey]) { row.reply_to = replyTo[rkey]; clearReplyTarget(rkey); }
/* extra carries columns that are not part of an ordinary line of text -- voice_path/voice_secs so
   far. It is merged after the rest, but it cannot smuggle in a different sender: sender_id and
   sender_name are pinned by the insert policy against the signed-in account, so a forged value
   here is refused by the database rather than trusted. */
if (extra) for (var k in extra) if (extra[k] != null) row[k] = extra[k];
var r = await sb.from('messages').insert(row).select().single();
if (r.error) {
/* A refused whisper gets its explanation in the whisper window it was typed in, in plain words
   (see whisperErrorText); everything else stays in the room log as before. */
if (extra && extra.conversation_id) imSys('g' + extra.conversation_id, 'Your words were lost: ' + r.error.message);
else if (!recipientId) addSys('Your words were lost: ' + r.error.message);
else if (wins[recipientId]) imSys(recipientId, whisperErrorText(r.error, recipientName));
else addSys(whisperErrorText(r.error, recipientName));
return;
}
messageSound(false); // v135
handleMessage(r.data); // show immediately; the realtime echo is de-duplicated by id
/* Kick off any push notifications this message should cause. This has to happen from the SENDER's
   client -- it's the only side guaranteed to be online right now -- which is also exactly why it
   can't simply mirror notifyDesktop's receiver-side "is my own tab hidden/unfocused" check: at
   send time we have no idea what state the recipient's browser (if it's even running at all) is
   in. That judgment call is made later, push-service-side, by the service worker's own push
   handler (see sw.js), which skips showing anything if it finds a focused window already open. */
if (recipientId) {
triggerPush(recipientId, me.name, notifPreview(row.body), 'gc-whisper-' + me.id);
} else if (row.conversation_id) {
/* v161: an @name in a group line only ever reaches someone IN the group. It used to go through the
   room's mention matching, which pushed the line's text to anyone named, group or not. Matched
   against the members themselves, so a member who is offline -- the one a push is for -- is found
   too. */
var gcid = row.conversation_id, gtitle = myGroups[gcid] && myGroups[gcid].title;
groupMentionedIds(gcid, row.body).forEach(function (id) {
triggerPush(id, me.name + ' mentioned you in ' + (gtitle ? '\u201C' + gtitle + '\u201D' : 'a group'), notifPreview(row.body), 'gc-group-' + gcid);
});
} else {
mentionedUserIds(row.body).forEach(function (id) {
triggerPush(id, me.name + ' mentioned you', notifPreview(row.body), 'gc-mention');
});
}
}

/* ---------- Tic-Tac-Toe in whispers (v109) ----------
   A game is a row in public.games (see supabase/tictactoe_feature.sql); every state change goes
   through one of four database functions -- game_respond / game_move / game_resign / game_cancel
   -- so the client only ever *asks* and repaints whatever comes back (or arrives over realtime).
   Each game is drawn as one card (.ttt-card) in the whisper window with the other player, keyed
   by game id, and repainted in place as the row changes. The person who was challenged plays X
   and moves first. Wins earn XP (3 a win, 1 each for a draw, capped at 15 a day server-side) --
   user_stats.xp / level move on their own via the existing realtime handler. */
var games = {};          // game id -> row
var gamesLoaded = false;
var TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function gamePeer(g) { return g.challenger_id === me.id ? g.opponent_id : g.challenger_id; }
function gamePeerName(g) { var pid = gamePeer(g); return (people[pid] && people[pid].name) || (wins[pid] && wins[pid].name) || (g.challenger_id === me.id ? g.opponent_name : g.challenger_name) || '?'; }
function gameMyPoints(g) { return g.challenger_id === me.id ? g.challenger_points : g.opponent_points; }
function gameWinningCells(board) {
for (var i = 0; i < TTT_LINES.length; i++) { var l = TTT_LINES[i]; if (board[l[0]] !== '.' && board[l[0]] === board[l[1]] && board[l[1]] === board[l[2]]) return l; }
return [];
}
/* Win / loss / draw record against one person, from every finished game loaded (last 30 days). */
function gameRecord(peerId) {
var w = 0, l = 0, d = 0;
Object.keys(games).forEach(function (k) {
var g = games[k]; if (g.status !== 'finished' || gamePeer(g) !== peerId) return;
if (g.result === 'draw') d++; else if (g.winner === me.id) w++; else l++;
});
return { w: w, l: l, d: d };
}
/* Which games get a card: anything open, plus results from the last hour. Older finished games
   only count toward the record line. */
/* Highest game id against one person in a store (games / unoGames): the one that gets the card. */
function newestGameId(store, peerId) {
var best = null;
Object.keys(store).forEach(function (k) { var g = store[k]; if (gamePeer(g) === peerId && (best === null || Number(k) > best)) best = Number(k); });
return best;
}
function gameShowsCard(g) {
if (g.status === 'pending' || g.status === 'active') return true;
return new Date(g.updated_at).getTime() > Date.now() - 3600000;
}
function renderGameCard(g, opts) {
opts = opts || {};
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
var card = w.log.querySelector('.ttt-card[data-gid="' + g.id + '"]');
if (!card) {
if (!gameShowsCard(g) || newestGameId(games, peer) !== g.id) return;
/* only the latest game keeps a card in the log; older ones live on in the W·L·D line */
w.log.querySelectorAll('.ttt-card').forEach(function (old) { old.remove(); });
card = document.createElement('div'); card.className = 'ttt-card'; card.dataset.gid = g.id; w.log.appendChild(card);
}
var mine = g.challenger_id === me.id, myMark = g.x_player === me.id ? 'X' : 'O';
var rec = gameRecord(peer);
var html = '<div class="ttt-hd"><span class="ttt-title">⚔ Tic-Tac-Toe</span><span class="ttt-rec" title="Your record against ' + esc(name) + ' (last 30 days)">' + rec.w + 'W · ' + rec.l + 'L · ' + rec.d + 'D</span></div>';
var status = '', actions = '', showBoard = g.status === 'active' || g.status === 'finished';
if (g.status === 'pending') {
status = mine ? 'Waiting for ' + esc(name) + ' to accept…' : '<b>' + esc(name) + '</b> challenges you!';
actions = mine ? '<button type="button" class="btn ttt-cancel">Cancel</button>' : '<button type="button" class="btn ttt-accept">Accept</button><button type="button" class="btn ttt-decline">Decline</button>';
} else if (g.status === 'active') {
status = g.turn === me.id ? '<b>Your move</b> — you are ' + myMark : esc(name) + '’s move';
actions = '<button type="button" class="btn ttt-resign">Resign</button>';
} else if (g.status === 'finished') {
var pts = gameMyPoints(g);
if (g.result === 'draw') status = 'A draw.' + (pts ? ' +' + pts + ' XP' : '');
else if (g.winner === me.id) status = '<b>You won!</b>' + (g.result === 'resign' ? ' (' + esc(name) + ' resigned)' : '') + (pts ? ' +' + pts + ' XP' : ' <span class="ttt-cap">daily XP cap reached</span>');
else status = '<b>' + esc(name) + ' won.</b>' + (g.result === 'resign' ? ' (you resigned)' : '');
actions = '<button type="button" class="btn ttt-rematch">Rematch</button>';
} else {
status = g.status === 'declined' ? (mine ? esc(name) + ' declined.' : 'You declined.') : g.status === 'cancelled' ? 'Challenge withdrawn.' : 'Challenge expired.';
actions = '<button type="button" class="btn ttt-rematch">Challenge again</button>';
}
if (showBoard) {
var winCells = g.status === 'finished' ? gameWinningCells(g.board) : [];
var canPlay = g.status === 'active' && g.turn === me.id;
html += '<div class="ttt-board' + (canPlay ? ' live' : '') + '" role="grid">' + g.board.split('').map(function (c, i) {
var cls = 'ttt-cell' + (c === 'X' ? ' x' : c === 'O' ? ' o' : '') + (winCells.indexOf(i) >= 0 ? ' win' : '');
return '<button type="button" class="' + cls + '" data-cell="' + i + '"' + (canPlay && c === '.' ? '' : ' disabled') + ' aria-label="Square ' + (i + 1) + (c === '.' ? '' : ', ' + c) + '">' + (c === '.' ? '' : c) + '</button>';
}).join('') + '</div>';
}
if (g.status === 'active') html += turnClockHtml(g);
html += '<div class="ttt-status">' + status + '</div><div class="ttt-actions">' + actions + '</div>';
card.innerHTML = html;
if (opts.scroll !== false) w.log.scrollTop = w.log.scrollHeight;
}
async function gameCall(fn, args, peerId) {
var r = await sb.rpc(fn, args);
if (r.error) { imSys(peerId, r.error.message.replace(/^.*?:\s*/, '')); return null; }
if (r.data) { noteServerTime(r.data); games[r.data.id] = r.data; renderGameCard(r.data); }
return r.data;
}
/* ---------- the 30-second turn clock (every PM game, v113) ----------
   Each active game card carries a .turn-clock drawn from the row's turn_started_at. One ticker
   repaints them all four times a second; from 15 s down it ticks like a clock once a second
   (for the player on the clock, and for the other player while the window is open). At zero,
   whoever is watching asks the server to skip the slow turn (game_timeout / uno_timeout --
   the server checks its own clock, so an early or duplicate call is harmless). The server's
   'now' and this device's clock can disagree by a few seconds: serverSkew, learned from the
   timestamps that come back on my own moves, corrects for that. */
var TURN_SECONDS = 30, serverSkew = 0, timeoutsFired = {};
function noteServerTime(row) {
if (!row || !row.turn_started_at || !row.updated_at) return;
var t = new Date(row.updated_at).getTime(); if (isNaN(t)) return;
var skew = Date.now() - t; // positive = this device runs ahead of the server
if (Math.abs(skew) < 5 * 60000) serverSkew = serverSkew ? (serverSkew * 0.5 + skew * 0.5) : skew;
}
function turnSecondsLeft(g) {
var t = new Date(g.turn_started_at || g.updated_at).getTime(); if (isNaN(t)) return TURN_SECONDS;
return Math.max(0, TURN_SECONDS - (Date.now() - serverSkew - t) / 1000);
}
function turnClockHtml(g) {
var left = turnSecondsLeft(g), pct = Math.round(100 * left / TURN_SECONDS);
return '<div class="turn-clock' + (left <= 15 ? ' low' : '') + '" data-clock="' + esc(String(g.id)) + '" aria-label="Turn clock"><span class="tc-bar" style="width:' + pct + '%"></span><span class="tc-num">' + Math.ceil(left) + '</span></div>';
}
function tickSound(tock) {
if (soundMuted) return;
if (playFile(tock ? 'tock' : 'tick', function () { synthTick(tock); })) return; // v127: one real clock tick per second, cut from the user's recording
synthTick(tock);
}
function synthTick(tock) {
var ctx = ensureAudioCtx(); if (!ctx) return;
var t0 = ctx.currentTime, len = Math.floor(ctx.sampleRate * 0.03);
var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
var src = ctx.createBufferSource(); src.buffer = buf;
var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = tock ? 1500 : 2600; bp.Q.value = 6;
var gain = ctx.createGain(); gain.gain.setValueAtTime(tock ? 0.45 : 0.6, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
src.connect(bp); bp.connect(gain); gain.connect(masterOut(ctx)); src.start(t0); src.stop(t0 + 0.07);
tone(tock ? 900 : 1300, 0.03, 0, 'square', 0.05); // a little wooden body under the click
}
var lastTickSecond = {};
function clockTick() {
var all = [];
Object.keys(games).forEach(function (k) { var g = games[k]; if (g.status === 'active') all.push({ g: g, fn: 'game_timeout', store: games, uno: false }); });
Object.keys(unoGames).forEach(function (k) { var g = unoGames[k]; if (g.status === 'active') all.push({ g: g, fn: 'uno_timeout', store: unoGames, uno: true }); });
Object.keys(hmGames).forEach(function (k) { var g = hmGames[k]; if (g.status === 'active') all.push({ g: g, fn: 'hangman_timeout', store: hmGames, hm: true }); });
Object.keys(hdGames).forEach(function (k) { var g = hdGames[k]; if (g.status === 'active') all.push({ g: g, fn: 'holdem_timeout', store: hdGames, hd: true }); });
Object.keys(prGames).forEach(function (k) { var g = prGames[k]; if (g.status === 'active' && g.turn) all.push({ g: g, fn: 'prasta_timeout', store: prGames, pr: true }); });
all.forEach(function (x) {
var g = x.g, peer = gamePeer(g), w = wins[peer]; if (!w) return;
var el = w.log.querySelector('.turn-clock[data-clock="' + g.id + '"]');
var left = turnSecondsLeft(g), sec = Math.ceil(left);
if (el) {
el.classList.toggle('low', left <= 15);
el.querySelector('.tc-bar').style.width = Math.round(100 * left / TURN_SECONDS) + '%';
el.querySelector('.tc-num').textContent = sec;
}
var key = x.fn + g.id + ':' + g.turn_started_at;
/* Hold'em between hands: no clock ticking, just deal the next hand after a short pause */
if (x.hd && g.street === 'between') {
if (el) el.classList.add('hidden');
if (TURN_SECONDS - left > 7 && !timeoutsFired[key]) { timeoutsFired[key] = true; sb.rpc('holdem_next', { p_game: g.id }).then(function (r) { if (!r.error && r.data) { noteServerTime(r.data); hdArrived(r.data, false, true); } }); }
return;
}
if (left > 0 && left <= 15 && lastTickSecond[key] !== sec) {
lastTickSecond[key] = sec;
if (g.turn === me.id || !w.minimized) tickSound(sec % 2 === 0);
}
if (left <= 0 && !timeoutsFired[key]) {
timeoutsFired[key] = true;
sb.rpc(x.fn, { p_game: g.id }).then(function (r) {
if (r.error || !r.data) return;
noteServerTime(r.data);
if (x.uno) { unoGames[r.data.id] = r.data; renderUnoCard(r.data, { scroll: false }); if (r.data.turn === me.id) unoFetchHand(r.data.id); }
else if (x.hm) { hmGames[r.data.id] = r.data; renderHmCard(r.data, { scroll: false }); }
else if (x.hd) { hdArrived(r.data, false, true); }
else if (x.pr) { prArrived(r.data, false, true); }
else { games[r.data.id] = r.data; renderGameCard(r.data, { scroll: false }); }
});
}
});
bsClockTick(); // v167: Battleship keeps two clocks (placing, then shots) -- see bsClockTick
grClockTick(); // v169: the Game Room table I sit at
}
setInterval(clockTick, 250);
async function challengeGame(peerId, name) {
if (!me) return;
if (!(await whisperAllowed(peerId))) { imSys(peerId, 'Add ' + name + ' as a friend to challenge them.'); return; }
var r = await sb.from('games').insert({ challenger_id: me.id, challenger_name: me.name, opponent_id: peerId, opponent_name: name }).select().single();
if (r.error) {
if (r.error.code === '23505') imSys(peerId, 'You already have a game open with ' + name + ' — finish it (or resign) first.');
else if (/row-level security/i.test(r.error.message)) imSys(peerId, name + ' only takes whispers from friends, so no challenge yet.');
else imSys(peerId, 'Could not send the challenge: ' + r.error.message);
return;
}
games[r.data.id] = r.data; renderGameCard(r.data);
triggerPush(peerId, me.name + ' challenges you to Tic-Tac-Toe', 'Open your whispers to accept.', 'gc-game-' + r.data.id);
}
/* Card buttons: one delegated handler per whisper log (wired in ensureWin). */
function gameCardClick(e, peerId) {
var card = e.target.closest('.ttt-card'); if (!card) return false;
var g = games[card.dataset.gid]; if (!g) return true;
var b = e.target.closest('button'); if (!b) return true;
if (b.classList.contains('ttt-accept')) gameCall('game_respond', { p_game: g.id, p_accept: true }, peerId);
else if (b.classList.contains('ttt-decline')) gameCall('game_respond', { p_game: g.id, p_accept: false }, peerId);
else if (b.classList.contains('ttt-cancel')) gameCall('game_cancel', { p_game: g.id }, peerId);
else if (b.classList.contains('ttt-resign')) gameCall('game_resign', { p_game: g.id }, peerId);
else if (b.classList.contains('ttt-rematch')) challengeGame(peerId, gamePeerName(g));
else if (b.classList.contains('ttt-cell') && !b.disabled) gameCall('game_move', { p_game: g.id, p_cell: Number(b.dataset.cell) }, peerId);
return true;
}
/* A change that arrived from the other side (realtime), as opposed to one this client asked for. */
function gameArrived(g, isNew) {
var prev = games[g.id]; games[g.id] = g;
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
renderGameCard(g);
var forMe = (isNew && g.opponent_id === me.id) || (g.status === 'active' && g.turn === me.id && (!prev || prev.turn !== me.id)) || (g.status === 'finished' && (!prev || prev.status !== 'finished'));
if (!forMe) return;
if (isNew) w.snippet = name + ' challenges you to Tic-Tac-Toe';
else if (g.status === 'finished') w.snippet = g.result === 'draw' ? 'Tic-Tac-Toe: a draw' : (g.winner === me.id ? 'Tic-Tac-Toe: you won!' : 'Tic-Tac-Toe: ' + name + ' won');
else w.snippet = 'Tic-Tac-Toe: your move';
gameNudge(w, peer, { kind: isNew ? 'challenge' : (g.status === 'finished' ? 'finished' : 'turn'), game: 'Tic-Tac-Toe', seconds: turnSecondsLeft(g), result: g.result === 'draw' ? 'draw' : (g.winner === me.id ? 'win' : 'lose'),
accept: function () { gameCall('game_respond', { p_game: g.id, p_accept: true }, peer); }, decline: function () { gameCall('game_respond', { p_game: g.id, p_accept: false }, peer); } });
}
async function loadGames() {
games = {};
var since = new Date(Date.now() - 30 * 86400000).toISOString();
var r = await sb.from('games').select('*').or('challenger_id.eq.' + me.id + ',opponent_id.eq.' + me.id).gt('created_at', since).order('created_at', { ascending: true });
if (r.error) return;
r.data.forEach(function (g) { games[g.id] = g; });
r.data.forEach(function (g) { if (gameShowsCard(g)) renderGameCard(g, { scroll: false }); });
gamesLoaded = true;
}

/* ---------- UNO in whispers (v112) ----------
   Same shape as Tic-Tac-Toe above, with one difference: hands are secret. uno_games holds what
   both players may see (whose turn, the top card and colour, how many cards each side holds,
   UNO flags, pile size, the last action); uno_hands holds MY cards (RLS: only the owner can read
   their row); the deck never leaves the server. Every move is an rpc -- uno_respond / uno_play /
   uno_draw / uno_pass / uno_call / uno_catch / uno_resign / uno_cancel -- and the client repaints
   from whatever comes back and from realtime. Standard two-player rules: the challenged player
   goes first, Draw Two / Wild Draw Four hit at once and skip the victim, Skip and Reverse give
   another turn, a drawn card may be played at once if it fits, UNO must be called on one card or
   the other side can catch you for two. A win is worth 5 XP under the shared 15-a-day cap.
   Cards are short strings: R7, G+2, BS (skip), YR (reverse), W (wild), W4 (wild draw four). */
var unoGames = {}, unoHand = {}, unoPick = {};   // game id -> row / my cards / wild card awaiting a colour
var UNO_COLOUR = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' };
function unoRank(c) { return c.charAt(0) === 'W' ? c : c.slice(1); }
function unoColour(c) { return c.charAt(0) === 'W' ? 'W' : c.charAt(0); }
function unoLabel(c) { var r = unoRank(c); return r === 'S' ? '⊘' : r === 'R' ? '⇄' : r === 'W' ? '✦' : r === 'W4' ? '+4' : r; }
function unoName(c) { var r = unoRank(c); return c === 'W' ? 'Wild' : c === 'W4' ? 'Wild Draw Four' : UNO_COLOUR[c.charAt(0)] + ' ' + (r === '+2' ? 'Draw Two' : r === 'S' ? 'Skip' : r === 'R' ? 'Reverse' : r); }
function unoPlayable(c, top, col) { return c.charAt(0) === 'W' || unoColour(c) === col || unoRank(c) === unoRank(top); }
function unoCardHtml(c, cls, attrs) { return '<button type="button" class="uno-c ' + unoColour(c) + (cls ? ' ' + cls : '') + '" ' + (attrs || '') + ' aria-label="' + esc(unoName(c)) + '">' + unoLabel(c) + '</button>'; }
/* Win / loss record against one person from every finished UNO game loaded (last 30 days). */
function unoRecord(peerId) {
var w = 0, l = 0;
Object.keys(unoGames).forEach(function (k) { var g = unoGames[k]; if (g.status !== 'finished' || gamePeer(g) !== peerId) return; if (g.winner === me.id) w++; else l++; });
return { w: w, l: l };
}
function renderUnoCard(g, opts) {
opts = opts || {};
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
var card = w.log.querySelector('.uno-card[data-gid="' + g.id + '"]');
if (!card) {
if (!gameShowsCard(g) || newestGameId(unoGames, peer) !== g.id) return;
w.log.querySelectorAll('.uno-card').forEach(function (old) { old.remove(); });
card = document.createElement('div'); card.className = 'uno-card'; card.dataset.gid = g.id; w.log.appendChild(card);
}
var mine = g.challenger_id === me.id, rec = unoRecord(peer);
var myCount = mine ? g.challenger_cards : g.opponent_cards, theirCount = mine ? g.opponent_cards : g.challenger_cards;
var myUno = mine ? g.challenger_uno : g.opponent_uno, theirUno = mine ? g.opponent_uno : g.challenger_uno;
var html = '<div class="ttt-hd"><span class="ttt-title">🃏 UNO</span><span class="ttt-rec" title="Your record against ' + esc(name) + ' (last 30 days)">' + rec.w + 'W · ' + rec.l + 'L</span></div>';
var status = '', actions = '';
if (g.status === 'pending') {
status = mine ? 'Waiting for ' + esc(name) + ' to accept…' : '<b>' + esc(name) + '</b> challenges you to UNO!';
actions = mine ? '<button type="button" class="btn uno-cancel">Cancel</button>' : '<button type="button" class="btn uno-accept">Accept</button><button type="button" class="btn uno-decline">Decline</button>';
} else if (g.status === 'active') {
var myTurn = g.turn === me.id, hand = unoHand[g.id] || [];
var backs = ''; for (var i = 0; i < Math.min(theirCount, 10); i++) backs += '<span class="uno-c back small" aria-hidden="true"></span>';
html += '<div class="uno-opp"><span class="uno-backs">' + backs + '</span><span>' + esc(name) + ' · ' + theirCount + ' card' + (theirCount === 1 ? '' : 's') + '</span>' + (theirUno ? '<span class="uno-badge">UNO!</span>' : '') + '</div>';
var canDraw = myTurn && g.phase === 'play';
var anyFits = hand.some(function (c) { return unoPlayable(c, g.top_card, g.color); });
/* the pile only lights up when drawing is your ONLY move; a quiet pile means you have a card to play */
html += '<div class="uno-table">' +
'<button type="button" class="uno-pile' + (canDraw && !anyFits ? ' must' : '') + '"' + (canDraw ? '' : ' disabled') + ' title="Draw a card" aria-label="Draw pile, ' + g.draw_count + ' cards"><span class="uno-c back">' + g.draw_count + '</span><span class="uno-pile-lbl">' + (canDraw ? 'Draw' : 'Pile') + '</span></button>' +
'<div class="uno-top">' + unoCardHtml(g.top_card, 'top', 'disabled') + '<span class="uno-colour ' + g.color + '" title="Current colour: ' + UNO_COLOUR[g.color] + '" aria-label="Current colour: ' + UNO_COLOUR[g.color] + '"></span></div></div>';
var pick = unoPick[g.id];
html += '<div class="uno-hand' + (myTurn ? ' live' : '') + '" role="group" aria-label="Your hand">' + hand.map(function (c, i) {
var ok = myTurn && !pick && unoPlayable(c, g.top_card, g.color) && (g.phase !== 'after_draw' || i === hand.length - 1);
return unoCardHtml(c, ok ? 'ok' : '', 'data-card="' + esc(c) + '"' + (ok ? '' : ' disabled'));
}).join('') + '</div>';
if (pick) {
status = 'Pick a colour for your ' + esc(unoName(pick)) + ':';
actions = ['R', 'G', 'B', 'Y'].map(function (k) { return '<button type="button" class="uno-col ' + k + '" data-col="' + k + '" title="' + UNO_COLOUR[k] + '" aria-label="' + UNO_COLOUR[k] + '"></button>'; }).join('') + '<button type="button" class="btn uno-nopick">Back</button>';
} else {
status = myTurn ? (g.phase === 'after_draw' ? '<b>Play the card you drew, or pass.</b>' : '<b>Your turn</b>') : esc(name) + '’s turn';
if (myTurn && g.phase === 'after_draw') actions += '<button type="button" class="btn uno-pass">Pass</button>';
if (!myUno && (myCount === 1 || (myCount === 2 && myTurn))) actions += '<button type="button" class="btn uno-call">UNO!</button>';
if (myTurn && g.phase === 'play' && theirCount === 1 && !theirUno) actions += '<button type="button" class="btn uno-catch">Catch them!</button>';
actions += '<button type="button" class="btn uno-resign">Resign</button>';
}
if (g.last_action) html += '<div class="uno-last">' + esc(g.last_action) + '</div>';
html += turnClockHtml(g);
} else if (g.status === 'finished') {
var pts = gameMyPoints(g);
if (g.winner === me.id) status = '<b>You won!</b>' + (g.result === 'resign' ? ' (' + esc(name) + ' resigned)' : '') + (pts ? ' +' + pts + ' XP' : ' <span class="ttt-cap">daily XP cap reached</span>');
else status = '<b>' + esc(name) + ' won.</b>' + (g.result === 'resign' ? ' (you resigned)' : '');
actions = '<button type="button" class="btn uno-rematch">Rematch</button>';
} else {
status = g.status === 'declined' ? (mine ? esc(name) + ' declined.' : 'You declined.') : g.status === 'cancelled' ? 'Challenge withdrawn.' : 'Challenge expired.';
actions = '<button type="button" class="btn uno-rematch">Challenge again</button>';
}
html += '<div class="ttt-status">' + status + '</div><div class="ttt-actions">' + actions + '</div>';
card.innerHTML = html;
if (opts.scroll !== false) w.log.scrollTop = w.log.scrollHeight;
}
/* My hand for one game. Realtime on uno_hands keeps it fresh too; this is the belt to those
   braces (called right after each of my own moves, and when a game turns active). */
async function unoFetchHand(gid) {
var r = await sb.from('uno_hands').select('cards').eq('game_id', gid).eq('user_id', me.id).maybeSingle();
if (!r.error && r.data) { unoHand[gid] = r.data.cards || []; if (unoGames[gid]) renderUnoCard(unoGames[gid], { scroll: false }); }
}
async function unoCall(fn, args, peerId) {
var r = await sb.rpc(fn, args);
if (r.error) { imSys(peerId, r.error.message.replace(/^.*?:\s*/, '')); return null; }
if (r.data) { noteServerTime(r.data); delete unoPick[r.data.id]; unoGames[r.data.id] = r.data; renderUnoCard(r.data); if (r.data.status === 'active') unoFetchHand(r.data.id); }
return r.data;
}
async function unoPlay(g, peerId, c, col) {
var hand = unoHand[g.id] || [], i = hand.indexOf(c);
if (i >= 0) hand.splice(i, 1);   // optimistic; the server's hand row confirms (or unoFetchHand restores it)
delete unoPick[g.id];
var r = await unoCall('uno_play', { p_game: g.id, p_card: c, p_color: col || null }, peerId);
if (!r) unoFetchHand(g.id);
}
async function challengeUno(peerId, name) {
if (!me) return;
if (!(await whisperAllowed(peerId))) { imSys(peerId, 'Add ' + name + ' as a friend to challenge them.'); return; }
var r = await sb.from('uno_games').insert({ challenger_id: me.id, challenger_name: me.name, opponent_id: peerId, opponent_name: name }).select().single();
if (r.error) {
if (r.error.code === '23505') imSys(peerId, 'You already have an UNO game open with ' + name + ' — finish it (or resign) first.');
else if (/row-level security/i.test(r.error.message)) imSys(peerId, name + ' only takes whispers from friends, so no challenge yet.');
else imSys(peerId, 'Could not send the challenge: ' + r.error.message);
return;
}
unoGames[r.data.id] = r.data; renderUnoCard(r.data);
triggerPush(peerId, me.name + ' challenges you to UNO', 'Open your whispers to accept.', 'gc-uno-' + r.data.id);
}
/* Card buttons: shares the delegated handler in ensureWin with Tic-Tac-Toe. */
function unoCardClick(e, peerId) {
var card = e.target.closest('.uno-card'); if (!card) return false;
var g = unoGames[card.dataset.gid]; if (!g) return true;
var b = e.target.closest('button'); if (!b || b.disabled) return true;
var id = g.id, cl = b.classList;
if (cl.contains('uno-accept')) unoCall('uno_respond', { p_game: id, p_accept: true }, peerId);
else if (cl.contains('uno-decline')) unoCall('uno_respond', { p_game: id, p_accept: false }, peerId);
else if (cl.contains('uno-cancel')) unoCall('uno_cancel', { p_game: id }, peerId);
else if (cl.contains('uno-resign')) unoCall('uno_resign', { p_game: id }, peerId);
else if (cl.contains('uno-rematch')) challengeUno(peerId, gamePeerName(g));
else if (cl.contains('uno-pile')) unoCall('uno_draw', { p_game: id }, peerId);
else if (cl.contains('uno-pass')) unoCall('uno_pass', { p_game: id }, peerId);
else if (cl.contains('uno-call')) unoCall('uno_call', { p_game: id }, peerId);
else if (cl.contains('uno-catch')) unoCall('uno_catch', { p_game: id }, peerId);
else if (cl.contains('uno-nopick')) { delete unoPick[id]; renderUnoCard(g, { scroll: false }); }
else if (cl.contains('uno-col')) { var wc = unoPick[id]; if (wc) unoPlay(g, peerId, wc, b.dataset.col); }
else if (b.dataset.card) {
if (b.dataset.card.charAt(0) === 'W') { unoPick[id] = b.dataset.card; renderUnoCard(g, { scroll: false }); }
else unoPlay(g, peerId, b.dataset.card);
}
return true;
}
/* A change that arrived from the other side (realtime). */
function unoArrived(g, isNew) {
var prev = unoGames[g.id]; unoGames[g.id] = g;
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
if (g.status === 'active' && !unoHand[g.id]) unoFetchHand(g.id);
renderUnoCard(g);
if (prev && g.status === 'active' && (prev.status !== 'active' || prev.last_action !== g.last_action)) gameSfx(g.id, 'card'); // v129: the deal, and every card played or drawn
var forMe = (isNew && g.opponent_id === me.id) || (g.status === 'active' && g.turn === me.id && (!prev || prev.turn !== me.id)) || (g.status === 'finished' && (!prev || prev.status !== 'finished'));
if (!forMe) return;
if (isNew) w.snippet = name + ' challenges you to UNO';
else if (g.status === 'finished') w.snippet = g.winner === me.id ? 'UNO: you won!' : 'UNO: ' + name + ' won';
else w.snippet = 'UNO: your turn';
gameNudge(w, peer, { kind: isNew ? 'challenge' : (g.status === 'finished' ? 'finished' : 'turn'), game: 'UNO', seconds: turnSecondsLeft(g), result: g.winner === me.id ? 'win' : 'lose',
accept: function () { unoCall('uno_respond', { p_game: g.id, p_accept: true }, peer); }, decline: function () { unoCall('uno_respond', { p_game: g.id, p_accept: false }, peer); } });
}
function unoHandArrived(row) {
if (!row || row.user_id !== me.id) return;
unoHand[row.game_id] = row.cards || [];
if (unoGames[row.game_id]) renderUnoCard(unoGames[row.game_id], { scroll: false });
}
async function loadUno() {
unoGames = {}; unoHand = {};
var since = new Date(Date.now() - 30 * 86400000).toISOString();
var r = await sb.from('uno_games').select('*').or('challenger_id.eq.' + me.id + ',opponent_id.eq.' + me.id).gt('created_at', since).order('created_at', { ascending: true });
if (r.error) return;
var open = [];
r.data.forEach(function (g) { unoGames[g.id] = g; if (g.status === 'active') open.push(g.id); });
if (open.length) {
var h = await sb.from('uno_hands').select('game_id, cards').in('game_id', open);
(h.data || []).forEach(function (row) { unoHand[row.game_id] = row.cards || []; });
}
r.data.forEach(function (g) { if (gameShowsCard(g)) renderUnoCard(g, { scroll: false }); });
}

/* ---------- Hangman in whispers (v114) ----------
   A race for one secret word (supabase/hangman_feature.sql): the server picks it, the two of you
   take turns guessing letters or the whole word. A right letter keeps your turn; a wrong one is a
   miss on the shared gallows and passes the turn. Reveal the last letter (or solve it) to win
   3 XP; the sixth miss hangs the man and whoever made it loses. */
var hmGames = {};
function hmRecord(peerId) {
var w = 0, l = 0;
Object.keys(hmGames).forEach(function (k) { var g = hmGames[k]; if (g.status !== 'finished' || gamePeer(g) !== peerId) return; if (g.winner === me.id) w++; else l++; });
return { w: w, l: l };
}
/* The gallows: a little pixel drawing that grows a piece per miss (head, body, arms, legs). */
function gallowsSvg(misses) {
var parts = [
'<rect x="14" y="4" width="2" height="4"/>',                                  // rope
'<rect x="12" y="8" width="6" height="6" class="hm-man"/>',                    // head
'<rect x="14" y="14" width="2" height="8" class="hm-man"/>',                   // body
'<rect x="10" y="15" width="4" height="2" class="hm-man"/>',                   // left arm
'<rect x="16" y="15" width="4" height="2" class="hm-man"/>',                   // right arm
'<rect x="11" y="22" width="3" height="2" class="hm-man"/><rect x="10" y="24" width="2" height="3" class="hm-man"/>', // left leg
'<rect x="16" y="22" width="3" height="2" class="hm-man"/><rect x="18" y="24" width="2" height="3" class="hm-man"/>'  // right leg
];
var frame = '<rect x="1" y="29" width="22" height="2"/><rect x="4" y="2" width="2" height="27"/><rect x="4" y="2" width="12" height="2"/><rect x="6" y="4" width="2" height="3"/>';
return '<svg class="hm-gallows" viewBox="0 0 24 32" aria-hidden="true">' + frame + parts.slice(0, Math.min(7, misses + 1)).join('') + '</svg>';
}
function renderHmCard(g, opts) {
opts = opts || {};
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
var card = w.log.querySelector('.hm-card[data-gid="' + g.id + '"]');
if (!card) {
if (!gameShowsCard(g) || newestGameId(hmGames, peer) !== g.id) return;
w.log.querySelectorAll('.hm-card').forEach(function (old) { old.remove(); });
card = document.createElement('div'); card.className = 'hm-card'; card.dataset.gid = g.id; w.log.appendChild(card);
}
var mine = g.challenger_id === me.id, rec = hmRecord(peer);
var html = '<div class="ttt-hd"><span class="ttt-title">🪢 Hangman</span><span class="ttt-rec" title="Your record against ' + esc(name) + ' (last 30 days)">' + rec.w + 'W · ' + rec.l + 'L</span></div>';
var status = '', actions = '';
if (g.status === 'pending') {
status = mine ? 'Waiting for ' + esc(name) + ' to accept…' : '<b>' + esc(name) + '</b> challenges you to Hangman!';
actions = mine ? '<button type="button" class="btn hm-cancel">Cancel</button>' : '<button type="button" class="btn hm-accept">Accept</button><button type="button" class="btn hm-decline">Decline</button>';
} else if (g.status === 'active' || g.status === 'finished') {
var myTurn = g.status === 'active' && g.turn === me.id;
html += '<div class="hm-table">' + gallowsSvg(g.misses) + '<div class="hm-mid"><div class="hm-word">' + esc(g.mask).toUpperCase().split('').map(function (c) { return '<span class="hm-ch' + (c === '_' ? ' blank' : '') + '">' + (c === '_' ? '&nbsp;' : c) + '</span>'; }).join('') + '</div>' +
'<div class="hm-tried">' + (g.guessed ? 'Tried: ' + esc(g.guessed.toUpperCase().split('').join(' ')) : '&nbsp;') + '</div><div class="hm-miss">' + g.misses + ' of 6 misses</div></div></div>';
if (g.status === 'active') {
html += '<div class="hm-keys" role="group" aria-label="Letters">' + 'abcdefghijklmnopqrstuvwxyz'.split('').map(function (l) {
var used = g.guessed.indexOf(l) >= 0;
return '<button type="button" class="hm-key' + (used ? ' used' : '') + '" data-l="' + l + '"' + (used || !myTurn ? ' disabled' : '') + '>' + l.toUpperCase() + '</button>';
}).join('') + '</div>';
html += '<div class="hm-solve-row"><input type="text" class="hm-solve-in" maxlength="20" placeholder="…or solve the whole word"' + (myTurn ? '' : ' disabled') + ' autocomplete="off"><button type="button" class="btn hm-solve"' + (myTurn ? '' : ' disabled') + '>Solve</button></div>';
if (g.last_action) html += '<div class="uno-last">' + esc(g.last_action) + '</div>';
html += turnClockHtml(g);
status = myTurn ? '<b>Your turn</b> — pick a letter' : esc(name) + '’s turn';
actions = '<button type="button" class="btn hm-resign">Resign</button>';
} else {
var pts = gameMyPoints(g);
var theWord = esc((g.word || g.mask).toUpperCase());
if (g.winner === me.id) status = '<b>You won!</b> ' + (g.result === 'solved' ? 'The word was ' + theWord + '.' : g.result === 'hanged' ? esc(name) + ' hanged the man — it was ' + theWord + '.' : esc(name) + ' resigned — it was ' + theWord + '.') + (pts ? ' +' + pts + ' XP' : ' <span class="ttt-cap">daily XP cap reached</span>');
else status = '<b>' + esc(name) + ' won.</b> ' + (g.result === 'solved' ? 'They solved ' + theWord + '.' : g.result === 'hanged' ? 'Your miss hanged the man — it was ' + theWord + '.' : 'You resigned — it was ' + theWord + '.');
actions = '<button type="button" class="btn hm-rematch">Rematch</button>';
}
} else {
status = g.status === 'declined' ? (mine ? esc(name) + ' declined.' : 'You declined.') : g.status === 'cancelled' ? 'Challenge withdrawn.' : 'Challenge expired.';
actions = '<button type="button" class="btn hm-rematch">Challenge again</button>';
}
html += '<div class="ttt-status">' + status + '</div><div class="ttt-actions">' + actions + '</div>';
card.innerHTML = html;
if (opts.scroll !== false) w.log.scrollTop = w.log.scrollHeight;
}
async function hmCall(fn, args, peerId) {
var r = await sb.rpc(fn, args);
if (r.error) { imSys(peerId, r.error.message.replace(/^.*?:\s*/, '')); return null; }
if (r.data) { noteServerTime(r.data); hmGames[r.data.id] = r.data; renderHmCard(r.data); }
return r.data;
}
async function challengeHangman(peerId, name) {
if (!me) return;
if (!(await whisperAllowed(peerId))) { imSys(peerId, 'Add ' + name + ' as a friend to challenge them.'); return; }
var r = await sb.from('hangman_games').insert({ challenger_id: me.id, challenger_name: me.name, opponent_id: peerId, opponent_name: name }).select().single();
if (r.error) {
if (r.error.code === '23505') imSys(peerId, 'You already have a Hangman game open with ' + name + ' — finish it (or resign) first.');
else if (/row-level security/i.test(r.error.message)) imSys(peerId, name + ' only takes whispers from friends, so no challenge yet.');
else imSys(peerId, 'Could not send the challenge: ' + r.error.message);
return;
}
hmGames[r.data.id] = r.data; renderHmCard(r.data);
triggerPush(peerId, me.name + ' challenges you to Hangman', 'Open your whispers to accept.', 'gc-hm-' + r.data.id);
}
function hmCardClick(e, peerId) {
var card = e.target.closest('.hm-card'); if (!card) return false;
var g = hmGames[card.dataset.gid]; if (!g) return true;
var b = e.target.closest('button'); if (!b || b.disabled) return true;
var id = g.id, cl = b.classList;
if (cl.contains('hm-accept')) hmCall('hangman_respond', { p_game: id, p_accept: true }, peerId);
else if (cl.contains('hm-decline')) hmCall('hangman_respond', { p_game: id, p_accept: false }, peerId);
else if (cl.contains('hm-cancel')) hmCall('hangman_cancel', { p_game: id }, peerId);
else if (cl.contains('hm-resign')) hmCall('hangman_resign', { p_game: id }, peerId);
else if (cl.contains('hm-rematch')) challengeHangman(peerId, gamePeerName(g));
else if (cl.contains('hm-key')) hmCall('hangman_guess', { p_game: id, p_guess: b.dataset.l }, peerId);
else if (cl.contains('hm-solve')) { var inp = card.querySelector('.hm-solve-in'); var v = (inp && inp.value || '').trim(); if (v) hmCall('hangman_guess', { p_game: id, p_guess: v }, peerId); }
return true;
}
function hmArrived(g, isNew) {
var prev = hmGames[g.id]; hmGames[g.id] = g;
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
renderHmCard(g);
/* v128: a guess landed (either side's) -- a miss or a hit, before any turn/finish nudge */
if (prev && prev.status === 'active' && g.status !== 'pending') {
if ((g.misses || 0) > (prev.misses || 0)) playSound((g.misses || 0) >= 6 ? 'trapdoor' : 'hm-wrong'); // v129: the sixth miss drops the trapdoor
else if (g.status === 'active' && g.mask !== prev.mask) playSound('hm-right');
}
var forMe = (isNew && g.opponent_id === me.id) || (g.status === 'active' && g.turn === me.id && (!prev || prev.turn !== me.id)) || (g.status === 'finished' && (!prev || prev.status !== 'finished'));
if (!forMe) return;
if (isNew) w.snippet = name + ' challenges you to Hangman';
else if (g.status === 'finished') w.snippet = g.winner === me.id ? 'Hangman: you won!' : 'Hangman: ' + name + ' won';
else w.snippet = 'Hangman: your turn';
gameNudge(w, peer, { kind: isNew ? 'challenge' : (g.status === 'finished' ? 'finished' : 'turn'), game: 'Hangman', seconds: turnSecondsLeft(g), result: g.winner === me.id ? 'win' : 'lose',
accept: function () { hmCall('hangman_respond', { p_game: g.id, p_accept: true }, peer); }, decline: function () { hmCall('hangman_respond', { p_game: g.id, p_accept: false }, peer); } });
}
/* ---------- v121: toasts ----------
   A small card in the corner that follows the person anywhere in the app -- main chat, the
   threads board, a different whisper. Used for game events (below): a challenge comes with
   Accept / Decline right on it, "your move" counts the turn clock down, and tapping any of them
   opens that whisper. At most three on screen; one per person per kind (a newer one replaces). */
var toastWrap = null;
function dismissToasts(peer) { if (toastWrap) toastWrap.querySelectorAll('[data-peer="' + peer + '"]').forEach(function (t) { t.remove(); }); }
function showToast(o) {
if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toasts'; toastWrap.setAttribute('aria-live', 'polite'); document.body.appendChild(toastWrap); }
var key = (o.peer || '') + ':' + (o.kind || '');
var prev = toastWrap.querySelector('[data-key="' + key + '"]'); if (prev) prev.remove();
var t = document.createElement('div'); t.className = 'toast' + (o.cls ? ' ' + o.cls : ''); t.dataset.key = key; if (o.peer) t.dataset.peer = o.peer;
t.innerHTML = (o.icon ? '<span class="toast-i">' + o.icon + '</span>' : '') + '<div class="toast-body"><div class="toast-t">' + esc(o.text) + '</div>' + (o.sub ? '<div class="toast-s">' + esc(o.sub) + '</div>' : '') + '<div class="toast-b"></div></div><button type="button" class="toast-x" aria-label="Dismiss">×</button>';
var bar = t.querySelector('.toast-b');
(o.actions || []).forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = a[0]; b.onclick = function (e) { e.stopPropagation(); t.remove(); a[1](); }; bar.appendChild(b); });
if (!bar.children.length) bar.remove();
t.querySelector('.toast-x').onclick = function (e) { e.stopPropagation(); t.remove(); };
t.onclick = function () { t.remove(); if (o.onClick) o.onClick(); };
toastWrap.appendChild(t);
while (toastWrap.children.length > 3) toastWrap.firstChild.remove();
var ttl = o.ttl || 8000, sub = t.querySelector('.toast-s');
if (o.countdown && sub) {
var until = Date.now() + o.countdown * 1000;
var iv = setInterval(function () { if (!t.parentNode) { clearInterval(iv); return; } var left = Math.max(0, Math.ceil((until - Date.now()) / 1000)); sub.textContent = left + 's left — tap to play'; if (!left) { clearInterval(iv); t.remove(); } }, 500);
}
setTimeout(function () { if (t.parentNode) { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); } }, ttl);
return t;
}
/* Shared "something happened in a game for me" nudge: sound, unread badge, flash, title bump, and
   (v121) a toast when the person is not looking at that whisper right now. info: { kind:
   'challenge' | 'turn' | 'finished', game: 'UNO', accept: fn, decline: fn, seconds: n }. */
function gameNudge(w, peer, info) {
info = info || {};
playSound(info.kind === 'turn' ? 'turn' : (info.kind === 'challenge' ? 'challenge' : (info.kind === 'finished' && info.result === 'win' ? 'win' : (info.kind === 'finished' && info.result === 'lose' ? 'lose' : 'ding'))));
if (w.minimized || document.activeElement !== w.ta) {
unread[peer] = (unread[peer] || 0) + 1; renderPeople();
if (w.tab) { w.tab.classList.remove('flash'); void w.tab.offsetWidth; w.tab.classList.add('flash'); }
if (!dockOpen && dmBar) { dmBar.classList.remove('flash'); void dmBar.offsetWidth; dmBar.classList.add('flash'); }
}
if (w.tab && tray && w.tab.parentNode === tray && tray.firstChild !== w.tab) tray.insertBefore(w.tab, tray.firstChild);
updateTab(peer);
if (document.hidden) bumpTitle();
var looking = !w.minimized && dockOpen && activeDm === peer && !document.hidden;
dismissToasts(peer);
if (looking || !info.kind) return;
var name = w.name, icons = { 'Tic-Tac-Toe': '⚔', 'UNO': '🃏', 'Hangman': '🪢', 'Hold’em': '♠', 'Battleship': '🚢' };
showToast({
peer: peer, kind: info.kind, icon: icons[info.game] || '🎲', text: w.snippet,
sub: info.kind === 'challenge' ? 'Tap to open the whisper' : (info.kind === 'turn' ? (info.seconds || TURN_SECONDS) + 's left — tap to play' : 'Tap to see the result'),
actions: info.kind === 'challenge' && info.accept ? [['Accept', info.accept], ['Decline', info.decline]] : [],
countdown: info.kind === 'turn' ? Math.ceil(info.seconds || TURN_SECONDS) : 0,
ttl: info.kind === 'turn' ? Math.max(3000, Math.ceil(info.seconds || TURN_SECONDS) * 1000) : (info.kind === 'challenge' ? 60000 : 9000),
onClick: function () { openIM(peer, name, true); }
});
}
async function loadHangman() {
hmGames = {};
var since = new Date(Date.now() - 30 * 86400000).toISOString();
var r = await sb.from('hangman_games').select('*').or('challenger_id.eq.' + me.id + ',opponent_id.eq.' + me.id).gt('created_at', since).order('created_at', { ascending: true });
if (r.error) return;
r.data.forEach(function (g) { hmGames[g.id] = g; });
r.data.forEach(function (g) { if (gameShowsCard(g)) renderHmCard(g, { scroll: false }); });
}

/* ---------- Texas Hold'em in whispers (v114) ----------
   Heads-up no-limit, betting real XP (supabase/holdem_feature.sql). Two tables: LOW (blinds 1/2,
   sit down with 5-10 XP) and HIGH (blinds 2/5, 10-50 XP). Your buy-in leaves your XP the moment
   you sit down and your whole stack comes back when you leave, so wins and losses move your
   level. hdGames is the public table state; hdHand holds MY two cards (RLS: nobody else can read
   them); the deck never leaves the server. Every action is an rpc. */
var hdGames = {}, hdHand = {}, hdLeaveArmed = {};
var HD_STAKES = { low: { sb: 1, bb: 2, min: 5, max: 10, label: 'Low stakes' }, high: { sb: 2, bb: 5, min: 10, max: 50, label: 'High stakes' } };
var SUIT = { h: '♥', d: '♦', c: '♣', s: '♠' };
function pcHtml(c, extra) {
if (!c) return '<span class="pc back' + (extra ? ' ' + extra : '') + '" aria-hidden="true"></span>';
var r = c.charAt(0), su = c.charAt(1), red = su === 'h' || su === 'd';
return '<span class="pc' + (red ? ' red' : '') + (extra ? ' ' + extra : '') + '" aria-label="' + esc(r + ' of ' + { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }[su]) + '"><span class="pc-r">' + (r === 'T' ? '10' : r) + '</span><span class="pc-s">' + SUIT[su] + '</span></span>';
}
function hdRecord(peerId) {
var w = 0, l = 0, net = 0;
Object.keys(hdGames).forEach(function (k) { var g = hdGames[k]; if (g.status !== 'finished' || gamePeer(g) !== peerId) return; if (g.winner === me.id) w++; else if (g.winner) l++; net += gameMyPoints(g); });
return { w: w, l: l, net: net };
}
function myXp() { return xpOfUser(me.id); }
function xpOfUser(id) { var st = userStats[id]; return st ? (st.xp != null ? st.xp : (st.reactions_received || 0) + (st.game_points || 0)) : 0; }
function holdemStakesMenu(peerId, name) {
var anchor = wins[peerId] && wins[peerId].el.querySelector('.icomp .games');
if (!anchor) return;
showMiniMenu(anchor, 'Hold’em with ' + name, [
['♠ Low stakes — blinds 1/2, sit with 5–10 XP', function () { challengeHoldem(peerId, name, 'low'); }],
['♠ High stakes — blinds 2/5, sit with 10–50 XP', function () { challengeHoldem(peerId, name, 'high'); }]
]);
}
async function challengeHoldem(peerId, name, stakes) {
if (!me) return;
var st = HD_STAKES[stakes]; if (!st) return;
if (!(await whisperAllowed(peerId))) { imSys(peerId, 'Add ' + name + ' as a friend to play them.'); return; }
var have = myXp(), theirs = xpOfUser(peerId);
if (have < st.min) { imSys(peerId, 'You need at least ' + st.min + ' XP to sit down at the ' + st.label.toLowerCase() + ' table (you have ' + have + ').'); return; }
/* v133: the other player has to cover the same buy-in -- say so before the prompt rather than
   letting a table open that they can never sit down at (the server refuses it too). */
if (theirs < st.min) { imSys(peerId, name + ' only has ' + theirs + ' XP — not enough for the ' + st.label.toLowerCase() + ' table (' + st.min + ' XP minimum). XP comes from reactions and from winning games.'); return; }
var suggested = Math.min(st.max, have, theirs);
var v = await showPromptModal('Sit down with how much XP?', { value: String(suggested), placeholder: st.min + '–' + st.max, maxLength: 3, hint: st.label + ': blinds ' + st.sb + '/' + st.bb + '. ' + name + ' has ' + theirs + ' XP. Between ' + st.min + ' and ' + Math.min(st.max, have) + ' XP — it leaves your XP now and comes back (plus or minus) when the game ends.', okLabel: 'Sit down' });
if (v === null) return;
var amt = parseInt(v, 10);
if (!(amt >= st.min && amt <= st.max)) { imSys(peerId, 'Sit down with ' + st.min + ' to ' + st.max + ' XP at this table.'); return; }
if (amt > theirs) { imSys(peerId, name + ' only has ' + theirs + ' XP and can’t cover a ' + amt + '-XP buy-in. Try ' + theirs + ' or less.'); return; }
var r = await sb.rpc('holdem_challenge', { p_opponent: peerId, p_stakes: stakes, p_buy_in: amt });
if (r.error) {
if (/unique|one_open/i.test(r.error.message)) imSys(peerId, 'You already have a Hold’em game open with ' + name + ' — finish it first.');
else imSys(peerId, r.error.message.replace(/^.*?:\s*/, ''));
return;
}
noteServerTime(r.data); hdGames[r.data.id] = r.data; renderHdCard(r.data);
refreshMyStats();
triggerPush(peerId, me.name + ' wants to play Hold’em for ' + amt + ' XP', 'Open your whispers to sit down.', 'gc-hd-' + r.data.id);
}
/* XP moved in or out of a table: re-read my own row so the level badge follows. */
async function refreshMyStats() {
var r = await sb.from('user_stats').select('user_id, reactions_received, game_points, xp, level').eq('user_id', me.id).maybeSingle();
if (!r.error && r.data) { userStats[me.id] = r.data; refreshLevelBadges(me.id); }
}
function renderHdCard(g, opts) {
opts = opts || {};
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
var card = w.log.querySelector('.hd-card[data-gid="' + g.id + '"]');
if (!card) {
if (!gameShowsCard(g) || newestGameId(hdGames, peer) !== g.id) return;
w.log.querySelectorAll('.hd-card').forEach(function (old) { old.remove(); });
card = document.createElement('div'); card.className = 'hd-card'; card.dataset.gid = g.id; w.log.appendChild(card);
}
var mine = g.challenger_id === me.id, rec = hdRecord(peer), st = HD_STAKES[g.stakes] || HD_STAKES.low;
var myStack = mine ? g.challenger_stack : g.opponent_stack, theirStack = mine ? g.opponent_stack : g.challenger_stack;
var myBet = mine ? g.challenger_bet : g.opponent_bet, theirBet = mine ? g.opponent_bet : g.challenger_bet;
var theirShown = mine ? g.shown_opponent : g.shown_challenger, myShown = mine ? g.shown_challenger : g.shown_opponent;
var html = '<div class="ttt-hd"><span class="ttt-title">♠ Hold’em · ' + st.label + '</span><span class="ttt-rec" title="Your record against ' + esc(name) + ' (last 30 days)">' + rec.w + 'W · ' + rec.l + 'L · ' + (rec.net >= 0 ? '+' : '') + rec.net + ' XP</span></div>';
var status = '', actions = '';
if (g.status === 'pending') {
var short = !mine && myXp() < g.buy_in; // v133: invited, but can't cover the buy-in
status = mine ? 'Waiting for ' + esc(name) + ' to sit down (' + g.buy_in + ' XP each)…' : '<b>' + esc(name) + '</b> sits down with <b>' + g.buy_in + ' XP</b> — blinds ' + g.sb + '/' + g.bb + '. ' + (short ? 'You have <b>' + myXp() + ' XP</b> — you need ' + g.buy_in + ' to sit down. XP comes from reactions and from winning games.' : 'Sit down for ' + g.buy_in + ' XP too?');
actions = mine ? '<button type="button" class="btn hd-cancel">Cancel</button>' : (short ? '' : '<button type="button" class="btn hd-accept">Sit down</button>') + '<button type="button" class="btn hd-decline">Decline</button>';
} else if (g.status === 'active' || g.status === 'finished') {
var inHand = g.status === 'active' && g.street !== 'between' && g.street !== 'showdown';
var myTurn = inHand && g.turn === me.id;
var myCards = hdHand[g.id] || myShown || [];
html += '<div class="hd-seat them"><span class="hd-pname">' + (g.dealer === peer ? '<span class="hd-btn" title="Dealer">D</span>' : '') + esc(name) + '</span><span class="hd-stack">' + theirStack + ' XP</span>' + (theirBet ? '<span class="hd-bet">' + theirBet + '</span>' : '') +
'<span class="hd-cards">' + (theirShown ? pcHtml(theirShown[0], 'sm') + pcHtml(theirShown[1], 'sm') : (inHand ? pcHtml(null, 'sm') + pcHtml(null, 'sm') : '')) + '</span></div>';
var board = g.board || [];
html += '<div class="hd-board">' + [0, 1, 2, 3, 4].map(function (i) { return board[i] ? pcHtml(board[i]) : '<span class="pc slot" aria-hidden="true"></span>'; }).join('') + '</div>';
html += '<div class="hd-pot">Pot ' + (g.pot + g.challenger_bet + g.opponent_bet) + ' XP' + (g.street !== 'between' ? ' · ' + esc(g.street) : '') + '</div>';
html += '<div class="hd-seat me"><span class="hd-pname">' + (g.dealer === me.id ? '<span class="hd-btn" title="Dealer">D</span>' : '') + 'You</span><span class="hd-stack">' + myStack + ' XP</span>' + (myBet ? '<span class="hd-bet">' + myBet + '</span>' : '') +
'<span class="hd-cards">' + (myCards.length ? pcHtml(myCards[0]) + pcHtml(myCards[1]) : '') + '</span></div>';
if (g.last_action) html += '<div class="uno-last">' + esc(g.last_action) + '</div>';
if (g.status === 'active') {
html += turnClockHtml(g);
if (myTurn) {
var toCall = Math.max(0, theirBet - myBet);
var minTo = Math.min(theirBet + Math.max(g.min_raise, g.bb), myBet + myStack), potNow = g.pot + g.challenger_bet + g.opponent_bet;
var potTo = Math.min(myBet + myStack, theirBet + toCall + potNow), allIn = myBet + myStack;
status = '<b>Your move</b>' + (toCall ? ' — ' + toCall + ' to call' : '');
actions = '<span class="hd-fc"><button type="button" class="btn hd-fold">Fold</button><button type="button" class="btn hd-call">' + (toCall ? 'Call ' + Math.min(toCall, myStack) : 'Check') + '</button></span>';
if (myStack > 0 && theirStack + (theirBet - myBet) > 0) {
actions += '<span class="hd-raise"><span class="hd-presets"><button type="button" class="btn hd-amt-set" data-amt="' + minTo + '">Min</button><button type="button" class="btn hd-amt-set" data-amt="' + potTo + '">Pot</button><button type="button" class="btn hd-amt-set" data-amt="' + allIn + '">All-in</button></span>' +
'<span class="hd-raise-row"><input type="number" class="hd-amt" min="' + minTo + '" max="' + allIn + '" value="' + minTo + '" aria-label="Raise to"><button type="button" class="btn hd-raise-btn">' + (theirBet ? 'Raise to' : 'Bet') + '</button></span></span>';
}
} else if (g.street === 'between' || g.street === 'showdown') {
status = g.hand_result ? esc(g.hand_result) : 'Next hand coming up…';
actions = '<button type="button" class="btn hd-next">Next hand</button>';
} else {
status = esc(name) + '’s move';
}
actions += '<button type="button" class="btn hd-leave' + (hdLeaveArmed[g.id] ? ' armed' : '') + '">' + (hdLeaveArmed[g.id] ? 'Sure? Cash out' : 'Cash out') + '</button>';
} else {
var net = gameMyPoints(g);
status = (g.result === 'bust' ? (myStack === 0 ? 'You busted.' : esc(name) + ' busted!') : 'Cashed out.') + ' ' + (net > 0 ? '<b>+' + net + ' XP</b>' : net < 0 ? '<b>' + net + ' XP</b>' : 'Even.');
actions = '<button type="button" class="btn hd-rematch">Play again</button>';
}
} else {
status = g.status === 'declined' ? (mine ? esc(name) + ' declined — your XP is back.' : 'You declined.') : g.status === 'cancelled' ? 'Table closed — XP refunded.' : 'Challenge expired — XP refunded.';
actions = '<button type="button" class="btn hd-rematch">Try again</button>';
}
html += '<div class="ttt-status">' + status + '</div><div class="ttt-actions hd-actions">' + actions + '</div>';
card.innerHTML = html;
if (opts.scroll !== false) w.log.scrollTop = w.log.scrollHeight;
}
async function hdFetchHand(gid) {
var r = await sb.from('holdem_hands').select('cards').eq('game_id', gid).eq('user_id', me.id).maybeSingle();
if (!r.error) { hdHand[gid] = r.data ? (r.data.cards || []) : []; if (hdGames[gid]) renderHdCard(hdGames[gid], { scroll: false }); }
}
async function hdCall(fn, args, peerId) {
var r = await sb.rpc(fn, args);
if (r.error) { imSys(peerId, r.error.message.replace(/^.*?:\s*/, '')); return null; }
if (r.data) hdArrived(r.data, false, true);
return r.data;
}
/* Applies a fresh row whether it came back from my own rpc (quiet = true) or over realtime. */
function hdArrived(g, isNew, quiet) {
var prev = hdGames[g.id]; hdGames[g.id] = g;
noteServerTime(g);
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
if (g.status === 'active' && (!prev || prev.hand_no !== g.hand_no || prev.status !== 'active')) { delete hdLeaveArmed[g.id]; hdFetchHand(g.id); }
if (g.status === 'finished' && (!prev || prev.status !== 'finished')) { delete hdHand[g.id]; refreshMyStats(); }
if (['declined', 'cancelled', 'expired'].indexOf(g.status) >= 0 && (!prev || prev.status !== g.status)) refreshMyStats();
renderHdCard(g);
if (prev && g.status === 'active') { // v129: cards on the deal and each street, chips whenever the pot grows
if (prev.hand_no !== g.hand_no || (prev.street !== g.street && ['flop', 'turn', 'river'].indexOf(g.street) >= 0)) gameSfx(g.id, 'card');
else if ((g.pot || 0) > (prev.pot || 0)) gameSfx(g.id, 'chips');
}
if (quiet) return;
var forMe = (isNew && g.opponent_id === me.id) || (g.status === 'active' && g.turn === me.id && (!prev || prev.turn !== me.id || prev.hand_no !== g.hand_no)) || (g.status === 'finished' && (!prev || prev.status !== 'finished'));
if (!forMe) return;
if (isNew) w.snippet = name + ' wants to play Hold’em for ' + g.buy_in + ' XP';
else if (g.status === 'finished') w.snippet = 'Hold’em: ' + (gameMyPoints(g) >= 0 ? '+' : '') + gameMyPoints(g) + ' XP';
else w.snippet = 'Hold’em: your move';
gameNudge(w, peer, { kind: isNew ? 'challenge' : (g.status === 'finished' ? 'finished' : 'turn'), game: 'Hold’em', seconds: turnSecondsLeft(g), result: gameMyPoints(g) > 0 ? 'win' : (gameMyPoints(g) < 0 ? 'lose' : 'draw'),
accept: function () { hdCall('holdem_respond', { p_game: g.id, p_accept: true }, peer); }, decline: function () { hdCall('holdem_respond', { p_game: g.id, p_accept: false }, peer); } });
}
function hdHandArrived(row) {
if (!row || row.user_id !== me.id) return;
hdHand[row.game_id] = row.cards || [];
if (hdGames[row.game_id]) renderHdCard(hdGames[row.game_id], { scroll: false });
}
function hdCardClick(e, peerId) {
var card = e.target.closest('.hd-card'); if (!card) return false;
var g = hdGames[card.dataset.gid]; if (!g) return true;
var b = e.target.closest('button'); if (!b || b.disabled) return true;
var id = g.id, cl = b.classList;
if (cl.contains('hd-accept')) hdCall('holdem_respond', { p_game: id, p_accept: true }, peerId);
else if (cl.contains('hd-decline')) hdCall('holdem_respond', { p_game: id, p_accept: false }, peerId);
else if (cl.contains('hd-cancel')) hdCall('holdem_cancel', { p_game: id }, peerId);
else if (cl.contains('hd-fold')) hdCall('holdem_act', { p_game: id, p_action: 'fold' }, peerId);
else if (cl.contains('hd-call')) hdCall('holdem_act', { p_game: id, p_action: 'call' }, peerId);
else if (cl.contains('hd-amt-set')) { var inp = card.querySelector('.hd-amt'); if (inp) inp.value = b.dataset.amt; }
else if (cl.contains('hd-raise-btn')) { var inp2 = card.querySelector('.hd-amt'); var amt = parseInt(inp2 && inp2.value, 10); if (amt > 0) hdCall('holdem_act', { p_game: id, p_action: 'raise', p_amount: amt }, peerId); }
else if (cl.contains('hd-next')) hdCall('holdem_next', { p_game: id }, peerId);
else if (cl.contains('hd-leave')) {
if (!hdLeaveArmed[id]) { hdLeaveArmed[id] = true; renderHdCard(g, { scroll: false }); setTimeout(function () { if (hdLeaveArmed[id]) { delete hdLeaveArmed[id]; if (hdGames[id]) renderHdCard(hdGames[id], { scroll: false }); } }, 5000); }
else { delete hdLeaveArmed[id]; hdCall('holdem_leave', { p_game: id }, peerId); }
}
else if (cl.contains('hd-rematch')) holdemStakesMenu(peerId, gamePeerName(g));
return true;
}
async function loadHoldem() {
hdGames = {}; hdHand = {};
var since = new Date(Date.now() - 30 * 86400000).toISOString();
var r = await sb.from('holdem_games').select('*').or('challenger_id.eq.' + me.id + ',opponent_id.eq.' + me.id).gt('created_at', since).order('created_at', { ascending: true });
if (r.error) return;
var open = [];
r.data.forEach(function (g) { hdGames[g.id] = g; if (g.status === 'active') open.push(g.id); });
if (open.length) {
var h = await sb.from('holdem_hands').select('game_id, cards').in('game_id', open);
(h.data || []).forEach(function (row) { hdHand[row.game_id] = row.cards || []; });
}
r.data.forEach(function (g) { if (gameShowsCard(g)) renderHdCard(g, { scroll: false }); });
}

/* ---------- Prasta (Gilet) in whispers (v136) ----------
   A 16th-century Italian three-card gambling game, here heads-up for one agreed stake (1-9000 XP).
   prasta_games is what both players may see; prasta_hands holds MY three cards (RLS: owner only)
   and prasta_decks never leaves the server -- same shape as UNO and Hold'em. Hands rank
   Tricon > Pair > Point; each player may change up to two cards once, then it is a showdown and
   the winner takes both stakes. See supabase/prasta_feature.sql. */
var prGames = {}, prHand = {}, prPick = {};   // prPick[gid] = the cards I have selected to change
function prRecord(peerId) {
var w = 0, l = 0, net = 0;
Object.keys(prGames).forEach(function (k) { var g = prGames[k]; if (g.status !== 'finished' || gamePeer(g) !== peerId) return; if (g.winner === me.id) w++; else if (g.winner) l++; net += gameMyPoints(g); });
return { w: w, l: l, net: net };
}
/* The three-card hand, ranked the way the server ranks it -- shown under your cards so nobody has
   to learn the order from a help page. Mirrors pr_score()'s categories, not its tie-breakers. */
function prHandName(cards) {
if (!cards || cards.length < 3) return '';
var PT = { A: 11, K: 10, Q: 10, J: 10, T: 10 };
var NAME = { '7': '7', '8': '8', '9': '9', T: '10', J: 'jack', Q: 'queen', K: 'king', A: 'ace' };
var r = cards.map(function (c) { return c.charAt(0); }), s = cards.map(function (c) { return c.charAt(1); });
var bySuit = {};
cards.forEach(function (c, i) { bySuit[s[i]] = (bySuit[s[i]] || 0) + (PT[r[i]] || parseInt(r[i], 10)); });
var pt = Math.max.apply(null, Object.keys(bySuit).map(function (k) { return bySuit[k]; }));
if (r[0] === r[1] && r[1] === r[2]) return 'three ' + NAME[r[0]] + 's';
var pair = r[0] === r[1] ? r[0] : (r[0] === r[2] ? r[0] : (r[1] === r[2] ? r[1] : null));
if (pair) return 'a pair of ' + NAME[pair] + 's';
return 'point ' + pt;
}
function renderPrCard(g, opts) {
opts = opts || {};
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
var card = w.log.querySelector('.pr-card[data-gid="' + g.id + '"]');
if (!card) {
if (!gameShowsCard(g) || newestGameId(prGames, peer) !== g.id) return;
w.log.querySelectorAll('.pr-card').forEach(function (old) { old.remove(); });
card = document.createElement('div'); card.className = 'pr-card'; card.dataset.gid = g.id; w.log.appendChild(card);
}
var mine = g.challenger_id === me.id, rec = prRecord(peer);
var myCards = prHand[g.id] || (mine ? g.shown_challenger : g.shown_opponent) || [];
var theirCards = mine ? g.shown_opponent : g.shown_challenger;
var myTurn = g.status === 'active' && g.turn === me.id;
var iAmDone = mine ? g.challenger_done : g.opponent_done;
var picked = prPick[g.id] || [];
var html = '<div class="ttt-hd"><span class="ttt-title">🂡 Prasta</span><span class="ttt-rec" title="Your record against ' + esc(name) + ' (last 30 days)">' + rec.w + 'W · ' + rec.l + 'L · ' + (rec.net >= 0 ? '+' : '') + rec.net + ' XP</span></div>';
var status = '', actions = '';
if (g.status === 'pending') {
var short = !mine && myXp() < g.stake;
status = mine ? 'Waiting for ' + esc(name) + ' to match ' + g.stake + ' XP…'
: '<b>' + esc(name) + '</b> stakes <b>' + g.stake + ' XP</b> on a hand of Prasta. ' + (short ? 'You have <b>' + myXp() + ' XP</b> — you need ' + g.stake + ' to match it.' : 'Match it?');
actions = mine ? '<button type="button" class="btn pr-cancel">Call it off</button>'
: (short ? '' : '<button type="button" class="btn pr-accept">Match ' + g.stake + ' XP</button>') + '<button type="button" class="btn pr-decline">Walk away</button>';
} else if (g.status === 'active' || g.status === 'finished') {
var live = g.status === 'active';
html += '<div class="pr-seat"><span class="pr-who">' + esc(name) + '</span><span class="pr-cards">'
+ (theirCards ? theirCards.map(function (c) { return pcHtml(c, 'sm'); }).join('') : pcHtml(null, 'sm') + pcHtml(null, 'sm') + pcHtml(null, 'sm'))
+ '</span>' + (theirCards ? '<span class="pr-name">' + esc(prHandName(theirCards)) + '</span>' : '') + '</div>';
html += '<div class="pr-pot">' + (live ? g.stake + ' XP each' : '') + '</div>';
html += '<div class="pr-seat me"><span class="pr-who">You</span><span class="pr-cards">'
+ myCards.map(function (c) {
var sel = picked.indexOf(c) >= 0, pick = live && myTurn && !iAmDone;
return '<span class="pr-c' + (sel ? ' picked' : '') + (pick ? ' pickable' : '') + '"' + (pick ? ' data-card="' + esc(c) + '" role="button" tabindex="0"' : '') + '>' + pcHtml(c) + (sel ? '<span class="pr-x" aria-hidden="true">✕</span>' : '') + '</span>';
}).join('')
+ '</span>' + (myCards.length ? '<span class="pr-name">' + esc(prHandName(myCards)) + '</span>' : '') + '</div>';
if (live) {
if (myTurn && !iAmDone) {
status = picked.length ? 'Tap cards to pick up to two, then draw.' : 'Your draw — tap up to two cards to change, or stand pat.';
actions = '<button type="button" class="btn pr-draw"' + (picked.length ? '' : ' disabled') + '>Change ' + (picked.length || '') + '</button><button type="button" class="btn pr-stand">Stand pat</button><button type="button" class="btn pr-resign">Throw it in</button>';
} else {
status = iAmDone ? 'Waiting for ' + esc(name) + '…' : esc(name) + ' is drawing…';
actions = '<button type="button" class="btn pr-resign">Throw it in</button>';
}
} else {
status = esc(g.last_action || '');
actions = '<button type="button" class="btn pr-rematch">Play again</button>';
}
} else {
status = esc(g.last_action || 'That hand is over.');
}
html += '<div class="ttt-status">' + status + '</div>';
if (g.status === 'active' && g.turn) html += turnClockHtml(g);
if (actions) html += '<div class="ttt-actions">' + actions + '</div>';
card.innerHTML = html;
if (opts.scroll !== false) { w.log.scrollTop = w.log.scrollHeight; }
}
async function prFetchHand(gid) {
var r = await sb.from('prasta_hands').select('cards').eq('game_id', gid).eq('user_id', me.id).maybeSingle();
if (!r.error) { prHand[gid] = r.data ? (r.data.cards || []) : []; if (prGames[gid]) renderPrCard(prGames[gid], { scroll: false }); }
}
function prHandArrived(row) {
if (!row || row.user_id !== me.id) return;
prHand[row.game_id] = row.cards || [];
if (prGames[row.game_id]) renderPrCard(prGames[row.game_id], { scroll: false });
}
async function prCall(fn, args, peerId) {
var r = await sb.rpc(fn, args);
if (r.error) { imSys(peerId, r.error.message.replace(/^.*?:\s*/, '')); return null; }
if (r.data) prArrived(r.data, false, true);
return r.data;
}
async function challengePrasta(peerId, name) {
if (!me) return;
if (!(await whisperAllowed(peerId))) { imSys(peerId, 'Add ' + name + ' as a friend to play them.'); return; }
var have = myXp(), theirs = xpOfUser(peerId);
if (have < 1) { imSys(peerId, 'You need at least 1 XP to stake a hand. XP comes from reactions and from winning games.'); return; }
if (theirs < 1) { imSys(peerId, name + ' has no XP to stake yet.'); return; }
var top = Math.min(9000, have, theirs);
var v = await showPromptModal('Stake how much XP?', { value: String(Math.min(top, 10)), placeholder: '1–' + top, maxLength: 4,
hint: 'Prasta: three cards each, change up to two, best hand takes both stakes. Tricon beats a pair, a pair beats point. ' + name + ' has ' + theirs + ' XP; you have ' + have + '.' });
if (v === null) return;
var amt = parseInt(v, 10);
if (!(amt >= 1 && amt <= 9000)) { imSys(peerId, 'The stake has to be between 1 and 9000 XP.'); return; }
if (amt > theirs) { imSys(peerId, name + ' only has ' + theirs + ' XP and can’t match a ' + amt + '-XP stake. Try ' + theirs + ' or less.'); return; }
if (amt > have) { imSys(peerId, 'You only have ' + have + ' XP to stake.'); return; }
var r = await sb.rpc('prasta_challenge', { p_opponent: peerId, p_stake: amt });
if (r.error) {
if (/unique|one_open/i.test(r.error.message)) imSys(peerId, 'You already have a hand of Prasta open with ' + name + ' — finish it first.');
else imSys(peerId, r.error.message.replace(/^.*?:\s*/, ''));
return;
}
prArrived(r.data, false, true); refreshMyStats();
triggerPush(peerId, me.name + ' stakes ' + amt + ' XP on a hand of Prasta', 'Open your whispers to match it.', 'gc-pr-' + r.data.id);
}
function prCardClick(e, peerId) {
var card = e.target.closest('.pr-card'); if (!card) return false;
var g = prGames[card.dataset.gid]; if (!g) return true;
var id = g.id;
var pc = e.target.closest('.pr-c[data-card]');
if (pc && g.status === 'active' && g.turn === me.id) {
var c = pc.dataset.card, picked = prPick[id] || [];
var at = picked.indexOf(c);
if (at >= 0) picked.splice(at, 1);
else if (picked.length < 2) picked.push(c);
else { imSys(peerId, 'Two cards is the most you may change.'); return true; }
prPick[id] = picked; renderPrCard(g, { scroll: false });
return true;
}
var b = e.target.closest('button'); if (!b || b.disabled) return true;
var cl = b.classList;
if (cl.contains('pr-accept')) prCall('prasta_respond', { p_game: id, p_accept: true }, peerId);
else if (cl.contains('pr-decline')) prCall('prasta_respond', { p_game: id, p_accept: false }, peerId);
else if (cl.contains('pr-cancel')) prCall('prasta_cancel', { p_game: id }, peerId);
else if (cl.contains('pr-resign')) prCall('prasta_resign', { p_game: id }, peerId);
else if (cl.contains('pr-rematch')) challengePrasta(peerId, gamePeerName(g));
else if (cl.contains('pr-stand')) { prPick[id] = []; prCall('prasta_exchange', { p_game: id, p_discard: [] }, peerId); }
else if (cl.contains('pr-draw')) { var d = prPick[id] || []; prPick[id] = []; prCall('prasta_exchange', { p_game: id, p_discard: d }, peerId); }
return true;
}
function prArrived(g, isNew, quiet) {
var prev = prGames[g.id]; prGames[g.id] = g;
noteServerTime(g);
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
if (g.status === 'active' && !prHand[g.id]) prFetchHand(g.id);
if (g.status === 'finished' && (!prev || prev.status !== 'finished')) { delete prHand[g.id]; delete prPick[g.id]; refreshMyStats(); }
if (['declined', 'cancelled', 'expired'].indexOf(g.status) >= 0 && (!prev || prev.status !== g.status)) refreshMyStats();
renderPrCard(g);
if (prev && g.status === 'active' && prev.status !== 'active') gameSfx(g.id, 'card');       // the deal
else if (prev && g.status === 'active' && (prev.challenger_done !== g.challenger_done || prev.opponent_done !== g.opponent_done)) gameSfx(g.id, 'card');
if (quiet) return;
var forMe = (isNew && g.opponent_id === me.id) || (g.status === 'active' && g.turn === me.id && (!prev || prev.turn !== me.id)) || (g.status === 'finished' && (!prev || prev.status !== 'finished'));
if (!forMe) return;
if (isNew) w.snippet = name + ' stakes ' + g.stake + ' XP on Prasta';
else if (g.status === 'finished') w.snippet = 'Prasta: ' + (gameMyPoints(g) > 0 ? '+' : '') + gameMyPoints(g) + ' XP';
else w.snippet = 'Prasta: your draw';
gameNudge(w, peer, { kind: isNew ? 'challenge' : (g.status === 'finished' ? 'finished' : 'turn'), game: 'Prasta', seconds: turnSecondsLeft(g),
result: gameMyPoints(g) > 0 ? 'win' : (gameMyPoints(g) < 0 ? 'lose' : 'draw'),
accept: function () { prCall('prasta_respond', { p_game: g.id, p_accept: true }, peer); }, decline: function () { prCall('prasta_respond', { p_game: g.id, p_accept: false }, peer); } });
}
async function loadPrasta() {
prGames = {};
var since = new Date(Date.now() - 30 * 86400000).toISOString();
var r = await sb.from('prasta_games').select('*').or('challenger_id.eq.' + me.id + ',opponent_id.eq.' + me.id).gt('created_at', since).order('created_at', { ascending: true });
if (r.error) return;
r.data.forEach(function (g) { prGames[g.id] = g; noteServerTime(g); });
var open = r.data.filter(function (g) { return g.status === 'active'; }).map(function (g) { return g.id; });
if (open.length) {
var h = await sb.from('prasta_hands').select('game_id, cards').in('game_id', open);
if (!h.error && h.data) h.data.forEach(function (x) { prHand[x.game_id] = x.cards || []; });
}
r.data.forEach(function (g) { if (gameShowsCard(g)) renderPrCard(g, { scroll: false }); });
}

/* ---------- Battleship in whispers (v167) ----------
   supabase/battleship_feature.sql. A classic 10x10 sea, five ships each: Carrier 5 (A),
   Battleship 4 (B), Cruiser 3 (C), Submarine 3 (S), Destroyer 2 (D). The rules the user picked:
   each fleet starts in a random layout the server deals at accept, which you can Shuffle, turn (tap
   a ship) and move (drag it) before pressing Ready -- 60 s, after which you sail with whatever was
   last sent; a HIT SHOOTS AGAIN and a miss hands the turn over; 10 XP a win, 3 a loss.
   bsGames is the public row (both seas, as the attacker sees them); bsFleet is MY layout, from
   battleship_fleets, whose policy only shows your own until the game is over (bsReveal is theirs,
   fetched then). bsDraft is the layout being arranged in this browser before Ready. */
var bsGames = {}, bsFleet = {}, bsDraft = {}, bsReveal = {}, bsFiring = {}, bsResignArmed = {}, bsDragging = null, bsRenderQueued = {};
var BS_SHIPS = [['A', 5, 'Carrier'], ['B', 4, 'Battleship'], ['C', 3, 'Cruiser'], ['S', 3, 'Submarine'], ['D', 2, 'Destroyer']];
var BS_PLACE_SECONDS = 60;
function bsAmChallenger(g) { return g.challenger_id === me.id; }
function bsMySea(g) { return (bsAmChallenger(g) ? g.challenger_sea : g.opponent_sea) || ''; }    // shots fired at my fleet
function bsTheirSea(g) { return (bsAmChallenger(g) ? g.opponent_sea : g.challenger_sea) || ''; } // my shots at theirs
function bsImReady(g) { return bsAmChallenger(g) ? g.challenger_ready : g.opponent_ready; }
function bsTheyReady(g) { return bsAmChallenger(g) ? g.opponent_ready : g.challenger_ready; }
function bsShots(g) { return (g.challenger_sea || '').replace(/\./g, '').length + (g.opponent_sea || '').replace(/\./g, '').length; }
function bsShipCells(lay, ch) { var out = []; for (var i = 0; i < 100; i++) if (lay.charAt(i) === ch) out.push(i); return out; }
function bsCellsFor(r0, c0, len, horiz) {
var out = [];
for (var k = 0; k < len; k++) { var r = horiz ? r0 : r0 + k, c = horiz ? c0 + k : c0; if (r < 0 || r > 9 || c < 0 || c > 9) return null; out.push(r * 10 + c); }
return out;
}
/* The same rule the server applies (bs_valid_layout): exactly the five ships, each one straight and unbroken. */
function bsValid(lay) {
if (typeof lay !== 'string' || !/^[.ABCSD]{100}$/.test(lay)) return false;
return BS_SHIPS.every(function (s) {
var cells = bsShipCells(lay, s[0]); if (cells.length !== s[1]) return false;
var horiz = cells[1] === cells[0] + 1;
return cells.every(function (c, k) { return horiz ? (c === cells[0] + k && Math.floor(c / 10) === Math.floor(cells[0] / 10)) : c === cells[0] + k * 10; });
});
}
/* Shuffle: a fresh random fleet in which no two ships touch, not even corner to corner -- the same
   way the server deals them (bs_random_layout). Dragging by hand may put ships side by side. */
function bsRandomLayout() {
for (var attempt = 0; attempt < 50; attempt++) {
var grid = []; for (var i = 0; i < 100; i++) grid.push('.');
var placed = BS_SHIPS.every(function (s) {
for (var tries = 0; tries < 300; tries++) {
var horiz = Math.random() < 0.5, len = s[1];
var r = horiz ? Math.floor(Math.random() * 10) : Math.floor(Math.random() * (11 - len));
var c = horiz ? Math.floor(Math.random() * (11 - len)) : Math.floor(Math.random() * 10);
var ok = true;
for (var rr = r - 1; rr <= r + (horiz ? 0 : len - 1) + 1 && ok; rr++) for (var cc = c - 1; cc <= c + (horiz ? len - 1 : 0) + 1; cc++) {
if (rr >= 0 && rr <= 9 && cc >= 0 && cc <= 9 && grid[rr * 10 + cc] !== '.') { ok = false; break; }
}
if (!ok) continue;
bsCellsFor(r, c, len, horiz).forEach(function (x) { grid[x] = s[0]; });
return true;
}
return false;
});
if (placed) return grid.join('');
}
return null;
}
/* Can ship ch sit on these cells? Only its own old cells and open water are free. */
function bsFits(lay, ch, cells) {
return !!cells && cells.every(function (c) { var x = lay.charAt(c); return x === '.' || x === ch; });
}
function bsPut(lay, ch, cells) {
var a = lay.split('').map(function (x) { return x === ch ? '.' : x; });
cells.forEach(function (c) { a[c] = ch; });
return a.join('');
}
/* Tap a ship: turn it about the square that was tapped. If something is in the way, try turning it
   about its other squares, nearest first, sliding it back inside the sea where it would hang off
   the edge. Only if none of those fit does it stay put (and the grid gives a little shake). */
function bsRotate(id, ch, pivot) {
var lay = bsDraft[id]; if (!lay) return false;
var cells = bsShipCells(lay, ch), len = cells.length; if (len < 2) return false;
var nh = !(cells[1] === cells[0] + 1), tapped = Math.max(0, cells.indexOf(pivot));
var order = cells.map(function (c, i) { return i; }).sort(function (a, b) { return Math.abs(a - tapped) - Math.abs(b - tapped); });
for (var p = 0; p < order.length; p++) {
var pv = cells[order[p]], pr = Math.floor(pv / 10), pc = pv % 10;
for (var k = 0; k < len; k++) {
var off = (order[p] + k) % len;
var r0 = nh ? pr : pr - off, c0 = nh ? pc - off : pc;
if (nh) c0 = Math.max(0, Math.min(10 - len, c0)); else r0 = Math.max(0, Math.min(10 - len, r0));
var cand = bsCellsFor(r0, c0, len, nh);
if (bsFits(lay, ch, cand)) { bsDraft[id] = bsPut(lay, ch, cand); return true; }
}
}
return false;
}
function bsRecord(peerId) {
var w = 0, l = 0;
Object.keys(bsGames).forEach(function (k) { var g = bsGames[k]; if (g.status !== 'finished' || !g.winner || gamePeer(g) !== peerId) return; if (g.winner === me.id) w++; else l++; });
return { w: w, l: l };
}
/* The ships still afloat / sunk, as a row of little hulls. A sunk ship's letters show in the sea it
   went down in, so this reads straight off the game row for both sides. */
function bsFleetStatusHtml(sea) {
return '<span class="bs-hulls">' + BS_SHIPS.map(function (s) {
var sunk = sea.indexOf(s[0]) >= 0;
return '<span class="bs-hull' + (sunk ? ' bs-sunk' : '') + '" title="' + s[2] + (sunk ? ' — sunk' : ' — afloat') + '">' + new Array(s[1] + 1).join('<i></i>') + '</span>';
}).join('') + '</span>';
}
/* One grid. o: { cls, ships (layout to draw or null), sea (shots on it or null), open (clickable
   cells), last (cell), ghost (layout drawn faintly: the other fleet after the game), aim (cell being fired at) } */
function bsGridHtml(o) {
var html = '<div class="bs-grid ' + (o.cls || '') + '" role="grid" aria-label="' + esc(o.label || 'Sea') + '">';
for (var i = 0; i < 100; i++) {
var ship = o.ships ? o.ships.charAt(i) : '.', shot = o.sea ? o.sea.charAt(i) : '.', cls = 'bs-cell';
var drawn = ship !== '.' ? ship : (/[ABCSD]/.test(shot) ? shot : '.'), src = ship !== '.' ? o.ships : (o.sea || '');
if (drawn === '.' && o.ghost && o.ghost.charAt(i) !== '.') { drawn = o.ghost.charAt(i); src = o.ghost; cls += ' bs-ghost'; }
if (drawn !== '.') {
cls += ' bs-sh';
var c = i % 10;
if (c > 0 && src.charAt(i - 1) === drawn) cls += ' bs-l';
if (c < 9 && src.charAt(i + 1) === drawn) cls += ' bs-r';
if (i >= 10 && src.charAt(i - 10) === drawn) cls += ' bs-u';
if (i < 90 && src.charAt(i + 10) === drawn) cls += ' bs-d';
}
if (shot === 'o') cls += ' bs-miss';
else if (shot === 'x') cls += ' bs-hit';
else if (/[ABCSD]/.test(shot)) cls += ' bs-hit bs-sunk';
else if (o.open) cls += ' bs-open';
if (i === o.last) cls += ' bs-last';
if (i === o.aim) cls += ' bs-aim';
html += '<div class="' + cls + '" data-c="' + i + '"></div>';
}
return html + '</div>';
}
function renderBsCard(g, opts) {
opts = opts || {};
if (bsDragging === g.id) { bsRenderQueued[g.id] = true; return; } // mid-drag: repaint when the ship is let go
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
var card = w.log.querySelector('.bs-card[data-gid="' + g.id + '"]');
if (!card) {
if (!gameShowsCard(g) || newestGameId(bsGames, peer) !== g.id) return;
w.log.querySelectorAll('.bs-card').forEach(function (old) { old.remove(); });
card = document.createElement('div'); card.className = 'bs-card'; card.dataset.gid = g.id; w.log.appendChild(card);
}
var mine = bsAmChallenger(g), rec = bsRecord(peer);
var html = '<div class="ttt-hd"><span class="ttt-title">🚢 Battleship</span><span class="ttt-rec" title="Your record against ' + esc(name) + ' (last 30 days)">' + rec.w + 'W · ' + rec.l + 'L</span></div>';
var status = '', actions = '', resign = '<button type="button" class="btn bs-resign' + (bsResignArmed[g.id] ? ' armed' : '') + '">' + (bsResignArmed[g.id] ? 'Sure? Resign' : 'Resign') + '</button>';
var clock = function (total) { var t = new Date(g.turn_started_at).getTime(), left = isNaN(t) ? total : Math.max(0, total - (Date.now() - serverSkew - t) / 1000);
return '<div class="turn-clock' + (left <= 15 ? ' low' : '') + '" data-clock="bs' + g.id + '" aria-label="Clock"><span class="tc-bar" style="width:' + Math.round(100 * left / total) + '%"></span><span class="tc-num">' + Math.ceil(left) + '</span></div>'; };
if (g.status === 'pending') {
status = mine ? 'Waiting for ' + esc(name) + ' to accept…' : '<b>' + esc(name) + '</b> challenges you to Battleship!';
actions = mine ? '<button type="button" class="btn bs-cancel">Cancel</button>' : '<button type="button" class="btn bs-accept">Accept</button><button type="button" class="btn bs-decline">Decline</button>';
} else if (g.status === 'active' && g.phase === 'placing') {
var ready = bsImReady(g), lay = ready ? (bsFleet[g.id] || bsDraft[g.id]) : (bsDraft[g.id] || bsFleet[g.id]);
if (lay) {
html += '<div class="bs-label">' + (ready ? 'Your fleet is in position' : 'Your fleet — tap a ship to turn it, drag to move it') + '</div>';
html += bsGridHtml({ cls: ready ? 'bs-own' : 'bs-place', ships: lay, label: 'Your fleet' });
} else html += '<div class="bs-label">Dealing your fleet…</div>';
if (!ready) html += '<div class="bs-tools"><button type="button" class="btn bs-shuffle">🔀 Shuffle</button><button type="button" class="btn bs-ready"' + (lay ? '' : ' disabled') + '>Ready</button></div>';
html += clock(BS_PLACE_SECONDS);
status = ready ? 'Waiting for ' + esc(name) + ' to finish placing…' : '<b>Place your ships</b>' + (bsTheyReady(g) ? ' — ' + esc(name) + ' is ready' : '');
actions = resign;
} else if (g.status === 'active' || g.status === 'finished') {
var over = g.status === 'finished', myTurn = !over && g.turn === me.id;
var theirs = bsTheirSea(g), ours = bsMySea(g), my = bsFleet[g.id] || null;
var lastTheirs = g.last_by === me.id ? g.last_cell : -1, lastOurs = g.last_by && g.last_by !== me.id ? g.last_cell : -1;
html += '<div class="bs-label"><span>' + esc(name) + '’s waters</span>' + bsFleetStatusHtml(theirs) + '</div>';
html += bsGridHtml({ cls: 'bs-enemy' + (myTurn ? ' bs-myturn' : ''), sea: theirs, open: myTurn && bsFiring[g.id] == null, last: lastTheirs, aim: bsFiring[g.id], ghost: over ? bsReveal[g.id] : null, label: name + '’s waters' });
html += '<div class="bs-sub">' + bsGridHtml({ cls: 'bs-mini', ships: my, sea: ours, last: lastOurs, label: 'Your fleet' }) +
'<div class="bs-side"><div class="bs-label"><span>Your fleet</span></div>' + bsFleetStatusHtml(ours) + (g.last_action ? '<div class="uno-last">' + esc(g.last_action) + '</div>' : '') + '</div></div>';
if (!over) {
html += clock(TURN_SECONDS);
status = myTurn ? '<b>Your turn</b> — fire!' : esc(name) + ' is aiming…';
actions = resign;
} else {
var pts = gameMyPoints(g), won = g.winner === me.id;
if (won) status = '<b>You won!</b> ' + (g.result === 'resign' ? esc(name) + ' resigned.' : 'Their whole fleet is on the bottom.') + (pts ? ' +' + pts + ' XP' : (g.result === 'resign' && bsShots(g) < 20 ? ' <span class="ttt-cap">no XP for a resignation this early</span>' : ' <span class="ttt-cap">daily XP cap reached</span>'));
else status = '<b>' + esc(name) + ' won.</b> ' + (g.result === 'resign' ? 'You resigned.' : 'Your fleet went down.') + (pts ? ' +' + pts + ' XP' : '');
actions = '<button type="button" class="btn bs-rematch">Rematch</button>';
}
} else {
status = g.status === 'declined' ? (mine ? esc(name) + ' declined.' : 'You declined.') : g.status === 'cancelled' ? 'Challenge withdrawn.' : 'Challenge expired.';
actions = '<button type="button" class="btn bs-rematch">Challenge again</button>';
}
html += '<div class="ttt-status">' + status + '</div><div class="ttt-actions">' + actions + '</div>';
card.innerHTML = html;
if (g.status === 'active' && g.phase === 'placing' && !bsImReady(g)) bsBindPlacement(card, g.id);
if (opts.scroll !== false) w.log.scrollTop = w.log.scrollHeight;
}
/* Drag to move a ship, tap to turn it. Pointer events cover mouse, pen and touch alike; the grid
   has touch-action:none while placing so a drag doesn't scroll the whisper instead. While a ship is
   being dragged only the cells' classes change, so the element under the finger survives; a full
   re-render that arrives mid-drag (the other player pressing Ready, say) waits until it's let go. */
function bsBindPlacement(card, id) {
var grid = card.querySelector('.bs-place'); if (!grid) return;
var drag = null;
function cellAt(ev) {
var r = grid.getBoundingClientRect(); if (!r.width || !r.height) return -1;
var x = ev.clientX - r.left, y = ev.clientY - r.top;
if (x < 0 || y < 0 || x >= r.width || y >= r.height) return -1;
return Math.floor(y / (r.height / 10)) * 10 + Math.floor(x / (r.width / 10));
}
function paint() {
var lay = bsDraft[id];
grid.querySelectorAll('.bs-cell').forEach(function (el) {
var i = +el.dataset.c;
el.classList.toggle('bs-from', !!drag && drag.moved && lay.charAt(i) === drag.ch);
el.classList.toggle('bs-pv', !!drag && drag.moved && !!drag.cand && drag.cand.indexOf(i) >= 0);
el.classList.toggle('bs-bad', !!drag && drag.moved && !!drag.cand && !drag.ok && drag.cand.indexOf(i) >= 0);
});
}
function finish(nope) {
bsDragging = null;
var g = bsGames[id]; if (g) { delete bsRenderQueued[id]; renderBsCard(g, { scroll: false }); }
var ng = card.querySelector('.bs-place'); if (nope && ng) ng.classList.add('bs-nope'); // no room to turn it there: a little shake
}
grid.addEventListener('pointerdown', function (ev) {
if (ev.button !== undefined && ev.button !== 0) return;
var lay = bsDraft[id]; if (!lay) return;
var c = cellAt(ev); if (c < 0) return;
var ch = lay.charAt(c); if (ch === '.') return;
ev.preventDefault();
var cells = bsShipCells(lay, ch);
drag = { pid: ev.pointerId, ch: ch, len: cells.length, horiz: cells[1] === cells[0] + 1, start: c, grab: cells.indexOf(c), moved: false, cand: null, ok: false, last: c };
bsDragging = id;
try { grid.setPointerCapture(ev.pointerId); } catch (e) {}
});
grid.addEventListener('pointermove', function (ev) {
if (!drag || ev.pointerId !== drag.pid) return;
var c = cellAt(ev); if (c < 0) c = drag.last; drag.last = c;
if (!drag.moved && c === drag.start) return;
drag.moved = true;
var r = Math.floor(c / 10), col = c % 10;
var r0 = drag.horiz ? r : r - drag.grab, c0 = drag.horiz ? col - drag.grab : col;
if (drag.horiz) c0 = Math.max(0, Math.min(10 - drag.len, c0)); else r0 = Math.max(0, Math.min(10 - drag.len, r0));
drag.cand = bsCellsFor(r0, c0, drag.len, drag.horiz);
drag.ok = bsFits(bsDraft[id], drag.ch, drag.cand);
paint();
});
grid.addEventListener('pointerup', function (ev) {
if (!drag || ev.pointerId !== drag.pid) return;
var d = drag, nope = false; drag = null;
if (!d.moved) nope = !bsRotate(id, d.ch, d.start);
else if (d.ok && d.cand) bsDraft[id] = bsPut(bsDraft[id], d.ch, d.cand);
finish(nope);
});
grid.addEventListener('pointercancel', function (ev) { if (drag && ev.pointerId === drag.pid) { drag = null; finish(); } });
}
async function bsCall(fn, args, peerId) {
var r = await sb.rpc(fn, args);
if (r.error) { imSys(peerId, r.error.message.replace(/^.*?:\s*/, '')); return null; }
if (r.data) { noteServerTime(r.data); bsArrived(r.data, false, true); }
return r.data;
}
var bsFleetLoading = {};
async function bsFetchFleet(id) {
if (bsFleetLoading[id]) return; bsFleetLoading[id] = true;
var r = await sb.from('battleship_fleets').select('layout').eq('game_id', id).eq('user_id', me.id).maybeSingle();
delete bsFleetLoading[id];
if (r.error || !r.data) return;
bsFleet[id] = r.data.layout;
if (!bsDraft[id]) bsDraft[id] = r.data.layout;
if (bsGames[id]) renderBsCard(bsGames[id], { scroll: false });
}
async function bsFetchReveal(id) {
var r = await sb.from('battleship_fleets').select('user_id, layout').eq('game_id', id).neq('user_id', me.id).maybeSingle();
if (r.error || !r.data) return;
bsReveal[id] = r.data.layout;
if (bsGames[id]) renderBsCard(bsGames[id], { scroll: false });
}
var bsReadying = {};
async function bsReady(g) {
if (bsReadying[g.id]) return; bsReadying[g.id] = true;
var lay = bsDraft[g.id] || bsFleet[g.id] || null;
if (lay && !bsValid(lay)) lay = null; // the server keeps the fleet it dealt
/* Mine from this moment: the answer can already be the battle starting (when the other fleet was
   ready first), and its first render has to show the fleet I arranged, not the one I was dealt. */
var before = bsFleet[g.id];
if (lay) bsFleet[g.id] = lay;
var r = await bsCall('battleship_ready', { p_game: g.id, p_layout: lay }, gamePeer(g));
delete bsReadying[g.id];
if (!r) { bsFleet[g.id] = before; bsFetchFleet(g.id); return; } // refused: whatever the server holds is the truth
if (!lay) bsFetchFleet(g.id);
}
async function bsFire(g, cell) {
if (bsFiring[g.id] != null) return;
bsFiring[g.id] = cell; renderBsCard(g, { scroll: false });
await bsCall('battleship_fire', { p_game: g.id, p_cell: cell }, gamePeer(g));
delete bsFiring[g.id];
if (bsGames[g.id]) renderBsCard(bsGames[g.id], { scroll: false });
}
async function challengeBattleship(peerId, name) {
if (!me) return;
if (!(await whisperAllowed(peerId))) { imSys(peerId, 'Add ' + name + ' as a friend to challenge them.'); return; }
var r = await sb.from('battleship_games').insert({ challenger_id: me.id, challenger_name: me.name, opponent_id: peerId, opponent_name: name }).select().single();
if (r.error) {
if (r.error.code === '23505') imSys(peerId, 'You already have a Battleship game open with ' + name + ' — finish it (or resign) first.');
else if (/row-level security/i.test(r.error.message)) imSys(peerId, name + ' only takes whispers from friends, so no challenge yet.');
else imSys(peerId, 'Could not send the challenge: ' + r.error.message);
return;
}
bsGames[r.data.id] = r.data; renderBsCard(r.data);
triggerPush(peerId, me.name + ' challenges you to Battleship', 'Open your whispers to accept.', 'gc-bs-' + r.data.id);
}
function bsCardClick(e, peerId) {
var card = e.target.closest('.bs-card'); if (!card) return false;
var g = bsGames[card.dataset.gid]; if (!g) return true;
var id = g.id;
var cell = e.target.closest('.bs-enemy .bs-cell.bs-open');
if (cell) { if (g.status === 'active' && g.phase === 'firing' && g.turn === me.id) bsFire(g, +cell.dataset.c); return true; }
var b = e.target.closest('button'); if (!b || b.disabled) return true;
var cl = b.classList;
if (cl.contains('bs-accept')) bsCall('battleship_respond', { p_game: id, p_accept: true }, peerId);
else if (cl.contains('bs-decline')) bsCall('battleship_respond', { p_game: id, p_accept: false }, peerId);
else if (cl.contains('bs-cancel')) bsCall('battleship_cancel', { p_game: id }, peerId);
else if (cl.contains('bs-rematch')) challengeBattleship(peerId, gamePeerName(g));
else if (cl.contains('bs-shuffle')) { var nl = bsRandomLayout(); if (nl) { bsDraft[id] = nl; renderBsCard(g, { scroll: false }); } }
else if (cl.contains('bs-ready')) bsReady(g);
else if (cl.contains('bs-resign')) {
if (!bsResignArmed[id]) {
bsResignArmed[id] = true; renderBsCard(g, { scroll: false });
setTimeout(function () { if (bsResignArmed[id]) { delete bsResignArmed[id]; if (bsGames[id]) renderBsCard(bsGames[id], { scroll: false }); } }, 3000);
} else { delete bsResignArmed[id]; bsCall('battleship_resign', { p_game: id }, peerId); }
}
return true;
}
/* A row arrived (realtime, a timeout, or the answer to my own call -- fromMe). Sounds for every new
   shot, from either side; the nudges (toast, badge) only for things the other side did. */
function bsArrived(g, isNew, fromMe) {
var prev = bsGames[g.id]; bsGames[g.id] = g;
var peer = gamePeer(g), name = gamePeerName(g);
var w = ensureWin(peer, name);
if (g.status === 'active' && !bsFleet[g.id]) bsFetchFleet(g.id);
if (g.status === 'finished' && !bsReveal[g.id]) bsFetchReveal(g.id);
renderBsCard(g);
var justFinished = g.status === 'finished' && (!prev || prev.status !== 'finished');
if (prev && bsShots(g) > bsShots(prev) && g.last_result && !justFinished) playSound(g.last_result === 'miss' ? 'bs-splash' : (g.last_result === 'sunk' ? 'bs-sunk' : 'bs-boom'));
if (fromMe) { if (justFinished && g.result !== 'resign') playSound(g.winner === me.id ? 'win' : 'lose'); return; }
var accepted = g.status === 'active' && g.phase === 'placing' && prev && prev.status === 'pending';
var myTurnNow = g.status === 'active' && g.phase === 'firing' && g.turn === me.id && (!prev || prev.turn !== me.id || prev.phase !== 'firing');
var forMe = (isNew && g.opponent_id === me.id) || accepted || myTurnNow || justFinished;
if (!forMe) return;
if (isNew) w.snippet = name + ' challenges you to Battleship';
else if (justFinished) w.snippet = g.winner === me.id ? 'Battleship: you won!' : 'Battleship: ' + name + ' won';
else if (accepted) w.snippet = 'Battleship: place your ships';
else w.snippet = 'Battleship: your turn';
gameNudge(w, peer, { kind: isNew ? 'challenge' : (justFinished ? 'finished' : 'turn'), game: 'Battleship', seconds: accepted ? BS_PLACE_SECONDS : turnSecondsLeft(g), result: g.winner === me.id ? 'win' : 'lose',
accept: function () { bsCall('battleship_respond', { p_game: g.id, p_accept: true }, peer); }, decline: function () { bsCall('battleship_respond', { p_game: g.id, p_accept: false }, peer); } });
}
/* The clocks, driven from clockTick(): the 60 s placing clock and the 30 s shot clock. Just before the
   placing bell this browser sends its own arranged fleet, so what was laid out is what sails; the
   timeout itself is only asked for a moment AFTER the server's own limit (62 s / 29 s), because a
   refused early call is never repeated for the same clock. */
function bsClockTick() {
Object.keys(bsGames).forEach(function (k) {
var g = bsGames[k]; if (g.status !== 'active') return;
var peer = gamePeer(g), w = wins[peer]; if (!w) return;
var placing = g.phase === 'placing', total = placing ? BS_PLACE_SECONDS : TURN_SECONDS;
var t = new Date(g.turn_started_at).getTime(); if (isNaN(t)) return;
var elapsed = (Date.now() - serverSkew - t) / 1000, left = Math.max(0, total - elapsed), sec = Math.ceil(left);
var el = w.log.querySelector('.turn-clock[data-clock="bs' + g.id + '"]');
if (el) { el.classList.toggle('low', left <= 15); el.querySelector('.tc-bar').style.width = Math.round(100 * left / total) + '%'; el.querySelector('.tc-num').textContent = sec; }
var key = 'bs' + g.id + ':' + g.phase + ':' + g.turn_started_at;
var mineToAct = placing ? !bsImReady(g) : g.turn === me.id;
if (left > 0 && left <= 15 && lastTickSecond[key] !== sec) { lastTickSecond[key] = sec; if (mineToAct || !w.minimized) tickSound(sec % 2 === 0); }
if (placing && !bsImReady(g) && left <= 2 && !timeoutsFired[key + ':ready']) { timeoutsFired[key + ':ready'] = true; bsReady(g); }
if (elapsed >= total + (placing ? 3 : 0) && !timeoutsFired[key]) {
timeoutsFired[key] = true;
sb.rpc('battleship_timeout', { p_game: g.id }).then(function (r) { if (!r.error && r.data) { noteServerTime(r.data); bsArrived(r.data, false, false); } });
}
});
}
async function loadBattleship() {
bsGames = {};
var since = new Date(Date.now() - 30 * 86400000).toISOString();
var r = await sb.from('battleship_games').select('*').or('challenger_id.eq.' + me.id + ',opponent_id.eq.' + me.id).gt('created_at', since).order('created_at', { ascending: true });
if (r.error) return;
r.data.forEach(function (g) { bsGames[g.id] = g; noteServerTime(g); });
var ids = r.data.filter(function (g) { return g.status === 'active' || (g.status === 'finished' && gameShowsCard(g)); }).map(function (g) { return g.id; });
if (ids.length) {
var f = await sb.from('battleship_fleets').select('game_id, user_id, layout').in('game_id', ids);
(f.data || []).forEach(function (x) { if (x.user_id === me.id) { bsFleet[x.game_id] = x.layout; if (!bsDraft[x.game_id]) bsDraft[x.game_id] = x.layout; } else bsReveal[x.game_id] = x.layout; });
}
r.data.forEach(function (g) { if (gameShowsCard(g)) renderBsCard(g, { scroll: false }); });
}

/* ---------- the Game Room: tables for up to four players (v169) ----------
   A page of its own -- the same full-screen takeover as the Popularity Contest -- opened from the poker
   table in the title bar on a desktop, or the poker-table bubble on a phone. It lists the open tables. Each table has
   four player seats and four spectator seats, a chat of its own, and a game: UNO for 2-4 players
   (v169), or no-limit Hold'em for 2-4 betting real XP (v170). supabase/game_tables_feature.sql and
   holdem_tables_feature.sql hold the rules and the security; every move here is an rpc, and this
   client repaints from what comes back and from realtime.

   Realtime lives on channels of its own, NOT the room channel: 'gameroom' (the table list, and my
   invites) for as long as I am signed on, and 'gtable:<id>' (the round, my hand, the table chat)
   while I sit at a table. A listened-to table missing from the publication stops every listener on
   its channel (the build 154 outage) -- kept apart, a mistake here can never take the room down.
   Seats are not published: every seat, host or status change touches game_tables.updated_at, and
   the UPDATE that produces is the cue to re-read that table's seats.

   While seated, the browser says "still here" once a minute (table_heartbeat); a seat not heard
   from for five minutes is freed, except a player holding cards in a running round -- the turn
   clock handles those (two missed turns in a row and they are out). */
var gameRoomPanel = $('gameRoomPanel'), gameRoomBtn = $('gameRoomBtn'), grBody = $('grBody'), gameRoomBack = $('gameRoomBack');
var gameRoomBtnHome = gameRoomBtn ? gameRoomBtn.parentNode : null;
var GR_GAMES = { uno: { name: 'UNO', icon: '🃏' }, holdem: { name: 'Hold’em', icon: '♠' } };
var GR_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
var grTables = {}, grSeats = {}, grInvites = {}, grMySeat = null;
var grUno = null, grHand = [], grHandRound = 0, grLog = [], grPick = null, grNote = '';
var grHd = null, grHdHand = [], grHdHandNo = 0, grHdTimer = null, grHdNextAt = {}, grHdResultSeen = {}, grHdSelfMove = false, grHdIdleOut = null, grHdLastStack = null;
var grChannel = null, grTableChannel = null, grTableChannelId = null, grHeartbeatTimer = null, grSeatTimers = {}, grUnoTimer = null;
var grFirstLoad = false, grSeatGen = 0, grBusy = false, grLeaveArmed = false, grLeaveTimer = null, grUnread = 0, grAnnounced = {}, grTimeoutFired = {}, grLastTick = '';

function grGame(t) { return GR_GAMES[t && t.game] || { name: 'game', icon: '🎲' }; }
function grOpen() { return !!(gcRoot && gcRoot.classList.contains('gameroom-open')); }
function grMyIndex() { return grUno && me ? grUno.players.indexOf(me.id) : -1; }
function grSeatsOf(tid, role) { return (grSeats[tid] || []).filter(function (s) { return !role || s.role === role; }).sort(function (a, b) { return a.seat - b.seat; }); }
function grOrdinal(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'); }
function grRoundOf(tid) { var t = grTables[tid]; return grUno && t && grUno.table_id === tid && grUno.round === t.round ? grUno : null; }
function grMyTurn() { var u = grUno, i = grMyIndex(); return !!(u && u.status === 'playing' && i >= 0 && u.turn === i + 1 && u.place[i] === 0); }
/* Hold'em: the table state is laid out by player seat -- index 0-3 here is seat 1-4 */
function grIsHd(tid) { var t = grTables[tid]; return !!(t && t.game === 'holdem'); }
function grHdOf(tid) { return grHd && grHd.table_id === tid ? grHd : null; }
function grHdSeat() { return grHd && me ? grHd.seat_user.indexOf(me.id) : -1; }
function grHdLive(h) { return !!h && ['preflop', 'flop', 'turn', 'river'].indexOf(h.street) >= 0; }
function grHdMaxBet(h) { var m = 0; for (var k = 0; k < 4; k++) if (h.in_hand[k] && !h.folded[k] && h.bet[k] > m) m = h.bet[k]; return m; }
function grHdPotTotal(h) { return h.pot + h.bet[0] + h.bet[1] + h.bet[2] + h.bet[3]; }
function grHdMyTurn() { var h = grHd, i = grHdSeat(); return !!(h && grHdLive(h) && i >= 0 && h.turn === i + 1); }
function grHdInHand() { var h = grHd, i = grHdSeat(); return !!(h && grHdLive(h) && i >= 0 && h.in_hand[i] && !h.folded[i]); }
function grStakesText(t) { var st = HD_STAKES[t && t.stakes] || HD_STAKES.low; return st.label + ' · blinds ' + st.sb + '/' + st.bb; }
function grStakesLong(t) { var st = HD_STAKES[t && t.stakes] || HD_STAKES.low; return grStakesText(t) + ' · sit with ' + st.min + '–' + st.max + ' XP'; }
function grHdFunded(h) { var n = 0; for (var k = 0; k < 4; k++) if (h.seat_user[k] && h.stack[k] > 0) n++; return n; }
function grHdActors(h, except) { var n = 0; for (var k = 0; k < 4; k++) if (k !== except && h.in_hand[k] && !h.folded[k] && h.stack[k] > 0) n++; return n; }
/* the pause after a hand before the browsers ask for the next one: longer after a showdown, so the
   cards can be read (the server deals no sooner than 4 s) */
function grHdPause(h) { return h.shown.some(Boolean) ? 8 : 5; }
function grHdSince(h) { return (Date.now() - serverSkew - new Date(h.hand_ended_at || h.updated_at).getTime()) / 1000; }
function grHdNextText(h) { var s = Math.ceil(grHdPause(h) - grHdSince(h)); return s > 0 ? 'Next hand in ' + s + 's…' : 'Dealing…'; }

/* ----- the page ----- */
function openGameRoom() {
if (!me || !gcRoot) return;
closeGif();
if (gcRoot.classList.contains('mobile-threads-open') && threadToggleBtn) threadToggleBtn.click();
if (gcRoot.classList.contains('mobile-roulette-open')) closeMobileRoulette();
if (gcRoot.classList.contains('leaderboard-open')) closeLeaderboard();
if (gcRoot.classList.contains('admin-open')) closeAdminPanel();
if (!grOpen()) rememberChatScroll();
gcRoot.classList.add('gameroom-open');
grUnread = 0; dismissToasts('gtable'); grMarkBtn();
renderGameRoom();
grRefresh();
}
function closeGameRoom() {
if (!grOpen()) return;
gcRoot.classList.remove('gameroom-open');
closeMiniMenu();
grMarkBtn();
returnToChat();
}
/* "Still here" plus the housekeeping sweep, then a fresh list -- so the page never opens on
   tables that have already emptied out. */
async function grRefresh() {
if (!me || !sb) return;
try { await sb.rpc('table_heartbeat'); } catch (e) {}
await loadGameRoom();
}
async function loadGameRoom() {
if (!me || !sb) return;
var gen = grSeatGen;
var t = await sb.from('game_tables').select('*').neq('status', 'closed').order('created_at', { ascending: false }).limit(40);
if (t.error) return;
var tables = {}; (t.data || []).forEach(function (row) { tables[row.id] = row; });
var mine = await sb.from('table_seats').select('*').eq('user_id', me.id).maybeSingle();
if (mine.error) return;
if (mine.data && !tables[mine.data.table_id]) {
var mt = await sb.from('game_tables').select('*').eq('id', mine.data.table_id).maybeSingle();
if (mt.data) tables[mt.data.id] = mt.data;
}
var ids = Object.keys(tables).map(Number), seats = {};
if (ids.length) {
var s = await sb.from('table_seats').select('table_id, user_id, name, role, seat, joined_at').in('table_id', ids);
if (s.error) return;
(s.data || []).forEach(function (x) { (seats[x.table_id] = seats[x.table_id] || []).push(x); });
}
var inv = await sb.from('table_invites').select('*').eq('user_id', me.id);
grTables = tables; grSeats = seats; grInvites = {};
(inv.data || []).forEach(function (x) { if (tables[x.table_id] && !blocked[x.from_id]) grInvites[x.table_id] = x; });
if (gen === grSeatGen) { // unless I sat down or left while this was loading
if (grMySeat && !mine.data) grMySeatGone(grWhyGone(grMySeat.table_id));
else grSetMySeat(mine.data || null);
}
if (grMySeat) grLoadTable(grMySeat.table_id);
renderGameRoom(); grMarkBtn();
/* back after a reload or a new sign-on while still holding a seat: say where */
if (grFirstLoad) {
grFirstLoad = false;
var mt = grMySeat && grTables[grMySeat.table_id];
if (mt && !grOpen()) showToast({ peer: 'gtable', kind: 'seat', icon: ICON_TABLE, text: 'You’re still at ' + (mt.host_id === me.id ? 'your' : (mt.host_name || 'someone') + '’s') + ' ' + grGame(mt).name + ' table', sub: 'Tap to go back to it', ttl: 12000, onClick: openGameRoom });
}
}
function grSetMySeat(seat) {
if ((grMySeat && grMySeat.table_id) !== (seat && seat.table_id)) grSeatGen++;
grMySeat = seat;
var tid = seat ? seat.table_id : null;
if (tid !== grTableChannelId) grWatchTable(tid);
if (tid) grStartHeartbeat(); else grStopHeartbeat();
}
function grWhyGone(tid) {
var t = grTables[tid], mi = grMyIndex();
if (!t || t.status === 'closed') return 'The table closed.';
if (grUno && grUno.table_id === tid && mi >= 0 && grUno.outcome[mi] === 'idle') return 'You missed two turns in a row, so you were taken off the table.';
if (grHdIdleOut === tid || (grHd && grHd.table_id === tid && grHd.last_action && grHd.last_action.indexOf(me.name + ' missed two turns') === 0)) return 'You missed two turns in a row, so you were taken off the table. Your chips went back to your XP.';
if (grIsHd(tid) && grHdLastStack === 0) return 'You ran out of chips, and every watcher’s seat was taken, so you left the table.';
if (grIsHd(tid)) return 'You were taken off the table: this device went quiet for a few minutes. Your chips went back to your XP.';
return 'You were taken off the table: this device went quiet for a few minutes.';
}
/* My seat is gone without my asking (two missed turns, a quiet device, the table closed). */
function grMySeatGone(why) {
if (!grMySeat) return;
var wasHd = !!grHd || grIsHd(grMySeat.table_id);
grSetMySeat(null);
if (wasHd && typeof refreshMyStats === 'function') refreshMyStats(); // my stack went back to my XP
grNote = why || 'You’re no longer at that table.';
renderGameRoom(); grMarkBtn();
if (!grOpen()) showToast({ peer: 'gtable', kind: 'seat', icon: ICON_TABLE, text: grNote, sub: 'Tap to open the Game Room', ttl: 9000, onClick: openGameRoom });
}
/* One line for the person: into the table chat when seated, otherwise at the top of the list. */
function grNotice(text) {
if (grMySeat) grSys(text); else { grNote = text; renderGameRoom(); }
if (!grOpen()) showToast({ peer: 'gtable', kind: 'note', icon: ICON_TABLE, text: text, sub: 'Tap to open the Game Room', ttl: 7000, onClick: openGameRoom });
}

/* ----- realtime ----- */
function grSubscribe() {
if (grChannel || !sb || !me) return;
grFirstLoad = true;
grChannel = sb.channel('gameroom')
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_tables' }, function (p) { grTableRowArrived(p.new, true); })
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_tables' }, function (p) { grTableRowArrived(p.new, false); })
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_invites', filter: 'user_id=eq.' + me.id }, function (p) { grInviteArrived(p.new); })
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'table_invites', filter: 'user_id=eq.' + me.id }, function (p) { grInviteArrived(p.new); })
.subscribe(function (status) { if (status === 'SUBSCRIBED') loadGameRoom(); });
}
function grUnsubscribe() {
if (grChannel) { try { sb.removeChannel(grChannel); } catch (e) {} grChannel = null; }
grWatchTable(null); grStopHeartbeat();
grTables = {}; grSeats = {}; grInvites = {}; grMySeat = null; grLog = []; grNote = ''; grUnread = 0; grAnnounced = {};
if (grBody) { grBody.innerHTML = ''; grBody.dataset.view = ''; }
if (gcRoot) gcRoot.classList.remove('gameroom-open');
if (gameRoomBtn) gameRoomBtn.classList.remove('ready', 'news', 'seated');
}
function grWatchTable(tid) {
if (grTableChannel) { try { sb.removeChannel(grTableChannel); } catch (e) {} grTableChannel = null; }
grTableChannelId = tid || null;
grUno = null; grHand = []; grHandRound = 0; grLog = []; grPick = null; grLeaveArmed = false;
grHd = null; grHdHand = []; grHdHandNo = 0; grHdIdleOut = null; grHdLastStack = null;
if (!tid || !sb || !me) return;
var ch = sb.channel('gtable:' + tid);
if (grIsHd(tid)) {
ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'holdem_tables', filter: 'table_id=eq.' + tid }, function (p) { grHdArrived(p.new); })
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'holdem_tables', filter: 'table_id=eq.' + tid }, function (p) { grHdArrived(p.new); grRefetchHd(tid); })
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'holdem_table_hands', filter: 'user_id=eq.' + me.id }, function (p) { grHdHandArrived(p.new); })
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'holdem_table_hands', filter: 'user_id=eq.' + me.id }, function (p) { grHdHandArrived(p.new); });
} else {
ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uno_tables', filter: 'table_id=eq.' + tid }, function (p) { grUnoArrived(p.new); })
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uno_tables', filter: 'table_id=eq.' + tid }, function (p) { grUnoArrived(p.new); grRefetchUno(tid); })
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uno_table_hands', filter: 'user_id=eq.' + me.id }, function (p) { grHandArrived(p.new); })
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uno_table_hands', filter: 'user_id=eq.' + me.id }, function (p) { grHandArrived(p.new); });
}
grTableChannel = ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_messages', filter: 'table_id=eq.' + tid }, function (p) { grMsgArrived(p.new); })
.subscribe(function (status) { if (status === 'SUBSCRIBED') grLoadTable(tid); });
}
/* The round, my hand and the chat for the table I sit at. The chat keeps the seat-change lines
   this device wrote itself, merged back in by time. */
async function grLoadTable(tid) {
if (!sb || !me) return;
var hd = grIsHd(tid);
var u = await sb.from(hd ? 'holdem_tables' : 'uno_tables').select('*').eq('table_id', tid).maybeSingle();
var h = await sb.from(hd ? 'holdem_table_hands' : 'uno_table_hands').select('*').eq('table_id', tid).eq('user_id', me.id).maybeSingle();
var m = await sb.from('table_messages').select('*').eq('table_id', tid).order('id', { ascending: false }).limit(60);
if (grTableChannelId !== tid) return; // moved on meanwhile
if (hd) {
if (!u.error && u.data) { if (!grHd || new Date(u.data.updated_at) >= new Date(grHd.updated_at)) { grHd = u.data; if (grHd.street === 'between') grHdResultSeen[tid + ':' + grHd.hand_no] = true; } } // a result already up is old news
if (!h.error) { grHdHand = h.data ? (h.data.cards || []) : []; grHdHandNo = h.data ? h.data.hand_no : 0; }
} else {
if (!u.error) { var prev = grUno; grUno = u.data || null; if (grUno && prev && prev.round === grUno.round && new Date(prev.updated_at) > new Date(grUno.updated_at)) grUno = prev; }
if (!h.error) { grHand = h.data ? (h.data.cards || []) : []; grHandRound = h.data ? h.data.round : 0; }
}
if (!m.error) {
var sys = grLog.filter(function (x) { return x.sys; });
var msgs = (m.data || []).filter(function (x) { return !blocked[x.sender_id]; }).map(function (x) { return { row: x, at: Date.parse(x.created_at) }; });
grLog = sys.concat(msgs).sort(function (a, b) { return a.at - b.at; }).slice(-150);
if (grBody && grBody.dataset.view === 'table:' + tid) grPaintChat();
}
renderGameRoom(); grMarkBtn();
}
function grRefetchUno(tid) {
clearTimeout(grUnoTimer);
grUnoTimer = setTimeout(function () {
sb.from('uno_tables').select('*').eq('table_id', tid).maybeSingle().then(function (r) { if (!r.error && r.data) grUnoArrived(r.data); });
}, 300);
}
async function grFetchHand() {
if (!grMySeat || !sb) return;
var tid = grMySeat.table_id;
var r = await sb.from('uno_table_hands').select('*').eq('table_id', tid).eq('user_id', me.id).maybeSingle();
if (r.error || grTableChannelId !== tid) return;
grHand = r.data ? (r.data.cards || []) : []; grHandRound = r.data ? r.data.round : 0;
renderGameRoom();
}
function grRefetchHd(tid) {
clearTimeout(grHdTimer);
grHdTimer = setTimeout(function () {
sb.from('holdem_tables').select('*').eq('table_id', tid).maybeSingle().then(function (r) { if (!r.error && r.data) grHdArrived(r.data); });
}, 300);
}
async function grHdFetchHand() {
if (!grMySeat || !sb) return;
var tid = grMySeat.table_id;
var r = await sb.from('holdem_table_hands').select('*').eq('table_id', tid).eq('user_id', me.id).maybeSingle();
if (r.error || grTableChannelId !== tid) return;
grHdHand = r.data ? (r.data.cards || []) : []; grHdHandNo = r.data ? r.data.hand_no : 0;
renderGameRoom();
}
function grHdHandArrived(row) {
if (!row || row.user_id !== me.id || row.table_id !== grTableChannelId) return;
if (grHdHandNo && row.hand_no < grHdHandNo) return;
grHdHand = row.cards || []; grHdHandNo = row.hand_no;
renderGameRoom();
}
function grHdArrived(row) {
if (!row || row.table_id !== grTableChannelId) return;
var prev = grHd;
if (prev && prev.updated_at && row.updated_at && new Date(row.updated_at) < new Date(prev.updated_at)) return; // an older, half-way row
/* gone from my seat while my clock ran, with a turn already missed: that was the second miss */
var pi = prev ? prev.seat_user.indexOf(me.id) : -1;
if (pi >= 0 && row.seat_user.indexOf(me.id) < 0 && grHdLive(prev) && prev.turn === pi + 1 && prev.missed[pi] >= 1) grHdIdleOut = row.table_id;
if (row.seat_user.indexOf(me.id) >= 0) grHdLastStack = row.stack[row.seat_user.indexOf(me.id)];
grHd = row;
if ((!prev || prev.hand_no !== row.hand_no) && row.seat_user.indexOf(me.id) >= 0) grHdFetchHand();
grHdEvents(prev, row);
renderGameRoom(); grMarkBtn();
}
/* Hold'em: sounds, toasts and the hand history, for what just happened at my table. */
function grHdEvents(prev, h) {
var i = h.seat_user.indexOf(me.id), key = 'gh' + h.table_id;
var newHand = !prev || prev.hand_no !== h.hand_no;
if (grHdLive(h) && (newHand || prev.street !== h.street)) gameSfx(key, 'card');
else if (prev && grHdLive(h) && grHdPotTotal(h) > grHdPotTotal(prev)) gameSfx(key, 'chips');
var myTurn = grHdLive(h) && i >= 0 && h.turn === i + 1;
if (myTurn && (newHand || prev.turn !== h.turn || prev.street !== h.street || prev.turn_started_at !== h.turn_started_at)) {
playSound('turn');
if (!grOpen() || document.hidden) {
var secs = Math.ceil(turnSecondsLeft(h)), toCall = Math.max(0, grHdMaxBet(h) - h.bet[i]);
showToast({ peer: 'gtable', kind: 'turn', icon: '♠', text: 'Hold’em: your move' + (toCall ? ' — ' + toCall + ' to call' : ''), sub: secs + 's left — tap to play', countdown: secs, ttl: Math.max(3000, secs * 1000), onClick: openGameRoom });
}
if (document.hidden) bumpTitle();
}
/* a hand just finished: its result goes into the table chat, once */
var rk = h.table_id + ':' + h.hand_no;
if (h.street === 'between' && h.hand_result && !grHdResultSeen[rk]) {
grHdResultSeen[rk] = true;
grSys('Hand ' + h.hand_no + ': ' + h.hand_result);
if (i >= 0 && h.won[i] > 0) playSound('win');
}
}
function grHandArrived(row) {
if (!row || row.user_id !== me.id || row.table_id !== grTableChannelId) return;
if (grHandRound && row.round < grHandRound) return;
grHand = row.cards || []; grHandRound = row.round;
renderGameRoom();
}
function grTableRowArrived(row, isNew) {
if (!row || !me) return;
var prev = grTables[row.id];
if (row.status === 'closed') { delete grTables[row.id]; delete grInvites[row.id]; }
else grTables[row.id] = row;
if (isNew && row.status === 'open') grAnnounce(row);
if (grMySeat && grMySeat.table_id === row.id) {
if (row.status === 'closed') { grMySeatGone('The table closed.'); return; }
if (prev && prev.host_id !== row.host_id && row.host_id) grSys(row.host_id === me.id ? 'You’re the host now: you deal the rounds and can invite friends.' : (row.host_name || 'Someone') + ' is the host now.');
}
/* re-read the seats shortly after -- at most once per 150 ms per table however many changes land,
   and never pushed back by a later change (so a busy table can't starve its own seat list) */
if (row.status !== 'closed') {
if (!grSeatTimers[row.id]) grSeatTimers[row.id] = setTimeout(function () { delete grSeatTimers[row.id]; grFetchSeats(row.id); }, 150);
} else delete grSeats[row.id];
renderGameRoom(); grMarkBtn();
}
async function grFetchSeats(tid) {
var gen = grSeatGen;
var r = await sb.from('table_seats').select('table_id, user_id, name, role, seat, joined_at').eq('table_id', tid);
if (r.error) return;
var old = grSeats[tid];
grSeats[tid] = r.data || [];
if (grMySeat && grMySeat.table_id === tid && gen === grSeatGen) {
var mine = grSeats[tid].filter(function (s) { return s.user_id === me.id; })[0];
if (old) grDiffSeats(old, grSeats[tid]);
if (!mine) { grMySeatGone(grWhyGone(tid)); return; }
if (grIsHd(tid) && grMySeat.role === 'player' && mine.role === 'spectator' && !grHdSelfMove) {
grSys('You’re out of chips, so you’re watching now. Take a seat again to buy back in.');
if (typeof refreshMyStats === 'function') refreshMyStats();
}
grMySeat = mine;
}
renderGameRoom();
}
/* Who came, went, or moved, as lines in the table chat (only for the table I sit at). */
function grDiffSeats(old, now) {
var o = {}, n = {};
old.forEach(function (s) { o[s.user_id] = s; }); now.forEach(function (s) { n[s.user_id] = s; });
now.forEach(function (s) {
if (s.user_id === me.id) return;
var p = o[s.user_id], nm = s.name || 'Someone';
if (!p) grSys(nm + (s.role === 'player' ? ' sat down.' : ' is watching.'));
else if (p.role !== s.role) grSys(nm + (s.role === 'player' ? (grHd ? ' sat down to play.' : ' took a seat for the next round.') : ' moved to watching.'));
});
old.forEach(function (s) { if (!n[s.user_id] && s.user_id !== me.id) grSys((s.name || 'Someone') + ' left the table.'); });
}
function grUnoArrived(row) {
if (!row || row.table_id !== grTableChannelId) return;
var prev = grUno;
if (prev && prev.round === row.round && prev.updated_at && row.updated_at && new Date(row.updated_at) < new Date(prev.updated_at)) return; // an older, half-way row
if (prev && prev.round > row.round) return;
grUno = row;
var newRound = !prev || prev.round !== row.round;
if (newRound) { grPick = null; if (row.players.indexOf(me.id) >= 0) grFetchHand(); }
grUnoEvents(prev, row, newRound);
renderGameRoom(); grMarkBtn();
}
/* Sounds, toasts and the title nudge for what just happened at my table. */
function grUnoEvents(prev, u, newRound) {
var mi = u.players.indexOf(me.id), key = 'gt' + u.table_id;
if (u.status === 'playing' && (newRound || prev.last_action !== u.last_action)) gameSfx(key, 'card');
if (newRound && u.status === 'playing' && mi >= 0 && !grOpen()) showToast({ peer: 'gtable', kind: 'deal', icon: '🃏', text: 'UNO: round ' + u.round + ' is dealt', sub: 'Tap to play', ttl: 8000, onClick: openGameRoom });
var myTurn = u.status === 'playing' && mi >= 0 && u.turn === mi + 1 && u.place[mi] === 0;
if (myTurn && (newRound || prev.turn !== u.turn || prev.turn_started_at !== u.turn_started_at)) {
playSound('turn');
if (!grOpen() || document.hidden) {
var secs = Math.ceil(turnSecondsLeft(u));
showToast({ peer: 'gtable', kind: 'turn', icon: '🃏', text: 'UNO: your turn', sub: secs + 's left — tap to play', countdown: secs, ttl: Math.max(3000, secs * 1000), onClick: openGameRoom });
}
if (document.hidden) bumpTitle();
}
if (prev && !newRound && mi >= 0 && prev.place[mi] === 0 && u.outcome[mi] === 'out' && u.place[mi] === 1) playSound('win');
if (prev && !newRound && prev.status === 'playing' && u.status === 'over') {
if (mi >= 0 && u.outcome[mi] === 'last') playSound('lose'); else if (mi < 0) playSound('ding');
if (mi >= 0 && !grOpen()) {
var first = u.place.indexOf(1);
showToast({ peer: 'gtable', kind: 'over', icon: '🃏', text: u.outcome[mi] === 'out' ? 'UNO: you placed ' + grOrdinal(u.place[mi]) + (u.points[mi] > 0 ? ' (+' + u.points[mi] + ' XP)' : '') : 'UNO: round over' + (first >= 0 && u.outcome[first] === 'out' ? ' — ' + u.names[first] + ' won' : ''), sub: 'Tap to see the table', ttl: 9000, onClick: openGameRoom });
}
}
}
function grMsgArrived(row) {
if (!row || !grMySeat || row.table_id !== grMySeat.table_id || blocked[row.sender_id]) return;
if (grLog.some(function (x) { return x.row && x.row.id === row.id; })) return;
grPushLog({ row: row, at: Date.parse(row.created_at) || Date.now() });
if (row.sender_id === me.id) return;
if (!grOpen()) { grUnread++; grMarkBtn(); } else messageSound(true);
if (document.hidden) bumpTitle();
}
function grInviteArrived(row) {
if (!row || row.user_id !== me.id || blocked[row.from_id]) return;
if (grMySeat && grMySeat.table_id === row.table_id) return;
grInvites[row.table_id] = row;
var t = grTables[row.table_id];
playSound('challenge');
showToast({ peer: 'gtable-' + row.table_id, kind: 'invite', icon: ICON_TABLE, text: (row.from_name || 'A friend') + ' invites you to their ' + (t ? grGame(t).name : 'game') + ' table',
sub: 'In the Game Room', ttl: 60000, onClick: function () { grJoin(row.table_id); },
actions: [['Join', function () { grJoin(row.table_id); }], ['No thanks', function () { grDismissInvite(row.table_id); }]] });
if (document.hidden) bumpTitle();
if (!t) loadGameRoom(); else { renderGameRoom(); grMarkBtn(); }
}
/* A new table, in the main chat, with a Join button. Drawn from the realtime INSERT itself, so the
   name on it is always the real host. */
function grAnnounce(row) {
if (!row || grAnnounced[row.id] || row.host_id === me.id || blocked[row.host_id] || !roomHistoryIn || !log) return;
grAnnounced[row.id] = true;
var g = grGame(row), now = Date.now();
var d = document.createElement('div'); d.className = 'm sys gr-announce';
d.innerHTML = '<span class="t">' + fmt(now) + '</span>' + g.icon + ' <b class="gr-an-who">' + esc(row.host_name || 'Someone') + '</b> opened ' + (/^[AEIOU]/.test(g.name) ? 'an ' : 'a ') + esc(g.name) + ' table' + (row.game === 'holdem' ? ' (' + esc(grStakesText(row).toLowerCase()) + ')' : '') + ' in the Game Room. <button type="button" class="gr-announce-join">Join</button>';
d.querySelector('button').onclick = function () { grJoin(row.id); };
var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
dayDivider(log, 'room', now);
log.appendChild(d);
if (atBottom) log.scrollTop = log.scrollHeight; else bumpNewPill();
}
function grMarkBtn() {
if (!gameRoomBtn) return;
var turn = grMyTurn() || grHdMyTurn();
var news = Object.keys(grInvites).length > 0 || (!grOpen() && (grUnread > 0 || turn));
gameRoomBtn.classList.toggle('news', news);
gameRoomBtn.classList.toggle('seated', !!grMySeat);
gameRoomBtn.setAttribute('aria-label', 'Game Room' + (turn ? ' — your turn' : (Object.keys(grInvites).length ? ' — you have an invite' : '')));
}

/* ----- heartbeat ----- */
function grBeat() { if (me && sb && grMySeat) sb.rpc('table_heartbeat').then(function () {}, function () {}); }
function grStartHeartbeat() { if (!grHeartbeatTimer) grHeartbeatTimer = setInterval(grBeat, 60000); }
function grStopHeartbeat() { clearInterval(grHeartbeatTimer); grHeartbeatTimer = null; }
document.addEventListener('visibilitychange', function () { if (!document.hidden) grBeat(); });

/* ----- actions ----- */
async function grOpenTable(game) {
if (grBusy || !me) return;
grBusy = true;
try {
var r = await sb.rpc('table_open', { p_game: game });
if (r.error) { grNotice(r.error.message); return; }
grTables[r.data.id] = r.data; grAnnounced[r.data.id] = true; grNote = '';
var s = await sb.from('table_seats').select('*').eq('user_id', me.id).maybeSingle();
grSetMySeat(s.data || null);
await grFetchSeats(r.data.id);
grSys('Your table is open, and it has been announced in the main chat. Deal once at least one more player sits down, or invite a friend.');
} finally { grBusy = false; renderGameRoom(); grMarkBtn(); }
}
async function grSit(tid, role) {
if (grBusy || !me) return;
grBusy = true;
var cashing = grIsHd(tid) && grMySeat && grMySeat.table_id === tid && grMySeat.role === 'player';
if (cashing) grHdSelfMove = true;
try {
var r = await sb.rpc('table_sit', { p_table: tid, p_role: role });
if (r.error) { grNotice(r.error.message); return; }
grTables[tid] = r.data; delete grInvites[tid]; grNote = ''; dismissToasts('gtable-' + tid);
var s = await sb.from('table_seats').select('*').eq('user_id', me.id).maybeSingle();
grSetMySeat(s.data || null);
await grFetchSeats(tid);
if (cashing) { grSys('You cashed out: your chips went back to your XP.'); if (typeof refreshMyStats === 'function') refreshMyStats(); }
} finally { grBusy = false; grHdSelfMove = false; renderGameRoom(); grMarkBtn(); }
}
/* Hold'em: pick the stakes when opening a table, and a buy-in whenever you take a player seat. */
function grHdStakesMenu(anchor) {
showMiniMenu(anchor, 'Open a Hold’em table', [
['♠ Low stakes — blinds 1/2, sit with 5–10 XP', function () { grHdOpen('low'); }],
['♠ High stakes — blinds 2/5, sit with 10–50 XP', function () { grHdOpen('high'); }]
]);
}
async function grHdAskBuyIn(stakes, title) {
var st = HD_STAKES[stakes] || HD_STAKES.low, have = myXp();
if (have < st.min) { grNotice('You need at least ' + st.min + ' XP to sit down at a ' + st.label.toLowerCase() + ' table (you have ' + have + '). XP comes from reactions and from winning games.'); return null; }
var top = Math.min(st.max, have);
var v = await showPromptModal(title, { value: String(top), placeholder: st.min + '–' + top, maxLength: 3, okLabel: 'Sit down',
hint: st.label + ': blinds ' + st.sb + '/' + st.bb + '. Sit down with ' + st.min + ' to ' + top + ' XP. It leaves your XP now and comes back, plus or minus, when you get up.' });
if (v === null) return null;
var amt = parseInt(v, 10);
if (!(amt >= st.min && amt <= st.max)) { grNotice('Sit down with ' + st.min + ' to ' + st.max + ' XP at this table.'); return null; }
if (amt > have) { grNotice('You only have ' + have + ' XP.'); return null; }
return amt;
}
async function grHdOpen(stakes) {
if (grBusy || !me) return;
var amt = await grHdAskBuyIn(stakes, 'Open a Hold’em table');
if (amt == null) return;
grBusy = true;
try {
var r = await sb.rpc('holdem_table_open', { p_stakes: stakes, p_buy_in: amt });
if (r.error) { grNotice(r.error.message); return; }
grTables[r.data.id] = r.data; grAnnounced[r.data.id] = true; grNote = '';
var s = await sb.from('table_seats').select('*').eq('user_id', me.id).maybeSingle();
grSetMySeat(s.data || null);
await grFetchSeats(r.data.id);
grSys('Your table is open, and it has been announced in the main chat. Deal once at least one more player sits down, or invite a friend.');
if (typeof refreshMyStats === 'function') refreshMyStats();
} finally { grBusy = false; renderGameRoom(); grMarkBtn(); }
}
async function grHdSit(tid) {
if (grBusy || !me) return;
var t = grTables[tid]; if (!t) return;
var amt = await grHdAskBuyIn(t.stakes || 'low', 'Sit down at ' + (t.host_name || 'this') + (t.host_name ? '’s' : '') + ' table');
if (amt == null) return;
grBusy = true;
try {
var r = await sb.rpc('holdem_table_sit', { p_table: tid, p_buy_in: amt });
if (r.error) { grNotice(r.error.message); return; }
grTables[tid] = r.data; delete grInvites[tid]; grNote = ''; dismissToasts('gtable-' + tid);
var s = await sb.from('table_seats').select('*').eq('user_id', me.id).maybeSingle();
grSetMySeat(s.data || null);
await grFetchSeats(tid);
if (typeof refreshMyStats === 'function') refreshMyStats();
} finally { grBusy = false; renderGameRoom(); grMarkBtn(); }
}
/* From an announcement, an invite toast or the list: sit down if a player seat is free and no game
   is on, otherwise take a spectator seat. */
async function grJoin(tid) {
openGameRoom();
if (grMySeat && grMySeat.table_id === tid) return;
if (grMySeat) { grNotice('You’re at another table. Leave it first to join this one.'); return; }
if (!grTables[tid]) await loadGameRoom();
var t = grTables[tid];
if (!t) { grNotice('That table has closed.'); return; }
var players = grSeatsOf(tid, 'player').length;
if (t.game === 'holdem') {
var st = HD_STAKES[t.stakes] || HD_STAKES.low;
if (players < 4 && myXp() >= st.min) { await grHdSit(tid); return; }
await grSit(tid, 'spectator');
if (grMySeat && grMySeat.table_id === tid) grSys(players >= 4 ? 'All four player seats are taken, so you’re watching.' : 'You need at least ' + st.min + ' XP to play here (you have ' + myXp() + '), so you’re watching.');
return;
}
await grSit(tid, t.status === 'open' && players < 4 ? 'player' : 'spectator');
}
async function grDismissInvite(tid) {
delete grInvites[tid]; dismissToasts('gtable-' + tid);
renderGameRoom(); grMarkBtn();
try { await sb.rpc('table_invite_dismiss', { p_table: tid }); } catch (e) {}
}
/* Leaving in the middle of a round forfeits it (you take the lowest place, no XP), so that asks
   twice: the first press arms the button for four seconds. */
async function grLeave() {
if (!grMySeat) return;
var u = grRoundOf(grMySeat.table_id), mi = grMyIndex();
if (((u && u.status === 'playing' && mi >= 0 && u.place[mi] === 0) || grHdInHand()) && !grLeaveArmed) {
grLeaveArmed = true; renderGameRoom();
clearTimeout(grLeaveTimer); grLeaveTimer = setTimeout(function () { grLeaveArmed = false; renderGameRoom(); }, 4000);
return;
}
grLeaveArmed = false; clearTimeout(grLeaveTimer);
var tid = grMySeat.table_id, wasHd = grIsHd(tid), hadChips = wasHd && grMySeat.role === 'player';
grSetMySeat(null); grNote = '';
renderGameRoom(); grMarkBtn();
var r = await sb.rpc('table_leave', { p_table: tid });
if (r.error) grNotice(r.error.message);
else if (wasHd) {
if (hadChips) grNote = 'You left the table, and your chips went back to your XP.';
if (typeof refreshMyStats === 'function') refreshMyStats();
}
await loadGameRoom();
}
/* Every game move: one rpc, then repaint from the row it returns (and re-read my hand). */
async function grMove(fn, args) {
if (grBusy || !grMySeat) return;
grBusy = true;
var hd = grIsHd(grMySeat.table_id);
try {
var r = await sb.rpc(fn, Object.assign({ p_table: grMySeat.table_id }, args || {}));
if (r.error) grSys(r.error.message);
else if (r.data) { noteServerTime(r.data); if (hd) grHdArrived(r.data); else grUnoArrived(r.data); }
} finally {
grBusy = false;
if (grMySeat && !hd) grFetchHand(); // Hold'em cards only change on a deal, which re-reads them itself
renderGameRoom(); grMarkBtn();
}
}
function grPlay(card, colour) {
if (grBusy) return;
var i = grHand.indexOf(card); if (i >= 0) grHand.splice(i, 1); // optimistic; grFetchHand puts it right
grPick = null;
grMove('uno_table_play', { p_card: card, p_color: colour || null });
}
async function grSay() {
var inp = grBody && grBody.querySelector('.gr-chatin');
if (!inp || !grMySeat) return;
var body = sanitizeInput(inp.value).trim().slice(0, 300);
if (!body) return;
if (!(await threadGate())) return; // the same spam cooldown as the room and the threads board
var r = await sb.rpc('table_say', { p_table: grMySeat.table_id, p_body: body });
if (r.error) { grSys(r.error.message); return; }
inp.value = '';
messageSound(false);
grMsgArrived(r.data);
}
function grInviteMenu(anchor) {
if (!grMySeat) return;
var tid = grMySeat.table_id, seated = {};
(grSeats[tid] || []).forEach(function (s) { seated[s.user_id] = true; });
var ids = Object.keys(friends).filter(function (id) { return !seated[id] && !blocked[id]; });
if (!ids.length) { grSys('Only people on your friends list can be invited. Anyone else can find the table in the Game Room.'); return; }
ids.sort(function (a, b) { return (people[b] ? 1 : 0) - (people[a] ? 1 : 0) || String(friends[a].name || '').localeCompare(String(friends[b].name || '')); });
showMiniMenu(anchor, 'Invite a friend', ids.slice(0, 30).map(function (id) {
return [(people[id] ? '● ' : '○ ') + esc(friends[id].name || '?'), function () { grInvite(tid, id, friends[id].name || 'them'); }];
}));
}
async function grInvite(tid, id, name) {
var r = await sb.rpc('table_invite', { p_table: tid, p_user: id });
if (r.error) { grSys(r.error.message); return; }
grSys('Invited ' + name + '.');
triggerPush(id, me.name + ' invites you to their ' + grGame(grTables[tid]).name + ' table', 'Open the Game Room to join.', 'gc-table-' + tid);
}
async function grAdminClose(tid) {
var r = await sb.rpc('table_close', { p_table: tid });
if (r.error) grNotice(r.error.message); else loadGameRoom();
}

/* ----- drawing: the list ----- */
function renderGameRoom() {
if (!grBody || !me || !grOpen()) return;
var tid = grMySeat && grMySeat.table_id;
if (tid && grTables[tid]) renderGrTable(tid); else renderGrLobby();
}
function renderGrLobby() {
grBody.dataset.view = 'lobby';
var html = grNote ? '<div class="gr-note">' + esc(grNote) + '</div>' : '';
var invs = Object.keys(grInvites).map(function (k) { return grInvites[k]; }).filter(function (v) { return grTables[v.table_id]; });
if (invs.length) html += '<div class="gr-invites">' + invs.map(function (v) {
return '<div class="gr-invite"><span>✉ <b>' + esc(v.from_name || 'A friend') + '</b> invites you to their ' + esc(grGame(grTables[v.table_id]).name) + ' table.</span>'
+ '<span class="gr-btns"><button type="button" class="btn gr-join" data-t="' + v.table_id + '">Join</button><button type="button" class="btn gr-noinv" data-t="' + v.table_id + '">No thanks</button></span></div>';
}).join('') + '</div>';
html += '<div class="gr-open"><div class="gr-open-hd">Start a table</div><div class="gr-open-row">'
+ '<button type="button" class="gr-newtable" data-game="uno"><span class="gr-nt-i">🃏</span><span class="gr-nt-n">UNO</span><span class="gr-nt-s">2–4 players · watchers welcome</span></button>'
+ '<button type="button" class="gr-newtable" data-game="holdem"><span class="gr-nt-i">♠</span><span class="gr-nt-n">Hold’em</span><span class="gr-nt-s">2–4 players · bet your XP · watchers welcome</span></button>'
+ '</div></div>';
var list = Object.keys(grTables).map(function (k) { return grTables[k]; })
.filter(function (t) { return t.status !== 'closed' && !blocked[t.host_id]; })
.sort(function (a, b) { return (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.id - a.id; });
html += '<div class="gr-list-hd">Tables</div>';
html += list.length ? list.map(grTableRowHtml).join('') : '<div class="gr-empty">No tables yet. Start one: it gets announced in the main chat.</div>';
grBody.innerHTML = html;
}
function grTableRowHtml(t) {
var players = grSeatsOf(t.id, 'player'), watchers = grSeatsOf(t.id, 'spectator'), g = grGame(t), hd = t.game === 'holdem';
var state = t.status === 'playing' ? (hd ? 'Hand ' + t.round + ' in play' : 'Round ' + t.round + ' in play') : (players.length >= 2 && !(hd && t.round) ? 'Waiting to deal' : 'Waiting for players');
/* Hold'em: a free player seat can be taken at any time -- you're dealt in at the next hand */
var canPlay = players.length < 4 && (hd || t.status === 'open'), canWatch = watchers.length < 4;
var names = function (list, none) { return list.map(function (s) { return '<span class="gr-nm">' + esc(s.name || '?') + '</span>'; }).join(', ') || '<i>' + none + '</i>'; };
return '<div class="gr-row' + (grInvites[t.id] ? ' invited' : '') + '">'
+ '<div class="gr-row-hd"><span class="gr-row-g">' + g.icon + ' ' + esc(g.name) + '</span>' + (hd ? '<span class="gr-row-stakes">' + esc(grStakesLong(t)) + '</span>' : '') + '<span class="gr-row-host">' + esc((t.host_name || 'Someone') + '’s table') + '</span><span class="gr-row-st' + (t.status === 'playing' ? ' live' : '') + '">' + esc(state) + '</span></div>'
+ '<div class="gr-row-who"><span class="gr-row-lbl">Players ' + players.length + '/4</span> ' + names(players, 'none yet') + '<br><span class="gr-row-lbl">Watching ' + watchers.length + '/4</span> ' + names(watchers, 'nobody') + '</div>'
+ '<div class="gr-btns">' + (isAdmin ? '<button type="button" class="btn gr-close" data-t="' + t.id + '">Close</button>' : '')
+ (canPlay ? '<button type="button" class="btn ' + (hd ? 'gr-hdsit' : 'gr-sit') + '" data-t="' + t.id + '" data-role="player">Sit down</button>' : '')
+ (canWatch ? '<button type="button" class="btn gr-sit" data-t="' + t.id + '" data-role="spectator">Watch</button>' : '')
+ (!canPlay && !canWatch ? '<span class="gr-full">Full</span>' : '') + '</div></div>';
}

/* ----- drawing: my table ----- */
function renderGrTable(tid) {
if (grBody.dataset.view !== 'table:' + tid) {
grBody.dataset.view = 'table:' + tid;
grBody.innerHTML = '<div class="gr-table"><div class="gr-game"><div class="gr-thd"></div><div class="gr-seats"></div><div class="gr-felt"></div><div class="gr-mine"></div><div class="gr-watch"></div></div>'
+ '<div class="gr-chat"><div class="gr-chat-hd">Table chat</div><div class="gr-chatlog" aria-live="polite" aria-label="Table chat"></div>'
+ '<form class="gr-chatform" autocomplete="off"><input type="text" class="sunk gr-chatin" maxlength="300" enterkeyhint="send" placeholder="Talk to the table…" aria-label="Talk to the table"><button type="submit" class="btn">Send</button></form></div></div>';
grPaintChat();
}
grPaintTop(tid); grPaintSeats(tid); grPaintFelt(tid); grPaintMine(tid); grPaintWatch(tid);
}
function grPaintTop(tid) {
var el = grBody.querySelector('.gr-thd'); if (!el) return;
var t = grTables[tid], g = grGame(t), hd = grIsHd(tid), h = grHdOf(tid);
var sub = hd ? ' · ' + grStakesText(t) + (h && h.hand_no ? ' · hand ' + h.hand_no : '') : (t.round ? ' · round ' + t.round : '');
el.innerHTML = '<span class="gr-thd-t">' + g.icon + ' ' + esc((t.host_name || 'Someone') + '’s ' + g.name + ' table') + (sub ? '<span class="gr-thd-r">' + esc(sub) + '</span>' : '') + '</span>'
+ '<span class="gr-btns">' + (t.host_id === me.id ? '<button type="button" class="btn gr-invbtn">Invite</button>' : '')
+ '<button type="button" class="btn gr-leave' + (grLeaveArmed ? ' armed' : '') + '">' + (grLeaveArmed ? (hd ? 'Fold and leave?' : 'Forfeit and leave?') : 'Leave') + '</button></span>';
}
function grPaintSeats(tid) {
if (grIsHd(tid)) { grHdPaintSeats(tid); return; }
var el = grBody.querySelector('.gr-seats'); if (!el) return;
var t = grTables[tid], u = grRoundOf(tid), live = !!(u && u.status === 'playing'), bySeat = {};
grSeatsOf(tid, 'player').forEach(function (s) { bySeat[s.seat] = s; });
var canSit = grMySeat.role === 'spectator' && t.status === 'open';
el.innerHTML = [1, 2, 3, 4].map(function (n) {
var s = bySeat[n];
if (!s) return '<div class="gr-seat empty"><span class="gr-seat-n">Seat ' + n + '</span>' + (canSit ? '<button type="button" class="btn gr-sit" data-t="' + tid + '" data-role="player">Sit here</button>' : '<span class="gr-seat-e">empty</span>') + '</div>';
var i = u ? u.players.indexOf(s.user_id) : -1;
var html = '<div class="gr-seat' + (s.user_id === me.id ? ' me' : '') + (live && i >= 0 && u.turn === i + 1 ? ' turn' : '') + (i >= 0 && u.place[i] > 0 ? ' done' : '') + '">'
+ '<div class="gr-seat-hd">' + (t.host_id === s.user_id ? '<span class="gr-host" title="Host">👑</span>' : '') + '<b class="gr-seat-nm">' + esc(s.name || '?') + '</b>' + (s.user_id === me.id ? '<span class="gr-you">you</span>' : '') + '</div>';
if (i >= 0 && u.place[i] === 0) {
var c = u.cards[i], backs = '';
for (var k = 0; k < Math.min(c, 7); k++) backs += '<span class="uno-c back small" aria-hidden="true"></span>';
html += '<div class="gr-seat-cards"><span class="uno-backs">' + backs + '</span><span class="gr-ct" aria-label="' + c + ' cards">' + c + '</span>' + (u.uno[i] ? '<span class="uno-badge">UNO!</span>' : '') + '</div>';
if (live && u.missed[i] > 0) html += '<div class="gr-seat-warn">⏰ missed a turn</div>';
} else if (i >= 0) html += '<div class="gr-seat-place">' + grPlaceHtml(u, i) + '</div>';
else html += '<div class="gr-seat-wait">' + (live ? 'plays next round' : 'ready') + '</div>';
return html + '</div>';
}).join('');
}
function grPlaceHtml(u, i) {
var o = u.outcome[i], p = u.place[i];
if (o === 'left') return '<span class="gr-gone">left</span>';
if (o === 'idle') return '<span class="gr-gone">timed out</span>';
if (o === 'last') return p === 1 ? '<span class="gr-gone">last one left, no XP</span>' : grOrdinal(p);
if (o === 'out') return '<span class="gr-medal">' + (GR_MEDAL[p] || grOrdinal(p)) + '</span> ' + (u.points[i] > 0 ? '<span class="gr-xp">+' + u.points[i] + ' XP</span>' : '<span class="ttt-cap">daily XP cap reached</span>');
return '';
}
function grPaintFelt(tid) {
if (grIsHd(tid)) { grHdPaintFelt(tid); return; }
var el = grBody.querySelector('.gr-felt'); if (!el) return;
var t = grTables[tid], u = grRoundOf(tid), n = grSeatsOf(tid, 'player').length, html = '';
if (u && u.status === 'playing') {
var mi = grMyIndex(), myTurn = grMyTurn(), canDraw = myTurn && u.phase === 'play' && !grPick && !grBusy;
var hand = grHandRound === u.round ? grHand : [];
var anyFits = hand.some(function (c) { return unoPlayable(c, u.top_card, u.color); });
var left = turnSecondsLeft(u);
html += '<div class="gr-piles">'
+ '<button type="button" class="uno-pile gr-draw' + (canDraw && !anyFits ? ' must' : '') + '"' + (canDraw ? '' : ' disabled') + ' title="Draw a card" aria-label="Draw pile, ' + u.draw_count + ' cards"><span class="uno-c back">' + u.draw_count + '</span><span class="uno-pile-lbl">' + (canDraw ? 'Draw' : 'Pile') + '</span></button>'
+ '<div class="uno-top">' + unoCardHtml(u.top_card, 'top', 'disabled') + '<span class="uno-colour ' + u.color + '" title="Current colour: ' + UNO_COLOUR[u.color] + '" aria-label="Current colour: ' + UNO_COLOUR[u.color] + '"></span></div>'
+ '<span class="gr-dir" title="' + (u.direction === 1 ? 'Play goes round in seat order' : 'Play goes round backwards') + '" aria-label="' + (u.direction === 1 ? 'Play goes round in seat order' : 'Play goes round backwards') + '">' + (u.direction === 1 ? '↻' : '↺') + '</span></div>';
html += '<div class="gr-turn">' + (myTurn ? '<b>Your turn</b>' + (u.phase === 'after_draw' ? ': play the card you drew, or pass' : '') : esc(u.names[u.turn - 1] || '?') + '’s turn') + '</div>';
html += '<div class="turn-clock gr-clock' + (left <= 15 ? ' low' : '') + '" aria-label="Turn clock"><span class="tc-bar" style="width:' + Math.round(100 * left / TURN_SECONDS) + '%"></span><span class="tc-num">' + Math.ceil(left) + '</span></div>';
if (u.last_action) html += '<div class="uno-last">' + esc(u.last_action) + '</div>';
} else {
if (u && u.status === 'over') html += grResultsHtml(u);
if (t.host_id === me.id) html += '<div class="gr-dealrow">' + (n >= 2 ? '<button type="button" class="btn gr-deal">' + (u ? 'Deal the next round' : 'Deal') + '</button>' : '<span class="gr-wait">Waiting for at least one more player…</span>') + '</div>';
else html += '<div class="gr-wait">' + (n >= 2 ? 'Waiting for ' + esc(t.host_name || 'the host') + ' to deal…' : 'Waiting for players…') + '</div>';
if (!u) html += '<div class="gr-rules">UNO for 2–4 players. Get rid of all your cards to place: 1st +10 XP, 2nd +5, 3rd +2. Whoever is left holding cards gets nothing. Miss two turns in a row and you’re out.</div>';
}
el.innerHTML = html;
el.classList.toggle('live', !!(u && u.status === 'playing'));
}
function grResultsHtml(u) {
var order = u.players.map(function (id, i) { return i; }).sort(function (a, b) { return (u.place[a] || 99) - (u.place[b] || 99); });
return '<div class="gr-results"><div class="gr-results-hd">Round ' + u.round + '</div>' + order.map(function (i) {
var o = u.outcome[i], p = u.place[i];
var mark = o === 'out' && GR_MEDAL[p] ? GR_MEDAL[p] : (p ? grOrdinal(p) : '–');
var note = o === 'out' ? (u.points[i] > 0 ? '+' + u.points[i] + ' XP' : 'daily XP cap reached') : o === 'left' ? 'left' : o === 'idle' ? 'timed out' : o === 'last' ? (p === 1 ? 'everyone else left: no XP' : 'left holding cards') : 'round stopped';
return '<div class="gr-res' + (u.players[i] === me.id ? ' me' : '') + '"><span class="gr-res-p">' + mark + '</span><span class="gr-res-n">' + esc(u.names[i] || '?') + '</span><span class="gr-res-x' + (o === 'out' && u.points[i] > 0 ? ' xp' : '') + '">' + note + '</span></div>';
}).join('') + (u.last_action ? '<div class="uno-last">' + esc(u.last_action) + '</div>' : '') + '</div>';
}
function grPaintMine(tid) {
if (grIsHd(tid)) { grHdPaintMine(tid); return; }
var el = grBody.querySelector('.gr-mine'); if (!el) return;
var u = grRoundOf(tid), mi = grMyIndex();
if (!u || u.status !== 'playing' || mi < 0) { el.innerHTML = ''; el.classList.add('hidden'); return; }
el.classList.remove('hidden');
if (u.place[mi] > 0) { el.innerHTML = '<div class="gr-outnote">You’re out in ' + grOrdinal(u.place[mi]) + ' place' + (u.points[mi] > 0 ? ' (+' + u.points[mi] + ' XP)' : '') + '. Stay and watch the rest of the round.</div>'; return; }
var myTurn = grMyTurn(), hand = grHandRound === u.round ? grHand : [];
var html = '<div class="uno-hand' + (myTurn ? ' live' : '') + '" role="group" aria-label="Your hand">' + hand.map(function (c, k) {
var ok = myTurn && !grPick && !grBusy && unoPlayable(c, u.top_card, u.color) && (u.phase !== 'after_draw' || k === hand.length - 1);
return unoCardHtml(c, ok ? 'ok' : '', 'data-card="' + esc(c) + '"' + (ok ? '' : ' disabled'));
}).join('') + '</div>';
var acts = '', n = u.cards[mi];
/* UNO! stays on offer while a wild waits for its colour: with two cards, that wild is the card
   that leaves you on one, so the call has to be makeable before the colour is picked */
var unoBtn = !u.uno[mi] && (n === 1 || (n === 2 && myTurn)) ? '<button type="button" class="btn gr-uno">UNO!</button>' : '';
if (grPick) {
acts = '<span class="gr-pick">Pick a colour for your ' + esc(unoName(grPick)) + ':</span>' + ['R', 'G', 'B', 'Y'].map(function (k) { return '<button type="button" class="uno-col ' + k + '" data-col="' + k + '" title="' + UNO_COLOUR[k] + '" aria-label="' + UNO_COLOUR[k] + '"></button>'; }).join('') + '<button type="button" class="btn gr-nopick">Back</button>' + unoBtn;
} else {
if (myTurn && u.phase === 'after_draw') acts += '<button type="button" class="btn gr-pass">Pass</button>';
acts += unoBtn;
var x = u.exposed;
if (x && x !== mi + 1 && u.place[x - 1] === 0 && u.cards[x - 1] === 1 && !u.uno[x - 1]) acts += '<button type="button" class="btn gr-catch">Catch ' + esc(u.names[x - 1] || 'them') + '!</button>';
}
if (acts) html += '<div class="gr-acts">' + acts + '</div>';
el.innerHTML = html;
}
function grPaintWatch(tid) {
if (grIsHd(tid)) { grHdPaintWatch(tid); return; }
var el = grBody.querySelector('.gr-watch'); if (!el) return;
var t = grTables[tid], watchers = grSeatsOf(tid, 'spectator'), players = grSeatsOf(tid, 'player');
var u = grRoundOf(tid), mi = grMyIndex(), activeMe = !!(u && u.status === 'playing' && mi >= 0 && u.place[mi] === 0);
var who = watchers.map(function (s) { return '<span class="gr-nm' + (s.user_id === me.id ? ' me' : '') + '">' + esc(s.name || '?') + '</span>'; }).join(', ') || '<i>nobody</i>';
var btn = '';
if (grMySeat.role === 'spectator') {
if (t.status === 'open' && players.length < 4) btn = '<button type="button" class="btn gr-sit" data-t="' + tid + '" data-role="player">Take a seat</button>';
else if (t.status === 'playing') btn = '<span class="gr-hint">Free seats open up when this round ends.</span>';
} else if (!activeMe && watchers.length < 4) btn = '<button type="button" class="btn gr-sit" data-t="' + tid + '" data-role="spectator">Just watch</button>';
el.innerHTML = '<div class="gr-watch-l"><span class="gr-row-lbl">Watching ' + watchers.length + '/4</span> ' + who + '</div>' + (btn ? '<div class="gr-watch-b">' + btn + '</div>' : '');
}
/* ----- drawing: a Hold'em table (v170) -----
   Everything comes from holdem_tables (grHd), laid out by player seat, plus my own two cards
   (grHdHand, from holdem_table_hands -- nobody else can read that row). */
var HD_STREET = { preflop: 'pre-flop', flop: 'the flop', turn: 'the turn', river: 'the river' };
function grHdCardsOf(txt) { return txt && txt.length === 4 ? [txt.slice(0, 2), txt.slice(2, 4)] : []; }
function grHdPaintSeats(tid) {
var el = grBody.querySelector('.gr-seats'); if (!el) return;
var t = grTables[tid], h = grHdOf(tid), live = grHdLive(h), bySeat = {};
grSeatsOf(tid, 'player').forEach(function (s) { bySeat[s.seat] = s; });
var canSit = grMySeat.role === 'spectator';
el.innerHTML = [1, 2, 3, 4].map(function (n) {
var k = n - 1, uid = h ? h.seat_user[k] : (bySeat[n] ? bySeat[n].user_id : null);
if (!uid) return '<div class="gr-seat empty"><span class="gr-seat-n">Seat ' + n + '</span>' + (canSit ? '<button type="button" class="btn gr-hdsit" data-t="' + tid + '">Sit down</button>' : '<span class="gr-seat-e">empty</span>') + '</div>';
var mine = uid === me.id, nm = (h && h.seat_name[k]) || (bySeat[n] && bySeat[n].name) || '?';
var head = (t.host_id === uid ? '<span class="gr-host" title="Host">👑</span>' : '') + '<b class="gr-seat-nm">' + esc(nm) + '</b>' + (mine ? '<span class="gr-you">you</span>' : '');
if (!h) return '<div class="gr-seat hd' + (mine ? ' me' : '') + '"><div class="gr-seat-hd">' + head + '</div></div>';
var inHand = live && h.in_hand[k], folded = inHand && h.folded[k], allIn = inHand && !folded && h.stack[k] === 0;
var html = '<div class="gr-seat hd' + (mine ? ' me' : '') + (live && h.turn === n ? ' turn' : '') + (folded || (live && !inHand) ? ' folded' : '') + '">'
+ '<div class="gr-seat-hd">' + (h.hand_no && h.button === n ? '<span class="hd-btn" title="Dealer button">D</span>' : '') + head + '</div>'
+ '<div class="gr-hd-line"><span class="hd-stack" title="Chips on the table">' + h.stack[k] + ' XP</span>'
+ (live && h.sb_seat === n ? '<span class="gr-hd-pos" title="Small blind">SB</span>' : '')
+ (live && h.bb_seat === n ? '<span class="gr-hd-pos" title="Big blind">BB</span>' : '')
+ (h.bet[k] > 0 ? '<span class="hd-bet" title="Bet this round">' + h.bet[k] + '</span>' : '') + '</div>';
/* cards: shown at a showdown; my own face up; a live player's face down */
var shown = grHdCardsOf(h.shown[k]), cards = '';
if (shown.length) cards = pcHtml(shown[0], 'sm') + pcHtml(shown[1], 'sm');
else if (mine && h.in_hand[k] && (live || h.street === 'between') && grHdHandNo === h.hand_no && grHdHand.length === 2) cards = pcHtml(grHdHand[0], 'sm' + (h.folded[k] ? ' dim' : '')) + pcHtml(grHdHand[1], 'sm' + (h.folded[k] ? ' dim' : ''));
else if (inHand && !folded) cards = pcHtml(null, 'sm') + pcHtml(null, 'sm');
var note = '';
if (live && !h.in_hand[k]) note = '<span class="gr-hd-note">plays next hand</span>';
else if (folded) note = '<span class="gr-hd-note">folded</span>';
else if (allIn) note = '<span class="gr-hd-note allin">all-in</span>';
else if (h.street === 'between' && h.won[k] > 0) note = '<span class="gr-hd-note won">won ' + h.won[k] + '</span>';
else if (!live && h.stack[k] === 0) note = '<span class="gr-hd-note">out of chips</span>';
html += '<div class="gr-hd-cards">' + cards + note + '</div>';
if (inHand && !folded && h.missed[k] > 0) html += '<div class="gr-seat-warn">⏰ missed a turn</div>';
return html + '</div>';
}).join('');
}
function grHdPaintFelt(tid) {
var el = grBody.querySelector('.gr-felt'); if (!el) return;
var t = grTables[tid], h = grHdOf(tid), html = '';
if (!h) { el.innerHTML = '<div class="gr-wait">Setting out the chips…</div>'; el.classList.remove('live'); return; }
var live = grHdLive(h), i = grHdSeat();
if (live || h.street === 'between') {
var board = h.board || [];
html += '<div class="hd-board" role="group" aria-label="The board">' + [0, 1, 2, 3, 4].map(function (k) { return board[k] ? pcHtml(board[k]) : '<span class="pc slot" aria-hidden="true"></span>'; }).join('') + '</div>';
}
if (live) {
var left = turnSecondsLeft(h), toCall = i >= 0 ? Math.min(Math.max(0, grHdMaxBet(h) - h.bet[i]), h.stack[i]) : 0;
html += '<div class="gr-hd-pot">Pot ' + grHdPotTotal(h) + ' XP · ' + HD_STREET[h.street] + '</div>';
if (h.turn) {
html += '<div class="gr-turn">' + (grHdMyTurn() ? '<b>Your move</b>' + (toCall ? ': ' + toCall + ' to call' : '') : esc(h.seat_name[h.turn - 1] || 'Someone') + '’s move') + '</div>';
html += '<div class="turn-clock gr-clock' + (left <= 15 ? ' low' : '') + '" aria-label="Turn clock"><span class="tc-bar" style="width:' + Math.round(100 * left / TURN_SECONDS) + '%"></span><span class="tc-num">' + Math.ceil(left) + '</span></div>';
}
if (h.last_action) html += '<div class="uno-last">' + esc(h.last_action) + '</div>';
} else if (h.street === 'between') {
html += '<div class="gr-hd-result">' + (h.hand_result ? '<div class="gr-hd-res-t">' + esc(h.hand_result) + '</div>' : '')
+ '<div class="gr-hd-cd">' + (grHdFunded(h) >= 2 ? esc(grHdNextText(h)) : 'Waiting for another player with chips…') + '</div></div>';
} else {
var n = grHdFunded(h);
if (t.host_id === me.id) html += '<div class="gr-dealrow">' + (n >= 2 ? '<button type="button" class="btn gr-deal">' + (h.hand_no ? 'Deal' : 'Deal the first hand') + '</button>' : '<span class="gr-wait">Waiting for at least one more player with chips…</span>') + '</div>';
else html += '<div class="gr-wait">' + (n >= 2 ? 'Waiting for ' + esc(t.host_name || 'the host') + ' to deal…' : 'Waiting for players…') + '</div>';
if (!h.hand_no) html += '<div class="gr-rules">No-limit Texas Hold’em for 2–4 players, for real XP (' + esc(grStakesLong(t).toLowerCase()) + '). Your buy-in leaves your XP when you sit down, and your whole stack comes back when you get up. The host deals the first hand; after that they come by themselves. Miss two turns in a row and you’re out, but your chips still come back to you.</div>';
}
el.innerHTML = html;
el.classList.toggle('live', live);
}
function grHdPaintMine(tid) {
var el = grBody.querySelector('.gr-mine'); if (!el) return;
var h = grHdOf(tid), i = grHdSeat(), html = '';
if (h && i >= 0) {
var live = grHdLive(h), dealt = h.in_hand[i] && (live || h.street === 'between');
var cards = dealt && grHdHandNo === h.hand_no && grHdHand.length === 2 ? grHdHand : [];
var acts = '';
if (grHdMyTurn()) {
var m = grHdMaxBet(h), toCall = Math.max(0, m - h.bet[i]), stack = h.stack[i], allIn = h.bet[i] + stack;
acts += (toCall > 0 ? '<button type="button" class="btn gr-hd-fold">Fold</button>' : '')
+ '<button type="button" class="btn gr-hd-call">' + (toCall === 0 ? 'Check' : toCall >= stack ? 'Call all-in ' + stack : 'Call ' + toCall) + '</button>';
/* a bet or raise needs chips past the call, and someone left who can answer it */
if (stack > toCall && grHdActors(h, i) > 0) {
var minTo = Math.min(m + Math.max(h.min_raise, h.bb), allIn);
var potTo = Math.min(allIn, m + toCall + grHdPotTotal(h));
if (allIn <= minTo) acts += '<button type="button" class="btn gr-hd-raise-btn" data-amt="' + allIn + '">All-in ' + allIn + '</button>';
else acts += '<span class="gr-hd-raise"><span class="gr-hd-presets">'
+ '<button type="button" class="btn gr-hd-amt" data-amt="' + minTo + '">Min</button>'
+ (potTo > minTo && potTo < allIn ? '<button type="button" class="btn gr-hd-amt" data-amt="' + potTo + '">Pot</button>' : '')
+ '<button type="button" class="btn gr-hd-amt" data-amt="' + allIn + '">All-in</button></span>'
+ '<input type="number" class="gr-hd-in" inputmode="numeric" min="' + minTo + '" max="' + allIn + '" step="1" value="' + minTo + '" aria-label="' + (m ? 'Raise to' : 'Bet') + '">'
+ '<button type="button" class="btn gr-hd-raise-btn">' + (m ? 'Raise to' : 'Bet') + '</button></span>';
}
} else if (live && h.in_hand[i] && h.folded[i]) acts = '<span class="gr-hint">You folded. You’re dealt in again next hand.</span>';
else if (live && !h.in_hand[i]) acts = '<span class="gr-hint">You’re dealt in at the next hand.</span>';
if (cards.length || acts) html = '<div class="gr-hd-me">' + (cards.length ? '<div class="gr-hd-hole' + (h.folded[i] ? ' folded' : '') + '" role="group" aria-label="Your cards">' + pcHtml(cards[0]) + pcHtml(cards[1]) + '</div>' : '')
+ (acts ? '<div class="gr-hd-acts">' + acts + '</div>' : '') + '</div>';
}
if (!html) { el.innerHTML = ''; el._hd = ''; el.classList.add('hidden'); return; }
el.classList.remove('hidden');
if (el._hd === html) return; // nothing changed: leave a half-typed raise alone
var key = h.hand_no + ':' + h.street + ':' + h.turn + ':' + h.turn_started_at, old = el.querySelector('.gr-hd-in');
var keep = old && el._key === key ? { v: old.value, f: document.activeElement === old } : null;
el._hd = html; el._key = key; el.innerHTML = html;
var inp = el.querySelector('.gr-hd-in');
if (inp && keep) { inp.value = keep.v; if (keep.f) inp.focus(); }
}
function grHdPaintWatch(tid) {
var el = grBody.querySelector('.gr-watch'); if (!el) return;
var h = grHdOf(tid), watchers = grSeatsOf(tid, 'spectator');
var players = h ? h.seat_user.filter(Boolean).length : grSeatsOf(tid, 'player').length;
var who = watchers.map(function (s) { return '<span class="gr-nm' + (s.user_id === me.id ? ' me' : '') + '">' + esc(s.name || '?') + '</span>'; }).join(', ') || '<i>nobody</i>';
var btn = '';
if (grMySeat.role === 'spectator') btn = players < 4 ? '<button type="button" class="btn gr-hdsit" data-t="' + tid + '">Take a seat</button>' : '<span class="gr-hint">All four player seats are taken.</span>';
else if (grHdInHand()) btn = '<span class="gr-hint">Fold or finish this hand to cash out.</span>';
else if (watchers.length < 4) btn = '<button type="button" class="btn gr-sit" data-t="' + tid + '" data-role="spectator" title="Your chips go back to your XP">Cash out &amp; watch</button>';
el.innerHTML = '<div class="gr-watch-l"><span class="gr-row-lbl">Watching ' + watchers.length + '/4</span> ' + who + '</div>' + (btn ? '<div class="gr-watch-b">' + btn + '</div>' : '');
}
/* Bet / raise to what's in the box (or a button's own amount, for an all-in that is also the minimum). */
function grHdRaise(b) {
var h = grHd, i = grHdSeat(); if (!h || i < 0 || !grHdMyTurn()) return;
var inp = grBody.querySelector('.gr-hd-in');
var amt = parseInt(b.dataset.amt || (inp && inp.value), 10);
var m = grHdMaxBet(h), allIn = h.bet[i] + h.stack[i], minTo = Math.min(m + Math.max(h.min_raise, h.bb), allIn);
if (!(amt > 0)) { grSys('Type how much to ' + (m ? 'raise to' : 'bet') + '.'); return; }
if (amt > allIn) amt = allIn;
if (amt < minTo) { grSys('The least you can ' + (m ? 'raise to' : 'bet') + ' is ' + minTo + ' (or go all-in).'); if (inp) inp.value = minTo; return; }
grMove('holdem_table_act', { p_action: 'raise', p_amount: amt });
}
function grChatLineHtml(it) {
if (it.sys) return '<div class="gr-line sys"><span class="t">' + fmt(it.at) + '</span>' + esc(it.text) + '</div>';
var m = it.row, mine = m.sender_id === me.id;
return '<div class="gr-line ' + (mine ? 'me' : 'them') + '"><span class="t">' + fmt(m.created_at) + '</span><b class="who' + (isAdminId(m.sender_id) ? ' admin' : '') + '" data-id="' + esc(m.sender_id) + '" data-name="' + esc(m.sender_name || '?') + '" tabindex="0">' + esc(m.sender_name || '?') + ':</b> ' + bodyHtml(m.body) + '</div>';
}
function grPaintChat() {
var el = grBody && grBody.querySelector('.gr-chatlog'); if (!el) return;
el.innerHTML = grLog.map(grChatLineHtml).join('');
el.scrollTop = el.scrollHeight;
}
function grPushLog(it) {
grLog.push(it); if (grLog.length > 150) grLog.splice(0, grLog.length - 150);
var el = grBody && grBody.querySelector('.gr-chatlog'); if (!el || !grMySeat || grBody.dataset.view !== 'table:' + grMySeat.table_id) return;
var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
el.insertAdjacentHTML('beforeend', grChatLineHtml(it));
while (el.children.length > 150) el.firstChild.remove();
if (atBottom || (it.row && it.row.sender_id === me.id)) el.scrollTop = el.scrollHeight;
}
function grSys(text) { grPushLog({ sys: true, text: text, at: Date.now() }); }

/* ----- the turn clock (driven by clockTick, four times a second) ----- */
function grClockTick() {
if (grHd && grMySeat && grHd.table_id === grMySeat.table_id) { grHdClockTick(grHd); return; }
var u = grUno;
if (!u || u.status !== 'playing' || !grMySeat || u.table_id !== grMySeat.table_id) return;
var left = turnSecondsLeft(u), sec = Math.ceil(left);
var el = grBody && grBody.querySelector('.gr-clock');
if (el) {
el.classList.toggle('low', left <= 15);
el.querySelector('.tc-bar').style.width = Math.round(100 * left / TURN_SECONDS) + '%';
el.querySelector('.tc-num').textContent = sec;
}
var key = u.table_id + ':' + u.round + ':' + u.turn_started_at, mine = grMyTurn();
if (left > 0 && left <= 15 && grLastTick !== key + ':' + sec) {
grLastTick = key + ':' + sec;
if (mine || (grOpen() && !document.hidden)) tickSound(sec % 2 === 0);
}
/* at zero, everyone at the table asks the server to move the turn on -- it checks its own clock,
   so an early or duplicate call does nothing */
if (left <= 0 && !grTimeoutFired[key]) {
grTimeoutFired[key] = true;
sb.rpc('uno_table_timeout', { p_table: u.table_id }).then(function (r) { if (!r.error && r.data) { grUnoArrived(r.data); if (grMyIndex() >= 0) grFetchHand(); } });
}
}

/* Hold'em: the same 30-second clock (at zero anyone seated asks the server to move it on -- a check if
   the player can, otherwise a fold; the server checks its own clock, and the call is repeated every few
   seconds until the turn has moved), and between hands a short pause before asking for the next deal.
   Players ask first; watchers a few seconds later, in case every player's tab is asleep. */
/* The server's clock, learned only from a row that call itself just changed: an early or duplicate
   call hands back the row as it was, and its old updated_at would teach the clock a wrong skew. */
function grHdNoteTime(row) { if (!grHd || row.updated_at !== grHd.updated_at) noteServerTime(row); }
function grHdClockTick(h) {
if (grHdLive(h) && h.turn) {
var left = turnSecondsLeft(h), sec = Math.ceil(left);
var el = grBody && grBody.querySelector('.gr-clock');
if (el) {
el.classList.toggle('low', left <= 15);
el.querySelector('.tc-bar').style.width = Math.round(100 * left / TURN_SECONDS) + '%';
el.querySelector('.tc-num').textContent = sec;
}
var key = 'h' + h.table_id + ':' + h.hand_no + ':' + h.street + ':' + h.turn + ':' + h.turn_started_at, mine = grHdMyTurn();
if (left > 0 && left <= 15 && grLastTick !== key + ':' + sec) {
grLastTick = key + ':' + sec;
if (mine || (grOpen() && !document.hidden)) tickSound(sec % 2 === 0);
}
var fired = grTimeoutFired[key] || 0;
if (left <= 0 && Date.now() - fired > 4000 && (grTimeoutFired[key + ':n'] || 0) < 6) {
grTimeoutFired[key] = Date.now(); grTimeoutFired[key + ':n'] = (grTimeoutFired[key + ':n'] || 0) + 1;
sb.rpc('holdem_table_timeout', { p_table: h.table_id }).then(function (r) { if (!r.error && r.data) { grHdNoteTime(r.data); grHdArrived(r.data); } });
}
return;
}
if (h.street !== 'between') return;
var since = grHdSince(h), funded = grHdFunded(h);
var cd = grBody && grBody.querySelector('.gr-hd-cd');
if (cd && funded >= 2) { var txt = grHdNextText(h); if (cd.textContent !== txt) cd.textContent = txt; }
var k2 = h.table_id + ':' + h.hand_no, now = Date.now();
if (since >= grHdPause(h) + (grHdSeat() >= 0 ? 0 : 4) && (!grHdNextAt[k2] || now - grHdNextAt[k2] > 4000)) {
grHdNextAt[k2] = now;
sb.rpc('holdem_table_next', { p_table: h.table_id }).then(function (r) { if (!r.error && r.data) { grHdNoteTime(r.data); grHdArrived(r.data); } });
}
}

/* ----- wiring ----- */
if (grBody) {
grBody.addEventListener('click', function (e) {
var b = e.target.closest ? e.target.closest('button, .who') : null;
if (!b || !grBody.contains(b)) return;
if (b.classList.contains('who')) { if (b.dataset.id && b.dataset.id !== me.id) { e.stopPropagation(); openMenu(b.dataset.id, b, b.dataset.name); } return; }
if (b.disabled) return;
var cl = b.classList;
if (cl.contains('gr-newtable')) { if (b.dataset.game === 'holdem') { e.stopPropagation(); grHdStakesMenu(b); } else grOpenTable(b.dataset.game); }
else if (cl.contains('gr-hdsit')) grHdSit(Number(b.dataset.t));
else if (cl.contains('gr-sit')) grSit(Number(b.dataset.t), b.dataset.role);
else if (cl.contains('gr-join')) grJoin(Number(b.dataset.t));
else if (cl.contains('gr-noinv')) grDismissInvite(Number(b.dataset.t));
else if (cl.contains('gr-close')) grAdminClose(Number(b.dataset.t));
else if (cl.contains('gr-leave')) grLeave();
else if (cl.contains('gr-invbtn')) { e.stopPropagation(); grInviteMenu(b); }
else if (cl.contains('gr-deal')) grMove(grMySeat && grIsHd(grMySeat.table_id) ? 'holdem_table_start' : 'table_start');
else if (cl.contains('gr-hd-fold')) grMove('holdem_table_act', { p_action: 'fold' });
else if (cl.contains('gr-hd-call')) grMove('holdem_table_act', { p_action: 'call' });
else if (cl.contains('gr-hd-amt')) { var hin = grBody.querySelector('.gr-hd-in'); if (hin) { hin.value = b.dataset.amt; if (!isTouchDevice()) hin.focus(); } }
else if (cl.contains('gr-hd-raise-btn')) grHdRaise(b);
else if (cl.contains('gr-draw')) grMove('uno_table_draw');
else if (cl.contains('gr-pass')) grMove('uno_table_pass');
else if (cl.contains('gr-uno')) grMove('uno_table_call');
else if (cl.contains('gr-catch')) grMove('uno_table_catch');
else if (cl.contains('gr-nopick')) { grPick = null; renderGameRoom(); }
else if (cl.contains('uno-col')) { var wc = grPick; if (wc) grPlay(wc, b.dataset.col); }
else if (b.dataset.card) {
if (b.dataset.card.charAt(0) === 'W') { grPick = b.dataset.card; renderGameRoom(); }
else grPlay(b.dataset.card);
}
});
grBody.addEventListener('submit', function (e) { e.preventDefault(); grSay(); });
grBody.addEventListener('keydown', function (e) {
if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('gr-hd-in')) { e.preventDefault(); var rb = grBody.querySelector('.gr-hd-raise-btn'); if (rb) rb.click(); return; }
var w = e.target.closest && e.target.closest('.who');
if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); w.click(); }
});
}
if (gameRoomBack) gameRoomBack.onclick = closeGameRoom;
if (gameRoomBtn) {
gameRoomBtn.onclick = function () { if (grOpen()) closeGameRoom(); else openGameRoom(); };
makeFabDraggable(gameRoomBtn, 'gc_fab_gameroom', true);
}
/* Desktop: into the title bar, just inside the Roulette button (the name then reads roulette / table /
   lantern / GYPSY CHAT 2000 / lantern / threads). Phone: a bubble above the other two. Only once
   signed on -- before that the button is hidden and the title keeps its old balance. */
function placeGameRoomBtn() {
if (!gameRoomBtn) return;
var title = document.querySelector('.win > .title');
var host = (window.innerWidth > 500 && title && gameRoomBtn.classList.contains('ready')) ? title : gameRoomBtnHome;
if (!host) return;
if (gameRoomBtn.parentNode !== host) {
if (host === title) title.insertBefore(gameRoomBtn, title.querySelector('.lantern') || title.firstChild);
else host.appendChild(gameRoomBtn);
}
var inHeader = host === title;
gameRoomBtn.classList.toggle('in-header', inHeader);
if (inHeader) {
gameRoomBtn.style.left = ''; gameRoomBtn.style.top = ''; gameRoomBtn.style.right = ''; gameRoomBtn.style.bottom = ''; gameRoomBtn.style.transform = '';
gameRoomBtn.classList.remove('fab-docked', 'fab-dragging');
}
}

/* ---------- typing indicators (main room + whispers) ----------
   One 'typing' broadcast on the shared room channel -- the same pattern buzz already uses just
   above: a 'to' of null means the main room, a real user id means a whisper aimed at just that
   person. Broadcast has no per-recipient filtering (everyone on the channel technically
   receives every ping, same as buzz's own 'to' field already does), so every other client just
   ignores a 'to' that isn't null and isn't their own id -- see the channel.on('broadcast',
   {event:'typing'}...) handler near the buzz one below.
   Sends are throttled to once every TYPING_SEND_THROTTLE_MS while someone keeps typing, plus an
   explicit stop the moment they send, clear the box, or pause for TYPING_STOP_MS -- see
   sendTyping. Receivers don't trust a stop to always arrive (a closed tab or a dropped
   connection sends none), so every 'typing:true' also arms a TYPING_EXPIRE_MS timer that clears
   them out on its own if nothing else does -- see markRoomTyping/markImTyping. */
var TYPING_SEND_THROTTLE_MS = 2500, TYPING_STOP_MS = 4000, TYPING_EXPIRE_MS = 6000;
var typingSendState = {}; // key ('room', or a whisper peer's id) -> {lastSent, stopTimer}
function sendTyping(target, isTyping) {
if (!channel || !me) return;
/* A whisper typing ping to someone who can't be whispered yet is skipped -- quietly, since this
   fires on every keystroke. The sync check is enough here: for the rare "their door is open" case
   the ping is merely missing, never leaked. */
if (target && !whisperAllowedSync(target) && !(whisperPolicyCache[target] && whisperPolicyCache[target].policy === 'everyone')) return;
var key = target || 'room';
var st = typingSendState[key] || (typingSendState[key] = { lastSent: 0, stopTimer: null });
clearTimeout(st.stopTimer); st.stopTimer = null;
if (!isTyping) {
st.lastSent = 0;
channel.send({ type: 'broadcast', event: 'typing', payload: { from: me.id, name: me.name, to: target || null, typing: false } });
return;
}
var now = Date.now();
if (now - st.lastSent > TYPING_SEND_THROTTLE_MS) {
st.lastSent = now;
channel.send({ type: 'broadcast', event: 'typing', payload: { from: me.id, name: me.name, to: target || null, typing: true } });
}
st.stopTimer = setTimeout(function () { sendTyping(target, false); }, TYPING_STOP_MS);
}
function markRoomTyping(id, name) {
var t = typingRoom[id] || (typingRoom[id] = { name: name });
t.name = name;
clearTimeout(t.timer);
t.timer = setTimeout(function () { clearRoomTyping(id); }, TYPING_EXPIRE_MS);
renderRoomTyping();
}
function clearRoomTyping(id) {
var t = typingRoom[id]; if (!t) return;
clearTimeout(t.timer);
delete typingRoom[id];
renderRoomTyping();
}
/* 1 typer -> their name; 2-3 -> just the count (asked for over names once it's more than one
   person); 4+ -> capped at "3+ typing" rather than an ever-growing name list or count. Steps
   aside for the cooldown/mute bar, which sits in the exact same spot above the compose box and
   matters more when both are true at once. */
function renderRoomTyping() {
var el = $('typingIndicator'); if (!el) return;
if ($('cooldownMsg') && !$('cooldownMsg').classList.contains('hidden')) { el.classList.add('hidden'); return; }
var names = Object.keys(typingRoom).map(function (id) { return typingRoom[id].name; });
var n = names.length;
var text = n === 0 ? '' : n === 1 ? names[0] + ' is typing' : n <= 3 ? n + ' typing' : '3+ typing';
el.textContent = text;
el.classList.toggle('hidden', n === 0);
}
function markImTyping(id, name) {
var w = wins[id]; if (!w) return; // never pull a whisper window into existence just for a typing ping
w.typingPeer = true;
clearTimeout(w.typingTimer);
w.typingTimer = setTimeout(function () { clearImTyping(id); }, TYPING_EXPIRE_MS);
renderImTyping(w);
}
function clearImTyping(id) {
var w = wins[id]; if (!w) return;
clearTimeout(w.typingTimer); w.typingTimer = null; w.typingPeer = false;
renderImTyping(w);
}
function renderImTyping(w) {
if (!w.typingEl) return;
w.typingEl.textContent = w.typingPeer ? w.name + ' is typing' : '';
w.typingEl.classList.toggle('hidden', !w.typingPeer);
}

function findId(name) { return Object.keys(people).filter(function (k) { return people[k].name.toLowerCase() === name.toLowerCase(); })[0]; }
async function command(t) {
var m = t.match(/^\/(\w+)\s*(\S*)\s*([\s\S]*)$/); if (!m) return false;
var cmd = m[1].toLowerCase(), arg = m[2], rest = m[3].trim(), id;
if (SFX[cmd]) { sendSfx(cmd, null, arg); return true; }
switch (cmd) {
case 'w': case 'whisper': return false; // handled by send()
case 'whoami': addSys('You are ' + me.name + ' — id ' + me.id + (isAdmin ? ' (admin)' : '')); return true;
case 'help': addSys('Commands: /w name msg · /nick newname · /block name · /unblock name · /blocks · /addfriend name · /removefriend name · /movegroup name group · /friends · /setbio text · /report name reason · /whoami' + (isAdmin ? ' · /kick name [reason] · /unban name · /bans · /mute name · /unmute name · /muted · /reports · /bugreports' : '') + '. Click a name in the chat log or Online list for options. The ⚔ in a whisper challenges them to Tic-Tac-Toe (a win is worth 3 XP, a draw 1); the 🎲 menu has the games: Tic-Tac-Toe (3 XP a win), UNO (5), Hangman (3) and Texas Hold’em, where you bet real XP at a low (blinds 1/2) or high (2/5) stakes table. Whispers are friends-only unless someone opens theirs to everyone ("Whispers" in the "..." menu); admins can always be reached. Tap 🚩 on a message to report that exact message. Click your status pill (bottom bar) to go Away/Busy, or your own name beside it to rename your character. The ⚡ in a whisper window sends a buzz. Sound commands (/slap, /kiss, /laugh, /cry, /spit, /fart, /gunshot … type /sounds for all of them) play for the whole room, or for just the two of you inside a whisper. Set a status message from your status pill. Found something broken? Use "Report a bug" in the "..." menu.'); return true;
case 'gif': openGifPicker(rest ? m[2] + ' ' + rest : arg, 'main', gifBtn); return true;
case 'sounds': addSys('Sound commands (everyone in the room hears them; in a whisper, just the two of you): ' + SFX_LIST.map(function (k) { return '/' + k; }).join(' · ') + '. Add a name to aim one: /slap Perry.'); return true;
case 'block': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot block yourself.'); return true; } block(id, people[id].name); return true;
case 'unblock': id = Object.keys(blocked).filter(function (k) { return (blocked[k] || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not blocked anyone named ' + arg + '.'); return true; } unblock(id); return true;
case 'blocks': var bl = Object.keys(blocked).map(function (k) { return blocked[k]; }); addSys(bl.length ? 'Blocked: ' + bl.join(', ') : 'You have blocked no one.'); return true;
case 'addfriend': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot add yourself as a friend.'); return true; } sendFriendRequest(id, people[id].name); return true;
case 'removefriend': id = Object.keys(friends).filter(function (k) { return (friends[k].name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not added a friend named ' + arg + '.'); return true; } removeFriend(id, friends[id].name); return true;
case 'movegroup': id = Object.keys(friends).filter(function (k) { return (friends[k].name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not added a friend named ' + arg + '.'); return true; } moveFriendGroup(id, rest); return true;
case 'friends': var fl = Object.keys(friends).map(function (k) { return friends[k].name + (people[k] ? ' (online)' : ' (offline)') + (friends[k].group ? ' [' + friends[k].group + ']' : ''); }); addSys(fl.length ? 'Friends: ' + fl.join(', ') : 'You have no friends added yet.'); return true;
case 'nick': case 'name': await renameCharacter(rest ? (arg + ' ' + rest) : arg); return true;
case 'setbio': case 'bio': var bioText = rest ? (arg + ' ' + rest) : arg; if (!bioText) { addSys('Usage: /setbio your text here'); return true; } var rb = await sb.from('profiles').upsert({ user_id: me.id, bio: sanitizeInput(bioText).slice(0, 300), updated_at: new Date().toISOString() }); if (rb.error) { addSys('Could not save your info: ' + rb.error.message); return true; } addSys('Your profile info has been updated.'); return true;
case 'report': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot report yourself.'); return true; } if (!rest) { addSys('Usage: /report name reason'); return true; } report(id, people[id].name, rest); return true;
case 'kick': if (!isAdmin) { addSys('Only an admin may kick.'); return true; } id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot kick yourself.'); return true; } kick(id, people[id].name, rest); return true;
case 'unban': if (!isAdmin) { addSys('Only an admin may lift bans.'); return true; } id = Object.keys(bans).filter(function (k) { return (bans[k].banned_name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('No ban found for ' + arg + '.'); return true; } unban(id, arg); return true;
case 'bans': if (!isAdmin) return true; var bn = Object.keys(bans).map(function (k) { return bans[k].banned_name || k; }); addSys(bn.length ? 'Banned: ' + bn.join(', ') : 'No one is banned.'); return true;
case 'mute': if (!isAdmin) { addSys('Only an admin may mute.'); return true; } id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot mute yourself.'); return true; } muteUser(id, people[id].name); return true;
case 'unmute': if (!isAdmin) { addSys('Only an admin may unmute.'); return true; } id = Object.keys(mutedUsers).filter(function (k) { return (mutedUsers[k].user_name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('No active mute found for ' + arg + '.'); return true; } unmute(id, mutedUsers[id].user_name || arg); return true;
case 'muted': if (!isAdmin) return true; var mn = Object.keys(mutedUsers).map(function (k) { return mutedUsers[k].user_name || k; }); addSys(mn.length ? 'Muted: ' + mn.join(', ') : 'No one is muted.'); return true;
case 'reports': if (!isAdmin) return true; var rp = await sb.from('reports').select('reporter_name, reported_name, reason, created_at, message_body').order('created_at', { ascending: false }).limit(10); if (rp.error) { addSys('Could not load reports: ' + rp.error.message); return true; } if (!rp.data.length) { addSys('No reports.'); return true; } rp.data.forEach(function (x) { addSys('[' + fmtDateTime(x.created_at) + '] ' + x.reporter_name + ' reported ' + x.reported_name + ': ' + x.reason + (x.message_body ? ' (re: “' + x.message_body + '”)' : '')); }); return true;
case 'bugreports': if (!isAdmin) return true; var bp = await sb.from('bug_reports').select('reporter_name, description, created_at, attachments').eq('status', 'open').order('created_at', { ascending: false }).limit(10); if (bp.error) { addSys('Could not load bug reports: ' + bp.error.message); return true; } if (!bp.data.length) { addSys('No open bug reports.'); return true; } bp.data.forEach(function (x) { var n = Array.isArray(x.attachments) ? x.attachments.length : 0; addSys('[' + fmtDateTime(x.created_at) + '] ' + x.reporter_name + ': ' + x.description + (n ? ' (' + n + ' attachment' + (n > 1 ? 's' : '') + ')' : '')); }); return true;
default: addSys('Unknown command. Type /help.'); return true;
}
}
async function send() {
var t = msg.value.trim(); if (!t || !me) return;
if (t[0] === '/' && !/^\/w(hisper)?\s/i.test(t)) { msg.value = ''; sendTyping(null, false); closeMention(); await command(t); return; }
var w = t.match(/^\/w(?:hisper)?\s+(\S+)\s*([\s\S]*)$/i);
if (w) {
var id = Object.keys(people).filter(function (k) { return people[k].name.toLowerCase() === w[1].toLowerCase(); })[0];
if (!id) { addSys('No one here is named ' + w[1] + '.'); return; }
if (id === me.id) { addSys('You cannot whisper to yourself.'); return; }
if (blocked[id]) { addSys('You have blocked ' + people[id].name + '. Unblock them first.'); return; }
msg.value = ''; sendTyping(null, false); closeMention();
var win = await tryWhisper(id, people[id].name, true); // null when it turned into a friend-request offer instead
if (win && w[2].trim()) { win.ta.value = w[2].trim(); sendIM(id); }
return;
}
msg.value = ''; sendTyping(null, false); closeMention(); await post(t); msg.focus();
}
$('send').onclick = send;
msg.onkeydown = function (e) {
if (cmdKeydown(e)) return;
if (mentionKeydown(e)) return;
if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
};

/* ---------- @mention autocomplete ----------
   One dropdown, shared the same way the emoji/GIF pickers are: created once, repositioned to the
   field via positionPicker(). Matches against recentPeopleEntries() -- the same 30-minute
   reachable pool the whisper picker and mentionableNames() use, not just people live in the room
   this instant, so someone who just stepped away is still suggested and still gets pushed.
   mentionTa is whichever field the menu is currently serving: the main composer by default, or a
   Ballot Box field (the desktop note textarea, or the prompt dialog on a phone) while that has
   focus -- see attachMentions(). */
var mentionMenu = document.createElement('div'); mentionMenu.className = 'mention-menu'; mentionMenu.setAttribute('role', 'listbox'); document.body.appendChild(mentionMenu);
var mentionStart = -1, mentionItems = [], mentionIndex = 0, mentionTa = null;
function closeMention() { mentionMenu.classList.remove('open'); mentionItems = []; mentionStart = -1; }
/* Arrow/Enter/Tab/Escape while the menu is open. Returns true when the key was the menu's to
   handle, so the field's own keydown (send, cast, ...) knows to stand down. */
function mentionKeydown(e) {
if (!mentionMenu.classList.contains('open')) return false;
if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex = (mentionIndex + 1) % mentionItems.length; renderMentionMenu(); return true; }
if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex = (mentionIndex - 1 + mentionItems.length) % mentionItems.length; renderMentionMenu(); return true; }
if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionItems[mentionIndex]); return true; }
if (e.key === 'Escape') { e.preventDefault(); closeMention(); return true; }
return false;
}
function currentMentionToken() {
var ta = mentionTa || msg;
var s = ta.selectionStart, e = ta.selectionEnd;
if (s !== e) return null;
var v = ta.value;
var at = v.lastIndexOf('@', s - 1);
if (at === -1) return null;
if (at > 0 && !/\s/.test(v[at - 1])) return null; // must start a word, not be mid-token (e.g. an email-like string)
var between = v.slice(at + 1, s);
if (/\s/.test(between)) return null; // the @token ended before the cursor
return { start: at, query: between };
}
function renderMentionMenu() {
mentionMenu.innerHTML = mentionItems.map(function (n, i) {
return '<button type="button" role="option" aria-selected="' + (i === mentionIndex) + '" class="' + (i === mentionIndex ? 'active' : '') + '" data-i="' + i + '">' + esc(n) + '</button>';
}).join('');
mentionMenu.querySelectorAll('button').forEach(function (b) {
b.onmousedown = function (e) { e.preventDefault(); selectMention(mentionItems[+b.dataset.i]); };
});
}
function updateMentionMenu() {
var tok = currentMentionToken();
if (!tok || !me) { closeMention(); return; }
var q = tok.query.toLowerCase();
var pool = recentPeopleEntries();
var items = Object.keys(pool).filter(function (id) { return id !== me.id; }).map(function (id) { return pool[id].name; })
.filter(Boolean)
.filter(function (n) { return n.toLowerCase().indexOf(q) !== -1; })
.sort(function (a, b) {
var ap = a.toLowerCase().indexOf(q) === 0, bp = b.toLowerCase().indexOf(q) === 0;
if (ap !== bp) return ap ? -1 : 1;
return a.localeCompare(b);
}).slice(0, 8);
if (!items.length) { closeMention(); return; }
mentionStart = tok.start; mentionItems = items; mentionIndex = 0;
renderMentionMenu();
mentionMenu.classList.add('open');
mentionMenu.classList.toggle('above-modal', promptMentions); // the prompt dialog sits at z-index 70, above the menu's usual tier
positionPicker(mentionMenu, mentionTa || msg);
}
function selectMention(name) {
var ta = mentionTa || msg;
var end = ta.selectionStart;
var v = ta.value;
ta.value = v.slice(0, mentionStart) + '@' + name + ' ' + v.slice(end);
var newPos = mentionStart + name.length + 2;
closeMention();
ta.focus(); ta.selectionStart = ta.selectionEnd = newPos;
ta.dispatchEvent(new Event('input')); // counters and the like that watch the field
}
/* Wires a field up to the shared menu: it becomes mentionTa while focused, and typing/clicking in
   it drives the suggestions. The field's own keydown should call mentionKeydown(e) first. */
function attachMentions(ta) {
if (!ta) return;
ta.addEventListener('focus', function () { mentionTa = ta; });
ta.addEventListener('input', updateMentionMenu);
ta.addEventListener('click', updateMentionMenu);
}
attachMentions(msg);
msg.addEventListener('focus', function () { mentionTa = null; }); // the default; keeps `msg` first
msg.addEventListener('input', function () { sendTyping(null, !!msg.value); });
document.addEventListener('click', function (e) { if (!mentionMenu.contains(e.target) && e.target !== (mentionTa || msg)) closeMention(); });

/* ---------- v121: "/" command palette ----------
   Type "/" as the first character of the main composer or a whisper composer and every command
   that field understands drops down: sound effects, whisper/friends/name commands, admin tools
   for admins. Keep typing to filter; ArrowUp/Down, Enter/Tab or a tap fills the command in. Same
   listbox shell as the @mention menu above, one shared element. cmdTa is the field it serves. */
var cmdMenu = document.createElement('div'); cmdMenu.className = 'mention-menu cmd-menu'; cmdMenu.setAttribute('role', 'listbox'); document.body.appendChild(cmdMenu);
var cmdItems = [], cmdIndex = 0, cmdTa = null, cmdScope = 'room';
var ROOM_CMDS = [
['w', 'name message', 'Whisper someone privately'],
['help', '', 'Everything the room can do'],
['sounds', '', 'List every sound command'],
['gif', 'search words', 'Open the GIF picker'],
['nick', 'new name', 'Rename your character'],
['setbio', 'text', 'Set the short bio on your name menu'],
['addfriend', 'name', 'Send a friend request'],
['removefriend', 'name', 'Remove a friend'],
['movegroup', 'name group', 'Move a friend into a group'],
['friends', '', 'List your friends'],
['block', 'name', 'Block someone'],
['unblock', 'name', 'Unblock someone'],
['blocks', '', 'List who you have blocked'],
['report', 'name reason', 'Report someone to the admins'],
['whoami', '', 'Your name and id']
];
var ADMIN_CMDS = [
['kick', 'name [reason]', 'Admin: remove someone from the room'],
['unban', 'name', 'Admin: lift a ban'],
['bans', '', 'Admin: list bans'],
['mute', 'name', 'Admin: mute someone'],
['unmute', 'name', 'Admin: unmute someone'],
['muted', '', 'Admin: list who is muted'],
['reports', '', 'Admin: open reports'],
['bugreports', '', 'Admin: open bug reports']
];
function cmdCatalogue(scope) {
var sfx = SFX_LIST.map(function (k) { return [k, scope === 'room' ? '[name]' : '', '🔊 ' + SFX[k].solo]; });
if (scope === 'pm') return sfx.concat([['sounds', '', 'List every sound command']]);
return ROOM_CMDS.concat(sfx, isAdmin ? ADMIN_CMDS : []);
}
function closeCmd() { cmdMenu.classList.remove('open'); cmdItems = []; }
function cmdKeydown(e) {
if (!cmdMenu.classList.contains('open')) return false;
if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = (cmdIndex + 1) % cmdItems.length; renderCmdMenu(); return true; }
if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = (cmdIndex - 1 + cmdItems.length) % cmdItems.length; renderCmdMenu(); return true; }
if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectCmd(cmdItems[cmdIndex]); return true; }
if (e.key === 'Escape') { e.preventDefault(); closeCmd(); return true; }
return false;
}
function renderCmdMenu() {
cmdMenu.innerHTML = cmdItems.map(function (it, i) {
return '<button type="button" role="option" aria-selected="' + (i === cmdIndex) + '" class="' + (i === cmdIndex ? 'active' : '') + '" data-i="' + i + '"><span class="cmd-c">/' + esc(it[0]) + (it[1] ? ' <i>' + esc(it[1]) + '</i>' : '') + '</span><span class="cmd-d">' + esc(it[2]) + '</span></button>';
}).join('');
cmdMenu.querySelectorAll('button').forEach(function (b) { b.onmousedown = function (e) { e.preventDefault(); selectCmd(cmdItems[+b.dataset.i]); }; });
var act = cmdMenu.querySelector('button.active'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
}
function updateCmdMenu(ta, scope) {
if (!ta) { closeCmd(); return; }
var upto = ta.value.slice(0, ta.selectionStart), m = upto.match(/^\/(\w*)$/);
if (!m || ta.selectionStart !== ta.selectionEnd) { closeCmd(); return; }
var q = m[1].toLowerCase();
var items = cmdCatalogue(scope).filter(function (it) { return it[0].indexOf(q) !== -1; })
.sort(function (a, b) { var ap = a[0].indexOf(q) === 0, bp = b[0].indexOf(q) === 0; if (ap !== bp) return ap ? -1 : 1; return 0; });
if (!items.length) { closeCmd(); return; }
cmdTa = ta; cmdScope = scope; cmdItems = items; cmdIndex = 0;
renderCmdMenu();
cmdMenu.classList.add('open');
positionPicker(cmdMenu, ta);
}
function selectCmd(it) {
var ta = cmdTa; if (!ta) return;
var rest = ta.value.slice(ta.selectionStart);
ta.value = '/' + it[0] + (it[1] || rest.trim() ? ' ' : '') + rest.replace(/^\s+/, '');
closeCmd(); ta.focus(); ta.selectionStart = ta.selectionEnd = it[0].length + 2;
ta.dispatchEvent(new Event('input'));
}
function attachCmdMenu(ta, scope) {
if (!ta) return;
ta.addEventListener('input', function () { updateCmdMenu(ta, scope); });
ta.addEventListener('click', function () { updateCmdMenu(ta, scope); });
ta.addEventListener('blur', function () { setTimeout(function () { if (cmdTa === ta && document.activeElement !== ta) closeCmd(); }, 150); });
}
attachCmdMenu(msg, 'room');
document.addEventListener('click', function (e) { if (!cmdMenu.contains(e.target) && e.target !== cmdTa) closeCmd(); });

/* ---------- emoji picker ----------
   Shared by the main chat compose box and every whisper window's compose bar (one picker element,
   repositioned to whichever emoji button opened it -- same pattern the GIF picker below uses,
   via positionPicker()). emojiTa is the textarea an emoji click should land in. */
var emojiTa = null;
EMOJI.forEach(function (ch) {
var b = document.createElement('button'); b.textContent = ch; b.type = 'button'; b.setAttribute('role', 'option');
b.onclick = function () {
var ta = emojiTa || msg;
var s = ta.selectionStart || ta.value.length;
ta.value = ta.value.slice(0, s) + ch + ta.value.slice(s);
picker.classList.remove('open'); ta.focus(); ta.selectionStart = ta.selectionEnd = s + ch.length;
};
picker.appendChild(b);
});
function openEmojiPicker(ta, anchorEl) {
gifPicker.classList.remove('open');
var opening = !picker.classList.contains('open') || emojiTa !== ta;
emojiTa = ta;
if (!opening) { picker.classList.remove('open'); return; }
picker.classList.add('open');
positionPicker(picker, anchorEl);
}
$('emoBtn').onclick = function () { openEmojiPicker(msg, $('emoBtn')); };
document.addEventListener('click', function (e) { if (picker.contains(e.target) || e.target.closest('.emo')) return; picker.classList.remove('open'); });

/* ---------- GIF picker (Giphy) ----------
   Shared by the main chat compose box and the thread new-post/reply compose boxes. Since the
   picker now lives as a direct child of .gc-root (so it isn't dimmed/disabled along with .win when
   a thread is open), it's positioned with fixed coordinates computed from whichever button opened
   it, and gifTarget says where a picked GIF should go. */
var gifTimer = null, gifSeq = 0, gifTarget = 'main';
function closeGif() { gifPicker.classList.remove('open'); }
function positionPicker(el, anchor) {
var r = anchor.getBoundingClientRect();
var w = el.offsetWidth || 280;
el.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px';
el.style.bottom = (window.innerHeight - r.top + 6) + 'px';
el.style.top = 'auto';
}
function openGifPicker(seedQuery, target, anchorEl) {
picker.classList.remove('open');
gifTarget = target || 'main';
gifPicker.classList.add('open');
positionPicker(gifPicker, anchorEl || gifBtn);
gifQ.value = seedQuery || ''; gifQ.focus();
searchGifs(gifQ.value.trim());
}
function renderGifResults(items) {
gifResults.innerHTML = '';
if (!items.length) { gifResults.innerHTML = '<div class="gmsg">No results.</div>'; return; }
items.forEach(function (g) {
var images = g.images || {};
var thumb = (images.fixed_width_small || images.preview_gif || images.fixed_width || {}).url;
/* Giphy's images.*.url fields now embed a long tracking "cid" segment (v1.XXXX...), which
   routinely pushes the URL past the 140-char cap on main-room messages (see post()) -- once
   truncated it no longer ends in .gif, fails GIF_RE, and posts as a bare link instead of an
   image. media.giphy.com/media/{id}/giphy.gif is Giphy's plain, stable direct link for the same
   asset with no cid, so build from g.id first and only fall back to the longer form if it's
   somehow missing. */
var full = g.id ? ('https://media.giphy.com/media/' + g.id + '/giphy.gif') : (images.fixed_height || images.original || images.fixed_width || {}).url;
if (!thumb || !full) return;
var b = document.createElement('button'); b.type = 'button';
b.innerHTML = '<img src="' + esc(thumb) + '" alt="' + esc(g.title || 'GIF') + '" loading="lazy">';
b.onclick = function () {
closeGif(); gifQ.value = '';
if (gifTarget === 'thread-new') setPendingImage('new', full);
else if (gifTarget === 'thread-reply') setPendingImage('reply', full);
else if (gifTarget.indexOf('dm:') === 0) {
/* into a whisper: same delivery as a typed line or a sent photo -- an ordinary whisper message
   whose body is the GIF's URL, which bodyHtml renders as the picture (GIF_RE) */
var did = gifTarget.slice(3), dw = wins[did];
if (dw) { if (dw.gone) imSys(did, dw.name + ' is not here to hear you.'); else { post(full, did, dw.name); autoFocus(dw.ta); } }
}
else { post(full); autoFocus(msg); }
};
gifResults.appendChild(b);
});
if (!gifResults.children.length) gifResults.innerHTML = '<div class="gmsg">No results.</div>';
}
async function searchGifs(q) {
// GIF search goes through the giphy-search edge function so the Giphy API key stays a
// server-only secret and never ships to the browser — see supabase/functions/giphy-search.
var seq = ++gifSeq;
gifResults.innerHTML = '<div class="gmsg">Searching…</div>';
try {
var res = await sb.functions.invoke('giphy-search', { body: { q: q } });
if (seq !== gifSeq) return;
if (res.error || !res.data || res.data.ok === false) {
var reason = res.data && res.data.reason;
var m = reason === 'not_configured' ? 'GIF search isn\'t configured yet.' : ((res.data && res.data.message) || 'Could not reach Giphy.');
gifResults.innerHTML = '<div class="gmsg">' + esc(m) + '</div>';
return;
}
renderGifResults(res.data.data || []);
} catch (e) {
if (seq === gifSeq) gifResults.innerHTML = '<div class="gmsg">Could not reach Giphy.</div>';
}
}
gifBtn.onclick = function () {
var opening = !gifPicker.classList.contains('open') || gifTarget !== 'main';
if (opening) { openGifPicker('', 'main', gifBtn); } else { closeGif(); }
};
gifGo.onclick = function () { searchGifs(gifQ.value.trim()); };
gifQ.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); searchGifs(gifQ.value.trim()); } if (e.key === 'Escape') closeGif(); };
gifQ.oninput = function () { clearTimeout(gifTimer); var v = gifQ.value.trim(); gifTimer = setTimeout(function () { searchGifs(v); }, 450); };
document.addEventListener('click', function (e) {
if (gifPicker.contains(e.target)) return;
if (e.target === gifBtn || e.target === tpNewGifBtn || e.target === tpReplyGifBtn) return;
if (e.target.closest && e.target.closest('.im .icomp .gif')) return; // a whisper's own GIF button toggles it itself
closeGif();
});

/* ---------- threads board ----------
   A single flat "general" board — no topics/categories. Anyone signed in can start a thread or
   reply. Threads bump to the top of the list whenever they get a new reply (4chan-style). Opening
   a thread visually minimizes the main chat window and expands this panel; this whole feature is
   desktop-only (see the CSS media query on .threads-panel) — on narrow/mobile viewports it never
   appears, and we still load/subscribe quietly in the background so it's ready if the window is
   ever widened. */
function timeAgo(t) {
var s = Math.max(1, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
if (s < 60) return s + 's ago';
var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
return Math.floor(h / 24) + 'd ago';
}

/* ---------- pictures: upload your own image, or reuse the Giphy picker above ----------
   Uploaded images go to the public "thread-images" Storage bucket under a path prefixed with your
   own user id (storage.objects RLS only allows writing there); a picked GIF just reuses its Giphy
   CDN URL. Shared by thread posts (result stored in the thread/post's image_url column) and by
   whisper photo-sends (result posted as the message body, same as a picked GIF is). */
function setPendingImage(which, url) {
if (which === 'new') { tpNewImageUrl = url; tpNewPreviewImg.src = url; tpNewPreviewWrap.classList.remove('hidden'); }
else { tpReplyImageUrl = url; tpReplyPreviewImg.src = url; tpReplyPreviewWrap.classList.remove('hidden'); }
}
function clearPendingImage(which) {
if (which === 'new') { tpNewImageUrl = null; tpNewPreviewImg.src = ''; tpNewPreviewWrap.classList.add('hidden'); tpNewImgFile.value = ''; }
else { tpReplyImageUrl = null; tpReplyPreviewImg.src = ''; tpReplyPreviewWrap.classList.add('hidden'); tpReplyImgFile.value = ''; }
}
/* ---------- HEIC/HEIF photos (the default format iPhone cameras have saved in since iOS 11) ----------
   No browser can decode HEIC inside an <img> or <canvas> -- not even Safari, despite iOS itself
   supporting it natively in Photos -- so an unconverted HEIC upload can't be cropped/previewed and
   gets rejected outright before that. iOS Safari's own file picker usually transcodes a HEIC photo
   to JPEG automatically when handing it to a web page, but that doesn't happen in every browser/
   in-app webview or every iOS version, and some Android file providers hand over HEIC files with an
   empty file.type -- so this checks the filename too, and when it finds one, converts it to an
   ordinary JPEG right in the browser (via the heic2any library loaded from index.html) before
   anything else touches the file. */
var HEIC_NAME_RE = /\.hei[cf]$/i;
function looksLikeHeic(file) {
if (file.type === 'image/heic' || file.type === 'image/heif') return true;
return !file.type && HEIC_NAME_RE.test(file.name || '');
}
async function normalizeImageFile(file) {
if (!looksLikeHeic(file)) return file;
if (typeof window.heic2any !== 'function') {
throw new Error('That photo is in Apple’s HEIC format and this browser can’t convert it. Try turning on "Most Compatible" under Settings → Camera → Formats on your phone, or share the photo through Messages first.');
}
var out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
var jpegBlob = Array.isArray(out) ? out[0] : out;
var name = (file.name || 'photo').replace(/\.[^./\\]+$/, '') + '.jpg';
return new File([jpegBlob], name, { type: 'image/jpeg' });
}
/* Many mobile file pickers (Android content providers, cloud-synced photo apps, the newer Android
   Photo Picker) hand over a perfectly ordinary JPEG/PNG/GIF/WEBP with an empty or generic file.type
   ("application/octet-stream", or nothing at all) -- so trusting file.type alone rejects real photos
   that the browser could read just fine. This reads the first few bytes of the file itself (the
   format's actual magic number) as a fallback whenever file.type doesn't already match one of the
   types thread-images/avatars support, instead of trusting a label the OS may not have set correctly. */
function sniffImageType(file) {
return file.slice(0, 12).arrayBuffer().then(function (buf) {
var b = new Uint8Array(buf);
if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
return null;
}).catch(function () { return null; });
}
async function uploadImage(file) {
if (!file) return null;
try { file = await normalizeImageFile(file); } catch (e) { addSys(e.message || 'Could not read that photo.'); return null; }
if (file.size > MAX_IMG_BYTES) { addSys('Images must be 5MB or smaller.'); return null; }
var type = ALLOWED_IMG_TYPES[file.type] ? file.type : await sniffImageType(file);
var ext = ALLOWED_IMG_TYPES[type];
if (!ext) { addSys('Images must be JPG, PNG, GIF, or WEBP.'); return null; }
var path = me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
var up = await sb.storage.from('thread-images').upload(path, file, { contentType: type, upsert: false });
if (up.error) { addSys('Image upload failed: ' + up.error.message); return null; }
var pub = sb.storage.from('thread-images').getPublicUrl(path);
return (pub.data && pub.data.publicUrl) || null;
}

/* ---------- profile picture upload ----------
   A picture is cropped to a square and downscaled on a <canvas> before it ever leaves the browser,
   so "small" is enforced client-side rather than trusting whatever size someone picked -- and
   because every user always uploads to the exact same path (their own id + "/avatar.png", with
   upsert:true), there's only ever one file per account: a new upload simply replaces the old one,
   which is what "persistent until changed again" means here. A "?v=" cache-buster is appended to
   the stored URL each time so the new picture shows up immediately instead of the old one lingering
   in the browser's image cache.

   Unlike uploadImage (which stores the original file as-is, so it needs to know the real type),
   an avatar is always re-encoded to a fresh PNG by downscaleImageToBlob below -- what actually gets
   uploaded to storage is never the original file, just 96x96 pixels drawn from it onto a canvas. So
   there's no need to gate on file.type/extension at all: whether this particular photo can become a
   profile picture is exactly the question of whether the browser's own Image() can decode it, which
   downscaleImageToBlob already answers via its onload (success) / onerror ("Could not read that
   image.") -- letting that be the real test, instead of a hand-maintained MIME allowlist, means any
   format this browser can actually open (including ones mobile pickers mislabel or leave blank) just
   works, and only genuinely undecodable files (e.g. TIFF) still get turned away, with a clear reason. */
var AVATAR_SIZE = 96;
function downscaleImageToBlob(file, size) {
return new Promise(function (resolve, reject) {
var url = URL.createObjectURL(file);
var img = new Image();
img.onload = function () {
URL.revokeObjectURL(url);
var side = Math.min(img.naturalWidth, img.naturalHeight);
if (!side) { reject(new Error('Could not read that image.')); return; }
var sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
var canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
var ctx = canvas.getContext('2d');
ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error('Could not process that image.')); }, 'image/png', 0.92);
};
img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
img.src = url;
});
}
function updateAvaBtn() {
var thumb = $('avaThumb'); if (!thumb) return;
thumb.innerHTML = (me && me.avatarUrl) ? '<img src="' + esc(me.avatarUrl) + '" alt="">' : '＋';
}
async function uploadAvatar(file) {
if (!file || !me) return;
try { file = await normalizeImageFile(file); } catch (e) { addSys(e.message || 'Could not read that photo.'); return; }
if (file.size > MAX_IMG_BYTES) { addSys('Profile pictures must be 5MB or smaller.'); return; }
var btn = $('avaBtn'); if (btn) btn.disabled = true;
try {
var blob = await downscaleImageToBlob(file, AVATAR_SIZE);
var path = me.id + '/avatar.png';
var up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/png', upsert: true });
if (up.error) { addSys('Profile picture upload failed: ' + up.error.message); return; }
var pub = sb.storage.from('avatars').getPublicUrl(path);
var url = pub.data && pub.data.publicUrl;
if (!url) { addSys('Profile picture upload failed.'); return; }
url += '?v=' + Date.now();
var rp = await sb.from('profiles').upsert({ user_id: me.id, avatar_url: url, updated_at: new Date().toISOString() });
if (rp.error) { addSys('Could not save your profile picture: ' + rp.error.message); return; }
me.avatarUrl = url;
updateAvaBtn(); updateMyPresence(); renderPeople();
addSys('Your profile picture has been updated.');
} catch (e) {
addSys((e && e.message) || 'Could not process that image.');
} finally {
if (btn) btn.disabled = false;
}
}
if ($('avaBtn')) {
$('avaBtn').onclick = function () { $('avaFile').click(); };
$('avaFile').onchange = function () {
var f = $('avaFile').files && $('avaFile').files[0]; $('avaFile').value = '';
if (f) uploadAvatar(f);
};
}
/* ---------- boards and tags (v143) ----------
   One table, here, for both the buttons and the posting form's dropdowns -- and it has to agree
   with the check constraints in supabase/thread_boards_feature.sql, because the database is what
   actually refuses a bad value. If you add a board, it goes in three places: this table, that
   constraint, and the matching one on thread_subs. There is no lookup table on purpose; the list
   is short, it is decided by people rather than by data, and a join on every catalog query would
   buy nothing.

   The `note` is written on the board itself for the two boundaries that would otherwise be
   guessed at differently by different people: Texas belongs to Tex-Mex, and everything the map
   misses belongs to Elsewhere. A board that has to be explained in a FAQ is a board nobody uses
   correctly. */
var BOARDS = [
{ id: 'gen',       label: '/gen/',      name: 'General',           note: 'Anything that is not about a place' },
{ id: 'northeast', label: 'Northeast',  name: 'Northeast',         note: '' },
{ id: 'southeast', label: 'Southeast',  name: 'Southeast',         note: '' },
{ id: 'midwest',   label: 'Midwest',    name: 'Midwest',           note: '' },
{ id: 'texmex',    label: 'Tex-Mex',    name: 'Tex-Mex',           note: 'Texas and the border' },
{ id: 'southwest', label: 'Southwest',  name: 'Southwest',         note: 'Arizona and New Mexico' },
{ id: 'pnw',       label: 'Pacific NW', name: 'Pacific Northwest', note: '' },
{ id: 'canada',    label: 'Canadians',  name: 'Canadians 🙄',      note: '' },
{ id: 'europe',    label: 'Europe',     name: 'Europe',            note: '' },
{ id: 'elsewhere', label: 'Elsewhere',  name: 'Elsewhere',         note: 'California, the Mountain West, and anywhere the map misses' }
];
var TAGS = [
{ id: 'work',   label: 'Work' },
{ id: 'trade',  label: 'Buy/Sell/Trade' },
{ id: 'events', label: 'Events' },
{ id: 'family', label: 'Family' },
{ id: 'travel', label: 'Travel' },
{ id: 'hand',   label: 'Need a Hand' },
{ id: 'music',  label: 'Music' },
{ id: 'food',   label: 'Food' },
{ id: 'talk',   label: 'Just Talking' }
];
function boardById(id) { for (var i = 0; i < BOARDS.length; i++) if (BOARDS[i].id === id) return BOARDS[i]; return BOARDS[0]; }
function tagLabel(id) { for (var i = 0; i < TAGS.length; i++) if (TAGS[i].id === id) return TAGS[i].label; return ''; }
/* The board you are looking at is remembered per browser: a person who only ever reads one region
   should not have to pick it again every time they open the board. The tag filter is deliberately
   NOT remembered -- it is a thing you do to find something, not a standing preference, and a
   filter silently still applied a week later looks like an empty board. */
var curBoard = 'gen', curTag = null, mySubs = {};
try { var b = localStorage.getItem('gc_board'); if (b && boardById(b).id === b) curBoard = b; } catch (e) {}

function renderBoards() {
if (!tpBoards) return;
tpBoards.innerHTML = BOARDS.map(function (b) {
return '<button type="button" role="tab" class="tp-board' + (b.id === curBoard ? ' active' : '') +
'" data-board="' + b.id + '" aria-selected="' + (b.id === curBoard ? 'true' : 'false') + '"' +
(b.note ? ' title="' + esc(b.note) + '"' : '') + '>' + esc(b.label) + '</button>';
}).join('');
var cur = boardById(curBoard);
if (tpBoardName) tpBoardName.textContent = cur.id === 'gen' ? '/gen/ — General' : cur.name + (cur.note ? ' — ' + cur.note : '');
renderSubBtn();
}
function renderTags() {
if (!tpTags) return;
tpTags.innerHTML = '<button type="button" class="tp-tag' + (curTag ? '' : ' active') + '" data-tag="">All</button>' +
TAGS.map(function (t) {
return '<button type="button" class="tp-tag' + (t.id === curTag ? ' active' : '') + '" data-tag="' + t.id + '">' + esc(t.label) + '</button>';
}).join('');
}
function renderSubBtn() {
if (!tpSub) return;
var on = !!mySubs[curBoard];
tpSub.classList.toggle('on', on);
tpSub.setAttribute('aria-pressed', on ? 'true' : 'false');
tpSub.textContent = on ? '🔔 Notifying' : '🔕 Notify me';
tpSub.title = on ? 'You get a notification when someone starts a thread on ' + boardById(curBoard).name + ' — click to stop'
: 'Get a notification when someone starts a thread on ' + boardById(curBoard).name;
}
async function loadMySubs() {
if (!sb || !me) return;
var r = await sb.from('thread_subs').select('board').eq('user_id', me.id);
mySubs = {};
if (!r.error && r.data) r.data.forEach(function (row) { mySubs[row.board] = 1; });
renderSubBtn();
}
async function toggleSub() {
if (!sb || !me || !tpSub) return;
var board = curBoard, on = !!mySubs[board];
/* Flip the button first and put it back if the write fails: the round trip is long enough that a
   button which does nothing for half a second reads as broken, and there is nothing destructive
   about being briefly wrong here. */
mySubs[board] = on ? 0 : 1; renderSubBtn();
var r = on ? await sb.from('thread_subs').delete().eq('user_id', me.id).eq('board', board)
: await sb.from('thread_subs').upsert({ user_id: me.id, board: board }, { onConflict: 'user_id,board' });
if (r.error) { mySubs[board] = on ? 1 : 0; renderSubBtn(); addSys('Could not change that: ' + r.error.message); return; }
/* Subscribing and having notifications switched on are two different things, and a subscription
   that cannot reach you is worse than none -- it looks like it is working. We cannot raise the
   permission prompt from here: Notification.requestPermission() only shows if it runs inside the
   click with no await before it, and this handler has already been to the database and back. So
   say so plainly and point at the bell, which is the control that can ask. */
if (!on) {
var canNotify = ('Notification' in window) && Notification.permission === 'granted' && notifEnabled;
if (!canNotify) addSys('Following ' + boardById(board).name + '. Notifications are off, so this will only show up when you open the board — tap the 🔔 button to turn them on.');
else addSys('Following ' + boardById(board).name + '. You will hear about new threads there.');
} else addSys('No longer following ' + boardById(board).name + '.');
}
function fillNewSelects() {
if (tpNewBoard) tpNewBoard.innerHTML = BOARDS.map(function (b) {
return '<option value="' + b.id + '"' + (b.id === curBoard ? ' selected' : '') + '>' + esc(b.label) + '</option>';
}).join('');
if (tpNewTag) tpNewTag.innerHTML = '<option value="">(no tag)</option>' + TAGS.map(function (t) {
return '<option value="' + t.id + '">' + esc(t.label) + '</option>';
}).join('');
}
/* Painted at load, not only at sign-on. Nothing about the list of boards, the tag chips or the
   posting form's dropdowns depends on who you are -- they are static tables -- so making them wait
   for a join only created a window in which the board could be opened and found blank. The one
   piece that does need an account, loadMySubs(), still runs at sign-on. */
renderBoards(); renderTags(); fillNewSelects();

async function switchBoard(id) {
if (id === curBoard) return;
curBoard = boardById(id).id;
try { localStorage.setItem('gc_board', curBoard); } catch (e) {}
curTag = null; threadsPage = 0;
renderBoards(); renderTags();
if (tpItems) tpItems.innerHTML = '<div class="tp-empty">Loading…</div>';
await loadThreads();
}

function renderThreadList() {
if (!tpItems) return;
/* The tag filter is applied here rather than in the query: loadThreads() has already fetched this
   board's threads, so filtering in memory makes the chips instant and costs no round trip. The
   board filter IS in the query, because a board can have far more than the hundred rows we hold. */
var shown = curTag ? threadsOrder.filter(function (id) { var t = threadsCache[id]; return t && t.tag === curTag; }) : threadsOrder;
if (!shown.length) {
var bname = boardById(curBoard).name;
tpItems.innerHTML = '<div class="tp-empty">' + (curTag
? 'Nothing tagged ' + esc(tagLabel(curTag)) + ' on ' + esc(bname) + ' yet.'
: 'No threads on ' + esc(bname) + ' yet. Start one!') + '</div>';
if (tpPages) tpPages.innerHTML = '';
return;
}
var pageCount = Math.max(1, Math.ceil(shown.length / THREADS_PAGE_SIZE));
if (threadsPage >= pageCount) threadsPage = pageCount - 1; // clamp e.g. after a deletion shrinks the list
if (threadsPage < 0) threadsPage = 0;
var pageIds = shown.slice(threadsPage * THREADS_PAGE_SIZE, threadsPage * THREADS_PAGE_SIZE + THREADS_PAGE_SIZE);
tpItems.innerHTML = pageIds.map(function (id) {
var t = threadsCache[id]; if (!t) return '';
var n = t.reply_count || 0;
var preview = t.body ? '<div class="tp-preview">' + esc(String(t.body).slice(0, 180)) + '</div>' : '';
/* Catalog-tile order (thumbnail first, like 4chan's catalog) rather than the old text-then-image
   list layout -- see the .tp-thumb size rule in the CSS for why it's a fixed small square now
   instead of a full-width banner. */
var thumb = t.image_url ? '<img class="tp-thumb" src="' + esc(t.image_url) + '" alt="" loading="lazy">' : '';
/* The chip rides in the meta line rather than floating in the tile's corner. Pinned top-right it
   sat on top of the poster's name and truncated it, and a tile whose first job is to tell you who
   posted should not have that covered by a label. In the meta line it cannot collide with
   anything, and it reads in the same glance as the reply count. */
var chip = t.tag ? '<span class="tp-chip">' + esc(tagLabel(t.tag)) + '</span> ' : '';
return '<button type="button" class="tp-item" data-id="' + id + '">' + thumb + '<div class="tp-op' + (isAdminId(t.op_id) ? ' admin' : '') + '"><span class="nmt">' + esc(t.op_name) + '</span></div>' + preview +
'<div class="tp-meta">' + chip + n + ' repl' + (n === 1 ? 'y' : 'ies') + ' · ' + timeAgo(t.bumped_at) + '</div></button>';
}).join('');
renderThreadPages(pageCount);
}
function renderThreadPages(pageCount) {
if (!tpPages) return;
if (pageCount <= 1) { tpPages.innerHTML = ''; return; }
var html = '';
for (var i = 0; i < pageCount; i++) {
html += '<button type="button" class="tp-page' + (i === threadsPage ? ' active' : '') + '" data-page="' + i + '">' + (i + 1) + '</button>';
}
tpPages.innerHTML = html;
}
function upsertThread(t) {
if (!t || !t.id) return;
/* Realtime is subscribed to the whole threads table, not to one board, so a thread started on
   Southeast arrives here while you are reading Northeast. Dropping it keeps the catalog honest;
   without this the board you are looking at quietly fills with other people's regions. */
if ((t.board || 'gen') !== curBoard) return;
threadsCache[t.id] = t;
if (threadsOrder.indexOf(t.id) === -1) threadsOrder.push(t.id);
threadsOrder.sort(function (a, b) { return new Date(threadsCache[b].bumped_at) - new Date(threadsCache[a].bumped_at); });
renderThreadList();
}
async function loadThreads() {
if (!threadsPanel) return;
var r = await sb.from('threads').select('*').eq('board', curBoard).order('bumped_at', { ascending: false }).limit(100);
if (r.error) return; // quiet failure — the board is a bonus feature, never block the main room over it
threadsCache = {}; threadsOrder = [];
r.data.forEach(function (t) { threadsCache[t.id] = t; threadsOrder.push(t.id); });
renderThreadList();
}
/* Status dot next to a name -- used in the threads board and whisper windows alike (both the
   header and each message's sender name): green/yellow/red mirror the exact same live status the
   Online list shows (online/away/busy; auto-idle gets the same grey-blue the Online list gives it
   too), straight from `people`. Grey means the person isn't in `people` right now but was seen
   within the last 30 minutes -- recentPeopleEntries(), the identical reachable pool
   Whisper/tagging/@mention push already key off of, so "recently online" means the same thing
   everywhere in this app. No dot at all means neither -- most threads (and old whisper histories)
   are read long after whoever's named there was anywhere near that window. */
function presenceDotClass(id) {
var p = people[id];
if (p) return 'presence-dot presence-dot-' + (p.status || 'online');
if (recentPeopleEntries()[id]) return 'presence-dot presence-dot-recent';
return '';
}
function presenceDotHtml(id) {
var cls = presenceDotClass(id);
return cls ? '<span class="' + cls + '"></span>' : '';
}
/* Re-stamps every already-rendered name's dot -- in the open thread AND every whisper window,
   header plus transcript -- whenever presence changes. Called alongside renderPeople() from the
   presence 'sync' handler, so someone going away/busy/offline (or coming back) while you're
   looking at a thread or a whisper updates live instead of only reflecting whatever their status
   happened to be the moment their name first rendered. */
function refreshPresenceDots() {
if (tpPosts) tpPosts.querySelectorAll('.who[data-id]').forEach(refreshOnePresenceDot);
Object.keys(wins).forEach(function (id) {
updateWinPresenceDot(id);
wins[id].log.querySelectorAll('.who[data-id]').forEach(refreshOnePresenceDot);
});
}
function refreshOnePresenceDot(el) {
var dot = el.querySelector('.presence-dot');
var cls = presenceDotClass(el.dataset.id);
if (!cls) { if (dot) dot.remove(); return; }
if (dot) dot.className = cls;
else el.insertAdjacentHTML('afterbegin', '<span class="' + cls + '"></span>');
}
function appendThreadPost(p, isOp) {
if (threadPostsSeen[p.id]) return; threadPostsSeen[p.id] = 1;
var postIsAdmin = isAdminId(p.sender_id);
var d = document.createElement('div'); d.className = 'tp-post' + (isOp ? ' op' : '') + (postIsAdmin ? ' admin' : '');
d.dataset.postId = String(p.id);
/* A thread's opening post lives as a row in public.threads, not thread_posts -- appendThreadPost
   gets handed a synthetic { id: 'op-'+id, ... } for it (see openThread), but that pseudo-object
   still carries a real thread_id, so reactions on an OP target 'thread'/thread_id while replies
   target 'thread_post'/their own real id. */
var reactType = isOp ? 'thread' : 'thread_post';
var reactId = isOp ? p.thread_id : p.id;
/* class="who" + data-name wires this into the same name-menu click handling (see tpPosts.onclick
   below) that the main chat log and leaderboard already use, so tapping a name in a thread opens
   the familiar Get Info / Whisper / Tag in Chat / Block menu instead of doing nothing. */
var html = '<span class="t">' + fmt(p.created_at) + '</span><b class="who' + (isAdminId(p.sender_id) ? ' admin' : '') + '" data-id="' + esc(p.sender_id) + '" data-name="' + esc(p.sender_name) + '" tabindex="0">' + presenceDotHtml(p.sender_id) + '<span class="nmt">' + esc(p.sender_name) + '</span>' + levelBadgeHtml(p.sender_id) + (isOp ? ' (OP)' : '') + ':</b> ';
if (p.body) html += bodyHtml(p.body);
if (p.image_url) html += (p.body ? '<br>' : '') + '<img class="tp-posted-img" src="' + esc(p.image_url) + '" alt="Image" loading="lazy">';
if (isAdmin) html += ' <button type="button" class="tp-del" data-id="' + esc(String(p.id)) + '" data-op="' + (isOp ? '1' : '0') + '" data-thread="' + esc(String(p.thread_id)) + '" title="' + (isOp ? 'Delete thread' : 'Delete reply') + '" aria-label="' + (isOp ? 'Delete thread' : 'Delete reply') + '">🗑</button>';
html += reactionsHtml(reactType, reactId);
d.innerHTML = html;
var atBottom = tpPosts.scrollHeight - tpPosts.scrollTop - tpPosts.clientHeight < 60;
/* Admin posts are pinned as a block at the top of the thread (in chronological order among
   themselves), above every regular post -- rather than sorted purely by time. */
if (postIsAdmin) {
var firstNonAdmin = tpPosts.querySelector('.tp-post:not(.admin)');
if (firstNonAdmin) tpPosts.insertBefore(d, firstNonAdmin);
else tpPosts.appendChild(d);
} else {
tpPosts.appendChild(d);
}
if (atBottom) { tpPosts.scrollTop = tpPosts.scrollHeight; stickImages(tpPosts, d); }
}
/* ---------- delete threads / replies (admins only) ---------- */
function removeThreadLocally(id) {
if (openThreadId === id) closeThread();
if (!threadsCache[id]) return;
delete threadsCache[id];
var idx = threadsOrder.indexOf(id); if (idx > -1) threadsOrder.splice(idx, 1);
renderThreadList();
}
function removeThreadPostLocally(postId, threadId) {
var el = tpPosts.querySelector('.tp-post[data-post-id="' + postId + '"]');
if (el) el.remove();
if (threadId && threadsCache[threadId]) {
threadsCache[threadId].reply_count = Math.max(0, (threadsCache[threadId].reply_count || 1) - 1);
upsertThread(threadsCache[threadId]);
}
}
async function deleteThread(id) {
if (!confirm('Delete this thread and all its replies? This cannot be undone.')) return;
var r = await sb.from('threads').delete().eq('id', id);
if (r.error) { addSys('Could not delete thread: ' + r.error.message); return; }
removeThreadLocally(id);
addSys('Thread deleted.');
}
async function deleteThreadPost(postId, threadId) {
if (!confirm('Delete this reply? This cannot be undone.')) return;
var r = await sb.from('thread_posts').delete().eq('id', postId);
if (r.error) { addSys('Could not delete reply: ' + r.error.message); return; }
removeThreadPostLocally(postId, threadId);
addSys('Reply deleted.');
}
if (tpPosts) {
tpPosts.onclick = function (e) {
if (Date.now() < suppressClickUntil) return; // this click is the tail end of a long-press that already acted
var img = e.target.closest('img.gif, img.tp-posted-img'); if (img) { openLightbox(img.src); return; }
var rpill = e.target.closest('.react-pill'); if (rpill) { e.stopPropagation(); var rc2 = rpill.closest('.reactions'); toggleReaction(rc2.dataset.rtype, Number(rc2.dataset.rid), rpill.dataset.emoji); return; }
/* Same Get Info / Whisper / Tag in Chat / Block menu a name click opens everywhere else in the
   app (main chat log, online list, friends list, leaderboard) -- see openMenu. */
var who = e.target.closest('.who[data-id]');
if (who && who.dataset.id !== me.id) { e.stopPropagation(); openMenu(who.dataset.id, who, who.dataset.name); return; }
var b = e.target.closest('.tp-del'); if (!b) return;
e.stopPropagation();
var tid = Number(b.dataset.thread);
if (b.dataset.op === '1') deleteThread(tid);
else deleteThreadPost(Number(b.dataset.id), tid);
};
tpPosts.addEventListener('keydown', function (e) {
if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.closest('.who[data-id]')) return;
e.preventDefault(); tpPosts.onclick(e);
});
}
async function openThread(id) {
if (!threadsCache[id]) return;
closeGif();
openThreadId = id; threadPostsSeen = {};
tpList.classList.add('hidden'); tpDetail.classList.remove('hidden');
placeThreadBtn(); // the catalog's header just went away; move the button into this thread's
var t = threadsCache[id];
var tpDetailHd = tpDetail.querySelector('.tp-hd span');
if (tpDetailHd) {
var snippet = t.body ? String(t.body).slice(0, 60) : '';
if (t.body && String(t.body).length > 60) snippet += '…';
tpDetailHd.textContent = '/Gen "' + snippet + '"';
}
if (gcRoot) gcRoot.classList.add('thread-open');
tpPosts.innerHTML = '<div class="tp-loading">Loading…</div>';
var r = await sb.from('thread_posts').select('*').eq('thread_id', id).order('created_at', { ascending: true }).limit(500);
if (openThreadId !== id) return; // closed/switched while the query was in flight
tpPosts.innerHTML = '';
appendThreadPost({ id: 'op-' + id, sender_id: t.op_id, sender_name: t.op_name, body: t.body, image_url: t.image_url, created_at: t.created_at, thread_id: id }, true);
if (!r.error) r.data.forEach(function (p) { appendThreadPost(p, false); });
tpPosts.scrollTop = tpPosts.scrollHeight;
autoFocus(tpReplyBody); // desktop only: on a phone the keyboard would cover the thread you just opened
loadReactionsFor('thread', [id]);
loadReactionsFor('thread_post', r.data ? r.data.map(function (p) { return p.id; }) : []);
}
function closeThread() {
openThreadId = null;
closeGif();
tpDetail.classList.add('hidden'); tpList.classList.remove('hidden');
placeThreadBtn(); // ...and back into the catalog's header on the way out
if (gcRoot) gcRoot.classList.remove('thread-open');
}
async function threadGate() {
var now = Date.now();
if (now - lastThreadSend < 700) return false; // gentle client-side throttle; the DB enforces its own too
if (moderation.muted) { updateComposeLock(); warnPopup(moderation.offenseCount, true, moderation.mutedPermanent, 0); return false; }
if (moderation.cooldownUntil > now) { updateComposeLock(); return false; }
lastThreadSend = now;
var chk = await sb.rpc('gc_check_and_record_send', { p_name: me.name });
if (chk.error) { addSys('Your words were lost: ' + chk.error.message); return false; }
var d = chk.data || {};
if (!d.ok) {
var cdUntil = d.retry_at ? new Date(d.retry_at).getTime() : (Date.now() + (d.cooldown_seconds || 0) * 1000);
applyModeration({ muted: d.reason === 'muted', mutedPermanent: !!d.permanent, offenseCount: d.offense_count || moderation.offenseCount, cooldownUntil: cdUntil, mutedUntil: d.muted_until ? new Date(d.muted_until).getTime() : 0 });
warnPopup(d.offense_count || moderation.offenseCount, d.reason === 'muted', !!d.permanent, d.cooldown_seconds || 0);
return false;
}
return true;
}
async function submitNewThread() {
var body = sanitizeInput(tpNewBody.value).trim().slice(0, 1000);
var imageUrl = tpNewImageUrl;
if (!body && !imageUrl) return;
if (!(await threadGate())) return;
var board = (tpNewBoard && tpNewBoard.value) || curBoard;
var tag = (tpNewTag && tpNewTag.value) || null;
var row = { op_id: me.id, op_name: me.name, body: body || null, board: board, tag: tag };
if (imageUrl) row.image_url = imageUrl;
var r = await sb.from('threads').insert(row).select().single();
if (r.error) { addSys('Your thread was lost: ' + r.error.message); return; }
tpNewBody.value = ''; clearPendingImage('new'); tpNewPost.classList.add('hidden'); tpNewBtn.classList.remove('hidden');
threadsPage = 0;
/* Posting to a board you are not currently reading moves you there, rather than dropping the
   thread somewhere you cannot see and leaving you looking at an unchanged catalog. */
if (board !== curBoard) { await switchBoard(board); } else { upsertThread(r.data); }
triggerBoardPush(board, r.data);
openThread(r.data.id);
}
async function submitReply() {
if (!openThreadId) return;
var body = sanitizeInput(tpReplyBody.value).trim().slice(0, 1000);
var imageUrl = tpReplyImageUrl;
if (!body && !imageUrl) return;
if (!(await threadGate())) return;
var tid = openThreadId;
var row = { thread_id: tid, sender_id: me.id, sender_name: me.name, body: body || null };
if (imageUrl) row.image_url = imageUrl;
var r = await sb.from('thread_posts').insert(row).select().single();
if (r.error) { addSys('Your reply was lost: ' + r.error.message); return; }
tpReplyBody.value = ''; clearPendingImage('reply');
if (openThreadId === tid) appendThreadPost(r.data, false);
if (threadsCache[tid]) {
threadsCache[tid].bumped_at = new Date().toISOString();
threadsCache[tid].reply_count = (threadsCache[tid].reply_count || 0) + 1;
upsertThread(threadsCache[tid]);
}
}
/* v163: a new thread on a board you follow, while Gypsy Chat is open. Its push is dropped on purpose
   by the service worker whenever a Gypsy Chat window has focus (sw.js) -- right for a whisper, which
   the page shows anyway, but for a board nothing on the page said a word unless you happened to be
   reading that very board. So you heard about a followed board only when the app was closed, and
   testing it with the app open looked exactly like it was broken. Your own threads never notify
   you, here or by push. */
function boardPostArrived(t) {
if (!t || !me || t.op_id === me.id || !mySubs[t.board] || blocked[t.op_id]) return;
/* Only while this window has focus -- exactly the case in which the service worker drops the push
   -- so the toast and the phone-style notification never both fire for the same thread. */
if (!document.hasFocus()) return;
if (gcRoot && gcRoot.classList.contains('mobile-threads-open') && (t.board || 'gen') === curBoard) return; // it just appeared in front of you
var blurb = t.body ? String(t.body).slice(0, 90) + (String(t.body).length > 90 ? '\u2026' : '') : (t.image_url ? 'Posted a picture' : 'Started a thread');
playSound('ding');
showToast({
peer: 'board:' + t.board, kind: 'board', icon: '\uD83D\uDCDC', ttl: 15000,
text: (t.op_name || 'Someone') + ' posted on ' + boardById(t.board).name, sub: blurb,
onClick: function () { if (!threadsCache[t.id]) shareThreadCache[t.id] = t; openThreadFromShare(t.id); }
});
}
function subscribeThreads() {
if (threadsChannel || !threadsPanel) return;
threadsChannel = sb.channel('threads-board');
threadsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' }, function (p) { upsertThread(p.new); boardPostArrived(p.new); });
threadsChannel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'threads' }, function (p) { upsertThread(p.new); });
threadsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_posts' }, function (p) {
if (openThreadId === p.new.thread_id) appendThreadPost(p.new, false);
});
threadsChannel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'threads' }, function (p) { removeThreadLocally(p.old.id); });
threadsChannel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'thread_posts' }, function (p) { removeThreadPostLocally(p.old.id, p.old.thread_id); });
threadsChannel.subscribe();
}
function unsubscribeThreads() {
if (threadsChannel) { threadsChannel.unsubscribe(); threadsChannel = null; }
}
if (tpBoards) tpBoards.onclick = function (e) {
var b = e.target.closest('.tp-board'); if (!b) return; switchBoard(b.dataset.board);
};
if (tpTags) tpTags.onclick = function (e) {
var b = e.target.closest('.tp-tag'); if (!b) return;
curTag = b.dataset.tag || null; threadsPage = 0;
renderTags(); renderThreadList();
};
if (tpSub) tpSub.onclick = toggleSub;
if (tpNewBtn) {
tpNewBtn.onclick = function () { fillNewSelects(); tpNewPost.classList.remove('hidden'); tpNewBtn.classList.add('hidden'); tpNewBody.focus(); };
tpNewCancel.onclick = function () { tpNewPost.classList.add('hidden'); tpNewBtn.classList.remove('hidden'); tpNewBody.value = ''; clearPendingImage('new'); };
tpNewSubmit.onclick = submitNewThread;
tpNewBody.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNewThread(); } };
tpItems.onclick = function (e) {
/* Clicking the thumbnail itself pops the full image (4chan's catalog does the same) --
   clicking anywhere else on the tile opens the thread. */
var img = e.target.closest('.tp-thumb'); if (img) { e.stopPropagation(); openLightbox(img.src); return; }
var b = e.target.closest('.tp-item'); if (!b) return; openThread(Number(b.dataset.id));
};
tpBack.onclick = closeThread;
if ($('tpShare')) $('tpShare').onclick = function () { if (openThreadId) shareThreadWith(openThreadId); };
if (tpPages) tpPages.onclick = function (e) {
var b = e.target.closest('.tp-page'); if (!b) return;
threadsPage = Number(b.dataset.page); renderThreadList();
};
tpReplySend.onclick = submitReply;
tpReplyBody.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } };
}
if (tpNewImgBtn) {
tpNewImgBtn.onclick = function () { tpNewImgFile.click(); };
tpNewImgFile.onchange = async function () {
var f = tpNewImgFile.files && tpNewImgFile.files[0]; if (!f) return;
tpNewImgBtn.disabled = true;
var url = await uploadImage(f);
tpNewImgBtn.disabled = false;
if (url) setPendingImage('new', url); else tpNewImgFile.value = '';
};
tpNewImgRemove.onclick = function () { clearPendingImage('new'); };
tpNewGifBtn.onclick = function () { openGifPicker('', 'thread-new', tpNewGifBtn); };
}
if (tpReplyImgBtn) {
tpReplyImgBtn.onclick = function () { tpReplyImgFile.click(); };
tpReplyImgFile.onchange = async function () {
var f = tpReplyImgFile.files && tpReplyImgFile.files[0]; if (!f) return;
tpReplyImgBtn.disabled = true;
var url = await uploadImage(f);
tpReplyImgBtn.disabled = false;
if (url) setPendingImage('reply', url); else tpReplyImgFile.value = '';
};
tpReplyImgRemove.onclick = function () { clearPendingImage('reply'); };
tpReplyGifBtn.onclick = function () { openGifPicker('', 'thread-reply', tpReplyGifBtn); };
}
/* mobile toggle: below the 1340px breakpoint there's no blank space for a persistent side panel,
   so a floating button swaps the whole screen between the chat window and the threads board. */
/* Opening a full-screen panel hides .win outright, so the browser has no scroll position left
   to restore and resets everything to 0 -- coming back used to dump you at the very top of the
   chat window, staring at the title bar. Jumping to the bottom instead fixed that but threw
   away your place just as rudely if you were reading back through the log.
   So: take a note of where you were on the way out, and put you back there on the way in.
   The one deliberate exception is the bottom -- if you left while pinned to the newest message,
   you come back pinned to the newest message, including whatever arrived while you were away,
   rather than to the older message that happened to be at that pixel offset.
   Rotating the device needs the exact same rescue, and needs it worse: below the 500px breakpoint
   the whole PAGE scrolls instead of the log having its own scrollbox (see .log's max-width:500px
   override in style.css), and a phone's width crosses that breakpoint on nearly every portrait<->
   landscape flip. That doesn't just reset the scroll position -- it swaps WHICH element is the
   scrolling container out from under you, so a raw pixel offset from one side (a page scrollY, or
   a log.scrollTop) means nothing applied to the other: restoring window.scrollTo(oldPageY) after
   landscape->portrait, when oldPageY was captured while landscape's near-static outer page barely
   scrolled at all, is what was landing back near the top even with a "remembered" position on file.
   So the snapshot stores a fraction (0 = top of the conversation, 1 = bottom) of whichever
   container was actually scrolling at capture time, and restoring re-applies that same fraction to
   whichever container is actually scrolling now -- which stays meaningful across the swap since
   both containers hold the same messages in the same order, just measured differently.
   Two frames on the way back: one for the browser to lay .win out again, one for the scroll to
   actually stick on iOS Safari. The orientationchange listener above reuses this same remember/
   return pair for the rotation case. */
var chatScroll = null;
function isNarrow() { return window.matchMedia('(max-width:1339px)').matches; }
function logVisible() { return log && !log.classList.contains('hidden'); }
function pageScrollsLog() { return window.matchMedia('(max-width:500px)').matches; } // true: the whole page scrolls, log has no scrollbox of its own; false: log has its own fixed-height scrollbox and the outer page doesn't move
function chatAtBottom() {
if (!logVisible()) return true;
if (pageScrollsLog()) { var doc = document.documentElement; return (doc.scrollHeight - (window.scrollY || doc.scrollTop || 0) - window.innerHeight) < 40; }
return (log.scrollHeight - log.scrollTop - log.clientHeight) < 40;
}
function chatScrollFraction() {
if (pageScrollsLog()) { var doc = document.documentElement; var max = Math.max(1, doc.scrollHeight - window.innerHeight); return (window.scrollY || doc.scrollTop || 0) / max; }
if (!logVisible()) return 1;
var max2 = Math.max(1, log.scrollHeight - log.clientHeight);
return log.scrollTop / max2;
}
function scrollChatToBottom() {
if (pageScrollsLog()) window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
else if (logVisible()) log.scrollTop = log.scrollHeight;
}
function rememberChatScroll() {
if (!isNarrow()) return;
chatScroll = { fraction: chatScrollFraction(), atBottom: chatAtBottom() };
}
function returnToChat() {
if (!isNarrow()) return;
var st = chatScroll;
function place() {
if (!st || st.atBottom) { scrollChatToBottom(); return; } // no snapshot (e.g. rotated into this width before ever leaving it), or pinned to the newest message -- the bottom is always the right target
if (pageScrollsLog()) { var doc = document.documentElement; window.scrollTo(0, st.fraction * Math.max(0, doc.scrollHeight - window.innerHeight)); }
else if (logVisible()) { log.scrollTop = st.fraction * Math.max(0, log.scrollHeight - log.clientHeight); }
}
/* One placement isn't the end of it on iOS: below the 500px breakpoint the chat log has no
   scrollbox of its own, so it's the whole PAGE that scrolls, and the page's height depends on
   100dvh -- which iOS Safari keeps changing for a few hundred ms after this fires, as its
   address bar/toolbar animates open or closed on the way back from a full-viewport panel. A
   single scrollTo lands correctly and then gets shoved off again a moment later when the
   toolbar finishes moving and the document height changes under it. So re-assert the same
   target a few more times over the next second instead of trusting one attempt to stick. */
requestAnimationFrame(function () {
requestAnimationFrame(function () {
place();
[50, 150, 300, 500, 800].forEach(function (ms) { setTimeout(place, ms); });
});
});
}

/* ---------- the hours (v141) ----------
   A bell every three hours, on the hour, in each reader's own local time. The eight slots are not
   an arbitrary "every 3h" -- they are the cycle of the daily office as the Orthodox Church keeps
   it, and each one is named for the hour it is: the Midnight Office, Matins before dawn, then the
   First, Third, Sixth and Ninth Hours through the day, Vespers at its close and Compline before
   sleep. Naming them is the whole point; "18:00" would be a clock, and this is meant to be a bell.

   Local time rather than one shared moment, deliberately. A bell marks where YOU are in the day.
   Everyone hearing Vespers together at 6pm Eastern would mean a Californian hearing it at three in
   the afternoon, which is not Vespers, it is just a noise.

   Nothing is written to the database. The line is drawn client-side, so it costs no row, no
   realtime traffic and none of the room's 100-message budget -- a bell you missed because you were
   not here is a bell you missed, which is exactly how bells work.

   This is where the scripture line will attach once its verse list is settled; the bell rings on
   its own until then. */
var HOURS_OF_THE_DAY = {
0:  { name: 'The Midnight Office', theme: 'the Bridegroom comes at midnight' },
3:  { name: 'Matins',              theme: 'the light before the dawn' },
6:  { name: 'The First Hour',      theme: 'Christ before Pilate; the true light' },
9:  { name: 'The Third Hour',      theme: 'the descent of the Holy Spirit' },
12: { name: 'The Sixth Hour',      theme: 'the Crucifixion' },
15: { name: 'The Ninth Hour',      theme: 'the death of Christ' },
18: { name: 'Vespers',             theme: 'thanksgiving at the close of the day' },
21: { name: 'Compline',            theme: 'sleep, and trust through the night' }
};

/* ---------- the reading at each hour (v148) ----------
   Every word below is the New King James Version, checked against the text rather than written
   from memory -- quoting scripture wrongly in a room full of Christians is not a small defect.
   Fifty-two verses in all, which matters: Thomas Nelson allow up to 500 NKJV verses without
   written permission provided they are not a whole book and not a quarter of the work, and they
   require the notice that now sits in the ⋯ menu beside the version number. That is also why this
   is a fixed table baked into the app and not a live Bible lookup -- an open-ended feed of verses
   would leave the licence behind on its first week of running.

   Each hour carries its own reading because the hours are not interchangeable. The Third Hour is
   when the Spirit descended at Pentecost, the Sixth is when Christ was nailed to the Cross, the
   Ninth is when He died, Compline is said before sleep. A verse chosen at random would throw that
   away, and the hours are the only reason this is more than a clock with a bell on it.

   Each passage keeps the narrative around the saying rather than lifting the words out on their
   own -- "in context" meant literally. seg[].r marks the words of Christ, which is the only part
   set in red; "Then Jesus said" is the evangelist speaking, not Him, and colouring it red would
   be a small lie about who said what. */
var SCRIPTURE = {"0":[{"ref":"Matthew 25:10-13","seg":[{"t":"And while they went to buy, the bridegroom came, and those who were ready went in with him to the wedding; and the door was shut. Afterward the other virgins came also, saying, “Lord, Lord, open to us!” But he answered and said, "},{"t":"“Assuredly, I say to you, I do not know you. Watch therefore, for you know neither the day nor the hour in which the Son of Man is coming.”","r":1}]},{"ref":"Mark 13:33-37","seg":[{"t":"“Take heed, watch and pray; for you do not know when the time is. It is like a man going to a far country, who left his house and gave authority to his servants, and to each his work, and commanded the doorkeeper to watch. Watch therefore, for you do not know when the master of the house is coming—in the evening, at midnight, at the crowing of the rooster, or in the morning—lest, coming suddenly, he find you sleeping. And what I say to you, I say to all: Watch!”","r":1}]},{"ref":"Luke 12:35-37","seg":[{"t":"“Let your waist be girded and your lamps burning; and you yourselves be like men who wait for their master, when he will return from the wedding, that when he comes and knocks they may open to him immediately. Blessed are those servants whom the master, when he comes, will find watching. Assuredly, I say to you that he will gird himself and have them sit down to eat, and will come and serve them.”","r":1}]}],"3":[{"ref":"John 11:25-26","seg":[{"t":"Jesus said to her, "},{"t":"“I am the resurrection and the life. He who believes in Me, though he may die, he shall live. And whoever lives and believes in Me shall never die. Do you believe this?”","r":1}]},{"ref":"John 8:12","seg":[{"t":"Then Jesus spoke to them again, saying, "},{"t":"“I am the light of the world. He who follows Me shall not walk in darkness, but have the light of life.”","r":1}]},{"ref":"Matthew 28:18-20","seg":[{"t":"And Jesus came and spoke to them, saying, "},{"t":"“All authority has been given to Me in heaven and on earth. Go therefore and make disciples of all the nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, teaching them to observe all things that I have commanded you; and lo, I am with you always, even to the end of the age.”","r":1},{"t":" Amen."}]}],"6":[{"ref":"John 18:37","seg":[{"t":"Pilate therefore said to Him, “Are You a king then?” Jesus answered, "},{"t":"“You say rightly that I am a king. For this cause I was born, and for this cause I have come into the world, that I should bear witness to the truth. Everyone who is of the truth hears My voice.”","r":1}]},{"ref":"John 12:46","seg":[{"t":"“I have come as a light into the world, that whoever believes in Me should not abide in darkness.”","r":1}]},{"ref":"Matthew 5:14-16","seg":[{"t":"“You are the light of the world. A city that is set on a hill cannot be hidden. Nor do they light a lamp and put it under a basket, but on a lampstand, and it gives light to all who are in the house. Let your light so shine before men, that they may see your good works and glorify your Father in heaven.”","r":1}]}],"9":[{"ref":"John 14:15-17","seg":[{"t":"“If you love Me, keep My commandments. And I will pray the Father, and He will give you another Helper, that He may abide with you forever—the Spirit of truth, whom the world cannot receive, because it neither sees Him nor knows Him; but you know Him, for He dwells with you and will be in you.”","r":1}]},{"ref":"John 16:13-14","seg":[{"t":"“However, when He, the Spirit of truth, has come, He will guide you into all truth; for He will not speak on His own authority, but whatever He hears He will speak; and He will tell you things to come. He will glorify Me, for He will take of what is Mine and declare it to you.”","r":1}]},{"ref":"Luke 11:11-13","seg":[{"t":"“If a son asks for bread from any father among you, will he give him a stone? Or if he asks for a fish, will he give him a serpent instead of a fish? Or if he asks for an egg, will he offer him a scorpion? If you then, being evil, know how to give good gifts to your children, how much more will your heavenly Father give the Holy Spirit to those who ask Him!”","r":1}]}],"12":[{"ref":"Luke 23:33-34","seg":[{"t":"And when they had come to the place called Calvary, there they crucified Him, and the criminals, one on the right hand and the other on the left. Then Jesus said, "},{"t":"“Father, forgive them, for they do not know what they do.”","r":1},{"t":" And they divided His garments and cast lots."}]},{"ref":"John 12:32-33","seg":[{"t":"“And I, if I am lifted up from the earth, will draw all peoples to Myself.”","r":1},{"t":" This He said, signifying by what death He would die."}]},{"ref":"Matthew 16:24-25","seg":[{"t":"Then Jesus said to His disciples, "},{"t":"“If anyone desires to come after Me, let him deny himself, and take up his cross, and follow Me. For whoever desires to save his life will lose it, but whoever loses his life for My sake will find it.”","r":1}]}],"15":[{"ref":"Luke 23:46","seg":[{"t":"And when Jesus had cried out with a loud voice, He said, "},{"t":"“Father, into Your hands I commit My spirit.”","r":1},{"t":" Having said this, He breathed His last."}]},{"ref":"John 19:30","seg":[{"t":"So when Jesus had received the sour wine, He said, "},{"t":"“It is finished!”","r":1},{"t":" And bowing His head, He gave up His spirit."}]},{"ref":"John 15:12-13","seg":[{"t":"“This is My commandment, that you love one another as I have loved you. Greater love has no one than this, than to lay down one’s life for his friends.”","r":1}]}],"18":[{"ref":"Matthew 11:28-30","seg":[{"t":"“Come to Me, all you who labor and are heavy laden, and I will give you rest. Take My yoke upon you and learn from Me, for I am gentle and lowly in heart, and you will find rest for your souls. For My yoke is easy and My burden is light.”","r":1}]},{"ref":"Matthew 6:25-26","seg":[{"t":"“Therefore I say to you, do not worry about your life, what you will eat or what you will drink; nor about your body, what you will put on. Is not life more than food and the body more than clothing? Look at the birds of the air, for they neither sow nor reap nor gather into barns; yet your heavenly Father feeds them. Are you not of more value than they?”","r":1}]},{"ref":"John 6:35","seg":[{"t":"And Jesus said to them, "},{"t":"“I am the bread of life. He who comes to Me shall never hunger, and he who believes in Me shall never thirst.”","r":1}]}],"21":[{"ref":"John 14:27","seg":[{"t":"“Peace I leave with you, My peace I give to you; not as the world gives do I give to you. Let not your heart be troubled, neither let it be afraid.”","r":1}]},{"ref":"Mark 4:39-40","seg":[{"t":"Then He arose and rebuked the wind, and said to the sea, "},{"t":"“Peace, be still!”","r":1},{"t":" And the wind ceased and there was a great calm. But He said to them, "},{"t":"“Why are you so fearful? How is it that you have no faith?”","r":1}]},{"ref":"John 10:27-28","seg":[{"t":"“My sheep hear My voice, and I know them, and they follow Me. And I give them eternal life, and they shall never perish; neither shall anyone snatch them out of My hand.”","r":1}]}]};
/* Everyone in the room on the same day sees the same reading at the same hour, without a round
   trip: the index is derived from the date itself, so two people standing in the same hour arrive
   at the same passage independently. Three readings per hour means a given hour comes back round
   every third day -- which is roughly how a lectionary behaves, and these are meant to be familiar
   words rather than a stream of new ones.
   v166: returns the index, not the passage, because the index is what gets remembered (hoursSeen,
   below): a reading put back after a reload has to be the passage that was shown, even if the day
   has turned since. -1 for an hour with no readings. */
function readingIndexFor(h) {
var list = SCRIPTURE[h]; if (!list || !list.length) return -1;
var days = Math.floor(Date.now() / 86400000);
return days % list.length;
}
function addScripture(hour, entry, at) {
var d = document.createElement('div'); d.className = 'm scripture';
var body = entry.seg.map(function (s) {
return s.r ? '<span class="sc-red">' + esc(s.t) + '</span>' : esc(s.t);
}).join('');
d.innerHTML = '<div class="sc-hd"><span class="sc-bell" aria-hidden="true">\uD83D\uDD14</span>' +
esc(hour.name) + '<span class="sc-theme"> \u00B7 ' + esc(hour.theme) + '</span></div>' +
'<div class="sc-body">' + body + '</div>' +
'<div class="sc-ref">' + esc(entry.ref) + ' \u00B7 NKJV</div>';
var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
dayDivider(log, 'room', at || Date.now());
log.appendChild(d);
/* A new reading always brings the log down to it, as it always did. One being put back during the
   history replay follows the replay's own rule instead (renderRoom): only if already at the bottom. */
if (!replayingHistory || atBottom) log.scrollTop = log.scrollHeight;
}
/* v153: which canonical hour we are IN, not which one has just struck. The hours are periods and
   not instants -- the Ninth Hour runs from three o'clock until Vespers -- so arriving at 15:40
   should still bring the Ninth Hour's reading rather than nothing at all.
   This is also the whole reason phones never showed one. The old rule was "the first two minutes
   past the hour", checked by a 30 s interval; iOS suspends a backgrounded tab's timers entirely,
   so on a phone that window was essentially never open while anyone was looking, and a desktop
   left running would show a reading the same phone never did. */
function canonicalHourNow(d) {
for (var h = d.getHours(); h >= 0; h--) if (HOURS_OF_THE_DAY[h]) return h;
return null;
}
/* v166: the readings come back after a reload or a log out.
   A reading is drawn in this page and nowhere else -- nothing is written to the database (see the
   hours, above) -- so anything that rebuilt the chat from the database dropped every one of them:
   a refresh, the update banner's reload, closing the app and signing in again later. Even the
   reading for the hour we were in stayed away, because the one key this used to keep
   (gc_hour_shown) told the device it had already been shown.

   So each device keeps a short list of the readings it has shown: which hour, which passage, and
   when it was drawn. The history replay at sign-on (joinInner) puts each one back among the
   messages where it stood, and the reading for the hour we are in is always on screen once the
   room is. It is still true that a bell you missed is a bell you missed: only readings this device
   showed come back, never ones for hours nobody here was in the room. A week's worth at most. */
var HOURS_KEEP_MS = 7 * 86400000;
var hoursSeen = [];
try { hoursSeen = JSON.parse(localStorage.getItem('gc_hours_seen') || '[]'); } catch (e) { hoursSeen = []; }
if (!Array.isArray(hoursSeen)) hoursSeen = [];
try { localStorage.removeItem('gc_hour_shown'); } catch (e) {} // the one-key version this replaces
var hoursInLog = {};       // key -> 1 for each reading drawn into this page's room log
var roomHistoryIn = false; // set once sign-on has replayed the history; cleared by leaveRoom
function hourEntryOk(x) {
return !!x && typeof x.k === 'string' && typeof x.at === 'number' && !!HOURS_OF_THE_DAY[x.h] && !!SCRIPTURE[x.h] && !!SCRIPTURE[x.h][x.i];
}
function saveHoursSeen() {
var cutoff = Date.now() - HOURS_KEEP_MS;
hoursSeen = hoursSeen.filter(function (x) { return hourEntryOk(x) && x.at > cutoff; }).slice(-60);
try { localStorage.setItem('gc_hours_seen', JSON.stringify(hoursSeen)); } catch (e) {}
}
function drawHour(x) {
hoursInLog[x.k] = 1;
addScripture(HOURS_OF_THE_DAY[x.h], SCRIPTURE[x.h][x.i], x.at);
}
/* Which readings to put back into a history that is being replayed, oldest first: the ones this
   device showed from the oldest room message in that history onwards. Anything older left the
   room's backlog along with the messages around it. */
function hoursToRestore(rows) {
var oldest = null;
for (var j = 0; j < rows.length; j++) if (!rows[j].recipient_id && !rows[j].conversation_id) { oldest = Date.parse(rows[j].created_at); break; }
if (oldest === null || isNaN(oldest)) return [];
var now = Date.now();
return hoursSeen.filter(function (x) { return hourEntryOk(x) && x.at >= oldest && x.at <= now && !hoursInLog[x.k]; })
.sort(function (a, b) { return a.at - b.at; });
}
function bellTick() {
if (!me || !roomHistoryIn) return; // the sign-on screen is not the room, and nor is a room whose history is still coming in
var d = new Date(), h = canonicalHourNow(d), hour = h === null ? null : HOURS_OF_THE_DAY[h];
if (!hour) return;
var key = d.toDateString() + ' ' + h;
if (hoursInLog[key]) return; // already on screen
var before = null;
for (var j = 0; j < hoursSeen.length; j++) if (hoursSeen[j] && hoursSeen[j].k === key) before = hoursSeen[j];
/* The bell announces an hour striking. A reading being caught up on -- a phone unlocked at 15:40,
   a tab opened after lunch -- arrives quietly, because ringing for an hour that struck forty
   minutes ago would be announcing something that has already happened. Nor does it ring again for
   a reading this device has already shown, which is being put back after a reload. */
if (!before && d.getHours() === h && d.getMinutes() <= 2 && !document.hidden) playSound('bell');
var i = before && hourEntryOk(before) ? before.i : readingIndexFor(h);
if (i < 0) { hoursInLog[key] = 1; addSys('\u{1F514} ' + hour.name + '.'); return; }
/* Drawn now, at the bottom -- so it is remembered as drawn now. That includes a reading this device
   showed earlier in the hour that did not come back with the history, because the room has moved
   on by more than a backlog since: next time it goes back where it is about to appear. */
var at = Date.now();
if (before) { before.i = i; before.at = at; } else hoursSeen.push({ k: key, h: h, i: i, at: at });
saveHoursSeen();
drawHour({ k: key, h: h, i: i, at: at });
}
setInterval(bellTick, 30000);
/* A locked phone stops the interval above dead, so every way the app can come back to life
   checks as well. This is what keeps a phone and a desktop showing the same reading. */
['visibilitychange', 'focus', 'pageshow'].forEach(function (ev) {
(ev === 'visibilitychange' ? document : window).addEventListener(ev, function () {
if (!document.hidden) bellTick();
});
});

/* ---------- where the Threads button lives (v138) ----------
   On a phone the Threads toggle is what it has always been: a floating bubble parented to
   .gc-root, draggable and sweepable, sitting on top of everything. On desktop it is not a
   floating anything any more -- it belongs to the title bar, beside the words, with no box of
   its own (see the v104 block at the bottom of style.css for the styling half of this).

   "The title bar" is three different elements depending on what is on screen, and only ever one
   of them at a time: the chat window's own .title; the threads catalog's .tp-hd; and an open
   thread's .tp-hd. So rather than drawing a button in each header and keeping three copies of
   the open/closed state in sync, the one real button is physically moved into whichever header
   is currently showing. Everything already bound to it -- the click handler below, the drag
   handlers in makeFabDraggable(), the aria-label and glyph the toggle keeps current -- rides
   along with the node, because it is the same node.

   Called from every place that can change which header is up: the toggle itself, openThread(),
   closeThread(), a window resize (which can cross the 500px line in either direction), sign-on
   and sign-off. Calling it when nothing has changed is free -- the parentNode check below makes
   it a no-op rather than a reparent, so it never churns the DOM or interrupts a focus ring. */
var threadBtnHome = threadToggleBtn ? threadToggleBtn.parentNode : null;
var rouletteBtnHome = null; // set below, once rouletteToggleBtn has been looked up
/* v141: Roulette gets the same treatment as Threads, on the other side of the title. It goes in
   BEFORE the left-hand lantern, so the bar reads roulette / lantern / GYPSY CHAT 2000 / lantern /
   threads, with the two takeover pages hanging off the two ends of the name.

   Which spacer the title needs depends on which buttons are actually in it, and that is not
   constant: Roulette needs no account, so it is there on the sign-on screen, while Threads only
   appears once you are in the room. One button alone has to be balanced by a blank of its own
   width on the far side; two buttons balance each other and a spacer would then push the name
   off-centre again. Rather than write that as a chain of CSS guesses, the two classes below say
   plainly which buttons are present and let the stylesheet match on it. */
function markHeaderBtns() {
var title = document.querySelector('.win > .title');
if (!title) return;
title.classList.toggle('hb-left', !!(rouletteToggleBtn && rouletteToggleBtn.parentNode === title));
title.classList.toggle('hb-right', !!(threadToggleBtn && threadToggleBtn.parentNode === title));
title.classList.toggle('hb-gr', !!(gameRoomBtn && gameRoomBtn.parentNode === title)); // v169: the Game Room, left of the name beside Roulette
}
function placeRouletteBtn() {
if (!rouletteToggleBtn) return;
var title = document.querySelector('.win > .title');
var host = (window.innerWidth <= 500 || !title) ? rouletteBtnHome : title;
if (!host) return;
/* Before the first lantern rather than appended, which is the whole point of "left side". The
   roulette page hides .win outright, so unlike Threads there is no second header to move to --
   the page carries its own "Back to chat" button instead. */
if (rouletteToggleBtn.parentNode !== host) {
if (host === title) host.insertBefore(rouletteToggleBtn, host.firstElementChild);
else host.appendChild(rouletteToggleBtn);
}
var inHeader = host !== rouletteBtnHome;
rouletteToggleBtn.classList.toggle('in-header', inHeader);
if (inHeader) {
rouletteToggleBtn.style.left = ''; rouletteToggleBtn.style.top = '';
rouletteToggleBtn.style.right = ''; rouletteToggleBtn.style.bottom = '';
rouletteToggleBtn.style.transform = '';
rouletteToggleBtn.classList.remove('fab-docked', 'fab-dragging');
}
placeGameRoomBtn(); // v169
markHeaderBtns();
}
function placeThreadBtn() {
placeRouletteBtn();
if (!threadToggleBtn) return;
var host;
if (window.innerWidth <= 500) host = threadBtnHome; // phone: back to being a free-floating bubble
else if (gcRoot && gcRoot.classList.contains('mobile-threads-open')) {
var pane = (tpDetail && !tpDetail.classList.contains('hidden')) ? tpDetail : tpList;
host = (pane && pane.querySelector('.tp-hd')) || threadBtnHome;
} else host = document.querySelector('.win > .title');
if (!host) host = threadBtnHome;
if (!host) return;
if (threadToggleBtn.parentNode !== host) host.appendChild(threadToggleBtn);
var inHeader = host !== threadBtnHome;
threadToggleBtn.classList.toggle('in-header', inHeader);
markHeaderBtns();
if (!inHeader) return;
/* A left/top pair left behind by a drag made while the window was phone-width would otherwise
   still be sitting inline on the element, and an inline style beats the stylesheet -- including
   the position:static that makes it sit in the header's flex row at all. Same reason .fab-docked
   has to come off: swept-to-the-edge is a bubble state with no meaning inside a title bar. */
threadToggleBtn.style.left = ''; threadToggleBtn.style.top = '';
threadToggleBtn.style.right = ''; threadToggleBtn.style.bottom = '';
threadToggleBtn.style.transform = '';
threadToggleBtn.classList.remove('fab-docked', 'fab-dragging');
}
window.addEventListener('resize', placeThreadBtn);

if (threadToggleBtn) {
threadToggleBtn.onclick = function () {
closeGif();
if (grOpen()) closeGameRoom();
if (gcRoot.classList.contains('mobile-roulette-open')) closeMobileRoulette();
if (gcRoot.classList.contains('leaderboard-open')) closeLeaderboard();
if (gcRoot.classList.contains('admin-open')) closeAdminPanel();
/* Grab the scroll position BEFORE toggling the class -- that class puts .win at display:none,
   and reading window.scrollY / log.scrollTop after that returns the already-collapsed value
   (effectively 0, since the scrollable content is gone), not where you actually were. That's
   why this kept landing back at the top on the way in: rememberChatScroll() was running too
   late to see anything but zero. */
var opening = !gcRoot.classList.contains('mobile-threads-open');
if (opening) rememberChatScroll();
var open = gcRoot.classList.toggle('mobile-threads-open');
threadToggleBtn.classList.toggle('open', open);
threadToggleBtn.innerHTML = open ? '💬' : ICON_SPOOL;
threadToggleBtn.setAttribute('aria-label', open ? 'Back to chat' : 'Open threads board');
if (open) { renderThreadList(); if (!openThreadId) tpList.classList.remove('hidden'); }
else returnToChat();
placeThreadBtn(); // the button has to follow the header that is now on screen
};
}

/* ---------- roulette teaser: same full-screen treatment on mobile as the threads board ---------- */
/* ---------- spin the wheel (v113) ----------
   The caravan wheel on the roulette teaser page is clickable (desktop) / swipeable (phone):
   it whirls for a couple of seconds and lands on a fortune. Purely local -- nothing is sent. */
var FORTUNES = [
'The road you are avoiding is the one that knows your name.',
'A stranger’s kindness today is a debt you will enjoy repaying.',
'What you lost in the spring will find you before the frost.',
'Say the thing. The silence is costing more than the words would.',
'Your luck is not late. It is taking the scenic route.',
'The cards do not lie, but they do enjoy a dramatic pause.',
'Someone is thinking of you and smiling. Yes, that one.',
'Rest is not the opposite of progress. It is the part that sticks.',
'Beware of advice from people who have never been wrong. They are lying.',
'The next door will open for you, but only if you stop leaning on it.',
'You will be handed an ending. Treat it as a beginning in disguise.',
'The moon has seen worse plans than yours succeed.',
'A small promise kept today outweighs a grand one made tomorrow.',
'The thing you are good at is worth more than the thing you are known for.',
'Do not count the caravan by its wheels. Count it by the songs.',
'Your patience will be tested by someone worth passing the test for.',
'The wind changes direction for those who have already set sail.',
'You are allowed to want an easier road. Just do not stop walking.',
'Three coins will leave your pocket this week. Two will come back as stories.',
'Old friends are gold you buried and forgot. Dig.',
'The answer you keep getting is the answer. Ask a better question.',
'A fire that is fed slowly burns the longest.',
'You will laugh at this in a year. Start early.',
'The person you are becoming would like a word with the person you were.',
'Luck favours the one who shows up twice.',
'Do not trade a true thing for a shiny one. The shine wears off.',
'A message you are dreading will turn out to be a door.',
'Your hands know a craft your head keeps doubting. Let them work.',
'There is a table with your name on it. Sit down like you mean it.',
'What you are protecting has already grown strong enough to protect you.',
'Speak to the quiet one at the party. They are carrying the best story.',
'The map is wrong about one thing: you are not lost.',
'Take the compliment. It cost someone courage.',
'Some debts are paid by living well. Get on with it.',
'The mirror is an unreliable witness. Ask a friend instead.',
'Tonight, sleep on it. Tomorrow, act on it.',
'A wheel that never turns is only a circle.',
'The thing you keep not saying is the truest thing you own.',
'Your enemy is tired too. Pour two cups.',
'Fortune is a hitchhiker. Slow down, and she will climb in.',
'The lantern you light for others will show you the way home.',
'You will outgrow the shoes but keep the road.',
'A gift is coming that looks like a chore. Unwrap it anyway.',
'The stars are not fixed. Neither are you.',
'Keep the receipt on your worries. Most of them will need returning.',
'Two roads, one horse. Choose the road that lets the horse rest.',
'Whatever you are rehearsing, the audience already loves you.',
'Your grandmother was right about the thing. You know the thing.',
'The bruise will fade before the lesson does. That is the deal.',
'Somewhere a kettle is on for you. Go and find it.'
];
var wheelEl = document.querySelector('.rp-wheel'), fortuneEl = $('rpFortune'), wheelSpinning = false;
function spinWheel() {
if (!wheelEl || wheelSpinning) return;
wheelSpinning = true;
if (fortuneEl) fortuneEl.classList.remove('show');
wheelEl.classList.add('spinning');
var clicks = null;
if (!soundMuted && !playFile('wheel')) { var i = 0; clicks = setInterval(function () { if (i++ < 28) tickSound(i % 2 === 0); }, 120); } // v128: the recorded ratchet; synth clicks only if the file is missing
setTimeout(function () {
if (clicks) clearInterval(clicks);
wheelEl.classList.remove('spinning'); wheelSpinning = false;
if (fortuneEl) { fortuneEl.textContent = '“' + FORTUNES[Math.floor(Math.random() * FORTUNES.length)] + '”'; fortuneEl.classList.add('show'); }
playSound('fortune');
}, 4000);
}
if (wheelEl) {
wheelEl.setAttribute('role', 'button'); wheelEl.setAttribute('tabindex', '0'); wheelEl.removeAttribute('aria-hidden'); wheelEl.setAttribute('aria-label', 'Spin the wheel for a fortune');
wheelEl.addEventListener('click', spinWheel);
wheelEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); spinWheel(); } });
var swipeStart = null;
wheelEl.addEventListener('touchstart', function (e) { var t = e.touches[0]; swipeStart = { x: t.clientX, y: t.clientY }; }, { passive: true });
wheelEl.addEventListener('touchend', function (e) {
if (!swipeStart) return; var t = e.changedTouches[0];
if (Math.abs(t.clientX - swipeStart.x) > 24 || Math.abs(t.clientY - swipeStart.y) > 24) { e.preventDefault(); spinWheel(); }
swipeStart = null;
});
}
var rouletteToggleBtn = $('rouletteToggleBtn');
rouletteBtnHome = rouletteToggleBtn ? rouletteToggleBtn.parentNode : null;
placeRouletteBtn();
function closeMobileRoulette() {
gcRoot.classList.remove('mobile-roulette-open');
if (rouletteToggleBtn) {
rouletteToggleBtn.classList.remove('open');
rouletteToggleBtn.setAttribute('aria-label', 'Gypsy Roulette — coming soon');
}
}
if (rouletteToggleBtn) {
rouletteToggleBtn.onclick = function () {
closeGif();
if (grOpen()) closeGameRoom();
if (gcRoot.classList.contains('mobile-threads-open')) threadToggleBtn.click();
if (gcRoot.classList.contains('leaderboard-open')) closeLeaderboard();
if (gcRoot.classList.contains('admin-open')) closeAdminPanel();
/* Same fix as the threads toggle above: capture the scroll position before the class that
   hides .win is applied, not after -- otherwise it always records 0 and "back to chat" always
   lands at the top. */
var opening = !gcRoot.classList.contains('mobile-roulette-open');
if (opening) rememberChatScroll();
var open = gcRoot.classList.toggle('mobile-roulette-open');
rouletteToggleBtn.classList.toggle('open', open);
rouletteToggleBtn.setAttribute('aria-label', open ? 'Back to chat' : 'Gypsy Roulette — coming soon');
if (!open) returnToChat();
};
}
if ($('rouletteBack')) $('rouletteBack').onclick = function () { closeMobileRoulette(); returnToChat(); };
/* unlike the threads bubble this one needs no account, so it is live from the sign-on screen --
   the same as the side panel, which visitors already see before they enter */
if (rouletteToggleBtn) rouletteToggleBtn.classList.add('ready');

/* ---------- leaderboard: same full-page takeover as threads/roulette, but with no floating
   toggle bubble of its own -- #leaderboardBtn (inside .win's status popover) stays exactly where
   it already lives and only ever opens the panel. Since opening hides .win (and therefore the
   button) the same way it hides it for threads/roulette, leaderboardBack is the only way back. */
function closeLeaderboard() {
if (!gcRoot.classList.contains('leaderboard-open')) return;
gcRoot.classList.remove('leaderboard-open');
returnToChat();
}
if (leaderboardBtn) {
leaderboardBtn.onclick = function () {
closeGif();
if (grOpen()) closeGameRoom();
if (gcRoot.classList.contains('mobile-threads-open')) threadToggleBtn.click();
if (gcRoot.classList.contains('mobile-roulette-open')) closeMobileRoulette();
if (gcRoot.classList.contains('admin-open')) closeAdminPanel();
rememberChatScroll();
gcRoot.classList.add('leaderboard-open');
showLeaderboardTab(activeLeaderboardTab()); // reopen on whichever ladder was showing
};
}
if (leaderboardBack) leaderboardBack.onclick = closeLeaderboard;

/* ---------- v121: first-run orientation ----------
   Four tips, once per device, a moment after the first sign-on: where the name menu is, what "/"
   does in the composer, where the Threads board is, and where XP comes from. Each is a small
   bubble beside the thing it describes with that thing outlined; Skip or Got it ends it and it
   never shows again.

   The order walks the room before it walks away from it -- who is here, how to talk to them, then
   the two places that are not this screen. The Threads tip (v139) was the gap: the board is the
   single biggest thing in here that a new arrival could miss entirely, because the only way in is
   one small button, and nothing in the chat itself hints that a second room exists. The chat log
   does print a line about it on arrival, but a line in a log scrolls away; this doesn't.

   #threadToggleBtn is the right anchor at both widths even though it is a different-looking
   control in each -- a bare glyph in the title bar on a desktop, a floating bubble on a phone --
   because it is the same element either way, wherever placeThreadBtn() has just put it, and
   showTourStep() measures the anchor live rather than trusting a remembered position. */
var TOUR = [
{ sel: '#users', text: 'Tap any name — in this list or in the chat — to whisper them, add them as a friend, or challenge them to a game.' },
{ sel: '#msg', text: 'Type / in the box for sounds and commands: /slap, /kiss, /fart, /help and more. Type @ to mention someone.' },
{ sel: '#threadToggleBtn', text: 'This opens the Threads board: posts and pictures that stay put on a page of their own, instead of scrolling away like the chat does. The same button brings you back here.' },
{ sel: '#leaderboardBtn', text: 'You earn XP when people react to what you say and when you win games in whispers. Tap a level badge for the details; the Popularity Contest shows every ladder.' }
];
var tourEl = null, tourStep = 0;
function startTour() {
try { if (localStorage.getItem('gc_tour_seen') === '1') return; } catch (e) {}
tourStep = 0; showTourStep();
}
function endTour() {
if (tourEl) tourEl.remove(); tourEl = null;
document.querySelectorAll('.tour-hi').forEach(function (el) { el.classList.remove('tour-hi'); });
try { localStorage.setItem('gc_tour_seen', '1'); } catch (e) {}
}
function showTourStep() {
document.querySelectorAll('.tour-hi').forEach(function (el) { el.classList.remove('tour-hi'); });
var step = TOUR[tourStep]; if (!step || !me) { endTour(); return; }
var a = document.querySelector(step.sel);
if (!a || !a.getBoundingClientRect().width) { tourStep++; showTourStep(); return; }
if (!tourEl) { tourEl = document.createElement('div'); tourEl.className = 'tour'; tourEl.setAttribute('role', 'dialog'); document.body.appendChild(tourEl); }
tourEl.innerHTML = '<div class="tour-n">Tip ' + (tourStep + 1) + ' of ' + TOUR.length + '</div><div class="tour-t">' + esc(step.text) + '</div>'
+ '<div class="tour-b"><button type="button" class="btn tour-skip">Skip</button><button type="button" class="btn tour-next">' + (tourStep === TOUR.length - 1 ? 'Got it' : 'Next') + '</button></div>';
a.classList.add('tour-hi');
var r = a.getBoundingClientRect(), w = Math.min(280, window.innerWidth - 16);
tourEl.style.width = w + 'px';
tourEl.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) + 'px';
var h = tourEl.offsetHeight, top = r.top - h - 10;
if (top < 8) top = Math.min(r.bottom + 10, window.innerHeight - h - 8);
tourEl.style.top = top + 'px';
tourEl.querySelector('.tour-skip').onclick = endTour;
tourEl.querySelector('.tour-next').onclick = function () { tourStep++; showTourStep(); };
}

/* ---------- v121: the phone's back button closes panels instead of leaving the site ----------
   Every full-screen takeover (threads board, roulette page, Popularity Contest, admin reports,
   and the expanded Messages tray on a phone) pushes one history entry when it opens. Pressing
   the system back button then pops that entry and closes the panel, instead of navigating away
   from the room (or out of the installed app). Closing a panel by its own button drops the
   entry again so back never has a stale one to eat. Watching gcRoot's class list means no
   open/close site above needs to know about any of this. */
var panelStack = [], ignorePop = false;
var PANEL_CLOSERS = {
'leaderboard-open': function () { closeLeaderboard(); },
'admin-open': function () { closeAdminPanel(); },
'mobile-threads-open': function () { if (threadToggleBtn) threadToggleBtn.click(); },
'mobile-roulette-open': function () { closeMobileRoulette(); returnToChat(); },
'gameroom-open': function () { closeGameRoom(); },
'dm-open': function () { dockOpen = false; saveDockOpen(); syncDock(); }
};
function panelOpened(name) {
if (panelStack.some(function (p) { return p.name === name; })) return;
panelStack.push({ name: name });
try { history.pushState({ gcPanel: name }, ''); } catch (e) {}
}
function panelClosed(name) {
var i = -1; panelStack.forEach(function (p, k) { if (p.name === name) i = k; }); if (i < 0) return;
panelStack.splice(i, 1);
if (history.state && history.state.gcPanel === name) { ignorePop = true; try { history.back(); } catch (e) { ignorePop = false; } }
}
window.addEventListener('popstate', function () {
if (ignorePop) { ignorePop = false; return; }
var top = panelStack.pop(); if (!top) return;
var fn = PANEL_CLOSERS[top.name]; if (fn) fn();
});
if (gcRoot && window.MutationObserver) {
var lastPanelState = {};
new MutationObserver(function () {
setTimeout(placeNewPill, 0);
Object.keys(PANEL_CLOSERS).forEach(function (name) {
var on = gcRoot.classList.contains(name);
if (name === 'dm-open' && on && !window.matchMedia('(max-width:500px)').matches) on = false; // desktop tray is a corner panel, not a takeover
if (on === !!lastPanelState[name]) return;
lastPanelState[name] = on;
if (on) panelOpened(name); else panelClosed(name);
});
}).observe(gcRoot, { attributes: true, attributeFilter: ['class'] });
}

/* ---------- the Ballot Box (anonymous notes) ----------
   The panel in the right-hand gutter of the wide desktop layout (#ballotPanel; see .ballot-panel
   in style.css for where and when it shows). Anyone signed in can drop a 140-character note in
   with no name attached; every note in the box takes a turn scrolling across the parchment strip
   at the bottom of the panel, 15 seconds each, newest first, round and round.
   Storage is ballot_notes (ballot_box_feature.sql). The client only ever asks for id/created_at/
   body -- author_id exists for moderation but the API refuses to hand it out -- and the table is
   deliberately not on realtime (a change payload would carry that column), so the box is re-read
   once a minute instead. At one note per 15s on screen that's more than fresh enough. */
var ballotPanel = $('ballotPanel'), ballotBody = $('ballotBody'), ballotCast = $('ballotCast'), ballotCount = $('ballotCount');
var ballotNote = $('ballotNote'), ballotText = $('ballotText'), ballotStrip = $('ballotStrip'), ballotRemove = $('ballotRemove'), ballotBox = $('ballotBox');
var ballotNotes = [], ballotIdx = -1, ballotShowing = null, ballotTimer = null;
var BALLOT_EMPTY = 'The box is empty. Be the first to drop a note in.', BALLOT_MAX = 140;
/* @Name inside a note: same matching as chat mentions (mentionableNames -- longest name first,
   word-boundary guarded), but each hit is rendered as the same tappable .who element a name is
   everywhere else in the room, carrying the id so a tap opens the Get Info / Whisper / Block menu.
   Names that don't resolve to anyone seen recently stay plain text. */
function ballotHtml(body) {
var html = esc(body);
var pool = recentPeopleEntries();
var ids = Object.keys(pool).filter(function (id) { return pool[id] && pool[id].name; })
.sort(function (a, b) { return pool[b].name.length - pool[a].name.length; });
ids.forEach(function (id) {
var n = pool[id].name;
var re = new RegExp('@' + escRe(esc(n)) + '(?![\\w-])', 'g');
html = html.replace(re, '<b class="who mention" data-id="' + esc(id) + '" data-name="' + esc(n) + '" tabindex="0">@' + esc(n) + '</b>');
});
return html;
}
/* a tap on a tagged name, on either layout's parchment */
function ballotTagClick(e) {
var who = e.target.closest('.who[data-id]'); if (!who) return false;
if (who.dataset.id === (me && me.id)) return true;
e.stopPropagation(); openMenu(who.dataset.id, who, who.dataset.name); return true;
}
/* Puts a note on the desktop strip and restarts its crossing from the right edge, so a swap never
   lands mid-scroll. animationiteration (below) is what calls for the next note each time a
   crossing completes -- 15s, the animation's own duration in style.css. */
function setStrip(html) {
if (!ballotText) return;
ballotText.innerHTML = html;
ballotText.style.animation = 'none'; void ballotText.offsetWidth; ballotText.style.animation = '';
}
function nextBallotNote() {
if (!ballotNotes.length) { ballotShowing = null; ballotIdx = -1; return null; }
ballotIdx = (ballotIdx + 1) % ballotNotes.length; ballotShowing = ballotNotes[ballotIdx]; return ballotShowing;
}
function showBallotNote() {
var n = nextBallotNote();
setStrip(n ? ballotHtml(n.body) : esc(BALLOT_EMPTY));
if (ballotRemove) ballotRemove.classList.toggle('hidden', !(isAdmin && ballotShowing));
}
if (ballotText) ballotText.addEventListener('animationiteration', showBallotNote);
if (ballotStrip) {
/* reading a long one? hovering the strip holds it still */
ballotStrip.addEventListener('mouseenter', function () { ballotStrip.classList.add('paused'); });
ballotStrip.addEventListener('mouseleave', function () { ballotStrip.classList.remove('paused'); });
ballotStrip.addEventListener('click', ballotTagClick);
ballotStrip.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.who[data-id]')) { e.preventDefault(); ballotTagClick(e); } });
}
async function loadBallot() {
if (!sb || !me) return;
var r = await sb.from('ballot_notes').select('id,created_at,body').gt('created_at', new Date(Date.now() - 3600000).toISOString()).order('created_at', { ascending: false }).limit(60); // notes live one hour (hardening_2026_09_17.sql)
if (r.error) { console.warn('ballot box:', r.error.message); return; }
var wasEmpty = !ballotNotes.length;
ballotNotes = r.data || [];
/* First fill (or the box going from empty to not): start the desktop rotation right away rather
   than letting the "box is empty" line finish its crossing. Otherwise the refreshed list just
   takes over from the next crossing on; ballotIdx keeps counting modulo whatever the new length
   is. (The phone scroll runs its own once-a-minute clock -- see showMobileNote -- off the same
   list and index.) */
if (wasEmpty || !ballotNotes.length) { ballotIdx = -1; showBallotNote(); }
}
function startBallot() {
if (ballotPanel) ballotPanel.classList.remove('hidden');
/* v123: the parchment header strip (#ballotStrip) stays hidden -- the phone-style unrolling scroll
   over the log shows notes on every width now, by request (the strip was liked less). */
loadBallot();
clearInterval(ballotTimer); ballotTimer = setInterval(loadBallot, 60000);
startMobileBallot();
}
function stopBallot() {
clearInterval(ballotTimer); ballotTimer = null;
ballotNotes = []; ballotIdx = -1; ballotShowing = null;
if (ballotPanel) ballotPanel.classList.add('hidden');
if (ballotStrip) ballotStrip.classList.add('hidden');
stopMobileBallot();
}
function setBallotNote(text, isErr) { if (!ballotNote) return; ballotNote.textContent = text || ''; ballotNote.classList.toggle('err', !!isErr); }
function updateBallotCount() {
if (!ballotCount || !ballotBody) return;
var left = BALLOT_MAX - ballotBody.value.length;
ballotCount.textContent = String(left); ballotCount.classList.toggle('low', left < 20);
}
/* Writes a note to the box. Shared by the desktop panel's composer and the phone's prompt dialog.
   Resolves to { ok, note } or { ok:false, message }. On success, any @Name in it that resolves to
   someone recently seen (not yourself) is recorded in ballot_tags -- the database refuses the row
   once that person has been tagged 10 times in the hour -- and each accepted tag sends them a
   push that says only that someone tagged them, never who. */
async function castBallotText(t) {
t = String(t || '').trim(); if (!t || !me) return { ok: false, message: '' };
if (t.length > BALLOT_MAX) t = t.slice(0, BALLOT_MAX);
/* author_id is the only identifying thing written, and only the database ever sees it again;
   .select() names its columns so the returned row stays inside what the API allows us to read */
var r = await sb.from('ballot_notes').insert({ author_id: me.id, body: t }).select('id,created_at,body').single();
if (r.error) {
/* the insert policy is also the rate limit (one a minute) and the ban check, both of which come
   back as a bare row-level-security refusal */
return { ok: false, message: /row-level security|policy/i.test(r.error.message) ? 'One note a minute — give it a moment.' : 'The box wouldn’t take it: ' + r.error.message };
}
if (r.data) { ballotNotes.unshift(r.data); ballotIdx = -1; showBallotNote(); } // your own note takes the strip next
var tagged = mentionedUserIds(t);
if (r.data && tagged.length) {
tagged.forEach(function (id) {
sb.from('ballot_tags').insert({ note_id: r.data.id, tagged_id: id }).then(function (tr) {
if (tr.error) return; // over their hourly cap (or some other refusal): no push, quietly
triggerPush(id, 'The Ballot Box', 'Someone tagged you in an anonymous note.', 'gc-ballot-tag');
});
});
}
return { ok: true, note: r.data };
}
async function castBallot() {
if (!me || !ballotBody) return;
var t = ballotBody.value.trim(); if (!t) return;
ballotCast.disabled = true; setBallotNote('');
var res = await castBallotText(t);
ballotCast.disabled = false;
if (!res.ok) { if (res.message) setBallotNote(res.message, true); return; }
ballotBody.value = ''; updateBallotCount();
if (ballotBox) { ballotBox.classList.remove('casting'); void ballotBox.offsetWidth; ballotBox.classList.add('casting'); }
setBallotNote('Your note is in the box.');
setTimeout(function () { if (ballotNote && ballotNote.textContent === 'Your note is in the box.') setBallotNote(''); }, 6000);
}
if (ballotCast) ballotCast.onclick = castBallot;
if (ballotBody) {
ballotBody.addEventListener('input', updateBallotCount);
attachMentions(ballotBody);
ballotBody.onkeydown = function (e) { if (mentionKeydown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); castBallot(); } };
}
/* admin: pull the note that's on the strip right now out of the box (both layouts share this) */
async function removeBallotNote(gone) {
if (!isAdmin || !gone) return false;
var r = await sb.from('ballot_notes').delete().eq('id', gone.id);
if (r.error) { setBallotNote('Could not remove it: ' + r.error.message, true); return false; }
ballotNotes = ballotNotes.filter(function (n) { return n.id !== gone.id; });
ballotIdx = Math.max(-1, ballotIdx - 1);
return true;
}
if (ballotRemove) ballotRemove.onclick = async function () { if (await removeBallotNote(ballotShowing)) showBallotNote(); };

/* ---------- the Ballot Box on a phone (and any screen without the gutter panel) ----------
   No gutter to keep a panel in, so the box becomes a scroll: a rolled-up parchment tucked into the
   top-right corner of the chat log (#ballotMobile, .bp-mscroll in style.css). Every 15 seconds it
   unrolls across the top of the log, one note glides over it (or just sits there if it's short
   enough to fit), and it rolls itself back up out of the way -- on screen for roughly ten seconds
   in sixty. The first note comes a few seconds after signing on rather than a full minute later.
   Tap the open parchment to hold it (tap again to let it go); tap the rolled-up end to peek at
   the last note now. Casting from here goes through the 📜 button (#ballotBtn -- in the "..." menu
   on a phone) and the prompt dialog. */
var ballotMobile = $('ballotMobile'), ballotMobileText = $('ballotMobileText'), ballotMobileParch = $('ballotMobileParch');
var ballotMobileRoller = $('ballotMobileRoller'), ballotMobileRemove = $('ballotMobileRemove'), ballotBtn = $('ballotBtn');
var mobileBallotTimer = null, mobileBallotHide = null, mobileBallotHeld = false, mobileBallotShowing = null;
var MOBILE_BALLOT_EVERY = 15000, MOBILE_BALLOT_FIRST = 5000, MOBILE_BALLOT_HOLD = 6000, MOBILE_BALLOT_GLIDE_PX_PER_S = 45;
function mobileBallotActive() { return !!ballotMobile; } // v123: the unrolling scroll is the one note display on every width now (the parchment header strip is retired)
function rollUpMobileBallot() {
clearTimeout(mobileBallotHide); mobileBallotHide = null;
if (!ballotMobile) return;
ballotMobile.classList.remove('open', 'held');
mobileBallotHeld = false;
if (ballotMobileText) { ballotMobileText.style.animation = ''; ballotMobileText.style.animationPlayState = ''; }
}
/* Unroll, show `note` (or the "empty" line), and schedule the roll-up -- unless held. */
/* byTap: the scroll unrolls on its own every 15 s as well as when somebody taps the rolled-up
   end, and only the tap should make a sound. The timed unroll was announcing itself over and
   over to a reader who never asked for it -- a notification for something that is not news.
   v141: the 60 s throttle that used to take the edge off that is gone with it; a tap is a
   deliberate act and should sound every single time, however often it comes. */
function showMobileNote(note, byTap) {
if (!ballotMobile || !ballotMobileText) return;
mobileBallotShowing = note || null;
ballotMobileText.innerHTML = note ? ballotHtml(note.body) : esc(BALLOT_EMPTY);
ballotMobileText.style.animation = 'none'; ballotMobileText.style.animationPlayState = '';
if (ballotMobileRemove) ballotMobileRemove.classList.toggle('hidden', !(isAdmin && note));
clearTimeout(mobileBallotHide);
ballotMobile.classList.add('open');
if (byTap && note && !document.hidden) playSound('unroll'); // v141: tap only -- see byTap above
/* once unrolled (transition in style.css, ~.5s), decide whether the text needs to glide */
mobileBallotHide = setTimeout(function () {
var room = ballotMobileParch ? ballotMobileParch.clientWidth - 24 : 0;
var need = ballotMobileText.scrollWidth;
var hold = MOBILE_BALLOT_HOLD;
if (need > room && room > 0) {
var dist = need - room + 24, secs = Math.max(4, dist / MOBILE_BALLOT_GLIDE_PX_PER_S);
ballotMobileText.style.setProperty('--bp-glide', '-' + dist + 'px');
ballotMobileText.style.animation = 'bp-mglide ' + secs + 's linear 1s 1 forwards';
hold = (secs + 1) * 1000 + 2500;
}
mobileBallotHide = setTimeout(function () { if (!mobileBallotHeld) rollUpMobileBallot(); }, hold);
}, 550);
}
function tickMobileBallot() {
if (!mobileBallotActive() || mobileBallotHeld) return;
if (ballotMobile && ballotMobile.classList.contains('open')) return; // a long note still crossing keeps its turn; next tick
showMobileNote(nextBallotNote());
}
function startMobileBallot() {
if (!ballotMobile) return;
ballotMobile.classList.remove('hidden');
clearInterval(mobileBallotTimer);
setTimeout(tickMobileBallot, MOBILE_BALLOT_FIRST);
mobileBallotTimer = setInterval(tickMobileBallot, MOBILE_BALLOT_EVERY);
}
function stopMobileBallot() {
clearInterval(mobileBallotTimer); mobileBallotTimer = null;
rollUpMobileBallot();
if (ballotMobile) ballotMobile.classList.add('hidden');
}
if (ballotMobileParch) ballotMobileParch.addEventListener('click', function (e) {
if (ballotTagClick(e)) return;
if (e.target.closest('.bp-remove')) return;
/* tap to hold, tap again to let it roll up */
if (mobileBallotHeld) { rollUpMobileBallot(); return; }
mobileBallotHeld = true; ballotMobile.classList.add('held'); clearTimeout(mobileBallotHide);
if (ballotMobileText) ballotMobileText.style.animationPlayState = 'paused';
});
if (ballotMobileRoller) ballotMobileRoller.onclick = function () {
if (ballotMobile.classList.contains('open')) { rollUpMobileBallot(); return; }
showMobileNote(mobileBallotShowing || nextBallotNote(), true); // a tap: this one sounds
};
if (ballotMobileRemove) ballotMobileRemove.onclick = async function (e) {
e.stopPropagation();
if (await removeBallotNote(mobileBallotShowing)) rollUpMobileBallot();
};
/* the 📜 button: a note by way of the prompt dialog, with the same @autocomplete as the composer */
if (ballotBtn) ballotBtn.onclick = async function () {
closeMoreMenu();
var t = await showPromptModal('Drop a note in the box', { placeholder: 'No name goes on it. @ someone to tag them.', maxLength: BALLOT_MAX, mentions: true });
if (t === null || !t.trim()) return;
var res = await castBallotText(t);
if (!res.ok) { if (res.message) addSys(res.message); return; }
addSys('Your note is in the box.');
if (mobileBallotActive() && res.note) showMobileNote(res.note);
};

/* ---------- draggable / sweepable fab bubbles ----------
   Either bubble can be dragged anywhere on screen, and dragged most of the way off the left or
   right edge to sweep it out of the way -- only a small tab is left peeking in from that edge,
   and tapping the tab brings the whole bubble back to right where it was. The two bubbles are
   independent of one another: moving or sweeping one never touches the other's position.
   Position (and docked/undocked state) is remembered per browser, the same way the Online/
   Friends panel's size is above -- one localStorage key per bubble (gc_fab_thread /
   gc_fab_roulette).

   Positioning strategy: until the very first drag, a bubble is left entirely alone -- it keeps
   whatever position the stylesheet gives it (including the "centred as a pair" rule at the
   bottom of style.css). The first pointerdown that turns into an actual drag switches it to
   inline left/top, with right/bottom/transform cleared so nothing in the stylesheet can fight
   the JS-driven position (an explicit inline style always wins over a stylesheet rule, media
   queries included). From that point on this bubble is on its own. */
/* desktopFixed: opt-in for a bubble that should behave like a normal, click-only, CSS-positioned
   button above the mobile breakpoint (500px) -- used by the Threads toggle now that it lives in a
   fixed spot near the friend-request bell on desktop instead of floating. Below 500px it's exactly
   the same draggable bubble as ever, unaffected. */
function makeFabDraggable(btn, storageKey, desktopFixed) {
if (!btn) return;
var SIZE = 46, TAB = 14, MARGIN = 6, DOCK_FRACTION = 0.55;
var dragging = false, moved = false, docked = false, edge = null;
var startX = 0, startY = 0, startLeft = 0, startTop = 0;
var freeX = null, freeY = null; // last undocked position -- what a tap on the docked tab restores
var savedLabel = null; // aria-label at the moment of docking (the toggle handlers keep this current while undocked, e.g. "Open threads board" vs "Back to chat"), restored verbatim on undock

function clampFree(x, y) {
var maxX = window.innerWidth - SIZE - MARGIN, maxY = window.innerHeight - SIZE - MARGIN;
return { x: Math.max(MARGIN, Math.min(maxX, x)), y: Math.max(MARGIN, Math.min(maxY, y)) };
}
function applyPos(x, y) {
btn.style.left = x + 'px'; btn.style.top = y + 'px';
btn.style.right = 'auto'; btn.style.bottom = 'auto'; btn.style.transform = 'none';
}
function save() {
try { localStorage.setItem(storageKey, JSON.stringify({ x: freeX, y: freeY, docked: docked, edge: edge })); } catch (e) {}
}
function setFree(x, y, skipSave) {
var c = clampFree(x, y);
docked = false; edge = null; freeX = c.x; freeY = c.y;
applyPos(c.x, c.y);
btn.classList.remove('fab-docked');
if (savedLabel) { btn.setAttribute('aria-label', savedLabel); savedLabel = null; }
if (!skipSave) save();
}
function setDocked(which, y, skipSave) {
if (!docked) savedLabel = btn.getAttribute('aria-label'); // capture the live label once, not on every reflow
docked = true; edge = which;
var cy = clampFree(0, y).y;
applyPos(which === 'left' ? -(SIZE - TAB) : window.innerWidth - TAB, cy);
btn.classList.add('fab-docked');
btn.setAttribute('aria-label', 'Bring back the ' + (storageKey.indexOf('roulette') >= 0 ? 'roulette' : storageKey.indexOf('gameroom') >= 0 ? 'Game Room' : 'threads') + ' button');
if (!skipSave) save();
}

btn.addEventListener('pointerdown', function (e) {
if (e.isPrimary === false) return;
if (desktopFixed && window.innerWidth > 500) return; // desktop: fixed button, no drag-to-move
var r = btn.getBoundingClientRect();
startX = e.clientX; startY = e.clientY; startLeft = r.left; startTop = r.top;
moved = false; dragging = true;
try { btn.setPointerCapture(e.pointerId); } catch (err) {}
});
btn.addEventListener('pointermove', function (e) {
if (!dragging) return;
var dx = e.clientX - startX, dy = e.clientY - startY;
if (!moved) {
if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
moved = true; btn.classList.add('fab-dragging');
}
e.preventDefault();
var x = Math.max(-SIZE, Math.min(window.innerWidth, startLeft + dx));
var y = Math.max(MARGIN, Math.min(window.innerHeight - SIZE - MARGIN, startTop + dy));
applyPos(x, y);
});
function endDrag(e) {
if (!dragging) return;
dragging = false;
try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
btn.classList.remove('fab-dragging');
if (!moved) return; // a plain tap -- the click handler below decides what that means
var r = btn.getBoundingClientRect();
if (r.left <= -(SIZE * DOCK_FRACTION)) setDocked('left', r.top);
else if (r.right >= window.innerWidth + SIZE * DOCK_FRACTION) setDocked('right', r.top);
else setFree(r.left, r.top);
}
btn.addEventListener('pointerup', endDrag);
btn.addEventListener('pointercancel', endDrag);

/* The click that follows a drag's pointerup has to be told apart from a genuine tap: swallow
   it once (and reset) when this gesture just moved the bubble, and treat a tap on an already-
   docked tab as "bring it back" instead of running the normal open/close toggle. Wrapping the
   existing onclick (rather than adding a second listener) sidesteps any question of which
   listener on the same element would run first. */
var originalClick = btn.onclick;
btn.onclick = function (e) {
if (moved) { moved = false; return; }
if (docked) { setFree(freeX != null ? freeX : startLeft, freeY != null ? freeY : startTop); return; }
if (originalClick) originalClick.call(btn, e);
};

function reflow() {
if (desktopFixed && window.innerWidth > 500) return; // desktop: leave the CSS-fixed position alone
if (docked) setDocked(edge, btn.getBoundingClientRect().top, true);
else if (freeX != null) setFree(freeX, freeY, true);
}
window.addEventListener('resize', reflow);

try {
if (!desktopFixed || window.innerWidth <= 500) { // desktop: never restore an old dragged-on-mobile spot
var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
freeX = saved.x; freeY = saved.y;
if (saved.docked) setDocked(saved.edge === 'right' ? 'right' : 'left', saved.y, true);
else setFree(saved.x, saved.y, true);
}
}
} catch (e) {}
}
makeFabDraggable(threadToggleBtn, 'gc_fab_thread', true);
makeFabDraggable(rouletteToggleBtn, 'gc_fab_roulette');

/* ---------- saving an anonymous character with an email ----------
   An anonymous account is only ever as durable as this browser's localStorage: a different
   device, a private window, or a cleared history means a brand new account id, which is why
   friends and names appeared to evaporate. Supabase can upgrade an anonymous user in place --
   the id, the claimed name, the friends rows and the whisper history all stay exactly as they
   are, and an email plus password gets bolted on so the same account can be reached from
   anywhere. Nothing is migrated or copied; it is the same row in auth.users.

   The email is only ever a way back in. It is not written to profiles, not put into presence,
   and not attached to messages, so no other player can see it or look it up. */
var isAnonAccount = false;

function saveErr(t) { var e = $('saveErr'); if (e) { e.textContent = t || ''; e.classList.toggle('shown', !!t); } }

function openSaveAccount() {
if (!me || !sb) return;
var nm = $('saveName'); if (nm) nm.textContent = me.name;
$('saveEmail').value = ''; $('savePassword').value = ''; $('savePassword2').value = '';
saveErr('');
$('saveOverlay').classList.remove('hidden');
autoFocus($('saveEmail'));
}
function closeSaveAccount() { $('saveOverlay').classList.add('hidden'); }

async function doSaveAccount() {
var email = $('saveEmail').value.trim();
var pw = $('savePassword').value, pw2 = $('savePassword2').value;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { saveErr('That does not look like an email address.'); return; }
if (pw.length < 6) { saveErr('Use a password of at least 6 characters.'); return; }
if (pw !== pw2) { saveErr('The two passwords do not match.'); return; }
var btn = $('saveGo'); btn.disabled = true; saveErr('');
try {
var r = await sb.auth.updateUser({ email: email, password: pw });
if (r.error) throw r.error;
/* With "Confirm email" on, Supabase holds the address in new_email and only attaches it once
   the link is clicked; the password is set either way. Report whichever actually happened
   rather than promising a confirmation mail that may not be on. */
var u = r.data && r.data.user;
var pending = !!(u && u.new_email) && !(u && u.email);
closeSaveAccount();
if (pending) {
addSys('Almost there — check ' + email + ' and click the confirmation link. Until you do, ' + me.name + ' still lives only in this browser.');
} else {
addSys('Saved. ' + me.name + ' is yours for good now — sign in with ' + email + ' on any device to come back as yourself, friends list and all.');
isAnonAccount = false;
if ($('saveBtn')) $('saveBtn').classList.add('hidden');
}
} catch (e) {
var m = (e && e.message) || 'Could not save your character.';
if (/rate limit|too many|429/i.test(m)) m = 'The confirmation mailer is busy right now — wait a few minutes and try again.';
else if (/already been registered|already registered|already exists/i.test(m)) m = 'That email is already attached to another character. Sign in with it instead.';
saveErr(m);
} finally { btn.disabled = false; }
}

if ($('saveBtn')) $('saveBtn').onclick = openSaveAccount;
if ($('saveCancel')) $('saveCancel').onclick = closeSaveAccount;
if ($('saveGo')) $('saveGo').onclick = doSaveAccount;
if ($('saveOverlay')) $('saveOverlay').onclick = function (e) { if (e.target === $('saveOverlay')) closeSaveAccount(); };
if ($('savePassword2')) $('savePassword2').onkeydown = function (e) { if (e.key === 'Enter') doSaveAccount(); };

/* ---------- sign on ---------- */
var emailMode = false;

/* ---------- pinned identity for returning visitors ----------
   The anonymous Supabase session is kept in localStorage, so closing the tab -- or the whole
   browser -- does not end it: the same person comes back as the same account id, and the
   server never times these sessions out. What used to drift was the NAME. The sign-on box let
   you type a fresh one every visit and join() wrote it straight over the account's display
   name, so one account could be "LoneBadger36" one night and "111" the next.

   That is what broke friends lists. A friend is stored as an account id plus a snapshot of the
   name at the moment they were added, and the list shows the person's CURRENT name when
   they're online. So a regular who came back under a new name appeared in everyone's buddy
   list as a stranger, and the person they'd added looked like they'd disappeared.

   So: once this device holds a session with a claimed name, that name IS the identity. The
   field is filled in and locked, and "Use a different name" is the deliberate way out.
   (What this cannot fix is a different browser, a private window, or cleared site data --
   there is no session to find there, so anonymous auth hands out a brand new account. Same
   human, different id, and friendships genuinely don't carry across.) */
var lockedName = null;

function unlockName() {
lockedName = null;
var sn = $('sn');
sn.readOnly = false; sn.value = ''; sn.classList.remove('locked');
$('join').textContent = emailMode ? 'Sign in' : 'Enter the room';
if ($('snNote')) $('snNote').classList.add('hidden');
autoFocus(sn);
}

async function restoreIdentity() {
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0 || !window.supabase) return;
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
var s = await sb.auth.getSession(); // reads localStorage only -- never creates an account
var user = s.data.session && s.data.session.user;
if (!user) return;
/* v122: "Remember me on this device" unticked at the last sign-on means: never auto-enter.
   An email account is signed out here so the password is asked again; an anonymous character
   has nowhere else to live, so its session stays and the screen offers "Enter as X" instead. */
var remember = true; try { remember = localStorage.getItem('gc_remember') !== '0'; } catch (e) {}
if ($('rememberMe')) $('rememberMe').checked = remember;
var isEmailUser = user.is_anonymous === false || !!user.email;
if (!remember && isEmailUser) { try { await sb.auth.signOut(); } catch (e) {} return; }
var p = await sb.from('profiles').select('name').eq('user_id', user.id).maybeSingle();
var n = p.data && p.data.name;
if (!n) return;
lockedName = n;
var sn = $('sn');
sn.value = n; sn.readOnly = true; sn.classList.add('locked');
if (!emailMode) $('join').textContent = 'Enter as ' + n;
if ($('snNote')) $('snNote').classList.remove('hidden');
if (!remember) return; // the character is remembered, entering the room is not
/* Reconnect straight into the room instead of leaving a returning visitor sitting on the
   login screen every time they refresh. A device that reaches this point already has a
   session AND a claimed name, which only happens after successfully joining at least once
   before -- the invite key and the Turnstile check exist to gate a NEW identity into the room,
   not to re-prove an already-vetted one on every page load (see the "resuming" branches in
   join() for the matching client/server-side skips). The login form is hidden rather than
   removed, so if the resume attempt below fails for any reason -- an expired session, a network
   hiccup -- join()'s own catch block re-shows it (see the check right after the call) with the
   real error message already sitting in #err, and the ordinary manual sign-on still works. */
var joinFields = $('joinFields'), tag = $('loginTag');
if (joinFields) joinFields.classList.add('hidden');
if (tag) tag.textContent = 'Reconnecting as ' + n + '…';
await join({ resuming: true });
if (!me) {
if (joinFields) joinFields.classList.remove('hidden');
if (tag) tag.textContent = 'Stay awhile, and chat.';
}
} catch (e) { /* first visit, or storage blocked -- fall through to the normal sign-on */ }
}
restoreIdentity().then(function () { if (!me) peekRoom(); });
/* v121: the sign-on screen shows who is already inside. A second, listen-only subscription to
   the room's presence channel (nothing is tracked, so the peeker never shows up in anyone's
   list) -- torn down in join() right before the real channel is created, since supabase-js
   hands back the existing channel object for a topic that is already open. */
var peekChannel = null;
function peekRoom() {
try {
if (me || peekChannel || !C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0 || !window.supabase) return;
var el = $('roomPeek'); if (!el) return;
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
peekChannel = sb.channel('room:' + (C.ROOM || 'main'), { config: { presence: { key: 'peek-' + Math.random().toString(36).slice(2) } } });
peekChannel.on('presence', { event: 'sync' }, function () {
if (!peekChannel) return;
var st = peekChannel.presenceState(), names = [];
Object.keys(st).forEach(function (k) { if (st[k][0] && st[k][0].name) names.push(st[k][0].name); });
var n = names.length;
el.innerHTML = !n ? 'The room is quiet right now — be the first one in.'
: (n === 1 ? '<b>' + esc(names[0]) + '</b> is in the room right now.'
: '<b>' + n + ' people</b> are in the room right now: ' + names.slice(0, 4).map(esc).join(', ') + (n > 4 ? ' and ' + (n - 4) + ' more' : '') + '.');
el.classList.remove('hidden');
}).subscribe();
} catch (e) { peekChannel = null; }
}
async function stopPeek() { if (!peekChannel) return; var ch = peekChannel; peekChannel = null; try { await sb.removeChannel(ch); } catch (e) {} }

/* ---------- v122: Log out ----------
   Ends the session on this device and returns to the sign-on screen. An email account just
   signs back in later. An anonymous character has no other home, so the dialog says so and
   offers "Save with email" first; going ahead anyway drops the session (the name stays reserved
   30 days, or comes straight back to the same invite key -- see claim_name). */
function openLogout() {
if (!me) return;
var body = $('logoutBody'), saveB = $('logoutSave'), goB = $('logoutGo');
if (isAnonAccount) {
body.innerHTML = '<b>' + esc(me.name) + '</b> lives only in this browser. Log out now and this character, your friends list and your whispers are left behind — unless you save it with an email first.';
saveB.classList.remove('hidden'); goB.textContent = 'Log out anyway';
} else {
body.innerHTML = 'You will be signed out of <b>' + esc(me.name) + '</b> on this device. Sign back in any time with your email and password.';
saveB.classList.add('hidden'); goB.textContent = 'Log out';
}
$('logoutOverlay').classList.remove('hidden');
$('logoutCancel').focus();
}
function closeLogout() { $('logoutOverlay').classList.add('hidden'); }
async function doLogout() {
closeLogout();
var wasAnon = isAnonAccount, name = me && me.name;
playSound('logout');
/* v163: a device you have logged out of stops getting your notifications -- whisper previews
   included -- instead of carrying on until somebody else happens to sign in on it. Only the row
   goes; the browser keeps its subscription, and the next sign-in on this device saves it again
   under whoever that is (gc_save_push_subscription). Done before signOut, while the row is still
   ours to delete. */
try {
var preg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null;
var psub = preg && preg.pushManager ? await preg.pushManager.getSubscription() : null;
if (psub && sb) await sb.from('push_subscriptions').delete().eq('endpoint', psub.endpoint);
} catch (e) {}
leaveRoom('', true);
try { if (sb) await sb.auth.signOut(); } catch (e) { /* the local session is cleared either way */ }
unlockName();
if (wasAnon) { try { localStorage.removeItem('gc_tour_seen'); } catch (e) {} }
else if (!emailMode && adminToggle) adminToggle.click(); // an email account is going to sign back in with email -- open that form
fail('You are logged out' + (name ? ' of ' + name : '') + '.');
if ($('loginTag')) $('loginTag').textContent = 'Stay awhile, and chat.';
peekRoom();
}
if ($('logoutBtn')) $('logoutBtn').onclick = function () { closeMoreMenu(); openLogout(); };
if ($('logoutCancel')) $('logoutCancel').onclick = closeLogout;
if ($('logoutGo')) $('logoutGo').onclick = doLogout;
if ($('logoutSave')) $('logoutSave').onclick = function () { closeLogout(); openSaveAccount(); };
if ($('logoutOverlay')) $('logoutOverlay').onclick = function (e) { if (e.target === $('logoutOverlay')) closeLogout(); };
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('logoutOverlay') && !$('logoutOverlay').classList.contains('hidden')) closeLogout(); });

if ($('snReset')) {
$('snReset').onclick = async function () {
if (!confirm('Start over as a new character?\n\nYou will come back as a brand new person: your friends list and whispers on this device are left behind, and other people’s friends lists will no longer recognise you. "' + lockedName + '" stays yours for 30 days before anyone else can take it.')) return;
try { if (sb) await sb.auth.signOut(); } catch (e) { /* local session is cleared either way */ }
unlockName();
};
}

if (adminToggle) {
adminToggle.onclick = function () {
emailMode = !emailMode;
adminFields.classList.toggle('hidden', !emailMode);
if ($('turnstileWrap')) $('turnstileWrap').classList.toggle('hidden', emailMode);
$('join').textContent = emailMode ? 'Sign in' : (lockedName ? 'Enter as ' + lockedName : 'Enter the room');
adminToggle.textContent = emailMode ? 'Use a character name instead' : 'Sign in with email';
/* Hide the character-name box entirely when signing in with email: that account already has a
   name and it wins after authenticating, so leaving the box on screen (still showing whatever
   this device's anonymous character is called) only suggests you're about to enter as someone
   you're not. This is also the admin route -- admin rights come from the admins table, not from
   which form you used -- so an admin signing in keeps whatever character their account holds. */
if ($('nameFields')) $('nameFields').classList.toggle('hidden', emailMode);
/* The invite key is only asked of the anonymous/character-name path -- an admin's email and
   password already prove who they are, so there's nothing for a key to gate here. */
if (gateFields) gateFields.classList.toggle('hidden', emailMode);
if ($('gateNote')) $('gateNote').classList.toggle('hidden', emailMode);
$('sn').readOnly = !emailMode && !!lockedName;
if ($('snNote')) $('snNote').classList.toggle('hidden', emailMode || !lockedName);
fail('');
autoFocus(emailMode ? adminEmail : (accessCode && !accessCode.value ? accessCode : $('sn')));
};
}
/* Cloudflare Turnstile (join-screen human check): the widget calls these globally-named
   callbacks itself, so they just track the current token in a plain variable for join() to
   read. A verified human still gets muted server-side if the token fails verify-join's
   server-side check -- this is only the client half. */
var turnstileToken = null;
// Must hang off window: the widget looks these callback names up in the GLOBAL scope (it has
// no idea this script is wrapped in an IIFE), so plain function declarations here would be
// invisible to it and the token would never get set.
window.onTurnstileSuccess = function (token) { turnstileToken = token; };
window.onTurnstileExpired = function () { turnstileToken = null; };
/* Picks a random "AdjectiveNoun##" name for anyone who leaves the character-name field blank
   (either sign-on path) — never derived from their email or anything else identifying. */
function randomName() {
var adjs = ['Shadow', 'Crimson', 'Silent', 'Rogue', 'Mystic', 'Iron', 'Velvet', 'Wild', 'Lucky', 'Dusky', 'Feral', 'Hollow', 'Ember', 'Frost', 'Wicked', 'Gilded', 'Rusty', 'Grim', 'Lone', 'Sly'];
var nouns = ['Fox', 'Wolf', 'Raven', 'Ghost', 'Viper', 'Hawk', 'Panther', 'Crow', 'Lynx', 'Shark', 'Falcon', 'Cobra', 'Wraith', 'Tiger', 'Owl', 'Jackal', 'Badger', 'Moth', 'Wasp', 'Stag'];
var a = adjs[Math.floor(Math.random() * adjs.length)];
var b = nouns[Math.floor(Math.random() * nouns.length)];
var num = Math.floor(Math.random() * 90) + 10;
return (a + b + num).slice(0, 16);
}
var joinInFlight = false;
async function join(opts) {
opts = opts || {};
/* v130: one join at a time. The button is disabled below, but Enter/"Go" on any sign-on field
   also calls join(), and a second call two seconds into the first re-sent the same single-use
   Turnstile token -- which siteverify refused, and (until verify-join was changed today) that
   refusal permanently muted a brand-new account before its first join had even finished. */
if (joinInFlight) return;
joinInFlight = true;
try { await joinInner(opts); } finally { joinInFlight = false; }
}
async function joinInner(opts) {
if (!opts.resuming && $('rememberMe')) { try { localStorage.setItem('gc_remember', $('rememberMe').checked ? '1' : '0'); } catch (e) {} }
/* resuming: called automatically by restoreIdentity() for a device that already holds a
   session and a claimed name, to reconnect on page load/refresh without ever showing the login
   screen. Treated as its own mode rather than just "the non-email path with blanks filled in",
   because it skips two checks that only make sense for actually GAINING entry: the invite key
   and the Turnstile human check. A device that already has a claimed name has, by definition,
   passed both at least once already -- see the comment above the key/Turnstile block below. */
var resuming = !!opts.resuming;
/* A returning visitor re-enters under the name this device already holds -- see
   restoreIdentity() below for why the name is pinned rather than re-typed each visit.
   Email sign-on and an auto-resume are both exempt from reading the character-name box: that
   box is hidden in email mode but can still hold stale/invalid leftover text (e.g. from before
   the "Sign in with email" toggle was clicked), which used to fail the name-format check below
   even though it was never going to be used, and a resume always has a locked name already (see
   restoreIdentity() -- it never calls join({resuming:true}) without one). */
var n = (emailMode || resuming) ? (lockedName || randomName()) : (lockedName || $('sn').value.trim()); fail('');
if (!n) n = randomName();
if (!NAME_RE.test(n)) { fail('2–16 letters (any language), numbers, spaces or . \' -'); return; }
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0) { fail('Backend not configured — edit js/config.js.'); return; }
if (!window.supabase) { fail('Could not load the chat library. Check your connection.'); return; }
var adminEmailVal, adminPasswordVal, keyCode = '';
if (emailMode) {
adminEmailVal = adminEmail.value.trim(); adminPasswordVal = adminPassword.value;
if (!adminEmailVal || !adminPasswordVal) { fail('Enter your email and password.'); return; }
} else if (!resuming) {
// Testing is invite-only -- see supabase/access_keys_feature.sql and the verify-access-key
// edge function. Admins signing in with email skip this entirely (the branch above), since
// their credentials already prove who they are. A resumed session skips it too: the key (and
// the Turnstile check just below) gate NEW entry, not an already-vetted device reconnecting --
// see verify-join further down for the matching server-side half of that reasoning.
keyCode = accessCode ? accessCode.value.trim() : '';
if (!keyCode) { fail('Enter your invite key.'); return; }
if (window.turnstile && !turnstileToken) { fail('Please complete the verification check above.'); return; }
}
ensureAudioCtx(); // warm up audio on this user gesture so later sounds aren't blocked by autoplay policy
$('join').disabled = true; setStatus(resuming ? 'Reconnecting...' : 'Signing on...');
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
if (!emailMode && !resuming) {
var kv = await verifyAccessCode(keyCode);
if (!kv || !kv.ok) {
throw new Error(kv && kv.reason === 'revoked' ? 'This key has been revoked.' : kv && kv.reason === 'ip_locked' ? 'This key is already in use on another network.' : 'Invalid key.');
}
try { localStorage.setItem('gc_access_code', keyCode); } catch (e) {}
}
var user;
if (emailMode) {
var pw = await sb.auth.signInWithPassword({ email: adminEmailVal, password: adminPasswordVal });
if (pw.error) throw pw.error;
user = pw.data.user;
} else {
var s = await sb.auth.getSession();
user = s.data.session && s.data.session.user;
if (!user) {
if (resuming) throw new Error('Your session has expired. Please sign in again.');
var a = await sb.auth.signInAnonymously(); if (a.error) throw a.error; user = a.data.user;
}
}
/* Whatever the sign-on route, the account's claimed name is the authority on who this is.
   It matters most for email sign-in on a fresh device: there is no local session there, so the
   name box is empty and would otherwise hand this account a random new name -- renaming the
   very character they signed in to recover. */
var claimed = await sb.from('profiles').select('name').eq('user_id', user.id).maybeSingle();
if (!claimed.error && claimed.data && claimed.data.name) n = claimed.data.name;
await sb.auth.updateUser({ data: { name: n } });
await sb.auth.refreshSession(); // updateUser() above doesn't rotate the JWT; refresh so the session carries the new name
/* Claim the name in the database. profiles.name -- NOT the JWT's user_metadata -- is what the
   INSERT policies on messages/threads/thread_posts check. user_metadata is written by the user
   (the updateUser call right above is all it takes), so anyone could set it to someone else's
   name from the console and post as them; profiles rows are writable only by their owner and
   carry a unique index on lower(name), so a name can be held by exactly one account. This also
   makes the "name taken" check real -- it used to be browser-only. Claims go stale after 30
   days of not signing on and are released automatically, so an abandoned anonymous session
   can't squat a name forever. Fails CLOSED on purpose: without a claim, sending wouldn't work
   anyway, so letting someone into the room would just strand them.

   keyCode (the invite key verified above, blank on resume/admin) rides along so a beta tester
   signing on fresh on a second device -- a brand new anonymous auth.uid with no link to their
   other device's -- can reclaim their own name immediately instead of hitting the 30-day-stale
   wait: see supabase/beta_key_name_reclaim.sql, which only allows the early release when both
   accounts were claimed with the same invite key. */
var claim = await sb.rpc('claim_name', { p_name: n, p_key: keyCode || null });
if (claim.error) throw claim.error;
if (claim.data && claim.data.ok === false) {
/* A pinned name can only fail here if it went stale (30 days away) and somebody else took it
   in the meantime. Unlock the box rather than stranding them with a name they can't edit. */
if (lockedName) unlockName();
throw new Error(claim.data.reason === 'taken' ? 'That name is already taken.' : 'That name can’t be used. Try a different one.');
}
if (!emailMode && !resuming) {
// Server-side half of the Turnstile check, plus IP-based fresh-identity churn tracking --
// see supabase/join_ip_log_feature.sql and the verify-join edge function. Fails OPEN on
// anything but an explicit "turnstile_failed" verdict: this is a hardening layer on top of
// the real defense (mute/cooldown is enforced in RLS regardless), not something that should
// lock genuine players out over a network hiccup or a cold-started function. Skipped on
// resume for the same reason the key/Turnstile block above is: this churn tracking exists to
// catch someone minting FRESH identities, and a resumed session -- by definition an identity
// that already exists -- has already been through it once.
try {
var vj = await sb.functions.invoke('verify-join', { body: { turnstileToken: turnstileToken } });
if (vj.data && vj.data.ok === false && vj.data.reason === 'turnstile_failed') {
throw new Error('Verification failed. Please reload the page and try again.');
}
} catch (vjErr) {
if (vjErr && vjErr.message && vjErr.message.indexOf('Verification failed') === 0) throw vjErr;
console.warn('verify-join check did not complete:', vjErr);
}
}
me = { id: user.id, name: n, avatarUrl: null };
manualStatus = 'online'; myAwayMsg = ''; autoIdle = false; awayReplied = {};
var myProf = await sb.from('profiles').select('avatar_url, whisper_policy, status_message').eq('user_id', me.id).maybeSingle();
if (!myProf.error && myProf.data && myProf.data.avatar_url) me.avatarUrl = myProf.data.avatar_url;
myStatusMsg = (!myProf.error && myProf.data && myProf.data.status_message) || '';
whisperPolicy = (!myProf.error && myProf.data && myProf.data.whisper_policy) || 'friends';
whisperPolicyCache = {}; // a fresh sign-on shouldn't trust last session's lookups
updateWhisperBtn();
// Anyone who already had notifications on before push subscriptions existed (this flag predates
// them) has permission:'granted' and notifEnabled:true but no row in push_subscriptions yet --
// catch them up here, now that sb/me actually exist, instead of waiting for them to happen to
// re-click the bell.
if (typeof notifEnabled !== 'undefined' && notifEnabled && 'Notification' in window && Notification.permission === 'granted' && typeof subscribeToPush === 'function') subscribeToPush();

await stopPeek();
channel = sb.channel('room:' + (C.ROOM || 'main'), { config: { presence: { key: me.id } } });
watchGroupMembership(channel); // v154
watchGroupNames(channel); // v159
channel.on('presence', { event: 'sync' }, function () {
var stt = channel.presenceState(); people = {};
Object.keys(stt).forEach(function (k) { if (stt[k][0]) people[k] = stt[k][0]; });
touchRecentPeople(); // refresh the mention-push grace-window cache with whoever's live right now
Object.keys(wins).forEach(function (id) { if (people[id]) { renameWin(id, people[id].name); updateWinAvatar(id); } });
renderPeople();
refreshPresenceDots();
});
channel.on('presence', { event: 'join' }, function (p) {
if (p.key !== me.id && p.newPresences[0] && !people[p.key]) {
var joinedName = p.newPresences[0].name;
/* v132: back within the grace window after a dropped connection -- they never really left, so
   no "entered" line and no sound either (the pending "left" line is cancelled). */
if (pendingLeaves[p.key]) { clearTimeout(pendingLeaves[p.key]); delete pendingLeaves[p.key]; }
else {
addSys(friends[p.key] ? '★ Your friend ' + joinedName + ' just entered the room!' : joinedName + ' has entered the room.');
playSound(friends[p.key] ? 'friendon' : 'signon');
}
}
if (isAdmin && bans[p.key]) channel.send({ type: 'broadcast', event: 'kick', payload: { user_id: p.key, name: p.newPresences[0].name, reason: 'banned', by: me.name } });
});
channel.on('broadcast', { event: 'kick' }, function (p) {
var k = p.payload || {};
if (k.user_id === me.id) { kicked(k.reason); return; }
if (k.reason !== 'banned') addSys(k.name + ' was removed from the room by ' + k.by + '.');
if (wins[k.user_id]) { wins[k.user_id].gone = true; imSys(k.user_id, k.name + ' was removed from the room.'); }
});
channel.on('broadcast', { event: 'buzz' }, function (p) {
var b = p.payload || {}; if (b.to !== me.id) return;
var w = wins[b.from] || ensureWin(b.from, b.name);
playSound('buzz');
if (w.minimized) {
imSys(b.from, b.name + ' sent you a buzz!'); unread[b.from] = (unread[b.from] || 0) + 1; renderPeople(); updateTab(b.from);
if (w.tab) { w.tab.classList.remove('flash'); void w.tab.offsetWidth; w.tab.classList.add('flash'); }
if (!dockOpen && dmBar) { dmBar.classList.remove('flash'); void dmBar.offsetWidth; dmBar.classList.add('flash'); }
} else {
imSys(b.from, b.name + ' sent you a buzz!');
/* the whole dock rattles -- it's the panel the conversation is in, so that's what's on screen */
if (dmDock) { dmDock.classList.remove('shake'); void dmDock.offsetWidth; dmDock.classList.add('shake'); }
}
if (document.hidden) bumpTitle();
});
channel.on('broadcast', { event: 'sfx' }, function (p) { sfxArrived(p.payload); });
channel.on('broadcast', { event: 'typing' }, function (p) {
var d = p.payload; if (!d || !me || d.from === me.id) return;
if (d.to == null) { if (d.typing === false) clearRoomTyping(d.from); else markRoomTyping(d.from, d.name); }
else if (d.to === me.id) { if (d.typing === false) clearImTyping(d.from); else markImTyping(d.from, d.name); }
// d.to pointing at someone else's whisper isn't ours -- ignore, same as buzz's own 'to' above.
});
/* v132: a phone that locks its screen or switches apps drops its realtime socket after a while and
   presence reports a "leave" -- then a "join" the moment it wakes up. That was announcing "X has
   left the room" for people sitting idle two feet away. A leave is now held for LEAVE_GRACE_MS
   and only announced if they have not come back by then. */
var pendingLeaves = {}, LEAVE_GRACE_MS = 90000;
channel.on('presence', { event: 'leave' }, function (p) {
if (!p.leftPresences[0] || p.key === me.id) return;
var leftName = p.leftPresences[0].name, key = p.key;
clearTimeout(pendingLeaves[key]);
pendingLeaves[key] = setTimeout(function () {
delete pendingLeaves[key];
if (people[key]) return; // came back on a fresh key/session in the meantime
addSys(leftName + ' has left the room.'); playSound('signoff');
}, LEAVE_GRACE_MS);
});
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room=eq.' + (C.ROOM || 'main') }, function (p) { handleMessage(p.new); });
/* Main-room housekeeping (messages_trim_room, see schema.sql) deletes the oldest room message
   every time the 100-cap is exceeded by a new one, so everyone else's log needs to drop that row
   live too, not just on next reload. DELETE payloads only ever carry the primary key under default
   replica identity, so there's no room/recipient_id to filter server-side on here -- harmless,
   since the trigger only ever deletes room messages and removing an id that isn't on screen (a
   whisper, or nothing at all) is a no-op. */
channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, function (p) {
var mid = p.old && p.old.id; if (mid == null) return;
var el = log.querySelector('.m[data-mid="' + mid + '"]'); if (el) el.remove();
delete msgCache[mid];
});
/* Read receipts: rows naming me as the peer are marks other people set after reading what I sent
   them. INSERT covers the first time someone reads a given whisper conversation, UPDATE covers
   every time after that (dm_reads has one row per pair, upserted in place, not a new row each
   time). Filtered server-side by RLS regardless -- filter here is just to avoid getting handed
   rows this client has no use for. */
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_reads', filter: 'peer_id=eq.' + me.id }, function (p) { handleDmRead(p.new); });
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_reads', filter: 'peer_id=eq.' + me.id }, function (p) { handleDmRead(p.new); });
/* Reactions and levels aren't scoped to this room server-side (reactions targets threads and
   thread posts too, which have no room column to filter on), so these two are unfiltered and the
   client just ignores anything for a target it isn't currently showing -- cheap at this app's
   scale, and it's the same channel that already tears down in leaveRoom(), so nothing extra to
   clean up. */
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, function (p) { applyReactionRow(p.new, true); });
channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, function (p) { applyReactionRow(p.old, false); });
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_stats' }, function (p) { userStats[p.new.user_id] = p.new; refreshLevelBadges(p.new.user_id); });
/* Games: my rows, whichever side I'm on (RLS already limits rows to mine; the filters just keep
   the subscriptions cheap). A move is one transaction but often several UPDATE statements, and
   realtime relays every one of them -- so an event can carry a half-way row, and one can land
   AFTER the final row already came back from my own rpc. Two guards: a payload is only applied
   when it is at least as new as what we hold (updated_at), and every event also schedules a
   short-delay re-read of the row, which always returns the committed final state. */
var refetchTimers = {};
function refetchGame(table, id, apply) {
var key = table + ':' + id;
clearTimeout(refetchTimers[key]);
refetchTimers[key] = setTimeout(function () {
delete refetchTimers[key];
sb.from(table).select('*').eq('id', id).maybeSingle().then(function (r) { if (!r.error && r.data) apply(r.data); });
}, 300);
}
function fresher(store, row) {
var cur = store[row.id];
if (!cur || !cur.updated_at || !row.updated_at) return true;
return new Date(row.updated_at).getTime() >= new Date(cur.updated_at).getTime();
}
[['games', function () { return games; }, gameArrived], ['uno_games', function () { return unoGames; }, unoArrived],
 ['hangman_games', function () { return hmGames; }, hmArrived], ['holdem_games', function () { return hdGames; }, function (g, isNew) { hdArrived(g, isNew); }],
['prasta_games', function () { return prGames; }, function (g, isNew) { prArrived(g, isNew); }],
['battleship_games', function () { return bsGames; }, function (g, isNew) { bsArrived(g, isNew, false); }]].forEach(function (t) {
var table = t[0], store = t[1], arrived = t[2];
['challenger_id', 'opponent_id'].forEach(function (col) {
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: table, filter: col + '=eq.' + me.id }, function (p) { if (!store()[p.new.id]) arrived(p.new, true); });
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: table, filter: col + '=eq.' + me.id }, function (p) {
if (fresher(store(), p.new)) arrived(p.new, false);
refetchGame(table, p.new.id, function (row) { if (fresher(store(), row)) arrived(row, false); });
});
});
});
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'holdem_hands', filter: 'user_id=eq.' + me.id }, function (p) { hdHandArrived(p.new); });
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'holdem_hands', filter: 'user_id=eq.' + me.id }, function (p) { hdHandArrived(p.new); });
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prasta_hands', filter: 'user_id=eq.' + me.id }, function (p) { prHandArrived(p.new); });
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prasta_hands', filter: 'user_id=eq.' + me.id }, function (p) { prHandArrived(p.new); });
/* UNO: my hand rows (RLS only ever shows me my own). */
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uno_hands', filter: 'user_id=eq.' + me.id }, function (p) { unoHandArrived(p.new); });
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uno_hands', filter: 'user_id=eq.' + me.id }, function (p) { unoHandArrived(p.new); });
/* Level-up announcement: level is a generated column (floor(sqrt(reactions_received/3))+1), so an
   UPDATE with a higher level than what was cached a moment ago is a genuine level-up, not just a
   reaction count ticking up within the same level. Only announced when the person is someone
   currently present in this room (people[] is this room's live presence list) -- user_stats isn't
   scoped to a room server-side (see the comment above), so without that check anyone accumulating
   reactions in a thread anywhere would spam every open room with a name nobody here recognizes. */
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_stats' }, function (p) {
var prevRow = userStats[p.new.user_id], prevLevel = prevRow ? prevRow.level : null;
userStats[p.new.user_id] = p.new;
refreshLevelBadges(p.new.user_id);
if (me && p.new.user_id === me.id && prevRow) { // v128: my own XP landing -- a coin, or the level-up fanfare
if (p.new.level > prevLevel) playSound('levelup');
else if (xpOf(p.new) > xpOf(prevRow)) playSound('coin');
}
if (prevLevel != null && p.new.level > prevLevel && people[p.new.user_id]) {
addSys('🎉 ' + people[p.new.user_id].name + ' reached Level ' + p.new.level + '!');
}
});

var firstSub = true;
await new Promise(function (res, rej) {
channel.subscribe(function (status, err) {
if (status === 'SUBSCRIBED') {
if (firstSub) { firstSub = false; res(); }
else { updateMyPresence(); connBack(); } // reconnected after a dropped connection (common on mobile) — re-announce, then catch up
} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (firstSub) rej(err || new Error('Could not reach the room.')); else connLost(); }
else if (status === 'CLOSED' && !firstSub) connLost();
});
});
await new Promise(function (r) { setTimeout(r, 400); }); // let presence sync so we can check the name
if (nameTaken(n)) { await channel.unsubscribe(); channel = null; throw new Error('That name is already taken.'); }
var ban = await sb.from('bans').select('reason, expires_at').eq('user_id', me.id).maybeSingle();
if (ban.data && (!ban.data.expires_at || new Date(ban.data.expires_at) > new Date())) { await channel.unsubscribe(); channel = null; throw new Error('You have been removed from this room.' + (ban.data.reason ? ' Reason: ' + ban.data.reason : '')); }
await loadBlocks(); await loadAdmin(); await loadMyModeration(); await loadFriends(); await loadFriendRequests(); await loadDmReads(); await loadUserStats();
subscribeFriendRequests();
await channel.track({ name: n, status: 'online', awayMsg: '', statusMsg: myStatusMsg || '', avatarUrl: me.avatarUrl || '' });

// history: recent room messages plus my recent whispers (RLS makes the server only return what I may see)
var h = await sb.from('messages').select('*').eq('room', C.ROOM || 'main').order('created_at', { ascending: false }).limit(C.HISTORY || 200);
if (h.error) throw h.error;
/* Show the room BEFORE the history goes into it. This used to be the other way round, and a
   hidden element has no layout: every "scroll to the bottom" during the replay was setting
   scrollTop on a box whose scrollHeight was 0, so all of it was silently discarded and the log
   was revealed sitting at the very top, on the oldest message in the backlog. */
$('login').classList.add('hidden'); log.classList.remove('hidden'); $('users').classList.remove('hidden'); $('compose').classList.remove('hidden');
if ($('roomWatermark')) $('roomWatermark').classList.remove('hidden');
/* v156: the groups have to be known BEFORE the replay, not after. renderIM drops a group line
   whose conversation it has never heard of -- the guard that stops a half-loaded client inventing
   windows -- so loading them afterwards meant every group's history was silently thrown away and
   only messages that arrived later in the session ever appeared. */
await loadMyGroups();
replayingHistory = true;
/* v166: the readings this device showed go back in among the messages, each where it stood (see
   hoursSeen). Merged by time as the rows go past, so the day dividers still come out right. */
var rows = h.data.reverse(), hoursBack = hoursToRestore(rows);
rows.forEach(function (m) {
var t = Date.parse(m.created_at);
while (hoursBack.length && hoursBack[0].at <= t) drawHour(hoursBack.shift());
handleMessage(m);
});
hoursBack.forEach(drawHour);
replayingHistory = false;
roomHistoryIn = true;
/* Badges were accumulated silently during the replay above; paint them once, now, rather than
   re-rendering the whole people list on every one of up to 200 historical messages. */
renderPeople();
Object.keys(wins).forEach(updateTab); // inbox rows: snippets and unread badges from the replay, in one pass
if (dmDock) dmDock.classList.remove('hidden');
syncDock();
bellTick(); // v153: catch up on this hour's reading now, rather than up to 30 s later or never
startBallot(); // the ballot box in the right-hand gutter (wide layout only -- see style.css)
/* Reactions aren't part of the message row itself, so they need their own pass once the room
   messages they belong to actually exist in the DOM to be painted onto -- whispers are excluded,
   same as everywhere else reactions touch messages. */
loadReactionsFor('message', h.data.filter(function (x) { return !x.recipient_id; }).map(function (x) { return x.id; }));
Object.keys(wins).forEach(function (id) { updateTab(id); });
if (gcRoot) gcRoot.classList.add('signed-on');
updateUsersStacked(); // the panel only has a size now that it is no longer hidden
if ($('statusBtn')) { $('statusBtn').classList.remove('hidden'); updateStatusBtn(); }
if ($('avaBtn')) { $('avaBtn').classList.remove('hidden'); updateAvaBtn(); }
if (bugBtn) bugBtn.classList.remove('hidden');
if (ideaBtn) ideaBtn.classList.remove('hidden'); // v172: the suggestion box
if ($('moreBtn')) $('moreBtn').classList.remove('hidden');
/* Anonymous accounts live in this browser's storage and nowhere else, so the 🔑 (and the nudge
   below) are only offered to them -- an account with an email attached is already portable. */
isAnonAccount = user.is_anonymous !== false && !user.email;
if ($('saveBtn')) $('saveBtn').classList.toggle('hidden', !isAnonAccount);
if ($('logoutBtn')) $('logoutBtn').classList.remove('hidden');
setSignedOnStatus();
addSys('Welcome, ' + me.name + '. Tap a name for options, or type /help.');
/* v128: the lobby intro plays on arrival, but not on every refresh -- once per half hour per device; the plain login sound covers the rest */
var introAt = 0; try { introAt = +localStorage.getItem('gc_intro_at') || 0; } catch (e) {}
if (Date.now() - introAt > 30 * 60000) { try { localStorage.setItem('gc_intro_at', String(Date.now())); } catch (e) {} playSound('intro'); } else playSound('signon');
preloadSounds();
setTimeout(startTour, 1500);
/* One-time note about the friends-only whisper rule (friends_only_whispers.sql), since it changes
   what a name menu's Whisper does for everyone who was here before it. */
var whisperTipSeen = false; try { whisperTipSeen = localStorage.getItem('gc_whisper_tip') === '1'; } catch (e) {}
if (!whisperTipSeen) { addSys('New: whispers are friends-only. Anyone can still send you a friend request (with a hello attached), and you can open your whispers to everyone under ⋯ → Whispers.'); try { localStorage.setItem('gc_whisper_tip', '1'); } catch (e) {} }
if (isAnonAccount) addSys('Heads up: ' + me.name + ' and your friends list are saved in this browser only. Tap the 🔑 below to add an email and keep them on any device.');
if (threadsPanel) {
threadsPanel.classList.add('ready');
renderBoards(); renderTags(); fillNewSelects(); loadMySubs();
loadThreads();
subscribeThreads();
if (threadToggleBtn) threadToggleBtn.classList.add('ready');
if (gameRoomBtn) gameRoomBtn.classList.add('ready'); // v169: before placeThreadBtn, which puts it in the title bar
placeThreadBtn(); // desktop: into the title bar beside the name, rather than floating beside the window
/* The desktop half of this tip used to say the board was "to the right", from back when it was
   a side panel in the gutter, and the phone half said "in the corner" -- neither is true on a
   desktop any more now that the board is a full-screen takeover opened from the title bar. */
if (window.matchMedia('(min-width:501px)').matches) addSys('Tip: the thread spool up in the title bar opens the Threads board — general chat, no topics, post anything.');
else addSys('Tip: tap the thread-spool bubble to open the Threads board.');
}
pinLogBottom();
loadGames(); // Tic-Tac-Toe cards into their whisper windows (open games + results from the last hour)
loadUno();   // same for UNO
loadHangman(); loadHoldem(); loadPrasta(); loadBattleship();
grSubscribe(); // v169: the Game Room -- its own channel; loads the tables once subscribed
var grTipSeen = false; try { grTipSeen = localStorage.getItem('gc_gameroom_tip') === '1'; } catch (e) {}
if (!grTipSeen) { addSys('New: the Game Room. Open a table for UNO or Hold’em with up to four players and four watchers, or join someone else’s. ' + (window.matchMedia('(min-width:501px)').matches ? 'It’s the little poker table up in the title bar.' : 'Tap the poker-table bubble.')); try { localStorage.setItem('gc_gameroom_tip', '1'); } catch (e) {} }
resetIdle();
startRecentPeopleHeartbeat();
autoFocus(msg); // into the room: on a phone, no keyboard until they tap the composer
} catch (e) {
fail(e.message || String(e)); setStatus('Not signed on'); $('join').disabled = false; me = null; hideConnBar();
if (window.turnstile) { try { turnstile.reset(); } catch (resetErr) {} }
turnstileToken = null;
}
}
$('join').onclick = join;
$('sn').onkeydown = function (e) { if (e.key === 'Enter') join(); };
if (accessCode) accessCode.onkeydown = function (e) { if (e.key === 'Enter') join(); };
if (adminEmail) adminEmail.onkeydown = function (e) { if (e.key === 'Enter') join(); };
if (adminPassword) adminPassword.onkeydown = function (e) { if (e.key === 'Enter') join(); };

/* ---------- access-key gate ----------
   Testing is invite-only right now: the invite-key field lives right on the sign-on screen
   alongside the character name, and join() checks it (against the access_keys table -- see
   supabase/access_keys_feature.sql) as part of the same submit, rather than as a separate
   screen before this one. Admins signing in with email skip it entirely -- see the emailMode
   branch in join() and the adminToggle handler above, which hides this field for that path.
   Verification goes through the verify-access-key edge function rather than a direct table
   read -- that table has no client-facing RLS policies at all, so it isn't readable OR
   writable by anon/authenticated clients, only by the function's service-role key. Codes are
   reusable until an admin flips a row's `revoked` flag to true in the Supabase table editor:
   there's no single-use consumption and no in-app key-management UI. Each code is also locked
   to whichever IP first redeems it (see the edge function), so a 'revoked'-shaped rejection can
   also come back as 'ip_locked' if someone else's code is being tried on this network.

   NOTE for when this goes live and the key requirement comes out: remove the #gateFields block
   from index.html, drop the keyCode/verifyAccessCode bits from join() (both the empty-check
   above and the verification call in the try block), and this function and the accessCode
   element ref can go too -- character-name sign-on then works exactly as it did before keys. */
async function verifyAccessCode(code) {
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0 || !window.supabase) return { ok: false, reason: 'unconfigured' };
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
var res = await sb.functions.invoke('verify-access-key', { body: { code: code } });
if (res.error) return { ok: false, reason: 'server_error' };
return res.data || { ok: false, reason: 'invalid' };
} catch (e) { return { ok: false, reason: 'server_error' }; }
}
// Prefill (never auto-submit) any key this device already used, so a returning tester doesn't
// have to retype it -- it's still re-checked for real by join() on submit, in case it's since
// been revoked.
try {
var storedCode = localStorage.getItem('gc_access_code');
if (storedCode && accessCode) accessCode.value = storedCode;
} catch (e) {}
autoFocus(accessCode && !accessCode.value ? accessCode : $('sn'));

/* ---------- PWA service worker ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
navigator.serviceWorker.register('./sw.js').then(function (reg) {
reg.update(); // proactively check for a newer sw.js -- iOS Safari in particular can otherwise
// sit on an old service worker (and its cached app shell) for a long time on its own.
/* One check at registration isn't enough on its own: a tab can sit open for hours, and the
   browser's own schedule for re-checking sw.js in the background can be far looser than that
   (iOS Safari especially). Re-checking whenever the tab actually becomes visible again --
   someone tapping back into a backgrounded app, or switching back to this tab -- catches a new
   deploy at exactly the moment it'd matter, for the cost of one small script fetch. The hourly
   timer just covers a tab that's left open and visible for a very long stretch without ever
   being backgrounded. */
document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update(); });
setInterval(function () { reg.update(); }, 60 * 60 * 1000);
/* sw.js calls self.skipWaiting() + self.clients.claim() unconditionally, so a newly-installed
   worker takes over almost immediately once the browser notices the update above -- but taking
   over only changes which worker answers future network requests. The PAGE itself keeps
   running whatever JS was already loaded into memory; the new code only actually starts
   running once something reloads it. This is precisely the gap that made an already-shipped
   fix look "still broken" earlier this session -- the server had it, the open tab just hadn't
   picked it up yet. Force-reloading the instant control switches would fix that automatically,
   but could just as easily yank the page out from under someone mid-message, so instead this
   surfaces a small "tap to refresh" banner and lets the person choose when. `alreadyControlled`
   guards against firing that banner on the very first page load, when a controller is being
   assigned for the first time rather than swapped out for a newer one. */
var alreadyControlled = !!navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener('controllerchange', function () {
if (!alreadyControlled) { alreadyControlled = true; return; }
if (updateBanner) updateBanner.classList.remove('hidden');
});
}).catch(function () { /* offline shell is optional */ });
/* The mirror-image case: sw.js's own 'pushsubscriptionchange' handler (fired when the browser
   itself invalidates/rotates a push subscription, which does happen occasionally, independent
   of anything this app does) can get a fresh subscription from the push service, but a service
   worker has no Supabase session of its own to save it with -- only an open page does. It
   posts the new subscription here so the row in push_subscriptions gets updated right away
   instead of silently going stale until a future send fails against the dead one. */
navigator.serviceWorker.addEventListener('message', function (e) {
var d = e.data || {};
if (d.type !== 'PUSH_SUBSCRIPTION_CHANGED' || !d.subscription || !sb || !me) return;
var j = d.subscription;
// v163: same save as subscribeToPush, for the same reason (see gc_save_push_subscription)
sb.rpc('gc_save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })
.then(function (r) { if (r.error) console.warn('push subscription refresh not saved:', r.error.message); });
});
}
if (updateBannerBtn) updateBannerBtn.onclick = function () { location.reload(); };
})();
