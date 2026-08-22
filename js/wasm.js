/* ═══════════════════════════════════════════════════════════
   WebAssembly core loader + high-level API.
   Loads wasm/core.wasm (compiled from wasm/core.rs) and exposes
   synchronous hash/HMAC/CRC/QR/ASN.1 functions to the site.
   Works over HTTP (instantiateStreaming) and file:// (fallback).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var exp = null;
var mem = null;
var readyPromise = null;

function ensureReady() {
  if (!exp) {
    if (window.__wasmError) throw new Error('WebAssembly core failed to load: ' + window.__wasmError);
    throw new Error('WebAssembly core is still loading — try again in a moment');
  }
}

function allocBytes(bytes) {
  ensureReady();
  var p = exp.alloc(bytes.length);
  if (p < 0) throw new Error('WASM allocation failed');
  mem.set(bytes, p);
  return p;
}

function allocSlot() { return exp.alloc(4); }

function readU32(p) {
  var b = new Uint8Array(mem.buffer, p, 4);
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}

function hexOf(p, n) {
  var out = '';
  var b = new Uint8Array(mem.buffer, p, n);
  for (var i = 0; i < n; i++) out += b[i].toString(16).padStart(2, '0');
  return out;
}

function digest(name, text, outLen) {
  return digestBytes(name, new TextEncoder().encode(text), outLen);
}

function digestBytes(name, bytes, outLen) {
  var p = allocBytes(bytes);
  var out = exp.alloc(outLen);
  var rc = exp[name](p, bytes.length, out);
  if (rc !== 0) { exp.reset(); throw new Error('WASM ' + name + ' failed'); }
  var hex = hexOf(out, outLen);
  exp.reset();
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

  /** binary-input digests (for certificates etc.) */
  md5Bytes: function (b) { return digestBytes('md5', b, 16); },
  sha1Bytes: function (b) { return digestBytes('sha1', b, 20); },
  sha256Bytes: function (b) { return digestBytes('sha256', b, 32); },
  sha384Bytes: function (b) { return digestBytes('sha384', b, 48); },
  sha512Bytes: function (b) { return digestBytes('sha512', b, 64); },

  crc32Hex: function (s) {
    var bytes = new TextEncoder().encode(s);
    var p = allocBytes(bytes);
    var out = exp.alloc(4);
    var rc = exp.crc32(p, bytes.length, out);
    if (rc !== 0) { exp.reset(); throw new Error('WASM crc32 failed'); }
    var hex = hexOf(out, 4);
    exp.reset();
    return hex;
  },

  /** alg: 0 = SHA-1, 1 = SHA-256 */
  hmacHex: function (key, message, alg) {
    var kb = new TextEncoder().encode(key);
    var mb = new TextEncoder().encode(message);
    var kp = allocBytes(kb);
    var mp = allocBytes(mb);
    var outLen = alg === 0 ? 20 : 32;
    var out = exp.alloc(outLen);
    var rc = exp.hmac(mp, mb.length, kp, kb.length, alg, out);
    if (rc !== 0) { exp.reset(); throw new Error('WASM hmac failed'); }
    var hex = hexOf(out, outLen);
    exp.reset();
    return hex;
  },

  /**
   * Encode text as a QR code.
   * ecl: 0=L, 1=M, 2=Q, 3=H
   * Returns { size, matrix: Uint8Array (size*size, 0/1) } or throws.
   */
  qrEncode: function (text, ecl) {
    ensureReady();
    var bytes = new TextEncoder().encode(text);
    if (!bytes.length) throw new Error('Enter text to encode');
    var p = allocBytes(bytes);
    var mSlot = allocSlot();
    var sSlot = allocSlot();
    var rc = exp.qr_encode(p, bytes.length, ecl || 1, mSlot, sSlot);
    if (rc !== 0) { exp.reset(); throw new Error('Text too long for a QR code (' + bytes.length + ' bytes)'); }
    var mPtr = readU32(mSlot);
    var size = readU32(sSlot);
    var matrix = new Uint8Array(mem.buffer.slice(mPtr, mPtr + size * size));
    exp.reset();
    return { size: size, matrix: matrix };
  },

  /**
   * Parse DER bytes into a JSON tree of TLV nodes.
   * Node: { t: tagName, cls, c, n?: oidName, v?: value|children, u?: unusedBits }
   */
  asn1Parse: function (derBytes) {
    ensureReady();
    var p = allocBytes(derBytes);
    var o1 = allocSlot();
    var o2 = allocSlot();
    var rc = exp.asn1_parse(p, derBytes.length, o1, o2);
    if (rc !== 0) { exp.reset(); throw new Error('Could not parse DER data'); }
    var ptr = readU32(o1);
    var len = readU32(o2);
    var jsonStr = new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len));
    exp.reset();
    return JSON.parse(jsonStr);
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
        mem = new Uint8Array(exp.memory.buffer);
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
      mem = new Uint8Array(exp.memory.buffer);
      window.__wasmError = null;
    }).catch(function (err) {
      // streaming failed (MIME or cache edge case) — fall back to bytes
      return fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('WASM fetch failed: HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(instantiate).catch(fail);
    });
  })();
  readyPromise.catch(function () { exp = null; });
  return readyPromise;
}

window.Core = Core;
window.loadWasm = load;
})();
