'use strict';
/* End-to-end smoke tests for every rewritten tool handler.
   Run: node build/smoke-tools.js  (exit 0 = all green) */

global.window = {};
global.self = global.window;
if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
  global.crypto = require('crypto').webcrypto;
}
require('../js/lib/random.js');
require('../js/lib/diff.js');
require('../js/lib/qr-decode.js');
require('../js/manifest.js');
require('../js/lib/transforms.js');
require('../js/lib/crypto.js');
for (const k of ['CryptoRand', 'QrDecode', 'MyersDiff', 'TOOLMANIFEST', 'TOOLS_BY_SLUG', 'TOOLCATEGORIES', 'Transforms']) {
  global[k] = window[k];
}

const TOOLS = window.TOOLS_BY_SLUG;
global.QrDecode = window.QrDecode;
const T = window.Transforms;
let passed = 0, failed = 0;
const pending = [];

function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.error('  FAIL ' + name); }
}

console.log('-- generators --');
{
  const out = TOOLS['random-string'].genHandler({ length: '64', charset: 'alphanumeric' });
  ok(out.length === 64 && /^[a-zA-Z0-9]+$/.test(out), 'random-string length+charset');
  const hexs = TOOLS['random-string'].genHandler({ length: '32', charset: 'hex' });
  ok(/^[0-9a-f]{32}$/.test(hexs), 'random-string hex');
}
{
  const lines = TOOLS['uuid-generator'].genHandler({ count: '200' }).split('\n');
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  ok(lines.length === 200 && lines.every(l => re.test(l)), 'uuid v4 format x200');
  ok(new Set(lines).size === 200, 'uuid uniqueness');
}
{
  const v7 = TOOLS['uuid-v7-generator'].genHandler({ count: '100' }).split('\n');
  const re7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  ok(v7.length === 100 && v7.every(l => re7.test(l)), 'uuid v7 format x100');
  ok(new Set(v7).size === 100, 'uuid v7 uniqueness');
  ok(T.uuidV7(0).indexOf('00000000-0000-7') === 0, 'uuid v7 epoch-zero time prefix');
  ok(T.uuidV7(1000) < T.uuidV7(2000), 'uuid v7 time-ordered');
  ok(T.uuidV7(Date.now()).length === 36, 'uuid v7 length 36');
  ok(TOOLS['uuid-generator'].genHandler({ count: '999999' }).split('\n').length === 1000, 'uuid v4 count clamped to 1000');
  ok(TOOLS['uuid-v7-generator'].genHandler({ count: '999999' }).split('\n').length === 1000, 'uuid v7 count clamped to 1000');
  ok(TOOLS['uuid-v7-generator'].genHandler.toString().indexOf('uuidV7BatchOpts') >= 0, 'uuid-v7 delegates opts');
}
{
  const ulids = TOOLS['ulid-generator'].genHandler({ count: '200' }).split('\n');
  ok(ulids.length === 200 && ulids.every(l => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(l)), 'ulid format x200 (Crockford, no I/L/O/U)');
  ok(new Set(ulids).size === 200, 'ulid uniqueness');
  ok(T.ulid(0).indexOf('0000000000') === 0 && T.ulidDecode(T.ulid(0)).timestamp === 0, 'ulid epoch-zero roundtrip');
  ok(T.ulid(0xFFFFFFFFFFFF).charAt(0) === '7' && T.ulidDecode(T.ulid(0xFFFFFFFFFFFF)).timestamp === 0xFFFFFFFFFFFF, 'ulid max-time roundtrip');
  ok(T.ulid(1469922850259).slice(0, 10) === '01ARZ3NDEK', 'ulid known timestamp prefix');
  ok(T.ulid(1000) < T.ulid(2000), 'ulid lexicographic time order');
  ok(Math.abs(T.ulidDecode(ulids[0]).timestamp - Date.now()) < 60000, 'ulid timestamp decodes to now');
  ok(TOOLS['ulid-generator'].genHandler({ count: '999999' }).split('\n').length === 1000, 'ulid count clamped to 1000');
  ok(TOOLS['lorem-ipsum'].genHandler.toString().indexOf('loremIpsumOpts') >= 0, 'lorem delegates');
  ok(TOOLS['lorem-ipsum'].genHandler({ paragraphs: '2' }).split('\n\n').length === 2, 'lorem 2 paragraphs');
  ok(T.loremIpsumOpts({ paragraphs: '999' }).split('\n\n').length === 50, 'lorem clamp 50');
  let threwU = false; try { T.ulidDecode('nope'); } catch (e) { threwU = true; }
  ok(threwU, 'ulid decode rejects garbage');
  threwU = false; try { T.ulidDecode('80000000000000000000000000'); } catch (e) { threwU = true; }
  ok(threwU, 'ulid decode rejects 48-bit overflow');
  var uv = TOOLS['ulid-validator'].handler('01ARZ3NDEKTSV4RRFFQ69G5FAV\nnope\n80000000000000000000000000').split('\n');
  ok(uv.length === 3 && uv[0].indexOf('✓') === 0 && uv[0].indexOf('valid ULID') >= 0 && uv[0].indexOf('timestamp') >= 0, 'ulid validator accepts known-good with timestamp');
  ok(uv[1].indexOf('✗') === 0 && uv[2].indexOf('✗') === 0, 'ulid validator rejects bad lines per-line');
  ok(TOOLS['ulid-validator'].handler.toString().indexOf('ulidValidate') >= 0, 'ulid-validator delegates');
  { var HV = TOOLS['uuid-v4-validate'].handler;
    ok(HV('550e8400-e29b-41d4-a716-446655440000').indexOf('UUIDv4') >= 0, 'uuid validator reports v4');
    ok(HV(T.uuidV7(0)).indexOf('UUIDv7') >= 0, 'uuid validator accepts generated v7');
    ok(HV('00000000-0000-0000-0000-000000000000').indexOf('Nil') >= 0, 'uuid validator Nil');
    ok(HV('ffffffff-ffff-ffff-ffff-ffffffffffff').indexOf('Max') >= 0, 'uuid validator Max');
    ok(HV('not-a-uuid').indexOf('\u2717') === 0, 'uuid validator rejects garbage');
    ok(HV('550e8400-e29b-11d4-a716-446655440000').indexOf('UUIDv1') >= 0, 'uuid validator reports v1'); }

  ok(global.CryptoRand.bytes(10) instanceof Uint8Array, 'CryptoRand.bytes returns bytes');
}
{
  let allGood = true;
  for (let i = 0; i < 50; i++) {
    const pw = TOOLS['password-generator'].genHandler({ length: '24', upper: 'true', lower: 'true', digits: 'true', symbols: 'true' });
    if (!(/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[!@#$%^&*()_+\-=[\]{}|;:,.<>?~]/.test(pw))) { allGood = false; break; }
  }
  ok(allGood, 'password covers every selected class x50');
  const pw2 = TOOLS['password-generator'].genHandler({ length: '8', symbols: 'false' });
  ok(!/[!@#$]/.test(pw2), 'password excludes symbols when off');
}
{
  const key = TOOLS['api-key-generator'].genHandler({ format: 'sk' });
  ok(/^sk-[a-zA-Z0-9]{32}$/.test(key), 'api-key sk- prefix + 32 chars');
}
{
  const macs = TOOLS['mac-address-generator'].genHandler({ count: '100' }).split('\n');
  ok(macs.every(m => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m)), 'mac format x100');
  ok(macs.every(m => { const b0 = parseInt(m.slice(0, 2), 16); return (b0 & 0x02) !== 0 && (b0 & 0x01) === 0; }),
    'mac locally-administered unicast bit pattern');
}

console.log('-- math --');
{
  const h = function (s) { return TOOLS['prime-checker'].handler(s); };
  ok(h('2').indexOf('prime') >= 0 && h('2').indexOf('not') < 0, '2 prime');
  ok(h('1').indexOf('not a prime') >= 0, '1 rejected');
  ok(h('97').indexOf('prime') >= 0, '97 prime');
  ok(h('561').includes('Smallest factor: 3'), 'Carmichael 561 caught, factor 3');
  ok(h('10403').includes('Smallest factor: 101'), '10403=101*103 factor found');
  ok(h('2305843009213693951').indexOf('prime') >= 0 && h('2305843009213693951').indexOf('not prime') < 0,
    'Mersenne 2^61-1 prime (past float range)');
  ok(h('170141183460469231731687303715884105727').indexOf('not prime') < 0, 'Mersenne 2^127-1 prime (39 digits)');
  ok(h('35').indexOf('Smallest factor: 5') >= 0, 'prime sync chunk finds 5 in 35');
  // Strong-pseudoprime ladder: each fools the first k bases yet must fall to
  // the full 12-witness set (expected factors verified by independent trial division).
  ok(h('3215031751').includes('Smallest factor: 151'), 'psp to bases 2-7 rejected, factor 151');
  ok(h('2152302898747').includes('Smallest factor: 6763'), 'psp to bases 2-11 rejected, factor 6763');
  ok(h('3474749660383').includes('Smallest factor: 1303'), 'psp to bases 2-17 rejected, factor 1303');
  ok(h('3317044064679887385961979').includes('Smallest factor: 17'), 'bound-scale composite exact factor 17');
  ok(h('9007199254740991').includes('Smallest factor: 6361'), 'Number fast path at 2^53-1, factor 6361');
  ok(TOOLS['prime-checker'].handler.toString().indexOf('primeCheck') >= 0, 'prime manifest delegates to Transforms');
  ok(TOOLS['prime-checker'].handler('35').includes('Smallest factor: 5') && T.primeCheck('35') === TOOLS['prime-checker'].handler('35'), 'prime delegates sync chunk');
  ok(TOOLS['json-minifier'].handler.toString().indexOf('minifyJSON') >= 0, 'json-minifier delegates');
  ok(TOOLS['json-minifier'].handler('{"a": 1}') === '{"a":1}', 'json-minifier vector');
  ok(TOOLS['regex-escape'].handler.toString().indexOf('regexEscape') >= 0, 'regex-escape delegates');
  ok(TOOLS['url-extractor'].handler.toString().indexOf('extractURLs') >= 0, 'url-extractor delegates');
  ok(TOOLS['url-extractor'].handler('go https://example.com/a now') === 'https://example.com/a', 'url-extractor vector');
  ok(TOOLS['ip-extractor'].handler.toString().indexOf('extractIPs') >= 0, 'ip-extractor delegates');
  ok(TOOLS['ip-extractor'].handler('ip 192.168.1.1 and 999.1.1.1') === '192.168.1.1', 'ip-extractor drops octet overflow');
  ok(TOOLS['json-formatter'].handler.toString().indexOf('formatJSONOpts') >= 0, 'json-formatter delegates');
  ok(TOOLS['json-formatter'].handler('{"a":1}', { indent: '4' }) === T.formatJSON('{"a":1}', 4), 'json-formatter 4-space vector');
  ok(TOOLS['json-formatter'].handler('{"a":1}', { indent: '99' }) === T.formatJSON('{"a":1}', 2), 'json-formatter clamp vector');
  ok(TOOLS['filename-sanitizer'].handler.toString().indexOf('filenameSanitize') >= 0, 'filename-sanitizer delegates');
  ok(TOOLS['filename-sanitizer'].handler('a<b>c:d"e') === 'abcde', 'filename strips Windows-forbidden');
  ok(TOOLS['filename-sanitizer'].handler('CON.txt') === '_CON.txt', 'filename guards reserved name');
  ok(TOOLS['phone-extractor'].handler.toString().indexOf('extractPhonesOpts') >= 0, 'phone-extractor delegates opts');
  ok(TOOLS['phone-extractor'].handler('a 555-123-4567 b 555-987-6543', { delimiter: 'comma' }) === '555-123-4567,555-987-6543', 'phone comma vector');
  ok(TOOLS['phone-extractor'].handler('a 555-123-4567 b 555-987-6543', {}) === T.extractPhones('a 555-123-4567 b 555-987-6543', 'newline'), 'phone bare default is newline');
  ok(TOOLS['regex-tester'].handler.toString().indexOf('regexTest') >= 0, 'regex-tester runs on Transforms engine');
  ok(TOOLS['regex-tester'].handler('abc 123', { pattern: '\\d+', flags: 'g' }).indexOf('Matches found: 1') === 0, 'regex-tester digit vector');
  ok(TOOLS['regex-tester'].handler.toString().indexOf('regexTestOpts') >= 0, 'regex-tester delegates opts');
  var threwR=false; try { TOOLS['regex-tester'].handler('abc', {}) } catch (e) { threwR=true; }
  ok(threwR, 'regex-tester empty pattern throws');
  ok(TOOLS['epoch-converter'].handler.toString().indexOf('epochInfo') >= 0, 'epoch-converter delegates');
  ok(TOOLS['epoch-converter'].handler('1718035200').indexOf('Epoch (s):  1718035200') >= 0, 'epoch seconds vector');
  ok(TOOLS['epoch-converter'].handler('1718035200000').indexOf('Epoch (s):  1718035200') >= 0, 'epoch millis heuristic');
  ok(TOOLS['uuid-v4-validate'].handler.toString().indexOf('uuidValidate') >= 0, 'uuid-validator delegates');
  ok(T.uuidValidate('00000000-0000-0000-0000-000000000000').indexOf('Nil') >= 0, 'uuid Nil vector');
  ok(TOOLS['uuid-v4-validate'].handler(T.uuidV7(0)).indexOf('UUIDv7') >= 0, 'uuid accepts generated v7');
  ok(TOOLS['password-generator'].genHandler.toString().indexOf('generatePasswordOpts') >= 0, 'password delegates opts');
  ok(TOOLS['mac-address-generator'].genHandler({ count: '999999' }).split('\n').length === 100, 'mac count clamped to 100');
  ok(TOOLS['mac-address-generator'].genHandler.toString().indexOf('macBatchOpts') >= 0, 'mac delegates opts');
  ok(TOOLS['mac-address-generator'].genHandler({ count: '20' }).split('\n').every(function (x) { return (parseInt(x.slice(0, 2), 16) & 3) === 2; }), 'mac locally-administered unicast bits x20');
  ok(TOOLS['uuid-generator'].genHandler.toString().indexOf('uuidV4BatchOpts') >= 0, 'uuid-generator delegates opts');
  ok(TOOLS['uuid-generator'].genHandler({ count: '999999' }).split('\n').length === 1000, 'uuid count clamped');
  ok(TOOLS['ulid-generator'].genHandler.toString().indexOf('ulidBatchOpts') >= 0, 'ulid-generator delegates opts');
  ok(TOOLS['random-string'].genHandler.toString().indexOf('randomStringOpts') >= 0, 'random-string delegates opts');
  ok(TOOLS['random-string'].genHandler({ length: '999999', charset: 'hex' }).length === 1024, 'random-string length clamped to 1024');
  ok(TOOLS['word-counter'].handler.toString().indexOf('wordReport') >= 0, 'word-counter delegates');
  ok(TOOLS['line-tools'].handler.toString().indexOf('lineTools') >= 0, 'line-tools delegates');
  ok(TOOLS['line-tools'].handler('b\na', { mode: 'number' }) === '1  b\n2  a', 'line-tools number vector');
  ok(TOOLS['line-tools'].handler(' a \n\n b ', { mode: 'remove-empty' }) === ' a \n b ', 'line-tools drop-empty vector');
  pending.push((async () => {
    ok((await h('147573952589676412927')).indexOf('> 10') >= 0, 'composite 2^67-1 honest verdict (factors > 10^6, async hunt)');
    var r2 = h('400640231');
    ok(r2 && typeof r2.then === 'function', 'prime long hunt yields Promise (chunked, no worker)');
    ok((await r2).indexOf('Smallest factor: 20011') >= 0, 'prime async hunt finds 20011 past first chunk');
    ok((await h('341550071728321')).indexOf('> 10') >= 0, 'psp 341550071728321 (bases 2-17) rejected, honest verdict');
    ok((await h('1000036000099')).indexOf('> 10') >= 0, 'semiprime 1000003*1000033 honest verdict');
  })());
  ok(h('99999999999999999999').indexOf('not prime') >= 0, 'huge composite rejected');
  let threw = false; try { h('12abc'); } catch (e) { threw = true; }
  ok(threw, 'non-digit input throws');
}
{
  const fib = TOOLS['fibonacci-generator'].genHandler({ terms: '90' }).split(', ');
  const F89 = 1779979416004714189n; // past 2^53 — doubles corrupt from term 79 on
  ok(BigInt(fib[89]) === F89 && BigInt(fib[78]) === 8944394323791464n, 'fibonacci exact at terms 79-90 (BigInt)');
  ok(fib.length === 90 && fib[0] === '0' && fib[1] === '1', 'fibonacci sequence head');
  ok(TOOLS["fibonacci-generator"].genHandler.toString().indexOf("fibonacciOpts") >= 0, "fibonacci delegates opts");
  ok(T.fibonacci("999").split(", ").length === 100, "fibonacci clamp 100");
  ok(T.fibonacci("10") === "0, 1, 1, 2, 3, 5, 8, 13, 21, 34", "fibonacci head vector");
}
{
  const out = TOOLS['statistics-calculator'].handler('2 4 4 4 5 5 7 9');
  ok(out.includes('Mean:        5'), 'textbook mean=5');
  ok(out.includes('Median:      4.5'), 'median=4.5 (even count interpolates)');
  ok(out.includes('Mode:        4'), 'mode=4');
  ok(out.includes('StdDev:      2 (population)'), 'population stddev=2');
  ok(out.includes('Variance:    4 (population)'), 'population variance=4');
  ok(/Sample StdDev:\s*2\.13809/.test(out), 'sample stddev=sqrt(32/7)=2.13809');
  const nomode = TOOLS['statistics-calculator'].handler('1\n2\n3');
  ok(nomode.includes('Mode:        none'), 'no repeated value -> mode "none"');
}
{
  const conv = TOOLS['number-base-converter'].handler;
  ok(conv.toString().indexOf("baseConvertOpts") >= 0, "base-converter delegates");
  ok(T.baseConvertOpts("255", undefined).includes("Hex: FF"), "base-converter default opts dec->hex");
  ok(conv('255', { fromBase: '10', toBase: '16' }).includes('Hex: FF'), 'dec->hex');
  ok(conv('1010', { fromBase: '2', toBase: '10' }).includes('Decimal: 10'), 'bin->dec');
  ok(conv('ffffffffffffffff', { fromBase: '16', toBase: '10' }).includes('18446744073709551615'),
    'uint64 max exact (parseInt would truncate)');
  let threw = false; try { conv('129', { fromBase: '8', toBase: '10' }); } catch (e) { threw = true; }
  ok(TOOLS["api-key-generator"].genHandler.toString().indexOf("apiKeyOpts") >= 0, "api-key delegates opts");
  ok(/^pk-[a-zA-Z0-9]{32}$/.test(TOOLS["api-key-generator"].genHandler({ format: "pk" })), "api-key pk- prefix + 32 chars");
  ok(/^[a-zA-Z0-9]{32}$/.test(TOOLS["api-key-generator"].genHandler({ format: "raw" })), "api-key raw 32 chars");
  ok(T.apiKey("xx").length === 32, "api-key unknown format no prefix");
  ok(threw, 'invalid digit for base 8 throws');
}

console.log('-- text / formats --');
{
  const yaml = TOOLS['json-to-yaml'].handler;
  const y1 = yaml(JSON.stringify({ a: 'true', b: '123', c: 'x: y', d: '', e: '- lead', f: 'plain text', g: ' spaced ' }));
  ok(y1.includes('a: "true"'), 'yaml quotes bool-lookalike');
  ok(y1.includes('b: "123"'), 'yaml quotes number-lookalike');
  ok(y1.includes('c: "x: y"'), 'yaml quotes ": " inside');
  ok(y1.includes('d: ""'), 'yaml quotes empty string');
  ok(y1.includes('"- lead"'), 'yaml quotes leading dash');
  ok(y1.includes('f: plain text'), 'plain string stays bare');
  ok(y1.includes('" spaced "'), 'yaml preserves outer spaces');
  var yj = TOOLS['yaml-to-json'].handler;
  var yrt = function (o) { return JSON.stringify(JSON.parse(yj(yaml(JSON.stringify(o))))) === JSON.stringify(o); };
  ok(yrt({ a: 1, nest: { k: true } }), 'yaml nested map roundtrip');
  ok(yrt({ s: 'a\nb' }), 'yaml literal block roundtrip');
  ok(yrt({ list: [1, 2, 3] }), 'yaml seq roundtrip');
  ok(yrt({ users: [{ n: 'a', v: 1 }, { n: 'b', v: 2 }] }), 'yaml seq-of-maps roundtrip');
  ok(yrt({ m: [[1, 2], [3]] }), 'yaml nested-seq roundtrip');
  ok(Array.isArray(JSON.parse(yj('a: {}\nb: []')).b), 'yaml flow empties');
  var yupDup = false; try { yj('a: 1\na: 2'); } catch (e) { yupDup = true; }
  ok(yupDup, 'yaml duplicate key throws');
  ok(yrt({ s: 'a\n\nb' }), 'yaml literal interior blank');
  ok(yrt({ s: 'a\n' }), 'yaml literal clip roundtrip');
  ok(yrt({ s: 'a\n\n' }), 'yaml literal keep roundtrip');
  ok(yrt({ s: '\na' }), 'yaml literal leading newline');
  ok(yrt(['a\nb']), 'yaml seq literal roundtrip');
  ok(JSON.stringify(JSON.parse(yj('m:\n  - - 1\n    - 2\n  - - 3')).m) === '[[1,2],[3]]', 'yaml inline nested seq');
  ok(JSON.parse(yj('m:\n  - - a: 1\n      b: 2')).m[0][0].b === 2, 'yaml inline seq of maps');
  ok(JSON.parse(yj('s: >\n  a\n  b\n  c')).s === 'a b c\n', 'yaml folded clip');
  ok(JSON.parse(yj('s: >-\n  a\n  b')).s === 'a b', 'yaml folded strip');
  ok(JSON.parse(yj('s: >\n  a\n\n  b')).s === 'a\n\nb\n', 'yaml folded paragraph break');
  ok(T.yamlFormat('a: 1\nb: 2') === 'a: 1\nb: 2\n', 'yaml format map');
  ok(T.yamlFormat('flag: yes') === 'flag: "yes"\n', 'yaml format protects bool word');
  ok(T.yamlFormat('- a\n- b') === '- a\n- b\n', 'yaml format seq');
  ok(T.yamlFormat('a:\n    b: 1') === 'a:\n  b: 1\n', 'yaml format reindents');
  ok(T.yamlToJSON(T.yamlFormat('a: 1\nb:\n  - x\n  - 2')) === T.yamlToJSON('a: 1\nb:\n  - x\n  - 2'), 'yaml format roundtrip');
  ok(TOOLS['yaml-formatter'].handler.toString().indexOf('yamlFormatOpts') >= 0, 'yaml formatter delegates');
  ok(TOOLS['yaml-formatter'].handler('a: 1') === 'a: 1\n', 'yaml formatter vector');
  var threwY=false; try { TOOLS['yaml-formatter'].handler('   ') } catch (e) { threwY=true; }
  ok(threwY, 'yaml formatter empty throws');
}
{
  const diffOut = TOOLS['text-diff'].handler(['a','b','c','d','e'].join('\n'), { compareTo: ['a','b','X','c','d','e'].join('\n') });
  ok(diffOut.split('\n').filter(l => l === '+ X').length === 1 &&
     diffOut.split('\n').filter(l => l.startsWith('  ')).length === 5, 'myers diff via manifest handler');
  ok(TOOLS['text-diff'].handler.toString().indexOf('diffOpts') >= 0, 'diff delegates opts');
  ok(TOOLS['text-diff'].handler('a') === T.textDiff('a', ''), 'diff default lines+empty');
}
{
  ok(TOOLS['text-sorter'].handler('c\na\nb', { sortBy: 'alpha', direction: 'asc' }) === T.sortLines('c\na\nb', false), 'sorter delegates alpha');
  ok(TOOLS['text-sorter'].handler('aa\nb', { sortBy: 'length', direction: 'asc' }) === T.sortByLength('aa\nb', false), 'sorter delegates length');
  ok(TOOLS['text-sorter'].handler.toString().indexOf('sortText') >= 0, 'sorter delegates via sortText');
  ok(T.sortText('c\na\nb', { sortBy: 'alpha', direction: 'desc' }) === 'c\nb\na', 'sorter desc vector');
  ok(TOOLS['text-reverser'].handler('abc', { mode: 'full' }) === 'cba', 'reverser delegates full');
  ok(TOOLS['text-reverser'].handler('abc') === 'cba', 'reverser default full');
  ok(TOOLS['text-reverser'].handler('ab\ncd', { mode: 'lines' }) === 'ba\ndc', 'reverser delegates lines');
  ok(TOOLS['text-reverser'].handler.toString().indexOf('reverseTextOpts') >= 0, 'reverser delegates opts');
  ok(TOOLS['text-deduplicator'].handler('a\na\nb') === 'a\nb', 'dedup delegates');
  ok(TOOLS['palindrome-checker'].handler('racecar').indexOf('\u2713 YES') === 0, 'palindrome delegates yes');
  ok(TOOLS['palindrome-checker'].handler('hello').indexOf('\u2717 NO') === 0, 'palindrome delegates no');
  const html = TOOLS['html-formatter'].handler('<div><p>hello</p><br><script>var x = "<div>not markup</div>";</script><!-- c --></div>');
  ok(html.indexOf('var x = "<div>not markup</div>";') >= 0, 'script content preserved verbatim');
  ok(/\n\s*<br>\n/.test(html), 'void element gets own line, no child indent');
  ok(html.includes('<!-- c -->'), 'comment preserved');
}
{
  const msrc = '<div>\n  <!-- strip -->\n  <p>hello   world</p>\n</div>';
  const min = TOOLS['html-minifier'].handler(msrc);
  ok(min === '<div><p>hello world</p></div>', 'html-minify strips comments, collapses whitespace');
  ok(TOOLS['html-minifier'].handler('<b>a</b>') === T.htmlMinify('<b>a</b>'), 'html-minifier delegates to Transforms');
  const mstr = 'var x = ' + String.fromCharCode(34) + '<div>not markup</div>' + String.fromCharCode(34) + ';';
  const mraw = TOOLS['html-minifier'].handler('<script>' + mstr + '</script><pre>  keep  spaces\n</pre>');
  ok(mraw.indexOf(mstr) >= 0, 'html-minify keeps script verbatim');
  ok(mraw.indexOf('<pre>  keep  spaces\n</pre>') >= 0, 'html-minify keeps pre verbatim');
}
{
  const sql = TOOLS['sql-formatter'].handler("select id, name from users u left join orders o on o.uid = u.id where name != 'x FROM y select z' and age > 21");
  ok(sql.includes("'x FROM y select z'"), 'quoted literal untouched by keyword breaker');
  ok(TOOLS['sql-formatter'].handler('select 1 from t') === T.sqlFormat('select 1 from t'), 'sql-formatter delegates to Transforms');
  ok(/^SELECT id, name/m.test(sql), 'first clause at column 0, uppercased');
  ok(/^FROM/m.test(sql.toUpperCase()), 'FROM on its own line');
  ok(/^  LEFT JOIN/m.test(sql.toUpperCase()), 'join indented two spaces');
  ok(/^    ON\b/m.test(sql.toUpperCase()), 'ON condition indented under join');
}
{
  const msql = "SELECT  id,\n  name  -- get names\nFROM users WHERE name != 'x  FROM y  select z' AND age > 21";
  const mout = TOOLS['sql-minifier'].handler(msql);
  ok(mout === "SELECT id, name FROM users WHERE name != 'x  FROM y  select z' AND age > 21", 'sql-minify strips comments, collapses whitespace, keeps literals');
  ok(TOOLS['sql-minifier'].handler('a') === T.sqlMinify('a'), 'sql-minifier delegates to Transforms');
  ok(TOOLS['sql-minifier'].handler('SELECT /* hidden */ 1') === 'SELECT 1', 'sql-minify strips block comments');
  ok(TOOLS['sql-minifier'].handler("SELECT 'it''s -- kept' FROM t") === "SELECT 'it''s -- kept' FROM t", 'sql-minify keeps escaped quotes and comment-like text');
}
{
  var jm = TOOLS['javascript-minifier'].handler('var a = 1; // strip\nvar b = 2;');
  ok(jm === 'var a=1;var b=2;', 'js-minify strips line comment + newlines');
  ok(TOOLS['javascript-minifier'].handler('var s = "a // b";').indexOf('"a // b"') >= 0, 'js-minify keeps // inside strings');
  ok(TOOLS['javascript-minifier'].handler('var r = /ab+c/g;').indexOf('/ab+c/g') >= 0, 'js-minify keeps regex, splits division');
  ok(TOOLS['javascript-minifier'].handler('var q = a / b;').indexOf('a/b') >= 0, 'js-minify keeps division operator');
  ok(T.jsMinify('function f(){return 1;}').indexOf('return 1') >= 0, 'js-minify keeps space after return');
  ok(TOOLS['svg-optimizer'].handler('<!--c--><svg><rect/></svg>').indexOf('<!--') < 0, 'svg-optimizer strips comments');
  ok(TOOLS['svg-optimizer'].handler('<svg>\n  <g>\n  </g>\n</svg>') === '<svg><g></g></svg>', 'svg-optimizer collapses indentation');
  ok(T.svgMinify('<svg><text><tspan>a</tspan> <tspan>b</tspan></text></svg>').indexOf('</tspan> <tspan>') >= 0, 'svg-optimizer keeps text spaces');
  ok(T.svgMinify('<svg inkscape:version="1.2"><rect/></svg>').indexOf('inkscape') < 0, 'svg-optimizer strips namespaced cruft');
  ok(T.levenshtein('kitten', 'sitting') === 3, 'levenshtein textbook vector');
  ok(T.levenshtein('abc', 'abc') === 0 && T.levenshtein('', 'abc') === 3, 'levenshtein identical and empty');
  ok(TOOLS['levenshtein-distance'].handler.toString().indexOf('levenshteinReport') >= 0, 'levenshtein delegates opts');
  ok(TOOLS['levenshtein-distance'].handler('kitten', { compareTo: 'sitting' }).indexOf('Distance: 3') >= 0, 'levenshtein manifest vector');
  ok(TOOLS['levenshtein-distance'].handler('abc', { compareTo: 'abc' }).indexOf('Similarity: 100.0%') >= 0, 'levenshtein identical similarity');
  ok(TOOLS['json-to-typescript'].handler('{"name":"Ada","age":30}').indexOf('name: string') >= 0, 'json-to-ts scalars');
  ok(TOOLS['json-to-typescript'].handler('{"addr":{"city":"X"}}').indexOf('interface RootAddr') >= 0, 'json-to-ts nested interface');
  ok(T.jsonToTS('[{"id":1}]', { rootName: 'User' }).indexOf('type User =') >= 0, 'json-to-ts array root alias');
  ok(TOOLS['byte-size-formatter'].handler('1536') === '1.5 KiB (1,536 bytes)', 'byte-size binary');
  ok(TOOLS['byte-size-formatter'].handler('1000', { mode: 'decimal' }) === '1 KB (1,000 bytes)', 'byte-size decimal');
  ok(T.formatBytes('0') === '0 B (0 bytes)', 'byte-size zero');
}
{
  const csv = TOOLS['csv-to-json'].handler('\uFEFFname,note\n"Smith, John","said ""hi""\nthen left"\nAnn,ok\r\n');
  const parsed = JSON.parse(csv);
  ok(parsed.length === 2, 'csv rows incl. quoted-newline record');
  ok(parsed[0]['name'] === 'Smith, John', 'quoted comma cell');
  ok(parsed[0]['note'] === 'said "hi"\nthen left', 'escaped quotes + newline inside quotes');
  ok(parsed[1]['name'] === 'Ann' && parsed[1]['note'] === 'ok', 'CRLF handled');
}

console.log('-- transforms lib --');
{
  const rt = T.base64Decode(T.base64Encode('héllo 🌍 unicode'));
  ok(rt === 'héllo 🌍 unicode', 'base64 unicode roundtrip without deprecated fns');
  ok(T.base64Decode('data:text/plain;base64,aGVsbG8=') === 'hello', 'base64 pasted data-URI prefix stripped');
  ok(T.base64Decode('"aGVsbG8="') === 'hello', 'base64 pasted quotes stripped');
  ok(T.base64Decode('aGVsbG8td29ybGRf') === 'hello-world_', 'base64url alphabet accepted');
  ok(T.hexDecode('0x 41') === 'A' && T.hexDecode('41-42') === 'AB' && T.hexDecode('41:42') === 'AB', 'hex pasted 0x prefix and separators stripped');
  ok(T.hexToBase64('0x616263') === 'YWJj', 'hexToBase64 shares paste tolerance');
  ok(T.binaryDecode('0b01000001') === 'A', 'binary pasted 0b prefix stripped');
  ok(T.base32Decode('"NBSWY3DP"') === 'hello', 'base32 pasted quotes stripped');
  ok(T.base58Encode('hello') === 'Cn8eVZg', 'base58 known vector');
  ok(T.base58Decode('Cn8eVZg') === 'hello', 'base58 decode known vector');
  ok(T.base58Decode(T.base58Encode('hello-world_')) === 'hello-world_', 'base58 roundtrip');
  ok(T.base58Decode(String.fromCharCode(34) + 'Cn8eVZg' + String.fromCharCode(34)) === 'hello', 'base58 pasted quotes stripped');
  ok(T.base58Encode(String.fromCharCode(0) + String.fromCharCode(0) + 'hello') === '11Cn8eVZg', 'base58 leading zero bytes preserved');
  ok(T.semverCompare('1.2.3', '2.0.0') === '1.2.3 < 2.0.0 (major bump)', 'semver major ordering');
  ok(T.semverCompare('v1.2.3', '1.2.3') === '1.2.3 == 1.2.3 (equal)', 'semver v prefix plus equal');
  ok(T.semverCompare('1.0.0-alpha', '1.0.0') === '1.0.0-alpha < 1.0.0 (release beats prerelease)', 'semver prerelease precedence');
  ok(T.semverCompare('1.0.0-alpha.1', '1.0.0-alpha.beta') === '1.0.0-alpha.1 < 1.0.0-alpha.beta (prerelease)', 'semver numeric prerelease first');
  ok(TOOLS['semver-compare'].handler.toString().indexOf('semverCompareOpts') >= 0, 'semver delegates opts');
  ok(TOOLS['semver-compare'].handler('1.2.3', {}) === 'Enter a version in each field', 'semver empty compareTo guarded');
  ok(TOOLS['semver-compare'].handler('1.2.3', { compareTo: '2.0.0' }).indexOf('major bump') >= 0, 'semver happy vector');
  ok(TOOLS['tool-scaffold'].genHandler({ slug: 'my-tool', kind: 'transform' }).includes('Transforms.myTool(s)'), 'scaffold transform stub');
  ok(TOOLS['tool-scaffold'].genHandler({ slug: 'my-viz', kind: 'custom' }).includes('App.registerTool'), 'scaffold custom stub');
  ok(TOOLS['tool-scaffold'].genHandler({ slug: 'gen-x', kind: 'generator' }).includes('genHandler'), 'scaffold generator stub');
  ok(T.htmlToMarkdown('<h1>Hi</h1>') === '# Hi', 'md h1');
  ok(T.htmlToMarkdown('<p>Hello <strong>b</strong></p>') === 'Hello **b**', 'md bold para');
  ok(T.htmlToMarkdown('<ul><li>a</li><li>b</li></ul>') === '- a\n- b', 'md list');
  ok(T.htmlToMarkdown('<table><tr><th>A</th></tr><tr><td>1</td></tr></table>') === '| A |\n| --- |\n| 1 |', 'md table');
  ok(TOOLS['html-to-markdown'].handler.toString().indexOf('htmlToMarkdownOpts') >= 0, 'md delegates opts');
  ok(TOOLS['html-to-markdown'].handler('<h2>T</h2>') === '## T', 'md manifest vector');
  var threwH=false; try { TOOLS['html-to-markdown'].handler('   ') } catch (e) { threwH=true; }
  ok(threwH, 'md empty throws');
  ok(typeof window.warmPrimeCache === 'function', 'warmPrimeCache hook exposed');
  var pd = window.warmPrimeCache();
  ok(pd.length === 78496 && pd[0] === 5 && pd[pd.length - 1] === 999983, 'prime table exact: 78496 primes 5..999983');
  ok(window.warmPrimeCache() === pd, 'prime table cached by reference');
  ok(T.htmlDecode('&#65;&#x42;') === 'AB' && T.htmlDecode('a&nbsp;b') === 'a\u00A0b', 'html numeric entities and nbsp decoded');
  ok(T.htmlDecode('&bogus;') === '&bogus;', 'html unknown entity left intact');
  const b64url = function (o) {
    return Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
      .split('+').join('-').split('/').join('_').replace(/=+$/, '');
  };
  const jwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ sub: '1234567890', name: 'Jörn __- Doe' }) + '.c2ln';
  const dec = T.jwtDecode(jwt);
  ok(dec.rawPayload.name === 'Jörn __- Doe', 'jwt base64url decode handles - and _');
  ok(dec.rawHeader.alg === 'HS256', 'jwt header parsed');
  ok(T.uuidV4().length === 36, 'transforms uuidV4 delegates to CSPRNG');
  const td = T.textDiff('a\nb\nc', 'a\nc');
  ok(td === '  a\n- b\n  c', 'lib textDiff is Myers-based');
  ok(T.chmodConvert('755').includes('rwxr-xr-x'), 'chmod 755 octal to symbolic');
  ok(T.chmodConvert('rwxr-xr-x').includes('755'), 'chmod symbolic to octal');
  ok(T.cronExplain('*/5 * * * *').includes('Next runs'), 'cron every-5-min explains with runs');
  ok(T.formatJSON('{"a":1}', 2).includes('\"a\": 1'), 'formatJSON delegates from manifest');
  ok(T.cronBuild({ preset: 'daily' }).includes('0 0 * * *'), 'cronBuild daily preset composes');
  ok(T.cronBuild({ preset: 'custom', minute: '*/5' }).includes('Next runs'), 'cronBuild custom fields explain');
  ok(T.cronParse('*/5 * * * *').summary.indexOf('5 minutes') >= 0, 'cronParse structured summary');
  ok(T.cronParse('0 9 * * 1-5').fieldTexts.length === 5, 'cronParse five field texts');
  ok(T.cronNext('*/5 * * * *', 3).length === 3, 'cronNext returns ordered runs');
  ok(TOOLS['jwt-generator'].placeholder === '{"sub":"123","name":"Ada"}', 'jwt placeholder guides first run');
  ok(TOOLS['cron-explainer'].placeholder === '*/5 * * * *', 'cron placeholder guides first run');
  ok(TOOLS['chmod-converter'].placeholder.indexOf('755') >= 0, 'chmod placeholder guides first run');

console.log('-- json to toml --');
{
  var tj = TOOLS['json-to-toml'].handler('{"a":1,"b":"x","c":true}');
  ok(tj === 'a = 1\nb = "x"\nc = true', 'toml flat scalars');
  var tn = TOOLS['json-to-toml'].handler('{"db":{"host":"h","ports":[1,2]},"srv":[{"ip":"a"},{"ip":"b"}]}');
  ok(tn === '[db]\nhost = "h"\nports = [1, 2]\n[[srv]]\nip = "a"\n[[srv]]\nip = "b"', 'toml tables + array-tables');
  ok(TOOLS['json-to-toml'].handler('{"a":1}') === T.jsonToTOML('{"a":1}'), 'json-to-toml delegates to Transforms');
  var tj = TOOLS['toml-to-json'].handler('[db]\nhost = "h"\n[[srv]]\nip = "a"');
  ok(tj === '{\n  "db": {\n    "host": "h"\n  },\n  "srv": [\n    {\n      "ip": "a"\n    }\n  ]\n}', 'toml tables decode');
  ok(TOOLS['toml-to-json'].handler('a = 1') === T.tomlToJSON('a = 1'), 'toml-to-json delegates to Transforms');
  ok(TOOLS['json-diff'].handler.toString().indexOf('jsonDiffOpts') >= 0, 'json-diff delegates opts');
  ok(TOOLS['json-diff'].handler('{"a":1}', { compareTo: '{"a":2}' }) === T.jsonDiff('{"a":1}', '{"a":2}'), 'json-diff delegates changed value');
  ok(TOOLS['json-diff'].handler('{"a":1}', { compareTo: '{"a":1}' }) === 'No differences found', 'json-diff identical no-diff');
  ok(TOOLS['json-diff'].handler('{"a":1}') === T.jsonDiff('{"a":1}', '{}'), 'json-diff default compareTo {}');
  ok(TOOLS['json-diff'].handler('{"a":{"x":1}}', { compareTo: '{"a":{"x":2,"b":3}}' }) === T.jsonDiff('{"a":{"x":1}}', '{"a":{"x":2,"b":3}}'), 'json-diff delegates nested');
  ok(TOOLS['json-to-xml'].handler.toString().indexOf('jsonToXML') >= 0, 'json-to-xml manifest delegates to Transforms');
  ok(TOOLS['json-to-xml'].handler('{"a":{"b":2},"list":[1,2]}') === T.jsonToXML('{"a":{"b":2},"list":[1,2]}'), 'json-to-xml delegates nested');
  ok(TOOLS['json-to-xml'].handler('{"a b":1}').indexOf('<a_b>1</a_b>') >= 0, 'json-to-xml sanitizes tag names to valid XML');
  ok(TOOLS['statistics-calculator'].handler.toString().indexOf('describeStats') >= 0, 'stats manifest delegates to Transforms');
  ok(TOOLS['statistics-calculator'].handler('1 2 3 4 5') === T.describeStats('1 2 3 4 5'), 'stats delegates 1-5');
  ok(TOOLS['statistics-calculator'].handler('5 5 5 5').indexOf('Mode:        5') >= 0, 'stats mode vector');
  ok(TOOLS['statistics-calculator'].handler('1 2').indexOf('Sample StdDev:') >= 0, 'stats sample-stddev present');
  ok(TOOLS['css-formatter'].handler.toString().indexOf('cssFormat') >= 0, 'css manifest delegates to Transforms');
  ok(TOOLS['css-formatter'].handler('a{color:red}', { mode: 'beautify' }) === T.cssFormat('a{color:red}', { mode: 'beautify' }), 'css delegates beautify');
  ok(TOOLS['css-formatter'].handler('a { color: red; }', { mode: 'minify' }) === 'a{color:red}', 'css minify vector');
  ok(TOOLS['css-formatter'].handler("a::after{content:'{x}'}", { mode: 'minify' }).indexOf("{x}") >= 0, 'css minify keeps braced string');
  ok(TOOLS['cidr-calculator'].handler.toString().indexOf('cidrInfo') >= 0, 'cidr manifest delegates to Transforms');
  ok(TOOLS['cidr-calculator'].handler('192.168.1.10/24') === T.cidrInfo('192.168.1.10/24'), 'cidr delegates /24');
  ok(TOOLS['cidr-calculator'].handler('192.168.1.10/24').indexOf('Hosts:        254') >= 0, 'cidr /24 host count');
  ok(TOOLS['cidr-calculator'].handler('10.0.0.1/8').indexOf('Network:      10.0.0.0') >= 0, 'cidr /8 network');
  var tjrt = T.tomlToJSON(T.jsonToTOML('{"q":"a\\"b"}'));
  ok(JSON.parse(tjrt).q === 'a"b', 'toml round trip preserves quotes');
}
  ok(TOOLS['hmac-generator'].params[0].type === 'password', 'hmac key masks as password');
  ok(TOOLS['jwt-generator'].params[0].type === 'password', 'jwt secret masks as password');
  { global.Core = global.Core || {}; global.Core.hmacHex = function (key, msg, flag) { return require('crypto').createHmac(flag === 0 ? 'sha1' : 'sha256', String(key)).update(String(msg)).digest('hex'); };
    var h256 = TOOLS['hmac-generator'].handler('hello', { key: 'k', algorithm: 'SHA-256' });
    ok(h256 === require('crypto').createHmac('sha256', 'k').update('hello').digest('hex'), 'hmac wires key+message sha256');
    var h1 = TOOLS['hmac-generator'].handler('hello', { key: 'k', algorithm: 'SHA-1' });
    ok(h1 === require('crypto').createHmac('sha1', 'k').update('hello').digest('hex') && h1.length === 40, 'hmac wires key+message sha1');
    ok(TOOLS['hmac-generator'].handler('hello', { key: 'k1' }) !== TOOLS['hmac-generator'].handler('hello', { key: 'k2' }), 'hmac key changes output');
    ok(TOOLS['hmac-generator'].handler.toString().indexOf('hmacOpts') >= 0, 'hmac delegates opts');
    ok(TOOLS['hmac-generator'].handler('hello') === T.hmacSha256('secret', 'hello'), 'hmac default key+sha256');
    ok(TOOLS['jwt-generator'].handler.toString().indexOf('jwtSignOpts') >= 0, 'jwt delegates opts');
    ok(TOOLS['jwt-generator'].handler('{"sub":"1"}', { secret: 's', expires: 'none' }) === T.jwtSign('{"sub":"1"}', 's', 'none'), 'jwt delegates vector');
    ok(TOOLS['jwt-verifier'].handler.toString().indexOf('jwtVerifyOpts') >= 0, 'jwt-verifier delegates opts');
    var _jt = TOOLS['jwt-generator'].handler('{"sub":"1"}', { secret: 's', expires: 'none' });
    ok(TOOLS['jwt-verifier'].handler(_jt, { secret: 's' }).indexOf('Signature: VALID') === 0, 'jwt-verifier roundtrip valid');
    ok(TOOLS['jwt-verifier'].handler(_jt, { secret: 'wrong' }).indexOf('INVALID') >= 0, 'jwt-verifier wrong secret invalid'); }
  ok(T.hexToBase64('616263') === 'YWJj', 'hexToBase64 abc vector');
  ok(T.hexToBase64('deadbeef') === Buffer.from('deadbeef', 'hex').toString('base64'), 'hexToBase64 matches Buffer');
  { global.Core = { sha384Hex: function () { return require('crypto').createHash('sha384').update('abc').digest('hex'); }, sha512Hex: function () { return '00'; }, sha256Hex: function () { return '00'; } };
    var want = 'sha384-' + Buffer.from(require('crypto').createHash('sha384').update('abc').digest()).toString('base64');
    ok(T.sriHash('abc', 'SHA-384') === want, 'sriHash sha384 token matches node crypto');
    ok(TOOLS['sri-generator'].handler.toString().indexOf('sriHashOpts') >= 0, 'sri delegates opts');
    ok(TOOLS['sri-generator'].handler('abc') === T.sriHash('abc', 'SHA-384'), 'sri default sha384'); }
  { global.Core = global.Core || {}; global.Core.sha384Hex = function (s) { return require('crypto').createHash('sha384').update(String(s)).digest('hex'); };
    ok(TOOLS['sha384-hash'].handler('abc') === require('crypto').createHash('sha384').update('abc').digest('hex'), 'sha384 wires Transforms/Core vector');
    ok(TOOLS['sha384-hash'].handler('abc').length === 96, 'sha384 hex length 96');
    ok(TOOLS['sha384-hash'].handler.toString().indexOf('sha384') >= 0, 'sha384 manifest delegates'); }
  { var nodeCrypto = require('crypto');
    global.Core = global.Core || {};
    global.Core.md5Bytes = function (b) { return nodeCrypto.createHash('md5').update(Buffer.from(b)).digest('hex'); };
    global.Core.sha1Bytes = function (b) { return nodeCrypto.createHash('sha1').update(Buffer.from(b)).digest('hex'); };
    global.Core.sha256Bytes = function (b) { return nodeCrypto.createHash('sha256').update(Buffer.from(b)).digest('hex'); };
    global.Core.sha384Bytes = function (b) { return nodeCrypto.createHash('sha384').update(Buffer.from(b)).digest('hex'); };
    global.Core.sha512Bytes = function (b) { return nodeCrypto.createHash('sha512').update(Buffer.from(b)).digest('hex'); };
    global.Core.crc32Bytes = function () { return 'd87f7e0c'; };
    var abc = new Uint8Array([97, 98, 99]);
    ok(T.hashBytes('md5-hash', abc) === nodeCrypto.createHash('md5').update('abc').digest('hex'), 'hashBytes md5 routes');
    ok(T.hashBytes('sha1-hash', abc) === nodeCrypto.createHash('sha1').update('abc').digest('hex'), 'hashBytes sha1 routes');
    ok(T.hashBytes('sha256-hash', abc) === nodeCrypto.createHash('sha256').update('abc').digest('hex'), 'hashBytes sha256 routes');
    ok(T.hashBytes('sha384-hash', abc) === nodeCrypto.createHash('sha384').update('abc').digest('hex'), 'hashBytes sha384 routes');
    ok(T.hashBytes('sha512-hash', abc) === nodeCrypto.createHash('sha512').update('abc').digest('hex'), 'hashBytes sha512 routes');
    ok(T.hashBytes('crc32-checksum', abc) === 'd87f7e0c', 'hashBytes crc32 routes');
    ok(T.hashBytes('md5-hash', new Uint8Array(0)) === nodeCrypto.createHash('md5').update('').digest('hex'), 'hashBytes empty file ok'); }
  ok(TOOLS['sri-generator'].placeholder === 'console.log(1)', 'sri placeholder guides first run');
  ok(TOOLS['sri-generator'].params[0].type === 'select', 'sri algorithm is a select');
  { var pb = T.pemToBytes('-----BEGIN CERTIFICATE-----\nMAICAQE=\n-----END CERTIFICATE-----');
    ok(pb.label === 'CERTIFICATE' && pb.bytes.length === 5, 'pemToBytes label + DER length'); }
  { global.Core = global.Core || {}; global.Core.asn1Parse = function () { return { t: 'SEQUENCE' }; };
    var out = T.pemInspect('-----BEGIN CERTIFICATE-----\nMAICAQE=\n-----END CERTIFICATE-----');
    ok(out.indexOf('Label: CERTIFICATE') === 0 && out.indexOf('SEQUENCE') >= 0, 'pemInspect label + tree');
    ok(TOOLS['pem-inspector'].handler.toString().indexOf('pemInspect') >= 0, 'pem manifest delegates to Transforms'); }
  ok(TOOLS['pem-inspector'].placeholder.indexOf('BEGIN CERTIFICATE') >= 0, 'pem placeholder guides first run');
  { global.Core.hmacBytes = function (key, msg) { return require('crypto').createHmac('sha1', Buffer.from(key)).update(Buffer.from(msg)).digest('hex'); };
    ok(T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000).code === '287082', 'totp RFC6238 T=59');
    ok(T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1111111109000).code === '081804', 'totp RFC6238 T=1111111109');
    ok(T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 2000000000000).code === '279037', 'totp RFC6238 T=2000000000');
    ok(T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000, 8).code === '94287082', 'totp RFC6238 8-digit');
    ok(T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000).validFor === 1, 'totp expiry countdown'); }
  ok(TOOLS['totp-generator'].template === 'custom', 'totp is a custom tool');
  { var p1 = TOOLS['passphrase-generator'].genHandler({ words: '6', separator: '-' });
    ok(p1.split('-').length === 6, 'passphrase 6 words hyphen');
    ok(new Set(p1.split('-')).size >= 1, 'passphrase words from list');
    var p2 = TOOLS['passphrase-generator'].genHandler({ words: '4', separator: ' ' });
    ok(p2.split(' ').length === 4, 'passphrase space separator');
    var seen = {};
    for (var pi = 0; pi < 20; pi++) { TOOLS['passphrase-generator'].genHandler({ words: '6', separator: '-' }).split('-').forEach(function (w) { seen[w] = 1; }); }
    ok(Object.keys(seen).length > 6, 'passphrase draws vary (CSPRNG)');
    ok(T.passphraseEntropyBits(6) === 48 && T.passphraseEntropyBits(8) === 64, 'passphrase 8 bits per word');
    ok(T.PASSPHRASE_WORDS.length === 256 && new Set(T.PASSPHRASE_WORDS).size === 256, 'passphrase 256-word list unique');
    ok(TOOLS['passphrase-generator'].genHandler.toString().indexOf('passphraseOpts') >= 0, 'passphrase delegates opts'); }

}


console.log('-- image palette extractor --');
{
  var solid = [];
  for (var si = 0; si < 4; si++) solid.push(255, 0, 0, 255);
  var one = T.extractPalette(solid, 8);
  ok(one.length === 1 && one[0].hex === '#ff0000' && one[0].pct === 100, 'palette solid red single entry');
  var half = [];
  for (var hi = 0; hi < 4; hi++) half.push(255, 0, 0, 255);
  for (var gi = 0; gi < 4; gi++) half.push(0, 128, 0, 255);
  var two = T.extractPalette(half, 8);
  ok(two.length === 2 && two[0].count === 4 && two[1].count === 4, 'palette halves split even');
  ok(two.some(function (c) { return c.hex === '#ff0000'; }) && two.some(function (c) { return c.hex === '#008000'; }), 'palette halves exact hex');
  var capped = T.extractPalette(half, 1);
  ok(capped.length === 1, 'palette maxColors caps output');
  var threw = 0;
  try { T.extractPalette([255, 0, 0], 8); } catch (e) { threw++; }
  try { T.extractPalette([255, 0, 0, 0, 0, 255, 0, 0], 8); } catch (e) { threw++; }
  try { T.extractPalette([], 8); } catch (e) { threw++; }
  ok(threw === 3, 'palette rejects bad + fully-transparent input');
  var pal = TOOLS['image-palette-extractor'];
  ok(pal && pal.template === 'custom' && pal.category === 'image', 'palette manifest registered');
}

console.log('-- http header inspector --');
{
  var hh = 'strict-transport-security: max-age=31536000; includeSubDomains\ncontent-security-policy: default-src \u0027self\u0027\nx-frame-options: DENY\nx-content-type-options: nosniff\nreferrer-policy: no-referrer\nset-cookie: id=1; Secure; HttpOnly; SameSite=Lax\n';
  var hr = TOOLS['http-header-inspector'].handler(hh);
  ok(hr.indexOf('Security: 0 issues') >= 0, 'header-inspector clean run zero issues');
  ok(hr.indexOf('content-security-policy present') >= 0 && hr.indexOf('1 cookie carries Secure') >= 0, 'header-inspector marks present headers');
  var hb = TOOLS['http-header-inspector'].handler('server: nginx/1.2\ncontent-type: text/html\n');
  ok(hb.indexOf('content-security-policy missing') >= 0 && hb.indexOf('hide version banners') >= 0, 'header-inspector flags missing + disclosure');
  var pal2 = TOOLS['http-header-inspector'];
  ok(pal2 && pal2.template === 'transform' && pal2.category === 'network', 'header-inspector manifest registered');
}

console.log('-- user-agent parser --');
{
  var chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
  var cu = TOOLS['user-agent-parser'].handler(chromeUA);
  ok(cu.indexOf('Browser:  Chrome 139.0.0.0 (Blink)') >= 0, 'ua chrome browser+version+engine');
  ok(cu.indexOf('OS:       Windows 10/11') >= 0 && cu.indexOf('Device:   Desktop') >= 0, 'ua chrome os+device');
  var iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  var iu = TOOLS['user-agent-parser'].handler(iosUA);
  ok(iu.indexOf('Browser:  Safari 17.5 (WebKit)') >= 0 && iu.indexOf('OS:       iOS') >= 0 && iu.indexOf('Device:   Mobile') >= 0, 'ua iphone safari+ios+mobile');
  var botUA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  ok(TOOLS['user-agent-parser'].handler(botUA).indexOf('Bot:      Yes') >= 0, 'ua googlebot flagged');
  ok(TOOLS['user-agent-parser'].handler(chromeUA) === T.parseUA(chromeUA), 'user-agent-parser delegates to Transforms');
}

console.log('-- url parser port --');
{
  ok(TOOLS['url-parser'].handler('https://example.com/a?x=1') === T.parseURL('https://example.com/a?x=1', {}), 'url-parser table delegates to Transforms');
  ok(TOOLS['url-parser'].handler('https://example.com/a?x=1', { view: 'json' }) === T.parseURL('https://example.com/a?x=1', { view: 'json' }), 'url-parser json delegates to Transforms');
}

console.log('-- dns lookup (DoH core, no network) --');
{
  var du = T.dohUrl('https://Example.COM/mail', 'mx', 'google');
  ok(du.url === 'https://dns.google/resolve?name=example.com&type=MX', 'dohUrl normalizes + builds google URL');
  var du2 = T.dohUrl('example.com.', 'A', 'cloudflare');
  ok(du2.url.indexOf('https://cloudflare-dns.com/dns-query?name=example.com&type=A') === 0, 'dohUrl cloudflare default');
  var dp = T.dohParse({ Status: 0, Answer: [{ data: '"v=spf1 -all"', TTL: 300 }] }, 'TXT', 'x.com');
  ok(dp.length === 1 && dp[0].data === 'v=spf1 -all' && dp[0].ttl === 300, 'dohParse strips TXT quotes + TTL');
  var dn = TOOLS['dns-lookup'];
  ok(dn && dn.template === 'custom' && dn.category === 'network', 'dns-lookup manifest registered');
}

console.log('-- json badge --');
{
  var bv = T.jsonBadge('validate', true);
  ok(bv.text === '\u2713 Valid JSON' && bv.cls === 'ok', 'badge validate ok');
  var bi = T.jsonBadge('validate', false);
  ok(bi.text === '\u2717 Invalid JSON' && bi.cls === 'bad', 'badge validate bad');
  ok(T.jsonBadge('format', true).text === '\u2713 Formatted', 'badge formatted');
  ok(T.jsonBadge('minify', true).text === '\u2713 Minified', 'badge minified');
  ok(T.jsonBadge('format', false).cls === 'bad' && T.jsonBadge('bogus', true).cls === 'ok', 'badge error + fallback');
}

console.log('-- json to csv flatten --');
{
  ok(TOOLS['json-to-csv'].handler('[{"a":1}]').indexOf('a\n1') >= 0, 'json-to-csv flat legacy');
  var nc = TOOLS['json-to-csv'].handler('{"u":{"n":"Ada"},"t":[1,2]}', {});
  ok(nc.indexOf('u.n') >= 0 && nc.indexOf('Ada') >= 0, 'json-to-csv flattens nested');
  var sc = TOOLS['json-to-csv'].handler('[{"a":1},{"b":2}]', { delimiter: 'semicolon', nested: 'flatten' });
  ok(sc.split('\n')[0] === 'a;b', 'json-to-csv semicolon option');
  var st = TOOLS['json-to-csv'].handler('{"a":{"b":1}}', { nested: 'stringify' });
  ok(st.indexOf('""b""') >= 0, 'json-to-csv stringify option');
}

console.log('-- word diff --');
{
  var w1 = TOOLS['text-diff'].handler('hello world', { compareTo: 'hello brave world', granularity: 'words' });
  ok(w1 === 'hello {+brave +}world', 'word diff marks insertion inline');
  var w2 = TOOLS['text-diff'].handler('the quick brown fox', { compareTo: 'the brown fox', granularity: 'words' });
  ok(w2 === 'the [-quick -]brown fox', 'word diff marks deletion inline');
  var w3 = TOOLS['text-diff'].handler('a\nb', { compareTo: 'a\nc' });
  ok(w3.indexOf('+ c') >= 0, 'line diff stays default');
}

console.log('-- matrix calculator --');
{
  ok(TOOLS['matrix-calculator'].handler('1 2\n3 4', { operation: 'determinant' }) === 'Determinant: -2', 'matrix determinant');
  var mi = TOOLS['matrix-calculator'].handler('1 2\n3 4', { operation: 'inverse' });
  ok(mi.indexOf('-2 1') >= 0 && mi.indexOf('1.5 -0.5') >= 0, 'matrix inverse');
  var mm = TOOLS['matrix-calculator'].handler('1 2\n3 4', { operation: 'multiply', matrixB: '5 6\n7 8' });
  ok(mm.indexOf('19 22') >= 0 && mm.indexOf('43 50') >= 0, 'matrix multiply');
  ok(TOOLS['matrix-calculator'].handler.toString().indexOf('matrixCalcOpts') >= 0, 'matrix delegates opts');
  ok(TOOLS['matrix-calculator'].handler('1 2\n3 4') === T.matrixCalc('1 2\n3 4', '', 'determinant'), 'matrix default determinant');
  var mt = TOOLS['matrix-calculator'];
  ok(mt && mt.template === 'transform' && mt.category === 'math', 'matrix manifest registered');
}

console.log('-- markdown table --');
{
  var t1 = TOOLS['markdown-table-generator'].handler('a,b\n1,2', {});
  ok(t1 === '| a | b |\n|---|---|\n| 1 | 2 |', 'markdown table basic');
  var t2 = TOOLS['markdown-table-generator'].handler('\u0022Bo, Jr\u0022,25', { header: 'none', align: 'center' });
  ok(t2.indexOf('Bo, Jr') >= 0 && t2.indexOf('|:center:|') >= 0 && t2.indexOf('Column 1') >= 0, 'markdown quoted + center + gen header');
  var t3 = TOOLS['markdown-table-generator'];
  ok(t3 && t3.template === 'transform' && t3.category === 'converters', 'markdown table manifest registered');
}

console.log('-- morse timeline --');
{
  var mt = T.morseTimeline('SOS', 20);
  ok(mt.encoded === '... --- ...' && mt.events.length === 9, 'morse SOS 9 events');
  ok(mt.events[0].sym === 'dit' && mt.events[3].sym === 'dah', 'morse dit/dah order');
  ok(Math.abs(mt.total - 1.62) < 0.01, 'morse PARIS total 27 units');
  var mw = T.morseTimeline('A B', 20);
  ok(Math.abs((mw.events[2].t0 - mw.events[1].t1) - 7 * mw.unit) < 1e-9, 'morse 7-unit word gap');
  var mp = TOOLS['morse-code-player'];
  ok(mp && mp.template === 'custom' && mp.category === 'encoding', 'morse player manifest registered');
  var ps = T.morseTimeline('<AR>', 20);
  ok(ps.encoded === '.-.-.' && ps.events.length === 5 && ps.events[4].li === 0, 'morse prosign run-together');
  ok(T.morseTimeline('<SOS>', 20).total < T.morseTimeline('SOS', 20).total, 'morse prosign shorter than spaced');
}

console.log('-- xml formatter --');
{
  var x1 = TOOLS['xml-formatter'].handler('<r><a>1</a></r>', {});
  ok(x1 === '<r>\n  <a>1</a>\n</r>', 'xml formatter inline text');
  var x2 = TOOLS['xml-formatter'].handler('<r><![CDATA[<x>]]></r>', { indent: 'tab' });
  ok(x2.indexOf('<![CDATA[<x>]]>') >= 0, 'xml CDATA verbatim');
  var x3 = TOOLS['xml-formatter'];
  ok(x3 && x3.template === 'transform' && x3.category === 'code', 'xml formatter manifest registered');
}

console.log('-- wordcount --');
{
  var wc = T.wordCount('Apple apple banana');
  ok(wc.apple === 2 && wc.banana === 1, 'wordCount frequency map (case-insensitive)');
  ok(T.textStats('hi').words === 1, 'textStats structured words');
  ok(TOOLS['word-counter'].handler.toString().indexOf('wordReport') >= 0, 'word-counter delegates');
  ok(TOOLS['word-counter'].handler('a b c').indexOf('Words:       3') >= 0, 'word-counter counts via delegate');
}
console.log('-- case-slug --');
{
  ok(TOOLS['case-converter'].handler('foo BAR baz', {style:'snake'}) === 'foo_bar_baz', 'case snake vector');
  ok(TOOLS['case-converter'].handler('foo BAR baz', {style:'kebab'}) === 'foo-bar-baz', 'case kebab vector');
  ok(TOOLS['case-converter'].handler('x') === 'x', 'case default lower');
  ok(TOOLS['slug-generator'].handler('Hello, World!') === 'hello-world', 'slug vector');
  ok(TOOLS['case-converter'].handler.toString().indexOf('caseConvertOpts') >= 0, 'case delegates opts');
  ok(TOOLS['slug-generator'].handler.toString().indexOf('slugify') >= 0, 'slug delegates');
}
console.log('-- json-escape --');
{
  var bs = String.fromCharCode(92);
  ok(TOOLS['json-escape'].handler('a' + bs) === 'a' + bs + bs, 'json-escape backslash');
  ok(TOOLS['json-unescape'].handler('a' + bs + 'n') === 'a' + String.fromCharCode(10), 'json-unescape newline');
  ok(TOOLS['json-escape'].handler.toString().indexOf('jsonEscape') >= 0, 'json-escape delegates');
  ok(TOOLS['json-unescape'].handler.toString().indexOf('jsonUnescape') >= 0, 'json-unescape delegates');
}
console.log('-- entropy --');
{
  var e1 = TOOLS['password-entropy'].handler('abc123');
  ok(e1.indexOf('Char Pool:  36 chars') >= 0, 'entropy pool line');
  ok(e1.indexOf('Strength:') >= 0, 'entropy strength line');
  ok(TOOLS['password-entropy'].handler.toString().indexOf('passwordEntropy') >= 0, 'entropy delegates');
}
console.log('-- rot --');
{
  ok(TOOLS['rot13'].handler('Hello') === 'Uryyb', 'rot13 vector');
  ok(TOOLS['rot13'].handler(TOOLS['rot13'].handler('Hello, World!')) === 'Hello, World!', 'rot13 involution');
  ok(TOOLS['rot47'].handler('Hello') === 'w6==@', 'rot47 vector');
  ok(TOOLS['rot13'].handler.toString().indexOf('rot13') >= 0, 'rot13 delegates');
  ok(TOOLS['rot47'].handler.toString().indexOf('rot47') >= 0, 'rot47 delegates');
}
console.log('-- morse --');
{
  ok(TOOLS['morse-encode'].handler('SOS') === '... --- ...', 'morse encode SOS vector');
  ok(TOOLS['morse-decode'].handler('... --- ...') === 'SOS', 'morse decode SOS vector');
  ok(TOOLS['morse-encode'].handler.toString().indexOf('morseEncode') >= 0, 'morse-encode delegates');
  ok(TOOLS['morse-decode'].handler.toString().indexOf('morseDecode') >= 0, 'morse-decode delegates');
}
console.log('-- readability --');
{
  var r1 = TOOLS['readability-analyzer'].handler('The cat sat on the mat. It was happy.');
  ok(r1.indexOf('Flesch Reading Ease: 108.3') >= 0 && r1.indexOf('Sentences: 2') >= 0, 'readability easy text scores');
  var r2 = TOOLS['readability-analyzer'].handler('The electrochemical characterization demonstrates extraordinary photosensitivity.');
  ok(r2.indexOf('Hardest words') >= 0 && r2.indexOf('photosensitivity') >= 0, 'readability flags hard words');
  var r3 = TOOLS['readability-analyzer'];
  ok(r3 && r3.template === 'transform' && r3.category === 'text', 'readability manifest registered');
}

console.log('-- unicode-inspector --');
{
  var u1 = TOOLS['unicode-inspector'].handler('A', {});
  ok(u1.indexOf('U+0041') >= 0, 'unicode A code point');
  ok(u1.indexOf('dec 65') >= 0, 'unicode A decimal');
  ok(u1.indexOf('UTF-8 0x41') >= 0, 'unicode A utf8 byte');
  var u2 = TOOLS['unicode-inspector'].handler(String.fromCharCode(0xE9), {});
  ok(u2.indexOf('U+00E9') >= 0, 'unicode e-acute code point');
  ok(u2.indexOf('0xC3 0xA9') >= 0, 'unicode e-acute two utf8 bytes');
  var u3 = TOOLS['unicode-inspector'].handler(String.fromCharCode(0xD83D, 0xDE00), {});
  ok(u3.indexOf('U+1F600') >= 0, 'unicode emoji astral code point');
  ok(u3.indexOf('0xF0 0x9F 0x98 0x80') >= 0, 'unicode emoji four utf8 bytes');
  var u4 = TOOLS['unicode-inspector'].handler(String.fromCharCode(0xD800), {});
  ok(u4.indexOf('Lone surrogates: 1') >= 0, 'unicode lone surrogate flagged');
  ok(u4.indexOf('none') >= 0, 'unicode lone surrogate has no utf8');
  var u5 = TOOLS['unicode-inspector'];
  ok(u5.template === 'transform', 'unicode manifest template');
  ok(u5.category === 'text', 'unicode manifest category');
}

console.log('-- json-path --');
{
  var jo = { store: { book: [{ title: 'T1' }, { title: 'T2' }] } };
  var jj = JSON.stringify(jo);
  var j1 = TOOLS['json-path-extractor'].handler(jj, { path: '$.store.book[0].title' });
  ok(j1.indexOf('T1') >= 0, 'jsonpath nested title');
  var j2 = TOOLS['json-path-extractor'].handler('[10,20]', { path: '$[1]' });
  ok(j2 === '20', 'jsonpath array index');
  var j3 = TOOLS['json-path-extractor'].handler('[[1],[2]]', { path: '$[*][0]' });
  ok(j3.charAt(0) === '[', 'jsonpath wildcard returns array');
  ok(j3.indexOf('1') >= 0, 'jsonpath wildcard first value');
  ok(j3.indexOf('2') >= 0, 'jsonpath wildcard second value');
  var j4 = TOOLS['json-path-extractor'].handler('[10,20]', { path: '$' });
  ok(j4.indexOf('10') >= 0, 'jsonpath root returns document');
  ok(TOOLS['json-path-extractor'].handler.toString().indexOf('jsonPathOpts') >= 0, 'jsonpath delegates opts');
  ok(TOOLS['json-path-extractor'].handler('[10,20]') === T.jsonPath('[10,20]', '$'), 'jsonpath default root');
  var j5 = TOOLS['json-path-extractor'];
  ok(j5.template === 'transform', 'jsonpath manifest template');
  ok(j5.category === 'json', 'jsonpath manifest category');
}

console.log('-- curl-to-fetch --');
{
  var SQ = String.fromCharCode(39);
  var c1 = TOOLS['curl-to-fetch'].handler('curl https://example.com', {});
  ok(c1.indexOf('fetch(') >= 0, 'curl basic fetch call');
  ok(c1.indexOf('https://example.com') >= 0, 'curl basic url kept');
  ok(c1.indexOf('await') >= 0, 'curl async default');
  var c2 = TOOLS['curl-to-fetch'].handler('curl -X POST https://api.example.com/a -H ' + SQ + 'X-A: 1' + SQ + ' -d ' + SQ + 'a=1' + SQ, {});
  ok(c2.indexOf('POST') >= 0, 'curl method mapped');
  ok(c2.indexOf('X-A') >= 0, 'curl header mapped');
  ok(c2.indexOf('a=1') >= 0, 'curl body mapped');
  var c3 = TOOLS['curl-to-fetch'].handler('curl -u ada:pw https://h.example.com', {});
  ok(c3.indexOf('Basic ') >= 0, 'curl basic auth mapped');
  var c4 = TOOLS['curl-to-fetch'].handler('curl https://example.com', { style: 'promise' });
  ok(c4.indexOf('.then(') >= 0, 'curl promise style');
  ok(TOOLS['curl-to-fetch'].handler.toString().indexOf('curlToFetchOpts') >= 0, 'curl delegates opts');
  ok(TOOLS['curl-to-fetch'].handler('curl https://example.com') === T.curlToFetch('curl https://example.com', 'async'), 'curl default async');
  var c5 = TOOLS['curl-to-fetch'];
  ok(c5.template === 'transform', 'curl manifest template');
  ok(c5.category === 'network', 'curl manifest category');
}

console.log('-- env-to-json --');
{
  var e1 = TOOLS['env-to-json'].handler('A=1\nB=hello\nEMPTY=', {});
  ok(e1.indexOf('1') >= 0, 'env basic pair');
  ok(e1.indexOf('hello') >= 0, 'env spaced value');
  ok(e1.indexOf('EMPTY') >= 0, 'env empty value kept');
  var e2 = TOOLS['env-to-json'].handler('# c\nexport X=9', {});
  ok(e2.indexOf('9') >= 0, 'env export prefix');
  var e3 = TOOLS['env-to-json'];
  ok(e3.template === 'transform', 'env manifest template');
  ok(e3.category === 'converters', 'env manifest category');
  var f1 = TOOLS['filename-sanitizer'].handler('my file?.txt', {});
  ok(f1 === 'my_file.txt', 'sanitize delegates identically');
}

console.log('-- qr-decode (dependency-free, v1-v6) --');
{
  var bits = '111111100101101111111100000101101001000001101110101100101011101101110100101001011101101110101000101011101100000101001101000001111111101010101111111000000001111100000000110100110110001110110111010010010001101000101001111110110000001111111010111000100001101110100000101110001000000001001000010110111111101010010110110100000100101110010001101110100101001001101101110101011000001011101110100110100110101100000101000011010000111111101001100111110'.split('').map(function(c){return +c;});
  var out = global.QrDecode.decodeMatrix(bits, 21);
  ok(out.text === 'QR-TEST' && out.version === 1, 'qr v1-L matrix exact text');
  var sc = 4, qz = 4, dim = 21, W = (dim + qz * 2) * sc, data = new Uint8ClampedArray(W * W * 4), x, y;
  for (y = 0; y < W; y++) for (x = 0; x < W; x++) { var mx = Math.floor(x / sc) - qz, my = Math.floor(y / sc) - qz, v = 255; if (mx >= 0 && my >= 0 && mx < dim && my < dim) v = bits[my * dim + mx] ? 0 : 255; var o = (y * W + x) * 4; data[o] = data[o+1] = data[o+2] = v; data[o+3] = 255; }
  var px = global.QrDecode.decode({ width: W, height: W, data: data });
  ok(px.text === 'QR-TEST', 'qr pixel path decodes synthetic screenshot');
  ok(px.version === 1 && px.ecl === 'L' && typeof px.mask === 'number', 'qr pixel exposes version/ecl/mask for tool meta');
}

console.log('-- shared UI async pending --');
pending.push((async () => {
  var keepApp = global.App;
  var seen = [];
  function mkEl(tag, attrs) {
    var el = { tag: tag, attrs: attrs || {}, children: [], listeners: {}, value: '', text: '',
      appendChild: function (c) { this.children.push(c); return c; },
      addEventListener: function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } };
    Object.defineProperty(el, 'childNodes', { get: function () { return this.children; } });
    Object.defineProperty(el, 'innerHTML', { get: function () { return ''; }, set: function () { this.children = []; } });
    Array.prototype.slice.call(arguments, 2).forEach(function (k) {
      if (k === null || k === undefined) return;
      if (typeof k === 'string') el.text += k; else el.children.push(k);
    });
    if (el.attrs && el.attrs.text) el.text = el.attrs.text;
    seen.push(el);
    return el;
  }
  global.App = {
    el: function () { return mkEl.apply(null, arguments); },
    debounce: function (fn) { return function () { return fn.apply(this, arguments); }; },
    outputBox: function (out, err) { return { marker: 'outputBox', output: out, error: err }; },
    icon: function () { return { marker: 'icon' }; }
  };
  eval(require('fs').readFileSync('js/tools/transform.js', 'utf8'));
  eval(require('fs').readFileSync('js/tools/generator.js', 'utf8'));
  var TUI = window.TransformToolUI, GUI = window.GeneratorToolUI;
  var kids = function (e) { return Array.isArray(e.children) ? e.children : []; };
  var walk = function (root, pick) { var r = []; (function w(e) { if (pick(e)) r.push(e); kids(e).forEach(function (c) { if (c && typeof c === 'object') w(c); }); })(root); return r; };
  var texts = function (root) { return walk(root, function (e) { return !!e.text; }).map(function (e) { return e.text; }); };
  var boxes = function (root) { return walk(root, function (e) { return e.marker === 'outputBox'; }); };
  var tick = function () { return new Promise(function (r) { setTimeout(r, 5); }); };
  var lastTa = function () { return seen.filter(function (e) { return e.tag === 'textarea'; }).pop(); };
  var fire = function (ta) { ta.listeners.input.slice().forEach(function (f) { f(); }); };
  var W = 'Working\u2026';
  var r0 = TUI({ handler: function (sq) { return 'OUT:' + sq; }, params: [] });
  var t0 = lastTa(); t0.value = 'hi'; fire(t0);
  ok(boxes(r0).length === 1 && boxes(r0)[0].output === 'OUT:hi', 'transform sync output renders, no pending');
  var dA = {}, calls = 0;
  dA.p = new Promise(function (res) { dA.resolve = res; });
  var r1 = TUI({ handler: function () { calls++; return calls === 1 ? dA.p : 'B-OUT'; }, params: [] });
  var t1 = lastTa(); t1.value = 'A'; fire(t1);
  ok(texts(r1).indexOf(W) >= 0, 'transform async shows Working marker');
  t1.value = 'B'; fire(t1);
  ok(boxes(r1).length === 1 && boxes(r1)[0].output === 'B-OUT', 'transform sync supersedes pending hunt');
  dA.resolve('A-LATE'); await tick();
  ok(boxes(r1).length === 1 && boxes(r1)[0].output === 'B-OUT', 'transform stale resolve ignored');
  var dC = {};
  dC.p = new Promise(function (res) { dC.resolve = res; });
  var r2 = TUI({ handler: function () { return dC.p; }, params: [] });
  var t2 = lastTa(); t2.value = 'x'; fire(t2);
  t2.value = '   '; fire(t2);
  ok(texts(r2).indexOf(W) < 0 && boxes(r2).length === 0, 'transform clear empties pending hunt');
  dC.resolve('LATE'); await tick();
  ok(boxes(r2).length === 0, 'transform late resolve after clear ignored');
  var dE = {};
  dE.p = new Promise(function (res, rej) { dE.reject = rej; });
  var r3 = TUI({ handler: function () { return dE.p; }, params: [] });
  var t3 = lastTa(); t3.value = 'z'; fire(t3);
  dE.reject(new Error('boom')); await tick(); await tick();
  ok(boxes(r3).length === 1 && boxes(r3)[0].error === 'boom', 'transform async reject shows error');
  var g1 = {}, g2 = {}, gn = 0;
  g1.p = new Promise(function (res) { g1.resolve = res; });
  g2.p = new Promise(function (res) { g2.resolve = res; });
  var gr = GUI({ genHandler: function () { gn++; return gn === 1 ? g1.p : g2.p; }, params: [] });
  ok(texts(gr).indexOf(W) >= 0, 'generator async shows Working marker');
  var regen = seen.filter(function (e) { return e.tag === 'button' && e.attrs && e.attrs.onclick; }).pop();
  regen.attrs.onclick();
  g1.resolve('G1-LATE'); await tick();
  ok(texts(gr).indexOf('G1-LATE') < 0, 'generator stale resolve ignored');
  g2.resolve('G2'); await tick();
  ok(boxes(gr).length === 1 && boxes(gr)[0].output === 'G2', 'generator fresh resolve renders');
  global.App = keepApp;
})());
Promise.all(pending).then(() => {
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});
