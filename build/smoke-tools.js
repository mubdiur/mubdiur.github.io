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
  ok(TOOLS['roman-converter'].handler('2026') === 'MMXXVI', 'roman decimal to roman');
  ok(TOOLS['roman-converter'].handler('MCMXCIV') === '1994', 'roman roman to decimal');
  ok(TOOLS['roman-converter'].handler('xiv') === '14', 'roman lowercase accepted');
  ok(TOOLS['roman-converter'].handler('44') === T.romanEncode(44), 'roman-converter delegates encode');
  ok(T.romanDecode(T.romanEncode(1994)) === 1994, 'roman round-trip');
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
  ok(JSON.parse(TOOLS['csv-to-json'].handler('name;age\nAda;30')).length === 1, 'csv-to-json auto semicolon');
  ok(TOOLS['csv-transposer'].handler.toString().indexOf('csvTranspose') >= 0, 'transposer delegates single source');
  ok(TOOLS['csv-transposer'].handler('a,b\nc,d', {}) === 'a,c\nb,d', 'transposer square');
  ok(TOOLS['jsonl-to-json'].handler.toString().indexOf('jsonlToJSON') >= 0, 'jsonl delegates single source');
  ok(TOOLS['jsonl-duplicate-finder'].handler.toString().indexOf('jsonlDupes') >= 0, 'jdupes delegates single source');
  ok(TOOLS['jsonl-duplicate-finder'].handler('{"a":1}\n{"a":1}\n{"a":2}', {}).includes('\n2,'), 'jdupes whole doc');
  ok(TOOLS['jsonl-sorter'].handler.toString().indexOf('jsonlSort') >= 0, 'jsorter delegates single source');
  var _jq = String.fromCharCode(34);
  ok(TOOLS['jsonl-sorter'].handler('{'+_jq+'a'+_jq+':2}\n{'+_jq+'a'+_jq+':1}', {}) === '{'+_jq+'a'+_jq+':1}\n{'+_jq+'a'+_jq+':2}', 'jsorter whole doc asc');
  ok(TOOLS['jsonl-sorter'].handler('{'+_jq+'n'+_jq+':'+_jq+'b'+_jq+','+_jq+'v'+_jq+':1}\n{'+_jq+'n'+_jq+':'+_jq+'a'+_jq+','+_jq+'v'+_jq+':2}', { key: 'n' }) === '{'+_jq+'n'+_jq+':'+_jq+'a'+_jq+','+_jq+'v'+_jq+':2}\n{'+_jq+'n'+_jq+':'+_jq+'b'+_jq+','+_jq+'v'+_jq+':1}', 'jsorter key asc');
  ok(TOOLS['jsonl-sorter'].handler('{'+_jq+'v'+_jq+':10}\n{'+_jq+'v'+_jq+':2}', { key: 'v' }) === '{'+_jq+'v'+_jq+':2}\n{'+_jq+'v'+_jq+':10}', 'jsorter numeric aware');
  ok(TOOLS['jsonl-sorter'].handler('{'+_jq+'d'+_jq+':'+_jq+'2024-12-01'+_jq+'}\n{'+_jq+'d'+_jq+':'+_jq+'2024-3-2'+_jq+'}', { key: 'd' }) === '{'+_jq+'d'+_jq+':'+_jq+'2024-3-2'+_jq+'}\n{'+_jq+'d'+_jq+':'+_jq+'2024-12-01'+_jq+'}', 'jsorter date aware');
  ok(TOOLS['jsonl-sorter'].handler('{'+_jq+'a'+_jq+':1}\n{'+_jq+'a'+_jq+':2}', { order: 'desc' }) === '{'+_jq+'a'+_jq+':2}\n{'+_jq+'a'+_jq+':1}', 'jsorter desc');
  ok((function(){ try { TOOLS['jsonl-sorter'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'jsorter empty throws');
  ok(TOOLS['pii-redactor'].handler.toString().indexOf('redactPII') >= 0, 'redactor delegates single source');
  ok(TOOLS['pii-redactor'].handler('Contact ada@test.com now', {}) === 'Contact [EMAIL] now\n\nRedacted: 1 email, 0 phones, 0 IPs, 0 cards', 'redactor email plus count');
  ok(TOOLS['pii-redactor'].handler('Call 555-123-4567 today', {}) === 'Call [PHONE] today\n\nRedacted: 0 emails, 1 phone, 0 IPs, 0 cards', 'redactor phone plus count');
  ok(TOOLS['pii-redactor'].handler('ip 10.0.0.5 and 999.9.9.9 kept', {}) === 'ip [IP] and 999.9.9.9 kept\n\nRedacted: 0 emails, 0 phones, 1 IP, 0 cards', 'redactor validates octets');
  ok(TOOLS['pii-redactor'].handler('pay 4111 1111 1111 1111 now', {}) === 'pay [CARD] now\n\nRedacted: 0 emails, 0 phones, 0 IPs, 1 card', 'redactor Luhn card');
  ok(TOOLS['pii-redactor'].handler('pay 4111 1111 1111 1112 now', {}) === 'pay 4111 1111 1111 1112 now\n\nRedacted: 0 emails, 0 phones, 0 IPs, 0 cards', 'redactor bad Luhn untouched');
  ok(TOOLS['pii-redactor'].handler('ada@test.com', { email: false }) === 'ada@test.com\n\nRedacted: 0 emails, 0 phones, 0 IPs, 0 cards', 'redactor opt-out keeps email');
  ok((function(){ try { TOOLS['pii-redactor'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'redactor empty throws');
  ok(TOOLS['ini-to-json'].handler.toString().indexOf('iniToJSON') >= 0, 'ini delegates single source');
  ok(TOOLS['ini-to-xml'].handler('[server]\nhost = example.com') === T.iniToXML('[server]\nhost = example.com'), 'ini-to-xml delegates to Transforms');
  ok(TOOLS['ini-to-markdown'].handler.toString().indexOf('iniToMarkdown') >= 0, 'ini-to-markdown delegates');
  ok(TOOLS['ini-to-markdown'].handler('[server]\nhost = h\nport = 1', {}).indexOf('| h | 1 |') >= 0, 'ini-to-markdown row');
  ok(TOOLS['ini-to-markdown'].handler('[server]\nhost = h', { align: 'center' }).indexOf(':center:') >= 0, 'ini-to-markdown align opt');
  ok(TOOLS['ini-to-csv'].handler.toString().indexOf('iniToCSV') >= 0, 'ini-to-csv delegates');
  ok(TOOLS['ini-to-csv'].handler('[server]\nhost = h', {}) === 'server.host\nh', 'ini-to-csv row');
  ok(TOOLS['ini-to-csv'].handler('g = 1\n[s]\nk = v', {}).indexOf('s.k') >= 0, 'ini-to-csv global keys');
  ok(TOOLS['ini-to-csv'].handler('[s]\nk = v\nj = w', { delimiter: 'semicolon' }) === 's.k;s.j\nv;w', 'ini-to-csv delim opt');
  ok(TOOLS['ini-to-toml'].handler.toString().indexOf('iniToTOML') >= 0, 'ini-to-toml delegates');
  ok(TOOLS['ini-to-toml'].handler('[server]\nhost = h') === '[server]\nhost = "h"', 'ini-to-toml row');
  ok(TOOLS['ini-to-toml'].handler('g = 1\n[s]\nk = v').indexOf('[s]') >= 0, 'ini-to-toml global keys');
  ok(JSON.parse(T.tomlToJSON(TOOLS['ini-to-toml'].handler('[server]\nhost = h'))).server.host === 'h', 'ini-to-toml round trip');
  ok(TOOLS['ini-to-yaml'].handler.toString().indexOf('iniToYAML') >= 0, 'ini-to-yaml delegates');
  ok(TOOLS['ini-to-yaml'].handler('[server]\nhost = h') === 'server:\n  host: h', 'ini-to-yaml row');
  ok(TOOLS['ini-to-yaml'].handler('g = 1\n[s]\nk = v').indexOf('k: v') >= 0, 'ini-to-yaml global keys');
  ok(JSON.parse(T.yamlToJSON(TOOLS['ini-to-yaml'].handler('[server]\nhost = h'))).server.host === 'h', 'ini-to-yaml round trip');
  ok(TOOLS['ini-to-xml'].handler('[server]\nhost = example.com\nport = 8080').indexOf('<host>example.com</host>') >= 0, 'ini-to-xml section nests');
  ok(TOOLS['ini-to-xml'].handler('g = 1\n[s]\nk = v').indexOf('<g>1</g>') >= 0, 'ini-to-xml global keys');
  ok(JSON.parse(TOOLS['ini-to-json'].handler('[server]\nhost = example.com\nport = 8080')).server.port === '8080', 'ini section keys');
  ok(JSON.parse(TOOLS['ini-to-json'].handler('g = 1\n[s]\nk = v')).g === '1', 'ini global keys stay top-level');
  ok(JSON.parse(TOOLS['ini-to-json'].handler('; c\n# c2\n[s]\nk = a;b')).s.k === 'a;b', 'ini comments skip semicolons kept');
  ok(JSON.parse(TOOLS['ini-to-json'].handler('[s]\nk: v')).s.k === 'v', 'ini colon separator');
  ok(JSON.parse(TOOLS['ini-to-json'].handler('[a]\nk = 1\n[a]\nj = 2')).a.j === '2', 'ini repeat sections merge');
  ok((function(){ try { TOOLS['ini-to-json'].handler('[s]\nk = 1\nk = 2'); return false; } catch (e) { return /Line 3/.test(e.message); } })(), 'ini dup key carries line');
  ok((function(){ try { TOOLS['ini-to-json'].handler('   '); return false; } catch (e) { return true; } })(), 'ini empty throws');
  ok(TOOLS['xml-to-yaml'].handler.toString().indexOf('xmlToYAML') >= 0, 'xyaml delegates single source');
  ok(TOOLS['xml-to-json'].handler.toString().indexOf('xmlToJsonDoc') >= 0, 'xjson delegates shared core');
  ok(TOOLS['xml-to-yaml'].handler('<r><a>1</a><b>2</b></r>') === 'r:\n  a: ' + _jq + '1' + _jq + '\n  b: ' + _jq + '2' + _jq, 'xyaml map vector');
  ok(TOOLS['xml-to-yaml'].handler('<r><i>1</i><i>2</i></r>').indexOf('- ' + _jq + '1' + _jq) >= 0, 'xyaml repeats sequence');
  ok(TOOLS['xml-to-yaml'].handler('<r><a href="x">t</a></r>').indexOf(_jq + '#text' + _jq) >= 0, 'xyaml hashes quoted');
  ok(JSON.parse(TOOLS['xml-to-json'].handler('<root><a>1</a><a>2</a></root>')).root.a.join(',') === '1,2', 'xjson repeats array');
  ok(JSON.parse(TOOLS['xml-to-json'].handler('<r id="7"><v>x</v></r>')).r['@id'] === '7', 'xjson attrs');
  ok(JSON.parse(TOOLS['xml-to-json'].handler('<r><a>&lt;&amp;&gt;</a></r>')).r.a === '<&>', 'xjson entities');
  ok(JSON.parse(TOOLS['xml-to-json'].handler('<r><a><![CDATA[x < y]]></a></r>')).r.a === 'x < y', 'xjson cdata');
  ok((function(){ try { TOOLS['xml-to-yaml'].handler('<a><b></a>'); return false; } catch (e) { return true; } })(), 'xyaml mismatch throws');
  ok((function(){ try { TOOLS['xml-to-json'].handler('   '); return false; } catch (e) { return true; } })(), 'xjson empty throws');
  ok(TOOLS['duration-calculator'].handler.toString().indexOf('durationCalc') >= 0, 'durcalc delegates single source');
  ok(TOOLS['duration-calculator'].handler('1h30m') === '1h30m = 5400s\nTotal = 5400s = 90min = 1.5h', 'durcalc jammed vector');
  ok(TOOLS['duration-calculator'].handler('-30m' + '\n' + '1h').indexOf('Total = 1800s = 30min = 0.5h') >= 0, 'durcalc signed sum');
  ok(TOOLS['duration-calculator'].handler('1:30:00').indexOf('Total = 5400s') >= 0, 'durcalc clock vector');
  ok(TOOLS['duration-calculator'].handler('500ms').indexOf('500ms') >= 0, 'durcalc millis vector');
  ok((function(){ try { TOOLS['duration-calculator'].handler('1:99'); return false; } catch (e) { return /Line 1/.test(e.message); } })(), 'durcalc bad clock throws');
  ok((function(){ try { TOOLS['duration-calculator'].handler('   '); return false; } catch (e) { return true; } })(), 'durcalc empty throws');
  ok(TOOLS['duration-calculator'].handler('@2024-01-01' + '\n' + '@2024-01-15').indexOf('Total = 1209600s = 20160min = 336h = 14d') >= 0, 'durcalc date gap');
  ok(TOOLS['duration-calculator'].handler('@2024-01-01' + '\n' + '@2024-01-15').indexOf('(anchor)') >= 0, 'durcalc anchor marker');
  ok(TOOLS['duration-calculator'].handler('@2024-01-01' + '\n' + '@2024-01-02' + '\n' + '1h').indexOf('Total = 90000s') >= 0, 'durcalc gap plus duration');
  ok(TOOLS['duration-calculator'].handler('@2024-01-01' + '\n' + '-@2024-01-15').indexOf('Total = -1209600s') >= 0, 'durcalc negated gap');
  ok((function(){ try { TOOLS['duration-calculator'].handler('@not-a-date'); return false; } catch (e) { return /Line 1/.test(e.message); } })(), 'durcalc bad instant carries line');
  ok(TOOLS['jsonl-stats'].handler.toString().indexOf('jsonlStats') >= 0, 'jstats delegates single source');
  ok(TOOLS['jsonl-stats'].handler('{"a":1}' + '\n' + '{"a":2}').indexOf('rows = 2') === 0, 'jstats row count');
  ok(TOOLS['jsonl-stats'].handler('{"a":1,"b":"x"}' + '\n' + '{"a":9}').indexOf('min=1 max=9 mean=5') >= 0, 'jstats numeric range');
  ok(TOOLS['jsonl-stats'].handler('{"b":"x"}' + '\n' + '{"b":"y"}').indexOf('distinct=2') >= 0, 'jstats distinct strings');
  ok((function(){ try { TOOLS['jsonl-stats'].handler('{"a":1}' + '\n' + 'nope'); return false; } catch (e) { return /Line 2/.test(e.message); } })(), 'jstats bad line carries number');
  ok((function(){ try { TOOLS['jsonl-stats'].handler('   '); return false; } catch (e) { return true; } })(), 'jstats empty throws');
  ok(TOOLS['date-difference'].handler.toString().indexOf('dateDiff') >= 0, 'datediff delegates single source');
  ok(TOOLS['date-difference'].handler('2024-01-01' + '\n' + '2024-01-02').indexOf('Total = 1d = 24h = 1440min = 86400s') >= 0, 'datediff exact totals');
  ok(TOOLS['date-difference'].handler('2000-01-01' + '\n' + '2026-10-13').indexOf('Calendar = 26y 9mo 12d') >= 0, 'datediff calendar split');
  ok(TOOLS['date-difference'].handler('2024-01-02' + '\n' + '2024-01-01').indexOf('Calendar = -1d') >= 0, 'datediff reversed sign');
  ok(TOOLS['date-difference'].handler('0' + '\n' + '86400').indexOf('Total = 1d = 24h') >= 0, 'datediff epoch pair');
  ok((function(){ try { TOOLS['date-difference'].handler('nope'); return false; } catch (e) { return /Line 1/.test(e.message); } })(), 'datediff bad date carries line');
  ok((function(){ try { TOOLS['date-difference'].handler('   '); return false; } catch (e) { return true; } })(), 'datediff empty throws');
  ok(TOOLS['jsonl-to-csv'].handler.toString().indexOf('jsonlToCSV') >= 0, 'jcsv delegates single source');
  ok(TOOLS['jsonl-to-xml'].handler.toString().indexOf('jsonlToXML') >= 0, 'jsonl-to-xml delegates');
  ok(TOOLS['jsonl-to-yaml'].handler.toString().indexOf('jsonlToYAML') >= 0, 'jsonl-to-yaml delegates');
  ok(TOOLS['jsonl-to-yaml'].handler('1\n2').indexOf('- 1') >= 0, 'jsonl-to-yaml seq');
  ok(TOOLS['jsonl-to-yaml'].handler('1\n2').indexOf('- 2') >= 0, 'jsonl-to-yaml second doc');
  ok(TOOLS['jsonl-to-toml'].handler.toString().indexOf('jsonlToTOML') >= 0, 'jsonl-to-toml delegates');
  ok(TOOLS['jsonl-to-toml'].handler('{"a":1}') === 'a = 1', 'jsonl-to-toml single');
  ok(TOOLS['jsonl-to-toml'].handler('{"a":1}\n{"a":2}') === '[[docs]]\na = 1\n[[docs]]\na = 2', 'jsonl-to-toml wraps docs');
  ok(JSON.parse(T.tomlToJSON(TOOLS['jsonl-to-toml'].handler('{"a":1}\n{"a":2}'))).docs.length === 2, 'jsonl-to-toml round trip');
  ok(TOOLS['jsonl-to-xml'].handler('1\n2').indexOf('<root>1</root>') >= 0, 'jsonl-to-xml repeats');
  ok(TOOLS['jsonl-to-xml'].handler('1\n2').indexOf('<root>2</root>') >= 0, 'jsonl-to-xml second doc');
  ok(T.jsonlToMarkdown('{"a":1}' + '\n' + '{"a":2}') === '| a |' + '\n' + '|---|' + '\n' + '| 1 |' + '\n' + '| 2 |', 'jsonl-md basic');
  ok(T.jsonlToMarkdown('{"a":1,"n":{"x":5}}' + '\n' + '{"b":2}') === '| a | n.x | b |' + '\n' + '|---|---|---|' + '\n' + '| 1 | 5 |  |' + '\n' + '|  |  | 2 |', 'jsonl-md union flatten');
  ok(T.jsonlToMarkdown('{"n":{"x":5}}', {nested:'stringify'}) === '| n |' + '\n' + '|---|' + '\n' + '| {"x":5} |', 'jsonl-md stringify');
  ok(T.jsonlToMarkdown('{"a":1}', {align:'center'}).indexOf(':center:') >= 0, 'jsonl-md center');
  ok(TOOLS['jsonl-to-markdown'].handler.toString().indexOf('jsonlToMarkdown') >= 0, 'jsonl-md delegates');

  ok(TOOLS['jsonl-to-csv'].handler('{"a":1}' + '\n' + '{"a":2}', {}) === 'a\n1\n2', 'jcsv rows vector');
  ok(TOOLS['jsonl-to-csv'].handler('{"b":"y,z"}', {}) === 'b\n"y,z"', 'jcsv quoting via shared core');
  ok((function(){ try { TOOLS['jsonl-to-csv'].handler('{"a":1}' + '\n' + 'nope', {}); return false; } catch (e) { return /Line 2/.test(e.message); } })(), 'jcsv bad line carries number');
  ok((function(){ try { TOOLS['jsonl-to-csv'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'jcsv empty throws');
  ok(TOOLS['jsonl-pivot'].handler.toString().indexOf('jsonlPivot') >= 0, 'jpivot delegates single source');
  ok(TOOLS['jsonl-pivot'].handler('{"m":"a"}' + '\n' + '{"m":"a"}' + '\n' + '{"m":"b"}', { key: 'm' }) === 'count,key\n2,a\n1,b', 'jpivot count vector');
  ok(TOOLS['jsonl-pivot'].handler('{"m":"a","v":1}' + '\n' + '{"m":"a","v":3}' + '\n' + '{"m":"b","v":10}', { key: 'm', value: 'v', agg: 'sum' }) === 'sum,key\n4,a\n10,b', 'jpivot sum vector');
  ok(TOOLS['jsonl-pivot'].handler('{"m":"a","v":1}' + '\n' + '{"m":"a","v":3}', { key: 'm', value: 'v', agg: 'avg' }) === 'avg,key\n2,a', 'jpivot avg vector');
  ok(TOOLS['jsonl-pivot'].handler('{"b":2,"a":1}' + '\n' + '{"a":1,"b":2}', {}).indexOf('2,"{""a"":1,""b"":2}"') >= 0, 'jpivot whole-doc canonical grouping');
  ok((function(){ try { TOOLS['jsonl-pivot'].handler('{"a":1}' + '\n' + 'nope', { key: 'm' }); return false; } catch (e) { return /Line 2/.test(e.message); } })(), 'jpivot bad line carries number');
  ok((function(){ try { TOOLS['jsonl-pivot'].handler('{"a":1}' + '\n' + '1', { key: 'm' }); return false; } catch (e) { return /Line 2/.test(e.message); } })(), 'jpivot scalar key carries line');
  ok((function(){ try { TOOLS['jsonl-pivot'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'jpivot empty throws');
  ok(T.parseCSV(undefined, ',').length === 0, 'parseCSV undefined coerces, never throws');
  ok(T.parseCSV(null, ',').length === 0, 'parseCSV null coerces, never throws');
  ok(TOOLS['csv-checksum-column'].handler('id\n"a\rb"', {}).indexOf(String.fromCharCode(34)) >= 0, 'checksum quotes lone-CR');
  ok(TOOLS['csv-sampler'].handler('id\n"a\rb"\n"c"', { count: '5', seed: 'x' }).indexOf(String.fromCharCode(34)) >= 0, 'sampler quotes lone-CR');
  ok(TOOLS['csv-duplicate-finder'].handler('e,p\n"a\rb",x\n"a\rb",x', {}).indexOf(String.fromCharCode(34)) >= 0, 'dupes quotes lone-CR');
  ok(TOOLS['csv-column-profiler'].handler('a,b\n"a\rb",x', {}).indexOf(String.fromCharCode(34)) >= 0, 'profiler quotes lone-CR');
  ok(TOOLS['csv-diff'].handler('id,p\n1,"a\rb"', { datasetB: 'id,p\n1,"c"' }).indexOf(String.fromCharCode(34)) >= 0, 'diff quotes lone-CR');
  ok((function(){ try { TOOLS['jsonl-duplicate-finder'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'jdupes empty throws');
  ok(JSON.parse(TOOLS['jsonl-to-json'].handler('{"a":1}\n{"b":2}')).length === 2, 'jsonl two docs');
  ok(JSON.parse(TOOLS['jsonl-to-json'].handler('1\n"x"'))[1] === 'x', 'jsonl scalars');
  ok(TOOLS['csv-transposer'].handler('a;b\nc;d', {}) === 'a;c\nb;d', 'transposer auto semicolon');
  ok(TOOLS['csv-transposer'].handler('a,b,c\nd,e', {}) === 'a,d\nb,e\nc,', 'transposer ragged pads');
  var _tsq = 'a,b,c\nd,e,f\ng,h,i';
  ok(TOOLS['csv-transposer'].handler(TOOLS['csv-transposer'].handler(_tsq, {}), {}) === _tsq, 'transposer involution square');
  ok(TOOLS['csv-transposer'].handler(TOOLS['csv-transposer'].handler('a;b\nc;d', {}), {}) === 'a;b\nc;d', 'transposer involution semicolon');
  ok(TOOLS['csv-transposer'].handler(TOOLS['csv-transposer'].handler('a,b,c\nd,e', {}), {}) === 'a,b,c\nd,e,', 'transposer ragged double pads once');
  ok(JSON.parse(TOOLS['csv-to-json'].handler('name;age\nAda;30'))[0].age === '30', 'csv-to-json auto header map');
  ok(TOOLS['csv-to-json'].handler.toString().indexOf('csvToJSON(s, opts)') >= 0, 'csv-to-json delegates opts');
  ok(TOOLS['csv-to-xml'].handler.toString().indexOf('csvToXML(s, opts)') >= 0, 'csv-to-xml delegates opts');
  ok(TOOLS['csv-to-xml'].handler('name,age\nAda,30', {}).indexOf('<name>Ada</name>') >= 0, 'csv-to-xml basic');
  ok(TOOLS['csv-to-xml'].handler('name;age\nAda;30', {}).indexOf('<age>30</age>') >= 0, 'csv-to-xml auto semicolon');
  ok(TOOLS['csv-to-xml'].handler('a,b\n1,2', { delimiter: 'comma' }).indexOf('<a>1</a>') >= 0, 'csv-to-xml explicit comma');
  ok(TOOLS['csv-to-toml'].handler.toString().indexOf('csvToTOML') >= 0, 'csv-to-toml delegates');
  ok(TOOLS['csv-to-toml'].handler('name,age\nAda,30', {}) === '[[docs]]\nname = "Ada"\nage = "30"', 'csv-to-toml row');
  ok(TOOLS['csv-to-toml'].handler('name;age\nAda;30', {}).indexOf('[[docs]]') >= 0, 'csv-to-toml auto semicolon');
  ok(JSON.parse(T.tomlToJSON(TOOLS['csv-to-toml'].handler('a,b\n1,2', {}))).docs[0].a === '1', 'csv-to-toml round trip');
  ok(TOOLS['csv-to-yaml'].handler.toString().indexOf('csvToYAML(s, opts)') >= 0, 'csv-to-yaml delegates opts');
  ok(TOOLS['csv-to-yaml'].handler('name,age\nAda,30', {}).indexOf('Ada') >= 0, 'csv-to-yaml basic');
  ok(TOOLS['csv-to-yaml'].handler('name;age\nAda;30', {}).indexOf('Ada') >= 0, 'csv-to-yaml auto semicolon');
  ok(TOOLS['csv-to-yaml'].handler('a,b\n1,2', { delimiter: 'comma' }).indexOf('a:') >= 0, 'csv-to-yaml delim opt');
  ok(JSON.parse(TOOLS['csv-to-json'].handler('a,b\n1,2', { delimiter: 'comma' }))[0].a === '1', 'csv-to-json explicit comma');
  ok(JSON.parse(TOOLS['csv-to-json'].handler('a,b\n1,2,3'))[0]['(extra_3)'] === '3', 'csv-to-json long row kept as extra column');
  ok(JSON.parse(TOOLS['csv-to-json'].handler('a,b,c\n1,2'))[0].c === '', 'csv-to-json short row still pads');
  ok(JSON.parse(TOOLS['csv-to-json'].handler('(extra_2)\n1,2'))[0]['(extra_2)_2'] === '2', 'csv-to-json extra name dedups against headers');
  ok(TOOLS['markdown-table-generator'].handler('a,b\n1,2', {}).indexOf('| a | b |') >= 0, 'mdtable basic vector');
  ok(T.markdownToCSV('| a | b |\n|---|---|\n| 1 | 2 |') === 'a,b\n1,2', 'md-to-csv basic');
  ok(TOOLS['markdown-to-xml'].handler.toString().indexOf('markdownToXML(s, opts)') >= 0, 'markdown-to-xml delegates opts');
  ok(TOOLS['markdown-to-xml'].handler('| a | b |\n|---|---|\n| 1 | 2 |', {}).indexOf('<a>1</a>') >= 0, 'markdown-to-xml basic');
  ok(TOOLS['markdown-to-xml'].handler('| a | b |\n|---|---|\n| 1 | 2 |', { delimiter: 'semicolon' }).indexOf('<a>1</a>') >= 0, 'markdown-to-xml delim opt');
  ok(TOOLS['markdown-to-json'].handler.toString().indexOf('markdownToJSON') >= 0, 'markdown-to-json delegates');
  ok(TOOLS['markdown-to-json'].handler('| a |\n|---|\n| 1 |', {}).indexOf('a') >= 0, 'markdown-to-json row');
  ok(JSON.parse(TOOLS['markdown-to-json'].handler('| a | b |\n|---|---|\n| 1 | 2 |', {}))[0].a === '1', 'markdown-to-json keys');
  ok(TOOLS['markdown-to-json'].handler('| a |\n|---|\n| 1 |', { delimiter: 'comma' }).indexOf('1') >= 0, 'markdown-to-json delimiter opt');
  ok(TOOLS['markdown-to-toml'].handler.toString().indexOf('markdownToTOML') >= 0, 'markdown-to-toml delegates');
  ok(TOOLS['markdown-to-toml'].handler('| a |\n|---|\n| 1 |', {}) === '[[docs]]\na = "1"', 'markdown-to-toml row');
  ok(TOOLS['markdown-to-toml'].handler('| a | b |\n|---|---|\n| 1 | 2 |', {}).indexOf('b = "2"') >= 0, 'markdown-to-toml keys');
  ok(JSON.parse(T.tomlToJSON(TOOLS['markdown-to-toml'].handler('| a |\n|---|\n| 1 |', {}))).docs[0].a === '1', 'markdown-to-toml round trip');
  ok(TOOLS['markdown-to-yaml'].handler.toString().indexOf('markdownToYAML') >= 0, 'markdown-to-yaml delegates');
  ok(TOOLS['markdown-to-yaml'].handler('| a |\n|---|\n| 1 |', {}) === '- a: "1"', 'markdown-to-yaml row');
  ok(TOOLS['markdown-to-yaml'].handler('| a | b |\n|---|---|\n| 1 | 2 |', {}).indexOf('b: "2"') >= 0, 'markdown-to-yaml keys');
  ok(JSON.parse(T.yamlToJSON(TOOLS['markdown-to-yaml'].handler('| a |\n|---|\n| 1 |', {})))[0].a === '1', 'markdown-to-yaml round trip');
  ok(T.markdownToCSV(T.csvToMarkdown('a,b\n1,2', {})) === 'a,b\n1,2', 'md-csv round trip');
  ok(T.markdownToCSV('| a |\n| --- |\n| 1 |', {headers:'drop'}) === '1', 'md-to-csv drop headers');
  ok(TOOLS['markdown-to-csv'].handler.toString().indexOf('markdownToCSV') >= 0, 'md-to-csv delegates');

  ok(TOOLS['ascii-table'].handler('a,b\n1,22') === '+---+----+\n| a | b  |\n+---+----+\n| 1 | 22 |\n+---+----+', 'ascii-table ascii style');
  ok(TOOLS['ascii-table'].handler('a,b\n1,22', {style:'unicode'}) === '\u250c\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2510\n\u2502 a \u2502 b  \u2502\n\u251c\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2524\n\u2502 1 \u2502 22 \u2502\n\u2514\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2518', 'ascii-table unicode style');
  ok(TOOLS['ascii-table'].handler('a,b\n1,22', {header:'none', align:'right'}).indexOf('Column 1') >= 0, 'ascii-table header none labels');
  ok(TOOLS['ascii-table'].handler.toString().indexOf('csvToAsciiTable') >= 0, 'ascii-table delegates');

  ok(TOOLS['markdown-table-generator'].handler('a, b\n1, 2', {}).indexOf('| a | b |') >= 0, 'mdtable trims cells');
  ok(TOOLS['markdown-table-generator'].handler('\"a,b\",c\n1,2', {}).indexOf('| a,b | c |') >= 0, 'mdtable quoted comma via shared parser');
  ok(TOOLS['markdown-table-generator'].handler('a,b\n\"x\ny\",2', {}).indexOf('| x y | 2 |') >= 0, 'mdtable multiline record');
  ok(TOOLS['markdown-table-generator'].handler('a,b,c\n1,2', {}).indexOf('| 1 | 2 |  |') >= 0, 'mdtable ragged pads');
  ok(TOOLS['csv-delimiter-sniffer'].handler.toString().indexOf('csvSniffDelim') >= 0, 'sniffer delegates single source');
  ok(TOOLS['csv-delimiter-sniffer'].handler('a;b\nc;d').indexOf('Delimiter: Semicolon (;)') === 0, 'sniffer semicolon vector');
  ok(TOOLS['csv-delimiter-sniffer'].handler('a,b\nc,d').indexOf('Delimiter: Comma (,)') === 0, 'sniffer comma vector');
  ok(TOOLS['csv-delimiter-sniffer'].handler('"a;b";c\nd;e').indexOf('Delimiter: Semicolon (;)') === 0, 'sniffer quote-aware');
  ok(TOOLS['har-inspector'].handler.toString().indexOf('harSummary') >= 0, 'har delegates single source');
  ok(TOOLS['har-inspector'].downloadExt({ view: 'json' }) === 'json', 'har json view downloads json');
  ok(TOOLS['har-inspector'].downloadExt({ view: 'table' }) === 'txt', 'har table view downloads txt');
  var _har = '{"log":{"entries":[{"time":120,"request":{"method":"GET","url":"https://a.test/x"},"response":{"status":200,"bodySize":100}},{"time":5,"request":{"method":"GET","url":"https://a.test/y"},"response":{"status":404,"bodySize":10}}]}}';
  ok(TOOLS['har-inspector'].handler(_har, {}).indexOf('2 requests') === 0, 'har table header');
  ok(TOOLS['har-inspector'].handler(_har, {}).indexOf('https://a.test/x') < TOOLS['har-inspector'].handler(_har, {}).indexOf('https://a.test/y'), 'har slowest first');
  ok(TOOLS['har-inspector'].handler(_har, { sort: 'chrono' }).indexOf('https://a.test/x') < TOOLS['har-inspector'].handler(_har, { sort: 'chrono' }).indexOf('https://a.test/y'), 'har chrono order');
  ok(JSON.parse(TOOLS['har-inspector'].handler(_har, { view: 'json' })).failed === 1, 'har json failed count');
  ok(TOOLS['har-inspector'].handler(_har, { filter: 'y' }).indexOf('https://a.test/y') >= 0 && TOOLS['har-inspector'].handler(_har, { filter: 'y' }).indexOf('https://a.test/x') < 0, 'har url filter');
  ok(TOOLS['har-inspector'].handler(_har, { failedOnly: 'true' }).indexOf('1 request') === 0, 'har failed only');
  ok(TOOLS['har-inspector'].handler(_har, { filter: 'zzz' }).indexOf('no requests match') >= 0, 'har empty filter');
  ok(TOOLS['csv-pivot-table'].handler.toString().indexOf('csvPivot') >= 0, 'pivot delegates single source');
  ok(TOOLS['csv-column-profiler'].handler.toString().indexOf('csvProfile') >= 0, 'profiler delegates single source');
  ok(TOOLS['csv-duplicate-finder'].handler.toString().indexOf('csvDupes') >= 0, 'dupes delegates single source');
  ok(TOOLS['csv-diff'].handler.toString().indexOf('csvDiffOpts') >= 0, 'diff delegates single source');
  ok(TOOLS['csv-sampler'].handler.toString().indexOf('csvSample') >= 0, 'sampler delegates single source');
  ok(TOOLS['csv-sampler'].handler('id\n1\n2\n3', { count: '2', seed: 's' }) === TOOLS['csv-sampler'].handler('id\n1\n2\n3', { count: '2', seed: 's' }), 'sampler seed replays');
  ok(TOOLS['csv-sampler'].handler('id\n1\n2\n3', { count: '2', seed: 's' }).split('\n').length === 3, 'sampler count');
  ok((function(){ try { TOOLS['csv-sampler'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'sampler empty throws');
  ok(TOOLS['csv-checksum-column'].handler.toString().indexOf('csvChecksum') >= 0, 'checksum delegates single source');
  ok(TOOLS['csv-checksum-column'].handler('id\n1\n2', {}) === 'id,row_hash\n1,' + Transforms.fnv1aHex('1') + '\n2,' + Transforms.fnv1aHex('2'), 'checksum column + fnv');
  ok(TOOLS['csv-checksum-column'].handler('id\n1\n2', {}) === TOOLS['csv-checksum-column'].handler('id\n1\n2', {}), 'checksum deterministic');
  ok((function(){ try { TOOLS['csv-checksum-column'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'checksum empty throws');
  ok((function(){ try { TOOLS['csv-checksum-column'].handler('id,row_hash\n1,x', {}); return false; } catch (e) { return true; } })(), 'checksum collision throws');
  ok(TOOLS['csv-normalizer'].handler.toString().indexOf('csvNormalize') >= 0, 'normalizer delegates single source');
  ok(TOOLS['csv-normalizer'].handler('name;city\nAda;Lovelace', {}) === 'name,city\nAda,Lovelace', 'normalizer semicolon to comma');
  ok(TOOLS['csv-normalizer'].handler('\uFEFFa;b\r\nc;d\r\n', {}) === 'a,b\nc,d', 'normalizer BOM plus CRLF');
  ok(TOOLS['csv-normalizer'].handler('a,b,c\n1,2\n\n3,4,5,6', {}) === 'a,b,c,\n1,2,,\n3,4,5,6', 'normalizer drops blanks pads ragged');
  var _nq = String.fromCharCode(34);
  ok(TOOLS['csv-normalizer'].handler('a,b\n' + _nq + 'Smith, John' + _nq + ',ok', {}) === 'a,b\n' + _nq + 'Smith, John' + _nq + ',ok', 'normalizer keeps needed quotes');
  ok(TOOLS['csv-normalizer'].handler('a|b\nc|d', {}) === 'a,b\nc,d', 'normalizer auto pipe');
  ok(TOOLS['csv-normalizer'].handler('a,b\n  x  , y ', { trim: true }) === 'a,b\nx,y', 'normalizer trim');
  ok((function(){ try { TOOLS['csv-normalizer'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'normalizer empty throws');
  ok(TOOLS['csv-diff'].handler('id,p\n1,pro\n2,free', { datasetB: 'id,p\n1,pro\n2,team\n3,free' }) === 'status,key,details\nchanged,2,p: free -> team\nadded,3,', 'diff changed added');
  ok((function(){ try { TOOLS['csv-diff'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'diff empty throws');
  ok(TOOLS['csv-duplicate-finder'].handler('e,p\na@x,pro\nb@x,free\na@x,pro', {}) === 'count,e,p\n2,a@x,pro', 'dupes whole row');
  ok((function(){ try { TOOLS['csv-duplicate-finder'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'dupes empty throws');
  ok(TOOLS['csv-column-profiler'].handler('a,b\n1,x\n2,y', {}) === 'column,type,filled,empty,distinct,min,max\na,integer,2,0,2,1,2\nb,string,2,0,2,x,y', 'profiler types');
  ok((function(){ try { TOOLS['csv-column-profiler'].handler('   ', {}); return false; } catch (e) { return true; } })(), 'profiler empty throws');

  var _pv = 'dept,q,sales\neng,q1,10\neng,q2,20\nops,q1,5';
  ok(TOOLS['csv-pivot-table'].handler(_pv, { row: 'dept', col: 'q', value: 'sales', agg: 'sum' }) === ',q1,q2\neng,10,20\nops,5,', 'pivot sum');
  ok(TOOLS['csv-pivot-table'].handler(_pv, {}).indexOf(',q1,q2') === 0, 'pivot count defaults');
  ok(TOOLS['csv-pivot-table'].handler(_pv, { row: 'dept', col: 'q', value: 'sales', agg: 'avg' }).indexOf('eng,10,20') >= 0, 'pivot avg');
  ok(TOOLS['csv-pivot-table'].handler('d;q;s\ne;q1;10', { row: 'd', col: 'q', value: 's', agg: 'sum' }) === ';q1\ne;10', 'pivot auto semicolon');
  ok(TOOLS['csv-pivot-table'].handler(_pv, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', totals: 'true' }) === ',q1,q2,Total\neng,10,20,30\nops,5,,5\nTotal,15,20,35', 'pivot totals');
  ok(TOOLS['csv-pivot-table'].handler(_pv, { agg: 'count', totals: true }) === ',q1,q2,Total\neng,1,1,2\nops,1,,1\nTotal,2,1,3', 'pivot totals bool');
  var _pvr = 'dept,q,sales\nops,q1,5\neng,q1,10\neng,q2,20';
  ok(TOOLS['csv-pivot-table'].handler(_pvr, { row: 'dept', col: 'q', value: 'sales', agg: 'sum' }) === ',q1,q2\nops,5,\neng,10,20', 'pivot seen default');
  ok(TOOLS['csv-pivot-table'].handler(_pvr, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', sort: 'row-asc' }) === ',q1,q2\neng,10,20\nops,5,', 'pivot sort row-asc');
  ok(TOOLS['csv-pivot-table'].handler(_pvr, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', sort: 'row-desc' }) === ',q1,q2\nops,5,\neng,10,20', 'pivot sort row-desc');
  ok(TOOLS['csv-pivot-table'].handler(_pvr, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', sort: 'row-total' }) === ',q1,q2\neng,10,20\nops,5,', 'pivot sort row-total');
  ok(TOOLS['csv-pivot-table'].handler(_pvr, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', sort: 'col-total' }) === ',q2,q1\nops,,5\neng,20,10', 'pivot sort col-total');
  ok(TOOLS['csv-delimiter-sniffer'].handler('a;b,c\nd;e,f').indexOf('ambiguous') >= 0, 'sniffer tie reports honest');
  ok(TOOLS['csv-delimiter-sniffer'].handler('plain').indexOf('none detected') >= 0, 'sniffer single column');
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
  ok(T.ascii85Encode('Man ') === '9jqo^', 'ascii85 known vector');
  ok(T.quotedPrintableEncode('Hello, world!') === 'Hello, world!', 'qp plain passthrough');
  ok(T.punycodeEncode('b' + String.fromCharCode(252) + 'cher') === 'xn--bcher-kva', 'punycode known vector');
  ok(T.punycodeEncode('m' + String.fromCharCode(252) + 'nchen.de') === 'xn--mnchen-3ya.de', 'punycode domain');
  ok(T.punycodeEncode('hello') === 'hello', 'punycode ascii passthrough');
  ok(T.punycodeEncode('') === '', 'punycode empty');
  ok(T.punycodeEncode('B' + String.fromCharCode(252) + 'CHER') === 'xn--bcher-kva', 'punycode case folds');
  ok(T.quotedPrintableEncode('a=b') === 'a=3Db', 'qp equals escaped');
  ok(T.quotedPrintableEncode('Caf\u00e9') === 'Caf=C3=A9', 'qp utf8 bytes');
  ok(T.quotedPrintableEncode('hi ') === 'hi=20', 'qp trailing blank');
  ok(T.quotedPrintableEncode(new Array(81).join('a')) === new Array(77).join('a') + '=\n' + 'aaaa', 'qp soft wrap');
  ok(T.quotedPrintableDecode('a=3Db') === 'a=b', 'qp decode escape');
  ok(T.quotedPrintableDecode('Caf=C3=A9') === 'Caf\u00e9', 'qp decode utf8');
  ok(T.quotedPrintableDecode(T.quotedPrintableEncode('a=b c\u00e9d ')) === 'a=b c\u00e9d ', 'qp roundtrip');
  ok(T.quotedPrintableDecode('a=\nb') === 'ab', 'qp soft break');
  ok(T.quotedPrintableDecode(String.fromCharCode(34) + 'a=3Db' + String.fromCharCode(34)) === 'a=b', 'qp pasted quotes stripped');
  ok(T.ascii85Encode('Hello, world!') === '87cURD_*#TDfTZ)+T', 'ascii85 longer vector');
  ok(T.ascii85Encode('') === '', 'ascii85 empty');
  ok(T.ascii85Encode(String.fromCharCode(0) + String.fromCharCode(0) + String.fromCharCode(0) + String.fromCharCode(0)) === 'z', 'ascii85 zero squeeze');
  ok(T.ascii85Encode('abcd').length === 5, 'ascii85 full group length');
  ok(T.ascii85Decode('9jqo^') === 'Man ', 'ascii85 decode known vector');
  ok(T.ascii85Decode(T.ascii85Encode('hello-world_~!')) === 'hello-world_~!', 'ascii85 roundtrip');
  ok(T.ascii85Decode('z').length === 4 && T.ascii85Decode('z').charCodeAt(0) === 0, 'ascii85 z expands');
  ok(T.ascii85Decode('9jqo^\n') === 'Man ', 'ascii85 whitespace skipped');
  ok(T.ascii85Decode(String.fromCharCode(34) + '9jqo^' + String.fromCharCode(34)) === 'Man ', 'ascii85 pasted quotes stripped');
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
  ok(TOOLS['xml-to-toml'].handler('<r><a>1</a></r>') === '[r]\na = "1"', 'xml-to-toml basic');
  ok(TOOLS['xml-to-toml'].handler('<r><i>1</i><i>2</i></r>') === '[r]\ni = ["1", "2"]', 'xml-to-toml repeats');
  ok(TOOLS['xml-to-toml'].handler.toString().indexOf('xmlToTOML') >= 0, 'xml-to-toml delegates');
  ok(TOOLS['xml-to-csv'].handler.toString().indexOf('xmlToCSV(s, opts)') >= 0, 'xml-to-csv delegates opts');
  ok(TOOLS['xml-to-markdown'].handler.toString().indexOf('xmlToMarkdown(s, opts)') >= 0, 'xml-to-markdown delegates opts');
  ok(TOOLS['xml-to-markdown'].handler('<rows><row><name>Ada</name><age>30</age></row><row><name>Bob</name><age>25</age></row></rows>', {}) === '| name | age |\n|---|---|\n| Ada | 30 |\n| Bob | 25 |', 'xml-to-markdown repeats');
  ok(TOOLS['xml-to-markdown'].handler('<server><host>h</host><port>8080</port></server>', {}).indexOf('| h | 8080 |') >= 0, 'xml-to-markdown single');
  ok(TOOLS['xml-to-markdown'].handler('<rows><row><name>Ada</name></row></rows>', { align: 'center' }).indexOf(':center:') >= 0, 'xml-to-markdown align opt');
  ok(TOOLS['xml-to-csv'].handler('<rows><row><name>Ada</name><age>30</age></row><row><name>Bob</name><age>25</age></row></rows>', {}) === 'name,age\nAda,30\nBob,25', 'xml-to-csv repeats');
  ok(TOOLS['xml-to-csv'].handler('<server><host>h</host><port>8080</port></server>', {}) === 'host,port\nh,8080', 'xml-to-csv single');
  ok(TOOLS['xml-to-csv'].handler('<rows><row><name>Ada</name></row></rows>', { delimiter: 'semicolon' }).indexOf('name') >= 0, 'xml-to-csv delim opt');

  ok(JSON.parse(T.tomlToJSON('"a=b" = 1'))['a=b'] === 1, 'toml quoted eq key');
  ok(JSON.parse(T.tomlToJSON('t = { "x=y" = 3 }')).t["x=y"] === 3, 'toml inline quoted eq key');
  ok(T.jsonToTOML(T.tomlToJSON('"a=b" = 1')) === '"a=b" = 1', 'toml eq key round trip');
  ok(JSON.parse(T.tomlToJSON(String.fromCharCode(39) + 'a=b' + String.fromCharCode(39) + ' = 2'))['a=b'] === 2, 'toml literal eq key');

  ok(T.tomlFormat('a=1') === 'a = 1', 'toml-format basic');
  ok(T.tomlFormat('[t]\na=[1,2]') === '[t]\na = [1, 2]', 'toml-format array spacing');
  ok(T.tomlFormat('d = 1979-05-27') === 'd = 1979-05-27', 'toml-format datetime verbatim');
  ok(T.tomlFormat(T.tomlFormat('[t]\na=[1,2]')) === T.tomlFormat('[t]\na=[1,2]'), 'toml-format idempotent');
  ok(TOOLS['toml-formatter'].handler.toString().indexOf('tomlFormat') >= 0, 'toml-formatter delegates');

  ok(TOOLS['toml-to-yaml'].handler('[db]\nhost = "h"\n[[srv]]\nip = "a"') === 'db:\n  host: h\nsrv:\n  - ip: a', 'toml-to-yaml tables + array-tables');
  ok(TOOLS['toml-to-yaml'].handler('s = "true"\nn = 42') === 's: "true"\nn: 42', 'toml-to-yaml quotes bool-like strings');
  ok(TOOLS['toml-to-yaml'].handler('a = 1') === T.tomlToYAML('a = 1'), 'toml-to-yaml delegates to Transforms');
  ok(JSON.parse(T.tomlToJSON('s = """a\nb"""')).s === 'a\nb', 'toml ml basic spans lines');
  ok(JSON.parse(T.tomlToJSON('s = """a\\\n   b"""')).s === 'ab', 'toml line-ending backslash trims');
  ok(JSON.parse(T.tomlToJSON('s = """\na"""')).s === 'a', 'toml ml leading newline trimmed');
  ok(JSON.parse(T.tomlToJSON("s = '''a\nb'''")).s === 'a\nb', 'toml ml literal spans lines');
  ok(JSON.parse(T.tomlToJSON('s = """say ""hi"" ok"""')).s === 'say ""hi"" ok', 'toml ml embedded quote pairs');
  ok(JSON.parse(T.tomlToJSON('s = """[x]"""\nt = 1')).t === 1, 'toml brackets inside ml string ignored');
  ok(JSON.parse(T.tomlToJSON('a = 1 # say "hi\nb = 2')).b === 2, 'toml unbalanced quote in comment keeps keys');
  ok(JSON.parse(T.tomlToJSON('[a] # stray [\nb = 1')).a.b === 1, 'toml bracket in comment keeps table');
  ok(JSON.parse(T.tomlToJSON('arr = [\n# note\n1\n]')).arr.join(',') === '1', 'toml comment inside multiline array');
  ok(JSON.parse(T.tomlToJSON('arr = [\n1,\n2\n]')).arr.join(',') === '1,2', 'toml multiline array parses');
  ok(JSON.stringify(JSON.parse(T.yamlToJSON(T.tomlToYAML('s = """a\nb"""')))) === JSON.stringify(JSON.parse(T.tomlToJSON('s = """a\nb"""'))), 'toml ml round trips through yaml');
  ok(TOOLS['yaml-to-toml'].handler('a: 1') === T.yamlToTOML('a: 1'), 'yaml-to-toml delegates to Transforms');
  ok(TOOLS['yaml-to-xml'].handler('a: 1') === T.yamlToXML('a: 1'), 'yaml-to-xml delegates to Transforms');
  ok(TOOLS['yaml-to-markdown'].handler.toString().indexOf('yamlToMarkdown') >= 0, 'yaml-to-markdown delegates');
  ok(TOOLS['yaml-to-markdown'].handler('a: 1', {}).indexOf('| 1 |') >= 0, 'yaml-to-markdown row');
  ok(TOOLS['yaml-to-markdown'].handler('- a: 1\n- a: 2', {}).indexOf('| 2 |') >= 0, 'yaml-to-markdown seq rows');
  ok(TOOLS['yaml-to-markdown'].handler('a: 1', { align: 'center' }).indexOf(':center:') >= 0, 'yaml-to-markdown align opt');
  ok(TOOLS['yaml-to-csv'].handler.toString().indexOf('yamlToCSV') >= 0, 'yaml-to-csv delegates');
  ok(TOOLS['yaml-to-csv'].handler('a: 1', {}) === 'a\n1', 'yaml-to-csv row');
  ok(TOOLS['yaml-to-csv'].handler('- a: 1\n- a: 2', {}) === 'a\n1\n2', 'yaml-to-csv seq rows');
  ok(TOOLS['yaml-to-csv'].handler('a: 1\nb: 2', { delimiter: 'semicolon' }) === 'a;b\n1;2', 'yaml-to-csv delim opt');
  ok(TOOLS['json-to-markdown'].handler.toString().indexOf('jsonToMarkdown') >= 0, 'json-to-markdown delegates');
  ok(TOOLS['json-to-markdown'].handler('{"a":1}', {}).indexOf('| 1 |') >= 0, 'json-to-markdown row');
  ok(TOOLS['json-to-markdown'].handler('[{"a":1},{"a":2}]', {}).indexOf('| 2 |') >= 0, 'json-to-markdown array rows');
  ok(TOOLS['json-to-markdown'].handler('{"a":1}', { align: 'center' }).indexOf(':center:') >= 0, 'json-to-markdown align opt');
  ok(TOOLS['toml-to-xml'].handler('a = 1') === T.tomlToXML('a = 1'), 'toml-to-xml delegates to Transforms');
  ok(TOOLS['toml-to-markdown'].handler.toString().indexOf('tomlToMarkdown') >= 0, 'toml-to-markdown delegates');
  ok(TOOLS['toml-to-markdown'].handler('a = 1', {}).indexOf('| 1 |') >= 0, 'toml-to-markdown row');
  ok(TOOLS['toml-to-markdown'].handler('[db]\nport = 8080', {}).indexOf('| 8080 |') >= 0, 'toml-to-markdown table flats');
  ok(TOOLS['toml-to-csv'].handler.toString().indexOf('tomlToCSV') >= 0, 'toml-to-csv delegates');
  ok(TOOLS['toml-to-csv'].handler('a = 1', {}) === 'a\n1', 'toml-to-csv row');
  ok(TOOLS['toml-to-csv'].handler('[db]\nport = 8080', {}).indexOf('db.port') >= 0, 'toml-to-csv table flats');
  ok(TOOLS['toml-to-csv'].handler('a = 1\nb = 2', { delimiter: 'semicolon' }) === 'a;b\n1;2', 'toml-to-csv delim opt');
  ok(TOOLS['toml-to-xml'].handler('a = 1').indexOf('<a>1</a>') >= 0, 'toml-to-xml flat');
  ok(TOOLS['toml-to-xml'].handler('[db]\nport = 8080').indexOf('<port>8080</port>') >= 0, 'toml-to-xml table nests');
  ok(TOOLS['yaml-to-xml'].handler('a: 1').indexOf('<a>1</a>') >= 0, 'yaml-to-xml flat');
  ok(TOOLS['yaml-to-xml'].handler('server:\n  host: h').indexOf('<host>h</host>') >= 0, 'yaml-to-xml nested');
  ok(TOOLS['yaml-to-xml'].handler('ports: [80, 443]').indexOf('<ports>80</ports>') >= 0, 'yaml-to-xml seq repeats');
  ok(TOOLS['yaml-to-toml'].handler('a: 1') === 'a = 1', 'yaml-to-toml flat');
  ok(TOOLS['yaml-to-toml'].handler('db:\n  host: h\n  ports: [1, 2]') === '[db]\nhost = "h"\nports = [1, 2]', 'yaml-to-toml flow seq stays array');
  ok(TOOLS['yaml-to-toml'].handler('srv:\n  - ip: a\n  - ip: b') === '[[srv]]\nip = "a"\n[[srv]]\nip = "b"', 'yaml-to-toml array-tables');
  ok(TOOLS['yaml-to-toml'].handler('s: "true"\nn: 42') === 's = "true"\nn = 42', 'yaml-to-toml bool-like quoting');
  ok(JSON.parse(T.yamlToJSON('ports: [80, 443]')).ports.join(',') === '80,443', 'yaml flow seq of numbers');
  ok(JSON.parse(T.yamlToJSON('m: {a: 1, b: [2, 3]}')).m.b.join(',') === '2,3', 'yaml nested flows');
  ok(JSON.parse(T.yamlToJSON('[1, 2]')).join(',') === '1,2', 'yaml whole-doc flow seq');
  ok(JSON.parse(T.yamlToJSON('{a: 1}')).a === 1, 'yaml whole-doc flow map');
  ok(JSON.parse(T.yamlToJSON('srv:\n  - {ip: a}')).srv[0].ip === 'a', 'yaml seq of flow maps');
  ok(JSON.parse(T.yamlToJSON('a: 1 # note')).a === 1, 'yaml inline comment sheds to number');
  ok(JSON.parse(T.yamlToJSON('s: hello # world')).s === 'hello', 'yaml inline comment sheds to string');
  ok(JSON.parse(T.yamlToJSON('s: "a # b"')).s === 'a # b', 'yaml quoted hash kept');
  ok(JSON.parse(T.yamlToJSON('u: https://example.com/#frag')).u === 'https://example.com/#frag', 'yaml url hash kept');
  ok(JSON.parse(T.yamlToJSON('pw: abc#123')).pw === 'abc#123', 'yaml spaceless hash kept');
  ok(JSON.parse(T.yamlToJSON('ports: [80, 443] # main')).ports.join(',') === '80,443', 'yaml flow tail comment');
  ok(JSON.parse(T.yamlToJSON('ports: [80 # per-port]')).ports.join(',') === '80', 'yaml flow inner comment');
  ok(JSON.parse(T.yamlToJSON('s: |\n  hello # kept\n  world')).s === 'hello # kept\nworld\n', 'yaml literal keeps hash');
  ok(TOOLS['json-diff'].handler.toString().indexOf('jsonDiffOpts') >= 0, 'json-diff delegates opts');
  ok(TOOLS['json-diff'].handler('{"a":1}', { compareTo: '{"a":2}' }) === T.jsonDiff('{"a":1}', '{"a":2}'), 'json-diff delegates changed value');
  ok(TOOLS['json-diff'].handler('{"a":1}', { compareTo: '{"a":1}' }) === 'No differences found', 'json-diff identical no-diff');
  ok(TOOLS['json-diff'].handler('{"a":1}') === T.jsonDiff('{"a":1}', '{}'), 'json-diff default compareTo {}');
  ok(TOOLS['json-diff'].handler('{"a":{"x":1}}', { compareTo: '{"a":{"x":2,"b":3}}' }) === T.jsonDiff('{"a":{"x":1}}', '{"a":{"x":2,"b":3}}'), 'json-diff delegates nested');
  ok(TOOLS['json-to-xml'].handler.toString().indexOf('jsonToXML') >= 0, 'json-to-xml manifest delegates to Transforms');
  ok(TOOLS['json-to-xml'].handler('{"a":{"b":2},"list":[1,2]}') === T.jsonToXML('{"a":{"b":2},"list":[1,2]}'), 'json-to-xml delegates nested');
  ok(TOOLS['json-to-xml'].handler('{"a b":1}').indexOf('<a_b>1</a_b>') >= 0, 'json-to-xml sanitizes tag names to valid XML');
  ok(TOOLS['json-schema-validator'].handler.toString().indexOf('jsonSchemaValidate') >= 0, 'schema-validator delegates to Transforms');
  ok(TOOLS['json-schema-validator'].handler('{"age":36}', { schema: '{"type":"object","properties":{"age":{"type":"integer","minimum":0}},"required":["age"]}' }).indexOf('Valid') === 0, 'schema accepts conforming instance');
  ok(TOOLS['json-schema-validator'].handler('{"age":"old"}', { schema: '{"type":"object","properties":{"age":{"type":"integer"}}}' }).indexOf('$.age: expected integer, got string') >= 0, 'schema reports error path and types');
  ok(TOOLS['json-schema-validator'].handler('{}', { schema: '{"required":["age"]}' }).indexOf('missing required property "age"') >= 0, 'schema reports missing required');
  ok(TOOLS['json-schema-validator'].handler('[3,1,3]', { schema: '{"type":"array","uniqueItems":true}' }).indexOf('not unique') >= 0, 'schema uniqueItems vector');
  ok(TOOLS['json-schema-validator'].handler('{"a":1}', { schema: '{"additionalProperties":false}' }).indexOf('unexpected property "a"') >= 0, 'schema closed object vector');
  ok(TOOLS['json-schema-validator'].handler('{"n":5}', { schema: '{"properties":{"n":{"$ref":"#/definitions/pos"}},"definitions":{"pos":{"type":"integer","exclusiveMinimum":0}}}' }).indexOf('Valid') === 0, 'schema local $ref vector');
  ok(TOOLS['json-schema-validator'].handler('"b"', { schema: '{"enum":["a","b"]}' }).indexOf('Valid') === 0, 'schema enum vector');
  ok(TOOLS['json-schema-validator'].handler('1', { schema: '{"anyOf":[{"type":"string"},{"type":"integer"}]}' }).indexOf('Valid') === 0, 'schema anyOf vector');
  ok(TOOLS['json-schema-validator'].handler('1', { schema: '{"oneOf":[{"type":"integer"},{"type":"number"}]}' }).indexOf('exactly 1') >= 0, 'schema oneOf double-match vector');
  ok(TOOLS['json-to-schema'].handler.toString().indexOf('jsonToSchema') >= 0, 'json-to-schema delegates');
  ok(TOOLS['json-to-schema'].handler('{"a":1}').indexOf('integer') >= 0, 'json-to-schema types');
  ok(TOOLS['json-to-schema'].handler('{"n":"Ada","age":36}').indexOf('required') >= 0, 'json-to-schema required keys');
  ok(TOOLS['json-to-schema'].handler('[1,"x"]').indexOf('anyOf') >= 0, 'json-to-schema mixed array');
  ok(TOOLS['json-to-schema'].handler('{"a":1}', { indent: '4' }).length > TOOLS['json-to-schema'].handler('{"a":1}').length, 'json-to-schema indent opt');
  ok(TOOLS['csv-to-schema'].handler.toString().indexOf('csvToSchema') >= 0, 'csv-to-schema delegates');
  ok(TOOLS['csv-to-schema'].handler('name,age\nAda,36').indexOf('integer') >= 0, 'csv-to-schema types');
  ok(TOOLS['csv-to-schema'].handler('name,age\nAda,36').indexOf('required') >= 0, 'csv-to-schema required keys');
  ok(TOOLS['csv-to-schema'].handler('f\ntrue\nfalse').indexOf('boolean') >= 0, 'csv-to-schema bool type');
  ok(TOOLS['csv-to-schema'].handler('a,b\n1,2', { indent: '4' }).length > TOOLS['csv-to-schema'].handler('a,b\n1,2').length, 'csv-to-schema indent opt');
  ok(TOOLS['yaml-to-schema'].handler.toString().indexOf('yamlToSchema') >= 0, 'yaml-to-schema delegates');
  ok(TOOLS['yaml-to-schema'].handler('name: Ada\nage: 36').indexOf('integer') >= 0, 'yaml-to-schema types');
  ok(TOOLS['yaml-to-schema'].handler('name: Ada\nage: 36').indexOf('required') >= 0, 'yaml-to-schema required keys');
  ok(TOOLS['yaml-to-schema'].handler('a: true').indexOf('boolean') >= 0, 'yaml-to-schema bool type');
  ok(TOOLS['yaml-to-schema'].handler('a: 1', { indent: '4' }).length > TOOLS['yaml-to-schema'].handler('a: 1').length, 'yaml-to-schema indent opt');
  ok(TOOLS['xml-to-schema'].handler.toString().indexOf('xmlToSchema') >= 0, 'xml-to-schema delegates');
  ok(TOOLS['xml-to-schema'].handler('<r><a>1</a></r>').indexOf('string') >= 0, 'xml-to-schema leaf strings');
  ok(TOOLS['xml-to-schema'].handler('<r><a>1</a></r>').indexOf('required') >= 0, 'xml-to-schema required keys');
  ok(TOOLS['xml-to-schema'].handler('<server><host>example.com</host><port>8080</port></server>').indexOf('properties') >= 0, 'xml-to-schema nested');
  ok(TOOLS['xml-to-schema'].handler('<r><a>1</a></r>', { indent: '4' }).length > TOOLS['xml-to-schema'].handler('<r><a>1</a></r>').length, 'xml-to-schema indent opt');
  ok(TOOLS['toml-to-schema'].handler.toString().indexOf('tomlToSchema') >= 0, 'toml-to-schema delegates');
  ok(TOOLS['toml-to-schema'].handler('a = 1').indexOf('integer') >= 0, 'toml-to-schema types');
  ok(TOOLS['toml-to-schema'].handler('a = 1').indexOf('required') >= 0, 'toml-to-schema required keys');
  ok(TOOLS['toml-to-schema'].handler('a = true').indexOf('boolean') >= 0, 'toml-to-schema bool type');
  ok(TOOLS['toml-to-schema'].handler('a = 1', { indent: '4' }).length > TOOLS['toml-to-schema'].handler('a = 1').length, 'toml-to-schema indent opt');
  ok(TOOLS['ini-to-schema'].handler.toString().indexOf('iniToSchema') >= 0, 'ini-to-schema delegates');
  ok(TOOLS['ini-to-schema'].handler('[s]\na = 1').indexOf('string') >= 0, 'ini-to-schema values strings');
  ok(TOOLS['ini-to-schema'].handler('[s]\na = 1').indexOf('required') >= 0, 'ini-to-schema required keys');
  ok(TOOLS['ini-to-schema'].handler('[server]\nhost = example.com').indexOf('properties') >= 0, 'ini-to-schema nested');
  ok(TOOLS['ini-to-schema'].handler('[s]\na = 1', { indent: '4' }).length > TOOLS['ini-to-schema'].handler('[s]\na = 1').length, 'ini-to-schema indent opt');
  ok(TOOLS['env-to-schema'].handler.toString().indexOf('envToSchema') >= 0, 'env-to-schema delegates');
  ok(TOOLS['env-to-schema'].handler('A=1\nB=hello').indexOf('string') >= 0, 'env-to-schema values strings');
  ok(TOOLS['env-to-schema'].handler('A=1\nB=hello').indexOf('required') >= 0, 'env-to-schema required keys');
  ok(TOOLS['env-to-schema'].handler('export A=1').indexOf('properties') >= 0, 'env-to-schema export prefix');
  ok(TOOLS['env-to-schema'].handler('A=1', { indent: '4' }).length > TOOLS['env-to-schema'].handler('A=1').length, 'env-to-schema indent opt');
  ok(TOOLS['markdown-to-schema'].handler.toString().indexOf('markdownToSchema') >= 0, 'markdown-to-schema delegates');
  ok(TOOLS['markdown-to-schema'].handler('| a | b |\n|---|---|\n| 1 | x |').indexOf('required') >= 0, 'markdown-to-schema required keys');
  ok(TOOLS['markdown-to-schema'].handler('| a |\n|---|\n| 1 |\n| 2 |').indexOf('integer') >= 0, 'markdown-to-schema types');
  ok(TOOLS['markdown-to-schema'].handler('| a |\n|---|\n| x |').indexOf('properties') >= 0, 'markdown-to-schema single col');
  ok(TOOLS['markdown-to-schema'].handler('| a |\n|---|\n| 1 |', { indent: '4' }).length > TOOLS['markdown-to-schema'].handler('| a |\n|---|\n| 1 |').length, 'markdown-to-schema indent opt');
  ok(TOOLS['jsonl-to-schema'].handler.toString().indexOf('jsonlToSchema') >= 0, 'jsonl-to-schema delegates');
  ok(TOOLS['jsonl-to-schema'].handler('{\u0022a\u0022:1}').indexOf('integer') >= 0, 'jsonl-to-schema types');
  ok(TOOLS['jsonl-to-schema'].handler('{\u0022a\u0022:1}\n{\u0022a\u0022:2}').indexOf('required') >= 0, 'jsonl-to-schema required keys');
  ok(TOOLS['jsonl-to-schema'].handler('{\u0022a\u0022:1}\n{\u0022b\u0022:\u0022x\u0022}').indexOf('anyOf') >= 0, 'jsonl-to-schema mixed shapes');
  ok(TOOLS['jsonl-to-schema'].handler('{\u0022a\u0022:1}', { indent: '4' }).length > TOOLS['jsonl-to-schema'].handler('{\u0022a\u0022:1}').length, 'jsonl-to-schema indent opt');
  ok(TOOLS['csv-to-jsonl'].handler.toString().indexOf('csvToJSONL') >= 0, 'csv-to-jsonl delegates');
  ok(TOOLS['csv-to-jsonl'].handler('a,b\n1,2\n3,4').split('\n').length === 2, 'csv-to-jsonl line count');
  ok(T.jsonlToJSON(TOOLS['csv-to-jsonl'].handler('a,b\n1,2')).indexOf('a') >= 0, 'csv-to-jsonl round trip');
  ok(TOOLS['csv-to-jsonl'].handler('a;b\n1;2', { delimiter: 'semicolon' }).split('\n').length === 1, 'csv-to-jsonl delim opt');
  ok(TOOLS['csv-to-jsonl'].handler('name,city\nAda,Lovelace').indexOf('Lovelace') >= 0, 'csv-to-jsonl values');
  ok(TOOLS['xml-to-jsonl'].handler.toString().indexOf('xmlToJSONL') >= 0, 'xml-to-jsonl delegates');
  ok(TOOLS['xml-to-jsonl'].handler('<rows><row><a>1</a></row><row><a>2</a></row></rows>').split('\n').length === 2, 'xml-to-jsonl line count');
  ok(T.jsonlToJSON(TOOLS['xml-to-jsonl'].handler('<r><a>1</a></r>')).indexOf('a') >= 0, 'xml-to-jsonl round trip');
  ok(TOOLS['xml-to-jsonl'].handler('<r><a>1</a></r>').split('\n').length === 1, 'xml-to-jsonl single line');
  ok(TOOLS['xml-to-jsonl'].handler('<r><a>1</a></r>').indexOf('1') >= 0, 'xml-to-jsonl values');
  ok(TOOLS['yaml-to-jsonl'].handler.toString().indexOf('yamlToJSONL') >= 0, 'yaml-to-jsonl delegates');
  ok(TOOLS['yaml-to-jsonl'].handler('a: 1').split('\n').length === 1, 'yaml-to-jsonl single line');
  ok(T.jsonlToJSON(TOOLS['yaml-to-jsonl'].handler('name: Ada\nage: 36')).indexOf('Ada') >= 0, 'yaml-to-jsonl round trip');
  ok(TOOLS['yaml-to-jsonl'].handler('- a: 1\n- a: 2').split('\n').length === 2, 'yaml-to-jsonl seq lines');
  ok(TOOLS['yaml-to-jsonl'].handler('a: 1').indexOf('a') >= 0, 'yaml-to-jsonl values');
  ok(TOOLS['toml-to-jsonl'].handler.toString().indexOf('tomlToJSONL') >= 0, 'toml-to-jsonl delegates');
  ok(TOOLS['toml-to-jsonl'].handler('a = 1').split('\n').length === 1, 'toml-to-jsonl single line');
  ok(T.jsonlToJSON(TOOLS['toml-to-jsonl'].handler('a = 1')).indexOf('a') >= 0, 'toml-to-jsonl round trip');
  ok(TOOLS['toml-to-jsonl'].handler('[server]\nport = 8080').indexOf('8080') >= 0, 'toml-to-jsonl nested');
  ok(TOOLS['toml-to-jsonl'].handler('a = true').indexOf('true') >= 0, 'toml-to-jsonl values');
  ok(TOOLS['ini-to-jsonl'].handler.toString().indexOf('iniToJSONL') >= 0, 'ini-to-jsonl delegates');
  ok(TOOLS['ini-to-jsonl'].handler('[s]\na = 1').split('\n').length === 1, 'ini-to-jsonl single line');
  ok(T.jsonlToJSON(TOOLS['ini-to-jsonl'].handler('[s]\na = 1')).indexOf('s.a') >= 0, 'ini-to-jsonl round trip');
  ok(TOOLS['ini-to-jsonl'].handler('a = 1').split('\n').length === 1, 'ini-to-jsonl top-level');
  ok(TOOLS['ini-to-jsonl'].handler('[server]\nhost = example.com').indexOf('example.com') >= 0, 'ini-to-jsonl values');
  ok(TOOLS['env-to-jsonl'].handler.toString().indexOf('envToJSONL') >= 0, 'env-to-jsonl delegates');
  ok(TOOLS['env-to-jsonl'].handler('A=1\nB=hello').split('\n').length === 1, 'env-to-jsonl single line');
  ok(T.jsonlToJSON(TOOLS['env-to-jsonl'].handler('A=1\nB=hello')).indexOf('hello') >= 0, 'env-to-jsonl round trip');
  ok(TOOLS['env-to-jsonl'].handler('export A=1').indexOf('A') >= 0, 'env-to-jsonl export prefix');
  ok(TOOLS['env-to-jsonl'].handler('A=1').indexOf('1') >= 0, 'env-to-jsonl values');
  ok(TOOLS['markdown-to-jsonl'].handler.toString().indexOf('markdownToJSONL') >= 0, 'markdown-to-jsonl delegates');
  ok(TOOLS['markdown-to-jsonl'].handler('| a | b |\n|---|---|\n| 1 | x |\n| 2 | y |').split('\n').length === 2, 'markdown-to-jsonl line count');
  ok(T.jsonlToJSON(TOOLS['markdown-to-jsonl'].handler('| a |\n|---|\n| 1 |')).indexOf('a') >= 0, 'markdown-to-jsonl round trip');
  ok(TOOLS['markdown-to-jsonl'].handler('intro\n| a |\n|---|\n| 1 |').split('\n').length === 1, 'markdown-to-jsonl prose ignored');
  ok(TOOLS['markdown-to-jsonl'].handler('| a |\n|---|\n| x |').indexOf('x') >= 0, 'markdown-to-jsonl values');
  ok(TOOLS['json-to-jsonl'].handler.toString().indexOf('jsonToJSONL') >= 0, 'json-to-jsonl delegates');
  ok(TOOLS['json-to-jsonl'].handler('[{\u0022a\u0022:1},{\u0022a\u0022:2}]').split('\n').length === 2, 'json-to-jsonl array lines');
  ok(TOOLS['json-to-jsonl'].handler('{\u0022a\u0022:1}').split('\n').length === 1, 'json-to-jsonl single line');
  ok(T.jsonlToJSON(TOOLS['json-to-jsonl'].handler('[{\u0022a\u0022:1}]')).indexOf('a') >= 0, 'json-to-jsonl round trip');
  ok(TOOLS['json-to-jsonl'].handler('5') === '5', 'json-to-jsonl scalar');
  ok(T.formatStopwatch(3723456) === '01:02:03.45', 'stopwatch format vector');
  ok(T.formatStopwatch(61000) === '00:01:01.00', 'stopwatch minute vector');
  ok(T.formatStopwatch(0) === '00:00:00.00', 'stopwatch zero vector');
  ok(T.formatStopwatch(-5) === '00:00:00.00', 'stopwatch clamps negative');
  ok(T.formatStopwatch(35999999) === '09:59:59.99', 'stopwatch hour vector');
  ok(JSON.stringify(T.fitDimensions(4000, 3000, 1920)) === '{"w":1920,"h":1440,"scaled":true}', 'fit 4k to 1920 vector');
  ok(JSON.stringify(T.fitDimensions(800, 600, 1920)) === '{"w":800,"h":600,"scaled":false}', 'fit small untouched');
  var FITV = T.fitDimensions(100, 300, 200);
  ok(FITV.w === 67 && FITV.h === 200 && FITV.scaled, 'fit portrait vector');
  ok(TOOLS['statistics-calculator'].handler.toString().indexOf('describeStats') >= 0, 'stats manifest delegates to Transforms');
  ok(TOOLS['statistics-calculator'].handler('1 2 3 4 5') === T.describeStats('1 2 3 4 5'), 'stats delegates 1-5');
  ok(T.loanSchedule(200000, 6, 30).payment === 1199.1, 'loan 200k/6pct/30y pays 1199.10');
  ok(T.loanSchedule(12000, 0, 1).payment === 1000 && T.loanSchedule(12000, 0, 1).totalInterest === 0, 'loan zero-rate vector');
  var LOANV = T.loanSchedule(200000, 6, 30);
  ok(LOANV.months === 360 && LOANV.yearly.length === 30 && LOANV.yearly[29].balance === 0, 'loan 360 months, 30 yearly rows, zero close');
  ok(LOANV.rows.length === 360 && LOANV.rows[0].length === 5 && LOANV.rows[0][0] === 1, 'loan monthly rows shape');
  ok(Math.abs(LOANV.totalInterest - 231676.38) < 5, 'loan total interest near 231676');
  ok(TOOLS['statistics-calculator'].handler('5 5 5 5').indexOf('Mode:        5') >= 0, 'stats mode vector');
  ok(TOOLS['statistics-calculator'].handler('1 2').indexOf('Sample StdDev:') >= 0, 'stats sample-stddev present');
  ok(TOOLS['css-formatter'].handler.toString().indexOf('cssFormat') >= 0, 'css manifest delegates to Transforms');
  ok(TOOLS['css-formatter'].handler('a{color:red}', { mode: 'beautify' }) === T.cssFormat('a{color:red}', { mode: 'beautify' }), 'css delegates beautify');
  ok(TOOLS['css-formatter'].handler('a { color: red; }', { mode: 'minify' }) === 'a{color:red}', 'css minify vector');
  ok(TOOLS['css-formatter'].handler("a::after{content:'{x}'}", { mode: 'minify' }).indexOf("{x}") >= 0, 'css minify keeps braced string');
  ok(TOOLS['css-minifier'].handler.toString().indexOf('cssMinify') >= 0, 'css-minifier delegates to Transforms');
  ok(TOOLS['css-minifier'].handler('a { color: red; }') === 'a{color:red}', 'css-minifier basic vector');
  ok(TOOLS['css-minifier'].handler('a{width:calc(100% - 10px)}') === 'a{width:calc(100% - 10px)}', 'css-minifier keeps required calc spaces');
  ok(TOOLS['css-minifier'].handler('a{width:calc(100%-10px)}') === 'a{width:calc(100% - 10px)}', 'css-minifier heals unspaced calc');
  ok(TOOLS['css-minifier'].handler('div :hover{color:#aabbcc}') === 'div :hover{color:#abc}', 'css-minifier spares selector colon, shortens hex');
  ok(TOOLS['css-minifier'].handler('a{fill:url(#aabbcc)}') === 'a{fill:url(#aabbcc)}', 'css-minifier spares url fragment hex');
  ok(TOOLS['css-formatter'].handler('a{width:calc(100% - 10px)}', { mode: 'minify' }) === 'a{width:calc(100% - 10px)}', 'css-formatter minify shares healed core');
  ok(TOOLS['css-minifier'].handler('@media screen and (max-width:600px){a{color:red}}') === '@media screen and(max-width:600px){a{color:red}}', 'css-minifier media vector');
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
    var _jtf = TOOLS['jwt-generator'].handler('{"sub":"1"}', { secret: 's', expires: '1h' });
    ok(/Expiry:   valid \(expires in /.test(TOOLS['jwt-verifier'].handler(_jtf, { secret: 's' })), 'jwt-verifier expiry badge counts down');
    var _jtp = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from('{"sub":"1","exp":1}').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.x';
    ok(/EXPIRED .+ ago/.test(TOOLS['jwt-verifier'].handler(_jtp, { secret: 's' })), 'jwt-verifier expiry badge counts up');
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
  ok(TOOLS['url-cleaner'].handler.toString().indexOf('cleanURL') >= 0, 'url-cleaner delegates to Transforms');
  ok(TOOLS['url-cleaner'].handler('https://example.com/shoes?utm_source=n&color=red&gclid=x') === 'https://example.com/shoes?color=red', 'url-cleaner strips trackers');
  ok(TOOLS['url-cleaner'].handler('https://www.youtube.com/watch?v=abc&si=xyz&t=30') === 'https://www.youtube.com/watch?t=30&v=abc', 'url-cleaner keeps video params, sorts survivors');
  ok(TOOLS['url-cleaner'].handler('example.com/?b=2&a=1') === 'https://example.com/?a=1&b=2', 'url-cleaner prefixes scheme, sorts params');
  ok(TOOLS['url-cleaner'].handler('https://e.com/?utm_source=n', { keep: 'utm_source' }) === 'https://e.com/?utm_source=n', 'url-cleaner keep-list wins');
  ok(TOOLS['url-cleaner'].handler('https://www.amazon.com/dp/X?tag=af-20&pd_rd_w=a&psc=1', { mode: 'aggressive' }) === 'https://www.amazon.com/dp/X?psc=1', 'url-cleaner aggressive strips affiliate tags');
  ok(TOOLS['url-cleaner'].handler('https://www.amazon.com/dp/X?tag=af-20&psc=1') === 'https://www.amazon.com/dp/X?psc=1&tag=af-20', 'url-cleaner standard spares affiliate tags');
  ok(T.tzOffsetMinutes(Date.UTC(2026, 0, 15), 'UTC') === 0, 'tz UTC offset zero');
  var TZ1 = T.tzConvert('2026-01-15T12:00', 'America/New_York', 'UTC');
  ok(TZ1.utcMs === Date.UTC(2026, 0, 15, 17, 0) && TZ1.toText === '2026-01-15 17:00' && TZ1.fromOffset === 'GMT-5:00' && TZ1.toOffset === 'GMT+0:00', 'tz winter NY to UTC vector');
  var TZ2 = T.tzConvert('2026-07-15 12:00', 'America/New_York', 'Asia/Kolkata');
  ok(TZ2.utcMs === Date.UTC(2026, 6, 15, 16, 0) && TZ2.toText === '2026-07-15 21:30' && TZ2.fromOffset === 'GMT-4:00' && TZ2.toOffset === 'GMT+5:30', 'tz summer NY to Kolkata vector');
  ok(T.tzConvert('2026-01-15T12:00', 'UTC', 'UTC').utcISO === '2026-01-15T12:00:00.000Z', 'tz identity UTC ISO');
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
  ok(TOOLS['markdown-table-generator'].handler('"a,b";c\n"d,e";f', {}).indexOf('| a,b | c |') >= 0, 'markdown auto semicolon despite quoted comma');
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
  ok(TOOLS['xml-minifier'].handler('<root>\n  <a>1</a>\n  <!-- x -->\n</root>') === '<root><a>1</a></root>', 'xml-min strips comments');
  ok(TOOLS['xml-minifier'].handler('<a title="x  y"  >t</a>') === '<a title="x  y">t</a>', 'xml-min tightens tags, keeps quoted spaces');
  ok(TOOLS['xml-minifier'].handler('<r><![CDATA[  x  ]]></r>') === '<r><![CDATA[  x  ]]></r>', 'xml-min cdata untouched');
  var threwAmp = false; try { T.xmlMinify('<a>AT&T</a>'); } catch (e) { threwAmp = /Bare &/.test(e.message); }
  ok(threwAmp, 'xml-min rejects bare amp with position');
  threwAmp = false; try { T.xmlFormat('<a>&#0;</a>', {}); } catch (e) { threwAmp = /Bad character reference/.test(e.message); }
  ok(threwAmp, 'xml-format rejects bad char ref');
  var threwEnt = false; try { T.xmlFormat('<a>&nbsp;</a>', {}); } catch (e) { threwEnt = /Unknown entity/.test(e.message); }
  ok(threwEnt, 'xml-format rejects unknown entity like parser');
  ok(JSON.parse(TOOLS['xml-to-json'].handler('<r><a>&lt;</a></r>')).r.a === '<', 'xml parser decodes lt');

  ok(T.xmlMinify('<a>A &amp; B</a>') === '<a>A &amp; B</a>', 'xml-min keeps valid entities');
  ok(T.xmlMinify('<a><!-- x&y --></a>') === '<a></a>', 'xml-min bare amp in comment stays literal');

  ok(TOOLS['xml-minifier'].handler('<a>t</a>') === T.xmlMinify('<a>t</a>'), 'xml-minifier delegates to Transforms');
  ok(T.xmlFormat(TOOLS['xml-minifier'].handler('<root><a>1</a></root>')) === T.xmlFormat('<root><a>1</a></root>'), 'xml-min keeps format equivalence');
  ok((function(){ try { T.xmlFormat('a < b', {}); return ''; } catch (e) { return e.message; } })().indexOf('Bare') === 0, 'xmlFormat rejects bare lt');
  ok((function(){ try { T.xmlMinify('a < b'); return ''; } catch (e) { return e.message; } })().indexOf('&lt;') > 0, 'xmlMinify bare-lt escape hint');
  ok((function(){ try { T.xmlFormat('<', {}); return ''; } catch (e) { return e.message; } })().indexOf('Bare') === 0, 'xmlFormat rejects lone angle');
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
  ok(TOOLS['env-to-xml'].handler('A=1') === T.envToXML('A=1'), 'env-to-xml delegates to Transforms');
  ok(TOOLS['env-to-markdown'].handler.toString().indexOf('envToMarkdown') >= 0, 'env-to-markdown delegates');
  ok(TOOLS['env-to-markdown'].handler('A=1\nB=hello', {}).indexOf('| 1 | hello |') >= 0, 'env-to-markdown row');
  ok(TOOLS['env-to-markdown'].handler('export X=9', {}).indexOf('| 9 |') >= 0, 'env-to-markdown export prefix');
  ok(TOOLS['env-to-csv'].handler.toString().indexOf('envToCSV') >= 0, 'env-to-csv delegates');
  ok(TOOLS['env-to-csv'].handler('A=1\nB=hello', {}) === 'A,B\n1,hello', 'env-to-csv row');
  ok(TOOLS['env-to-csv'].handler('export X=9', {}) === 'X\n9', 'env-to-csv export prefix');
  ok(TOOLS['env-to-csv'].handler('A=1\nB=hello', { delimiter: 'semicolon' }) === 'A;B\n1;hello', 'env-to-csv delim opt');
  ok(TOOLS['env-to-toml'].handler.toString().indexOf('envToTOML') >= 0, 'env-to-toml delegates');
  ok(TOOLS['env-to-toml'].handler('A=1') === 'A = "1"', 'env-to-toml row');
  ok(TOOLS['env-to-toml'].handler('export X=9') === 'X = "9"', 'env-to-toml export prefix');
  ok(JSON.parse(T.tomlToJSON(TOOLS['env-to-toml'].handler('A=1\nB=hello'))).A === '1', 'env-to-toml round trip');
  ok(TOOLS['env-to-yaml'].handler.toString().indexOf('envToYAML') >= 0, 'env-to-yaml delegates');
  ok(TOOLS['env-to-yaml'].handler('A=1') === 'A: "1"', 'env-to-yaml row');
  ok(TOOLS['env-to-yaml'].handler('export X=9') === 'X: "9"', 'env-to-yaml export prefix');
  ok(TOOLS['env-to-yaml'].handler('A=1\nB=hello').indexOf('B: hello') >= 0, 'env-to-yaml plain passthrough');
  ok(TOOLS['env-to-xml'].handler('A=1\nB=hello').indexOf('<A>1</A>') >= 0, 'env-to-xml basic');
  ok(TOOLS['env-to-xml'].handler('export X=9').indexOf('<X>9</X>') >= 0, 'env-to-xml export prefix');
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
