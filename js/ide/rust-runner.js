/* ═══════════════════════════════════════════════════════════
   Rust runner — rustc compiled to WASM (MIT, adapted from the
   Weblings project, https://github.com/AngelOnFira/weblings):
   rustc → Cranelift → waffle → wasm object → custom linker →
   wasm32-wasip1 executable, executed via the pure-JS WASI shim.
   Everything is vendored same-origin (rustc.wasm.gz + sysroot
   bundle, gzip-decompressed here on first use).
   Protocol: { code } in → { type:'status'|'out'|'err'|'exit' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

import { Directory, Fd, File, PreopenDirectory, WASI } from './vendor/wasi/index.js';
import { cachedGunzip } from './cache.js';

var RUN_TIMEOUT = 30000;

var rustcModule = null;
var stdSysroot = null;
var enginePromise = null;
var running = false;

function post(type, text) {
  self.postMessage({ type: type, text: text || '' });
}

/* RIWB1 sysroot bundle: "RIWB1\n" + u32le index length + JSON index
   {files:[{p,o,l}], total} + concatenated bytes. */
function parseBundle(bytes) {
  const magic = new TextDecoder().decode(bytes.subarray(0, 6));
  if (magic !== 'RIWB1\n') throw new Error('bad sysroot bundle magic');
  const ilen = new DataView(bytes.buffer, bytes.byteOffset + 6, 4).getUint32(0, true);
  const index = JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + ilen)));
  const base = 10 + ilen;
  const files = new Map();
  for (const f of index.files) {
    if (f.p === 'manifest.json') continue;
    files.set(f.p, new File(bytes.slice(base + f.o, base + f.o + f.l)));
  }
  return files;
}

function stdSysrootPreopen() {
  const root = new Map();
  const dirFor = (segs) => {
    let m = root;
    for (const seg of segs) {
      if (!m.has(seg)) m.set(seg, new Map());
      m = m.get(seg);
    }
    return m;
  };
  for (const [path, file] of stdSysroot) {
    const segs = path.split('/');
    const name = segs.pop();
    dirFor(segs).set(name, file);
  }
  const toDir = (m) =>
    new Directory([...m.entries()].map(([n, v]) => [n, v instanceof Map ? toDir(v) : v]));
  return new PreopenDirectory('/sysroot', [...root.entries()].map(
    ([n, v]) => [n, v instanceof Map ? toDir(v) : v]));
}

async function ensureEngine() {
  if (!enginePromise) {
    enginePromise = (async function () {
      post('status', 'Loading rustc (vendored, first run)…');
      var rustcBytes = await cachedGunzip('./vendor/rust/rustc.wasm.gz');
      rustcModule = await WebAssembly.compile(rustcBytes);

      var bundleBytes = await cachedGunzip('./vendor/rust/sysroot-wasip1.bundle.gz');
      stdSysroot = parseBundle(bundleBytes);
      post('status', 'rustc ready');
      return true;
    })();
    enginePromise.catch(function () { enginePromise = null; });
  }
  return enginePromise;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function parseDiagnostics(log) {
  const out = [];
  for (const line of log.split('\n')) {
    if (line[0] !== '{') continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.$message_type !== 'diagnostic') continue;
    if (d.level !== 'error' && d.level !== 'warning') continue;
    const spans = d.spans || [];
    const sp = spans.find((s) => s.is_primary) || spans[0] || null;
    const ansi = (d.rendered || d.message).trimEnd();
    out.push({
      level: d.level,
      message: d.message,
      code: d.code && d.code.code ? d.code.code : null,
      rendered: ansi.replace(ANSI_RE, ''),
      ansi
    });
  }
  return out;
}

/* compile + link (one rustc.wasm invocation) then execute */
async function runJob(msg, status) {
  status('Compiling + linking with rustc…');
  let log = '';
  const dec0 = new TextDecoder();
  const CapErr = class extends Fd {
    fd_write(data) { log += dec0.decode(data, { stream: true }); return { ret: 0, nwritten: data.byteLength }; }
  };
  const work = new PreopenDirectory('/work', [['prog.rs', new File(new TextEncoder().encode(msg.source))]]);
  const args = [
    'rustc', '/work/prog.rs', '--sysroot', '/sysroot',
    '-Zunstable-options', '--target', 'wasm32-wasip1',
    '--edition', '2021', '-O', '-Cpanic=abort',
    '--error-format=json', '--json=diagnostic-rendered-ansi',
    '-o', '/work/prog.wasm',
  ];
  const fds = [new CapErr(), new CapErr(), new CapErr(), new PreopenDirectory('/tmp', []), stdSysrootPreopen(), work];
  const w = new WASI(args, ['CLIF2WASM_OBJECT=1'], fds, { debug: false });
  const inst = await WebAssembly.instantiate(rustcModule, { wasi_snapshot_preview1: w.wasiImport });
  let exit = 0;
  try {
    exit = w.start(inst);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    if (!log.trim()) log += m;
    exit = 1;
  }
  const diagnostics = parseDiagnostics(log);
  const bin = work.dir.contents.get('prog.wasm');
  if (!bin || !bin.data || bin.data.length === 0) {
    const residue = diagnostics.length
      ? ''
      : (log.replaceAll('/work/prog.rs', 'program').trim() || 'rustc exited ' + exit + ' without emitting a program');
    return { ok: false, compileFailed: true, diagnostics, stdout: '', stderr: residue, exit };
  }

  status('Running…');
  let progOut = '';
  let progErr = '';
  const dec1 = new TextDecoder();
  const dec2 = new TextDecoder();
  const CapOut = class extends Fd {
    fd_write(data) { progOut += dec1.decode(data, { stream: true }); return { ret: 0, nwritten: data.byteLength }; }
  };
  const CapErrStream = class extends Fd {
    fd_write(data) { progErr += dec2.decode(data, { stream: true }); return { ret: 0, nwritten: data.byteLength }; }
  };
  const pfds = [new CapOut(), new CapOut(), new CapErrStream(), new PreopenDirectory('/sandbox', [])];
  const pw = new WASI(['prog'], [], pfds, { debug: false });
  try {
    const { instance } = await WebAssembly.instantiate(bin.data.slice().buffer, {
      wasi_snapshot_preview1: pw.wasiImport,
    });
    const rc = pw.start(instance);
    return {
      ok: rc === 0,
      stdout: progOut.trimEnd(),
      stderr: progErr.replaceAll('/work/prog.rs', 'program').trim(),
      exit: rc,
      diagnostics
    };
  } catch (e) {
    return { ok: false, stdout: progOut.trimEnd(), stderr: progErr.trim(), exit: null, diagnostics, runtimeError: String((e && e.message) || e) };
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') {
    try {
      await ensureEngine();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String((err && err.message) || err) });
    }
    return;
  }
  if (msg.type === 'job' || msg.code !== undefined) {
    if (running) return;
    running = true;
    const source = msg.source || msg.code || '';
    const status = (text) => self.postMessage({ type: 'status', text });
    var timer = setTimeout(function () {
      if (!running) return;
      running = false;
      self.postMessage({ type: 'err', text: '\n[terminated: execution exceeded ' + Math.round(RUN_TIMEOUT / 1000) + 's — check for infinite loops]\n' });
      self.postMessage({ type: 'exit', text: '', code: null, terminated: true });
      try { self.close(); } catch (ex) {}
    }, RUN_TIMEOUT);
    let result;
    try {
      await ensureEngine();
      result = await runJob({ source: source }, status);
    } catch (err) {
      result = { ok: false, stdout: '', stderr: 'engine error: ' + String((err && err.message) || err), exit: 1 };
    }
    clearTimeout(timer);
    running = false;
    const out = (result.stdout || '') + (result.stderr ? '\n' + result.stderr : '');
    if (result.ok) {
      if (result.stdout) self.postMessage({ type: 'out', text: result.stdout });
      if (result.stderr) self.postMessage({ type: 'err', text: result.stderr });
    } else {
      // render diagnostics as readable text
      var diag = (result.diagnostics || []).map(function (d) { return d.rendered; }).join('\n');
      self.postMessage({ type: 'err', text: diag || result.stderr || 'compilation failed (exit ' + result.exit + ')' });
    }
    self.postMessage({ type: 'exit', text: '', code: result.ok ? 0 : 1 });
  }
};

