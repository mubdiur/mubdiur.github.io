/* ═══════════════════════════════════════════════════════════
   IDE shared runner helpers.
   - IDECache.fetch: cache-first fetch backed by the Cache Storage
     API, so every compiler/runtime payload downloads at most once.
   - Worker spawning + the {id, type, text} message protocol used by
     every in-worker runner (js, python, c/c++, c#).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var CACHE_NAME = 'mub-ide-v1';
var cachePromise = null;

function openCache() {
  if (!cachePromise) {
    cachePromise = (typeof caches !== 'undefined' && caches.open)
      ? caches.open(CACHE_NAME)
      : Promise.reject(new Error('Cache API not available'));
    cachePromise.catch(function () { cachePromise = null; });
  }
  return cachePromise;
}

/**
 * Cache-first fetch. Returns a Response; if the URL was fetched before it
 * comes from the Cache Storage API with zero network traffic.
 */
function cachedFetch(url, opts) {
  return openCache().then(function (cache) {
    return cache.match(url).then(function (hit) {
      if (hit) return hit;
      return fetch(url, opts).then(function (res) {
        if (res && res.ok) {
          try { cache.put(url, res.clone()); } catch (e) {}
        }
        return res;
      });
    });
  }).catch(function () {
    // Cache API unavailable — plain fetch still works (browser HTTP cache).
    return fetch(url, opts);
  });
}

/** Fetch bytes (Uint8Array) cache-first. */
function cachedBytes(url, onProgress) {
  return cachedFetch(url).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
    var total = parseInt(res.headers.get('Content-Length') || '0', 10);
    if (!res.body || !total || !onProgress) return res.arrayBuffer();
    var reader = res.body.getReader();
    var received = 0;
    var chunks = [];
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(received);
          var off = 0;
          chunks.forEach(function (c) { out.set(c, off); off += c.length; });
          return out.buffer;
        }
        chunks.push(r.value);
        received += r.value.length;
        onProgress(received, total);
        return pump();
      });
    }
    return pump();
  });
}

function fmtBytes(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

/**
 * Spawn a runner worker and run {code} in it.
 * workerUrl must be same-origin. Returns a controller:
 *   controller.on(event, fn) — 'status' | 'out' | 'err' | 'exit'
 *   controller.terminate()
 */
function runWorker(workerUrl, payload) {
  var w = new Worker(workerUrl, { type: 'module' });
  var handlers = {};
  var done = false;
  w.addEventListener('message', function (e) {
    var m = e.data || {};
    var h = handlers[m.type];
    if (h) h(m);
  });
  w.addEventListener('error', function (e) {
    if (!handlers.err) return;
    handlers.err({ text: String(e.message || e) });
  });
  w.postMessage(payload);
  return {
    on: function (type, fn) { handlers[type] = fn; },
    post: function (m) { w.postMessage(m); },
    terminate: function () {
      if (done) return;
      done = true;
      try { w.terminate(); } catch (e) {}
      if (handlers.exit) handlers.exit({ text: '', code: null, terminated: true });
    }
  };
}

window.IDECache = { fetch: cachedFetch, bytes: cachedBytes, fmtBytes: fmtBytes, CACHE_NAME: CACHE_NAME };
window.IDERun = { worker: runWorker };
})();
