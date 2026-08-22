/* ═══════════════════════════════════════════════════════════
   Shared transforms — ported from src/lib/transforms/*.
   Crypto/hash functions delegate to the WebAssembly core.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var T = {};

/* ── converters ── */
T.csvToJSON = function (s) {
  var lines = s.split('\n').filter(function (l) { return l.trim(); });
  if (!lines.length) throw new Error('CSV is empty');
  var parseLine = function (line) {
    var result = [], current = '', inQuote = false;
    for (var i = 0; i < line.length; i++) {
      if (inQuote) {
        if (line[i] === '"') { if (line[i + 1] === '"') { current += '"'; i++; } else inQuote = false; }
        else current += line[i];
      } else {
        if (line[i] === '"') inQuote = true;
        else if (line[i] === ',') { result.push(current.trim()); current = ''; }
        else current += line[i];
      }
    }
    result.push(current.trim());
    return result;
  };
  var headers = parseLine(lines[0]);
  var rows = lines.slice(1).map(parseLine);
  var json = rows.map(function (r) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = r[i] || ''; });
    return obj;
  });
  return JSON.stringify(json, null, 2);
};

T.yamlToJSON = function (s) {
  var lines = s.split('\n').filter(function (l) { return l.trim() && !l.trim().startsWith('#'); });
  var root = [];
  var stack = [{ node: root, indent: -1 }];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
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
    if (stack[stack.length - 1].indent < indent) {
      var parent = stack[stack.length - 1].node;
      var lastParent = parent[parent.length - 1];
      if (lastParent) lastParent.children.push(entry);
    } else {
      stack[stack.length - 1].node.push(entry);
    }
    stack.push({ node: entry.children, indent: indent });
  }
  function toValue(node) {
    if (node.children.length === 0) {
      var v = node.value;
      if (v === 'true') return true; if (v === 'false') return false; if (v === 'null' || v === '~') return null;
      var num = Number(v); if (!isNaN(num) && v !== '') return num;
      return v;
    }
    if (node.children.every(function (c) { return c.key === undefined; })) return node.children.map(toValue);
    var obj = {};
    for (var i = 0; i < node.children.length; i++) if (node.children[i].key) obj[node.children[i].key] = toValue(node.children[i]);
    return obj;
  }
  if (root.length === 1) return JSON.stringify(toValue(root[0]), null, 2);
  return JSON.stringify(root.map(toValue), null, 2);
};

T.baseConvert = function (num, fromBase, toBase) {
  var n = parseInt(num, fromBase);
  if (isNaN(n)) throw new Error('Invalid number for base ' + fromBase);
  return n.toString(toBase).toUpperCase();
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
  var parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format (expected 3 parts)');
  try {
    var h = JSON.parse(decodeURIComponent(escape(atob(parts[0]))));
    var p = JSON.parse(decodeURIComponent(escape(atob(parts[1]))));
    return { header: JSON.stringify(h, null, 2), payload: JSON.stringify(p, null, 2), signature: parts[2] };
  } catch (e) { throw new Error('Invalid JWT - could not decode header/payload'); }
};

/* ── encoding ── */
T.base64Encode = function (s) { try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { throw new Error('Failed to encode as Base64'); } };
T.base64Decode = function (s) { try { return decodeURIComponent(escape(atob(s.replace(/\s/g, '')))); } catch (e) { throw new Error('Invalid Base64 input'); } };
T.urlEncode = function (s) { return encodeURIComponent(s); };
T.urlDecode = function (s) { try { return decodeURIComponent(s); } catch (e) { throw new Error('Invalid URL encoding'); } };
T.htmlEncode = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
T.htmlDecode = function (s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/'); };
T.hexEncode = function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); };
T.hexDecode = function (s) {
  var hex = s.replace(/\s/g, '');
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hex string');
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
    if (typeof val === 'string') return val.includes('\n') ? '|\n' + indent + '  ' + val : /[:{}\[\],&*\?\|<>=!%@`#]/.test(val) ? '"' + val.replace(/"/g, '\\"') + '"' : val;
    if (Array.isArray(val)) {
      if (!val.length) return '[]';
      return val.map(function (v) { return '\n' + indent + '- ' + toYaml(v, indent + '  ').trimStart(); }).join('');
    }
    if (typeof val === 'object') {
      var entries = Object.entries(val);
      if (!entries.length) return '{}';
      return entries.map(function (e) { return '\n' + indent + e[0] + ': ' + toYaml(e[1], indent + '  ').trimStart(); }).join('');
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
    if (val === null || val === undefined) return '<' + name + '/>';
    if (typeof val !== 'object') return '<' + name + '>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</' + name + '>';
    if (Array.isArray(val)) return val.map(function (v) { return toXml(v, name); }).join('\n');
    return '<' + name + '>\n' + Object.entries(val).map(function (e) { return '  ' + toXml(e[1], e[0]).replace(/\n/g, '\n  '); }).join('\n') + '\n</' + name + '>';
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
T.textDiff = function (a, b) {
  var linesA = a.split('\n'), linesB = b.split('\n');
  var result = [];
  var maxLen = Math.max(linesA.length, linesB.length);
  for (var i = 0; i < maxLen; i++) {
    if (i >= linesA.length) result.push('+ ' + linesB[i]);
    else if (i >= linesB.length) result.push('- ' + linesA[i]);
    else if (linesA[i] !== linesB[i]) { result.push('- ' + linesA[i]); result.push('+ ' + linesB[i]); }
    else result.push('  ' + linesA[i]);
  }
  return result.join('\n');
};
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
T.uuidV4 = function () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};
T.generatePassword = function (length, opts) {
  length = length || 24;
  opts = opts || {};
  var sets = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?~' };
  var active = Object.entries(opts).filter(function (e) { return e[1]; }).map(function (e) { return sets[e[0]]; });
  var pool = active.length ? active.join('') : sets.lower + sets.upper + sets.digits;
  var getRandomByte = function () { var arr = new Uint8Array(1); crypto.getRandomValues(arr); return arr[0]; };
  var result = '';
  for (var i = 0; i < active.length; i++) result += active[i][getRandomByte() % active[i].length];
  for (var j = result.length; j < length; j++) result += pool[getRandomByte() % pool.length];
  return result.split('').sort(function () { return Math.random() - 0.5; }).join('');
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
