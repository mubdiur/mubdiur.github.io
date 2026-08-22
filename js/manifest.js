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
  { slug: 'json-to-yaml', name: 'JSON → YAML', desc: 'Convert JSON objects to YAML format', category: 'json', tags: ['convert', 'yaml'], icon: 'filetype', template: 'transform',
    handler: function (s) {
      var obj = JSON.parse(s);
      var toYaml = function (val, indent) {
        if (indent === undefined) indent = '';
        if (val === null || val === undefined) return 'null';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'string') return val.includes('\n') ? '|\n' + indent + '  ' + val : /[:{}\[\],&*\?\|<>=!%@`#]/.test(val) ? '"' + val.replace(/"/g, '\\"') + '"' : val;
        if (Array.isArray(val)) return val.length ? val.map(function (v) { return '\n' + indent + '- ' + toYaml(v, indent + '  ').trimStart(); }).join('') : '[]';
        var entries = Object.entries(val);
        return entries.length ? entries.map(function (e) { return '\n' + indent + e[0] + ': ' + toYaml(e[1], indent + '  ').trimStart(); }).join('') : '{}';
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
    params: [{ key: 'compareTo', label: 'Compare with (JSON)', type: 'text', default: '{}' }] },
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
  { slug: 'text-diff', name: 'Text Diff', desc: 'Compare two texts line by line', category: 'text', tags: ['diff', 'compare'], icon: 'gitbranch', template: 'transform',
    handler: function (s, opts) {
      var b = (opts && opts.compareTo) || '';
      var aL = s.split('\n'), bL = b.split('\n');
      var r = [];
      for (var i = 0; i < Math.max(aL.length, bL.length); i++) {
        if (i >= aL.length) r.push('+ ' + bL[i]);
        else if (i >= bL.length) r.push('- ' + aL[i]);
        else if (aL[i] !== bL[i]) { r.push('- ' + aL[i]); r.push('+ ' + bL[i]); }
        else r.push('  ' + aL[i]);
      }
      return r.join('\n');
    },
    params: [{ key: 'compareTo', label: 'Compare with', type: 'text', default: '' }] },
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
  { slug: 'random-string', name: 'Random String Generator', desc: 'Generate random strings with configurable character sets', category: 'generators', tags: ['random', 'generate'], icon: 'shuffle', template: 'generator',
    genHandler: function (opts) {
      var len = parseInt((opts && opts.length) || '16', 10);
      var sets = (opts && opts.charset) || 'alphanumeric';
      var pool = sets === 'alpha' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' :
        sets === 'numeric' ? '0123456789' :
        sets === 'hex' ? '0123456789abcdef' :
        sets === 'alphanumeric' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' :
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
      var arr = new Uint8Array(len);
      crypto.getRandomValues(arr);
      return Array.from(arr, function (b) { return pool[b % pool.length]; }).join('');
    },
    params: [
      { key: 'length', label: 'Length', type: 'number', default: '16', min: 1, max: 1024 },
      { key: 'charset', label: 'Character Set', type: 'select', default: 'alphanumeric', options: [
        { value: 'alphanumeric', label: 'Letters + Digits' }, { value: 'alpha', label: 'Letters only' },
        { value: 'numeric', label: 'Digits only' }, { value: 'hex', label: 'Hexadecimal' }, { value: 'all', label: 'All characters' }
      ] }
    ] },
  { slug: 'uuid-generator', name: 'UUID v4 Generator', desc: 'Generate UUID v4 identifiers — bulk mode available', category: 'generators', tags: ['uuid', 'identifier'], icon: 'key', template: 'generator',
    genHandler: function (opts) {
      var count = parseInt((opts && opts.count) || '1', 10);
      return Array.from({ length: count }, function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      }).join('\n');
    },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 1000 }] },
  { slug: 'password-generator', name: 'Password Generator', desc: 'Generate strong passwords with configurable character sets', category: 'generators', tags: ['password', 'security'], icon: 'lock', template: 'generator',
    genHandler: function (opts) {
      var len = parseInt((opts && opts.length) || '24', 10);
      var sets = [];
      if (!opts || opts.upper !== 'false') sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      if (!opts || opts.lower !== 'false') sets.push('abcdefghijklmnopqrstuvwxyz');
      if (!opts || opts.digits !== 'false') sets.push('0123456789');
      if (opts && opts.symbols === 'true') sets.push('!@#$%^&*()_+-=[]{}|;:,.<>?~');
      var pool = sets.join('');
      if (!pool) throw new Error('Select at least one character set');
      var arr = new Uint8Array(len); crypto.getRandomValues(arr);
      return Array.from(arr, function (b) { return pool[b % pool.length]; }).join('');
    },
    params: [
      { key: 'length', label: 'Length', type: 'number', default: '24', min: 4, max: 256 },
      { key: 'upper', label: 'Uppercase', type: 'boolean', default: 'true' },
      { key: 'lower', label: 'Lowercase', type: 'boolean', default: 'true' },
      { key: 'digits', label: 'Digits', type: 'boolean', default: 'true' },
      { key: 'symbols', label: 'Symbols', type: 'boolean', default: 'false' }
    ] },

  // ── Encoding / Decoding ─────────────────────────────────
  { slug: 'base64-encode', name: 'Base64 Encode', desc: 'Encode text to Base64', category: 'encoding', tags: ['base64', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return btoa(unescape(encodeURIComponent(s))); } },
  { slug: 'base64-decode', name: 'Base64 Decode', desc: 'Decode Base64 back to text', category: 'encoding', tags: ['base64', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) { return decodeURIComponent(escape(atob(s.replace(/\s/g, '')))); } },
  { slug: 'url-encode', name: 'URL Encode', desc: 'Percent-encode a URL string', category: 'encoding', tags: ['url', 'encode'], icon: 'globe', template: 'transform',
    handler: function (s) { return encodeURIComponent(s); } },
  { slug: 'url-decode', name: 'URL Decode', desc: 'Decode percent-encoded URL', category: 'encoding', tags: ['url', 'decode'], icon: 'globe', template: 'transform',
    handler: function (s) { return decodeURIComponent(s); } },
  { slug: 'html-encode', name: 'HTML Encode', desc: 'Escape HTML entities', category: 'encoding', tags: ['html', 'encode'], icon: 'code2', template: 'transform',
    handler: function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); } },
  { slug: 'html-decode', name: 'HTML Decode', desc: 'Unescape HTML entities back to characters', category: 'encoding', tags: ['html', 'decode'], icon: 'code2', template: 'transform',
    handler: function (s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'"); } },
  { slug: 'hex-encode', name: 'Hex Encode', desc: 'Encode text to hexadecimal', category: 'encoding', tags: ['hex', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); } },
  { slug: 'hex-decode', name: 'Hex Decode', desc: 'Decode hexadecimal back to text', category: 'encoding', tags: ['hex', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) {
      var h = s.replace(/\s/g, '');
      if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error('Invalid hex');
      if (h.length % 2 !== 0) throw new Error('Hex must have an even number of digits');
      var b = new Uint8Array(h.length / 2);
      for (var i = 0; i < h.length; i += 2) b[i / 2] = parseInt(h.slice(i, i + 2), 16);
      return new TextDecoder().decode(b);
    } },
  { slug: 'binary-encode', name: 'Binary Encode', desc: 'Encode text to binary (8-bit)', category: 'encoding', tags: ['binary', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(2).padStart(8, '0'); }).join(' '); } },
  { slug: 'binary-decode', name: 'Binary Decode', desc: 'Decode binary back to text', category: 'encoding', tags: ['binary', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) {
      var bits = s.replace(/\s/g, '');
      if (!/^[01]*$/.test(bits) || bits.length % 8 !== 0) throw new Error('Invalid binary (must be multiple of 8 bits)');
      var b = new Uint8Array(bits.length / 8);
      for (var i = 0; i < bits.length; i += 8) b[i / 8] = parseInt(bits.slice(i, i + 8), 2);
      return new TextDecoder().decode(b);
    } },
  { slug: 'base32-encode', name: 'Base32 Encode', desc: 'Encode text to Base32 (RFC 4648)', category: 'encoding', tags: ['base32', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) {
      var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      var b = new TextEncoder().encode(s);
      var bits = '', r = '';
      for (var i = 0; i < b.length; i++) bits += b[i].toString(2).padStart(8, '0');
      while (bits.length % 5 !== 0) bits += '0';
      for (var j = 0; j < bits.length; j += 5) r += a[parseInt(bits.slice(j, j + 5), 2)];
      return r;
    } },
  { slug: 'base32-decode', name: 'Base32 Decode', desc: 'Decode Base32 back to text', category: 'encoding', tags: ['base32', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) {
      var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      var clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
      if (!clean) throw new Error('Invalid Base32');
      var bits = '';
      for (var i = 0; i < clean.length; i++) { var idx = a.indexOf(clean[i]); if (idx === -1) throw new Error('Invalid Base32'); bits += idx.toString(2).padStart(5, '0'); }
      var bytes = [];
      for (var j = 0; j + 8 <= bits.length; j += 8) bytes.push(parseInt(bits.slice(j, j + 8), 2));
      return new TextDecoder().decode(new Uint8Array(bytes));
    } },
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
  { slug: 'jwt-debugger', name: 'JWT Debugger', desc: 'Decode and inspect JWT tokens — header, payload, signature (WASM HMAC verify)', category: 'network', tags: ['jwt', 'token', 'auth'], icon: 'lock', template: 'custom' },

  // ── Converters ──────────────────────────────────────────
  { slug: 'csv-to-json', name: 'CSV → JSON', desc: 'Convert comma/separated values to JSON', category: 'converters', tags: ['csv', 'json', 'convert'], icon: 'filespreadsheet', template: 'transform',
    handler: function (s) {
      var lines = s.split('\n').filter(function (l) { return l.trim(); });
      if (!lines.length) throw new Error('CSV is empty');
      var pl = function (line) {
        var r = []; var cur = '', inq = false;
        for (var i = 0; i < line.length; i++) {
          if (inq) { if (line[i] === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += line[i]; }
          else { if (line[i] === '"') inq = true; else if (line[i] === ',') { r.push(cur.trim()); cur = ''; } else cur += line[i]; }
        }
        r.push(cur.trim()); return r;
      };
      var h = pl(lines[0]);
      return JSON.stringify(lines.slice(1).map(function (r) { var o = {}; h.forEach(function (hdr, i) { o[hdr] = pl(r)[i] || ''; }); return o; }), null, 2);
    } },
  { slug: 'yaml-to-json', name: 'YAML → JSON', desc: 'Convert YAML to JSON', category: 'converters', tags: ['yaml', 'json', 'convert'], icon: 'filetype', template: 'transform',
    handler: function (s) {
      var lines = s.split('\n').filter(function (l) { return l.trim() && !l.trim().startsWith('#'); });
      var childIndent = function (i) {
        for (var j = i; j < lines.length; j++) {
          if (lines[j].trim()) return lines[j].search(/\S/);
        }
        return Infinity;
      };
      var splitKV = function (c) {
        var m = c.match(/^([^:]+):(?:\s*(.*))?$/);
        if (!m) return [null, undefined];
        return [m[1].trim(), m[2] === undefined ? undefined : m[2].trim()];
      };
      var parseScalar = function (v) {
        if (v === 'null' || v === '~') return null;
        if (v === 'true') return true;
        if (v === 'false') return false;
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
        var n = Number(v);
        if (!isNaN(n) && v !== '') return n;
        return v;
      };
      var parse = function (idx, indent) {
        var obj = {}; var arr = []; var isArray = false; var i = idx;
        while (i < lines.length) {
          var curIndent = lines[i].search(/\S/);
          if (curIndent < indent) break;
          if (curIndent > indent) throw new Error('Bad indentation at line ' + (i + 1));
          var content = lines[i].trim(); i++;
          if (content.startsWith('- ')) {
            isArray = true;
            var kv = splitKV(content.slice(2));
            if (kv[0] === null) arr.push(parseScalar(content.slice(2)));
            else if (kv[1] === undefined) { var p1 = parse(i, Math.max(curIndent + 1, childIndent(i))); arr.push(p1[0]); i = p1[1]; }
            else {
              var item = {}; item[kv[0]] = parseScalar(kv[1]);
              while (i < lines.length) {
                var ci = lines[i].search(/\S/);
                if (ci <= curIndent) break;
                var c2 = lines[i].trim(); i++;
                var kv2 = splitKV(c2);
                if (kv2[0] === null) throw new Error('Expected "key: value" at line ' + i);
                if (kv2[1] === undefined) { var p2 = parse(i, Math.max(ci + 1, childIndent(i))); item[kv2[0]] = p2[0]; i = p2[1]; }
                else item[kv2[0]] = parseScalar(kv2[1]);
              }
              arr.push(item);
            }
          } else {
            var kv3 = splitKV(content);
            if (kv3[0] === null) throw new Error('Expected "key: value" at line ' + i);
            if (kv3[1] === undefined) { var p3 = parse(i, Math.max(curIndent + 1, childIndent(i))); obj[kv3[0]] = p3[0]; i = p3[1]; }
            else obj[kv3[0]] = parseScalar(kv3[1]);
          }
        }
        return [isArray ? arr : obj, i];
      };
      var root = parse(0, 0);
      return JSON.stringify(root[0], null, 2);
    } },
  { slug: 'table2xl', name: 'Table2xl — Table Converter', desc: 'Paste dirty HTML tables or ELK/Kibana grids — strip the noise, export as clean HTML or ASCII table', category: 'converters', tags: ['table', 'elk', 'kibana', 'ascii'], icon: 'filespreadsheet', template: 'custom' },
  { slug: 'markdown-preview', name: 'Markdown Preview', desc: 'Preview rendered Markdown in real-time', category: 'converters', tags: ['markdown', 'preview'], icon: 'eye', template: 'custom' },
  { slug: 'time-copier', name: 'Time Copier', desc: 'Copy time in mm/dd/yyyy hh:mm AM/PM across UTC, PT (PDT/PST), and ET (EDT/EST) — DST-aware, for now or any custom moment', category: 'formatters', tags: ['time', 'timezone', 'dst', 'copy', 'convert'], icon: 'clock', template: 'custom' },
  { slug: 'number-base-converter', name: 'Number Base Converter', desc: 'Convert numbers between binary, octal, decimal, hexadecimal', category: 'math', tags: ['base', 'convert', 'binary', 'hex'], icon: 'calculator', template: 'transform',
    handler: function (s, opts) {
      var from = parseInt((opts && opts.fromBase) || '10', 10);
      var to = parseInt((opts && opts.toBase) || '16', 10);
      var n = parseInt(s.trim(), from);
      if (isNaN(n)) throw new Error('Invalid number for base ' + from);
      var BASE_NAMES = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hex' };
      var name = BASE_NAMES[to] || 'Base ' + to;
      var out = n.toString(to);
      if (to === 16) out = out.toUpperCase();
      return s.trim() + ' (base ' + from + ' → ' + name + ')\n' + '─'.repeat(20) + '\n' + name + ': ' + out;
    },
    params: [
      { key: 'fromBase', label: 'From Base', type: 'select', default: '10', options: [{ value: '2', label: 'Binary' }, { value: '8', label: 'Octal' }, { value: '10', label: 'Decimal' }, { value: '16', label: 'Hex' }] },
      { key: 'toBase', label: 'To Base', type: 'select', default: '16', options: [{ value: '2', label: 'Binary' }, { value: '8', label: 'Octal' }, { value: '10', label: 'Decimal' }, { value: '16', label: 'Hex' }] }
    ] },
  { slug: 'timeline-taker', name: 'Timeline Taker', desc: 'Incident logbook — date/time/summary entries, CSV import/export, keyboard shortcuts, auto-saved locally', category: 'formatters', tags: ['timeline', 'logbook', 'csv', 'incident'], icon: 'clock', template: 'custom' },
  { slug: 'color-converter', name: 'Color Converter', desc: 'Convert between HEX, RGB, HSL color formats', category: 'formatters', tags: ['color', 'hex', 'rgb', 'hsl'], icon: 'palette', template: 'custom' },

  // ── Math ────────────────────────────────────────────────
  { slug: 'prime-checker', name: 'Prime Number Checker', desc: 'Check if a number is prime, find factors', category: 'math', tags: ['prime', 'math'], icon: 'calculator', template: 'transform',
    handler: function (s) {
      var n = parseInt(s.trim(), 10);
      if (isNaN(n) || n < 2) return s.trim() + ' — not a prime number (must be >= 2)';
      if (n === 2) return n + ' — prime ✓';
      for (var i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return n + ' — not prime ✗\nSmallest divisor: ' + i;
      return n + ' — prime ✓';
    } },
  { slug: 'fibonacci-generator', name: 'Fibonacci Generator', desc: 'Generate Fibonacci sequence up to N terms', category: 'math', tags: ['fibonacci', 'sequence'], icon: 'sigma', template: 'generator',
    genHandler: function (opts) {
      var n = Math.min(parseInt((opts && opts.terms) || '10', 10), 100);
      var fib = [0, 1];
      for (var i = 2; i < n; i++) fib.push(fib[i - 1] + fib[i - 2]);
      return fib.slice(0, n).join(', ');
    },
    params: [{ key: 'terms', label: 'Terms', type: 'number', default: '10', min: 1, max: 100 }] },
  { slug: 'statistics-calculator', name: 'Statistics Calculator', desc: 'Calculate mean, median, mode, range, standard deviation', category: 'math', tags: ['stats', 'mean', 'median', 'stddev'], icon: 'sigma', template: 'transform',
    handler: function (s) {
      var nums = s.split(/[\s,\n]+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
      if (nums.length < 2) throw new Error('Enter at least 2 numbers');
      nums.sort(function (a, b) { return a - b; });
      var sum = nums.reduce(function (a, b) { return a + b; }, 0);
      var mean = sum / nums.length;
      var median = nums.length % 2 === 0 ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2 : nums[Math.floor(nums.length / 2)];
      var freq = {}; nums.forEach(function (n) { freq[n] = (freq[n] || 0) + 1; });
      var maxFreq = Math.max.apply(null, Object.values(freq));
      var modes = Object.entries(freq).filter(function (e) { return e[1] === maxFreq; }).map(function (e) { return parseFloat(e[0]); });
      var range = nums[nums.length - 1] - nums[0];
      var variance = nums.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / nums.length;
      var stdDev = Math.sqrt(variance);
      return 'Count:  ' + nums.length + '\nSum:    ' + sum + '\nMean:   ' + mean.toFixed(4) + '\nMedian: ' + median.toFixed(4) + '\nMode:   ' + modes.join(', ') + '\nRange:  ' + range + '\nMin:    ' + nums[0] + '\nMax:    ' + nums[nums.length - 1] + '\nVar:    ' + variance.toFixed(4) + '\nStdDev: ' + stdDev.toFixed(4);
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
  { slug: 'html-formatter', name: 'HTML Formatter', desc: 'Beautify and indent HTML', category: 'code', tags: ['html', 'format', 'beautify'], icon: 'code2', template: 'transform',
    handler: function (s) {
      var indent = 0, result = '';
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (c === '<') {
          var n = s.indexOf('>', i);
          if (n === -1) { result += s.slice(i); break; }
          var t = s.slice(i, n + 1);
          if (t.startsWith('</')) indent--;
          result += '\n' + '  '.repeat(Math.max(0, indent)) + t;
          if (!t.endsWith('/>') && !t.startsWith('</')) indent++;
          i = n;
        } else { result += c; }
      }
      return result.trim();
    } },
  { slug: 'sql-formatter', name: 'SQL Formatter', desc: 'Format SQL queries for readability', category: 'code', tags: ['sql', 'format'], icon: 'terminal', template: 'transform',
    handler: function (s) {
      var keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'INDEX', 'TABLE'];
      var result = s;
      for (var i = 0; i < keywords.length; i++) result = result.replace(new RegExp('\\b' + keywords[i] + '\\b', 'gi'), '\n' + keywords[i]);
      return result.replace(/\n+/g, '\n').trim();
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
  { slug: 'api-key-generator', name: 'API Key Generator', desc: 'Generate API keys in various formats', category: 'generators', tags: ['api', 'key', 'token'], icon: 'key', template: 'generator',
    genHandler: function (opts) {
      var fmt = (opts && opts.format) || 'sk';
      var prefix = fmt === 'sk' ? 'sk-' : fmt === 'pk' ? 'pk-' : '';
      var bytes = 32; var arr = new Uint8Array(bytes); crypto.getRandomValues(arr);
      var key = Array.from(arr, function (b) { return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]; }).join('');
      return prefix + key;
    },
    params: [{ key: 'format', label: 'Format', type: 'select', default: 'sk', options: [{ value: 'sk', label: 'sk-...' }, { value: 'pk', label: 'pk-...' }, { value: 'raw', label: 'No prefix' }] }] },

  // ── Image tools ─────────────────────────────────────────
  { slug: 'base64-image-decoder', name: 'Base64 → Image', desc: 'Decode Base64 string and preview as image', category: 'image', tags: ['base64', 'image', 'preview'], icon: 'images', template: 'custom' },
  { slug: 'image-to-base64', name: 'Image → Base64', desc: 'Upload an image and get its Base64 data URI', category: 'image', tags: ['image', 'base64', 'encode'], icon: 'images', template: 'custom' },
  { slug: 'contrast-checker', name: 'Contrast Checker', desc: 'Check WCAG contrast ratio between two colors', category: 'image', tags: ['color', 'contrast', 'accessibility'], icon: 'palette', template: 'custom' },

  // ── Network ─────────────────────────────────────────────
  { slug: 'mac-address-generator', name: 'MAC Address Generator', desc: 'Generate random MAC addresses', category: 'network', tags: ['mac', 'address'], icon: 'globe', template: 'generator',
    genHandler: function (opts) {
      var count = parseInt((opts && opts.count) || '1', 10);
      return Array.from({ length: count }, function () {
        var arr = new Uint8Array(6); crypto.getRandomValues(arr);
        arr[0] &= 0xfc;
        return Array.from(arr, function (b) { return b.toString(16).padStart(2, '0'); }).join(':');
      }).join('\n');
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
