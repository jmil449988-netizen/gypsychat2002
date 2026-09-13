/* Gypsy Chat 2000 — app
Backend: Supabase (anonymous auth + Postgres + Realtime).
Same file runs as a website, an installed PWA, or inside a Capacitor shell. */
(function () {
'use strict';
var C = window.GC_CONFIG || {};
var $ = function (id) { return document.getElementById(id); };
var log = $('log'), msg = $('msg'), st = $('st'), cnt = $('cnt'), ulist = $('ulist'), flist = $('flist'), picker = $('picker');
var gifBtn = $('gifBtn'), gifPicker = $('gifPicker'), gifQ = $('gifQ'), gifGo = $('gifGo'), gifResults = $('gifResults');
var tray = $('imTray');
var gcRoot = document.querySelector('.gc-root');
var threadsPanel = $('threadsPanel'), tpList = $('tpList'), tpDetail = $('tpDetail'), tpItems = $('tpItems');
var tpNewBtn = $('tpNewBtn'), tpNewPost = $('tpNewPost'), tpNewBody = $('tpNewBody'), tpNewCancel = $('tpNewCancel'), tpNewSubmit = $('tpNewSubmit');
var tpBack = $('tpBack'), tpPosts = $('tpPosts'), tpReplyBody = $('tpReplyBody'), tpReplySend = $('tpReplySend');
var threadToggleBtn = $('threadToggleBtn'), dmToggleBtn = $('dmToggleBtn');
var tpNewImgBtn = $('tpNewImgBtn'), tpNewImgFile = $('tpNewImgFile'), tpNewGifBtn = $('tpNewGifBtn');
var tpNewPreviewWrap = $('tpNewPreviewWrap'), tpNewPreviewImg = $('tpNewPreviewImg'), tpNewImgRemove = $('tpNewImgRemove');
var tpReplyImgBtn = $('tpReplyImgBtn'), tpReplyImgFile = $('tpReplyImgFile'), tpReplyGifBtn = $('tpReplyGifBtn');
var tpReplyPreviewWrap = $('tpReplyPreviewWrap'), tpReplyPreviewImg = $('tpReplyPreviewImg'), tpReplyImgRemove = $('tpReplyImgRemove');
var adminToggle = $('adminToggle'), adminFields = $('adminFields'), adminEmail = $('adminEmail'), adminPassword = $('adminPassword');

var EMOJI = ['😊','😂','😎','😉','😢','😡','😱','😴','🤔','😍','🙃','😜','🤣','😭','🥺','😏','👍','👎','👋','🙏','💯','🔥','✨','🎉','❤️','💔','💀','👀','🤷','🤯','⚔️','🛡️','🧙','🐉','🏹','💎','🕯️','🌙','🙌','😤'];

var sb = null, me = null, channel = null;
var people = {}; // user id -> presence object {name, status, awayMsg} (from presence)
var wins = {}, unread = {}, seen = {};
var blocked = {}; // user id -> name (people I've blocked)
var friends = {}; // user id -> {name, group} (my buddy list; persists across sessions, independent of who's here now)
var isAdmin = false, bans = {}, mutedUsers = {}; // bans/mutedUsers only loaded for admins
var lastSend = 0;

/* ---------- threads board state (a single flat "general" board, 4chan-style — no topics) ---------- */
var threadsCache = {}; // thread id -> thread row {id, op_id, op_name, body, created_at, bumped_at, reply_count}
var threadsOrder = []; // thread ids, kept sorted by bumped_at desc
var openThreadId = null;
var threadsChannel = null;
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
channel.track({ name: me.name, status: effectiveStatus(), awayMsg: manualStatus === 'away' ? myAwayMsg : '' });
}
function updateStatusBtn() {
var b = $('statusBtn'); if (!b) return;
var eff = effectiveStatus();
b.textContent = '● ' + eff.charAt(0).toUpperCase() + eff.slice(1);
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
['Away', function () { var m = prompt('Away message (optional):', myAwayMsg || ''); if (m === null) return; setMyStatus('away', m.trim()); }],
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
function updateSoundBtn() { var b = $('soundBtn'); if (!b) return; b.textContent = soundMuted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', soundMuted ? 'true' : 'false'); }
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
function fmt(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
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
function fail(t) { $('err').textContent = t; }

/* ---------- spam cooldown / mute ----------
   Real enforcement lives in Postgres (see the gc_check_and_record_send RPC and the
   trg_gc_enforce_moderation trigger on `messages`) so it can't be bypassed by editing this file:
   this client-side state just mirrors what the server told us, to disable the compose box and
   show a countdown without waiting on a round trip for every keystroke. */
var moderation = { cooldownUntil: 0, muted: false, mutedPermanent: false, offenseCount: 0 };
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
bar.textContent = '🔇 Muted for repeated spam. Only an admin can lift this.';
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
document.addEventListener('keydown', function (e) {
if (e.key !== 'Escape') return;
if (!$('warnOverlay').classList.contains('hidden')) $('warnOk').click();
if (!$('infoOverlay').classList.contains('hidden')) $('infoOk').click();
});

/* Giphy CDN links only — keeps the message body allowlist tight so we never turn arbitrary
   pasted URLs into <img> tags. */
var GIF_RE = /^https:\/\/(?:media\d{0,3}\.giphy\.com|i\.giphy\.com)\/media\/[^\s"'<>]+\.gif(?:\?[^\s"'<>]*)?$/i;
function bodyHtml(body) {
  var t = String(body || '').trim();
  if (GIF_RE.test(t)) return '<img class="gif" src="' + esc(t) + '" alt="GIF" loading="lazy">';
  return linkify(wrapEmoji(esc(body)));
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
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them');
d.innerHTML = '<span class="t">' + fmt(m.created_at) + '</span><b class="who" data-id="' + esc(m.sender_id) + '" data-name="' + esc(m.sender_name) + '" tabindex="0">' + esc(m.sender_name) + ':</b> ' + bodyHtml(m.body);
var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
log.appendChild(d); if (atBottom || mine) log.scrollTop = log.scrollHeight;
if (!mine && document.hidden) bumpTitle();
}
function handleMessage(m) { if (blocked[m.sender_id]) return; if (m.recipient_id) renderIM(m); else renderRoom(m); }

/* ---------- presence list ---------- */
function renderPeople() {
var ids = Object.keys(people).sort(function (a, b) { return people[a].name.localeCompare(people[b].name); });
ulist.innerHTML = ids.map(function (id) {
var p = people[id], isSelf = id === me.id, status = p.status || 'online';
var showStatus = !isSelf && !blocked[id] && status !== 'online';
var classes = [isSelf ? 'self' : (blocked[id] ? 'blocked' : (unread[id] ? 'unread' : ''))];
if (showStatus) classes.push('st-' + status);
var tag = showStatus ? ' <span class="stag">(' + status + ')</span>' : '';
var title = (status === 'away' && p.awayMsg) ? ' title="' + esc(p.awayMsg) + '"' : '';
return '<div class="' + classes.join(' ').trim() + '" tabindex="' + (isSelf ? -1 : 0) + '" data-id="' + esc(id) + '"' + title + '>' + esc(p.name) + tag + '</div>';
}).join('');
cnt.textContent = ids.length + ' online';
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
var cls = online ? ('f-' + status) : 'f-offline';
var suffix = online ? (status !== 'online' ? ' <span class="off">(' + status + ')</span>' : '') : ' <span class="off">(offline)</span>';
return '<div class="' + cls + '" tabindex="0" data-id="' + esc(id) + '">' + esc(label) + suffix + '</div>';
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
el.innerHTML = '<div class="bar"><span class="gem"></span><span class="nm"></span><button class="buzz" type="button" title="Buzz" aria-label="Buzz ' + esc(name) + '">⚡</button><button class="x" type="button" aria-label="Minimize">–</button></div>' +
'<div class="ilog" aria-live="polite"></div><div class="icomp"><textarea maxlength="500"></textarea><button class="btn" type="button">Send</button></div>';
el.querySelector('.nm').textContent = name;
var win = { el: el, log: el.querySelector('.ilog'), ta: el.querySelector('textarea'), gone: !people[id], name: name, minimized: true, tab: null };
win.ta.placeholder = 'Whisper to ' + name + '...';
var off = (nWin++ % 6) * 24; el.style.left = (30 + off) + 'px'; el.style.top = (70 + off) + 'px';
el.querySelector('.x').onclick = function () { minimizeIM(id); };
el.querySelector('.buzz').onclick = function () { sendBuzz(id); };
el.querySelector('.icomp .btn').onclick = function () { sendIM(id); };
win.ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIM(id); } if (e.key === 'Escape') minimizeIM(id); };
el.addEventListener('pointerdown', function () { front(el); });
var bar = el.querySelector('.bar');
bar.addEventListener('pointerdown', function (e) {
if (e.target.classList.contains('x') || e.target.classList.contains('buzz') || window.innerWidth <= 430) return;
var sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop; bar.setPointerCapture(e.pointerId);
function mv(ev) { el.style.left = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - sx)) + 'px'; el.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - sy)) + 'px'; }
function up() { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); }
bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
});
$('ims').appendChild(el); wins[id] = win;
makeTab(id); updateTab(id); // tab starts visible (win starts minimized) regardless of who the first message is from
return win;
}
function makeTab(id) {
var w = wins[id];
var b = document.createElement('button'); b.type = 'button'; b.className = 'im-tab hidden';
b.innerHTML = '<span class="env" aria-hidden="true">✉</span><span class="nm"></span><span class="badge hidden">0</span>';
b.querySelector('.nm').textContent = w.name;
b.setAttribute('aria-label', 'Open whisper with ' + w.name);
b.onclick = function () { openIM(id, w.name, true); };
tray.appendChild(b);
w.tab = b;
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
if (w.tab) { w.tab.querySelector('.nm').textContent = name; w.tab.setAttribute('aria-label', 'Open whisper with ' + name); }
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
unread[id] = 0; renderPeople();
updateTab(id);
if (focus) w.ta.focus();
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
var otherId = mine ? m.recipient_id : m.sender_id;
var otherName = mine ? ((people[otherId] && people[otherId].name) || m.recipient_name || 'unknown') : m.sender_name;
var w = ensureWin(otherId, otherName); // never pops the window open on its own — see note above
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them');
d.innerHTML = '<span class="t">' + fmt(m.created_at) + '</span><b>' + esc(m.sender_name) + ':</b> ' + bodyHtml(m.body);
w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight;
if (!mine) {
if (w.minimized || document.activeElement !== w.ta) { unread[otherId] = (unread[otherId] || 0) + 1; renderPeople(); updateTab(otherId); }
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
items.push(['Report', function () { var rr = prompt('Report ' + name + ' for: (e.g. spam, harassment)'); if (rr !== null && rr.trim()) report(id, name, rr.trim()); }]);
items.push(friends[id] ? ['Remove Friend', function () { removeFriend(id, name); }] : ['Add Friend', function () { addFriend(id, name); }]);
if (friends[id]) items.push(['Move to Group', function () { var g = prompt('Group name (blank for none):', friends[id].group || ''); if (g !== null) moveFriendGroup(id, g.trim()); }]);
/* Kick/Mute/Unmute don't require the target to still be online — most of the time an admin is
   acting on something said in the chat log by someone who has since left the room. */
if (isAdmin && mutedUsers[id]) items.push(['Unmute', function () { unmute(id, name); }]);
if (isAdmin && !mutedUsers[id]) items.push(['Mute', function () { muteUser(id, name); }, 'danger']);
if (isAdmin) items.push(['Kick', function () { var r = prompt('Reason for kicking ' + name + '? (optional)'); if (r !== null) kick(id, name, r); }, 'danger']);
menu.innerHTML = '<div class="hd">' + esc(name) + '</div>' + items.map(function (it, i) { return '<button type="button" role="menuitem" class="' + (it[2] || '') + '" data-i="' + i + '">' + it[0] + '</button>'; }).join('');
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

/* ---------- report abuse ---------- */
async function report(id, name, reason) {
var r = await sb.from('reports').insert({ reporter_id: me.id, reporter_name: me.name, reported_id: id, reported_name: name, reason: sanitizeInput(reason).slice(0, 300) });
if (r.error) { addSys('Could not send report: ' + r.error.message); return; }
addSys('Report sent. Thank you — an admin will review it.');
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
var a = await sb.from('admins').select('user_id').eq('user_id', me.id).maybeSingle();
isAdmin = !!(a.data && !a.error);
if (isAdmin) {
var b = await sb.from('bans').select('user_id, banned_name, expires_at'); if (!b.error) b.data.forEach(function (x) { bans[x.user_id] = x; });
var mu = await sb.from('chat_moderation').select('user_id, user_name, muted, muted_permanent, offense_count').eq('muted', true);
if (!mu.error) mu.data.forEach(function (x) { mutedUsers[x.user_id] = x; });
}
}
async function loadMyModeration() {
var r = await sb.from('chat_moderation').select('*').eq('user_id', me.id).maybeSingle();
if (r.error || !r.data) return;
var row = r.data;
applyModeration({
muted: !!row.muted, mutedPermanent: !!row.muted_permanent, offenseCount: row.offense_count || 0,
cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0
});
}
/* ---------- unmute (admins only) ---------- */
async function unmute(id, name) {
var r = await sb.from('chat_moderation').update({ muted: false, muted_permanent: false, cooldown_until: null, cooldown_seconds: 0, offense_count: 0, window_count: 0, window_start: null }).eq('user_id', id);
if (r.error) { addSys('Could not unmute: ' + r.error.message); return; }
delete mutedUsers[id]; addSys(name + ' has been unmuted.');
}
/* ---------- mute (admins only) — muting someone who has never tripped the spam filter has no
   row in chat_moderation yet, so this upserts one straight to muted=permanent. ---------- */
async function muteUser(id, name) {
var r = await sb.from('chat_moderation').upsert({ user_id: id, user_name: name, muted: true, muted_permanent: true, muted_at: new Date().toISOString() }, { onConflict: 'user_id' });
if (r.error) { addSys('Could not mute: ' + r.error.message); return; }
mutedUsers[id] = { user_id: id, user_name: name, muted: true, muted_permanent: true };
addSys(name + ' has been muted. Only an admin can lift it.');
}
async function kick(id, name, reason) {
var r = await sb.from('bans').upsert({ user_id: id, banned_name: name, reason: reason || null, banned_by: me.id });
if (r.error) { addSys('Could not kick: ' + r.error.message); return; }
bans[id] = { user_id: id, banned_name: name };
await channel.send({ type: 'broadcast', event: 'kick', payload: { user_id: id, name: name, reason: reason || '', by: me.name } });
}
async function unban(id, name) {
var r = await sb.from('bans').delete().eq('user_id', id);
if (r.error) { addSys('Could not lift the ban: ' + r.error.message); return; }
delete bans[id]; addSys(name + ' may return.');
}
function kicked(reason) {
if (channel) { channel.unsubscribe(); channel = null; }
unsubscribeThreads();
if (threadsPanel) { threadsPanel.classList.remove('ready'); }
if (threadToggleBtn) { threadToggleBtn.classList.remove('ready', 'open'); threadToggleBtn.textContent = '🧵'; threadToggleBtn.setAttribute('aria-label', 'Open threads board'); }
if (gcRoot) { gcRoot.classList.remove('thread-open'); gcRoot.classList.remove('mobile-threads-open'); }
openThreadId = null;
clearTimeout(idleTimer);
log.classList.add('hidden'); $('users').classList.add('hidden'); $('compose').classList.add('hidden');
if ($('statusBtn')) $('statusBtn').classList.add('hidden');
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
applyModeration({ muted: d.reason === 'muted', mutedPermanent: !!d.permanent, offenseCount: d.offense_count || moderation.offenseCount, cooldownUntil: cdUntil });
warnPopup(d.offense_count || moderation.offenseCount, d.reason === 'muted', !!d.permanent, d.cooldown_seconds || 0);
return;
}
var row = { room: C.ROOM || 'main', sender_id: me.id, sender_name: me.name, body: sanitizeInput(body).slice(0, 500) };
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
case 'help': addSys('Commands: /w name msg · /block name · /unblock name · /blocks · /addfriend name · /removefriend name · /movegroup name group · /friends · /setbio text · /report name reason · /whoami' + (isAdmin ? ' · /kick name [reason] · /unban name · /bans · /mute name · /unmute name · /muted · /reports' : '') + '. Click a name in the chat log or Online list for options. Click your status pill (bottom bar) to go Away/Busy. The ⚡ in a whisper window sends a buzz.'); return true;
case 'gif': openGifPicker(rest ? m[2] + ' ' + rest : arg, 'main', gifBtn); return true;
case 'block': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot block yourself.'); return true; } block(id, people[id].name); return true;
case 'unblock': id = Object.keys(blocked).filter(function (k) { return (blocked[k] || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not blocked anyone named ' + arg + '.'); return true; } unblock(id); return true;
case 'blocks': var bl = Object.keys(blocked).map(function (k) { return blocked[k]; }); addSys(bl.length ? 'Blocked: ' + bl.join(', ') : 'You have blocked no one.'); return true;
case 'addfriend': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot add yourself as a friend.'); return true; } if (friends[id]) { addSys(people[id].name + ' is already on your friends list.'); return true; } addFriend(id, people[id].name); return true;
case 'removefriend': id = Object.keys(friends).filter(function (k) { return (friends[k].name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not added a friend named ' + arg + '.'); return true; } removeFriend(id, friends[id].name); return true;
case 'movegroup': id = Object.keys(friends).filter(function (k) { return (friends[k].name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not added a friend named ' + arg + '.'); return true; } moveFriendGroup(id, rest); return true;
case 'friends': var fl = Object.keys(friends).map(function (k) { return friends[k].name + (people[k] ? ' (online)' : ' (offline)') + (friends[k].group ? ' [' + friends[k].group + ']' : ''); }); addSys(fl.length ? 'Friends: ' + fl.join(', ') : 'You have no friends added yet.'); return true;
case 'setbio': case 'bio': var bioText = rest ? (arg + ' ' + rest) : arg; if (!bioText) { addSys('Usage: /setbio your text here'); return true; } var rb = await sb.from('profiles').upsert({ user_id: me.id, bio: sanitizeInput(bioText).slice(0, 300), updated_at: new Date().toISOString() }); if (rb.error) { addSys('Could not save your info: ' + rb.error.message); return true; } addSys('Your profile info has been updated.'); return true;
case 'report': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot report yourself.'); return true; } if (!rest) { addSys('Usage: /report name reason'); return true; } report(id, people[id].name, rest); return true;
case 'kick': if (!isAdmin) { addSys('Only an admin may kick.'); return true; } id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot kick yourself.'); return true; } kick(id, people[id].name, rest); return true;
case 'unban': if (!isAdmin) { addSys('Only an admin may lift bans.'); return true; } id = Object.keys(bans).filter(function (k) { return (bans[k].banned_name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('No ban found for ' + arg + '.'); return true; } unban(id, arg); return true;
case 'bans': if (!isAdmin) return true; var bn = Object.keys(bans).map(function (k) { return bans[k].banned_name || k; }); addSys(bn.length ? 'Banned: ' + bn.join(', ') : 'No one is banned.'); return true;
case 'mute': if (!isAdmin) { addSys('Only an admin may mute.'); return true; } id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot mute yourself.'); return true; } muteUser(id, people[id].name); return true;
case 'unmute': if (!isAdmin) { addSys('Only an admin may unmute.'); return true; } id = Object.keys(mutedUsers).filter(function (k) { return (mutedUsers[k].user_name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('No active mute found for ' + arg + '.'); return true; } unmute(id, mutedUsers[id].user_name || arg); return true;
case 'muted': if (!isAdmin) return true; var mn = Object.keys(mutedUsers).map(function (k) { return mutedUsers[k].user_name || k; }); addSys(mn.length ? 'Muted: ' + mn.join(', ') : 'No one is muted.'); return true;
case 'reports': if (!isAdmin) return true; var rp = await sb.from('reports').select('reporter_name, reported_name, reason, created_at').order('created_at', { ascending: false }).limit(10); if (rp.error) { addSys('Could not load reports: ' + rp.error.message); return true; } if (!rp.data.length) { addSys('No reports.'); return true; } rp.data.forEach(function (x) { addSys('[' + fmt(x.created_at) + '] ' + x.reporter_name + ' reported ' + x.reported_name + ': ' + x.reason); }); return true;
default: addSys('Unknown command. Type /help.'); return true;
}
}
async function send() {
var t = msg.value.trim(); if (!t || !me) return;
if (t[0] === '/' && !/^\/w(hisper)?\s/i.test(t)) { msg.value = ''; await command(t); return; }
var w = t.match(/^\/w(?:hisper)?\s+(\S+)\s*([\s\S]*)$/i);
if (w) {
var id = Object.keys(people).filter(function (k) { return people[k].name.toLowerCase() === w[1].toLowerCase(); })[0];
if (!id) { addSys('No one here is named ' + w[1] + '.'); return; }
if (id === me.id) { addSys('You cannot whisper to yourself.'); return; }
if (blocked[id]) { addSys('You have blocked ' + people[id].name + '. Unblock them first.'); return; }
msg.value = ''; var win = openIM(id, people[id].name, true);
if (w[2].trim()) { win.ta.value = w[2].trim(); sendIM(id); }
return;
}
msg.value = ''; await post(t); msg.focus();
}
$('send').onclick = send;
msg.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

/* ---------- emoji picker ---------- */
EMOJI.forEach(function (ch) {
var b = document.createElement('button'); b.textContent = ch; b.type = 'button'; b.setAttribute('role', 'option');
b.onclick = function () {
var s = msg.selectionStart || msg.value.length;
msg.value = msg.value.slice(0, s) + ch + msg.value.slice(s);
picker.classList.remove('open'); msg.focus(); msg.selectionStart = msg.selectionEnd = s + ch.length;
};
picker.appendChild(b);
});
$('emoBtn').onclick = function () { gifPicker.classList.remove('open'); picker.classList.toggle('open'); };
document.addEventListener('click', function (e) { if (!picker.contains(e.target) && e.target !== $('emoBtn')) picker.classList.remove('open'); });

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
var full = (images.fixed_height || images.original || images.fixed_width || {}).url;
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
if (!C.GIPHY_API_KEY) { gifResults.innerHTML = '<div class="gmsg">GIF search isn\'t configured yet — add GIPHY_API_KEY to js/config.js.</div>'; return; }
var seq = ++gifSeq;
gifResults.innerHTML = '<div class="gmsg">Searching…</div>';
var base = q ? 'https://api.giphy.com/v1/gifs/search?q=' + encodeURIComponent(q) : 'https://api.giphy.com/v1/gifs/trending?';
var url = base + '&api_key=' + encodeURIComponent(C.GIPHY_API_KEY) + '&limit=18&rating=pg-13&lang=en';
try {
var res = await fetch(url);
var data = await res.json();
if (seq !== gifSeq) return;
if (!res.ok) { gifResults.innerHTML = '<div class="gmsg">' + esc((data.meta && data.meta.msg) || 'Giphy error.') + '</div>'; return; }
renderGifResults(data.data || []);
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

/* ---------- pictures in threads: upload your own image, or reuse the Giphy picker above ----------
   Uploaded images go to the public "thread-images" Storage bucket under a path prefixed with your
   own user id (storage.objects RLS only allows writing there); a picked GIF just reuses its Giphy
   CDN URL. Either way the result is a plain URL stored in the thread/post's image_url column. */
function setPendingImage(which, url) {
if (which === 'new') { tpNewImageUrl = url; tpNewPreviewImg.src = url; tpNewPreviewWrap.classList.remove('hidden'); }
else { tpReplyImageUrl = url; tpReplyPreviewImg.src = url; tpReplyPreviewWrap.classList.remove('hidden'); }
}
function clearPendingImage(which) {
if (which === 'new') { tpNewImageUrl = null; tpNewPreviewImg.src = ''; tpNewPreviewWrap.classList.add('hidden'); tpNewImgFile.value = ''; }
else { tpReplyImageUrl = null; tpReplyPreviewImg.src = ''; tpReplyPreviewWrap.classList.add('hidden'); tpReplyImgFile.value = ''; }
}
async function uploadThreadImage(file) {
if (!file) return null;
var ext = ALLOWED_IMG_TYPES[file.type];
if (!ext) { addSys('Images must be JPG, PNG, GIF, or WEBP.'); return null; }
if (file.size > MAX_IMG_BYTES) { addSys('Images must be 5MB or smaller.'); return null; }
var path = me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
var up = await sb.storage.from('thread-images').upload(path, file, { contentType: file.type, upsert: false });
if (up.error) { addSys('Image upload failed: ' + up.error.message); return null; }
var pub = sb.storage.from('thread-images').getPublicUrl(path);
return (pub.data && pub.data.publicUrl) || null;
}
function renderThreadList() {
if (!tpItems) return;
if (!threadsOrder.length) { tpItems.innerHTML = '<div class="tp-empty">No threads yet. Start one!</div>'; return; }
tpItems.innerHTML = threadsOrder.map(function (id) {
var t = threadsCache[id]; if (!t) return '';
var n = t.reply_count || 0;
var preview = t.body ? '<div class="tp-preview">' + esc(String(t.body).slice(0, 180)) + '</div>' : '';
var thumb = t.image_url ? '<img class="tp-thumb" src="' + esc(t.image_url) + '" alt="" loading="lazy">' : '';
return '<button type="button" class="tp-item" data-id="' + id + '"><div class="tp-op">' + esc(t.op_name) + '</div>' + preview + thumb +
'<div class="tp-meta">' + n + ' repl' + (n === 1 ? 'y' : 'ies') + ' · ' + timeAgo(t.bumped_at) + '</div></button>';
}).join('');
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
var d = document.createElement('div'); d.className = 'tp-post' + (isOp ? ' op' : '');
d.dataset.postId = String(p.id);
var html = '<span class="t">' + fmt(p.created_at) + '</span><b>' + esc(p.sender_name) + (isOp ? ' (OP)' : '') + ':</b> ';
if (p.body) html += bodyHtml(p.body);
if (p.image_url) html += (p.body ? '<br>' : '') + '<img class="tp-posted-img" src="' + esc(p.image_url) + '" alt="Image" loading="lazy">';
if (isAdmin) html += ' <button type="button" class="tp-del" data-id="' + esc(String(p.id)) + '" data-op="' + (isOp ? '1' : '0') + '" data-thread="' + esc(String(p.thread_id)) + '" title="' + (isOp ? 'Delete thread' : 'Delete reply') + '" aria-label="' + (isOp ? 'Delete thread' : 'Delete reply') + '">🗑</button>';
d.innerHTML = html;
var atBottom = tpPosts.scrollHeight - tpPosts.scrollTop - tpPosts.clientHeight < 60;
tpPosts.appendChild(d);
if (atBottom) tpPosts.scrollTop = tpPosts.scrollHeight;
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
if (gcRoot) gcRoot.classList.add('thread-open');
tpPosts.innerHTML = '<div class="tp-loading">Loading…</div>';
var t = threadsCache[id];
var r = await sb.from('thread_posts').select('*').eq('thread_id', id).order('created_at', { ascending: true }).limit(500);
if (openThreadId !== id) return; // closed/switched while the query was in flight
tpPosts.innerHTML = '';
appendThreadPost({ id: 'op-' + id, sender_name: t.op_name, body: t.body, image_url: t.image_url, created_at: t.created_at, thread_id: id }, true);
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
applyModeration({ muted: d.reason === 'muted', mutedPermanent: !!d.permanent, offenseCount: d.offense_count || moderation.offenseCount, cooldownUntil: cdUntil });
warnPopup(d.offense_count || moderation.offenseCount, d.reason === 'muted', !!d.permanent, d.cooldown_seconds || 0);
return false;
}
return true;
}
async function submitNewThread() {
var body = sanitizeInput(tpNewBody.value).trim().slice(0, 500);
var imageUrl = tpNewImageUrl;
if (!body && !imageUrl) return;
if (!(await threadGate())) return;
var row = { op_id: me.id, op_name: me.name, body: body || null };
if (imageUrl) row.image_url = imageUrl;
var r = await sb.from('threads').insert(row).select().single();
if (r.error) { addSys('Your thread was lost: ' + r.error.message); return; }
tpNewBody.value = ''; clearPendingImage('new'); tpNewPost.classList.add('hidden'); tpNewBtn.classList.remove('hidden');
upsertThread(r.data);
openThread(r.data.id);
}
async function submitReply() {
if (!openThreadId) return;
var body = sanitizeInput(tpReplyBody.value).trim().slice(0, 500);
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
tpItems.onclick = function (e) { var b = e.target.closest('.tp-item'); if (!b) return; openThread(Number(b.dataset.id)); };
tpBack.onclick = closeThread;
tpReplySend.onclick = submitReply;
tpReplyBody.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } };
}
if (tpNewImgBtn) {
tpNewImgBtn.onclick = function () { tpNewImgFile.click(); };
tpNewImgFile.onchange = async function () {
var f = tpNewImgFile.files && tpNewImgFile.files[0]; if (!f) return;
tpNewImgBtn.disabled = true;
var url = await uploadThreadImage(f);
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
var url = await uploadThreadImage(f);
tpReplyImgBtn.disabled = false;
if (url) setPendingImage('reply', url); else tpReplyImgFile.value = '';
};
tpReplyImgRemove.onclick = function () { clearPendingImage('reply'); };
tpReplyGifBtn.onclick = function () { openGifPicker('', 'thread-reply', tpReplyGifBtn); };
}
/* mobile toggle: below the 1340px breakpoint there's no blank space for a persistent side panel,
   so a floating button swaps the whole screen between the chat window and the threads board. */
if (threadToggleBtn) {
threadToggleBtn.onclick = function () {
closeGif();
var open = gcRoot.classList.toggle('mobile-threads-open');
threadToggleBtn.classList.toggle('open', open);
threadToggleBtn.textContent = open ? '💬' : '🧵';
threadToggleBtn.setAttribute('aria-label', open ? 'Back to chat' : 'Open threads board');
if (open) { renderThreadList(); if (!openThreadId) tpList.classList.remove('hidden'); }
};
}

/* ---------- sign on ---------- */
var adminMode = false;
if (adminToggle) {
adminToggle.onclick = function () {
adminMode = !adminMode;
adminFields.classList.toggle('hidden', !adminMode);
$('join').textContent = adminMode ? 'Login as Admin' : 'Enter the room';
adminToggle.textContent = adminMode ? 'Use a character name instead' : 'Admin login';
fail('');
(adminMode ? adminEmail : $('sn')).focus();
};
}
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
var n = $('sn').value.trim(); fail('');
if (!n) n = randomName();
if (!/^[\w .'-]{2,16}$/.test(n)) { fail('2–16 letters, numbers, spaces or . \' -'); return; }
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0) { fail('Backend not configured — edit js/config.js.'); return; }
if (!window.supabase) { fail('Could not load the chat library. Check your connection.'); return; }
var adminEmailVal, adminPasswordVal;
if (adminMode) {
adminEmailVal = adminEmail.value.trim(); adminPasswordVal = adminPassword.value;
if (!adminEmailVal || !adminPasswordVal) { fail('Enter your admin email and password.'); return; }
}
ensureAudioCtx(); // warm up audio on this user gesture so later sounds aren't blocked by autoplay policy
$('join').disabled = true; setStatus('Signing on...');
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
var user;
if (adminMode) {
var pw = await sb.auth.signInWithPassword({ email: adminEmailVal, password: adminPasswordVal });
if (pw.error) throw pw.error;
user = pw.data.user;
} else {
var s = await sb.auth.getSession();
user = s.data.session && s.data.session.user;
if (!user) { var a = await sb.auth.signInAnonymously(); if (a.error) throw a.error; user = a.data.user; }
}
await sb.auth.updateUser({ data: { name: n } });
await sb.auth.refreshSession(); // updateUser() above doesn't rotate the JWT; refresh so auth.jwt() carries the new name for RLS checks
me = { id: user.id, name: n };
manualStatus = 'online'; myAwayMsg = ''; autoIdle = false; awayReplied = {};

channel = sb.channel('room:' + (C.ROOM || 'main'), { config: { presence: { key: me.id } } });
channel.on('presence', { event: 'sync' }, function () {
var stt = channel.presenceState(); people = {};
Object.keys(stt).forEach(function (k) { if (stt[k][0]) people[k] = stt[k][0]; });
Object.keys(wins).forEach(function (id) { if (people[id]) renameWin(id, people[id].name); });
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
await loadBlocks(); await loadAdmin(); await loadMyModeration(); await loadFriends();
await channel.track({ name: n, status: 'online', awayMsg: '' });

// history: recent room messages plus my recent whispers (RLS makes the server only return what I may see)
var h = await sb.from('messages').select('*').eq('room', C.ROOM || 'main').order('created_at', { ascending: false }).limit(C.HISTORY || 200);
if (h.error) throw h.error;
h.data.reverse().forEach(handleMessage);

$('login').classList.add('hidden'); log.classList.remove('hidden'); $('users').classList.remove('hidden'); $('compose').classList.remove('hidden');
if ($('statusBtn')) { $('statusBtn').classList.remove('hidden'); updateStatusBtn(); }
setStatus('Signed on as ' + me.name + (isAdmin ? ' (admin)' : ''));
addSys('Welcome, ' + me.name + '. Tap a name for options, or type /help.');
if (threadsPanel) {
threadsPanel.classList.add('ready');
loadThreads();
subscribeThreads();
if (threadToggleBtn) threadToggleBtn.classList.add('ready');
if (window.matchMedia('(min-width:1340px)').matches) addSys('Tip: there\'s a Threads board to the right — general chat, no topics, post anything.');
else addSys('Tip: tap the 🧵 button in the corner to open the Threads board.');
}
resetIdle();
msg.focus();
} catch (e) {
fail(e.message || String(e)); setStatus('Not signed on'); $('join').disabled = false; me = null;
}
}
$('join').onclick = join;
$('sn').onkeydown = function (e) { if (e.key === 'Enter') join(); };
if (adminEmail) adminEmail.onkeydown = function (e) { if (e.key === 'Enter') join(); };
if (adminPassword) adminPassword.onkeydown = function (e) { if (e.key === 'Enter') join(); };
$('sn').focus();

/* ---------- PWA service worker ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
navigator.serviceWorker.register('./sw.js').then(function (reg) {
reg.update(); // proactively check for a newer sw.js -- iOS Safari in particular can otherwise
// sit on an old service worker (and its cached app shell) for a long time on its own.
}).catch(function () { /* offline shell is optional */ });
}
})();
