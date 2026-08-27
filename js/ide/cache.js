/* ═══════════════════════════════════════════════════════════
   Shared worker cache — the single source for the Cache Storage
   helpers.  Every runner does `import { cachedBytes, cachedGunzip }
   from './cache.js'`, so payloads are downloaded exactly once,
   ever, per browser.  `run.js` previously duplicated this file with
   a divergent copy — it now re-exports these functions (no drift).

   Design choices
   • Decompressed blobs are stored under a distinct synthetic key
     (`#decompressed`) with a `DecompressionStream` feature probe
     and a pure-JS fflate fallback (vendored at vendor/fflate) so
     Safari < 16, Firefox workers without DS, and Node don't break.
   • `fragment` keys (`#…`) are *not* used as the cache key for the
     decompressed copy — some implementations strip fragments.  We
     namespace by prepending `decompressed:` to the URL string.
   ═══════════════════════════════════════════════════════════ */
'use strict';

export const CACHE_NAME = 'mub-ide-v1';
const DECOMP_PREFIX = 'decompressed:';

function openCache() {
  return caches.open(CACHE_NAME);
}

export async function cachedFetch(url) {
  try {
    const cache = await openCache();
    const hit = await cache.match(url);
    if (hit) return hit;
    const res = await fetch(url);
    if (res && res.ok) {
      try { await cache.put(url, res.clone()); } catch (e) {}
    }
    return res;
  } catch (e) {
    return fetch(url);
  }
}

export async function cachedBytes(url) {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
  return new Uint8Array(await res.arrayBuffer());
}

let _fflatePromise = null;
async function fflateGunzip(data) {
  if (!_fflatePromise) {
    _fflatePromise = import('./vendor/fflate/fflate.js');
  }
  const mod = await _fflatePromise;
  const gun = mod.gunzipSync || mod.gunzip || mod.decompressSync || mod.decompress;
  if (!gun) throw new Error('fflate: gunzip not found');
  const out = gun(data);
  if (out instanceof Uint8Array) return out;
  if (out && out.length !== undefined) return new Uint8Array(out);
  throw new Error('fflate produced no output');
}

export async function gunzip(data) {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) {}
  }
  try {
    return await fflateGunzip(data);
  } catch (e2) {}
  throw new Error('DecompressionStream not available — fflate fallback failed');
}

export async function cachedGunzip(url) {
  const decKey = DECOMP_PREFIX + url;
  try {
    const cache = await openCache();
    const decHit = await cache.match(decKey);
    if (decHit) return new Uint8Array(await decHit.arrayBuffer());
    const raw = await cachedBytes(url);
    const out = await gunzip(raw);
    try { await cache.put(decKey, new Response(out)); } catch (e) {}
    return out;
  } catch (e) {
    try {
      const raw2 = await cachedBytes(url);
      return await gunzip(raw2);
    } catch (e2) {
      throw e;
    }
  }
}
