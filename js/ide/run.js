/* ═══════════════════════════════════════════════════════════
   IDE runner shim — backwards-compat wrapper around cache.js.

   History: this file duplicated the Cache helpers with a divergent
   `cachedBytes` (progress streaming) and a `Worker` spawn helper
   `IDERun.worker`.  The duplication caused silent drift (different
   CACHE_NAME handling, dead handlers, protocol mismatch).  We now
   single-source through cache.js so only one implementation ever
   exists.

   This file is kept as a thin re-export so existing checkout state
   and any external references don't break.  All actual work is in
   ./cache.js.
   ═══════════════════════════════════════════════════════════ */
import { CACHE_NAME, cachedFetch, cachedBytes, cachedBytesProgress, gunzip, cachedGunzip } from './cache.js';

export { CACHE_NAME, cachedFetch, cachedBytes, cachedBytesProgress, gunzip, cachedGunzip };

/* Legacy globals for any non-ESM script still doing `window.IDECache`. */
try {
  if (typeof self !== 'undefined') {
    self.IDECache = { fetch: cachedFetch, bytes: cachedBytes, gunzip, CACHE_NAME };
  }
} catch (e) {}

/* ── legacy worker helper (deprecated) ──
   Kept only for external URLs that may still import it; the IDE's
   js/ide/ide.js no longer uses this path (it spawns Workers directly). */
export function runWorker(workerUrl, payload) {
  const w = new Worker(workerUrl, { type: 'module' });
  const handlers = {};
  let done = false;
  w.addEventListener('message', (e) => {
    const m = e.data || {};
    const h = handlers[m.type];
    if (h) { try { h(m); } catch (err) { console.error(err); } }
  });
  w.addEventListener('error', (e) => {
    const h = handlers.err || handlers.error;
    if (h) { try { h({ text: String(e.message || e) }); } catch (err) {} }
  });
  w.postMessage(payload);
  return {
    on(type, fn) { handlers[type] = fn; },
    post(m) { try { w.postMessage(m); } catch (e) {} },
    terminate() {
      if (done) return;
      done = true;
      try { w.terminate(); } catch (e) {}
      const h = handlers.exit;
      if (h) { try { h({ text: '', code: null, terminated: true }); } catch (err) {} }
    }
  };
}

try {
  if (typeof self !== 'undefined' && !self.IDERun) {
    self.IDERun = { worker: runWorker };
  }
} catch (e) {}
