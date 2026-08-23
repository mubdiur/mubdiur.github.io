/* IDE runner test harness — runs each runner worker in Node worker_threads
   with browser API shims, feeding sample code and reporting messages.
   All shim code is built as plain strings (no nested template escaping). */
'use strict';
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const IDE_DIR = path.resolve(__dirname, 'js/ide');
const IDE_DIR_FWD = IDE_DIR.split('\\').join('/');
const IDE_DIR_JSON = JSON.stringify(IDE_DIR_FWD); // "C:/Users/.../js/ide"

/* Browser API shims injected into every runner worker (outer level).
   `locationHref` is the runner's own file:// URL, so every relative
   vendor path inside the runners resolves to the real js/ide dir. */
function outerShims(locationHref) {
  const preludeJSON = JSON.stringify(innerWorkerPrelude());
  return [
    "const { parentPort } = require('worker_threads');",
    "const nodeFs = require('fs');",
    "const nodePath = require('path');",
    "const REAL_FETCH = globalThis.fetch;",
    // pyodide picks its runtime environment from these globals — present
    // it with a browser-worker-shaped world so it goes through the fetch shim
    "globalThis.process.browser = true;",
    "globalThis.navigator = { userAgent: 'ide-harness' };",
    "globalThis.WorkerGlobalScope = class WorkerGlobalScope {};",
    "globalThis.fetch = async function (u, opts) {",
    "  u = String(u).split(String.fromCharCode(92)).join('/');",
    "  const url = new URL(u, 'file:///' + " + IDE_DIR_JSON + " + '/');",
    "  if (url.protocol === 'file:') {",
    "    let p = decodeURIComponent(url.pathname);",
    "    if (p.charAt(0) === '/') p = p.slice(1);",
    "    p = p.split(String.fromCharCode(92)).join('/');",
    "    let data;",
    "    try { data = nodeFs.readFileSync(p); }",
    "    catch (e) {",
    "      let q = p;",
    "      if (q.indexOf('js/ide/') === 0) q = q.slice(7);",
    "      else if (q.indexOf('ide/') === 0) q = q.slice(4);",
    "      data = nodeFs.readFileSync(nodePath.join(" + IDE_DIR_JSON + ", q));",
    "    }",
    "    const body = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));",
    "    const ct = p.toLowerCase().endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';",
    "    return new Response(body, { status: 200, headers: { 'Content-Type': ct } });",
    "  }",
    "  return REAL_FETCH(url.href, opts);",
    "};",
    "const cacheStore = new Map();",
    "globalThis.caches = { open: async () => ({",
    "  match: async (k) => cacheStore.get(k) || undefined,",
    "  put: async (k, res) => { cacheStore.set(k, res); },",
    "}) };",
    "const blobMap = new Map();",
    "let blobId = 0;",
    "const NodeBlob = globalThis.Blob;",
    "globalThis.Blob = function (parts, opts) {",
    "  const b = new NodeBlob(parts, opts);",
    "  b._getCode = () => parts.map((p) => (typeof p === 'string' ? p : new TextDecoder().decode(p))).join('');",
    "  return b;",
    "};",
    "globalThis.URL.createObjectURL = (blob) => { const id = 'blob:' + (++blobId); blobMap.set(id, blob); return id; };",
    "const selfObj = new globalThis.WorkerGlobalScope();",
    "selfObj.postMessage = (m) => parentPort.postMessage(m);",
    "selfObj.addEventListener = (t, fn) => { if (t === 'message') parentPort.on('message', (e) => { const d = { data: e }; if (selfObj.onmessage) selfObj.onmessage(d); else fn(d); }); };",
    "selfObj.close = () => { try { process.exit(0); } catch (e) {} };",
    "selfObj.location = new URL('" + locationHref + "');",
    "globalThis.location = selfObj.location;",
    "Object.defineProperty(selfObj, 'onmessage', {",
    "  set(fn) { selfObj._onmessage = fn; parentPort.on('message', (e) => { if (selfObj._onmessage) selfObj._onmessage({ data: e }); }); },",
    "  get() { return selfObj._onmessage; }",
    "});",
    "globalThis.self = selfObj;",
    // inner Worker shim: worker_threads with browser-ish message wiring
    "globalThis.Worker = class {",
    "  constructor(urlOrBlobUrl) {",
    "    const blob = blobMap.get(String(urlOrBlobUrl));",
    "    let code;",
    "    if (blob) code = blob._getCode();",
    "    else {",
    "      let p = String(urlOrBlobUrl).split('?')[0];",
    "      if (p.indexOf('file:///') === 0) p = p.slice(8);",
    "      code = nodeFs.readFileSync(nodePath.join(" + IDE_DIR_JSON + ", p), 'utf-8');",
    "    }",
    "    const wrapped = " + preludeJSON + " + code + \"\\nparentPort.on('message', (m) => { if (typeof globalThis.onmessage === 'function') globalThis.onmessage({ data: m }); });\";",
    "    this.thread = new (require('worker_threads').Worker)(wrapped, { eval: true });",
    "    this.thread.on('message', (m) => this.onmessage && this.onmessage({ data: m }));",
    "    this.thread.on('error', (e) => this.onerror && this.onerror(e));",
    "  }",
    "  postMessage(m) { this.thread.postMessage(m); }",
    "  terminate() { this.thread.terminate(); }",
    "};",
  ].join('\n');
}

/* Prelude for inner workers (gopherjs compile worker + go run worker). */
function innerWorkerPrelude() {
  return [
    "const { parentPort } = require('worker_threads');",
    "globalThis.postMessage = (m) => parentPort.postMessage(m);",
    "globalThis.self = globalThis;",
    "globalThis.addEventListener = (t, fn) => { if (t === 'message') parentPort.on('message', (e) => fn({ data: e })); };",
    "globalThis.location = { origin: 'file://' };",
    "const __IDE_DIR = " + JSON.stringify(IDE_DIR_FWD) + ';',
    // file fetch shim: gopherjs fetches precompiled packages via XHR
    "globalThis.fetch = async (u) => {",
    "  const s = String(u);",
    "  const pfx = 'js/ide/vendor/gopherjs/pkg/';",
    "  let full = s;",
    "  if (s.indexOf('/js/ide/vendor/gopherjs/pkg/') === 0) full = 'file:///' + __IDE_DIR + s.slice(7);",
    "  else if (s.indexOf(pfx) === 0) full = 'file:///' + __IDE_DIR + '/' + s.slice(7);",
    "  const fs = require('fs');",
    "  const p = new URL(full).pathname.replace(/^\\//, '');",
    "  const data = fs.readFileSync(p);",
    "  return { ok: true, status: 200, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };",
    "};",
    "globalThis.XMLHttpRequest = class {",
    "  open(m, u) { this._url = u; }",
    "  set responseType(v) {}",
    "  get response() { return this._resp; }",
    "  addEventListener(t, fn) { (this._ls = this._ls || {})[t] = fn; }",
    "  removeEventListener(t) { if (this._ls) delete this._ls[t]; }",
    "  send() {",
    "    const s = this;",
    "    globalThis.fetch(this._url).then((r) => { s.status = 200; return r.arrayBuffer(); })",
    "      .then((ab) => { s._resp = ab; if (s._ls && s._ls.load) s._ls.load({}); })",
    "      .catch(() => { s.status = 404; if (s._ls && s._ls.error) s._ls.error({}); });",
    "  }",
    "};",
  ].join('\n');
}

function runRunner(file, payload, opts = {}) {
  return new Promise((resolve, reject) => {
    const src = fs.readFileSync(path.join(IDE_DIR, file), 'utf-8');
    const pre = outerShims('file:///' + IDE_DIR_FWD + '/' + file);
    let workerCode;
    if (opts.module) {
      workerCode = pre + "\nimport('file:///" + path.join(IDE_DIR, file).split('\\').join('/') + "').catch(e => { console.error('IMPORT FAIL', e); });";
    } else {
      workerCode = pre + '\n' + src;
    }
    const worker = new Worker(workerCode, { eval: true });
    const msgs = [];
    worker.on('message', (m) => {
      msgs.push(m);
      if (process.env.IDEDEBUG) console.log('  MSG:', JSON.stringify(m).slice(0, 200));
      if (opts.onMessage) opts.onMessage(m);
      if (m.type === 'stdin') {
        if (opts.stdinReply !== undefined) worker.postMessage({ type: 'stdin', line: opts.stdinReply });
        else worker.postMessage({ type: 'stdin', eof: true });
      }
      if (m.type === 'exit') { setTimeout(() => { worker.terminate(); resolve(msgs); }, 300); }
    });
    worker.on('error', (e) => { worker.terminate(); reject(new Error(file + ': ' + (e.stack || e.message))); });
    setTimeout(() => { worker.postMessage(payload); }, 800);
    setTimeout(() => { worker.terminate(); resolve(msgs); }, opts.timeout || 240000);
  });
}

const SAMPLES = {
  js: `console.log("hello js");\nconst x = [1,2,3].map(n => n*2);\nconsole.log("x:", x);\nsetTimeout(() => console.log("timer ok"), 50);`,
  py: `print("hello python")\nprint([i*i for i in range(1, 6)])`,
  // the exact program from the production report: no trailing newline —
  // output must still be flushed (regression test for the line-buffer bug)
  c: `#include <stdio.h>\n\nint main()\n{\n  printf("Hello world");\n  return 0;\n}`,
  cpp: `#include <iostream>\nint main() { std::cout << "hello cpp: " << 6*7 << "\\n"; return 0; }`,
  cs: `using System;\nclass Program { static void Main() { Console.WriteLine("hello cs: " + (2+3)); } }`,
  java: `public class Hello { public static String run() { return "hello java: " + (2+3); } }`,
  go: `package main\nimport "fmt"\nfunc main() { fmt.Println("hello go:", 2+3) }`,
  rs: `fn main() { println!("hello rust: {}", 2+3); }`,
};

/* stdin cases: engine reads input, output must contain `expect`.
   stdinReply feeds a LIVE line when the runner requests one (js); stdin is
   type-ahead payload input (py/c/rs). */
const STDIN_CASES = {
  js: {
    code: `const n = await readline("Name? ");\nconsole.log("hi", n);`,
    stdinReply: 'Ada',
    expect: 'hi Ada',
  },
  py: {
    code: `name = input("Name? ")\nprint("hi", name)`,
    stdin: 'Ada\n',
    expect: 'hi Ada',
  },
  c: {
    code: `#include <stdio.h>\nint main(void) { int n = 0; if (scanf("%d", &n) == 1) printf("got %d\\n", n); return 0; }`,
    stdin: '42',
    expect: 'got 42',
  },
  rs: {
    code: `use std::io::{self, BufRead};\nfn main() { let mut s = String::new(); let n = io::stdin().lock().read_line(&mut s).unwrap_or(0); println!("read {} bytes", n); }`,
    stdin: 'hello',
    expect: 'read 5 bytes',
  },
};

/* error cases: a broken program per language — a 'diag' message must be
   emitted whose first diagnostic points at expectLine.
   (C# omitted: the IdeHost formats Roslyn errors as "CS####: message"
   with no source positions, so the engine exposes no line info.) */
const DIAG_CASES = {
  js: {
    code: `const y = missingVar;\nconsole.log("never");`,
    expectLine: 1,
  },
  py: {
    code: `print("a")\nx = 1 / 0`,
    expectLine: 2,
  },
  c: {
    code: `#include <stdio.h>\nint main(void) { return ; }`,
    expectLine: 2,
  },
  java: {
    code: `public class Hello { public static String run() { int x = ; return "hi"; } }`,
    expectLine: 1,
  },
  go: {
    code: `package main\nimport "fmt"\nfunc main() { undefinedThing() }`,
    expectLine: 3,
  },
  rs: {
    code: `fn main() {\n    let x: i32 = "hi";\n}`,
    expectLine: 2,
  },
};

async function runOne(name, file, payload, opts) {
  const t0 = Date.now();
  console.log(`\n=== ${name} (${file}) ===`);
  try {
    const msgs = await runRunner(file, payload, opts);
    const outs = msgs.filter(m => m.type === 'out').map(m => m.text).join('');
    const errs = msgs.filter(m => m.type === 'err').map(m => m.text).join('');
    const exit = msgs.find(m => m.type === 'exit');
    console.log('OUT:', JSON.stringify(outs.slice(0, 500)));
    if (errs) console.log('ERR:', JSON.stringify(errs.slice(0, 2000)));
    console.log('EXIT:', JSON.stringify(exit));
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`);
    return { outs, errs, exit, msgs };
  } catch (e) {
    console.log('FAILED:', e.message);
    return { failed: true, message: e.message };
  }
}

async function main() {
  const which = process.argv[2] || 'all';
  const fileOf = { js: 'js-sandbox.js', py: 'py-runner.js', c: 'cc-runner.js', cpp: 'cc-runner.js', cs: 'cs-runner.js', java: 'java-runner.js', go: 'go-runner.js', rs: 'rust-runner.js' };
  let failures = 0;

  const list = which === 'all' ? Object.keys(SAMPLES) : [which];
  for (const lang of list) {
    const res = await runOne(lang, fileOf[lang], { code: SAMPLES[lang], lang }, { module: lang !== 'js', timeout: 300000 });
    if (res.failed) { failures++; continue; }
    if (lang === 'c' && res.outs.indexOf('Hello world') < 0) {
      console.log('  ✗ EXPECTED "Hello world" in output (no-trailing-newline flush)');
      failures++;
    } else if (lang !== 'c' && res.outs.length === 0 && !res.errs) {
      console.log('  ✗ no output');
      failures++;
    }
  }

  for (const lang of Object.keys(STDIN_CASES)) {
    if (which !== 'all' && lang !== which) continue;
    const t = STDIN_CASES[lang];
    const res = await runOne('stdin:' + lang, fileOf[lang],
      { code: t.code, lang, stdin: t.stdin || '' },
      { module: lang !== 'js', stdinReply: t.stdinReply, timeout: 300000 });
    if (res.failed) { failures++; continue; }
    if (res.outs.indexOf(t.expect) < 0) {
      console.log('  ✗ EXPECTED ' + JSON.stringify(t.expect) + ' in output');
      failures++;
    }
  }

  for (const lang of Object.keys(DIAG_CASES)) {
    if (which !== 'all' && lang !== which) continue;
    const t = DIAG_CASES[lang];
    const res = await runOne('diag:' + lang, fileOf[lang],
      { code: t.code, lang }, { module: lang !== 'js', timeout: 300000 });
    if (res.failed) { failures++; continue; }
    const diagMsg = res.msgs ? res.msgs.find((m) => m.type === 'diag') : null;
    const diags = (diagMsg && diagMsg.diags) || [];
    if (!diags.length) {
      console.log('  ✗ no diagnostics emitted');
      failures++;
    } else if (diags[0].line !== t.expectLine) {
      console.log('  ✗ expected first diag at line ' + t.expectLine + ', got ' + JSON.stringify(diags[0]));
      failures++;
    }
  }

  console.log(failures ? `\n${failures} FAILURES` : '\nALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
}
main();
