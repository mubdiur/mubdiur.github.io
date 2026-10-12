/* ═══════════════════════════════════════════════════════════
   Home — plain personal homepage. Name, role, tools entry,
   IDE entry, focus areas, contact. No gimmicks.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var featuredSlugs = ['time-copier', 'json-validator', 'qr-code-generator'];

var focusAreas = [
  { title: 'Browser Automation', body: 'Playwright, Cypress and Appium — shared browser fleets, deterministic lifecycles, structured extraction.' },
  { title: 'Observability', body: 'Dynatrace, Kibana, Datadog cost panels and transaction portals — backed by eBPF probes and OTel spans.' },
  { title: 'Infrastructure', body: 'Docker and Traefik with Let\u2019s Encrypt TLS, OpenStack and bare Linux beneath.' },
  { title: 'Safe AI', body: 'Prompt-injection defense, PII redaction, output validation and allow-listed tools.' },
  { title: 'AI Architecture', body: 'Agents as state machines with explicit failure paths. Versioned prompts, typed tool contracts.' },
  { title: 'Backend & Tooling', body: 'Node.js and TypeScript. Git-native workflows, terminal-first operations.' },
  { title: 'Crawl & Extract', body: 'Structured records from live, shifting UIs — map a portal once, pull on repeat.' },
  { title: 'Evaluation & Governance', body: 'Regression suites for prompts, models and tools: shadow traffic, canaries, rollback, drift detection.' },
  { title: 'Incident Response', body: 'SLO-based paging, burn-rate alerting, runbooks. Automation absorbs the noise.' }
];

var IDE_LANGS = ['JavaScript', 'Python', 'C', 'C++', 'C#', 'Java', 'Go', 'Rust'];

function section(title, sub) {
  return App.el('div', { class: 'home-sec-head' },
    App.el('h2', { class: 'home-h2', text: title }),
    sub ? App.el('p', { class: 'home-sub', text: sub }) : null);
}

function renderHome() {
  var featured = featuredSlugs
    .map(function (slug) { return TOOLS_BY_SLUG[slug]; })
    .filter(Boolean);

  var root = App.el('div', { class: 'home' },
    App.el('div', { class: 'home-wrap' },

      /* ── hero ── */
      App.el('header', { class: 'home-hero' },
        App.el('h1', { class: 'home-title', text: 'Mubdiur Rahman' }),
        App.el('p', { class: 'home-role', text: 'AI Platform & Reliability Engineer' }),
        App.el('p', { class: 'home-lede', text: TOOLMANIFEST.length + ' developer utilities and an 8-language IDE that run entirely in your browser. Static site, WebAssembly core — no server, no tracking.' }),
        App.el('div', { class: 'home-actions' },
          App.el('a', { class: 'btn-primary-sm home-btn', href: '#/tools', text: 'Browse tools' }),
          App.el('a', { class: 'btn-ghost-sm home-btn', href: '#/ide', text: 'Open IDE' }))),

      /* ── featured tools ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'Featured tools' },
        section('Featured tools', 'A starting sample — the full archive covers JSON, text, encoding, crypto, converters and more.'),
        App.el('div', { class: 'tool-grid' }, featured.map(function (t) {
          return App.el('a', { href: '#/tools/' + t.slug, class: 'tool-card' },
            App.el('div', { class: 'tc-icon' }, App.icon(t.icon, '', 16)),
            App.el('div', { class: 'min-w-0 flex-1' },
              App.el('div', { class: 'tc-name', text: t.name }),
              App.el('div', { class: 'tc-desc', text: t.desc })));
        })),
        App.el('a', { class: 'home-more', href: '#/tools', text: 'Browse all ' + TOOLMANIFEST.length + ' tools \u2192' })),

      /* ── IDE ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'In-browser IDE' },
        section('In-browser IDE', 'Real compilers in a tab — JavaScript, Python, C, C++, C#, Java, Go and Rust. Code runs locally; stdin supported.'),
        App.el('div', { class: 'home-ide' },
          App.el('div', { class: 'home-langs' }, IDE_LANGS.map(function (l) {
            return App.el('span', { class: 'home-lang', text: l });
          })),
          App.el('a', { class: 'btn-primary-sm home-btn', href: '#/ide', text: 'Open IDE' }))),

      /* ── focus areas ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'Focus areas' },
        section('Focus areas', 'What I work on.'),
        App.el('div', { class: 'home-grid' }, focusAreas.map(function (a) {
          return App.el('div', { class: 'home-card' },
            App.el('h3', { text: a.title }),
            App.el('p', { text: a.body }));
        }))),

      /* ── contact ── */
      App.el('section', { class: 'home-sec', 'aria-label': 'Contact' },
        section('Contact', null),
        App.el('div', { class: 'home-actions' },
          App.el('a', { class: 'btn-ghost-sm home-btn', href: 'mailto:mubdiur@gmail.com', text: 'Email' }),
          App.el('a', { class: 'btn-ghost-sm home-btn', href: 'https://github.com/mubdiur', target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' }),
          App.el('a', { class: 'btn-ghost-sm home-btn', href: 'https://linkedin.com/in/mubdiur', target: '_blank', rel: 'noopener noreferrer', text: 'LinkedIn' }))),

      /* ── footer ── */
      App.el('footer', { class: 'home-foot', text: '\u00A9 2026 Mubdiur Rahman \u00B7 Static site \u2014 no tracking, no server.' })));

  return root;
}

App.registerPage('/', renderHome);
})();
