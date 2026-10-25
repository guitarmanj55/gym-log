/* Gym Log service worker: works offline once opened online.
   HTML, the manifest and JS modules are network-first so updates arrive as soon as
   you're online; icons and fonts are cache-first. Bump CACHE on every release and
   list every module in SHELL, or the app breaks offline. */
var CACHE = "gymlog-v17";
var SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "src/app.js",
  "src/ui.js",
  "src/device.js",
  "src/cloud.js",
  "src/db/schema.js",
  "src/db/db.js",
  "src/db/workout.js",
  "src/lib/backup.js",
  "src/lib/e1rm.js",
  "src/lib/exercise.js",
  "src/lib/feedback.js",
  "src/lib/history.js",
  "src/lib/plan.js",
  "src/lib/plates.js",
  "src/lib/progress.js",
  "src/lib/rest.js",
  "src/lib/suggest.js",
  "src/screens/active.js",
  "src/screens/exercise-form.js",
  "src/screens/today.js",
  "src/screens/history.js",
  "src/screens/lift.js",
  "src/screens/backup.js",
  "src/screens/summary.js",
  "src/screens/workout.js"
];

/* GitHub Pages sends max-age=600, so plain fetches can get a copy up to 10 minutes old.
   "reload" (install) and "no-cache" (network-first) go to the server every time; no-cache
   still lets it answer 304 Not Modified, so unchanged files cost almost nothing. */
self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(cache){
    return cache.addAll(SHELL.map(function(u){ return new Request(u, {cache: "reload"}); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function cacheFirst(req){
  return caches.match(req).then(function(hit){
    return hit || fetch(req).then(function(res){
      if(res.ok || res.type === "opaque"){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
      return res;
    });
  });
}
function fromCache(req){
  return caches.match(req, {ignoreSearch: true}).then(function(hit){
    return hit || (req.mode === "navigate" ? caches.match("index.html") : undefined);
  });
}
/* Gym wifi is often slow rather than down, so after 3 s fall back to the cached
   copy instead of waiting; the fetch still finishes and refreshes the cache. */
function networkFirst(req){
  var net = fetch(new Request(req.url, {cache: "no-cache", credentials: "same-origin"})).then(function(res){
    if(res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
    return res;
  });
  var slow = new Promise(function(resolve){ setTimeout(resolve, 3000); }).then(function(){
    return fromCache(req).then(function(hit){ return hit || net; });
  });
  return Promise.race([net, slow]).catch(function(){
    return fromCache(req).then(function(hit){ return hit || Response.error(); });
  });
}

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  if(url.origin === location.origin){
    var p = url.pathname;
    if(req.mode === "navigate" || p.endsWith(".html") || p.endsWith(".webmanifest") || p.endsWith(".js")) e.respondWith(networkFirst(req));
    else e.respondWith(cacheFirst(req));
  } else if(url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(cacheFirst(req));
  }
});
