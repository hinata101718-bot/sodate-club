/* 家事ポイント帳：電波がなくても開けるようにするための保存係。
   画面（HTML）はネット優先で取りに行き、だめなら保存しておいたものを出す。
   設定やアイコンなどは保存したものをすぐ出しつつ、裏で新しいものに入れ替える。
   フォントは保存したものを優先して出す。 */
const CACHE = "kaji-v6";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./firebase-config.js", "./vendor/firebase-10.14.1.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("kaji-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const scopePath = new URL("./", self.registration.scope).pathname;
  const sameScope = url.origin === location.origin && url.pathname.startsWith(scopePath);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameScope && !isFont) return; // Firebase との通信などはそのまま通す

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  const save = (res) => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
  if (isFont) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(save)));
    return;
  }
  // 同じ場所のファイル：保存分をすぐ返し、裏で更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then(save).catch(() => hit);
      if (hit) { e.waitUntil(net.then(() => {}, () => {})); return hit; }
      return net;
    })
  );
});
