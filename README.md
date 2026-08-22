# mubdiur.github.io

The Mubdiur Times — personal site and 80-utility developer toolshed.

**Fully static.** No server, no build step, no dependencies, no Node.js. Everything
runs in your browser, with a **WebAssembly core** doing the heavy lifting.

## What's inside

- `index.html` — single-page app shell (hash routing: `#/`, `#/tools`, `#/tools/<slug>`)
- `css/app.css` — the whole design system (tinted monochrome + newspaper theme)
- `js/` — vanilla JavaScript: app core, router, 80-tool manifest, pages, and tools
- `wasm/core.wasm` — WebAssembly core compiled from `wasm/core.rs` (Rust, `no_std`):
  - **Crypto**: MD5, SHA-1, SHA-256, SHA-384, SHA-512, HMAC, CRC32
  - **QR**: full ISO/IEC 18004 encoder (versions 1–40, all EC levels, scannable)
  - **ASN.1**: DER parser powering the certificate inspector
- `portfolio.html` — the dossier page
- `robots.txt`, `sitemap.xml`, `og.png`, `favicon.ico`, `.nojekyll`

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
