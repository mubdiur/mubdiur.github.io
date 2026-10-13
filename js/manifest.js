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
    handler: function (s, opts) { return Transforms.formatJSONOpts(s, opts); },
    params: [{ key: 'indent', label: 'Indent', type: 'select', default: '2', options: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: '1', label: '1 space' }] }] },
  { slug: 'json-minifier', name: 'JSON Minifier', desc: 'Compress JSON by removing all whitespace', category: 'json', tags: ['minify', 'compress'], icon: 'braces', template: 'transform',
    handler: function (s) { return Transforms.minifyJSON(s); } },
  { slug: 'json-to-csv', name: 'JSON → CSV', desc: 'Convert JSON array/object to CSV format', category: 'json', tags: ['convert', 'csv'], icon: 'filespreadsheet', template: 'transform',
    handler: function (s, opts) { return Transforms.jsonToCSV(s, opts); },
    params: [
      { key: 'delimiter', label: 'Delimiter', type: 'select', default: 'comma', options: [{ value: 'comma', label: 'Comma (,)' }, { value: 'semicolon', label: 'Semicolon (;)' }, { value: 'tab', label: 'Tab' }, { value: 'pipe', label: 'Pipe (|)' }] },
      { key: 'nested', label: 'Nested objects', type: 'select', default: 'flatten', options: [{ value: 'flatten', label: 'Flatten (a.b)' }, { value: 'stringify', label: 'Stringify JSON' }] }
    ] },
  { slug: 'json-to-yaml', name: 'JSON → YAML', desc: 'Convert JSON objects to YAML format — spec-correct quoting of scalars that would re-parse as bools, numbers, nulls or indicators', category: 'json', tags: ['convert', 'yaml'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.jsonToYAML(s); } },
  { slug: 'json-diff', name: 'JSON Diff', desc: 'Compare two JSON objects and highlight differences', category: 'json', tags: ['diff', 'compare'], icon: 'gitbranch', template: 'transform',
    handler: function (s, opts) { return Transforms.jsonDiffOpts(s, opts); },
    params: [{ key: 'compareTo', label: 'Compare with (JSON)', type: 'textarea', default: '{}' }] },
  { slug: 'json-to-xml', name: 'JSON → XML', desc: 'Convert JSON to XML format', category: 'json', tags: ['convert', 'xml'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.jsonToXML(s); } },
  { slug: 'json-escape', name: 'JSON Escape', desc: 'Escape special characters for JSON string format', category: 'json', tags: ['escape', 'encode'], icon: 'braces', template: 'transform',
    handler: function (s) { return Transforms.jsonEscape(s); } },
  { slug: 'json-unescape', name: 'JSON Unescape', desc: 'Unescape JSON-escaped string back to original', category: 'json', tags: ['unescape', 'decode'], icon: 'braces', template: 'transform',
    handler: function (s) { return Transforms.jsonUnescape(s); } },

  // ── Text Processing ─────────────────────────────────────
  { slug: 'email-extractor', name: 'Email Extractor', desc: 'Extract emails from any text — dedupe, lowercase, filter, sort, delimiters, plus a two-set email diff', category: 'text', tags: ['extract', 'email', 'diff'], icon: 'textsearch', template: 'custom' },
  { slug: 'filename-sanitizer', name: 'Windows Filename Sanitizer', desc: 'Clean any text into a Windows-safe filename: spaces→underscores, invalid chars stripped, reserved names handled, 255-char limit', category: 'text', tags: ['filename', 'windows', 'sanitize'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.filenameSanitize(s); } },
  { slug: 'phone-extractor', name: 'Phone Extractor', desc: 'Extract phone numbers from text with configurable delimiter', category: 'text', tags: ['extract', 'phone'], icon: 'textsearch', template: 'transform',
    handler: function (s, opts) { return Transforms.extractPhonesOpts(s, opts); },
    params: [{ key: 'delimiter', label: 'Delimiter', type: 'select', default: 'newline', options: [{ value: 'newline', label: 'Newline' }, { value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'space', label: 'Space' }] }] },
  { slug: 'url-extractor', name: 'URL Extractor', desc: 'Extract all URLs from text content', category: 'text', tags: ['extract', 'url'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.extractURLs(s); } },
  { slug: 'ip-extractor', name: 'IP Address Extractor', desc: 'Extract IPv4 addresses from text', category: 'text', tags: ['extract', 'ip'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.extractIPs(s); } },
  { slug: 'word-counter', name: 'Word Counter', desc: 'Count words, characters, lines, sentences, and reading time', category: 'text', tags: ['count', 'stats', 'analyze'], icon: 'sigma', template: 'transform',
    handler: function (s) { return Transforms.wordReport(s); } },
  { slug: 'case-converter', name: 'Case Converter', desc: 'Convert between lowercase, UPPERCASE, Title Case, camelCase, snake_case, kebab-case, PascalCase', category: 'text', tags: ['case', 'convert'], icon: 'casesensitive', template: 'transform',
    handler: function (s, opts) { return Transforms.caseConvertOpts(s, opts); },
    params: [{ key: 'style', label: 'Style', type: 'select', default: 'lower', options: [
      { value: 'lower', label: 'lowercase' }, { value: 'upper', label: 'UPPERCASE' }, { value: 'title', label: 'Title Case' },
      { value: 'camel', label: 'camelCase' }, { value: 'pascal', label: 'PascalCase' }, { value: 'snake', label: 'snake_case' },
      { value: 'screaming_snake', label: 'SCREAMING_SNAKE' }, { value: 'kebab', label: 'kebab-case' }, { value: 'train', label: 'Train-Case' }
    ] }] },
  { slug: 'slug-generator', name: 'Slug Generator', desc: 'Generate URL-friendly slug from text', category: 'text', tags: ['slug', 'url'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.slugify(s); } },
  { slug: 'text-diff', name: 'Text Diff', desc: 'Myers shortest-edit-script line diff (the algorithm behind GNU diff/Git) — pinpoints what changed instead of flagging everything after an insertion', category: 'text', tags: ['diff', 'compare'], icon: 'gitbranch', template: 'transform',
    handler: function (s, opts) { return Transforms.diffOpts(s, opts); },
    params: [{ key: 'compareTo', label: 'Compare with', type: 'textarea', default: '' },
      { key: 'granularity', label: 'Granularity', type: 'select', default: 'lines', options: [{ value: 'lines', label: 'Lines' }, { value: 'words', label: 'Words' }] }] },
  { slug: 'regex-tester', name: 'Regex Tester', desc: 'Test regular expressions against text with match count', category: 'text', tags: ['regex', 'test', 'pattern'], icon: 'code2', template: 'transform',
    handler: function (s, opts) { return Transforms.regexTestOpts(s, opts); },
    params: [
      { key: 'pattern', label: 'Pattern', type: 'text', default: '' },
      { key: 'flags', label: 'Flags', type: 'select', default: 'g', options: [{ value: 'g', label: 'g' }, { value: 'gi', label: 'gi' }, { value: 'gm', label: 'gm' }, { value: 'gim', label: 'gim' }] }
    ] },
  { slug: 'regex-escape', name: 'Regex Escape', desc: 'Escape special regex characters in text', category: 'text', tags: ['regex', 'escape'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.regexEscape(s); } },
  { slug: 'text-sorter', name: 'Text Sorter', desc: 'Sort lines alphabetically or by length', category: 'text', tags: ['sort', 'lines'], icon: 'arrowleftright', template: 'transform',
    handler: function (s, opts) { return Transforms.sortText(s, opts); },
    params: [
      { key: 'sortBy', label: 'Sort by', type: 'select', default: 'alpha', options: [{ value: 'alpha', label: 'Alphabetical' }, { value: 'length', label: 'Length' }] },
      { key: 'direction', label: 'Direction', type: 'select', default: 'asc', options: [{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }] }
    ] },
  { slug: 'text-reverser', name: 'Text Reverser', desc: 'Reverse entire text or each line', category: 'text', tags: ['reverse'], icon: 'shuffle', template: 'transform',
    handler: function (s, opts) { return Transforms.reverseTextOpts(s, opts); },
    params: [{ key: 'mode', label: 'Mode', type: 'select', default: 'full', options: [{ value: 'full', label: 'Full text' }, { value: 'lines', label: 'Each line' }] }] },
  { slug: 'text-deduplicator', name: 'Line Deduplicator', desc: 'Remove duplicate lines from text', category: 'text', tags: ['deduplicate', 'clean'], icon: 'combine', template: 'transform',
    handler: function (s) { return Transforms.deduplicate(s); } },
  { slug: 'palindrome-checker', name: 'Palindrome Checker', desc: 'Check if text reads the same forwards and backwards', category: 'text', tags: ['palindrome', 'check'], icon: 'casesensitive', template: 'transform',
    handler: function (s) { return Transforms.palindromeReport(s); } },
  { slug: 'line-tools', name: 'Line Tools', desc: 'Number, trim or clean lines — prefix/suffix every line, drop empties', category: 'text', tags: ['lines', 'number', 'trim', 'prefix', 'clean'], icon: 'textsearch', template: 'transform',
    handler: function (s, opts) { return Transforms.lineTools(s, opts); },
    params: [
      { key: 'mode', label: 'Mode', type: 'select', default: 'number', options: [
        { value: 'number', label: 'Number lines' }, { value: 'trim', label: 'Trim each line' },
        { value: 'remove-empty', label: 'Remove empty lines' }, { value: 'prefix', label: 'Add prefix' }, { value: 'suffix', label: 'Add suffix' }
      ] },
      { key: 'affix', label: 'Affix', type: 'text', default: '' }
    ] },
  { slug: 'voice-dictation', name: 'Voice Dictation', desc: 'Hands-free English speech-to-text — speak to replace selections, voice commands, always-on-top pop-out, Ctrl+C copies', category: 'text', tags: ['voice', 'speech', 'dictation', 'microphone', 'transcribe', 'pip', 'pop-out'], icon: 'mic', template: 'custom' },

  // ── Generators ──────────────────────────────────────────
  { slug: 'random-string', name: 'Random String Generator', desc: 'Generate random strings with configurable character sets — rejection-sampled, zero modulo bias', category: 'generators', tags: ['random', 'generate'], icon: 'shuffle', template: 'generator',
    genHandler: function (opts) { return Transforms.randomStringOpts(opts); },
    params: [
      { key: 'length', label: 'Length', type: 'number', default: '16', min: 1, max: 1024 },
      { key: 'charset', label: 'Character Set', type: 'select', default: 'alphanumeric', options: [
        { value: 'alphanumeric', label: 'Letters + Digits' }, { value: 'alpha', label: 'Letters only' },
        { value: 'numeric', label: 'Digits only' }, { value: 'hex', label: 'Hexadecimal' }, { value: 'all', label: 'All characters' }
      ] }
    ] },
  { slug: 'uuid-generator', name: 'UUID v4 Generator', desc: 'RFC 4122 UUID v4 from the Web Crypto CSPRNG — 122 secure random bits, bulk mode available', category: 'generators', tags: ['uuid', 'identifier'], icon: 'key', template: 'generator',
    genHandler: function (opts) { return Transforms.uuidV4BatchOpts(opts); },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 1000 }] },
  { slug: 'password-generator', name: 'Password Generator', desc: 'Strong passwords from the Web Crypto CSPRNG — guaranteed coverage of every selected class, unbiased sampling, shuffled', category: 'generators', tags: ['password', 'security'], icon: 'lock', template: 'generator',
    genHandler: function (opts) { return Transforms.generatePassword((opts && opts.length) || '24', opts); },
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
    handler: function (s) { return Transforms.rot13(s); } },
  { slug: 'rot47', name: 'ROT47', desc: 'Rotate all printable ASCII by 47 positions', category: 'encoding', tags: ['rot47', 'cipher'], icon: 'shuffle', template: 'transform',
    handler: function (s) { return Transforms.rot47(s); } },
  { slug: 'morse-encode', name: 'Morse Code Encoder', desc: 'Encode text to Morse code', category: 'encoding', tags: ['morse', 'encode'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.morseEncode(s); } },
  { slug: 'morse-decode', name: 'Morse Code Decoder', desc: 'Decode Morse code back to text', category: 'encoding', tags: ['morse', 'decode'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.morseDecode(s); } },

  // ── Crypto / Hash (WASM-backed) ─────────────────────────
  { slug: 'md5-hash', name: 'MD5 Hash', desc: 'Generate MD5 hash of input text — WebAssembly core', category: 'crypto', tags: ['md5', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    fileHash: true,
    handler: function (s) { return Core.md5Hex(s); } },
  { slug: 'sha256-hash', name: 'SHA-256 Hash', desc: 'Generate SHA-256 hash — WebAssembly core', category: 'crypto', tags: ['sha256', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    fileHash: true,
    handler: function (s) { return Core.sha256Hex(s); } },
  { slug: 'sha1-hash', name: 'SHA-1 Hash', desc: 'Generate SHA-1 hash — WebAssembly core', category: 'crypto', tags: ['sha1', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    fileHash: true,
    handler: function (s) { return Core.sha1Hex(s); } },
  { slug: 'sha512-hash', name: 'SHA-512 Hash', desc: 'Generate SHA-512 hash — WebAssembly core', category: 'crypto', tags: ['sha512', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    fileHash: true,
    handler: function (s) { return Core.sha512Hex(s); } },
  { slug: 'sha384-hash', name: 'SHA-384 Hash', desc: 'Generate SHA-384 hash — WebAssembly core', category: 'crypto', tags: ['sha384', 'hash'], icon: 'hash', template: 'transform', wasm: true,
    fileHash: true,
    handler: function (s) { return Transforms.sha384(s); } },
  { slug: 'hmac-generator', name: 'HMAC Generator', desc: 'Generate HMAC with SHA-256 or SHA-1 — WebAssembly core', category: 'crypto', tags: ['hmac', 'mac', 'auth'], icon: 'key', template: 'transform', wasm: true,
    handler: function (s, opts) { return Transforms.hmacOpts(s, opts); },
    params: [
      { key: 'key', label: 'Secret Key', type: 'password', default: 'secret' },
      { key: 'algorithm', label: 'Algorithm', type: 'select', default: 'SHA-256', options: [{ value: 'SHA-256', label: 'SHA-256' }, { value: 'SHA-1', label: 'SHA-1' }] }
    ] },
  { slug: 'crc32-checksum', name: 'CRC32 Checksum', desc: 'Generate CRC32 checksum — WebAssembly core', category: 'crypto', tags: ['crc32', 'checksum'], icon: 'hash', template: 'transform', wasm: true,
    fileHash: true,
    handler: function (s) { return Core.crc32Hex(s); } },
  { slug: 'password-entropy', name: 'Password Entropy', desc: 'Calculate password entropy and strength score', category: 'crypto', tags: ['entropy', 'strength', 'password'], icon: 'lock', template: 'transform',
    handler: function (s) { return Transforms.passwordEntropy(s); } },
  { slug: 'jwt-debugger', name: 'JWT Debugger', desc: 'Decode and inspect JWT tokens — human-readable claims, expiry badges, HS256 signature verification via the WebAssembly HMAC core', category: 'network', tags: ['jwt', 'token', 'auth'], icon: 'lock', template: 'custom' },

  // ── Converters ──────────────────────────────────────────
  { slug: 'csv-to-json', name: 'CSV → JSON', desc: 'RFC 4180-exact CSV parsing: quoted commas, escaped quotes ("") and newlines inside quotes, CRLF, BOM', category: 'converters', tags: ['csv', 'json', 'convert'], icon: 'filespreadsheet', template: 'transform',
    handler: function (s) { return Transforms.csvToJSON(s); } },
  { slug: 'xml-to-json', name: 'XML → JSON', desc: 'Convert XML (SOAP, RSS, configs) to JSON via the native DOMParser — attributes as @-keys, repeats as arrays', category: 'converters', tags: ['xml', 'json', 'convert', 'soap', 'rss'], icon: 'filetype', template: 'transform',
    handler: function (s) {
      var d;
      try { d = new DOMParser().parseFromString(s, 'text/xml'); }
      catch (e) { throw new Error('Invalid XML'); }
      var perr = d.getElementsByTagName('parsererror');
      if (perr.length) throw new Error('Invalid XML: ' + ((perr[0].textContent || '').replace(/\s+/g, ' ').slice(0, 120)));
      function walk(el) {
        var out = {}, i, n;
        var hasAttrs = !!(el.attributes && el.attributes.length);
        for (i = 0; i < (el.attributes ? el.attributes.length : 0); i++) out['@' + el.attributes[i].name] = el.attributes[i].value;
        var text = '', kids = {};
        for (i = 0; i < el.childNodes.length; i++) {
          n = el.childNodes[i];
          if (n.nodeType === 3 || n.nodeType === 4) {
            var tv = n.nodeValue.replace(/\s+/g, ' ').trim();
            if (tv) text += (text ? ' ' : '') + tv;
          } else if (n.nodeType === 1) {
            var v = walk(n);
            if (kids[n.tagName] === undefined) kids[n.tagName] = v;
            else if (Array.isArray(kids[n.tagName])) kids[n.tagName].push(v);
            else kids[n.tagName] = [kids[n.tagName], v];
          }
        }
        var keys = Object.keys(kids);
        if (!hasAttrs && !keys.length) return text;
        if (text) out['#text'] = text;
        for (i = 0; i < keys.length; i++) out[keys[i]] = kids[keys[i]];
        return out;
      }
      var res = {};
      res[d.documentElement.tagName] = walk(d.documentElement);
      return JSON.stringify(res, null, 2);
    } },
  { slug: 'yaml-to-json', name: 'YAML → JSON', desc: 'Convert YAML to JSON', category: 'converters', tags: ['yaml', 'json', 'convert'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.yamlToJSON(s); } },
  { slug: 'table2xl', name: 'Table2xl — Table Converter', desc: 'Paste dirty HTML tables or ELK/Kibana grids — strip the noise, export as clean HTML or ASCII table', category: 'converters', tags: ['table', 'elk', 'kibana', 'ascii'], icon: 'filespreadsheet', template: 'custom' },
  { slug: 'markdown-preview', name: 'Markdown Preview', desc: 'Preview rendered Markdown in real-time', category: 'converters', tags: ['markdown', 'preview'], icon: 'eye', template: 'custom' },
  { slug: 'time-copier', name: 'Time Copier', desc: 'Copy time in mm/dd/yyyy hh:mm AM/PM across UTC, PT (PDT/PST), and ET (EDT/EST) — DST-aware, for now or any custom moment', category: 'formatters', tags: ['time', 'timezone', 'dst', 'copy', 'convert'], icon: 'clock', template: 'custom' },
  { slug: 'epoch-converter', name: 'Epoch Converter', desc: 'Convert Unix timestamps (seconds or milliseconds) to dates and back — epoch, ISO-8601, UTC and local in one view', category: 'formatters', tags: ['epoch', 'timestamp', 'date', 'unix', 'time'], icon: 'clock', template: 'transform',
    handler: function (s) { return Transforms.epochInfo(s); } },
    { slug: 'cron-explainer', name: 'Cron Expression Explainer', desc: 'Explain cron schedules in plain words — per-field breakdown, summary, next 5 runs', category: 'formatters', tags: ['cron', 'schedule', 'time', 'trigger'], icon: 'clock', template: 'transform',
    placeholder: '*/5 * * * *',
    handler: function (s) { return Transforms.cronExplain(s); } },
  { slug: 'cron-builder', name: 'Cron Builder', desc: 'Plan cron schedules visually — presets plus per-field inputs, plain-words breakdown, next 5 runs, 7x24 fire grid', category: 'formatters', tags: ['cron', 'schedule', 'builder', 'time'], icon: 'clock', template: 'custom' },
  { slug: 'readability-analyzer', name: 'Readability Analyzer', desc: 'Flesch Reading Ease and grade level — sentence stats, hardest words flagged', category: 'text', tags: ['readability', 'flesch', 'text'], icon: 'textsearch', template: 'transform',
    handler: function (s) { return Transforms.readability(s); } },
  { slug: 'unicode-inspector', name: 'Unicode Inspector', desc: 'Code points, UTF-8 bytes and lone-surrogate flags for any text', category: 'text', tags: ['unicode', 'utf8', 'codepoint'], icon: 'code2', template: 'transform',
    handler: function (s, opts) { return Transforms.unicodeInspector(s); } },
  { slug: 'json-path-extractor', name: 'JSONPath Extractor', desc: 'Query JSON with JSONPath — nested keys, indices, wildcards, root', category: 'json', tags: ['jsonpath', 'json', 'query'], icon: 'braces', template: 'transform',
    handler: function (s, opts) { return Transforms.jsonPathOpts(s, opts); },
    params: [{ key: 'path', label: 'Path', type: 'text', default: '$' }] },
  { slug: 'html-to-markdown', name: 'HTML → Markdown', desc: 'Convert HTML to Markdown — headings, emphasis, lists, tables', category: 'converters', tags: ['html', 'markdown', 'convert'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.htmlToMarkdownOpts(s); } },
  { slug: 'json-to-toml', name: 'JSON → TOML', desc: 'Convert JSON to TOML', category: 'converters', tags: ['json', 'toml', 'convert'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.jsonToTOML(s); } },
  { slug: 'toml-to-json', name: 'TOML → JSON', desc: 'Convert TOML to JSON', category: 'converters', tags: ['toml', 'json', 'convert'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.tomlToJSON(s); } },
  { slug: 'markdown-table-generator', name: 'Markdown Table Generator', desc: 'CSV rows to GitHub-flavored Markdown tables — optional header, alignment, auto delimiter', category: 'converters', tags: ['markdown', 'table', 'csv'], icon: 'filespreadsheet', template: 'transform',
    handler: function (s, opts) { return Transforms.csvToMarkdown(s, opts); },
    params: [
      { key: 'header', label: 'Header', type: 'select', default: 'first-row', options: [{ value: 'first-row', label: 'First row' }, { value: 'none', label: 'None' }] },
      { key: 'align', label: 'Align', type: 'select', default: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
      { key: 'delimiter', label: 'Delimiter', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Auto' }, { value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }, { value: 'pipe', label: 'Pipe' }] }
    ] },
  { slug: 'env-to-json', name: '.env → JSON', desc: 'Convert dotenv files to JSON — export prefixes, empty values, comments kept', category: 'converters', tags: ['env', 'dotenv', 'json'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.envToJSON(s); } },
  { slug: 'curl-to-fetch', name: 'cURL → Fetch', desc: 'Convert curl commands to fetch calls — method, headers, body, auth mapped', category: 'network', tags: ['curl', 'fetch', 'http'], icon: 'terminal', template: 'transform',
    handler: function (s, opts) { return Transforms.curlToFetchOpts(s, opts); },
    params: [{ key: 'style', label: 'Style', type: 'select', default: 'async', options: [{ value: 'async', label: 'Async/await' }, { value: 'promise', label: 'Promises' }] }] },
  { slug: 'yaml-formatter', name: 'YAML Formatter', desc: 'Format YAML with canonical indentation', category: 'converters', tags: ['yaml', 'format'], icon: 'filetype', template: 'transform',
    handler: function (s) { return Transforms.yamlFormatOpts(s); } },
  { slug: 'semver-compare', name: 'SemVer Compare', desc: 'Compare semantic versions — ordering, bump kind, prerelease precedence', category: 'code', tags: ['semver', 'version', 'compare'], icon: 'code2', template: 'transform',
    handler: function (s, opts) { return Transforms.semverCompareOpts(s, opts); },
    params: [{ key: 'compareTo', label: 'Compare with', type: 'text', default: '' }] },
  { slug: 'tool-scaffold', name: 'Tool Scaffold', desc: 'Stamp out a new tool entry — transform, generator or custom stub wired to the shared UIs', category: 'code', tags: ['scaffold', 'generator', 'tool'], icon: 'terminal', template: 'generator',
    genHandler: function (opts) { return Transforms.toolScaffold(opts); },
    params: [
      { key: 'slug', label: 'Slug', type: 'text', default: 'my-tool' },
      { key: 'kind', label: 'Kind', type: 'select', default: 'transform', options: [{ value: 'transform', label: 'Transform' }, { value: 'generator', label: 'Generator' }, { value: 'custom', label: 'Custom' }] }
    ] },
  { slug: 'chmod-converter', name: 'Chmod Converter', desc: 'Convert between octal (755) and symbolic (rwxr-xr-x) Unix permissions', category: 'code', tags: ['chmod', 'permissions', 'unix'], icon: 'terminal', template: 'transform',
    placeholder: '755',
    handler: function (s) { return Transforms.chmodConvert(s); } },
  { slug: 'base58-encode', name: 'Base58 Encode', desc: 'Encode text to Base58 (Bitcoin alphabet)', category: 'encoding', tags: ['base58', 'encode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.base58Encode(s); } },
  { slug: 'base58-decode', name: 'Base58 Decode', desc: 'Decode Base58 back to text', category: 'encoding', tags: ['base58', 'decode'], icon: 'binary', template: 'transform',
    handler: function (s) { return Transforms.base58Decode(s); } },
  { slug: 'morse-code-player', name: 'Morse Code Player', desc: 'Hear Morse code — WPM timing, dit/dah timeline, prosigns', category: 'encoding', tags: ['morse', 'audio', 'player'], icon: 'code2', template: 'custom' },
  { slug: 'jwt-generator', name: 'JWT Generator', desc: 'Sign HS256 JSON Web Tokens — payload object, masked secret, configurable expiry', category: 'crypto', tags: ['jwt', 'token', 'auth'], icon: 'key', template: 'transform', wasm: true,
    placeholder: '{"sub":"123","name":"Ada"}',
    handler: function (s, opts) { return Transforms.jwtSignOpts(s, opts); },
    params: [
      { key: 'secret', label: 'Secret', type: 'password', default: 'secret' },
      { key: 'expires', label: 'Expires', type: 'select', default: 'none', options: [{ value: 'none', label: 'Never' }, { value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }] }
    ] },
  { slug: 'sri-generator', name: 'SRI Hash Generator', desc: 'Subresource Integrity hashes — SHA-384/512/256 via the WebAssembly core', category: 'crypto', tags: ['sri', 'hash', 'integrity'], icon: 'hash', template: 'transform', wasm: true,
    placeholder: 'console.log(1)',
    handler: function (s, opts) { return Transforms.sriHashOpts(s, opts); },
    params: [{ key: 'algorithm', label: 'Algorithm', type: 'select', default: 'SHA-384', options: [{ value: 'SHA-384', label: 'SHA-384' }, { value: 'SHA-512', label: 'SHA-512' }, { value: 'SHA-256', label: 'SHA-256' }] }] },
  { slug: 'pem-inspector', name: 'PEM Inspector', desc: 'Inspect PEM blocks — label, DER length, ASN.1 tree via the WebAssembly core', category: 'crypto', tags: ['pem', 'der', 'asn1', 'certificate'], icon: 'lock', template: 'transform', wasm: true,
    placeholder: '-----BEGIN CERTIFICATE-----\nMAICAQE=\n-----END CERTIFICATE-----',
    handler: function (s) { return Transforms.pemInspect(s); } },
  { slug: 'totp-generator', name: 'TOTP Generator', desc: 'Time-based one-time passwords — RFC 6238, 30-second countdown, copy-ready codes', category: 'crypto', tags: ['totp', 'otp', 'auth', '2fa'], icon: 'lock', template: 'custom' },
  { slug: 'uuid-v7-generator', name: 'UUID v7 Generator', desc: 'RFC 9562 UUID v7 from the Web Crypto CSPRNG — Unix-millisecond time prefix, bulk mode available', category: 'generators', tags: ['uuid', 'identifier'], icon: 'key', template: 'generator',
    genHandler: function (opts) {
      var count = parseInt((opts && opts.count) || '1', 10);
      if (!(count >= 1)) count = 1;
      if (count > 1000) count = 1000;
      var out = [];
      for (var i = 0; i < count; i++) out.push(Transforms.uuidV7());
      return out.join('\n');
    },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 1000 }] },
  { slug: 'ulid-generator', name: 'ULID Generator', desc: 'Universally-unique lexicographically-sortable identifiers — Crockford Base32, millisecond timestamp, CSPRNG entropy', category: 'generators', tags: ['ulid', 'identifier'], icon: 'key', template: 'generator',
    genHandler: function (opts) { return Transforms.ulidBatch((opts && opts.count) || '1'); },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 1000 }] },
  { slug: 'passphrase-generator', name: 'Passphrase Generator', desc: 'Diceware-style passphrases — 256-word list, 8 bits of entropy per word, CSPRNG draws', category: 'generators', tags: ['passphrase', 'password', 'words'], icon: 'lock', template: 'generator',
    genHandler: function (opts) { return Transforms.passphrase(parseInt((opts && opts.words) || '6', 10), (opts && opts.separator) || '-'); },
    params: [
      { key: 'words', label: 'Words', type: 'number', default: '6', min: 3, max: 12 },
      { key: 'separator', label: 'Separator', type: 'select', default: '-', options: [{ value: '-', label: 'Hyphen (-)' }, { value: ' ', label: 'Space' }, { value: '_', label: 'Underscore (_)' }, { value: '.', label: 'Dot (.)' }] }
    ] },
{ slug: 'matrix-calculator', name: 'Matrix Calculator', desc: 'Add, multiply, invert, transpose \u2014 determinant via pivoted elimination, Gauss-Jordan inverse, strict shape checks', category: 'math', tags: ['matrix', 'linear-algebra', 'determinant', 'inverse'], icon: 'calculator', template: 'transform',
    handler: function (s, opts) { return Transforms.matrixCalcOpts(s, opts); },
    params: [{ key: 'operation', label: 'Operation', type: 'select', default: 'determinant', options: [{ value: 'determinant', label: 'Determinant' }, { value: 'inverse', label: 'Inverse' }, { value: 'transpose', label: 'Transpose' }, { value: 'trace', label: 'Trace' }, { value: 'add', label: 'Add (A+B)' }, { value: 'subtract', label: 'Subtract (A-B)' }, { value: 'multiply', label: 'Multiply (A*B)' }] }, { key: 'matrixB', label: 'Matrix B', type: 'textarea', default: '' }] },
  { slug: 'number-base-converter', name: 'Number Base Converter', desc: 'Convert numbers between binary, octal, decimal, hexadecimal — BigInt-exact at any width, strict digit validation', category: 'math', tags: ['base', 'convert', 'binary', 'hex'], icon: 'calculator', template: 'transform',
    handler: function (s, opts) { return Transforms.baseConvertOpts(s, opts); },
    params: [
      { key: 'fromBase', label: 'From Base', type: 'select', default: '10', options: [{ value: '2', label: 'Binary' }, { value: '8', label: 'Octal' }, { value: '10', label: 'Decimal' }, { value: '16', label: 'Hex' }] },
      { key: 'toBase', label: 'To Base', type: 'select', default: '16', options: [{ value: '2', label: 'Binary' }, { value: '8', label: 'Octal' }, { value: '10', label: 'Decimal' }, { value: '16', label: 'Hex' }] }
    ] },
  { slug: 'timeline-taker', name: 'Timeline Taker', desc: 'Incident logbook — date/time/summary entries, CSV import/export, keyboard shortcuts, auto-saved locally', category: 'formatters', tags: ['timeline', 'logbook', 'csv', 'incident'], icon: 'clock', template: 'custom' },
  { slug: 'color-converter', name: 'Color Converter', desc: 'Convert between HEX, RGB, HSL color formats', category: 'formatters', tags: ['color', 'hex', 'rgb', 'hsl'], icon: 'palette', template: 'custom' },
  { slug: 'byte-size-formatter', name: 'Byte Size Formatter', desc: 'Format raw byte counts as human sizes — binary IEC (KiB) or decimal SI (KB), exact count kept', category: 'formatters', tags: ['bytes', 'size', 'format', 'humanize'], icon: 'save', template: 'transform',
    handler: function (s, opts) { return Transforms.formatBytes(s, opts); },
    params: [{ key: 'mode', label: 'Units', type: 'select', default: 'binary', options: [{ value: 'binary', label: 'Binary (1024)' }, { value: 'decimal', label: 'Decimal (1000)' }] }] },

  // ── Math ────────────────────────────────────────────────
  { slug: 'prime-checker', name: 'Prime Number Checker', desc: 'Primality via deterministic Miller–Rabin (exact for any input < 3.3 × 10²⁴) — hundreds of digits welcome, smallest factor reported for composites', category: 'math', tags: ['prime', 'math'], icon: 'calculator', template: 'transform',
    handler: function (s) { return Transforms.primeCheck(s); } },
  { slug: 'fibonacci-generator', name: 'Fibonacci Generator', desc: 'Generate Fibonacci sequence up to N terms — arbitrary-precision BigInt, exact past term 78 where floats silently corrupt', category: 'math', tags: ['fibonacci', 'sequence'], icon: 'sigma', template: 'generator',
    genHandler: function (opts) { return Transforms.fibonacci((opts && opts.terms) || "10"); },
    params: [{ key: 'terms', label: 'Terms', type: 'number', default: '10', min: 1, max: 100 }] },
  { slug: 'statistics-calculator', name: 'Statistics Calculator', desc: 'Mean, median, mode, range — Welford one-pass variance (numerically stable), population AND sample stddev', category: 'math', tags: ['stats', 'mean', 'median', 'stddev'], icon: 'sigma', template: 'transform',
    handler: function (s) { return Transforms.describeStats(s); } },
  { slug: 'unit-converter', name: 'Unit Converter', desc: 'Convert between common units — length, mass, temperature, data', category: 'math', tags: ['units', 'convert', 'length', 'mass', 'temperature'], icon: 'ruler', template: 'custom' },
  { slug: 'number-to-words', name: 'Number to Words', desc: 'Convert numbers to English word representation', category: 'math', tags: ['number', 'words'], icon: 'calculator', template: 'transform',
    handler: function (s) { return Transforms.numberToWordsText(s); } },

  // ── Code Formatters ─────────────────────────────────────
  { slug: 'xml-formatter', name: 'XML Formatter', desc: 'Beautify XML \u2014 comment/CDATA/doctype aware, text-only elements stay inline, mismatched tags reported', category: 'code', tags: ['xml', 'format', 'beautify'], icon: 'code2', template: 'transform',
    handler: function (s, opts) { return Transforms.xmlFormat(s, opts); },
    params: [{ key: 'indent', label: 'Indent', type: 'select', default: '2', options: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }] }] },
  { slug: 'html-formatter', name: 'HTML Formatter', desc: 'Beautify and indent HTML — comment/doctype aware, void elements never gain children, script/style/pre content preserved byte-for-byte', category: 'code', tags: ['html', 'format', 'beautify'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.htmlFormat(s); } },
  { slug: 'html-minifier', name: 'HTML Minifier', desc: 'Minify HTML \u2014 comments stripped, whitespace collapsed, script/style/pre pass through untouched', category: 'code', tags: ['html', 'minify'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.htmlMinify(s); } },
  { slug: 'sql-formatter', name: 'SQL Formatter', desc: 'Format SQL queries for readability — string literals are never touched, clauses break onto lines, conditions and joins indent', category: 'code', tags: ['sql', 'format'], icon: 'terminal', template: 'transform',
    handler: function (s) { return Transforms.sqlFormat(s); } },

  { slug: 'sql-minifier', name: 'SQL Minifier', desc: 'Minify SQL \u2014 comments stripped, whitespace collapsed, quoted literals pass through untouched', category: 'code', tags: ['sql', 'minify'], icon: 'terminal', template: 'transform',
    handler: function (s) { return Transforms.sqlMinify(s); } },
  { slug: 'css-formatter', name: 'CSS Formatter', desc: 'Beautify minified CSS or minify it — comments and quoted strings preserved', category: 'code', tags: ['css', 'format', 'minify', 'beautify'], icon: 'code2', template: 'transform',
    handler: function (s, opts) { return Transforms.cssFormat(s, opts); },
    params: [{ key: 'mode', label: 'Mode', type: 'select', default: 'beautify', options: [{ value: 'beautify', label: 'Beautify' }, { value: 'minify', label: 'Minify' }] }] },
  { slug: 'javascript-minifier', name: 'JavaScript Minifier', desc: 'Minify JavaScript — strips comments and collapses whitespace; strings, template literals and regex literals pass through untouched', category: 'code', tags: ['js', 'minify', 'javascript'], icon: 'code2', template: 'transform',
    handler: function (s) { return Transforms.jsMinify(s); } },
  { slug: 'json-to-typescript', name: 'JSON → TypeScript', desc: 'Generate TypeScript interfaces from JSON — nested types, arrays, nulls and root arrays handled', category: 'code', tags: ['json', 'typescript', 'interface', 'types'], icon: 'code2', template: 'transform',
    handler: function (s, opts) { return Transforms.jsonToTS(s, opts); },
    params: [{ key: 'rootName', label: 'Root type name', type: 'text', default: 'Root' }, { key: 'indent', label: 'Indent', type: 'select', default: '2', options: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }] }] },

  // ── Generators (additional) ─────────────────────────────
  { slug: 'qr-code-generator', name: 'QR Code Generator', desc: 'Generate scannable QR codes from text or URLs — WebAssembly core', category: 'generators', tags: ['qr', 'barcode', 'generate'], icon: 'images', template: 'custom', wasm: true },

  { slug: 'qr-code-decoder', name: 'QR Code Decoder', desc: 'Scan QR codes from screenshots — drop, paste or upload, decoded in-browser', category: 'generators', tags: ['qr', 'barcode', 'decode', 'scan'], icon: 'scan-eye', template: 'custom' },
  { slug: 'post-maker', name: 'HTML Post Maker', desc: 'Compose rich HTML posts — text and image blocks, drag & drop, reorder, copy or preview as self-contained HTML', category: 'generators', tags: ['html', 'post', 'builder', 'image'], icon: 'filetype', template: 'custom' },
  { slug: 'lorem-ipsum', name: 'Lorem Ipsum Generator', desc: 'Generate Lorem Ipsum placeholder text', category: 'generators', tags: ['lorem', 'ipsum', 'placeholder'], icon: 'filetype', template: 'generator',
    genHandler: function (opts) { return Transforms.loremIpsumOpts(opts); },
    params: [{ key: 'paragraphs', label: 'Paragraphs', type: 'number', default: '1', min: 1, max: 50 }] },
  { slug: 'api-key-generator', name: 'API Key Generator', desc: 'Generate API keys in various formats — 192 bits from the Web Crypto CSPRNG', category: 'generators', tags: ['api', 'key', 'token'], icon: 'key', template: 'generator',
    genHandler: function (opts) { return Transforms.apiKey((opts && opts.format) || 'sk'); },
    params: [{ key: 'format', label: 'Format', type: 'select', default: 'sk', options: [{ value: 'sk', label: 'sk-...' }, { value: 'pk', label: 'pk-...' }, { value: 'raw', label: 'No prefix' }] }] },

  // ── Image tools ─────────────────────────────────────────
  { slug: 'base64-image-decoder', name: 'Base64 → Image', desc: 'Decode Base64 string and preview as image', category: 'image', tags: ['base64', 'image', 'preview'], icon: 'images', template: 'custom' },
  { slug: 'image-to-base64', name: 'Image → Base64', desc: 'Upload an image and get its Base64 data URI', category: 'image', tags: ['image', 'base64', 'encode'], icon: 'images', template: 'custom' },
  { slug: 'image-palette-extractor', name: 'Image Palette Extractor', desc: 'Pull the dominant color palette from any image — drop, paste or upload, click a swatch to copy', category: 'image', tags: ['color', 'palette', 'image', 'theme'], icon: 'palette', template: 'custom' },
  { slug: 'contrast-checker', name: 'Contrast Checker', desc: 'Check WCAG contrast ratio between two colors', category: 'image', tags: ['color', 'contrast', 'accessibility'], icon: 'palette', template: 'custom' },
  { slug: 'svg-optimizer', name: 'SVG Optimizer', desc: 'Minify SVG markup — strips comments, editor metadata and namespaced cruft; collapses indentation', category: 'image', tags: ['svg', 'minify', 'optimize', 'vector'], icon: 'images', template: 'transform',
    handler: function (s) { return Transforms.svgMinify(s); } },

  // ── Network ─────────────────────────────────────────────
  { slug: 'mac-address-generator', name: 'MAC Address Generator', desc: 'Generate random MAC addresses — locally-administered unicast bit pattern (never collides with real vendor OUIs)', category: 'network', tags: ['mac', 'address'], icon: 'globe', template: 'generator',
    genHandler: function (opts) {
      var count = parseInt((opts && opts.count) || '1', 10);
      if (!(count >= 1)) count = 1;
      if (count > 100) count = 100;
      var out = [];
      for (var n = 0; n < count; n++) out.push(Transforms.macAddress());
      return out.join('\n');
    },
    params: [{ key: 'count', label: 'Count', type: 'number', default: '1', min: 1, max: 100 }] },
  { slug: 'http-status-codes', name: 'HTTP Status Codes', desc: 'Browse and search HTTP status codes', category: 'network', tags: ['http', 'status', 'api'], icon: 'globe', template: 'custom' },
  { slug: 'uuid-v4-validate', name: 'UUID Validator', desc: 'Validate UUIDs and report the version — v1, v3–v8 plus Nil and Max, RFC 9562 aware', category: 'network', tags: ['uuid', 'validate'], icon: 'key', template: 'transform',
    handler: function (s) { return Transforms.uuidValidate(s); } },
  { slug: 'ulid-validator', name: 'ULID Validator', desc: 'Validate ULIDs and decode the embedded timestamp — Crockford charset, 48-bit time range, per-line verdicts', category: 'network', tags: ['ulid', 'validate'], icon: 'key', template: 'transform',
    handler: function (s) { return Transforms.ulidValidate(s); } },
  { slug: 'http-header-inspector', name: 'HTTP Header Inspector', desc: 'Paste raw response headers \u2014 parsed table plus a security audit (HSTS, CSP, cookies, CORS)', category: 'network', tags: ['http', 'headers', 'security', 'audit'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.httpInspect(s); } },
  { slug: 'dns-lookup', name: 'DNS Lookup', desc: 'Resolve DNS records over encrypted DNS (DoH) \u2014 A/AAAA/MX/TXT and more, cached 5 min', category: 'network', tags: ['dns', 'doh', 'domain', 'records'], icon: 'globe', template: 'custom' },
  { slug: 'cidr-calculator', name: 'CIDR Subnet Calculator', desc: 'Paste 192.168.1.10/24 — network, broadcast, mask, wildcard, host count and usable range', category: 'network', tags: ['cidr', 'subnet', 'ip', 'network', 'mask'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.cidrInfo(s); } },
  { slug: 'url-parser', name: 'URL Parser', desc: 'Decompose any URL — protocol, host, port, path and a decoded query-param table', category: 'network', tags: ['url', 'parse', 'query', 'params'], icon: 'globe', template: 'transform',
    handler: function (s, opts) { return Transforms.parseURL(s, opts); },
    params: [{ key: 'view', label: 'View', type: 'select', default: 'table', options: [{ value: 'table', label: 'Table' }, { value: 'json', label: 'JSON' }] }] },

  { slug: 'user-agent-parser', name: 'User-Agent Parser', desc: 'Parse any User-Agent string \u2014 browser, version, OS, device class and bot detection', category: 'network', tags: ['user-agent', 'browser', 'parse', 'bot'], icon: 'globe', template: 'transform',
    handler: function (s) { return Transforms.parseUA(s); } },

  // ── Algorithm Visualizers ───────────────────────────────
  { slug: 'sorting-visualizer', name: 'Sorting Algorithm Visualizer', desc: 'Watch bubble, quick, merge, insertion, selection sorts in action', category: 'algorithms', tags: ['sorting', 'visualizer', 'algorithm'], icon: 'gitbranch', template: 'custom' },
  { slug: 'search-visualizer', name: 'Search Algorithm Visualizer', desc: 'Visualize linear and binary search on arrays', category: 'algorithms', tags: ['search', 'visualizer'], icon: 'workflow', template: 'custom' },
  { slug: 'binary-tree-visualizer', name: 'Binary Tree Visualizer', desc: 'Visualize binary search tree operations', category: 'algorithms', tags: ['binary tree', 'bst', 'visualizer'], icon: 'gitbranch', template: 'custom' },
  { slug: 'levenshtein-distance', name: 'Levenshtein Distance', desc: 'Edit distance between two texts — substitutions, insertions and deletions counted, similarity scored', category: 'algorithms', tags: ['edit distance', 'diff', 'similarity', 'algorithm'], icon: 'gitbranch', template: 'transform',
    handler: function (s, opts) { return Transforms.levenshteinReport(s, opts); },
    params: [{ key: 'compareTo', label: 'Compare with (text)', type: 'textarea', default: '' }] }
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

})();
