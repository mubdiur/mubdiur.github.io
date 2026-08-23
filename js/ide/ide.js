/* ═══════════════════════════════════════════════════════════
   In-Browser IDE — full CodeMirror 6 editor (syntax highlighting,
   autocomplete, auto-indent) with the output in a right-hand
   panel, running 8 languages entirely in the tab. Every compiler
   is vendored same-origin (no CDN); editor state persists to
   localStorage and engine payloads are cached via the Cache API.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var LANGUAGES = [
  { id: 'js',   name: 'JavaScript', runner: 'js-sandbox.js', module: false, timeout: 25, sample:
'// Node-lite sandbox — console, timers, process, Buffer,\n// require() with a small builtin set, in-memory fs.\n\nconst items = [1, 2, 3, 4, 5];\nconst doubled = items.map(n => n * 2);\nconsole.log("doubled:", doubled);\n\nsetTimeout(() => {\n  console.log("async works too");\n}, 100);\n\nconsole.log("sum:", items.reduce((a, b) => a + b, 0));' },
  { id: 'py',   name: 'Python',    runner: 'py-runner.js',   module: true,  timeout: 45, sample:
'# Real CPython 3.14 (Pyodide, vendored)\n\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint("fib(20) =", fib(20))\n\nimport math\nprint("pi =", round(math.pi, 6))\n\nwords = "the quick brown fox".split()\nprint(" ".join(w.upper() for w in reversed(words)))' },
  { id: 'c',    name: 'C',         runner: 'cc-runner.js',   module: true,  timeout: 150, sample:
'#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    for (int i = 1; i <= 5; i++) {\n        printf("%d ", i * i);\n    }\n    printf("\\n");\n    return 0;\n}' },
  { id: 'cpp',  name: 'C++',       runner: 'cc-runner.js',   module: true,  timeout: 150, sample:
'#include <iostream>\n#include <vector>\n#include <algorithm>\n\nint main() {\n    std::vector<int> v = {5, 2, 8, 1, 9};\n    std::sort(v.begin(), v.end());\n    std::cout << "sorted:";\n    for (int n : v) std::cout << " " << n;\n    std::cout << "\\n";\n    return 0;\n}' },
  { id: 'cs',   name: 'C#',        runner: 'cs-runner.js',   module: true,  timeout: 90, sample:
'using System;\nusing System.Linq;\n\nclass Program\n{\n    static void Main()\n    {\n        var nums = Enumerable.Range(1, 10);\n        Console.WriteLine($"sum 1..10 = {nums.Sum()}");\n        Console.WriteLine($"even count = {nums.Count(n => n % 2 == 0)}");\n    }\n}' },
  { id: 'java', name: 'Java',      runner: 'java-runner.js', module: true,  timeout: 30, sample:
'public class Hello {\n    public static String run() {\n        String out = "";\n        for (int i = 1; i <= 5; i++) {\n            out = out + (i * i) + " ";\n        }\n        return "squares: " + out.trim();\n    }\n}' },
  { id: 'go',   name: 'Go',        runner: 'go-runner.js',   module: true,  timeout: 90, sample:
'package main\n\nimport (\n\t"fmt"\n\t"strings"\n)\n\nfunc main() {\n\twords := []string{"go", "in", "the", "browser"}\n\tfmt.Println("joined:", strings.Join(words, " "))\n\tfmt.Println("upper:", strings.ToUpper(strings.Join(words, "-")))\n}' },
  { id: 'rs',   name: 'Rust',      runner: 'rust-runner.js', module: true,  timeout: 90, sample:
'fn main() {\n    let v = vec![1, 2, 3, 4, 5];\n    let doubled: Vec<i32> = v.iter().map(|x| x * 2).collect();\n    println!("doubled: {:?}", doubled);\n    println!("sum: {}", doubled.iter().sum::<i32>());\n}' }
];

var STORE_KEY = 'mub.ide.v1';
var RUNNER_DIR = 'js/ide/';

var state = { lang: 'js', code: {} };
var workers = {};
var watchdog = null;
var editor = null;
var outputEl = null;
var statusEl = null;
var runBtn = null;
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
  var w = new Worker(RUNNER_DIR + def.runner + '?v=3', { type: def.module ? 'module' : 'classic' });
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
  else if (m.type === 'exit') {
    if (m.terminated) markDead(lang);
    finishRun(m.code === null || m.code === undefined ? null : m.code, !!m.terminated);
  }
}

function kickWatchdog(lang) {
  var def = langDef(lang);
  clearTimeout(watchdog);
  watchdog = setTimeout(function () {
    var entry = workers[lang];
    if (entry && entry.alive && runningLang === lang) {
      appendOutput('\n[terminated: no response for ' + def.timeout + 's — check for infinite loops]\n', true);
      try { entry.w.terminate(); } catch (e) {}
      markDead(lang);
      finishRun(null, true);
    }
  }, def.timeout * 1000);
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
}

function finishRun(code, terminated) {
  runningLang = null;
  clearTimeout(watchdog);
  if (runBtn) {
    runBtn.disabled = false;
    runBtn.innerHTML = '<span class="ide-run-glyph">▶</span> Run';
  }
  var secs = ((Date.now() - runStart) / 1000).toFixed(1);
  if (terminated) setStatus('terminated after ' + secs + 's');
  else if (code) setStatus('exited with code ' + code + ' in ' + secs + 's');
  else setStatus('finished in ' + secs + 's');
}

function runCode() {
  if (runningLang) return;
  var lang = state.lang;
  var code = editor.getValue();
  state.code[lang] = code;
  saveState();
  runningLang = lang;
  runStart = Date.now();
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="ide-run-glyph spin">◌</span> Running…';
  clearOutput();
  setStatus('Starting ' + langDef(lang).name + '…');
  var w = getWorker(lang);
  kickWatchdog(lang);
  w.postMessage({ code: code, lang: lang });
}

/* ── page ── */

function renderIde() {
  loadState();
  var root = App.el('div', { class: 'ide-page' });

  var css = document.createElement('style');
  css.id = 'ide-css';
  css.textContent =
    '.ide-page{height:calc(100vh - 220px);min-height:520px;display:flex;flex-direction:column;gap:0.6rem;padding:0.5rem 1rem 1rem;}' +
    '.ide-head{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;}' +
    '.ide-title{font-family:var(--font-mono);font-size:15px;font-weight:600;color:rgba(233,233,236,0.92);}' +
    '.ide-sub{font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);}' +
    '.ide-badge{font-family:var(--font-mono);font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(194,220,212,0.25);color:var(--ctp-teal);background:rgba(194,220,212,0.06);white-space:nowrap;}' +
    '.ide-tabs{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}' +
    '.ide-tab{font-family:var(--font-mono);font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--mantle);color:var(--ink-soft);cursor:pointer;transition:all .15s;}' +
    '.ide-tab:hover{color:var(--foreground);border-color:var(--rule-strong);}' +
    '.ide-tab.active{background:rgba(194,220,212,0.12);color:var(--ctp-teal);border-color:rgba(194,220,212,0.35);}' +
    '.ide-tab .ide-tabdot{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:6px;background:var(--rule-strong);vertical-align:middle;}' +
    '.ide-tab.active .ide-tabdot{background:var(--ctp-teal);}' +
    '.ide-runbar{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;}' +
    '.ide-run-btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:12px;font-weight:600;padding:7px 18px;border-radius:7px;border:1px solid rgba(194,220,212,0.4);background:rgba(194,220,212,0.12);color:var(--ctp-teal);cursor:pointer;transition:all .15s;}' +
    '.ide-run-btn:hover:not(:disabled){background:rgba(194,220,212,0.2);}' +
    '.ide-run-btn:disabled{opacity:0.55;cursor:wait;}' +
    '.ide-run-glyph{font-size:10px;}' +
    '.ide-run-glyph.spin{display:inline-block;animation:spin 1s linear infinite;}' +
    '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '.ide-status{font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);flex:1;text-align:right;}' +
    '.ide-main{display:flex;flex:1;min-height:0;gap:0.6rem;}' +
    '.ide-editor-wrap{flex:1;min-width:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#0a0b10;}' +
    '.ide-panel{width:380px;flex:none;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:8px;background:#0a0b10;min-height:0;}' +
    '.ide-outhead{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid rgba(30,32,41,0.8);}' +
    '.ide-outlabel{font-family:var(--font-mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-faint);}' +
    '.ide-clear{font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);background:none;border:none;cursor:pointer;}' +
    '.ide-clear:hover{color:var(--foreground);}' +
    '.ide-output{flex:1;min-height:0;overflow-y:auto;padding:10px 12px;font-family:var(--font-mono);font-size:12px;line-height:1.5;}' +
    '.ide-line{white-space:pre-wrap;word-break:break-all;color:#c8d4e4;}' +
    '.ide-line.err{color:rgba(228,205,212,0.95);}' +
    '.ide-foot{font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);display:flex;gap:14px;flex-wrap:wrap;}' +
    '@media(max-width:900px){.ide-main{flex-direction:column;}.ide-panel{width:auto;height:240px;}}' +
    '@media(max-width:640px){.ide-page{height:calc(100vh - 300px);}}';
  document.head.appendChild(css);

  /* header */
  root.appendChild(App.el('div', { class: 'ide-head' },
    App.el('span', { class: 'ide-title', text: 'In-Browser IDE' }),
    App.el('span', { class: 'ide-badge', text: '8 languages · zero servers · zero CDN' }),
    App.el('span', { class: 'ide-sub', text: 'every compiler runs as WebAssembly in this tab' })));

  /* language tabs */
  var tabs = App.el('div', { class: 'ide-tabs' });
  LANGUAGES.forEach(function (l) {
    var dot = App.el('span', { class: 'ide-tabdot' });
    var tab = App.el('button', {
      class: 'ide-tab' + (l.id === state.lang ? ' active' : ''),
      type: 'button',
      title: l.name,
      onclick: function () {
        if (runningLang) return;
        state.code[state.lang] = editor.getValue();
        state.lang = l.id;
        saveState();
        tabs.querySelectorAll('.ide-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        editor.setLanguage(l.id);
        editor.setValue(state.code[l.id] || l.sample);
        clearOutput();
        setStatus(l.name + ' — press Run (Ctrl+Enter)');
      }
    }, dot, l.name);
    tabs.appendChild(tab);
  });
  root.appendChild(tabs);

  /* run bar */
  runBtn = App.el('button', { class: 'ide-run-btn', type: 'button' },
    App.el('span', { class: 'ide-run-glyph', text: '▶' }), App.el('span', { text: 'Run' }));
  runBtn.addEventListener('click', runCode);
  statusEl = App.el('span', { class: 'ide-status', text: 'Ready' });
  root.appendChild(App.el('div', { class: 'ide-runbar' }, runBtn,
    App.el('kbd', { style: { fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)' }, text: 'Ctrl+Enter' }),
    statusEl));

  /* editor + output side by side */
  var editorWrap = App.el('div', { class: 'ide-editor-wrap' });
  var outHead = App.el('div', { class: 'ide-outhead' },
    App.el('span', { class: 'ide-outlabel', text: 'Output' }),
    App.el('button', { class: 'ide-clear', type: 'button', text: 'clear', onclick: function () { clearOutput(); } }));
  outputEl = App.el('div', { class: 'ide-output' });
  var panel = App.el('div', { class: 'ide-panel' }, outHead, outputEl);
  root.appendChild(App.el('div', { class: 'ide-main' }, editorWrap, panel));

  /* footer */
  root.appendChild(App.el('div', { class: 'ide-foot' },
    App.el('span', { text: 'compilers: Pyodide · clang · .NET+Roslyn · 199xVM · GopherJS · rustc — all vendored, lazy-loaded once, cached in your browser' }),
    App.el('span', { text: 'Kotlin: no in-browser compiler exists (kotlinc needs a JVM; the old kotlin-compiler-js was removed from npm)' })));

  /* CodeMirror editor (vendored bundle) */
  var editorReady = false;
  import('/js/ide/vendor/editor.js?v=3').then(function (mod) {    editor = mod.createIdeEditor(editorWrap, {
      value: state.code[state.lang] || langDef(state.lang).sample,
      language: state.lang,
      onRun: runCode
    });
    editorReady = true;
    editor.view.dom.addEventListener('input', function () {
      state.code[state.lang] = editor.getValue();
      saveState();
    });
    setStatus(langDef(state.lang).name + ' — press Run (Ctrl+Enter)');
    if (window.__ideFocus) editor.focus();
  }).catch(function (err) {
    editorWrap.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">Editor failed to load: ' + App.esc(err.message || err) + '</span>' }));
  });

  setStatus('Loading editor…');

  /* persistence + cleanup */
  App.onUnmount(function () {
    clearTimeout(saveTimer);
    clearTimeout(watchdog);
    Object.keys(workers).forEach(function (k) { try { workers[k].w.terminate(); } catch (e) {} });
    workers = {};
    if (editor && editor.destroy) { try { editor.destroy(); } catch (e) {} }
    editor = null;
    runningLang = null;
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
