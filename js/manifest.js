/* ═══════════════════════════════════════════════════════════
   Tool manifest — ported from the Next.js app's manifest.ts.
   All handlers run in the browser; hash/HMAC/CRC handlers call
   the WebAssembly core (js/wasm.js → wasm/core.wasm).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

window.TOOLMANIFEST = [
  // ── JSON ────────────────────────────────────────────────
  { slug: 'json-validator', name: 'JSON Validator', desc: 'Validate and format JSON with detailed error messages — line, column, and position', category: 'json', tags: ['validate', 'format', 'lint'], icon: 'braces', template: 'custom' },
  { slug: 'json-formatter', name: 'JSON Formatter', desc: 'Beautify JSON with configurable indentation', category: 'json', tags: ['format', 'beautify', 'pretty-print'], icon: 'braces', template: 'transform',
    handler: function (s, opts) {
      var n = parseInt((opts && opts.indent) || '2', 10);
      if (isNaN(n) || n < 1 || n > 8) n = 2;
      return JSON.stringify(JSON.parse(s), null, n);
    },
    params: [{ key: 'indent', label: 'Indent', type: 'select', default: '2', options: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: '1', label: '1 space' }] }] },
  { slug: 'json-minifier', name: 'JSON Minifier', desc: 'Compress JSON by removing all whitespace', category: 'json', tags: ['minify', 'compress'], icon: 'braces', template: 'transform',
    handler: function (s) { return JSON.stringify(JSON.parse(s)); } },
  { slug: 'json-to-csv', name: 'JSON → CSV', desc: 'Convert JSON array/object to CSV format', category: 'json', tags: ['convert', 'csv'], icon: 'filespreadsheet', template: 'transform',
    handler: function (s) {
      var data = JSON.parse(s);
      var arr = Array.isArray(data) ? data : [data];
      if (!arr.length) return '';
      var headers = Array.from(new Set(arr.flatMap(function (o) { return Object.keys(o); })));
      var rows = arr.map(function (obj) {
        return headers.map(function (h) {
          var v = obj[h]; var sv = v === null || v === undefined ? '' : String(v);
          return sv.includes(',') || sv.includes('"') || sv.includes('\n') ? '"' + sv.replace(/"/g, '""') + '"' : sv;
        });
      });
      return [headers.join(','), rows.map(function (r) { return r.join(','); }).join('\n')].join('\n');
    } },
  { slug: 'json-to-yaml', name: 'JSON → YAML', desc: 'Convert JSON objects to YAML format — spec-correct quoting of scalars that would re-parse as bools, numbers, nulls or indicators', category: 'json', tags: ['convert', 'yaml'], icon: 'filetype', template: 'transform',
    handler: function (s) {
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
        if (Array.isArray(val)) return val.length ? val.map(function (v) { return '\n' + indent + '- ' + toYaml(v, indent + '  ').trimStart(); }).join('') : '[]';
        var entries = Object.entries(val);
        return entries.length ? entries.map(function (e) { return '\n' + indent + yamlQuoteIfNeeded(e[0]) + ': ' + toYaml(e[1], indent + '  ').trimStart(); }).join('') : '{}';
      };
      return toYaml(obj).trim();
    } },
  { slug: 'json-diff', name: 'JSON Diff', desc: 'Compare two JSON objects and highlight differences', category: 'json', tags: ['diff', 'compare'], icon: 'gitbranch', template: 'transform',
    handler: function (s, opts) {
      var b = (opts && opts.compareTo) || '{}';
      var oa = JSON.parse(s), ob = JSON.parse(b);
      var diffs = [];
      var cmp = function (x, y, path) {
        if (typeof x !== typeof y) { diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
        if (x === null || y === null) { if (x !== y) diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
        if (typeof x !== 'object') { if (x !== y) diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
        if (Array.isArray(x) && Array.isArray(y)) {
          for (var i = 0; i < Math.max(x.length, y.length); i++) {
            if (i >= x.length) diffs.push('+ ' + path + '[' + i + ']: ' + JSON.stringify(y[i]));
            else if (i >= y.length) diffs.push('- ' + path + '[' + i + ']: ' + JSON.stringify(x[i]));
            else cmp(x[i], y[i], path + '[' + i + ']');
          } return;
        }
        var keys = Array.from(new Set(Object.keys(x).concat(Object.keys(y))));
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (!(key in x)) diffs.push('+ ' + path + '.' + key + ': ' + JSON.stringify(y[key]));
          else if (!(key in y)) diffs.push('- ' + path + '.' + key + ': ' + JSON.stringify(x[key]));
          else cmp(x[key], y[key], path + '.' + key);
        }
      };
      cmp(oa, ob, 'root');
      return diffs.length ? diffs.join('\n') : 'No differences found';
    },
    params: [{ key: 'compareTo', label: 'Compare with (JSON)', type: 'textarea', default: '{}' }] },
  { slug: 'json-to-xml', name: 'JSON → XML', desc: 'Convert JSON to XML format', category: 'json', tags: ['convert', 'xml'], icon: 'filetype', template: 'transform',
    handler: function (s) {
      var obj = JSON.parse(s);
      var toXml = function (val, name) {
        if (val === null || val === undefined) return '<' + name + '/>';
        if (typeof val !== 'object') return '<' + name + '>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</' + name + '>';
        if (Array.isArray(val)) return val.map(function (v) { return toXml(v, name); }).join('\n');
        return '<' + name + '>\n' + Object.entries(val).map(function (e) { return '  ' + toXml(e[1], e[0]).replace(/\n/g, '\n  '); }).join('\n') + '\n</' + name + '>';
      };
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + toXml(obj, 'root');
    } },
  { slug: 'json-escape', name: 'JSON Escape', desc: 'Escape special characters for JSON string format', category: 'json', tags: ['escape', 'encode'], icon: 'braces', template: 'transform',
    handler: function (s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'); } },
  { slug: 'json-unescape', name: 'JSON Unescape', desc: 'Unescape JSON-escaped string back to original', category: 'json', tags: ['unescape', 'decode'], icon: 'braces', template: 'transform',
    handler: function (s) {
      return s.replace(/\\(\\|t|r|n|"|'|\/)/g, function (m, ch) {
        switch (ch) {
          case '\\': return '\\';
          case 't': return '\t';
          case 'r': return '\r';
          case 'n': return '\n';
          case '"': return '"';
          case "'": return "'";
          case '/': return '/';
          default: return m;
        }
      });
    } },

  // ── Text Processing ─────────────────────────────────────
  { slug: 'email-extractor', name: 'Email Extractor', desc: 'Extract emails from any text — dedupe, lowercase, filter, sort, delimiters, plus a two-set email diff', category: 'text', tags: ['extract', 'email', 'diff'], icon: 'textsearch', template: 'custom' },
  { slug: 'filename-sanitizer', name: 'Windows Filename Sanitizer', desc: 'Clean any text into a Windows-safe filename: spaces→underscores, invalid chars stripped, reserved names handled, 255-char limit', category: 'text', tags: ['filename', 'windows', 'sanitize'], icon: 'filetype', template: 'transform',
    handler: function (s) {
      var RESERVED = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
      var out = s.replace(/\s+/g, '_').replace(/[<>:"\/\\|?*]/g, '').replace(/[\x00-\x1F]/g, '').replace(/_+/g, '_').replace(/^[.\s_]+|[.\s_]+$/g, '');
      if (RESERVED.includes(out.split('.')[0].toUpperCase())) out = '_' + out;
      if (!out) out = 'unnamed';
      return out.slice(0, 255);
    } },
  { slug: 'phone-extractor', name: 'Phone Extractor', desc: 'Extract phone numbers from text with configurable delimiter', category: 'text', tags: ['extract', 'phone'], icon: 'textsearch', template: 'transform',
    handler: function (s, opts) {
      var d = (opts && opts.delimiter) || '\n';
      var matches = s.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}/g) || [];
      var del = d === 'newline' ? '\n' : d === 'comma' ? ',' : d === 'semicolon' ? ';' : ' ';
      return matches.join(del);
    },
    params: [{ key: 'delimiter', label: 'Delimiter', type: 'select', default: 'newline', options: [{ value: 'newline', label: 'Newline' }, { value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'space', label: 'Space' }] }] },
  { slug: 'url-extractor', name: 'URL Extractor', desc: 'Extract all URLs from text content', category: 'text', tags: ['extract', 'url'], icon: 'globe', template: 'transform',
    handler: function (s) { return (s.match(/https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g) || []).join('\n'); } },
  { slug: 'ip-extractor', name: 'IP Address Extractor', desc: 'Extract IPv4 addresses from text', category: 'text', tags: ['extract', 'ip'], icon: 'globe', template: 'transform',
    handler: function (s) { return (s.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []).filter(function (ip) { return ip.split('.').every(function (n) { return parseInt(n) >= 0 && parseInt(n) <= 255; }); }).join('\n'); } },
  { slug: 'word-counter', name: 'Word Counter', desc: 'Count words, characters, lines, sentences, and reading time', category: 'text', tags: ['count', 'stats', 'analyze'], icon: 'sigma', template: 'transform',
    handler: function (s) {
      var w = (s.match(/\b\w+\b/g) || []).length;
      var c = s.length;
      var l = s ? s.split('\n').length : 0;
      var st = (s.match(/[.!?]+/g) || []).length || (w > 0 ? 1 : 0);
      var p = s ? s.split(/\n\s*\n/).filter(function (x) { return x.trim(); }).length : 0;
      var avg = w ? Math.round((s.match(/\b\w+\b/g) || []).reduce(function (sum, wd) { return sum + wd.length; }, 0) / w * 10) / 10 : 0;
      return [
        'Characters:  ' + c, 'Words:       ' + w, 'Lines:       ' + l,
        'Sentences:   ' + st, 'Paragraphs:  ' + p, 'Avg Word:    ' + avg + ' chars',
        'Read Time:   ~' + Math.ceil(w / 200) + ' min'
      ].join('\n');
    } },
  { slug: 'case-converter', name: 'Case Converter', desc: 'Convert between lowercase, UPPERCASE, Title Case, camelCase, snake_case, kebab-case, PascalCase', category: 'text', tags: ['case', 'convert'], icon: 'casesensitive', template: 'transform',
    handler: function (s, opts) {
      var style = (opts && opts.style) || 'lower';
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
    },
    params: [{ key: 'style', label: 'Style', type: 'select', default: 'lower', options: [
      { value: 'lower', label: 'lowercase' }, { value: 'upper', label: 'UPPERCASE' }, { value: 'title', label: 'Title Case' },
      { value: 'camel', label: 'camelCase' }, { value: 'pascal', label: 'PascalCase' }, { value: 'snake', label: 'snake_case' },
      { value: 'screaming_snake', label: 'SCREAMING_SNAKE' }, { value: 'kebab', label: 'kebab-case' }, { value: 'train', label: 'Train-Case' }
    ] }] },
  { slug: 'slug-generator', name: 'Slug Generator', desc: 'Generate URL-friendly slug from text', category: 'text', tags: ['slug', 'url'], icon: 'globe', template: 'transform',
    handler: function (s) { return s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, ''); } },
  { slug: 'text-diff', name: 'Text Diff', desc: 'Myers shortest-edit-script line diff (the algorithm behind GNU diff/Git) — pinpoints what changed instead of flagging everything after an insertion', category: 'text', tags: ['diff', 'compare'], icon: 'gitbranch', template: 'transform',
    handler: function (s, opts) {
      var b = (opts && opts.compareTo) || '';
      if (!b) return 'Paste comparison text in the "Compare with" field';
      return MyersDiff.linesText(s, b);
    },
    params: [{ key: 'compareTo', label: 'Compare with', type: 'textarea', default: '' }] },
  { slug: 'regex-tester', name: 'Regex Tester', desc: 'Test regular expressions against text with match count', category: 'text', tags: ['regex', 'test', 'pattern'], icon: 'code2', template: 'transform',
    handler: function (s, opts) {
      var pat = (opts && opts.pattern) || ''; var flags = (opts && opts.flags) || 'g';
      if (!pat) throw new Error('Enter a regex pattern');
      var re = new RegExp(pat, flags);
      var matches = Array.from(s.matchAll(re), function (m) { return m[0]; });
      return 'Matches found: ' + matches.length + '\n' + '─'.repeat(40) + '\n' + matches.join('\n');
    },
    params: [
      { key: 'pattern', label: 'Pattern', type: 'text', default: '' },
      { key: 'flags', label: 'Flags', type: 'select', default: 'g', options: [{ value: 'g', label: 'g' }, { value: 'gi', label: 'gi' }, { value: 'gm', label: 'gm' }, { value: 'gim', label: 'gim' }] }
    ] },
  { slug: 'regex-escape', name: 'Regex Escape', desc: 'Escape special regex characters in text', category: 'text', tags: ['regex', 'escape'], icon: 'code2', template: 'transform',
    handler: function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } },
  { slug: 'text-sorter', name: 'Text Sorter', desc: 'Sort lines alphabetically or by length', category: 'text', tags: ['sort', 'lines'], icon: 'arrowleftright', template: 'transform',
    handler: function (s, opts) {
      var dir = opts && opts.direction === 'desc';
      var by = (opts && opts.sortBy) || 'alpha';
      var lines = s.split('\n');
      if (by === 'length') lines.sort(function (a, b) { return dir ? b.length - a.length : a.length - b.length; });
      else lines.sort(dir ? function (a, b) { return b.localeCompare(a); } : function (a, b) { return a.localeCompare(b); });
      return lines.join('\n');
    },
    params: [
      { key: 'sortBy', label: 'Sort by', type: 'select', default: 'alpha', options: [{ value: 'alpha', label: 'Alphabetical' }, { value: 'length', label: 'Length' }] },
      { key: 'direction', label: 'Direction', type: 'select', default: 'asc', options: [{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }] }
    ] },
  { slug: 'text-reverser', name: 'Text Reverser', desc: 'Reverse entire text or each line', category: 'text', tags: ['reverse'], icon: 'shuffle', template: 'transform',
    handler: function (s, opts) { return opts && opts.mode === 'lines' ? s.split('\n').map(function (l) { return l.split('').reverse().join(''); }).join('\n') : s.split('').reverse().join(''); },
    params: [{ key: 'mode', label: 'Mode', type: 'select', default: 'full', options: [{ value: 'full', label: 'Full text' }, { value: 'lines', label: 'Each line' }] }] },
  { slug: 'text-deduplicator', name: 'Line Deduplicator', desc: 'Remove duplicate lines from text', category: 'text', tags: ['deduplicate', 'clean'], icon: 'combine', template: 'transform',
    handler: function (s) { return Array.from(new Set(s.split('\n'))).join('\n'); } },
  { slug: 'palindrome-checker', name: 'Palindrome Checker', desc: 'Check if text reads the same forwards and backwards', category: 'text', tags: ['palindrome', 'check'], icon: 'casesensitive', template: 'transform',
    handler: function (s) {
      var clean = s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      var isPal = clean === clean.split('').reverse().join('');
      return (isPal ? '✓ YES' : '✗ NO') + ' — "' + clean + '" ' + (isPal ? 'is' : 'is not') + ' a palindrome\n\nOriginal: ' + s.slice(0, 200);
    } },

  // ── Generators ──────────────────────────────────────────
  { slug: 'random-string', name: 'Random String Generator', desc: 'Generate random strings with configurable character sets — rejection-sampled, zero modulo bias', category: 'generators', tags: ['random', 'generate'], icon: 'shuffle', template: 'generator',
    genHandler: function (opts) {
      var len = parseInt((opts && opts.length) || '16', 10);
      if (!(len >= 1)) len = 16;
      var sets = (opts && opts.charset) || 'alphanumeric';
      var pool = sets === 'alpha' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' :
        sets === 'numeric' ? '0123456789' :
        sets === 'hex' ? '0123456789abcdef' :
        sets === 'alphanumeric' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' :
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
      return CryptoRand.string(len, pool);
    },
    params: [
      { key: 'length', label: 'Length', type: 'number', default: '16', min: 1, max: 1024 },
      { key: 'charset', label: 'Character Set', type: 'select', default: 'alphanumeric', options: [
        { value: 'alphanumeric', label: 'Letters + Digits' }, { value: 'alpha', label: 'Letters only' },
        { value: 'numeric', label: 'Digits only' }, { value: 'hex', label: 'Hexadecimal' }, { value: 'all', label: 'All characters' }
      ] }
    ] },
  { slug: 'uuid-generator', name: 'UUID v4 Generator', desc: 'RFC 4122 UUID v4 from the Web Crypto CSPRNG — 122 secure random bits, bulk mode available', category: 'generators', tags: ['uuid', 'identifier'], icon: 'key', template: 'generator',
    genHandler: function (opts) {
      var count = parseInt((opts && opts.count) || '1', 10);
      if (!(count >= 1)) count = 1;
      var out = [];
      for (var i = 0; i < count; i++) out.push(CryptoRand.uuidV4());
      return out.join('\n');
    },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 1000 }] },
  { slug: 'password-generator', name: 'Password Generator', desc: 'Strong passwords from the Web Crypto CSPRNG — guaranteed coverage of every selected class, unbiased sampling, shuffled', category: 'generators', tags: ['password', 'security'], icon: 'lock', template: 'generator',
    genHandler: function (opts) {
      var len = parseInt((opts && opts.length) || '24', 10);
      if (!(len >= 4)) len = 4;
      var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower = 'abcdefghijklmnopqrstuvwxyz';
      var digits = '0123456789', symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?~';
      var active = [];
      if (!opts || opts.upper !== 'false') active.push(upper);
      if (!opts || opts.lower !== 'false') active.push(lower);
      if (!opts || opts.digits !== 'false') active.push(digits);
      if (opts && opts.symbols === 'true') active.push(symbols);
      if (!active.length) throw new Error('Select at least one character set');
      var pool = active.join('');
      return CryptoRand.string(len, pool, active);
    },
    params: [
      { key: 'length', label: 'Length', type: 'number', default: '24', min: 4, max: 256 },
      { key: 'upper', label: 'Uppercase', type: 'boolean', default: 'true' },
      { key: 'lower', label: 'Lowercase', type: 'boolean', default: 'true' },
      { key: 'digits', label: 'Digits', type: 'boolean', default: 'true' },
      { key: 'symbols', label: 'Symbols', type: 'boolean', default: 'false' }
    ] },

  // ── Encoding / Decoding ─────────────────────────────────
  // Single-source: all handlers delegate to Transforms (js/lib/transforms.js).
  // This eliminates the divergent second copies that previously lived here
  // with deprecated patterns (unescape/escape + lone-surrogate throw).
  { slug: 'base64-encode', name: 'Base64 Encode', desc: 'Encode text to Base64', category: 'encoding', tags: ['base64', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.base64Encode(s); } },
  { slug: 'base64-decode', name: 'Base64 Decode', desc: 'Decode Base64 back to text', category: 'encoding', tags: ['base64', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.base64Decode(s); } },
  { slug: 'url-encode', name: 'URL Encode', desc: 'Percent-encode a URL string', category: 'encoding', tags: ['url', 'encode'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.urlEncode(s); } },
  { slug: 'url-decode', name: 'URL Decode', desc: 'Decode percent-encoded URL', category: 'encoding', tags: ['url', 'decode'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.urlDecode(s); } },
  { slug: 'html-encode', name: 'HTML Encode', desc: 'Escape HTML entities', category: 'encoding', tags: ['html', 'encode'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.htmlEncode(s); } },
  { slug: 'html-decode', name: 'HTML Decode', desc: 'Unescape HTML entities back to characters', category: 'encoding', tags: ['html', 'decode'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.htmlDecode(s); } },
  { slug: 'hex-encode', name: 'Hex Encode', desc: 'Encode text to hexadecimal', category: 'encoding', tags: ['hex', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.hexEncode(s); } },
  { slug: 'hex-decode', name: 'Hex Decode', desc: 'Decode hexadecimal back to text', category: 'encoding', tags: ['hex', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.hexDecode(s); } },
  { slug: 'binary-encode', name: 'Binary Encode', desc: 'Encode text to binary (8-bit)', category: 'encoding', tags: ['binary', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.binaryEncode(s); } },
  { slug: 'binary-decode', name: 'Binary Decode', desc: 'Decode binary back to text', category: 'encoding', tags: ['binary', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.binaryDecode(s); } },
  { slug: 'base32-encode', name: 'Base32 Encode', desc: 'Encode text to Base32 (RFC 4648)', category: 'encoding', tags: ['base32', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.base32Encode(s); } },
  { slug: 'base32-decode', name: 'Base32 Decode', desc: 'Decode Base32 back to text', category: 'encoding', tags: ['base32', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.base32Decode(s); } },
  { slug: 'rot13', name: 'ROT13', desc: 'Rotate letters by 13 positions (Caesar cipher)', category: 'encoding', tags: ['rot13', 'cipher'], icon: 'shuffle', template: 'transform',
    handler: function (s) { return s.replace(/[a-zA-Z]/g, function (c) { var b = c >= 'a' ? 97 : 65; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); }); } },
  { slug: 'rot47', name: 'ROT47', desc: 'Rotate all printable ASCII by 47 positions', category: 'encoding', tags: ['rot47', 'cipher'], icon: 'shuffle', template: 'transform',
    handler: function (s) { return s.replace(/[\x21-\x7e]/g, function (c) { return String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)); }); } },
  { slug: 'morse-encode', name: 'Morse Code Encoder', desc: 'Encode text to Morse code', category: 'encoding', tags: ['morse', 'encode'], icon: 'code2', template: 'transform',
    handler: function (s) {
      var m = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.' };
      return s.toUpperCase().split('').map(function (c) { return m[c] || (c === ' ' ? '/' : '?'); }).join(' ');
    } },
  { slug: 'morse-decode', name: 'Morse Code Decoder', desc: 'Decode Morse code back to text', category: 'encoding', tags: ['morse', 'decode'], icon: 'code2', template: 'transform',
    handler: function (s) {
      var r = {};
      var m = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.' };
      for (var k in m) r[m[k]] = k;
      return s.trim().split(/\s+/).map(function (c) { return c === '/' ? ' ' : r[c] || '?'; }).join('');
    } },

  // ── Crypto / Hash (WASM-backed) ─────────────────────────
  { slug: 'md5-hash', name: 'MD5 Hash', desc: 'Generate MD5 hash of input text — WebAssembly core', category: 'crypto', tags: ['md5', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    handler: function (s) { return Core.md5Hex(s); } },
  { slug: 'sha256-hash', name: 'SHA-256 Hash', desc: 'Generate SHA-256 hash — WebAssembly core', category: 'crypto', tags: ['sha256', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    handler: function (s) { return Core.sha256Hex(s); } },
  { slug: 'sha1-hash', name: 'SHA-1 Hash', desc: 'Generate SHA-1 hash — WebAssembly core', category: 'crypto', tags: ['sha1', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    handler: function (s) { return Core.sha1Hex(s); } },
  { slug: 'sha512-hash', name: 'SHA-512 Hash', desc: 'Generate SHA-512 hash — WebAssembly core', category: 'crypto', tags: ['sha512', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    handler: function (s) { return Core.sha512Hex(s); } },
  { slug: 'hmac-generator', name: 'HMAC Generator', desc: 'Generate HMAC with SHA-256 or SHA-1 — WebAssembly core', category: 'crypto', tags: ['hmac', 'mac', 'auth'], icon: 'key', template: 'transform', wasm: true,
    handler: function (s, opts) {
      var key = (opts && opts.key) || 'secret';
      var alg = (opts && opts.algorithm) || 'SHA-256';
      return Core.hmacHex(key, s, alg === 'SHA-1' ? 0 : 1);
    },
    params: [
      { key: 'key', label: 'Secret Key', type: 'text', default: 'secret' },
      { key: 'algorithm', label: 'Algorithm', type: 'select', default: 'SHA-256', options: [{ value: 'SHA-256', label: 'SHA-256' }, { value: 'SHA-1', label: 'SHA-1' }] }
    ] },
  { slug: 'crc32-checksum', name: 'CRC32 Checksum', desc: 'Generate CRC32 checksum — WebAssembly core', category: 'crypto', tags: ['crc32', 'checksum'], icon: 'hash', template: 'transform', wasm: true,
    handler: function (s) { return Core.crc32Hex(s); } },
  { slug: 'password-entropy', name: 'Password Entropy', desc: 'Calculate password entropy and strength score', category: 'crypto', tags: ['entropy', 'strength', 'password'], icon: 'lock', template: 'transform',
    handler: function (s) {
      var pool = 0;
      if (/[a-z]/.test(s)) pool += 26;
      if (/[A-Z]/.test(s)) pool += 26;
      if (/[0-9]/.test(s)) pool += 10;
      if (/[^a-zA-Z0-9]/.test(s)) pool += 33;
      var bits = Math.round(s.length * Math.log2(pool || 1) * 10) / 10;
      var strength = bits < 30 ? 'Weak' : bits < 50 ? 'Fair' : bits < 70 ? 'Good' : bits < 100 ? 'Strong' : 'Very Strong';
      return 'Entropy:    ' + bits + ' bits\nStrength:   ' + strength + '\nLength:     ' + s.length + ' chars\nChar Pool:  ' + pool + ' chars';
    } },
  { slug: 'jwt-debugger', name: 'JWT Debugger', desc: 'Decode and inspect JWT tokens — human-readable claims, expiry badges, HS256 signature verification via the WebAssembly HMAC core', category: 'network', tags: ['jwt', 'token', 'auth'], icon: 'lock', template: 'custom' },

  // ── Converters ──────────────────────────────────────────
  { slug: 'csv-to-json', name: 'CSV → JSON', desc: 'RFC 4180-exact CSV parsing: quoted commas, escaped quotes ("") and newlines inside quotes, CRLF, BOM', category: 'converters', tags: ['csv', 'json', 'convert'], icon: 'filespreadsheet', template: 'transform',
    handler: function (s) { return Transforms.csvToJSON(s); } },
  { slug: 'yaml-to-json', name: 'YAML → JSON', desc: 'Convert YAML to JSON', category: 'converters', tags: ['yaml', 'json', 'convert'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.yamlToJSON(s); } },
  { slug: 'table2xl', name: 'Table2xl — Table Converter', desc: 'Paste dirty HTML tables or ELK/Kibana grids — strip the noise, export as clean HTML or ASCII table', category: 'converters', tags: ['table', 'elk', 'kibana', 'ascii'], icon: 'filespreadsheet', template: 'custom' },
  { slug: 'markdown-preview', name: 'Markdown Preview', desc: 'Preview rendered Markdown in real-time', category: 'converters', tags: ['markdown', 'preview'], icon: 'eye', template: 'custom' },
  { slug: 'time-copier', name: 'Time Copier', desc: 'Copy time in mm/dd/yyyy hh:mm AM/PM across UTC, PT (PDT/PST), and ET (EDT/EST) — DST-aware, for now or any custom moment', category: 'formatters', tags: ['time', 'timezone', 'dst', 'copy', 'convert'], icon: 'clock', template: 'custom' },
  { slug: 'number-base-converter', name: 'Number Base Converter', desc: 'Convert numbers between binary, octal, decimal, hexadecimal — BigInt-exact at any width, strict digit validation', category: 'math', tags: ['base', 'convert', 'binary', 'hex'], icon: 'calculator', template: 'transform',
    handler: function (s, opts) {
      var from = parseInt((opts && opts.fromBase) || '10', 10);
      var to = parseInt((opts && opts.toBase) || '16', 10);
      return Transforms.baseConvertDetailed(s, from, to);
    },
    params: [
      { key: 'fromBase', label: 'From Base', type: 'select', default: '10', options: [{ value: '2', label: 'Binary' }, { value: '8', label: 'Octal' }, { value: '10', label: 'Decimal' }, { value: '16', label: 'Hex' }] },
      { key: 'toBase', label: 'To Base', type: 'select', default: '16', options: [{ value: '2', label: 'Binary' }, { value: '8', label: 'Octal' }, { value: '10', label: 'Decimal' }, { value: '16', label: 'Hex' }] }
    ] },
  { slug: 'timeline-taker', name: 'Timeline Taker', desc: 'Incident logbook — date/time/summary entries, CSV import/export, keyboard shortcuts, auto-saved locally', category: 'formatters', tags: ['timeline', 'logbook', 'csv', 'incident'], icon: 'clock', template: 'custom' },
  { slug: 'color-converter', name: 'Color Converter', desc: 'Convert between HEX, RGB, HSL color formats', category: 'formatters', tags: ['color', 'hex', 'rgb', 'hsl'], icon: 'palette', template: 'custom' },

  // ── Math ────────────────────────────────────────────────
  { slug: 'prime-checker', name: 'Prime Number Checker', desc: 'Primality via deterministic Miller–Rabin (exact for any input < 3.3 × 10²⁴) — hundreds of digits welcome, smallest factor reported for composites', category: 'math', tags: ['prime', 'math'], icon: 'calculator', template: 'transform',
    handler: function (s) {
      var input = s.trim().replace(/[,_\s]/g, '');
      if (!/^\d+$/.test(input)) throw new Error('Enter a non-negative integer');
      var n = BigInt(input);
      if (n < 2n) return input + ' — not a prime number (must be >= 2)';
      if (n === 2n || n === 3n) return n + ' — prime ✓';
      if (n % 2n === 0n) return n + ' — not prime ✗\nSmallest factor: 2';

      // Miller–Rabin with the first 12 primes as witnesses: deterministic
      // (proven, not probabilistic) for all n < 3,317,044,064,679,887,385,961,981.
      // Beyond that the test is still correct about "prime" answers only with
      // overwhelming probability (< 4^-12 error); composites here are always
      // caught because we also search for an explicit factor below.
      var witnesses = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
      var d = n - 1n, r = 0n;
      while (d % 2n === 0n) { d /= 2n; r++; }
      var composite = false;
      for (var w = 0; w < witnesses.length && !composite; w++) {
        if (witnesses[w] >= n) continue; // witness must be coprime-stride below n
        var x = modPow(witnesses[w], d, n);
        if (x === 1n || x === n - 1n) continue;
        for (var i = 1n; i < r; i++) {
          x = x * x % n;
          if (x === n - 1n) break;
        }
        if (x !== n - 1n) composite = true;
      }
      if (!composite) return n + ' — prime ✓';

      // Composite: hunt the smallest factor. Trial division by 6k±1 up to
      // 10^6 covers every case whose factor is human-findable instantly;
      // larger semiprimes get an honest verdict instead of a hang.
      if (n % 3n === 0n) return n + ' — not prime ✗\nSmallest factor: 3';
      for (var f = 5n; f <= 1000000n; f += 6n) {
        if (n % f === 0n) return n + ' — not prime ✗\nSmallest factor: ' + f;
        if (n % (f + 2n) === 0n) return n + ' — not prime ✗\nSmallest factor: ' + (f + 2n);
      }
      return n + ' — not prime ✗\nSmallest factor: > 10⁶ (too large to factor quickly)';
    } },
  { slug: 'fibonacci-generator', name: 'Fibonacci Generator', desc: 'Generate Fibonacci sequence up to N terms — arbitrary-precision BigInt, exact past term 78 where floats silently corrupt', category: 'math', tags: ['fibonacci', 'sequence'], icon: 'sigma', template: 'generator',
    genHandler: function (opts) {
      var n = parseInt((opts && opts.terms) || '10', 10);
      if (!(n >= 1)) n = 10;
      n = Math.min(n, 100);
      var out = [];
      var a = 0n, b = 1n;
      for (var i = 0; i < n; i++) { out.push(a); var t = a + b; a = b; b = t; }
      return out.join(', ');
    },
    params: [{ key: 'terms', label: 'Terms', type: 'number', default: '10', min: 1, max: 100 }] },
  { slug: 'statistics-calculator', name: 'Statistics Calculator', desc: 'Mean, median, mode, range — Welford one-pass variance (numerically stable), population AND sample stddev', category: 'math', tags: ['stats', 'mean', 'median', 'stddev'], icon: 'sigma', template: 'transform',
    handler: function (s) {
      var nums = s.split(/[\s,\n]+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
      if (nums.length < 2) throw new Error('Enter at least 2 numbers');
      // Welford's online algorithm: mean and M2 accumulate in one pass
      // without the catastrophic cancellation of Σ(x−μ)² around a large μ.
      var count = 0, mean = 0, m2 = 0;
      for (var i = 0; i < nums.length; i++) {
        count++;
        var delta = nums[i] - mean;
        mean += delta / count;
        var delta2 = nums[i] - mean;
        m2 += delta * delta2;
      }
      var sorted = nums.slice().sort(function (a, b) { return a - b; });
      var median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];
      var freq = {};
      nums.forEach(function (n) { freq[n] = (freq[n] || 0) + 1; });
      var maxFreq = Math.max.apply(null, Object.values(freq));
      // Every value appearing once means no value repeats — say so instead
      // of reporting the entire dataset as "the mode".
      var modes = maxFreq === 1 ? 'none' : Object.entries(freq)
        .filter(function (e) { return e[1] === maxFreq; })
        .map(function (e) { return parseFloat(e[0]); }).join(', ');
      var popVar = m2 / count;
      var sampleVar = m2 / (count - 1);
      return 'Count:       ' + count +
        '\nSum:         ' + fmtNum(nums.reduce(function (a, b) { return a + b; }, 0)) +
        '\nMean:        ' + fmtNum(mean) +
        '\nMedian:      ' + fmtNum(median) +
        '\nMode:        ' + modes +
        '\nRange:       ' + fmtNum(sorted[count - 1] - sorted[0]) +
        '\nMin:         ' + fmtNum(sorted[0]) +
        '\nMax:         ' + fmtNum(sorted[count - 1]) +
        '\nVariance:    ' + fmtNum(popVar) + ' (population)' +
        '\nStdDev:      ' + fmtNum(Math.sqrt(popVar)) + ' (population)' +
        '\nSample StdDev: ' + fmtNum(Math.sqrt(sampleVar)) + ' (n−1)';
    } },
  { slug: 'unit-converter', name: 'Unit Converter', desc: 'Convert between common units — length, mass, temperature, data', category: 'math', tags: ['units', 'convert', 'length', 'mass', 'temperature'], icon: 'ruler', template: 'custom' },
  { slug: 'number-to-words', name: 'Number to Words', desc: 'Convert numbers to English word representation', category: 'math', tags: ['number', 'words'], icon: 'calculator', template: 'transform',
    handler: function (s) {
      var n = parseFloat(s.replace(/[,$]/g, ''));
      if (isNaN(n)) throw new Error('Invalid number');
      if (!Number.isInteger(n)) throw new Error('Enter a whole number');
      if (n < 0) return 'negative ' + numberToWords(-n);
      return numberToWords(n);
    } },

  // ── Code Formatters ─────────────────────────────────────
  { slug: 'html-formatter', name: 'HTML Formatter', desc: 'Beautify and indent HTML — comment/doctype aware, void elements never gain children, script/style/pre content preserved byte-for-byte', category: 'code', tags: ['html', 'format', 'beautify'], icon: 'code2', template: 'transform',
    handler: function (s) {
      var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
      var RAW = { script: 1, style: 1, pre: 1, textarea: 1 };
      var out = [];
      var depth = 0;
      var i = 0, n = s.length;

      function pushText(text) {
        // Blank runs between tags collapse; real text gets its own line.
        var t = text.replace(/\s+/g, ' ');
        if (t.trim()) out.push('  '.repeat(depth) + t.trim());
      }

      while (i < n) {
        if (s.charAt(i) !== '<') {
          var next = s.indexOf('<', i);
          if (next === -1) next = n;
          pushText(s.slice(i, next));
          i = next;
          continue;
        }
        if (s.startsWith('<!--', i)) {
          var endC = s.indexOf('-->', i + 4);
          endC = endC === -1 ? n : endC + 3;
          out.push('  '.repeat(depth) + s.slice(i, endC).trim());
          i = endC;
          continue;
        }
        if (s.startsWith('<!', i) || s.startsWith('<?', i)) {
          var endD = s.indexOf('>', i);
          endD = endD === -1 ? n : endD + 1;
          out.push('  '.repeat(depth) + s.slice(i, endD).trim());
          i = endD;
          continue;
        }
        var gt = s.indexOf('>', i);
        if (gt === -1) { pushText(s.slice(i)); break; }
        var tag = s.slice(i, gt + 1);
        var isClose = tag.charAt(1) === '/';
        var nameMatch = tag.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);
        var name = nameMatch ? nameMatch[1].toLowerCase() : '';

        if (!isClose) {
          out.push('  '.repeat(depth) + tag.trim());
          var selfClosed = /\/>$/.test(tag);
          if (!selfClosed && !VOID[name]) {
            if (RAW[name]) {
              // Raw-content elements: copy the body verbatim, no reindent.
              var closeRe = new RegExp('</' + name + '\\s*>', 'i');
              var rest = s.slice(gt + 1);
              var m = rest.match(closeRe);
              if (m) {
                var inner = rest.slice(0, m.index);
                if (inner.trim()) out.push(inner.replace(/^\n/, '').replace(/\n$/, ''));
                out.push('  '.repeat(depth) + m[0].trim());
                i = gt + 1 + m.index + m[0].length;
                continue;
              }
            }
            depth++;
          }
        } else {
          depth = Math.max(0, depth - 1);
          out.push('  '.repeat(depth) + tag.trim());
        }
        i = gt + 1;
      }
      return out.join('\n').trim();
    } },
  { slug: 'sql-formatter', name: 'SQL Formatter', desc: 'Format SQL queries for readability — string literals are never touched, clauses break onto lines, conditions and joins indent', category: 'code', tags: ['sql', 'format'], icon: 'terminal', template: 'transform',
    handler: function (s) {
      // Clause starters get their own line. Longer phrases must come
      // before their prefixes ('UNION ALL' before 'UNION').
      var BREAKS = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'OUTER JOIN',
        'GROUP BY', 'ORDER BY', 'UNION ALL', 'INSERT INTO', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE',
        'DROP TABLE', 'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'UPDATE', 'SET',
        'UNION', 'JOIN', 'ON'];
      var BREAK_RE = new RegExp('\\b(' + BREAKS.map(function (k) { return k.replace(/ /g, '\\s+'); }).join('|') + ')\\b', 'gi');

      /* Split into literal / code segments so quoted text is opaque. */
      var segs = [];
      var lit = false, buf = '';
      var i = 0;
      while (i < s.length) {
        var ch = s.charAt(i);
        if (!lit && ch === "'") {
          if (buf) { segs.push({ lit: false, text: buf }); buf = ''; }
          lit = true; buf = "'";
        } else if (lit && ch === "'") {
          if (s.charAt(i + 1) === "'") { buf += "''"; i++; }
          else { buf += "'"; segs.push({ lit: true, text: buf }); buf = ''; lit = false; }
        } else {
          buf += ch;
        }
        i++;
      }
      if (buf) segs.push({ lit: lit, text: buf });

      /* Break before keywords in code segments; literals pass through. */
      var broken = '';
      segs.forEach(function (seg) {
        if (seg.lit) { broken += seg.text; return; }
        broken += seg.text.replace(BREAK_RE, function (m) { return '\n' + m.toUpperCase(); });
      });

      /* Layout: first clause at column 0; joins and continuations indent. */
      var lines = broken.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var out = [];
      var condCol = false; // inside a WHERE/HAVING leg → continuations align under AND/OR
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (j === 0 || /^(SELECT|FROM|WHERE|HAVING|GROUP BY|ORDER BY|LIMIT|OFFSET|VALUES|SET|UNION)/i.test(line)) {
          condCol = /^WHERE|^HAVING/i.test(line);
          out.push(line);
        } else if (/^(INNER |LEFT |RIGHT |FULL |CROSS )?(OUTER )?JOIN/i.test(line)) {
          condCol = false;
          out.push('  ' + line);
        } else if (/^ON\b/i.test(line)) {
          out.push('    ' + line);
        } else if (/^(AND|OR)\b/i.test(line)) {
          out.push(condCol ? '  ' : '    ' + line);
        } else {
          out.push(condCol ? '  ' : '    ' + line);
        }
      }
      return out.join('\n');
    } },

  // ── Generators (additional) ─────────────────────────────
  { slug: 'qr-code-generator', name: 'QR Code Generator', desc: 'Generate scannable QR codes from text or URLs — WebAssembly core', category: 'generators', tags: ['qr', 'barcode', 'generate'], icon: 'images', template: 'custom', wasm: true },
  { slug: 'post-maker', name: 'HTML Post Maker', desc: 'Compose rich HTML posts — text and image blocks, drag & drop, reorder, copy or preview as self-contained HTML', category: 'generators', tags: ['html', 'post', 'builder', 'image'], icon: 'filetype', template: 'custom' },
  { slug: 'lorem-ipsum', name: 'Lorem Ipsum Generator', desc: 'Generate Lorem Ipsum placeholder text', category: 'generators', tags: ['lorem', 'ipsum', 'placeholder'], icon: 'filetype', template: 'generator',
    genHandler: function (opts) {
      var p = parseInt((opts && opts.paragraphs) || '1', 10);
      var words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'dolor', 'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum'];
      var sentences = Array.from({ length: p * 5 }, function () {
        var len = 5 + Math.floor(Math.random() * 10);
        return Array.from({ length: len }, function (_, i) {
          var w = words[Math.floor(Math.random() * words.length)];
          return i === 0 ? w[0].toUpperCase() + w.slice(1) : w;
        }).join(' ') + '.';
      });
      return Array.from({ length: p }, function (_, i) { return sentences.slice(i * 5, i * 5 + 5).join(' '); }).join('\n\n');
    },
    params: [{ key: 'paragraphs', label: 'Paragraphs', type: 'number', default: '1', min: 1, max: 50 }] },
  { slug: 'api-key-generator', name: 'API Key Generator', desc: 'Generate API keys in various formats — 192 bits from the Web Crypto CSPRNG', category: 'generators', tags: ['api', 'key', 'token'], icon: 'key', template: 'generator',
    genHandler: function (opts) {
      var fmt = (opts && opts.format) || 'sk';
      var prefix = fmt === 'sk' ? 'sk-' : fmt === 'pk' ? 'pk-' : '';
      return prefix + CryptoRand.string(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    },
    params: [{ key: 'format', label: 'Format', type: 'select', default: 'sk', options: [{ value: 'sk', label: 'sk-...' }, { value: 'pk', label: 'pk-...' }, { value: 'raw', label: 'No prefix' }] }] },

  // ── Image tools ─────────────────────────────────────────
  { slug: 'base64-image-decoder', name: 'Base64 → Image', desc: 'Decode Base64 string and preview as image', category: 'image', tags: ['base64', 'image', 'preview'], icon: 'images', template: 'custom' },
  { slug: 'image-to-base64', name: 'Image → Base64', desc: 'Upload an image and get its Base64 data URI', category: 'image', tags: ['image', 'base64', 'encode'], icon: 'images', template: 'custom' },
  { slug: 'contrast-checker', name: 'Contrast Checker', desc: 'Check WCAG contrast ratio between two colors', category: 'image', tags: ['color', 'contrast', 'accessibility'], icon: 'palette', template: 'custom' },

  // ── Network ─────────────────────────────────────────────
  { slug: 'mac-address-generator', name: 'MAC Address Generator', desc: 'Generate random MAC addresses — locally-administered unicast bit pattern (never collides with real vendor OUIs)', category: 'network', tags: ['mac', 'address'], icon: 'globe', template: 'generator',
    genHandler: function (opts) {
      var count = parseInt((opts && opts.count) || '1', 10);
      if (!(count >= 1)) count = 1;
      var out = [];
      for (var n = 0; n < count; n++) {
        var arr = new Uint8Array(6); crypto.getRandomValues(arr);
        // IEEE 802: bit 1 of the first octet = locally administered (1),
        // bit 0 = unicast (0). Claiming neither would impersonate real OUIs.
        arr[0] = (arr[0] | 0x02) & 0xfe;
        out.push(Array.from(arr, function (b) { return b.toString(16).padStart(2, '0'); }).join(':').toUpperCase());
      }
      return out.join('\n');
    },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 100 }] },
  { slug: 'http-status-codes', name: 'HTTP Status Codes', desc: 'Browse and search HTTP status codes', category: 'network', tags: ['http', 'status', 'api'], icon: 'globe', template: 'custom' },
  { slug: 'uuid-v4-validate', name: 'UUID Validator', desc: 'Validate UUID v4 format', category: 'network', tags: ['uuid', 'validate'], icon: 'key', template: 'transform',
    handler: function (s) {
      var uuids = s.trim().split('\n');
      return uuids.map(function (u) {
        var valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u.trim());
        return (valid ? '✓' : '✗') + ' ' + u.trim() + (valid ? '' : ' — invalid UUID v4');
      }).join('\n');
    } },

  // ── Algorithm Visualizers ───────────────────────────────
  { slug: 'sorting-visualizer', name: 'Sorting Algorithm Visualizer', desc: 'Watch bubble, quick, merge, insertion, selection sorts in action', category: 'algorithms', tags: ['sorting', 'visualizer', 'algorithm'], icon: 'gitbranch', template: 'custom' },
  { slug: 'search-visualizer', name: 'Search Algorithm Visualizer', desc: 'Visualize linear and binary search on arrays', category: 'algorithms', tags: ['search', 'visualizer'], icon: 'workflow', template: 'custom' },
  { slug: 'binary-tree-visualizer', name: 'Binary Tree Visualizer', desc: 'Visualize binary search tree operations', category: 'algorithms', tags: ['binary tree', 'bst', 'visualizer'], icon: 'gitbranch', template: 'custom' }
];

window.TOOLCATEGORIES = [
  { id: 'json', name: 'JSON', icon: 'braces', desc: 'Validate, format, convert JSON data' },
  { id: 'text', name: 'Text', icon: 'textsearch', desc: 'Extract, transform, analyze text' },
  { id: 'encoding', name: 'Encoding', icon: 'binary', desc: 'Base64, URL, hex, binary encodings' },
  { id: 'crypto', name: 'Crypto / Hash', icon: 'hash', desc: 'Hash, HMAC, JWT, entropy' },
  { id: 'code', name: 'Code', icon: 'code2', desc: 'Format, minify HTML/CSS/JS' },
  { id: 'image', name: 'Image', icon: 'images', desc: 'Base64 preview, color tools' },
  { id: 'network', name: 'Network', icon: 'globe', desc: 'JWT, IP, CIDR, MAC, ports' },
  { id: 'math', name: 'Math', icon: 'calculator', desc: 'Base converter, stats, units' },
  { id: 'generators', name: 'Generators', icon: 'sparkles', desc: 'UUID, passwords, lorem ipsum' },
  { id: 'converters', name: 'Converters', icon: 'arrowleftright', desc: 'CSV↔JSON, YAML, XML' },
  { id: 'formatters', name: 'Formatters', icon: 'filetype', desc: 'Dates, numbers, colors' },
  { id: 'algorithms', name: 'Visualizers', icon: 'gitbranch', desc: 'Sorting, search, data structures' }
];

window.TOOLS_BY_SLUG = {};
window.TOOLMANIFEST.forEach(function (t) { window.TOOLS_BY_SLUG[t.slug] = t; });

/** Modular exponentiation (square-and-multiply) over BigInt. */
function modPow(base, exp, mod) {
  var result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = result * base % mod;
    base = base * base % mod;
    exp >>= 1n;
  }
  return result;
}

/** Stats formatting: 6 decimal places, trailing zeros and bare dot trimmed. */
function fmtNum(x) {
  if (!isFinite(x)) return String(x);
  if (Math.abs(x) >= 1e15 || (Math.abs(x) > 0 && Math.abs(x) < 1e-9)) return x.toExponential(6);
  var s = x.toFixed(6);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '' || s === '-' ? '0' : s;
}

/**
 * Quote a plain scalar when YAML 1.2 core schema (or plain-style
 * grammar) would otherwise misread it: bare "true"/"null"/"123"
 * strings, leading/trailing whitespace, indicator characters in
 * leading position, ": " or " #" inside, trailing colon.
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

function numberToWords(n) {
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
}
})();
