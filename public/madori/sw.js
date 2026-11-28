/* ゆめのおうち：電波がなくても開けるようにするための保存係。
   画面と自分のプログラム（js）はネット優先で取りに行き、だめなら保存しておいたものを出す（新旧がまざらないように）。
   3Dの部品（vendor）・アイコン・フォントは、保存したものを優先して出す。 */
const CACHE = "madori-v2";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./js/app.js", "./js/data.js", "./js/model.js", "./js/plan2d.js", "./js/view3d.js",
  "./vendor/three-0.160.0.module.min.js", "./vendor/OrbitControls-0.160.0.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("madori-") && k !== CACHE).map((k) => caches.delete(k))))
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
  if (!sameScope && !isFont) return;
  const save = (res) => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  const fixed = isFont || url.pathname.includes("/vendor/") || url.pathname.includes("/icons/");
  if (fixed) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(save)));
    return;
  }
  e.respondWith(fetch(req).then(save).catch(() => caches.match(req)));
});
