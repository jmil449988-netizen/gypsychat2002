/* Gypsy Chat 2000 — service worker: caches the app shell so it opens instantly and installs as a PWA.
Chat itself always needs a connection; this only makes the UI load offline.
v2: bumped the cache name and hardened the fetch/install paths to bypass the HTTP cache — iOS
Safari in particular can hold onto an old app.js/index.html far more stubbornly than desktop
Chrome, which silently ran stale code (missing new features) even though the deploy succeeded. */
var CACHE = 'gc2000-v31';
var SHELL = ['./', './index.html', './css/style.css?v=19', './js/appconfig.js?v=1', './js/app.js?v=26', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
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
