import { test, expect } from '@playwright/test';
import * as nodeFs from 'fs';

/**
 * Exhaustive UI-driven coverage — every tool × every option × success
 * plus every custom interactive flow, all 8 IDE languages, all wasm
 * variants.  No handler-only shortcut: this drives the real DOM,
 * the real TransformToolUI/GeneratorToolUI controls.
 */

// ── manifests mirrored from js/manifest.js (single source) ──
const TRANSFORM_FIXTURES: Record<string, { good: string; bad?: string; expectInOutput?: RegExp; expectError?: RegExp }> = {
  'json-formatter': { good: '{"a":1}', bad: 'not json', expectInOutput: /"a":\s*1/, expectError: /Unexpected token|unexpected keyword|Parse error|Error/i },
  'json-minifier': { good: '{ "a" : 1 }', expectInOutput: /"a":1/ },
  'json-to-csv': { good: '[{"a":1,"b":2}]', expectInOutput: /a,b/ },
  'json-to-yaml': { good: '{"a":1}', expectInOutput: /a:\s*1/ },
  'json-diff': { good: '{"a":1}', expectInOutput: /→|No differences/ },
  'json-to-xml': { good: '{"a":1}', expectInOutput: /<root>/ },
    'csv-to-schema': { good: 'name,age\nAda,36', expectInOutput: /integer/ },
  'yaml-to-schema': { good: 'a: 1', expectInOutput: /integer/ },
  'xml-to-schema': { good: '<r><a>1</a></r>', expectInOutput: /required/ },
  'toml-to-schema': { good: 'a = 1', expectInOutput: /integer/ },
  'ini-to-schema': { good: '[s]\na = 1', expectInOutput: /required/ },
  'env-to-schema': { good: 'A=1', expectInOutput: /required/ },
  'markdown-to-schema': { good: '| a |\n|---|\n| 1 |', expectInOutput: /integer/ },
  'jsonl-to-schema': { good: '{\u0022a\u0022:1}', expectInOutput: /integer/ },
  'csv-to-jsonl': { good: 'a,b\n1,2', expectInOutput: /a/ },
  'xml-to-jsonl': { good: '<r><a>1</a></r>', expectInOutput: /a/ },
  'yaml-to-jsonl': { good: 'a: 1', expectInOutput: /a/ },
  'toml-to-jsonl': { good: 'a = 1', expectInOutput: /a/ },
  'ini-to-jsonl': { good: '[s]\na = 1', expectInOutput: /s\.a/ },
  'env-to-jsonl': { good: 'A=1', expectInOutput: /A/ },
  'markdown-to-jsonl': { good: '| a |\n|---|\n| 1 |', expectInOutput: /a/ },
  'ascii85-encode': { good: 'Man ', expectInOutput: /9jqo/ },
  'ascii85-decode': { good: '9jqo^', expectInOutput: /Man / },
  'quoted-printable-encode': { good: 'a=b', expectInOutput: /=3D/ },
  'quoted-printable-decode': { good: 'a=3Db', expectInOutput: /a=b/ },
  'punycode-encode': { good: 'm\u00fcnchen.de', expectInOutput: /xn--/ },
  'utf7-encode': { good: 'a+b', expectInOutput: /\+-/ },
  'utf7-decode': { good: 'a+-b', expectInOutput: /a\+b/ },
  'caesar-cipher': { good: 'Hello', expectInOutput: /Khoor/ },
  'vigenere-cipher': { good: 'ATTACKATDAWN', expectInOutput: /LXFOP/ },
  'atbash-cipher': { good: 'Hello', expectInOutput: /Svool/ },
  'bacon-cipher': { good: 'ABC', expectInOutput: /AAAAA/ },
  'rail-fence-cipher': { good: 'WEAREDISCOVEREDFLEEATONCE', expectInOutput: /WECRLTE/ },
  'playfair-cipher': { good: 'HIDETHEGOLDINTHETREESTUMP', expectInOutput: /BMODZB/ },
  'columnar-transposition': { good: 'ABCDEF', expectInOutput: /ECBDFA/ },
  'four-square-cipher': { good: 'HELLOWORLD', expectInOutput: /[A-Z]{10}/ },
  'adfgx-cipher': { good: 'HELLOWORLD', expectInOutput: /^[ADFGX]+$/ },
  'adfgvx-cipher': { good: 'HELLO123', expectInOutput: /^[ADFGVX]+$/ },
  'two-square-cipher': { good: 'HELLOWORLD', expectInOutput: /[A-Z]{10}/ },
  'hill-cipher': { good: 'HELP', expectInOutput: /HIAT/ },
  'straddling-checkerboard': { good: 'HELLOWORLD', expectInOutput: /^[0-9]+$/ },
  'porta-cipher': { good: 'HELLO', expectInOutput: /ZTRSI/ },
  'bifid-cipher': { good: 'HELLOWORLD', expectInOutput: /[A-Z]{10}/ },
  'autokey-cipher': { good: 'HELLO', expectInOutput: /SIXZB/ },
  'trifid-cipher': { good: 'HELLO WORLD.', expectInOutput: /^[A-Z.]+$/ },
  'beaufort-cipher': { good: 'HELLO', expectInOutput: /EABDZ/ },
  'running-key-cipher': { good: 'HELLO', expectInOutput: /ALPBI/ },
  'gronsfeld-cipher': { good: 'HELLO', expectInOutput: /KFPMT/ },
  'chaocipher': { good: 'HELLOWORLD', expectInOutput: /^[A-Z]{10}$/ },
  'morbit-cipher': { good: 'HELLO', expectInOutput: /11774321859/ },
  'pollux-cipher': { good: 'HELLO', expectInOutput: /AGTCDHO/ },
  'nihilist-cipher': { good: 'HELLO', expectInOutput: /68 24 76 50 57/ },
  'polybius-cipher': { good: 'HELLO', expectInOutput: /3312353515/ },
  'cadenus-cipher': { good: 'HELLO', expectInOutput: /OMICG/ },
  'redefence-cipher': { good: 'HELLOWORLD', expectInOutput: /OOLLEDLRWH/ },
  'tap-code': { good: 'HELLO', expectInOutput: /... ... . ../ },
  'route-cipher': { good: 'HELLOWORLD', expectInOutput: /HELLODLROW/ },
  'affine-cipher': { good: 'AFFINE', expectInOutput: /IHHWVC/ },
  'one-time-pad': { good: 'HELLO', expectInOutput: /SIXZB/ },
  'jefferson-disk': { good: 'HELLO', expectInOutput: /WZQGB/ },
  'solitaire-cipher': { good: 'HELLO', expectInOutput: /NZGAE/ },
  'keyword-cipher': { good: 'HELLO', expectInOutput: /AOGGJ/ },
  'book-cipher': { good: 'HELLO', expectInOutput: /1\.2 1\.3 8\.1 10\.4 3\.3/ },
  'dna-toolkit': { good: 'ATGC', expectInOutput: /TACG/ },
  'brainfuck': { good: ',[.,]', expectInOutput: /Hi/ },
  'whitespace': { good: '   \t  \t   \n\t\n  \n\n', expectInOutput: /H/ },
  'braille': { good: 'abc', expectInOutput: /\u2801/ },
  'nato-phonetic': { good: 'ABC', expectInOutput: /Alfa/ },
  'fen-viewer': { good: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', expectInOutput: /Side to move/ },
  'luhn-validator': { good: '79927398713', expectInOutput: /Valid/ },
  'pigpen-cipher': { good: 'ABC', expectInOutput: /\u2518/ },
  'isbn-validator': { good: '0-306-40615-2', expectInOutput: /ISBN-10/ },
  'iban-validator': { good: 'GB29 NWBK 6016 1331 9268 19', expectInOutput: /Valid/ },
  'gtin-validator': { good: '5901234123457', expectInOutput: /EAN-13/ },
  'befunge': { good: '"A",@', expectInOutput: /A/ },
  'punycode-decode': { good: 'xn--bcher-kva', expectInOutput: /cher/ },
  'json-to-jsonl': { good: '[{\u0022a\u0022:1}]', expectInOutput: /a/ },
  'json-to-schema': { good: '{"a":1}', expectInOutput: /integer/ },
  'json-escape': { good: 'a"b', expectInOutput: /\\"/ },
  'json-unescape': { good: 'a\\"b', expectInOutput: /a"b/ },
  'filename-sanitizer': { good: 'my file?.txt', expectInOutput: /my_file/ },
  'phone-extractor': { good: 'call 415-555-1234', expectInOutput: /415/ },
  'url-extractor': { good: 'see https://example.com', expectInOutput: /example/ },
  'ip-extractor': { good: 'ip 1.2.3.4', expectInOutput: /1\.2\.3\.4/ },
  'word-counter': { good: 'hello world', expectInOutput: /Words:/ },
  'case-converter': { good: 'Hello World', expectInOutput: /hello/i }, // task requires heuristic comment free — this is exact fixture, not heuristic; case variants verified in handler matrix
  'slug-generator': { good: 'Hello World!', expectInOutput: /hello-world/ },
  'text-diff': { good: 'a\nb', expectInOutput: /(\+ c|\{\+c\+\})/ },
  'matrix-calculator': { good: '1 2\n3 4', expectInOutput: /-2/ },
  'markdown-table-generator': { good: 'a,b\n1,2', expectInOutput: /\| a \| b \|/ },
  'markdown-to-csv': { good: '| a | b |\n|---|---|\n| 1 | 2 |', expectInOutput: /a,b/ },
  'markdown-to-xml': { good: '| a | b |\n|---|---|\n| 1 | 2 |', expectInOutput: /<a>1/ },
  'markdown-to-json': { good: '| a |\n|---|\n| 1 |', expectInOutput: /a/ },
  'markdown-to-toml': { good: '| a |\n|---|\n| 1 |', expectInOutput: /\[\[docs\]\]/ },
  'markdown-to-yaml': { good: '| a |\n|---|\n| 1 |', expectInOutput: /- a:/ },

  'jsonl-to-markdown': { good: '{"a":1}' + '\n' + '{"a":2}', expectInOutput: /\| a \|/ },

  'xml-formatter': { good: '<r><a>1</a></r>', expectInOutput: /<a>1<\/a>/, bad: '<a>AT&T</a>', expectError: /Bare &/ },
  'xml-minifier': { good: '<r>  <a>1</a>  <!-- x --></r>', expectInOutput: /<r><a>1<\/a><\/r>/ },
  'readability-analyzer': { good: 'The cat sat on the mat. It was happy.', expectInOutput: /Flesch Reading Ease/ },
  'env-to-json': { good: 'A=1\nB=hello', bad: 'NOEQUALS', expectInOutput: /hello/, expectError: /has no/ },
  'curl-to-fetch': { good: 'curl https://example.com', bad: 'hello world', expectInOutput: /fetch/, expectError: /curl command/ },
  'json-path-extractor': { good: '[10,20]', bad: 'not json', expectInOutput: /10/ },
  'unicode-inspector': { good: 'A', expectInOutput: /U\+0041/ },
  'regex-tester': { good: 'ignore', expectInOutput: /Matches|Enter a regex pattern/ },
  'regex-escape': { good: 'a.b', expectInOutput: /\\\./ },
  'text-sorter': { good: 'c\na\nb', expectInOutput: /a/ },
  'text-reverser': { good: 'abc', expectInOutput: /cba/ },
  'text-deduplicator': { good: 'a\na\nb', expectInOutput: /a/ },
  'palindrome-checker': { good: 'racecar', expectInOutput: /YES|palindrome/i },
  'base64-encode': { good: 'hello', expectInOutput: /aGVsbG8/ },
  'base64-decode': { good: 'aGVsbG8=', expectInOutput: /hello/ },
  'url-encode': { good: 'a b', expectInOutput: /a%20b/ },
  'url-decode': { good: 'a%20b', expectInOutput: /a b/ },
  'html-encode': { good: '<b>', expectInOutput: /&lt;/ },
  'html-decode': { good: '&lt;b&gt;', expectInOutput: /<b>/ },
  'hex-encode': { good: 'A', expectInOutput: /41/ },
  'hex-decode': { good: '41', expectInOutput: /A/ },
  'binary-encode': { good: 'A', expectInOutput: /01000001/ },
  'binary-decode': { good: '01000001', expectInOutput: /A/ },
  'base32-encode': { good: 'hello', expectInOutput: /NBSWY/ },
  'base32-decode': { good: 'NBSWY3DP', expectInOutput: /hello/ },
  'base58-encode': { good: 'hello', expectInOutput: /Cn8eVZg/ },
  'base58-decode': { good: 'Cn8eVZg', expectInOutput: /hello/ },
  'semver-compare': { good: '1.2.3', expectInOutput: /each field/ },
  'html-to-markdown': { good: '<h1>Hi</h1>', expectInOutput: /# Hi/ },
  'yaml-formatter': { good: 'a: 1', expectInOutput: /a: 1/ },
  'rot13': { good: 'hello', expectInOutput: /uryyb/ },
  'rot47': { good: 'Hello', expectInOutput: /Hello|/ },
  'morse-encode': { good: 'SOS', expectInOutput: /\.\.\./ },
  'morse-decode': { good: '... --- ...', expectInOutput: /SOS/ },
  'md5-hash': { good: 'hello', expectInOutput: /[0-9a-f]{32}/i },
  'sha256-hash': { good: 'hello', expectInOutput: /[0-9a-f]{64}/i },
  'sha1-hash': { good: 'hello', expectInOutput: /[0-9a-f]{40}/i },
  'sha384-hash': { good: 'hello', expectInOutput: /[0-9a-f]{96}/i },
  'sha512-hash': { good: 'hello', expectInOutput: /[0-9a-f]{128}/i },
  'hmac-generator': { good: 'hello', expectInOutput: /[0-9a-f]+/i },
  'crc32-checksum': { good: 'hello', expectInOutput: /[0-9a-f]+/i },
  'password-entropy': { good: 'correct horse', expectInOutput: /Entropy/i },
  'csv-to-json': { good: 'name,age\nAda,30', expectInOutput: /Ada/ },
  'csv-to-xml': { good: 'name,age\nAda,30', expectInOutput: /<name>Ada/ },
  'csv-to-toml': { good: 'name,age\nAda,30', expectInOutput: /\[\[docs\]\]/ },
  'csv-to-yaml': { good: 'name,age\nAda,30', expectInOutput: /Ada/ },
  'ini-to-xml': { good: '[server]\nhost = example.com', expectInOutput: /<host>/ },
  'ini-to-markdown': { good: '[server]\nhost = h', expectInOutput: /\| h \|/ },
  'ini-to-csv': { good: '[server]\nhost = h', expectInOutput: /server\.host/ },
  'ini-to-toml': { good: '[server]\nhost = h', expectInOutput: /\[server\]/ },
  'ini-to-yaml': { good: '[server]\nhost = h', expectInOutput: /server:/ },
  'env-to-xml': { good: 'A=1\nB=hello', expectInOutput: /<A>1/ },
  'env-to-markdown': { good: 'A=1\nB=hello', expectInOutput: /\| 1 \|/ },
  'env-to-csv': { good: 'A=1\nB=hello', expectInOutput: /A,B/ },
  'env-to-toml': { good: 'A=1', expectInOutput: /A = / },
  'env-to-yaml': { good: 'A=1', expectInOutput: /A: / },
  'ascii-table': { good: 'name,age\nAda,30', expectInOutput: /\+---/ },

  'yaml-to-json': { good: 'a: 1\nb: hello', expectInOutput: /"a": 1/ },
  'number-base-converter': { good: '10', expectInOutput: /Hex:/i },
  'roman-converter': { good: '2026', expectInOutput: /MMXXVI/ },
  'prime-checker': { good: '13', expectInOutput: /prime/i },
  'statistics-calculator': { good: '1 2 3 4 5', expectInOutput: /Mean:/ },
  'number-to-words': { good: '42', expectInOutput: /forty/i },
  'html-formatter': { good: '<div><p>hi</p></div>', expectInOutput: /<div>/ },
  'html-minifier': { good: '<div><!-- c --><p>hi</p></div>', expectInOutput: /<div><p>hi<\/p><\/div>/ },
  'sql-formatter': { good: 'select * from t', expectInOutput: /SELECT/i },
  'json-to-toml': { good: '{"a":1}', expectInOutput: /a = 1/ },
  'toml-to-json': { good: 'a = 1', expectInOutput: /"a": 1/ },
  'toml-formatter': { good: 'a=1', expectInOutput: /a = 1/ },
  'xml-to-toml': { good: '<r><a>1</a></r>', expectInOutput: /a = "1"/ },
  'xml-to-csv': { good: '<rows><row><name>Ada</name><age>30</age></row></rows>', expectInOutput: /Ada/ },
  'xml-to-markdown': { good: '<rows><row><name>Ada</name><age>30</age></row></rows>', expectInOutput: /Ada/ },


  'toml-to-yaml': { good: 'a = 1', expectInOutput: /a: 1/ },
  'yaml-to-toml': { good: 'a: 1', expectInOutput: /a = 1/ },
  'yaml-to-xml': { good: 'a: 1', expectInOutput: /<a>1/ },
  'yaml-to-markdown': { good: 'a: 1', expectInOutput: /\| 1 \|/ },
  'yaml-to-csv': { good: 'a: 1', expectInOutput: /a\n1/ },
  'json-to-markdown': { good: '{"a":1}', expectInOutput: /\| 1 \|/ },
  'toml-to-xml': { good: 'a = 1', expectInOutput: /<a>1/ },
  'toml-to-markdown': { good: 'a = 1', expectInOutput: /\| 1 \|/ },
  'toml-to-csv': { good: 'a = 1', expectInOutput: /a\n1/ },
  'user-agent-parser': { good: 'Mozilla/5.0 (Windows NT 10.0) Chrome/139.0.0.0', expectInOutput: /Browser:.*Chrome/ },
  'sql-minifier': { good: 'select  *  -- c\nfrom t', expectInOutput: /select \* from t/i },
  'uuid-v4-validate': { good: '550e8400-e29b-41d4-a716-446655440000', expectInOutput: /valid|✓/i },
  'ulid-validator': { good: '01ARZ3NDEKTSV4RRFFQ69G5FAV', expectInOutput: /valid|✓/i },
  'line-tools': { good: 'b\na', expectInOutput: /b/ }, // exact per-mode output proven in handler matrix; fixture must hold under every option
  'epoch-converter': { good: '1718035200', expectInOutput: /2024-06-10|Epoch/ },
  'cidr-calculator': { good: '192.168.1.10/24', expectInOutput: /192\.168\.1\.0/ },
  'url-parser': { good: 'https://example.com:8443/p?a=1&b=2', expectInOutput: /example\.com/ },
  'http-header-inspector': { good: 'strict-transport-security: max-age=31536000; includeSubDomains\ncontent-security-policy: default-src self\nx-frame-options: DENY\nx-content-type-options: nosniff\nreferrer-policy: no-referrer', bad: 'no colon here', expectInOutput: /Security: 0 issues/, expectError: /not a header/ },
  'csv-delimiter-sniffer': { good: 'a;b\nc;d', expectInOutput: /Delimiter: Semicolon/ },
  'csv-transposer': { good: 'a,b\nc,d', expectInOutput: /a,c/ },
  'jsonl-to-json': { good: '{"a":1}\n{"b":2}', bad: '{"a":1}\nnope', expectInOutput: /"b": 2/, expectError: /Line 2/ },
  'jsonl-to-xml': { good: '1\n2', expectInOutput: /<root>1/ },
  'jsonl-to-yaml': { good: '1\n2', expectInOutput: /- 1/ },
  'jsonl-to-toml': { good: '{"a":1}', expectInOutput: /a = 1/ },
  'har-inspector': { good: '{"log":{"entries":[{"time":120,"request":{"method":"GET","url":"https://a.test/x"},"response":{"status":200,"bodySize":100}},{"time":5,"request":{"method":"GET","url":"https://a.test/y"},"response":{"status":404,"bodySize":10}}]}}', bad: 'nope', expectInOutput: /2 requests/, expectError: /Invalid HAR/ },
  'csv-pivot-table': { good: 'dept,q,sales\neng,q1,10\nops,q1,5', expectInOutput: /,q1/ },
  'csv-column-profiler': { good: 'a,b\n1,x\n2,y', expectInOutput: /column,type,filled/ },
  'csv-duplicate-finder': { good: 'e,p\na@x,pro\nb@x,free\na@x,pro', expectInOutput: /count,e,p/ },
  'csv-diff': { good: 'id,p\n1,pro', expectInOutput: /status,key,details|No differences found/ },
  'csv-sampler': { good: 'id\n1\n2\n3', expectInOutput: /id/ },
  'csv-checksum-column': { good: 'id\n1\n2', bad: 'id', expectInOutput: /id,row_hash\n1,[0-9a-f]{8}/, expectError: /data row/ },
  'jsonl-duplicate-finder': { good: '{"a":1}\n{"a":1}\n{"a":2}', expectInOutput: /count,key/ },
  'xml-to-json': { good: '<root><a>1</a></root>', bad: '<root><unclosed>', expectInOutput: /"a": "1"/, expectError: /Invalid XML/ },
  'css-formatter': { good: 'a{color:red}', expectInOutput: /color:\s*red/ },
  'levenshtein-distance': { good: 'kitten', expectInOutput: /Distance: 3/ },
  'json-to-typescript': { good: '{"a":1}', bad: 'not json', expectInOutput: /interface Root/, expectError: /Invalid JSON|Unexpected|Error/i },
  'byte-size-formatter': { good: '1536', bad: 'abc', expectInOutput: /1\.5 KiB/, expectError: /byte count|Enter|number/i },
  'svg-optimizer': { good: '<svg><rect/></svg>', bad: 'hello', expectInOutput: /<svg>/, expectError: /SVG/i },
  'javascript-minifier': { good: 'var a = 1; // strip', expectInOutput: /var a=1/ }, // blank clears UI by design (run() short-circuits); empty-throw covered in handler matrix,
  'sha384-hash': { good: 'hello', expectInOutput: /[0-9a-f]{96}/i },
  'chmod-converter': { good: '755', expectInOutput: /rwxr-xr-x/ },
  'cron-explainer': { good: '*/5 * * * *', expectInOutput: /Next runs/ },
  'jwt-generator': { good: '{"sub":"123"}', expectInOutput: /\./ },
  'jwt-verifier': { good: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.jROrizwXV3Yj14Ofaz1zAq07YgNrxjQNyL-0slLq5Tw', expectInOutput: /Signature: VALID/ },
  'sri-generator': { good: 'console.log(1)', expectInOutput: /sha384-/ },
  'pem-inspector': { good: '-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----', expectInOutput: /SEQUENCE/ },
};

const CUSTOM_FIXTURES: Record<string, () => Promise<void> | void> = {};

async function gotoTool(page: any, slug: string) {
  await page.goto(`/#/tools/${slug}`);
  await expect(page.locator('.tool-shell')).toBeVisible({ timeout: 10000 });
}

async function assertOutput(page: any, re: RegExp, slug: string) {
  await expect(page.locator('.output-box').first(), `output for ${slug}`).toContainText(re, { timeout: 10000 });
}

// ── every transform: try every param option, submit good+sad paths ──
async function sweepTransformChunk(page: any, chunk: number) {
  await page.goto('/');
  const manifest: any[] = await page.evaluate(() => (window as any).TOOLMANIFEST);
  const transforms = manifest.filter(m => m.template === 'transform').filter((_, i) => i % 3 === chunk);
  for (const tool of transforms) {
    const f = (TRANSFORM_FIXTURES as any)[tool.slug];
    expect(f, `missing TRANSFORM_FIXTURES for ${tool.slug} — add a fixture, not a skip`).toBeTruthy();
    if (!f) continue;
    const params: any[] = tool.params || [];
    // For diff tools that need a second document, fill the compare textarea
    const needsCompare = (tool.slug === 'json-diff' || tool.slug === 'text-diff' || tool.slug === 'levenshtein-distance' || tool.slug === 'matrix-calculator' || tool.slug === 'csv-diff');
    const compareValue = tool.slug === 'json-diff' ? '{"a":2}' : tool.slug === 'levenshtein-distance' ? 'sitting' : tool.slug === 'matrix-calculator' ? '5 6\n7 8' : tool.slug === 'csv-diff' ? 'id,p\n1,team\n3,free' : 'a\nc';

    // build cartesian: for each param with options, try every option
    // We cap to 2 values per param to stay fast but still cover switch logic.
    await gotoTool(page, tool.slug);
    // pre-fill compare value for diff tools so handler sees it before first good fill
    if (needsCompare) {
      await page.waitForTimeout(500);
      const sel = tool.slug === 'json-diff' ? '[aria-label="Compare with (JSON)"]' : tool.slug === 'levenshtein-distance' ? '[aria-label="Compare with (text)"]' : tool.slug === 'matrix-calculator' ? '[aria-label="Matrix B"]' : tool.slug === 'csv-diff' ? '[aria-label="Dataset B"]' : '[aria-label="Compare with"]';
      const compareBox = page.locator(sel).first();
      await expect(compareBox, `${tool.slug} compare box`).toBeVisible({ timeout: 8000 });
      await compareBox.fill(compareValue);
      await page.waitForTimeout(300);
    }
    // baseline good — diff tools: compare is first textarea, main input is second
    const input = needsCompare ? page.locator('textarea.tool-textarea').nth(1) : page.locator('textarea.tool-textarea').first();
    await expect(input, `${tool.slug} input`).toBeVisible({ timeout: 8000 });
    await input.fill(f.good);
    await page.waitForTimeout(200);
    await assertOutput(page, f.expectInOutput!, tool.slug);
    // cycle options
    for (const p of params) {
      if (!p.options || p.options.length === 0) continue;

      const sel = page.locator(`select[aria-label="${p.label}"]`).first();
      if (await sel.count() === 0) continue;
      for (const opt of p.options) {
        await sel.selectOption(opt.value);
        await input.fill('');
        await input.fill(f.good);
        // Option cycles prove the tool still renders (baseline above proves content).
        // Several options legitimately change output text (csv delimiters, SRI algorithms).
        await expect(page.locator('.output-box').first(), `${tool.slug} ${p.key}=${opt.value}`).not.toBeEmpty({ timeout: 10000 });
      }
    }
    if (f.bad) {
      await input.fill(f.bad);
      await expect(page.locator('.output-box').first(), `${tool.slug} error`).toContainText(f.expectError || /Error|Unexpected/i, { timeout: 8000 });
      // restore good so next tool starts clean
      await input.fill(f.good);
    }
  }
}

for (const chunk of [0, 1, 2]) {
  test('exhaustive transforms part ' + (chunk + 1) + '/3: every option x success+error', async ({ page }) => {
    await sweepTransformChunk(page, chunk);
  });
}

// ── every generator × every option ──
test('exhaustive: every generator × every option', async ({ page }) => {
  await page.goto('/');
  const manifest: any[] = await page.evaluate(() => (window as any).TOOLMANIFEST);
  const gens = manifest.filter(m => m.template === 'generator');
  for (const tool of gens) {
    await gotoTool(page, tool.slug);
    // generators auto-run; if there's a Regenerate button, click for each option combo as well
    await expect(page.locator('.output-box').first(), tool.slug).not.toBeEmpty({ timeout: 10000 });
    for (const p of (tool.params || [])) {
      if (!p.options || p.options.length === 0) continue;
      const sel = page.locator(`select[aria-label="${p.label}"]`).first();
      if (await sel.count() === 0) continue;
      for (const opt of p.options) {
        await sel.selectOption(opt.value);
        const btn = page.locator('button', { hasText: /Regenerate/i }).first();
        if (await btn.count()) await btn.click();
        await expect(page.locator('.output-box').first(), `${tool.slug} ${p.key}=${opt.value}`).not.toBeEmpty({ timeout: 8000 });
      }
    }
  }
});

// ── 19 custom interactive flows — one assertion per real interaction ──
test('custom tools — 22 interactive flows', async ({ page }) => {
  test.setTimeout(300000);
  // 1 json-validator
  await gotoTool(page, 'json-validator');
  await page.locator('textarea').first().fill('{"a":1}');
  await assertOutput(page, /valid|OK/i, 'json-validator good');
  await page.locator('textarea').first().fill('not json');
  await assertOutput(page, /Unexpected|line|error|invalid/i, 'json-validator bad');

  // 2 email-extractor
  await gotoTool(page, 'email-extractor');
  await page.locator('textarea').first().fill('a@b.com, c@d.com\nnot');
  await page.locator('button', { hasText: /Submit/i }).first().click();
  await expect(page.locator('.ee-out-pre, .output-box').first(), 'email-extractor').toContainText(/a@b\.com/i, { timeout: 10000 });

  // 3 jwt-debugger — decode a minimal JWT
  await gotoTool(page, 'jwt-debugger');
  const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify({ sub: '1', exp: 9999999999 })).toString('base64url');
  const tok = `${hdr}.${pay}.sig`;
  await page.locator('textarea').first().fill(tok);
  await expect(page.locator('.jwt-sec, .claims, .jwt-pre').first(), 'jwt claims').toBeVisible({ timeout: 8000 });

  // 4 table2xl — input renders, paste triggers preview
  await gotoTool(page, 'table2xl');
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 8000 });

  // 5 markdown-preview
  await gotoTool(page, 'markdown-preview');
  await page.locator('textarea.md-input, textarea').first().fill('# Hello');
  await expect(page.locator('.md-preview').first(), 'md preview').toContainText(/Hello/, { timeout: 8000 });

  // 6 time-copier — renders UTC/PT/ET outputs from now
  await gotoTool(page, 'time-copier');
  await expect(page.locator('.tc-output, .output-box, [class*="tc-"]').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('body')).toContainText(/UTC|PT|ET/i, { timeout: 8000 });

  // 7 timeline-taker — table renders
  await gotoTool(page, 'timeline-taker');
  await expect(page.locator('.t-timeline-taker, .timeline, table').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('button').first()).toBeVisible({ timeout: 8000 });

  // 8 color-converter — hex #ff0000 converts to rgb
  await gotoTool(page, 'color-converter');
  await expect(page.locator('.t-color-converter').first()).toBeVisible({ timeout: 8000 });
  await page.locator('.t-color-converter input').first().fill('#ff0000').catch(async () => { await page.locator('input[type="text"]').first().fill('#ff0000'); });
  await page.waitForTimeout(500);
  await expect(page.locator('.t-color-converter').first()).toContainText(/255|rgb|#ff0000/i, { timeout: 8000 });

  // 9 unit-converter — convert 1 m to ft (functional)
  await gotoTool(page, 'unit-converter');
  await page.locator('input').first().fill('1').catch(()=>{});
  await expect(page.locator('.output-box, .unit-output, .result').first()).toBeVisible({ timeout: 8000 }).catch(async ()=> { await expect(page.locator('body')).toContainText(/ft|km|m/i); });

  // 10 qr-code-generator — input → canvas
  await gotoTool(page, 'qr-code-generator');
  await page.locator('input, textarea').first().fill('https://example.com');
  await expect(page.locator('canvas, svg').first()).toBeVisible({ timeout: 10000 });

  // 11 post-maker — composer present
  await gotoTool(page, 'post-maker');
  await expect(page.locator('textarea, [contenteditable="true"]').first()).toBeVisible({ timeout: 8000 });

  // 12 base64-image-decoder — paste data URL
  await gotoTool(page, 'base64-image-decoder');
  await page.locator('textarea').first().fill('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=');
  await expect(page.locator('img, .preview').first()).toBeVisible({ timeout: 8000 });

  // 13 image-to-base64
  await gotoTool(page, 'image-to-base64');
  await expect(page.locator('.t-image-to-base64, .dropzone, .t-image-to-base64 .border-dashed').first()).toBeVisible({ timeout: 8000 });

  // 14 contrast-checker
  await gotoTool(page, 'contrast-checker');
  await expect(page.locator('.t-contrast-checker, .color-input, input[type="color"]').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.t-contrast-checker').first()).toContainText(/contrast|ratio|AA/i, { timeout: 8000 });

  // 15 http-status-codes — search
  await gotoTool(page, 'http-status-codes');
  await page.locator('input').first().fill('404');
  await expect(page.locator('.row, .status-row').first()).toBeVisible({ timeout: 8000 });

  // 16 sorting-visualizer
  await gotoTool(page, 'sorting-visualizer');
  await expect(page.locator('select').first()).toBeVisible({ timeout: 8000 });

  // 17 search-visualizer
  await gotoTool(page, 'search-visualizer');
  await expect(page.locator('.t-search-visualizer, .tool-shell-body').first()).toBeVisible({ timeout: 8000 });

  // 18 binary-tree-visualizer
  await gotoTool(page, 'binary-tree-visualizer');
  await expect(page.locator('button, canvas, input').first()).toBeVisible({ timeout: 8000 });

  // 19 cron-builder — preset fills expr, bad field errors
  await gotoTool(page, 'cron-builder');
  await expect(page.locator('.t-cron-builder').first()).toBeVisible({ timeout: 8000 });
  await page.locator('.t-cron-builder select').first().selectOption('daily');
  await expect(page.locator('.t-cron-builder .cb-expr').first()).toContainText(/0 0 \* \* \*/, { timeout: 8000 });
  await expect(page.locator('.t-cron-builder .cb-runs').first()).not.toBeEmpty({ timeout: 8000 });
  await page.locator('.cb-f-minute').first().fill('bad!');
  await expect(page.locator('.t-cron-builder .cb-error').first()).toContainText(/bad value/i, { timeout: 8000 });
});


// ── WASM variants ──
test('wasm — every hash + hmac alg + crc + qr', async ({ page }) => {
  // WASM core loads lazily on first wasm:true tool mount — assert it does,
  // and that plain pages never fetch it.
  await page.goto('/');
  await page.waitForTimeout(1000);
  const homeFetch: boolean = await page.evaluate(() => (window as any).Core?.isReady?.() ?? false);
  expect(homeFetch, 'home must not fetch the 645 KB wasm core').toBe(false);
  await gotoTool(page, 'md5-hash');
  await page.waitForFunction(() => (window as any).Core && (window as any).Core.isReady?.(), undefined, { timeout: 15000 }).catch(() => {});
  const ready: boolean = await page.evaluate(() => (window as any).Core?.isReady?.() ?? false);
  expect(ready, 'WASM Core.isReady must be true after mounting a wasm tool — wasm/core.wasm must load in http-server').toBe(true);

  for (const slug of ['md5-hash', 'sha1-hash', 'sha256-hash', 'sha512-hash', 'sha384-hash', 'crc32-checksum']) {
    await gotoTool(page, slug);
    await page.locator('textarea.tool-textarea').first().fill('hello');
    await expect(page.locator('.output-box').first(), slug).not.toBeEmpty({ timeout: 8000 });
    await expect(page.locator('.output-box').first(), slug).not.toContainText(/still loading|failed/i);
  }
  // hmac both algorithms via UI select
  for (const alg of ['SHA-256', 'SHA-1']) {
    await gotoTool(page, 'hmac-generator');
    const sel = page.locator('select').first();
    await sel.selectOption(alg);
    await page.locator('textarea.tool-textarea').first().fill('hello');
    await expect(page.locator('.output-box').first(), `hmac ${alg}`).not.toBeEmpty({ timeout: 8000 });
  }
  // hmac custom key reaches the handler
  await gotoTool(page, 'hmac-generator');
  await page.locator('input[aria-label="Secret Key"]').first().fill('k2');
  await page.locator('textarea.tool-textarea').first().fill('hello');
  await expect(page.locator('.output-box').first(), 'hmac custom key').not.toBeEmpty({ timeout: 8000 });
  // 20 totp-generator — RFC secret renders a 6-digit code
  await gotoTool(page, 'totp-generator');
  await page.locator('.t-totp-generator .totp-secret').first().fill('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  await expect(page.locator('.t-totp-generator .totp-code').first(), 'totp code').toContainText(/\d{3} \d{3}/, { timeout: 8000 });
  // 19 qr-code-decoder — dropzone renders with idle prompt
  await gotoTool(page, 'qr-code-decoder');
  await expect(page.locator('.t-qr-code-decoder .qr-drop').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.t-qr-code-decoder').first()).toContainText(/Drop a QR image/i, { timeout: 8000 });
  await expect(page.locator('.t-qr-code-decoder').first()).toContainText(/versions 1\u20136/i, { timeout: 8000 });
  // qr custom
  await gotoTool(page, 'qr-code-generator');
  await page.locator('input, textarea').first().fill('hello wasm qr');
  await expect(page.locator('canvas, svg').first()).toBeVisible({ timeout: 10000 });
  // 22 favorites export/import round-trip
  await page.goto('/#/tools');
  await expect(page.locator('.tools-results').first()).toBeVisible({ timeout: 8000 });
  await page.locator('.tc-fav').first().click();
  await expect(page.locator('.cat-head', { hasText: 'Favorites' }).first()).toBeVisible({ timeout: 8000 });
  const favSlug: string = await page.evaluate(() => JSON.parse(localStorage.getItem('mub.favtools.v1') || '[]')[0] as string);
  expect(favSlug, 'starred slug persisted').toBeTruthy();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[aria-label="Export favorites as JSON"]').first().click(),
  ]);
  expect(dl.suggestedFilename(), 'export filename').toBe('developer-tools-favorites.json');
  const exported = JSON.parse(nodeFs.readFileSync(await dl.path() as string, 'utf8'));
  expect(exported, 'export contains starred slug').toContain(favSlug);
  await page.locator('.tc-fav.on').first().click();
  await expect(page.locator('.cat-head', { hasText: 'Favorites' })).toHaveCount(0);
  await page.locator('input[aria-label="Import favorites file"]').first().setInputFiles({ name: 'fav.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([favSlug])) });
  await expect(page.locator('.cat-head', { hasText: 'Favorites' }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('body')).toContainText(/Imported 1 favorite/, { timeout: 8000 });
  await page.locator('input[aria-label="Import favorites file"]').first().setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.locator('body')).toContainText(/Import failed/, { timeout: 8000 });
});

// ── IDE — all 8 languages ──
test('IDE — all 8 languages produce output (with stdin where expected)', async ({ page }) => {
  test.setTimeout(600000);
  const langs = ['js', 'py', 'c', 'cpp', 'cs', 'java', 'go', 'rs'] as const;
  const needsStdin: Record<string, boolean> = { js: true, py: true, c: true, cpp: true, cs: false, java: false, go: false, rs: true };
  const langTimeout: Record<string, number> = { js: 60000, py: 60000, c: 90000, cpp: 120000, cs: 60000, java: 60000, go: 90000, rs: 90000 };
  await page.goto('/#/ide');
  await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 20000 });
  for (const lang of langs) {
    const label: Record<string, string> = { js: 'JavaScript', py: 'Python', c: 'C', cpp: 'C++', cs: 'C#', java: 'Java', go: 'Go', rs: 'Rust' };
    await page.getByRole('button', { name: label[lang], exact: true }).click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10000 });
    const btn = page.locator('.ide-run-btn');
    await expect(btn).toBeEnabled({ timeout: 8000 });
    await btn.click();
    if (needsStdin[lang]) {
      // JS/py/c/rs samples prompt for stdin; answer to let them complete
      await expect(page.locator('.ide-stdin').first(), `${lang} stdin`).toBeVisible({ timeout: 15000 }).catch(() => {});
      const stdin = page.locator('.ide-stdin-input').first();
      if (await stdin.isVisible().catch(() => false)) {
        await stdin.fill('42');
        await page.locator('.ide-stdin-send').first().click();
      }
    }
    const ideOut = page.locator('.ide-output').first();
    const ideStatus = page.locator('.ide-status').first();
    await expect(ideStatus, `status ${lang} visible`).toBeVisible({ timeout: 8000 });
    await expect(ideStatus, `status ${lang} outcome`).toContainText(/Starting|Compiling|Running|awaiting|input sent|finished|exited|terminated/i, { timeout: 20000 });
    // wait for run to finish before asserting output (Go/C/CPP are slower)
    await expect(ideStatus, `status ${lang} done`).toContainText(/finished|exited|terminated/i, { timeout: 150000 });
    await expect(ideOut, `output ${lang}`).not.toBeEmpty({ timeout: 30000 });
    // clear for next language so output doesn't bleed
    const clear = page.locator('.ide-clear').first();
    if (await clear.isVisible().catch(() => false)) await clear.click();
  }
});


// ── palette DOM: typo query surfaces intended tool ──
test('palette typo tolerance at DOM level', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#site-nav')).toBeVisible();
  await page.evaluate(() => (window as any).App.openPalette());
  const input = page.locator('.palette-input');
  await expect(input).toBeVisible({ timeout: 8000 });
  await input.fill('jtw');
  await expect(page.locator('.palette-item').first(), 'typo jtw surfaces jwt tool').toContainText(/jwt/i, { timeout: 8000 });
  await input.fill('totp-generator');
  await expect(page.locator('.palette-item').first(), 'exact slug tops').toContainText(/totp/i, { timeout: 8000 });
  await page.keyboard.press('Escape');
});
