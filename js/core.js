/* ═══════════════════════════════════════════════════════════
   App core — helpers, icons, router, navbar, footer, command palette.
   Everything the tools and pages build on. No frameworks.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var App = {
  icons: {},
  TOOL_VERSION: '24',

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
          try { node.setAttribute(k, v); } catch (e) { node[k] = v; }
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
    App.onCleanup.forEach(function (fn) { try { fn(); } catch (e) {} });
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
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  },
  sleep: function (ms) { return new Promise(function (r) { App.timer(r, ms); }); },

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
      var s = document.createElement('script');
      s.src = 'js/tools/' + slug + '.js?v=' + App.TOOL_VERSION;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load tool: ' + slug)); };
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
  registerPage: function (pattern, renderFn) { App.pages[pattern] = renderFn; },

  render: function () {
    App.cleanup();
    var main = document.getElementById('page-main');
    var raw = App.route();
    var path = raw.split('?')[0];
    var match = null;
    for (var p in App.pages) {
      if (p === '*') continue;
      var re = new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$');
      if (re.test(path)) { match = p; break; }
    }
    if (!match) match = '*';
    var fn = App.pages[match] || App.pages['*'];
    main.innerHTML = '';
    if (!fn) {
      main.appendChild(App.el('div', { class: 'not-found' },
        App.el('span', { class: 'nf-title', text: 'Page not found' }),
        App.el('span', { class: 'nf-sub', text: App.esc(raw) }),
        App.el('a', { class: 'mt-4', href: '#/', style: { fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ctp-teal)' }, text: '← Back home' })));
      App.renderNav();
      window.scrollTo(0, 0);
      return;
    }
    var result = fn(raw, main);
    if (result && typeof result.then === 'function') {
      var loading = App.el('div', { class: 'loading-block', html:
        '<span class="loading-dot h-2 w-2 rounded-full bg-ctp-teal/70" style="width:10px;height:10px;border-radius:50%;background:rgba(194,220,212,0.7);display:inline-block;margin:0 2px"></span>' +
        '<span class="loading-dot h-2 w-2 rounded-full bg-ctp-teal/70" style="width:10px;height:10px;border-radius:50%;background:rgba(194,220,212,0.7);display:inline-block;margin:0 2px"></span>' +
        '<span class="loading-dot h-2 w-2 rounded-full bg-ctp-teal/70" style="width:10px;height:10px;border-radius:50%;background:rgba(194,220,212,0.7);display:inline-block;margin:0 2px"></span>' });
      main.appendChild(loading);
      result.then(function (node) {
        if (main.contains(loading)) { main.removeChild(loading); }
        main.appendChild(node);
      }).catch(function (err) {
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
    var isHome = path === '/' || path === '';
    var links = [
      { href: '#/', label: 'Home', active: isHome },
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
      App.el('nav', { class: 'nav-links-desktop' }, linkEls[0], App.el('span', { class: 'nav-divider' }), linkEls[1], App.el('span', { class: 'nav-divider' }), searchBtn),
      mobile
    ));
  },
  renderFooter: function () {
    var footer = document.getElementById('site-footer');
    footer.innerHTML = '';
    footer.appendChild(App.el('footer', { class: 'site-footer' },
      App.el('div', { class: 'footer-inner' },
        App.el('p', { class: 'footer-line', html: '<span class="prompt">$</span> echo &quot;© ' + new Date().getFullYear() + ' <span style="font-weight:600;color:rgba(233,233,236,0.9)">Mubdiur Rahman</span>&quot;' }),
        App.el('div', { class: 'footer-links' },
          App.el('a', { class: 'footer-link', href: 'mailto:mubdiur@gmail.com' }, App.icon('mail', '', 14), App.el('span', { text: 'Contact' })),
          App.el('a', { class: 'footer-link', href: 'https://github.com/mubdiur', target: '_blank', rel: 'noopener noreferrer' }, App.icon('github', '', 14), App.el('span', { text: 'GitHub' })),
          App.el('a', { class: 'footer-link', href: 'https://linkedin.com/in/mubdiur', target: '_blank', rel: 'noopener noreferrer' }, App.icon('briefcase', '', 14), App.el('span', { text: 'LinkedIn' }))
        ))));
  },

  /* ── mobile drawer ── */
  openDrawer: function () {
    var backdrop = App.el('div', { class: 'drawer-backdrop', onclick: function () { close(); } });
    var drawer = App.el('div', { class: 'mobile-drawer' },
      App.el('a', { class: 'drawer-link' + (App.route() === '/' ? ' active' : ''), href: '#/', text: 'Home' }),
      App.el('a', { class: 'drawer-link' + (App.route().indexOf('/tools') === 0 ? ' active' : ''), href: '#/tools', text: 'Tools' }),
      App.el('div', { class: 'drawer-footer', text: 'Press ⌘K to search' }));
    function close() { backdrop.remove(); drawer.remove(); }
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    requestAnimationFrame(function () { drawer.classList.add('open'); });
    App.onUnmount(close);
  },

  /* ── command palette ── */
  paletteOpen: false,
  paletteSelected: 0,
  openPalette: function () {
    if (App.paletteOpen) return;
    App.paletteOpen = true;
    App.paletteSelected = 0;
    var backdrop = App.el('div', { class: 'palette-backdrop', onclick: function (e) { if (e.target === backdrop) close(); } });
    var input = App.el('input', { class: 'palette-input', placeholder: 'Search ' + TOOLMANIFEST.length + '+ tools...', autocomplete: 'off' });
    var list = App.el('div', { class: 'palette-list' });
    var palette = App.el('div', { class: 'palette' },
      App.el('div', { class: 'palette-input-row' }, App.icon('search', '', 16), input, App.el('kbd', { text: 'ESC' })),
      list,
      App.el('div', { class: 'palette-foot' },
        App.el('span', { html: App.icon('terminal', '', 10).outerHTML + ' ' + TOOLMANIFEST.length + ' tools loaded' })));
    backdrop.appendChild(palette);
    document.body.appendChild(backdrop);

    function close() {
      App.paletteOpen = false;
      backdrop.remove();
      document.removeEventListener('keydown', keyHandler);
    }
    function render() {
      var q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      if (q) {
        var results = TOOLMANIFEST.filter(function (t) {
          return t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) ||
            t.tags.some(function (tag) { return tag.toLowerCase().includes(q); }) || t.category.toLowerCase().includes(q);
        });
        results.sort(function (a, b) {
          var aName = a.name.toLowerCase().indexOf(q) >= 0 ? 2 : 0;
          var bName = b.name.toLowerCase().indexOf(q) >= 0 ? 2 : 0;
          var aTag = a.tags.some(function (t) { return t.toLowerCase().includes(q); }) ? 1 : 0;
          var bTag = b.tags.some(function (t) { return t.toLowerCase().includes(q); }) ? 1 : 0;
          return (bName + bTag) - (aName + aTag);
        });
        results = results.slice(0, 20);
        if (!results.length) {
          list.appendChild(App.el('div', { class: 'palette-empty', text: 'No tools match "' + q + '"' }));
        } else {
          App.paletteResults = results;
          list.appendChild(App.el('div', { class: 'palette-label', text: 'Tools (' + results.length + ')' }));
          results.forEach(function (t, i) {
            list.appendChild(App.el('div', {
              class: 'palette-item' + (i === App.paletteSelected ? ' selected' : ''),
              onclick: function () { runTool(t.slug); },
              onmouseenter: function () { App.paletteSelected = i; refreshSel(); }
            },
              App.icon(t.icon, '', 14),
              App.el('div', { class: 'pi-main' },
                App.el('div', { class: 'pi-name', text: t.name }),
                App.el('div', { class: 'pi-sub', text: t.category + ' · ' + t.tags.slice(0, 2).join(', ') }))));
          });
        }
      } else {
        App.paletteResults = null;
        list.appendChild(App.el('div', { class: 'palette-label', text: 'Categories' }));
        TOOLCATEGORIES.forEach(function (cat, i) {
          var count = TOOLMANIFEST.filter(function (t) { return t.category === cat.id; }).length;
          list.appendChild(App.el('div', {
            class: 'palette-item' + (i === App.paletteSelected ? ' selected' : ''),
            onclick: function () { App.navigate('/tools?cat=' + cat.id); close(); },
            onmouseenter: function () { App.paletteSelected = i; refreshSel(); }
          },
            App.icon(cat.icon, '', 14),
            App.el('span', { text: cat.name }),
            App.el('span', { class: 'pi-count', text: String(count) })));
        });
      }
    }
    function refreshSel() {
      var items = list.querySelectorAll('.palette-item');
      items.forEach(function (el, i) { el.classList.toggle('selected', i === App.paletteSelected); });
      var sel = items[App.paletteSelected];
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
    function runTool(slug) { App.navigate('/tools/' + slug); close(); }
    function keyHandler(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); App.paletteSelected = Math.min(App.paletteSelected + 1, (App.paletteResults || TOOLCATEGORIES).length - 1); refreshSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); App.paletteSelected = Math.max(App.paletteSelected - 1, 0); refreshSel(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (App.paletteResults && App.paletteResults[App.paletteSelected]) runTool(App.paletteResults[App.paletteSelected].slug);
        else if (!App.paletteResults && TOOLCATEGORIES[App.paletteSelected]) { App.navigate('/tools?cat=' + TOOLCATEGORIES[App.paletteSelected].id); close(); }
      }
    }
    input.addEventListener('input', function () { App.paletteSelected = 0; render(); });
    document.addEventListener('keydown', keyHandler);
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
  outputBox: function (output, error, label, onClear) {
    return App.el('div', {},
      App.el('div', { class: 'output-head' },
        App.el('span', { class: 'output-label', text: error ? 'Error' : (label || 'Output') }),
        App.el('div', { class: 'output-actions' },
          output && !error ? App.copyButton(output) : null,
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
  shieldalert: 'shield-alert', caseSensitive: 'case-sensitive', filespreadsheet: 'file-spreadsheet'
};

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}

window.App = App;

/* ── boot ── */
window.addEventListener('error', function (e) {
  var d = document.getElementById('page-main');
  if (!d) return;
  if (!d.querySelector('.boot-error')) {
    d.appendChild(App.el('div', { class: 'boot-error', style: 'color:#ddcdd3;font-family:var(--font-mono);font-size:12px;padding:1rem;white-space:pre-wrap;word-break:break-all',
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
  loadWasm().catch(function () { /* site still works; wasm tools show a loading error */ });
});
})();
