'use strict';
global.window = {};
require('../js/lib/diff.js');
const D = window.MyersDiff;

// Case 1: insertion in middle — naive diff would mark all following lines as changed
const a = ['a', 'b', 'c', 'd', 'e'].join('\n');
const b = ['a', 'b', 'X', 'c', 'd', 'e'].join('\n');
const out = D.linesText(a, b);
console.log('--- insert middle ---'); console.log(out);
if (out.split('\n').filter(l => l.startsWith('  ')).length !== 5) throw new Error('context lines wrong');
if (out.split('\n').filter(l => l === '+ X').length !== 1) throw new Error('no single add');

console.log('--- delete ---'); console.log(D.linesText(['a', 'b', 'c'].join('\n'), ['a', 'c'].join('\n')));
console.log('--- reorder ---'); console.log(D.linesText(['a', 'b', 'c', 'd'].join('\n'), ['d', 'a', 'b', 'c'].join('\n')));

if (D.linesText('x\ny', 'x\ny') !== '  x\n  y') throw new Error('identical failed');

console.log('--- empty -> full ---'); console.log(D.linesText('', 'a\nb'));

// Randomized consistency: applying ops (eq+add, skipping del) must rebuild b
for (let t = 0; t < 500; t++) {
  const n = Math.floor(Math.random() * 30), m = Math.floor(Math.random() * 30);
  const A = Array.from({ length: n }, (_, i) => String(i % 7) + ':' + Math.floor(Math.random() * 5));
  const B = Array.from({ length: m }, (_, i) => String(i % 7) + ':' + Math.floor(Math.random() * 5));
  const ops = D.diff(A, B);
  const rebuilt = [];
  let ai = 0, bi = 0;
  for (const op of ops) {
    if (op.t === 'eq') { if (A[op.ai] !== B[op.bi]) throw new Error('eq pair mismatch t=' + t); if (op.ai !== ai || op.bi !== bi) throw new Error('not monotone'); ai++; bi++; }
    else if (op.t === 'del') { if (op.ai !== ai) throw new Error('del idx'); ai++; }
    else { if (op.bi !== bi) throw new Error('add idx'); bi++; }
  }
  if (ai !== A.length || bi !== B.length) throw new Error('length mismatch');
}
console.log('MyersDiff OK');

require('../js/lib/random.js');
const R = window.CryptoRand;
// Distribution sanity: chi-square over a 62-char pool
const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const freq = new Array(62).fill(0);
for (let i = 0; i < 124000; i++) freq[pool.indexOf(R.pick(pool))]++;
const exp = 124000 / 62;
const chi = freq.reduce((s, f) => s + (f - exp) ** 2 / exp, 0);
console.log('chi2(61 df) =', chi.toFixed(1), '(expect ~61 ± ~25)');
if (chi > 140) throw new Error('distribution looks biased');

const set = new Set();
for (let i = 0; i < 5000; i++) {
  const u = R.uuidV4();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u)) throw new Error('bad uuid ' + u);
  set.add(u);
}
if (set.size !== 5000) throw new Error('uuid collision');

for (let i = 0; i < 10000; i++) { const v = R.int(10); if (!Number.isInteger(v) || v < 0 || v > 9) throw new Error('int out of range'); }
if (R.int(1) !== 0) throw new Error('bound 1');
const pw = R.string(24, pool + '!@#$', [pool.slice(0, 26), pool.slice(26)]);
if (pw.length !== 24) throw new Error('string length');
console.log('CryptoRand OK');
