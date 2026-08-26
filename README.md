# mubdiur.github.io

The Mubdiur Times — personal site, developer toolshed, and an in-browser IDE.

**Fully static.** No server, no build step, no dependencies, no Node.js. Everything
runs in your browser, with a **WebAssembly core** doing the heavy lifting.

## What's inside

- `index.html` — single-page app shell (hash routing: `#/`, `#/ide`, `#/tools`, `#/tools/<slug>`)
- `css/app.css` — the whole design system (graphite & signal-blue dark theme tuned to the [DeepSeek docs](https://api-docs.deepseek.com/) palette, plus the newspaper front page) 
- `fonts/` — **Google Sans Code** (variable 300–700) self-hosted as two woff2 files; it is the site's single typeface. No font CDN anywhere.
- `js/` — vanilla JavaScript: app core (router, palette with fuzzy matching), tool manifest, pages, tools
  - `js/lib/random.js` — unbiased CSPRNG helpers (rejection sampling; every generator uses it)
  - `js/lib/diff.js` — Myers O((N+M)D) shortest-edit line diff powering Text Diff
- `js/ide/` — the in-browser IDE (`#/ide`): single-file editor + Run for 8 languages
- `wasm/core.wasm` — WebAssembly core compiled from `wasm/core.rs` (Rust, `no_std`):
  - **Crypto**: MD5, SHA-1, SHA-256, SHA-384, SHA-512, HMAC, CRC32
  - **QR**: full ISO/IEC 18004 encoder (versions 1–40, all EC levels, scannable)
  - **ASN.1**: DER parser (X.509-ready)
- `portfolio.html` — the dossier page
- `robots.txt`, `sitemap.xml`, `og.png`, `favicon.ico`, `.nojekyll`

## The in-browser IDE

`#/ide` compiles and runs **JavaScript, Python, C, C++, C#, Java, Go and Rust**
entirely in the tab — every compiler/runtime is a WebAssembly build **vendored in
this repo** (nothing is fetched from a CDN):

| Language | Engine (vendored) | License |
|---|---|---|
| JavaScript/Node-lite | sandboxed worker + builtin shim (0 downloads) | — |
| Python | Pyodide (CPython 3.14 → WASM) | MPL-2.0 |
| C / C++ | browsercc (Clang + wasm-ld → WASM) | MIT |
| C# | .NET 10 Mono WASM runtime + Roslyn | MIT |
| Java | 199xVM (TS javac + Rust JVM interpreter → WASM) | GPL-2.0 |
| Go | GopherJS 1.20 (Go compiler → JS) | BSD-3-Clause |
| Rust | rustc → WASM (Cranelift backend, from the Weblings project) | MIT |

Engine payloads lazy-load on first use per language and are persisted in the
browser's Cache Storage API — after the first run of a language there is no
redownload, and the editor state (code + active tab) is saved to localStorage.

**stdin** — the input box below the output panel pipes input to the program:
JavaScript reads it **live** while the program runs (`readline(prompt)` /
`process.stdin`), and Python, C, C++ and Rust take it as a type-ahead buffer
(input typed before pressing Run). Go, C# and Java expose no stdin in their
in-browser engines.

**In-editor diagnostics** — compile and runtime errors are marked in the
editor like a real IDE: a `✕`/`⚠` gutter marker, a line tint, and a wavy
underline on the offending span for C/C++, C++, Rust, Python, JavaScript, Go
and Java. C# is the exception: its vendored .NET host formats Roslyn errors
as `CS####: message` without source positions.

**Kotlin — recorded decision: omitted.** No browser-runnable Kotlin compiler
exists, verified exhaustively (2026-08): the only client-side Kotlin compiler
ever shipped (`kotlin-compiler-js`) was removed from npm/unpkg/jsDelivr and is
unarchived; `kotlinc` is a JVM application and JVM-in-WASM runtimes (CheerpJ)
require a paid license to self-host, which this site's all-local constraint
forbids; the one C-based Kotlin→WASM compiler (MiniKotlin) had its repository
removed. The IDE page and this README document the omission; the user approved
dropping Kotlin ("we can probably just ommit kotlin if they are so eager to not
provide a wasm for kotlin").

Vendored third-party sources live under `js/ide/vendor/*` with their licenses.

### Rebuilding the editor bundle

The CodeMirror editor is bundled once from `build/editor-entry.js` (npm
packages, dev-only) into `js/ide/vendor/editor.js`:

```sh
npm install codemirror @codemirror/* @lezer/* esbuild   # in a scratch dir
esbuild build/editor-entry.js --bundle --format=esm --minify \
  --outfile=js/ide/vendor/editor.js --target=es2020
```

`build/smoke-libs.js` and `build/smoke-tools.js` are Node harnesses for the
core libraries and every rewritten tool handler (`node build/smoke-tools.js`);
`test-ide.js` is a Node harness that runs every runner worker end-to-end
(`node test-ide.js js`, `node test-ide.js go`, …).

## Deploy to GitHub Pages

1. Push this repo to GitHub (public or private).
2. Repo → Settings → Pages → **Deploy from a branch** → `main` / root (`/`).
3. Done — the site is served with zero infrastructure. You can also copy the
   files to any static host (Netlify, Cloudflare Pages, S3, a USB stick…).

There is nothing to install, build, or run. Open `index.html` and it works.

## Rebuilding the WebAssembly core

Only needed if you change the Rust engines (the committed `.wasm` is what ships):

```sh
rustup target add wasm32-unknown-unknown
rustc --target wasm32-unknown-unknown --crate-type cdylib -O -C panic=abort wasm/core.rs -o wasm/core.wasm
```

## License

MIT — see [LICENSE](LICENSE).
