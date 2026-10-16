(function () {
'use strict';

var CACHE_TTL = 5 * 60 * 1000;
var FETCH_TIMEOUT = 10000;

function readCache(key) {
  try {
    var all = JSON.parse(localStorage.getItem('dohcache:v1') || '{}');
    var hit = all[key];
    if (hit && (Date.now() - hit.t) < CACHE_TTL) return hit;
  } catch (e) { void e; }
  return null;
}

function writeCache(key, val) {
  try {
    var all = JSON.parse(localStorage.getItem('dohcache:v1') || '{}');
    all[key] = val;
    var keys = Object.keys(all);
    if (keys.length > 200) { delete all[keys[0]]; }
    localStorage.setItem('dohcache:v1', JSON.stringify(all));
  } catch (e) { void e; }
}

function cacheCount() {
  try {
    var all = JSON.parse(localStorage.getItem('dohcache:v1') || '{}');
    return Object.keys(all).length;
  } catch (e) { void e; return 0; }
}

function clearCache() {
  var n = cacheCount();
  try { localStorage.removeItem('dohcache:v1'); } catch (e) { void e; }
  return n;
}

function fetchJson(url, token, getToken) {
  var ctrl = null;
  try { ctrl = new AbortController(); } catch (e) { void e; }
  var timer = 0;
  if (ctrl) {
    timer = setTimeout(function () { try { ctrl.abort(); } catch (e2) { void e2; } }, FETCH_TIMEOUT);
  }
  return fetch(url, { headers: { 'Accept': 'application/dns-json' }, signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) {
      if (timer) clearTimeout(timer);
      if (getToken() !== token) { var stale = new Error('stale'); stale.stale = true; throw stale; }
      if (!res.ok) throw new Error('DNS provider answered HTTP ' + res.status);
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.stale) throw err;
      if (err && err.name === 'AbortError') throw new Error('DNS query timed out after 10s');
      throw new Error('Network unreachable — DoH needs internet');
    });
}

App.registerTool('dns-lookup', {
  css: '' +
    '.t-dns-lookup .dns-row{display:flex;gap:0.5rem;flex-wrap:wrap;}\n' +
    '.t-dns-lookup .dns-domain{flex:1 1 180px;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 10px;font-family:var(--font-mono);font-size:13.5px;color:rgba(227,227,227,0.9);outline:none;min-width:0;}\n' +
    '.t-dns-lookup .dns-domain:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-dns-lookup select{height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 6px;font-family:var(--font-mono);font-size:12.5px;color:rgba(227,227,227,0.8);}\n' +
    '.t-dns-lookup .lookup-btn{height:34px;padding:0 16px;border:none;border-radius:6px;background:rgba(83,163,249,0.2);color:rgba(180,210,250,0.95);font-family:var(--font-mono);font-size:13.5px;cursor:pointer;}\n' +
    '.t-dns-lookup .lookup-btn:hover{background:rgba(83,163,249,0.32);}\n' +
    '.t-dns-lookup .lookup-btn:disabled{opacity:0.45;cursor:default;}\n' +
    '.t-dns-lookup .clear-btn{height:34px;padding:0 12px;border:1px solid rgba(51,53,56,0.4);border-radius:6px;background:transparent;color:rgba(141,148,158,0.7);font-family:var(--font-mono);font-size:12.5px;cursor:pointer;}\n' +
    '.t-dns-lookup .clear-btn:hover:not(:disabled){color:rgba(227,227,227,0.9);border-color:rgba(255,100,103,0.4);}\n' +
    '.t-dns-lookup .clear-btn:disabled{opacity:0.4;cursor:default;}\n' +
    '.t-dns-lookup .dns-status{font-family:var(--font-mono);font-size:12.5px;color:rgba(141,148,158,0.7);text-align:center;padding:0.75rem 0;}\n' +
    '.t-dns-lookup .dns-hint{font-family:var(--font-mono);font-size:12.5px;color:rgba(141,148,158,0.55);text-align:center;padding:0 0 0.25rem;}\n' +
    '.t-dns-lookup .dns-list{display:flex;flex-direction:column;gap:0.25rem;}\n' +
    '.t-dns-lookup .row{display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0.6rem;border-radius:8px;border:1px solid rgba(51,53,56,0.2);background:rgba(0,0,0,0.1);cursor:pointer;}\n' +
    '.t-dns-lookup .row:hover{background:rgba(0,0,0,0.2);}\n' +
    '.t-dns-lookup .data{font-size:13.5px;font-family:var(--font-mono);color:rgba(227,227,227,0.85);word-break:break-all;flex:1;}\n' +
    '.t-dns-lookup .ttl{font-size:11px;font-family:var(--font-mono);color:rgba(141,148,158,0.6);flex-shrink:0;}\n',

  mount: function (root) {
    var runToken = 0;
    var status = 'idle';
    var records = [];

    var lastQuery = null;    var error = null;
    var note = '';

    var wrap = App.el('div', { class: 'space-y-2' });
    var domainInput = App.el('input', { class: 'dns-domain', type: 'text', placeholder: 'example.com', 'aria-label': 'Domain name', autocomplete: 'off', spellcheck: 'false' });
    var typeSel = App.el('select', { 'aria-label': 'Record type' });
    Transforms.DOH_TYPES.forEach(function (t) { typeSel.appendChild(App.el('option', { value: t, text: t })); });
    var provSel = App.el('select', { 'aria-label': 'DNS provider' },
      App.el('option', { value: 'cloudflare', text: 'Cloudflare' }),
      App.el('option', { value: 'google', text: 'Google' }));
    var goBtn = App.el('button', { class: 'lookup-btn', type: 'button', text: 'Lookup' });
    var purgeBtn = App.el('button', { class: 'clear-btn', type: 'button', text: 'Clear cache', title: 'Drop all cached DNS answers' });
    var exportBtn = App.el('button', { class: 'clear-btn', type: 'button', text: 'Export JSON', title: 'Save these records as JSON' });
    var hint = App.el('div', { class: 'dns-hint', text: 'Resolved over encrypted DNS (DoH) · results cached 5 min · click a record to copy' });
    var statusNode = App.el('div', { class: 'dns-status', 'aria-live': 'polite' });
    var list = App.el('div', { class: 'dns-list' });

    function render() {
      list.innerHTML = '';
      if (status === 'idle') statusNode.textContent = 'Enter a domain — answers appear here.';
      else if (status === 'working') statusNode.textContent = 'Querying…';
      else if (status === 'error') statusNode.textContent = error || 'Lookup failed.';
      else statusNode.textContent = records.length + ' record' + (records.length === 1 ? '' : 's') + (note ? ' · ' + note : '');
      goBtn.disabled = (status === 'working');
      var cached = cacheCount();
      purgeBtn.textContent = 'Clear cache' + (cached ? ' (' + cached + ')' : '');
      purgeBtn.disabled = status === 'working' || !cached;
      exportBtn.disabled = !(status === 'done' && records.length);
      records.forEach(function (r) {
        var row = App.el('div', { class: 'row', title: 'Click to copy' },
          App.el('div', { class: 'data', text: r.data }),
          App.el('div', { class: 'ttl', text: r.ttl === null ? 'no TTL' : 'TTL ' + r.ttl }));
        row.addEventListener('click', function () { App.copy(r.data, row); });
        list.appendChild(row);
      });
    }

    function fail(msg) {
      status = 'error'; error = msg; records = []; note = '';
      render();
    }

    function lookup() {
      var req;
      try { req = Transforms.dohUrl(domainInput.value, typeSel.value, provSel.value); }
      catch (e) { fail(e instanceof Error ? e.message : String(e)); return; }
      var token = ++runToken;
      var startedAt = Date.now();
      status = 'working'; records = []; error = null; note = '';
      render();
      var key = req.provider + ':' + req.type + ':' + req.domain;
      var hit = readCache(key);
      if (hit) {
        if (token !== runToken) return;
        status = 'done'; records = hit.records;
        lastQuery = { domain: req.domain, type: req.type, provider: hit.provider };
        note = 'cached ' + Math.max(1, Math.round((Date.now() - hit.t) / 1000)) + 's ago via ' + hit.provider;
        render();
        return;
      }
      var other = req.provider === 'cloudflare' ? 'google' : 'cloudflare';
      fetchJson(req.url, token, function () { return runToken; })
        .catch(function () {
          note = 'retrying via ' + other;
          render();
          var req2 = Transforms.dohUrl(req.domain, req.type, other);
          return fetchJson(req2.url, token, function () { return runToken; })
            .then(function (json) { return { json: json, provider: other }; });
        })
        .then(function (jsonOrWrap) {
          if (token !== runToken) return;
          var json = jsonOrWrap && jsonOrWrap.json !== undefined ? jsonOrWrap.json : jsonOrWrap;
          var used = jsonOrWrap && jsonOrWrap.provider ? jsonOrWrap.provider : req.provider;
          var recs = Transforms.dohParse(json, req.type, req.domain);
          lastQuery = { domain: req.domain, type: req.type, provider: used };
          status = 'done'; records = recs;
          note = note || ('live via ' + used);
          if (note.indexOf('retrying') === 0) note = 'live via fallback ' + used;
          note += ' \u00b7 ' + (Date.now() - startedAt) + 'ms';
          writeCache(key, { t: Date.now(), records: recs, provider: used });
          render();
        })
        .catch(function (e) {
          if (token !== runToken) return;
          if (e && e.stale) return;
          fail(e instanceof Error ? e.message : String(e));
        });
    }

    purgeBtn.addEventListener('click', function () {
      var n = clearCache();
      status = 'idle'; records = []; error = null; note = '';
      render();
      statusNode.textContent = n ? 'Cache cleared (' + n + ' entries).' : 'Cache already empty.';
    });
    goBtn.addEventListener('click', lookup);
    exportBtn.addEventListener('click', function () {
      if (!lastQuery || !records.length) return;
      var safe = String(lastQuery.domain).toLowerCase().replace(/[^a-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'lookup';
      App.download('dns-' + safe + '-' + lastQuery.type + '.json', JSON.stringify({ domain: lastQuery.domain, type: lastQuery.type, provider: lastQuery.provider, note: note, records: records }, null, 2), 'application/json');
    });
    domainInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
    App.onUnmount(function () { runToken++; });
    render();
    wrap.appendChild(App.el('div', { class: 'dns-row' }, domainInput, typeSel, provSel, goBtn, exportBtn, purgeBtn));
    wrap.appendChild(hint);
    wrap.appendChild(statusNode);
    wrap.appendChild(list);
    root.appendChild(wrap);
  }
});
})();