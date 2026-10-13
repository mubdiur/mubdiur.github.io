'use strict';
/* Guard: every versioned shell asset in index.html must exist in sw.js SHELL
   with the same ?v=. Run: node build/check-versions.js (exit 0 = in sync) */
var fs = require('fs');
var idx = fs.readFileSync('index.html', 'utf8');
var sw = fs.readFileSync('sw.js', 'utf8');
var manifest = fs.readFileSync('js/manifest.js', 'utf8');
var failed = 0;
function fail(m) { failed++; console.error('  FAIL ' + m); }
function pass(m) { console.log('  ok  ' + m); }
var re = /((?:js|css)\/[A-Za-z0-9_\/.\-]+\.(?:js|css))\?v=(\d+)/g;
var seen = {};
var m = null;
while ((m = re.exec(idx))) { seen[m[1]] = m[2]; }
var names = Object.keys(seen);
if (!names.length) fail('no versioned assets found in index.html');
for (var i = 0; i < names.length; i++) {
  var q = '' + names[i] + '?v=' + seen[names[i]] + '';
  if (sw.indexOf(q) >= 0) pass(names[i] + '?v=' + seen[names[i]] + ' precached');
  else fail(names[i] + ' index v' + seen[names[i]] + ' missing from sw.js SHELL');
}
if (manifest.indexOf('prime-hunt') >= 0) fail('stale prime-hunt reference in js/manifest.js');
else pass('no stale prime-hunt reference');
if (sw.indexOf('prime-hunt') >= 0) fail('stale prime-hunt entry in sw.js SHELL');
else pass('no stale prime-hunt cache entry');
/* Offline lazy-tool guard: every custom-template tool must be precached at
   App.TOOL_VERSION (core.js lazy-loads js/tools/<slug>.js?v=TOOL_VERSION).
   transform/generator are shell UIs with their own ?v=, not lazy tools. */
var coreSrc = fs.readFileSync('js/core.js', 'utf8');
var tvMatch = /TOOL_VERSION\s*:\s*['"](\d+)['"]/.exec(coreSrc);
if (!tvMatch) fail('App.TOOL_VERSION missing in js/core.js');
var toolVer = tvMatch && tvMatch[1];
var lazyRe = /js\/tools\/([A-Za-z0-9\-]+)\.js\?v=(\d+)/g;
var lazy = {}, lm = null;
while ((lm = lazyRe.exec(sw))) {
  if (lm[1] === 'transform' || lm[1] === 'generator') continue;
  lazy[lm[1]] = lm[2];
}
var lazyNames = Object.keys(lazy);
for (var li = 0; li < lazyNames.length; li++) {
  if (toolVer && lazy[lazyNames[li]] !== toolVer) fail('js/tools/' + lazyNames[li] + '.js?v=' + lazy[lazyNames[li]] + ' drifts from TOOL_VERSION ' + toolVer);
}
if (toolVer && lazyNames.length) pass(lazyNames.length + ' lazy tools at TOOL_VERSION ' + toolVer);
var customRe = /slug:\s*'([a-z0-9-]+)'[^}]*?template:\s*'(\w+)'/g;
var customs = [], cm = null;
while ((cm = customRe.exec(manifest))) { if (cm[2] === 'custom') customs.push(cm[1]); }
var uncovered = customs.filter(function (s) { return !Object.prototype.hasOwnProperty.call(lazy, s); });
for (var ci = 0; ci < uncovered.length; ci++) fail('custom tool ' + uncovered[ci] + ' missing from sw.js SHELL (offline broken)');
if (!uncovered.length && customs.length) pass(customs.length + ' custom tools precached for offline');
for (var si2 = 0; si2 < lazyNames.length; si2++) {
  if (customs.indexOf(lazyNames[si2]) < 0) fail('stale sw.js SHELL entry js/tools/' + lazyNames[si2] + '.js (no custom tool)');
}
console.log('');
console.log((failed ? 'FAIL ' : 'OK ') + names.length + ' index assets checked');
process.exit(failed ? 1 : 0);