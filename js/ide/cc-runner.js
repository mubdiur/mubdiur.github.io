/* ═══════════════════════════════════════════════════════════
   C / C++ runner — Clang + wasm-ld compiled to WebAssembly
   (browsercc, MIT), compiling user source to wasm32-wasi, then
   executed against the pure-JS WASI shim (browser_wasi_shim).
   Fully vendored same-origin (clang + lld + sysroot, all gzipped
   and cached via the Cache API); no CDN. Persistent worker.
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

function runWasi(module, args, preopens, stdinText, onOut) {
  return import('./vendor/wasi/index.js').then(function (wasiMod) {
    var WASI = wasiMod.WASI;
    var File = wasiMod.File;
    var OpenFile = wasiMod.OpenFile;
    var ConsoleStdout = wasiMod.ConsoleStdout;
    var PreopenDirectory = wasiMod.PreopenDirectory;

    var outLines = [];
    var errLines = [];
    var outDec = new TextDecoder('utf-8');
    var errDec = new TextDecoder('utf-8');
    var fds = [
      // stdin is a plain byte buffer (type-ahead; empty buffer reads EOF).
      // Must NOT be lineBuffered: wasi-libc buffers internally, so direct
      // writes flush on newline AND on exit — output without a trailing
      // newline (e.g. `printf("Hello world")`) is never lost.
      new OpenFile(new File(new TextEncoder().encode(stdinText || ''))),
      new ConsoleStdout(function (msg) { outLines.push(outDec.decode(msg)); }),
      new ConsoleStdout(function (msg) { errLines.push(errDec.decode(msg)); }),
      new PreopenDirectory('.', preopens || [])
    ];
    var wasi = new WASI(args, ['PATH=/usr/bin', 'HOME=/'], fds);
    return WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport }).then(function (inst) {
      var code = 0;
      try {
        wasi.start(inst);
      } catch (e) {
        // WASIProcExit is normal program termination — carry its exit code
        if (e instanceof wasiMod.WASIProcExit) code = e.code;
        else throw e;
      }
      return {
        code: code,
        out: outLines.join('\n'),
        err: errLines.join('\n')
      };
    });
  });
}

/* clang-style diagnostics: main.c:7:2: error: message */
function parseDiagnostics(text) {
  var diags = [];
  var re = /^([^:\n]+):(\d+):(\d+):\s+(error|warning):\s*(.*)$/gm;
  var m;
  while ((m = re.exec(String(text || '')))) {
    diags.push({ line: +m[2], col: +m[3], message: m[5], severity: m[4] });
  }
  return diags;
}

function postDiags(diags) {
  if (diags && diags.length) self.postMessage({ type: 'diag', diags: diags });
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  var lang = (e.data && e.data.lang) || 'c';
  var stdinText = (e.data && e.data.stdin) || '';
  running = true;
  compileWarnings = '';

  var compileTimer = null;
  var timer = setTimeout(function () {
    if (!running) return;
    running = false;
    clearTimeout(compileTimer);
    post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
    try { self.close(); } catch (e) {}
  }, RUN_TIMEOUT + COMPILE_TIMEOUT);

  compileTimer = setTimeout(function () {
    if (!running) return;
    post('err', '\n[compile timed out after ' + Math.round(COMPILE_TIMEOUT/1000) + 's]\n');
    running = false;
    clearTimeout(timer);
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
      clearTimeout(timer);
      if (!res.module) {
        running = false;
        var failText = 'Compilation failed:\n' + (res.compileOutput || 'unknown error');
        post('err', failText);
        postDiags(parseDiagnostics(res.compileOutput));
        post('exit', '', { code: 1 });
        return null;
      }
      var stderr = res.compileOutput || '';
      if (stderr && /warning/i.test(stderr)) {
        var w = String(stderr).slice(0, 8000);
        compileWarnings = w;
      }
      post('status', 'Running…');
      // re-arm run timer for execution phase
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!running) return;
        running = false;
        post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT/1000) + 's — check for infinite loops]\n');
        post('exit','',{code:null, terminated:true});
        try { self.close(); } catch (e) {}
      }, RUN_TIMEOUT);
      return runWasi(res.module, [fileName], [['main.c', new TextEncoder().encode(code)]], stdinText);
    }).then(function (out) {
      if (!out) return;
      clearTimeout(timer);
      clearTimeout(compileTimer);
      if (compileWarnings) { post('err', compileWarnings); postDiags(parseDiagnostics(compileWarnings)); }
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
