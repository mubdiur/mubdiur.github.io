/* ═══════════════════════════════════════════════════════════
   Tools index — search + category tabs + tool cards.
   Ported from src/app/tools/page.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function favClean(arr) {
  if (!Array.isArray(arr)) return [];
  var known = {};
  TOOLMANIFEST.forEach(function (t) { known[t.slug] = true; });
  return arr.filter(function (s) { return typeof s === 'string' && known[s]; });
}
function favLoad() {
  try {
    return favClean(JSON.parse(localStorage.getItem('mub.favtools.v1') || '[]'));
  } catch { return []; }
}
function favSave(list) {
  try { localStorage.setItem('mub.favtools.v1', JSON.stringify(list)); } catch {}
}
function favHas(list, slug) { return list.indexOf(slug) >= 0; }
function favToggle(list, slug) {
  var i = list.indexOf(slug);
  if (i >= 0) list.splice(i, 1);
  else list.push(slug);
  favSave(list);
  return list;
}

function ToolCard(tool, favs, onFav) {
  var isFav = favHas(favs, tool.slug);
  var star = App.el('button', {
    type: 'button',
    class: 'tc-fav' + (isFav ? ' on' : ''),
    title: isFav ? 'Remove from favorites' : 'Add to favorites',
    'aria-label': (isFav ? 'Remove ' : 'Add ') + tool.name + (isFav ? ' from' : ' to') + ' favorites',
    'aria-pressed': isFav ? 'true' : 'false',
    onclick: function (e) { e.stopPropagation(); onFav(tool.slug); }
  }, App.el('span', { 'aria-hidden': 'true', text: isFav ? '★' : '☆' }));
  var card = App.el('div', {
    class: 'tool-card', role: 'link', tabindex: '0',
    'aria-label': tool.name + ' — open tool',
    onclick: function () { App.navigate('/tools/' + tool.slug); }
  },
    App.el('div', { class: 'tc-icon' }, App.icon(tool.icon, '', 16)),
    App.el('div', { class: 'min-w-0 flex-1' },
      App.el('div', { class: 'tc-name', text: tool.name }),
      App.el('div', { class: 'tc-desc', text: tool.desc }),
      App.el('div', { class: 'tc-tags' },
        tool.tags.slice(0, 3).map(function (tag) {
          return App.el('span', { class: 'tc-tag', text: tag });
        }))),
    star);
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.navigate('/tools/' + tool.slug); }
  });
  return card;
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

  var ioStatus = App.el('span', { class: 'text-xs font-mono', style: { color: 'rgba(141,148,158,0.6)' }, text: '' });
  var fileInput = App.el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, 'aria-label': 'Import favorites file' });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var arr;
      try { arr = JSON.parse(rd.result); }
      catch { ioStatus.textContent = 'Import failed \u2014 not valid JSON'; return; }
      if (!Array.isArray(arr)) { ioStatus.textContent = 'Import failed \u2014 expected a JSON array of tool slugs'; return; }
      var clean = favClean(arr);
      if (!clean.length) { ioStatus.textContent = 'Import failed \u2014 no known tool slugs found'; return; }
      var favs = favLoad(), added = 0;
      clean.forEach(function (slug) { if (favs.indexOf(slug) < 0) { favs.push(slug); added++; } });
      favSave(favs);
      renderResults();
      ioStatus.textContent = 'Imported ' + clean.length + ' favorite' + (clean.length !== 1 ? 's' : '') + (added ? ' (' + added + ' new)' : ' (already saved)');
    };
    rd.onerror = function () { ioStatus.textContent = 'Import failed \u2014 could not read file'; };
    rd.readAsText(f);
  });
  var ioBox = App.el('div', { class: 'flex items-center gap-1.5' },
    App.el('button', {
      class: 'cat-tab', type: 'button', title: 'Download favorites as a JSON backup', 'aria-label': 'Export favorites as JSON',
      onclick: function () {
        var favs = favLoad();
        if (!favs.length) { ioStatus.textContent = 'No favorites yet \u2014 tap \u2606 on any tool first'; return; }
        App.download('developer-tools-favorites.json', JSON.stringify(favs, null, 2), 'application/json');
        ioStatus.textContent = 'Exported ' + favs.length + ' favorite' + (favs.length !== 1 ? 's' : '');
      }
    }, App.icon('download', '', 14), App.el('span', { text: 'Export' })),
    App.el('button', {
      class: 'cat-tab', type: 'button', title: 'Restore favorites from a JSON backup', 'aria-label': 'Import favorites from JSON',
      onclick: function () { fileInput.click(); }
    }, App.icon('upload', '', 14), App.el('span', { text: 'Import' })),
    ioStatus);
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
    var favs = favLoad();
    function cards(tools) {
      return tools.map(function (t) {
        return ToolCard(t, favs, function (slug) { favs = favToggle(favs.slice(), slug); renderResults(); });
      });
    }
    if (!q && !state.cat && favs.length) {
      var favTools = favs.map(function (s) { return TOOLS_BY_SLUG[s]; }).filter(Boolean);
      if (favTools.length) {
        results.appendChild(App.el('div', { class: 'cat-section' },
          App.el('div', { class: 'cat-head' },
            App.el('span', { class: 'cat-fav-star', 'aria-hidden': 'true', text: '★' }),
            App.el('h2', { text: 'Favorites' }),
            App.el('span', { text: String(favTools.length) })),
          App.el('div', { class: 'tool-grid' }, cards(favTools))));
      }
    }
    if (!q && !state.cat) {
      TOOLCATEGORIES.forEach(function (cat) {
        var tools = TOOLMANIFEST.filter(function (t) { return t.category === cat.id; });
        if (!tools.length) return;
        results.appendChild(App.el('div', { class: 'cat-section' },
          App.el('div', { class: 'cat-head' },
            App.icon(cat.icon, '', 16),
            App.el('h2', { text: cat.name }),
            App.el('span', { text: String(tools.length) })),
          App.el('div', { class: 'tool-grid' }, cards(tools))));
      });
      return;
    }
    /* Search ranking shares the palette scorer, favorite/recent boosts
       included, so both surfaces always agree. Category-only browsing
       keeps its short-slug-first order. */
    var filtered;
    if (q) {
      filtered = App.rankedTools(q, TOOLMANIFEST.length).filter(function (t) { return !state.cat || t.category === state.cat; });
    } else {
      filtered = TOOLMANIFEST
        .filter(function (t) { return !state.cat || t.category === state.cat; })
        .sort(function (a, b) { return a.slug.length - b.slug.length; });
    }
    var catName = state.cat ? (TOOLCATEGORIES.find(function (c) { return c.id === state.cat; }) || {}).name : '';
    results.appendChild(App.el('div', { class: 'text-xs font-mono', style: { color: 'rgba(141,148,158,0.7)', marginBottom: '0.75rem' },
      text: filtered.length + ' tool' + (filtered.length !== 1 ? 's' : '') + ' found' + (catName ? ' in ' + catName : '') }));
    if (!filtered.length) {
      results.appendChild(App.el('div', { class: 'no-results' },
        App.el('h3', { text: 'No tools match your search' }),
        App.el('button', { type: 'button', onclick: clearFilters, text: 'Clear filters' })));
    } else {
      results.appendChild(App.el('div', { class: 'tool-grid' }, cards(filtered)));
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
          App.el('span', { class: 'text-xs font-mono', style: { color: 'rgba(141,148,158,0.7)' }, text: TOOLMANIFEST.length + ' Tools · all client-side, zero server' })),
        App.el('h1', { class: 'tools-title' }, App.el('span', { class: 'text-gradient-cyber', text: 'Developer Tools' })),
        App.el('p', { class: 'tools-sub', html: '<span class="dollar">$</span> ' + TOOLMANIFEST.length + ' utilities — every one runs entirely in your browser. Hashing, HMAC, QR encoding and X.509 parsing execute in a WebAssembly core; nothing ever leaves your machine.' }))),
    App.el('div', { class: 'tools-content' },
      App.el('div', { class: 'search-row' },
        App.el('div', { class: 'search-wrap' },
          App.icon('search', 'search-icon', 16),
          searchInput,
          App.el('kbd', { class: 'search-kbd', text: '/' })),
        App.el('div', { class: 'flex items-center gap-1.5 text-xs font-mono', style: { color: 'rgba(141,148,158,0.6)' } },
          App.icon('command', '', 14),
          App.el('kbd', { text: 'K' })),
        ioBox, fileInput),
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
