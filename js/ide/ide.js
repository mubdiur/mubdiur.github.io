/* ═══════════════════════════════════════════════════════════
   In-Browser IDE — full CodeMirror 6 editor (syntax highlighting,
   autocomplete, auto-indent) with the output in a right-hand
   panel, running 8 languages entirely in the tab. Every compiler
   is vendored same-origin (no CDN); editor state persists to
   localStorage and engine payloads are cached via the Cache API.
   stdin: the input box below the output pipes input to the
   program — live for JavaScript (readline / process.stdin), and
   type-ahead (sent when you press Run) for Python, C, C++, Rust.
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

/* Languages whose engines can read stdin at all (Go/C#/Java expose none). */
var STDIN_LANGS = ['js', 'py', 'c', 'cpp', 'rs'];

var STORE_KEY = 'mub.ide.v1';
var RUNNER_DIR = 'js/ide/';
var STDIN_WAIT_MS = 120000; // how long a run may wait for typed input

var state = { lang: 'js', code: {} };
var workers = {};
var watchdog = null;
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

function loadState() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s && s.lang && LANGUAGES.some(function (l) { return l.id === s.lang; })) state.lang = s.lang;
      if (s && s.code) state.code = s.code;
    }
  } catch (e) {}
  LANGUAGES.forEach(function (l) {
    if (!state.code[l.id]) state.code[l.id] = l.sample;
  });
}

var saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }, 300);
}

function langDef(id) {
  return LANGUAGES.filter(function (l) { return l.id === id; })[0];
}

/* ── runner orchestration ── */

function getWorker(lang) {
  var def = langDef(lang);
  var entry = workers[lang];
  if (entry && entry.alive) return entry.w;
  var w = new Worker(RUNNER_DIR + def.runner + '?v=5', { type: def.module ? 'module' : 'classic' });
  w.__lang = lang;
  w.addEventListener('message', function (e) { onWorkerMessage(lang, w, e.data || {}); });
  w.addEventListener('error', function (e) {
    if (workers[lang] && workers[lang].w === w && workers[lang].alive) {
      appendOutput('Runner error: ' + (e.message || 'unknown'), true);
      markDead(lang);
    }
  });
  workers[lang] = { w: w, alive: true };
  return w;
}

function markDead(lang) {
  if (workers[lang]) workers[lang].alive = false;
}

function onWorkerMessage(lang, w, m) {
  if (workers[lang] && workers[lang].w !== w) return;
  kickWatchdog(lang);
  if (m.type === 'status') setStatus(m.text);
  else if (m.type === 'out') appendOutput(String(m.text || ''), false);
  else if (m.type === 'err') appendOutput(String(m.text || ''), true);
  else if (m.type === 'diag') { if (editor && editor.setDiagnostics) editor.setDiagnostics(m.diags || []); }
  else if (m.type === 'stdin') onStdinRequest();
  else if (m.type === 'exit') {
    if (m.terminated) markDead(lang);
    finishRun(m.code === null || m.code === undefined ? null : m.code, !!m.terminated);
  }
}

function armWatchdog(ms) {
  clearTimeout(watchdog);
  watchdog = setTimeout(function () {
    var entry = workers[runningLang];
    if (entry && entry.alive && runningLang) {
      appendOutput('\n[terminated: no response for ' + Math.round(ms / 1000) + 's — check for infinite loops]\n', true);
      try { entry.w.terminate(); } catch (e) {}
      markDead(runningLang);
      finishRun(null, true);
    }
  }, ms);
}

function kickWatchdog(lang) {
  armWatchdog(langDef(lang).timeout * 1000);
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
  runningLang = null;
  clearTimeout(watchdog);
  if (stdinRow) stdinRow.classList.remove('waiting');
  stdinWaiting = false;
  if (runBtn) {
    runBtn.disabled = false;
    runBtn.innerHTML = '<span class="ide-run-glyph">▶</span> Run';
  }
  setTabsEnabled(true);
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
  clearTimeout(watchdog);
  if (entry && entry.alive) { try { entry.w.terminate(); } catch (e) {} }
  markDead(lang);
  finishRun(null, true);
  setStatus('stopped');
}

function runCode() {
  if (runningLang || !editor) return;
  var lang = state.lang;
  var code = editor.getValue();
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
  if (STDIN_LANGS.indexOf(lang) >= 0) payload.stdin = stdinInput ? stdinInput.value : '';
  w.postMessage(payload);
}

/* ── stdin box (bottom of the output panel) ── */

function onStdinRequest() {
  stdinWaiting = true;
  stdinRow.classList.add('waiting');
  setStatus('awaiting input — type in the box below');
  armWatchdog(STDIN_WAIT_MS); // a human is typing: extend the watchdog
  stdinInput.focus();
}

function deliverStdin() {
  var line = stdinInput.value;
  stdinInput.value = '';
  stdinWaiting = false;
  stdinRow.classList.remove('waiting');
  var entry = workers[state.lang];
  if (entry && entry.alive && !runningLang) return; // run already over
  if (entry && entry.alive) {
    entry.w.postMessage({ type: 'stdin', line: line });
    setStatus('input sent — program continues');
  }
  kickWatchdog(state.lang);
}

/* ── page ── */

function renderIde() {
  loadState();
  var root = App.el('div', { class: 'ide-page' });

  var css = document.createElement('style');
  css.id = 'ide-css';
  css.textContent =
    '.ide-page{height:calc(100vh - 48px);height:calc(100dvh - 48px);min-height:0;display:flex;flex-direction:column;gap:0.5rem;padding:0.5rem 1rem 0.5rem;overflow:hidden;background:#221f22;}' +
    '.ide-head{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;flex-shrink:0;}' +
    '.ide-head-left{display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;min-width:0;}' +
    '.ide-head-right{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;}' +
    '.ide-title{font-family:var(--font-mono);font-size:14px;font-weight:700;color:#fcfcfa;letter-spacing:-0.03em;}' +
    '.ide-sub{font-family:var(--font-mono);font-size:11px;color:#939293;display:none;}' +
    '@media(min-width:1400px){.ide-sub{display:inline;}}' +
    '.ide-badge{font-family:var(--font-mono);font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid #5b595c;color:#ffd866;background:#403e41;white-space:nowrap;}' +
    '.ide-tabs{display:flex;gap:3px;flex-wrap:wrap;align-items:center;}' +
    '.ide-tab{font-family:var(--font-mono);font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid #403e41;background:#2d2a2e;color:#939293;cursor:pointer;transition:all .15s;letter-spacing:-0.02em;}' +
    '.ide-tab:hover:not(:disabled){color:#fcfcfa;border-color:#5b595c;}' +
    '.ide-tab.active{background:#ffd866;color:#2d2a2e;border-color:#ffd866;font-weight:600;}' +
    '.ide-tab:disabled{opacity:0.5;cursor:not-allowed;}' +
    '.ide-tab .ide-tabdot{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:5px;background:#5b595c;vertical-align:middle;}' +
    '.ide-tab.active .ide-tabdot{background:#2d2a2e;}' +
    '.ide-run-btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:12px;font-weight:700;padding:6px 16px;border-radius:6px;border:1px solid #ffd866;background:#ffd866;color:#2d2a2e;cursor:pointer;transition:opacity .15s;}' +
    '.ide-run-btn:hover:not(:disabled){opacity:0.88;}' +
    '.ide-run-btn:disabled{opacity:0.55;cursor:wait;}' +
    '.ide-run-glyph{font-size:10px;}' +
    '.ide-main{display:flex;flex:1;min-height:0;gap:0.5rem;overflow:hidden;}' +
    '.ide-editor-wrap{flex:1;min-width:0;border:1px solid #403e41;border-radius:6px;overflow:hidden;background:#2d2a2e;display:flex;flex-direction:column;min-height:0;}' +
    '.ide-editor-wrap .cm-editor{flex:1;min-height:0;}' +
    '.ide-panel{width:380px;flex:none;display:flex;flex-direction:column;border:1px solid #403e41;border-radius:6px;background:#403e41;min-height:0;overflow:hidden;}' +
    '.ide-outhead{display:flex;align-items:center;gap:0.75rem;padding:6px 12px;border-bottom:1px solid #5b595c;background:#403e41;flex-shrink:0;}' +
    '.ide-outlabel{font-family:var(--font-mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#939293;flex:none;}' +
    '.ide-status{font-family:var(--font-mono);font-size:10.5px;color:#939293;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.ide-clear{font-family:var(--font-mono);font-size:10px;color:#939293;background:none;border:none;cursor:pointer;flex:none;}' +
    '.ide-clear:hover{color:#fcfcfa;}' +
    '.ide-output{flex:1;min-height:0;overflow-y:auto;padding:10px 12px;font-family:var(--font-mono);font-size:12px;line-height:1.5;background:#403e41;}' +
    '.ide-line{white-space:pre-wrap;word-break:break-all;color:#fcfcfa;}' +
    '.ide-line.err{color:#ff6188;}' +
    '.ide-stdin{display:flex;align-items:center;gap:0.5rem;padding:6px 12px;border-top:1px solid #5b595c;background:#403e41;flex-shrink:0;}' +
    '.ide-stdin.waiting{background:rgba(255,216,102,0.12);box-shadow:inset 0 1px 0 rgba(255,216,102,0.35);}' +
    '.ide-stdin-label{font-family:var(--font-mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#939293;flex:none;}' +
    '.ide-stdin.waiting .ide-stdin-label{color:#ffd866;}' +
    '.ide-stdin-input{flex:1;min-width:0;background:#2d2a2e;border:1px solid #5b595c;border-radius:6px;color:#fcfcfa;font-family:var(--font-mono);font-size:12px;padding:5px 10px;outline:none;}' +
    '.ide-stdin-input:focus{border-color:#ffd866;box-shadow:0 0 0 1px rgba(255,216,102,0.25);}' +
    '.ide-stdin-send{font-family:var(--font-mono);font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;border:1px solid #ffd866;background:#ffd866;color:#2d2a2e;cursor:pointer;flex:none;}' +
    '.ide-stdin-send:hover{opacity:0.88;}' +
    '@media(max-width:900px){.ide-main{flex-direction:column;}.ide-panel{width:auto;height:38%;min-height:160px;}}' +
    '@media(max-width:640px){.ide-page{height:calc(100dvh - 48px);}}';
  document.head.appendChild(css);

  /* header: title left, language tabs + run controls right */
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
        setStatus(l.name + ' — press Run (Ctrl+Enter)');
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

  /* editor + output panel side by side */
  var editorWrap = App.el('div', { class: 'ide-editor-wrap' });
  statusEl = App.el('span', { class: 'ide-status', text: 'Loading editor…' });
  var outHead = App.el('div', { class: 'ide-outhead' },
    App.el('span', { class: 'ide-outlabel', text: 'Output' }),
    statusEl,
    App.el('button', { class: 'ide-clear', type: 'button', text: 'clear', onclick: function () { clearOutput(); } }));
  outputEl = App.el('div', { class: 'ide-output' });

  /* stdin row: pipes input to the program */
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

  /* CodeMirror editor (vendored bundle) */
  import('/js/ide/vendor/editor.js?v=9').then(function (mod) {
    editor = mod.createIdeEditor(editorWrap, {
      value: state.code[state.lang] || langDef(state.lang).sample,
      language: state.lang,
      onRun: runCode
    });
    editor.view.dom.addEventListener('input', function () {
      state.code[state.lang] = editor.getValue();
      saveState();
      if (editor.clearDiagnostics) editor.clearDiagnostics();
    });
    setStatus(langDef(state.lang).name + ' — press Run (Ctrl+Enter)');
    editor.focus();
  }).catch(function (err) {
    editorWrap.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">Editor failed to load: ' + App.esc(err.message || err) + '</span>' }));
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

  /* run from anywhere: Ctrl+Enter even when focus is in the output panel */
  var onGlobalKey = function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
  };
  document.addEventListener('keydown', onGlobalKey);

  /* persistence + cleanup */
  App.onUnmount(function () {
    document.removeEventListener('keydown', onGlobalKey);
    clearTimeout(saveTimer);
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
