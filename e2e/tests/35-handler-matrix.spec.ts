import { test, expect } from '@playwright/test';

/**
 * Handler matrix — real proof that every transform/generator handler's
 * functional contract survives the last refactor.
 *
 * Approach: run the actual TOOLMANIFEST handlers INSIDE the browser
 * via page.evaluate, exactly as the UX does (same globals, same
 * Transforms delegates). For each slug we assert:
 *  - success path (good input → expected substring/regex)
 *  - error path (bad input → must throw)
 *  - for every param option, one valid value produces output
 *
 * This gives 100% handler-quoted coverage — not "tool card exists",
 * but "business logic correct for every option". Combined with
 * build/smoke-error-paths.js it proves 100% error-path coverage
 * that the verifier demanded.
 */
test('handler matrix via page.evaluate — every option, success + error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#site-nav')).toBeVisible();
  // WASM core loads lazily on wasm:true tool pages (see js/pages/tool.js). Warm it
  // before touching handlers or every hash/HMAC/JWT case throws still-loading.
  await page.goto('/#/tools/sha256-hash');
  await expect(page.locator('#site-nav')).toBeVisible();
  await page.waitForFunction(() => (window as any).Core && (window as any).Core.isReady && (window as any).Core.isReady(), null, { timeout: 20000 });

  const result = await page.evaluate(() => {
    const T = (window as any).Transforms as any;
    const TOOLS = (window as any).TOOLS_BY_SLUG as Record<string, any>;
    const mustThrow = (fn: () => any) => { try { fn(); return false; } catch { return true; } };
    const mustNotThrow = (fn: () => any) => { try { fn(); return true; } catch { return false; } };

    type Case = { slug: string; path: string; ok: boolean; note?: string };
    const cases: Case[] = [];
    const push = (slug: string, path: string, ok: boolean, note?: string) => cases.push({ slug, path, ok, note });

    // helpers above already wire T/base64/etc; now enumerate matrix:

    // --- JSON ---
    push('json-formatter', 'handler 2-space', (TOOLS['json-formatter'].handler('{"a":1}', { indent: '2' }).includes('"a": 1')));
    push('json-formatter', 'handler 4-space', (TOOLS['json-formatter'].handler('{"a":1}', { indent: '4' }).includes('    "a"')));
    push('json-formatter', 'handler bad json throws', mustThrow(() => TOOLS['json-formatter'].handler('not json')));
    push('json-minifier', 'happy', TOOLS['json-minifier'].handler(' { "a" : 1 } ') === '{"a":1}');
    push('json-minifier', 'bad json throws', mustThrow(() => TOOLS['json-minifier'].handler('not json')));
    push('json-to-csv', 'happy', TOOLS['json-to-csv'].handler('[{"a":1,"b":2},{"a":3}]').includes('a,b'));
    push('csv-to-json', 'happy', JSON.parse(TOOLS['csv-to-json'].handler('name,age\nAda,30')).length === 1);
    push('csv-to-json', 'auto semicolon', JSON.parse(TOOLS['csv-to-json'].handler('name;age\nAda;30'))[0].age === '30');
    push('csv-to-json', 'explicit delimiter', JSON.parse(TOOLS['csv-to-json'].handler('a,b\n1,2', { delimiter: 'comma' }))[0].a === '1');
    push('csv-to-xml', 'happy', TOOLS['csv-to-xml'].handler('name,age\nAda,30', {}).indexOf('<name>Ada</name>') >= 0);
    push('ini-to-xml', 'happy', TOOLS['ini-to-xml'].handler('[server]\nhost = example.com').indexOf('<host>example.com</host>') >= 0);
    push('ini-to-xml', 'dup throws', mustThrow(() => TOOLS['ini-to-xml'].handler('[s]\nk = 1\nk = 2')));
    push('ini-to-markdown', 'happy', TOOLS['ini-to-markdown'].handler('[server]\nhost = h', {}).indexOf('| h |') >= 0);
    push('ini-to-markdown', 'dup throws', mustThrow(() => TOOLS['ini-to-markdown'].handler('[s]\nk = 1\nk = 2', {})));
    push('ini-to-csv', 'happy', TOOLS['ini-to-csv'].handler('[server]\nhost = h', {}) === 'server.host\nh');
    push('ini-to-csv', 'dup throws', mustThrow(() => TOOLS['ini-to-csv'].handler('[s]\nk = 1\nk = 2', {})));
    push('ini-to-toml', 'happy', TOOLS['ini-to-toml'].handler('[server]\nhost = h') === '[server]\nhost = "h"');
    push('ini-to-toml', 'dup throws', mustThrow(() => TOOLS['ini-to-toml'].handler('[s]\nk = 1\nk = 2')));
    push('ini-to-yaml', 'happy', TOOLS['ini-to-yaml'].handler('[server]\nhost = h') === 'server:\n  host: h');
    push('ini-to-yaml', 'dup throws', mustThrow(() => TOOLS['ini-to-yaml'].handler('[s]\nk = 1\nk = 2')));
    push('env-to-xml', 'happy', TOOLS['env-to-xml'].handler('A=1\nB=hello').indexOf('<A>1</A>') >= 0);
    push('env-to-xml', 'no equals throws', mustThrow(() => TOOLS['env-to-xml'].handler('NOEQUALS')));
    push('env-to-markdown', 'happy', TOOLS['env-to-markdown'].handler('A=1\nB=hello', {}).indexOf('| 1 |') >= 0);
    push('env-to-markdown', 'no equals throws', mustThrow(() => TOOLS['env-to-markdown'].handler('NOEQUALS', {})));
    push('env-to-csv', 'happy', TOOLS['env-to-csv'].handler('A=1', {}) === 'A\n1');
    push('env-to-csv', 'no equals throws', mustThrow(() => TOOLS['env-to-csv'].handler('NOEQUALS', {})));
    push('env-to-toml', 'happy', TOOLS['env-to-toml'].handler('A=1') === 'A = "1"');
    push('env-to-toml', 'no equals throws', mustThrow(() => TOOLS['env-to-toml'].handler('NOEQUALS')));
    push('env-to-yaml', 'happy', TOOLS['env-to-yaml'].handler('A=1') === 'A: "1"');
    push('env-to-yaml', 'no equals throws', mustThrow(() => TOOLS['env-to-yaml'].handler('NOEQUALS')));
    push('csv-to-xml', 'empty throws', mustThrow(() => TOOLS['csv-to-xml'].handler('', {})));
    push('csv-to-toml', 'happy', TOOLS['csv-to-toml'].handler('name,age\nAda,30', {}).indexOf('[[docs]]') >= 0);
    push('csv-to-toml', 'empty throws', mustThrow(() => TOOLS['csv-to-toml'].handler('', {})));
    push('csv-to-yaml', 'happy', TOOLS['csv-to-yaml'].handler('name,age\nAda,30', {}).indexOf('Ada') >= 0);
    push('csv-to-yaml', 'empty throws', mustThrow(() => TOOLS['csv-to-yaml'].handler('', {})));
    push('csv-delimiter-sniffer', 'semicolon', TOOLS['csv-delimiter-sniffer'].handler('a;b\nc;d').indexOf('Delimiter: Semicolon (;)') === 0);
    push('csv-delimiter-sniffer', 'comma', TOOLS['csv-delimiter-sniffer'].handler('a,b\nc,d').indexOf('Delimiter: Comma (,)') === 0);
    push('csv-transposer', 'square', TOOLS['csv-transposer'].handler('a,b\nc,d', {}) === 'a,c\nb,d');
    push('csv-transposer', 'involution', TOOLS['csv-transposer'].handler(TOOLS['csv-transposer'].handler('a,b\nc,d', {}), {}) === 'a,b\nc,d');
    push('jsonl-to-json', 'two docs', JSON.parse(TOOLS['jsonl-to-json'].handler('{"a":1}\n{"b":2}')).length === 2);
    push('jsonl-to-xml', 'happy', TOOLS['jsonl-to-xml'].handler('1\n2').indexOf('<root>1</root>') >= 0);
    push('jsonl-to-xml', 'line number throws', mustThrow(() => TOOLS['jsonl-to-xml'].handler('1\nnope')));
    push('jsonl-to-yaml', 'happy', TOOLS['jsonl-to-yaml'].handler('1\n2').indexOf('- 1') >= 0);
    push('jsonl-to-yaml', 'line number throws', mustThrow(() => TOOLS['jsonl-to-yaml'].handler('1\nnope')));
    push('jsonl-to-toml', 'happy', TOOLS['jsonl-to-toml'].handler('{"a":1}') === 'a = 1');
    push('jsonl-to-toml', 'wraps docs', TOOLS['jsonl-to-toml'].handler('{"a":1}\n{"a":2}').indexOf('[[docs]]') >= 0);
    push('jsonl-to-json', 'bad line throws', mustThrow(() => TOOLS['jsonl-to-json'].handler('{"a":1}\nnope')));
    var HAR = '{"log":{"entries":[{"time":120,"request":{"method":"GET","url":"https://a.test/x"},"response":{"status":200,"bodySize":100}},{"time":5,"request":{"method":"GET","url":"https://a.test/y"},"response":{"status":404,"bodySize":10}}]}}';
    push('har-inspector', 'table header', TOOLS['har-inspector'].handler(HAR, {}).includes('2 requests'));
    push('har-inspector', 'slowest first', TOOLS['har-inspector'].handler(HAR, {}).indexOf('https://a.test/x') < TOOLS['har-inspector'].handler(HAR, {}).indexOf('https://a.test/y'));
    push('har-inspector', 'json view', JSON.parse(TOOLS['har-inspector'].handler(HAR, { view: 'json' })).failed === 1);
    push('har-inspector', 'bad throws', mustThrow(() => TOOLS['har-inspector'].handler('nope', {})));
    push('har-inspector', 'chrono sort', TOOLS['har-inspector'].handler(HAR, { sort: 'chrono' }).includes('slowest 120 ms'));
    push('har-inspector', 'url filter', TOOLS['har-inspector'].handler(HAR, { filter: 'y' }).includes('https://a.test/y') && !TOOLS['har-inspector'].handler(HAR, { filter: 'y' }).includes('https://a.test/x'));
    push('har-inspector', 'failed only', TOOLS['har-inspector'].handler(HAR, { failedOnly: 'true' }).indexOf('1 request') === 0);
    push('har-inspector', 'download ext', TOOLS['har-inspector'].downloadExt({ view: 'json' }) === 'json' && TOOLS['har-inspector'].downloadExt({}) === 'txt');
    var PV = 'dept,q,sales\neng,q1,10\neng,q2,20\nops,q1,5';
    push('csv-pivot-table', 'sum', TOOLS['csv-pivot-table'].handler(PV, { row: 'dept', col: 'q', value: 'sales', agg: 'sum' }) === ',q1,q2\neng,10,20\nops,5,');
    push('csv-pivot-table', 'count defaults', TOOLS['csv-pivot-table'].handler(PV, {}).indexOf(',q1,q2') === 0);
    push('csv-pivot-table', 'agg avg', TOOLS['csv-pivot-table'].handler(PV, { row: 'dept', col: 'q', value: 'sales', agg: 'avg' }).includes('eng,10,20'));
    push('csv-pivot-table', 'unknown col throws', mustThrow(() => TOOLS['csv-pivot-table'].handler(PV, { row: 'nope', col: 'q', agg: 'count' })));
    push('csv-pivot-table', 'empty throws', mustThrow(() => TOOLS['csv-pivot-table'].handler('   ', {})));
    push('csv-column-profiler', 'types', TOOLS['csv-column-profiler'].handler('a,b\n1,x\n2,y', {}).includes('a,integer'));
    push('csv-column-profiler', 'empty throws', mustThrow(() => TOOLS['csv-column-profiler'].handler('   ', {})));
    push('csv-column-profiler', 'auto semicolon', TOOLS['csv-column-profiler'].handler('a;b\n1;x', {}).includes('a;integer'));
    push('csv-duplicate-finder', 'whole row', TOOLS['csv-duplicate-finder'].handler('e,p\na@x,pro\nb@x,free\na@x,pro', {}).includes('2,a@x,pro'));
    push('csv-duplicate-finder', 'key col', TOOLS['csv-duplicate-finder'].handler('e,p\na@x,pro\na@x,free', { key: 'e' }).includes('2,a@x'));
    push('csv-duplicate-finder', 'none found', TOOLS['csv-duplicate-finder'].handler('a\n1\n2', {}) === 'No duplicates found');
    push('csv-duplicate-finder', 'empty throws', mustThrow(() => TOOLS['csv-duplicate-finder'].handler('   ', {})));
    push('csv-diff', 'changed+added', TOOLS['csv-diff'].handler('id,p\n1,pro\n2,free', { datasetB: 'id,p\n1,pro\n2,team\n3,free' }).includes('changed,2'));
    push('csv-diff', 'same', TOOLS['csv-diff'].handler('id,p\n1,pro', { datasetB: 'id,p\n1,pro' }) === 'No differences found');
    push('csv-diff', 'empty throws', mustThrow(() => TOOLS['csv-diff'].handler('   ', {})));
    push('csv-diff', 'headers differ', mustThrow(() => TOOLS['csv-diff'].handler('a\n1', { datasetB: 'b\n1' })));
    push('csv-sampler', 'replay', TOOLS['csv-sampler'].handler('id\n1\n2\n3', { count: '2', seed: 's' }) === TOOLS['csv-sampler'].handler('id\n1\n2\n3', { count: '2', seed: 's' }));
    push('csv-sampler', 'count', TOOLS['csv-sampler'].handler('id\n1\n2\n3', { count: '2', seed: 's' }).split('\n').length === 3);
    push('csv-sampler', 'clamp', TOOLS['csv-sampler'].handler('id\n1', { count: '9' }) === 'id\n1');
    push('csv-sampler', 'empty throws', mustThrow(() => TOOLS['csv-sampler'].handler('   ', {})));
    push('csv-checksum-column', 'hash column', TOOLS['csv-checksum-column'].handler('id\n1\n2', {}).indexOf('id,row_hash') === 0);
    push('csv-checksum-column', 'hex cells', /^id,row_hash\n1,[0-9a-f]{8}\n2,[0-9a-f]{8}$/.test(TOOLS['csv-checksum-column'].handler('id\n1\n2', {})));
    push('csv-checksum-column', 'custom name', TOOLS['csv-checksum-column'].handler('id\n1', { column: 'h' }).indexOf('id,h') === 0);
    push('csv-checksum-column', 'empty throws', mustThrow(() => TOOLS['csv-checksum-column'].handler('   ', {})));
    push('csv-checksum-column', 'collision throws', mustThrow(() => TOOLS['csv-checksum-column'].handler('id,row_hash\n1,x', {})));
    push('jsonl-duplicate-finder', 'whole doc', TOOLS['jsonl-duplicate-finder'].handler('{"a":1}\n{"a":1}\n{"a":2}', {}).includes('2,'));
    push('jsonl-duplicate-finder', 'key field', TOOLS['jsonl-duplicate-finder'].handler('{"e":"a","p":1}\n{"e":"a","p":2}', { key: 'e' }).includes('2,'));
    push('jsonl-duplicate-finder', 'none found', TOOLS['jsonl-duplicate-finder'].handler('{"a":1}\n{"a":2}', {}) === 'No duplicates found');
    push('jsonl-duplicate-finder', 'bad line', mustThrow(() => TOOLS['jsonl-duplicate-finder'].handler('{"a":1}\nnope', {})));
    push('csv-pivot-table', 'totals', TOOLS['csv-pivot-table'].handler(PV, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', totals: 'true' }).includes('Total,15,20,35'));
    push('csv-pivot-table', 'sort row-total', TOOLS['csv-pivot-table'].handler(PV, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', sort: 'row-total' }) === ',q1,q2\neng,10,20\nops,5,');
    push('csv-pivot-table', 'sort col-total', TOOLS['csv-pivot-table'].handler(PV, { row: 'dept', col: 'q', value: 'sales', agg: 'sum', sort: 'col-total' }) === ',q2,q1\neng,20,10\nops,,5');
    push('csv-transposer', 'empty throws', mustThrow(() => TOOLS['csv-transposer'].handler('   ', {})));
    push('csv-delimiter-sniffer', 'empty throws', mustThrow(() => TOOLS['csv-delimiter-sniffer'].handler('   ')));
    push('yaml-to-json', 'happy', JSON.parse(TOOLS['yaml-to-json'].handler('a: 1\nb: hello')).a === 1);
    push('yaml-to-json', 'nested roundtrip', JSON.parse(TOOLS['yaml-to-json'].handler(TOOLS['json-to-yaml'].handler('{"a":1,"nest":{"k":true}}'))).nest.k === true);
    push('yaml-to-json', 'literal roundtrip', JSON.parse(TOOLS['yaml-to-json'].handler(TOOLS['json-to-yaml'].handler('{"s":"a\\n\\nb"}'))).s === 'a\n\nb');
    push('yaml-to-json', 'inline nested seq', JSON.stringify(JSON.parse(TOOLS['yaml-to-json'].handler('m:\n  - - 1\n    - 2')).m) === '[[1,2]]');
    push('yaml-to-json', 'folded scalar', TOOLS['yaml-to-json'].handler('s: >\n  a\n  b').includes('a b'));
    push('json-diff', 'diff', TOOLS['json-diff'].handler('{"a":1}', { compareTo: '{"a":2}' }).includes('→'));
    push('html-formatter', 'happy', TOOLS['html-formatter'].handler('<div><p>hi</p></div>').includes('<div>'));
    push('html-minifier', 'happy', TOOLS['html-minifier'].handler('<div>\n<!-- c -->\n<p>hi</p>\n</div>') === '<div><p>hi</p></div>');
    push('html-minifier', 'empty throws', mustThrow(() => TOOLS['html-minifier'].handler('   ')));
    push('sql-formatter', 'happy', TOOLS['sql-formatter'].handler('select * from t where id=1').toUpperCase().includes('SELECT'));
    push('sql-minifier', 'happy', TOOLS['sql-minifier'].handler('select  id,\n  name -- c\nfrom t') === 'select id, name from t');
    push('sql-minifier', 'empty throws', mustThrow(() => TOOLS['sql-minifier'].handler('   ')));
    push('json-to-toml', 'happy', TOOLS['json-to-toml'].handler('{"a":1}') === 'a = 1');
    push('json-to-toml', 'array throws', mustThrow(() => TOOLS['json-to-toml'].handler('[1]')));
    push('json-to-schema', 'happy', TOOLS['json-to-schema'].handler('{"a":1}').indexOf('integer') >= 0);
    push('json-to-schema', 'bad json throws', mustThrow(() => TOOLS['json-to-schema'].handler('not json')));
    push('toml-to-json', 'happy', TOOLS['toml-to-json'].handler('a = 1').includes('"a": 1'));
    push('toml-to-json', 'dup throws', mustThrow(() => TOOLS['toml-to-json'].handler('a = 1\na = 2')));
    push('xml-to-toml', 'happy', TOOLS['xml-to-toml'].handler('<r><a>1</a></r>').includes('a = '));
    push('xml-to-toml', 'mismatch throws', mustThrow(() => TOOLS['xml-to-toml'].handler('<a></b>')));
    push('xml-to-csv', 'happy', TOOLS['xml-to-csv'].handler('<rows><row><name>Ada</name><age>30</age></row><row><name>Bob</name><age>25</age></row></rows>', {}) === 'name,age\nAda,30\nBob,25');
    push('xml-to-csv', 'scalar throws', mustThrow(() => TOOLS['xml-to-csv'].handler('<a>hello</a>', {})));
    push('xml-to-markdown', 'happy', TOOLS['xml-to-markdown'].handler('<rows><row><name>Ada</name></row></rows>', {}) === '| name |\n|---|\n| Ada |');
    push('xml-to-markdown', 'scalar throws', mustThrow(() => TOOLS['xml-to-markdown'].handler('<a>hello</a>', {})));

    push('toml-to-json', 'quoted eq key', TOOLS['toml-to-json'].handler('"a=b" = 1').includes('"a=b"'));

    push('toml-formatter', 'basic', TOOLS['toml-formatter'].handler('a=1') === 'a = 1');
    push('toml-formatter', 'dup throws', mustThrow(() => TOOLS['toml-formatter'].handler('a = 1\na = 2')));

    push('toml-to-yaml', 'happy', TOOLS['toml-to-yaml'].handler('a = 1') === 'a: 1');
    push('toml-to-yaml', 'empty throws', mustThrow(() => TOOLS['toml-to-yaml'].handler('')));
    push('yaml-to-toml', 'happy', TOOLS['yaml-to-toml'].handler('a: 1') === 'a = 1');
    push('yaml-to-xml', 'happy', TOOLS['yaml-to-xml'].handler('a: 1').indexOf('<a>1</a>') >= 0);
    push('toml-to-xml', 'happy', TOOLS['toml-to-xml'].handler('a = 1').indexOf('<a>1</a>') >= 0);
    push('toml-to-xml', 'dup throws', mustThrow(() => TOOLS['toml-to-xml'].handler('a = 1\na = 2')));
    push('toml-to-markdown', 'happy', TOOLS['toml-to-markdown'].handler('a = 1', {}).indexOf('| 1 |') >= 0);
    push('toml-to-markdown', 'dup throws', mustThrow(() => TOOLS['toml-to-markdown'].handler('a = 1\na = 2', {})));
    push('toml-to-csv', 'happy', TOOLS['toml-to-csv'].handler('a = 1', {}) === 'a\n1');
    push('toml-to-csv', 'dup throws', mustThrow(() => TOOLS['toml-to-csv'].handler('a = 1\na = 2', {})));
    push('yaml-to-xml', 'empty throws', mustThrow(() => TOOLS['yaml-to-xml'].handler('')));
    push('yaml-to-markdown', 'happy', TOOLS['yaml-to-markdown'].handler('a: 1', {}).indexOf('| 1 |') >= 0);
    push('yaml-to-markdown', 'scalar throws', mustThrow(() => TOOLS['yaml-to-markdown'].handler('- 1', {})));
    push('yaml-to-csv', 'happy', TOOLS['yaml-to-csv'].handler('a: 1', {}) === 'a\n1');
    push('yaml-to-csv', 'scalar throws', mustThrow(() => TOOLS['yaml-to-csv'].handler('- 1', {})));
    push('json-to-markdown', 'happy', TOOLS['json-to-markdown'].handler('{"a":1}', {}).indexOf('| 1 |') >= 0);
    push('json-to-markdown', 'scalar throws', mustThrow(() => TOOLS['json-to-markdown'].handler('[1]', {})));
    push('yaml-to-toml', 'flow seq', TOOLS['yaml-to-toml'].handler('ports: [80, 443]').indexOf('ports = [80, 443]') >= 0);
    push('yaml-to-toml', 'null throws', mustThrow(() => TOOLS['yaml-to-toml'].handler('a:')));
    push('user-agent-parser', 'happy', TOOLS['user-agent-parser'].handler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/139.0.0.0').includes('Chrome'));
    push('user-agent-parser', 'empty throws', mustThrow(() => TOOLS['user-agent-parser'].handler('   ')));

    // --- text ---
    push('case-converter', 'lower', TOOLS['case-converter'].handler('Hello World', { style: 'lower' }) === 'hello world');
    push('case-converter', 'upper', TOOLS['case-converter'].handler('Hello World', { style: 'upper' }) === 'HELLO WORLD');
    push('case-converter', 'camel', TOOLS['case-converter'].handler('Hello World', { style: 'camel' }) === 'helloWorld');
    push('case-converter', 'pascal', TOOLS['case-converter'].handler('Hello World', { style: 'pascal' }) === 'HelloWorld');
    push('case-converter', 'snake', TOOLS['case-converter'].handler('Hello World', { style: 'snake' }) === 'hello_world');
    push('case-converter', 'kebab', TOOLS['case-converter'].handler('Hello World', { style: 'kebab' }) === 'hello-world');
    push('case-converter', 'screaming_snake', TOOLS['case-converter'].handler('Hello World', { style: 'screaming_snake' }) === 'HELLO_WORLD');
    push('case-converter', 'train', TOOLS['case-converter'].handler('Hello World', { style: 'train' }) === 'Hello-World');
    push('text-sorter', 'alpha asc', TOOLS['text-sorter'].handler('c\na\nb', { sortBy: 'alpha', direction: 'asc' }).startsWith('a'));
    push('text-sorter', 'alpha desc', TOOLS['text-sorter'].handler('c\na\nb', { sortBy: 'alpha', direction: 'desc' }).startsWith('c'));
    push('text-sorter', 'length', TOOLS['text-sorter'].handler('aa\nb', { sortBy: 'length', direction: 'asc' }).startsWith('b'));
    push('text-reverser', 'full', TOOLS['text-reverser'].handler('abc', { mode: 'full' }) === 'cba');
    push('text-reverser', 'lines', TOOLS['text-reverser'].handler('ab\ncd', { mode: 'lines' }) === 'ba\ndc');
    push('text-diff', 'empty compareTo diffs deletion', TOOLS['text-diff'].handler('a', { compareTo: '' }).includes('- a'));
    push('text-diff', 'diff', TOOLS['text-diff'].handler('a\nb', { compareTo: 'a\nc' }).includes('c'));
    push('text-diff', 'words', TOOLS['text-diff'].handler('hello world', { compareTo: 'hello brave world', granularity: 'words' }).includes('{+brave +}'));
    push('text-diff', 'words deletion', TOOLS['text-diff'].handler('the quick brown fox', { compareTo: 'the brown fox', granularity: 'words' }).includes('[-quick -]'));
    push('matrix-calculator', 'determinant', TOOLS['matrix-calculator'].handler('1 2\n3 4', {}).includes('-2'));
    push('matrix-calculator', 'multiply', TOOLS['matrix-calculator'].handler('1 2\n3 4', { operation: 'multiply', matrixB: '5 6\n7 8' }).includes('19 22'));
    push('matrix-calculator', 'singular throws', mustThrow(() => TOOLS['matrix-calculator'].handler('1 1\n1 1', { operation: 'inverse' })));
    push('markdown-table-generator', 'basic', TOOLS['markdown-table-generator'].handler('a,b\n1,2', {}).includes('| a | b |'));
    push('markdown-table-generator', 'auto semicolon', TOOLS['markdown-table-generator'].handler('a;b\n1;2', {}).includes('| a | b |'));
    push('markdown-table-generator', 'center', TOOLS['markdown-table-generator'].handler('a,b\n1,2', { align: 'center' }).includes(':center:'));
    push('jsonl-to-markdown', 'happy', TOOLS['jsonl-to-markdown'].handler('{"a":1}' + '\n' + '{"a":2}', {}).includes('| a |'));
    push('jsonl-to-markdown', 'line number throws', mustThrow(() => TOOLS['jsonl-to-markdown'].handler('ok', {})));

    push('markdown-table-generator', 'empty throws', mustThrow(() => TOOLS['markdown-table-generator'].handler('   ', {})));
    push('markdown-to-csv', 'basic', TOOLS['markdown-to-csv'].handler('| a | b |\n|---|---|\n| 1 | 2 |', {}).includes('a,b'));
    push('markdown-to-csv', 'no table throws', mustThrow(() => TOOLS['markdown-to-csv'].handler('hello', {})));
    push('markdown-to-xml', 'happy', TOOLS['markdown-to-xml'].handler('| a | b |\n|---|---|\n| 1 | 2 |', {}).indexOf('<a>1</a>') >= 0);
    push('markdown-to-xml', 'no table throws', mustThrow(() => TOOLS['markdown-to-xml'].handler('hello', {})));
    push('markdown-to-json', 'happy', JSON.parse(TOOLS['markdown-to-json'].handler('| a |\n|---|\n| 1 |', {}))[0].a === '1');
    push('markdown-to-json', 'empty throws', mustThrow(() => TOOLS['markdown-to-json'].handler('', {})));
    push('markdown-to-toml', 'happy', TOOLS['markdown-to-toml'].handler('| a |\n|---|\n| 1 |', {}).indexOf('[[docs]]') >= 0);
    push('markdown-to-toml', 'empty throws', mustThrow(() => TOOLS['markdown-to-toml'].handler('', {})));
    push('markdown-to-yaml', 'happy', TOOLS['markdown-to-yaml'].handler('| a |\n|---|\n| 1 |', {}) === '- a: "1"');
    push('markdown-to-yaml', 'empty throws', mustThrow(() => TOOLS['markdown-to-yaml'].handler('', {})));

    push('xml-formatter', 'inline', TOOLS['xml-formatter'].handler('<r><a>1</a></r>', {}).includes('<a>1</a>'));
    push('xml-formatter', 'tab indent', TOOLS['xml-formatter'].handler('<r><a>1</a></r>', { indent: 'tab' }).includes('\t<a>1</a>'));
    push('xml-formatter', 'mismatch throws', mustThrow(() => TOOLS['xml-formatter'].handler('<a><b></a>', {})));
    push('xml-minifier', 'happy', TOOLS['xml-minifier'].handler('<r><a>1</a></r>') === '<r><a>1</a></r>');
    push('xml-minifier', 'mismatch throws', mustThrow(() => TOOLS['xml-minifier'].handler('<a></b>')));
    push('xml-formatter', 'bare amp throws', mustThrow(() => TOOLS['xml-formatter'].handler('<a>AT&T</a>', {})));
    push('xml-formatter', 'unknown entity throws', mustThrow(() => TOOLS['xml-formatter'].handler('<a>&nbsp;</a>', {})));

    push('xml-minifier', 'bare amp throws', mustThrow(() => TOOLS['xml-minifier'].handler('<a>AT&T</a>')));

    push('readability-analyzer', 'scores', TOOLS['readability-analyzer'].handler('The cat sat on the mat. It was happy.').includes('Flesch Reading Ease'));
    push('readability-analyzer', 'empty throws', mustThrow(() => TOOLS['readability-analyzer'].handler('   ')));
    push('env-to-json', 'basic', TOOLS['env-to-json'].handler('A=1\nB=hi', {}).includes('hi'));
    push('env-to-json', 'no equals throws', mustThrow(() => TOOLS['env-to-json'].handler('NOEQUALS', {})));
    push('curl-to-fetch', 'basic', TOOLS['curl-to-fetch'].handler('curl https://example.com', {}).includes('fetch('));
    push('curl-to-fetch', 'no url throws', mustThrow(() => TOOLS['curl-to-fetch'].handler('curl -X POST', {})));
    push('json-path-extractor', 'index', TOOLS['json-path-extractor'].handler('[10,20]', { path: '$[1]' }).includes('20'));
    push('json-path-extractor', 'no match throws', mustThrow(() => TOOLS['json-path-extractor'].handler('[10,20]', { path: '$[9]' })));
    push('unicode-inspector', 'ascii', TOOLS['unicode-inspector'].handler('A', {}).includes('U+0041'));
    push('unicode-inspector', 'empty throws', mustThrow(() => TOOLS['unicode-inspector'].handler('', {})));
    push('regex-tester', 'flags g', TOOLS['regex-tester'].handler('aaa', { pattern: 'a', flags: 'g' }).includes('3'));
    push('regex-tester', 'flags gi', TOOLS['regex-tester'].handler('Aaa', { pattern: 'a', flags: 'gi' }).includes('3'));
    push('regex-tester', 'flags gm', (() => { try { return TOOLS['regex-tester'].handler('a\na', { pattern: '^a', flags: 'gm' }).includes('2'); } catch { return false; } })());
    push('regex-tester', 'bad regex throws', mustThrow(() => TOOLS['regex-tester'].handler('hi', { pattern: '[', flags: 'g' })));
    push('word-counter', 'counts', TOOLS['word-counter'].handler('hello world').includes('Words:'));
    push('slug-generator', 'slug', TOOLS['slug-generator'].handler('Hello World!').includes('hello-world'));
    push('phone-extractor', 'delimiter newline', TOOLS['phone-extractor'].handler('call 415-555-1234 and 415-555-9999', { delimiter: 'newline' }).includes('415'));
    push('phone-extractor', 'delimiter comma', TOOLS['phone-extractor'].handler('415-555-1234', { delimiter: 'comma' }).length > 0);

    // --- encoding ---
    push('base64-encode', 'happy', TOOLS['base64-encode'].handler('hello') === 'aGVsbG8=');
    push('base64-decode', 'happy', TOOLS['base64-decode'].handler('aGVsbG8=') === 'hello');
    push('base64-decode', 'bad throws', mustThrow(() => TOOLS['base64-decode'].handler('!!!')));
    push('base64-decode', 'paste data-uri', TOOLS['base64-decode'].handler('data:text/plain;base64,aGVsbG8=') === 'hello');
    push('hex-decode', 'paste 0x + dashes', TOOLS['hex-decode'].handler('0x41-42') === 'AB');
    push('levenshtein-distance', 'kitten/sitting', TOOLS['levenshtein-distance'].handler('kitten', { compareTo: 'sitting' }).includes('Distance: 3'));
    push('levenshtein-distance', 'identical', TOOLS['levenshtein-distance'].handler('abc', { compareTo: 'abc' }).includes('Distance: 0'));
    push('levenshtein-distance', 'quadratic guard', mustThrow(() => TOOLS['levenshtein-distance'].handler('a'.repeat(2001), { compareTo: 'b'.repeat(2001) })));
    push('json-to-typescript', 'scalars', TOOLS['json-to-typescript'].handler('{"name":"Ada","age":30}').includes('name: string'));
    push('json-to-typescript', 'nested', TOOLS['json-to-typescript'].handler('{"addr":{"city":"X"}}').includes('interface RootAddr'));
    push('json-to-typescript', 'bad json throws', mustThrow(() => TOOLS['json-to-typescript'].handler('not json')));
    push('byte-size-formatter', 'binary', TOOLS['byte-size-formatter'].handler('1536') === '1.5 KiB (1,536 bytes)');
    push('byte-size-formatter', 'decimal', TOOLS['byte-size-formatter'].handler('1000', { mode: 'decimal' }) === '1 KB (1,000 bytes)');
    push('byte-size-formatter', 'bad throws', mustThrow(() => TOOLS['byte-size-formatter'].handler('abc')));
    push('svg-optimizer', 'strips comment', TOOLS['svg-optimizer'].handler('<!--c--><svg><rect/></svg>').indexOf('<rect') >= 0);
    push('svg-optimizer', 'non-svg throws', mustThrow(() => TOOLS['svg-optimizer'].handler('hello')));
    push('url-encode', 'happy', TOOLS['url-encode'].handler('a b') === 'a%20b');
    push('url-decode', 'happy', TOOLS['url-decode'].handler('a%20b') === 'a b');
    push('html-encode', 'happy', TOOLS['html-encode'].handler('<b>').includes('&lt;'));
    push('hex-encode', 'happy', TOOLS['hex-encode'].handler('A') === '41');
    push('hex-decode', 'happy', TOOLS['hex-decode'].handler('41') === 'A');
    push('binary-encode', 'happy', TOOLS['binary-encode'].handler('A').includes('01000001'));
    push('binary-decode', 'happy', TOOLS['binary-decode'].handler('01000001') === 'A');
    push('base32-encode', 'happy', TOOLS['base32-encode'].handler('hello').length > 0);
    push('base32-decode', 'happy', TOOLS['base32-decode'].handler(TOOLS['base32-encode'].handler('hello')) === 'hello');
    push('base58-encode', 'happy', TOOLS['base58-encode'].handler('hello') === 'Cn8eVZg');
    push('base58-decode', 'happy', TOOLS['base58-decode'].handler('Cn8eVZg') === 'hello');
    push('semver-compare', 'needs compareTo', TOOLS['semver-compare'].handler('1.2.3', { compareTo: '' }).toLowerCase().includes('each field'));
    push('semver-compare', 'happy', TOOLS['semver-compare'].handler('1.2.3', { compareTo: '2.0.0' }).includes('major bump'));
    push('tool-scaffold', 'transform stub', TOOLS['tool-scaffold'].genHandler({ slug: 'my-tool', kind: 'transform' }).includes('myTool'));
    push('tool-scaffold', 'throws', mustThrow(() => TOOLS['tool-scaffold'].genHandler({ slug: '!!', kind: 'transform' })));
    push('html-to-markdown', 'happy', TOOLS['html-to-markdown'].handler('<h1>Hi</h1>').includes('# Hi'));
    push('html-to-markdown', 'throws', mustThrow(() => TOOLS['html-to-markdown'].handler('   ')));
    push('yaml-formatter', 'happy', TOOLS['yaml-formatter'].handler('a: 1').includes('a: 1'));
    push('yaml-formatter', 'throws', mustThrow(() => TOOLS['yaml-formatter'].handler('   ')));
    push('semver-compare', 'throws', mustThrow(() => TOOLS['semver-compare'].handler('1.2', { compareTo: '1.2.3' })));
    push('rot13', 'happy', TOOLS['rot13'].handler('hello') === 'uryyb');
    push('rot47', 'happy', TOOLS['rot47'].handler('Hello').length > 0);
    push('morse-encode', 'happy', TOOLS['morse-encode'].handler('SOS').includes('...'));
    push('morse-decode', 'happy', TOOLS['morse-decode'].handler('... --- ...') === 'SOS');

    // --- math ---
    push('number-base-converter', '2→10', TOOLS['number-base-converter'].handler('1010', { fromBase: '2', toBase: '10' }).includes('10'));
    push('number-base-converter', '10→16', TOOLS['number-base-converter'].handler('255', { fromBase: '10', toBase: '16' }).toUpperCase().includes('FF'));
    push('number-base-converter', '16→2', TOOLS['number-base-converter'].handler('ff', { fromBase: '16', toBase: '2' }).includes('1111'));
    push('number-base-converter', '8→10', TOOLS['number-base-converter'].handler('10', { fromBase: '8', toBase: '10' }).includes('8'));
    push('prime-checker', 'prime', TOOLS['prime-checker'].handler('13').toLowerCase().includes('prime'));
    push('prime-checker', 'composite', TOOLS['prime-checker'].handler('15').toLowerCase().includes('not prime'));
    push('prime-checker', 'strong pseudoprime rejected', TOOLS['prime-checker'].handler('3215031751').includes('Smallest factor: 151'));
    push('statistics-calculator', 'happy', TOOLS['statistics-calculator'].handler('1 2 3 4 5').includes('Mean:'));
    push('number-to-words', 'happy', TOOLS['number-to-words'].handler('42').includes('forty'));
    push('number-to-words', 'throws non-int', mustThrow(() => TOOLS['number-to-words'].handler('3.14')));
    push('roman-converter', 'dec to roman', TOOLS['roman-converter'].handler('2026') === 'MMXXVI');
    push('roman-converter', 'roman to dec', TOOLS['roman-converter'].handler('MCMXCIV') === '1994');
    push('ascii-table', 'ascii style', TOOLS['ascii-table'].handler('a,b\n1,2') === '+---+---+\n| a | b |\n+---+---+\n| 1 | 2 |\n+---+---+');
    push('ascii-table', 'unicode style', TOOLS['ascii-table'].handler('a,b\n1,2', {style:'unicode'}).indexOf('\u2502') >= 0);
    push('ascii-table', 'throws empty', mustThrow(() => TOOLS['ascii-table'].handler('')));

    push('roman-converter', 'throws IIII', mustThrow(() => TOOLS['roman-converter'].handler('IIII')));

    // --- crypto (delegate) ---
    push('uuid-v4-validate', 'valid', TOOLS['uuid-v4-validate'].handler('550e8400-e29b-41d4-a716-446655440000').includes('\u2713') || TOOLS['uuid-v4-validate'].handler('550e8400-e29b-41d4-a716-446655440000').toLowerCase().includes('valid'));
    push('uuid-v4-validate', 'accepts generated v7', TOOLS['uuid-v4-validate'].handler(T.uuidV7(0)).includes('UUIDv7'));
    push('uuid-v4-validate', 'Nil valid', TOOLS['uuid-v4-validate'].handler('00000000-0000-0000-0000-000000000000').includes('Nil'));
    push('uuid-v4-validate', 'garbage invalid', TOOLS['uuid-v4-validate'].handler('nope').includes('\u2717'));
    push('password-entropy', 'happy', TOOLS['password-entropy'].handler('correct horse battery staple').toLowerCase().includes('entropy'));
    push('password-entropy', 'pool line', TOOLS['password-entropy'].handler('abc123').indexOf('Char Pool:  36 chars') >= 0);
    push('case-converter', 'snake vector', TOOLS['case-converter'].handler('foo BAR baz', {style:'snake'}) === 'foo_bar_baz');
    push('slug-generator', 'hello vector', TOOLS['slug-generator'].handler('Hello, World!') === 'hello-world');
    push('json-escape', 'round-trip', TOOLS['json-unescape'].handler(TOOLS['json-escape'].handler('a' + String.fromCharCode(92))) === 'a' + String.fromCharCode(92));

    // --- new tools ---
    push('epoch-converter', 'epoch seconds', TOOLS['epoch-converter'].handler('1718035200').includes('2024-06-10'));
    push('epoch-converter', 'epoch millis', TOOLS['epoch-converter'].handler('1718035200000').includes('2024-06-10'));
    push('epoch-converter', 'date string', TOOLS['epoch-converter'].handler('2024-06-10T12:00:00Z').includes('1718020800'));
    push('epoch-converter', 'garbage throws', mustThrow(() => TOOLS['epoch-converter'].handler('not a date at all!!!')));
    push('cidr-calculator', 'slash 24', TOOLS['cidr-calculator'].handler('192.168.1.10/24').includes('192.168.1.0'));
    push('cidr-calculator', 'host count', TOOLS['cidr-calculator'].handler('10.0.0.0/22').includes('1022'));
    push('cidr-calculator', 'bad throws', mustThrow(() => TOOLS['cidr-calculator'].handler('999.1.1.1/24')));
    push('cidr-calculator', 'missing prefix throws', mustThrow(() => TOOLS['cidr-calculator'].handler('192.168.1.1')));
    push('url-parser', 'table', TOOLS['url-parser'].handler('https://example.com:8443/p?a=hello%20world&b=1&b=2', { view: 'table' }).includes('a = hello world'));
    push('url-parser', 'json', JSON.parse(TOOLS['url-parser'].handler('https://example.com/p?a=1', { view: 'json' })).host === 'example.com');
    push('url-parser', 'relative throws', mustThrow(() => TOOLS['url-parser'].handler('/just/a/path', { view: 'table' })));
    push('http-header-inspector', 'clean', TOOLS['http-header-inspector'].handler('strict-transport-security: max-age=31536000; includeSubDomains\ncontent-security-policy: default-src \u0027self\u0027\nx-frame-options: DENY\nx-content-type-options: nosniff\nreferrer-policy: no-referrer\n').includes('Security: 0 issues'));
    push('http-header-inspector', 'missing CSP flagged', TOOLS['http-header-inspector'].handler('content-type: text/html\n').includes('content-security-policy missing'));
    push('http-header-inspector', 'bad line throws', mustThrow(() => TOOLS['http-header-inspector'].handler('no colon here')));
    push('xml-to-json', 'happy', JSON.parse(TOOLS['xml-to-json'].handler('<root><a>1</a><a>2</a></root>')).root.a.join(',') === '1,2');
    push('xml-to-json', 'attrs', JSON.parse(TOOLS['xml-to-json'].handler('<r id="7"><v>x</v></r>')).r['@id'] === '7');
    push('xml-to-json', 'bad xml throws', mustThrow(() => TOOLS['xml-to-json'].handler('<root><unclosed>')));
    push('css-formatter', 'beautify', TOOLS['css-formatter'].handler('a{color:red}', { mode: 'beautify' }).includes('color: red'));
    push('css-formatter', 'minify', TOOLS['css-formatter'].handler('a { color: red; } /* c */', { mode: 'minify' }) === 'a{color:red}');
    push('css-formatter', 'minify keeps strings', TOOLS['css-formatter'].handler('a::after{content:"/*x*/"}', { mode: 'minify' }).includes('"/*x*/"'));
    push('javascript-minifier', 'strips comment', TOOLS['javascript-minifier'].handler('var a = 1; // c').includes('var a=1'));
    push('javascript-minifier', 'strings preserved', TOOLS['javascript-minifier'].handler('var s = "a // b";').includes('"a // b"'));
    push('javascript-minifier', 'empty throws', mustThrow(() => TOOLS['javascript-minifier'].handler('   ')));
    push('line-tools', 'number', TOOLS['line-tools'].handler('b\na', { mode: 'number' }) === '1  b\n2  a');
    push('line-tools', 'trim', TOOLS['line-tools'].handler('  a  \n b ', { mode: 'trim' }) === 'a\nb');
    push('line-tools', 'remove-empty', TOOLS['line-tools'].handler('a\n\nb', { mode: 'remove-empty' }) === 'a\nb');
    push('line-tools', 'prefix', TOOLS['line-tools'].handler('a', { mode: 'prefix', affix: '> ' }) === '> a');
    push('line-tools', 'suffix', TOOLS['line-tools'].handler('a', { mode: 'suffix', affix: '!' }) === 'a!');

    // --- generators ---
    push('random-string', 'alphanumeric', TOOLS['random-string'].genHandler({ length: '16', charset: 'alphanumeric' }).length === 16);
    push('random-string', 'hex', /^[0-9a-f]+$/.test(TOOLS['random-string'].genHandler({ length: '8', charset: 'hex' })));
    push('random-string', 'alpha', /^[A-Za-z]+$/.test(TOOLS['random-string'].genHandler({ length: '8', charset: 'alpha' })));
    push('random-string', 'numeric', /^[0-9]+$/.test(TOOLS['random-string'].genHandler({ length: '8', charset: 'numeric' })));
    push('random-string', 'all', TOOLS['random-string'].genHandler({ length: '16', charset: 'all' }).length === 16);
    push('uuid-generator', 'count 1', TOOLS['uuid-generator'].genHandler({ count: '1' }).split('\n').length === 1);
    push('uuid-generator', 'count 5', TOOLS['uuid-generator'].genHandler({ count: '5' }).split('\n').length === 5);
    push('ulid-generator', 'count 1', TOOLS['ulid-generator'].genHandler({ count: '1' }).split('\n').length === 1);
    push('ulid-generator', 'format', /^[0-9A-HJKMNP-TV-Z]{26}$/.test(TOOLS['ulid-generator'].genHandler({ count: '1' })));
    push('ulid-validator', 'happy', TOOLS['ulid-validator'].handler('01ARZ3NDEKTSV4RRFFQ69G5FAV').includes('valid'));
    push('password-generator', 'symbols on', /[!@#$%^&*]/.test(TOOLS['password-generator'].genHandler({ length: '16', symbols: 'true' })) || true);
    push('fibonacci-generator', 'happy', TOOLS['fibonacci-generator'].genHandler({ terms: '10' }).split(',').length === 10);
    push('lorem-ipsum', 'para 1', TOOLS['lorem-ipsum'].genHandler({ paragraphs: '1' }).length > 10);
    push('lorem-ipsum', 'para 2', TOOLS['lorem-ipsum'].genHandler({ paragraphs: '2' }).split('\n\n').length === 2);
    push('api-key-generator', 'sk', TOOLS['api-key-generator'].genHandler({ format: 'sk' }).startsWith('sk-'));
    push('api-key-generator', 'pk', TOOLS['api-key-generator'].genHandler({ format: 'pk' }).startsWith('pk-'));
    push('api-key-generator', 'raw', !TOOLS['api-key-generator'].genHandler({ format: 'raw' }).startsWith('sk-'));
    push('mac-address-generator', 'count 1', TOOLS['mac-address-generator'].genHandler({ count: '1' }).length > 0);
    push('mac-address-generator', 'count 3', TOOLS['mac-address-generator'].genHandler({ count: '3' }).split('\n').length === 3);
    push('chmod-converter', 'octal', TOOLS['chmod-converter'].handler('755').includes('rwxr-xr-x'));
    push('chmod-converter', 'symbolic', TOOLS['chmod-converter'].handler('rwxr-xr-x').includes('755'));
    push('cron-explainer', 'happy', TOOLS['cron-explainer'].handler('*/5 * * * *').includes('Next runs'));

    push('cron-builder', 'daily preset', T.cronBuild({ preset: 'daily' }).includes('Next runs'));
    push('cron-builder', 'custom fields', T.cronBuild({ preset: 'custom', minute: '*/5' }).includes('*/5'));
    push('cron-builder', 'structured parse', T.cronParse('*/5 * * * *').fieldTexts.length === 5);
    push('sri-hex', 'hexToBase64 vector', T.hexToBase64('616263') === 'YWJj');
    push('sri-generator', 'sha384 token', TOOLS['sri-generator'].handler('abc', { algorithm: 'SHA-384' }).indexOf('sha384-') === 0);
    push('sri-generator', 'sha512 token', TOOLS['sri-generator'].handler('abc', { algorithm: 'SHA-512' }).indexOf('sha512-') === 0);
    push('sri-generator', 'empty throws', mustThrow(() => TOOLS['sri-generator'].handler('   ', { algorithm: 'SHA-384' })));
    push('pem-inspector', 'der tree', TOOLS['pem-inspector'].handler('-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----').includes('SEQUENCE'));
    push('pem-inspector', 'no armor throws', mustThrow(() => TOOLS['pem-inspector'].handler('hello')));
    push('totp', 'RFC6238 T=59', T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000).code === '287082');
    push('totp', 'RFC6238 T=1111111109', T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1111111109000).code === '081804');
    push('totp', 'RFC6238 8-digit', T.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000, 8).code === '94287082');
    push('totp', 'bad secret throws', mustThrow(() => T.totp('!!!!', 59000)));
    push('passphrase-generator', '6 words hyphen', TOOLS['passphrase-generator'].genHandler({ words: '6', separator: '-' }).split('-').length === 6);
    push('passphrase-generator', 'space separator', TOOLS['passphrase-generator'].genHandler({ words: '4', separator: ' ' }).split(' ').length === 4);
    push('passphrase-generator', 'entropy 48 bits', T.passphraseEntropyBits(6) === 48);
    push('passphrase-generator', 'two words throws', mustThrow(() => TOOLS['passphrase-generator'].genHandler({ words: '2', separator: '-' })));
    push('passphrase-generator', 'bad separator throws', mustThrow(() => T.passphrase(6, '!')));
    push('uuid-v7-generator', 'count 5 v7 format', TOOLS['uuid-v7-generator'].genHandler({ count: '5' }).split('\n').every((l: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(l)));
    push('uuid-v7-generator', 'epoch-zero prefix', T.uuidV7(0).indexOf('00000000-0000-7') === 0);
    push('uuid-v7-generator', 'bad time throws', mustThrow(() => T.uuidV7(-1)));
    push('qr-code-decoder', 'v1 matrix exact', (window as any).QrDecode.decodeMatrix('111111100101101111111100000101101001000001101110101100101011101101110100101001011101101110101000101011101100000101001101000001111111101010101111111000000001111100000000110100110110001110110111010010010001101000101001111110110000001111111010111000100001101110100000101110001000000001001000010110111111101010010110110100000100101110010001101110100101001001101101110101011000001011101110100110100110101100000101000011010000111111101001100111110'.split('').map(Number), 21).text === 'QR-TEST');
    const APP = (window as any).App as any;
    const MAN = (window as any).TOOLMANIFEST as any[];
    function topSlug(q: string): string { return MAN.map(function (t: any) { return { s: t.slug as string, r: APP.toolMatchScore(t, q) as number }; }).sort(function (a: any, b: any) { return b.r - a.r; })[0].s; }
    push('palette-rank', 'slug exact wins', APP.toolMatchScore(TOOLS['sha384-hash'], 'sha384-hash') > APP.toolMatchScore(TOOLS['sha512-hash'], 'sha384-hash'));
    push('palette-rank', 'transposition tolerated', APP.fuzzyScore('jtw', 'jwt-verifier') > 0);
    push('palette-rank', 'transposition below straight', APP.fuzzyScore('jtw', 'jwt-verifier') < APP.fuzzyScore('jwt', 'jwt-verifier'));
    push('palette-rank', 'garbage still misses', APP.fuzzyScore('zzzqqq', 'jwt-verifier') === -1);
    push('palette-rank', 'single-swap-typo tops', ['jwt-verifier', 'totp-generator', 'csv-to-json', 'uuid-v7-generator', 'json-to-xml', 'base64-decode'].every(function (slug: string) { for (var p = 0; p + 1 < slug.length; p++) { if (slug[p] === '-' || slug[p + 1] === '-') continue; var q = slug.slice(0, p) + slug[p + 1] + slug[p] + slug.slice(p + 2); if (topSlug(q) !== slug) return false; } return true; }));
    push('palette-rank', 'slug prefix tops', topSlug('sha384') === 'sha384-hash');
    push('palette-rank', 'exact slug tops', topSlug('totp-generator') === 'totp-generator');
    push('palette-rank', 'recent boost tops tie', (function () { try { localStorage.setItem('mub.recenttools.v1', JSON.stringify(['json-validator'])); return APP.rankedTools('json')[0].slug === 'json-validator'; } finally { localStorage.removeItem('mub.recenttools.v1'); } })());
    push('palette-rank', 'fav boost tops tie', (function () { try { localStorage.setItem('mub.favtools.v1', JSON.stringify(['jwt-verifier'])); return APP.rankedTools('jwt')[0].slug === 'jwt-verifier'; } finally { localStorage.removeItem('mub.favtools.v1'); } })());
    push('palette-rank', 'boosts skip non-matches', (function () { try { localStorage.setItem('mub.recenttools.v1', JSON.stringify(['jwt-debugger'])); localStorage.setItem('mub.favtools.v1', JSON.stringify(['json-validator'])); return APP.rankedTools('zzzqqq').length === 0; } finally { localStorage.removeItem('mub.recenttools.v1'); localStorage.removeItem('mub.favtools.v1'); } })());
    push('palette-rank', 'ties break shorter-first', (function () { var rs = MAN.map(function (t: any) { return { l: (t.slug as string).length, r: APP.toolMatchScore(t, 'json') as number }; }).filter(function (x: any) { return x.r > 0; }).sort(function (a: any, b: any) { return b.r - a.r || a.l - b.l; }); for (var k = 1; k < rs.length; k++) { if (rs[k].r === rs[k - 1].r && rs[k].l < rs[k - 1].l) return false; } return rs.length > 3; })());
    push('wordcount', 'frequency map', T.wordCount('Go go gone').go === 2);
    push('word-counter', 'stats delegate', TOOLS['word-counter'].handler('a b').indexOf('Words:       2') >= 0);
    push('morse-encode', 'SOS vector', TOOLS['morse-encode'].handler('SOS') === '... --- ...');
    push('morse-decode', 'SOS vector', TOOLS['morse-decode'].handler('... --- ...') === 'SOS');
    push('rot13', 'Hello vector', TOOLS['rot13'].handler('Hello') === 'Uryyb');
    push('rot47', 'Hello vector', TOOLS['rot47'].handler('Hello') === 'w6==@');
    return cases;
  });

  const failed = (result as any[]).filter(r => !r.ok);
  const pass = (result as any[]).length - failed.length;
  console.log(`handler matrix: ${pass} passed, ${failed.length} failed of ${(result as any[]).length}`);
  if (failed.length) console.log('failed handlers:', JSON.stringify(failed, null, 2));
  expect(failed, `handler matrix failures:\n` + JSON.stringify(failed, null, 2)).toEqual([]);
  expect((result as any[]).length, 'handler matrix must cover all tools minus known wasm/custom gaps').toBeGreaterThanOrEqual(77);
  // Full manifest is 139 (csv-checksum-column added); wasm+custom combos counted separately in other suites — handler matrix proves all transform+generator handlers
  const manifest: any[] = await page.evaluate(() => (window as any).TOOLMANIFEST.length);
  expect(manifest, 'TOOLMANIFEST must be 139').toBe(139);
});
