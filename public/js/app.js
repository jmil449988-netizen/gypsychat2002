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
var tpBack = $('tpBack'), tpPosts = $('tpPosts'), tpReplyBody = $('tpReplyBody'), tpReplySend = $('tpReplySend');
var threadToggleBtn = $('threadToggleBtn'), dmToggleBtn = $('dmToggleBtn');
var tpNewImgBtn = $('tpNewImgBtn'), tpNewImgFile = $('tpNewImgFile'), tpNewGifBtn = $('tpNewGifBtn');
var tpNewPreviewWrap = $('tpNewPreviewWrap'), tpNewPreviewImg = $('tpNewPreviewImg'), tpNewImgRemove = $('tpNewImgRemove');
var tpReplyImgBtn = $('tpReplyImgBtn'), tpReplyImgFile = $('tpReplyImgFile'), tpReplyGifBtn = $('tpReplyGifBtn');
var tpReplyPreviewWrap = $('tpReplyPreviewWrap'), tpReplyPreviewImg = $('tpReplyPreviewImg'), tpReplyImgRemove = $('tpReplyImgRemove');
var adminToggle = $('adminToggle'), adminFields = $('adminFields'), adminEmail = $('adminEmail'), adminPassword = $('adminPassword');
var reportsBtn = $('reportsBtn'), reportsBadge = $('reportsBadge'), reportsOverlay = $('reportsOverlay'), reportsList = $('reportsList'), reportsClose = $('reportsClose');
var gateFields = $('gateFields'), accessCode = $('accessCode');

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
   source of truth: every spot below reads this rather than having the string baked in repeatedly. */
var APP_VERSION = 'Beta v0.1.5';
var WATERMARK_TEXT = 'Yogg Squad © 2027 · ' + APP_VERSION;
if ($('madeBy')) $('madeBy').textContent = 'created by Yogg Squad © 2027 · ' + APP_VERSION;
if ($('roomWatermark')) $('roomWatermark').textContent = WATERMARK_TEXT;
if ($('threadsWatermark')) $('threadsWatermark').textContent = WATERMARK_TEXT;
if ($('rouletteWatermark')) $('rouletteWatermark').textContent = WATERMARK_TEXT;

var sb = null, me = null, channel = null;
var people = {}; // user id -> presence object {name, status, awayMsg} (from presence)
var wins = {}, unread = {}, seen = {};
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
var isAdmin = false, bans = {}, mutedUsers = {}; // bans/mutedUsers only loaded for admins
/* Every admin's user id, so their names can be shown in red to everyone. Read from the admins
   table rather than carried in presence on purpose: presence is written by each client, so a
   self-reported "I'm an admin" flag could be faked from the console by anyone who wanted the
   badge -- the same impersonation hole the name claim closed. The table is the authority. */
var adminIds = {};
function isAdminId(id) { return !!adminIds[id]; }
var lastSend = 0;

/* ---------- threads board state (a single flat "general" board, 4chan-style — no topics) ---------- */
var threadsCache = {}; // thread id -> thread row {id, op_id, op_name, body, created_at, bumped_at, reply_count}
var threadsOrder = []; // thread ids, kept sorted by bumped_at desc
var openThreadId = null;
var threadsChannel = null;
var threadsPage = 0; // current page (0-based) of the catalog list
var THREADS_PAGE_SIZE = 12;
var reportsChannel = null;
var threadPostsSeen = {};
var lastThreadSend = 0;
var tpNewImageUrl = null, tpReplyImageUrl = null; // pending image_url for the post currently being composed
var MAX_IMG_BYTES = 5 * 1024 * 1024;
var ALLOWED_IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

/* ---------- my status (Online / Away / Busy, plus auto-Idle) ----------
   manualStatus is what I chose; autoIdle layers "idle" on top of Online after inactivity.
   The effective status (what others see) is computed by effectiveStatus() and pushed to
   presence via updateMyPresence() whenever either input changes. */
var manualStatus = 'online', myAwayMsg = '', autoIdle = false, awayReplied = {};
function effectiveStatus() { return (manualStatus === 'online' && autoIdle) ? 'idle' : manualStatus; }
function updateMyPresence() {
if (!channel || !me) return;
channel.track({ name: me.name, status: effectiveStatus(), awayMsg: manualStatus === 'away' ? myAwayMsg : '', avatarUrl: me.avatarUrl || '' });
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
b.textContent = '●';
b.title = 'Status: ' + label + ' — click to change';
b.setAttribute('aria-label', 'Status: ' + label + '. Click to change your status.');
b.setAttribute('data-status', eff);
}
function setMyStatus(status, awayMsg) {
if (manualStatus === 'away' && status !== 'away') awayReplied = {}; // fresh away-reply window next time I go away
manualStatus = status; myAwayMsg = awayMsg || ''; autoIdle = false;
updateMyPresence(); updateStatusBtn(); resetIdle();
}
var IDLE_MS = 3 * 60 * 1000; // auto-idle after 3 minutes of no activity, AIM-style
var idleTimer = null;
function resetIdle() {
if (!me) return;
if (autoIdle) { autoIdle = false; updateMyPresence(); updateStatusBtn(); }
clearTimeout(idleTimer);
idleTimer = setTimeout(function () {
if (manualStatus === 'online') { autoIdle = true; updateMyPresence(); updateStatusBtn(); }
}, IDLE_MS);
}
['mousemove', 'keydown', 'touchstart', 'scroll', 'pointerdown'].forEach(function (evt) { document.addEventListener(evt, resetIdle, { passive: true }); });

/* status dropdown (Online / Away / Busy) anchored off the status-bar pill */
var statusMenu = document.createElement('div'); statusMenu.className = 'nmenu'; statusMenu.setAttribute('role', 'menu'); document.body.appendChild(statusMenu);
function closeStatusMenu() { statusMenu.classList.remove('open'); }
function openStatusMenu(anchor) {
var items = [
['Online', function () { setMyStatus('online', ''); }],
['Away', async function () { var m = await showPromptModal('Away Message', { value: myAwayMsg || '', placeholder: 'optional', hint: 'Shown to anyone who whispers you while you’re away.' }); if (m === null) return; setMyStatus('away', m); }],
['Busy', function () { setMyStatus('busy', ''); }]
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
var audioCtx = null, soundMuted = false;
try { soundMuted = localStorage.getItem('gc_sound_muted') === '1'; } catch (e) {}
function ensureAudioCtx() { if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} } return audioCtx; }
function tone(freq, dur, delay, type, vol) {
var ctx = ensureAudioCtx(); if (!ctx) return;
var t0 = ctx.currentTime + (delay || 0);
var osc = ctx.createOscillator(), gain = ctx.createGain();
osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, t0);
gain.gain.setValueAtTime(0, t0);
gain.gain.linearRampToValueAtTime(vol || 0.15, t0 + 0.01);
gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
osc.connect(gain); gain.connect(ctx.destination);
osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function playSound(kind) {
if (soundMuted) return;
if (kind === 'signon') { tone(660, 0.09, 0, 'triangle'); tone(880, 0.12, 0.09, 'triangle'); }
else if (kind === 'ding') { tone(1050, 0.14, 0, 'sine'); }
else if (kind === 'buzz') { tone(120, 0.5, 0, 'sawtooth', 0.2); tone(90, 0.5, 0.05, 'sawtooth', 0.2); }
}
function updateSoundBtn() {
var b = $('soundBtn'); if (!b) return;
var icon = b.querySelector('.btn-icon');
if (icon) icon.textContent = soundMuted ? '🔇' : '🔊'; else b.textContent = soundMuted ? '🔇' : '🔊';
b.setAttribute('aria-pressed', soundMuted ? 'true' : 'false');
}
if ($('soundBtn')) {
updateSoundBtn();
$('soundBtn').onclick = function () {
soundMuted = !soundMuted;
try { localStorage.setItem('gc_sound_muted', soundMuted ? '1' : '0'); } catch (e) {}
updateSoundBtn();
};
}

/* ---------- option to completely hide DM (whisper) tabs and windows ----------
   Purely a client-side/visual toggle, same pattern as sound mute: whispers still arrive and are
   remembered under the hood (unread counts, history) — they're just not shown on screen while
   this is on, and everything reappears the moment it's switched back off. */
var dmTabsOff = false;
try { dmTabsOff = localStorage.getItem('gc_dm_tabs_off') === '1'; } catch (e) {}
function updateDmToggleBtn() {
if (gcRoot) gcRoot.classList.toggle('no-dms', dmTabsOff);
if (!dmToggleBtn) return;
dmToggleBtn.textContent = dmTabsOff ? '🚫' : '💬';
dmToggleBtn.setAttribute('aria-pressed', dmTabsOff ? 'true' : 'false');
dmToggleBtn.title = dmTabsOff ? 'DM tabs hidden — click to show them again' : 'Hide DM tabs';
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

var USERS_H_MIN = 84, USERS_H_DEFAULT = 150;
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
usersFolded = localStorage.getItem('gc_users_folded') === '1';
} catch (e) {}
applyUsersHeight(); applyUsersFold();

(function () {
var btn = $('usersMin');
if (btn) btn.onclick = function () {
usersFolded = !usersFolded;
try { localStorage.setItem('gc_users_folded', usersFolded ? '1' : '0'); } catch (e) {}
applyUsersFold();
};
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
setStatus('Signed on as ' + me.name + (isAdmin ? ' (admin)' : ''));
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
return;
}
if (moderation.cooldownUntil > now) {
msg.disabled = true; $('send').disabled = true; lockThreadCompose(true);
bar.textContent = '⏳ Cooldown: ' + Math.max(1, Math.ceil((moderation.cooldownUntil - now) / 1000)) + 's remaining';
bar.classList.remove('hidden'); bar.classList.remove('muted');
} else {
msg.disabled = false; $('send').disabled = false; lockThreadCompose(false);
bar.classList.add('hidden'); bar.classList.remove('muted');
clearModTimer();
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
overlay.classList.remove('hidden');
input.focus(); input.select();
function done(val) {
overlay.classList.add('hidden');
okBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null; input.onkeydown = null;
resolve(val);
}
okBtn.onclick = function () { done(input.value.trim()); };
cancelBtn.onclick = function () { done(null); };
overlay.onclick = function (e) { if (e.target === overlay) done(null); };
input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); okBtn.onclick(); } };
});
}

document.addEventListener('keydown', function (e) {
if (e.key !== 'Escape') return;
if (!$('warnOverlay').classList.contains('hidden')) $('warnOk').click();
if (!$('infoOverlay').classList.contains('hidden')) $('infoOk').click();
if ($('promptOverlay') && !$('promptOverlay').classList.contains('hidden')) $('promptCancel').click();
if ($('saveOverlay') && !$('saveOverlay').classList.contains('hidden')) $('saveOverlay').classList.add('hidden');
if ($('imgLightbox') && !$('imgLightbox').classList.contains('hidden')) closeLightbox();
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
   emoji...), so there's no context-free regex for "a mention" -- instead we match against the
   names of people actually in the room right now, longest name first so e.g. "@Jo" can't eat the
   front of "@John" (the trailing (?![\w-]) guard on every match does the same job the other way:
   it keeps "@Jo" from matching the "Jo" inside "@John"). Only online people can be @mentioned
   (same rule the whisper picker already uses for who you can talk to). */
function mentionableNames() {
  return Object.keys(people).map(function (id) { return people[id].name; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
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
log.appendChild(d); log.scrollTop = log.scrollHeight;
}
function renderRoom(m) {
if (seen[m.id]) return; seen[m.id] = 1;
var mine = m.sender_id === me.id;
msgCache[m.id] = { senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at };
var mentionsMe = !mine && bodyMentionsMe(m.body);
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them') + (mentionsMe ? ' mention-me' : ''); d.dataset.mid = m.id;
var flag = mine ? '' : '<button type="button" class="rpt-msg" data-mid="' + m.id + '" title="Report this message" aria-label="Report this message from ' + esc(m.sender_name) + '">🚩</button>';
d.innerHTML = '<span class="t">' + fmt(m.created_at) + '</span>' + flag + avatarHtml(m.sender_id, m.sender_name) + '<b class="who' + (isAdminId(m.sender_id) ? ' admin' : '') + '" data-id="' + esc(m.sender_id) + '" data-name="' + esc(m.sender_name) + '" tabindex="0">' + esc(m.sender_name) + ':</b> ' + bodyHtml(m.body);
var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
log.appendChild(d);
if (atBottom || mine) { log.scrollTop = log.scrollHeight; stickImages(log, d); }
if (!mine && document.hidden && !replayingHistory) bumpTitle();
if (mentionsMe && !replayingHistory) playSound('ding');
}
function handleMessage(m) { if (blocked[m.sender_id]) return; if (m.recipient_id) renderIM(m); else renderRoom(m); }

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
return '<div class="' + classes.join(' ').trim() + '" tabindex="' + (isSelf ? -1 : 0) + '" data-id="' + esc(id) + '"' + title + '>' + avatarHtml(id, p.name) + esc(p.name) + tag + '</div>';
}).join('');
/* The online count used to live in the icon-heavy status bar up top; it now lives in the main
   chat's own footer line (directly below that bar), alongside the watermark -- threads and
   roulette have their own separate watermark footers (threadsWatermark/rouletteWatermark) that
   intentionally don't get an online count, since that count is specific to who's in the room. */
if ($('roomWatermark')) $('roomWatermark').textContent = ids.length + ' online · ' + WATERMARK_TEXT;
Object.keys(wins).forEach(function (id) {
var w = wins[id], here = !!people[id];
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
if (!ids.length) { flist.innerHTML = '<div class="empty">No friends added yet.</div>'; return; }
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
return '<div class="' + cls + '" tabindex="0" data-id="' + esc(id) + '">' + avatarHtml(id, label) + esc(label) + suffix + '</div>';
}).join('');
return '<div class="fg-hd">' + esc(g) + '</div>' + rows;
}).join('');
}
function nameTaken(n) { return Object.keys(people).some(function (id) { return id !== me.id && people[id].name.toLowerCase() === n.toLowerCase(); }); }

/* ---------- whisper windows (keyed by user id) ----------
   A whisper window is never forced open on its own — history replay on login and
   any incoming message while it's closed just update a small tab in the tray
   (like a mail icon) instead of popping a window over the room. Only a deliberate
   action (tapping a name > Whisper, /w, or tapping its tray tab) opens it. */
var zTop = 20, nWin = 0, lastBuzz = {};
function ensureWin(id, name) {
if (wins[id]) { if (name) renameWin(id, name); return wins[id]; }
var el = document.createElement('div'); el.className = 'im hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Whisper with ' + name);
el.innerHTML = '<div class="bar"><span class="gem"></span><span class="wava" aria-hidden="true"></span><span class="nm"></span><button class="buzz" type="button" title="Buzz" aria-label="Buzz ' + esc(name) + '">⚡</button><button class="x" type="button" aria-label="Minimize">–</button></div>' +
'<div class="ilog" aria-live="polite"></div><div class="icomp">' +
'<button class="btn emo" type="button" title="Insert emoji" aria-label="Insert emoji">😊</button>' +
'<button class="btn img" type="button" title="Send a photo" aria-label="Send a photo">🖼️</button>' +
'<input type="file" class="im-img-file hidden" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif">' +
'<textarea maxlength="500"></textarea><button class="btn" type="button">Send</button></div>' +
'<div class="rz rz-nw" data-dir="nw" aria-hidden="true"></div><div class="rz rz-ne" data-dir="ne" aria-hidden="true"></div>' +
'<div class="rz rz-sw" data-dir="sw" aria-hidden="true"></div><div class="rz rz-se" data-dir="se" aria-hidden="true"></div>';
el.querySelector('.nm').textContent = name;
var win = { el: el, log: el.querySelector('.ilog'), ta: el.querySelector('textarea'), gone: !people[id], name: name, minimized: true, tab: null };
win.ta.placeholder = 'Whisper to ' + name + '...';
var off = (nWin++ % 6) * 24; el.style.left = (30 + off) + 'px'; el.style.top = (70 + off) + 'px';
el.querySelector('.x').onclick = function () { minimizeIM(id); };
el.querySelector('.buzz').onclick = function () { sendBuzz(id); };
el.querySelector('.icomp .btn:last-child').onclick = function () { sendIM(id); };
var emoBtnWin = el.querySelector('.icomp .emo');
emoBtnWin.onclick = function () { openEmojiPicker(win.ta, emoBtnWin); };
var imgBtn = el.querySelector('.icomp .img'), imgFile = el.querySelector('.im-img-file');
imgBtn.onclick = function () { imgFile.click(); };
imgFile.onchange = function () {
var f = imgFile.files && imgFile.files[0]; imgFile.value = '';
if (f) sendIMImage(id, f);
};
win.ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIM(id); } if (e.key === 'Escape') minimizeIM(id); };
win.log.onclick = function (e) {
var img = e.target.closest('img.gif'); if (img) { openLightbox(img.src); return; }
var rpt = e.target.closest('.rpt-msg[data-mid]'); if (rpt) reportMessage(rpt.dataset.mid);
};
el.addEventListener('pointerdown', function () { front(el); });
var bar = el.querySelector('.bar');
bar.addEventListener('pointerdown', function (e) {
if (e.target.classList.contains('x') || e.target.classList.contains('buzz') || window.innerWidth <= 430) return;
var sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop; bar.setPointerCapture(e.pointerId);
function mv(ev) { el.style.left = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - sx)) + 'px'; el.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - sy)) + 'px'; }
function up() { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); }
bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
});
makeResizable(el);
$('ims').appendChild(el); wins[id] = win;
makeTab(id); updateTab(id); updateWinAvatar(id); // tab starts visible (win starts minimized) regardless of who the first message is from
return win;
}
/* ---------- whisper window resizing ----------
   Four corner handles, dragged like the title bar already is (setPointerCapture on the handle
   itself). Each corner keeps the OPPOSITE edge fixed while it moves, so clamping to the min/max
   size never makes the window jump -- e.g. dragging the top-left corner keeps the bottom-right
   corner planted and just grows/shrinks toward it. Disabled on the mobile layout (see the
   max-width:430px rule for .im .rz), where whisper windows are already full-width/fixed-height. */
var RZ_MIN_W = 260, RZ_MIN_H = 200, RZ_MAX_W = 640, RZ_MAX_H = 720;
function makeResizable(el) {
Array.prototype.forEach.call(el.querySelectorAll('.rz'), function (h) {
h.addEventListener('pointerdown', function (e) {
if (window.innerWidth <= 430) return;
e.preventDefault(); e.stopPropagation();
front(el);
var dir = h.dataset.dir;
var r = el.getBoundingClientRect();
var startX = e.clientX, startY = e.clientY;
var startW = r.width, startH = r.height, startLeft = r.left, startTop = r.top;
var rightEdge = startLeft + startW, bottomEdge = startTop + startH;
h.setPointerCapture(e.pointerId);
function mv(ev) {
var dx = ev.clientX - startX, dy = ev.clientY - startY;
var w = startW, ht = startH, left = startLeft, top = startTop;
if (dir === 'se' || dir === 'ne') w = startW + dx; else w = startW - dx;
if (dir === 'se' || dir === 'sw') ht = startH + dy; else ht = startH - dy;
w = Math.max(RZ_MIN_W, Math.min(RZ_MAX_W, Math.min(w, window.innerWidth - 6)));
ht = Math.max(RZ_MIN_H, Math.min(RZ_MAX_H, Math.min(ht, window.innerHeight - 6)));
if (dir === 'sw' || dir === 'nw') left = rightEdge - w;
if (dir === 'ne' || dir === 'nw') top = bottomEdge - ht;
el.style.width = w + 'px'; el.style.height = ht + 'px';
el.style.left = Math.max(0, left) + 'px'; el.style.top = Math.max(0, top) + 'px';
}
function up() { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); }
h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
});
});
}
function makeTab(id) {
var w = wins[id];
// A <div role="button"> rather than a real <button> -- the close "x" inside it is its own real
// button, and a button can't contain another button (the browser would silently pop it back out
// as a sibling, breaking both the layout and the click handling below).
var b = document.createElement('div'); b.className = 'im-tab hidden'; b.tabIndex = 0; b.setAttribute('role', 'button');
b.innerHTML = '<span class="env" aria-hidden="true">✉</span><span class="nm"></span><span class="badge hidden">0</span>' +
'<button type="button" class="tab-close" title="Close this whisper" aria-label="Close whisper with ' + esc(w.name) + '">✕</button>';
b.querySelector('.nm').textContent = w.name;
b.setAttribute('aria-label', 'Open whisper with ' + w.name);
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
w.el.setAttribute('aria-label', 'Whisper with ' + name);
w.el.querySelector('.nm').textContent = name;
var buzzBtn = w.el.querySelector('.buzz'); if (buzzBtn) buzzBtn.setAttribute('aria-label', 'Buzz ' + name);
w.ta.placeholder = 'Whisper to ' + name + '...';
if (w.tab) {
w.tab.querySelector('.nm').textContent = name; w.tab.setAttribute('aria-label', 'Open whisper with ' + name);
var closeBtn = w.tab.querySelector('.tab-close'); if (closeBtn) closeBtn.setAttribute('aria-label', 'Close whisper with ' + name);
}
}
/* Keeps a whisper window's title-bar avatar in sync with presence -- called once when the window
   is created and again on every presence sync (a person can change their picture mid-conversation). */
function updateWinAvatar(id) {
var w = wins[id]; if (!w) return;
var span = w.el.querySelector('.wava'); if (!span) return;
span.innerHTML = avatarHtml(id, w.name);
}
function updateTab(id) {
var w = wins[id]; if (!w || !w.tab) return;
w.tab.classList.toggle('hidden', !w.minimized);
var n = unread[id] || 0;
var badge = w.tab.querySelector('.badge');
badge.textContent = n > 9 ? '9+' : String(n);
badge.classList.toggle('hidden', !n);
}
function openIM(id, name, focus) {
var w = ensureWin(id, name);
w.minimized = false; w.el.classList.remove('hidden'); front(w.el);
unread[id] = 0; markDmRead(id); renderPeople();
updateTab(id);
if (focus) w.ta.focus();
/* A hidden element has no layout, so while the window sat minimised the browser had nowhere to
   keep its scroll offset and clamped it to zero -- reopening a whisper dropped you at the OLDEST
   message in the conversation. Put it back on the newest, a frame later so the window has been
   laid out again by then. */
requestAnimationFrame(function () { w.log.scrollTop = w.log.scrollHeight; });
return w;
}
function minimizeIM(id) {
var w = wins[id]; if (!w) return;
w.minimized = true; w.el.classList.add('hidden'); updateTab(id); msg.focus();
}
function destroyWin(id) {
var w = wins[id]; if (!w) return;
w.el.remove(); if (w.tab) w.tab.remove(); delete wins[id];
}
function front(el) { el.style.zIndex = ++zTop; }
function imSys(id, text) { var w = wins[id]; if (!w) return; var d = document.createElement('div'); d.className = 'm sys'; d.textContent = text; w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight; }
function sendBuzz(id) {
var now = Date.now();
if (lastBuzz[id] && now - lastBuzz[id] < 3000) return;
lastBuzz[id] = now;
channel.send({ type: 'broadcast', event: 'buzz', payload: { to: id, from: me.id, name: me.name } });
imSys(id, 'You sent a buzz.');
}
function renderIM(m) {
if (seen[m.id]) return; seen[m.id] = 1;
var mine = m.sender_id === me.id;
msgCache[m.id] = { senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at };
var otherId = mine ? m.recipient_id : m.sender_id;
var otherName = mine ? ((people[otherId] && people[otherId].name) || m.recipient_name || 'unknown') : m.sender_name;
var w = ensureWin(otherId, otherName); // never pops the window open on its own — see note above
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them'); d.dataset.mid = m.id;
if (mine) d.dataset.at = new Date(m.created_at).getTime(); // read receipts compare against this — see updateSeenMark
var flag = mine ? '' : '<button type="button" class="rpt-msg" data-mid="' + m.id + '" title="Report this message" aria-label="Report this message from ' + esc(m.sender_name) + '">🚩</button>';
d.innerHTML = '<span class="t">' + fmt(m.created_at) + '</span>' + flag + avatarHtml(m.sender_id, m.sender_name) + '<b>' + esc(m.sender_name) + ':</b> ' + bodyHtml(m.body);
w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight; stickImages(w.log, d);
if (mine) updateSeenMark(otherId); // this may now be the new last message of mine -- move/(re)show the mark
if (!mine && !alreadyRead(otherId, m.created_at)) {
if (w.minimized || document.activeElement !== w.ta) { unread[otherId] = (unread[otherId] || 0) + 1; if (!replayingHistory) { renderPeople(); updateTab(otherId); } }
else markDmRead(otherId, m.created_at); // you are sitting in the window with the cursor in it
}
if (!mine && !replayingHistory) {
if (!w.minimized) front(w.el);
else if (w.tab) { w.tab.classList.remove('flash'); void w.tab.offsetWidth; w.tab.classList.add('flash'); }
playSound('ding');
if (document.hidden) bumpTitle();
if (manualStatus === 'away' && !awayReplied[otherId]) {
awayReplied[otherId] = true;
post('[Away] ' + (myAwayMsg || (me.name + ' is currently away.')), otherId, otherName);
}
}
}
async function sendIM(id) {
var w = wins[id]; var t = w.ta.value.trim(); if (!t) return;
if (w.gone) { imSys(id, w.name + ' is not here to hear you.'); return; }
w.ta.value = '';
await post(t, id, w.name);
w.ta.focus();
}
/* Photo-send in a whisper: reuses the same upload (and the same "thread-images" bucket) as thread
   image posts, then sends the resulting URL as an ordinary whisper message -- bodyHtml's OWN_IMG_RE
   is what makes it show up embedded rather than as a bare link. */
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
/* ---------- name menu: Get Info / Whisper / Block / Report / Friend / Kick ---------- */
var menu = document.createElement('div'); menu.className = 'nmenu'; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
function closeMenu() { menu.classList.remove('open'); }
function openMenu(id, anchor, fallbackName) {
var online = !!people[id];
var name = (online && people[id].name) || (friends[id] && friends[id].name) || fallbackName; if (!name) return;
var items = [];
items.push(['Get Info', function () { showInfo(id, name); }]);
if (online && !blocked[id]) items.push(['Whisper', function () { unread[id] = 0; openIM(id, name, true); }]);
items.push(blocked[id] ? ['Unblock', function () { unblock(id); }] : ['Block', function () { block(id, name); }]);
items.push(['Report', async function () { var rr = await showPromptModal('Report ' + name, { placeholder: 'e.g. spam, harassment', maxLength: 300 }); if (rr) report(id, name, rr); }]);
items.push(friends[id] ? ['Remove Friend', function () { removeFriend(id, name); }] : ['Add Friend', function () { addFriend(id, name); }]);
if (friends[id]) items.push(['Move to Group', async function () { var g = await showPromptModal('Move to Group', { value: friends[id].group || '', placeholder: 'blank for none', maxLength: 40 }); if (g !== null) moveFriendGroup(id, g); }]);
/* Kick/Mute/Unmute don't require the target to still be online — most of the time an admin is
   acting on something said in the chat log by someone who has since left the room. */
if (isAdmin && mutedUsers[id]) items.push(['Unmute', function () { unmute(id, name); }]);
if (isAdmin && !mutedUsers[id]) items.push(['Mute', function () { muteUser(id, name); }, 'danger']);
if (isAdmin) items.push(['Kick', function () { var r = prompt('Reason for kicking ' + name + '? (optional)'); if (r !== null) kick(id, name, r); }, 'danger']);
menu.innerHTML = '<div class="hd">' + avatarHtml(id, name, 'ava-menu') + '<span class="hd-name' + (isAdminId(id) ? ' admin' : '') + '">' + esc(name) + '</span></div>' + items.map(function (it, i) { return '<button type="button" role="menuitem" class="' + (it[2] || '') + '" data-i="' + i + '">' + it[0] + '</button>'; }).join('');
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
var img = e.target.closest('img.gif'); if (img) { openLightbox(img.src); return; }
var rpt = e.target.closest('.rpt-msg[data-mid]'); if (rpt) { e.stopPropagation(); reportMessage(rpt.dataset.mid); return; }
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
if (!isAdmin || !reportsBadge || !sb) return;
sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open').then(function (r) {
if (r.error) return;
var n = r.count || 0;
reportsBadge.textContent = String(n > 99 ? '99+' : n);
reportsBadge.classList.toggle('hidden', n === 0);
});
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
if (reportsBtn) reportsBtn.onclick = function () { reportsOverlay.classList.remove('hidden'); loadReports(); };
if (reportsClose) reportsClose.onclick = function () { reportsOverlay.classList.add('hidden'); };
function subscribeReports() {
if (reportsChannel || !isAdmin) return;
reportsChannel = sb.channel('reports-queue');
reportsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, function () {
refreshReportsBadge();
if (reportsOverlay && !reportsOverlay.classList.contains('hidden')) loadReports();
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
async function addFriend(id, name) {
var r = await sb.from('friends').insert({ owner_id: me.id, friend_id: id, friend_name: name });
if (r.error) { addSys('Could not add friend: ' + r.error.message); return; }
friends[id] = { name: name, group: null }; addSys(name + ' was added to your friends list.'); renderPeople();
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
function kicked(reason) {
if (channel) { channel.unsubscribe(); channel = null; }
unsubscribeThreads();
unsubscribeReports();
if (reportsBtn) reportsBtn.classList.add('hidden');
if (reportsBadge) reportsBadge.classList.add('hidden');
if (reportsOverlay) reportsOverlay.classList.add('hidden');
if (threadsPanel) { threadsPanel.classList.remove('ready'); }
if (threadToggleBtn) { threadToggleBtn.classList.remove('ready', 'open'); threadToggleBtn.textContent = '🧵'; threadToggleBtn.setAttribute('aria-label', 'Open threads board'); }
if (gcRoot) { gcRoot.classList.remove('thread-open'); gcRoot.classList.remove('mobile-threads-open'); gcRoot.classList.remove('mobile-roulette-open'); gcRoot.classList.remove('signed-on'); }
openThreadId = null;
clearTimeout(idleTimer);
log.classList.add('hidden'); $('users').classList.add('hidden'); $('compose').classList.add('hidden');
if ($('roomWatermark')) $('roomWatermark').classList.add('hidden');
if ($('statusBtn')) $('statusBtn').classList.add('hidden');
if ($('avaBtn')) $('avaBtn').classList.add('hidden');
if ($('saveBtn')) $('saveBtn').classList.add('hidden');
if ($('moreBtn')) { $('moreBtn').classList.add('hidden'); closeMoreMenu(); }
if (st) st.classList.remove('renamable');
Object.keys(wins).forEach(function (k) { wins[k].el.remove(); if (wins[k].tab) wins[k].tab.remove(); }); wins = {};
$('login').classList.remove('hidden'); $('join').disabled = true;
fail('You have been removed from the room.' + (reason ? ' Reason: ' + reason : ''));
setStatus('Removed'); me = null;
}

/* ---------- sending ---------- */
async function post(body, recipientId, recipientName) {
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
var cap = recipientId ? 500 : 140; // main room chat is capped at 140; whispers keep the old 500
var row = { room: C.ROOM || 'main', sender_id: me.id, sender_name: me.name, body: sanitizeInput(body).slice(0, cap) };
if (recipientId) { row.recipient_id = recipientId; row.recipient_name = recipientName; }
var r = await sb.from('messages').insert(row).select().single();
if (r.error) { addSys('Your words were lost: ' + r.error.message); return; }
handleMessage(r.data); // show immediately; the realtime echo is de-duplicated by id
}
function findId(name) { return Object.keys(people).filter(function (k) { return people[k].name.toLowerCase() === name.toLowerCase(); })[0]; }
async function command(t) {
var m = t.match(/^\/(\w+)\s*(\S*)\s*([\s\S]*)$/); if (!m) return false;
var cmd = m[1].toLowerCase(), arg = m[2], rest = m[3].trim(), id;
switch (cmd) {
case 'w': case 'whisper': return false; // handled by send()
case 'whoami': addSys('You are ' + me.name + ' — id ' + me.id + (isAdmin ? ' (admin)' : '')); return true;
case 'help': addSys('Commands: /w name msg · /nick newname · /block name · /unblock name · /blocks · /addfriend name · /removefriend name · /movegroup name group · /friends · /setbio text · /report name reason · /whoami' + (isAdmin ? ' · /kick name [reason] · /unban name · /bans · /mute name · /unmute name · /muted · /reports' : '') + '. Click a name in the chat log or Online list for options. Tap 🚩 on a message to report that exact message. Click your status pill (bottom bar) to go Away/Busy, or your own name beside it to rename your character. The ⚡ in a whisper window sends a buzz.'); return true;
case 'gif': openGifPicker(rest ? m[2] + ' ' + rest : arg, 'main', gifBtn); return true;
case 'block': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot block yourself.'); return true; } block(id, people[id].name); return true;
case 'unblock': id = Object.keys(blocked).filter(function (k) { return (blocked[k] || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not blocked anyone named ' + arg + '.'); return true; } unblock(id); return true;
case 'blocks': var bl = Object.keys(blocked).map(function (k) { return blocked[k]; }); addSys(bl.length ? 'Blocked: ' + bl.join(', ') : 'You have blocked no one.'); return true;
case 'addfriend': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot add yourself as a friend.'); return true; } if (friends[id]) { addSys(people[id].name + ' is already on your friends list.'); return true; } addFriend(id, people[id].name); return true;
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
default: addSys('Unknown command. Type /help.'); return true;
}
}
async function send() {
var t = msg.value.trim(); if (!t || !me) return;
if (t[0] === '/' && !/^\/w(hisper)?\s/i.test(t)) { msg.value = ''; closeMention(); await command(t); return; }
var w = t.match(/^\/w(?:hisper)?\s+(\S+)\s*([\s\S]*)$/i);
if (w) {
var id = Object.keys(people).filter(function (k) { return people[k].name.toLowerCase() === w[1].toLowerCase(); })[0];
if (!id) { addSys('No one here is named ' + w[1] + '.'); return; }
if (id === me.id) { addSys('You cannot whisper to yourself.'); return; }
if (blocked[id]) { addSys('You have blocked ' + people[id].name + '. Unblock them first.'); return; }
msg.value = ''; closeMention(); var win = openIM(id, people[id].name, true);
if (w[2].trim()) { win.ta.value = w[2].trim(); sendIM(id); }
return;
}
msg.value = ''; closeMention(); await post(t); msg.focus();
}
$('send').onclick = send;
msg.onkeydown = function (e) {
if (mentionMenu.classList.contains('open')) {
if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex = (mentionIndex + 1) % mentionItems.length; renderMentionMenu(); return; }
if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex = (mentionIndex - 1 + mentionItems.length) % mentionItems.length; renderMentionMenu(); return; }
if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionItems[mentionIndex]); return; }
if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
}
if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
};

/* ---------- @mention autocomplete (main chat only) ----------
   One dropdown, shared the same way the emoji/GIF pickers are: created once, repositioned to the
   textarea via positionPicker(). Matches against people currently in the room -- same scope the
   whisper picker already limits you to, and it means the suggestion list is never stale. */
var mentionMenu = document.createElement('div'); mentionMenu.className = 'mention-menu'; mentionMenu.setAttribute('role', 'listbox'); document.body.appendChild(mentionMenu);
var mentionStart = -1, mentionItems = [], mentionIndex = 0;
function closeMention() { mentionMenu.classList.remove('open'); mentionItems = []; mentionStart = -1; }
function currentMentionToken() {
var s = msg.selectionStart, e = msg.selectionEnd;
if (s !== e) return null;
var v = msg.value;
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
var items = Object.keys(people).filter(function (id) { return id !== me.id; }).map(function (id) { return people[id].name; })
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
positionPicker(mentionMenu, msg);
}
function selectMention(name) {
var end = msg.selectionStart;
var v = msg.value;
msg.value = v.slice(0, mentionStart) + '@' + name + ' ' + v.slice(end);
var newPos = mentionStart + name.length + 2;
closeMention();
msg.focus(); msg.selectionStart = msg.selectionEnd = newPos;
}
msg.addEventListener('input', updateMentionMenu);
msg.addEventListener('click', updateMentionMenu);
document.addEventListener('click', function (e) { if (!mentionMenu.contains(e.target) && e.target !== msg) closeMention(); });

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
else { post(full); msg.focus(); }
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
   supporting it natively in Photos -- so an unconverted HEIC upload can't be cropped/previewed and,
   via ALLOWED_IMG_TYPES below, gets rejected outright before that. iOS Safari's own file picker
   usually transcodes a HEIC photo to JPEG automatically when handing it to a web page, but that
   doesn't happen in every browser/in-app webview or every iOS version, and some Android file
   providers hand over HEIC files with an empty file.type -- so this checks the filename too, and
   when it finds one, converts it to an ordinary JPEG right in the browser (via the heic2any library
   loaded from index.html) before anything else touches the file. */
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
async function uploadImage(file) {
if (!file) return null;
try { file = await normalizeImageFile(file); } catch (e) { addSys(e.message || 'Could not read that photo.'); return null; }
var ext = ALLOWED_IMG_TYPES[file.type];
if (!ext) { addSys('Images must be JPG, PNG, GIF, or WEBP.'); return null; }
if (file.size > MAX_IMG_BYTES) { addSys('Images must be 5MB or smaller.'); return null; }
var path = me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
var up = await sb.storage.from('thread-images').upload(path, file, { contentType: file.type, upsert: false });
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
   in the browser's image cache. */
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
var ext = ALLOWED_IMG_TYPES[file.type];
if (!ext) { addSys('Profile pictures must be JPG, PNG, GIF, or WEBP.'); return; }
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
function renderThreadList() {
if (!tpItems) return;
if (!threadsOrder.length) {
tpItems.innerHTML = '<div class="tp-empty">No threads yet. Start one!</div>';
if (tpPages) tpPages.innerHTML = '';
return;
}
var pageCount = Math.max(1, Math.ceil(threadsOrder.length / THREADS_PAGE_SIZE));
if (threadsPage >= pageCount) threadsPage = pageCount - 1; // clamp e.g. after a deletion shrinks the list
if (threadsPage < 0) threadsPage = 0;
var pageIds = threadsOrder.slice(threadsPage * THREADS_PAGE_SIZE, threadsPage * THREADS_PAGE_SIZE + THREADS_PAGE_SIZE);
tpItems.innerHTML = pageIds.map(function (id) {
var t = threadsCache[id]; if (!t) return '';
var n = t.reply_count || 0;
var preview = t.body ? '<div class="tp-preview">' + esc(String(t.body).slice(0, 180)) + '</div>' : '';
/* Catalog-tile order (thumbnail first, like 4chan's catalog) rather than the old text-then-image
   list layout -- see the .tp-thumb size rule in the CSS for why it's a fixed small square now
   instead of a full-width banner. */
var thumb = t.image_url ? '<img class="tp-thumb" src="' + esc(t.image_url) + '" alt="" loading="lazy">' : '';
return '<button type="button" class="tp-item" data-id="' + id + '">' + thumb + '<div class="tp-op">' + esc(t.op_name) + '</div>' + preview +
'<div class="tp-meta">' + n + ' repl' + (n === 1 ? 'y' : 'ies') + ' · ' + timeAgo(t.bumped_at) + '</div></button>';
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
threadsCache[t.id] = t;
if (threadsOrder.indexOf(t.id) === -1) threadsOrder.push(t.id);
threadsOrder.sort(function (a, b) { return new Date(threadsCache[b].bumped_at) - new Date(threadsCache[a].bumped_at); });
renderThreadList();
}
async function loadThreads() {
if (!threadsPanel) return;
var r = await sb.from('threads').select('*').order('bumped_at', { ascending: false }).limit(100);
if (r.error) return; // quiet failure — the board is a bonus feature, never block the main room over it
threadsCache = {}; threadsOrder = [];
r.data.forEach(function (t) { threadsCache[t.id] = t; threadsOrder.push(t.id); });
renderThreadList();
}
function appendThreadPost(p, isOp) {
if (threadPostsSeen[p.id]) return; threadPostsSeen[p.id] = 1;
var postIsAdmin = isAdminId(p.sender_id);
var d = document.createElement('div'); d.className = 'tp-post' + (isOp ? ' op' : '') + (postIsAdmin ? ' admin' : '');
d.dataset.postId = String(p.id);
var html = '<span class="t">' + fmt(p.created_at) + '</span><b>' + esc(p.sender_name) + (isOp ? ' (OP)' : '') + ':</b> ';
if (p.body) html += bodyHtml(p.body);
if (p.image_url) html += (p.body ? '<br>' : '') + '<img class="tp-posted-img" src="' + esc(p.image_url) + '" alt="Image" loading="lazy">';
if (isAdmin) html += ' <button type="button" class="tp-del" data-id="' + esc(String(p.id)) + '" data-op="' + (isOp ? '1' : '0') + '" data-thread="' + esc(String(p.thread_id)) + '" title="' + (isOp ? 'Delete thread' : 'Delete reply') + '" aria-label="' + (isOp ? 'Delete thread' : 'Delete reply') + '">🗑</button>';
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
var img = e.target.closest('img.gif, img.tp-posted-img'); if (img) { openLightbox(img.src); return; }
var b = e.target.closest('.tp-del'); if (!b) return;
e.stopPropagation();
var tid = Number(b.dataset.thread);
if (b.dataset.op === '1') deleteThread(tid);
else deleteThreadPost(Number(b.dataset.id), tid);
};
}
async function openThread(id) {
if (!threadsCache[id]) return;
closeGif();
openThreadId = id; threadPostsSeen = {};
tpList.classList.add('hidden'); tpDetail.classList.remove('hidden');
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
if (tpReplyBody) tpReplyBody.focus();
}
function closeThread() {
openThreadId = null;
closeGif();
tpDetail.classList.add('hidden'); tpList.classList.remove('hidden');
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
var row = { op_id: me.id, op_name: me.name, body: body || null };
if (imageUrl) row.image_url = imageUrl;
var r = await sb.from('threads').insert(row).select().single();
if (r.error) { addSys('Your thread was lost: ' + r.error.message); return; }
tpNewBody.value = ''; clearPendingImage('new'); tpNewPost.classList.add('hidden'); tpNewBtn.classList.remove('hidden');
threadsPage = 0;
upsertThread(r.data);
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
function subscribeThreads() {
if (threadsChannel || !threadsPanel) return;
threadsChannel = sb.channel('threads-board');
threadsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' }, function (p) { upsertThread(p.new); });
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
if (tpNewBtn) {
tpNewBtn.onclick = function () { tpNewPost.classList.remove('hidden'); tpNewBtn.classList.add('hidden'); tpNewBody.focus(); };
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

if (threadToggleBtn) {
threadToggleBtn.onclick = function () {
closeGif();
if (gcRoot.classList.contains('mobile-roulette-open')) closeMobileRoulette();
/* Grab the scroll position BEFORE toggling the class -- that class puts .win at display:none,
   and reading window.scrollY / log.scrollTop after that returns the already-collapsed value
   (effectively 0, since the scrollable content is gone), not where you actually were. That's
   why this kept landing back at the top on the way in: rememberChatScroll() was running too
   late to see anything but zero. */
var opening = !gcRoot.classList.contains('mobile-threads-open');
if (opening) rememberChatScroll();
var open = gcRoot.classList.toggle('mobile-threads-open');
threadToggleBtn.classList.toggle('open', open);
threadToggleBtn.textContent = open ? '💬' : '🧵';
threadToggleBtn.setAttribute('aria-label', open ? 'Back to chat' : 'Open threads board');
if (open) { renderThreadList(); if (!openThreadId) tpList.classList.remove('hidden'); }
else returnToChat();
};
}

/* ---------- roulette teaser: same full-screen treatment on mobile as the threads board ---------- */
var rouletteToggleBtn = $('rouletteToggleBtn');
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
if (gcRoot.classList.contains('mobile-threads-open')) threadToggleBtn.click();
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
function makeFabDraggable(btn, storageKey) {
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
btn.setAttribute('aria-label', 'Bring back the ' + (storageKey.indexOf('roulette') >= 0 ? 'roulette' : 'threads') + ' button');
if (!skipSave) save();
}

btn.addEventListener('pointerdown', function (e) {
if (e.isPrimary === false) return;
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
if (docked) setDocked(edge, btn.getBoundingClientRect().top, true);
else if (freeX != null) setFree(freeX, freeY, true);
}
window.addEventListener('resize', reflow);

try {
var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
freeX = saved.x; freeY = saved.y;
if (saved.docked) setDocked(saved.edge === 'right' ? 'right' : 'left', saved.y, true);
else setFree(saved.x, saved.y, true);
}
} catch (e) {}
}
makeFabDraggable(threadToggleBtn, 'gc_fab_thread');
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
$('saveEmail').focus();
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
sn.focus();
}

async function restoreIdentity() {
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0 || !window.supabase) return;
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
var s = await sb.auth.getSession(); // reads localStorage only -- never creates an account
var user = s.data.session && s.data.session.user;
if (!user) return;
var p = await sb.from('profiles').select('name').eq('user_id', user.id).maybeSingle();
var n = p.data && p.data.name;
if (!n) return;
lockedName = n;
var sn = $('sn');
sn.value = n; sn.readOnly = true; sn.classList.add('locked');
if (!emailMode) $('join').textContent = 'Enter as ' + n;
if ($('snNote')) $('snNote').classList.remove('hidden');
} catch (e) { /* first visit, or storage blocked -- fall through to the normal sign-on */ }
}
restoreIdentity();

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
(emailMode ? adminEmail : (accessCode && !accessCode.value ? accessCode : $('sn'))).focus();
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
async function join() {
/* A returning visitor re-enters under the name this device already holds -- see
   restoreIdentity() below for why the name is pinned rather than re-typed each visit.
   Email sign-on is exempt: that account's real name is looked up after authenticating, so it
   must NOT read the character-name box at all here -- that box is hidden in email mode but can
   still hold stale/invalid leftover text (e.g. from before the "Sign in with email" toggle was
   clicked), which used to fail the name-format check below even though it was never going to be
   used. */
var n = emailMode ? (lockedName || randomName()) : (lockedName || $('sn').value.trim()); fail('');
if (!n) n = randomName();
if (!NAME_RE.test(n)) { fail('2–16 letters (any language), numbers, spaces or . \' -'); return; }
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0) { fail('Backend not configured — edit js/config.js.'); return; }
if (!window.supabase) { fail('Could not load the chat library. Check your connection.'); return; }
var adminEmailVal, adminPasswordVal, keyCode = '';
if (emailMode) {
adminEmailVal = adminEmail.value.trim(); adminPasswordVal = adminPassword.value;
if (!adminEmailVal || !adminPasswordVal) { fail('Enter your email and password.'); return; }
} else {
// Testing is invite-only -- see supabase/access_keys_feature.sql and the verify-access-key
// edge function. Admins signing in with email skip this entirely (the branch above), since
// their credentials already prove who they are.
keyCode = accessCode ? accessCode.value.trim() : '';
if (!keyCode) { fail('Enter your invite key.'); return; }
if (window.turnstile && !turnstileToken) { fail('Please complete the verification check above.'); return; }
}
ensureAudioCtx(); // warm up audio on this user gesture so later sounds aren't blocked by autoplay policy
$('join').disabled = true; setStatus('Signing on...');
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
if (!emailMode) {
var kv = await verifyAccessCode(keyCode);
if (!kv || !kv.ok) {
throw new Error(kv && kv.reason === 'revoked' ? 'This key has been revoked.' : 'Invalid key.');
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
if (!user) { var a = await sb.auth.signInAnonymously(); if (a.error) throw a.error; user = a.data.user; }
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
   anyway, so letting someone into the room would just strand them. */
var claim = await sb.rpc('claim_name', { p_name: n });
if (claim.error) throw claim.error;
if (claim.data && claim.data.ok === false) {
/* A pinned name can only fail here if it went stale (30 days away) and somebody else took it
   in the meantime. Unlock the box rather than stranding them with a name they can't edit. */
if (lockedName) unlockName();
throw new Error(claim.data.reason === 'taken' ? 'That name is already taken.' : 'That name can’t be used. Try a different one.');
}
if (!emailMode) {
// Server-side half of the Turnstile check, plus IP-based fresh-identity churn tracking --
// see supabase/join_ip_log_feature.sql and the verify-join edge function. Fails OPEN on
// anything but an explicit "turnstile_failed" verdict: this is a hardening layer on top of
// the real defense (mute/cooldown is enforced in RLS regardless), not something that should
// lock genuine players out over a network hiccup or a cold-started function.
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
var myProf = await sb.from('profiles').select('avatar_url').eq('user_id', me.id).maybeSingle();
if (!myProf.error && myProf.data && myProf.data.avatar_url) me.avatarUrl = myProf.data.avatar_url;

channel = sb.channel('room:' + (C.ROOM || 'main'), { config: { presence: { key: me.id } } });
channel.on('presence', { event: 'sync' }, function () {
var stt = channel.presenceState(); people = {};
Object.keys(stt).forEach(function (k) { if (stt[k][0]) people[k] = stt[k][0]; });
Object.keys(wins).forEach(function (id) { if (people[id]) { renameWin(id, people[id].name); updateWinAvatar(id); } });
renderPeople();
});
channel.on('presence', { event: 'join' }, function (p) {
if (p.key !== me.id && p.newPresences[0] && !people[p.key]) {
var joinedName = p.newPresences[0].name;
addSys(friends[p.key] ? '★ Your friend ' + joinedName + ' just entered the room!' : joinedName + ' has entered the room.');
playSound('signon');
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
} else {
imSys(b.from, b.name + ' sent you a buzz!'); front(w.el);
w.el.classList.remove('shake'); void w.el.offsetWidth; w.el.classList.add('shake');
}
if (document.hidden) bumpTitle();
});
channel.on('presence', { event: 'leave' }, function (p) { if (p.leftPresences[0]) addSys(p.leftPresences[0].name + ' has left the room.'); });
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room=eq.' + (C.ROOM || 'main') }, function (p) { handleMessage(p.new); });
/* Read receipts: rows naming me as the peer are marks other people set after reading what I sent
   them. INSERT covers the first time someone reads a given whisper conversation, UPDATE covers
   every time after that (dm_reads has one row per pair, upserted in place, not a new row each
   time). Filtered server-side by RLS regardless -- filter here is just to avoid getting handed
   rows this client has no use for. */
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_reads', filter: 'peer_id=eq.' + me.id }, function (p) { handleDmRead(p.new); });
channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_reads', filter: 'peer_id=eq.' + me.id }, function (p) { handleDmRead(p.new); });

var firstSub = true;
await new Promise(function (res, rej) {
channel.subscribe(function (status, err) {
if (status === 'SUBSCRIBED') {
if (firstSub) { firstSub = false; res(); }
else updateMyPresence(); // reconnected after a dropped connection (common on mobile) — re-announce
} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rej(err || new Error('Could not reach the room.'));
});
});
await new Promise(function (r) { setTimeout(r, 400); }); // let presence sync so we can check the name
if (nameTaken(n)) { await channel.unsubscribe(); channel = null; throw new Error('That name is already taken.'); }
var ban = await sb.from('bans').select('reason, expires_at').eq('user_id', me.id).maybeSingle();
if (ban.data && (!ban.data.expires_at || new Date(ban.data.expires_at) > new Date())) { await channel.unsubscribe(); channel = null; throw new Error('You have been removed from this room.' + (ban.data.reason ? ' Reason: ' + ban.data.reason : '')); }
await loadBlocks(); await loadAdmin(); await loadMyModeration(); await loadFriends(); await loadDmReads();
await channel.track({ name: n, status: 'online', awayMsg: '', avatarUrl: me.avatarUrl || '' });

// history: recent room messages plus my recent whispers (RLS makes the server only return what I may see)
var h = await sb.from('messages').select('*').eq('room', C.ROOM || 'main').order('created_at', { ascending: false }).limit(C.HISTORY || 200);
if (h.error) throw h.error;
/* Show the room BEFORE the history goes into it. This used to be the other way round, and a
   hidden element has no layout: every "scroll to the bottom" during the replay was setting
   scrollTop on a box whose scrollHeight was 0, so all of it was silently discarded and the log
   was revealed sitting at the very top, on the oldest message in the backlog. */
$('login').classList.add('hidden'); log.classList.remove('hidden'); $('users').classList.remove('hidden'); $('compose').classList.remove('hidden');
if ($('roomWatermark')) $('roomWatermark').classList.remove('hidden');
replayingHistory = true;
h.data.reverse().forEach(handleMessage);
replayingHistory = false;
/* Badges were accumulated silently during the replay above; paint them once, now, rather than
   re-rendering the whole people list on every one of up to 200 historical messages. */
renderPeople();
Object.keys(wins).forEach(function (id) { updateTab(id); });
if (gcRoot) gcRoot.classList.add('signed-on');
updateUsersStacked(); // the panel only has a size now that it is no longer hidden
if ($('statusBtn')) { $('statusBtn').classList.remove('hidden'); updateStatusBtn(); }
if ($('avaBtn')) { $('avaBtn').classList.remove('hidden'); updateAvaBtn(); }
if ($('moreBtn')) $('moreBtn').classList.remove('hidden');
/* Anonymous accounts live in this browser's storage and nowhere else, so the 🔑 (and the nudge
   below) are only offered to them -- an account with an email attached is already portable. */
isAnonAccount = user.is_anonymous !== false && !user.email;
if ($('saveBtn')) $('saveBtn').classList.toggle('hidden', !isAnonAccount);
setStatus('Signed on as ' + me.name + (isAdmin ? ' (admin)' : ''));
if (st) st.classList.add('renamable');
addSys('Welcome, ' + me.name + '. Tap a name for options, or type /help.');
if (isAnonAccount) addSys('Heads up: ' + me.name + ' and your friends list are saved in this browser only. Tap the 🔑 below to add an email and keep them on any device.');
if (threadsPanel) {
threadsPanel.classList.add('ready');
loadThreads();
subscribeThreads();
if (threadToggleBtn) threadToggleBtn.classList.add('ready');
if (window.matchMedia('(min-width:1340px)').matches) addSys('Tip: there\'s a Threads board to the right — general chat, no topics, post anything.');
else addSys('Tip: tap the 🧵 button in the corner to open the Threads board.');
}
pinLogBottom();
resetIdle();
msg.focus();
} catch (e) {
fail(e.message || String(e)); setStatus('Not signed on'); $('join').disabled = false; me = null;
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
   there's no single-use consumption and no in-app key-management UI.

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
if (accessCode && !accessCode.value) accessCode.focus(); else $('sn').focus();

/* ---------- PWA service worker ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
navigator.serviceWorker.register('./sw.js').then(function (reg) {
reg.update(); // proactively check for a newer sw.js -- iOS Safari in particular can otherwise
// sit on an old service worker (and its cached app shell) for a long time on its own.
}).catch(function () { /* offline shell is optional */ });
}
})();
