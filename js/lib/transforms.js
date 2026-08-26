/* ═══════════════════════════════════════════════════════════
   Shared transforms — ported from src/lib/transforms/*.
   Crypto/hash functions delegate to the WebAssembly core.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var T = {};

/**
 * RFC 4180 CSV parser. Handles quoted fields containing commas,
 * CRLF/newlines and escaped quotes ("") ; strips a UTF-8 BOM;
 * never trims cell content (whitespace is data).
 * Returns array of rows (arrays of strings).
 */
T.parseCSV = function (s) {
  var text = s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  var rows = [];
  var row = [];
  var cur = '';
  var i = 0, n = text.length;
  var inQuotes = false;
  var sawAny = false;
  while (i < n) {
    var ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"' && cur === '') { inQuotes = true; sawAny = true; i++; continue; }
    if (ch === ',') { row.push(cur); cur = ''; sawAny = true; i++; continue; }
    if (ch === '\r') {
      if (text.charAt(i + 1) === '\n') i++;
      row.push(cur); rows.push(row);
      row = []; cur = ''; sawAny = false; i++; continue;
    }
    if (ch === '\n') {
      row.push(cur); rows.push(row);
      row = []; cur = ''; sawAny = false; i++; continue;
    }
    cur += ch; sawAny = true; i++;
  }
  if (cur !== '' || row.length || sawAny) { row.push(cur); rows.push(row); }
  return rows;
};

T.csvToJSON = function (s) {
  var rows = T.parseCSV(s);
  if (!rows.length) throw new Error('CSV is empty');
  var seen = {};
  var headers = rows[0].map(function (h) {
    var name = h === '' ? '(unnamed)' : h;
    if (seen[name]) { seen[name]++; return name + '_' + seen[name]; }
    seen[name] = 1;
    return name;
  });
  var json = rows.slice(1).map(function (r) {
    var obj = {};
    headers.forEach(function (h, idx) { obj[h] = idx < r.length ? r[idx] : ''; });
    return obj;
  });
  return JSON.stringify(json, null, 2);
};

T.yamlToJSON = function (s) {
  var lines = s.split('\n').filter(function (l) { return l.trim() && !l.trim().startsWith('#'); });
  if (!lines.length) return '{}';
  var hasIndent = lines.some(function (l) { return l.search(/\S/) > 0; });
  var isTopArray = lines.every(function (l) { return l.trim().startsWith('- '); });
  if (isTopArray) {
    var _arr = [];
    for (var _yI = 0; _yI < lines.length; _yI++) { var _yV = lines[_yI].trim().slice(2).trim(); if (_yV === 'true') _arr.push(true); else if (_yV === 'false') _arr.push(false); else if (_yV === 'null' || _yV === '~') _arr.push(null); else if (_yV !== '' && !isNaN(Number(_yV))) _arr.push(Number(_yV)); else _arr.push(_yV); }
    return JSON.stringify(_arr, null, 2);
  }
  // Flat-doc fast path: if no line is indented, it's just key: value pairs
  if (!hasIndent) {
    var out = Object.create(null);
    for (var i = 0; i < lines.length; i++) {
      var c = lines[i].trim();
      if (c.startsWith('- ')) continue; // array at top level not expected in this path
      var idx = c.indexOf(':');
      if (idx < 0) continue;
      var k = c.slice(0, idx).trim();
      if (!k || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      var v = c.slice(idx + 1).trim();
      if (v === 'true') out[k] = true;
      else if (v === 'false') out[k] = false;
      else if (v === 'null' || v === '~') out[k] = null;
      else if (v !== '' && !isNaN(Number(v))) out[k] = Number(v);
      else out[k] = v;
    }
    return JSON.stringify(out, null, 2);
  }
  var root = [];
  var stack = [{ node: root, indent: -1 }];
  for (var ii = 0; ii < lines.length; ii++) {
    var line = lines[ii];
    var indent = line.search(/\S/);
    var content = line.trim();
    var isArray = content.startsWith('- ');
    var entry = { value: isArray ? content.slice(2).trim() : content.split(':')[0].trim(), children: [], key: isArray ? undefined : content.split(':')[0].trim() };
    if (content.includes(':') && !isArray) {
      var colonIdx = content.indexOf(':');
      entry.value = content.slice(colonIdx + 1).trim();
    } else if (isArray) {
      entry.value = content.slice(2).trim();
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    var top = stack[stack.length - 1];
    if (top.indent < indent && top.node.length) {
      var lastParent = top.node[top.node.length - 1];
      // Two leaf siblings like `b: 1` / `c: 2` under `a:` should both land in a.children,
      // not c inside b.children. Detect: both leaves, both keyed, same indent level as entry.
      // Array items (key undefined) are always siblings, not nested.
      var bothLeaves = lastParent.children.length === 0 && entry.children.length === 0;
      var isSibling = false;
      if (entry.key === undefined && lastParent.key === undefined) isSibling = true;
      else if (entry.key && lastParent.key && entry.value !== '' && lastParent.value !== '' && bothLeaves) isSibling = true;
      if (isSibling) top.node.push(entry);
      else lastParent.children.push(entry);
    } else {
      top.node.push(entry);
    }
    if (entry.value === '' || entry.key === undefined) stack.push({ node: entry.children, indent: indent });
  }
  function toValue(node) {
    if (node.children.length === 0) {
      var v = node.value;
      if (v === 'true') return true; if (v === 'false') return false; if (v === 'null' || v === '~') return null;
      var num = Number(v); if (!isNaN(num) && v !== '') return num;
      return v;
    }
    if (node.children.every(function (c) { return c.key === undefined; })) {
      var arr = node.children.map(toValue);
      if (node.key) { var w = Object.create(null); w[node.key] = arr; return w; }
      return arr;
    }
    var obj = Object.create(null);
    for (var j2 = 0; j2 < node.children.length; j2++) {
      var k = node.children[j2].key;
      if (!k) continue;
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      obj[k] = toValue(node.children[j2]);
    }
    if (node.key) { var outer = Object.create(null); outer[node.key] = obj; return outer; }
    return obj;
  }
  if (root.length === 1) {
    var single = toValue(root[0]);
    // toValue already wraps keyed roots, but if root[0] had no key it's already unwrapped
    return JSON.stringify(single, null, 2);
  }
  // For multiple top-level entries, merge their wrapped objects
  var merged = Object.create(null);
  for (var ri = 0; ri < root.length; ri++) {
    var v2 = toValue(root[ri]);
    if (v2 && typeof v2 === 'object' && !Array.isArray(v2)) Object.assign(merged, v2);
    else merged['item' + ri] = v2;
  }
  if (Object.keys(merged).length === root.length || root.every(function(n){return n.key;})) return JSON.stringify(merged, null, 2);
  return JSON.stringify(root.map(toValue), null, 2);
};

T.baseConvertDetailed = function (raw, fromBase, toBase) {
  var s = String(raw).trim();
  if (!s) throw new Error('Enter a number');
  var neg = s.charAt(0) === '-';
  var digits = (neg ? s.slice(1) : s).toLowerCase().replace(/[_\s]/g, '');
  if (!digits) throw new Error('Enter a number');
  for (var i = 0; i < digits.length; i++) { var v = parseInt(digits.charAt(i), 36); if (!(v >= 0 && v < fromBase)) throw new Error('Invalid digit "' + digits.charAt(i) + '" for base ' + fromBase); }
  var n = 0n; var base = BigInt(fromBase);
  for (var j = 0; j < digits.length; j++) n = n * base + BigInt(parseInt(digits.charAt(j), 36));
  var out = (neg ? '-' : '') + n.toString(toBase);
  if (toBase === 16) out = out.toUpperCase();
  var BASE_NAMES = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hex' };
  var name = BASE_NAMES[toBase] || 'Base ' + toBase;
  return s.trim() + ' (base ' + fromBase + ' \u2192 ' + name + ')\n' + '\u2500'.repeat(20) + '\n' + name + ': ' + out + (fromBase !== 10 ? '\nDecimal: ' + (neg ? '-' : '') + n.toString(10) : '');
};
T.baseConvert = function (num, fromBase, toBase) {
  var raw = String(num).trim();
  if (!raw) throw new Error('Empty number');
  var neg = raw.charAt(0) === '-';
  var digits = (neg ? raw.slice(1) : raw).toLowerCase().replace(/[_\s]/g, '');
  if (!digits) throw new Error('Invalid number');
  for (var i = 0; i < digits.length; i++) { var v = parseInt(digits.charAt(i), 36); if (!(v >= 0 && v < fromBase)) throw new Error('Invalid digit "' + digits.charAt(i) + '" for base ' + fromBase); }
  var n = 0n; var base = BigInt(fromBase);
  for (var j = 0; j < digits.length; j++) n = n * base + BigInt(parseInt(digits.charAt(j), 36));
  var out = (neg ? '-' : '') + n.toString(toBase);
  return toBase === 16 ? out.toUpperCase() : out;
};
T.timestampToDate = function (ts) { return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19); };
T.dateToTimestamp = function (s) { var d = new Date(s); if (isNaN(d.getTime())) throw new Error('Invalid date'); return Math.floor(d.getTime() / 1000); };
T.hexToRGB = function (hex) {
  var h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h) && !/^[0-9a-fA-F]{3}$/.test(h)) throw new Error('Invalid hex color');
  var full = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
  return parseInt(full.slice(0, 2), 16) + ', ' + parseInt(full.slice(2, 4), 16) + ', ' + parseInt(full.slice(4, 6), 16);
};
T.rgbToHex = function (r, g, b) {
  if ([r, g, b].some(function (v) { return v < 0 || v > 255; })) throw new Error('RGB values must be 0-255');
  return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
};
T.hslToHex = function (h, s, l) {
  s /= 100; l /= 100;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = l - c / 2;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  return T.rgbToHex(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
};
T.numberToWords = function (n) {
  var ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n === 0) return 'zero';
  var chunks = function (num) {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + chunks(num % 100) : '');
    return '';
  };
  var units = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];
  var res = '', i = 0;
  while (n > 0 && i < units.length) {
    var part = n % 1000;
    if (part) res = chunks(part) + (units[i] ? ' ' + units[i] : '') + (res ? ' ' : '') + res;
    n = Math.floor(n / 1000); i++;
  }
  return res.trim();
};

/* ── crypto (WASM-backed) ── */
T.sha256 = function (s) { return Core.sha256Hex(s); };
T.sha1 = function (s) { return Core.sha1Hex(s); };
T.sha384 = function (s) { return Core.sha384Hex(s); };
T.sha512 = function (s) { return Core.sha512Hex(s); };
T.hmacSha256 = function (key, message) { return Core.hmacHex(key, message, 1); };
T.hmacSha1 = function (key, message) { return Core.hmacHex(key, message, 0); };
T.md5 = function (s) { return Core.md5Hex(s); };
T.crc32 = function (s) { return Core.crc32Hex(s); };
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
    var h = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64UrlToStandard(parts[0])), function (c) { return c.charCodeAt(0); })));
    var p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64UrlToStandard(parts[1])), function (c) { return c.charCodeAt(0); })));
    return { header: JSON.stringify(h, null, 2), payload: JSON.stringify(p, null, 2), signature: parts[2], rawHeader: h, rawPayload: p };
  } catch (e) { throw new Error('Invalid JWT - could not decode header/payload'); }
};

/**
 * Quote a plain scalar when YAML would otherwise misread it
 * (bool/null/number lookalikes, outer whitespace, indicators).
 */
function yamlQuoteIfNeeded(str) {
  var must =
    str === '' ||
    /^\s|\s$/.test(str) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(str) ||
    /^-?(0|[1-9][0-9_]*)(\.[0-9_]+)?([eE][+-]?[0-9]+)?$/.test(str) ||
    /^0x[0-9a-fA-F]+$|^0o[0-7]+$/.test(str) ||
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(str) ||
    str.indexOf(': ') >= 0 ||
    str.indexOf(' #') >= 0 ||
    str.charAt(str.length - 1) === ':';
  if (!must) return str;
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
}

/* ── encoding ──
   Base64 via TextEncoder/TextDecoder — correct for all of Unicode.
   (The previous unescape(encodeURIComponent(s)) trick relied on two
   deprecated global functions and throws on lone surrogates.) */
function utf8Bytes(s) { return new TextEncoder().encode(s); }
function bytesToBinaryString(bytes) {
  var out = '';
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}
/** RFC 4648 §5 base64url → standard alphabet, padding restored. */
function base64UrlToStandard(s) {
  var t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4 !== 0) t += '=';
  return t;
}
T.base64Encode = function (s) { try { return btoa(bytesToBinaryString(utf8Bytes(s))); } catch (e) { throw new Error('Failed to encode as Base64'); } };
T.base64Decode = function (s) {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), function (c) { return c.charCodeAt(0); }));
  } catch (e) { throw new Error('Invalid Base64 input'); }
};
T.urlEncode = function (s) { return encodeURIComponent(s); };
T.urlDecode = function (s) { try { return decodeURIComponent(s); } catch (e) { throw new Error('Invalid URL encoding'); } };
T.htmlEncode = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
T.htmlDecode = function (s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/'); };
T.hexEncode = function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); };
T.hexDecode = function (s) {
  var hex = s.replace(/\s/g, '');
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hex string');
  if (hex.length % 2 !== 0) throw new Error('Hex must have even length');
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};
T.binaryEncode = function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(2).padStart(8, '0'); }).join(' '); };
T.binaryDecode = function (s) {
  var bits = s.replace(/\s/g, '');
  if (!/^[01]*$/.test(bits) || bits.length % 8 !== 0) throw new Error('Invalid binary string (must be multiple of 8 bits)');
  var bytes = new Uint8Array(bits.length / 8);
  for (var i = 0; i < bits.length; i += 8) bytes[i / 8] = parseInt(bits.slice(i, i + 8), 2);
  return new TextDecoder().decode(bytes);
};
T.rot13 = function (s) { return s.replace(/[a-zA-Z]/g, function (c) { var code = c.charCodeAt(0); var base = code >= 97 ? 97 : 65; return String.fromCharCode(((code - base + 13) % 26) + base); }); };
T.rot47 = function (s) { return s.replace(/[\x21-\x7e]/g, function (c) { return String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)); }); };
T.base32Encode = function (s) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var bytes = new TextEncoder().encode(s);
  var bits = '', result = '';
  for (var i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  for (var j = 0; j < bits.length; j += 5) result += alphabet[parseInt(bits.slice(j, j + 5), 2)];
  return result;
};
T.base32Decode = function (s) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!clean) throw new Error('Invalid Base32 input');
  var bits = '';
  for (var i = 0; i < clean.length; i++) {
    var idx = alphabet.indexOf(clean[i]);
    if (idx === -1) throw new Error('Invalid Base32 character: ' + clean[i]);
    bits += idx.toString(2).padStart(5, '0');
  }
  var bytes = [];
  for (var j = 0; j + 8 <= bits.length; j += 8) bytes.push(parseInt(bits.slice(j, j + 8), 2));
  return new TextDecoder().decode(new Uint8Array(bytes));
};
var morseMap = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.' };
var revMorse = {};
for (var mk in morseMap) revMorse[morseMap[mk]] = mk;
T.morseEncode = function (s) { return s.toUpperCase().split('').map(function (c) { return morseMap[c] || (c === ' ' ? '/' : '?'); }).join(' '); };
T.morseDecode = function (s) { return s.trim().split(/\s+/).map(function (code) { return code === '/' ? ' ' : revMorse[code] || '?'; }).join(''); };

/* ── json ── */
T.validateJSON = function (s) {
  try {
    var data = JSON.parse(s);
    return { valid: true, data: data };
  } catch (e) {
    var msg = e instanceof Error ? e.message : String(e);
    var posMatch = msg.match(/position\s+(\d+)/i);
    var lineMatch = msg.match(/line\s+(\d+)/i);
    var position = posMatch ? parseInt(posMatch[1]) : -1;
    var line = lineMatch ? parseInt(lineMatch[1]) : -1;
    var col = -1;
    if (position >= 0 && line < 0) {
      var before = s.slice(0, position);
      line = (before.match(/\n/g) || []).length + 1;
      col = position - before.lastIndexOf('\n');
    }
    var detail = msg;
    if (line > 0) detail += ' at line ' + line;
    if (col > 0) detail += ', column ' + col;
    return { valid: false, error: detail };
  }
};
T.formatJSON = function (s, indent) { return JSON.stringify(JSON.parse(s), null, indent === undefined ? 2 : indent); };
T.minifyJSON = function (s) { return JSON.stringify(JSON.parse(s)); };
T.jsonToCSV = function (s) {
  var data = JSON.parse(s);
  var arr = Array.isArray(data) ? data : [data];
  if (!arr.length) return '';
  var headers = Array.from(new Set(arr.flatMap(function (o) { return Object.keys(o); })));
  var rows = arr.map(function (obj) {
    return headers.map(function (h) {
      var v = obj[h];
      var sv = v === null || v === undefined ? '' : String(v);
      return sv.includes(',') || sv.includes('"') || sv.includes('\n') ? '"' + sv.replace(/"/g, '""') + '"' : sv;
    });
  });
  return [headers.join(','), rows.map(function (r) { return r.join(','); }).join('\n')].join('\n');
};
T.jsonToYAML = function (s) {
  var obj = JSON.parse(s);
  var toYaml = function (val, indent) {
    if (indent === undefined) indent = '';
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') {
      if (val.indexOf('\n') >= 0) return '|\n' + val.split('\n').map(function (l) { return indent + '  ' + l; }).join('\n');
      return yamlQuoteIfNeeded(val);
    }
    if (Array.isArray(val)) {
      if (!val.length) return '[]';
      return val.map(function (v) { return '\n' + indent + '- ' + toYaml(v, indent + '  ').trimStart(); }).join('');
    }
    if (typeof val === 'object') {
      var entries = Object.entries(val);
      if (!entries.length) return '{}';
      return entries.map(function (e) { return '\n' + indent + yamlQuoteIfNeeded(e[0]) + ': ' + toYaml(e[1], indent + '  ').trimStart(); }).join('');
    }
    return String(val);
  };
  return toYaml(obj).trim();
};
T.jsonDiff = function (a, b) {
  var oa = JSON.parse(a), ob = JSON.parse(b);
  var diffs = [];
  function compare(x, y, path) {
    if (typeof x !== typeof y) { diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
    if (x === null || y === null) { if (x !== y) diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
    if (typeof x !== 'object') { if (x !== y) diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
    if (Array.isArray(x) && Array.isArray(y)) {
      var max = Math.max(x.length, y.length);
      for (var i = 0; i < max; i++) {
        if (i >= x.length) diffs.push('+ ' + path + '[' + i + ']: ' + JSON.stringify(y[i]));
        else if (i >= y.length) diffs.push('- ' + path + '[' + i + ']: ' + JSON.stringify(x[i]));
        else compare(x[i], y[i], path + '[' + i + ']');
      }
      return;
    }
    var keys = Array.from(new Set(Object.keys(x).concat(Object.keys(y))));
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!(key in x)) diffs.push('+ ' + path + '.' + key + ': ' + JSON.stringify(y[key]));
      else if (!(key in y)) diffs.push('- ' + path + '.' + key + ': ' + JSON.stringify(x[key]));
      else compare(x[key], y[key], path + '.' + key);
    }
  }
  compare(oa, ob, 'root');
  return diffs.length ? diffs.join('\n') : 'No differences found';
};
T.jsonToXML = function (s) {
  var obj = JSON.parse(s);
  function toXml(val, name) {
    var safe = String(name).replace(/[^a-zA-Z0-9_\-.:]/g, '_').replace(/^[^a-zA-Z_]/, '_$&') || 'item';
    if (val === null || val === undefined) return '<' + safe + '/>';
    if (typeof val !== 'object') return '<' + safe + '>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</' + safe + '>';
    if (Array.isArray(val)) return val.map(function (v) { return toXml(v, safe); }).join('\n');
    return '<' + safe + '>\n' + Object.entries(val).map(function (e) { return '  ' + toXml(e[1], e[0]).replace(/\n/g, '\n  '); }).join('\n') + '\n</' + safe + '>';
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + toXml(obj, 'root');
};
T.jsonEscape = function (s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'); };
T.jsonUnescape = function (s) { return s.replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); };

/* ── text ── */
var EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
var PHONE_RE = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}/g;
var URL_RE = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
var IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
T.extractEmails = function (s, delimiter) { return (s.match(EMAIL_RE) || []).join(delimiter || '\n'); };
T.extractPhones = function (s, delimiter) { return (s.match(PHONE_RE) || []).join(delimiter || '\n'); };
T.extractURLs = function (s, delimiter) { return (s.match(URL_RE) || []).join(delimiter || '\n'); };
T.extractIPs = function (s, delimiter) {
  var matches = s.match(IP_RE) || [];
  return matches.filter(function (ip) { return ip.split('.').every(function (n) { return parseInt(n) >= 0 && parseInt(n) <= 255; }); }).join(delimiter || '\n');
};
T.wordCount = function (s) {
  var words = s.toLowerCase().match(/\b\w+\b/g) || [];
  var counts = {};
  for (var i = 0; i < words.length; i++) counts[words[i]] = (counts[words[i]] || 0) + 1;
  return counts;
};
T.textStats = function (s) {
  var chars = s.length;
  var words = (s.match(/\b\w+\b/g) || []).length;
  var lines = s ? s.split('\n').length : 0;
  var sentences = (s.match(/[.!?]+/g) || []).length || (words > 0 ? 1 : 0);
  var paragraphs = s ? s.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length : 0;
  var avgWordLen = words ? Math.round((s.match(/\b\w+\b/g) || []).reduce(function (sum, w) { return sum + w.length; }, 0) / words * 10) / 10 : 0;
  var readingTime = Math.ceil(words / 200);
  return { characters: chars, words: words, lines: lines, sentences: sentences, paragraphs: paragraphs, avgWordLen: avgWordLen, readingTime: readingTime };
};
T.caseConvert = function (s, style) {
  var words = s.match(/\b\w+\b/g) || [];
  switch (style) {
    case 'lower': return s.toLowerCase();
    case 'upper': return s.toUpperCase();
    case 'title': return words.map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
    case 'camel': return words.map(function (w, i) { return i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join('');
    case 'pascal': return words.map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join('');
    case 'snake': return words.map(function (w) { return w.toLowerCase(); }).join('_');
    case 'screaming_snake': return words.map(function (w) { return w.toUpperCase(); }).join('_');
    case 'kebab': return words.map(function (w) { return w.toLowerCase(); }).join('-');
    case 'train': return words.map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join('-');
    default: return s;
  }
};
T.slugify = function (s) { return s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, ''); };
T.textDiff = function (a, b) { return MyersDiff.linesText(a, b); };
T.deduplicate = function (s) { return Array.from(new Set(s.split('\n'))).join('\n'); };
T.sortLines = function (s, desc) {
  var lines = s.split('\n');
  lines.sort(desc ? function (a, b) { return b.localeCompare(a); } : function (a, b) { return a.localeCompare(b); });
  return lines.join('\n');
};
T.sortByLength = function (s, desc) {
  var lines = s.split('\n');
  lines.sort(function (a, b) { return desc ? b.length - a.length : a.length - b.length; });
  return lines.join('\n');
};
T.regexTest = function (pattern, flags, text) {
  try {
    var re = new RegExp(pattern, flags);
    var matches = Array.from(text.matchAll(re), function (m) { return m[0]; });
    return { matches: matches, count: matches.length };
  } catch (e) { throw new Error('Invalid regex: ' + (e instanceof Error ? e.message : String(e))); }
};
T.regexEscape = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
T.palindromeCheck = function (s) {
  var clean = s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return clean === clean.split('').reverse().join('');
};
T.uuidV4 = function () { return CryptoRand.uuidV4(); };
T.generatePassword = function (length, opts) {
  length = length || 24;
  opts = opts || {};
  var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower = 'abcdefghijklmnopqrstuvwxyz';
  var digits = '0123456789', symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?~';
  var active = [];
  if (opts.upper !== false) active.push(upper);
  if (opts.lower !== false) active.push(lower);
  if (opts.digits !== false) active.push(digits);
  if (opts.symbols === true) active.push(symbols);
  if (!active.length) active = [lower, upper, digits];
  return CryptoRand.string(length, active.join(''), active);
};
T.loremIpsum = function (paragraphs) {
  paragraphs = paragraphs || 1;
  var words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'dolor', 'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum'];
  var sentences = Array.from({ length: paragraphs * 5 }, function () {
    var len = 5 + Math.floor(Math.random() * 10);
    return Array.from({ length: len }, function (_, i) {
      var w = words[Math.floor(Math.random() * words.length)];
      return i === 0 ? w[0].toUpperCase() + w.slice(1) : w;
    }).join(' ') + '.';
  });
  var result = [];
  for (var i = 0; i < paragraphs; i++) result.push(sentences.slice(i * 5, i * 5 + 5).join(' '));
  return result.join('\n\n');
};
T.formatPhone = function (s) {
  var digits = s.replace(/\D/g, '');
  if (digits.length === 10) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  if (digits.length === 11 && digits[0] === '1') return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
  return digits;
};

window.Transforms = T;
})();
