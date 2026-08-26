/* ═══════════════════════════════════════════════════════════
   CryptoRand — unbiased randomness on top of the Web Crypto API.

   The naive `pool[byte % pool.length]` idiom used everywhere is
   biased whenever 256 is not a multiple of pool.length (62-char
   alphabets leak ~1.6% extra probability to the first bytes of
   the pool). Every integer here comes from rejection sampling,
   so every output is exactly uniform. No dependencies.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function cryptoObject() {
  var c = typeof crypto !== 'undefined' ? crypto : (typeof self !== 'undefined' ? self.crypto : null);
  if (!c || !c.getRandomValues) throw new Error('Web Crypto getRandomValues is unavailable');
  return c;
}

/** Fill a Uint32Array with secure random words. */
function words(out) {
  cryptoObject().getRandomValues(out);
  return out;
}

/**
 * Uniform integer in [0, bound). Rejection sampling: draw 32-bit
 * words and discard any value in the dead zone above the largest
 * multiple of `bound` representable in 32 bits. Expected draws < 2
 * for any bound; worst case (bound = 2^31 + 1) ≈ 2.000000002.
 */
function int(bound) {
  if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000) {
    throw new Error('CryptoRand.int: bound must be an integer in [1, 2^32]');
  }
  if (bound === 1) return 0;
  // Powers of two need no rejection — keep exactly log2(bound) random bits.
  if ((bound & (bound - 1)) === 0) {
    var drop = Math.clz32(bound - 1);           // 32 − log2(bound)
    return words(new Uint32Array(1))[0] >>> drop;
  }
  var zone = Math.floor(0x100000000 / bound) * bound; // dead zone starts here
  var buf = new Uint32Array(1);
  do { cryptoObject().getRandomValues(buf); } while (buf[0] >= zone);
  return buf[0] % bound;
}

/** Uniform element of a non-empty array or string. */
function pick(pool) {
  if (!pool || !pool.length) throw new Error('CryptoRand.pick: empty pool');
  return pool[int(pool.length)];
}

/** In-place Fisher–Yates shuffle using unbiased indices; returns the array. */
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = int(i + 1);
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/**
 * RFC 4122 §4.4 UUID v4: 122 secure random bits, version nibble 4
 * and the RFC variant bits set explicitly — no string templates,
 * no modulo bias, no Math.random anywhere near it.
 */
function uuidV4() {
  var b = new Uint8Array(16);
  cryptoObject().getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  var hex = '';
  for (var i = 0; i < 16; i++) hex += b[i].toString(16).padStart(2, '0');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/**
 * Random string of `len` chars drawn uniformly from `pool`, with
 * the option to require at least one char from each pool in
 * `requireFrom` (a non-empty subset of pools whose concatenation
 * equals `pool`). Result is shuffled so required chars don't sit
 * in predictable positions.
 */
function string(len, pool, requireFrom) {
  if (!pool || !pool.length) throw new Error('CryptoRand.string: empty pool');
  var out = [];
  if (requireFrom) {
    requireFrom.forEach(function (set) {
      if (out.length < len) out.push(pick(set));
    });
  }
  while (out.length < len) out.push(pick(pool));
  return shuffle(out).join('');
}

window.CryptoRand = { int: int, pick: pick, shuffle: shuffle, uuidV4: uuidV4, string: string };
})();
