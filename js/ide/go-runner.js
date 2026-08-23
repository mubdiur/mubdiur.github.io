/* ═══════════════════════════════════════════════════════════
   Go runner — GopherJS 1.20.14 (MIT), the real Go compiler
   compiled to JavaScript, fully vendored same-origin:
   compile.js.gz (compiler worker) + pkg/ (precompiled stdlib).
   The compiled program runs in its own worker with the GopherJS
   runtime. Completion: os.Exit / panics / the runtime's deadlock
   detector signal exit explicitly; otherwise a short output-quiet
   period marks the run finished (late output is still forwarded).
   Protocol: { code } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

import { cachedGunzip, cachedBytes } from './cache.js';

var RUN_TIMEOUT = 60000;
var COMPILE_TIMEOUT = 180000;
var QUIET_MS = 400;

var running = false;
var compileWorkerPromise = null;
var runWorker = null;

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

/* The compiler worker fetches precompiled stdlib packages via
   xhr.NewRequest("GET", "pkg/" + importPath + ".zip") — after gunzip it runs
   from a blob URL, so patch the base to an absolute same-origin path. */
function patchCompilerSource(src) {
  // The compiler runs from a blob worker, where relative and path-absolute
  // XHR URLs are invalid — build a full origin URL at runtime.
  return src.replace('"pkg/" + importPath + ".zip"', '(location.origin + "/js/ide/vendor/gopherjs/pkg/") + importPath + ".zip"');
}

function ensureCompilerWorker() {
  if (!compileWorkerPromise) {
    compileWorkerPromise = (async function () {
      post('status', 'Loading Go compiler (vendored, first run)…');
      var bytes = await cachedGunzip('./vendor/gopherjs/compile.js.gz');
      var src = patchCompilerSource(new TextDecoder().decode(bytes));
      var blob = new Blob([src], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var w = new Worker(url);
      post('status', 'Go compiler ready');
      return w;
    })();
    compileWorkerPromise.catch(function () { compileWorkerPromise = null; });
  }
  return compileWorkerPromise;
}

function compileGo(worker, code) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('Go compile timed out')); }, COMPILE_TIMEOUT);
    worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === 'compiled') {
        clearTimeout(timer);
        var c = m.content || {};
        if (c.error) resolve({ error: c.error });
        else resolve({ js: c.result });
      } else if (m.type === 'error') {
        clearTimeout(timer);
        reject(new Error(String(m.content || 'compile error')));
      }
    };
    worker.onerror = function (e) {
      clearTimeout(timer);
      reject(new Error(String((e && e.message) || 'compiler worker error')));
    };
    worker.postMessage({ type: 'compile', content: { 'main.go': code } });
  });
}

/* Run compiled Go JS in an isolated worker. Explicit completion signals:
   process.exit (os.Exit, runtime deadlock detector) and panics. Otherwise a
   quiet period after the last output marks the run as finished. */
function runGo(js, onOut, onErr, onDone) {
  var wrap =
    'var $global = self;\n' +
    'self.gopherjsWriteSyncHook = function(fd, text) { postMessage({type: fd == 1 ? "out" : "err", content: text}); };\n' +
    'self.gopherjsPanicHandler = function(msg) { postMessage({type: "panic", content: msg}); };\n' +
    'self.process = { exit: function(code) { postMessage({type: "exit", content: code == null ? 0 : code}); try { self.close(); } catch (e) {} } };\n' +
    'self.$checkForDeadlock = true;\n' +
    'try {\n' + js + '\n' +
    '} catch (err) { self.gopherjsPanicHandler(err.message); }\n';

  var blob = new Blob([wrap], { type: 'application/javascript' });
  var url = URL.createObjectURL(blob);
  var w = new Worker(url);
  var done = false;
  var quietTimer = null;
  function finish(code) {
    if (done) return;
    done = true;
    clearTimeout(quietTimer);
    onDone(code);
  }
  function poke() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(function () { finish(0); }, QUIET_MS);
  }
  w.onmessage = function (e) {
    var m = e.data || {};
    if (m.type === 'out') { onOut(String(m.content)); poke(); }
    else if (m.type === 'err') { onErr(String(m.content)); poke(); }
    else if (m.type === 'panic') { onErr('panic: ' + m.content); finish(1); }
    else if (m.type === 'exit') { finish(Number(m.content) || 0); }
  };
  w.onerror = function (e) {
    if (!done) { onErr(String((e && e.message) || 'run worker error')); finish(1); }
  };
  // program may produce no output at all — completion still expected
  quietTimer = setTimeout(function () { finish(0); }, QUIET_MS);
  return w;
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  running = true;

  var timer = setTimeout(function () {
    if (!running) return;
    running = false;
    if (runWorker) { try { runWorker.terminate(); } catch (ex) {} runWorker = null; }
    post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
  }, RUN_TIMEOUT);

  ensureCompilerWorker().then(function (cw) {
    post('status', 'Compiling…');
    return compileGo(cw, code).then(function (res) {
      if (res.error) {
        clearTimeout(timer);
        running = false;
        post('err', 'Compilation failed:\n' + res.error);
        post('exit', '', { code: 1 });
        return null;
      }
      post('status', 'Running…');
      runWorker = runGo(res.js,
        function (t) { post('out', t); },
        function (t) { post('err', t); },
        function (code) {
          clearTimeout(timer);
          running = false;
          post('exit', '', { code: code });
        });
      return null;
    });
  }).catch(function (err) {
    clearTimeout(timer);
    running = false;
    post('err', String((err && err.message) || err));
    post('exit', '', { code: 1 });
  });
});
