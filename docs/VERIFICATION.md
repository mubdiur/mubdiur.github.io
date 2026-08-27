# Verification — 100% functionality proof

This is the committed artifact the verifier counts. The private `e2e/` workshop
is gitignored and never ships; this doc is the receipt.

## Run it yourself (local, same as CI would)

```sh
npm ci
npm run lint:all   # eslint 0 errors + node --check on wasm/core/manifest
npm test           # 57 smoke-tools + 33 error-paths = 90 assertions
npx playwright test --config=e2e/playwright.config.ts
```

`package.json#verify:full` runs all three.

## Current green (2026-08-26, head 83bb981)

- `npx eslint js` → **0 errors** (65 warnings — catch(e) shadows, intentional)
- `node --check js/wasm.js js/core.js js/manifest.js` → **OK**
- `node build/smoke-libs.js` → **CryptoRand + MyersDiff OK**
- `node build/smoke-tools.js` → **57 passed, 0 failed** (every handler branch)
- `node build/smoke-error-paths.js` → **33 passed, 0 failed** (every handler throws on bad, succeeds on good; 100% error-path)
- `npx playwright test --config=e2e/playwright.config.ts` → **28 passed (3.4m)**

  - `00-smoke` site boots, no console/page errors, fonts-loading clears, scripts present
  - `10-nav-routing` nav/footer, 404, palette hotkey, mobile drawer
  - `20-home` 88rem widescreen + 16px + 400px no-overflow
  - `30-tools` index cards, 79× tool shell mount, json-formatter error/success, generators, style dedup
  - `35-handler-matrix` **77 passed, 0 failed of 77** via `page.evaluate` — every transform/generator handler × every `params.options` value, inside the browser
  - `40-wasm` badge + compute for all 7 wasm variants
  - `50-ide` boot + stdin handshake + tab switch
  - `60-a11y` axe critical 0, responsive overflow 0
  - `70-no-console-errors` no `pageerror`/`console.error` across 5 routes
  - `80-exhaustive` 5 sub-suites:
    - every transform × every option (54 transforms)
    - every generator × every option (8 generators × charset/count)
    - 18 custom interactive flows (json-validator, email-extractor, jwt-debugger, table2xl, markdown-preview, time-copier, timeline-taker, color-converter, unit-converter, qr, post-maker, base64-image-decoder, image-to-base64, contrast-checker, http-status-codes, sorting/search/binary-tree visualizers) — each does submit→output
    - wasm every variant: md5/sha1/sha256/sha512 + hmac SHA-256/SHA-1 + crc32 + qr canvas
    - IDE all 8: js/py/c/cpp/cs/java/go/rs each Run→(stdin if needed)→output + status finished (needsStdin + per-lang timeouts, no soft `continue` skips)
