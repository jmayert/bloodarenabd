/**
 * Blood Solution — Service Worker v6.3
 * Cache/PWA handler — FCM push handled by firebase-messaging-sw.js
 */

const APP_VERSION = 'blood-solution-v6.3';
const STATIC_CACHE = APP_VERSION + '-static';
const IMG_CACHE = APP_VERSION + '-img';
const PAGE_CACHE = APP_VERSION + '-pages';

const PRECACHE_ASSETS = [
  '/',
  '/index.php',
  '/icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png',
  '/logo1.png'
];

const CDN_HOSTS = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|basemaps\.cartocdn\.com/;

// ── Install: precache all assets ─────────────────────────────
// NOTE: skipWaiting() is intentionally NOT called here. A new SW now stays in
// the "waiting" state so boot.js.php can detect it and show the user an
// "update available — refresh" banner. The user clicking that banner posts
// SKIP_WAITING (handled below) → activate → controllerchange → one reload.
// Brand-new installs (no existing controller) still activate immediately,
// because there is nothing for them to wait behind.
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function(url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function() {});
        })
      );
    })
  );
});

// ── Activate: purge old caches ───────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k.startsWith('blood-solution-') &&
            k !== STATIC_CACHE && k !== IMG_CACHE && k !== PAGE_CACHE;
        }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var req = e.request;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/admin')) return;

  // Token-addressed patient docs (?req_doc=<token>) → pure network, NEVER the
  // long-lived SW image cache. cacheFirst caches any HTTP-200 body without
  // checking Content-Type; on InfinityFree a 200 HTML interstitial could get
  // stored under the token URL and serve a broken image forever. These are
  // dynamic + access-guarded and already carry Cache-Control from the server,
  // so the browser HTTP cache still handles them sanely.
  if (url.search.indexOf('req_doc=') !== -1) {
    e.respondWith(fetch(req).catch(function() { return new Response('', { status: 503 }); }));
    return;
  }

  // Token endpoint (?csrf=) → pure network, NEVER cache. The CSRF self-heal
  // client fetches this to re-sync after a first-launch session/token desync;
  // a cached (stale) token would defeat the whole purpose.
  if (url.search.indexOf('csrf=') !== -1) {
    e.respondWith(fetch(req).catch(function() {
      return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }

  // External CDN → Cache-First (fonts, leaflet, cartocdn — works offline)
  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.test(url.host)) {
      e.respondWith(cacheFirst(req, STATIC_CACHE));
    }
    return;
  }
  
  // Local images → Cache-First, long TTL
  if (req.destination === 'image') {
    e.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }
  
  // Main page → Network-First, always fresh PHP
  if (url.pathname === '/' || url.pathname.endsWith('index.php')) {
    e.respondWith(networkFirstPage(req));
    return;
  }
  
  // sw.js itself → always fresh
  if (url.pathname === '/sw.js') {
    e.respondWith(fetch(req).catch(function() {
      return caches.match(req);
    }));
    return;
  }
  
  // JS / CSS → Network-First, cache fallback (always fresh online, works offline)
  if (req.destination === 'script' || req.destination === 'style') {
    e.respondWith(networkFirstAsset(req, STATIC_CACHE));
    return;
  }
  
  // Everything else → network with cache fallback
  e.respondWith(networkFallback(req));
});

// ── Network-First (main page) ────────────────────────────────
function networkFirstPage(req) {
  return fetch(new Request(req.url, {
    credentials: 'same-origin',
    cache: 'no-cache'
  })).then(function(res) {
    if (res && res.status === 200) {
      var clone = res.clone();
      caches.open(PAGE_CACHE).then(function(c) { c.put(req, clone); });
    }
    return res;
  }).catch(function() {
    return caches.open(PAGE_CACHE).then(function(c) {
      return c.match(req).then(function(cached) {
        if (cached) return cached;
        return caches.open(STATIC_CACHE).then(function(sc) {
          return sc.match(req).then(function(s) { return s || offlineFallback(); });
        });
      });
    });
  });
}

// ── Cache-First ──────────────────────────────────────────────
function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(req).then(function(cached) {
      if (cached) return cached;
      return fetch(req).then(function(res) {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(function() {
        return new Response('', { status: 503 });
      });
    });
  });
}

// ── Network-First for assets (JS/CSS) ────────────────────────
// Revalidate on every load so a fresh deploy is picked up immediately; fall
// back to the cached copy only when the network is unavailable (offline).
function networkFirstAsset(req, cacheName) {
  return fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(function(res) {
      if (res && res.status === 200) {
        var clone = res.clone();
        caches.open(cacheName).then(function(c) { c.put(req, clone); });
      }
      return res;
    }).catch(function() {
      return caches.open(cacheName).then(function(c) {
        return c.match(req).then(function(cached) {
          return cached || new Response('', { status: 503 });
        });
      });
    });
}

// ── Network with cache fallback ──────────────────────────────
function networkFallback(req) {
  return fetch(req).then(function(res) {
    if (res && res.status === 200) {
      caches.open(STATIC_CACHE).then(function(c) { c.put(req, res.clone()); });
    }
    return res;
  }).catch(function() {
    return caches.match(req).then(function(c) {
      return c || new Response('', { status: 503 });
    });
  });
}

// ── Offline fallback page ────────────────────────────────────
function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html lang="bn"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#dc2626">' +
    '<title>Blood Solution \u2014 Offline</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box;}' +
    'body{background:#0b1120;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;}' +
    '.box{max-width:340px;width:100%;}' +
    'h2{color:#ef4444;font-size:1.4rem;margin-bottom:10px;font-weight:700;margin-top:16px;}' +
    'p{color:#94a3b8;font-size:.9rem;line-height:1.65;margin-bottom:24px;}' +
    'button{background:linear-gradient(135deg,#e02424,#b91c1c);color:#fff;border:none;' +
    'border-radius:14px;padding:14px 32px;font-size:1rem;font-weight:700;cursor:pointer;' +
    'width:100%;box-shadow:0 4px 16px rgba(220,38,38,.4);}' +
    '#st{margin-top:14px;font-size:.82rem;color:#64748b;min-height:20px;}</style>' +
    '</head><body><div class="box">' +
    '<div style="font-size:3.5rem">\ud83d\udcf5</div>' +
    '<h2>\u0987\u09a8\u09cd\u099f\u09be\u09b0\u09a8\u09c7\u099f \u09a8\u09c7\u0987</h2>' +
    '<p>Blood Solution \u098f\u09b0 cached version \u09b2\u09cb\u09a1 \u0995\u09b0\u09be \u09af\u09be\u099a\u09cd\u099b\u09c7 \u09a8\u09be\u0964<br>Internet \u099a\u09be\u09b2\u09c1 \u0995\u09b0\u09c7 \u0986\u09ac\u09be\u09b0 \u099a\u09c7\u09b7\u09cd\u099f\u09be \u0995\u09b0\u09c1\u09a8\u0964</p>' +
    '<button id="rb" onclick="retry()">\ud83d\udd04 \u0986\u09ac\u09be\u09b0 \u099a\u09c7\u09b7\u09cd\u099f\u09be \u0995\u09b0\u09c1\u09a8</button>' +
    '<div id="st"></div></div>' +
    '<script>function retry(){var b=document.getElementById("rb"),s=document.getElementById("st");' +
    'b.disabled=true;b.textContent="\u29d7 \u099a\u09c7\u09b7\u09cd\u099f\u09be \u0995\u09b0\u099b\u09bf...";s.textContent="";' +
    'fetch("/",{cache:"no-store"}).then(function(r){if(r.ok){location.reload();}else{done();}}).catch(done);' +
    'function done(){b.disabled=false;b.textContent="\ud83d\udd04 \u0986\u09ac\u09be\u09b0 \u099a\u09c7\u09b7\u09cd\u099f\u09be \u0995\u09b0\u09c1\u09a8";s.textContent="\u098f\u0996\u09a8\u0993 \u09b8\u0982\u09af\u09cb\u0997 \u09a8\u09c7\u0987\u0964";}}' +
    'window.addEventListener("online",function(){s.textContent="\u2705 \u09b8\u0982\u09af\u09cb\u0997 \u09aa\u09be\u0993\u09af\u09bc\u09be \u0997\u09c7\u099b\u09c7!";setTimeout(function(){location.reload();},500);});' +
    '<\/script></body></html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

// ── Notification click → open/focus app ─────────────────────
// Firebase handles its own notificationclick for FCM pushes.
// This fallback handles any non-FCM / legacy push notifications.
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.includes(self.location.origin) && 'focus' in clients[i]) {
          return clients[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ── Message handler ──────────────────────────────────────────
self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
});