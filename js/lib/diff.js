/* ═══════════════════════════════════════════════════════════
   MyersDiff — Eugene W. Myers' O((N+M)D) shortest-edit-script
   diff ("An O(ND) Difference Algorithm and Its Variations",
   1986), the same family of algorithm behind GNU diff and Git.

   The naive line-by-line comparison it replaces reports every
   line after an insertion as changed; this produces a minimal
   edit script that pins down what actually moved.

   Memory is O(D·(N+M)) for the V-snapshot trace; inputs whose
   edit script would exceed MAX_D fall back to a block diff so
   worst-case inputs degrade gracefully instead of exploding.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var MAX_D = 2000;      // beyond this edit distance we emit a single replace block
var MAX_ELEMENTS = 20000; // hard input ceiling before falling back

/**
 * Diff two sequences.
 * a, b : arrays
 * eq   : (a[i], b[j]) → boolean
 * Returns [{ t:'eq'|'del'|'add', ai, bi }] in order; ai/bi are
 * indices into a/b and are -1 for add/del respectively.
 */
function diff(a, b, eq) {
  var n = a.length, m = b.length;
  if (!eq) eq = function (x, y) { return x === y; };

  // Trim common prefix/suffix — shrinks D dramatically for typical edits.
  var start = 0;
  while (start < n && start < m && eq(a[start], b[start])) start++;
  var endA = n, endB = m;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) { endA--; endB--; }

  var ops = [];
  for (var i = 0; i < start; i++) ops.push({ t: 'eq', ai: i, bi: i });
  var mid = middle(a, b, start, endA, start, endB, eq);
  for (var j = 0; j < mid.length; j++) ops.push(mid[j]);
  for (var k = 0; k < n - endA; k++) ops.push({ t: 'eq', ai: endA + k, bi: endB + k });
  return ops;
}

/** Diff the (already prefix/suffix-trimmed) middle sections. */
function middle(a, b, al, ah, bl, bh, eq) {
  var n = ah - al, m = bh - bl;
  if (n === 0 && m === 0) return [];
  if (n === 0) return range('add', bl, bh);
  if (m === 0) return range('del', al, ah);

  if (n + m > MAX_ELEMENTS || n * m > 40000000) {
    // Pathological input: one replace block instead of a quadratic blow-up.
    var fb = [];
    for (var x = al; x < ah; x++) fb.push({ t: 'del', ai: x, bi: -1 });
    for (var y = bl; y < bh; y++) fb.push({ t: 'add', ai: -1, bi: y });
    return fb;
  }

  var max = n + m;
  var offset = max;
  var v = new Int32Array(2 * max + 2);
  var trace = [];
  var foundD = -1;

  for (var d = 0; d <= Math.min(max, MAX_D * 2); d++) {
    trace.push(Int32Array.from(v));
    for (var k2 = -d; k2 <= d; k2 += 2) {
      var kk2 = k2 + offset;
      var x2;
      if (k2 === -d || (k2 !== d && v[kk2 - 1] < v[kk2 + 1])) x2 = v[kk2 + 1];
      else x2 = v[kk2 - 1] + 1;
      var y2 = x2 - k2;
      while (x2 < n && y2 < m && eq(a[al + x2], b[bl + y2])) { x2++; y2++; }
      v[kk2] = x2;
      if (x2 >= n && y2 >= m) { foundD = d; break; }
    }
    if (foundD >= 0) break;
  }

  if (foundD < 0) {
    var out = [];
    for (var xa = al; xa < ah; xa++) out.push({ t: 'del', ai: xa, bi: -1 });
    for (var xb = bl; xb < bh; xb++) out.push({ t: 'add', ai: -1, bi: xb });
    return out;
  }

  var steps = [];
  var px = n, py = m;
  for (var dd = foundD; dd > 0; dd--) {
    var vv = trace[dd];
    var kc = px - py + offset;
    var prevK = (kc === -dd + offset || (kc !== dd + offset && vv[kc - 1] < vv[kc + 1])) ? kc + 1 : kc - 1;
    var prevX = vv[prevK];
    var prevY = prevX - (prevK - offset);
    while (px > prevX && py > prevY) { px--; py--; steps.push({ t: 'eq', ai: al + px, bi: bl + py }); }
    if (px === prevX) { py--; steps.push({ t: 'add', ai: -1, bi: bl + py }); }
    else { px--; steps.push({ t: 'del', ai: al + px, bi: -1 }); }
    px = prevX; py = prevY;
  }
  while (px > 0 && py > 0 && eq(a[al + px - 1], b[bl + py - 1])) { px--; py--; steps.push({ t: 'eq', ai: al + px, bi: bl + py }); }
  steps.reverse();
  return steps;
}

function range(type, from, to) {
  var r = [];
  for (var i = from; i < to; i++) {
    r.push(type === 'add' ? { t: 'add', ai: -1, bi: i } : { t: 'del', ai: i, bi: -1 });
  }
  return r;
}

/**
 * Line diff convenience: returns unified-style text rows.
 * Context lines are prefixed with two spaces, deletions '-',
 * insertions '+' — identical presentation to the previous
 * naive implementation, so no caller UI changes.
 */
function linesText(textA, textB) {
  var a = textA.split('\n');
  var b = textB.split('\n');
  var ops = diff(a, b);
  var out = [];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (op.t === 'eq') out.push('  ' + a[op.ai]);
    else if (op.t === 'del') out.push('- ' + a[op.ai]);
    else out.push('+ ' + b[op.bi]);
  }
  return out.join('\n');
}

window.MyersDiff = { diff: diff, linesText: linesText };
})();
