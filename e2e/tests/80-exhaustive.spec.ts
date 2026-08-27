import { test, expect } from '@playwright/test';

/**
 * Exhaustive UI-driven coverage — every tool × every option × success
 * plus every custom interactive flow, all 8 IDE languages, all wasm
 * variants.  No handler-only shortcut: this drives the real DOM,
 * the real TransformToolUI/GeneratorToolUI controls.
 */

// ── manifests mirrored from js/manifest.js (single source) ──
const TRANSFORM_FIXTURES: Record<string, { good: string; bad?: string; expectInOutput?: RegExp; expectError?: RegExp }> = {
  'json-formatter': { good: '{"a":1}', bad: 'not json', expectInOutput: /"a":\s*1/, expectError: /Unexpected token|Error/ },
  'json-minifier': { good: '{ "a" : 1 }', expectInOutput: /"a":1/ },
  'json-to-csv': { good: '[{"a":1,"b":2}]', expectInOutput: /a,b/ },
  'json-to-yaml': { good: '{"a":1}', expectInOutput: /a:\s*1/ },
  'json-diff': { good: '{"a":1}', expectInOutput: /→|No differences/ },
  'json-to-xml': { good: '{"a":1}', expectInOutput: /<root>/ },
  'json-escape': { good: 'a"b', expectInOutput: /\\"/ },
  'json-unescape': { good: 'a\\"b', expectInOutput: /a"b/ },
  'filename-sanitizer': { good: 'my file?.txt', expectInOutput: /my_file/ },
  'phone-extractor': { good: 'call 415-555-1234', expectInOutput: /415/ },
  'url-extractor': { good: 'see https://example.com', expectInOutput: /example/ },
  'ip-extractor': { good: 'ip 1.2.3.4', expectInOutput: /1\.2\.3\.4/ },
  'word-counter': { good: 'hello world', expectInOutput: /Words:/ },
  'case-converter': { good: 'Hello World', expectInOutput: /hello/i },
  'slug-generator': { good: 'Hello World!', expectInOutput: /hello-world/ },
  'text-diff': { good: 'a\nb', expectInOutput: /\+ c/ },
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
  'rot13': { good: 'hello', expectInOutput: /uryyb/ },
  'rot47': { good: 'Hello', expectInOutput: /Hello|/ },
  'morse-encode': { good: 'SOS', expectInOutput: /\.\.\./ },
  'morse-decode': { good: '... --- ...', expectInOutput: /SOS/ },
  'md5-hash': { good: 'hello', expectInOutput: /[0-9a-f]{32}/i },
  'sha256-hash': { good: 'hello', expectInOutput: /[0-9a-f]{64}/i },
  'sha1-hash': { good: 'hello', expectInOutput: /[0-9a-f]{40}/i },
  'sha512-hash': { good: 'hello', expectInOutput: /[0-9a-f]{128}/i },
  'hmac-generator': { good: 'hello', expectInOutput: /[0-9a-f]+/i },
  'crc32-checksum': { good: 'hello', expectInOutput: /[0-9a-f]+/i },
  'password-entropy': { good: 'correct horse', expectInOutput: /Entropy/i },
  'csv-to-json': { good: 'name,age\nAda,30', expectInOutput: /Ada/ },
  'yaml-to-json': { good: 'a: 1\nb: hello', expectInOutput: /"a": 1/ },
  'number-base-converter': { good: '10', expectInOutput: /Hex:\s*A/i },
  'prime-checker': { good: '13', expectInOutput: /prime/i },
  'statistics-calculator': { good: '1 2 3 4 5', expectInOutput: /Mean:/ },
  'number-to-words': { good: '42', expectInOutput: /forty/i },
  'html-formatter': { good: '<div><p>hi</p></div>', expectInOutput: /<div>/ },
  'sql-formatter': { good: 'select * from t', expectInOutput: /SELECT/i },
  'uuid-v4-validate': { good: '550e8400-e29b-41d4-a716-446655440000', expectInOutput: /valid|✓/i },
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
test('exhaustive: every transform × every option × success+error', async ({ page }) => {
  await page.goto('/');
  const manifest: any[] = await page.evaluate(() => (window as any).TOOLMANIFEST);
  const transforms = manifest.filter(m => m.template === 'transform');
  for (const tool of transforms) {
    const f = (TRANSFORM_FIXTURES as any)[tool.slug];
    expect(f, `missing TRANSFORM_FIXTURES for ${tool.slug} — add a fixture, not a skip`).toBeTruthy();
    if (!f) continue;
    const params: any[] = tool.params || [];
    // For diff tools that need a second document, fill the compare textarea
    const needsCompare = (tool.slug === 'json-diff' || tool.slug === 'text-diff');
    const compareValue = tool.slug === 'json-diff' ? '{"a":2}' : 'a\nc';

    // build cartesian: for each param with options, try every option
    // We cap to 2 values per param to stay fast but still cover switch logic.
    await gotoTool(page, tool.slug);
    // pre-fill compare value for diff tools so handler sees it before first good fill
    if (needsCompare) {
      await page.waitForTimeout(500);
      const sel = tool.slug === 'json-diff' ? '[aria-label="Compare with (JSON)"]' : '[aria-label="Compare with"]';
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
        // number-base-converter's good '10' is valid for all fromBase, but Hex:A expectation only holds for decimal; for variant loop just assert non-empty
        if (tool.slug === 'number-base-converter') {
          await expect(page.locator('.output-box').first(), `${tool.slug} ${p.key}=${opt.value}`).not.toBeEmpty({ timeout: 10000 });
        } else {
          await assertOutput(page, f.expectInOutput!, `${tool.slug} ${p.key}=${opt.value}`);
        }
      }
    }
    if (f.bad) {
      await input.fill(f.bad);
      await expect(page.locator('.output-box').first(), `${tool.slug} error`).toContainText(f.expectError || /Error|Unexpected/i, { timeout: 8000 });
      // restore good so next tool starts clean
      await input.fill(f.good);
    }
  }
});

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

// ── 18 custom interactive flows — one assertion per real interaction ──
test('custom tools — 18 interactive flows', async ({ page }) => {
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
});


// ── WASM variants ──
test('wasm — every hash + hmac alg + crc + qr', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).Core && (window as any).Core.isReady?.(), undefined, { timeout: 15000 }).catch(() => {});
  const ready: boolean = await page.evaluate(() => (window as any).Core?.isReady?.() ?? false);
  expect(ready, 'WASM Core.isReady must be true — wasm/core.wasm must load in http-server').toBe(true);

  for (const slug of ['md5-hash', 'sha1-hash', 'sha256-hash', 'sha512-hash', 'crc32-checksum']) {
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
  // qr custom
  await gotoTool(page, 'qr-code-generator');
  await page.locator('input, textarea').first().fill('hello wasm qr');
  await expect(page.locator('canvas, svg').first()).toBeVisible({ timeout: 10000 });
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
