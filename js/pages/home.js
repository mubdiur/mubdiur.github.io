/* ═══════════════════════════════════════════════════════════
   Home — value-first landing. Product leads, author stays in footer.
   Wide-screen layout: hero band + visual, ticker, featured, IDE split,
   bento grid, contact panel. Concise, professional, zero cringe.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var featuredSlugs = ['time-copier', 'json-validator', 'qr-code-generator'];

var tickerTools = ['JSON Validator', 'Password Generator', 'QR Code Generator', 'UUID Generator', 'Base64', 'JWT Debugger', 'Text Diff', 'Time Copier', 'Image Compressor', 'Regex Tester', 'Color Converter', 'Markdown Preview'];

var focusAreas = [
  { icon: 'shield-check', title: 'Private by design', body: 'Inputs stay in the tab. Nothing uploads, nothing tracks — close the tab and it is gone.' },
  { icon: 'download', title: 'Works offline', body: 'App shell precached by a service worker. Tools and IDE shell open with no network.' },
  { icon: 'zap', title: 'No sign-up, ever', body: 'No accounts, no paywalls, no tracking. Open a page and it works.' },
  { icon: 'cpu', title: 'WebAssembly core', body: 'Hashing, crypto and QR encoding run in a vendored WASM core — fast and dependency-free.' },
  { icon: 'command', title: 'Keyboard-first', body: 'Ctrl+K palette and full tool index. Search by name, tag or category.' },
  { icon: 'terminal', title: '8-language IDE', body: 'JavaScript, Python, C, C++, C#, Java, Go and Rust compile and run locally in the tab.' },
  { icon: 'check', title: 'Static and fast', body: 'No server, no framework, no build step. Copy the files anywhere and they run.' },
  { icon: 'box', title: 'Local-first apps', body: 'Tools and IDE today, offline-ready apps tomorrow — everything runs on your device.' },
  { icon: 'eye', title: 'Accessible output', body: 'Copy and Download buttons, clear errors with positions, screen-reader labels throughout.' }
];

var IDE_LANGS = ['JavaScript', 'Python', 'C', 'C++', 'C#', 'Java', 'Go', 'Rust'];

function section(title, sub) {
  return App.el('div', { class: 'home-sec-head' },
    App.el('h2', { class: 'home-h2', text: title }),
    sub ? App.el('p', { class: 'home-sub', text: sub }) : null);
}

function termLine(prompt, text, tone) {
  return App.el('div', { class: 'term-line' },
    App.el('span', { class: 'term-prompt', text: prompt }),
    App.el('span', { class: 'term-text' + (tone ? ' ' + tone : ''), text: text }));
}

function renderHome() {
  var featured = featuredSlugs
    .map(function (slug) { return TOOLS_BY_SLUG[slug]; })
    .filter(Boolean);

  var ticks = tickerTools.concat(tickerTools).map(function (name) {
    return App.el('span', { class: 'home-tick' },
      App.el('span', { class: 'home-tick-dot', text: '◆' }),
      App.el('span', { text: name }));
  });

  var root = App.el('div', { class: 'home' },
    App.el('div', { class: 'home-wrap' },

      /* ── hero band: copy + live-tab visual ── */
      App.el('header', { class: 'home-hero home-hero-band' },
        App.el('div', { class: 'home-hero-grid' },
          App.el('div', { class: 'home-hero-copy' },
            App.el('p', { class: 'home-eyebrow' },
              App.el('span', { class: 'home-dot', 'aria-hidden': 'true' }),
              App.el('span', { text: 'free · private · offline-ready' })),
            App.el('h1', { class: 'home-title', text: 'Local web apps that run entirely in your browser.' }),
            App.el('p', { class: 'home-lede', text: TOOLMANIFEST.length + ' free tools and an 8-language IDE. No sign-up, no tracking, no server — your data never leaves the tab.' }),
            App.el('div', { class: 'home-actions' },
              App.el('a', { class: 'btn-primary-sm home-btn', href: '#/tools', text: 'Browse tools' }),
              App.el('a', { class: 'btn-ghost-sm home-btn', href: '#/ide', text: 'Open IDE' })),
            App.el('dl', { class: 'home-stats', 'aria-label': 'Site facts' },
              App.el('div', { class: 'home-stat' },
                App.el('dt', { class: 'home-stat-n', text: TOOLMANIFEST.length + '+' }),
                App.el('dd', { class: 'home-stat-l', text: 'free tools' })),
              App.el('div', { class: 'home-stat' },
                App.el('dt', { class: 'home-stat-n', text: '8' }),
                App.el('dd', { class: 'home-stat-l', text: 'IDE languages' })),
              App.el('div', { class: 'home-stat' },
                App.el('dt', { class: 'home-stat-n', text: '0' }),
                App.el('dd', { class: 'home-stat-l', text: 'trackers, sign-ups' })),
              App.el('div', { class: 'home-stat' },
                App.el('dt', { class: 'home-stat-n', text: '100%' }),
                App.el('dd', { class: 'home-stat-l', text: 'on-device' })))),
          App.el('div', { class: 'home-visual', 'aria-hidden': 'true' },
            App.el('div', { class: 'term-window' },
              App.el('div', { class: 'term-bar' },
                App.el('span', { class: 'term-dots' },
                  App.el('i', { class: 'term-dot' }),
                  App.el('i', { class: 'term-dot' }),
                  App.el('i', { class: 'term-dot' })),
                App.el('span', { class: 'term-title', text: 'this tab — no server' })),
              App.el('div', { class: 'term-body' },
                termLine('$', 'open json-validator', ''),
                termLine('✓', 'valid · 42 lines formatted', 'ok'),
                termLine('$', 'hash sha-256 “hello”', ''),
                termLine('→', '2cf24dba5fb0a30e', 'dim'),
                termLine('$', 'uuid v7', ''),
                termLine('→', '0193c21d74d27e31', 'dim'),
                termLine('$', 'qr encode "hello"', ''),
                termLine('→', '21x21 matrix - ok', 'dim'),
                App.el('div', { class: 'term-chips' },
                  App.el('span', { class: 'term-chip', text: 'JSON' }),
                  App.el('span', { class: 'term-chip', text: 'QR' }),
                  App.el('span', { class: 'term-chip', text: 'JWT' }),
                  App.el('span', { class: 'term-chip', text: 'UUID' }))),
              App.el('div', { class: 'term-foot' },
                App.el('span', { class: 'term-live' }),
                App.el('span', { text: 'local only — nothing uploaded' })))))),

      /* ── ticker: what lives here ── */
      App.el('div', { class: 'home-ticker', 'aria-hidden': 'true' },
        App.el('div', { class: 'home-ticker-track' }, ticks)),

      /* ── featured tools ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'Featured tools' },
        App.el('div', { class: 'home-sec-row' },
          section('Featured tools', 'A starting sample — JSON, text, encoding, crypto, converters and more.'),
          App.el('a', { class: 'home-more home-more-inline', href: '#/tools', text: 'Browse all ' + TOOLMANIFEST.length + ' tools \u2192' })),
        App.el('div', { class: 'tool-grid' }, featured.map(function (t) {
          return App.el('a', { href: '#/tools/' + t.slug, class: 'tool-card' },
            App.el('div', { class: 'tc-icon' }, App.icon(t.icon, '', 16)),
            App.el('div', { class: 'min-w-0 flex-1' },
              App.el('div', { class: 'tc-name', text: t.name }),
              App.el('div', { class: 'tc-desc', text: t.desc }),
              App.el('div', { class: 'tc-tags' }, t.tags.slice(0, 3).map(function (tag) {
                return App.el('span', { class: 'tc-tag', text: tag });
              }))));
        }))),

      /* ── IDE split: copy + editor visual ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'In-browser IDE' },
        App.el('div', { class: 'home-ide-split' },
          App.el('div', { class: 'home-ide-copy' },
            section('In-browser IDE', 'Real compilers in a tab — code runs locally with stdin. Free, no account.'),
            App.el('div', { class: 'home-langs' }, IDE_LANGS.map(function (l) {
              return App.el('span', { class: 'home-lang', text: l });
            })),
            App.el('div', { class: 'home-actions' },
              App.el('a', { class: 'btn-primary-sm home-btn', href: '#/ide', text: 'Open IDE' }),
              App.el('a', { class: 'btn-ghost-sm home-btn', href: '#/tools', text: 'Or browse tools' }))),
          App.el('div', { class: 'code-window', 'aria-hidden': 'true' },
            App.el('div', { class: 'term-bar' },
              App.el('span', { class: 'term-dots' },
                App.el('i', { class: 'term-dot' }),
                App.el('i', { class: 'term-dot' }),
                App.el('i', { class: 'term-dot' })),
              App.el('span', { class: 'term-title', text: 'main.py — runs locally' })),
            App.el('div', { class: 'code-body' },
              App.el('div', { class: 'code-line' },
                App.el('span', { class: 'code-kw', text: 'def ' }),
                App.el('span', { class: 'code-fn', text: 'greet' }),
                App.el('span', { class: 'code-pl', text: '(name):' })),
              App.el('div', { class: 'code-line code-indent' },
                App.el('span', { class: 'code-kw', text: 'return ' }),
                App.el('span', { class: 'code-str', text: '"hello, " + name' })),
              App.el('div', { class: 'code-line' },
                App.el('span', { class: 'code-fn', text: 'print' }),
                App.el('span', { class: 'code-pl', text: '(greet(' }),
                App.el('span', { class: 'code-str', text: '"world"' }),
                App.el('span', { class: 'code-pl', text: '))' })),
              App.el('div', { class: 'code-line' },
                App.el('span', { class: 'code-fn', text: 'print' }),
                App.el('span', { class: 'code-pl', text: '(greet(' }),
                App.el('span', { class: 'code-str', text: '"ada"' }),
                App.el('span', { class: 'code-pl', text: '))' })),
              App.el('div', { class: 'code-line' },
                App.el('span', { class: 'code-cm', text: '# output → hello, world · hello, ada' }))),
            App.el('div', { class: 'term-foot' },
              App.icon('play', '', 12),
              App.el('span', { text: 'Run · 0.4s · engine cached' }))))),

      /* ── why: bento grid, not resume ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'Why this site' },
        section('Why it stays fast and private', 'No accounts, no uploads, no tracking — just pages that work.'),
        App.el('div', { class: 'home-grid home-bento' }, focusAreas.map(function (a, i) {
          return App.el('div', { class: 'home-card' },
            App.el('div', { class: 'home-card-top' },
              App.el('span', { class: 'home-card-ic' }, App.icon(a.icon, '', 15)),
              App.el('h3', { text: a.title })),
            App.el('p', { text: a.body }));
        }))),

      /* ── contact panel ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'Contact' },
        App.el('div', { class: 'home-contact' },
          App.el('div', { class: 'home-contact-copy' },
            section('Contact', 'Questions, bugs, ideas — mubdiur@gmail.com works best.')),
          App.el('div', { class: 'home-actions home-contact-links' },
            App.el('a', { class: 'btn-primary-sm home-btn', href: 'mailto:mubdiur@gmail.com', text: 'mubdiur@gmail.com' }))),)
));

  return root;
}

App.registerPage('/', renderHome);
})();
