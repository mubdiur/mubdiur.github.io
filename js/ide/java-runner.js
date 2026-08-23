/* ═══════════════════════════════════════════════════════════
   Java runner — 199xVM (MIT/GPL-2.0 vendored): a TypeScript
   javac (compiles Java 25-era source to .class bytecode) plus a
   Rust JVM interpreter compiled to WASM, with a bundled JDK shim
   (~794 classes). Fully in-browser, zero network at runtime.
   Protocol: { code } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

import { cachedBytes } from './cache.js';

var RUN_TIMEOUT = 20000;
var running = false;
var vmLines = [];

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

/* 199xVM javac errors: Unexpected token: ; (";") at line 1:59 */
function parseDiagnostics(text) {
  var diags = [];
  var textStr = String(text || '');
  var re = /at line (\d+):(\d+)/g;
  var m;
  while ((m = re.exec(textStr))) {
    diags.push({ line: +m[1], col: +m[2], message: textStr.split('\n')[0].slice(0, 200), severity: 'error' });
  }
  return diags;
}

var enginePromise = null;

function ensureEngine() {
  if (!enginePromise) {
    enginePromise = (async function () {
      post('status', 'Starting Java VM…');
      var javac = await import('./vendor/199xvm/javac.js');
      var shim = await cachedBytes('./vendor/199xvm/bundle.bin');

      var wasmBytes = await cachedBytes('./vendor/199xvm/jvm_core.wasm');
      var imports = {
        env: {
          js_console_log: function (p, len) {
            vmLines.push(new TextDecoder().decode(new Uint8Array(inst.exports.memory.buffer, p, len)));
          },
          js_console_error: function (p, len) {
            vmLines.push('[err] ' + new TextDecoder().decode(new Uint8Array(inst.exports.memory.buffer, p, len)));
          },
          js_date_now: function () { return Date.now(); }
        }
      };
      var inst = (await WebAssembly.instantiate(wasmBytes, imports)).instance;
      post('status', 'Java VM ready');
      return { javac: javac, shim: shim, inst: inst };
    })();
    enginePromise.catch(function () { enginePromise = null; });
  }
  return enginePromise;
}

function isMultiBundle(bytes) {
  if (bytes.length < 4) return false;
  return !(bytes[0] === 0xCA && bytes[1] === 0xFE && bytes[2] === 0xBA && bytes[3] === 0xBE);
}

/* Find the runnable class: "public static String run()" in a class, else
   a compact-source "void main()" (implicit class). Mirrors the upstream UI. */
function extractRunClassName(source) {
  var runMatch = source.match(/public\s+class\s+(\w+)[^}]*public\s+static\s+String\s+run\s*\(\s*\)/s);
  if (runMatch) return runMatch[1];
  var all = source.matchAll ? Array.from(source.matchAll(/public\s+class\s+(\w+)/g)) : (source.match(/public\s+class\s+(\w+)/g) || []);
  if (all.length > 0) return all[all.length - 1][1];
  if (!source.match(/\bclass\s+\w+/) && !source.match(/\binterface\s+\w+/) && source.match(/void\s+main\s*\(\s*\)/))
    return '__implicit__';
  return null;
}

self.addEventListener('message', function (e) {
  if (running) return;
  var code = (e.data && e.data.code) || '';
  running = true;
  vmLines = [];

  var timer = setTimeout(function () {
    if (!running) return;
    running = false;
    post('err', '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
  }, RUN_TIMEOUT);

  ensureEngine().then(function (eng) {
    post('status', 'Compiling…');
    var className = extractRunClassName(code);
    if (!className) throw new Error("Cannot find 'public class <Name> … static String run()' or 'void main()' in source.");

    var classBytes = eng.javac.compile(code, className === '__implicit__' ? className : undefined);

    var userBundle;
    if (isMultiBundle(classBytes)) {
      userBundle = classBytes;
    } else {
      userBundle = new Uint8Array(4 + classBytes.length);
      userBundle[0] = (classBytes.length >> 24) & 0xff;
      userBundle[1] = (classBytes.length >> 16) & 0xff;
      userBundle[2] = (classBytes.length >> 8) & 0xff;
      userBundle[3] = classBytes.length & 0xff;
      userBundle.set(classBytes, 4);
    }

    var combined = new Uint8Array(eng.shim.length + userBundle.length);
    combined.set(eng.shim, 0);
    combined.set(userBundle, eng.shim.length);

    var method = className === '__implicit__' ? 'main' : 'run';
    var descriptor = className === '__implicit__' ? '()V' : '()Ljava/lang/String;';

    post('status', 'Running…');
    var exp = eng.inst.exports;
    var view = function () { return new Uint8Array(exp.memory.buffer); };
    function writeBytes(data) {
      var p = exp.alloc(data.length);
      view().set(data, p);
      return p;
    }
    function writeStr(s) {
      var b = new TextEncoder().encode(s);
      var p = exp.alloc(b.length);
      view().set(b, p);
      return p;
    }
    var bPtr = writeBytes(combined);
    var cPtr = writeStr(className === '__implicit__' ? 'main' : className);
    var mPtr = writeStr(method);
    var dPtr = writeStr(descriptor);
    var rPtr = exp.run_static_c(
      bPtr, combined.length,
      cPtr, (className === '__implicit__' ? 'main' : className).length,
      mPtr, method.length,
      dPtr, descriptor.length
    );
    var len = exp.result_len();
    var result = new TextDecoder().decode(new Uint8Array(exp.memory.buffer, rPtr, len));

    var printed = vmLines.filter(function (l) { return l.indexOf('[err] ') !== 0; }).join('\n');
    var errs = vmLines.filter(function (l) { return l.indexOf('[err] ') === 0; }).map(function (l) { return l.slice(6); }).join('\n');
    if (printed) post('out', printed);
    if (errs) post('err', errs);
    if (result && result !== 'void' && result.indexOf('ERROR:') !== 0) post('out', result + '\n');
    if (result.indexOf('ERROR:') === 0) {
      post('err', result + '\n');
      var diags = parseDiagnostics(result);
      if (diags.length) self.postMessage({ type: 'diag', diags: diags });
    }
    clearTimeout(timer);
    running = false;
    post('exit', '', { code: 0 });
  }).catch(function (err) {
    clearTimeout(timer);
    running = false;
    var errText = String((err && err.message) || err);
    post('err', errText);
    var diags = parseDiagnostics(errText);
    if (diags.length) self.postMessage({ type: 'diag', diags: diags });
    post('exit', '', { code: 1 });
  });
});
