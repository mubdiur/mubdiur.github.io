/* ═══════════════════════════════════════════════════════════
   App core — helpers, icons, router, navbar, footer, command palette.
   Everything the tools and pages build on. No frameworks.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var App = {
  icons: {},
  TOOL_VERSION: '50',

  /* ── DOM helpers ── */
  SVG_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'g', 'defs', 'marker', 'pattern', 'use', 'ellipse', 'tspan'],
  el: function (tag, props) {
    var node = App.SVG_TAGS.indexOf(tag) >= 0
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    var firstChildIdx = 1;
    if (props && typeof props === 'object' && !props.nodeType) {
      for (var k in props) {
        var v = props[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') {
          if (node instanceof SVGElement) node.setAttribute('class', v);
          else node.className = v;
        }
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          for (var s in v) node.style[s] = v[s];
        } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else if (k === 'dataset') {
          for (var d in v) node.dataset[d] = v[d];
        } else {
          try { node.setAttribute(k, v); } catch { node[k] = v; }
        }
      }
      firstChildIdx = 2;
    }
    for (var i = firstChildIdx; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === undefined || child === null || child === false) continue;
      if (Array.isArray(child)) {
        for (var j = 0; j < child.length; j++) {
          var c = child[j];
          if (c === undefined || c === null || c === false) continue;
          node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
        }
      } else {
        node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
      }
    }
    return node;
  },

  /** Build an SVG icon element from the ICONS registry. */
  icon: function (name, className, size) {
    var key = ICON_ALIASES[name] || name;
    var inner = window.ICONS && window.ICONS[key];
    if (!inner) return App.el('span', { class: className || '', text: '◈' });
    return App.el('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      class: className || '', width: size || undefined, height: size || undefined,
      'aria-hidden': 'true', html: inner
    });
  },

  esc: function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /**
   * Fuzzy matcher score, or -1 when `target` doesn't contain `query`
   * as a subsequence. Scoring favors exact substrings (earlier and
   * word-boundary anchored rank higher), then runs of consecutive
   * characters, then compactness. One scorer powers both the
   * command palette and the tools-index search so they always agree.
   */
  fuzzyScore: function (query, target) {
    var q = String(query).toLowerCase().trim();
    var t = String(target).toLowerCase();
    if (!q) return 0;
    var exact = t.indexOf(q);
    if (exact >= 0) {
      var atBoundary = exact === 0 || /[\s\-_.//]/.test(t.charAt(exact - 1));
      return 1000 - exact * 2 - (atBoundary ? 0 : 10) - Math.floor(t.length / 16);
    }
    function sub(q) {
      var score = 0, ti = 0, streak = 0;
      for (var qi = 0; qi < q.length; qi++) {
        var ch = q.charAt(qi);
        if (ch === ' ') continue;
        var found = t.indexOf(ch, ti);
        if (found === -1) return -1;
        if (found === ti && qi > 0) { streak++; score += 8 + streak * 2; }
        else { streak = 0; score += 1; }
        if (found === 0 || /[\s\-_.//]/.test(t.charAt(found - 1))) score += 6;
        ti = found + 1;
      }

      return score;
    }
    var straight = sub(q);
    if (straight >= 0) return straight;
    var bestSwap = -1;
    for (var si = 0; si + 1 < q.length; si++) {
      var alt = q.slice(0, si) + q.charAt(si + 1) + q.charAt(si) + q.slice(si + 2);
      var r = sub(alt);
      if (r > bestSwap) bestSwap = r;
    }
    return bestSwap >= 0 ? Math.max(bestSwap - 15, 1) : -1;
  },

  /** Slug-first fuzzy score across a tool's searchable fields. */
  toolMatchScore: function (tool, query) {
    if (!String(query).trim()) return 0;
    var self = this;
    var best = self.fuzzyScore(query, tool.slug) * 5;
    best = Math.max(best, self.fuzzyScore(query, tool.name) * 4);
    best = Math.max(best, self.fuzzyScore(query, tool.desc) * 2);
    for (var i = 0; i < tool.tags.length; i++) {
      best = Math.max(best, self.fuzzyScore(query, tool.tags[i]) * 3);
    }
    return Math.max(best, self.fuzzyScore(query, tool.category));
  },

  /* ── timers / raf that auto-clean on route change ── */
  timers: [],
  rafs: [],
  listeners: [],
  onCleanup: [],
  timer: function (fn, ms) {
    var id = setTimeout(function () { App.clearTimer(id); fn(); }, ms);
    App.timers.push(id);
    return id;
  },
  interval: function (fn, ms) {
    var id = setInterval(fn, ms);
    App.intervals.push(id);
    return id;
  },
  intervals: [],
  clearTimer: function (id) {
    var i = App.timers.indexOf(id);
    if (i >= 0) App.timers.splice(i, 1);
  },
  raf: function (fn) {
    var id = requestAnimationFrame(fn);
    App.rafs.push(id);
    return id;
  },
  on: function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    App.listeners.push([target, type, fn, opts]);
    return fn;
  },
  cleanup: function () {
    App.timers.forEach(clearTimeout);
    App.intervals.forEach(clearInterval);
    App.rafs.forEach(cancelAnimationFrame);
    App.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    App.onCleanup.forEach(function (fn) { try { fn(); } catch {} });
    App.timers = []; App.intervals = []; App.rafs = [];
    App.listeners = []; App.onCleanup = [];
  },
  onUnmount: function (fn) { App.onCleanup.push(fn); },

  /* ── clipboard / download ── */
  copy: function (text, btnEl) {
    var done = function () {
      if (!btnEl) return;
      var orig = btnEl.innerHTML;
      var check = App.icon('check', '', 14);
      btnEl.innerHTML = '';
      btnEl.appendChild(check);
      btnEl.appendChild(document.createTextNode('Copied'));
      setTimeout(function () { btnEl.innerHTML = orig; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  },
  download: function (filename, content, mime) {
    try {
      var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      App.timer(function () { try { URL.revokeObjectURL(url); a.remove(); } catch {} }, 700);
    } catch (e) {
      var msg = (e && e.message) || String(e);
      try { console.error('download failed:', msg); } catch {}
    }
  },
  sleep: function (ms) { return new Promise(function (r) { App.timer(r, ms); }); },
  /* Trailing-edge debounce — collapses per-keystroke heavy work (full
     re-transform, palette re-score) into one run after typing pauses. */
  debounce: function (fn, ms) {
    var t = 0;
    return function () {
      var args = arguments, self = this;
      if (t) { try { clearTimeout(t); } catch {} }
      App.clearTimer(t);
      t = App.timer(function () { fn.apply(self, args); }, ms || 120);
    };
  },

  /* ── tool registry ── */
  tools: {},
  registerTool: function (slug, def) {
    App.tools[slug] = def;
    if (App.tools[slug].css && !document.getElementById('toolcss-' + slug)) {
      var st = document.createElement('style');
      st.id = 'toolcss-' + slug;
      st.textContent = App.tools[slug].css;
      document.head.appendChild(st);
    }
  },
  loadToolScript: function (slug) {
    return new Promise(function (resolve, reject) {
      if (App.tools[slug] && App.tools[slug]._loaded) { resolve(); return; }
      // dedupe: if a script tag for this slug is already pending, reuse its load
      var existing = document.querySelector('script[data-tool="' + slug + '"]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Failed to load tool: ' + slug)); }, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.setAttribute('data-tool', slug);
      s.src = 'js/tools/' + slug + '.js?v=' + App.TOOL_VERSION;
      s.onload = function () { if (App.tools[slug]) App.tools[slug]._loaded = true; resolve(); };
      s.onerror = function () { try { s.remove(); } catch {} reject(new Error('Failed to load tool: ' + slug)); };
      document.head.appendChild(s);
    });
  },

  /* ── routing (hash-based; works on GitHub Pages project sites) ── */
  route: function () {
    var hash = location.hash || '#/';
    return hash.replace(/^#/, '');
  },
  navigate: function (path) {
    if (location.hash === '#' + path) { App.render(); return; }
    location.hash = path;
  },
  pages: {},
  _routeRes: {},
  registerPage: function (pattern, renderFn) {
    App.pages[pattern] = renderFn;
    /* Precompile once — render() runs on every hash change. */
    var esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+');
    App._routeRes[pattern] = new RegExp('^' + esc + '$');
  },

  _renderGen: 0,
  render: function () {
    App._renderGen++;
    var myGen = App._renderGen;
    App.cleanup();
    var main = document.getElementById('page-main');
    if (!main) return;
    var raw = App.route();
    var path = raw.split('?')[0];
    var match = null;
    for (var p in App.pages) {
      if (p === '*') continue;
      if (App._routeRes[p].test(path)) { match = p; break; }
    }
    if (!match) match = '*';
    var fn = App.pages[match] || App.pages['*'];
    /* Per-route title: bookmarks, history and screen readers get the
       real page name instead of one static title for the whole SPA. */
    try {
      var baseTitle = 'Mubdiur Rahman — AI Platform & Reliability Engineer';
      var pageTitle = baseTitle;
      if (path === '/tools' || path.indexOf('/tools?') === 0) pageTitle = 'Developer Tools — ' + baseTitle;
      else if (path.indexOf('/tools/') === 0) {
        var tSlug = path.replace(/^\/tools\//, '').replace(/[?#].*$/, '');
        var tDef = (window.TOOLS_BY_SLUG || {})[tSlug];
        pageTitle = (tDef ? tDef.name : 'Developer Tool') + ' — Developer Tools';
      }
      else if (path === '/ide' || path.indexOf('/ide') === 0) pageTitle = 'In-Browser IDE — ' + baseTitle;
      if (document.title !== pageTitle) document.title = pageTitle;
    } catch {}
    main.innerHTML = '';
    var footerEl = document.getElementById('site-footer');
    if (footerEl) footerEl.style.display = (path === '/ide' || path.indexOf('/ide') === 0) ? 'none' : '';
    if (!fn) {
      main.appendChild(App.el('div', { class: 'not-found' },
        App.el('span', { class: 'nf-title', text: 'Page not found' }),
        App.el('span', { class: 'nf-sub', text: App.esc(raw) }),
        App.el('a', { class: 'mt-4', href: '#/', style: { fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ctp-teal)' }, text: '← Back home' })));
      App.renderNav();
      window.scrollTo(0, 0);
      return;
    }
    var result;
    try { result = fn(raw, main); } catch (e) {
      main.appendChild(App.el('div', { class: 'not-found', html:
        '<span class="nf-title">Something broke</span><span class="nf-sub">' + App.esc(e && e.message || e) + '</span>' }));
      App.renderNav();
      window.scrollTo(0, 0);
      return;
    }
    if (result && typeof result.then === 'function') {
      var loading = App.el('div', { class: 'loading-block', html:
        '<span class="loading-dot h-2 w-2 rounded-full bg-ctp-teal/70" style="width:10px;height:10px;border-radius:50%;background:rgba(83,163,249,0.7);display:inline-block;margin:0 2px"></span>' +
        '<span class="loading-dot h-2 w-2 rounded-full bg-ctp-teal/70" style="width:10px;height:10px;border-radius:50%;background:rgba(83,163,249,0.7);display:inline-block;margin:0 2px"></span>' +
        '<span class="loading-dot h-2 w-2 rounded-full bg-ctp-teal/70" style="width:10px;height:10px;border-radius:50%;background:rgba(83,163,249,0.7);display:inline-block;margin:0 2px"></span>' });
      main.appendChild(loading);
      result.then(function (node) {
        if (myGen !== App._renderGen) return;
        if (main.contains(loading)) { main.removeChild(loading); }
        if (node && node.nodeType) main.appendChild(node);
      }).catch(function (err) {
        if (myGen !== App._renderGen) return;
        main.innerHTML = '';
        main.appendChild(App.el('div', { class: 'not-found', html:
          '<span class="nf-title">Something broke</span><span class="nf-sub">' + App.esc(err && err.message || err) + '</span>' }));
      });
    } else if (result && result.nodeType) {
      main.appendChild(result);
    }
    App.renderNav();
    window.scrollTo(0, 0);
  },

  /* ── navbar / footer ── */
  renderNav: function () {
    var nav = document.getElementById('site-nav');
    var path = App.route();
    var isTools = path === '/tools' || path.indexOf('/tools') === 0;
    var isIde = path === '/ide' || path.indexOf('/ide') === 0;
    var isHome = path === '/' || path === '';
    var links = [
      { href: '#/', label: 'Home', active: isHome },
      { href: '#/ide', label: 'IDE', active: isIde },
      { href: '#/tools', label: 'Tools', active: isTools }
    ];
    var linkEls = links.map(function (l) {
      return App.el('a', { class: 'nav-link' + (l.active ? ' active' : ''), href: l.href, text: l.label });
    });
    var searchBtn = App.el('button', {
      class: 'nav-search-btn', type: 'button', 'aria-label': 'Search tools (Ctrl+K)',
      onclick: function () { App.openPalette(); }
    }, App.icon('search', '', 14), App.el('span', { class: 'search-label', text: 'Search tools...' }),
      App.el('kbd', { text: '⌘K' }));
    var mobile = App.el('div', { class: 'nav-mobile' },
      App.el('button', { type: 'button', 'aria-label': 'Search', onclick: function () { App.openPalette(); } }, App.icon('search', '', 20)),
      App.el('button', { type: 'button', 'aria-label': 'Menu', onclick: function () { App.openDrawer(); } }, App.icon('menu', '', 20)));
    nav.innerHTML = '';
    nav.appendChild(App.el('div', { class: 'site-navbar' },
      App.el('a', { class: 'nav-brand', href: '#/' },
        App.el('span', { class: 'brand-box', text: 'MR' }),
        App.el('span', { class: 'brand-name', text: 'mubdiur' }),
        App.el('span', { class: 'brand-sub', text: 'dev arsenal' })),
      App.el('nav', { class: 'nav-links-desktop' }, linkEls[0], App.el('span', { class: 'nav-divider' }), linkEls[1], App.el('span', { class: 'nav-divider' }), linkEls[2], App.el('span', { class: 'nav-divider' }), searchBtn),
      mobile
    ));
  },
  renderFooter: function () {
    var footer = document.getElementById('site-footer');
    footer.innerHTML = '';
    footer.appendChild(App.el('footer', { class: 'site-footer' },
      App.el('div', { class: 'footer-inner' },
        App.el('p', { class: 'footer-line', html: '<span class="prompt">$</span> echo &quot;© ' + new Date().getFullYear() + ' <span style="font-weight:600;color:rgba(227,227,227,0.9)">Mubdiur Rahman</span>&quot;' }),
        App.el('div', { class: 'footer-links' },
          App.el('a', { class: 'footer-link', href: 'mailto:mubdiur@gmail.com' }, App.icon('mail', '', 14), App.el('span', { text: 'Contact' })),
          App.el('a', { class: 'footer-link', href: 'https://github.com/mubdiur', target: '_blank', rel: 'noopener noreferrer' }, App.icon('github', '', 14), App.el('span', { text: 'GitHub' })),
          App.el('a', { class: 'footer-link', href: 'https://linkedin.com/in/mubdiur', target: '_blank', rel: 'noopener noreferrer' }, App.icon('briefcase', '', 14), App.el('span', { text: 'LinkedIn' }))
        ))));
  },

  /* ── focus trap: Escape closes, Tab wraps within selector ── */
  trapFocus: function (container, selector, onEscape, onKey) {
    function handler(e) {
      if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
      if (e.key === 'Tab' && selector) {
        var items = container.querySelectorAll(selector);
        if (items.length) {
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); return; }
          if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); return; }
        }
      }
      if (onKey) onKey(e);
    }
    document.addEventListener('keydown', handler);
    return function release() { document.removeEventListener('keydown', handler); };
  },
  /* ── modal inert: hide nav/main/footer while a dialog owns input ── */
  _modalDepth: 0,
  setModalInert: function (on) {
    if (on) { App._modalDepth++; } else { App._modalDepth = Math.max(0, App._modalDepth - 1); }
    var show = App._modalDepth > 0;
    ['site-nav', 'page-main', 'site-footer'].forEach(function (id) {
      var n = document.getElementById(id);
      if (!n) return;
      if (show) n.setAttribute('inert', '');
      else n.removeAttribute('inert');
    });
  },
  /* ── mobile drawer ── */
  openDrawer: function () {
    var opener = document.activeElement;
    var backdrop = App.el('div', { class: 'drawer-backdrop', onclick: function () { close(); } });
    var drawer = App.el('div', { class: 'mobile-drawer', role: 'dialog', 'aria-label': 'Site navigation' },
      App.el('a', { class: 'drawer-link' + (App.route() === '/' ? ' active' : ''), href: '#/', text: 'Home' }),
      App.el('a', { class: 'drawer-link' + (App.route().indexOf('/ide') === 0 ? ' active' : ''), href: '#/ide', text: 'IDE' }),
      App.el('a', { class: 'drawer-link' + (App.route().indexOf('/tools') === 0 ? ' active' : ''), href: '#/tools', text: 'Tools' }),
      App.el('div', { class: 'drawer-footer', text: 'Press ⌘K to search' }));
    var releaseTrap = null, closed = false;
    function close() { if (closed) return; closed = true; if (releaseTrap) releaseTrap(); backdrop.remove(); drawer.remove(); App.setModalInert(false); if (opener && opener.focus) opener.focus(); }
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    releaseTrap = App.trapFocus(drawer, 'a.drawer-link', close);
    App.setModalInert(true);
    var firstLink = drawer.querySelector('a.drawer-link');
    if (firstLink) firstLink.focus();
    requestAnimationFrame(function () { drawer.classList.add('open'); });
    App.onUnmount(close);
  },

  /* -- recent tools (command palette) -- */
  recentToolsKey: 'mub.recenttools.v1',
  recentToolsMax: 6,
  getRecentTools: function () {
    var slugs = [];
    try { slugs = JSON.parse(localStorage.getItem(App.recentToolsKey) || '[]'); } catch { slugs = []; }
    if (!Array.isArray(slugs)) return [];
    var known = {};
    TOOLMANIFEST.forEach(function (t) { known[t.slug] = t; });
    var out = [], seen = {};
    slugs.forEach(function (s) { if (typeof s === 'string' && known[s] && !seen[s]) { seen[s] = true; out.push(known[s]); } });
    return out.slice(0, App.recentToolsMax);
  },
  recordRecentTool: function (slug) {
    if (typeof slug !== 'string' || !slug) return;
    var slugs = [];
    try { slugs = JSON.parse(localStorage.getItem(App.recentToolsKey) || '[]'); } catch { slugs = []; }
    if (!Array.isArray(slugs)) slugs = [];
    slugs = [slug].concat(slugs.filter(function (s) { return s !== slug; })).slice(0, App.recentToolsMax);
    try { localStorage.setItem(App.recentToolsKey, JSON.stringify(slugs)); } catch {}
  },
  getFavSlugs: function () {
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem('mub.favtools.v1') || '[]'); } catch { arr = []; }
    if (!Array.isArray(arr)) return [];
    var known = {};
    TOOLMANIFEST.forEach(function (t) { known[t.slug] = true; });
    return arr.filter(function (s) { return typeof s === 'string' && known[s]; });
  },
  /* Boosts nudge favorites and recents above near-ties and weak
     substring hits, but never above an exact slug/name match. */
  rankBoosts: function () {
    var boosts = {};
    App.getFavSlugs().forEach(function (s) { boosts[s] = Math.max(boosts[s] || 0, 400); });
    App.getRecentTools().forEach(function (t, i) {
      var w = 300 - i * 40;
      if (w < 60) w = 60;
      boosts[t.slug] = Math.max(boosts[t.slug] || 0, w);
    });
    return boosts;
  },
  /* Scored search shared by the palette: base fuzzy score plus
     favorite/recent boosts. Only true matches rank (base > 0). */
  rankedTools: function (query, limit) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var boosts = App.rankBoosts();
    return TOOLMANIFEST
      .map(function (t) { var base = App.toolMatchScore(t, q); return { tool: t, base: base, s: base + (base > 0 ? (boosts[t.slug] || 0) : 0) }; })
      .filter(function (x) { return x.base > 0; })
      .sort(function (a, b) { return b.s - a.s || a.tool.slug.length - b.tool.slug.length; })
      .map(function (x) { return x.tool; })
      .slice(0, limit || 20);
  },
  /* ── command palette ── */
  paletteOpen: false,
  paletteSelected: 0,
  openPalette: function () {
    if (App.paletteOpen) return;
    App.paletteOpen = true;
    App.paletteSelected = 0;
    var opener = document.activeElement;
    var backdrop = App.el('div', { class: 'palette-backdrop', onclick: function (e) { if (e.target === backdrop) close(); } });
    var input = App.el('input', { class: 'palette-input', placeholder: 'Search ' + TOOLMANIFEST.length + '+ tools...', autocomplete: 'off' });
    var list = App.el('div', { class: 'palette-list', role: 'listbox', 'aria-label': 'Tools' });
    var palette = App.el('div', { class: 'palette' },
      App.el('div', { class: 'palette-input-row' }, App.icon('search', '', 16), input, App.el('kbd', { text: 'ESC' })),
      list,
      App.el('div', { class: 'palette-foot' },
        App.el('span', { html: App.icon('terminal', '', 10).outerHTML + ' ' + TOOLMANIFEST.length + ' tools loaded' })));
    backdrop.appendChild(palette);
    document.body.appendChild(backdrop);

    var releaseTrap = null, closed = false;
    function close() {
      if (closed) return; closed = true;
      App.paletteOpen = false;
      if (releaseTrap) releaseTrap();
      backdrop.remove();
      App.setModalInert(false);
      if (opener && opener.focus) opener.focus();
    }
    function toolItem(t, i) {
      return App.el('button', {
        type: 'button',
        class: 'palette-item' + (i === App.paletteSelected ? ' selected' : ''),
        role: 'option',
        'aria-selected': (i === App.paletteSelected).toString(),
        tabindex: i === App.paletteSelected ? '0' : '-1',
        onclick: function () { runTool(t.slug); },
        onmouseenter: function () { App.paletteSelected = i; refreshSel(); }
      },
        App.icon(t.icon, '', 14),
        App.el('div', { class: 'pi-main' },
          App.el('div', { class: 'pi-name', text: t.name }),
          App.el('div', { class: 'pi-sub', text: t.category + ' · ' + t.tags.slice(0, 2).join(', ') })));
    }
    function render() {
      var q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      App.paletteRows = [];
      if (q) {
        var results = App.rankedTools(q, 20);
        if (!results.length) {
          list.appendChild(App.el('div', { class: 'palette-empty', text: 'No tools match "' + q + '"' }));
        } else {
          App.paletteResults = results;
          list.appendChild(App.el('div', { class: 'palette-label', text: 'Tools (' + results.length + ')' }));
          results.forEach(function (t) {
            App.paletteRows.push({ kind: 'tool', slug: t.slug });
            list.appendChild(toolItem(t, App.paletteRows.length - 1));
          });
        }
      } else {
        App.paletteResults = null;
        var favs = App.getFavSlugs();
        var favSet = {};
        favs.forEach(function (s) { favSet[s] = true; });
        if (favs.length) {
          list.appendChild(App.el('div', { class: 'palette-label', text: 'Favorites' }));
          favs.forEach(function (s) {
            var t = TOOLS_BY_SLUG[s];
            if (!t) return;
            App.paletteRows.push({ kind: 'tool', slug: t.slug });
            list.appendChild(toolItem(t, App.paletteRows.length - 1));
          });
        }
        var recents = App.getRecentTools().filter(function (t) { return !favSet[t.slug]; });
        if (recents.length) {
          list.appendChild(App.el('div', { class: 'palette-label', text: 'Recent' }));
          recents.forEach(function (t) {
            App.paletteRows.push({ kind: 'tool', slug: t.slug });
            list.appendChild(toolItem(t, App.paletteRows.length - 1));
          });
        }
        list.appendChild(App.el('div', { class: 'palette-label', text: 'Categories' }));
        TOOLCATEGORIES.forEach(function (cat) {
          var count = TOOLMANIFEST.filter(function (t) { return t.category === cat.id; }).length;
          var idx = App.paletteRows.length;
          App.paletteRows.push({ kind: 'cat', id: cat.id });
          list.appendChild(App.el('button', {
            type: 'button',
            class: 'palette-item' + (idx === App.paletteSelected ? ' selected' : ''),
            role: 'option',
            'aria-selected': (idx === App.paletteSelected).toString(),
            tabindex: idx === App.paletteSelected ? '0' : '-1',
            onclick: function () { App.navigate('/tools?cat=' + cat.id); close(); },
            onmouseenter: function () { App.paletteSelected = idx; refreshSel(); }
          },
            App.icon(cat.icon, '', 14),
            App.el('span', { text: cat.name }),
            App.el('span', { class: 'pi-count', text: String(count) })));
        });
      }
    }
    function refreshSel() {
      var items = list.querySelectorAll('.palette-item');
      items.forEach(function (el, i) {
        var on = i === App.paletteSelected;
        el.classList.toggle('selected', on);
        el.setAttribute('tabindex', on ? '0' : '-1');
        el.setAttribute('aria-selected', on.toString());
      });
      var sel = items[App.paletteSelected];
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
    function runTool(slug) { App.navigate('/tools/' + slug); close(); }
    function keyHandler(e) {
      var rowCount = (App.paletteRows || []).length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (rowCount) App.paletteSelected = (App.paletteSelected + 1) % rowCount; refreshSel(); if (document.activeElement !== input) focusSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (rowCount) App.paletteSelected = (App.paletteSelected - 1 + rowCount) % rowCount; refreshSel(); if (document.activeElement !== input) focusSel(); }
      else if (e.key === 'Enter') {
        if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('palette-item')) return;
        e.preventDefault();
        var row = App.paletteRows[App.paletteSelected];
        if (row && row.kind === 'tool') runTool(row.slug);
        else if (row && row.kind === 'cat') { App.navigate('/tools?cat=' + row.id); close(); }
      }
    }
    input.addEventListener('input', App.debounce(function () { App.paletteSelected = 0; render(); }, 100));
    function focusSel() {
      var items = list.querySelectorAll('.palette-item');
      var sel = items[App.paletteSelected];
      if (sel) sel.focus();
    }
    releaseTrap = App.trapFocus(backdrop, '.palette-input,.palette-item', close, keyHandler);
    App.setModalInert(true);
    input.focus();
    render();
  },

  /* ── shared UI fragments ── */
  copyButton: function (text, label) {
    var btn = App.el('button', { class: 'btn-copy', type: 'button' }, App.icon('copy', '', 14), App.el('span', { text: label || 'Copy' }));
    btn.addEventListener('click', function () { App.copy(text, btn); });
    return btn;
  },
  clearButton: function (onClear) {
    var btn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.icon('rotate-ccw', '', 14), App.el('span', { text: 'Clear' }));
    btn.addEventListener('click', onClear);
    return btn;
  },
  downloadButton: function (onDownload, label) {
    var btn = App.el('button', { class: 'btn-copy', type: 'button', title: 'Download output as a file', 'aria-label': 'Download output' }, App.icon('download', '', 14), App.el('span', { text: label || 'Download' }));
    btn.addEventListener('click', function () { onDownload(); });
    return btn;
  },
  outputBox: function (output, error, label, onClear, onDownload) {
    return App.el('div', {},
      App.el('div', { class: 'output-head' },
        App.el('span', { class: 'output-label', text: error ? 'Error' : (label || 'Output') }),
        App.el('div', { class: 'output-actions' },
          output && !error ? App.copyButton(output) : null,
          output && !error && onDownload ? App.downloadButton(onDownload) : null,
          onClear ? App.clearButton(onClear) : null)),
      App.el('div', { class: 'output-box' + (error ? ' error' : ''), text: error || output || '' }));
  }
};

var ICON_ALIASES = {
  textsearch: 'text-search', code2: 'code-2', images: 'image', arrowleftright: 'arrow-left-right',
  filespreadsheet: 'file-spreadsheet', scaneye: 'scan-eye', gitbranch: 'git-branch',
  shieldcheck: 'shield-check', casesensitive: 'case-sensitive', filetype: 'file-type',
  table: 'table-2', trash2: 'trash-2', loader2: 'loader-2', refreshcw: 'refresh-cw',
  imageplus: 'image-plus', fileplus2: 'file-plus-2', gitcomparearrows: 'git-compare-arrows',
  wand2: 'wand-2', mousepointerclick: 'mouse-pointer-click', rotateccw: 'rotate-ccw',
  arrowup: 'arrow-up', arrowdown: 'arrow-down', fastforward: 'fast-forward', externallink: 'external-link',
  shieldalert: 'shield-alert'
};

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
}

window.App = App;

/* ── boot ── */
window.addEventListener('error', function (e) {
  var d = document.getElementById('page-main');
  if (!d) return;
  if (!d.querySelector('.boot-error')) {
    d.appendChild(App.el('div', { class: 'boot-error', style: 'color:#fb565b;font-family:var(--font-mono);font-size:12px;padding:1rem;white-space:pre-wrap;word-break:break-all',
      text: 'JS error: ' + (e.message || e) + '\n' + ((e.filename || '') + ':' + (e.lineno || '')) }));
  }
});
window.addEventListener('DOMContentLoaded', function () {
  App.renderFooter();
  App.renderNav();
  App.render();
  window.addEventListener('hashchange', App.render);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); App.openPalette(); }
  });
  /* WASM core (645 KB) loads lazily — only when a wasm:true tool mounts
     (see pages/tool.js). Nothing else on the site needs it. */

  /* Offline shell: service worker precaches the app shell (~1.3 MB) on
     first visit; IDE engines/wasm/fonts join the runtime cache on use.
     file:// has no SW support — skip there. */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      try {
        var hadController = !!(navigator.serviceWorker.controller);
        navigator.serviceWorker.register('sw.js').catch(function () {});
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (!hadController) { hadController = true; return; }
          if (document.getElementById('sw-update-toast')) return;
          var bar = App.el('div', { id: 'sw-update-toast', style: { position: 'fixed', left: '50%', bottom: '1rem', transform: 'translateX(-50%)', zIndex: '60', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(20,22,26,0.95)', border: '1px solid rgba(83,163,249,0.4)', color: '#e3e3e3', fontSize: '12px', padding: '0.5rem 0.75rem', borderRadius: '8px' } },
            App.el('span', { role: 'status', text: 'New shell cached — refresh to load it.' }),
            App.el('button', { class: 'btn-primary-sm', type: 'button', text: 'Refresh', onclick: function () { window.location.reload(); } }),
            App.el('button', { class: 'btn-copy', type: 'button', text: 'Dismiss', onclick: function () { var n = document.getElementById('sw-update-toast'); if (n) n.parentNode.removeChild(n); } }));
          document.body.appendChild(bar);
        });
      } catch {}
    });
  }
});
})();
