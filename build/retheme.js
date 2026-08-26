/* One-shot palette migration: old tinted-monochrome literals → DeepSeek dark palette.
   Run: node build/retheme.js   (idempotent — old strings no longer exist after first run) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Ordered longest-first to avoid partial overlaps.
const MAP = [
  ['rgba(194,220,212,', 'rgba(83,163,249,'],   // teal accent → primary blue
  ['#c2dcd4', '#53a3f9'],
  ['rgba(200,212,228,', 'rgba(115,180,250,'],   // pale blue → primary-light
  ['#c8d4e4', '#73b4fa'],
  ['rgba(233,233,236,', 'rgba(227,227,227,'],   // foreground
  ['#e9e9ec', '#e3e3e3'],
  ['rgba(170,170,179,', 'rgba(141,148,158,'],   // muted text
  ['#aaaab3', '#bec3c9'],
  ['#7e7f89', '#8d949e'],
  ['rgba(228,205,212,', 'rgba(251,86,91,'],     // pale red → danger-light
  ['#e4cdd4', '#fb565b'],
  ['#ddcdd3', '#fb565b'],
  ['rgba(220,211,189,', 'rgba(230,167,0,'],     // pale yellow → warning
  ['#dcd3bd', '#e6a700'],
  ['rgba(30,32,41,', 'rgba(51,53,56,'],         // old surface borders → #333538
  ['#1e2029', '#333538'],
  ['#2b2e3a', '#444950'],
  ['#13141c', '#202123'],
  ['rgba(19,20,28,', 'rgba(32,33,35,'],
  ['#09090d', '#101011'],
  ['rgba(12,13,19,', 'rgba(27,27,29,'],
  ['#0c0d13', '#1b1b1d'],
  ['#c0d9c8', '#26b226'],                        // green glow → success
  ['#0a0b10', '#161618'],                        // IDE well background
];

const TARGETS = [
  'css/app.css',
  'index.html',
  'portfolio.html',
  'build/editor-entry.js',
  'js/ide/vendor/editor.js',
  'js/core.js',
  'js/manifest.js',
  'js/charts.js',
  'js/svg.js',
  'js/pages/home.js',
  'js/pages/tools.js',
  'js/pages/tool.js',
  'js/tools/transform.js',
  'js/tools/generator.js',
  'js/tools/base64-image-decoder.js',
  'js/tools/binary-tree-visualizer.js',
  'js/tools/color-converter.js',
  'js/tools/contrast-checker.js',
  'js/tools/email-extractor.js',
  'js/tools/http-status-codes.js',
  'js/tools/image-to-base64.js',
  'js/tools/json-validator.js',
  'js/tools/jwt-debugger.js',
  'js/tools/markdown-preview.js',
  'js/tools/post-maker.js',
  'js/tools/qr-code-generator.js',
  'js/tools/search-visualizer.js',
  'js/tools/sorting-visualizer.js',
  'js/tools/table2xl.js',
  'js/tools/time-copier.js',
  'js/tools/timeline-taker.js',
  'js/tools/unit-converter.js',
];

let totalChanged = 0;
for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  for (const [from, to] of MAP) src = src.split(from).join(to);
  if (src !== before) {
    fs.writeFileSync(file, src);
    const n = MAP.reduce((acc, [f]) => acc + (before.split(f).length - 1), 0);
    console.log(rel + ': ' + n + ' replacements');
    totalChanged += n;
  }
}
console.log('Done. Total replacements: ' + totalChanged);
