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

async function _loadFflate() {
  if (!_fflatePromise) {
    _fflatePromise = import('./vendor/fflate/fflate.js');
  }
  return _fflatePromise;
}

export async function gunzip(data) {
  /* Fast path: if data is not gzip-compressed (missing magic bytes 1f 8b),
     return it as-is.  This handles the common case where GitHub Pages serves
     .gz files with Content-Encoding: gzip — fetch() transparently
     decompresses, so the bytes we receive are already decompressed. */
  if (!(data[0] === 0x1f && data[1] === 0x8b)) {
    console.log('[cache] data is not gzip-compressed (' + data.length + ' bytes), returning as-is');
    return data;
  }
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) {
      console.warn('[cache] DecompressionStream failed, trying fflate:', e.message || e);
    }
  } else {
    console.warn('[cache] DecompressionStream not available, using fflate fallback');
  }
  try {
    const mod = await _loadFflate();
    if (mod.gunzipSync) {
      var out = mod.gunzipSync(data);
      if (out instanceof Uint8Array) return out;
      if (out && out.length !== undefined) return new Uint8Array(out);
    }
    if (mod.gunzip) {
      return await new Promise(function (resolve, reject) {
        mod.gunzip(data, function (err, result) {
          if (err) reject(err);
          else if (result instanceof Uint8Array) resolve(result);
          else if (result && result.length !== undefined) resolve(new Uint8Array(result));
          else reject(new Error('fflate async gunzip produced no output'));
        });
      });
    }
    if (mod.decompressSync) {
      var out2 = mod.decompressSync(data);
      if (out2 instanceof Uint8Array) return out2;
      if (out2 && out2.length !== undefined) return new Uint8Array(out2);
    }
    throw new Error('fflate: no gunzip/decompress function found');
  } catch (e2) {
    console.error('[cache] fflate fallback failed:', e2.message || e2);
  }
  throw new Error(
    'gunzip failed for ' + data.length + ' bytes. ' +
    'First bytes: ' + data[0].toString(16) + ' ' + data[1].toString(16) + ' ' + data[2].toString(16)
  );
}

/* Fetch with progress tracking — calls onProgress(bytesLoaded, totalBytes)
   when Content-Length is available.  Falls back to cachedBytes if progress
   is not needed or Content-Length is missing. */
export async function cachedBytesProgress(url, onProgress) {
  if (!onProgress) return cachedBytes(url);
  try {
    const cache = await openCache();
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      if (onProgress) onProgress(buf.byteLength, buf.byteLength);
      return new Uint8Array(buf);
    }
  } catch (e) {}
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader || !total) {
    const buf = await res.arrayBuffer();
    if (onProgress) onProgress(buf.byteLength, buf.byteLength);
    const bytes = new Uint8Array(buf);
    try { const c = await openCache(); await c.put(url, new Response(bytes)); } catch (e) {}
    return bytes;
  }
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) onProgress(loaded, total);
  }
  const all = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  try { const c = await openCache(); await c.put(url, new Response(all)); } catch (e) {}
  return all;
}

export async function cachedGunzip(url, onProgress) {
  const decKey = DECOMP_PREFIX + url;
  const rawKey = 'raw:' + url;
  try {
    const cache = await openCache();
    /* 0. Purge stale caches from before this fix — if the decompressed cache
          entry or raw cache entry is not actually gzip data, remove it. */
    try {
      const oldDec = await cache.match(decKey);
      if (oldDec) {
        const ob = new Uint8Array(await oldDec.arrayBuffer());
        if (!(ob[0] === 0x1f && ob[1] === 0x8b)) {
          console.warn('[cache] purging stale decompressed cache for', url);
          await cache.delete(decKey);
        }
      }
    } catch (e) {}
    /* 1. Check if already decompressed */
    const decHit = await cache.match(decKey);
    if (decHit) {
      if (onProgress) onProgress(1, 1);
      return new Uint8Array(await decHit.arrayBuffer());
    }
    /* 2. Fetch (with progress) — also try raw cache for retry */
    let raw;
    const rawHit = await cache.match(rawKey).catch(function () { return null; });
    if (rawHit) {
      raw = new Uint8Array(await rawHit.arrayBuffer());
      if (onProgress) onProgress(raw.length, raw.length);
    } else {
      raw = await cachedBytesProgress(url, onProgress);
      try { await cache.put(rawKey, new Response(raw)); } catch (e) {}
    }
    if (onProgress) onProgress(-1, -1);  // signal: decompressing
    const out = await gunzip(raw);
    try { await cache.put(decKey, new Response(out)); } catch (e) {}
    return out;
  } catch (e) {
    console.warn('[cache] cachedGunzip failed for', url, '— retrying:', e.message || e);
    try {
      /* Purge stale cache and re-fetch */
      try { const c = await openCache(); await c.delete(decKey); await c.delete(rawKey); } catch (e) {}
      const raw2 = await cachedBytesProgress(url, onProgress);
      if (onProgress) onProgress(-1, -1);
      const out2 = await gunzip(raw2);
      try { const c = await openCache(); await c.put(decKey, new Response(out2)); } catch (e) {}
      return out2;
    } catch (e2) {
      console.error('[cache] cachedGunzip retry also failed for', url, ':', e2.message || e2);
      throw e;
    }
  }
}
