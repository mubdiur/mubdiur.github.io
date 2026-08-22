/* ═══════════════════════════════════════════════════════════
   The Mubdiur Times — home page. Ported from src/app/page.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var technologies = [
  { kicker: 'Automation Desk', title: 'Browser Automation at Scale', body: 'Browser automation at scale — Playwright, Cypress, Appium. Shared browser instances with strict lifecycle management, deterministic resource use, and structured extraction from live UIs.', tags: ['Playwright', 'Cypress', 'Appium'] },
  { kicker: 'Observability Desk', title: 'Monitoring & Observability', body: 'Surveillance of Dynatrace problem boards, Kibana error views, Datadog cost panels, and transaction portals. eBPF probes and OTel spans under the hood — near-realtime, back-to-back checks with append-only results.', tags: ['Dynatrace', 'Kibana', 'Datadog', 'eBPF'] },
  { kicker: 'Infrastructure Desk', title: 'Reliability & Infrastructure', body: 'Docker and Traefik hosts with Let\u2019s Encrypt TLS and zero-downtime rebuilds. OpenStack and bare Linux underneath, server backends guarded by rate limits and SSRF checks. Hardened to least privilege.', tags: ['Docker', 'OpenStack', 'Linux'] },
  { kicker: 'Safety Desk', title: 'Safe AI & Guardrails', body: 'Guardrails in the loop: prompt-injection defense, PII redaction, output validation, allow-listed tools. Agents get capabilities, not keys — and every action is audited.', tags: ['Guardrails', 'Injection Defense', 'PII'] },
  { kicker: 'Architecture Desk', title: 'Maintainable AI Architecture', body: 'Agents as state machines with explicit failure paths — not prompt spaghetti. Versioned prompts, typed tool contracts, and architecture that survives the engineer who built it.', tags: ['State Machines', 'Versioned', 'No Spaghetti'] },
  { kicker: 'AI Desk', title: 'AI-Enabled Engineering', body: 'MCP tooling in production stacks, agent-driven automation, and eval-driven iteration. AI is a force multiplier and an on-call copilot — never a demo.', tags: ['MCP', 'Agents', 'AIOps'] },
  { kicker: 'Foundry Desk', title: 'Backend & Tooling', body: 'Node.js and TypeScript services with zero unnecessary dependencies. Git and CI/CD workflows, terminal-first operations, rapid prototyping with production discipline.', tags: ['Node.js', 'TypeScript', 'Git'] },
  { kicker: 'Pipeline Desk', title: 'Web Crawling & Data Extraction', body: 'crawl4ai-powered intake and Playwright-driven extraction — map a portal once, pull structured records back-to-back. Built for hostile UIs and shifting layouts.', tags: ['crawl4ai', 'Playwright', 'Extraction'] },
  { kicker: 'Governance Desk', title: 'Evaluation & Governance', body: 'Every prompt, model, and tool change ships behind a regression suite. Shadow traffic, canary deploys, automated rollback, drift detection — the AI equivalent of code review.', tags: ['Eval Gates', 'Shadow Traffic', 'Rollback'] }
];

var systems = [
  { kicker: 'Business Section', title: 'Incident Response & On-Call Discipline', body: 'SLO-based paging, burn-rate alerting, runbooks, and MTTR tracking — the discipline of being paged less while knowing more. Automation handles the noise; humans handle the judgment.', tags: ['SLOs', 'Runbooks', 'MTTR'] },
  { kicker: 'Business Section', title: 'Automation Daemons & Bot Operations', body: 'Long-running Node.js daemons that run unattended — messenger-based operations with self-confirming delivery, structured logging, and recovery built in. Set-and-forget systems that report back.', tags: ['Node.js', 'Daemons', 'Unattended'] },
  { kicker: 'Business Section', title: 'mubdiur.github.io — Production Platform', body: 'A static site with a WebAssembly core — every utility runs in your browser, no server required. Deployable to GitHub Pages, edge-cached, zero cold starts.', tags: ['Static', 'WebAssembly', 'GitHub Pages'] },
  { kicker: 'Business Section', title: 'CodeAlign VPS — Infrastructure Spine', body: 'A multi-project Docker host operating as the backbone for everything shipped. Containerized isolation, least-privilege access, Let\u2019s Encrypt TLS across the board.', tags: ['Docker', 'VPS'] }
];

var featuredSlugs = ['time-copier', 'ssl-cert-checker', 'json-validator', 'qr-code-generator'];

var WORDSEARCH = [
  'S  R  E  L  L  O  G  V  B  X  P  Q',
  'T  A  K  N  O  I  R  H  W  C  A  A',
  'V  Q  M  Z  U  B  F  E  P  9  5  G',
  'W  N  Y  J  C  H  T  D  S  A  X  E',
  'G  P  U  A  L  M  V  R  O  E  I  Y',
  'K  B  J  C  A  L  E  R  T  R  W  H',
  'D  L  O  K  I  T  Q  N  M  S  U  F',
  'R  Z  P  X  F  C  G  V  J  K  L  O',
  'I  T  E  S  Y  M  C  P  B  A  D  N',
  'F  O  W  C  H  L  Z  U  Q  T  J  M',
  'T  B  H  D  X  N  E  K  A  R  Y  S',
  'C  M  Z  S  L  O  W  F  J  V  G  T'
].join('\n');

var FORECAST = [
  'PRODUCTION ......... PARTLY CLOUDY · 99.95% SUNNY',
  'DATACENTER ......... HOT. ALWAYS.',
  'TOKEN BUDGET ....... FALLING (−40% POST-CACHE)',
  'CHANCE OF INCIDENT . 0.05% — AT 02:00, PROBABLY',
  'ALERT FATIGUE ...... ZERO. AS IT SHOULD BE.'
].join('\n');

function MastRule() {
  return App.el('div', { 'aria-hidden': 'true', html: '<div class="mast-rule"></div><div class="mast-rule2"></div>' });
}
function Kicker(text) {
  return App.el('div', { class: 'kicker', text: text });
}
function SectionTitle(kicker, title) {
  return App.el('div', { class: 'section-title mb-7' },
    Kicker(kicker),
    App.el('h2', { text: title }),
    App.el('div', { class: 'news-rule' }));
}
function ArticleCard(a) {
  return App.el('article', { class: 'article-card' },
    Kicker(a.kicker),
    App.el('h3', { text: a.title }),
    App.el('p', { text: a.body }),
    App.el('div', { class: 'tags' }, a.tags.map(function (t) { return App.el('span', { class: 'tag-chip', text: t }); })));
}

function ObservabilityDashboard() {
  var HOURS = [];
  for (var i = 0; i < 24; i++) HOURS.push(String(i).padStart(2, '0'));
  var THROUGHPUT = [3200, 2900, 3400, 4100, 5200, 6800, 8400, 9600, 10800, 11900, 12400, 13100, 12800, 13600, 6800, 12400, 13200, 12900, 12100, 11000, 9800, 8200, 6400, 4800];
  var P95 = [140, 132, 138, 150, 168, 192, 215, 238, 265, 296, 318, 342, 335, 360, 780, 352, 340, 328, 310, 286, 258, 224, 190, 160];
  var ERROR_RATE = [0.03, 0.02, 0.02, 0.03, 0.04, 0.05, 0.05, 0.06, 0.07, 0.08, 0.09, 0.08, 0.07, 0.06, 1.6, 0.9, 0.12, 0.06, 0.05, 0.05, 0.04, 0.04, 0.03, 0.03];
  var EXTRACT = [2100, 1900, 2300, 2800, 3400, 4100, 4600, 4900, 5200, 5600, 5800, 6100, 5900, 6200, 4100, 5700, 6000, 5900, 5600, 5100, 4600, 3900, 3100, 2400];
  var CRAWLED = [320, 290, 340, 390, 460, 540, 590, 620, 650, 690, 710, 740, 720, 750, 510, 700, 730, 710, 680, 620, 560, 480, 390, 310];
  var COST = [1.42, 1.41, 1.38, 1.36, 1.33, 1.31, 1.29, 1.27, 1.24, 1.22, 1.19, 1.17, 0.98, 0.95, 0.93, 0.91, 0.74, 0.72, 0.71, 0.7, 0.69, 0.68, 0.67, 0.66];
  var TUNING = [0.61, 0.64, 0.68, 0.72, 0.69, 0.76, 0.81, 0.85, 0.88, 0.91];
  var ERROR_CODE_HITS = [0, 0, 2, 1, 0, 0, 3, 1, 0, 0, 1, 0, 0, 0, 12, 4, 0, 0, 1, 0, 0, 0, 0, 0];
  var GPU_UTIL = [22, 18, 24, 31, 38, 45, 52, 58, 64, 70, 74, 78, 76, 80, 58, 79, 83, 85, 84, 80, 74, 66, 52, 38];
  var GUARDRAIL = [2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 5, 7, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2];
  var AXIS = { colors: ['#bdae93'], fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' };
  var _ = AXIS;

  return App.el('div', { class: 'w-full' },
    App.el('div', { class: 'obs-desk-head' },
      App.el('div', {},
        App.el('div', { class: 'kicker', text: 'Observability Desk · The Glass' }),
        App.el('h2', { class: 'mt-2', style: { fontFamily: 'var(--font-display)', fontSize: 'clamp(1.7rem,4vw,2.6rem)', lineHeight: '1.02', letterSpacing: '-0.01em', color: 'var(--ink)', fontWeight: '400' }, text: 'Production, through the instruments' })),
      App.el('div', { class: 'hidden sm:block', style: { width: '5rem', flexShrink: '0' }, html: NewsSvg.TensorChip() })),
    App.el('div', { class: 'mt-4 news-rule' }),
    App.el('p', { class: 'mt-5', style: { maxWidth: '48rem', fontFamily: 'var(--font-serif)', fontSize: '1rem', lineHeight: '1.7', color: 'var(--ink-soft)' },
      text: 'The front page is prose; this is the proof. Every instrument below is one I\u2019ve run in anger — shaped like production, from the LGTM stack, Dynatrace, Datadog, and ELK/Kibana, fed by crawl4ai pipelines over OpenStack, Kubernetes and Linux. Numbers are illustrative; the discipline is not.' }),
    App.el('div', { class: 'obs-grid' },
      App.el('div', { class: 'span-2' }, Charts.Panel('Throughput & p95 latency', '24h window', Charts.Chart({
        type: 'combo', categories: HOURS, height: '240px',
        series: [{ name: 'req/min', type: 'bar', data: THROUGHPUT }, { name: 'p95 (ms)', type: 'line', data: P95 }],
        colors: ['#ebdbb2', '#fb4934'],
        yFmt: function (v) { return Math.round(v / 1000) + 'k'; },
        legend: true
      }))),
      Charts.Panel('SLO — uptime, 30 days', 'on budget', (function () {
        var wrap = App.el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem 0' } });
        var canvas = App.el('canvas', { class: 'chart-canvas', style: { maxWidth: '260px', height: '180px' } });
        wrap.appendChild(canvas);
        App.raf(function () {
          var W = canvas.clientWidth || 260, H = 180;
          var dpr = window.devicePixelRatio || 1;
          canvas.width = W * dpr; canvas.height = H * dpr;
          var ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          var cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 26;
          ctx.strokeStyle = '#504945';
          ctx.lineWidth = 14;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#8ec07c';
          ctx.beginPath();
          ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.9995);
          ctx.stroke();
          ctx.fillStyle = '#bdae93';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('UPTIME · 30 DAYS', cx, cy + 30);
          ctx.fillStyle = '#ebdbb2';
          ctx.font = '26px JetBrains Mono, monospace';
          ctx.fillText('99.95%', cx, cy + 4);
        });
        return wrap;
      })()),
      Charts.Panel('Error rate', 'incident at 14:02', Charts.Chart({
        type: 'area', categories: HOURS, height: '200px',
        series: [{ name: 'error rate', type: 'area', data: ERROR_RATE }],
        colors: ['#fb4934'],
        yFmt: function (v) { return v.toFixed(2) + '%'; },
        annotations: [{ x: 14, color: '#fabd2f', label: { text: 'INCIDENT · DETECTED 12s', background: '#fabd2f', color: '#1d2021' } }]
      })),
      Charts.Panel('p99 latency by service', 'now', Charts.Chart({
        type: 'hbar', height: '200px',
        series: [{ name: 'p99 (ms)', type: 'bar', horizontal: true, data: [
          { x: 'auth-svc', y: 212 }, { x: 'payments', y: 186 }, { x: 'ingest', y: 143 },
          { x: 'rag-retriever', y: 98 }, { x: 'mcp-gateway', y: 76 }, { x: 'edge-web', y: 61 }
        ] }],
        colors: ['#fb4934', '#ebdbb2', '#ebdbb2', '#ebdbb2', '#ebdbb2', '#ebdbb2'],
        labels: ['auth-svc', 'payments', 'ingest', 'rag-retriever', 'mcp-gateway', 'edge-web'],
        yFmt: function (v) { return v + ' ms'; }
      })),
      Charts.Panel('Crawl4ai & extraction pipeline', 'back-to-back', Charts.Chart({
        type: 'combo', categories: HOURS, height: '200px',
        series: [{ name: 'records extracted', type: 'bar', data: EXTRACT }, { name: 'pages crawled', type: 'line', data: CRAWLED }],
        colors: ['#bdae93', '#8ec07c'],
        yFmt: function (v) { return Math.round(v / 1000) + 'k'; },
        legend: true
      })),
      Charts.Panel('Token cost per request', 'datadog', Charts.Chart({
        type: 'area', categories: HOURS, height: '200px',
        series: [{ name: '$ / 1k req', type: 'area', data: COST }],
        colors: ['#fabd2f'],
        yFmt: function (v) { return '$' + v.toFixed(2); },
        annotations: [
          { x: 12, color: '#fabd2f', label: { text: 'CACHE SHIPPED', background: '#fabd2f', color: '#1d2021' } },
          { x: 16, color: '#8ec07c', label: { text: 'PROMPT COMPRESSED', background: '#8ec07c', color: '#1d2021' } }
        ]
      })),
      Charts.Panel('Model tuning — eval score by iteration', '10 runs', Charts.Chart({
        type: 'line', height: '200px', markers: true,
        series: [{ name: 'eval score', type: 'line', data: TUNING }],
        colors: ['#ebdbb2'],
        categories: ['ITER 1', 'ITER 2', 'ITER 3', 'ITER 4', 'ITER 5', 'ITER 6', 'ITER 7', 'ITER 8', 'ITER 9', 'ITER 10'],
        yFmt: function (v) { return v.toFixed(2); },
        yMin: 0.5, yMax: 1,
        annotations: [{ x: 5, color: '#fabd2f', label: { text: 'RETRIEVAL REWORK', background: '#fabd2f', color: '#1d2021' } }]
      })),
      Charts.Panel('Guardrails — injection blocked & PII redacted', 'per hour', Charts.Chart({
        type: 'bar', categories: HOURS, height: '200px',
        series: [{ name: 'blocked / redacted', type: 'bar', data: GUARDRAIL }],
        colors: ['#fb4934'],
        yFmt: function (v) { return String(Math.round(v)); }
      })),
      Charts.Panel('GPU utilization — vllm serving', 'continuous batching', Charts.Chart({
        type: 'area', categories: HOURS, height: '200px',
        series: [{ name: 'GPU util', type: 'area', data: GPU_UTIL }],
        colors: ['#ebdbb2'],
        yFmt: function (v) { return Math.round(v) + '%'; },
        yMax: 100, yMin: 0,
        annotations: [{ x: 16, color: '#8ec07c', label: { text: 'VLLM · BATCHING ON', background: '#8ec07c', color: '#1d2021' } }]
      })),
      App.el('div', { class: 'span-2' }, Charts.Panel('Error-code surveillance — kibana view', 'threshold 5/min', Charts.Chart({
        type: 'bar', categories: HOURS, height: '200px',
        series: [{ name: 'error-code hits', type: 'bar', data: ERROR_CODE_HITS }],
        colors: ['#fabd2f'],
        yFmt: function (v) { return String(Math.round(v)); },
        annotations: [{ y: 5, color: '#fb4934', label: { text: 'ALERT THRESHOLD', background: '#fb4934', color: '#1d2021' } }]
      })))
    ),
    App.el('figure', { class: 'obs-figure' },
      App.el('figcaption', {},
        App.el('span', { text: 'Fig. B — the observability spine' }),
        App.el('span', { text: 'LGTM · Dynatrace · Datadog · ELK/Kibana · crawl4ai' })),
      App.el('div', { class: 'fig-body', html: NewsSvg.StackHealth() })),
    App.el('p', { class: 'obs-note', text: 'Signals: Loki logs · Tempo traces · Mimir metrics · eBPF kernel probes · OTel spans · Kibana error views · Datadog cost · Dynatrace AI · crawl4ai intake — because dashboards that lie get you paged at 3 a.m.' }));
}

function SundaySupplement() {
  return App.el('div', { class: 'w-full' },
    App.el('div', { class: 'kicker', text: 'Sunday Supplement · The Funnies & More' }),
    App.el('h2', { class: 'mt-2', style: { fontFamily: 'var(--font-display)', fontSize: 'clamp(1.7rem,4vw,2.6rem)', lineHeight: '1.02', letterSpacing: '-0.01em', color: 'var(--ink)', fontWeight: '400' }, text: 'Back-page entertainment for on-call readers' }),
    App.el('div', { class: 'mt-4 news-rule' }),
    App.el('div', { class: 'news-grid-3 mt-6' },
      App.el('figure', { class: 'news-panel', style: { gridColumn: 'span 2' } },
        App.el('figcaption', { class: 'panel-head', text: 'Op-Ed · From the Desk of the Operator' }),
        App.el('div', { class: 'p-5 sm:p-6' },
          App.el('h3', { style: { fontFamily: 'var(--font-display)', fontSize: 'clamp(1.25rem,2.4vw,1.6rem)', lineHeight: '1.1', letterSpacing: '-0.01em', color: 'var(--ink)', fontWeight: '400' }, text: 'Your AI platform is expensive, fragile, and scarier than it needs to be. Fix all three.' }),
          App.el('div', { class: 'mt-4', style: { fontFamily: 'var(--font-serif)', fontSize: '0.98rem', lineHeight: '1.7', color: 'var(--ink-soft)' }, html:
            '<p style="margin-bottom:0.75rem">Engineering managers don&rsquo;t fear AI. They fear the bill, the 3 a.m. page from something nobody understands, and the prompt that silently changed behavior in production. All three are engineering problems — not magic problems.</p>' +
            '<p>Cache the tokens, compress the prompt, gate every change behind a regression suite, shadow-test the next candidate against live traffic, and put guardrails between the model and your data. Safe, maintainable, affordable — in that order. That&rsquo;s the whole platform.</p>' }),
          App.el('div', { class: 'mt-4', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', borderTop: '1px solid var(--rule)', paddingTop: '0.75rem' }, html:
            '<span style="font-family:var(--font-franklin);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:var(--ink-faint)">— Mubdiur Rahman, Operator-at-Large</span>' +
            '<span style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:var(--news-red-soft)">Fear index: bill shock LOW · mystery outages LOW · data leaks LOW · maintenance nightmares LOW</span>' }))),
      App.el('figure', { class: 'news-panel' },
        App.el('figcaption', { class: 'panel-head', text: 'Conditions · Today\u2019s Forecast' }),
        App.el('div', { class: 'p-4' },
          App.el('pre', { class: 'overflow-x-auto', style: { fontFamily: 'var(--font-mono)', fontSize: '10px', lineHeight: '1.7', color: 'var(--ink-soft)' }, text: FORECAST }),
          App.el('div', { class: 'mt-3', style: { borderTop: '1px solid var(--rule)', paddingTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-faint)' }, text: 'Reported by the observability spine, which never sleeps. Neither does the author.' }))),
      App.el('figure', { class: 'news-panel', style: { gridColumn: 'span 2' } },
        App.el('figcaption', { class: 'panel-head', text: 'The On-Call · A three-panel drama, drawn in the dark' }),
        App.el('div', { class: 'p-4 sm:p-5', html: NewsSvg.OnCallComic() })),
      App.el('figure', { class: 'news-panel' },
        App.el('figcaption', { class: 'panel-head', text: 'Puzzle · Find 10 SRE Terms' }),
        App.el('div', { class: 'p-4' },
          App.el('pre', { class: 'overflow-x-auto', style: { fontFamily: 'var(--font-mono)', fontSize: 'clamp(0.5rem,1.4vw,0.68rem)', lineHeight: '1.9', color: 'var(--ink-soft)' }, text: WORDSEARCH }),
          App.el('div', { class: 'mt-3', style: { borderTop: '1px solid var(--rule)', paddingTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-faint)' }, text: 'Answers: SRE · LOG · P95 · GPU · LOKI · ALERT · MCP · DRIFT · PAGE · SLO' })))));
}

function renderHome() {
  var featured = featuredSlugs
    .map(function (slug) { return TOOLS_BY_SLUG[slug]; })
    .filter(Boolean);
  var dateline = '';
  try {
    dateline = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();
  } catch (e) {}

  var root = App.el('div', { class: 'news' },
    App.el('div', { class: 'wrap' },

      /* ── MASTHEAD ── */
      App.el('header', { class: 'masthead' },
        App.el('div', { class: 'dateline-bar' },
          App.el('span', { text: 'Dhaka, Bangladesh — BST' }),
          App.el('span', { class: 'hidden sm:block', text: dateline || 'Sunday, August 2, 2026' }),
          App.el('span', { text: 'Vol. I · Est. 2026' })),
        MastRule(),
        App.el('h1', { text: 'The Mubdiur Times' }),
        MastRule(),
        App.el('div', { class: 'tagline-bar' },
          App.el('span', { class: 'text-ink-soft', text: 'All the reliability that\u2019s fit to print' }),
          App.el('span', { class: 'price', text: 'Price: 5 minutes' })),
        App.el('nav', { class: 'section-nav', 'aria-label': 'Newspaper sections', html:
          '<a href="#front">Front Page</a><span class="dot">·</span><a href="#technology">Technology</a><span class="dot">·</span>' +
          '<a href="#business">Business</a><span class="dot">·</span><a href="#observability">Observability</a><span class="dot">·</span>' +
          '<a href="#tools">Tools Desk</a><span class="dot">·</span><a href="#supplement">Supplement</a><span class="dot">·</span>' +
          '<a href="#classifieds">Classifieds</a>' })),

      /* ── FRONT PAGE ── */
      App.el('main', { id: 'front', class: 'wrap', style: { paddingBottom: '2.5rem', paddingTop: '2.5rem' } },
        App.el('div', { class: 'news-front-grid' },
          App.el('div', { class: 'lead-story' },
            Kicker('Front Page · Lead Story · The Operator'),
            App.el('h2', { class: 'lead-title', text: 'Automation That Replaces Human Monitoring' }),
            App.el('p', { class: 'lead-deck', text: 'Mubdiur Rahman — AI Platform & Reliability Engineer — designs platforms that learn production portals, run near-realtime checks, and alert on what matters. AI is the force multiplier; reliability is the job; safety is non-negotiable.' }),
            App.el('div', { class: 'lead-byline' },
              App.el('span', { text: 'By Mubdiur Rahman' }),
              App.el('span', { 'aria-hidden': 'true', text: '·' }),
              App.el('span', { text: 'Reported from Dhaka, Bangladesh' })),
            App.el('div', { class: 'lead-body', html:
              '<p><span class="dropcap">T</span>he monitoring industry runs on humans staring at dashboards for eight-hour shifts. This operator&rsquo;s answer is automation: platforms that learn a system&rsquo;s structure once, then run checks back-to-back with no polling gap — catching failures before they ever reach an error log. The tooling is browser-grade; the discipline is production-grade.</p>' +
              '<p>The same discipline runs the infrastructure underneath: Docker and Traefik hosts with Let&rsquo;s Encrypt TLS, zero-downtime rebuilds, and server backends guarded by rate limits and SSRF checks. Guardrails — injection defense, PII redaction, audit trails — sit between every model call and the data. MCP tooling and AI-assisted workflows are used where they earn their keep: as force multipliers, not demos.</p>' })),

          App.el('aside', { class: 'news-index' },
            App.el('div', { class: 'index-head', text: 'The Index' }),
            App.el('dl', {},
              [['Dev tools in archive', String(TOOLMANIFEST.length)],
               ['Uptime target', '99.95%'],
               ['MTTR target', '08 min'],
               ['Signal sources', 'LGTM·DT·DD'],
               ['Automation', '24/7']
              ].map(function (row) {
                return App.el('div', { class: 'index-row' }, App.el('dt', { text: row[0] }), App.el('dd', { text: row[1] }));
              }),
              App.el('div', { class: 'index-row' }, App.el('dt', { text: 'Status' }), App.el('dd', { class: 'status', text: 'Operational · BST (UTC+6)' }))),
            App.el('figure', {},
              App.el('figcaption', { text: 'Fig. A — an agent trace, in the wild' }),
              App.el('div', { class: 'fig-body', html: NewsSvg.NeuralNetwork() }))))),

      /* ── MARKET STRIP ── */
      App.el('div', { class: 'market-strip' },
        [['Uptime SLO', '99.95'], ['MTTR', '08m'], ['Automation', '24/7'], ['Alert fatigue', 'ZERO'], ['Tools', String(TOOLMANIFEST.length).padStart(2, '0')]
        ].map(function (cell) {
          return App.el('div', { class: 'cell' }, App.el('div', { class: 'num', text: cell[1] }), App.el('div', { class: 'label', text: cell[0] }));
        })),

      /* ── OBSERVABILITY ── */
      App.el('section', { id: 'observability', class: 'news-section bordered', html: '' }, ObservabilityDashboard()),

      /* ── TECHNOLOGY ── */
      App.el('section', { id: 'technology', class: 'news-section' },
        SectionTitle('Technology Desk · The Specialties', 'What this operator ships'),
        App.el('div', { class: 'hairline-grid lg-cols-3' }, technologies.map(ArticleCard))),

      /* ── BUSINESS ── */
      App.el('section', { id: 'business', class: 'news-section bordered' },
        SectionTitle('Business Section · Systems in the Field', 'Selected work & systems'),
        App.el('article', { class: 'news-panel', style: { border: '1px solid var(--rule-strong)', background: 'var(--paper-warm)' } },
          App.el('div', { class: 'p-5 sm:p-8' },
            Kicker('Business Section · Flagship System'),
            App.el('h3', { class: 'mt-2', style: { fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem,3.4vw,2.4rem)', lineHeight: '1.04', letterSpacing: '-0.01em', color: 'var(--ink)', fontWeight: '400' }, text: 'mubdiur.github.io — the production platform behind this page' }),
            App.el('p', { class: 'mt-3', style: { maxWidth: '48rem', fontFamily: 'var(--font-serif)', fontSize: '1rem', lineHeight: '1.7', color: 'var(--ink-soft)' }, text: 'This newspaper is not a template — it\u2019s a production system. A fully static site with a WebAssembly core: every utility below runs entirely in your browser, no server required. Deployable to GitHub Pages from a public repo, edge-cached, zero cold starts.' }),
            App.el('ul', { class: 'mt-6', style: { display: 'grid', gap: '0.5rem 2rem', gridTemplateColumns: '1fr' } },
              [
                'Static HTML + WebAssembly — no server, no build step, no dependencies',
                '60+ utilities running fully client-side, WASM-backed crypto & QR engines',
                'Hash, HMAC, CRC32, QR encoding and X.509 ASN.1 parsing in WebAssembly',
                'No analytics calls home; everything happens in your browser',
                'Live dateline and clock — no hydration mismatch',
                'Single folder deploy to GitHub Pages from any public repo'
              ].map(function (item) {
                return App.el('li', { class: 'flex gap-2.5', style: { fontFamily: 'var(--font-serif)', fontSize: '0.95rem', lineHeight: '1.625', color: 'var(--ink-soft)', display: 'flex', gap: '0.625rem' }, html: '<span aria-hidden="true" style="margin-top:0.55em;height:4px;width:12px;flex-shrink:0;background:var(--news-red)"></span>' + App.esc(item) });
              })))),
        App.el('div', { class: 'mt-px' },
          App.el('div', { class: 'hairline-grid lg-cols-3' }, systems.map(ArticleCard)))),

      /* ── TOOLS DESK ── */
      App.el('section', { id: 'tools', class: 'news-section bordered' },
        App.el('div', { class: 'flex flex-wrap items-end justify-between gap-4 mb-7' },
          App.el('div', {},
            Kicker('Tools Desk · From the Archive'),
            App.el('h2', { class: 'mt-2', style: { fontFamily: 'var(--font-display)', fontSize: 'clamp(1.7rem,4vw,2.6rem)', lineHeight: '1.02', letterSpacing: '-0.01em', color: 'var(--ink)', fontWeight: '400' }, text: TOOLMANIFEST.length + ' utilities, typeset by hand' })),
          App.el('a', { href: '#/tools', class: 'kicker', style: { textDecoration: 'none' }, text: 'Visit the full archive →' })),
        App.el('div', { class: 'hairline-grid lg-cols-3' },
          featured.map(function (t) {
            return App.el('a', { href: '#/tools/' + t.slug, class: 'featured-link' },
              App.el('div', { class: 'slug', text: '/' + t.slug }),
              App.el('h3', { text: t.name }),
              App.el('p', { text: t.desc }));
          }))),

      /* ── SUPPLEMENT ── */
      App.el('section', { id: 'supplement', class: 'news-section bordered' }, SundaySupplement()),

      /* ── CLASSIFIEDS ── */
      App.el('section', { id: 'classifieds', class: 'news-section bordered' },
        SectionTitle('Classifieds · Personals', 'Seeking engagement with the right desk'),
        App.el('div', { class: 'wanted-ad' },
          App.el('div', { class: 'wanted', text: 'WANTED' }),
          App.el('p', { text: 'Platform, automation & reliability engineering opportunities. Will trade architecture walkthroughs and a full dossier for a conversation.' }),
          App.el('div', { class: 'wanted-actions' },
            App.el('a', { class: 'btn-news', href: 'mailto:mubdiur@gmail.com?subject=Technical%20Screen', text: '→ Schedule a technical screen' }),
            App.el('a', { class: 'btn-news-ghost', href: 'portfolio.html', text: 'Read the dossier' }),
            App.el('button', { class: 'btn-news-ghost', type: 'button', id: 'share-times-btn', text: 'Share the Times' }))),
        App.el('div', { class: 'mt-px' },
          App.el('div', { class: 'hairline-grid md-cols-2', style: { gridTemplateColumns: 'repeat(3,1fr)' } },
            [
              { label: 'By Wire', value: 'mubdiur@gmail.com', href: 'mailto:mubdiur@gmail.com' },
              { label: 'By Repository', value: 'github.com/mubdiur', href: 'https://github.com/mubdiur' },
              { label: 'By Network', value: 'linkedin.com/in/mubdiur', href: 'https://linkedin.com/in/mubdiur' }
            ].map(function (c) {
              return App.el('a', { href: c.href, target: c.href.startsWith('http') ? '_blank' : undefined, rel: c.href.startsWith('http') ? 'noopener noreferrer' : undefined, class: 'featured-link' },
                App.el('div', { class: 'slug', text: c.label }),
                App.el('h3', { class: 'break-all', text: c.value }));
            }))))),

    /* ── COLOPHON ── */
    App.el('footer', { class: 'news-colophon' },
      App.el('div', { class: 'inner' },
        App.el('div', { class: 'title', text: 'The Mubdiur Times' }),
        App.el('p', { class: 'note', text: 'Colophon · Set in Libre Caslon, Libre Franklin & JetBrains Mono' }),
        App.el('p', { class: 'byline', text: 'Typeset by hand in HTML & WebAssembly. No trees were harmed; no page was printed.' }),
        App.el('div', { class: 'links' },
          App.el('a', { href: 'https://github.com/mubdiur', target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' }),
          App.el('a', { href: 'https://linkedin.com/in/mubdiur', target: '_blank', rel: 'noopener noreferrer', text: 'LinkedIn' }),
          App.el('a', { href: 'mailto:mubdiur@gmail.com', text: 'Email' }),
          App.el('a', { href: '#/tools', text: 'Tools Archive' })),
        App.el('p', { class: 'copyright', text: '© 2026 Mubdiur Rahman — All the reliability that\u2019s fit to print.' }))));

  var shareBtn = root.querySelector('#share-times-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var url = location.origin + location.pathname + '?ref=share';
      App.copy(url, shareBtn);
      shareBtn.textContent = '✓ Share link copied';
    });
  }

  // smooth-scroll for in-page anchors
  root.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  return root;
}

App.registerPage('/', renderHome);
})();
