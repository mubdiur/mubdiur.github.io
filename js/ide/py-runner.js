/* ═══════════════════════════════════════════════════════════
   Python runner — real CPython 3.14 (Pyodide) in a Web Worker.
   First run downloads ~12 MB from the jsDelivr CDN (immutable,
   browser-cached); afterwards it starts instantly.
   Persistent worker: kept alive between runs; only self-closes
   when a run is terminated by the timeout.
   Protocol: { code } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* Vendored Pyodide — everything is served from this site, nothing external. */
var PYODIDE_BASE = './vendor/pyodide/';
var RUN_TIMEOUT = 20000;

var pyodidePromise = null;
var running = false;
var stdoutBuf = '';
var stderrBuf = '';

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

function ensurePyodide() {
  if (!pyodidePromise) {
    post('status', 'Booting Python (vendored Pyodide)…');
    pyodidePromise = import(PYODIDE_BASE + 'pyodide.mjs').then(function (mod) {
      var localBase = new URL(PYODIDE_BASE, self.location.href).href;
      return mod.loadPyodide({
        indexURL: localBase,
        // keep package resolution same-origin too (stdlib ships vendored;
        // extra packages like numpy are not bundled, so loadPackage errors
        // cleanly instead of reaching a CDN)
        packageBaseUrl: localBase,
        stdout: function (s) { if (running) stdoutBuf += s + '\n'; },
        stderr: function (s) { if (running) stderrBuf += s + '\n'; }
      });
    }).then(function (py) {
      post('status', 'Python ' + py.version + ' ready');
      return py;
    });
    pyodidePromise.catch(function (err) { pyodidePromise = null; });
  }
  return pyodidePromise;
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  running = true;
  stdoutBuf = '';
  stderrBuf = '';

  function finish() {
    if (!running) return;
    running = false;
    if (stdoutBuf) post('out', stdoutBuf);
    if (stderrBuf) post('err', stderrBuf);
    post('exit', '', { code: 0 });
  }

  var timer = setTimeout(function () {
    if (!running) return;
    running = false;
    post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
    try { self.close(); } catch (e) {}
  }, RUN_TIMEOUT);

  ensurePyodide().then(function (pyodide) {
    post('status', 'Running…');
    try {
      var err = pyodide.runPython(code);
      if (err !== undefined && stdoutBuf.indexOf(String(err)) < 0) stdoutBuf += String(err);
    } catch (ex) {
      stderrBuf += String(ex.message || ex);
    }
    clearTimeout(timer);
    finish();
  }).catch(function (err) {
    clearTimeout(timer);
    stderrBuf += String((err && err.message) || err);
    finish();
  });
});
