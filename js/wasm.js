/* ═══════════════════════════════════════════════════════════
   WebAssembly core — hash / HMAC / CRC / QR / ASN.1

   wasm/core.wasm  ←  wasm/core.rs   (Rust → wasm, ~45 KB)
   All functions are synchronous and share a single bump allocator
   (exp.alloc / exp.reset) inside the module's linear memory.

   Architecture
   ────────────
   • The module's memory can grow at any `alloc` call.  A cached
     Uint8Array view would go stale (detached buffer), so every
     read/write goes through a fresh view — `mem()` always returns a
     view of the *current* buffer.
   • `readyPromise` is resettable: on rejection it is nulled so a
     subsequent `load()` can retry.  No silent swallowing.
   • Every path that allocates calls `reset()` in a `finally` so
     failed calls cannot leak allocator state into the next call.
   • ASN.1 JSON size is bounded (2 MB) to avoid OOM on adversarial DER.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var exp = null;
var readyPromise = null;

/* Fresh view of the current linear memory — never cached. */
function mem() {
  if (!exp || !exp.memory) throw new Error('WASM memory not ready');
  return new Uint8Array(exp.memory.buffer);
}

function ensureReady() {
  if (!exp) {
    if (window.__wasmError) throw new Error('WebAssembly core failed to load: ' + window.__wasmError);
    throw new Error('WebAssembly core is still loading — try again in a moment');
  }
}

function allocBytes(bytes) {
  ensureReady();
  var p = exp.alloc(bytes.length);
  if (p === 0) throw new Error('WASM allocation failed (OOM)');
  if (p < 0) throw new Error('WASM allocation failed');
  if (p + bytes.length > exp.memory.buffer.byteLength) throw new Error('WASM allocation out of bounds');
  mem().set(bytes, p);
  return p;
}

function allocSlot() {
  ensureReady();
  var p = exp.alloc(4);
  if (p === 0) throw new Error('WASM allocation failed (OOM)');
  if (p + 4 > exp.memory.buffer.byteLength) throw new Error('WASM allocation out of bounds');
  return p;
}

function readU32(p) {
  var b = new Uint8Array(mem().buffer, p, 4);
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}

function hexOf(p, n) {
  var m = mem();
  if (p + n > m.byteLength) throw new Error('WASM read out of bounds');
  var out = '';
  var b = new Uint8Array(m.buffer, p, n);
  for (var i = 0; i < n; i++) out += b[i].toString(16).padStart(2, '0');
  return out;
}

function digest(name, text, outLen) {
  return digestBytes(name, new TextEncoder().encode(text), outLen);
}

function digestBytes(name, bytes, outLen) {
  ensureReady();
  var p = allocBytes(bytes);
  var out = exp.alloc(outLen);
  if (out === 0 || out < 0) throw new Error('WASM allocation failed (OOM)');
  var rc;
  try { rc = exp[name](p, bytes.length, out); } catch (e) { exp.reset(); throw e; }
  if (rc !== 0) { exp.reset(); throw new Error('WASM ' + name + ' failed'); }
  var hex;
  try { hex = hexOf(out, outLen); } finally { exp.reset(); }
  return hex;
}

var Core = {
  ready: function () { return readyPromise; },
  isReady: function () { return !!exp; },

  md5Hex: function (s) { return digest('md5', s, 16); },
  sha1Hex: function (s) { return digest('sha1', s, 20); },
  sha256Hex: function (s) { return digest('sha256', s, 32); },
  sha384Hex: function (s) { return digest('sha384', s, 48); },
  sha512Hex: function (s) { return digest('sha512', s, 64); },

  md5Bytes: function (b) { return digestBytes('md5', b, 16); },
  sha1Bytes: function (b) { return digestBytes('sha1', b, 20); },
  sha256Bytes: function (b) { return digestBytes('sha256', b, 32); },
  sha384Bytes: function (b) { return digestBytes('sha384', b, 48); },
  sha512Bytes: function (b) { return digestBytes('sha512', b, 64); },

  crc32Hex: function (s) {
    var bytes = new TextEncoder().encode(s);
    var p, out, rc, hex;
    p = allocBytes(bytes);
    out = exp.alloc(4);
    if (out === 0) throw new Error('WASM allocation failed (OOM)');
    try { rc = exp.crc32(p, bytes.length, out); } finally { if (rc !== 0) { exp.reset(); throw new Error('WASM crc32 failed'); } }
    try { hex = hexOf(out, 4); } finally { exp.reset(); }
    return hex;
  },

  hmacHex: function (key, message, alg) {
    var kb = new TextEncoder().encode(key);
    var mb = new TextEncoder().encode(message);
    var kp, mp, out, outLen, rc, hex;
    kp = allocBytes(kb);
    mp = allocBytes(mb);
    outLen = alg === 0 ? 20 : 32;
    out = exp.alloc(outLen);
    if (out === 0) throw new Error('WASM allocation failed (OOM)');
    try { rc = exp.hmac(mp, mb.length, kp, kb.length, alg, out); } finally { if (rc !== 0) { exp.reset(); throw new Error('WASM hmac failed'); } }
    try { hex = hexOf(out, outLen); } finally { exp.reset(); }
    return hex;
  },

  qrEncode: function (text, ecl) {
    ensureReady();
    var bytes = new TextEncoder().encode(text);
    if (!bytes.length) throw new Error('Enter text to encode');
    var p, mSlot, sSlot, rc, mPtr, size, matrix;
    p = allocBytes(bytes);
    mSlot = allocSlot();
    sSlot = allocSlot();
    try { rc = exp.qr_encode(p, bytes.length, ecl || 1, mSlot, sSlot); } finally { if (rc !== 0) { exp.reset(); throw new Error('Text too long for a QR code (' + bytes.length + ' bytes)'); } }
    mPtr = readU32(mSlot);
    size = readU32(sSlot);
    if (size <= 0 || size > 177) { exp.reset(); throw new Error('Invalid QR size'); }
    if (mPtr + size * size > mem().byteLength) { exp.reset(); throw new Error('WASM QR read out of bounds'); }
    matrix = new Uint8Array(mem().buffer.slice(mPtr, mPtr + size * size));
    exp.reset();
    return { size: size, matrix: matrix };
  },

  asn1Parse: function (derBytes) {
    ensureReady();
    if (!derBytes || derBytes.length > 2 * 1024 * 1024) throw new Error('DER input too large (max 2 MB)');
    var p, o1, o2, rc, ptr, len, jsonStr;
    p = allocBytes(derBytes);
    o1 = allocSlot();
    o2 = allocSlot();
    try { rc = exp.asn1_parse(p, derBytes.length, o1, o2); } finally { if (rc !== 0) { exp.reset(); throw new Error('Could not parse DER data'); } }
    ptr = readU32(o1);
    len = readU32(o2);
    if (len > 2 * 1024 * 1024) { exp.reset(); throw new Error('ASN.1 output too large'); }
    if (ptr + len > mem().byteLength) { exp.reset(); throw new Error('WASM ASN.1 read out of bounds'); }
    jsonStr = new TextDecoder().decode(new Uint8Array(mem().buffer, ptr, len));
    exp.reset();
    try { return JSON.parse(jsonStr); } catch (e) { throw new Error('ASN.1 output was not valid JSON: ' + (e && e.message || e)); }
  }
};

function load() {
  if (readyPromise) return readyPromise;
  readyPromise = (function () {
    var url = 'wasm/core.wasm?v=3';
    if (typeof WebAssembly === 'undefined') {
      return Promise.reject(new Error('WebAssembly is not supported by this browser'));
    }
    function instantiate(buf) {
      return WebAssembly.instantiate(buf, {}).then(function (res) {
        exp = res.instance.exports;
        window.__wasmError = null;
      });
    }
    function fail(err) {
      window.__wasmError = err && err.message ? err.message : String(err);
      throw err;
    }
    if (window.location.protocol === 'file:') {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('WASM fetch failed: HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(instantiate).catch(fail);
    }
    return WebAssembly.instantiateStreaming(fetch(url), {}).then(function (res) {
      exp = res.instance.exports;
      window.__wasmError = null;
    }).catch(function (err) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('WASM fetch failed: HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(instantiate).catch(fail);
    });
  })();
  readyPromise.catch(function () { exp = null; readyPromise = null; });
  return readyPromise;
}

window.Core = Core;
window.loadWasm = load;
})();
