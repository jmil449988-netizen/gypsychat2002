/* Gypsy Chat 2000 — service worker: caches the app shell so it opens instantly and installs as a PWA.
Chat itself always needs a connection; this only makes the UI load offline.
v2: bumped the cache name and hardened the fetch/install paths to bypass the HTTP cache — iOS
Safari in particular can hold onto an old app.js/index.html far more stubbornly than desktop
Chrome, which silently ran stale code (missing new features) even though the deploy succeeded. */
var CACHE = 'gc2000-v95';
var SHELL = ['./', './index.html', './css/style.css?v=55', './js/appconfig.js?v=2', './js/app.js?v=80', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', function (e) {
e.waitUntil(
caches.open(CACHE).then(function (c) {
return Promise.all(SHELL.map(function (u) {
return fetch(u, { cache: 'reload' }).then(function (r) { return c.put(u, r); }).catch(function () {});
}));
}).then(function () { return self.skipWaiting(); })
);
});
self.addEventListener('activate', function (e) {
e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // never cache Supabase or CDN calls
e.respondWith(
fetch(e.request, { cache: 'no-store' }).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); return r; })
.catch(function () { return caches.match(e.request); })
);
});

/* ---------- Web Push ----------
   This is the half of real push delivery that runs completely independently of any open tab --
   the OS/browser wakes this service worker just for the incoming push event, whether or not Gypsy
   Chat is open anywhere, or even running at all. send-push (the Supabase edge function) is what
   sent this; the payload is whatever JSON it built.
   Before popping an OS notification, check whether a window for this app is already open AND
   focused -- if the person is sitting right there looking at the tab, the in-page ding + the
   instant in-page notifyDesktop() path (app.js) already covered it, and a second OS popup on top
   of that would just be noise. clients.matchAll only sees windows THIS service worker controls,
   which is exactly the scope that matters here. */
self.addEventListener('push', function (e) {
var data = {};
try { data = e.data ? e.data.json() : {}; } catch (err) {}
var title = data.title || 'Gypsy Chat 2000';
var body = data.body || '';
var tag = data.tag || 'gc-push';
var url = data.url || './';
e.waitUntil(
self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
var alreadyLooking = list.some(function (c) { return c.focused; });
if (alreadyLooking) return;
return self.registration.showNotification(title, {
body: body,
tag: tag,
icon: './icons/icon-192.png',
badge: './icons/icon-192.png',
silent: false, // explicit, not just the default -- some WebKit versions have been inconsistent about treating an unset `silent` as audible
data: { url: url }
});
})
);
});
/* Clicking the OS notification should jump straight into the app -- reuse an already-open tab if
   there is one (so it doesn't spawn a duplicate), otherwise open a fresh one. */
self.addEventListener('notificationclick', function (e) {
e.notification.close();
var url = (e.notification.data && e.notification.data.url) || './';
e.waitUntil(
self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
if (self.clients.openWindow) return self.clients.openWindow(url);
})
);
});
