/* Shared crypto transforms (hashes, HMAC, SRI, PEM, entropy, JWT).
   Split from js/lib/transforms.js; extends the shared Transforms object.
   Load after js/lib/transforms.js (classic scripts, in-order). */
(function () {
'use strict';

var T = window.Transforms;
if (!T) throw new Error('crypto.js needs js/lib/transforms.js first');

/* ── crypto (WASM-backed) ── */
T.sha256 = function (s) { return Core.sha256Hex(s); };
T.sha1 = function (s) { return Core.sha1Hex(s); };
T.sha384 = function (s) { return Core.sha384Hex(s); };
T.sha512 = function (s) { return Core.sha512Hex(s); };
T.hmacSha256 = function (key, message) { return Core.hmacHex(key, message, 1); };
T.hmacSha1 = function (key, message) { return Core.hmacHex(key, message, 0); };
/* HMAC UI contract: message input plus key/algorithm options. Moved from the manifest for single source. */
T.hmacOpts = function (s, opts) {
  var key = (opts && opts.key) || 'secret';
  var alg = (opts && opts.algorithm) || 'SHA-256';
  return alg === 'SHA-1' ? T.hmacSha1(key, s) : T.hmacSha256(key, s);
};
T.md5 = function (s) { return Core.md5Hex(s); };
T.crc32 = function (s) { return Core.crc32Hex(s); };
T.hashBytes = function (slug, bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('hashBytes needs a Uint8Array of file bytes');
  if (slug === 'md5-hash') return Core.md5Bytes(bytes);
  if (slug === 'sha1-hash') return Core.sha1Bytes(bytes);
  if (slug === 'sha256-hash') return Core.sha256Bytes(bytes);
  if (slug === 'sha384-hash') return Core.sha384Bytes(bytes);
  if (slug === 'sha512-hash') return Core.sha512Bytes(bytes);
  if (slug === 'crc32-checksum') return Core.crc32Bytes(bytes);
  throw new Error('Unknown hash tool: ' + slug);
};
T.hexToBase64 = function (hex) {
  var h = T._stripHex(hex);
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error('Invalid hex string');
  if (h.length % 2 !== 0) throw new Error('Hex must have even length');
  if (!h.length) throw new Error('Enter a hex string');
  var bytes = new Uint8Array(h.length / 2);
  for (var i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  try { return btoa(T._bytesToBinaryString(bytes)); }
  catch (e) { throw new Error('Failed to encode as Base64'); }
};
T.sriHash = function (s, algo) {
  if (!String(s).trim()) throw new Error('Enter text to hash');
  var a = String((algo || 'SHA-384')).toUpperCase();
  var hex;
  if (a === 'SHA-384') hex = Core.sha384Hex(s);
  else if (a === 'SHA-512') hex = Core.sha512Hex(s);
  else if (a === 'SHA-256') hex = Core.sha256Hex(s);
  else throw new Error('Unknown algorithm ' + JSON.stringify(algo));
  var tag = a === 'SHA-384' ? 'sha384' : a === 'SHA-512' ? 'sha512' : 'sha256';
  return tag + '-' + T.hexToBase64(hex);
};
/* SRI UI contract: text input plus algorithm option. Moved from the manifest for single source. */
T.sriHashOpts = function (s, opts) {
  return T.sriHash(s, (opts && opts.algorithm) || 'SHA-384');
};
T.pemToBytes = function (pem) {
  var text = String(pem);
  if (!text.trim()) throw new Error('Paste a PEM block');
  var m = text.match(/-----BEGIN ([A-Za-z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) throw new Error('No PEM armor found (expected -----BEGIN ...-----)');
  var body = m[2].replace(/\s/g, '');
  var bin;
  try { bin = atob(body); }
  catch (e) { throw new Error('Invalid PEM body (not valid Base64)'); }
  if (!bin.length) throw new Error('PEM block holds no data');
  if (bin.length > 2 * 1024 * 1024) throw new Error('DER input too large (max 2 MB)');
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
  return { label: m[1], bytes: bytes };
};
T.pemInspect = function (pem) {
  var parsed = T.pemToBytes(pem);
  var tree = Core.asn1Parse(parsed.bytes);
  return 'Label: ' + parsed.label + '\nDER: ' + parsed.bytes.length + ' bytes\n' + JSON.stringify(tree, null, 2);
};
T.entropy = function (password) {
  var pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  var bits = Math.round(password.length * Math.log2(pool || 1) * 10) / 10;
  var strength;
  if (bits < 30) strength = 'Weak';
  else if (bits < 50) strength = 'Fair';
  else if (bits < 70) strength = 'Good';
  else if (bits < 100) strength = 'Strong';
  else strength = 'Very Strong';
  return { bits: bits, strength: strength };
};
T.jwtDecode = function (token) {
  var parts = token.trim().split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format (expected 3 parts)');
  try {
    var h = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(T._base64UrlToStandard(parts[0])), function (c) { return c.charCodeAt(0); })));
    var p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(T._base64UrlToStandard(parts[1])), function (c) { return c.charCodeAt(0); })));
    return { header: JSON.stringify(h, null, 2), payload: JSON.stringify(p, null, 2), signature: parts[2], rawHeader: h, rawPayload: p };
  } catch (e) { throw new Error('Invalid JWT - could not decode header/payload'); }
};
/** UTF-8 string → unpadded base64url (RFC 7515 §2). */
T.base64UrlEncodeStr = function (s) {
  try { return btoa(T._bytesToBinaryString(T._utf8Bytes(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  catch (e) { throw new Error('Failed to encode payload'); }
};
/** Byte array → unpadded base64url. */
T.base64UrlEncodeBytes = function (bytes) {
  var bin = '';
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.slice(i, i + CHUNK));
  try { return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  catch (e) { throw new Error('Failed to encode signature'); }
};
/**
 * Sign a JWT (HS256) through the WebAssembly HMAC core. `rawPayload`
 * is a JSON object string; `secret` is the shared key; `expires`
 * is 'none' or a shorthand ('1h', '24h', '7d', '30d') injected as
 * the exp claim when absent. Returns the compact token.
 */
T.jwtSign = function (rawPayload, secret, expires) {
  if (!secret) throw new Error('Enter a secret key');
  var payload;
  try { payload = JSON.parse(String(rawPayload)); }
  catch (e) { throw new Error('Invalid JSON payload'); }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload must be a JSON object');
  var WINDOWS = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };
  if (expires && expires !== 'none' && payload.exp === undefined) {
    if (!WINDOWS[expires]) throw new Error('Unknown expiry "' + expires + '"');
    payload.exp = Math.floor(Date.now() / 1000) + WINDOWS[expires];
  }
  var signingInput = T.base64UrlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) +
    '.' + T.base64UrlEncodeStr(JSON.stringify(payload));
  var hex = Core.hmacHex(secret, signingInput, 1);
  var bytes = [];
  for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return signingInput + '.' + T.base64UrlEncodeBytes(bytes);
};
/* JWT UI contract: payload input plus secret/expires options. Moved from the manifest so shell UI delegates to this single source. */
T.jwtSignOpts = function (s, opts) {
  return T.jwtSign(s, (opts && opts.secret) || '', (opts && opts.expires) || 'none');
};
})();
