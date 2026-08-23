/* ═══════════════════════════════════════════════════════════
   Python runner — real CPython 3.14 (Pyodide) in a Web Worker.
   First run downloads ~12 MB (vendored, immutable, browser-cached);
   afterwards it starts instantly.
   Persistent worker: kept alive between runs; only self-closes
   when a run is terminated by the timeout.
   stdin: Pyodide's stdin callback is synchronous, so input is a
   type-ahead buffer — the content of the IDE's stdin box is sent
   with the run payload and served line-by-line to input(); an
   empty buffer reads EOF.
   Protocol: { code, lang, stdin } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* Vendored Pyodide — everything is served from this site, nothing external. */
var PYODIDE_BASE = './vendor/pyodide/';
var RUN_TIMEOUT = 20000;

var pyodidePromise = null;
var running = false;
var stdoutBuf = '';
var stderrBuf = '';
var stdinQueue = [];

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

/* Line-buffered streaming: complete lines go out immediately, partial
   lines wait for the next write (or are flushed at the end of the run). */
function onStdout(s) {
  if (!running) return;
  stdoutBuf += s;
  var lines = stdoutBuf.split('\n');
  stdoutBuf = lines.pop();
  if (lines.length) post('out', lines.join('\n'));
}
function onStderr(s) {
  if (!running) return;
  stderrBuf += s;
  var lines = stderrBuf.split('\n');
  stderrBuf = lines.pop();
  if (lines.length) post('err', lines.join('\n'));
}
function flushStdout() { if (stdoutBuf) { post('out', stdoutBuf); stdoutBuf = ''; } }
function flushStderr() { if (stderrBuf) { post('err', stderrBuf); stderrBuf = ''; } }

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
        stdout: onStdout,
        stderr: onStderr,
        stdin: function () {
          // synchronous queue — Pyodide's stdin callback cannot be async
          // in a worker, so the queue is filled from the run payload
          return stdinQueue.length ? stdinQueue.shift() : undefined;
        }
      });
    }).then(function (py) {
      post('status', 'Python ' + py.version + ' ready');
      return py;
    });
    pyodidePromise.catch(function (err) { pyodidePromise = null; });
  }
  return pyodidePromise;
}

/* Traceback diagnostics: File "<exec>", line N … and a final error line. */
function parseDiagnostics(errText) {
  var diags = [];
  var lines = String(errText || '').split('\n');
  var lineNo = null;
  var m;
  for (var i = 0; i < lines.length; i++) {
    m = /File "<exec>", line (\d+)/.exec(lines[i]);
    if (m) lineNo = +m[1];
  }
  if (lineNo === null) {
    for (i = 0; i < lines.length; i++) {
      m = /line (\d+)\)?\s*$/.exec(lines[i].trim());
      if (m) { lineNo = +m[1]; break; }
    }
  }
  var msg = '';
  for (var j = lines.length - 1; j >= 0; j--) {
    if (lines[j].trim()) { msg = lines[j].trim(); break; }
  }
  if (lineNo) diags.push({ line: lineNo, col: 1, message: msg, severity: 'error' });
  return diags;
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  var rawStdin = (e.data && e.data.stdin) || '';
  running = true;
  stdoutBuf = '';
  stderrBuf = '';
  stdinQueue = rawStdin === '' ? [] : rawStdin.replace(/\n$/, '').split('\n');

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
      if (err !== undefined) onStdout(String(err) + '\n');
    } catch (ex) {
      var errText = String(ex.message || ex);
      onStderr(errText + '\n');
      var diags = parseDiagnostics(errText);
      if (diags.length) self.postMessage({ type: 'diag', diags: diags });
    }
    clearTimeout(timer);
    flushStdout();
    flushStderr();
    running = false;
    post('exit', '', { code: 0 });
  }).catch(function (err) {
    clearTimeout(timer);
    onStderr(String((err && err.message) || err) + '\n');
    flushStdout();
    flushStderr();
    running = false;
    post('exit', '', { code: 1 });
  });
});
