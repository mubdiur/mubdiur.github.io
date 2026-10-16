/* ═══════════════════════════════════════════════════════════
   mubdiur.github.io — offline service worker (no build, one file).

   Strategy
   ────────
   • STATIC_CACHE (versioned, purged on activate): the app shell —
     index.html + CSS + all first-party JS + editor + every custom
     tool script + preloaded fonts. ~1.3 MB. Makes 200+ tools and
     the IDE shell work offline after the first visit.
   • RUNTIME_CACHE (version-stable, NEVER purged on shell updates):
     IDE engine payloads (up to ~43 MB per language), wasm/core.wasm
     and fonts fetched on demand. Purging these would force massive
     re-downloads, so they live outside the versioned cache.
   • Navigations: network-first → cached shell fallback (offline).
   • Versioned (`?v=`) shell assets: cache-first (immutable by URL).
   • Everything else same-origin: stale-while-revalidate.

   Maintenance: keep the `?v=` values in sync with index.html,
   App.TOOL_VERSION (core.js) and the editor import (ide.js), and
   bump SW_VERSION below whenever the shell changes. Old static
   caches are deleted on activate; runtime payloads are kept.
   ═══════════════════════════════════════════════════════════ */
'use strict';

var SW_VERSION = 'v404';
var STATIC_CACHE = 'mub-static-' + SW_VERSION;
var RUNTIME_CACHE = 'mub-runtime-v1';

var SHELL = [
  './',
  'index.html',
  'favicon.ico',
  'css/app.css?v=37',
  'js/icons.js?v=26',
  'js/lib/random.js?v=27',
  'js/lib/diff.js?v=27',
  'js/lib/adaptive-radix.js?v=1',
  'js/lib/qr-decode.js?v=2',
  'js/manifest.js?v=358',
  'js/lib/transforms.js?v=346',
  'js/lib/crypto.js?v=7',
  'js/wasm.js?v=28',
  'js/core.js?v=73',
  'js/pages/home.js?v=33',
  'js/pages/tools.js?v=31',
  'js/pages/tool.js?v=27',
  'js/ide/ide.js?v=25',
  'js/tools/transform.js?v=39',
  'js/tools/generator.js?v=34',
  'js/ide/vendor/editor.js?v=22',
  'js/tools/json-validator.js?v=58',
  'js/tools/email-extractor.js?v=58',
  'js/tools/voice-dictation.js?v=58',
  'js/tools/jwt-debugger.js?v=58',
  'js/tools/table2xl.js?v=58',
  'js/tools/markdown-preview.js?v=58',
  'js/tools/time-copier.js?v=58',
  'js/tools/cron-builder.js?v=58',
  'js/tools/totp-generator.js?v=58',
  'js/tools/aes-encryptor.js?v=58',
  'js/tools/timezone-converter.js?v=58',
  'js/tools/image-compressor.js?v=58',
  'js/tools/color-converter.js?v=58',
  'js/tools/unit-converter.js?v=58',
  'js/tools/qr-code-generator.js?v=58',
  'js/tools/qr-code-decoder.js?v=58',
  'js/tools/base64-image-decoder.js?v=58',
  'js/tools/image-to-base64.js?v=58',
  'js/tools/image-palette-extractor.js?v=58',
  'js/tools/contrast-checker.js?v=58',
  'js/tools/http-status-codes.js?v=58',
  'js/tools/dns-lookup.js?v=58',
  'fonts/jetbrains-mono-400.woff2',
  'fonts/jetbrains-mono-700.woff2'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* Delete stale static shells only — runtime payloads survive. */
        if (k.indexOf('mub-static-') === 0 && k !== STATIC_CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isVersionedShell(url) {
  return /[?&]v=\d+/.test(url.search);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations (hash routes all serve index.html): network first. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(STATIC_CACHE).then(function (c) { c.put('index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('index.html').then(function (hit) {
          if (hit) return hit;
          return new Response('Offline — visit once online first.', {
            status: 503, headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
    );
    return;
  }

  /* Immutable versioned shell: cache-first. */
  if (isVersionedShell(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(STATIC_CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* Fonts, wasm, IDE engines: stale-while-revalidate in runtime cache. */
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit || Promise.reject(new Error('offline')); });
        return hit || net;
      });
    })
  );
});
