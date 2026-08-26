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
require('../js/manifest.js');
require('../js/lib/transforms.js');
for (const k of ['CryptoRand', 'MyersDiff', 'TOOLMANIFEST', 'TOOLS_BY_SLUG', 'TOOLCATEGORIES', 'Transforms']) {
  global[k] = window[k];
}

const TOOLS = window.TOOLS_BY_SLUG;
const T = window.Transforms;
let passed = 0, failed = 0;

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
  ok(h('147573952589676412927').indexOf('> 10') >= 0, 'composite 2^67-1 honest verdict (factors > 10^6)');
  ok(h('99999999999999999999').indexOf('not prime') >= 0, 'huge composite rejected');
  let threw = false; try { h('12abc'); } catch (e) { threw = true; }
  ok(threw, 'non-digit input throws');
}
{
  const fib = TOOLS['fibonacci-generator'].genHandler({ terms: '90' }).split(', ');
  const F89 = 1779979416004714189n; // past 2^53 — doubles corrupt from term 79 on
  ok(BigInt(fib[89]) === F89 && BigInt(fib[78]) === 8944394323791464n, 'fibonacci exact at terms 79-90 (BigInt)');
  ok(fib.length === 90 && fib[0] === '0' && fib[1] === '1', 'fibonacci sequence head');
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
  ok(conv('255', { fromBase: '10', toBase: '16' }).includes('Hex: FF'), 'dec->hex');
  ok(conv('1010', { fromBase: '2', toBase: '10' }).includes('Decimal: 10'), 'bin->dec');
  ok(conv('ffffffffffffffff', { fromBase: '16', toBase: '10' }).includes('18446744073709551615'),
    'uint64 max exact (parseInt would truncate)');
  let threw = false; try { conv('129', { fromBase: '8', toBase: '10' }); } catch (e) { threw = true; }
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
}
{
  const diffOut = TOOLS['text-diff'].handler(['a','b','c','d','e'].join('\n'), { compareTo: ['a','b','X','c','d','e'].join('\n') });
  ok(diffOut.split('\n').filter(l => l === '+ X').length === 1 &&
     diffOut.split('\n').filter(l => l.startsWith('  ')).length === 5, 'myers diff via manifest handler');
}
{
  const html = TOOLS['html-formatter'].handler('<div><p>hello</p><br><script>var x = "<div>not markup</div>";</script><!-- c --></div>');
  ok(html.indexOf('var x = "<div>not markup</div>";') >= 0, 'script content preserved verbatim');
  ok(/\n\s*<br>\n/.test(html), 'void element gets own line, no child indent');
  ok(html.includes('<!-- c -->'), 'comment preserved');
}
{
  const sql = TOOLS['sql-formatter'].handler("select id, name from users u left join orders o on o.uid = u.id where name != 'x FROM y select z' and age > 21");
  ok(sql.includes("'x FROM y select z'"), 'quoted literal untouched by keyword breaker');
  ok(/^SELECT id, name/m.test(sql), 'first clause at column 0, uppercased');
  ok(/^FROM/m.test(sql.toUpperCase()), 'FROM on its own line');
  ok(/^  LEFT JOIN/m.test(sql.toUpperCase()), 'join indented two spaces');
  ok(/^    ON\b/m.test(sql.toUpperCase()), 'ON condition indented under join');
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
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
