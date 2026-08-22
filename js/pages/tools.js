/* ═══════════════════════════════════════════════════════════
   Tools index — search + category tabs + tool cards.
   Ported from src/app/tools/page.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function ToolCard(tool) {
  return App.el('button', {
    class: 'tool-card',
    type: 'button',
    onclick: function () { App.navigate('/tools/' + tool.slug); }
  },
    App.el('div', { class: 'tc-icon' }, App.icon(tool.icon, '', 16)),
    App.el('div', { class: 'min-w-0 flex-1' },
      App.el('div', { class: 'tc-name', text: tool.name }),
      App.el('div', { class: 'tc-desc', text: tool.desc }),
      App.el('div', { class: 'tc-tags' },
        tool.tags.slice(0, 3).map(function (tag) {
          return App.el('span', { class: 'tc-tag', text: tag });
        }))));
}

function renderTools() {
  var serverCount = TOOLMANIFEST.filter(function (t) { return t.server; }).length;
  var clientCount = TOOLMANIFEST.length - serverCount;
  var state = { search: '', cat: null };

  var searchInput = App.el('input', {
    class: 'tools-search', type: 'text', placeholder: 'Search ' + TOOLMANIFEST.length + ' tools...',
    autocomplete: 'off', 'data-tool-search': '1'
  });
  searchInput.addEventListener('input', function () { state.search = searchInput.value; renderResults(); });

  var catTabs = App.el('div', { class: 'cat-tabs' });
  var results = App.el('div', { class: 'tools-results' });

  function clearFilters() {
    state.search = '';
    state.cat = null;
    searchInput.value = '';
    var cur = App.route();
    if (cur.indexOf('?cat=') >= 0) {
      App.navigate('/tools');
    } else {
      renderTabs(); renderResults();
    }
  }

  function renderTabs() {
    catTabs.innerHTML = '';
    catTabs.appendChild(App.el('button', {
      class: 'cat-tab' + (!state.cat && !state.search ? ' active' : ''),
      type: 'button',
      onclick: function () {
        state.cat = null; state.search = ''; searchInput.value = '';
        if (App.route().indexOf('?cat=') >= 0) App.navigate('/tools');
        else { renderTabs(); renderResults(); }
      },
      text: 'All'
    }));
    TOOLCATEGORIES.forEach(function (cat) {
      catTabs.appendChild(App.el('button', {
        class: 'cat-tab' + (state.cat === cat.id ? ' active' : ''),
        type: 'button',
        onclick: function () {
          state.cat = cat.id; state.search = ''; searchInput.value = '';
          App.navigate('/tools?cat=' + cat.id);
        }
      },
        App.icon(cat.icon, '', 14),
        App.el('span', { text: cat.name })));
    });
  }

  function renderResults() {
    var q = state.search.trim().toLowerCase();
    results.innerHTML = '';
    if (!q && !state.cat) {
      TOOLCATEGORIES.forEach(function (cat) {
        var tools = TOOLMANIFEST.filter(function (t) { return t.category === cat.id; });
        if (!tools.length) return;
        results.appendChild(App.el('div', { class: 'cat-section' },
          App.el('div', { class: 'cat-head' },
            App.icon(cat.icon, '', 16),
            App.el('h2', { text: cat.name }),
            App.el('span', { text: String(tools.length) })),
          App.el('div', { class: 'tool-grid' }, tools.map(ToolCard))));
      });
      return;
    }
    var filtered = TOOLMANIFEST.filter(function (t) {
      return (!state.cat || t.category === state.cat) &&
        (!q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) ||
          t.tags.some(function (tag) { return tag.toLowerCase().includes(q); }));
    });
    if (q) {
      filtered.sort(function (a, b) {
        var aScore = (a.name.toLowerCase().includes(q) ? 2 : 0) + (a.tags.some(function (t) { return t.toLowerCase().includes(q); }) ? 1 : 0);
        var bScore = (b.name.toLowerCase().includes(q) ? 2 : 0) + (b.tags.some(function (t) { return t.toLowerCase().includes(q); }) ? 1 : 0);
        return bScore - aScore;
      });
    }
    var catName = state.cat ? (TOOLCATEGORIES.find(function (c) { return c.id === state.cat; }) || {}).name : '';
    results.appendChild(App.el('div', { class: 'text-xs font-mono', style: { color: 'rgba(168,168,176,0.7)', marginBottom: '0.75rem' },
      text: filtered.length + ' tool' + (filtered.length !== 1 ? 's' : '') + ' found' + (catName ? ' in ' + catName : '') }));
    if (!filtered.length) {
      results.appendChild(App.el('div', { class: 'no-results' },
        App.el('h3', { text: 'No tools match your search' }),
        App.el('button', { type: 'button', onclick: clearFilters, text: 'Clear filters' })));
    } else {
      results.appendChild(App.el('div', { class: 'tool-grid' }, filtered.map(ToolCard)));
    }
  }

  // cat from URL (?cat=...)
  var m = App.route().match(/[?&]cat=([^&]+)/);
  if (m) {
    var c = decodeURIComponent(m[1]);
    if (TOOLCATEGORIES.some(function (x) { return x.id === c; })) state.cat = c;
  }

  renderTabs();
  renderResults();

  var root = App.el('div', { class: 'w-full' },
    App.el('div', { class: 'tools-hero' },
      App.el('div', { class: 'tools-hero-inner' },
        App.el('div', { class: 'flex items-center gap-3 mb-3' },
          App.el('span', { class: 'badge-pill teal' }, App.icon('zap', '', 14), App.el('span', { text: 'IN-BROWSER · ' + clientCount })),
          App.el('span', { class: 'badge-pill blue' }, App.icon('server', '', 14), App.el('span', { text: 'WASM CORE · ' + (TOOLMANIFEST.filter(function (t) { return t.wasm; }).length) })),
          App.el('span', { class: 'text-xs font-mono', style: { color: 'rgba(168,168,176,0.7)' }, text: TOOLMANIFEST.length + ' Tools · all client-side, zero server' })),
        App.el('h1', { class: 'tools-title' }, App.el('span', { class: 'text-gradient-cyber', text: 'Developer Tools' })),
        App.el('p', { class: 'tools-sub', html: '<span class="dollar">$</span> ' + TOOLMANIFEST.length + ' utilities — every one runs entirely in your browser. Hashing, HMAC, QR encoding and X.509 parsing execute in a WebAssembly core; nothing ever leaves your machine.' }))),
    App.el('div', { class: 'tools-content' },
      App.el('div', { class: 'search-row' },
        App.el('div', { class: 'search-wrap' },
          App.icon('search', 'search-icon', 16),
          searchInput,
          App.el('kbd', { class: 'search-kbd', text: '/' })),
        App.el('div', { class: 'flex items-center gap-1.5 text-xs font-mono', style: { color: 'rgba(168,168,176,0.6)' } },
          App.icon('command', '', 14),
          App.el('kbd', { text: 'K' }))),
      catTabs,
      results));

  // "/" focuses search
  App.on(document, 'keydown', function (e) {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  return root;
}

App.registerPage('/tools', renderTools);
})();
