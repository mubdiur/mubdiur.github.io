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

/* Browser API shims injected into every runner worker (outer level). */
function outerShims() {
  const preludeJSON = JSON.stringify(innerWorkerPrelude());
  return [
    "const { parentPort } = require('worker_threads');",
    "const nodeFs = require('fs');",
    "const nodePath = require('path');",
    "const REAL_FETCH = globalThis.fetch;",
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
    "      data = nodeFs.readFileSync(nodePath.join(" + IDE_DIR_JSON + ", q));",
    "    }",
    "    const ab = () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);",
    "    const text = () => new TextDecoder().decode(data);",
    "    return { ok: true, status: 200, headers: { get: () => null },",
    "      arrayBuffer: ab, json: async () => JSON.parse(text()), text: text };",
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
    "const selfObj = {",
    "  postMessage: (m) => parentPort.postMessage(m),",
    "  addEventListener: (t, fn) => { if (t === 'message') parentPort.on('message', (e) => { const d = { data: e }; if (selfObj.onmessage) selfObj.onmessage(d); else fn(d); }); },",
    "  close: () => { try { process.exit(0); } catch (e) {} },",
    "  location: { href: 'file:///ide/runner.js' },",
    "};",
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
    const pre = outerShims();
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
  c: `#include <stdio.h>\nint main(void) { printf("hello c: %d\\n", 2+3); return 0; }`,
  cpp: `#include <iostream>\nint main() { std::cout << "hello cpp: " << 6*7 << "\\n"; return 0; }`,
  cs: `using System;\nclass Program { static void Main() { Console.WriteLine("hello cs: " + (2+3)); } }`,
  java: `public class Hello { public static String run() { return "hello java: " + (2+3); } }`,
  go: `package main\nimport "fmt"\nfunc main() { fmt.Println("hello go:", 2+3) }`,
  rs: `fn main() { println!("hello rust: {}", 2+3); }`,
};

async function main() {
  const which = process.argv[2] || 'all';
  const list = which === 'all' ? Object.keys(SAMPLES) : [which];
  for (const lang of list) {
    const file = { js: 'js-sandbox.js', py: 'py-runner.js', c: 'cc-runner.js', cpp: 'cc-runner.js', cs: 'cs-runner.js', java: 'java-runner.js', go: 'go-runner.js', rs: 'rust-runner.js' }[lang];
    const t0 = Date.now();
    console.log(`\n=== ${lang} (${file}) ===`);
    try {
      const msgs = await runRunner(file, { code: SAMPLES[lang], lang }, { module: file !== 'js-sandbox.js', timeout: 300000 });
      const outs = msgs.filter(m => m.type === 'out').map(m => m.text).join('');
      const errs = msgs.filter(m => m.type === 'err').map(m => m.text).join('');
      const exit = msgs.find(m => m.type === 'exit');
      console.log('OUT:', JSON.stringify(outs.slice(0, 500)));
      if (errs) console.log('ERR:', JSON.stringify(errs.slice(0, 2000)));
      console.log('EXIT:', JSON.stringify(exit));
      console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`);
    } catch (e) {
      console.log('FAILED:', e.message);
    }
  }
  process.exit(0);
}
main();
