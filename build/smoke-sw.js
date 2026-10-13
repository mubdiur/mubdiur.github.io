'use strict';
/* Service-worker behavior smoke: drives the real sw.js install / activate /
   fetch paths with stubbed CacheStorage, fetch and Response.
   Run: node build/smoke-sw.js  (exit 0 = all green) */
var fs = require('fs');
var vm = require('vm');
var passed = 0, failed = 0;
var pending = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.error('  FAIL ' + name); }
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
var ORIGIN = 'https://sw.test';
function makeEnv(netUp) {
  var store = {};
  var claimed = 0, waited = 0, responded = [];
  function keyOf(req) { return typeof req === 'string' ? req : req.url; }
  function fakeRes(body, isOk) {
    return { ok: isOk !== false, body: body, clone: function () { return fakeRes(body, isOk !== false); } };
  }
  function bucket(name) {
    if (!store[name]) store[name] = {};
    return store[name];
  }
  var sandbox = {};
  sandbox.console = console;
  sandbox.URL = URL;
  sandbox.setTimeout = setTimeout;
  sandbox.caches = {
    open: function (n) {
      var b = bucket(n);
      return Promise.resolve({
        match: function (req) { return Promise.resolve(b[keyOf(req)] || null); },
        put: function (req, res) { b[keyOf(req)] = res; return Promise.resolve(); },
        addAll: function (list) {
          list.forEach(function (u) { b[new URL(u, ORIGIN).href] = fakeRes('precached:' + new URL(u, ORIGIN).href); });
          return Promise.resolve();
        }
      });
    },
    keys: function () { return Promise.resolve(Object.keys(store)); },
    delete: function (n) { var had = !!store[n]; delete store[n]; return Promise.resolve(had); },
    match: function (req) {
      var names = Object.keys(store);
      for (var i = 0; i < names.length; i++) {
        var hit = store[names[i]][keyOf(req)];
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(null);
    }
  };
  sandbox.__netLog = [];
  sandbox.__broken = {};
  sandbox.fetch = function (req) {
    var u = typeof req === 'string' ? req : req.url;
    sandbox.__netLog.push(u);
    if (!netUp) return Promise.reject(new Error('offline-stub'));
    if (sandbox.__broken[u]) return Promise.resolve(fakeRes('broken:' + u, false));
    return Promise.resolve(fakeRes('net:' + u));
  };
  sandbox.Response = function (body, init) {
    this.body = body;
    this.status = (init && init.status) || 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.clone = function () { return this; };
  };
  var listeners = {};
  sandbox.self = {
    listeners: listeners,
    location: { origin: ORIGIN },
    clients: { claim: function () { claimed++; return Promise.resolve(); } },
    skipWaiting: function () { sandbox.__skipped = true; return Promise.resolve(); },
    addEventListener: function (type, fn) { listeners[type] = fn; }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('sw.js', 'utf8'), sandbox);
  function fire(type, ev) {
    var p = [];
    var at = responded.length;
    ev.waitUntil = function (x) { p.push(x); waited++; };
    ev.respondWith = function (x) { responded.push(x); };
    listeners[type](ev);
    return { held: p, promise: responded[at] };
  }
  return {
    sb: sandbox, store: store, fire: fire,
    claimed: function () { return claimed; },
    netLog: function () { return sandbox.__netLog; },
    seed: function (cache, key, val) { bucket(cache)[key] = val || fakeRes('seed:' + key); }
  };
}
function req(url, mode) { return { method: 'GET', mode: mode || '', url: url }; }
console.log('-- sw shell --');
pending.push((async function () {
  var e = makeEnv(true);
  var shell = e.sb.SHELL;
  ok(Array.isArray(shell) && shell.length > 40, 'SHELL precaches the app shell');
  var dups = shell.filter(function (u, i) { return shell.indexOf(u) !== i; });
  ok(dups.length === 0, 'SHELL has no duplicate entries');
  ok(shell.every(function (u) { return u.indexOf('://') < 0; }), 'SHELL entries are same-origin relative');
  ok(shell.every(function (u) { return u.indexOf('?v=') < 0 || /\?v=\d+$/.test(u); }), 'SHELL ?v= values are numeric');
  ok(typeof e.sb.STATIC_CACHE === 'string' && e.sb.STATIC_CACHE.indexOf(e.sb.SW_VERSION) >= 0, 'STATIC_CACHE carries SW_VERSION');
})());
console.log('-- sw install/activate --');
pending.push((async function () {
  var e = makeEnv(true);
  var f = e.fire('install', {});
  await Promise.all(f.held);
  var cached = Object.keys(e.store[e.sb.STATIC_CACHE] || {});
  ok(cached.length === e.sb.SHELL.length, 'install precaches every SHELL entry');
  ok(!!e.sb.__skipped, 'install calls skipWaiting');
  var e2 = makeEnv(true);
  e2.seed('mub-static-vOLD', 'index.html');
  e2.seed(e2.sb.STATIC_CACHE, 'index.html');
  e2.seed('mub-runtime-v1', 'wasm/core.wasm');
  e2.seed('other-cache', 'x');
  var f2 = e2.fire('activate', {});
  await Promise.all(f2.held);
  await tick();
  ok(!e2.store['mub-static-vOLD'], 'activate purges stale static shell');
  ok(!!e2.store[e2.sb.STATIC_CACHE], 'activate keeps current static shell');
  ok(!!e2.store['mub-runtime-v1'], 'activate keeps runtime payloads');
  ok(!!e2.store['other-cache'], 'activate ignores foreign caches');
  ok(e2.claimed() === 1, 'activate claims clients');
})());
console.log('-- sw fetch --');
pending.push((async function () {
  var e = makeEnv(true);
  var f = e.fire('install', {});
  await Promise.all(f.held);
  await tick();
  var nav = e.fire('fetch', { request: req(ORIGIN + '/#/tools/x', 'navigate') });
  var res = await nav.promise;
  ok(res.body === 'net:' + ORIGIN + '/#/tools/x', 'navigate online returns network');
  await tick(); await tick();
  var idx = e.store[e.sb.STATIC_CACHE]['index.html'];
  ok(!!idx && idx.body.indexOf('net:') === 0, 'navigate online refreshes cached index.html');
  var e2 = makeEnv(false);
  e2.seed(e2.sb.STATIC_CACHE, 'index.html');
  var nav2 = e2.fire('fetch', { request: req(ORIGIN + '/', 'navigate') });
  var res2 = await nav2.promise;
  ok(res2.body === 'seed:index.html', 'navigate offline falls back to cache');
  var e3 = makeEnv(false);
  var nav3 = e3.fire('fetch', { request: req(ORIGIN + '/', 'navigate') });
  var res3 = await nav3.promise;
  ok(res3.status === 503, 'navigate offline with empty cache answers 503');
  var shellJs = e.sb.SHELL.filter(function (u) { return /^js\//.test(u) && /[?&]v=\d+/.test(u); });
  ok(shellJs.length > 0, 'sw SHELL has a versioned js entry to probe');
  var vurl = ORIGIN + '/' + shellJs[0];
  var vhit = e.fire('fetch', { request: req(vurl) });
  var vres = await vhit.promise;
  ok(vres.body === 'precached:' + vurl, 'versioned shell served from cache');
  ok(e.netLog().indexOf(vurl) < 0, 'versioned cache hit skips network');
  var missUrl = ORIGIN + '/js/tools/new-tool.js?v=99';
  var vmiss = e.fire('fetch', { request: req(missUrl) });
  var mres = await vmiss.promise;
  await tick();
  ok(mres.body === 'net:' + missUrl, 'versioned cache miss fetches');
  ok(e.store[e.sb.STATIC_CACHE][missUrl].body === 'net:' + missUrl, 'versioned ok response is cached');
  e.sb.__broken[missUrl] = true;
  delete e.store[e.sb.STATIC_CACHE][missUrl];
  var vbad = e.fire('fetch', { request: req(missUrl) });
  var bres = await vbad.promise;
  await tick();
  ok(bres.body === 'broken:' + missUrl, 'versioned non-ok still returned');
  ok(!e.store[e.sb.STATIC_CACHE][missUrl], 'versioned non-ok response is not cached');
  var furl = ORIGIN + '/fonts/x.woff2';
  e.seed(e.sb.RUNTIME_CACHE, furl);
  var fhit = e.fire('fetch', { request: req(furl) });
  var fres = await fhit.promise;
  ok(fres.body === 'seed:' + furl, 'runtime cache hit returns stale immediately');
  await tick();
  ok(e.netLog().indexOf(furl) >= 0, 'runtime hit still revalidates in background');
  var e4 = makeEnv(false);
  var fmiss = e4.fire('fetch', { request: req(ORIGIN + '/wasm/core.wasm') });
  var fmres = null, ferr = '';
  try { fmres = await fmiss.promise; } catch (err) { ferr = String(err); }
  ok(!fmres && ferr.indexOf('offline') >= 0, 'runtime miss offline rejects');
  var before = e.netLog().length;
  e.fire('fetch', { request: { method: 'POST', mode: '', url: ORIGIN + '/x' } });
  e.fire('fetch', { request: { method: 'GET', mode: '', url: 'https://evil.test/x.js?v=1' } });
  ok(e.netLog().length === before, 'POST and cross-origin bypass the worker');
})());
Promise.all(pending).then(function () {
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});
