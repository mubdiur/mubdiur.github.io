/* ═══════════════════════════════════════════════════════════
   Node-lite sandbox — runs JavaScript with a Node-flavoured
   environment in a killable Web Worker. Zero downloads.
   Provides: console, timers, process, Buffer, require() with a
   small builtin set (path, util, events, os, crypto, fs-in-memory).
   Interactive input: `readline(prompt)` (async) and
   `process.stdin.on('data', …)` — both are fed live from the IDE's
   stdin box while the program runs; lines typed before Run are
   queued first.
   Protocol: { code, lang, stdin } in → { type:'out'|'err'|'exit'|'stdin' } out.
   ═══════════════════════════════════════════════════════════ */
'use strict';

var PENDING_TIMEOUT = 20000;   // total run budget (ms) — worker is killed by the page too
var STDIN_WAIT_TIMEOUT = 120000; // generous budget while the program waits for typed input

function post(type, text, extra) {
  self.postMessage(Object.assign({ type: type, text: text || '' }, extra || {}));
}

function fmtError(err) {
  if (err && err.stack) return String(err.stack);
  return String(err && err.message ? err.message : err);
}

/* Stack diagnostics: innermost `<anonymous>:LINE:COL` frame. The run wrapper
   shifts the user code by 5 lines (verified empirically); the column is
   already relative to the user's line. */
function parseDiagnostics(errText) {
  var text = String(errText || '');
  var re = /<anonymous>:(\d+):(\d+)/g;
  var m, line = null, col = null;
  while ((m = re.exec(text))) {
    if (line === null) { line = +m[1] - 5; col = +m[2]; }
  }
  if (line === null) return [];
  var msg = text.split('\n')[0] || text.slice(0, 120);
  return [{ line: Math.max(1, line), col: Math.max(1, col), message: msg, severity: 'error' }];
}

function postDiags(errText) {
  var diags = parseDiagnostics(errText);
  if (diags.length) self.postMessage({ type: 'diag', diags: diags });
}

/* ── interactive stdin (readline + process.stdin) ── */
var stdinQueue = [];       // lines ready to consume (pre-filled at run start, then delivered)
var stdinWaiters = [];     // pending readline() resolvers
var stdinDataHandler = null; // process.stdin 'data' listener
var stdinRequested = false;  // a 'stdin' request is outstanding to the page
var stdinHold = 0;           // pending slots held by stdin reads (keeps the run alive)
var budgetTimer = null;      // hard run budget — paused (lengthened) while awaiting input
var running = false;

function requestStdinLine() {
  if (stdinRequested) return;
  stdinRequested = true;
  armBudget(STDIN_WAIT_TIMEOUT); // waiting for a human — give them time
  post('stdin', '');
}

function armBudget(ms) {
  clearTimeout(budgetTimer);
  budgetTimer = setTimeout(function () {
    if (!running) return;
    post('err', '\n[terminated: execution exceeded ' + Math.round((ms || PENDING_TIMEOUT) / 1000) + 's — check for infinite loops]\n');
    post('exit', '', { code: null, terminated: true });
    try { self.close(); } catch (e) {}
  }, ms || PENDING_TIMEOUT);
}

function deliverStdinLine(line) {
  stdinRequested = false;
  armBudget(PENDING_TIMEOUT); // program can make progress again
  if (stdinWaiters.length) {
    var w = stdinWaiters.shift();
    stdinHold--;
    w(String(line));
    return;
  }
  stdinQueue.push(String(line));
  pumpStdin();
}

function deliverStdinEof() {
  stdinRequested = false;
  armBudget(PENDING_TIMEOUT);
  while (stdinWaiters.length) {
    var w = stdinWaiters.shift();
    stdinHold--;
    w('');
  }
  stdinQueue = [];
}

function pumpStdin() {
  if (!stdinDataHandler || stdinRequested) return;
  if (stdinQueue.length) {
    var line = stdinQueue.shift();
    try { stdinDataHandler(line + '\n'); } catch (err) { post('err', fmtError(err) + '\n'); }
    pumpStdin(); // keep flowing while lines are queued
    return;
  }
  requestStdinLine();
}

function readline(prompt) {
  if (prompt) post('out', String(prompt));
  return new Promise(function (resolve) {
    if (stdinQueue.length) { resolve(stdinQueue.shift()); return; }
    stdinWaiters.push(resolve);
    stdinHold++;
    requestStdinLine();
  });
}

/* ── process ── */
var exitRequested = null;
var processStdin = {
  isTTY: true,
  readable: true,
  setEncoding: function () { return processStdin; },
  resume: function () { return processStdin; },
  pause: function () { return processStdin; },
  on: function (ev, cb) {
    if (ev === 'data' && typeof cb === 'function') {
      if (!stdinDataHandler) stdinHold++;
      stdinDataHandler = cb;
      pumpStdin();
    }
    return processStdin;
  },
  removeListener: function (ev, cb) {
    if (ev === 'data' && stdinDataHandler === cb) {
      stdinDataHandler = null;
      stdinHold = Math.max(0, stdinHold - 1);
    }
    return processStdin;
  },
  removeAllListeners: function (ev) {
    if (!ev || ev === 'data') {
      stdinDataHandler = null;
      stdinHold = Math.max(0, stdinHold - 1);
    }
    return processStdin;
  }
};
var process = {
  argv: ['node', '/main.js'],
  env: {},
  platform: 'browser',
  version: 'v20.0.0 (browser)',
  versions: { node: '20.0.0' },
  arch: 'wasm',
  pid: 1,
  stdin: processStdin,
  exit: function (code) { exitRequested = code === undefined ? 0 : code; throw new ExitSignal(code === undefined ? 0 : code); },
  nextTick: function (fn) { queueMicrotask(fn); },
  cwd: function () { return '/'; },
  hrtime: function (prev) {
    var t = performance.now() / 1000;
    var s = Math.floor(t);
    var ns = Math.floor((t - s) * 1e9);
    if (prev) return [s - prev[0], ns - prev[1]];
    return [s, ns];
  },
  stdout: { write: function (s) { post('out', String(s)); } },
  stderr: { write: function (s) { post('err', String(s)); } }
};
function ExitSignal(code) { this.code = code; }
ExitSignal.prototype = Object.create(Error.prototype);

/* ── console ── */
function stringify(v) {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'function') return '[Function: ' + (v.name || 'anonymous') + ']';
  if (typeof v === 'symbol') return v.toString();
  if (v instanceof Error) return v.stack || String(v);
  try {
    var seen = [];
    return JSON.stringify(v, function (k, val) {
      if (typeof val === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
      if (typeof val === 'bigint') return val.toString() + 'n';
      if (typeof val === 'undefined') return undefined;
      if (typeof val === 'object' && val !== null) {
        if (seen.indexOf(val) >= 0) return '[Circular]';
        seen.push(val);
        if (val instanceof Array && val.length > 100) return '[Array(' + val.length + ')]';
      }
      return val;
    }, 2);
  } catch (e) { return String(v); }
}
function fmtArgs(args) {
  return Array.prototype.map.call(args, function (a) { return stringify(a); }).join(' ');
}
var consoleImpl = {
  log: function () { post('out', fmtArgs(arguments) + '\n'); },
  info: function () { post('out', fmtArgs(arguments) + '\n'); },
  debug: function () { post('out', fmtArgs(arguments) + '\n'); },
  warn: function () { post('err', fmtArgs(arguments) + '\n'); },
  error: function () { post('err', fmtArgs(arguments) + '\n'); },
  trace: function () {
    var stack = (new Error().stack || '').split('\n').slice(2).join('\n');
    post('err', 'Trace: ' + fmtArgs(arguments) + '\n' + stack + '\n');
  }
};

/* ── Buffer ── */
function Buffer(arg, encoding) {
  if (typeof arg === 'number') return new Uint8Array(arg);
  if (typeof arg === 'string') return new TextEncoder().encode(arg);
  if (arg instanceof ArrayBuffer) return new Uint8Array(arg);
  if (ArrayBuffer.isView(arg)) return new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength);
  return new Uint8Array(0);
}
Buffer.from = Buffer;
Buffer.isBuffer = function (b) { return b instanceof Uint8Array; };
Buffer.concat = function (list, total) {
  var len = total || list.reduce(function (a, b) { return a + b.length; }, 0);
  var out = new Uint8Array(len);
  var off = 0;
  list.forEach(function (b) { out.set(b, off); off += b.length; });
  return out;
};
Buffer.prototype = Object.create(Uint8Array.prototype);
Buffer.prototype.toString = function (enc) {
  return enc === 'base64' ? btoa(String.fromCharCode.apply(null, this))
    : enc === 'hex' ? Array.prototype.map.call(this, function (b) { return b.toString(16).padStart(2, '0'); }).join('')
    : new TextDecoder().decode(this);
};
Buffer.prototype.equals = function (o) {
  if (this.length !== o.length) return false;
  for (var i = 0; i < this.length; i++) if (this[i] !== o[i]) return false;
  return true;
};

/* ── in-memory fs ── */
var vfs = { '/': { type: 'dir' } };
function vfsResolve(p) {
  var parts = String(p).split('/').filter(Boolean);
  var node = vfs['/'];
  for (var i = 0; i < parts.length; i++) {
    if (node.type !== 'dir') return null;
    node = node.children && node.children[parts[i]];
    if (!node) return null;
  }
  return node;
}
function vfsParentDir(p) {
  var parts = String(p).split('/').filter(Boolean);
  var node = vfs['/'];
  for (var i = 0; i < parts.length - 1; i++) {
    if (!node.children) node.children = {};
    if (!node.children[parts[i]]) node.children[parts[i]] = { type: 'dir', children: {} };
    node = node.children[parts[i]];
  }
  return node;
}
var fs = {
  writeFileSync: function (p, data) {
    var dir = vfsParentDir(p);
    var parts = String(p).split('/').filter(Boolean);
    dir.children[parts[parts.length - 1]] = { type: 'file', data: new Uint8Array(data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))) };
  },
  readFileSync: function (p, enc) {
    var f = vfsResolve(p);
    if (!f || f.type !== 'file') throw new Error('ENOENT: no such file or directory, open \'' + p + '\'');
    var text = new TextDecoder().decode(f.data);
    return enc === 'utf8' ? text : (enc === 'buffer' ? f.data : text);
  },
  existsSync: function (p) { return !!vfsResolve(p); },
  mkdirSync: function (p) { vfsParentDir(p + '/x'); },
  readdirSync: function (p) {
    var d = vfsResolve(p);
    if (!d || d.type !== 'dir') throw new Error('ENOTDIR: not a directory, scandir \'' + p + '\'');
    return Object.keys(d.children || {});
  },
  statSync: function (p) {
    var f = vfsResolve(p);
    if (!f) throw new Error('ENOENT: no such file or directory, stat \'' + p + '\'');
    return { isFile: function () { return f.type === 'file'; }, isDirectory: function () { return f.type === 'dir'; }, size: f.data ? f.data.length : 0 };
  }
};

/* ── builtin modules ── */
var builtins = {
  path: {
    basename: function (p, ext) {
      var b = String(p).split('/').filter(Boolean).pop() || '';
      return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
    },
    dirname: function (p) {
      var parts = String(p).split('/').filter(Boolean);
      parts.pop();
      return '/' + parts.join('/') || '/';
    },
    extname: function (p) { var m = String(p).match(/(\.[^./]+)$/); return m ? m[1] : ''; },
    join: function () {
      var parts = Array.prototype.slice.call(arguments).join('/').split('/').filter(Boolean);
      return '/' + parts.join('/');
    },
    resolve: function () { return builtins.path.join.apply(null, arguments); }
  },
  util: {
    format: function () {
      var args = Array.prototype.slice.call(arguments);
      var f = args.shift();
      if (typeof f !== 'string') return fmtArgs([f].concat(args));
      return f.replace(/%[sdifoOj%]/g, function (m) {
        if (m === '%%') return '%';
        var v = args.shift();
        if (m === '%s') return String(v);
        if (m === '%d' || m === '%i') return String(parseInt(v, 10));
        if (m === '%f') return String(parseFloat(v));
        return stringify(v);
      }) + (args.length ? ' ' + args.map(stringify).join(' ') : '');
    },
    inspect: function (v) { return stringify(v); },
    inherits: function (c, s) { c.prototype = Object.create(s.prototype); c.prototype.constructor = c; }
  },
  events: {
    EventEmitter: function () { this._e = {}; },
    EventEmitter2: function () { this._e = {}; }
  },
  os: {
    EOL: '\n',
    platform: function () { return 'browser'; },
    cpus: function () { return [{ model: 'wasm', speed: 0, times: {} }]; },
    totalmem: function () { return 2147483648; },
    freemem: function () { return 1073741824; },
    homedir: function () { return '/home'; },
    tmpdir: function () { return '/tmp'; },
    hostname: function () { return 'browser'; },
    arch: function () { return 'wasm'; }
  },
  crypto: {
    randomUUID: function () {
      if (crypto.randomUUID) return crypto.randomUUID();
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      return Array.from(b, function (x, i) { return i === 4 || i === 6 || i === 8 || i === 14 ? '-' + x.toString(16).padStart(2, '0') : x.toString(16).padStart(2, '0'); }).join('');
    },
    randomBytes: function (n) {
      var b = new Uint8Array(n);
      crypto.getRandomValues(b);
      return b;
    },
    getRandomValues: function (arr) { return crypto.getRandomValues(arr); }
  }
};
builtins.events.EventEmitter.prototype = {
  on: function (n, f) { (this._e[n] = this._e[n] || []).push(f); return this; },
  once: function (n, f) { var self = this; function g() { self.removeListener(n, g); f.apply(null, arguments); } g.fn = f; return this.on(n, g); },
  emit: function (n) {
    var args = Array.prototype.slice.call(arguments, 1);
    (this._e[n] || []).slice().forEach(function (f) { f.apply(null, args); });
    return true;
  },
  removeListener: function (n, f) {
    var l = this._e[n] || [];
    this._e[n] = l.filter(function (x) { return x !== f && x.fn !== f; });
    return this;
  },
  removeAllListeners: function (n) { if (n) delete this._e[n]; else this._e = {}; return this; },
  listeners: function (n) { return (this._e[n] || []).slice(); }
};

/* ── module system ── */
function makeRequire(baseDir) {
  function req(id) {
    if (id.startsWith('./') || id.startsWith('../') || id.startsWith('/')) {
      var p = id.startsWith('/') ? id : baseDir + '/' + id;
      var f = vfsResolve(p);
      if (f && f.type === 'file') {
        var code = new TextDecoder().decode(f.data);
        var m = { exports: {}, filename: p };
        var fn = new Function('module', 'exports', 'require', '__dirname', '__filename', code);
        fn(m, m.exports, makeRequire(builtins.path.dirname(p)), builtins.path.dirname(p), p);
        return m.exports;
      }
      throw new Error('Cannot find module \'' + id + '\'');
    }
    if (builtins[id]) return builtins[id];
    throw new Error('Cannot find module \'' + id + '\' (only a small builtin set is available in the browser sandbox)');
  }
  req.resolve = function (id) { return id; };
  return req;
}

/* ── run ── */
self.addEventListener('message', function (e) {
  var msg = e.data || {};
  if (msg.type === 'stdin') {
    if (msg.eof) deliverStdinEof();
    else if (msg.line !== undefined) deliverStdinLine(String(msg.line));
    return;
  }
  if (running) return;

  var code = msg.code || '';
  running = true;
  stdinQueue = msg.stdin === '' || msg.stdin === undefined ? [] : String(msg.stdin).replace(/\n$/, '').split('\n');
  stdinWaiters = [];
  stdinDataHandler = null;
  stdinRequested = false;
  stdinHold = 0;
  exitRequested = null;

  var timers = new Set();
  var pending = 0;
  function track(fn) {
    return function () {
      var args = arguments;
      var id = { active: true };
      timers.add(id);
      pending++;
      setTimeout(function () {
        timers.delete(id);
        pending--;
        try { fn.apply(null, args); } catch (err) {
          if (err instanceof ExitSignal) return;
          post('err', fmtError(err) + '\n');
        }
        if (pending === 0 && stdinHold === 0) finish();
      }, 0);
      return id;
    };
  }
  var sandbox = {
    module: { exports: {} },
    exports: null,
    require: null,
    __dirname: '/',
    __filename: '/main.js',
    console: consoleImpl,
    process: process,
    Buffer: Buffer,
    globalThis: self,
    global: self,
    setTimeout: function (fn, ms) {
      var id = { active: true };
      timers.add(id); pending++;
      setTimeout(function () {
        timers.delete(id); pending--;
        try { fn(); } catch (err) { if (!(err instanceof ExitSignal)) post('err', fmtError(err) + '\n'); }
        if (pending === 0 && stdinHold === 0) finish();
      }, Math.max(ms || 0, 0));
      return id;
    },
    setInterval: function (fn, ms) {
      var id = setInterval(function () {
        try { fn(); } catch (err) { if (!(err instanceof ExitSignal)) post('err', fmtError(err) + '\n'); }
      }, Math.max(ms || 0, 0));
      timers.add(id);
      return id;
    },
    clearTimeout: function (id) { if (id && id.active !== undefined) id.active = false; try { clearTimeout(id); } catch (e) {} },
    clearInterval: function (id) { timers.delete(id); try { clearInterval(id); } catch (e) {} },
    queueMicrotask: function (fn) { queueMicrotask(fn); },
    readline: readline,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    URL: URL,
    URLSearchParams: URLSearchParams,
    fetch: function () { return fetch.apply(self, arguments); },
    fetchSync: null,
    atob: atob,
    btoa: btoa,
    structuredClone: function (v) { return structuredClone(v); },
    performance: performance
  };
  sandbox.exports = sandbox.module.exports;
  sandbox.require = makeRequire('/');

  function finish() {
    if (!running) return;
    if (pending > 0 || stdinHold > 0) return;
    running = false;
    clearTimeout(budgetTimer);
    var code2 = exitRequested === null ? 0 : exitRequested;
    post('exit', '', { code: code2 });
    // hard-stop the worker shortly after exit so stray loops can't keep it alive
    setTimeout(function () { try { self.close(); } catch (e) {} }, 50);
  }

  try {
    var fn = new Function(
      'module', 'exports', 'require', '__dirname', '__filename',
      'console', 'process', 'Buffer', 'setTimeout', 'setInterval',
      'clearTimeout', 'clearInterval', 'queueMicrotask', 'readline', 'fetch',
      'atob', 'btoa', 'structuredClone', 'TextEncoder', 'TextDecoder',
      'URL', 'URLSearchParams', 'performance',
      '\n"use strict";\nreturn (async () => {\n' + code + '\n})();'
    );
    var p = fn(
      sandbox.module, sandbox.exports, sandbox.require,
      sandbox.__dirname, sandbox.__filename,
      sandbox.console, sandbox.process, sandbox.Buffer,
      sandbox.setTimeout, sandbox.setInterval,
      sandbox.clearTimeout, sandbox.clearInterval,
      sandbox.queueMicrotask, sandbox.readline, sandbox.fetch,
      sandbox.atob, sandbox.btoa, sandbox.structuredClone,
      sandbox.TextEncoder, sandbox.TextDecoder,
      sandbox.URL, sandbox.URLSearchParams, sandbox.performance
    );
    if (p && typeof p.then === 'function') {
      p.catch(function (err) {
        if (err instanceof ExitSignal) return;
        post('err', fmtError(err) + '\n');
        postDiags(fmtError(err));
      }).then(function () {
        if (pending === 0 && stdinHold === 0) finish();
      });
    }
  } catch (err) {
    if (err instanceof ExitSignal) {
      finish();
    } else {
      post('err', fmtError(err) + '\n');
      postDiags(fmtError(err));
      post('exit', '', { code: 1 });
    }
  }

  // hard budget: kill the worker if it outlives the timeout
  armBudget(PENDING_TIMEOUT);
});
