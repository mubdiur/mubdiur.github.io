/* ═══════════════════════════════════════════════════════════
   C# runner — .NET 10 Mono WebAssembly runtime (the runtime Blazor
   uses) + the Roslyn C# compiler, all vendored same-origin.
   A tiny host assembly (IdeHost) loads Roslyn from the runtime VFS,
   compiles the user's source and executes it, returning captured
   stdout/errors as JSON. First run downloads ~40 MB (gzipped); the
   worker then stays alive for instant subsequent runs.
   Protocol: { code } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

import { cachedBytes } from './cache.js';

/* Confirm to the IDE that this worker script loaded successfully */
console.log('[cs-runner] script loaded');
self.postMessage({ type: 'worker-loaded' });

var RUN_TIMEOUT = 30000;
var running = false;

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

/* Roslyn diagnostics: main.cs(5,2): error CS1002: ; expected */
function parseDiagnostics(text) {
  var diags = [];
  var re = /\((\d+),(\d+)\):\s*(error|warning)\s+[A-Z]+\d+:\s*(.*)$/gm;
  var m;
  while ((m = re.exec(String(text || '')))) {
    diags.push({ line: +m[1], col: +m[2], message: m[4], severity: m[3] });
  }
  return diags;
}

/* Forward mono/dotnet console chatter so failures are visible. */
['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
  var orig = console[level] ? console[level].bind(console) : null;
  console[level] = function () {
    var text = Array.prototype.map.call(arguments, function (a) {
      return typeof a === 'string' ? a : ((a && a.stack) || String(a));
    }).join(' ');
    if (level === 'error') post('err', text);
    else post('status', text);
    if (orig) orig.apply(null, arguments);
  };
});

var runtimePromise = null;

function ensureRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async function () {
      post('status', 'Starting .NET runtime…');
      var dotnetMod = await import('./vendor/dotnet/dotnet.js');

      post('status', 'Loading framework assemblies (first run only)…');
      var api = await dotnetMod.dotnet
        .withModuleConfig({
          locateFile: function (path) {
            if (String(path).indexOf('.dll') > 0) return 'vendor/dotnet/dll/' + path;
            return path;
          }
        })
        .withConfigSrc('dotnet.boot.json')
        .create();
      var exports = await api.getAssemblyExports('IdeHost.dll');
      post('status', '.NET + Roslyn ready');
      return exports.IdeHost;
    })();
    runtimePromise.catch(function (err) { runtimePromise = null; });
  }
  return runtimePromise;
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  running = true;

  var timer = setTimeout(function () {
    if (!running) return;
    running = false;
    post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
    try { self.close(); } catch (ex) {}
  }, RUN_TIMEOUT);

  ensureRuntime().then(function (host) {
    post('status', 'Compiling…');
    var json = host.CompileAndRun(code);
    clearTimeout(timer);
    var res;
    try { res = JSON.parse(json); } catch (ex) { res = { out: '', err: json }; }
    if (res.out) post('out', res.out);
    if (res.err) {
      post('err', res.err);
      var diags = parseDiagnostics(res.err);
      if (diags.length) self.postMessage({ type: 'diag', diags: diags });
    }
    running = false;
    post('exit', '', { code: res.err ? 1 : 0 });
  }).catch(function (err) {
    clearTimeout(timer);
    running = false;
    post('err', String((err && err.message) || err));
    post('exit', '', { code: 1 });
  });
});
