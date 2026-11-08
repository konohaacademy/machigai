// まちがいさがし — まず取りに行き、つながらないときだけ しまったものを出す。
// ⚠ しまったものを先に出すと、作り直した bank.js と古い gen.js が混ざり、台帳の問題が別の絵になる（app の点検で とばされる）。
var CACHE = 'machigai-v1';
var SHELL = ['./', 'index.html', 'style.css?v=1', 'core.js?v=1', 'kinds.js?v=1', 'gen.js?v=1', 'verify.js?v=1', 'bank.js?v=1', 'app.js?v=1', 'icon-192.png'];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () { /* 次に開いたとき */ }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  var key = e.request.mode === 'navigate' ? './' : e.request;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ca) { ca.put(key, c); }); }
    return r;
  }).catch(function () { return caches.match(key); }));
});
