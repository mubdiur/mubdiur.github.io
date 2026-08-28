/* ═══════════════════════════════════════════════════════════
   In-Browser IDE — full CodeMirror 6 editor (syntax highlighting,
   autocomplete, auto-indent) with the output in a right-hand
   panel, running 8 languages entirely in the tab. Every compiler
   is vendored same-origin (no CDN); editor state persists to
   localStorage and engine payloads are cached via the Cache API.
   stdin: the input box below the output pipes input to the
   program — live for JavaScript (readline / process.stdin), and
   type-ahead (sent when you press Run) for Python, C, C++, Rust.

   Bulletproofing: per-run watchdog token, stdin routed to
   runningLang (not selected tab), worker 'error' event calls
   finishRun, payload size capped, state.code strings validated,
   localStorage quota guarded.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var LANGUAGES = [
  { id: 'js',   name: 'JavaScript', runner: 'js-sandbox.js', module: false, timeout: 25, sample:
'// Node-lite sandbox — console, timers, process, Buffer,\n// require() with a small builtin set, in-memory fs.\n// readline() is interactive: type in the stdin box below\n// while the program runs.\n\nconst name = await readline("What\'s your name? ");\nconsole.log("Hello, " + name + "!");\n\nconst items = [1, 2, 3, 4, 5];\nconsole.log("sum:", items.reduce((a, b) => a + b, 0));\n\nsetTimeout(() => {\n  console.log("async works too");\n}, 100);' },
  { id: 'py',   name: 'Python',    runner: 'py-runner.js',   module: true,  timeout: 45, sample:
'# Real CPython 3.14 (Pyodide, vendored). input() reads from\n# the stdin box below — type your answer there before Run.\n\ntry:\n    name = input("What\'s your name? ")\nexcept EOFError:\n    name = "stranger"\nprint(f"Hello, {name}!")\n\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint("fib(20) =", fib(20))' },
  { id: 'c',    name: 'C',         runner: 'cc-runner.js',   module: true,  timeout: 150, sample:
'#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    for (int i = 1; i <= 5; i++) {\n        printf("%d ", i * i);\n    }\n    printf("\\n");\n\n    // Type two numbers into the stdin box below, then press Run.\n    int a = 0, b = 0;\n    if (scanf("%d %d", &a, &b) == 2)\n        printf("%d + %d = %d\\n", a, b, a + b);\n    else\n        printf("(no stdin — type numbers in the input box, then Run)\\n");\n    return 0;\n}' },
  { id: 'cpp',  name: 'C++',       runner: 'cc-runner.js',   module: true,  timeout: 150, sample:
'#include <iostream>\n#include <vector>\n#include <algorithm>\n\nint main() {\n    std::vector<int> v = {5, 2, 8, 1, 9};\n    std::sort(v.begin(), v.end());\n    std::cout << "sorted:";\n    for (int n : v) std::cout << " " << n;\n    std::cout << "\\n";\n    return 0;\n}' },
  { id: 'cs',   name: 'C#',        runner: 'cs-runner.js',   module: true,  timeout: 90, sample:
'using System;\nusing System.Linq;\n\nclass Program\n{\n    static void Main()\n    {\n        var nums = Enumerable.Range(1, 10);\n        Console.WriteLine($"sum 1..10 = {nums.Sum()}");\n        Console.WriteLine($"even count = {nums.Count(n => n % 2 == 0)}");\n    }\n}' },
  { id: 'java', name: 'Java',      runner: 'java-runner.js', module: true,  timeout: 30, sample:
'public class Hello {\n    public static String run() {\n        String out = "";\n        for (int i = 1; i <= 5; i++) {\n            out = out + (i * i) + " ";\n        }\n        return "squares: " + out.trim();\n    }\n}' },
  { id: 'go',   name: 'Go',        runner: 'go-runner.js',   module: true,  timeout: 90, sample:
'package main\n\nimport (\n\t"fmt"\n\t"strings"\n)\n\nfunc main() {\n\twords := []string{"go", "in", "the", "browser"}\n\tfmt.Println("joined:", strings.Join(words, " "))\n\tfmt.Println("upper:", strings.ToUpper(strings.Join(words, "-")))\n}' },
  { id: 'rs',   name: 'Rust',      runner: 'rust-runner.js', module: true,  timeout: 90, sample:
'use std::io::{self, BufRead};\n\nfn main() {\n    let v = vec![1, 2, 3, 4, 5];\n    let doubled: Vec<i32> = v.iter().map(|x| x * 2).collect();\n    println!("doubled: {:?}", doubled);\n\n    // Type a line into the stdin box below, then press Run.\n    let line = io::stdin().lock().lines().next();\n    match line {\n        Some(Ok(l)) => println!("you typed: {}", l.trim()),\n        _ => println!("(no stdin — type something in the input box, then Run)"),\n    }\n}' }
];

var STDIN_LANGS = ['js', 'py', 'c', 'cpp', 'rs'];
var STDIN_MAX_BYTES = 64 * 1024;

var STORE_KEY = 'mub.ide.v1';
var RUNNER_DIR = 'js/ide/';
var STDIN_WAIT_MS = 120000;

var state = { lang: 'js', code: {} };
var workers = {};
var watchdog = null;
var watchdogGen = 0;
var editor = null;
var outputEl = null;
var statusEl = null;
var runBtn = null;
var stdinRow = null;
var stdinInput = null;
var stdinSend = null;
var stdinWaiting = false;
var stdinSupported = true;
var runningLang = null;
var runStart = 0;
var vendorState = {};
var vendorProgress = {};

function loadState() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s && s.lang && LANGUAGES.some(function (l) { return l.id === s.lang; })) state.lang = s.lang;
      if (s && s.code && typeof s.code === 'object') {
        Object.keys(s.code).forEach(function (k) {
          if (typeof s.code[k] === 'string') state.code[k] = s.code[k].slice(0, 256 * 1024);
        });
      }
    }
  } catch (e) {}
  LANGUAGES.forEach(function (l) {
    if (typeof state.code[l.id] !== 'string') state.code[l.id] = l.sample;
  });
}

var saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {
      if (e && e.name === 'QuotaExceededError') { try { localStorage.removeItem(STORE_KEY); } catch (_) {} }
    }
  }, 300);
}

function langDef(id) {
  return LANGUAGES.filter(function (l) { return l.id === id; })[0];
}

/* ── runner orchestration ── */

function getWorker(lang) {
  var def = langDef(lang);
  if (!def) throw new Error('Unknown language: ' + lang);
  var entry = workers[lang];
  if (entry && entry.alive) return entry.w;
  if (entry && entry.w) { try { entry.w.terminate(); } catch (e) {} }
  var w = new Worker(RUNNER_DIR + def.runner + '?v=7', { type: def.module ? 'module' : 'classic' });
  w.__lang = lang;
  w.addEventListener('message', function (e) { onWorkerMessage(lang, w, e.data || {}); });
  w.addEventListener('error', function (e) {
    if (workers[lang] && workers[lang].w === w && workers[lang].alive) {
      appendOutput('Runner error: ' + (e.message || 'unknown'), true);
      markDead(lang);
      vendorState[lang] = 'error'; syncRunButton();
      finishRun(null, true);
      setStatus('worker error — press Run again');
    }
  });
  workers[lang] = { w: w, alive: true };
  vendorState[lang] = 'loading';
  vendorProgress[lang] = 'Loading ' + def.name + '…';
  syncRunButton();
  if (statusEl && state.lang === lang && !runningLang) setStatus(vendorProgress[lang]);
  return w;
}

function ensureWorkerPreload(lang) {
  var entry = workers[lang];
  if (entry && entry.alive) return entry.w;
  try { return getWorker(lang); } catch (e) { return null; }
}

function syncRunButton() {
  if (!runBtn) return;
  if (runningLang) return;
  var lang = state.lang;
  var vs = vendorState[lang];
  if (lang === 'js') { runBtn.disabled = false; runBtn.title = 'Run (Ctrl+Enter)'; return; }
  // Non-JS: keep Run enabled — the worker will lazy-load on first Run and
  // stream progress via 'status' messages.  Preloading is best-effort: if
  // the worker was already created, show its progress, otherwise mark idle.
  if (!vs || vs === 'idle') {
    // Kick off background preload without blocking the UI.  Workers that
    // understand {type:'init'} will start fetching; others will simply
    // be created and will load on the first real Run — either way the
    // user can press Run immediately and see live status.
    if (!workers[lang]) { try { ensureWorkerPreload(lang); } catch (e) {} }
    runBtn.disabled = false;
    runBtn.title = 'Run (Ctrl+Enter)';
    return;
  }
  if (vs === 'loading') {
    // Show loading in the status bar but keep the button usable — the
    // run will naturally wait for the engine to be ready.
    runBtn.disabled = false;
    runBtn.title = langDef(lang).name + ' is still loading — press Run to queue';
    return;
  }
  runBtn.disabled = false; runBtn.title = 'Run (Ctrl+Enter)';
}

function markVendorReady(lang) {
  vendorState[lang] = 'ready';
  if (state.lang === lang) syncRunButton();
}

function markVendorLoading(lang, text) {
  vendorProgress[lang] = text || vendorProgress[lang];
  if (state.lang === lang && !runningLang) setStatus(vendorProgress[lang]);
}

function markDead(lang) {
  if (workers[lang]) workers[lang].alive = false;
}

function onWorkerMessage(lang, w, m) {
  if (workers[lang] && workers[lang].w !== w) return;
  if (runningLang) kickWatchdog(lang);
  if (m.type === 'status') {
    markVendorLoading(lang, m.text);
    if (!runningLang && state.lang !== lang) return;
    setStatus(m.text);
    if (/ready/i.test(String(m.text||''))) markVendorReady(lang);
  } else if (m.type === 'out') appendOutput(String(m.text || ''), false);
  else if (m.type === 'err') appendOutput(String(m.text || ''), true);
  else if (m.type === 'diag') { if (editor && editor.setDiagnostics) editor.setDiagnostics(m.diags || []); }
  else if (m.type === 'stdin') onStdinRequest();
  else if (m.type === 'ready') markVendorReady(lang);
  else if (m.type === 'exit') {
    if (m.terminated) markDead(lang); else markVendorReady(lang);
    finishRun(m.code === null || m.code === undefined ? null : m.code, !!m.terminated);
  }
}

function armWatchdog(ms) {
  var gen = ++watchdogGen;
  clearTimeout(watchdog);
  watchdog = setTimeout(function () {
    if (gen !== watchdogGen) return;
    if (!runningLang) return;
    var entry = workers[runningLang];
    if (entry && entry.alive) {
      appendOutput('\n[terminated: no response for ' + Math.round(ms / 1000) + 's — check for infinite loops]\n', true);
      try { entry.w.terminate(); } catch (e) {}
      markDead(runningLang);
      finishRun(null, true);
    }
  }, ms);
}

function kickWatchdog(lang) {
  var def = langDef(lang);
  if (!def) return;
  armWatchdog(def.timeout * 1000);
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function appendOutput(text, isErr) {
  if (!outputEl) return;
  if (isErr) {
    outputEl.appendChild(App.el('div', { class: 'ide-line err', text: text }));
  } else {
    String(text).split('\n').forEach(function (p) {
      outputEl.appendChild(App.el('div', { class: 'ide-line', text: p }));
    });
  }
  outputEl.scrollTop = outputEl.scrollHeight;
}

function clearOutput() {
  if (outputEl) outputEl.innerHTML = '';
  if (stdinRow) stdinRow.classList.remove('waiting');
  stdinWaiting = false;
}

function finishRun(code, terminated) {
  var was = runningLang;
  runningLang = null;
  watchdogGen++;
  clearTimeout(watchdog);
  if (stdinRow) stdinRow.classList.remove('waiting');
  stdinWaiting = false;
  if (runBtn) {
    runBtn.innerHTML = '<span class="ide-run-glyph">▶</span> Run';
  }
  setTabsEnabled(true);
  syncRunButton();
  var secs = ((Date.now() - runStart) / 1000).toFixed(1);
  if (terminated) setStatus('terminated after ' + secs + 's');
  else if (code) setStatus('exited with code ' + code + ' in ' + secs + 's');
  else setStatus('finished in ' + secs + 's');
}

function setTabsEnabled(enabled) {
  var tabs = document.querySelectorAll('.ide-tab');
  tabs.forEach(function (t) { t.disabled = !enabled; });
}

function stopRun() {
  if (!runningLang) return;
  var lang = runningLang;
  var entry = workers[lang];
  watchdogGen++;
  clearTimeout(watchdog);
  if (entry && entry.alive) { try { entry.w.terminate(); } catch (e) {} }
  markDead(lang);
  finishRun(null, true);
  setStatus('stopped');
}

function runCode() {
  if (runningLang) return;
  if (!editor) return;
  var lang = state.lang;
  var code = editor.getValue();
  if (typeof code !== 'string') code = String(code);
  if (code.length > 512 * 1024) { setStatus('Code too large (max 512 KB)'); return; }
  state.code[lang] = code;
  saveState();
  runningLang = lang;
  runStart = Date.now();
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="ide-run-glyph">■</span> Stop';
  runBtn.title = 'Stop the run';
  setTabsEnabled(false);
  clearOutput();
  if (editor && editor.clearDiagnostics) editor.clearDiagnostics();
  setStatus('Starting ' + langDef(lang).name + '…');
  var w = getWorker(lang);
  kickWatchdog(lang);
  var payload = { code: code, lang: lang };
  if (STDIN_LANGS.indexOf(lang) >= 0) {
    var stdinVal = stdinInput ? String(stdinInput.value) : '';
    if (stdinVal.length > STDIN_MAX_BYTES) stdinVal = stdinVal.slice(0, STDIN_MAX_BYTES);
    payload.stdin = stdinVal;
  }
  w.postMessage(payload);
}

/* ── stdin box (bottom of the output panel) ── */

function onStdinRequest() {
  if (!runningLang) return;
  stdinWaiting = true;
  stdinRow.classList.add('waiting');
  setStatus('awaiting input — type in the box below');
  armWatchdog(STDIN_WAIT_MS);
  stdinInput.focus();
}

function deliverStdin() {
  if (!runningLang) return;
  var line = String(stdinInput.value);
  stdinInput.value = '';
  stdinWaiting = false;
  stdinRow.classList.remove('waiting');
  var entry = workers[runningLang];
  if (!entry || !entry.alive) return;
  entry.w.postMessage({ type: 'stdin', line: line });
  setStatus('input sent — program continues');
  kickWatchdog(runningLang);
}

/* ── page ── */

function renderIde() {
  loadState();
  var root = App.el('div', { class: 'ide-page' });

  var css = document.createElement('style');
  css.id = 'ide-css';
  css.textContent =
    '.ide-page{height:calc(100vh - 48px);height:calc(100dvh - 48px);min-height:0;display:flex;flex-direction:column;gap:0.625rem;padding:0.625rem 1rem 0.75rem;overflow:hidden;background:radial-gradient(900px 420px at 18% 0%, rgba(255,216,102,0.06), transparent 58%), radial-gradient(700px 360px at 92% 18%, rgba(120,220,232,0.05), transparent 60%), #1a181c;}' +
    '.ide-page ::selection{background:rgba(255,216,102,0.28);color:#1a181c;}' +
    '.ide-head{display:flex;align-items:center;justify-content:space-between;gap:0.875rem;flex-wrap:wrap;flex-shrink:0;padding:2px 2px;}' +
    '.ide-head-left{display:flex;align-items:center;gap:0.7rem;flex-wrap:wrap;min-width:0;}' +
    '.ide-head-right{display:flex;align-items:center;gap:0.625rem;flex-wrap:wrap;}' +
    '.ide-title{font-family:var(--font-mono);font-size:13.5px;font-weight:700;color:#f5f3f5;letter-spacing:-0.035em;}' +
    '.ide-sub{font-family:var(--font-mono);font-size:11px;color:#9a999e;letter-spacing:-0.01em;display:none;}' +
    '@media(min-width:1400px){.ide-sub{display:inline;}}' +
    '.ide-badge{font-family:var(--font-mono);font-size:10px;letter-spacing:0.02em;padding:3px 9px;border-radius:999px;border:1px solid rgba(255,216,102,0.22);color:#ffd866;background:rgba(255,216,102,0.10);white-space:nowrap;backdrop-filter:blur(6px);}' +
    '.ide-tabs{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}' +
    '.ide-tab{font-family:var(--font-mono);font-size:11px;padding:5px 10px;border-radius:999px;border:1px solid #3a373c;background:rgba(45,42,46,0.9);color:#a8a7ad;cursor:pointer;transition:all .18s cubic-bezier(.2,.8,.2,1);letter-spacing:-0.015em;}' +
    '.ide-tab:hover:not(:disabled){color:#f5f3f5;border-color:#4a474d;background:#34323a;transform:translateY(-0.5px);}' +
    '.ide-tab.active{background:#ffd866;color:#1e1c1e;border-color:#ffd866;font-weight:700;box-shadow:0 2px 10px rgba(255,216,102,0.22);}' +
    '.ide-tab:disabled{opacity:0.45;cursor:not-allowed;}' +
    '.ide-tab .ide-tabdot{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:6px;background:#6e6d73;vertical-align:middle;opacity:0.9;}' +
    '.ide-tab.active .ide-tabdot{background:#1e1c1e;opacity:1;}' +
    '.ide-run-btn{display:inline-flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:12px;font-weight:750;letter-spacing:-0.02em;padding:7px 18px;border-radius:999px;border:1px solid #ffd866;background:linear-gradient(180deg, #ffeea6 0%, #ffd866 100%);color:#1e1c1e;cursor:pointer;transition:transform .15s, box-shadow .15s, opacity .15s;box-shadow:0 6px 18px rgba(255,216,102,0.18), 0 1px 0 rgba(255,255,255,0.6) inset;}' +
    '.ide-run-btn:hover:not(:disabled){transform:translateY(-0.5px);box-shadow:0 8px 22px rgba(255,216,102,0.24), 0 1px 0 rgba(255,255,255,0.7) inset;}' +
    '.ide-run-btn:active:not(:disabled){transform:translateY(0px);}' +
    '.ide-run-btn:disabled{opacity:0.55;cursor:wait;box-shadow:none;}' +
    '.ide-run-glyph{font-size:10px;}' +
    '.ide-main{display:flex;flex:1;min-height:0;gap:0.75rem;overflow:hidden;}' +
    '.ide-editor-wrap{flex:1;min-width:0;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;background:#2d2a2e;display:flex;flex-direction:column;min-height:0;box-shadow:0 10px 30px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.04) inset;}' +
    '.ide-editor-wrap .cm-editor{flex:1;min-height:0;pointer-events:auto;}' +
    '.ide-editor-wrap .cm-scroller{pointer-events:auto;}' +
    '.ide-editor-wrap .cm-content{pointer-events:auto;user-select:text;-webkit-user-select:text;caret-color:#ffd866;}' +
    '.ide-panel{width:392px;flex:none;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,0.07);border-radius:14px;background:linear-gradient(180deg, rgba(64,62,65,0.98) 0%, rgba(58,56,60,0.98) 100%);min-height:0;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.05) inset;}' +
    '.ide-outhead{display:flex;align-items:center;gap:0.75rem;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);flex-shrink:0;}' +
    '.ide-outlabel{font-family:var(--font-mono);font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:#b8b7bc;flex:none;font-weight:600;}' +
    '.ide-status{font-family:var(--font-mono);font-size:10.5px;color:#9a999e;letter-spacing:-0.01em;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.ide-clear{font-family:var(--font-mono);font-size:10px;letter-spacing:0.04em;text-transform:uppercase;color:#9a999e;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:999px;padding:4px 9px;cursor:pointer;flex:none;transition:all .15s;}' +
    '.ide-clear:hover{color:#f5f3f5;background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.10);}' +
    '.ide-output{flex:1;min-height:0;overflow-y:auto;padding:14px 14px 16px;font-family:var(--font-mono);font-size:12.2px;line-height:1.72;letter-spacing:-0.01em;background:transparent;scrollbar-width:thin;scrollbar-color:#4a474d transparent;}' +
    '.ide-line{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;color:#ece9e9;}' +
    '.ide-line.err{color:#ff7a96;background:rgba(255,97,136,0.08);border:1px solid rgba(255,97,136,0.14);border-radius:8px;padding:6px 8px;margin:4px 0;}' +
    '.ide-stdin{display:flex;align-items:center;gap:0.6rem;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);flex-shrink:0;}' +
    '.ide-stdin.waiting{background:rgba(255,216,102,0.10);box-shadow:inset 0 1px 0 rgba(255,216,102,0.22);border-top-color:rgba(255,216,102,0.18);}' +
    '.ide-stdin-label{font-family:var(--font-mono);font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:#b8b7bc;flex:none;font-weight:600;}' +
    '.ide-stdin.waiting .ide-stdin-label{color:#ffd866;}' +
    '.ide-stdin-input{flex:1;min-width:0;background:rgba(26,24,28,0.9);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#ece9e9;font-family:var(--font-mono);font-size:12.5px;line-height:1.6;padding:7px 11px;outline:none;transition:border-color .15s, box-shadow .15s, background .15s;}' +
    '.ide-stdin-input::placeholder{color:#7a7980;}' +
    '.ide-stdin-input:focus{border-color:rgba(255,216,102,0.42);box-shadow:0 0 0 3px rgba(255,216,102,0.14);background:rgba(26,24,28,1);}' +
    '.ide-stdin-input::selection{background:rgba(255,216,102,0.28);color:#1a181c;}' +
    '.ide-stdin-send{font-family:var(--font-mono);font-size:11px;font-weight:750;letter-spacing:-0.01em;padding:7px 14px;border-radius:999px;border:1px solid #ffd866;background:#ffd866;color:#1e1c1e;cursor:pointer;flex:none;transition:transform .12s, opacity .12s;}' +
    '.ide-stdin-send:hover{opacity:0.92;transform:translateY(-0.5px);}' +
    '.ide-stdin-send:active{transform:translateY(0);}' +
    '@media(max-width:900px){.ide-main{flex-direction:column;}.ide-panel{width:auto;height:38%;min-height:180px;}}' +
    '@media(max-width:640px){.ide-page{height:calc(100dvh - 48px);padding:0.5rem;gap:0.5rem;}.ide-editor-wrap,.ide-panel{border-radius:12px;}}';
  document.head.appendChild(css);

  var headLeft = App.el('div', { class: 'ide-head-left' },
    App.el('span', { class: 'ide-title', text: 'In-Browser IDE' }),
    App.el('span', { class: 'ide-badge', text: '8 languages · zero servers · zero CDN' }),
    App.el('span', { class: 'ide-sub', text: 'every compiler runs as WebAssembly in this tab' }));

  var tabs = App.el('div', { class: 'ide-tabs' });
  LANGUAGES.forEach(function (l) {
    var dot = App.el('span', { class: 'ide-tabdot' });
    var tab = App.el('button', {
      class: 'ide-tab' + (l.id === state.lang ? ' active' : ''),
      type: 'button',
      title: l.name,
      onclick: function () {
        if (runningLang || !editor) return;
        state.code[state.lang] = editor.getValue();
        state.lang = l.id;
        saveState();
        tabs.querySelectorAll('.ide-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        editor.setLanguage(l.id);
        editor.setValue(state.code[l.id] || l.sample);
        if (editor.clearDiagnostics) editor.clearDiagnostics();
        clearOutput();
        syncStdin();
        if (l.id !== 'js' && (!vendorState[l.id] || vendorState[l.id] === 'idle')) { vendorState[l.id] = 'loading'; ensureWorkerPreload(l.id); }
        syncRunButton();
        var vs2 = vendorState[l.id];
        if (vs2 === 'loading') setStatus('Loading ' + l.name + '…');
        else setStatus(l.name + ' — press Run (Ctrl+Enter)');
        editor.focus();
      }
    }, dot, l.name);
    tabs.appendChild(tab);
  });

  runBtn = App.el('button', { class: 'ide-run-btn', type: 'button', title: 'Run (Ctrl+Enter)' },
    App.el('span', { class: 'ide-run-glyph', text: '▶' }), App.el('span', { text: 'Run' }));
  runBtn.addEventListener('click', function () { if (runningLang) stopRun(); else runCode(); });
  var headRight = App.el('div', { class: 'ide-head-right' }, tabs, runBtn,
    App.el('kbd', { style: { fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)' }, text: 'Ctrl+Enter' }));
  root.appendChild(App.el('div', { class: 'ide-head' }, headLeft, headRight));

  var editorWrap = App.el('div', { class: 'ide-editor-wrap' });
  statusEl = App.el('span', { class: 'ide-status', text: 'Loading editor…' });
  var outHead = App.el('div', { class: 'ide-outhead' },
    App.el('span', { class: 'ide-outlabel', text: 'Output' }),
    statusEl,
    App.el('button', { class: 'ide-clear', type: 'button', text: 'clear', onclick: function () { clearOutput(); } }));
  outputEl = App.el('div', { class: 'ide-output' });

  stdinInput = App.el('input', {
    class: 'ide-stdin-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'type input — it goes to the program',
    'aria-label': 'stdin input'
  });
  stdinInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); deliverStdin(); }
  });
  stdinSend = App.el('button', { class: 'ide-stdin-send', type: 'button', text: 'Send ↵' });
  stdinSend.addEventListener('click', deliverStdin);
  stdinRow = App.el('div', { class: 'ide-stdin' },
    App.el('span', { class: 'ide-stdin-label', text: 'stdin' }), stdinInput, stdinSend);

  var panel = App.el('div', { class: 'ide-panel' }, outHead, outputEl, stdinRow);
  root.appendChild(App.el('div', { class: 'ide-main' }, editorWrap, panel));

  // Robust import: try relative first (works for file:// and sub-paths), fall back to absolute
  var editorUrls = ['js/ide/vendor/editor.js?v=14', '/js/ide/vendor/editor.js?v=14'];
  function tryImportEditor(i) {
    if (i >= editorUrls.length) throw new Error('Editor failed to load: all import paths failed');
    return import(editorUrls[i]).catch(function (e) {
      if (i + 1 < editorUrls.length) return tryImportEditor(i + 1);
      throw e;
    });
  }
  tryImportEditor(0).then(function (mod) {
    editor = mod.createIdeEditor(editorWrap, {
      value: state.code[state.lang] || langDef(state.lang).sample,
      language: state.lang,
      onRun: runCode,
      onChange: function (val) {
        state.code[state.lang] = val;
        saveState();
        if (editor && editor.clearDiagnostics) editor.clearDiagnostics();
      }
    });
    // Defensive: ensure contentDOM is editable and focusable even if a facet was mis-set
    try {
      if (editor.view && editor.view.contentDOM) {
        editor.view.contentDOM.setAttribute('contenteditable', 'true');
        editor.view.contentDOM.contentEditable = 'true';
        editor.view.contentDOM.style.pointerEvents = 'auto';
        editor.view.contentDOM.style.userSelect = 'text';
      }
    } catch (e) {}
    // Clicking the wrapper should focus the editor (covers dead-zone clicks)
    try { editorWrap.addEventListener('click', function () { if (editor) editor.focus(); }); } catch (e) {}
    vendorState['js'] = 'ready';
    if (state.lang !== 'js' && (!vendorState[state.lang] || vendorState[state.lang] === 'idle')) { vendorState[state.lang] = 'loading'; ensureWorkerPreload(state.lang); }
    syncRunButton();
    var vs0 = vendorState[state.lang];
    if (vs0 === 'loading') setStatus('Loading ' + langDef(state.lang).name + '…');
    else setStatus(langDef(state.lang).name + ' — press Run (Ctrl+Enter)');
    // Focus after paint; also retry after fonts-loading guard clears
    setTimeout(function () { try { editor.focus(); } catch (e) {} }, 50);
    setTimeout(function () { try { editor.focus(); } catch (e) {} }, 600);
  }).catch(function (err) {
    editorWrap.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">Editor failed to load: ' + App.esc(err.message || err) + '</span><button class="btn-primary-sm" style="margin-top:0.75rem" onclick="location.reload()">Retry</button>' }));
    setStatus('editor failed — click Retry');
    console.error('IDE editor import failed', err);
  });

  function syncStdin() {
    stdinSupported = STDIN_LANGS.indexOf(state.lang) >= 0;
    stdinRow.classList.toggle('hidden', !stdinSupported);
    var live = state.lang === 'js';
    stdinInput.placeholder = live
      ? 'type input — delivered live to the running program'
      : (stdinSupported ? 'stdin — sent to the program when you press Run' : '');
  }
  syncStdin();

  var onGlobalKey = function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
  };
  document.addEventListener('keydown', onGlobalKey);

  App.onUnmount(function () {
    document.removeEventListener('keydown', onGlobalKey);
    clearTimeout(saveTimer);
    watchdogGen++;
    clearTimeout(watchdog);
    Object.keys(workers).forEach(function (k) { try { workers[k].w.terminate(); } catch (e) {} });
    workers = {};
    if (editor && editor.destroy) { try { editor.destroy(); } catch (e) {} }
    editor = null;
    runningLang = null;
    stdinWaiting = false;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  });
  window.addEventListener('beforeunload', function () {
    if (editor) state.code[state.lang] = editor.getValue();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  });

  return root;
}

App.registerPage('/ide', renderIde);
})();
