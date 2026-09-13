/* Gypsy Chat 2000 — app
Backend: Supabase (anonymous auth + Postgres + Realtime).
Same file runs as a website, an installed PWA, or inside a Capacitor shell. */
(function () {
'use strict';
var C = window.GC_CONFIG || {};
var $ = function (id) { return document.getElementById(id); };
var log = $('log'), msg = $('msg'), st = $('st'), cnt = $('cnt'), ulist = $('ulist'), picker = $('picker');
var gifBtn = $('gifBtn'), gifPicker = $('gifPicker'), gifQ = $('gifQ'), gifGo = $('gifGo'), gifResults = $('gifResults');

var EMOJI = ['😊','😂','😎','😉','😢','😡','😱','😴','🤔','😍','🙃','😜','🤣','😭','🥺','😏','👍','👎','👋','🙏','💯','🔥','✨','🎉','❤️','💔','💀','👀','🤷','🤯','⚔️','🛡️','🧙','🐉','🏹','💎','🕯️','🌙','🙌','😤'];

var sb = null, me = null, channel = null;
var people = {}; // user id -> name (from presence)
var wins = {}, unread = {}, seen = {};
var blocked = {}; // user id -> name (people I've blocked)
var isAdmin = false, bans = {}; // bans only loaded for admins
var lastSend = 0;

/* ---------- helpers ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function fmt(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function wrapEmoji(h) { return h.replace(/(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu, '<span class="e">$1</span>'); }
function setStatus(t) { st.textContent = t; }
function fail(t) { $('err').textContent = t; }

/* Giphy CDN links only — keeps the message body allowlist tight so we never turn arbitrary
   pasted URLs into <img> tags. */
var GIF_RE = /^https:\/\/(?:media\d{0,3}\.giphy\.com|i\.giphy\.com)\/media\/[^\s"'<>]+\.gif(?:\?[^\s"'<>]*)?$/i;
function bodyHtml(body) {
  var t = String(body || '').trim();
  if (GIF_RE.test(t)) return '<img class="gif" src="' + esc(t) + '" alt="GIF" loading="lazy">';
  return wrapEmoji(esc(body));
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
d.innerHTML = '<span class="t">' + fmt(m.created_at) + '</span><b>' + esc(m.sender_name) + ':</b> ' + bodyHtml(m.body);
var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
log.appendChild(d); if (atBottom || mine) log.scrollTop = log.scrollHeight;
}
function handleMessage(m) { if (blocked[m.sender_id]) return; if (m.recipient_id) renderIM(m); else renderRoom(m); }

/* ---------- presence list ---------- */
function renderPeople() {
var ids = Object.keys(people).sort(function (a, b) { return people[a].localeCompare(people[b]); });
ulist.innerHTML = ids.map(function (id) {
var c = id === me.id ? 'self' : (blocked[id] ? 'blocked' : (unread[id] ? 'unread' : ''));
return '<div class="' + c + '" tabindex="' + (id === me.id ? -1 : 0) + '" data-id="' + esc(id) + '">' + esc(people[id]) + '</div>';
}).join('');
cnt.textContent = ids.length + ' present';
Object.keys(wins).forEach(function (id) {
var w = wins[id], here = !!people[id];
if (!here && !w.gone) { w.gone = true; imSys(id, w.name + ' has left the room.'); }
if (here && w.gone) { w.gone = false; imSys(id, w.name + ' is back.'); }
});
}
function nameTaken(n) { return Object.keys(people).some(function (id) { return id !== me.id && people[id].toLowerCase() === n.toLowerCase(); }); }

/* ---------- whisper windows (keyed by user id) ---------- */
var zTop = 20, nWin = 0;
function openIM(id, name, focus) {
if (wins[id]) { front(wins[id].el); if (focus) wins[id].ta.focus(); return wins[id]; }
var el = document.createElement('div'); el.className = 'im'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Whisper with ' + name);
el.innerHTML = '<div class="bar"><span class="gem"></span><span class="nm"></span><button class="x" type="button" aria-label="Close">×</button></div>' +
'<div class="ilog" aria-live="polite"></div><div class="icomp"><textarea maxlength="500"></textarea><button class="btn" type="button">Send</button></div>';
el.querySelector('.nm').textContent = name;
var win = { el: el, log: el.querySelector('.ilog'), ta: el.querySelector('textarea'), gone: !people[id], name: name };
win.ta.placeholder = 'Whisper to ' + name + '...';
var off = (nWin++ % 6) * 24; el.style.left = (30 + off) + 'px'; el.style.top = (70 + off) + 'px';
el.querySelector('.x').onclick = function () { el.remove(); delete wins[id]; msg.focus(); };
el.querySelector('.icomp .btn').onclick = function () { sendIM(id); };
win.ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIM(id); } if (e.key === 'Escape') el.querySelector('.x').click(); };
el.addEventListener('pointerdown', function () { front(el); });
var bar = el.querySelector('.bar');
bar.addEventListener('pointerdown', function (e) {
if (e.target.classList.contains('x') || window.innerWidth <= 430) return;
var sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop; bar.setPointerCapture(e.pointerId);
function mv(ev) { el.style.left = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - sx)) + 'px'; el.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - sy)) + 'px'; }
function up() { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); }
bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
});
$('ims').appendChild(el); wins[id] = win; front(el);
unread[id] = 0; renderPeople();
if (focus) win.ta.focus();
return win;
}
function front(el) { el.style.zIndex = ++zTop; }
function imSys(id, text) { var w = wins[id]; if (!w) return; var d = document.createElement('div'); d.className = 'm sys'; d.textContent = text; w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight; }
function renderIM(m) {
if (seen[m.id]) return; seen[m.id] = 1;
var mine = m.sender_id === me.id;
var otherId = mine ? m.recipient_id : m.sender_id;
var otherName = mine ? (people[otherId] || m.recipient_name || 'unknown') : m.sender_name;
var w = openIM(otherId, otherName, false);
var d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them');
d.innerHTML = '<span class="t">' + fmt(m.created_at) + '</span><b>' + esc(m.sender_name) + ':</b> ' + bodyHtml(m.body);
w.log.appendChild(d); w.log.scrollTop = w.log.scrollHeight;
if (!mine && document.activeElement !== w.ta) { unread[otherId] = (unread[otherId] || 0) + 1; renderPeople(); front(w.el); }
}
async function sendIM(id) {
var w = wins[id]; var t = w.ta.value.trim(); if (!t) return;
if (w.gone) { imSys(id, w.name + ' is not here to hear you.'); return; }
w.ta.value = '';
await post(t, id, w.name);
w.ta.focus();
}
/* ---------- name menu: Whisper / Block / Kick ---------- */
var menu = document.createElement('div'); menu.className = 'nmenu'; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
function closeMenu() { menu.classList.remove('open'); }
function openMenu(id, anchor) {
var name = people[id]; if (!name) return;
var items = [];
if (!blocked[id]) items.push(['Whisper', function () { unread[id] = 0; openIM(id, name, true); }]);
items.push(blocked[id] ? ['Unblock', function () { unblock(id); }] : ['Block', function () { block(id, name); }]);
if (isAdmin) items.push(['Kick', function () { var r = prompt('Reason for kicking ' + name + '? (optional)'); if (r !== null) kick(id, name, r); }, 'danger']);
menu.innerHTML = '<div class="hd">' + esc(name) + '</div>' + items.map(function (it, i) { return '<button type="button" role="menuitem" class="' + (it[2] || '') + '" data-i="' + i + '">' + it[0] + '</button>'; }).join('');
menu.querySelectorAll('button').forEach(function (b) { b.onclick = function () { closeMenu(); items[+b.dataset.i][1](); }; });
var r = anchor.getBoundingClientRect();
menu.style.top = Math.min(r.bottom + 2, window.innerHeight - 140) + 'px';
menu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 150)) + 'px';
menu.classList.add('open'); menu.querySelector('button').focus();
}
ulist.onclick = function (e) {
var d = e.target.closest('div[data-id]'); if (!d || d.dataset.id === me.id) return;
e.stopPropagation(); openMenu(d.dataset.id, d);
};
ulist.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ulist.onclick(e); } };
document.addEventListener('click', function (e) { if (!menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

/* ---------- block / unblock (personal) ---------- */
async function loadBlocks() {
var r = await sb.from('blocks').select('blocked_id, blocked_name'); if (r.error) return;
blocked = {}; r.data.forEach(function (b) { blocked[b.blocked_id] = b.blocked_name || '?'; });
}
async function block(id, name) {
var r = await sb.from('blocks').insert({ blocker_id: me.id, blocked_id: id, blocked_name: name });
if (r.error) { addSys('Could not block: ' + r.error.message); return; }
blocked[id] = name;
if (wins[id]) { wins[id].el.remove(); delete wins[id]; }
addSys('You have blocked ' + name + '. Their words no longer reach you.');
renderPeople();
}
async function unblock(id) {
var name = blocked[id] || people[id] || 'them';
var r = await sb.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', id);
if (r.error) { addSys('Could not unblock: ' + r.error.message); return; }
delete blocked[id]; addSys('You have unblocked ' + name + '.'); renderPeople();
}

/* ---------- kick (admins only; a kick is a ban) ---------- */
async function loadAdmin() {
var a = await sb.from('admins').select('user_id').eq('user_id', me.id).maybeSingle();
isAdmin = !!(a.data && !a.error);
if (isAdmin) { var b = await sb.from('bans').select('user_id, banned_name, expires_at'); if (!b.error) b.data.forEach(function (x) { bans[x.user_id] = x; }); }
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
log.classList.add('hidden'); $('users').classList.add('hidden'); $('compose').classList.add('hidden');
Object.keys(wins).forEach(function (k) { wins[k].el.remove(); }); wins = {};
$('login').classList.remove('hidden'); $('join').disabled = true;
fail('You have been removed from the room.' + (reason ? ' Reason: ' + reason : ''));
setStatus('Removed'); me = null;
}

/* ---------- sending ---------- */
async function post(body, recipientId, recipientName) {
var now = Date.now();
if (now - lastSend < 700) { return; } // gentle client-side throttle; the DB enforces its own too
lastSend = now;
var row = { room: C.ROOM || 'main', sender_id: me.id, sender_name: me.name, body: body.slice(0, 500) };
if (recipientId) { row.recipient_id = recipientId; row.recipient_name = recipientName; }
var r = await sb.from('messages').insert(row).select().single();
if (r.error) { addSys('Your words were lost: ' + r.error.message); return; }
handleMessage(r.data); // show immediately; the realtime echo is de-duplicated by id
}
function findId(name) { return Object.keys(people).filter(function (k) { return people[k].toLowerCase() === name.toLowerCase(); })[0]; }
async function command(t) {
var m = t.match(/^\/(\w+)\s*(\S*)\s*([\s\S]*)$/); if (!m) return false;
var cmd = m[1].toLowerCase(), arg = m[2], rest = m[3].trim(), id;
switch (cmd) {
case 'w': case 'whisper': return false; // handled by send()
case 'whoami': addSys('You are ' + me.name + ' — id ' + me.id + (isAdmin ? ' (admin)' : '')); return true;
case 'help': addSys('Commands: /w name msg · /block name · /unblock name · /blocks · /whoami' + (isAdmin ? ' · /kick name [reason] · /unban name · /bans' : '')); return true;
case 'gif': openGifPicker(rest ? m[2] + ' ' + rest : arg); return true;
case 'block': id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot block yourself.'); return true; } block(id, people[id]); return true;
case 'unblock': id = Object.keys(blocked).filter(function (k) { return (blocked[k] || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('You have not blocked anyone named ' + arg + '.'); return true; } unblock(id); return true;
case 'blocks': var bl = Object.keys(blocked).map(function (k) { return blocked[k]; }); addSys(bl.length ? 'Blocked: ' + bl.join(', ') : 'You have blocked no one.'); return true;
case 'kick': if (!isAdmin) { addSys('Only an admin may kick.'); return true; } id = findId(arg); if (!id) { addSys('No one here is named ' + arg + '.'); return true; } if (id === me.id) { addSys('You cannot kick yourself.'); return true; } kick(id, people[id], rest); return true;
case 'unban': if (!isAdmin) { addSys('Only an admin may lift bans.'); return true; } id = Object.keys(bans).filter(function (k) { return (bans[k].banned_name || '').toLowerCase() === arg.toLowerCase(); })[0]; if (!id) { addSys('No ban found for ' + arg + '.'); return true; } unban(id, arg); return true;
case 'bans': if (!isAdmin) return true; var bn = Object.keys(bans).map(function (k) { return bans[k].banned_name || k; }); addSys(bn.length ? 'Banned: ' + bn.join(', ') : 'No one is banned.'); return true;
default: addSys('Unknown command. Type /help.'); return true;
}
}
async function send() {
var t = msg.value.trim(); if (!t || !me) return;
if (t[0] === '/' && !/^\/w(hisper)?\s/i.test(t)) { msg.value = ''; await command(t); return; }
var w = t.match(/^\/w(?:hisper)?\s+(\S+)\s*([\s\S]*)$/i);
if (w) {
var id = Object.keys(people).filter(function (k) { return people[k].toLowerCase() === w[1].toLowerCase(); })[0];
if (!id) { addSys('No one here is named ' + w[1] + '.'); return; }
if (id === me.id) { addSys('You cannot whisper to yourself.'); return; }
if (blocked[id]) { addSys('You have blocked ' + people[id] + '. Unblock them first.'); return; }
msg.value = ''; var win = openIM(id, people[id], true);
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

/* ---------- GIF picker (Giphy) ---------- */
var gifTimer = null, gifSeq = 0;
function closeGif() { gifPicker.classList.remove('open'); }
function openGifPicker(seedQuery) {
picker.classList.remove('open'); gifPicker.classList.add('open');
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
b.onclick = function () { closeGif(); gifQ.value = ''; post(full); msg.focus(); };
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
var opening = !gifPicker.classList.contains('open');
if (opening) { openGifPicker(''); } else { closeGif(); }
};
gifGo.onclick = function () { searchGifs(gifQ.value.trim()); };
gifQ.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); searchGifs(gifQ.value.trim()); } if (e.key === 'Escape') closeGif(); };
gifQ.oninput = function () { clearTimeout(gifTimer); var v = gifQ.value.trim(); gifTimer = setTimeout(function () { searchGifs(v); }, 450); };
document.addEventListener('click', function (e) { if (!gifPicker.contains(e.target) && e.target !== gifBtn) closeGif(); });

/* ---------- sign on ---------- */
async function join() {
var n = $('sn').value.trim(); fail('');
if (!/^[\w .'-]{2,16}$/.test(n)) { fail('2–16 letters, numbers, spaces or . \' -'); return; }
if (!C.SUPABASE_URL || C.SUPABASE_URL.indexOf('YOUR-') >= 0) { fail('Backend not configured — edit js/config.js.'); return; }
if (!window.supabase) { fail('Could not load the chat library. Check your connection.'); return; }
$('join').disabled = true; setStatus('Signing on...');
try {
sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
var s = await sb.auth.getSession();
var user = s.data.session && s.data.session.user;
if (!user) { var a = await sb.auth.signInAnonymously(); if (a.error) throw a.error; user = a.data.user; }
await sb.auth.updateUser({ data: { name: n } });
await sb.auth.refreshSession(); // updateUser() above doesn't rotate the JWT; refresh so auth.jwt() carries the new name for RLS checks
me = { id: user.id, name: n };

channel = sb.channel('room:' + (C.ROOM || 'main'), { config: { presence: { key: me.id } } });
channel.on('presence', { event: 'sync' }, function () {
var stt = channel.presenceState(); people = {};
Object.keys(stt).forEach(function (k) { if (stt[k][0]) people[k] = stt[k][0].name; });
renderPeople();
});
channel.on('presence', { event: 'join' }, function (p) {
if (p.key !== me.id && p.newPresences[0] && !people[p.key]) addSys(p.newPresences[0].name + ' has entered the room.');
if (isAdmin && bans[p.key]) channel.send({ type: 'broadcast', event: 'kick', payload: { user_id: p.key, name: p.newPresences[0].name, reason: 'banned', by: me.name } });
});
channel.on('broadcast', { event: 'kick' }, function (p) {
var k = p.payload || {};
if (k.user_id === me.id) { kicked(k.reason); return; }
if (k.reason !== 'banned') addSys(k.name + ' was removed from the room by ' + k.by + '.');
if (wins[k.user_id]) { wins[k.user_id].gone = true; imSys(k.user_id, k.name + ' was removed from the room.'); }
});
channel.on('presence', { event: 'leave' }, function (p) { if (p.leftPresences[0]) addSys(p.leftPresences[0].name + ' has left the room.'); });
channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room=eq.' + (C.ROOM || 'main') }, function (p) { handleMessage(p.new); });

await new Promise(function (res, rej) {
channel.subscribe(function (status, err) {
if (status === 'SUBSCRIBED') res();
else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rej(err || new Error('Could not reach the room.'));
});
});
await new Promise(function (r) { setTimeout(r, 400); }); // let presence sync so we can check the name
if (nameTaken(n)) { await channel.unsubscribe(); channel = null; throw new Error('That name is already taken.'); }
var ban = await sb.from('bans').select('reason, expires_at').eq('user_id', me.id).maybeSingle();
if (ban.data && (!ban.data.expires_at || new Date(ban.data.expires_at) > new Date())) { await channel.unsubscribe(); channel = null; throw new Error('You have been removed from this room.' + (ban.data.reason ? ' Reason: ' + ban.data.reason : '')); }
await loadBlocks(); await loadAdmin();
await channel.track({ name: n });

// history: recent room messages plus my recent whispers (RLS makes the server only return what I may see)
var h = await sb.from('messages').select('*').eq('room', C.ROOM || 'main').order('created_at', { ascending: false }).limit(C.HISTORY || 200);
if (h.error) throw h.error;
h.data.reverse().forEach(handleMessage);

$('login').classList.add('hidden'); log.classList.remove('hidden'); $('users').classList.remove('hidden'); $('compose').classList.remove('hidden');
setStatus('Signed on as ' + me.name + (isAdmin ? ' (admin)' : ''));
addSys('Welcome, ' + me.name + '. Tap a name for options, or type /help.');
msg.focus();
} catch (e) {
fail(e.message || String(e)); setStatus('Not signed on'); $('join').disabled = false; me = null;
}
}
$('join').onclick = join;
$('sn').onkeydown = function (e) { if (e.key === 'Enter') join(); };
$('sn').focus();

/* ---------- PWA service worker ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
navigator.serviceWorker.register('./sw.js').catch(function () { /* offline shell is optional */ });
}
})();
