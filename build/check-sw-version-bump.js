'use strict';
/* Git-diff-aware freshness guard: a content change without its version bump
   ships stale bytes to offline users (versioned URLs plus SW_VERSION key).
   check-versions.js proves index.html and sw.js agree with each other;
   this proves versions actually MOVED when content moved (versus git HEAD).
   Run: node build/check-sw-version-bump.js (exit 0 means fresh) */

var child = require('child_process');
var fs = require('fs');

function isStale(changed, headV, workV) { return !!changed && headV === workV; }

function runSelfTests() {
  var passed = 0, failed = 0;
  function ok(cond, name) {
    if (cond) { passed++; console.log('  ok  ' + name); }
    else { failed++; console.error('  FAIL ' + name); }
  }
  ok(isStale(true, '66', '66') === true, 'changed asset same version is stale');
  ok(isStale(true, '66', '67') === false, 'changed asset bumped version is fresh');
  ok(isStale(false, '66', '66') === false, 'unchanged asset same version is fresh');
  ok(isStale(true, 'v69', 'v69') === true, 'changed sw.js same SW_VERSION is stale');
  ok(isStale(true, 'v69', 'v70') === false, 'changed sw.js bumped SW_VERSION is fresh');
  ok(isStale(true, '36', '36') === true, 'changed lazy tool same TOOL_VERSION is stale');
  ok(isStale(true, '36', '37') === false, 'changed lazy tool bumped TOOL_VERSION is fresh');
  ok(isStale(true, '3', '3') === true, 'changed wasm same version is stale');
  ok(isStale(false, '3', '3') === false, 'unchanged wasm same version is fresh');
  console.log('');
  console.log((failed ? 'FAIL ' : 'OK ') + passed + ' freshness self-tests');
  return failed;
}
function gitOut(args) {
  try { return child.execSync('git ' + args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }
}
function headFile(path) {
  var out = gitOut('show HEAD:' + path);
  return out === null ? null : out;
}
function shellVersions(indexText) {
  var map = {}, re = /((?:js|css)\/[A-Za-z0-9_\/.\-]+\.(?:js|css))\?v=(\d+)/g, m;
  while ((m = re.exec(indexText))) map[m[1]] = m[2];
  return map;
}
function swVersion(swText) { var m = /SW_VERSION = 'v(\d+)'/.exec(swText); return m ? m[1] : null; }
function toolVersion(coreText) { var m = /TOOL_VERSION\s*:\s*'(\d+)'/.exec(coreText); return m ? m[1] : null; }
function wasmVersion(wasmText) { var m = /core\.wasm\?v=(\d+)/.exec(wasmText); return m ? m[1] : null; }
function liveCheck() {
  var failed = 0;
  function fail(m) { failed++; console.error('  FAIL ' + m); }
  function pass(m) { console.log('  ok  ' + m); }
  var diff = gitOut('diff --name-only HEAD');
  if (diff === null) { console.log('  note: git unavailable, live freshness skipped'); return 0; }
  var changed = {};
  diff.split('\n').forEach(function (l) { var t = l.trim(); if (t) changed[t] = 1; });
  var fresh = gitOut('ls-files --others --exclude-standard');
  if (fresh !== null) fresh.split('\n').forEach(function (l) { var t = l.trim(); if (t) changed[t] = 1; });
  var headIndex = headFile('index.html');
  if (headIndex === null) { console.log('  note: no HEAD yet, live freshness skipped'); return 0; }
  var workIndex = fs.readFileSync('index.html', 'utf8');
  var workSw = fs.readFileSync('sw.js', 'utf8');
  var headMap = shellVersions(headIndex), workMap = shellVersions(workIndex);
  var names = Object.keys(workMap), staleN = 0, i;
  for (i = 0; i < names.length; i++) {
    if (changed[names[i]] && headMap[names[i]] !== undefined && isStale(true, headMap[names[i]], workMap[names[i]])) {
      fail('stale shell asset: ' + names[i] + ' changed but ?v=' + workMap[names[i]] + ' (bump index.html plus sw.js)');
      staleN++;
    }
  }
  if (!staleN) pass('shell assets fresh (' + names.length + ' versioned)');
  var urlsMoved = false, ku = Object.keys(workMap), k;
  for (k = 0; k < ku.length; k++) { if (headMap[ku[k]] !== workMap[ku[k]]) { urlsMoved = true; break; } }
  var headSw = headFile('sw.js');
  var headSW = headSw ? swVersion(headSw) : null;
  var workSW = swVersion(workSw);
  if ((changed['sw.js'] || urlsMoved) && headSW !== null) {
    if (isStale(true, headSW, workSW)) fail('stale cache key: shell moved but SW_VERSION still v' + workSW);
    else pass('SW_VERSION fresh (v' + workSW + ')');
  } else pass('SW_VERSION untouched, nothing moved');
  var headCore = headFile('js/core.js');
  var headTV = headCore ? toolVersion(headCore) : null;
  var workTV = toolVersion(fs.readFileSync('js/core.js', 'utf8'));
  var lazyMoved = false, cf = Object.keys(changed), c;
  for (c = 0; c < cf.length; c++) {
    if (cf[c].indexOf('js/tools/') === 0 && cf[c] !== 'js/tools/transform.js' && cf[c] !== 'js/tools/generator.js') { lazyMoved = true; break; }
  }
  if (lazyMoved && headTV !== null) {
    if (isStale(true, headTV, workTV)) fail('stale lazy tools: js/tools changed but TOOL_VERSION still ' + workTV);
    else pass('TOOL_VERSION fresh (' + workTV + ')');
  } else pass('lazy tools untouched');
  var headWasmJs = headFile('js/wasm.js');
  var headWV = headWasmJs ? wasmVersion(headWasmJs) : null;
  var workWV = wasmVersion(fs.readFileSync('js/wasm.js', 'utf8'));
  if (changed['wasm/core.wasm'] && headWV !== null) {
    if (isStale(true, headWV, workWV)) fail('stale wasm: core.wasm changed but ?v=' + workWV + ' in js/wasm.js');
    else pass('wasm version fresh (v' + workWV + ')');
  } else pass('wasm payload untouched');
  console.log('');
  console.log((failed ? 'FAIL ' : 'OK ') + 'live freshness vs HEAD');
  return failed;
}

var rc = runSelfTests();
if (rc) process.exit(1);
process.exit(liveCheck() ? 1 : 0);