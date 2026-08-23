/* ═══════════════════════════════════════════════════════════
   C / C++ runner — Clang + wasm-ld compiled to WebAssembly
   (browsercc, MIT), compiling user source to wasm32-wasi, then
   executed against the pure-JS WASI shim (browser_wasi_shim).
   First run downloads ~40 MB from jsDelivr (immutable, cached);
   afterwards it starts in seconds. Persistent worker.
   Protocol: { code, lang } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* Vendored browsercc (clang + wasm-ld compiled to WASM, MIT) — same-origin. */
var BROWSERCC_BASE = './vendor/browsercc/';
var RUN_TIMEOUT = 20000;
var COMPILE_TIMEOUT = 120000;

var toolchainPromise = null;
var running = false;
var compileWarnings = '';

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

/* Load clang + lld + sysroot once per worker (they stay in wasm memory). */
function ensureToolchain() {
  if (!toolchainPromise) {
    post('status', 'Starting Clang (vendored toolchain)…');
    toolchainPromise = import(BROWSERCC_BASE + 'index.js').then(function (mod) {
      post('status', 'Clang ready');
      return mod;
    });
    toolchainPromise.catch(function (err) { toolchainPromise = null; });
  }
  return toolchainPromise;
}

function runWasi(module, args, preopens, onOut) {
  return import('./vendor/wasi/index.js').then(function (wasiMod) {
    var WASI = wasiMod.WASI;
    var File = wasiMod.File;
    var OpenFile = wasiMod.OpenFile;
    var ConsoleStdout = wasiMod.ConsoleStdout;
    var PreopenDirectory = wasiMod.PreopenDirectory;

    var outLines = [];
    var errLines = [];
    var fds = [
      new OpenFile(new File([])), // stdin
      ConsoleStdout.lineBuffered(function (msg) { outLines.push(msg); }),
      ConsoleStdout.lineBuffered(function (msg) { errLines.push(msg); }),
      new PreopenDirectory('.', preopens || [])
    ];
    var wasi = new WASI(args, ['PATH=/usr/bin', 'HOME=/'], fds);
    return WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport }).then(function (inst) {
      try {
        wasi.start(inst);
      } catch (e) {
        // WASIProcExit is normal program termination
        if (!(e instanceof wasiMod.WASIProcExit)) throw e;
      }
      return {
        code: 0,
        out: outLines.join('\n'),
        err: errLines.join('\n')
      };
    });
  });
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  var lang = (e.data && e.data.lang) || 'c';
  running = true;
  compileWarnings = '';

  function finish() {
    if (!running) return;
    running = false;
    post('exit', '', { code: 0 });
  }

  var timer = setTimeout(function () {
    if (!running) return;
    running = false;
    post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
    try { self.close(); } catch (e) {}
  }, RUN_TIMEOUT);

  var compileTimer = setTimeout(function () {
    if (!running) return;
    post('err', '\n[compile timed out after 120s]\n');
    running = false;
    post('exit', '', { code: null, terminated: true });
    try { self.close(); } catch (e) {}
  }, COMPILE_TIMEOUT);

  var fileName = lang === 'cpp' ? 'main.cpp' : 'main.c';
  var flags = lang === 'cpp'
    ? ['-O2', '-std=c++20', '-fno-exceptions', '-Wall', '-o', '/out.wasm']
    : ['-x', 'c', '-O2', '-std=c17', '-Wall', '-o', '/out.wasm'];

  ensureToolchain().then(function (browsercc) {
    post('status', 'Compiling…');
    return browsercc.compile({ source: code, fileName: fileName, flags: flags }).then(function (res) {
      clearTimeout(compileTimer);
      if (!res.module) {
        running = false;
        post('err', 'Compilation failed:\n' + (res.compileOutput || 'unknown error'));
        post('exit', '', { code: 1 });
        return null;
      }
      var stderr = res.compileOutput || '';
      if (stderr && /warning/i.test(stderr)) compileWarnings = stderr;
      post('status', 'Running…');
      return runWasi(res.module, [fileName], [['main.c', new TextEncoder().encode(code)]], null);
    }).then(function (out) {
      if (!out) return;
      clearTimeout(timer);
      if (compileWarnings) post('err', compileWarnings);
      if (out.out) post('out', out.out);
      if (out.err) post('err', out.err);
      running = false;
      post('exit', '', { code: out.code });
    });
  }).catch(function (err) {
    clearTimeout(timer);
    clearTimeout(compileTimer);
    running = false;
    post('err', String((err && err.message) || err));
    post('exit', '', { code: 1 });
  });
});
