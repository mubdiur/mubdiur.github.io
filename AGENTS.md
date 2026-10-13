# AGENTS.md

Static personal site + in-browser dev toolshed + IDE. No server, no build, no framework. Open `index.html` directly; deploy via GitHub Pages (branch `main`, root `/`).

## Commands (Node is dev-only: lint + tests)

- `npm run verify` — canonical check: `lint:all` + `npm test`.
- `npm test` — `node build/smoke-libs.js && node build/smoke-tools.js && node build/smoke-error-paths.js && node build/smoke-sw.js && node build/check-versions.js && node build/check-sw-version-bump.js`.
- `npm run lint:all` — `eslint js` + `node --check` on `js/wasm.js js/core.js js/manifest.js`. Use this, not `npm run lint` (narrower).
- `npm run test:e2e` — Playwright (Chromium only) via `e2e/playwright.config.ts`; serves repo root with `http-server` on port 5500. Slow/expensive.
- `npm run verify:full` — `verify` + e2e.
- Focused: `node build/smoke-libs.js`, `node build/smoke-tools.js`, `node test-ide.js <js|py|c|cpp|cs|java|go|rs>` (one language at a time; each run can take minutes, timeout 300s). `node test-ide.js` with no arg runs all 8.

## Structure

- `index.html` — SPA shell. Script order matters and is load order: `icons → lib/random → lib/diff → lib/adaptive-radix → manifest → lib/transforms → wasm → core → pages/* → ide/ide → tools/transform → tools/generator`. `defer` = parallel fetch, in-order exec.
- `js/core.js` — `App` shell: hash router (`#/`, `#/ide`, `#/tools`, `#/tools/<slug>`), palette, `App.el/icon/copy/download`, per-route cleanup of timers/listeners.
- `js/manifest.js` — `TOOLMANIFEST`, `TOOLCATEGORIES`, `TOOLS_BY_SLUG`. Single registry for all 86 tools.
- `js/lib/transforms.js` — single source for encode/decode/convert logic. Manifest handlers must delegate to `Transforms.*`, not duplicate logic.
- `js/lib/random.js` (`CryptoRand`), `js/lib/diff.js` (`MyersDiff`), `js/lib/adaptive-radix.js`.
- `js/pages/tool.js` — template dispatch: `transform` → `TransformToolUI`, `generator` → `GeneratorToolUI`, `custom` → lazy `App.loadToolScript(slug)` + `App.tools[slug].mount()`.
- `js/tools/transform.js`, `js/tools/generator.js` — shared UIs for inline handlers.
- `js/tools/<slug>.js` — custom tools only (19 files). Must call `App.registerTool('<slug>', { mount(root, toolDef), css })`.
- `js/ide/` — browser IDE (`#/ide`). Runners (`*-runner.js`, `run.js`, `cache.js`, `ide.js`) are ES modules / workers; everything else in `js/` is classic scripts (see lint). `js/ide/vendor/*` is vendored third-party (engines, CodeMirror bundle) — never fetch from CDN, never hand-edit.
- `wasm/core.rs` → `wasm/core.wasm` (Rust `no_std`): MD5/SHA-1/256/384/512, HMAC, CRC32, QR encoder, DER parser. JS boundary is `js/wasm.js` (`Core.*`, `loadWasm()`).
- `css/app.css`, `fonts/` (self-hosted woff2 only), `sw.js` (offline shell), `build/` (editor bundle entry + smoke harnesses), `test-ide.js` (runner harness).

## Conventions / gotchas

- Vanilla JS, `(function(){'use strict';...})()` wrappers, `var` style. ESLint: `no-undef` + `no-debugger` are errors. Globals (`App`, `TOOLMANIFEST`, `TOOLS_BY_SLUG`, `Core`, `Transforms`, …) come from `eslint.config.mjs`, not imports. `js/ide/*.js` are `sourceType: module` with `worker` globals; rest are `sourceType: script`.
- Adding a tool: add entry in `js/manifest.js` with `slug/name/desc/category/tags/icon/template`. `transform` = `handler(input, opts)`, `generator` = `genHandler(opts)`, both may throw `Error` with user-facing message. `custom` = new `js/tools/<slug>.js` + manifest entry with `template: 'custom'`. `wasm: true` flag gates lazy WASM load in `pages/tool.js`.
- Randomness: always `CryptoRand` (rejection sampling, zero modulo bias). Never `Math.random` for generators. UUID/password handlers must guarantee class coverage and are asserted in smoke tests.
- Encoding: never use deprecated `escape`/`unescape`; lone surrogates must not throw (covered by `smoke-error-paths.js`).
- Cache-busting is manual and must stay in sync: `App.TOOL_VERSION` (`js/core.js`) versions lazy custom-tool URLs; `?v=` query strings in `index.html` version shell scripts; `sw.js` `SHELL` list + `SW_VERSION` version the offline cache. When changing any shipped JS/CSS, bump the relevant `?v=` and `SW_VERSION`.
- WASM interop (`js/wasm.js`): never cache the `Uint8Array` memory view (memory can grow and detach); every call goes through fresh `mem()`, and every allocating path calls `exp.reset()` in `finally`. `wasm/core.wasm?v=3` URL is separate from shell `?v=`s.
- IDE constraints: engines lazy-load per language, persist in Cache Storage; `stdin` is live (`readline`/`process.stdin`) for JS, type-ahead buffer for Python/C/C++/Rust, unsupported for Go/C#/Java. Diagnostics emit gutter `diag` messages with line numbers except C# (Roslyn `CS####` text, no positions). Kotlin is intentionally omitted (no self-hostable browser compiler; decision recorded in README).
- `e2e/` is gitignored and never ships, except `e2e/tests/35-handler-matrix.spec.ts` and `e2e/tests/80-exhaustive.spec.ts` (negated in `.gitignore`). Do not add new tracked e2e files without updating `.gitignore`.
- Rebuilds (only when sources change; committed artifacts ship):
  - WASM: `rustup target add wasm32-unknown-unknown` then `rustc --target wasm32-unknown-unknown --crate-type cdylib -O -C panic=abort wasm/core.rs -o wasm/core.wasm`
  - Editor bundle: `esbuild build/editor-entry.js --bundle --format=esm --minify --outfile=js/ide/vendor/editor.js --target=es2020` (npm deps are dev/scratch-only)
