/* ═══════════════════════════════════════════════════════════
   Shared worker helpers — cache-first fetch via the Cache
   Storage API (compiler payloads download exactly once, ever)
   and gzip decompression. Imported by the runner workers.
   ═══════════════════════════════════════════════════════════ */
'use strict';

export const CACHE_NAME = 'mub-ide-v1';

function openCache() {
  return caches.open(CACHE_NAME);
}

/** Cache-first fetch: returns a Response from the Cache API when present,
 *  otherwise fetches and stores it. Falls back to plain fetch if the
 *  Cache API is unavailable. */
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

/** Fetch bytes cache-first. */
export async function cachedBytes(url) {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
  return new Uint8Array(await res.arrayBuffer());
}

/** Decompress gzipped bytes (native DecompressionStream). */
export async function gunzip(data) {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Cache-first fetch of a gzipped payload: returns decompressed bytes.
 *  The decompressed copy is stored in the Cache API and reused, so the
 *  (slow) decompression happens at most once per browser. */
export async function cachedGunzip(url) {
  try {
    const cache = await openCache();
    const decKey = url + '#decompressed';
    const decHit = await cache.match(decKey);
    if (decHit) return new Uint8Array(await decHit.arrayBuffer());
    const raw = await cachedBytes(url);
    const out = await gunzip(raw);
    try { await cache.put(decKey, new Response(out)); } catch (e) {}
    return out;
  } catch (e) {
    return gunzip(await cachedBytes(url));
  }
}
