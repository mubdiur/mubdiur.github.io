/* ============================================================
   QrDecode — dependency-free QR reader (ISO/IEC 18004 subset).
   Bounds: versions 1-6, axis-aligned captures (0/90/180/270),
   numeric / alphanumeric / byte modes. Anything else throws an
   honest error naming the limit. No network, no WASM, no worker.
   ============================================================ */
(function () {
"use strict";
var GX = 285;
var GEXP = new Array(512);
var GLOG = new Array(256);
(function initTables() {
  var x = 1, i;
  for (i = 0; i < 255; i++) { GEXP[i] = x; GLOG[x] = i; x <<= 1; if (x & 256) x ^= GX; }
  for (i = 255; i < 512; i++) GEXP[i] = GEXP[i - 255];
})();
function gmul(a, b) { return (a === 0 || b === 0) ? 0 : GEXP[GLOG[a] + GLOG[b]]; }
function rsGen(nsym) {
  var g = [1], i, j, a;
  for (i = 0; i < nsym; i++) {
    var next = new Array(g.length + 1), k;
    for (k = 0; k < next.length; k++) next[k] = 0;
    a = GEXP[i];
    for (j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], a); }
    g = next;
  }
  return g;
}
function rsEncode(data, nsym) {
  var gen = rsGen(nsym), out = data.slice(), i, j, coef;
  for (i = 0; i < nsym; i++) out.push(0);
  for (i = 0; i < data.length; i++) {
    coef = out[i];
    if (coef !== 0) { for (j = 0; j < gen.length; j++) out[i + j] ^= gmul(gen[j], coef); }
  }
  return data.concat(out.slice(data.length));
}
function syndromes(block, nsym) {
  var n = block.length, out = [], i, j, s;
  for (i = 0; i < nsym; i++) { s = 0; for (j = 0; j < n; j++) s ^= gmul(block[j], GEXP[(i * (n - 1 - j)) % 255]); out.push(s); }
  return out;
}
/* In-place RS correction via Peterson-Gorenstein-Zierler: try v errors,
   v = floor(nsym/2) down to 1, solving the syndrome system by elimination. */
function rsSolve(mat, vec) {
  var n = vec.length, a = [], r, c, k;
  for (r = 0; r < n; r++) { a.push(mat[r].slice()); a[r].push(vec[r]); }
  for (c = 0; c < n; c++) {
    var piv = -1;
    for (r = c; r < n; r++) { if (a[r][c] !== 0) { piv = r; break; } }
    if (piv < 0) return null;
    var tmp = a[c]; a[c] = a[piv]; a[piv] = tmp;
    var inv = 1, need = a[c][c];
    for (k = 0; k < 255; k++) { if (GEXP[k] === need) { inv = GEXP[(255 - k) % 255]; break; } }
    for (k = c; k <= n; k++) a[c][k] = gmul(a[c][k], inv);
    for (r = 0; r < n; r++) {
      if (r !== c && a[r][c] !== 0) {
        var f = a[r][c];
        for (k = c; k <= n; k++) a[r][k] ^= gmul(f, a[c][k]);
      }
    }
  }
  var out = [];
  for (r = 0; r < n; r++) out.push(a[r][n]);
  return out;
}
function rsCorrect(block, nsym) {
  var n = block.length, v, i, j;
  var synd = syndromes(block, nsym);
  var clean = true;
  for (i = 0; i < nsym; i++) { if (synd[i] !== 0) { clean = false; break; } }
  if (clean) return block;
  for (v = Math.floor(nsym / 2); v >= 1; v--) {
    var mat = [], vec = [], r, c;
    for (r = 0; r < v; r++) {
      var row = [];
      for (c = 0; c < v; c++) row.push(synd[r + c]);
      mat.push(row);
      vec.push(synd[r + v] ^ 0 ? synd[r + v] : 0);
    }
    for (r = 0; r < v; r++) vec[r] = synd[r + v];
    var sol = rsSolve(mat, vec);
    if (!sol) continue;
    var lam = [1].concat(sol.slice().reverse());
    var pos = [];
    for (i = 0; i < n; i++) {
      var e = (255 - ((n - 1 - i) % 255)) % 255, y = 0;
      for (j = 0; j < lam.length; j++) y ^= gmul(lam[j], GEXP[(j * e) % 255]);
      if (y === 0) pos.push(i);
    }
    if (pos.length !== v) continue;
    var omega = [];
    for (i = 0; i < nsym; i++) {
      var t = 0;
      for (j = 0; j < lam.length && j <= i; j++) t ^= gmul((i - j) < synd.length ? synd[i - j] : 0, lam[j]);
      omega.push(t);
    }
    var okAll = true;
    for (i = 0; i < pos.length && okAll; i++) {
      var pp = pos[i], ee = (255 - ((n - 1 - pp) % 255)) % 255, num = 0, den = 0;
      for (j = 0; j < omega.length; j++) num ^= gmul(omega[j], GEXP[(j * ee) % 255]);
      for (j = 1; j < lam.length; j += 2) den ^= gmul(lam[j], GEXP[(((j - 1) * ee) % 255 + 255) % 255]);
      if (den === 0) { okAll = false; break; }
      var inv2 = 1;
      for (var k = 0; k < 255; k++) { if (GEXP[k] === den) { inv2 = GEXP[(255 - k) % 255]; break; } }
      block[pp] ^= gmul(gmul(GEXP[(n - 1 - pp) % 255], num), inv2);
    }
    if (!okAll) { for (i = 0; i < pos.length; i++) block[pos[i]] ^= 0; continue; }
    var re = syndromes(block, nsym), good = true;
    for (i = 0; i < nsym; i++) { if (re[i] !== 0) { good = false; break; } }
    if (good) return block;
    for (i = 0; i < pos.length; i++) { block[pos[i]] ^= 0; }
  }
  throw new Error('QR damaged beyond repair');
}
/* ---- capacities: derived from wasm/core.rs ECC_CODEWORDS_PER_BLOCK /
   NUM_ERROR_CORRECTION_BLOCKS (ecl 0=L,1=M,2=Q,3=H). Raw modules mirror
   qr_num_raw_data_modules for v1-6. Short/long split mirrors
   qr_make_codewords de-interleave. ---- */
var ECC_LEN = { L: [0, 7, 10, 15, 20, 26, 18], M: [0, 10, 16, 26, 18, 24, 16], Q: [0, 13, 22, 18, 26, 18, 24], H: [0, 17, 28, 22, 16, 22, 28] };
var NUM_BLK = { L: [0, 1, 1, 1, 1, 1, 2], M: [0, 1, 1, 1, 2, 2, 4], Q: [0, 1, 1, 2, 2, 4, 4], H: [0, 1, 1, 2, 4, 4, 4] };
function rawCodewords(v) { var r = (16 * v + 128) * v + 64; if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; } return Math.floor(r / 8); }
function blockInfo(v, ecl) { var ec = ECC_LEN[ecl][v], nbl = NUM_BLK[ecl][v], raw = rawCodewords(v); var nShort = nbl - raw % nbl; var shortLen = Math.floor(raw / nbl) - ec; return { ec: ec, nbl: nbl, raw: raw, nShort: nShort, shortLen: shortLen, dataLen: raw - ec * nbl }; }
var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
/* BCH(15,5) format check over GF(2), generator 0x537. */
function fmtRemainder(w) {
  var g = 1335, v = w, deg = 0, t = v;
  while (t > 1) { t >>= 1; deg++; }
  while (deg >= 10) { v ^= g << (deg - 10); deg = 0; t = v; while (t > 1) { t >>= 1; deg++; } }
  return v;
}
function fmtDecode(raw) {
  var i;
  if (fmtRemainder(raw ^ 21522) === 0) return raw ^ 21522;
  for (i = 0; i < 15; i++) {
    var cand = raw ^ (1 << i);
    if (fmtRemainder(cand ^ 21522) === 0) return cand ^ 21522;
  }
  return -1;
}
/* function-module map: true = function pattern (skip when reading data). */
function functionMap(dim, version) {
  var f = [], i, j, x, y;
  for (i = 0; i < dim * dim; i++) f.push(false);
  function set(x, y) { if (x >= 0 && y >= 0 && x < dim && y < dim) f[y * dim + x] = true; }
  function finder(cx, cy) {
    for (var yy = -1; yy <= 7; yy++) for (var xx = -1; xx <= 7; xx++) set(cx + xx, cy + yy);
  }
  finder(0, 0); finder(dim - 7, 0); finder(0, dim - 7);
  for (i = 8; i < dim - 8; i++) { set(6, i); set(i, 6); }
  var ap = ALIGN[version] || [];
  for (i = 0; i < ap.length; i++) for (j = 0; j < ap.length; j++) {
    var ax = ap[j], ay = ap[i];
    if ((ax < 9 && ay < 9) || (ax > dim - 10 && ay < 9) || (ax < 9 && ay > dim - 10)) continue;
    for (y = -2; y <= 2; y++) for (x = -2; x <= 2; x++) set(ax + x, ay + y);
  }
  for (i = 0; i < 9; i++) { if (i !== 6) { set(8, i); set(i, 8); } }
  for (i = 0; i < 8; i++) { set(dim - 1 - i, 8); set(8, dim - 1 - i); }
  set(dim - 8, 8);
  if (version >= 7) throw new Error("QR version " + version + " above v6 is not supported");
  return f;
}
function unmask(bit, x, y, mask) {
  switch (mask) {
    case 0: return bit ^ (((x + y) % 2 === 0) ? 1 : 0);
    case 1: return bit ^ ((y % 2 === 0) ? 1 : 0);
    case 2: return bit ^ ((x % 3 === 0) ? 1 : 0);
    case 3: return bit ^ (((x + y) % 3 === 0) ? 1 : 0);
    case 4: return bit ^ (((((x / 3) | 0) + ((y >> 1))) % 2 === 0) ? 1 : 0);
    case 5: return bit ^ (((((x * y) % 2) + ((x * y) % 3)) === 0) ? 1 : 0);
    case 6: return bit ^ ((((x * y) % 2 + (x * y) % 3) % 2 === 0) ? 1 : 0);
    default: return bit ^ (((((x + y) % 2) + ((x * y) % 3)) % 2 === 0) ? 1 : 0);
  }
}
/* read format bits (spec order is LSB-first: bit k sits at order[k]). */
function readFormatBits(grid, dim, atTop) {
  var order, i, k, v = 0;
  if (atTop) {
    order = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  } else {
    order = [];
    for (i = 0; i < 8; i++) order.push([dim - 1 - i, 8]);
    for (i = 0; i < 7; i++) order.push([8, dim - 7 + i]);
  }
  for (k = 0; k < order.length; k++) { if (grid[order[k][1] * dim + order[k][0]]) v |= (1 << k); }
  return v;
}
function readCodewords(grid, dim, version, mask) {
  var f = functionMap(dim, version), bytes = [], cur = 0, nbits = 0, x, y;
  var col = dim - 1, upward = true;
  function push(b) { cur = (cur << 1) | b; if (++nbits === 8) { bytes.push(cur); cur = 0; nbits = 0; } }
  while (col > 0) {
    if (col === 6) col--;
    for (var r = 0; r < dim; r++) {
      y = upward ? dim - 1 - r : r;
      for (var c = 0; c < 2; c++) {
        x = col - c;
        if (!f[y * dim + x]) push(unmask(grid[y * dim + x] ? 1 : 0, x, y, mask));
      }
    }
    col -= 2; upward = !upward;
  }
  return bytes;
}
var ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function parseData(bytes) {
  var bits = "", i;
  for (i = 0; i < bytes.length; i++) bits += ("0000000" + bytes[i].toString(2)).slice(-8);
  var pos = 0, out = "";
  function take(n) { var s = bits.substr(pos, n); pos += n; return s; }
  for (;;) {
    if (pos + 4 > bits.length) break;
    var mode = take(4);
    if (mode === "0000") break;
    if (mode === "0111") throw new Error("QR ECI mode is not supported");
    if (mode === "1000") throw new Error("QR kanji mode is not supported");
    if (mode !== "0001" && mode !== "0010" && mode !== "0100") throw new Error("QR mode " + mode + " is not supported");
    var ccb = mode === "0001" ? 10 : mode === "0010" ? 9 : 8;
    if (pos + ccb > bits.length) throw new Error("QR truncated in length field");
    var count = parseInt(take(ccb), 2), k, v;
    if (mode === "0001") {
      while (count >= 3) { if (pos + 10 > bits.length) throw new Error("QR truncated in numeric run"); v = parseInt(take(10), 2); out += ("00" + v).slice(-3); count -= 3; }
      if (count === 2) { if (pos + 7 > bits.length) throw new Error("QR truncated in numeric tail"); out += ("0" + parseInt(take(7), 2)).slice(-2); }
      else if (count === 1) { if (pos + 4 > bits.length) throw new Error("QR truncated in numeric tail"); out += parseInt(take(4), 2).toString(); }
    } else if (mode === "0010") {
      while (count >= 2) { if (pos + 11 > bits.length) throw new Error("QR truncated in alphanumeric run"); v = parseInt(take(11), 2); out += ALPHA[Math.floor(v / 45)] + ALPHA[v % 45]; count -= 2; }
      if (count === 1) { if (pos + 6 > bits.length) throw new Error("QR truncated in alphanumeric tail"); out += ALPHA[parseInt(take(6), 2)]; }
    } else {
      var raw = [];
      for (k = 0; k < count; k++) { if (pos + 8 > bits.length) throw new Error("QR truncated in byte run"); raw.push(parseInt(take(8), 2)); }
      try { out += decodeURIComponent(raw.map(function (b) { return "%" + ("0" + b.toString(16)).slice(-2); }).join("")); }
      catch {
        var s2 = "";
        for (k = 0; k < raw.length; k++) s2 += String.fromCharCode(raw[k]);
        out += s2;
      }
    }
  }
  return out;
}
function rot90(g, dim) {
  var out = new Array(dim * dim), x, y;
  for (y = 0; y < dim; y++) for (x = 0; x < dim; x++) out[y * dim + x] = g[(dim - 1 - x) * dim + y];
  return out;
}
function decodeMatrix(bits, dim) {
  var v = (dim - 17) / 4;
  if (dim < 21 || v !== Math.floor(v) || v < 1 || v > 6) throw new Error("QR size " + dim + " is not a supported version (v1-v6)");
  var grid = bits.slice(), r, fmt, data, ecl, mask, bytes, spec, nbl, total, k, blocks, dc, b;
  for (r = 0; r < 4; r++) {
    if (r > 0) grid = rot90(grid, dim);
    fmt = fmtDecode(readFormatBits(grid, dim, true));
    if (fmt < 0) fmt = fmtDecode(readFormatBits(grid, dim, false));
    if (fmt < 0) continue;
    data = fmt >> 10;
    ecl = ["M", "L", "H", "Q"][(data >> 3) & 3];
    mask = data & 7;
    try {
      bytes = readCodewords(grid, dim, v, mask);
      spec = blockInfo(v, ecl);
      nbl = spec.nbl; total = spec.raw;
      if (bytes.length < total) continue;
      blocks = [];
      for (b = 0; b < nbl; b++) blocks.push([]);
      for (b = 0; b < nbl; b++) { var dl = spec.shortLen + (b < spec.nShort ? 0 : 1); var kk = b; for (k = 0; k < dl; k++) { if (k === spec.shortLen) kk -= spec.nShort; blocks[b].push(bytes[kk]); kk += nbl; } }
      for (b = 0; b < nbl; b++) for (k = 0; k < spec.ec; k++) blocks[b].push(bytes[spec.dataLen + b + k * nbl]);
      dc = [];
      for (b = 0; b < nbl; b++) { rsCorrect(blocks[b], spec.ec); var lim = spec.shortLen + (b < spec.nShort ? 0 : 1); for (k = 0; k < lim; k++) dc.push(blocks[b][k]); }
      return { text: parseData(dc), version: v, ecl: ecl, mask: mask };
    } catch (e) { if (r === 3) throw e; }
  }
  throw new Error("No QR code found — try a sharper straight-on crop");
}
function toGray(px) {
  var w = px.width | 0, h = px.height | 0, n = w * h, d = px.data, g = new Float32Array(n), i, o;
  if (!w || !h || !d || d.length < n * 4) throw new Error("Empty image — drop a PNG, JPEG or WebP screenshot of the QR code.");
  for (i = 0; i < n; i++) { o = i * 4; g[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]; }
  return { g: g, w: w, h: h };
}
function binarize(img) {
  var w = img.w, h = img.h, g = img.g, bs = Math.max(8, Math.min(64, Math.floor(Math.min(w, h) / 24) || 8));
  var nx = Math.ceil(w / bs), ny = Math.ceil(h / bs), means = new Float32Array(nx * ny), out = new Uint8Array(w * h);
  var x, y, bx, by, s, c;
  for (by = 0; by < ny; by++) for (bx = 0; bx < nx; bx++) {
    s = 0; c = 0;
    for (y = by * bs; y < Math.min(h, (by + 1) * bs); y++) for (x = bx * bs; x < Math.min(w, (bx + 1) * bs); x++) { s += g[y * w + x]; c++; }
    means[by * nx + bx] = c ? s / c : 128;
  }
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    var m = means[Math.min(ny - 1, (y / bs) | 0) * nx + Math.min(nx - 1, (x / bs) | 0)];
    var v = g[y * w + x];
    if (m < 30) out[y * w + x] = 1;
    else if (m > 225) out[y * w + x] = 0;
    else out[y * w + x] = v < m - 6 ? 1 : 0;
  }
  return out;
}
function scanRow(bin, w, y, cands) {
  var x = 0, runs = [], colors = [], cur = bin[y * w], len = 0;
  function consider() {
    if (runs.length < 5) return;
    var n = runs.length;
    var r = runs.slice(n - 5), tot = r[0] + r[1] + r[2] + r[3] + r[4], m = tot / 7;
    if (m < 2) return;
    var exp = [1, 1, 3, 1, 1], ok = true, i;
    for (i = 0; i < 5; i++) { if (Math.abs(r[i] - exp[i] * m) > exp[i] * m * 0.6) { ok = false; break; } }
    if (!ok) return;
    var x1 = x - tot;
    cands.push({ x: x1 + r[0] + r[1] + r[2] / 2, y: y, size: tot });
  }
  for (x = 0; x < w; x++) {
    var b = bin[y * w + x];
    if (b === cur) { len++; continue; }
    runs.push(len); colors.push(cur);
    if (runs.length > 5) { runs.shift(); colors.shift(); }
    if (colors.length === 5 && colors[0] === 1 && colors[1] === 0 && colors[2] === 1 && colors[3] === 0 && colors[4] === 1) consider();
    cur = b; len = 1;
  }
}
function verifyColumn(bin, w, h, cx, cy, size) {
  var m = size / 7, runs = [], cur = -1, len = 0, y, y0 = Math.max(0, Math.floor(cy - size)), y1 = Math.min(h - 1, Math.ceil(cy + size));
  for (y = y0; y <= y1; y++) {
    var b = bin[y * w + Math.max(0, Math.min(w - 1, Math.round(cx)))];
    if (cur < 0) { cur = b; len = 1; continue; }
    if (b === cur) { len++; continue; }
    runs.push({ c: cur, l: len }); cur = b; len = 1;
  }
  runs.push({ c: cur, l: len });
  var i;
  for (i = 0; i + 4 < runs.length; i++) {
    var r = runs.slice(i, i + 5);
    if (r[0].c !== 1 || r[1].c !== 0 || r[2].c !== 1 || r[3].c !== 0 || r[4].c !== 1) continue;
    var tot = r[0].l + r[1].l + r[2].l + r[3].l + r[4].l, mm = tot / 7;
    if (Math.abs(mm - m) > m * 0.5) continue;
    var exp = [1, 1, 3, 1, 1], ok = true, k;
    for (k = 0; k < 5; k++) { if (Math.abs(r[k].l - exp[k] * mm) > exp[k] * mm * 0.7) { ok = false; break; } }
    if (ok) { var start = y0; for (var t = 0; t < i; t++) start += runs[t].l; return start + r[0].l + r[1].l + r[2].l / 2; }
  }
  return -1;
}
function findFinders(bin, w, h) {
  var cands = [], y, i, verified = [];
  var step = Math.max(1, Math.floor(h / 500));
  for (y = 0; y < h; y += step) scanRow(bin, w, y, cands);
  for (i = 0; i < cands.length; i++) {
    var c = cands[i];
    var vy = verifyColumn(bin, w, h, c.x, c.y, c.size);
    if (vy >= 0) verified.push({ x: c.x, y: vy, size: c.size });
  }
  var clusters = [], j;
  for (i = 0; i < verified.length; i++) {
    var v = verified[i], hit = false;
    for (j = 0; j < clusters.length; j++) {
      var cl = clusters[j];
      var dx = v.x - cl.x, dy = v.y - cl.y;
      if (dx * dx + dy * dy < Math.pow((v.size + cl.size) / 2 * 1.2, 2)) {
        cl.x = (cl.x * cl.n + v.x) / (cl.n + 1); cl.y = (cl.y * cl.n + v.y) / (cl.n + 1);
        cl.size = (cl.size * cl.n + v.size) / (cl.n + 1); cl.n++;
        hit = true; break;
      }
    }
    if (!hit) clusters.push({ x: v.x, y: v.y, size: v.size, n: 1 });
  }
  clusters.sort(function (a, b) { return b.n - a.n; });
  clusters = clusters.filter(function (c) { return c.n >= 2; });
  if (clusters.length < 3) throw new Error("No QR code found — try a sharper straight-on crop");
  return clusters.slice(0, 3);
}
function orderFinders(f) {
  function d2(a, b) { return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); }
  var d01 = d2(f[0], f[1]), d12 = d2(f[1], f[2]), d02 = d2(f[0], f[2]), tl, A, B;
  if (d01 >= d12 && d01 >= d02) { tl = f[2]; A = f[0]; B = f[1]; }
  else if (d12 >= d01 && d12 >= d02) { tl = f[0]; A = f[1]; B = f[2]; }
  else { tl = f[1]; A = f[0]; B = f[2]; }
  return { tl: tl, A: A, B: B };
}
function decodeBox(bin, w, h) {
  var minX = w, minY = h, maxX = -1, maxY = -1, x, y;
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (bin[y * w + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) throw new Error("No QR code found");
  var dims = [21, 25, 29, 33, 37, 41], di, dim, mw, mh, avg, gx, gy, xx, yy, votes, cnt, sx, sy;
  for (di = 0; di < dims.length; di++) {
    dim = dims[di];
    mw = (maxX - minX + 1) / dim; mh = (maxY - minY + 1) / dim; avg = (mw + mh) / 2;
    if (avg < 2) continue;
    if (Math.abs(mw - mh) / avg > 0.25) continue;
    var grid = new Array(dim * dim);
    for (gy = 0; gy < dim; gy++) for (gx = 0; gx < dim; gx++) {
      sx = Math.floor(minX + (gx + 0.5) * mw); sy = Math.floor(minY + (gy + 0.5) * mh);
      votes = 0; cnt = 0;
      for (yy = -1; yy <= 1; yy++) for (xx = -1; xx <= 1; xx++) { var qx = sx + xx, qy = sy + yy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue; votes += bin[qy * w + qx]; cnt++; }
      grid[gy * dim + gx] = votes * 2 >= cnt ? 1 : 0;
    }
    try { return decodeMatrix(grid, dim); } catch {}
  }
  throw new Error("No QR code found");
}
function decode(px) {
  var img = toGray(px), bin = binarize(img), w = img.w, h = img.h;
  if (Math.min(w, h) < 29) throw new Error("Image too small — use a larger QR screenshot.");
  try {
  var f = findFinders(bin, w, h), o = orderFinders(f);
  var m = (f[0].size + f[1].size + f[2].size) / 21;
  if (m < 2) throw new Error("QR modules too small — use a larger screenshot.");
  function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  var dA = Math.round(dist(o.tl, o.A) / m) + 7, dB = Math.round(dist(o.tl, o.B) / m) + 7;
  if (dA !== dB || (dA - 17) % 4 !== 0 || dA < 21 || dA > 41) {
    throw new Error("Only straight-on captures of QR versions 1-6 are supported — avoid tilt and perspective.");
  }
  var dim = dA, ux = (o.A.x - o.tl.x) / dist(o.tl, o.A), uy = (o.A.y - o.tl.y) / dist(o.tl, o.A);
  var vx = (o.B.x - o.tl.x) / dist(o.tl, o.B), vy = (o.B.y - o.tl.y) / dist(o.tl, o.B);
  var grid = new Array(dim * dim), i, j;
  for (j = 0; j < dim; j++) for (i = 0; i < dim; i++) {
    var px2 = o.tl.x + (ux * (i - 3) + vx * (j - 3)) * m, py2 = o.tl.y + (uy * (i - 3) + vy * (j - 3)) * m;
    var votes = 0, cnt = 0, yy, xx;
    for (yy = -1; yy <= 1; yy++) for (xx = -1; xx <= 1; xx++) {
      var sx = Math.round(px2) + xx, sy = Math.round(py2) + yy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      votes += bin[sy * w + sx]; cnt++;
    }
    grid[j * dim + i] = votes * 2 >= cnt ? 1 : 0;
  }
  try { return decodeMatrix(grid, dim); } catch { return decodeBox(bin, w, h); }
  } catch { return decodeBox(bin, w, h); }
}
window.QrDecode = { decode: decode, decodeMatrix: decodeMatrix, rsEncode: rsEncode, rsCorrect: rsCorrect, fmtDecode: fmtDecode };
})();
