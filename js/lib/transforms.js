/* ═══════════════════════════════════════════════════════════
   Shared transforms — ported from src/lib/transforms/*.
   Crypto/hash functions delegate to the WebAssembly core.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var T = {};

/**
 * RFC 4180 CSV parser. Handles quoted fields containing commas,
 * CRLF/newlines and escaped quotes ("") ; strips a UTF-8 BOM;
 * never trims cell content (whitespace is data).
 * Returns array of rows (arrays of strings).
 */
T.parseCSV = function (s, delim) {
  var d = delim || ',';
  var text = String(s === undefined || s === null ? '' : s);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var rows = [];
  var row = [];
  var cur = '';
  var i = 0, n = text.length;
  var inQuotes = false;
  var sawAny = false;
  while (i < n) {
    var ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"' && cur === '') { inQuotes = true; sawAny = true; i++; continue; }
    if (ch === d) { row.push(cur); cur = ''; sawAny = true; i++; continue; }
    if (ch === '\r') {
      if (text.charAt(i + 1) === '\n') i++;
      row.push(cur); rows.push(row);
      row = []; cur = ''; sawAny = false; i++; continue;
    }
    if (ch === '\n') {
      row.push(cur); rows.push(row);
      row = []; cur = ''; sawAny = false; i++; continue;
    }
    cur += ch; sawAny = true; i++;
  }
  if (cur !== '' || row.length || sawAny) { row.push(cur); rows.push(row); }
  return rows;
};

/* CSV transpose: rows become columns. Ragged rows pad short,
   delimiter auto-detects (or explicit opt), output re-quoted RFC 4180. */
/* JSONL to JSON: one JSON value per line becomes a JSON array.
   Blank lines skip; failures carry the offending line number. */
T.jsonlToJSON = function (s) {
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [], bad = -1, why = '';
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) { bad = n + 1; why = v.error || 'Invalid JSON'; break; }
    docs.push(v.data);
  }
  if (bad >= 0) throw new Error('Line ' + bad + ': ' + why);
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON value per line');
  return JSON.stringify(docs, null, 2);
};

/* Canonical JSON form: objects emit sorted keys, so field order never
   splits a group or a sort tie. Shared by the JSONL group/sort/pivot cores. */
T.canonJSON = function (x) {
  if (x !== null && typeof x === 'object') {
    if (Array.isArray(x)) return '[' + x.map(T.canonJSON).join(',') + ']';
    return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + T.canonJSON(x[k]); }).join(',') + '}';
  }
  return JSON.stringify(x);
};

/* JSONL pivot: group one-JSON-per-line docs by a key field (blank key groups
   the whole doc) and aggregate a numeric field per group - count, sum, avg,
   min or max. Groups keep first-seen order; key/value fields on non-object
   docs throw with the line number. */
T.jsonlPivot = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [];
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) throw new Error('Line ' + (n + 1) + ': ' + (v.error || 'Invalid JSON'));
    docs.push({ d: v.data, ln: n + 1 });
  }
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON value per line');
  var key = String(o.key === undefined || o.key === null ? '' : o.key).trim();
  var val = String(o.value === undefined || o.value === null ? '' : o.value).trim();
  var agg = String(o.agg || 'count');
  if (['count', 'sum', 'avg', 'min', 'max'].indexOf(agg) < 0) agg = 'count';
  if (agg !== 'count' && !val) throw new Error('Pick the value field to aggregate \u2014 sum, avg, min and max need a numeric field');
  function trimNum(x) {
    if (!isFinite(x)) return '';
    return String(Math.round(x * 1e10) / 1e10);
  }
  var order = [], groups = Object.create(null);
  docs.forEach(function (e) {
    var d = e.d, f, disp;
    if (agg !== 'count' && (d === null || typeof d !== 'object' || Array.isArray(d))) throw new Error('Line ' + e.ln + ': value fields need JSON objects \u2014 got ' + T.canonJSON(d).slice(0, 40));
    if (!key) { f = d; disp = T.canonJSON(d); }
    else {
      if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error('Line ' + e.ln + ': key fields need JSON objects \u2014 got ' + T.canonJSON(d).slice(0, 40));
      f = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : null;
      disp = (f !== null && typeof f === 'object') ? T.canonJSON(f) : String(f);
    }
    var gk = T.canonJSON(f);
    if (!Object.prototype.hasOwnProperty.call(groups, gk)) { groups[gk] = { disp: disp, n: 0, nums: [] }; order.push(gk); }
    var g = groups[gk];
    g.n++;
    if (agg !== 'count' && Object.prototype.hasOwnProperty.call(d, val)) {
      var x = Number(d[val]);
      if (isFinite(x)) g.nums.push(x);
    }
  });
  function aggVals(g) {
    if (agg === 'count') return String(g.n);
    if (!g.nums.length) return '';
    if (agg === 'min') return trimNum(Math.min.apply(null, g.nums));
    if (agg === 'max') return trimNum(Math.max.apply(null, g.nums));
    var sum = g.nums.reduce(function (a, b) { return a + b; }, 0);
    return trimNum(agg === 'avg' ? sum / g.nums.length : sum);
  }
  function cell(q) {
    return (q.indexOf(',') >= 0 || q.indexOf('"') >= 0 || q.indexOf('\n') >= 0 || q.indexOf('\r') >= 0) ? '"' + q.replace(/"/g, '""') + '"' : q;
  }
  return [agg + ',key'].concat(order.map(function (gk) { return aggVals(groups[gk]) + ',' + cell(groups[gk].disp); })).join('\n');
};

/* JSONL duplicate finder: group one-JSON-per-line docs by key fields
   (or the whole doc when key is empty), keep repeats, sort by count desc.
   Docs canonicalize with sorted keys so field order never splits a group. */
T.jsonlDupes = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [];
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) throw new Error('Line ' + (n + 1) + ': ' + (v.error || 'Invalid JSON'));
    docs.push(v.data);
  }
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON value per line');
  var fields = String(o.key === undefined || o.key === null ? '' : o.key).split(',').map(function (k) { return k.trim(); }).filter(Boolean);
  var order = [], groups = Object.create(null);
  docs.forEach(function (d) {
    var sub = d;
    if (fields.length) {
      if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error('Key fields need JSON objects \u2014 got ' + T.canonJSON(d).slice(0, 40));
      sub = {};
      fields.forEach(function (k) { sub[k] = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; });
    }
    var id = T.canonJSON(sub);
    if (!Object.prototype.hasOwnProperty.call(groups, id)) { groups[id] = { key: id, n: 0 }; order.push(id); }
    groups[id].n++;
  });
  var dupes = order.map(function (id) { return groups[id]; }).filter(function (g) { return g.n > 1; });
  if (!dupes.length) return 'No duplicates found';
  dupes.sort(function (a, b) { return b.n - a.n || (a.key < b.key ? -1 : 1); });
  return ['count,key'].concat(dupes.map(function (g) { return g.n + ',' + JSON.stringify(g.key); })).join('\n');
};

T.csvTranspose = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(s, d);
  var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  function cell(v) {
    return (v.indexOf(d) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var grid = [];
  for (var c = 0; c < cols; c++) {
    var line = [];
    for (var r = 0; r < rows.length; r++) line.push(cell(c < rows[r].length ? rows[r][c] : ''));
    grid.push(line.join(d));
  }
  return grid.join('\n');
};

T.csvToJSON = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  if (d === null) {
    var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
    var samp = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; }).slice(0, 10);
    d = T.detectDelimChar(samp) || ',';
  }
  var rows = T.parseCSV(s, d);
  if (!rows.length) throw new Error('CSV is empty');
  var seen = {};
  function nameCol(name) {
    if (seen[name]) { seen[name]++; return name + '_' + seen[name]; }
    seen[name] = 1;
    return name;
  }
  var headers = rows[0].map(function (h) { return nameCol(h === '' ? '(unnamed)' : h); });
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, headers.length);
  for (var ci = headers.length; ci < width; ci++) headers.push(nameCol('(extra_' + (ci + 1) + ')'));
  var json = rows.slice(1).map(function (r) {
    var obj = {};
    headers.forEach(function (h, idx) { obj[h] = idx < r.length ? r[idx] : ''; });
    return obj;
  });
  return JSON.stringify(json, null, 2);
};

/** Shared YAML document parser: block maps and seqs, literals, folds,
 * quoted scalars; duplicate-key and indent errors carry line numbers.
 * Returns plain JS values; yamlToJSON and yamlFormat both build on it.
 */
/** Cut a YAML " #comment" tail off one physical line. The hash needs a
 * preceding blank at flow depth zero and must sit outside quotes, so
 * spaceless hashes (abc#123), URLsina#frag and quoted "#" survive. A
 * quote only opens after a blank or opener character, so plain-text
 * apostrophes (it's) never swallow the rest of the line. */
function yamlStripComment(line) {
  var inS = false, inD = false, depth = 0;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (inS) { if (ch === "'") inS = false; continue; }
    if (inD) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inD = false;
      continue;
    }
    if ((ch === "'" || ch === '"') && (i === 0 || ' \t[{,:='.indexOf(line.charAt(i - 1)) >= 0)) {
      if (ch === "'") inS = true; else inD = true;
      continue;
    }
    if (ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ']' || ch === '}') { depth = Math.max(0, depth - 1); continue; }
    if (ch === '#' && depth === 0 && (i === 0 || line.charAt(i - 1) === ' ' || line.charAt(i - 1) === '\t')) return line.slice(0, i);
  }
  return line;
}

function yamlParseDocument(text) {
  var lines = text.split('\n').filter(function (l) { return !l.trim().startsWith('#'); });
  if (!lines.length) return {};
  var items = lines.map(function (l) { var t = yamlStripComment(l).trim(); return { indent: t ? l.search(/\S/) : l.length, content: t, raw: l, blank: !t }; });
  while (items.length && items[0].blank) items.shift();
  if (!items.length) return '{}';
  function yamlBad(n, msg) { throw new Error("Line " + (n + 1) + ": " + msg); }
  function yamlForbidden(k) { return k === "__proto__" || k === "constructor" || k === "prototype"; }
  function yamlSplitPair(text) {
    var inS = false, inD = false;
    for (var p = 0; p < text.length; p++) {
      var ch = text.charAt(p);
      if (inS) { if (ch === "\u0027") inS = false; continue; }
      if (inD) { if (ch === "\\") { p++; continue; } if (ch === "\"") inD = false; continue; }
      if (ch === "\u0027") inS = true;
      else if (ch === "\"") inD = true;
      else if (ch === ":") {
        var nx = text.charAt(p + 1);
        if (nx === "" || nx === " " || nx === "\t") return [text.slice(0, p), text.slice(p + 1)];
      }
    }
    return null;
  }
  function yamlKey(rawK, n) {
    var t = rawK.trim();
    var u = yamlUnquote(t);
    var k = u.quoted ? u.text : t;
    if (!k) yamlBad(n, "Empty key");
    return k;
  }
  function yamlPut(obj, k, v, n) {
    if (yamlForbidden(k)) return;
    if (Object.prototype.hasOwnProperty.call(obj, k)) yamlBad(n, "Duplicate key \"" + k + "\"");
    obj[k] = v;
  }
  /** Scalar leaf shared by every YAML consumer (yamlToJSON, yamlFormat,
   * and the bridges): quoted text stays a string, flow empties revive,
   * flow collections parse to real arrays/maps, then bool/null/number. */
  function yamlScalar(v, n) {
    var u = yamlUnquote(v);
    if (u.quoted) return u.text;
    if (v === '{}') return {};
    if (v === '[]') return [];
    if (v.charAt(0) === '[') return yamlFlowSeq(v, n);
    if (v.charAt(0) === '{') return yamlFlowMap(v, n);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    var num = Number(v);
    if (!isNaN(num) && v !== '') return num;
    return v;
  }
  /** Split one line of flow content on top-level commas. Bracket depth
   * plus quote tracking keep nested [maps, {"a,b": [1]}] intact. */
  function yamlFlowParts(inner, n, what) {
    var parts = [], depth = 0, cur = '', inS = false, inD = false;
    for (var i = 0; i < inner.length; i++) {
      var ch = inner.charAt(i);
      if (inS) { cur += ch; if (ch === "'") inS = false; continue; }
      if (inD) {
        if (ch === '\\') { cur += ch + inner.charAt(i + 1); i++; continue; }
        cur += ch;
        if (ch === '"') inD = false;
        continue;
      }
      if (ch === "'" && (i === 0 || ' \t[{,:='.indexOf(inner.charAt(i - 1)) >= 0)) { inS = true; cur += ch; continue; }
      if (ch === '"' && (i === 0 || ' \t[{,:='.indexOf(inner.charAt(i - 1)) >= 0)) { inD = true; cur += ch; continue; }
      if (ch === '[' || ch === '{') { depth++; cur += ch; continue; }
      if (ch === ']' || ch === '}') {
        if (depth === 0) yamlBad(n, 'Stray "' + ch + '" in flow ' + what);
        depth--; cur += ch; continue;
      }
      if (ch === '#' && depth === 0 && (i === 0 || inner.charAt(i - 1) === ' ' || inner.charAt(i - 1) === '\t')) break;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (inS || inD) yamlBad(n, 'Unterminated quote in flow ' + what);
    parts.push(cur);
    return parts;
  }
  /** [1, "a,b", [2]] — one trailing comma tolerated, other empties
   * refused; items recurse so nesting and quoting stay consistent. */
  function yamlFlowSeq(v, n) {
    if (v.charAt(v.length - 1) !== ']') yamlBad(n, 'Unterminated flow sequence');
    var inner = v.slice(1, -1).trim();
    if (!inner) return [];
    var parts = yamlFlowParts(inner, n, 'sequence');
    if (parts.length > 1 && parts[parts.length - 1].trim() === '') parts.pop();
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (!t) yamlBad(n, 'Empty value in flow sequence');
      out.push(yamlScalar(t, n));
    }
    return out;
  }
  /** {a: 1, b: [2]} — same rules as sequences; duplicate and
   * forbidden keys go through the shared yamlPut guard. */
  function yamlFlowMap(v, n) {
    if (v.charAt(v.length - 1) !== '}') yamlBad(n, 'Unterminated flow mapping');
    var inner = v.slice(1, -1).trim();
    var obj = Object.create(null);
    if (!inner) return obj;
    var parts = yamlFlowParts(inner, n, 'mapping');
    if (parts.length > 1 && parts[parts.length - 1].trim() === '') parts.pop();
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (!t) yamlBad(n, 'Empty entry in flow mapping');
      var kv = yamlSplitPair(t);
      if (!kv || !kv[0].trim()) yamlBad(n, 'Expected "key: value" in flow mapping');
      yamlPut(obj, yamlKey(kv[0], n), yamlScalar(kv[1].trim(), n), n);
    }
    return obj;
  }
  function yamlIsBlock(v) { return v === '|' || v === '|-' || v === '|+' || v === '>' || v === '>-' || v === '>+'; }
  function yamlChomp(v) { return (v === '|+' || v === '>+') ? 'keep' : ((v === '|-' || v === '>-' ) ? 'strip' : 'clip'); }
  function yamlFold(buf, chomp) {
    var paras = [], gaps = [], cur = [], gap = -1, lead = 0;
    for (var i = 0; i < buf.length; i++) {
      if (buf[i] === '') {
        if (cur.length) { paras.push(cur.join(' ')); cur = []; gap = 1; }
        else if (gap >= 0) gap++;
        else lead++;
        continue;
      }
      if (gap > 0) { gaps.push(gap); gap = 0; }
      else gap = 0;
      cur.push(buf[i]);
    }
    if (cur.length) paras.push(cur.join(' '));
    var out = '';
    if (chomp === 'keep') for (var l = 0; l < lead; l++) out += '\n';
    for (var j = 0; j < paras.length; j++) {
      if (j > 0) { var g = gaps[j - 1] || 1; for (var k = 0; k <= g; k++) out += '\n'; }
      out += paras[j];
    }
    if (chomp === 'keep' && gap > 0) for (var t = 0; t < gap; t++) out += '\n';
    else if (chomp === 'clip' && paras.length) out += '\n';
    return out;
  }
  function yamlLiteral(pos, parentIndent, chomp, folded) {
    if (!chomp) chomp = 'strip';
    if (pos >= items.length || items[pos].indent <= parentIndent) return { text: '', next: pos };
    var ci = items[pos].indent;
    var buf = [];
    var q = pos;
    while (q < items.length && (items[q].blank || items[q].indent >= ci)) { buf.push(items[q].blank ? '' : items[q].raw.slice(ci)); q++; }
    while (buf.length && buf[buf.length - 1] === '' && chomp !== 'keep') buf.pop();
    if (folded) return { text: yamlFold(buf, chomp), next: q };
    var text = buf.join('\n');
    if (chomp === 'clip') text += '\n';
    return { text: text, next: q };
  }
  function yamlBlock(pos, parentIndent) {
    if (pos >= items.length) return { value: {}, next: pos };
    var fc = items[pos].content;
    if (fc === "-" || fc.startsWith("- ")) return yamlSeq(pos, parentIndent);
    return yamlMap(pos, parentIndent);
  }
  function yamlScalarPair(v, pos, ind, obj, k) {
    if (yamlIsBlock(v)) {
      var lit = yamlLiteral(pos + 1, ind, yamlChomp(v), v.charAt(0) === '>');
      yamlPut(obj, k, lit.text, pos);
      return lit.next;
    }
    if (v === "") {
      var nx = pos + 1;
      if (nx < items.length && items[nx].indent > ind) {
        var ch = yamlBlock(nx, ind);
        yamlPut(obj, k, ch.value, pos);
        return ch.next;
      }
      yamlPut(obj, k, null, pos);
      return pos + 1;
    }
    yamlPut(obj, k, yamlScalar(v, pos), pos);
    return pos + 1;
  }
  function yamlMap(pos, parentIndent) {
    var obj = Object.create(null);
    var p = pos;
    var base = items[p].indent;
    while (p < items.length) {
      var it = items[p];
      if (it.blank) { p++; continue; }
      if (it.indent < base) break;
      if (it.indent > base) yamlBad(p, "Unexpected indent");
      if (it.content === "-" || it.content.startsWith("- ")) break;
      if (it.content.charAt(0) === '{') yamlBad(p, 'Flow mapping cannot start a block line \u2014 quote it or dedent');
      var pr = yamlSplitPair(it.content);
      if (!pr) yamlBad(p, "Expected \"key: value\"");
      var k = yamlKey(pr[0], p);
      p = yamlScalarPair(pr[1].trim(), p, it.indent, obj, k);
    }
    return { value: obj, next: p };
  }
  function yamlNestedSeq(firstRest, dashIndent, p) {
    var innerBase = dashIndent + 2;
    if (firstRest === '') {
      if (p + 1 < items.length && items[p + 1].indent > dashIndent) {
        var ch = yamlBlock(p + 1, dashIndent);
        return { value: [ch.value], next: ch.next };
      }
      return { value: [null], next: p + 1 };
    }
    var saved = items[p];
    items[p] = { indent: innerBase, content: '- ' + firstRest, raw: '- ' + firstRest, blank: false };
    var r = yamlSeq(p, dashIndent);
    items[p] = saved;
    return { value: r.value, next: r.next };
  }
  function yamlSeq(pos, parentIndent) {
    var arr = [];
    var p = pos;
    var base = items[p].indent;
    while (p < items.length) {
      var it = items[p];
      if (it.blank) { p++; continue; }
      if (it.indent < base) break;
      if (it.indent > base) yamlBad(p, "Unexpected indent");
      if (!(it.content === "-" || it.content.startsWith("- "))) break;
      var rest = it.content === "-" ? "" : it.content.slice(2).trim();
      if (rest === "") {
        var nx = p + 1;
        if (nx < items.length && items[nx].indent > it.indent) {
          var ch = yamlBlock(nx, it.indent);
          arr.push(ch.value);
          p = ch.next;
        } else { arr.push(null); p++; }
      } else if (rest === '-' || rest.startsWith('- ')) {
        var sub0 = yamlNestedSeq(rest === '-' ? '' : rest.slice(2).trim(), it.indent, p);
        arr.push(sub0.value);
        p = sub0.next;
      } else if (rest.charAt(0) === '{' || rest.charAt(0) === '[') {
        arr.push(yamlScalar(rest, p));
        p++;
      } else {
        var pr = yamlSplitPair(rest);
        if (pr && pr[0].trim() !== "") {
          var m = Object.create(null);
          var k0 = yamlKey(pr[0], p);
          var v0 = pr[1].trim();
          var q;
          if (yamlIsBlock(v0)) {
            var lit = yamlLiteral(p + 1, it.indent, yamlChomp(v0), v0.charAt(0) === '>');
            yamlPut(m, k0, lit.text, p);
            q = lit.next;
          } else if (v0 === "") {
            var nx2 = p + 1;
            if (nx2 < items.length && items[nx2].indent > it.indent) {
              var ch2 = yamlBlock(nx2, it.indent);
              yamlPut(m, k0, ch2.value, p);
              q = ch2.next;
            } else { yamlPut(m, k0, null, p); q = p + 1; }
          } else { yamlPut(m, k0, yamlScalar(v0, p), p); q = p + 1; }
          while (q < items.length && items[q].indent > base && !(items[q].content === "-" || items[q].content.startsWith("- "))) {
            if (items[q].blank) { q++; continue; }
            if (items[q].content.charAt(0) === '{') yamlBad(q, 'Flow mapping cannot start a block line \u2014 quote it or dedent');
            var prc = yamlSplitPair(items[q].content);
            if (!prc) yamlBad(q, "Expected \"key: value\"");
            var kc = yamlKey(prc[0], q);
            q = yamlScalarPair(prc[1].trim(), q, items[q].indent, m, kc);
          }
          arr.push(m);
          p = q;
        } else if (yamlIsBlock(rest)) {
          var lit0 = yamlLiteral(p + 1, it.indent, yamlChomp(rest), rest.charAt(0) === '>');
          arr.push(lit0.text);
          p = lit0.next;
        } else {
          arr.push(yamlScalar(rest, p));
          p++;
        }
      }
    }
    return { value: arr, next: p };
  }
  if (items.length > 1 && yamlIsBlock(items[0].content) && !yamlSplitPair(items[0].content)) {
    return yamlLiteral(1, items[0].indent, yamlChomp(items[0].content), items[0].content.charAt(0) === '>').text;
  }
  var core = items.filter(function (it) { return !it.blank; });
  if (core.length === 1 && !(core[0].content === "-" || core[0].content.startsWith("- ")) && (!yamlSplitPair(core[0].content) || core[0].content.charAt(0) === '{') && !yamlIsBlock(core[0].content)) return yamlScalar(core[0].content, 0);
  var doc = yamlBlock(0, -1);
  while (doc.next < items.length && items[doc.next].blank) doc.next++;
  if (doc.next !== items.length) yamlBad(doc.next, "Unexpected content");
  return doc.value;

};
T.yamlToJSON = function (s) { return JSON.stringify(yamlParseDocument(s), null, 2); };
T.yamlFormat = function (s) {
  var text = String(s);
  if (!text.trim()) throw new Error('Enter YAML to format');
  return yamlEmitLines(yamlParseDocument(text), '').join('\n') + '\n';
};
/* YAML-formatter UI contract: empty-input guard plus canonical format. Guard already exists in yamlFormat; this wrapper keeps the manifest free of duplicated logic. */
T.yamlFormatOpts = function (s) {
  if (!String(s).trim()) throw new Error('Enter YAML to format');
  return T.yamlFormat(s);
};
function yamlDquote(str) {
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i), code = str.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (code < 32 || code === 127) out += '\\u' + ('000' + code.toString(16)).slice(-4);
    else out += ch;
  }
  return '"' + out + '"';
}
function yamlPlainSafe(str) {
  if (str === '') return false;
  if (/\n|\r/.test(str)) return false;
  if (/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(str)) return false;
  var low = str.toLowerCase();
  if (['true', 'false', 'null', '~', '.nan', '.inf', '-.inf', 'yes', 'no', 'y', 'n', 'on', 'off'].indexOf(low) >= 0) return false;
  if (!isNaN(Number(str))) return false;
  var first = str.charAt(0);
  if ('-?:,[]{}&*!#|>%@'.indexOf(first) >= 0) return false;
  if (first === String.fromCharCode(39) || first === String.fromCharCode(34) || first === '`') return false;
  if (/^\s|\s$/.test(str)) return false;
  if (str.indexOf(': ') >= 0 || str.indexOf(' #') >= 0) return false;
  return true;
}
function yamlScalarText(value) {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (value !== value) return '.nan';
    if (value === Infinity) return '.inf';
    if (value === -Infinity) return '-.inf';
    return String(value);
  }
  var str = String(value);
  if (yamlPlainSafe(str)) return str;
  return yamlDquote(str);
}
function yamlEmitLines(value, indent) {
  var pad = indent || '', out = [], i;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.indexOf('\n') >= 0) {
      var parts = value.split('\n'), block = [pad + '|'];
      for (var b = 0; b < parts.length; b++) block.push(pad + '  ' + parts[b]);
      return block;
    }
    return [pad + yamlScalarText(value)];
  }
  var childPad = pad + '  ';
  if (Array.isArray(value)) {
    if (!value.length) return [pad + '[]'];
    for (i = 0; i < value.length; i++) {
      var item = yamlEmitLines(value[i], childPad);
      out.push(pad + '- ' + item[0].slice(childPad.length));
      for (var r = 1; r < item.length; r++) out.push(item[r]);
    }
    return out;
  }
  var keys = Object.keys(value);
  if (!keys.length) return [pad + '{}'];
  for (i = 0; i < keys.length; i++) {
    var key = keys[i], keyText = yamlPlainSafe(key) ? key : yamlDquote(key);
    var child = yamlEmitLines(value[key], childPad);
    if (child.length === 1 && (value[key] === null || typeof value[key] !== 'object')) {
      out.push(pad + keyText + ': ' + child[0].slice(childPad.length));
    } else {
      out.push(pad + keyText + ':');
      for (var c = 0; c < child.length; c++) out.push(child[c]);
    }
  }
  return out;
}

T.baseConvertDetailed = function (raw, fromBase, toBase) {
  var s = String(raw).trim();
  if (!s) throw new Error('Enter a number');
  var neg = s.charAt(0) === '-';
  var digits = (neg ? s.slice(1) : s).toLowerCase().replace(/[_\s]/g, '');
  if (!digits) throw new Error('Enter a number');
  for (var i = 0; i < digits.length; i++) { var v = parseInt(digits.charAt(i), 36); if (!(v >= 0 && v < fromBase)) throw new Error('Invalid digit "' + digits.charAt(i) + '" for base ' + fromBase); }
  var n = 0n; var base = BigInt(fromBase);
  for (var j = 0; j < digits.length; j++) n = n * base + BigInt(parseInt(digits.charAt(j), 36));
  var out = (neg ? '-' : '') + n.toString(toBase);
  if (toBase === 16) out = out.toUpperCase();
  var BASE_NAMES = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hex' };
  var name = BASE_NAMES[toBase] || 'Base ' + toBase;
  return s.trim() + ' (base ' + fromBase + ' \u2192 ' + name + ')\n' + '\u2500'.repeat(20) + '\n' + name + ': ' + out + (fromBase !== 10 ? '\nDecimal: ' + (neg ? '-' : '') + n.toString(10) : '');
};
/* Base-converter UI contract: from/to arrive as option strings with '10'/'16' defaults. Moved from the manifest so shell UI delegates to this single source. */
T.baseConvertOpts = function (raw, opts) {
  var from = parseInt((opts && opts.fromBase) || '10', 10);
  var to = parseInt((opts && opts.toBase) || '16', 10);
  return T.baseConvertDetailed(raw, from, to);
};
T.baseConvert = function (num, fromBase, toBase) {
  var raw = String(num).trim();
  if (!raw) throw new Error('Empty number');
  var neg = raw.charAt(0) === '-';
  var digits = (neg ? raw.slice(1) : raw).toLowerCase().replace(/[_\s]/g, '');
  if (!digits) throw new Error('Invalid number');
  for (var i = 0; i < digits.length; i++) { var v = parseInt(digits.charAt(i), 36); if (!(v >= 0 && v < fromBase)) throw new Error('Invalid digit "' + digits.charAt(i) + '" for base ' + fromBase); }
  var n = 0n; var base = BigInt(fromBase);
  for (var j = 0; j < digits.length; j++) n = n * base + BigInt(parseInt(digits.charAt(j), 36));
  var out = (neg ? '-' : '') + n.toString(toBase);
  return toBase === 16 ? out.toUpperCase() : out;
};
/**
 * Unix file-mode converter (chmod). Auto-detects direction:
 * octal ("755", "4755") → symbolic, or symbolic ("rwxr-xr-x",
 * "-rwsr-xr-t") → octal. Setuid/setgid/sticky aware (s/S/t/T).
 * Returns a detailed human-readable breakdown; throws a
 * user-facing Error on anything else.
 */
T.chmodConvert = function (raw) {
  var s = String(raw);
  if (!s.trim()) throw new Error('Enter an octal mode (e.g. 755) or symbolic mode (e.g. rwxr-xr-x)');
  var tokens = s.trim().split(/\s+/);
  var i, tok = null, isOctal = false;
  for (i = 0; i < tokens.length; i++) {
    var t = tokens[i].replace(/,$/, '');
    if (/^[0-7]{3,4}$/.test(t)) { tok = t; isOctal = true; break; }
  }
  if (!tok) {
    for (i = 0; i < tokens.length; i++) {
      var c = tokens[i].replace(/,$/, '');
      var body = c.length === 10 ? c.slice(1) : c;
      if (/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(body) &&
        (c.length === 9 || (c.length === 10 && /^[dDlcbps-]/.test(c)))) { tok = c; isOctal = false; break; }
    }
  }
  if (!tok) throw new Error('Enter an octal mode (755, 644, 4755) or symbolic mode (rwxr-xr-x)');
  function classWords(bits) {
    var w = [];
    if (bits & 4) w.push('read');
    if (bits & 2) w.push('write');
    if (bits & 1) w.push('execute');
    return w.length ? w.join(', ') : 'no permissions';
  }
  function triad(bits) { return (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-'); }
  var u, g, o, special, sym, oct;
  if (isOctal) {
    var d = tok;
    special = d.length === 4 ? parseInt(d.charAt(0), 8) : 0;
    u = parseInt(d.charAt(d.length - 3), 8);
    g = parseInt(d.charAt(d.length - 2), 8);
    o = parseInt(d.charAt(d.length - 1), 8);
    var chars = (triad(u) + triad(g) + triad(o)).split('');
    if (special & 4) chars[2] = (u & 1) ? 's' : 'S';
    if (special & 2) chars[5] = (g & 1) ? 's' : 'S';
    if (special & 1) chars[8] = (o & 1) ? 't' : 'T';
    sym = chars.join('');
    oct = tok;
  } else {
    var body2 = tok.length === 10 ? tok.slice(1) : tok;
    var b = body2.split('');
    u = (b[0] === 'r' ? 4 : 0) + (b[1] === 'w' ? 2 : 0) + ((b[2] === 'x' || b[2] === 's') ? 1 : 0);
    g = (b[3] === 'r' ? 4 : 0) + (b[4] === 'w' ? 2 : 0) + ((b[5] === 'x' || b[5] === 's') ? 1 : 0);
    o = (b[6] === 'r' ? 4 : 0) + (b[7] === 'w' ? 2 : 0) + ((b[8] === 'x' || b[8] === 't') ? 1 : 0);
    special = ((b[2] === 's' || b[2] === 'S') ? 4 : 0) + ((b[5] === 's' || b[5] === 'S') ? 2 : 0) + ((b[8] === 't' || b[8] === 'T') ? 1 : 0);
    sym = body2;
    oct = (special ? String(special) : '') + u + g + o;
  }
  var specials = [];
  if (special & 4) specials.push('setuid');
  if (special & 2) specials.push('setgid');
  if (special & 1) specials.push('sticky');
  var head = tok + (isOctal ? ' (octal \u2192 symbolic)' : ' (symbolic \u2192 octal)');
  return head + '\n' + '\u2500'.repeat(20) +
    '\nOctal:    ' + oct +
    '\nSymbolic: ' + sym +
    '\nOwner:    ' + sym.slice(0, 3) + ' (' + u + ') — ' + classWords(u) +
    '\nGroup:    ' + sym.slice(3, 6) + ' (' + g + ') — ' + classWords(g) +
    '\nOther:    ' + sym.slice(6, 9) + ' (' + o + ') — ' + classWords(o) +
    '\nSpecial:  ' + (specials.length ? specials.join(', ') : 'none') +
    '\nDecimal:  ' + parseInt(oct, 8);
};
/**
 * Cron expression explainer. Parses 5-field cron plus @-presets,
 * explains each field in plain words and lists the next 5 runs
 * (local time). Day-of-month / day-of-week follow Vixie
 * OR-semantics. Throws a user-facing Error naming the bad field.
 * Matching is a capped minute scan: O(minutes to 5th run).
 */
T.cronParse = function (raw) {
  var lines = String(raw).split('\n');
  var s = '';
  for (var li = 0; li < lines.length; li++) {
    if (lines[li].trim()) { s = lines[li].trim(); break; }
  }
  if (!s) throw new Error('Enter a cron expression (e.g. */5 * * * *)');
  var DQ = String.fromCharCode(34);
  var PRESETS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
  var fields, label;
  if (s.charAt(0) === '@') {
    var key = s.split(/\s+/)[0].toLowerCase();
    if (key === '@reboot') throw new Error('@reboot runs at boot \u2014 no schedule to explain');
    if (!PRESETS[key]) throw new Error('Unknown preset ' + DQ + key + DQ + ' \u2014 try @daily, @weekly, @monthly, @yearly, @hourly');
    fields = PRESETS[key].split(' ');
    label = key + ' (' + PRESETS[key] + ')';
  } else {
    fields = s.split(/\s+/);
    if (fields.length !== 5) throw new Error('Cron needs 5 fields (minute hour day month weekday) \u2014 got ' + fields.length);
    label = s;
  }
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var SPECS = [
    { name: 'Minute', min: 0, max: 59, unit: 'minute' },
    { name: 'Hour', min: 0, max: 23, unit: 'hour' },
    { name: 'Day', min: 1, max: 31, unit: 'day of month' },
    { name: 'Month', min: 1, max: 12, unit: 'month', names: MONTHS },
    { name: 'Weekday', min: 0, max: 7, unit: 'day of week', names: DAYS }
  ];
  function fmtVal(v, spec) {
    var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (spec.unit === 'month') return MN[v - 1] + ' (' + v + ')';
    if (spec.unit === 'day of week') return DN[v % 7];
    return String(v);
  }
  function parseField(f, spec) {
    var orig = f;
    var low = String(f).toLowerCase();
    if (low === '*') return { values: null, isStar: true, text: 'every ' + spec.unit };
    if (low === '?') return { values: null, isStar: true, text: 'every ' + spec.unit };
    if (spec.names) low = low.replace(/[a-z]+/g, function (w) { return spec.names[w] !== undefined ? String(spec.names[w]) : w; });
    var seen = {}, hasStep = low.indexOf('/') >= 0, stepSeen = 0;
    var parts = low.split(',');
    for (var pi = 0; pi < parts.length; pi++) {
      var p = parts[pi], range = p, step = 1;
      var slash = p.indexOf('/');
      if (slash >= 0) {
        range = p.slice(0, slash); step = parseInt(p.slice(slash + 1), 10);
        if (!(step >= 1)) throw new Error(spec.name + ': bad step in ' + DQ + orig + DQ);
        stepSeen = step;
      }
      var lo, hi;
      if (range === '') { lo = spec.min; hi = spec.max; } else {
        if (range === '*') { lo = spec.min; hi = spec.max; } else {
          var dash = range.indexOf('-');
          if (dash >= 0) { lo = parseInt(range.slice(0, dash), 10); hi = parseInt(range.slice(dash + 1), 10); }
          else { lo = hi = parseInt(range, 10); }
          if (isNaN(lo)) { throw new Error(spec.name + ': bad value in ' + DQ + orig + DQ); } else {
            if (isNaN(hi)) throw new Error(spec.name + ': bad value in ' + DQ + orig + DQ);
          }
        }
      }
      if (lo < spec.min) { throw new Error(spec.name + ' out of range (' + spec.min + '\u2013' + spec.max + '): ' + DQ + orig + DQ); } else {
        if (hi > spec.max) { throw new Error(spec.name + ' out of range (' + spec.min + '\u2013' + spec.max + '): ' + DQ + orig + DQ); } else {
          if (lo > hi) throw new Error(spec.name + ' out of range (' + spec.min + '\u2013' + spec.max + '): ' + DQ + orig + DQ);
        }
      }
      for (var v = lo; v <= hi; v += step) {
        var vv = v;
        if (spec.unit === 'day of week') { if (v === 7) vv = 0; }
        seen[vv] = 1;
      }
    }
    var arr = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    if (!arr.length) throw new Error(spec.name + ': empty set in ' + DQ + orig + DQ);
    var text;
    if (arr.length === spec.max - spec.min + 1) text = 'every ' + spec.unit;
    else if (hasStep) { if (parts.length === 1) { text = 'every ' + stepSeen + ' ' + spec.unit + 's (' + arr.map(function (v) { return fmtVal(v, spec); }).join(', ') + ')'; } else { if (arr.length === 1) { text = 'at ' + fmtVal(arr[0], spec); } else { var list0 = arr.slice(0, 8).map(function (v) { return fmtVal(v, spec); }).join(', '); text = 'at ' + list0 + (arr.length > 8 ? ' (+' + (arr.length - 8) + ' more)' : ''); } } } else { if (arr.length === 1) { text = 'at ' + fmtVal(arr[0], spec); } else { var list1 = arr.slice(0, 8).map(function (v) { return fmtVal(v, spec); }).join(', '); text = 'at ' + list1 + (arr.length > 8 ? ' (+' + (arr.length - 8) + ' more)' : ''); } }
        return { values: arr, isStar: false, text: text };
  }
  var parsed = fields.map(function (f, idx) { return parseField(f, SPECS[idx]); });
  var summary;
  if (parsed.every(function (p) { return p.isStar; })) summary = 'Every minute';
  if (summary === undefined) {
    var minOnly = false;
    if (!parsed[0].isStar) { if (parsed[0].values) { if (parsed.slice(1).every(function (p) { return p.isStar; })) minOnly = true; } }
    if (minOnly) {
    var mv = parsed[0].values, st = 0;
    if (mv.length > 1) {
      var k = mv[1] - mv[0], even = true;
      for (var mi = 2; mi < mv.length; mi++) if (mv[mi] - mv[mi - 1] !== k) { even = false; break; }
      if (even) { if (mv[0] === 0) { if (mv[mv.length - 1] === 60 - k) st = k; } }
    }
    if (mv.length === 1) { summary = 'At minute ' + mv[0] + ' past every hour'; } else {
      if (st) { summary = 'Every ' + st + ' minutes'; } else { summary = 'Several times an hour (' + parsed[0].text + ')'; }
    }
    }
  }
  if (summary === undefined) {
    var dayTime = false;
    if (parsed[0].values) { if (parsed[1].values) { if (parsed.slice(2).every(function (p) { return p.isStar; })) dayTime = true; } }
    if (dayTime) {
    if (parsed[0].values.length === 1) { if (parsed[1].values.length === 1) { summary = 'Daily at ' + T.cronPad(parsed[1].values[0]) + ':' + T.cronPad(parsed[0].values[0]); } }
    if (summary === undefined) {
      if (parsed[0].values.length === 1) { if (parsed[1].values.length !== 1) summary = 'Daily, multiple times (' + parsed[0].text + '; ' + parsed[1].text + ')'; }
      if (summary === undefined) { if (parsed[1].values.length === 1) { if (parsed[0].values.length !== 1) summary = 'Daily, multiple times (' + parsed[0].text + '; ' + parsed[1].text + ')'; } }
    }
    if (summary === undefined) summary = 'Daily, multiple times (' + parsed[0].text + '; ' + parsed[1].text + ')';
    }
  }
  if (summary === undefined) {
    if (parsed[0].values) { if (parsed[1].values) { if (!parsed[4].isStar) { if (parsed[2].isStar) { if (parsed[3].isStar) {
      summary = 'Weekly on ' + parsed[4].values.map(function (v) { return T.cronDay(v); }).join(', ') + ' at ' + T.cronHM(parsed[1], parsed[0]);
    } } } } }
  }
  if (summary === undefined) {
    if (parsed[0].values) { if (parsed[1].values) { if (!parsed[2].isStar) { if (parsed[3].isStar) { if (parsed[4].isStar) {
      summary = 'Monthly on day ' + parsed[2].values.join(', ') + ' at ' + T.cronHM(parsed[1], parsed[0]);
    } } } } }
  }
  if (summary === undefined) summary = 'Custom schedule \u2014 see fields below';
  var SIZES = [60, 24, 32, 13, 8];
  var sets = parsed.map(function (p, idx) {
    if (p.isStar) return null;
    var t = [], k;
    for (k = 0; k < SIZES[idx]; k++) t[k] = 0;
    for (k = 0; k < p.values.length; k++) t[p.values[k]] = 1;
    return t;
  });
  function isMatch(d) {
    if (sets[0]) { if (!sets[0][d.getMinutes()]) return false; }
    if (sets[1]) { if (!sets[1][d.getHours()]) return false; }
    if (sets[3]) { if (!sets[3][d.getMonth() + 1]) return false; }
    var domStar = !sets[2];
    var dowStar = !sets[4];
    if (domStar) {
      if (dowStar) return true;
      if (sets[4][d.getDay()]) return true;
      return false;
    }
    if (dowStar) {
      if (sets[2][d.getDate()]) return true;
      return false;
    }
    if (sets[2][d.getDate()]) return true;
    if (sets[4][d.getDay()]) return true;
    return false;
  }
  return { label: label, summary: summary, fieldTexts: [parsed[0].text, parsed[1].text, parsed[2].text, parsed[3].text, parsed[4].text], match: isMatch };
};
T.cronPad = function (n) { return (n < 10 ? '0' : '') + n; };
T.cronDay = function (v) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][v % 7]; };
T.cronHM = function (hp, mp) {
  var h1 = hp.values.length === 1 ? T.cronPad(hp.values[0]) : '[' + hp.text + ']';
  var m1 = mp.values.length === 1 ? T.cronPad(mp.values[0]) : '[' + mp.text + ']';
  return h1 + ':' + m1;
};
T.cronNext = function (raw, count) {
  var c = T.cronParse(raw);
  count = parseInt(count, 10);
  if (!(count >= 1)) count = 5;
  var out = [];
  var cur = new Date();
  cur.setSeconds(0, 0);
  cur = new Date(cur.getTime() + 60000);
  for (var n = 0; n < 2628000; n++) {
    if (out.length >= count) break;
    if (c.match(cur)) out.push(cur.getTime());
    cur = new Date(cur.getTime() + 60000);
  }
  return out;
};
T.cronExplain = function (raw) {
  var c = T.cronParse(raw);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var DN2 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var ms = T.cronNext(raw, 5);
  if (!ms.length) throw new Error('No runs in the next 5 years \u2014 check the day/month combo (Feb 30 never happens)');
  var runs = ms.map(function (t) { return new Date(t); });
  return c.label + ' (cron \u2192 schedule)\n' + '\u2500'.repeat(20) +
    '\nSummary:  ' + c.summary +
    '\nMinute:   ' + c.fieldTexts[0] +
    '\nHour:     ' + c.fieldTexts[1] +
    '\nDay:      ' + c.fieldTexts[2] +
    '\nMonth:    ' + c.fieldTexts[3] +
    '\nWeekday:  ' + c.fieldTexts[4] +
    '\nNext runs (local):\n  ' + runs.map(function (d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' (' + DN2[d.getDay()] + ')';
    }).join('\n  ');
};
/**
 * Cron builder: compose fields or expand a preset, then explain.
 * Single source for cron logic; the cron-builder custom tool renders cronParse/cronNext, validation stays in cronExplain.
 */
T.cronBuild = function (opts) {
  opts = opts || {};
  var presets = { 'every-minute': '* * * * *', 'hourly': '0 * * * *', 'daily': '0 0 * * *', 'weekly': '0 0 * * 0', 'monthly': '0 0 1 * *', 'weekdays': '0 9 * * 1-5' };
  if (opts.preset && opts.preset !== 'custom') {
    if (!presets[opts.preset]) throw new Error('Unknown preset "' + opts.preset + '" — try custom, every-minute, hourly, daily, weekly, monthly, weekdays');
    return T.cronExplain(presets[opts.preset]);
  }
  function fld(v, d) { v = String(v === undefined ? d : v).trim(); return v ? v : d; }
  var expr = [fld(opts.minute, '*'), fld(opts.hour, '*'), fld(opts.day, '*'), fld(opts.month, '*'), fld(opts.weekday, '*')].join(' ');
  return T.cronExplain(expr);
};
/* Epoch converter: unix seconds-or-milliseconds (digit-count heuristic)
   or any Date.parse string, rendered as epoch s/ms + ISO + UTC + local.
   Moved verbatim from the manifest handler. */
T.epochInfo = function (s) {

      var t = s.trim();
      if (!t) throw new Error('Enter a Unix timestamp or a date');
      var d;
      if (/^-?\d+(\.\d+)?$/.test(t)) {
        var n = parseFloat(t);
        var digits = t.replace(/[-.]/g, '').replace(/^0+/, '').length || 1;
        d = new Date(digits > 10 ? n : n * 1000);
      } else {
        var ms = Date.parse(t);
        if (isNaN(ms)) throw new Error('Unrecognized timestamp or date — try 1718035200 or 2024-06-10T12:00:00Z');
        d = new Date(ms);
      }
      if (isNaN(d.getTime())) throw new Error('Out-of-range date');
      return 'Epoch (s):  ' + Math.floor(d.getTime() / 1000) +
        '\nEpoch (ms): ' + d.getTime() +
        '\nISO-8601:   ' + d.toISOString() +
        '\nUTC:        ' + d.toUTCString() +
        '\nLocal:      ' + d.toString();
    };
T.timestampToDate = function (ts) { return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19); };
T.dateToTimestamp = function (s) { var d = new Date(s); if (isNaN(d.getTime())) throw new Error('Invalid date'); return Math.floor(d.getTime() / 1000); };
T.hexToRGB = function (hex) {
  var h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h) && !/^[0-9a-fA-F]{3}$/.test(h)) throw new Error('Invalid hex color');
  var full = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
  return parseInt(full.slice(0, 2), 16) + ', ' + parseInt(full.slice(2, 4), 16) + ', ' + parseInt(full.slice(4, 6), 16);
};
T.rgbToHex = function (r, g, b) {
  if ([r, g, b].some(function (v) { return v < 0 || v > 255; })) throw new Error('RGB values must be 0-255');
  return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
};
T.hslToHex = function (h, s, l) {
  s /= 100; l /= 100;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = l - c / 2;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  return T.rgbToHex(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
};
T.numberToWords = function (n) {
  var ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n === 0) return 'zero';
  var chunks = function (num) {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + chunks(num % 100) : '');
    return '';
  };
  var units = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];
  var res = '', i = 0;
  while (n > 0 && i < units.length) {
    var part = n % 1000;
    if (part) res = chunks(part) + (units[i] ? ' ' + units[i] : '') + (res ? ' ' : '') + res;
    n = Math.floor(n / 1000); i++;
  }
  return res.trim();
};

/**
 * Full number-to-words handler: validate free-form input, then delegate.
 * Single source for the manifest tool; core chunking stays in numberToWords.
 */
T.numberToWordsText = function (raw) {
  var n = parseFloat(String(raw).replace(/[,$]/g, ''));
  if (isNaN(n)) throw new Error('Invalid number');
  if (!Number.isInteger(n)) throw new Error('Enter a whole number');
  if (n < 0) return 'negative ' + T.numberToWords(-n);
  return T.numberToWords(n);
};
/** Decimal to Roman (greedy subtractive table) and back. The decoder
 * parses leniently, then re-encodes and compares, so only canonical
 * forms validate (IV passes, IIII/VIV/IL/XM do not). Range is 1-3999. */
T.romanEncode = function (n) {
  var table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  var o = '';
  for (var i = 0; i < table.length; i++) {
    while (n >= table[i][0]) { o += table[i][1]; n -= table[i][0]; }
  }
  return o;
};
T.romanDecode = function (s) {
  var val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  var okPair = { IV: 1, IX: 1, XL: 1, XC: 1, CD: 1, CM: 1 };
  var total = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i), v = val[c];
    if (!v) throw new Error('Invalid Roman numeral ' + JSON.stringify(s.slice(0, 12)));
    var nx = val[s.charAt(i + 1)];
    if (nx && nx > v) {
      if (!okPair[c + s.charAt(i + 1)]) throw new Error('Invalid subtractive pair ' + JSON.stringify(c + s.charAt(i + 1)));
      total += nx - v; i++;
    } else total += v;
  }
  if (total < 1 || total > 3999 || T.romanEncode(total) !== s) throw new Error('Not a canonical Roman numeral ' + JSON.stringify(s.slice(0, 12)) + ' \u2014 e.g. 4 is IV, not IIII');
  return total;
};
/** Auto-bidirectional handler: digits convert to Roman, Roman converts
 * to decimal. Single source for the manifest tool. */
T.romanConvert = function (raw) {
  var t = String(raw === undefined || raw === null ? '' : raw).trim().toUpperCase();
  if (!t) throw new Error('Enter a decimal (1\u20133999) or a Roman numeral');
  if (/^[0-9]+$/.test(t)) {
    var n = parseInt(t, 10);
    var shown = t.replace(/^0+/, '') || '0';
    if (!(n >= 1 && n <= 3999)) throw new Error('Roman numerals cover 1\u20133999 \u2014 got ' + shown);
    return T.romanEncode(n);
  }
  if (/^[IVXLCDM]+$/.test(t)) return String(T.romanDecode(t));
  throw new Error('Enter a decimal (1\u20133999) or a Roman numeral like MMXXVI');
};

/* Matrix calculator: determinant (pivoted elimination), inverse
   (Gauss-Jordan), add/subtract/multiply/transpose/trace. */
T.matrixCalc = function (aText, bText, op) {
  var OPS = ['add', 'subtract', 'multiply', 'determinant', 'inverse', 'transpose', 'trace'];
  var mode = OPS.indexOf(op) >= 0 ? op : 'determinant';
  function parse(text, name) {
    var raw = String(text === undefined || text === null ? '' : text).replace(/\r/g, '').trim();
    if (!raw) throw new Error('Enter ' + name + ' \u2014 rows on lines, values space- or comma-separated');
    var rows = raw.split(/\n/).map(function (line, i) {
      var cells = line.trim().split(/[\s,;]+/).filter(function (c) { return c !== ''; });
      if (!cells.length) throw new Error(name + ' row ' + (i + 1) + ' is empty');
      return cells.map(function (c, j) {
        var n = Number(c);
        if (!isFinite(n)) throw new Error(name + ' row ' + (i + 1) + ', col ' + (j + 1) + ' is not a number (\u0022' + c.slice(0, 12) + '\u0022)');
        return n;
      });
    });
    var w = rows[0].length;
    rows.forEach(function (r, i) { if (r.length !== w) throw new Error(name + ' row ' + (i + 1) + ' has ' + r.length + ' values, expected ' + w); });
    return rows;
  }
  function fmt(n) {
    var r = Math.round(n * 1e6) / 1e6;
    return String(Object.is(r, -0) ? 0 : r);
  }
  function show(m, title) {
    return title + ' (' + m.length + '\u00d7' + m[0].length + '):\n' + m.map(function (r) { return r.map(fmt).join(' '); }).join('\n');
  }
  function detOf(m) {
    var n = m.length, a = m.map(function (r) { return r.slice(); }), sign = 1, det = 1;
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (Math.abs(a[piv][c]) < 1e-12) return 0;
      if (piv !== c) { var t = a[c]; a[c] = a[piv]; a[piv] = t; sign = -sign; }
      det *= a[c][c];
      for (var r2 = c + 1; r2 < n; r2++) {
        var f = a[r2][c] / a[c][c];
        for (var k = c; k < n; k++) a[r2][k] -= f * a[c][k];
      }
    }
    return det * sign;
  }
  function needSquare(m, name) {
    if (m.length !== m[0].length) throw new Error(name + ' needs a square matrix (got ' + m.length + '\u00d7' + m[0].length + ')');
  }
  var A = parse(aText, 'Matrix A');
  if (mode === 'determinant') { needSquare(A, 'Determinant'); return 'Determinant: ' + fmt(detOf(A)); }
  if (mode === 'trace') {
    needSquare(A, 'Trace');
    var tr = 0;
    for (var ti = 0; ti < A.length; ti++) tr += A[ti][ti];
    return 'Trace: ' + fmt(tr);
  }
  if (mode === 'transpose') {
    var tp = A[0].map(function (_, c) { return A.map(function (r) { return r[c]; }); });
    return show(tp, 'Transpose');
  }
  if (mode === 'inverse') {
    needSquare(A, 'Inverse');
    var n = A.length;
    if (Math.abs(detOf(A)) < 1e-9) throw new Error('Matrix is singular (determinant is 0) \u2014 no inverse exists');
    var aug = A.map(function (r, i) { return r.slice().concat(A.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var pv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(aug[r][c]) > Math.abs(aug[pv][c])) pv = r;
      var tmp = aug[c]; aug[c] = aug[pv]; aug[pv] = tmp;
      var div = aug[c][c];
      for (var k = c; k < 2 * n; k++) aug[c][k] /= div;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        var f = aug[r2][c];
        for (var k2 = c; k2 < 2 * n; k2++) aug[r2][k2] -= f * aug[c][k2];
      }
    }
    return show(aug.map(function (r) { return r.slice(n); }), 'Inverse');
  }
  var B = parse(bText, 'Matrix B');
  var an = A.length, am = A[0].length, bn = B.length, bm = B[0].length;
  if (mode === 'multiply') {
    if (am !== bn) throw new Error('Columns of A (' + am + ') must equal rows of B (' + bn + ')');
    var prod = [];
    for (var i = 0; i < an; i++) {
      prod.push([]);
      for (var j = 0; j < bm; j++) {
        var sum = 0;
        for (var kk = 0; kk < am; kk++) sum += A[i][kk] * B[kk][j];
        prod[i].push(sum);
      }
    }
    return show(prod, 'Product');
  }
  if (an !== bn || am !== bm) throw new Error('Matrices must share dimensions (A ' + an + '\u00d7' + am + ' vs B ' + bn + '\u00d7' + bm + ')');
  var out = A.map(function (r, i) { return r.map(function (v, j) { return mode === 'subtract' ? v - B[i][j] : v + B[i][j]; }); });
  return show(out, mode === 'subtract' ? 'Difference' : 'Sum');
};
/* Matrix UI contract: matrix A input plus matrixB and operation options. Moved from the manifest for single source. */
/* Tip/split-bill: integer-cents math, tax and tip on pre-tax subtotal, exact or round-up shares. */
T.tipSplit = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  for (var qi = 0; qi < raw.length; qi++) if (raw.charCodeAt(qi) >= 0xD800 && raw.charCodeAt(qi) <= 0xDFFF) return '';
  var txt = raw.trim().replace(/[$,\s]/g, '');
  if (!txt) throw new Error('Enter a bill amount');
  if (!/^\d+(\.\d{1,2})?$/.test(txt)) throw new Error('Bad amount \u2014 got ' + JSON.stringify(raw.trim()));
  var subC = Math.round(parseFloat(txt) * 100);
  if (!(subC >= 0) || subC > 100000000000) throw new Error('Amount out of range');
  function pctVal(v, label) {
    var pv = String(v === undefined || v === null || v === '' ? '0' : v).trim().replace(/%$/, '');
    if (!/^\d+(\.\d+)?$/.test(pv)) throw new Error('Bad ' + label + ' \u2014 got ' + JSON.stringify(String(v)));
    var pn = parseFloat(pv);
    if (!(pn >= 0) || pn > 100) throw new Error(label + ' 0-100 \u2014 got ' + JSON.stringify(String(v)));
    return pn;
  }
  var tipPct = pctVal(o.tip === undefined || o.tip === null || o.tip === '' ? '18' : o.tip, 'Tip');
  var taxPct = pctVal(o.tax, 'Tax');
  var praw = String(o.people === undefined || o.people === null || o.people === '' ? '1' : o.people).trim();
  if (!/^\d+$/.test(praw)) throw new Error('Bad people \u2014 got ' + JSON.stringify(praw));
  var pcount = parseInt(praw, 10);
  if (!(pcount >= 1) || pcount > 1000) throw new Error('People 1-1000');
  var rmode = String(o.round || 'exact');
  if (rmode !== 'exact' && rmode !== 'up') throw new Error('Bad round \u2014 use exact or up');
  var taxC = Math.round(subC * taxPct / 100);
  var tipC = Math.round(subC * tipPct / 100);
  var totalC = subC + taxC + tipC;
  function money(c) { var neg = c < 0 ? '-' : ''; var ac = Math.abs(c); var dl = Math.floor(ac / 100); var ds = String(dl).replace(/\B(?=(\d{3})+(?!\d))/g, ','); var cs = String(ac % 100); if (cs.length < 2) cs = '0' + cs; return neg + '$' + ds + '.' + cs; }
  var out = ['Subtotal: ' + money(subC), 'Tax (' + taxPct + '%): ' + money(taxC), 'Tip (' + tipPct + '%): ' + money(tipC), 'Total: ' + money(totalC)];
  if (rmode === 'up' && pcount > 1) {
    var up = Math.ceil(totalC / pcount / 100) * 100;
    var over = up * pcount - totalC;
    out.push('Each (' + pcount + '): ' + money(up) + (over > 0 ? ' (' + money(over) + ' over - extra tip)' : ' (exact)'));
  } else {
    out.push('Each (' + pcount + '): ' + money(Math.round(totalC / pcount)));
  }
  return out.join('\n');
};
/* BMI: weight over height-squared, metric/imperial units, WHO bands plus healthy range. */
T.bmiCalc = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  for (var bi = 0; bi < raw.length; bi++) if (raw.charCodeAt(bi) >= 0xD800 && raw.charCodeAt(bi) <= 0xDFFF) return '';
  var txt = raw.trim();
  if (!txt) throw new Error('Enter weight \u2014 e.g. 70');
  var wtxt = txt.replace(/[,_\s]/g, '');
  wtxt = wtxt.replace(/(kgs?|lbs?|pounds?)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(wtxt)) throw new Error('Bad weight \u2014 got ' + JSON.stringify(txt));
  var wnum = parseFloat(wtxt);
  var wuRaw = String(o.weightUnit === undefined || o.weightUnit === null || o.weightUnit === '' ? 'kg' : o.weightUnit).trim().toLowerCase();
  if (wuRaw === 'lbs' || wuRaw === 'pound' || wuRaw === 'pounds') wuRaw = 'lb';
  if (wuRaw !== 'kg' && wuRaw !== 'lb') throw new Error('Bad weight unit \u2014 use kg or lb');
  var hsrc = String(o.height === undefined || o.height === null ? '' : o.height).trim();
  if (!hsrc) throw new Error('Enter height \u2014 e.g. 175');
  var htxt = hsrc.replace(/[,_\s]/g, '');
  htxt = htxt.replace(/(cm|inches|inch|feet|ft|in|m)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(htxt)) throw new Error('Bad height \u2014 got ' + JSON.stringify(hsrc));
  var hnum = parseFloat(htxt);
  var huRaw = String(o.heightUnit === undefined || o.heightUnit === null || o.heightUnit === '' ? 'cm' : o.heightUnit).trim().toLowerCase();
  if (huRaw === 'inch' || huRaw === 'inches') huRaw = 'in';
  if (huRaw === 'feet') huRaw = 'ft';
  if (huRaw !== 'cm' && huRaw !== 'm' && huRaw !== 'in' && huRaw !== 'ft') throw new Error('Bad height unit \u2014 use cm, m, in or ft');
  var wkg = wnum * (wuRaw === 'lb' ? 0.45359237 : 1);
  var hm = hnum * (huRaw === 'cm' ? 0.01 : huRaw === 'm' ? 1 : huRaw === 'in' ? 0.0254 : 0.3048);
  if (!(wkg > 0) || wkg > 1000) throw new Error('Weight out of range');
  if (!(hm >= 0.2) || hm > 3) throw new Error('Height out of range');
  var bmi = wkg / (hm * hm);
  var bmiR = Math.round(bmi * 10) / 10;
  var band = bmiR < 18.5 ? 'Underweight' : bmiR < 25 ? 'Healthy' : bmiR < 30 ? 'Overweight' : 'Obese';
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  var loKg = 18.5 * hm * hm;
  var hiKg = 24.9 * hm * hm;
  var lo = wuRaw === 'lb' ? loKg / 0.45359237 : loKg;
  var hi = wuRaw === 'lb' ? hiKg / 0.45359237 : hiKg;
  var blines = ['BMI: ' + bmiR.toFixed(1) + ' (' + band + ')', 'Weight: ' + wtxt + ' ' + wuRaw, 'Height: ' + htxt + ' ' + huRaw + ' (' + hm.toFixed(2) + ' m)', 'Healthy range: ' + f1(lo) + '\u2013' + f1(hi) + ' ' + wuRaw + ' (18.5\u201324.9)'];
  return blines.join('\n');
};
/* Age: calendar Y/M/D via UTC day-borrow, totals plus next birthday. Reuses parseDateValue. */
T.ageCalc = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  for (var ai = 0; ai < raw.length; ai++) if (raw.charCodeAt(ai) >= 0xD800 && raw.charCodeAt(ai) <= 0xDFFF) return '';
  var txt = raw.trim();
  if (!txt) throw new Error('Enter birthdate \u2014 e.g. 1990-06-15');
  var bdate = T.parseDateValue(txt, 1);
  var asrc = String(o.asOf === undefined || o.asOf === null ? '' : o.asOf).trim();
  var rdate = asrc ? T.parseDateValue(asrc, 2) : new Date();
  if (isNaN(bdate.getTime()) || isNaN(rdate.getTime())) throw new Error('Out-of-range date');
  var bd = Date.UTC(bdate.getUTCFullYear(), bdate.getUTCMonth(), bdate.getUTCDate());
  var rd = Date.UTC(rdate.getUTCFullYear(), rdate.getUTCMonth(), rdate.getUTCDate());
  if (bd > rd) throw new Error('Birthdate is in the future');
  function dim2(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  var Y = rdate.getUTCFullYear() - bdate.getUTCFullYear();
  var M = rdate.getUTCMonth() - bdate.getUTCMonth();
  var D = rdate.getUTCDate() - bdate.getUTCDate();
  var byy = rdate.getUTCFullYear(), bmm = rdate.getUTCMonth();
  while (D < 0) { M--; bmm--; if (bmm < 0) { bmm += 12; byy--; } D += dim2(byy, bmm); }
  if (M < 0) { Y--; M += 12; }
  var days = Math.round((rd - bd) / 86400000);
  var weeks = Math.floor(days / 7);
  var months = Y * 12 + M;
  function grp(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function p2(x) { return (x < 10 ? '0' : '') + x; }
  function pl(n, one) { return n + ' ' + (n === 1 ? one : one + 's'); }
  var WDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function leap(ly) { return (ly % 4 === 0 && ly % 100 !== 0) || ly % 400 === 0; }
  var nm = bdate.getUTCMonth(), nd0 = bdate.getUTCDate();
  var ny = rdate.getUTCFullYear();
  var nd = (nm === 1 && nd0 === 29 && !leap(ny)) ? 28 : nd0;
  var cand = Date.UTC(ny, nm, nd);
  if (cand <= rd) {
    ny++;
    nd = (nm === 1 && nd0 === 29 && !leap(ny)) ? 28 : nd0;
    cand = Date.UTC(ny, nm, nd);
  }
  var away = Math.round((cand - rd) / 86400000);
  var cd = new Date(cand);
  var unc = ny + '-' + p2(cd.getUTCMonth() + 1) + '-' + p2(cd.getUTCDate());
  var turn = ny - bdate.getUTCFullYear();
  var blines = ['Age: ' + pl(Y, 'year') + ', ' + pl(M, 'month') + ', ' + pl(D, 'day'),
    'Born: ' + bdate.getUTCFullYear() + '-' + p2(bdate.getUTCMonth() + 1) + '-' + p2(bdate.getUTCDate()) + ' (' + WDAYS[bdate.getUTCDay()] + ')',
    'As of: ' + rdate.getUTCFullYear() + '-' + p2(rdate.getUTCMonth() + 1) + '-' + p2(rdate.getUTCDate()) + ' (' + WDAYS[rdate.getUTCDay()] + ')',
    'Total: ' + grp(days) + (days === 1 ? ' day (' : ' days (') + grp(weeks) + (weeks === 1 ? ' week, ' : ' weeks, ') + grp(months) + (months === 1 ? ' month)' : ' months)'),
    'Next birthday: ' + unc + ' (' + away + (away === 1 ? ' day \u2014 turns ' : ' days \u2014 turns ') + turn + ')'];
  return blines.join('\n');
};
/* Percentages: P% of X, X is what % of Y, and change A \u2192 B. Trimmed float dust, grouped digits. */
T.pctCalc = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? "" : s);
  for (var pi = 0; pi < raw.length; pi++) if (raw.charCodeAt(pi) >= 0xD800 && raw.charCodeAt(pi) <= 0xDFFF) return "";
  var txt = raw.trim();
  if (!txt) throw new Error("Enter a number");
  function num(t, label) {
    var c = String(t).replace(/[,_\s]/g, "").replace(/%$/, "");
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(c)) throw new Error("Bad " + label + " \u2014 got " + JSON.stringify(String(t).trim() === "" ? t : String(t).trim()));
    var n = parseFloat(c);
    if (!isFinite(n) || Math.abs(n) > 1e15) throw new Error(label + " out of range");
    return n;
  }
  var x = num(txt, "number");
  var mode = String(o.mode || "of");
  if (mode !== "of" && mode !== "is" && mode !== "change") throw new Error("Bad mode \u2014 use of, is or change");
  function fmt(n) {
    var r = Math.round(n * 1e10) / 1e10;
    if (r === 0) r = 0;
    var neg = r < 0 ? "-" : "";
    var cells = String(Math.abs(r)).split(".");
    cells[0] = cells[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return neg + cells.join(".");
  }
  function sgn(n) { return (n > 0 ? "+" : "") + fmt(n); }
  if (mode === "of") {
    var praw = o.percent === undefined || o.percent === null || String(o.percent).trim() === "" ? "20" : o.percent;
    var p = num(praw, "percent");
    return fmt(p) + "% of " + fmt(x) + " = " + fmt(x * p / 100);
  }
  if (mode === "is") {
    var oraw = o.of === undefined || o.of === null || String(o.of).trim() === "" ? "" : o.of;
    if (oraw === "") throw new Error("Enter the base value \u2014 of Y");
    var y = num(oraw, "base");
    if (y === 0) throw new Error("Cannot divide by zero");
    return fmt(x) + " is " + fmt(x / y * 100) + "% of " + fmt(y);
  }
  var traw = o.to === undefined || o.to === null || String(o.to).trim() === "" ? "" : o.to;
  if (traw === "") throw new Error("Enter the target value \u2014 to B");
  var b = num(traw, "target");
  if (x === 0) throw new Error("Cannot measure change from zero");
  var d = b - x;
  return "Change: " + sgn(d / x * 100) + "% (" + fmt(x) + " \u2192 " + fmt(b) + ", " + sgn(d) + ")";
};
/* Compound interest: integer-cent per-period ledger, yearly snapshots, APY. */
T.ciCalc = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? "" : s);
  for (var ci = 0; ci < raw.length; ci++) if (raw.charCodeAt(ci) >= 0xD800 && raw.charCodeAt(ci) <= 0xDFFF) return "";
  var txt = raw.trim();
  if (!txt) throw new Error("Enter principal");
  function num(t, label) {
    var c = String(t).replace(/[,_\s]/g, "").replace(/[$%]/g, "");
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(c)) throw new Error("Bad " + label + " \u2014 got " + JSON.stringify(String(t).trim() === "" ? t : String(t).trim()));
    var n = parseFloat(c);
    if (!isFinite(n)) throw new Error(label + " out of range");
    return n;
  }
  var princ = num(txt, "principal");
  if (!(princ >= 0) || princ > 1e12) throw new Error("Principal out of range");
  var rraw = o.rate === undefined || o.rate === null || String(o.rate).trim() === "" ? "5" : o.rate;
  var rate = num(rraw, "rate");
  if (!(rate >= 0) || rate > 100) throw new Error("Rate 0-100");
  var yraw = String(o.years === undefined || o.years === null || String(o.years).trim() === "" ? "10" : o.years).trim();
  if (!/^\d+$/.test(yraw.replace(/[,_\s]/g, ""))) throw new Error("Bad years \u2014 got " + JSON.stringify(String(o.years)));
  var years = parseInt(yraw.replace(/[,_\s]/g, ""), 10);
  if (!(years >= 1) || years > 100) throw new Error("Years 1-100");
  var freq = String(o.freq || "monthly");
  var NMAP = { annual: 1, semiannual: 2, quarterly: 4, monthly: 12, daily: 365 };
  if (!Object.prototype.hasOwnProperty.call(NMAP, freq)) throw new Error("Bad freq \u2014 use annual, semiannual, quarterly, monthly or daily");
  var n = NMAP[freq];
  var craw = o.contrib === undefined || o.contrib === null || String(o.contrib).trim() === "" ? "0" : o.contrib;
  var contrib = num(craw, "contrib");
  if (!(contrib >= 0) || contrib > 1e9) throw new Error("Contrib out of range");
  var bal = Math.round(princ * 100);
  var cc = Math.round(contrib * 100);
  var per = rate / 100 / n;
  function money(c) { var neg = c < 0 ? "-" : ""; var a = Math.abs(c); var d = Math.floor(a / 100); var ds = String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ","); var cs = String(a % 100); if (cs.length < 2) cs = "0" + cs; return neg + "$" + ds + "." + cs; }
  var snaps = [];
  for (var yy = 1; yy <= years; yy++) {
    for (var k = 0; k < n; k++) {
      bal += Math.round(bal * per) + cc;
    }
    if (yy <= 10 || yy === years || yy % 5 === 0) snaps.push("Year " + yy + ": " + money(bal));
  }
  var paid = Math.round(princ * 100) + cc * n * years;
  var earn = bal - paid;
  var apy = (Math.pow(1 + rate / 100 / n, n) - 1) * 100;
  var clines = ["Final: " + money(bal) + " (" + years + (years === 1 ? " year" : " years") + ", " + rate + "% " + freq + ")",
    "Paid in: " + money(paid) + " (" + money(Math.round(princ * 100)) + " principal + " + money(cc * n * years) + " deposits)",
    "Interest earned: " + money(earn),
    "APY: " + (Math.round(apy * 1000) / 1000).toFixed(3) + "%"];
  return clines.concat(snaps).join("\n");
};
/* GCD and LCM over integer lists: Euclid on absolute BigInts, exact at any width. */
/* BigInt Euclid GCD over absolute values: shared by gcd/lcm and fraction tools. */
T.bgcd = function (a, b) { while (b !== BigInt(0)) { var br = a % b; a = b; b = br; } return a; };
T.gcdLcm = function (s) {
  var raw = String(s === undefined || s === null ? "" : s);
  for (var gi = 0; gi < raw.length; gi++) if (raw.charCodeAt(gi) >= 0xD800 && raw.charCodeAt(gi) <= 0xDFFF) return "";
  var txt = raw.trim();
  if (!txt) throw new Error("Enter at least two integers");
  var parts = txt.split(/[\s,;]+/).filter(function (x) { return x !== ""; });
  if (parts.length < 2) throw new Error("Enter at least two integers \u2014 got " + parts.length + " number");
  if (parts.length > 1000) throw new Error("Too many numbers \u2014 max 1000");
  var nums = parts.map(function (p, ix) {
    var c = (p.charAt(0) === "+" || p.charAt(0) === "-") ? p.slice(1) : p;
    if (!/^\d+$/.test(c)) throw new Error("Bad integer #" + (ix + 1) + " \u2014 got " + JSON.stringify(p));
    if ((c.replace(/^0+/, "").length || 1) > 2000) throw new Error("Integer #" + (ix + 1) + " too long \u2014 max 2000 digits");
    return BigInt(c);
  });
  function gcd(a, b) { return T.bgcd(a, b); }
  var g = nums[0], l = nums[0];
  for (var j = 1; j < nums.length; j++) {
    g = gcd(g, nums[j]);
    l = (l === BigInt(0) || nums[j] === BigInt(0)) ? BigInt(0) : (l / gcd(l, nums[j])) * nums[j];
  }
  function grp(x) { return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  return "GCD: " + grp(g) + "\nLCM: " + grp(l) + "\nCoprime: " + (g === BigInt(1) ? "yes" : "no");
};
/* Fraction simplifier: a/b, mixed w n/d, decimals and integers via exact BigInts. */
T.fracSimp = function (s) {
  var raw = String(s === undefined || s === null ? "" : s);
  for (var fi = 0; fi < raw.length; fi++) if (raw.charCodeAt(fi) >= 0xD800 && raw.charCodeAt(fi) <= 0xDFFF) return "";
  var txt = raw.trim().replace(/\s*\/\s*/g, "/");
  if (!txt) throw new Error("Enter a fraction \u2014 e.g. 6/8");
  function big(c, label) {
    if (!/^\d+$/.test(c)) throw new Error("Bad " + label);
    if ((c.replace(/^0+/, "").length || 1) > 2000) throw new Error(label + " too long \u2014 max 2000 digits");
    return BigInt(c);
  }
  var num, den;
  if (txt.indexOf("/") >= 0) {
    var segs = txt.split(/\s+/).filter(function (x) { return x !== ""; });
    var w = BigInt(0), neg = false, fpart;
    if (segs.length === 1) { fpart = segs[0]; }
    else if (segs.length === 2) {
      if (!/^[+-]?\d+$/.test(segs[0])) throw new Error("Bad whole number \u2014 got " + JSON.stringify(segs[0]));
      neg = segs[0].charAt(0) === "-";
      w = BigInt(segs[0].replace(/^[+-]/, ""));
      fpart = segs[1];
      if (/[+-]/.test(fpart.replace("/", ""))) throw new Error("Bad fraction \u2014 sign goes before the whole number");
    } else throw new Error("Bad fraction \u2014 e.g. 6/8 or 1 1/2");
    var fp = fpart.split("/");
    if (fp.length !== 2) throw new Error("Bad fraction \u2014 e.g. 6/8");
    var ns = fp[0], ds = fp[1];
    var nneg = ns.charAt(0) === "-" || ns.charAt(0) === "+";
    var nsign = ns.charAt(0) === "-" ? -1 : 1;
    if (nneg) ns = ns.slice(1);
    if (!/^\d+$/.test(ds)) throw new Error("Bad denominator \u2014 got " + JSON.stringify(fp[1]));
    var n = big(ns, "numerator"), d = big(ds, "denominator");
    num = (w * d + n) * BigInt(neg || nsign < 0 ? -1 : 1);
    den = d;
  } else if (/^[+-]?\d+$/.test(txt)) {
    num = BigInt(txt); den = BigInt(1);
  } else if (/^[+-]?(\d*)\.(\d+)$/.test(txt)) {
    var m = /^([+-]?)(\d*)\.(\d+)$/.exec(txt);
    var ip = m[2] === "" ? "0" : m[2], fr = m[3];
    if (fr.length > 2000) throw new Error("Decimal too long \u2014 max 2000 places");
    var pw = BigInt(10) ** BigInt(fr.length);
    num = BigInt(ip) * pw + BigInt(fr);
    if (m[1] === "-") num = -num;
    den = pw;
  } else throw new Error("Bad fraction \u2014 e.g. 6/8, 1 1/2 or 0.75");
  if (den === BigInt(0)) throw new Error("Denominator cannot be zero");
  var an = num < BigInt(0) ? -num : num;
  var g = T.bgcd(an, den);
  var rn = num / g, rd = den / g;
  function grp(x) { var ng = x < BigInt(0) ? "-" : ""; var t = (x < BigInt(0) ? -x : x).toString(); return ng + t.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function decExp(n, d) {
    var qp = n / d, rem = n % d;
    if (rem === BigInt(0)) return qp.toString();
    var digs = "";
    for (var i = 0; i < 12 && rem !== BigInt(0); i++) { rem *= BigInt(10); digs += (rem / d).toString(); rem %= d; }
    return qp.toString() + "." + digs;
  }
  var arn = rn < BigInt(0) ? -rn : rn;
  var fracLine = rd === BigInt(1) ? grp(rn) : grp(rn) + "/" + grp(rd);
  var whole = arn / rd, rem2 = arn % rd;
  var mixLine = (rn < BigInt(0) ? "-" : "") + (rem2 === BigInt(0) ? grp(whole) : (whole === BigInt(0) ? grp(arn) + "/" + grp(rd) : grp(whole) + " " + grp(rem2) + "/" + grp(rd)));
  var decLine = (rn < BigInt(0) && arn !== BigInt(0) ? "-" : "") + decExp(arn, rd);
  return "Fraction: " + fracLine + "\nMixed: " + mixLine + "\nDecimal: " + decLine + "\nGCD: " + grp(g);
};
T.matrixCalcOpts = function (s, opts) {
  return T.matrixCalc(s, (opts && opts.matrixB) || '', (opts && opts.operation) || 'determinant');
};

/* ── crypto (hashes, HMAC, SRI, PEM, JWT): moved to js/lib/crypto.js, shares Transforms ── */

/* CSV pivot table: group rows by one column, spread another across the top,
   aggregate a value column (count/sum/avg/min/max). First row is headers;
   empty row/col/value options fall back to the first/second/third columns. */
T.csvPivot = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line, first row headers');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(s, d);
  if (rows.length < 2) throw new Error('Need a header row plus at least one data row');
  var headers = rows[0];
  function colIdx(name, label, fallback) {
    var nm = String(name === undefined || name === null ? '' : name).trim();
    if (!nm) {
      if (fallback >= 0 && fallback < headers.length) return fallback;
      throw new Error('Pick the ' + label + ' column \u2014 headers: ' + headers.join(', '));
    }
    var ix = headers.indexOf(nm);
    if (ix < 0) throw new Error('Unknown ' + label + ' column \u2018' + nm + '\u2019 \u2014 headers: ' + headers.join(', '));
    return ix;
  }
  var agg = String(o.agg || 'count');
  if (['count', 'sum', 'avg', 'min', 'max'].indexOf(agg) < 0) agg = 'count';
  var ri = colIdx(o.row, 'row-key', 0);
  var ci = colIdx(o.col, 'pivot', headers.length > 1 ? 1 : -1);
  if (ci === ri) throw new Error('Row-key and pivot must be different columns');
  var vi = -1;
  if (agg !== 'count') vi = colIdx(o.value, 'value', headers.length > 2 ? 2 : -1);
  var rowKeys = [], colKeys = [], cells = Object.create(null);
  function has(m, k) { return Object.prototype.hasOwnProperty.call(m, k); }
  rows.slice(1).forEach(function (r) {
    var rk = ri < r.length ? r[ri] : '';
    var ck = ci < r.length ? r[ci] : '';
    if (!has(cells, rk)) { cells[rk] = Object.create(null); rowKeys.push(rk); }
    var bucket = cells[rk];
    if (!has(bucket, ck)) { bucket[ck] = []; if (colKeys.indexOf(ck) < 0) colKeys.push(ck); }
    bucket[ck].push(vi >= 0 && vi < r.length ? r[vi] : '');
  });
  function trimNum(v) {
    if (!isFinite(v)) return '';
    var r = Math.round(v * 1e10) / 1e10;
    return String(r);
  }
  function aggVals(list) {
    if (agg === 'count') return String(list.length);
    var nums = list.map(function (v) { return Number(v); }).filter(function (v) { return isFinite(v); });
    if (!nums.length) return '';
    if (agg === 'min') return trimNum(Math.min.apply(null, nums));
    if (agg === 'max') return trimNum(Math.max.apply(null, nums));
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    return trimNum(agg === 'avg' ? sum / nums.length : sum);
  }
  function cell(v) {
    return (v.indexOf(d) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var matrix = rowKeys.map(function (rk) {
    return colKeys.map(function (ck) {
      return has(cells[rk], ck) ? aggVals(cells[rk][ck]) : '';
    });
  });
  var sortMode = String(o.sort || 'seen');
  if (['seen', 'row-asc', 'row-desc', 'row-total', 'col-total'].indexOf(sortMode) < 0) sortMode = 'seen';
  function keyCmp(a, b) {
    var na = Number(a), nb = Number(b);
    var aN = a !== '' && isFinite(na), bN = b !== '' && isFinite(nb);
    if (aN && bN) return na - nb;
    if (aN) return -1;
    if (bN) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function rowNumTotal(row) {
    var t = 0;
    row.forEach(function (v) { var n = Number(v); if (v !== '' && isFinite(n)) t += n; });
    return t;
  }
  if (sortMode === 'row-asc' || sortMode === 'row-desc' || sortMode === 'row-total') {
    var rOrder = rowKeys.map(function (_, i) { return i; });
    if (sortMode === 'row-total') {
      var rTotals = matrix.map(rowNumTotal);
      rOrder.sort(function (a, b) { return rTotals[b] - rTotals[a] || keyCmp(rowKeys[a], rowKeys[b]); });
    } else if (sortMode === 'row-asc') {
      rOrder.sort(function (a, b) { return keyCmp(rowKeys[a], rowKeys[b]); });
    } else {
      rOrder.sort(function (a, b) { return keyCmp(rowKeys[b], rowKeys[a]); });
    }
    rowKeys = rOrder.map(function (i) { return rowKeys[i]; });
    matrix = rOrder.map(function (i) { return matrix[i]; });
  }
  if (sortMode === 'col-total') {
    var cTotals = colKeys.map(function (_, c) { return rowNumTotal(matrix.map(function (row) { return row[c]; })); });
    var cOrder = colKeys.map(function (_, i) { return i; });
    cOrder.sort(function (a, b) { return cTotals[b] - cTotals[a] || keyCmp(colKeys[a], colKeys[b]); });
    colKeys = cOrder.map(function (i) { return colKeys[i]; });
    matrix = matrix.map(function (row) { return cOrder.map(function (i) { return row[i]; }); });
  }
  function marginSum(vals) {
    var t = 0, any = false;
    vals.forEach(function (v) { var n = Number(v); if (v !== '' && isFinite(n)) { t += n; any = true; } });
    return any ? trimNum(t) : '';
  }
  var headKeys = colKeys.slice(), totalRow = null;
  if (o.totals === true || o.totals === 'true') {
    headKeys.push('Total');
    var colTotals = colKeys.map(function (_, c) {
      return marginSum(matrix.map(function (row) { return row[c]; }));
    });
    matrix.forEach(function (row) { row.push(marginSum(row)); });
    var grand = marginSum(colTotals);
    colTotals.push(grand === '' ? '' : grand);
    totalRow = colTotals;
  }
  var grid = [[''].concat(headKeys).map(cell).join(d)];
  rowKeys.forEach(function (rk, r) {
    grid.push([rk].concat(matrix[r]).map(cell).join(d));
  });
  if (totalRow) grid.push(['Total'].concat(totalRow).map(cell).join(d));
  return grid.join('\n');
};

/* CSV column profiler: per-column type, fill, distinct, min/max. First row
   is headers; types inferred from non-empty cells (integer/float/bool/date
   else string; no values means empty). Output is CSV with one row per col. */
T.csvProfile = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line, first row headers');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(s, d);
  if (rows.length < 2) throw new Error('Need a header row plus at least one data row');
  var out = (d === ';' ? ';' : ',');
  function cell(v) {
    v = String(v === undefined || v === null ? '' : v);
    return (v.indexOf(out) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function isInt(v) { return /^[+-]?\d+$/.test(v.trim()); }
  function isNum(v) { var x = Number(v); return v.trim() !== '' && isFinite(x); }
  function isBool(v) { var x = v.trim().toLowerCase(); return x === 'true' || x === 'false'; }
  function isDate(v) { var x = v.trim(); return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(x) && !isNaN(Date.parse(x)); }
  var heads = rows[0], body = rows.slice(1), grid = [];
  heads.forEach(function (h, c) {
    var vals = body.map(function (r) { return c < r.length ? r[c] : ''; });
    var filled = vals.filter(function (v) { return String(v).trim() !== ''; });
    var seen = Object.create(null), distinct = 0;
    filled.forEach(function (v) { var k = String(v); if (!Object.prototype.hasOwnProperty.call(seen, k)) { seen[k] = 1; distinct++; } });
    var type = 'empty';
    if (filled.length) {
      if (filled.every(isInt)) type = 'integer';
      else if (filled.every(isNum)) type = 'float';
      else if (filled.every(isBool)) type = 'bool';
      else if (filled.every(isDate)) type = 'date';
      else type = 'string';
    }
    var mn = '', mx = '';
    if (filled.length) {
      if (type === 'integer' || type === 'float') {
        var nums = filled.map(Number).sort(function (a, b) { return a - b; });
        mn = String(nums[0]); mx = String(nums[nums.length - 1]);
      } else {
        var ss = filled.map(String).sort();
        mn = ss[0]; mx = ss[ss.length - 1];
      }
    }
    grid.push([h, type, String(filled.length), String(vals.length - filled.length), String(distinct), mn, mx].map(cell).join(out));
  });
  return ['column' + out + 'type' + out + 'filled' + out + 'empty' + out + 'distinct' + out + 'min' + out + 'max'].concat(grid).join('\n');
};

/* CSV duplicate finder: group rows by key columns (or the whole row when
   key is empty), keep groups seen more than once, sort by count desc.
   Output is count plus key columns; throws when input is empty. */
T.csvDupes = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line, first row headers');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(s, d);
  if (rows.length < 2) throw new Error('Need a header row plus at least one data row');
  var out = (d === ';' ? ';' : ',');
  function cell(v) {
    v = String(v === undefined || v === null ? '' : v);
    return (v.indexOf(out) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var heads = rows[0], body = rows.slice(1), idx = [];
  var keyRaw = String(o.key === undefined || o.key === null ? '' : o.key).trim();
  if (keyRaw) {
    keyRaw.split(',').forEach(function (nm) {
      nm = nm.trim();
      if (!nm) return;
      var ix = heads.indexOf(nm);
      if (ix < 0) throw new Error('Unknown key column \u2018' + nm + '\u2019 \u2014 headers: ' + heads.join(', '));
      if (idx.indexOf(ix) < 0) idx.push(ix);
    });
    if (!idx.length) throw new Error('Pick at least one key column \u2014 headers: ' + heads.join(', '));
  } else {
    idx = heads.map(function (_, i) { return i; });
  }
  var order = [], groups = Object.create(null);
  body.forEach(function (r) {
    var k = idx.map(function (c) { return c < r.length ? r[c] : ''; });
    var id = JSON.stringify(k);
    if (!Object.prototype.hasOwnProperty.call(groups, id)) { groups[id] = { key: k, n: 0 }; order.push(id); }
    groups[id].n++;
  });
  var dupes = order.map(function (id) { return groups[id]; }).filter(function (g) { return g.n > 1; });
  if (!dupes.length) return 'No duplicates found';
  dupes.sort(function (a, b) { return b.n - a.n || (a.key.join('\u0000') < b.key.join('\u0000') ? -1 : 1); });
  var head = ['count'].concat(idx.map(function (c) { return heads[c]; })).map(cell).join(out);
  var grid = dupes.map(function (g) { return [String(g.n)].concat(g.key).map(cell).join(out); });
  return [head].concat(grid).join('\n');
};

/* CSV diff: compare dataset A (input) against dataset B (option) row by
   row on a key column. Each side auto-detects its delimiter; headers must
   match and keys must be unique. Output is status plus key plus details. */
T.csvDiff = function (aText, bText, keyName) {
  function parseSide(text, name) {
    var raw = String(text === undefined || text === null ? '' : text).replace(/^\uFEFF/, '');
    var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
    if (!lines.length) throw new Error(name + ' is empty \u2014 paste delimited rows with a header row');
    var d = T.detectDelimChar(lines.slice(0, 10)) || ',';
    var rows = T.parseCSV(text, d);
    if (rows.length < 2) throw new Error(name + ' needs a header row plus at least one data row');
    return { heads: rows[0], body: rows.slice(1) };
  }
  var A = parseSide(aText, 'Dataset A'), B = parseSide(bText, 'Dataset B');
  var ha = A.heads.map(function (h) { return String(h).trim(); });
  var hb = B.heads.map(function (h) { return String(h).trim(); });
  if (ha.join('\u0000') !== hb.join('\u0000')) throw new Error('Headers differ \u2014 A: ' + ha.join(', ') + ' vs B: ' + hb.join(', '));
  var kn = String(keyName === undefined || keyName === null ? '' : keyName).trim() || ha[0];
  var ki = ha.indexOf(kn);
  if (ki < 0) throw new Error('Unknown key column \u2018' + kn + '\u2019 \u2014 headers: ' + ha.join(', '));
  function cell(v) {
    v = String(v === undefined || v === null ? '' : v);
    return (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function keyed(side, name) {
    var map = Object.create(null), order = [];
    side.body.forEach(function (r, i) {
      var k = ki < r.length ? r[ki] : '';
      if (Object.prototype.hasOwnProperty.call(map, k)) throw new Error(name + ' has a duplicate key \u2018' + k + '\u2019 (row ' + (i + 2) + ')');
      map[k] = r;
      order.push(k);
    });
    return { map: map, order: order };
  }
  var ka = keyed(A, 'Dataset A'), kb = keyed(B, 'Dataset B');
  var seen = Object.create(null), out = [];
  ka.order.forEach(function (k) {
    seen[k] = 1;
    if (!Object.prototype.hasOwnProperty.call(kb.map, k)) { out.push(['removed', k, '']); return; }
    var ra = ka.map[k], rb = kb.map[k], diffs = [];
    ha.forEach(function (h, c) {
      var va = c < ra.length ? ra[c] : '', vb = c < rb.length ? rb[c] : '';
      if (va !== vb && c !== ki) diffs.push(h + ': ' + va + ' -> ' + vb);
    });
    if (diffs.length) out.push(['changed', k, diffs.join('; ')]);
  });
  kb.order.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(seen, k)) out.push(['added', k, '']);
  });
  if (!out.length) return 'No differences found';
  return ['status' + ',' + 'key' + ',' + 'details'].concat(out.map(function (r) { return r.map(cell).join(','); })).join('\n');
};
T.csvDiffOpts = function (s, opts) {
  var o = opts || {};
  return T.csvDiff(s, o.datasetB, o.key);
};

/* CSV sampler: keep the header plus N data rows picked by a seeded
   shuffle (mulberry32 over a string hash), so a seed always replays the
   same sample. Count clamps to the data rows; blank seed means '0'. */
T.csvSample = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line, first row headers');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(s, d);
  if (rows.length < 2) throw new Error('Need a header row plus at least one data row');
  var out = (d === ';' ? ';' : ',');
  function cell(v) {
    v = String(v === undefined || v === null ? '' : v);
    return (v.indexOf(out) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var seedStr = String(o.seed === undefined || o.seed === null ? '' : o.seed);
  if (!seedStr) seedStr = '0';
  var h = 2166136261;
  for (var i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  var rnd = (h >>> 0) || 1;
  function next() {
    rnd |= 0; rnd = (rnd + 0x6D2B79F5) | 0;
    var z = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  var n = parseInt(o.count, 10);
  if (!isFinite(n)) n = 5;
  var body = rows.slice(1);
  n = Math.max(1, Math.min(body.length, n));
  var idx = body.map(function (_, k) { return k; });
  for (var j = idx.length - 1; j > 0; j--) {
    var k = Math.floor(next() * (j + 1));
    var tmp = idx[j]; idx[j] = idx[k]; idx[k] = tmp;
  }
  var keep = {};
  idx.slice(0, n).forEach(function (k) { keep[k] = 1; });
  var grid = [rows[0].map(cell).join(out)];
  body.forEach(function (r, k) { if (keep[k]) grid.push(r.map(cell).join(out)); });
  return grid.join('\n');
};

/* FNV-1a 32-bit hex (8 lowercase digits) - shared row-hash helper. */
T.fnv1aHex = function (str) {
  var h = 2166136261;
  str = String(str);
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
};

/* CSV checksum column: append an FNV-1a hex hash of each row so edits,
   dupes and join keys are visible at a glance. Ragged rows pad short;
   throws when input is empty or the hash column name already exists. */
T.csvChecksum = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line, first row headers');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(s, d);
  if (rows.length < 2) throw new Error('Need a header row plus at least one data row');
  var col = String(o.column === undefined || o.column === null ? '' : o.column).trim() || 'row_hash';
  var heads = rows[0];
  if (heads.indexOf(col) >= 0) throw new Error('Column \u2018' + col + '\u2019 already exists \u2014 pick another hash column name');
  var out = (d === ';' ? ';' : ',');
  function cell(v) {
    v = String(v === undefined || v === null ? '' : v);
    return (v.indexOf(out) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var grid = [heads.concat([col]).map(cell).join(out)];
  rows.slice(1).forEach(function (r) {
    var cells = heads.map(function (_, c) { return c < r.length ? r[c] : ''; });
    grid.push(cells.concat([T.fnv1aHex(cells.join('\u0000'))]).map(cell).join(out));
  });
  return grid.join('\n');
};

/* HAR inspector: DevTools HAR JSON becomes a timing summary -

   per-request method/status/ms/size lines plus totals and failure count. */
T.harSummary = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  if (!raw.trim()) throw new Error('Paste HAR JSON first - export it from the DevTools Network tab');
  var doc;
  try { doc = JSON.parse(raw); }
  catch { throw new Error('Invalid HAR - paste DevTools HAR JSON (an object with log.entries)'); }
  var entries = (doc && doc.log && Array.isArray(doc.log.entries)) ? doc.log.entries
    : (doc && Array.isArray(doc.entries)) ? doc.entries
    : Array.isArray(doc) ? doc : null;
  if (!entries || !entries.length) throw new Error('No entries found - paste a HAR object with log.entries');
  function num(v, fb) { v = Number(v); return isFinite(v) && v >= 0 ? v : fb; }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  var rows = entries.map(function (e, i) {
    var req = (e && e.request) || {};
    var res = (e && e.response) || {};
    var size = num(res.bodySize, -1);
    if (size < 0) size = num(res.content && res.content.size, 0);
    return { n: i + 1, method: String(req.method || 'GET'), status: num(res.status, 0),
      ms: Math.round(num(e && e.time, 0)), size: size, url: String(req.url || '(unknown url)') };
  });
  var q = String(o.filter || '').trim().toLowerCase();
  var failedOnly = o.failedOnly === true || o.failedOnly === 'true';
  function isFailed(r) { return r.status === 0 || r.status >= 400; }
  var list = rows.filter(function (r) {
    if (failedOnly && !isFailed(r)) return false;
    if (q && r.url.toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var failed = list.filter(isFailed).length;
  var bytes = list.reduce(function (a, r) { return a + r.size; }, 0);
  var worst = list.reduce(function (a, r) { return r.ms > a.ms ? r : a; }, list[0] || { ms: 0 });
  var chrono = (o.sort === 'chrono');
  var sorted = list.slice().sort(function (a, b) { return chrono ? a.n - b.n : b.ms - a.ms; });
  if (o.view === 'json') {
    return JSON.stringify({ requests: list.length, bytes: bytes, slowestMs: worst.ms, failed: failed, entries: sorted }, null, 2);
  }
  var head = list.length + (list.length === 1 ? ' request' : ' requests') + ' \u00B7 ' + fmtBytes(bytes) +
    ' \u00B7 slowest ' + worst.ms + ' ms \u00B7 ' + failed + ' failed';
  if (!sorted.length) return head + '\n(no requests match \u2014 clear the filter or untick failed-only)';
  var lines = sorted.map(function (r) {
    return r.ms + ' ms  ' + r.status + '  ' + r.method + '  ' + fmtBytes(r.size) + '  ' + r.url;
  });
  return head + '\n' + lines.join('\n');
};

/* User-Agent parser: browser/version, OS, device class and bot flag
   from a UA string. Ordered patterns (Edge before Chrome) plus a
   bot allowlist; pure match, no tables to ship. */
T.parseUA = function (s) {
  var ua = String(s === undefined || s === null ? '' : s);
  if (!ua.trim()) throw new Error('Paste a User-Agent string first (e.g. from devtools Network tab)');
  var browser = 'Unknown', version = '', os = 'Unknown', device = 'Desktop', engine = '', bot = 'No';
  var m;
  if ((m = /Edg\/([0-9.]+)/.exec(ua))) { browser = 'Edge'; version = m[1]; engine = 'Blink'; }
  else if ((m = /OPR\/([0-9.]+)/.exec(ua))) { browser = 'Opera'; version = m[1]; engine = 'Blink'; }
  else if ((m = /Chrome\/([0-9.]+)/.exec(ua))) { browser = 'Chrome'; version = m[1]; engine = 'Blink'; }
  else if ((m = /Firefox\/([0-9.]+)/.exec(ua))) { browser = 'Firefox'; version = m[1]; engine = 'Gecko'; }
  else if ((m = /Version\/([0-9.]+).*Safari\//.exec(ua))) { browser = 'Safari'; version = m[1]; engine = 'WebKit'; }
  else if (/Safari\//.test(ua)) { browser = 'Safari'; engine = 'WebKit'; }
  var bm = /(Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebot|ia_archiver)\/([0-9.]*)/i.exec(ua);
  if (bm) { browser = bm[1]; version = bm[2]; bot = 'Yes'; }
  else if (/bot|crawl|spider|slurp|mediapartners/i.test(ua)) { bot = 'Likely'; }
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  if (/iPad|Tablet/.test(ua)) device = 'Tablet';
  else if (/Mobi|Android|iPhone|iPod/.test(ua)) device = 'Mobile';
  var bl = browser + (version ? ' ' + version : '') + (engine ? ' (' + engine + ')' : '');
  return 'Browser:  ' + bl + '\nOS:       ' + os + '\nDevice:   ' + device + '\nBot:      ' + bot;
};

/* URL parser (moved verbatim from the manifest handler):
   absolute-URL decompose with decoded query table or JSON view. */
T.parseURL = function (s, opts) {
  var u;
  try { u = new URL(s.trim()); } catch { throw new Error('Enter a valid absolute URL (include https://)'); }
  var params = [];
  u.searchParams.forEach(function (v, k) { params.push([k, v]); });
  if (opts && opts.view === 'json') {
    var o = { protocol: u.protocol.replace(/:$/, ''), host: u.hostname, port: u.port || '(default)', path: u.pathname, hash: u.hash || '(none)', query: {} };
    params.forEach(function (p) {
      if (o.query[p[0]] === undefined) o.query[p[0]] = p[1];
      else if (Array.isArray(o.query[p[0]])) o.query[p[0]].push(p[1]);
      else o.query[p[0]] = [o.query[p[0]], p[1]];
    });
    return JSON.stringify(o, null, 2);
  }
  var lines = ['Protocol: ' + u.protocol.replace(/:$/, ''),
    'Host:     ' + u.hostname,
    'Port:     ' + (u.port || '(default)'),
    'Path:     ' + u.pathname,
    'Hash:     ' + (u.hash || '(none)'),
    'Query params (' + params.length + '):'];
  if (!params.length) lines.push('  (none)');
  params.forEach(function (p) { lines.push('  ' + p[0] + ' = ' + p[1]); });
  return lines.join('\n');
};

T.httpInspect = function (raw) {
  var text = String(raw === undefined || raw === null ? '' : raw).replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('Paste raw HTTP response headers (as shown by curl -i or devtools)');
  var lines = text.split(/\r?\n/);
  var status = null, headers = [], cur = null;
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    if (!line.trim()) continue;
    if (status === null && headers.length === 0 && cur === null && /^\s*HTTP\/\S+\s+\d{3}/i.test(line)) { status = line.trim(); continue; }
    if (/^[ \t]/.test(line) && cur) { cur.value += ' ' + line.trim(); continue; }
    var ci = line.indexOf(':');
    if (ci <= 0) throw new Error('Line ' + (li + 1) + ' is not a header (expected "Name: value")');
    cur = { name: line.slice(0, ci).trim(), value: line.slice(ci + 1).trim() };
    if (!cur.name) throw new Error('Line ' + (li + 1) + ' has an empty header name');
    cur.lname = cur.name.toLowerCase();
    headers.push(cur);
  }
  if (!headers.length) throw new Error('No headers found \u2014 paste "Name: value" lines');
  var byName = Object.create(null);
  headers.forEach(function (h) { (byName[h.lname] = byName[h.lname] || []).push(h.value); });
  var first = function (n) { var v = byName[n]; return v ? v[0] : null; };
  var good = [], bad = [], adv = [], info = [];
  var sts = first('strict-transport-security');
  if (sts === null) bad.push('strict-transport-security missing \u2014 enable HSTS with max-age \u2265 31536000');
  else {
    var mm = /max-age\s*=\s*(\d+)/i.exec(sts);
    if (!mm) bad.push('strict-transport-security has no max-age directive');
    else if (parseInt(mm[1], 10) < 31536000) adv.push('strict-transport-security max-age short (' + mm[1] + ') \u2014 use \u2265 31536000');
    else good.push('strict-transport-security max-age \u2265 1 year');
    if (!/includesubdomains/i.test(sts)) adv.push('strict-transport-security lacks includeSubDomains');
  }
  var csp = first('content-security-policy');
  if (csp === null) bad.push('content-security-policy missing \u2014 page runs with no script/style allowlist');
  else {
    good.push('content-security-policy present');
    if (/(^|\s)\*(\s|;|$)/.test(csp)) adv.push('content-security-policy allows a wildcard source');
  }
  var xfo = first('x-frame-options');
  if (xfo && /^(deny|sameorigin)$/i.test(xfo)) good.push('x-frame-options ' + xfo.toUpperCase());
  else if (csp && /frame-ancestors/i.test(csp)) good.push('clickjacking covered by CSP frame-ancestors');
  else bad.push('x-frame-options missing \u2014 clickjacking unmitigated');
  var xcto = first('x-content-type-options');
  if (xcto && /^nosniff$/i.test(xcto)) good.push('x-content-type-options nosniff');
  else bad.push('x-content-type-options missing \u2014 MIME sniffing allowed');
  var rp = first('referrer-policy');
  if (rp === null) bad.push('referrer-policy missing \u2014 referrers leak by default');
  else good.push('referrer-policy ' + rp);
  if (first('permissions-policy') !== null || first('feature-policy') !== null) good.push('permissions-policy present');
  else adv.push('permissions-policy absent \u2014 powerful features stay at browser defaults');
  if (first('cross-origin-opener-policy') === null && first('cross-origin-embedder-policy') === null && first('cross-origin-resource-policy') === null)
    adv.push('COOP/COEP/CORP absent \u2014 no cross-origin isolation');
  else good.push('cross-origin isolation header present');
  ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator'].forEach(function (n) {
    if (first(n) !== null) adv.push(first(n) === '' ? n + ' header present' : n + ' reveals "' + first(n) + '" \u2014 hide version banners');
  });
  var acao = first('access-control-allow-origin');
  if (acao !== null) {
    var acac = first('access-control-allow-credentials');
    if (acao === '*' && acac && /^true$/i.test(acac)) bad.push('CORS wildcard origin with credentials \u2014 browsers reject this; name an explicit origin');
    else if (acao === '*') adv.push('CORS allows any origin (*) \u2014 lock to explicit origins if cookies matter');
    else good.push('CORS origin scoped to ' + acao);
  }
  var cookies = byName['set-cookie'] || [];
  var cleanCookies = 0;
  cookies.forEach(function (cv) {
    var cname = cv.split(';')[0].trim() || '(unamed)';
    var flaws = [];
    if (!/;\s*secure(\s*;|\s*$)/i.test('; ' + cv)) flaws.push('missing Secure');
    if (!/;\s*httponly(\s*;|\s*$)/i.test('; ' + cv)) flaws.push('missing HttpOnly');
    var sm = /;\s*samesite\s*=\s*([^;\s]+)/i.exec(cv);
    if (!sm) flaws.push('missing SameSite');
    else if (/^none$/i.test(sm[1]) && !/;\s*secure(\s*;|\s*$)/i.test('; ' + cv)) flaws.push('SameSite=None without Secure (browsers reject)');
    if (!flaws.length) cleanCookies++;
    else if (flaws.indexOf('missing HttpOnly') >= 0 && flaws.length === 1) adv.push('cookie "' + cname + '" missing HttpOnly');
    else bad.push('cookie "' + cname + '" ' + flaws.join(', '));
  });
  if (cookies.length && cleanCookies === cookies.length) good.push(cookies.length + (cookies.length === 1 ? ' cookie carries' : ' cookies carry') + ' Secure + HttpOnly + SameSite');
  Object.keys(byName).forEach(function (n) {
    if (byName[n].length > 1 && n !== 'set-cookie') adv.push(n + ' sent ' + byName[n].length + '\u00d7 \u2014 last wins in most clients');
  });
  var loc = first('location');
  if (loc !== null) info.push('redirect \u2192 ' + loc);
  var out = [];
  if (status !== null) out.push('Status: ' + status);
  out.push('Headers (' + headers.length + '):');
  headers.forEach(function (h) { out.push(h.name + ': ' + h.value); });
  out.push('');
  out.push('Security: ' + bad.length + (bad.length === 1 ? ' issue' : ' issues') + (' (' + adv.length + ' advisor' + (adv.length === 1 ? 'y' : 'ies') + '):'));
  good.forEach(function (g) { out.push('\u2713 ' + g); });
  bad.forEach(function (b) { out.push('\u2717 ' + b); });
  adv.forEach(function (a) { out.push('! ' + a); });
  info.forEach(function (m) { out.push('\u00b7 ' + m); });
  return out.join('\n');
};

/* CIDR subnet calculator: network, broadcast, mask, wildcard, host
   count and usable range. Moved verbatim from the manifest handler. */
T.cidrInfo = function (s) {

      var m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
      if (!m) throw new Error('Enter IPv4 CIDR like 192.168.1.10/24');
      var oct = [m[1], m[2], m[3], m[4]].map(Number);
      var pre = parseInt(m[5], 10);
      if (oct.some(function (o) { return o < 0 || o > 255; }) || pre < 0 || pre > 32) throw new Error('Octets must be 0–255 and prefix 0–32');
      function i2s(i) { return [(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255].join('.'); }
      var ip = (((oct[0] * 256 + oct[1]) * 256 + oct[2]) * 256 + oct[3]) >>> 0;
      var mask = pre === 0 ? 0 : (0xFFFFFFFF << (32 - pre)) >>> 0;
      var network = (ip & mask) >>> 0;
      var broadcast = (network | (~mask >>> 0)) >>> 0;
      var hosts = pre === 32 ? 1 : pre === 31 ? 2 : Math.pow(2, 32 - pre) - 2;
      var first = pre >= 31 ? network : (network + 1) >>> 0;
      var last = pre >= 31 ? broadcast : (broadcast - 1) >>> 0;
      return 'IP:           ' + i2s(ip) +
        '\nPrefix:       /' + pre +
        '\nMask:         ' + i2s(mask) +
        '\nWildcard:     ' + i2s((~mask >>> 0)) +
        '\nNetwork:      ' + i2s(network) +
        '\nBroadcast:    ' + i2s(broadcast) +
        '\nUsable range: ' + i2s(first) + ' – ' + i2s(last) +
        '\nHosts:        ' + hosts;
    };
T.DOH_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'CAA'];
T.dohNormalizeDomain = function (d) {
  var raw = String(d === undefined || d === null ? '' : d).trim().toLowerCase();
  if (!raw) throw new Error('Enter a domain like example.com');
  raw = raw.replace(/^[a-z][a-z0-9+.\-]*:\/\//, '').replace(/^[^@\/]*@/, '');
  raw = raw.split(/[\/?#:]/)[0].replace(/\.+$/, '');
  if (raw.length > 253 || !/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/.test(raw))
    throw new Error('Enter a valid domain like example.com');
  return raw;
};
T.dohUrl = function (domain, type, provider) {
  var name = T.dohNormalizeDomain(domain);
  var t = String(type === undefined || type === null ? 'A' : type).toUpperCase();
  if (T.DOH_TYPES.indexOf(t) < 0) throw new Error('Unknown record type "' + type + '"');
  var prov = String(provider === undefined || provider === null ? 'cloudflare' : provider).toLowerCase();
  var q = '?name=' + encodeURIComponent(name) + '&type=' + t;
  if (prov === 'cloudflare') return { url: 'https://cloudflare-dns.com/dns-query' + q, domain: name, type: t, provider: prov };
  if (prov === 'google') return { url: 'https://dns.google/resolve' + q, domain: name, type: t, provider: prov };
  throw new Error('Unknown provider "' + provider + '"');
};
T.dohParse = function (json, type, domain) {
  var body = json;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch (e) { void e; throw new Error('DNS provider returned an unreadable reply'); }
  }
  if (!body || typeof body !== 'object') throw new Error('DNS provider returned an unreadable reply');
  var t = String(type || 'A').toUpperCase();
  var name = domain || 'this domain';
  var st = body.Status;
  if (st !== 0 && st !== undefined) {
    if (st === 3) throw new Error(name + ' does not exist (NXDOMAIN)');
    if (st === 2) throw new Error('Upstream DNS failure (SERVFAIL) \u2014 retry in a moment');
    if (st === 5) throw new Error('Query refused (REFUSED) \u2014 try another record type');
    throw new Error('DNS query failed (status ' + st + ')');
  }
  var ans = Array.isArray(body.Answer) ? body.Answer : [];
  ans = ans.filter(function (a) { return a && typeof a.data === 'string'; });
  if (!ans.length) throw new Error('No ' + t + ' records found for ' + name);
  return ans.map(function (a) {
    var ttl = (a.TTL === undefined || a.TTL === null) ? null : Number(a.TTL);
    var data = a.data;
    if (t === 'TXT' && data.length > 1 && data.charAt(0) === '"' && data.charAt(data.length - 1) === '"')
      data = data.slice(1, -1);
    return { data: data, ttl: (ttl === null || isNaN(ttl)) ? null : ttl };
  });
};

/**
 * Quote a plain scalar when YAML would otherwise misread it
 * (bool/null/number lookalikes, outer whitespace, indicators).
 */
function yamlQuoteIfNeeded(str) {
  var must =
    str === '' ||
    /^\s|\s$/.test(str) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(str) ||
    /^-?(0|[1-9][0-9_]*)(\.[0-9_]+)?([eE][+-]?[0-9]+)?$/.test(str) ||
    /^0x[0-9a-fA-F]+$|^0o[0-7]+$/.test(str) ||
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(str) ||
    str.indexOf(': ') >= 0 ||
    str.indexOf(' #') >= 0 ||
    str.charAt(str.length - 1) === ':';
  if (!must) return str;
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
}

/* ── encoding ──
   Base64 via TextEncoder/TextDecoder — correct for all of Unicode.
   (The previous unescape(encodeURIComponent(s)) trick relied on two
   deprecated global functions and throws on lone surrogates.) */
/**
 * Strip one layer of YAML single/double quotes from a parsed scalar.
 * Double-quoted escapes decode; single-quoted text passes through
 * verbatim. Returns { quoted, text } so callers never coerce a
 * quoted number/bool into its unquoted twin.
 */
function yamlUnquote(v) {
  if (v.length >= 2) {
    var q = v.charAt(0), last = v.charAt(v.length - 1);
    if ((q === '"' || q === "'") && last === q) {
      var inner = v.slice(1, -1), o = '';
      for (var i = 0; i < inner.length; i++) {
        var c = inner.charAt(i);
        if (q === '"' && c === '\\' && i + 1 < inner.length) {
          var e = inner.charAt(i + 1);
          if (e === 'n') o += '\n';
          else if (e === 't') o += '\t';
          else o += e;
          i++; continue;
        }
        o += c;
      }
      return { quoted: true, text: o };
    }
  }
  return { quoted: false, text: v };
}

T._utf8Bytes = function (s) { return new TextEncoder().encode(s); }
T._bytesToBinaryString = function (bytes) {
  var out = '';
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}
/** RFC 4648 §5 base64url → standard alphabet, padding restored. */
T._base64UrlToStandard = function (s) {
  var t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4 !== 0) t += '=';
  return t;
}
/** Paste tolerance: trim + strip one layer of matching quotes/backticks. */
function unquote(s) {
  var t = String(s).trim();
  if (t.length >= 2) {
    var a = t.charAt(0), z = t.charAt(t.length - 1);
    if ((a === '"' && z === '"') || (a === "'" && z === "'") || (a === '`' && z === '`')) return t.slice(1, -1);
  }
  return t;
}
/** Paste tolerance for hex: surrounding 0x prefix, : and - separators. */
T._stripHex = function (s) {
  var h = String(s).replace(/\s/g, '');
  if (h.charAt(0) === '0' && (h.charAt(1) === 'x' || h.charAt(1) === 'X')) h = h.slice(2);
  return h.replace(/[:\-]/g, '');
}
T.base64Encode = function (s) { try { return btoa(T._bytesToBinaryString(T._utf8Bytes(s))); } catch { throw new Error('Failed to encode as Base64'); } };
T.base64Decode = function (s) {
  try {
    var t = unquote(s).replace(/\s/g, '');
    var dm = t.match(/^data:[^,]*;base64,/i);
    if (dm) t = t.slice(dm[0].length);
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4 !== 0) t += '=';
    return new TextDecoder().decode(Uint8Array.from(atob(t), function (c) { return c.charCodeAt(0); }));
  } catch { throw new Error('Invalid Base64 input'); }
};
T.urlEncode = function (s) { return encodeURIComponent(s); };
T.urlDecode = function (s) { try { return decodeURIComponent(s); } catch { throw new Error('Invalid URL encoding'); } };
T.htmlEncode = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
T.htmlDecode = function (s) {
  var map = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", '#x2F': '/', nbsp: '\u00A0', copy: '\u00A9', reg: '\u00AE', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', laquo: '\u00AB', raquo: '\u00BB', deg: '\u00B0', euro: '\u20AC', pound: '\u00A3', yen: '\u00A5', times: '\u00D7', divide: '\u00F7' };
  return String(s).replace(/&(#\d+|#[xX][0-9a-fA-F]+|amp|lt|gt|quot|#39|#x27|#x2F|nbsp|copy|reg|trade|hellip|mdash|ndash|laquo|raquo|deg|euro|pound|yen|times|divide);/g, function (m, e) {
    if (e.charAt(0) === '#') {
      var cp = (e.charAt(1) === 'x' || e.charAt(1) === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!isFinite(cp) || cp < 0 || cp > 1114111) return m;
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return map[e] === undefined ? m : map[e];
  });
};
T.hexEncode = function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); };
T.hexDecode = function (s) {
  var hex = T._stripHex(unquote(s));
  if (!hex) throw new Error('Enter hex input');
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hex string');
  if (hex.length % 2 !== 0) throw new Error('Hex must have even length');
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};
/* Hexdump views: classic offset plus hex plus ASCII panes over the UTF-8 bytes, pipes stay aligned on short rows. */
T.hexdump = function (s, opts) {
  var o = opts || {};
  var width = String(o.width) === '8' ? 8 : 16;
  var upper = !!o.upper;
  var raw = String(s);
  if (!raw.length) throw new Error('Enter text first \u2014 hexdump needs input bytes');
  var bytes = new TextEncoder().encode(raw);
  function dumpHx(nn) { var hh = nn.toString(16).padStart(2, '0'); return upper ? hh.toUpperCase() : hh; }
  var rows = [];
  for (var di = 0; di < bytes.length; di += width) {
    var cells = [];
    var asc = '';
    for (var dj = 0; dj < width; dj++) {
      if (di + dj < bytes.length) {
        var bb = bytes[di + dj];
        cells.push(dumpHx(bb));
        asc += (bb >= 32 && bb <= 126) ? String.fromCharCode(bb) : '.';
      } else { cells.push('  '); asc += ' '; }
    }
    var hexfield = width > 8 ? cells.slice(0, 8).join(' ') + '  ' + cells.slice(8).join(' ') : cells.join(' ');
    rows.push(di.toString(16).padStart(8, '0') + '  ' + hexfield + '  |' + asc + '|');
  }
  return rows.join('\n');
};
T.binaryEncode = function (s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b.toString(2).padStart(8, '0'); }).join(' '); };
T.binaryDecode = function (s) {
  var bits = unquote(s).replace(/\s/g, '');
  if (bits.charAt(0) === '0' && (bits.charAt(1) === 'b' || bits.charAt(1) === 'B')) bits = bits.slice(2);
  if (!/^[01]*$/.test(bits) || bits.length % 8 !== 0) throw new Error('Invalid binary string (must be multiple of 8 bits)');
  var bytes = new Uint8Array(bits.length / 8);
  for (var i = 0; i < bits.length; i += 8) bytes[i / 8] = parseInt(bits.slice(i, i + 8), 2);
  return new TextDecoder().decode(bytes);
};
T.rot13 = function (s) { return s.replace(/[a-zA-Z]/g, function (c) { var code = c.charCodeAt(0); var base = code >= 97 ? 97 : 65; return String.fromCharCode(((code - base + 13) % 26) + base); }); };
T.rot47 = function (s) { return s.replace(/[\x21-\x7e]/g, function (c) { return String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)); }); };
T.caesarCipher = function (s, opts) { var o = opts || {}; var n = parseInt(o.shift || '3', 10); if (isNaN(n)) n = 3; n = ((n % 26) + 26) % 26; if ((o.mode || 'encode') === 'decode') n = (26 - n) % 26; return String(s).replace(/[a-zA-Z]/g, function (c) { var b = c.charCodeAt(0) >= 97 ? 97 : 65; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26) + b); }); };
T.vigenereCipher = function (s, opts) { var o = opts || {}; var key = String(o.key || '').replace(/[^a-zA-Z]/g, ''); if (!key) throw new Error('Enter a letter key \u2014 A shifts 0, B shifts 1, and so on'); var dir = (o.mode || 'encode') === 'decode' ? -1 : 1; var ki = 0; return String(s).replace(/[a-zA-Z]/g, function (c) { var b = c.charCodeAt(0) >= 97 ? 97 : 65; var kc = key.charCodeAt(ki++ % key.length); var k = kc >= 97 ? kc - 97 : kc - 65; return String.fromCharCode((((c.charCodeAt(0) - b + dir * k) % 26 + 26) % 26) + b); }); };
T.atbashCipher = function (s) { return String(s).replace(/[a-zA-Z]/g, function (c) { var code = c.charCodeAt(0); var base = code >= 97 ? 97 : 65; return String.fromCharCode(base + 25 - (code - base)); }); };
/* Bacon cipher cores: 26-code biliteral (A=AAAAA, case-insensitive); encode spaces words with /, decode restores them, pure A/B tokens must be five long and in A-Z range. */
T.baconEncode = function (s) {
  function code(c) { var v = c.toUpperCase().charCodeAt(0) - 65; var g = ''; for (var i = 4; i >= 0; i--) g += ((v >> i) & 1) ? 'B' : 'A'; return g; }
  return String(s).split(' ').map(function (w) {
    return w.replace(/[a-zA-Z]/g, function (c, off, st) { return code(c) + (/[a-zA-Z]/.test(st.charAt(off + 1)) ? ' ' : ''); });
  }).join(' / ');
};
T.baconDecode = function (s) {
  var str = String(s);
  var strict = /^[ABab\s/]+$/.test(str) && /[ABab]/.test(str);
  return str.split('/').map(function (w) {
    var t = w.trim().replace(/([ABab])\s+(?=[ABab])/g, '$1');
    var chunks = t.match(/[ABab]+|[^ABab]+/g) || [];
    return chunks.map(function (tok) {
      if (!/^[ABab]+$/.test(tok)) return tok;
      if (tok.length % 5) {
        if (strict) throw new Error('Bad Bacon group \u2014 A/B runs must split into fives, saw ' + tok.length);
        return tok;
      }
      var letters = '';
      for (var i = 0; i < tok.length; i += 5) {
        var v = parseInt(tok.slice(i, i + 5).toUpperCase().replace(/A/g, '0').replace(/B/g, '1'), 2);
        if (v > 25) throw new Error('Bad Bacon group \u2014 out of A-Z range');
        letters += String.fromCharCode(65 + v);
      }
      return letters;
    }).join('');
  }).join(' ');
};
T.baconCipher = function (s, opts) { return (opts && opts.mode === 'decode') ? T.baconDecode(s) : T.baconEncode(s); };
/* Rail fence cores: zigzag transposition across N rails; encode reads rows, decode restores order, lone surrogates pass via code points. */
T.railFenceEncode = function (s, rails) {
  var R = rails === undefined ? 3 : parseInt(rails, 10);
  if (isNaN(R) || R < 2) throw new Error('Rails must be 2 or more \u2014 saw ' + rails);
  var str = Array.from(String(s));
  var n = str.length;
  if (n <= 1 || R >= n) return String(s);
  var rows = []; for (var i = 0; i < R; i++) rows.push([]);
  var rail = 0, dir = 1;
  for (var k = 0; k < n; k++) {
    rows[rail].push(str[k]);
    if (rail === 0) dir = 1; else if (rail === R - 1) dir = -1;
    rail += dir;
  }
  return rows.map(function (r) { return r.join(''); }).join('');
};
T.railFenceDecode = function (s, rails) {
  var R = rails === undefined ? 3 : parseInt(rails, 10);
  if (isNaN(R) || R < 2) throw new Error('Rails must be 2 or more \u2014 saw ' + rails);
  var str = Array.from(String(s));
  var n = str.length;
  if (n <= 1 || R >= n) return String(s);
  var pat = []; var rail = 0, dir = 1;
  for (var k = 0; k < n; k++) { pat.push(rail); if (rail === 0) dir = 1; else if (rail === R - 1) dir = -1; rail += dir; }
  var counts = []; for (var i = 0; i < R; i++) counts.push(0);
  for (var j = 0; j < n; j++) counts[pat[j]]++;
  var rows = []; var off = 0;
  for (var r = 0; r < R; r++) { rows.push(str.slice(off, off + counts[r])); off += counts[r]; }
  var pos = []; for (var q = 0; q < R; q++) pos.push(0);
  var out = [];
  for (var m = 0; m < n; m++) { var rr = pat[m]; out.push(rows[rr][pos[rr]++]); }
  return out.join('');
};
T.railFenceCipher = function (s, opts) { var o = opts || {}; var R = o.rails === undefined ? '3' : o.rails; if ((o.mode || 'encode') === 'decode') return T.railFenceDecode(s, R); return T.railFenceEncode(s, R); };
/* Playfair cores: 5x5 square (I/J merged), filler X (Q for X) between doubles, J mapped to I, non-letters stripped. */
T.playfairSquare = function (key) {
  var k = String(key === undefined ? 'PLAYFAIR EXAMPLE' : key).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 A-Z builds the 5x5 square');
  var seen = {}; var seq = [];
  var full = k + 'ABCDEFGHIKLMNOPQRSTUVWXYZ';
  for (var i = 0; i < full.length; i++) { var c = full.charAt(i); if (!seen[c]) { seen[c] = 1; seq.push(c); } }
  var pos = {}; for (var j = 0; j < seq.length; j++) pos[seq[j]] = j;
  return { seq: seq, pos: pos };
};
T.playfairPrepare = function (s) {
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  var out = ''; var i = 0;
  while (i < t.length) {
    var a = t.charAt(i);
    if (i + 1 >= t.length) { out += a + (a === 'X' ? 'Q' : 'X'); i++; }
    else { var b = t.charAt(i + 1); if (a === b) { out += a + (a === 'X' ? 'Q' : 'X'); i++; } else { out += a + b; i += 2; } }
  }
  return out;
};
T.playfairEncode = function (s, key) {
  var sq = T.playfairSquare(key);
  var prep = T.playfairPrepare(s);
  if (!prep) return '';
  var out = '';
  for (var i = 0; i < prep.length; i += 2) {
    var ia = sq.pos[prep.charAt(i)]; var ib = sq.pos[prep.charAt(i + 1)];
    var ra = (ia / 5) | 0, ca = ia % 5, rb = (ib / 5) | 0, cb = ib % 5;
    if (ra === rb) out += sq.seq[ra * 5 + (ca + 1) % 5] + sq.seq[rb * 5 + (cb + 1) % 5];
    else if (ca === cb) out += sq.seq[((ra + 1) % 5) * 5 + ca] + sq.seq[((rb + 1) % 5) * 5 + cb];
    else out += sq.seq[ra * 5 + cb] + sq.seq[rb * 5 + ca];
  }
  return out;
};
T.playfairDecode = function (s, key) {
  var sq = T.playfairSquare(key);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (t.length % 2) throw new Error('Bad Playfair input \u2014 need letter pairs, saw ' + t.length);
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var ia = sq.pos[t.charAt(i)]; var ib = sq.pos[t.charAt(i + 1)];
    if (ia === undefined || ib === undefined) throw new Error('Bad Playfair input \u2014 A-Z only');
    var ra = (ia / 5) | 0, ca = ia % 5, rb = (ib / 5) | 0, cb = ib % 5;
    if (ra === rb) out += sq.seq[ra * 5 + (ca + 4) % 5] + sq.seq[rb * 5 + (cb + 4) % 5];
    else if (ca === cb) out += sq.seq[((ra + 4) % 5) * 5 + ca] + sq.seq[((rb + 4) % 5) * 5 + cb];
    else out += sq.seq[ra * 5 + cb] + sq.seq[rb * 5 + ca];
  }
  return out;
};
T.playfairCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'PLAYFAIR EXAMPLE' : o.key; if ((o.mode || 'encode') === 'decode') return T.playfairDecode(s, k); return T.playfairEncode(s, k); };
/* Four-square cores: reuse Playfair squares (I/J merged); plain squares are standard, keyed squares from two keys; doubles allowed, odd tails padded with X (Q for X). */
T.fourSquareEncode = function (s, key1, key2) {
  var plain = T.playfairSquare('A');
  var sq1 = T.playfairSquare(key1 === undefined ? 'EXAMPLE' : key1);
  var sq2 = T.playfairSquare(key2 === undefined ? 'KEYWORD' : key2);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  if (t.length % 2) t += (t.charAt(t.length - 1) === 'X' ? 'Q' : 'X');
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var ia = plain.pos[t.charAt(i)]; var ib = plain.pos[t.charAt(i + 1)];
    var ra = (ia / 5) | 0, ca = ia % 5, rb = (ib / 5) | 0, cb = ib % 5;
    out += sq1.seq[ra * 5 + cb] + sq2.seq[rb * 5 + ca];
  }
  return out;
};
T.fourSquareDecode = function (s, key1, key2) {
  var plain = T.playfairSquare('A');
  var sq1 = T.playfairSquare(key1 === undefined ? 'EXAMPLE' : key1);
  var sq2 = T.playfairSquare(key2 === undefined ? 'KEYWORD' : key2);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (t.length % 2) throw new Error('Bad four-square input \u2014 need letter pairs, saw ' + t.length);
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var ic = sq1.pos[t.charAt(i)]; var id = sq2.pos[t.charAt(i + 1)];
    if (ic === undefined || id === undefined) throw new Error('Bad four-square input \u2014 A-Z only');
    var rc = (ic / 5) | 0, cc = ic % 5, rd = (id / 5) | 0, cd = id % 5;
    out += plain.seq[rc * 5 + cd] + plain.seq[rd * 5 + cc];
  }
  return out;
};
T.fourSquareCipher = function (s, opts) { var o = opts || {}; var k1 = o.key1 === undefined ? 'EXAMPLE' : o.key1; var k2 = o.key2 === undefined ? 'KEYWORD' : o.key2; if ((o.mode || 'encode') === 'decode') return T.fourSquareDecode(s, k1, k2); return T.fourSquareEncode(s, k1, k2); };
/* ADFGX cores: Polybius fractionation through a Playfair square (I/J merged) plus a columnar transposition stage; output is A/D/F/G/X only. */
T.adfgxEncode = function (s, squareKey, transKey) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var tk = transKey === undefined ? 'ZEBRAS' : transKey;
  T.columnarOrder(tk);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  var labels = ['A', 'D', 'F', 'G', 'X'];
  var frac = '';
  for (var i = 0; i < t.length; i++) { var p = sq.pos[t.charAt(i)]; frac += labels[(p / 5) | 0] + labels[p % 5]; }
  return T.columnarEncode(frac, tk);
};
T.adfgxDecode = function (s, squareKey, transKey) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var tk = transKey === undefined ? 'ZEBRAS' : transKey;
  T.columnarOrder(tk);
  var c = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!c) return '';
  var interim = T.columnarDecode(c, tk);
  if (interim.length % 2) throw new Error('Bad ADFGX input \u2014 need pairs, saw ' + interim.length);
  if (!/^[ADFGX]*$/.test(interim)) throw new Error('Bad ADFGX input \u2014 A/D/F/G/X only');
  var lab = { A: 0, D: 1, F: 2, G: 3, X: 4 };
  var out = '';
  for (var i = 0; i < interim.length; i += 2) out += sq.seq[lab[interim.charAt(i)] * 5 + lab[interim.charAt(i + 1)]];
  return out;
};
T.adfgxCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; var k = o.trans === undefined ? 'ZEBRAS' : o.trans; if ((o.mode || 'encode') === 'decode') return T.adfgxDecode(s, q, k); return T.adfgxEncode(s, q, k); };
/* ADFGVX cores: 6x6 square (A-Z0-9, J kept) plus columnar stage; output is A/D/F/G/V/X only, digits supported. */
T.adfgvxSquare = function (key) {
  var k = String(key === undefined ? 'KEYWORD' : key).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!k) throw new Error('Enter an alphanumeric key \u2014 A-Z0-9 builds the 6x6 square');
  var seen = {}; var seq = [];
  var full = k + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (var i = 0; i < full.length; i++) { var c = full.charAt(i); if (!seen[c]) { seen[c] = 1; seq.push(c); } }
  var pos = {}; for (var j = 0; j < seq.length; j++) pos[seq[j]] = j;
  return { seq: seq, pos: pos };
};
T.adfgvxEncode = function (s, squareKey, transKey) {
  var sq = T.adfgvxSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var tk = transKey === undefined ? 'ZEBRAS' : transKey;
  T.columnarOrder(tk);
  var t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!t) return '';
  var labels = ['A', 'D', 'F', 'G', 'V', 'X'];
  var frac = '';
  for (var i = 0; i < t.length; i++) { var p = sq.pos[t.charAt(i)]; frac += labels[(p / 6) | 0] + labels[p % 6]; }
  return T.columnarEncode(frac, tk);
};
T.adfgvxDecode = function (s, squareKey, transKey) {
  var sq = T.adfgvxSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var tk = transKey === undefined ? 'ZEBRAS' : transKey;
  T.columnarOrder(tk);
  var c = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!c) return '';
  var interim = T.columnarDecode(c, tk);
  if (interim.length % 2) throw new Error('Bad ADFGVX input \u2014 need pairs, saw ' + interim.length);
  if (!/^[ADFGVX]*$/.test(interim)) throw new Error('Bad ADFGVX input \u2014 A/D/F/G/V/X only');
  var lab = { A: 0, D: 1, F: 2, G: 3, V: 4, X: 5 };
  var out = '';
  for (var i = 0; i < interim.length; i += 2) out += sq.seq[lab[interim.charAt(i)] * 6 + lab[interim.charAt(i + 1)]];
  return out;
};
T.adfgvxCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; var k = o.trans === undefined ? 'ZEBRAS' : o.trans; if ((o.mode || 'encode') === 'decode') return T.adfgvxDecode(s, q, k); return T.adfgvxEncode(s, q, k); };
/* Two-square cores: horizontal digraph across two keyed Playfair squares (I/J merged); same-row shifts right, otherwise rectangle swaps columns; doubles allowed, odd tails padded. */
T.twoSquareEncode = function (s, key1, key2) {
  var sq1 = T.playfairSquare(key1 === undefined ? 'EXAMPLE' : key1);
  var sq2 = T.playfairSquare(key2 === undefined ? 'KEYWORD' : key2);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  if (t.length % 2) t += (t.charAt(t.length - 1) === 'X' ? 'Q' : 'X');
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var ia = sq1.pos[t.charAt(i)]; var ib = sq2.pos[t.charAt(i + 1)];
    var ra = (ia / 5) | 0, ca = ia % 5, rb = (ib / 5) | 0, cb = ib % 5;
    if (ra === rb) out += sq1.seq[ra * 5 + (ca + 1) % 5] + sq2.seq[rb * 5 + (cb + 1) % 5];
    else out += sq1.seq[ra * 5 + cb] + sq2.seq[rb * 5 + ca];
  }
  return out;
};
T.twoSquareDecode = function (s, key1, key2) {
  var sq1 = T.playfairSquare(key1 === undefined ? 'EXAMPLE' : key1);
  var sq2 = T.playfairSquare(key2 === undefined ? 'KEYWORD' : key2);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (t.length % 2) throw new Error('Bad two-square input \u2014 need letter pairs, saw ' + t.length);
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var ic = sq1.pos[t.charAt(i)]; var id = sq2.pos[t.charAt(i + 1)];
    if (ic === undefined || id === undefined) throw new Error('Bad two-square input \u2014 A-Z only');
    var rc = (ic / 5) | 0, cc = ic % 5, rd = (id / 5) | 0, cd = id % 5;
    if (rc === rd) out += sq1.seq[rc * 5 + (cc + 4) % 5] + sq2.seq[rd * 5 + (cd + 4) % 5];
    else out += sq1.seq[rc * 5 + cd] + sq2.seq[rd * 5 + cc];
  }
  return out;
};
T.twoSquareCipher = function (s, opts) { var o = opts || {}; var k1 = o.key1 === undefined ? 'EXAMPLE' : o.key1; var k2 = o.key2 === undefined ? 'KEYWORD' : o.key2; if ((o.mode || 'encode') === 'decode') return T.twoSquareDecode(s, k1, k2); return T.twoSquareEncode(s, k1, k2); };
/* Hill cores: 2x2 matrix mod 26; determinant must be coprime to 26, full A-Z kept, odd tails padded with X. */
T.hillKey = function (a, b, c, d) {
  var m = [a, b, c, d].map(function (v, i) { var n = parseInt(v, 10); if (isNaN(n) || n < 0 || n > 25) throw new Error('Hill key numbers must be 0-25 \u2014 saw ' + v); return n; });
  var det = ((m[0] * m[3] - m[1] * m[2]) % 26 + 26) % 26;
  var g = (function (x, y) { while (y) { var t = x % y; x = y; y = t; } return x; })(det, 26);
  if (g !== 1) throw new Error('Key matrix not invertible \u2014 determinant ' + det + ' shares a factor with 26');
  var inv = 1; for (var i = 1; i < 26; i++) if ((det * i) % 26 === 1) { inv = i; break; }
  return { m: m, det: det, inv: inv };
};
T.hillEncode = function (s, a, b, c, d) {
  var k = T.hillKey(a === undefined ? 3 : a, b === undefined ? 3 : b, c === undefined ? 2 : c, d === undefined ? 5 : d);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  if (t.length % 2) t += 'X';
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var x0 = t.charCodeAt(i) - 65, x1 = t.charCodeAt(i + 1) - 65;
    out += String.fromCharCode(65 + (k.m[0] * x0 + k.m[1] * x1) % 26) + String.fromCharCode(65 + (k.m[2] * x0 + k.m[3] * x1) % 26);
  }
  return out;
};
T.hillDecode = function (s, a, b, c, d) {
  var k = T.hillKey(a === undefined ? 3 : a, b === undefined ? 3 : b, c === undefined ? 2 : c, d === undefined ? 5 : d);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (t.length % 2) throw new Error('Bad Hill input \u2014 need letter pairs, saw ' + t.length);
  var ai = (k.m[3] * k.inv) % 26, bi = ((26 - k.m[1]) * k.inv) % 26, ci = ((26 - k.m[2]) * k.inv) % 26, di = (k.m[0] * k.inv) % 26;
  var out = '';
  for (var i = 0; i < t.length; i += 2) {
    var y0 = t.charCodeAt(i) - 65, y1 = t.charCodeAt(i + 1) - 65;
    out += String.fromCharCode(65 + (ai * y0 + bi * y1) % 26) + String.fromCharCode(65 + (ci * y0 + di * y1) % 26);
  }
  return out;
};
T.hillCipher = function (s, opts) { var o = opts || {}; var a = o.ka === undefined ? 3 : o.ka, b = o.kb === undefined ? 3 : o.kb, c = o.kc === undefined ? 2 : o.kc, d = o.kd === undefined ? 5 : o.kd; if ((o.mode || 'encode') === 'decode') return T.hillDecode(s, a, b, c, d); return T.hillEncode(s, a, b, c, d); };
/* Straddling checkerboard cores: 8 frequent letters take 1 digit (2-9), rest take row 0/1 plus column; 10/11 are blank and rejected. */
T.straddleBoard = function (key) {
  var k = String(key === undefined ? 'KEYWORD' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 A-Z builds the board');
  var seen = {}; var seq = [];
  var full = k + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (var i = 0; i < full.length; i++) { var c = full.charAt(i); if (!seen[c]) { seen[c] = 1; seq.push(c); } }
  var r0 = seq.slice(0, 8), r1 = seq.slice(8, 18), r2 = seq.slice(18, 26);
  var enc = {}, dec = {};
  for (i = 0; i < 8; i++) { enc[r0[i]] = String(i + 2); dec[String(i + 2)] = r0[i]; }
  for (i = 0; i < 10; i++) { enc[r1[i]] = '0' + i; dec['0' + i] = r1[i]; }
  for (i = 0; i < 8; i++) { enc[r2[i]] = '1' + (i + 2); dec['1' + (i + 2)] = r2[i]; }
  return { enc: enc, dec: dec };
};
T.straddleEncode = function (s, key) {
  var b = T.straddleBoard(key);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = '';
  for (var i = 0; i < t.length; i++) out += b.enc[t.charAt(i)];
  return out;
};
T.straddleDecode = function (s, key) {
  var b = T.straddleBoard(key);
  var t = String(s).replace(/[^0-9]/g, '');
  var out = ''; var i = 0;
  while (i < t.length) {
    var c = t.charAt(i);
    if (c === '0' || c === '1') {
      if (i + 1 >= t.length) throw new Error('Bad checkerboard input \u2014 truncated row ' + c);
      var code = c + t.charAt(i + 1);
      if (!b.dec[code]) throw new Error('Bad checkerboard input \u2014 blank cell ' + code);
      out += b.dec[code]; i += 2;
    } else { out += b.dec[c]; i++; }
  }
  return out;
};
T.straddleCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'KEYWORD' : o.key; if ((o.mode || 'encode') === 'decode') return T.straddleDecode(s, k); return T.straddleEncode(s, k); };
/* Porta cipher: reciprocal polyalphabetic with 13 alphabets (AB share 0 through YZ share 12); key A alone is ROT13, case preserved, non-letters pass through. */
T.portaCipher = function (s, opts) {
  var o = opts || {}; var key = String(o.key === undefined ? 'LEMON' : o.key).replace(/[^a-zA-Z]/g, '');
  if (!key) throw new Error('Enter a letter key \u2014 AB share alphabet 0, CD share 1, and so on');
  var ki = 0;
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    var p = c.charCodeAt(0) - base;
    var kc = key.charCodeAt(ki++ % key.length);
    var k = (kc >= 97 ? kc - 97 : kc - 65) >> 1;
    var q = p < 13 ? 13 + ((p + k) % 13) : (((p - 13 - k) % 13) + 13) % 13;
    return String.fromCharCode(base + q);
  });
};
/* Bifid cores: Polybius coordinates diffused in blocks of period (rows then columns reread as pairs); length preserved, doubles allowed. */
T.bifidPeriod = function (p) {
  var n = p === undefined ? 5 : parseInt(p, 10);
  if (isNaN(n) || n < 2) throw new Error('Period must be 2 or more \u2014 saw ' + p);
  return n;
};
T.bifidEncode = function (s, squareKey, period) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var per = T.bifidPeriod(period === undefined ? 5 : period);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = '';
  for (var st = 0; st < t.length; st += per) {
    var blk = t.slice(st, st + per); var n = blk.length;
    var rows = [], cols = [];
    for (var i = 0; i < n; i++) { var q = sq.pos[blk.charAt(i)]; rows.push((q / 5) | 0); cols.push(q % 5); }
    var combo = rows.concat(cols);
    for (var j = 0; j < n; j++) out += sq.seq[combo[2 * j] * 5 + combo[2 * j + 1]];
  }
  return out;
};
T.bifidDecode = function (s, squareKey, period) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var per = T.bifidPeriod(period === undefined ? 5 : period);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = '';
  for (var st = 0; st < t.length; st += per) {
    var blk = t.slice(st, st + per); var n = blk.length;
    var flat = [];
    for (var i = 0; i < n; i++) { var q = sq.pos[blk.charAt(i)]; flat.push((q / 5) | 0); flat.push(q % 5); }
    for (var j = 0; j < n; j++) out += sq.seq[flat[j] * 5 + flat[n + j]];
  }
  return out;
};
T.bifidCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; var p = o.period === undefined ? '5' : o.period; if ((o.mode || 'encode') === 'decode') return T.bifidDecode(s, q, p); return T.bifidEncode(s, q, p); };
/* Autokey cores: Vigenere keystream extended with the text itself (plain or cipher feedback); case preserved, non-letters pass through. */
T.autokeyVals = function (key) {
  var k = String(key === undefined ? 'LEMON' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 extended with the text itself');
  var v = []; for (var i = 0; i < k.length; i++) v.push(k.charCodeAt(i) - 65);
  return v;
};
T.autokeyEncode = function (s, key, variant) {
  var kv = T.autokeyVals(key); var v = variant || 'plain';
  var str = String(s); var P = [];
  for (var i = 0; i < str.length; i++) { var ch = str.charAt(i); if (/[a-zA-Z]/.test(ch)) { var up = ch.toUpperCase().charCodeAt(0) - 65; P.push({ val: up, lower: ch.charCodeAt(0) >= 97 }); } }
  var C = [];
  for (var j = 0; j < P.length; j++) { var si = j < kv.length ? kv[j] : (v === 'cipher' ? C[j - kv.length] : P[j - kv.length].val); C.push((P[j].val + si) % 26); }
  var out = ''; var li = 0;
  for (var m = 0; m < str.length; m++) { var c = str.charAt(m); if (/[a-zA-Z]/.test(c)) { var n = C[li]; out += String.fromCharCode((P[li].lower ? 97 : 65) + n); li++; } else out += c; }
  return out;
};
T.autokeyDecode = function (s, key, variant) {
  var kv = T.autokeyVals(key); var v = variant || 'plain';
  var str = String(s); var C = [];
  for (var i = 0; i < str.length; i++) { var ch = str.charAt(i); if (/[a-zA-Z]/.test(ch)) { var up = ch.toUpperCase().charCodeAt(0) - 65; C.push({ val: up, lower: ch.charCodeAt(0) >= 97 }); } }
  var P = [];
  for (var j = 0; j < C.length; j++) { var si = j < kv.length ? kv[j] : (v === 'cipher' ? C[j - kv.length].val : P[j - kv.length]); P.push(((C[j].val - si) % 26 + 26) % 26); }
  var out = ''; var li = 0;
  for (var m = 0; m < str.length; m++) { var c = str.charAt(m); if (/[a-zA-Z]/.test(c)) { out += String.fromCharCode((C[li].lower ? 97 : 65) + P[li]); li++; } else out += c; }
  return out;
};
T.autokeyCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'LEMON' : o.key; var v = o.variant === undefined ? 'plain' : o.variant; if ((o.mode || 'encode') === 'decode') return T.autokeyDecode(s, k, v); return T.autokeyEncode(s, k, v); };
/* Columnar cores: keyword-ordered columns (stable for duplicate letters), no padding, uneven columns handled, code points preserved. */
T.columnarOrder = function (key) {
  var k = String(key === undefined ? 'ZEBRAS' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 A-Z orders the columns');
  var idx = []; for (var i = 0; i < k.length; i++) idx.push(i);
  idx.sort(function (a, b) { var ca = k.charAt(a), cb = k.charAt(b); if (ca < cb) return -1; if (ca > cb) return 1; return a - b; });
  return { k: k, order: idx };
};
/* Trifid cores: 3x3x3 cube (A-Z plus .) diffused in blocks of period; length preserved, period reuses the Bifid guard. */
T.trifidCube = function (key) {
  var k = String(key === undefined ? 'KEYWORD' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 A-Z builds the cube');
  var seen = {}; var seq = [];
  var full = k + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.';
  for (var i = 0; i < full.length; i++) { var c = full.charAt(i); if (!seen[c]) { seen[c] = 1; seq.push(c); } }
  var pos = {}; for (var j = 0; j < seq.length; j++) pos[seq[j]] = j;
  return { seq: seq, pos: pos };
};
T.trifidEncode = function (s, squareKey, period) {
  var sq = T.trifidCube(squareKey === undefined ? 'KEYWORD' : squareKey);
  var per = T.bifidPeriod(period === undefined ? 5 : period);
  var t = String(s).toUpperCase().replace(/[^A-Z.]/g, '');
  if (!t) return '';
  var out = '';
  for (var st = 0; st < t.length; st += per) {
    var blk = t.slice(st, st + per); var n = blk.length;
    var lay = [], row = [], col = [];
    for (var i = 0; i < n; i++) { var q = sq.pos[blk.charAt(i)]; lay.push((q / 9) | 0); row.push(((q % 9) / 3) | 0); col.push(q % 3); }
    var combo = lay.concat(row, col);
    for (var j = 0; j < n; j++) out += sq.seq[combo[3 * j] * 9 + combo[3 * j + 1] * 3 + combo[3 * j + 2]];
  }
  return out;
};
T.trifidDecode = function (s, squareKey, period) {
  var sq = T.trifidCube(squareKey === undefined ? 'KEYWORD' : squareKey);
  var per = T.bifidPeriod(period === undefined ? 5 : period);
  var t = String(s).toUpperCase().replace(/[^A-Z.]/g, '');
  if (!t) return '';
  var out = '';
  for (var st = 0; st < t.length; st += per) {
    var blk = t.slice(st, st + per); var n = blk.length;
    var flat = [];
    for (var i = 0; i < n; i++) { var q = sq.pos[blk.charAt(i)]; flat.push((q / 9) | 0); flat.push(((q % 9) / 3) | 0); flat.push(q % 3); }
    for (var j = 0; j < n; j++) out += sq.seq[flat[j] * 9 + flat[n + j] * 3 + flat[2 * n + j]];
  }
  return out;
};
T.trifidCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; var p = o.period === undefined ? '5' : o.period; if ((o.mode || 'encode') === 'decode') return T.trifidDecode(s, q, p); return T.trifidEncode(s, q, p); };
T.columnarEncode = function (s, key) {
  var o = T.columnarOrder(key); var cols = o.k.length;
  var str = Array.from(String(s)); var n = str.length;
  if (!n || cols <= 1) return String(s);
  var rows = Math.ceil(n / cols); var order = o.order; var out = [];
  for (var oi = 0; oi < order.length; oi++) { var c = order[oi]; for (var r = 0; r < rows; r++) { var ix = r * cols + c; if (ix < n) out.push(str[ix]); } }
  return out.join('');
};
/* Beaufort cipher: reciprocal Vigenere variant (key minus plaintext); key A maps B to Z, case preserved, non-letters pass through. */
T.beaufortCipher = function (s, opts) {
  var o = opts || {}; var key = String(o.key === undefined ? 'LEMON' : o.key).replace(/[^a-zA-Z]/g, '');
  if (!key) throw new Error('Enter a letter key \u2014 A leaves B as Z, Z as B');
  var ki = 0;
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    var p = c.charCodeAt(0) - base;
    var kc = key.charCodeAt(ki++ % key.length);
    var k = kc >= 97 ? kc - 97 : kc - 65;
    return String.fromCharCode(base + (((k - p) % 26 + 26) % 26));
  });
};
/* Running-key cores: book keystream never repeated (key must cover every letter); case preserved, non-letters pass through. */
T.runningKeyVals = function (key, need) {
  var k = String(key === undefined ? 'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a book key \u2014 letters only, never repeated');
  if (k.length < need) throw new Error('Book key too short \u2014 need ' + need + ' letters, saw ' + k.length);
  var v = []; for (var i = 0; i < k.length; i++) v.push(k.charCodeAt(i) - 65);
  return v;
};
T.runningKeyEncode = function (s, key) {
  var str = String(s); var P = [];
  for (var i = 0; i < str.length; i++) { var ch = str.charAt(i); if (/[a-zA-Z]/.test(ch)) P.push({ val: ch.toUpperCase().charCodeAt(0) - 65, lower: ch.charCodeAt(0) >= 97 }); }
  var kv = T.runningKeyVals(key, P.length);
  var C = []; for (var j = 0; j < P.length; j++) C.push((P[j].val + kv[j]) % 26);
  var out = ''; var li = 0;
  for (var m = 0; m < str.length; m++) { var c = str.charAt(m); if (/[a-zA-Z]/.test(c)) { out += String.fromCharCode((P[li].lower ? 97 : 65) + C[li]); li++; } else out += c; }
  return out;
};
T.runningKeyDecode = function (s, key) {
  var str = String(s); var C = [];
  for (var i = 0; i < str.length; i++) { var ch = str.charAt(i); if (/[a-zA-Z]/.test(ch)) C.push({ val: ch.toUpperCase().charCodeAt(0) - 65, lower: ch.charCodeAt(0) >= 97 }); }
  var kv = T.runningKeyVals(key, C.length);
  var P = []; for (var j = 0; j < C.length; j++) P.push(((C[j].val - kv[j]) % 26 + 26) % 26);
  var out = ''; var li = 0;
  for (var m = 0; m < str.length; m++) { var c = str.charAt(m); if (/[a-zA-Z]/.test(c)) { out += String.fromCharCode((C[li].lower ? 97 : 65) + P[li]); li++; } else out += c; }
  return out;
};
T.runningKeyCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG' : o.key; if ((o.mode || 'encode') === 'decode') return T.runningKeyDecode(s, k); return T.runningKeyEncode(s, k); };
T.columnarDecode = function (s, key) {
  var o = T.columnarOrder(key); var cols = o.k.length;
  var str = Array.from(String(s)); var n = str.length;
  if (!n || cols <= 1) return String(s);
  var rows = Math.ceil(n / cols); var full = Math.floor(n / cols); var rem = n % cols;
  var h = []; for (var c = 0; c < cols; c++) h.push(full + (c < rem ? 1 : 0));
  var data = []; for (var i = 0; i < cols; i++) data.push([]);
  var off = 0; var order = o.order;
  for (var oi = 0; oi < order.length; oi++) { var cc = order[oi]; var hh = h[cc]; data[cc] = str.slice(off, off + hh); off += hh; }
  var pos = []; for (var q = 0; q < cols; q++) pos.push(0);
  var out = [];
  for (var r = 0; r < rows; r++) for (var c2 = 0; c2 < cols; c2++) if (pos[c2] < data[c2].length) out.push(data[c2][pos[c2]++]);
  return out.join('');
};
/* Gronsfeld cipher: numeric-key Vigenere (digits 0-9 shift letters); key repeats, case preserved, non-letters pass through. */
T.gronsfeldCipher = function (s, opts) {
  var o = opts || {}; var key = String(o.key === undefined ? '31415' : o.key).replace(/[^0-9]/g, '');
  if (!key) throw new Error('Enter a digit key \u2014 0-9 shift the letters');
  var dir = (o.mode || 'encode') === 'decode' ? -1 : 1; var ki = 0;
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    var p = c.charCodeAt(0) - base;
    var k = key.charCodeAt(ki++ % key.length) - 48;
    return String.fromCharCode(base + (((p + dir * k) % 26 + 26) % 26));
  });
};
/* Chaocipher cores: two evolving alphabets (left and right wheels permute differently after every letter); A-Z only, other characters stripped. */
T.chaoWheel = function (key) {
  var k = String(key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 A-Z seeds the wheel');
  var seen = {}; var w = [];
  var full = k + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (var i = 0; i < full.length; i++) { var c = full.charAt(i); if (!seen[c]) { seen[c] = 1; w.push(c); } }
  return w;
};
T.chaoRot = function (w, k) { var s = ((k % w.length) + w.length) % w.length; return w.slice(s).concat(w.slice(0, s)); };
T.chaoEvolveL = function (w, i) { var r = T.chaoRot(w, i); var x = r.shift(); r.splice(13, 0, x); return T.chaoRot(r, 1); };
T.chaoEvolveR = function (w, i) { var r = T.chaoRot(w, i + 1); var x = r.shift(); r.splice(13, 0, x); return r; };
T.chaoEncode = function (s, key1, key2) {
  var L = T.chaoWheel(key1 === undefined ? 'CHAOCIPHER' : key1);
  var R = T.chaoWheel(key2 === undefined ? 'CIPHERTEXT' : key2);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  var out = '';
  for (var i = 0; i < t.length; i++) { var at = L.indexOf(t.charAt(i)); out += R[at]; L = T.chaoEvolveL(L, at); R = T.chaoEvolveR(R, at); }
  return out;
};
T.chaoDecode = function (s, key1, key2) {
  var L = T.chaoWheel(key1 === undefined ? 'CHAOCIPHER' : key1);
  var R = T.chaoWheel(key2 === undefined ? 'CIPHERTEXT' : key2);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  var out = '';
  for (var i = 0; i < t.length; i++) { var at = R.indexOf(t.charAt(i)); out += L[at]; L = T.chaoEvolveL(L, at); R = T.chaoEvolveR(R, at); }
  return out;
};
T.chaoCipher = function (s, opts) { var o = opts || {}; var k1 = o.key1 === undefined ? 'CHAOCIPHER' : o.key1; var k2 = o.key2 === undefined ? 'CIPHERTEXT' : o.key2; if ((o.mode || 'encode') === 'decode') return T.chaoDecode(s, k1, k2); return T.chaoEncode(s, k1, k2); };
T.columnarCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'ZEBRAS' : o.key; if ((o.mode || 'encode') === 'decode') return T.columnarDecode(s, k); return T.columnarEncode(s, k); };
T.base32Encode = function (s) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var bytes = new TextEncoder().encode(s);
  var bits = '', result = '';
  for (var i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  for (var j = 0; j < bits.length; j += 5) result += alphabet[parseInt(bits.slice(j, j + 5), 2)];
  while (result.length % 8 !== 0) result += '=';
  return result;
};
/* Morbit cores: Morse symbols grouped in pairs become digits 1-9 (.. is 1 through xx is 9); letter separator is x, odd tails padded with x. */
T.morbitPairs = ['..', '.-', '.x', '-.', '--', '-x', 'x.', 'x-', 'xx'];
T.morbitEncode = function (s) {
  var t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!t) return '';
  var stream = '';
  for (var i = 0; i < t.length; i++) stream += morseMap[t.charAt(i)] + 'x';
  if (stream.length % 2) stream += 'x';
  var out = '';
  for (var j = 0; j < stream.length; j += 2) out += String(T.morbitPairs.indexOf(stream.slice(j, j + 2)) + 1);
  return out;
};
T.morbitDecode = function (s) {
  var c = String(s).replace(/[^0-9]/g, '');
  if (!c) return '';
  if (!/^[1-9]*$/.test(c)) throw new Error('Bad Morbit input \u2014 digits 1-9 only');
  var stream = '';
  for (var i = 0; i < c.length; i++) stream += T.morbitPairs[c.charAt(i) - 1];
  var out = '';
  var codes = stream.split('x');
  for (var j = 0; j < codes.length; j++) { if (!codes[j]) continue; var ch = revMorse[codes[j]]; if (!ch) throw new Error('Bad Morbit input \u2014 unknown Morse ' + codes[j]); out += ch; }
  return out;
};
T.morbitCipher = function (s, opts) { var o = opts || {}; if ((o.mode || 'encode') === 'decode') return T.morbitDecode(s); return T.morbitEncode(s); };
/* Pollux cores: Morse symbols grouped in triplets become letters A-Z plus . (... is A through xxx is .); letter separator is x, short tails padded with x. */
T.polluxTrips = (function () { var syms = ['.', '-', 'x'], out = []; for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) for (var cc = 0; cc < 3; cc++) out.push(syms[a] + syms[b] + syms[cc]); return out; })();
T.polluxAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.';
T.polluxEncode = function (s) {
  var t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!t) return '';
  var stream = '';
  for (var i = 0; i < t.length; i++) stream += morseMap[t.charAt(i)] + 'x';
  while (stream.length % 3) stream += 'x';
  var out = '';
  for (var j = 0; j < stream.length; j += 3) out += T.polluxAlphabet.charAt(T.polluxTrips.indexOf(stream.slice(j, j + 3)));
  return out;
};
T.polluxDecode = function (s) {
  var c = String(s).toUpperCase().replace(/\s/g, '');
  if (!c) return '';
  if (/[^A-Z.]/.test(c)) throw new Error('Bad Pollux input \u2014 letters A-Z and . only');
  var stream = '';
  for (var i = 0; i < c.length; i++) { var p = T.polluxAlphabet.indexOf(c.charAt(i)); if (p < 0) throw new Error('Bad Pollux input \u2014 letters A-Z and . only'); stream += T.polluxTrips[p]; }
  var out = '';
  var codes = stream.split('x');
  for (var j = 0; j < codes.length; j++) { if (!codes[j]) continue; var ch = revMorse[codes[j]]; if (!ch) throw new Error('Bad Pollux input \u2014 unknown Morse ' + codes[j]); out += ch; }
  return out;
};
T.polluxCipher = function (s, opts) { var o = opts || {}; if ((o.mode || 'encode') === 'decode') return T.polluxDecode(s); return T.polluxEncode(s); };
/* Nihilist cores: Polybius numbers (row/col 1-5, J folds to I) added to the repeating key numbers; cipher is space-separated sums, decode subtracts. */
T.nihilistNum = function (ch, sq) { var q = sq.pos[ch]; return ((q / 5) | 0) * 10 + (q % 5) + 11; };
T.nihilistKey = function (key) {
  var k = String(key === undefined ? 'LEMON' : key).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 Nihilist adds the key numbers');
  return k;
};
T.nihilistEncode = function (s, squareKey, key) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var k = T.nihilistKey(key);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = [];
  for (var i = 0; i < t.length; i++) out.push(String(T.nihilistNum(t.charAt(i), sq) + T.nihilistNum(k.charAt(i % k.length), sq)));
  return out.join(' ');
};
T.nihilistDecode = function (s, squareKey, key) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var k = T.nihilistKey(key);
  var toks = String(s).trim().split(/\s+/);
  if (toks.length === 1 && !toks[0]) return '';
  var out = '';
  for (var i = 0; i < toks.length; i++) {
    if (!/^\d+$/.test(toks[i])) throw new Error('Bad Nihilist input \u2014 numbers separated by spaces');
    var d = parseInt(toks[i], 10) - T.nihilistNum(k.charAt(i % k.length), sq);
    var r = (d / 10) | 0, c = d % 10;
    if (!(r >= 1 && r <= 5 && c >= 1 && c <= 5)) throw new Error('Bad Nihilist number ' + toks[i] + ' \u2014 out of square after subtracting the key');
    out += sq.seq[(r - 1) * 5 + (c - 1)];
  }
  return out;
};
T.nihilistCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; var kk = o.key === undefined ? 'LEMON' : o.key; if ((o.mode || 'encode') === 'decode') return T.nihilistDecode(s, q, kk); return T.nihilistEncode(s, q, kk); };
/* Polybius cores: keyed 5x5 square (J folds to I) read as row/col digit pairs; cipher is an even run of digits 1-5. */
T.polybiusEncode = function (s, squareKey) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var t = String(s).toUpperCase().replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = '';
  for (var i = 0; i < t.length; i++) out += String(T.nihilistNum(t.charAt(i), sq));
  return out;
};
T.polybiusDecode = function (s, squareKey) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var c = String(s).replace(/\s/g, '');
  if (!c) return '';
  if (/[^1-5]/.test(c)) throw new Error('Bad Polybius input \u2014 digits 1-5 only');
  if (c.length % 2) throw new Error('Bad Polybius input \u2014 need digit pairs');
  var out = '';
  for (var i = 0; i < c.length; i += 2) out += sq.seq[(c.charCodeAt(i) - 49) * 5 + (c.charCodeAt(i + 1) - 49)];
  return out;
};
T.polybiusCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; if ((o.mode || 'encode') === 'decode') return T.polybiusDecode(s, q); return T.polybiusEncode(s, q); };
/* Cadenus cores: columnar transposition where each column also takes a Caesar shift from its key letter (A=0); grid written row-wise, read in key order, uneven tails handled. */
T.cadenusEncode = function (s, key) {
  var o = T.columnarOrder(key === undefined ? 'ZEBRAS' : key);
  var k = o.k, cols = k.length;
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var rows = Math.ceil(t.length / cols);
  var out = [];
  for (var oi = 0; oi < o.order.length; oi++) {
    var c = o.order[oi];
    var sh = k.charCodeAt(c) - 65;
    for (var r = 0; r < rows; r++) { var ix = r * cols + c; if (ix < t.length) out.push(String.fromCharCode(65 + ((t.charCodeAt(ix) - 65 + sh) % 26))); }
  }
  return out.join('');
};
T.cadenusDecode = function (s, key) {
  var o = T.columnarOrder(key === undefined ? 'ZEBRAS' : key);
  var k = o.k, cols = k.length;
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var n = t.length;
  var rows = Math.ceil(n / cols);
  var full = Math.floor(n / cols), rem = n % cols;
  var data = [];
  for (var i = 0; i < cols; i++) data.push('');
  var off = 0;
  for (var oi2 = 0; oi2 < o.order.length; oi2++) {
    var cc = o.order[oi2];
    var hh = full + (cc < rem ? 1 : 0);
    var part = t.slice(off, off + hh);
    off += hh;
    var sh2 = k.charCodeAt(cc) - 65;
    var dec = '';
    for (var q = 0; q < part.length; q++) dec += String.fromCharCode(65 + (((part.charCodeAt(q) - 65 - sh2) % 26 + 26) % 26));
    data[cc] = dec;
  }
  var out = [];
  for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) if (r2 < data[c2].length) out.push(data[c2].charAt(r2));
  return out.join('');
};
T.cadenusCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'ZEBRAS' : o.key; if ((o.mode || 'encode') === 'decode') return T.cadenusDecode(s, k); return T.cadenusEncode(s, k); };
/* Redefence cores: rail-fence zigzag across key.length rails, read off in key order; single-rail or longer-than-text keys pass through, all characters kept. */
T.redefenceEncode = function (s, key) {
  var o = T.columnarOrder(key === undefined ? 'ZEBRAS' : key);
  var R = o.k.length;
  var str = Array.from(String(s));
  var n = str.length;
  if (!n) return '';
  if (R <= 1 || R >= n) return String(s);
  var rows = []; for (var i = 0; i < R; i++) rows.push([]);
  var rail = 0, dir = 1;
  for (var k = 0; k < n; k++) { rows[rail].push(str[k]); if (rail === 0) dir = 1; else if (rail === R - 1) dir = -1; rail += dir; }
  var out = [];
  for (var oi = 0; oi < o.order.length; oi++) out.push(rows[o.order[oi]].join(''));
  return out.join('');
};
T.redefenceDecode = function (s, key) {
  var o = T.columnarOrder(key === undefined ? 'ZEBRAS' : key);
  var R = o.k.length;
  var str = Array.from(String(s));
  var n = str.length;
  if (!n) return '';
  if (R <= 1 || R >= n) return String(s);
  var pat = []; var rail = 0, dir = 1;
  for (var k = 0; k < n; k++) { pat.push(rail); if (rail === 0) dir = 1; else if (rail === R - 1) dir = -1; rail += dir; }
  var counts = []; for (var i = 0; i < R; i++) counts.push(0);
  for (var j = 0; j < n; j++) counts[pat[j]]++;
  var rows = []; var off = 0;
  for (var oi = 0; oi < o.order.length; oi++) { var rr = o.order[oi]; rows[rr] = str.slice(off, off + counts[rr]); off += counts[rr]; }
  var pos = []; for (var q = 0; q < R; q++) pos.push(0);
  var out = [];
  for (var m = 0; m < n; m++) { var r2 = pat[m]; out.push(rows[r2][pos[r2]++]); }
  return out.join('');
};
T.redefenceCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'ZEBRAS' : o.key; if ((o.mode || 'encode') === 'decode') return T.redefenceDecode(s, k); return T.redefenceEncode(s, k); };
/* Tap cores: knock-code dot groups from the keyed 5x5 square (J folds to I); letters in a word space apart, words split on /. */
T.tapEncode = function (s, squareKey) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var raw = String(s).toUpperCase().replace(/J/g, 'I');
  var parts = raw.split(/[^A-Z]+/).filter(function (w) { return w; });
  if (!parts.length) return '';
  return parts.map(function (w) {
    var letters = [];
    for (var i = 0; i < w.length; i++) { var n = T.nihilistNum(w.charAt(i), sq); letters.push(new Array(((n / 10) | 0) + 1).join('.') + ' ' + new Array((n % 10) + 1).join('.')); }
    return letters.join(' ');
  }).join(' / ');
};
T.tapDecode = function (s, squareKey) {
  var sq = T.playfairSquare(squareKey === undefined ? 'KEYWORD' : squareKey);
  var raw = String(s);
  if (!raw.trim()) return '';
  if (/[^.\s/]/.test(raw)) throw new Error('Bad Tap input \u2014 dots, spaces and / only');
  var words = raw.trim().split(/\s*\/\s*/);
  var out = [];
  for (var w = 0; w < words.length; w++) {
    var runs = words[w].trim().split(/\s+/);
    if (runs.length === 1 && !runs[0]) { out.push(''); continue; }
    if (runs.length % 2) throw new Error('Bad Tap input \u2014 need dot pairs, saw ' + runs.length + ' group(s)');
    var word = '';
    for (var i = 0; i < runs.length; i += 2) {
      if (!/^\.{1,5}$/.test(runs[i]) || !/^\.{1,5}$/.test(runs[i + 1])) throw new Error('Bad Tap group \u2014 1 to 5 dots each');
      word += sq.seq[(runs[i].length - 1) * 5 + (runs[i + 1].length - 1)];
    }
    out.push(word);
  }
  return out.join(' ');
};
T.tapCipher = function (s, opts) { var o = opts || {}; var q = o.square === undefined ? 'KEYWORD' : o.square; if ((o.mode || 'encode') === 'decode') return T.tapDecode(s, q); return T.tapEncode(s, q); };
/* Route cores: text written row-wise into a cols-wide grid, read out along a route (clockwise spiral, row snake or column coil); ragged tails skipped in traversal order, all characters kept. */
T.routeCols = function (cols) {
  var C = cols === undefined ? 5 : parseInt(cols, 10);
  if (isNaN(C) || C < 2) throw new Error('Columns must be 2 or more \u2014 saw ' + cols);
  return C;
};
T.routeOrder = function (rows, cols, route) {
  if (route !== 'spiral' && route !== 'snake' && route !== 'coil') throw new Error('Bad route \u2014 spiral, snake or coil');
  var cells = [];
  var r, c;
  if (route === 'snake') {
    for (r = 0; r < rows; r++) { if (r % 2) { for (c = cols - 1; c >= 0; c--) cells.push([r, c]); } else { for (c = 0; c < cols; c++) cells.push([r, c]); } }
  } else if (route === 'coil') {
    for (c = 0; c < cols; c++) { if (c % 2) { for (r = rows - 1; r >= 0; r--) cells.push([r, c]); } else { for (r = 0; r < rows; r++) cells.push([r, c]); } }
  } else {
    var top = 0, bottom = rows - 1, left = 0, right = cols - 1;
    while (top <= bottom && left <= right) {
      for (c = left; c <= right; c++) cells.push([top, c]);
      top++;
      for (r = top; r <= bottom; r++) cells.push([r, right]);
      right--;
      if (top <= bottom) { for (c = right; c >= left; c--) cells.push([bottom, c]); bottom--; }
      if (left <= right) { for (r = bottom; r >= top; r--) cells.push([r, left]); left++; }
    }
  }
  var order = [];
  for (var i = 0; i < cells.length; i++) order.push(cells[i][0] * cols + cells[i][1]);
  return order;
};
T.routeEncode = function (s, cols, route) {
  var C = T.routeCols(cols);
  var rt = route === undefined ? 'spiral' : route;
  var str = Array.from(String(s));
  var n = str.length;
  if (!n) return '';
  var rows = Math.ceil(n / C);
  var order = T.routeOrder(rows, C, rt).filter(function (ix) { return ix < n; });
  var out = [];
  for (var i = 0; i < order.length; i++) out.push(str[order[i]]);
  return out.join('');
};
T.routeDecode = function (s, cols, route) {
  var C = T.routeCols(cols);
  var rt = route === undefined ? 'spiral' : route;
  var str = Array.from(String(s));
  var n = str.length;
  if (!n) return '';
  var rows = Math.ceil(n / C);
  var order = T.routeOrder(rows, C, rt).filter(function (ix) { return ix < n; });
  var grid = new Array(n);
  for (var i = 0; i < order.length; i++) grid[order[i]] = str[i];
  return grid.join('');
};
T.routeCipher = function (s, opts) { var o = opts || {}; var cc = o.cols === undefined ? '5' : o.cols; var rt = o.route === undefined ? 'spiral' : o.route; if ((o.mode || 'encode') === 'decode') return T.routeDecode(s, cc, rt); return T.routeEncode(s, cc, rt); };
/* Affine cores: multiply-add over the alphabet (multiplier needs a reciprocal mod 26); case preserved, non-letters pass through. */
T.affineCoprime = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
T.affineVals = function (a, b) {
  var A = a === undefined ? 5 : parseInt(a, 10);
  var B = b === undefined ? 8 : parseInt(b, 10);
  if (isNaN(A)) throw new Error('Multiplier must be a number \u2014 one of 1,3,5,7,9,11,15,17,19,21,23,25');
  var Ar = ((A % 26) + 26) % 26;
  if (T.affineCoprime.indexOf(Ar) < 0) throw new Error('Multiplier shares a factor with 26 \u2014 one of 1,3,5,7,9,11,15,17,19,21,23,25');
  if (isNaN(B)) throw new Error('Shift must be a number \u2014 added after multiplying');
  return { a: Ar, b: ((B % 26) + 26) % 26 };
};
T.affineInverse = function (a) {
  for (var i = 1; i < 26; i += 2) if ((a * i) % 26 === 1) return i;
  throw new Error('Multiplier shares a factor with 26 \u2014 one of 1,3,5,7,9,11,15,17,19,21,23,25');
};
T.affineEncode = function (s, a, b) {
  var v = T.affineVals(a, b);
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    return String.fromCharCode(base + ((v.a * (c.charCodeAt(0) - base) + v.b) % 26));
  });
};
T.affineDecode = function (s, a, b) {
  var v = T.affineVals(a, b);
  var inv = T.affineInverse(v.a);
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    return String.fromCharCode(base + ((inv * ((c.charCodeAt(0) - base - v.b + 26) % 26)) % 26));
  });
};
T.affineCipher = function (s, opts) { var o = opts || {}; var A = o.a === undefined ? '5' : o.a; var B = o.b === undefined ? '8' : o.b; if ((o.mode || 'encode') === 'decode') return T.affineDecode(s, A, B); return T.affineEncode(s, A, B); };
/* One-time-pad cores: letter keystream added once and never repeated (key must cover every letter); case preserved, non-letters pass through unconsumed. */
T.otpVals = function (key, need) {
  var k = String(key === undefined ? 'LEMON' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 one-time pad never repeats');
  if (k.length < need) throw new Error('Key too short \u2014 ' + need + ' letters need ' + need + ' key letters, saw ' + k.length);
  var v = [];
  for (var i = 0; i < k.length; i++) v.push(k.charCodeAt(i) - 65);
  return v;
};
T.otpEncode = function (s, key) {
  var str = String(s);
  var need = (str.match(/[a-zA-Z]/g) || []).length;
  var kv = T.otpVals(key, need);
  var ki = 0;
  return str.replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + kv[ki++]) % 26));
  });
};
T.otpDecode = function (s, key) {
  var str = String(s);
  var need = (str.match(/[a-zA-Z]/g) || []).length;
  var kv = T.otpVals(key, need);
  var ki = 0;
  return str.replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    return String.fromCharCode(base + (((c.charCodeAt(0) - base - kv[ki++] + 26) % 26)));
  });
};
T.otpCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'LEMON' : o.key; if ((o.mode || 'encode') === 'decode') return T.otpDecode(s, k); return T.otpEncode(s, k); };
/* Jefferson cores: stacked alphabet rings, plaintext aligned on one row and read off another (offset rows away); each ring must hold 26 unique letters, letters cycle across the rings. */
T.jeffersonDisks = function (disks) {
  var raw = String(disks === undefined ? 'JGRKQUZBAOXNMDTFLVIYEHWSPC,CYGPAQOMRLXWEZDIVKBFJTNSHU,BLQMAVUKGOTSXPZNRWICFEYHJD,URSATLGIKFZHDBVPMQCNOWEYXJ,ZVAFPSDJUNCQLOBWXYRKEGHIMT,GTLKZPNMYAFROIDWSQUCEHBXJV' : disks).toUpperCase().split(/[^A-Z]+/).filter(function (w) { return w; });
  if (!raw.length) throw new Error('Enter disks \u2014 one 26-letter ring each, commas or spaces apart');
  for (var i = 0; i < raw.length; i++) {
    if (raw[i].length !== 26) throw new Error('Disk ' + (i + 1) + ' needs 26 letters \u2014 saw ' + raw[i].length);
    var seen = {};
    for (var j = 0; j < 26; j++) { if (seen[raw[i].charAt(j)]) throw new Error('Disk ' + (i + 1) + ' repeats ' + raw[i].charAt(j) + ' \u2014 26 unique letters'); seen[raw[i].charAt(j)] = 1; }
  }
  return raw;
};
T.jeffersonOffset = function (off) {
  var n = off === undefined ? 1 : parseInt(off, 10);
  if (isNaN(n)) throw new Error('Offset must be a number \u2014 rows away from the plain row');
  return ((n % 26) + 26) % 26;
};
T.jeffersonEncode = function (s, disks, off) {
  var rings = T.jeffersonDisks(disks);
  var sh = T.jeffersonOffset(off);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = '';
  for (var i = 0; i < t.length; i++) { var d = rings[i % rings.length]; out += d.charAt((d.indexOf(t.charAt(i)) + sh) % 26); }
  return out;
};
T.jeffersonDecode = function (s, disks, off) {
  var rings = T.jeffersonDisks(disks);
  var sh = T.jeffersonOffset(off);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var out = '';
  for (var i = 0; i < t.length; i++) { var d = rings[i % rings.length]; out += d.charAt((d.indexOf(t.charAt(i)) - sh + 26) % 26); }
  return out;
};
T.jeffersonCipher = function (s, opts) { var o = opts || {}; var dd = o.disks === undefined ? 'JGRKQUZBAOXNMDTFLVIYEHWSPC,CYGPAQOMRLXWEZDIVKBFJTNSHU,BLQMAVUKGOTSXPZNRWICFEYHJD,URSATLGIKFZHDBVPMQCNOWEYXJ,ZVAFPSDJUNCQLOBWXYRKEGHIMT,GTLKZPNMYAFROIDWSQUCEHBXJV' : o.disks; var oo = o.offset === undefined ? '1' : o.offset; if ((o.mode || 'encode') === 'decode') return T.jeffersonDecode(s, dd, oo); return T.jeffersonEncode(s, dd, oo); };
/* Solitaire cores: Schneier's 54-card keystream (A joker 53 creeps one, B joker 54 creeps two, triple cut, count cut with jokers as 53, output card read down from the top card; joker outputs rerun); deck keyed per key letter, text added mod 26, output grouped in fives. */
T.solitaireNewDeck = function () {
  var d = [];
  for (var i = 1; i <= 54; i++) d.push(i);
  return d;
};
T.solitaireVal = function (c) { return c >= 53 ? 53 : c; };
T.solitaireStep = function (deck) {
  var a = deck.indexOf(53);
  deck.splice(a, 1);
  deck.splice(a >= 53 ? 1 : a + 1, 0, 53);
  var b = deck.indexOf(54);
  deck.splice(b, 1);
  deck.splice(b >= 52 ? b - 51 : b + 2, 0, 54);
  var i1 = deck.indexOf(53), i2 = deck.indexOf(54);
  var lo = i1 < i2 ? i1 : i2, hi = i1 < i2 ? i2 : i1;
  var cut = deck.slice(hi + 1).concat(deck.slice(lo, hi + 1), deck.slice(0, lo));
  for (var i = 0; i < 54; i++) deck[i] = cut[i];
  var n = T.solitaireVal(deck[53]);
  var cc = deck.slice(n, 53).concat(deck.slice(0, n), [deck[53]]);
  for (var j = 0; j < 54; j++) deck[j] = cc[j];
  return deck;
};
T.solitaireKeyedDeck = function (key) {
  var k = String(key === undefined ? 'SOLITAIRE' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 it orders the 54-card deck');
  var deck = T.solitaireNewDeck();
  for (var i = 0; i < k.length; i++) {
    T.solitaireStep(deck);
    var n = k.charCodeAt(i) - 64;
    var cc = deck.slice(n, 53).concat(deck.slice(0, n), [deck[53]]);
    for (var j = 0; j < 54; j++) deck[j] = cc[j];
  }
  return deck;
};
T.solitaireStream = function (deck, need) {
  var out = [];
  var guard = 0;
  while (out.length < need) {
    if (++guard > need * 20 + 100) throw new Error('Keystream stalled \u2014 try another key');
    T.solitaireStep(deck);
    var tv = T.solitaireVal(deck[0]);
    var card = deck[tv];
    if (card >= 53) continue;
    out.push((card - 1) % 26);
  }
  return out;
};
T.solitaireEncode = function (s, key) {
  var deck = T.solitaireKeyedDeck(key);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var ks = T.solitaireStream(deck, t.length);
  var raw = '';
  for (var i = 0; i < t.length; i++) raw += String.fromCharCode(65 + ((t.charCodeAt(i) - 65 + ks[i]) % 26));
  var groups = [];
  for (var g = 0; g < raw.length; g += 5) groups.push(raw.slice(g, g + 5));
  return groups.join(' ');
};
T.solitaireDecode = function (s, key) {
  var deck = T.solitaireKeyedDeck(key);
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var ks = T.solitaireStream(deck, t.length);
  var out = '';
  for (var i = 0; i < t.length; i++) out += String.fromCharCode(65 + (((t.charCodeAt(i) - 65 - ks[i] + 26) % 26)));
  return out;
};
T.solitaireCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'SOLITAIRE' : o.key; if ((o.mode || 'encode') === 'decode') return T.solitaireDecode(s, k); return T.solitaireEncode(s, k); };
/* Keyword cores: mixed alphabet headed by the deduped key word; case preserved, non-letters pass through. */
T.keywordAlphabet = function (key) {
  var k = String(key === undefined ? 'KEYWORD' : key).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) throw new Error('Enter a letter key \u2014 it heads the mixed alphabet');
  var seq = '';
  for (var i = 0; i < k.length; i++) if (seq.indexOf(k.charAt(i)) < 0) seq += k.charAt(i);
  for (var a = 65; a <= 90; a++) { var c = String.fromCharCode(a); if (seq.indexOf(c) < 0) seq += c; }
  return seq;
};
T.keywordEncode = function (s, key) {
  var seq = T.keywordAlphabet(key);
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var base = c.charCodeAt(0) >= 97 ? 97 : 65;
    var sub = seq.charAt(c.charCodeAt(0) - base);
    return base === 97 ? sub.toLowerCase() : sub;
  });
};
T.keywordDecode = function (s, key) {
  var seq = T.keywordAlphabet(key);
  return String(s).replace(/[a-zA-Z]/g, function (c) {
    var up = c.toUpperCase();
    var p = seq.indexOf(up);
    var plain = String.fromCharCode(65 + p);
    return c.charCodeAt(0) >= 97 ? plain.toLowerCase() : plain;
  });
};
T.keywordCipher = function (s, opts) { var o = opts || {}; var k = o.key === undefined ? 'KEYWORD' : o.key; if ((o.mode || 'encode') === 'decode') return T.keywordDecode(s, k); return T.keywordEncode(s, k); };
/* Book cores: Ottendorf word.char pointers into a shared text (1-based, per-letter occurrence rotation); decode yields uppercase, letters missing from the text throw. */
T.bookWords = function (book) {
  var w = String(book === undefined ? 'The quick brown fox jumps over the lazy dog while five dozen jackdaws gaze at the calm river bank' : book).trim().split(/\s+/).filter(function (x) { return x; });
  if (!w.length) throw new Error('Paste book text \u2014 words hide the letters');
  return w;
};
T.bookEncode = function (s, book) {
  var words = T.bookWords(book);
  var up = words.map(function (w) { return w.toUpperCase(); });
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  var used = {};
  var out = [];
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    var occ = [];
    for (var w = 0; w < up.length; w++) for (var c = 0; c < up[w].length; c++) if (up[w].charAt(c) === ch) occ.push([w + 1, c + 1]);
    if (!occ.length) throw new Error('Book lacks \u201C' + ch + '\u201D \u2014 paste richer text');
    var n = used[ch] || 0;
    var pick = occ[n % occ.length];
    used[ch] = n + 1;
    out.push(pick[0] + '.' + pick[1]);
  }
  return out.join(' ');
};
T.bookDecode = function (s, book) {
  var words = T.bookWords(book);
  var toks = String(s).trim().split(/\s+/).filter(function (x) { return x; });
  if (!toks.length) return '';
  var out = '';
  for (var i = 0; i < toks.length; i++) {
    var m = /^(\d+)\.(\d+)$/.exec(toks[i]);
    if (!m) throw new Error('Bad book ref \u201C' + toks[i] + '\u201D \u2014 word.char numbers');
    var w = parseInt(m[1], 10), c = parseInt(m[2], 10);
    if (!(w >= 1 && w <= words.length)) throw new Error('Bad book ref \u201C' + toks[i] + '\u201D\u2014 ' + words.length + ' words');
    if (!(c >= 1 && c <= words[w - 1].length)) throw new Error('Bad book ref \u201C' + toks[i] + '\u201D\u2014 word ' + w + ' has ' + words[w - 1].length + ' chars');
    out += words[w - 1].charAt(c - 1).toUpperCase();
  }
  return out;
};
T.bookCipher = function (s, opts) { var o = opts || {}; var b = o.book === undefined ? 'The quick brown fox jumps over the lazy dog while five dozen jackdaws gaze at the calm river bank' : o.book; if ((o.mode || 'encode') === 'decode') return T.bookDecode(s, b); return T.bookEncode(s, b); };
/* DNA cores: strict unambiguous bases (letters only, uppercased); complement pairs A-T C-G, transcription swaps T-U, GC reports one-decimal content. */
T.dnaBases = function (s, alpha, label) {
  var t = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return '';
  for (var i = 0; i < t.length; i++) if (alpha.indexOf(t.charAt(i)) < 0) throw new Error('Bad ' + label + ' base \u201C' + t.charAt(i) + '\u201D \u2014 ' + alpha.split('').join(' ') + ' only');
  return t;
};
T.dnaComplement = function (s) {
  var t = T.dnaBases(s, 'ACGT', 'DNA');
  if (!t) return '';
  var map = { A: 'T', T: 'A', C: 'G', G: 'C' };
  return t.replace(/[ACGT]/g, function (c) { return map[c]; });
};
T.dnaRevComp = function (s) {
  var c = T.dnaComplement(s);
  return c.split('').reverse().join('');
};
T.dnaTranscribe = function (s) {
  var t = T.dnaBases(s, 'ACGT', 'DNA');
  if (!t) return '';
  return t.replace(/T/g, 'U');
};
T.dnaUntranscribe = function (s) {
  var t = T.dnaBases(s, 'ACGU', 'RNA');
  if (!t) return '';
  return t.replace(/U/g, 'T');
};
T.dnaGC = function (s) {
  var t = T.dnaBases(s, 'ACGT', 'DNA');
  if (!t) return '';
  var g = 0;
  for (var i = 0; i < t.length; i++) if (t.charAt(i) === 'G' || t.charAt(i) === 'C') g++;
  return 'GC ' + (g * 100 / t.length).toFixed(1) + '% (' + g + ' of ' + t.length + ')';
};
T.dnaToolkit = function (s, opts) {
  var o = opts || {};
  var job = o.job === undefined ? 'complement' : o.job;
  if (job === 'complement') return T.dnaComplement(s);
  if (job === 'reverse-complement') return T.dnaRevComp(s);
  if (job === 'transcribe') return T.dnaTranscribe(s);
  if (job === 'untranscribe') return T.dnaUntranscribe(s);
  if (job === 'gc-content') return T.dnaGC(s);
  throw new Error('Bad DNA job \u2014 complement, reverse-complement, transcribe, untranscribe or gc-content');
};
/* Brainfuck cores: 8-bit wrapping cells on an unbounded tape, EOF reads zero, comments ignored; brackets pre-paired with positions, one million steps max. */
T.brainfuck = function (code, input) {
  var src = String(code);
  var prog = [];
  var pairs = {};
  var stack = [];
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    if ('><+-.,[]'.indexOf(ch) < 0) continue;
    if (ch === '[') { stack.push(prog.length); prog.push('['); }
    else if (ch === ']') {
      if (!stack.length) throw new Error('Unbalanced ] at code position ' + i);
      var o = stack.pop();
      pairs[o] = prog.length; pairs[prog.length] = o;
      prog.push(']');
    } else prog.push(ch);
  }
  if (stack.length) throw new Error('Unbalanced [ \u2014 ' + stack.length + ' never closed');
  var inp = String(input === undefined ? '' : input);
  var ii = 0;
  var tape = {};
  var ptr = 0;
  function get(p) { return tape[p] || 0; }
  var out = '';
  var steps = 0;
  for (var pc = 0; pc < prog.length; pc++) {
    if (++steps > 1000000) throw new Error('Step limit 1000000 hit \u2014 infinite loop?');
    var op = prog[pc];
    if (op === '>') ptr++;
    else if (op === '<') ptr--;
    else if (op === '+') tape[ptr] = (get(ptr) + 1) % 256;
    else if (op === '-') tape[ptr] = (get(ptr) + 255) % 256;
    else if (op === '.') out += String.fromCharCode(get(ptr));
    else if (op === ',') { tape[ptr] = ii < inp.length ? inp.charCodeAt(ii++) % 256 : 0; }
    else if (op === '[') { if (get(ptr) === 0) pc = pairs[pc]; }
    else if (op === ']') { if (get(ptr) !== 0) pc = pairs[pc]; }
  }
  return out;
};
/* Whitespace cores: only space/tab/LF execute, every other character is a comment; stack machine with heap, labels and call stack, stdin for input ops, one million steps max. */
T.whitespace = function (code, input) {
  var raw = String(code);
  var prog = '';
  for (var w = 0; w < raw.length; w++) {
    var wc = raw.charAt(w);
    if (wc === ' ' || wc === '\t' || wc === '\n') prog += wc;
  }
  var pos = 0;
  function atEnd() { return pos >= prog.length; }
  function nextTok() {
    if (atEnd()) throw new Error('Truncated program \u2014 ends mid-instruction');
    var t = prog.charAt(pos);
    pos++;
    return t;
  }
  function parseNum() {
    var sgn = nextTok();
    if (sgn !== ' ' && sgn !== '\t') throw new Error('Bad number \u2014 sign must be space or tab');
    var neg = sgn === '\t';
    var val = 0;
    var bits = 0;
    for (;;) {
      var b = nextTok();
      if (b === '\n') break;
      if (b !== ' ' && b !== '\t') throw new Error('Bad number \u2014 bits must be space or tab');
      val = val * 2 + (b === '\t' ? 1 : 0);
      bits++;
      if (bits > 64) throw new Error('Number too long \u2014 64 bits max');
    }
    return neg ? -val : val;
  }
  function parseLabel() {
    var lab = '';
    for (;;) {
      var c = nextTok();
      if (c === '\n') break;
      lab += c;
    }
    return lab;
  }
  var ops = [];
  while (!atEnd()) {
    var imp = nextTok();
    if (imp === ' ') {
      var sc = nextTok();
      if (sc === ' ') ops.push(['push', parseNum()]);
      else if (sc === '\n') {
        var sc2 = nextTok();
        if (sc2 === ' ') ops.push(['dup']);
        else if (sc2 === '\t') ops.push(['swap']);
        else ops.push(['discard']);
      } else throw new Error('Bad stack command \u2014 expected space or linefeed');
    } else if (imp === '\t') {
      var tc = nextTok();
      if (tc === ' ') {
        var a1 = nextTok();
        var a2 = nextTok();
        if (a1 === ' ' && a2 === ' ') ops.push(['add']);
        else if (a1 === ' ' && a2 === '\t') ops.push(['sub']);
        else if (a1 === ' ' && a2 === '\n') ops.push(['mul']);
        else if (a1 === '\t' && a2 === ' ') ops.push(['div']);
        else if (a1 === '\t' && a2 === '\t') ops.push(['mod']);
        else throw new Error('Bad arithmetic command \u2014 unknown operator');
      } else if (tc === '\t') {
        var hc = nextTok();
        if (hc === ' ') ops.push(['store']);
        else if (hc === '\t') ops.push(['retrieve']);
        else throw new Error('Bad heap command \u2014 expected space or tab');
      } else {
        var oc = nextTok();
        if (oc === ' ') {
          var oc2 = nextTok();
          if (oc2 === ' ') ops.push(['outc']);
          else if (oc2 === '\t') ops.push(['outn']);
          else throw new Error('Bad output command \u2014 expected space or tab');
        } else if (oc === '\t') {
          var oc3 = nextTok();
          if (oc3 === ' ') ops.push(['readc']);
          else if (oc3 === '\t') ops.push(['readn']);
          else throw new Error('Bad input command \u2014 expected space or tab');
        } else throw new Error('Bad IO command \u2014 expected space or tab');
      }
    } else {
      var fc = nextTok();
      if (fc === ' ') {
        var fc2 = nextTok();
        if (fc2 === ' ') ops.push(['mark', parseLabel()]);
        else if (fc2 === '\t') ops.push(['call', parseLabel()]);
        else ops.push(['jump', parseLabel()]);
      } else if (fc === '\t') {
        var fc3 = nextTok();
        if (fc3 === ' ') ops.push(['jz', parseLabel()]);
        else if (fc3 === '\t') ops.push(['jn', parseLabel()]);
        else ops.push(['ret']);
      } else ops.push(['exit']);
    }
  }
  var marks = {};
  for (var mi = 0; mi < ops.length; mi++) {
    if (ops[mi][0] === 'mark') {
      if (Object.prototype.hasOwnProperty.call(marks, ops[mi][1])) throw new Error('Duplicate label \u2014 mark defined twice');
      marks[ops[mi][1]] = mi;
    }
  }
  for (var rj = 0; rj < ops.length; rj++) {
    var rk = ops[rj][0];
    if (rk === 'call' || rk === 'jump' || rk === 'jz' || rk === 'jn') {
      if (!Object.prototype.hasOwnProperty.call(marks, ops[rj][1])) throw new Error('Undefined label \u2014 no mark for this call or jump');
    }
  }
  var stk = [];
  var heap = {};
  var calls = [];
  var inp = String(input === undefined ? '' : input);
  var ii = 0;
  function popW() {
    if (!stk.length) throw new Error('Stack underflow \u2014 needs a value but the stack is empty');
    return stk.pop();
  }
  var wout = '';
  var steps = 0;
  var pc = 0;
  while (pc < ops.length) {
    if (++steps > 1000000) throw new Error('Step limit 1000000 hit \u2014 infinite loop?');
    var op = ops[pc];
    pc++;
    var kind = op[0];
    if (kind === 'push') stk.push(op[1]);
    else if (kind === 'dup') { var d1 = popW(); stk.push(d1); stk.push(d1); }
    else if (kind === 'swap') { var s1 = popW(); var s2 = popW(); stk.push(s1); stk.push(s2); }
    else if (kind === 'discard') popW();
    else if (kind === 'add') { var ab = popW(); var aa = popW(); stk.push(aa + ab); }
    else if (kind === 'sub') { var ub = popW(); var ua = popW(); stk.push(ua - ub); }
    else if (kind === 'mul') { var mb = popW(); var ma = popW(); stk.push(ma * mb); }
    else if (kind === 'div') { var db = popW(); var da = popW(); if (db === 0) throw new Error('Division by zero \u2014 divisor is zero'); stk.push((da - (da % db)) / db); }
    else if (kind === 'mod') { var ob = popW(); var oa = popW(); if (ob === 0) throw new Error('Division by zero \u2014 divisor is zero'); stk.push(oa % ob); }
    else if (kind === 'store') { var sv = popW(); var sa = popW(); heap[sa] = sv; }
    else if (kind === 'retrieve') { var ra = popW(); stk.push(Object.prototype.hasOwnProperty.call(heap, ra) ? heap[ra] : 0); }
    else if (kind === 'mark') {}
    else if (kind === 'call') { calls.push(pc); pc = marks[op[1]]; }
    else if (kind === 'jump') pc = marks[op[1]];
    else if (kind === 'jz') { if (popW() === 0) pc = marks[op[1]]; }
    else if (kind === 'jn') { if (popW() < 0) pc = marks[op[1]]; }
    else if (kind === 'ret') { if (!calls.length) throw new Error('Return without call \u2014 call stack is empty'); pc = calls.pop(); }
    else if (kind === 'exit') pc = ops.length;
    else if (kind === 'outc') wout += String.fromCharCode(popW());
    else if (kind === 'outn') wout += String(popW());
    else if (kind === 'readc') { var wa = popW(); heap[wa] = ii < inp.length ? inp.charCodeAt(ii++) % 256 : 0; }
    else if (kind === 'readn') {
      var na = popW();
      var jj = ii;
      while (jj < inp.length && (inp.charAt(jj) === ' ' || inp.charAt(jj) === '\t' || inp.charAt(jj) === '\n' || inp.charAt(jj) === '\r')) jj++;
      var mt = /^[-+]?[0-9]+/.exec(inp.slice(jj));
      var nv = 0;
      if (mt) { nv = parseInt(mt[0], 10); jj += mt[0].length; }
      ii = jj;
      heap[na] = nv;
    }
  }
  return wout;
};
/* Befunge cores: 2D toroidal playfield of UTF-16 cells, unknown characters are no-ops, empty stack pops zero, EOF reads zero, put/get wrap toroidally, one million steps max. */
T.befunge = function (code, input) {
  var raw = String(code);
  var rows = raw.split('\n');
  var grid = [];
  var bw = 1;
  for (var bi = 0; bi < rows.length; bi++) {
    var brow = rows[bi];
    if (brow.length && brow.charCodeAt(brow.length - 1) === 13) brow = brow.slice(0, -1);
    var cells = brow.split('');
    grid.push(cells);
    if (cells.length > bw) bw = cells.length;
  }
  var bh = grid.length;
  var CMDS = '<>^v?_|#":$.,pg&~!`+-*/%0123456789@';
  var hasCode = false;
  for (var ci = 0; ci < grid.length; ci++) {
    var crow = grid[ci];
    for (var cj = 0; cj < crow.length; cj++) {
      var cch = crow[cj];
      if (cch === ' ') continue;
      if (cch.charCodeAt(0) === 92 || CMDS.indexOf(cch) >= 0) { hasCode = true; break; }
    }
    if (hasCode) break;
  }
  if (!hasCode) return '';
  var stk = [];
  function pop0() { return stk.length ? stk.pop() : 0; }
  var inp = String(input === undefined ? '' : input);
  var ii = 0;
  function readNum() {
    var jj = ii;
    while (jj < inp.length && (inp.charAt(jj) === ' ' || inp.charAt(jj) === '\t' || inp.charAt(jj) === '\n' || inp.charAt(jj) === '\r')) jj++;
    var mt = /^[-+]?[0-9]+/.exec(inp.slice(jj));
    var nv = 0;
    if (mt) { nv = parseInt(mt[0], 10); jj += mt[0].length; }
    ii = jj;
    return nv;
  }
  var wout = '';
  var steps = 0;
  var bx = 0, by = 0, bdx = 1, bdy = 0;
  var bstr = false;
  function bstep() {
    bx = (bx + bdx + bw) % bw;
    by = (by + bdy + bh) % bh;
  }
  for (;;) {
    if (++steps > 1000000) throw new Error('Step limit 1000000 hit \u2014 infinite loop?');
    var grow = grid[by];
    var gch = bx < grow.length ? grow[bx] : ' ';
    if (bstr) {
      if (gch === '"') bstr = false;
      else stk.push(gch.charCodeAt(0));
    } else if (gch === ' ') {
    } else if (gch >= '0' && gch <= '9') stk.push(gch.charCodeAt(0) - 48);
    else if (gch === '>') { bdx = 1; bdy = 0; }
    else if (gch === '<') { bdx = -1; bdy = 0; }
    else if (gch === '^') { bdx = 0; bdy = -1; }
    else if (gch === 'v') { bdx = 0; bdy = 1; }
    else if (gch === '?') {
      var qd = CryptoRand.int(4);
      if (qd === 0) { bdx = 1; bdy = 0; }
      else if (qd === 1) { bdx = -1; bdy = 0; }
      else if (qd === 2) { bdx = 0; bdy = 1; }
      else { bdx = 0; bdy = -1; }
    }
    else if (gch === '_') { if (pop0() === 0) { bdx = 1; bdy = 0; } else { bdx = -1; bdy = 0; } }
    else if (gch === '|') { if (pop0() === 0) { bdx = 0; bdy = 1; } else { bdx = 0; bdy = -1; } }
    else if (gch === '"') bstr = true;
    else if (gch === ':') { var bd = pop0(); stk.push(bd); stk.push(bd); }
    else if (gch.charCodeAt(0) === 92) { var bs1 = pop0(); var bs2 = pop0(); stk.push(bs1); stk.push(bs2); }
    else if (gch === '$') pop0();
    else if (gch === '.') wout += String(pop0()) + ' ';
    else if (gch === ',') wout += String.fromCharCode(pop0());
    else if (gch === '+') { var ba = pop0(); var bb = pop0(); stk.push(bb + ba); }
    else if (gch === '-') { var bm = pop0(); var bn = pop0(); stk.push(bn - bm); }
    else if (gch === '*') { var bu = pop0(); var bv = pop0(); stk.push(bv * bu); }
    else if (gch === '/') { var bd2 = pop0(); var bd1 = pop0(); if (bd2 === 0) throw new Error('Division by zero \u2014 divisor is zero'); stk.push((bd1 - (bd1 % bd2)) / bd2); }
    else if (gch === '%') { var bo2 = pop0(); var bo1 = pop0(); if (bo2 === 0) throw new Error('Division by zero \u2014 divisor is zero'); stk.push(bo1 % bo2); }
    else if (gch === '!') stk.push(pop0() === 0 ? 1 : 0);
    else if (gch === '`') { var bg2 = pop0(); var bg1 = pop0(); stk.push(bg1 > bg2 ? 1 : 0); }
    else if (gch === 'p') {
      var py = pop0(); var px = pop0(); var pv = pop0();
      var ty = ((py % bh) + bh) % bh;
      var tx = ((px % bw) + bw) % bw;
      while (grid[ty].length <= tx) grid[ty].push(' ');
      grid[ty][tx] = String.fromCharCode(pv);
    }
    else if (gch === 'g') {
      var gy = pop0(); var gx = pop0();
      var hy = ((gy % bh) + bh) % bh;
      var hx = ((gx % bw) + bw) % bw;
      stk.push(hx < grid[hy].length ? grid[hy][hx].charCodeAt(0) : 32);
    }
    else if (gch === '&') stk.push(readNum());
    else if (gch === '~') stk.push(ii < inp.length ? inp.charCodeAt(ii++) % 256 : 0);
    else if (gch === '@') return wout;
    bstep();
    if (gch === '#') bstep();
  }
};
/* Braille cores: Grade-1 uncontracted tables as code points, capital and number prefixes, blank for space, newlines pass through, lone surrogates pass through untouched. */
T.brailleCipher = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'encode';
  var LET = {
    a: 0x2801, b: 0x2803, c: 0x2809, d: 0x2819, e: 0x2811,
    f: 0x280b, g: 0x281b, h: 0x2813, i: 0x280a, j: 0x281a,
    k: 0x2805, l: 0x2807, m: 0x280d, n: 0x281d, o: 0x2815,
    p: 0x280f, q: 0x281f, r: 0x2817, s: 0x280e, t: 0x281e,
    u: 0x2825, v: 0x2827, w: 0x283a, x: 0x282d, y: 0x283d, z: 0x2835
  };
  var PUN = { ',': 0x2802, ';': 0x2806, ':': 0x2812, '.': 0x2832, '?': 0x2826, '!': 0x2816, '-': 0x2824 };
  PUN[String.fromCharCode(39)] = 0x2804;
  var CAP = 0x2820, NUM = 0x283c, BLANK = 0x2800;
  var REV = {}, PREV = {};
  for (var lk in LET) { if (Object.prototype.hasOwnProperty.call(LET, lk)) REV[LET[lk]] = lk; }
  for (var pk in PUN) { if (Object.prototype.hasOwnProperty.call(PUN, pk)) PREV[PUN[pk]] = pk; }
  function isSurrogate(cc) { return cc >= 0xD800 && cc <= 0xDFFF; }
  if (mode === 'encode') {
    var src = String(s);
    var out = '';
    var numRun = false;
    for (var e = 0; e < src.length; e++) {
      var ch = src.charAt(e);
      var cd = src.charCodeAt(e);
      if (isSurrogate(cd)) { out += ch; numRun = false; continue; }
      if (ch === ' ') { out += String.fromCharCode(BLANK); numRun = false; continue; }
      if (cd === 9 || cd === 10 || cd === 13) { out += ch; numRun = false; continue; }
      if (ch >= '0' && ch <= '9') {
        if (!numRun) { out += String.fromCharCode(NUM); numRun = true; }
        var dl = ch === '0' ? 'j' : String.fromCharCode(cd - 48 + 96);
        out += String.fromCharCode(LET[dl]);
        continue;
      }
      numRun = false;
      var lo = ch.toLowerCase();
      if (lo >= 'a' && lo <= 'z' && LET[lo] !== undefined) {
        if (ch >= 'A' && ch <= 'Z') out += String.fromCharCode(CAP);
        out += String.fromCharCode(LET[lo]);
        continue;
      }
      if (PUN[ch] !== undefined) { out += String.fromCharCode(PUN[ch]); continue; }
      throw new Error('No Braille sign \u2014 cannot encode ' + JSON.stringify(ch));
    }
    return out;
  }
  if (mode === 'decode') {
    var dsrc = String(s);
    var dout = '';
    var wantNum = false, wantCap = false, wantCaps = false;
    for (var dd = 0; dd < dsrc.length; dd++) {
      var dch = dsrc.charAt(dd);
      var dcc = dsrc.charCodeAt(dd);
      if (isSurrogate(dcc)) { dout += dch; wantNum = false; wantCap = false; wantCaps = false; continue; }
      if (dcc === 32 || dcc === 9 || dcc === 10 || dcc === 13) { dout += dch; wantNum = false; wantCap = false; wantCaps = false; continue; }
      if (dcc === BLANK) { dout += ' '; wantNum = false; wantCap = false; wantCaps = false; continue; }
      if (dcc === CAP) {
        if (wantCap) { wantCap = false; wantCaps = true; }
        else wantCap = true;
        wantNum = false;
        continue;
      }
      if (dcc === NUM) { wantNum = true; wantCap = false; wantCaps = false; continue; }
      var lc = REV[dcc];
      if (lc !== undefined) {
        if (wantNum) {
          if (lc < 'a' || lc > 'j') throw new Error('Number sign before non-digit \u2014 Braille digits are a through j');
          dout += lc === 'j' ? '0' : String(lc.charCodeAt(0) - 96);
          continue;
        }
        var up = wantCap || wantCaps;
        wantCap = false;
        dout += up ? lc.toUpperCase() : lc;
        continue;
      }
      var pc = PREV[dcc];
      if (pc !== undefined) { dout += pc; wantNum = false; wantCap = false; wantCaps = false; continue; }
      if (dcc >= 0x2800 && dcc <= 0x28FF) throw new Error('Unknown Braille pattern \u2014 no Grade-1 sign at U+' + dcc.toString(16).toUpperCase());
      throw new Error('Not Braille input \u2014 switch Mode to encode');
    }
    return dout;
  }
  throw new Error('Bad mode \u2014 use encode or decode');
};
/* NATO cores: fixed Alfa-to-Zulu words with ITU digit pronunciations, slash word gaps, tolerant decode aliases, lone surrogates pass through untouched. */
T.natoPhonetic = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'encode';
  var WORDS = {
    A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
    G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima',
    M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
    S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray',
    Y: 'Yankee', Z: 'Zulu', '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Tree',
    '4': 'Fower', '5': 'Fife', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Niner'
  };
  var ALIAS = { ALPHA: 'A', THREE: '3', FOUR: '4', FIVE: '5', NINE: '9', ZERO: '0', OH: '0', XRAY: 'X' };
  var REV = {};
  for (var wk in WORDS) {
    if (Object.prototype.hasOwnProperty.call(WORDS, wk)) REV[WORDS[wk].toUpperCase().split('-').join('')] = wk;
  }
  for (var ak in ALIAS) {
    if (Object.prototype.hasOwnProperty.call(ALIAS, ak)) REV[ak] = ALIAS[ak];
  }
  function isSurrogate(cc) { return cc >= 0xD800 && cc <= 0xDFFF; }
  if (mode === 'encode') {
    var src = String(s).toUpperCase();
    var out = [];
    for (var e = 0; e < src.length; e++) {
      var ch = src.charAt(e);
      var cd = src.charCodeAt(e);
      if (isSurrogate(cd)) { out.push(ch); continue; }
      if (ch === ' ') { out.push('/'); continue; }
      if (cd === 9 || cd === 10 || cd === 13) { out.push('/'); continue; }
      if (WORDS[ch] !== undefined) { out.push(WORDS[ch]); continue; }
      throw new Error('No NATO word \u2014 cannot spell ' + JSON.stringify(ch));
    }
    return out.join(' ');
  }
  if (mode === 'decode') {
    var dsrc = String(s);
    var toks = [];
    var cur = '';
    for (var dd = 0; dd < dsrc.length; dd++) {
      var dch = dsrc.charAt(dd);
      var dcc = dsrc.charCodeAt(dd);
      if (isSurrogate(dcc)) { if (cur) { toks.push(cur); cur = ''; } toks.push(dch); continue; }
      if (dcc === 32 || dcc === 9 || dcc === 10 || dcc === 13 || dcc === 47 || dcc === 44 || dcc === 59 || dcc === 124) {
        if (cur) { toks.push(cur); cur = ''; }
        if (dcc === 47) toks.push('/');
        continue;
      }
      cur += dch;
    }
    if (cur) toks.push(cur);
    var dout = '';
    for (var tt = 0; tt < toks.length; tt++) {
      var tk = toks[tt];
      if (tk === '/') { dout += ' '; continue; }
      if (tk.length === 1 && isSurrogate(tk.charCodeAt(0))) { dout += tk; continue; }
      var key = tk.toUpperCase().split('-').join('');
      if (REV[key] !== undefined) { dout += REV[key]; continue; }
      throw new Error('Unknown NATO word \u2014 no such word as ' + JSON.stringify(tk));
    }
    var res = '';
    var prevSp = true;
    for (var rr = 0; rr < dout.length; rr++) {
      var rc = dout.charAt(rr);
      if (rc === ' ') { if (!prevSp) { res += ' '; prevSp = true; } }
      else { res += rc; prevSp = false; }
    }
    return res;
  }
  throw new Error('Bad mode \u2014 use encode or decode');
};
/* FEN cores: strict six-field validation, Unicode board diagram with file and rank labels plus side castling en-passant clocks. */
T.fenView = function (s) {
  var raw = String(s);
  for (var zi = 0; zi < raw.length; zi++) {
    var zc = raw.charCodeAt(zi);
    if (zc >= 0xD800 && zc <= 0xDFFF) return '';
  }
  var parts = raw.split(/\s+/);
  var fld = [];
  for (var fi = 0; fi < parts.length; fi++) { if (parts[fi]) fld.push(parts[fi]); }
  if (!fld.length) throw new Error('Enter a FEN string \u2014 six fields starting with the piece placement');
  if (fld.length !== 6) throw new Error('FEN needs 6 fields \u2014 placement side castling en-passant halfmove fullmove, got ' + fld.length);
  var GLYPH = { K: 0, Q: 1, R: 2, B: 3, N: 4, P: 5 };
  var board = [];
  var ranks = fld[0].split('/');
  if (ranks.length !== 8) throw new Error('Bad placement \u2014 eight ranks separated by slashes, got ' + ranks.length);
  for (var ri = 0; ri < 8; ri++) {
    var row = [];
    var rk = ranks[ri];
    for (var ci = 0; ci < rk.length; ci++) {
      var ch = rk.charAt(ci);
      var up = ch.toUpperCase();
      var isLetter = ch.toLowerCase() !== ch.toUpperCase();
      if (isLetter && GLYPH[up] !== undefined) { row.push(ch); }
      else if (ch >= '1' && ch <= '8') {
        var n = ch.charCodeAt(0) - 48;
        for (var ei = 0; ei < n; ei++) row.push(null);
      } else throw new Error('Bad placement character \u2014 pieces are PNBRQK and empties are 1 to 8, got ' + JSON.stringify(ch));
    }
    if (row.length !== 8) throw new Error('Bad rank ' + (8 - ri) + ' \u2014 ranks must total 8 squares, got ' + row.length);
    board.push(row);
  }
  if (fld[1] !== 'w' && fld[1] !== 'b') throw new Error('Bad side to move \u2014 use w or b, got ' + JSON.stringify(fld[1]));
  var castle = fld[2];
  if (castle !== '-') {
    if (!/^[KQkq]+$/.test(castle)) throw new Error('Bad castling \u2014 use - or letters from KQkq, got ' + JSON.stringify(castle));
    var seen = {};
    for (var si = 0; si < castle.length; si++) {
      if (seen[castle.charAt(si)]) throw new Error('Repeated castling letter \u2014 each of KQkq once at most');
      seen[castle.charAt(si)] = 1;
    }
  }
  var ep = fld[3];
  if (ep !== '-') {
    if (!/^[a-h][36]$/.test(ep)) throw new Error('Bad en-passant square \u2014 use - or a file with rank 3 or 6, got ' + JSON.stringify(ep));
    var needRank = fld[1] === 'w' ? '6' : '3';
    if (ep.charAt(1) !== needRank) throw new Error('En-passant rank must be ' + needRank + ' with ' + fld[1] + ' to move \u2014 got ' + JSON.stringify(ep));
  }
  if (!/^[0-9]+$/.test(fld[4])) throw new Error('Bad halfmove clock \u2014 a whole number of halfmoves, got ' + JSON.stringify(fld[4]));
  if (!/^[1-9][0-9]*$/.test(fld[5])) throw new Error('Bad fullmove number \u2014 counting starts at 1, got ' + JSON.stringify(fld[5]));
  var lines = [];
  for (var br = 0; br < 8; br++) {
    var cells = [];
    for (var bc = 0; bc < 8; bc++) {
      var pc = board[br][bc];
      if (!pc) cells.push(String.fromCharCode(0xB7));
      else {
        var up2 = pc.toUpperCase();
        cells.push(String.fromCharCode((pc === up2 ? 0x2654 : 0x265A) + GLYPH[up2]));
      }
    }
    lines.push((8 - br) + '  ' + cells.join(' '));
  }
  lines.push('   a b c d e f g h');
  lines.push('Side to move: ' + (fld[1] === 'w' ? 'White' : 'Black'));
  lines.push('Castling: ' + (castle === '-' ? 'none' : castle));
  lines.push('En passant: ' + (ep === '-' ? 'none' : ep));
  lines.push('Halfmove: ' + fld[4] + '  Fullmove: ' + fld[5]);
  return lines.join('\n');
};
/* Luhn cores: mod-10 checksum for cards and IMEIs, spaces and dashes ignored, trailing ? * or # accepted as the missing check slot. */
T.luhnCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var digits = '';
  for (var di = 0; di < raw.length; di++) {
    var dc = raw.charCodeAt(di);
    if (dc >= 0xD800 && dc <= 0xDFFF) return '';
    var dh = raw.charAt(di);
    if (dh >= '0' && dh <= '9') digits += dh;
    else if (dc === 32 || dc === 9 || dc === 10 || dc === 13 || dc === 45) continue;
    else if (mode === 'check-digit' && (dh === '?' || dh === '*' || dh === '#')) continue;
    else throw new Error('Digits only \u2014 0-9 with spaces or dashes ignored, got ' + JSON.stringify(dh));
  }
  function lsum(ds, startDbl) {
    var t = 0;
    var pos = 0;
    for (var li = ds.length - 1; li >= 0; li--) {
      var v = ds.charCodeAt(li) - 48;
      if ((pos % 2 === 0) === startDbl) { v *= 2; if (v > 9) v -= 9; }
      t += v;
      pos++;
    }
    return t;
  }
  if (!digits.length) throw new Error('Enter digits first \u2014 card, IMEI or serial digits to check');
  if (mode === 'validate') {
    if (digits.length < 2) throw new Error('Too short \u2014 a Luhn number needs at least 2 digits, got ' + digits.length);
    if (lsum(digits, false) % 10 !== 0) throw new Error('Invalid Luhn number \u2014 checksum fails for ' + JSON.stringify(digits));
    return 'Valid \u2014 Luhn checksum passes (' + digits.length + ' digits)';
  }
  var sum = lsum(digits, true);
  var d = (10 - (sum % 10)) % 10;
  return digits + d;
};
/* Pigpen cores: Freemason grids as Unicode line fragments, dotted second grid and second X, slash word gaps, trailing dot-or-period accepted on decode. */
T.pigpenCipher = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'encode';
  if (mode !== 'encode' && mode !== 'decode') throw new Error('Bad mode \u2014 use encode or decode');
  var FRAG = { A: '\u2518', B: '\u2534', C: '\u2514', D: '\u2524', E: '\u253C', F: '\u251C', G: '\u2510', H: '\u252C', I: '\u250C', J: '\u2518', K: '\u2534', L: '\u2514', M: '\u2524', N: '\u253C', O: '\u251C', P: '\u2510', Q: '\u252C', R: '\u250C', S: '\u2228', T: '>', U: '<', V: '\u2227', W: '\u2228', X: '>', Y: '<', Z: '\u2227' };
  var DOT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(function (c) { return 'JKLMNOPQRWXYZ'.indexOf(c) >= 0; });
  var DSET = {};
  for (var di = 0; di < DOT.length; di++) DSET[DOT[di]] = 1;
  var DD = String.fromCharCode(0xB7);
  function isSurrogate(cc) { return cc >= 0xD800 && cc <= 0xDFFF; }
  if (mode === 'encode') {
    var src = String(s).toUpperCase();
    var out = [];
    for (var e = 0; e < src.length; e++) {
      var ch = src.charAt(e);
      var cd = src.charCodeAt(e);
      if (isSurrogate(cd)) { out.push(ch); continue; }
      if (ch === ' ' || cd === 9 || cd === 10 || cd === 13) { out.push('/'); continue; }
      if (FRAG[ch] !== undefined) { out.push(FRAG[ch] + (DSET[ch] ? DD : '')); continue; }
      throw new Error('No Pigpen sign \u2014 cannot draw ' + JSON.stringify(ch));
    }
    return out.join(' ');
  }
  var dsrc = String(s);
  var toks = [];
  var cur = '';
  for (var dd = 0; dd < dsrc.length; dd++) {
    var dch = dsrc.charAt(dd);
    var dcc = dsrc.charCodeAt(dd);
    if (isSurrogate(dcc)) { if (cur) { toks.push(cur); cur = ''; } toks.push(dch); continue; }
    if (dcc === 32 || dcc === 9 || dcc === 10 || dcc === 13) { if (cur) { toks.push(cur); cur = ''; } continue; }
    if (dcc === 47) { if (cur) { toks.push(cur); cur = ''; } toks.push('/'); continue; }
    cur += dch;
  }
  if (cur) toks.push(cur);
  var REV = {};
  for (var rk in FRAG) { if (Object.prototype.hasOwnProperty.call(FRAG, rk)) REV[FRAG[rk] + (DSET[rk] ? DD : '')] = rk; }
  var dout = '';
  for (var tt = 0; tt < toks.length; tt++) {
    var tk = toks[tt];
    if (tk === '/') { dout += ' '; continue; }
    if (tk.length === 1 && isSurrogate(tk.charCodeAt(0))) { dout += tk; continue; }
    var base = tk;
    var dotted = false;
    var last = tk.charAt(tk.length - 1);
    if (last === DD || last === '.') { base = tk.slice(0, -1); dotted = true; }
    var hit = REV[base + (dotted ? DD : '')];
    if (hit === undefined && !dotted) hit = REV[base];
    if (hit === undefined) throw new Error('Unknown Pigpen sign \u2014 no such fragment as ' + JSON.stringify(tk));
    dout += hit;
  }
  var res = '';
  var prevSp = true;
  for (var rr = 0; rr < dout.length; rr++) {
    var rc = dout.charAt(rr);
    if (rc === ' ') { if (!prevSp) { res += ' '; prevSp = true; } }
    else { res += rc; prevSp = false; }
  }
  return res;
};
/* ISBN cores: ISBN-10 mod-11 with X check plus ISBN-13 alternating 1-3 mod-10, dashes and spaces ignored */
T.isbnCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var di = 0; di < raw.length; di++) {
    var dc = raw.charCodeAt(di);
    if (dc >= 0xD800 && dc <= 0xDFFF) return '';
    var dh = raw.charAt(di);
    if (dh >= '0' && dh <= '9') clean += dh;
    else if (dh === 'X' || dh === 'x') clean += 'X';
    else if (dc === 32 || dc === 9 || dc === 10 || dc === 13 || dc === 45) continue;
    else if (mode === 'check-digit' && (dh === '?' || dh === '*' || dh === '#')) continue;
    else throw new Error('Digits only \u2014 0-9 with dashes or spaces ignored, X only as an ISBN-10 check, got ' + JSON.stringify(dh));
  }
  if (!clean.length) throw new Error('Enter digits first \u2014 an ISBN-10, ISBN-13 or its leading prefix');
  if (mode === 'validate') {
    if (clean.length === 10) {
      var v10 = 0;
      for (var i10 = 0; i10 < 10; i10++) {
        var h10 = clean.charAt(i10);
        if (i10 < 9) {
          if (h10 < '0' || h10 > '9') throw new Error('Bad ISBN-10 \u2014 first 9 characters are digits, got ' + JSON.stringify(h10));
          v10 += (h10.charCodeAt(0) - 48) * (10 - i10);
        } else {
          if ((h10 < '0' || h10 > '9') && h10 !== 'X') throw new Error('Bad ISBN-10 check \u2014 a digit or X, got ' + JSON.stringify(h10));
          v10 += (h10 === 'X' ? 10 : h10.charCodeAt(0) - 48);
        }
      }
      if (v10 % 11 !== 0) throw new Error('Invalid ISBN-10 \u2014 checksum fails for ' + JSON.stringify(clean));
      return 'Valid \u2014 ISBN-10 checksum passes';
    }
    if (clean.length === 13) {
      var v13 = 0;
      for (var i13 = 0; i13 < 13; i13++) {
        var h13 = clean.charAt(i13);
        if (h13 < '0' || h13 > '9') throw new Error('Bad ISBN-13 \u2014 all 13 characters are digits, X is ISBN-10 only');
        v13 += (h13.charCodeAt(0) - 48) * (i13 % 2 === 0 ? 1 : 3);
      }
      if (v13 % 10 !== 0) throw new Error('Invalid ISBN-13 \u2014 checksum fails for ' + JSON.stringify(clean));
      return 'Valid \u2014 ISBN-13 checksum passes';
    }
    throw new Error('Bad length \u2014 ISBN-10 needs 10 characters or ISBN-13 needs 13 digits, got ' + clean.length);
  }
  if (clean.indexOf('X') >= 0) throw new Error('No X in a prefix \u2014 pass the first 9 or 12 digits');
  if (clean.length === 9) {
    var p9 = 0;
    for (var j9 = 0; j9 < 9; j9++) {
      var g9 = clean.charAt(j9);
      if (g9 < '0' || g9 > '9') throw new Error('Digits only \u2014 9-digit prefix has no X');
      p9 += (g9.charCodeAt(0) - 48) * (10 - j9);
    }
    var c9 = (11 - (p9 % 11)) % 11;
    return clean + (c9 === 10 ? 'X' : String(c9));
  }
  if (clean.length === 12) {
    var p12 = 0;
    for (var j12 = 0; j12 < 12; j12++) {
      var g12 = clean.charAt(j12);
      if (g12 < '0' || g12 > '9') throw new Error('Digits only \u2014 12-digit prefix has no X');
      p12 += (g12.charCodeAt(0) - 48) * (j12 % 2 === 0 ? 1 : 3);
    }
    return clean + String((10 - (p12 % 10)) % 10);
  }
  throw new Error('Bad prefix \u2014 9 digits make an ISBN-10 or 12 make an ISBN-13, got ' + clean.length);
};
/* IBAN cores: generic structural check plus iterative mod-97, spaces ignored, lowercase folded, no country table so no valid IBAN is ever rejected. */
T.ibanCheck = function (s) {
  var raw = String(s);
  var clean = '';
  for (var di = 0; di < raw.length; di++) {
    var dc = raw.charCodeAt(di);
    if (dc >= 0xD800 && dc <= 0xDFFF) return '';
    var dh = raw.charAt(di);
    if (dh >= '0' && dh <= '9') clean += dh;
    else if (dh >= 'A' && dh <= 'Z') clean += dh;
    else if (dh >= 'a' && dh <= 'z') clean += dh.toUpperCase();
    else if (dc === 32 || dc === 9 || dc === 10 || dc === 13 || dc === 45) continue;
    else throw new Error('Letters and digits only \u2014 IBAN with spaces or dashes ignored, got ' + JSON.stringify(dh));
  }
  if (!clean.length) throw new Error('Enter an IBAN first \u2014 country code, check digits and BBAN');
  if (clean.length < 15 || clean.length > 34) throw new Error('Bad length \u2014 IBANs run 15 to 34 characters, got ' + clean.length);
  var cc0 = clean.charAt(0);
  var cc1 = clean.charAt(1);
  if (cc0 < 'A' || cc0 > 'Z' || cc1 < 'A' || cc1 > 'Z') throw new Error('Bad country code \u2014 IBAN starts with two letters, got ' + JSON.stringify(clean.slice(0, 2)));
  var cd0 = clean.charAt(2);
  var cd1 = clean.charAt(3);
  if (cd0 < '0' || cd0 > '9' || cd1 < '0' || cd1 > '9') throw new Error('Bad check digits \u2014 two digits follow the country code');
  for (var bi = 4; bi < clean.length; bi++) {
    var bh = clean.charAt(bi);
    if ((bh < '0' || bh > '9') && (bh < 'A' || bh > 'Z')) throw new Error('Bad BBAN character \u2014 letters or digits, got ' + JSON.stringify(bh));
  }
  var rearr = clean.slice(4) + clean.slice(0, 4);
  var rem = 0;
  for (var ri = 0; ri < rearr.length; ri++) {
    var rh = rearr.charAt(ri);
    if (rh >= '0' && rh <= '9') rem = (rem * 10 + (rh.charCodeAt(0) - 48)) % 97;
    else {
      var vv = rh.charCodeAt(0) - 55;
      rem = (rem * 10 + Math.floor(vv / 10)) % 97;
      rem = (rem * 10 + (vv % 10)) % 97;
    }
  }
  if (rem !== 1) throw new Error('Invalid IBAN \u2014 mod-97 check fails for ' + JSON.stringify(clean));
  return 'Valid \u2014 ' + clean.slice(0, 2) + ' IBAN (' + clean.length + ' characters)';
};
/* GTIN cores: one right-anchored 1-3-1-3 mod-10 covers GTIN-8, UPC-A, EAN-13 and GTIN-14, spaces and dashes ignored. */
T.gtinCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var digits = '';
  for (var di = 0; di < raw.length; di++) {
    var dc = raw.charCodeAt(di);
    if (dc >= 0xD800 && dc <= 0xDFFF) return '';
    var dh = raw.charAt(di);
    if (dh >= '0' && dh <= '9') digits += dh;
    else if (dc === 32 || dc === 9 || dc === 10 || dc === 13 || dc === 45) continue;
    else throw new Error('Digits only \u2014 0-9 with spaces or dashes ignored, got ' + JSON.stringify(dh));
  }
  if (!digits.length) throw new Error('Enter digits first \u2014 a GTIN-8, UPC-A, EAN-13 or GTIN-14 barcode');
  var NAMES = { 8: 'GTIN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' };
  function wsum(ds) {
    var t = 0;
    var pos = 0;
    for (var li = ds.length - 1; li >= 0; li--) {
      t += (ds.charCodeAt(li) - 48) * (pos % 2 === 0 ? 1 : 3);
      pos++;
    }
    return t;
  }
  if (mode === 'validate') {
    if (NAMES[digits.length] === undefined) throw new Error('Bad length \u2014 barcodes run 8, 12, 13 or 14 digits, got ' + digits.length);
    if (wsum(digits) % 10 !== 0) throw new Error('Invalid barcode \u2014 checksum fails for ' + JSON.stringify(digits));
    return 'Valid \u2014 ' + NAMES[digits.length] + ' checksum passes';
  }
  if (NAMES[digits.length + 1] === undefined) throw new Error('Bad prefix \u2014 7, 11, 12 or 13 digits make a barcode, got ' + digits.length);
  return digits + String((10 - (wsum(digits + '0') % 10)) % 10);
};
/* Verhoeff cores: dihedral D5 table check catching all single-digit errors and adjacent transpositions, spaces and dashes ignored. */
T.verhoeffCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var DT = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  var PT = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,7,2,5],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  var INV = [0,4,3,2,1,5,6,7,8,9];
  var raw = String(s);
  var digits = '';
  for (var di = 0; di < raw.length; di++) {
    var dc = raw.charCodeAt(di);
    if (dc >= 0xD800 && dc <= 0xDFFF) return '';
    var dh = raw.charAt(di);
    if (dh >= '0' && dh <= '9') digits += dh;
    else if (dc === 32 || dc === 9 || dc === 10 || dc === 13 || dc === 45) continue;
    else throw new Error('Digits only \u2014 0-9 with spaces or dashes ignored, got ' + JSON.stringify(dh));
  }
  if (!digits.length) throw new Error('Enter digits first \u2014 a Verhoeff number or its prefix');
  function vrun(ds) {
    var c = 0;
    var pos = 0;
    for (var li = ds.length - 1; li >= 0; li--) {
      c = DT[c][PT[pos % 8][ds.charCodeAt(li) - 48]];
      pos++;
    }
    return c;
  }
  if (mode === 'validate') {
    if (digits.length < 2) throw new Error('Too short \u2014 a Verhoeff number needs at least 2 digits, got ' + digits.length);
    if (vrun(digits) !== 0) throw new Error('Invalid Verhoeff number \u2014 checksum fails for ' + JSON.stringify(digits));
    return 'Valid \u2014 Verhoeff checksum passes (' + digits.length + ' digits)';
  }
  return digits + String(INV[vrun(digits + '0')]);
};
/* Damm cores: quasigroup table walk catching all single-digit errors and adjacent transpositions, check digit needs no tables beyond the walk itself. */
T.dammCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var QT = [[0,3,1,7,5,9,8,6,4,2],[7,0,9,2,1,5,4,8,6,3],[4,2,0,6,8,7,1,3,5,9],[1,7,5,0,9,8,3,4,2,6],[6,1,2,3,0,4,5,9,7,8],[3,6,7,4,2,0,9,5,8,1],[5,8,6,9,7,2,0,1,3,4],[8,9,4,5,3,6,2,0,1,7],[9,4,3,8,6,1,7,2,0,5],[2,5,8,1,4,3,6,7,9,0]];
  var raw = String(s);
  var digits = '';
  for (var di = 0; di < raw.length; di++) {
    var dc = raw.charCodeAt(di);
    if (dc >= 0xD800 && dc <= 0xDFFF) return '';
    var dh = raw.charAt(di);
    if (dh >= '0' && dh <= '9') digits += dh;
    else if (dc === 32 || dc === 9 || dc === 10 || dc === 13 || dc === 45) continue;
    else throw new Error('Digits only \u2014 0-9 with spaces or dashes ignored, got ' + JSON.stringify(dh));
  }
  if (!digits.length) throw new Error('Enter digits first \u2014 a Damm number or its prefix');
  function qwalk(ds) {
    var interim = 0;
    for (var li = 0; li < ds.length; li++) interim = QT[interim][ds.charCodeAt(li) - 48];
    return interim;
  }
  if (mode === 'validate') {
    if (digits.length < 2) throw new Error('Too short \u2014 a Damm number needs at least 2 digits, got ' + digits.length);
    if (qwalk(digits) !== 0) throw new Error('Invalid Damm number \u2014 checksum fails for ' + JSON.stringify(digits));
    return 'Valid \u2014 Damm checksum passes (' + digits.length + ' digits)';
  }
  var tail = qwalk(digits);
  for (var cd = 0; cd <= 9; cd++) { if (QT[tail][cd] === 0) return digits + String(cd); }
  throw new Error('No check digit \u2014 quasigroup row has no zero, prefix ' + JSON.stringify(digits));
};
/* XOR cores: byte-wise key-cycled XOR reusing the shared UTF-8 and binary-string helpers, hex parsed by hand so odd nibbles fail loudly. */
T.xorCipher = function (s, opts) {
  var o = opts || {};
  var informat = o.input || 'text';
  var outformat = o.output || 'hex';
  if (informat !== 'text' && informat !== 'hex' && informat !== 'base64') throw new Error('Bad input format \u2014 use text, hex or base64');
  if (outformat !== 'hex' && outformat !== 'base64' && outformat !== 'text') throw new Error('Bad output format \u2014 use hex, base64 or text');
  var keyBytes = T._utf8Bytes(String(o.key === undefined || o.key === null ? '' : o.key));
  if (!keyBytes.length) throw new Error('Enter a key first \u2014 XOR needs a key to mix with');
  var raw = String(s === undefined || s === null ? '' : s);
  var inBytes;
  if (informat === 'text') inBytes = T._utf8Bytes(raw);
  else if (informat === 'hex') {
    var hx = raw.replace(/\s/g, '');
    if (!hx.length) return '';
    if (hx.length % 2 !== 0) throw new Error('Bad hex input \u2014 even number of nibbles, got ' + hx.length);
    if (/[^0-9a-fA-F]/.test(hx)) throw new Error('Bad hex input \u2014 0-9 and a-f only, got ' + JSON.stringify(hx.match(/[^0-9a-fA-F]/)[0]));
    var hb = new Uint8Array(hx.length / 2);
    for (var hi = 0; hi < hb.length; hi++) hb[hi] = parseInt(hx.slice(hi * 2, hi * 2 + 2), 16);
    inBytes = hb;
  } else {
    var b64 = raw.replace(/\s/g, '');
    if (!b64.length) return '';
    var bb;
    try { bb = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); }
    catch { throw new Error('Invalid Base64 input'); }
    inBytes = bb;
  }
  if (!inBytes.length) return '';
  var mixed = new Uint8Array(inBytes.length);
  for (var mi = 0; mi < inBytes.length; mi++) mixed[mi] = inBytes[mi] ^ keyBytes[mi % keyBytes.length];
  if (outformat === 'hex') {
    var HEXD = '0123456789abcdef';
    var hs = '';
    for (var oi = 0; oi < mixed.length; oi++) hs += HEXD.charAt((mixed[oi] >> 4) & 15) + HEXD.charAt(mixed[oi] & 15);
    return hs;
  }
  if (outformat === 'base64') return btoa(T._bytesToBinaryString(mixed));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(mixed); }
  catch { throw new Error('Output is not valid UTF-8 \u2014 use hex or base64 output'); }
};
/* Pig Latin cores: consonant clusters with qu glued, y as vowel only when no vowel exists, title and shouty case preserved, apostrophes ride along. */
T.pigLatin = function (s, opts) {
  var o = opts || {};
  var suffix = o.suffix || 'way';
  if (suffix !== 'way' && suffix !== 'yay' && suffix !== 'ay') throw new Error('Bad suffix \u2014 use way, yay or ay');
  var raw = String(s === undefined || s === null ? '' : s);
  var APOS = String.fromCharCode(39);
  function isLetter(ch) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'); }
  function isSurrogate(cc) { return cc >= 0xD800 && cc <= 0xDFFF; }
  function latinWord(word) {
    var low = word.toLowerCase();
    if (word.length === 1) { var sv = low === 'a' || low === 'e' || low === 'i' || low === 'o' || low === 'u'; if (!sv) return word; var sp = low + suffix; return word === low ? sp : sp.charAt(0).toUpperCase() + sp.slice(1); }
    var hasVowel = false;
    for (var vi = 0; vi < low.length; vi++) { var vc = low.charAt(vi); if (vc === 'a' || vc === 'e' || vc === 'i' || vc === 'o' || vc === 'u') { hasVowel = true; break; } }
    var si = 0;
    while (si < low.length) {
      var sc = low.charAt(si);
      var vowel = sc === 'a' || sc === 'e' || sc === 'i' || sc === 'o' || sc === 'u' || (!hasVowel && sc === 'y');
      if (vowel) break;
      if (sc === 'q' && low.charAt(si + 1) === 'u') si += 2;
      else si++;
    }
    var pig = si === 0 ? low + suffix : low.slice(si) + low.slice(0, si) + 'ay';
    if (word === word.toUpperCase()) return pig.toUpperCase();
    if (word.charAt(0) === word.charAt(0).toUpperCase()) return pig.charAt(0).toUpperCase() + pig.slice(1);
    return pig;
  }
  var out = '';
  var wi = 0;
  while (wi < raw.length) {
    var wc = raw.charCodeAt(wi);
    if (isSurrogate(wc)) { out += raw.charAt(wi); wi++; continue; }
    var wh = raw.charAt(wi);
    if (isLetter(wh)) {
      var wj = wi;
      while (wj < raw.length && (isLetter(raw.charAt(wj)) || (raw.charAt(wj) === APOS && wj + 1 < raw.length && isLetter(raw.charAt(wj + 1))))) wj++;
      out += latinWord(raw.slice(wi, wj));
      wi = wj;
    } else { out += wh; wi++; }
  }
  return out;
};
/* Leet cores: opinionated ASCII-safe glyph tables, basic covers the famous six, full adds eleven more, everything else rides through untouched. */
T.leetSpeak = function (s, opts) {
  var o = opts || {};
  var level = o.level || 'basic';
  if (level !== 'basic' && level !== 'full') throw new Error('Bad level \u2014 use basic or full');
  var BASIC = { A: '4', E: '3', L: '1', O: '0', S: '5', T: '7' };
  var FULL = { B: '8', C: '(', D: '|)', G: '9', I: '!', K: '|<', P: '|*', R: '|2', U: '|_|', X: '><', Z: '2' };
  var raw = String(s === undefined || s === null ? '' : s);
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var cc = raw.charCodeAt(i);
    if (cc >= 0xD800 && cc <= 0xDFFF) { out += raw.charAt(i); continue; }
    var ch = raw.charAt(i);
    var up = ch.toUpperCase();
    if (BASIC[up] !== undefined) out += BASIC[up];
    else if (level === 'full' && FULL[up] !== undefined) out += FULL[up];
    else out += ch;
  }
  return out;
};
/* Dancing-men cores: Sherlock-style stick poses as four limb bits, A to M plain and N to Z flagged, slash word gaps, tight poses only. */
T.dancingMen = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'encode';
  if (mode !== 'encode' && mode !== 'decode') throw new Error('Bad mode \u2014 use encode or decode');
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function poseOf(ch) {
    var idx = ABC.indexOf(ch);
    var n = idx < 13 ? idx : idx - 13;
    var tok = '';
    for (var b = 0; b < 4; b++) tok += ((n >> b) & 1) ? 'u' : 'd';
    return idx < 13 ? tok : tok + '*';
  }
  function isSurrogate(cc) { return cc >= 0xD800 && cc <= 0xDFFF; }
  if (mode === 'encode') {
    var src = String(s).toUpperCase();
    var out = [];
    for (var e = 0; e < src.length; e++) {
      var ch = src.charAt(e);
      var cd = src.charCodeAt(e);
      if (isSurrogate(cd)) { out.push(ch); continue; }
      if (ch === ' ' || cd === 9 || cd === 10 || cd === 13) { out.push('/'); continue; }
      if (ABC.indexOf(ch) >= 0) { out.push(poseOf(ch)); continue; }
      throw new Error('No dancing pose \u2014 cannot dance ' + JSON.stringify(ch));
    }
    return out.join(' ');
  }
  var dsrc = String(s);
  var toks = [];
  var cur = '';
  for (var dd = 0; dd < dsrc.length; dd++) {
    var dch = dsrc.charAt(dd);
    var dcc = dsrc.charCodeAt(dd);
    if (isSurrogate(dcc)) { if (cur) { toks.push(cur); cur = ''; } toks.push(dch); continue; }
    if (dcc === 32 || dcc === 9 || dcc === 10 || dcc === 13) { if (cur) { toks.push(cur); cur = ''; } continue; }
    if (dcc === 47) { if (cur) { toks.push(cur); cur = ''; } toks.push('/'); continue; }
    cur += dch;
  }
  if (cur) toks.push(cur);
  var dout = '';
  for (var tt = 0; tt < toks.length; tt++) {
    var tk = toks[tt];
    if (tk === '/') { dout += ' '; continue; }
    if (tk.length === 1 && isSurrogate(tk.charCodeAt(0))) { dout += tk; continue; }
    var low = tk.toLowerCase();
    var flagged = false;
    if (low.charAt(low.length - 1) === '*') { flagged = true; low = low.slice(0, -1); }
    if (low.length !== 4) throw new Error('Unknown pose \u2014 four limbs u or d plus optional *, got ' + JSON.stringify(tk));
    var nn = 0;
    for (var qi = 0; qi < 4; qi++) {
      var qc = low.charAt(qi);
      if (qc !== 'u' && qc !== 'd') throw new Error('Unknown pose \u2014 limbs are u or d, got ' + JSON.stringify(tk));
      if (qc === 'u') nn += (1 << qi);
    }
    if (nn >= 13) throw new Error('Unknown pose \u2014 no letter stands like ' + JSON.stringify(tk));
    dout += ABC.charAt(flagged ? nn + 13 : nn);
  }
  var res = '';
  var prevSp = true;
  for (var rr = 0; rr < dout.length; rr++) {
    var rc = dout.charAt(rr);
    if (rc === ' ') { if (!prevSp) { res += ' '; prevSp = true; } }
    else { res += rc; prevSp = false; }
  }
  return res;
};
/* ISIN cores: ISO 6166 securities identifiers, letters as base-10 pairs plus Luhn mod-10, spaces and dashes ignored. */
T.isinCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch >= 'A' && ch <= 'Z') clean += ch;
    else if (ch >= 'a' && ch <= 'z') clean += ch.toUpperCase();
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('Letters and digits only \u2014 ISIN with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  function isinDigits(cx) {
    var dstr = '';
    for (var di = 0; di < cx.length; di++) {
      var dh = cx.charAt(di);
      if (dh >= '0' && dh <= '9') dstr += dh;
      else dstr += String(dh.charCodeAt(0) - 55);
    }
    return dstr;
  }
  function isinSum(ds, startDbl) {
    var t = 0;
    var pos = 0;
    for (var li = ds.length - 1; li >= 0; li--) {
      var vv = ds.charCodeAt(li) - 48;
      if ((pos % 2 === 0) === startDbl) { vv *= 2; if (vv > 9) vv -= 9; }
      t += vv;
      pos++;
    }
    return t;
  }
  if (!clean.length) throw new Error('Enter an ISIN first \u2014 two letters, nine securities characters and a check digit');
  if (mode === 'validate') {
    if (clean.length !== 12) throw new Error('Bad length \u2014 ISINs run 12 characters, got ' + clean.length);
    var c0 = clean.charAt(0);
    var c1 = clean.charAt(1);
    if (c0 < 'A' || c0 > 'Z' || c1 < 'A' || c1 > 'Z') throw new Error('Bad country code \u2014 ISIN starts with two letters, got ' + JSON.stringify(clean.slice(0, 2)));
    for (var ni = 2; ni < 11; ni++) {
      var nh = clean.charAt(ni);
      if ((nh < '0' || nh > '9') && (nh < 'A' || nh > 'Z')) throw new Error('Bad securities character \u2014 letters or digits, got ' + JSON.stringify(nh));
    }
    var kc = clean.charAt(11);
    if (kc < '0' || kc > '9') throw new Error('Bad check digit \u2014 a digit 0-9, got ' + JSON.stringify(kc));
    if (isinSum(isinDigits(clean), false) % 10 !== 0) throw new Error('Invalid ISIN \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 ' + clean.slice(0, 2) + ' ISIN checksum passes';
  }
  if (clean.length !== 11) throw new Error('Bad prefix \u2014 11 characters make an ISIN, got ' + clean.length);
  var q0 = clean.charAt(0);
  var q1 = clean.charAt(1);
  if (q0 < 'A' || q0 > 'Z' || q1 < 'A' || q1 > 'Z') throw new Error('Bad country code \u2014 ISIN starts with two letters, got ' + JSON.stringify(clean.slice(0, 2)));
  for (var qi = 2; qi < 11; qi++) {
    var qh = clean.charAt(qi);
    if ((qh < '0' || qh > '9') && (qh < 'A' || qh > 'Z')) throw new Error('Bad securities character \u2014 letters or digits, got ' + JSON.stringify(qh));
  }
  var pds = isinDigits(clean);
  var psum = isinSum(pds, true);
  return clean + String((10 - (psum % 10)) % 10);
};
/* ISSN cores: 8-character serials with mod-11 X check, dashes and spaces ignored. */
T.issnCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || "validate";
  if (mode !== "validate" && mode !== "check-digit") throw new Error("Bad mode \u2014 use validate or check-digit");
  var raw = String(s);
  var clean = "";
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return "";
    var ch = raw.charAt(ci);
    if (ch >= "0" && ch <= "9") clean += ch;
    else if (ch === "X" || ch === "x") clean += "X";
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === "check-digit" && (ch === "?" || ch === "*" || ch === "#")) continue;
    else throw new Error("Digits only \u2014 0-9 with dashes or spaces ignored, X only as an ISSN check, got " + JSON.stringify(ch));
  }
  if (!clean.length) throw new Error("Enter digits first \u2014 an ISSN or its leading prefix");
  if (mode === "validate") {
    if (clean.length !== 8) throw new Error("Bad length \u2014 ISSNs run 8 characters, got " + clean.length);
    var vsum = 0;
    for (var vi = 0; vi < 7; vi++) {
      var vh = clean.charAt(vi);
      if (vh < "0" || vh > "9") throw new Error("Bad ISSN \u2014 first 7 characters are digits, got " + JSON.stringify(vh));
      vsum += (vh.charCodeAt(0) - 48) * (8 - vi);
    }
    var vc = clean.charAt(7);
    if ((vc < "0" || vc > "9") && vc !== "X") throw new Error("Bad ISSN check \u2014 a digit or X, got " + JSON.stringify(vc));
    vsum += (vc === "X" ? 10 : vc.charCodeAt(0) - 48);
    if (vsum % 11 !== 0) throw new Error("Invalid ISSN \u2014 checksum fails for " + JSON.stringify(clean));
    return "Valid \u2014 ISSN checksum passes";
  }
  if (clean.indexOf("X") >= 0) throw new Error("No X in a prefix \u2014 pass the first 7 digits");
  if (clean.length !== 7) throw new Error("Bad prefix \u2014 7 digits make an ISSN, got " + clean.length);
  var psum = 0;
  for (var pi = 0; pi < 7; pi++) {
    var ph = clean.charAt(pi);
    if (ph < "0" || ph > "9") throw new Error("Digits only \u2014 7-digit prefix has no X");
    psum += (ph.charCodeAt(0) - 48) * (8 - pi);
  }
  var cd = (11 - (psum % 11)) % 11;
  return clean + (cd === 10 ? "X" : String(cd));
};
/* CUSIP cores: North-American securities numbers with doubled seconds and star-at-hash issue marks, spaces and dashes ignored. */
T.cusipCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch >= 'A' && ch <= 'Z') clean += ch;
    else if (ch >= 'a' && ch <= 'z') clean += ch.toUpperCase();
    else if (ch === '*' || ch === '@' || ch === '#') clean += ch;
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && ch === '?') continue;
    else throw new Error('Letters, digits and *@# only \u2014 CUSIP with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  function cusipVal(kx) {
    if (kx >= '0' && kx <= '9') return kx.charCodeAt(0) - 48;
    if (kx >= 'A' && kx <= 'Z') return kx.charCodeAt(0) - 55;
    if (kx === '*') return 36;
    if (kx === '@') return 37;
    return 38;
  }
  function cusipDigit(vv) { return vv < 10 ? vv : Math.floor(vv / 10) + (vv % 10); }
  function cusipCheck(px) {
    var tt = 0;
    for (var ji = 0; ji < 8; ji++) {
      var wd = cusipVal(px.charAt(ji));
      if (ji % 2 === 1) wd *= 2;
      tt += cusipDigit(wd);
    }
    return String((10 - (tt % 10)) % 10);
  }
  if (!clean.length) throw new Error('Enter a CUSIP first \u2014 eight securities characters and a check digit');
  if (mode === 'validate') {
    if (clean.length !== 9) throw new Error('Bad length \u2014 CUSIPs run 9 characters, got ' + clean.length);
    for (var ni = 0; ni < 8; ni++) {
      var nh = clean.charAt(ni);
      if ((nh < '0' || nh > '9') && (nh < 'A' || nh > 'Z') && nh !== '*' && nh !== '@' && nh !== '#') throw new Error('Bad CUSIP character \u2014 letters, digits or *@#, got ' + JSON.stringify(nh));
    }
    var kc = clean.charAt(8);
    if (kc < '0' || kc > '9') throw new Error('Bad check digit \u2014 a digit 0-9, got ' + JSON.stringify(kc));
    if (cusipCheck(clean.slice(0, 8)) !== kc) throw new Error('Invalid CUSIP \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 CUSIP checksum passes';
  }
  if (clean.length !== 8) throw new Error('Bad prefix \u2014 8 characters make a CUSIP, got ' + clean.length);
  for (var qi = 0; qi < 8; qi++) {
    var qh = clean.charAt(qi);
    if ((qh < '0' || qh > '9') && (qh < 'A' || qh > 'Z') && qh !== '*' && qh !== '@' && qh !== '#') throw new Error('Bad prefix character \u2014 letters, digits or *@#, got ' + JSON.stringify(qh));
  }
  return clean + cusipCheck(clean);
};
/* LEI cores: ISO 17442 legal-entity identifiers with mod-97 check pair, spaces and dashes ignored. */
T.leiCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch >= 'A' && ch <= 'Z') clean += ch;
    else if (ch >= 'a' && ch <= 'z') clean += ch.toUpperCase();
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('Letters and digits only \u2014 LEI with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  function leiMod(st) {
    var rr = 0;
    for (var ii = 0; ii < st.length; ii++) {
      var kk = st.charAt(ii);
      if (kk >= '0' && kk <= '9') rr = (rr * 10 + (kk.charCodeAt(0) - 48)) % 97;
      else {
        var vv = kk.charCodeAt(0) - 55;
        rr = (rr * 10 + Math.floor(vv / 10)) % 97;
        rr = (rr * 10 + (vv % 10)) % 97;
      }
    }
    return rr;
  }
  if (!clean.length) throw new Error('Enter an LEI first \u2014 eighteen entity characters and two check digits');
  if (mode === 'validate') {
    if (clean.length !== 20) throw new Error('Bad length \u2014 LEIs run 20 characters, got ' + clean.length);
    for (var ni = 0; ni < 18; ni++) {
      var nh = clean.charAt(ni);
      if ((nh < '0' || nh > '9') && (nh < 'A' || nh > 'Z')) throw new Error('Bad entity character \u2014 letters or digits, got ' + JSON.stringify(nh));
    }
    var d0 = clean.charAt(18);
    var d1 = clean.charAt(19);
    if (d0 < '0' || d0 > '9' || d1 < '0' || d1 > '9') throw new Error('Bad check digits \u2014 two digits close the LEI');
    if (leiMod(clean) !== 1) throw new Error('Invalid LEI \u2014 mod-97 check fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 LEI checksum passes (20 characters)';
  }
  if (clean.length !== 18) throw new Error('Bad prefix \u2014 18 characters make an LEI, got ' + clean.length);
  for (var qi = 0; qi < 18; qi++) {
    var qh = clean.charAt(qi);
    if ((qh < '0' || qh > '9') && (qh < 'A' || qh > 'Z')) throw new Error('Bad prefix character \u2014 letters or digits, got ' + JSON.stringify(qh));
  }
  var cd = 98 - leiMod(clean + '00');
  return clean + (cd < 10 ? '0' : '') + String(cd);
};
/* SEDOL cores: London Stock Exchange Daily Official List numbers, consonants plus digits with weighted check digit, spaces and dashes ignored. */
T.sedolCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch >= 'A' && ch <= 'Z') clean += ch;
    else if (ch >= 'a' && ch <= 'z') clean += ch.toUpperCase();
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('SEDOL characters only \u2014 letters or digits with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  var sedW = [1, 3, 1, 7, 3, 9];
  function sedVal(kk) {
    if (kk >= '0' && kk <= '9') return kk.charCodeAt(0) - 48;
    return kk.charCodeAt(0) - 55;
  }
  function sedVowel(kk) { return kk === 'A' || kk === 'E' || kk === 'I' || kk === 'O' || kk === 'U'; }
  function sedDigit(px) {
    var tt = 0;
    for (var ji = 0; ji < 6; ji++) tt += sedVal(px.charAt(ji)) * sedW[ji];
    return String((10 - (tt % 10)) % 10);
  }
  if (!clean.length) throw new Error('Enter a SEDOL first \u2014 six characters plus check digit');
  if (mode === 'validate') {
    if (clean.length !== 7) throw new Error('Bad length \u2014 SEDOLs run 7 characters, got ' + clean.length);
    for (var ni = 0; ni < 6; ni++) {
      var nh = clean.charAt(ni);
      if ((nh < '0' || nh > '9') && (nh < 'A' || nh > 'Z')) throw new Error('Bad SEDOL character \u2014 letters or digits, got ' + JSON.stringify(nh));
      if (sedVowel(nh)) throw new Error('No vowels \u2014 SEDOL skips AEIOU, got ' + JSON.stringify(nh));
    }
    var kc = clean.charAt(6);
    if (kc < '0' || kc > '9') throw new Error('Bad check digit \u2014 one digit closes the SEDOL, got ' + JSON.stringify(kc));
    if (sedDigit(clean.slice(0, 6)) !== kc) throw new Error('Invalid SEDOL \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 SEDOL checksum passes (7 characters)';
  }
  if (clean.length !== 6) throw new Error('Bad prefix \u2014 6 characters make a SEDOL, got ' + clean.length);
  for (var qi = 0; qi < 6; qi++) {
    var qh = clean.charAt(qi);
    if ((qh < '0' || qh > '9') && (qh < 'A' || qh > 'Z')) throw new Error('Bad prefix character \u2014 letters or digits, got ' + JSON.stringify(qh));
    if (sedVowel(qh)) throw new Error('No vowels in prefix \u2014 SEDOL skips AEIOU, got ' + JSON.stringify(qh));
  }
  return clean + sedDigit(clean);
};
/* FIGI cores: OpenFIGI global identifiers, consonants plus digits with G in third place and doubled-evens check digit, spaces and dashes ignored. */
T.figiCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch >= 'A' && ch <= 'Z') clean += ch;
    else if (ch >= 'a' && ch <= 'z') clean += ch.toUpperCase();
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('FIGI characters only \u2014 letters or digits with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  function figVal(kk) {
    if (kk >= '0' && kk <= '9') return kk.charCodeAt(0) - 48;
    return kk.charCodeAt(0) - 55;
  }
  function figVowel(kk) { return kk === 'A' || kk === 'E' || kk === 'I' || kk === 'O' || kk === 'U'; }
  function figDigit(px) {
    var tt = 0;
    for (var ji = 0; ji < 11; ji++) {
      var vv = figVal(px.charAt(ji));
      if ((ji + 1) % 2 === 0) vv = vv * 2;
      tt += Math.floor(vv / 10) + (vv % 10);
    }
    return String((10 - (tt % 10)) % 10);
  }
  if (!clean.length) throw new Error('Enter a FIGI first \u2014 eleven characters plus check digit');
  if (mode === 'validate') {
    if (clean.length !== 12) throw new Error('Bad length \u2014 FIGIs run 12 characters, got ' + clean.length);
    for (var ni = 0; ni < 11; ni++) {
      var nh = clean.charAt(ni);
      if ((nh < '0' || nh > '9') && (nh < 'A' || nh > 'Z')) throw new Error('Bad FIGI character \u2014 letters or digits, got ' + JSON.stringify(nh));
      if (figVowel(nh)) throw new Error('No vowels \u2014 FIGI skips AEIOU, got ' + JSON.stringify(nh));
    }
    if (clean.charAt(2) !== 'G') throw new Error('Third character \u2014 FIGIs carry G in third place, got ' + JSON.stringify(clean.charAt(2)));
    var kc = clean.charAt(11);
    if (kc < '0' || kc > '9') throw new Error('Bad check digit \u2014 one digit closes the FIGI, got ' + JSON.stringify(kc));
    if (figDigit(clean.slice(0, 11)) !== kc) throw new Error('Invalid FIGI \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 FIGI checksum passes (12 characters)';
  }
  if (clean.length !== 11) throw new Error('Bad prefix \u2014 11 characters make a FIGI, got ' + clean.length);
  for (var qi = 0; qi < 11; qi++) {
    var qh = clean.charAt(qi);
    if ((qh < '0' || qh > '9') && (qh < 'A' || qh > 'Z')) throw new Error('Bad prefix character \u2014 letters or digits, got ' + JSON.stringify(qh));
    if (figVowel(qh)) throw new Error('No vowels in prefix \u2014 FIGI skips AEIOU, got ' + JSON.stringify(qh));
  }
  if (clean.charAt(2) !== 'G') throw new Error('Third character \u2014 FIGIs carry G in third place, got ' + JSON.stringify(clean.charAt(2)));
  return clean + figDigit(clean);
};
/* ABA cores: US routing transit numbers with 3-7-1 weighted checksum, spaces and dashes ignored. */
T.abaCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('ABA digits only \u2014 nine digits with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  var abaW = [3, 7, 1];
  function abaSum(px) {
    var at = 0;
    for (var ji = 0; ji < 8; ji++) at += (px.charCodeAt(ji) - 48) * abaW[ji % 3];
    return at;
  }
  if (!clean.length) throw new Error('Enter an ABA number first \u2014 eight digits plus check digit');
  if (mode === 'validate') {
    if (clean.length !== 9) throw new Error('Bad length \u2014 ABAs run 9 digits, got ' + clean.length);
    var full = abaSum(clean.slice(0, 8)) + (clean.charCodeAt(8) - 48);
    if (full % 10 !== 0) throw new Error('Invalid ABA \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 ABA checksum passes (9 digits)';
  }
  if (clean.length !== 8) throw new Error('Bad prefix \u2014 8 digits make an ABA, got ' + clean.length);
  return clean + String((10 - (abaSum(clean) % 10)) % 10);
};
/* NPI cores: US National Provider Identifiers with 80840-prefixed Luhn check digit, spaces and dashes ignored. */
T.npiCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('NPI digits only \u2014 ten digits with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  function npiLuhn(px) {
    var str = '80840' + px;
    var nt = 0;
    var dbl = false;
    for (var ji = str.length - 1; ji >= 0; ji--) {
      var nd = str.charCodeAt(ji) - 48;
      if (dbl) { nd = nd * 2; if (nd > 9) nd -= 9; }
      nt += nd;
      dbl = !dbl;
    }
    return nt;
  }
  if (!clean.length) throw new Error('Enter an NPI first \u2014 nine digits plus check digit');
  if (mode === 'validate') {
    if (clean.length !== 10) throw new Error('Bad length \u2014 NPIs run 10 digits, got ' + clean.length);
    if (npiLuhn(clean) % 10 !== 0) throw new Error('Invalid NPI \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 NPI checksum passes (10 digits)';
  }
  if (clean.length !== 9) throw new Error('Bad prefix \u2014 9 digits make an NPI, got ' + clean.length);
  return clean + String((10 - (npiLuhn(clean + '0') % 10)) % 10);
};
/* VIN cores: ISO 3779 vehicle identifiers with transliterated mod-11 check letter, spaces and dashes ignored. */
T.vinCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch >= 'A' && ch <= 'Z') clean += ch;
    else if (ch >= 'a' && ch <= 'z') clean += ch.toUpperCase();
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('VIN characters only \u2014 letters or digits with spaces or dashes ignored, got ' + JSON.stringify(ch));
  }
  var vinT = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  var vinW = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  function vinVal(kk) {
    if (kk >= '0' && kk <= '9') return kk.charCodeAt(0) - 48;
    return vinT[kk];
  }
  function vinIOQ(kk) { return kk === 'I' || kk === 'O' || kk === 'Q'; }
  function vinDigit(core16) {
    var nt = 0;
    for (var ji = 0; ji < 17; ji++) {
      if (ji === 8) continue;
      nt += vinVal(core16.charAt(ji < 8 ? ji : ji - 1)) * vinW[ji];
    }
    var rr = nt % 11;
    return rr === 10 ? 'X' : String(rr);
  }
  if (!clean.length) throw new Error('Enter a VIN first \u2014 seventeen characters with check letter ninth');
  if (mode === 'validate') {
    if (clean.length !== 17) throw new Error('Bad length \u2014 VINs run 17 characters, got ' + clean.length);
    for (var ni = 0; ni < 17; ni++) {
      var nh = clean.charAt(ni);
      if ((nh < '0' || nh > '9') && (nh < 'A' || nh > 'Z')) throw new Error('Bad VIN character \u2014 letters or digits, got ' + JSON.stringify(nh));
      if (vinIOQ(nh)) throw new Error('No IOQ \u2014 VINs skip I, O and Q, got ' + JSON.stringify(nh));
    }
    if (vinDigit(clean.slice(0, 8) + clean.slice(9)) !== clean.charAt(8)) throw new Error('Invalid VIN \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 VIN checksum passes (17 characters)';
  }
  if (clean.length !== 16) throw new Error('Bad prefix \u2014 16 characters make a VIN, got ' + clean.length);
  for (var qi = 0; qi < 16; qi++) {
    var qh = clean.charAt(qi);
    if ((qh < '0' || qh > '9') && (qh < 'A' || qh > 'Z')) throw new Error('Bad prefix character \u2014 letters or digits, got ' + JSON.stringify(qh));
    if (vinIOQ(qh)) throw new Error('No IOQ in prefix \u2014 VINs skip I, O and Q, got ' + JSON.stringify(qh));
  }
  return clean.slice(0, 8) + vinDigit(clean) + clean.slice(8);
};
/* ORCID cores: researcher identifiers with mod-11-2 check digit, dashes and spaces ignored. */
T.orcidCheck = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'validate';
  if (mode !== 'validate' && mode !== 'check-digit') throw new Error('Bad mode \u2014 use validate or check-digit');
  var raw = String(s);
  var clean = '';
  for (var ci = 0; ci < raw.length; ci++) {
    var cc = raw.charCodeAt(ci);
    if (cc >= 0xD800 && cc <= 0xDFFF) return '';
    var ch = raw.charAt(ci);
    if (ch >= '0' && ch <= '9') clean += ch;
    else if (ch === 'X' || ch === 'x') clean += 'X';
    else if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 45) continue;
    else if (mode === 'check-digit' && (ch === '?' || ch === '*' || ch === '#')) continue;
    else throw new Error('ORCID characters only \u2014 digits or X with dashes or spaces ignored, got ' + JSON.stringify(ch));
  }
  function orcDigit(core15) {
    var nt = 0;
    for (var ji = 0; ji < 15; ji++) nt = (nt + (core15.charCodeAt(ji) - 48)) * 2;
    var rr = (12 - (nt % 11)) % 11;
    return rr === 10 ? 'X' : String(rr);
  }
  if (!clean.length) throw new Error('Enter an ORCID first \u2014 fifteen digits plus check digit');
  if (mode === 'validate') {
    if (clean.length !== 16) throw new Error('Bad length \u2014 ORCIDs run 16 characters, got ' + clean.length);
    for (var ni = 0; ni < 15; ni++) {
      var nh = clean.charAt(ni);
      if (nh < '0' || nh > '9') throw new Error('Bad ORCID character \u2014 first fifteen are digits, got ' + JSON.stringify(nh));
    }
    var kc = clean.charAt(15);
    if ((kc < '0' || kc > '9') && kc !== 'X') throw new Error('Bad check digit \u2014 digit or X closes the ORCID, got ' + JSON.stringify(kc));
    if (orcDigit(clean.slice(0, 15)) !== kc) throw new Error('Invalid ORCID \u2014 checksum fails for ' + JSON.stringify(clean));
    return 'Valid \u2014 ORCID checksum passes (16 characters)';
  }
  if (clean.length !== 15) throw new Error('Bad prefix \u2014 15 digits make an ORCID, got ' + clean.length);
  if (/[^0-9]/.test(clean)) throw new Error('Bad prefix character \u2014 fifteen digits, got ' + JSON.stringify(clean));
  return clean.slice(0, 4) + '-' + clean.slice(4, 8) + '-' + clean.slice(8, 12) + '-' + clean.slice(12) + orcDigit(clean);
};
function base32ToBytes(s) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var clean = unquote(s).toUpperCase().replace(/[\s=]/g, '');
  if (!clean) throw new Error('Enter Base32 input');
  if (/[^A-Z2-7]/.test(clean)) throw new Error('Invalid Base32 character: ' + clean.match(/[^A-Z2-7]/)[0]);
  var bits = '';
  for (var i = 0; i < clean.length; i++) {
    bits += alphabet.indexOf(clean[i]).toString(2).padStart(5, '0');
  }
  var bytes = [];
  for (var k = 0; k + 8 <= bits.length; k += 8) bytes.push(parseInt(bits.slice(k, k + 8), 2));
  if (!bytes.length) throw new Error('Invalid Base32 input');
  return bytes;
}
T.base32Bytes = function (s) { return new Uint8Array(base32ToBytes(s)); };
T.base32Decode = function (s) {
  return new TextDecoder().decode(new Uint8Array(base32ToBytes(s)));
};
var BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58ToBytes(s) {
  var clean = unquote(s).replace(/\s/g, '');
  if (!clean) throw new Error('Enter Base58 input');
  var bad = clean.match(/[^1-9A-HJ-NP-Za-km-z]/);
  if (bad) throw new Error('Invalid Base58 character: ' + bad[0]);
  var zeros = 0;
  while (zeros < clean.length && clean.charAt(zeros) === '1') zeros++;
  var num = BigInt(0);
  var i;
  for (i = 0; i < clean.length; i++) num = num * BigInt(58) + BigInt(BASE58_ALPHABET.indexOf(clean.charAt(i)));
  var hex = num.toString(16);  if (hex === '0') hex = '';
  if (hex.length % 2 === 1) hex = '0' + hex;
  var out = [];
  var k;
  for (k = 0; k < zeros; k++) out.push(0);
  for (k = 0; k < hex.length; k += 2) out.push(parseInt(hex.slice(k, k + 2), 16));
  if (!out.length) throw new Error('Invalid Base58 input');
  return out;
}
T.base58Bytes = function (s) { return new Uint8Array(base58ToBytes(s)); };
/* Ascii85 encode: UTF-8 bytes to printable Base85 (4 bytes to 5 chars, all-zero groups squeeze to z, final partial groups emit length-matched prefixes). */
/* Quoted-Printable encode: RFC 2045 email-safe text (printables pass, = and non-ASCII become =XX, trailing blanks hardened, lines soft-wrapped at 76 cols). */
/* Punycode encode: RFC 3492 Bootstring for internationalized hostnames (per-label xn--, ASCII passes through, case folds, lone surrogates become U+FFFD). */
/* UTF-7 encode: RFC 2152 mail-safe text (printable ASCII passes, + escapes to +-, runs of other units shift to modified Base64 over UTF-16BE). */
T.utf7Encode = function (s) {
  var str = String(s);
  if (!str) return '';
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '', run = [];
  function flush() {
    if (!run.length) return;
    var acc = 0, nbits = 0, enc = '';
    for (var i = 0; i < run.length; i++) {
      var u = run[i];
      var hi = (u >> 8) & 255, lo = u & 255, b;
      for (var k = 0; k < 2; k++) {
        b = k ? lo : hi;
        acc = (acc << 8) | b;
        nbits += 8;
        while (nbits >= 6) { nbits -= 6; enc += B64.charAt((acc >> nbits) & 63); }
      }
    }
    if (nbits) enc += B64.charAt((acc << (6 - nbits)) & 63);
    out += '+' + enc + '-';
    run = [];
  }
  for (var p = 0; p < str.length; p++) {
    var c = str.charCodeAt(p);
    if (c === 43) { flush(); out += '+-'; }
    else if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) { flush(); out += str.charAt(p); }
    else run.push(c);
  }
  flush();
  return out;
};
/* UTF-7 decode: pasted quotes stripped, +- folds to +, shifted runs decoded as UTF-16BE with zero-pad-bit and bad-shift guards. */
T.utf7Decode = function (s) {
  var str = unquote(s);
  if (!str.trim()) throw new Error('Enter UTF-7 input');
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '';
  for (var p = 0; p < str.length; p++) {
    var ch = str.charAt(p);
    if (ch !== '+') { out += ch; continue; }
    if (str.charAt(p + 1) === '-') { out += '+'; p++; continue; }
    var e = p + 1;
    while (e < str.length && B64.indexOf(str.charAt(e)) >= 0) e++;
    if (e >= str.length || str.charAt(e) !== '-') throw new Error('Bad shift at position ' + (p + 1) + ' \u2014 need Base64 then -');
    var chunk = str.slice(p + 1, e);
    if (chunk.length % 4 === 1) throw new Error('Bad Base64 length at position ' + (p + 1));
    var bytes = [], acc = 0, nbits = 0;
    for (var i = 0; i < chunk.length; i++) {
      acc = (acc << 6) | B64.indexOf(chunk.charAt(i));
      nbits += 6;
      if (nbits >= 8) { nbits -= 8; bytes.push((acc >> nbits) & 255); }
    }
    if (nbits && (acc & ((1 << nbits) - 1))) throw new Error('Non-zero pad bits at position ' + (p + 1));
    if (bytes.length % 2) throw new Error('Odd byte count at position ' + (p + 1));
    for (var k = 0; k < bytes.length; k += 2) out += String.fromCharCode(bytes[k] * 256 + bytes[k + 1]);
    p = e;
  }
  return out;
};
T.punycodeEncode = function (s) {
  var str = String(s);
  if (!str.trim()) return '';
  function toPoints(st) {
    var pts = [];
    for (var i = 0; i < st.length; i++) {
      var c = st.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < st.length) {
        var d = st.charCodeAt(i + 1);
        if (d >= 56320 && d <= 57343) { pts.push((c - 55296) * 1024 + (d - 56320) + 65536); i++; continue; }
      }
      pts.push((c >= 55296 && c <= 57343) ? 65533 : c);
    }
    return pts;
  }
  function adapt(delta, numpoints, first) {
    delta = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
    delta += Math.floor(delta / numpoints);
    var k = 0;
    while (delta > 35) { delta = Math.floor(delta / 35); k += 36; }
    return k + Math.floor(36 * delta / (delta + 38));
  }
  function digitChar(d) { return d < 26 ? String.fromCharCode(97 + d) : String.fromCharCode(48 + d - 26); }
  function encLabel(label) {
    var input = toPoints(label.toLowerCase());
    var basic = input.filter(function (c) { return c < 128; });
    if (basic.length === input.length) return label.toLowerCase();
    var out = basic.map(function (c) { return String.fromCharCode(c); }).join('');
    if (basic.length) out += '-';
    var n = 128, delta = 0, bias = 72, h = basic.length;
    while (h < input.length) {
      var m = 2147483647, i, j;
      for (i = 0; i < input.length; i++) if (input[i] >= n && input[i] < m) m = input[i];
      delta += (m - n) * (h + 1);
      n = m;
      for (j = 0; j < input.length; j++) {
        if (input[j] < n) delta++;
        else if (input[j] === n) {
          var q = delta, k = 36;
          for (;;) {
            var tt = k <= bias ? 1 : (k >= bias + 26 ? 26 : k - bias);
            if (q < tt) break;
            out += digitChar(tt + (q - tt) % (36 - tt));
            q = Math.floor((q - tt) / (36 - tt));
            k += 36;
          }
          out += digitChar(q);
          bias = adapt(delta, h + 1, h === basic.length);
          delta = 0;
          h++;
        }
      }
      delta++;
      n++;
    }
    return 'xn--' + out;
  }
  return str.split(/[\.\u3002\uFF0E\uFF61]/).map(function (lb) {
    if (!lb) throw new Error('Empty domain label \u2014 check dots');
    return encLabel(lb);
  }).join('.');
};
/* Punycode decode: xn-- labels back to Unicode (basic run before the last dash, digit thresholds per bias, overflow and bad-digit guards with positions). */
T.punycodeDecode = function (s) {
  var str = String(s);
  if (!str.trim()) throw new Error('Enter Punycode input');
  function digitVal(c) {
    if (c >= 48 && c <= 57) return c - 22;
    if (c >= 65 && c <= 90) return c - 65;
    if (c >= 97 && c <= 122) return c - 97;
    return -1;
  }
  function adapt(delta, numpoints, first) {
    delta = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
    delta += Math.floor(delta / numpoints);
    var k = 0;
    while (delta > 35) { delta = Math.floor(delta / 35); k += 36; }
    return k + Math.floor(36 * delta / (delta + 38));
  }
  function decLabel(label, pos) {
    var low = label.toLowerCase();
    if (low.slice(0, 4) !== 'xn--') return label;
    var rest = low.slice(4);
    if (!rest) throw new Error('Empty Punycode label at part ' + pos);
    var dash = rest.lastIndexOf('-');
    var basic = dash < 0 ? '' : rest.slice(0, dash);
    var ext = dash < 0 ? rest : rest.slice(dash + 1);
    var out = [];
    for (var b = 0; b < basic.length; b++) {
      var bc = basic.charCodeAt(b);
      if (bc >= 128) throw new Error('Bad basic char at part ' + pos + ', offset ' + (b + 1));
      out.push(bc);
    }
    var n = 128, i = 0, bias = 72, h = out.length, e = 0;
    while (e < ext.length) {
      var oldi = i, w = 1, k = 36;
      for (;;) {
        if (e >= ext.length) throw new Error('Truncated input at part ' + pos);
        var d = digitVal(ext.charCodeAt(e++));
        if (d < 0) throw new Error('Bad digit at part ' + pos + ', offset ' + e);
        if (d > Math.floor((2147483647 - i) / w)) throw new Error('Overflow at part ' + pos);
        i += d * w;
        var tt = k <= bias ? 1 : (k >= bias + 26 ? 26 : k - bias);
        if (d < tt) break;
        if (w > Math.floor(2147483647 / (36 - tt))) throw new Error('Overflow at part ' + pos);
        w *= 36 - tt;
        k += 36;
      }
      bias = adapt(i - oldi, h + 1, oldi === 0);
      n += Math.floor(i / (h + 1));
      i %= h + 1;
      if (n < 0 || n > 1114111) throw new Error('Bad code point at part ' + pos);
      out.splice(i, 0, n);
      h++;
      i++;
    }
    return out.map(function (c) { return String.fromCodePoint(c); }).join('');
  }
  return str.split(/[.\u3002\uFF0E\uFF61]/).map(function (lb, ix) {
    if (!lb) throw new Error('Empty domain label \u2014 check dots');
    return decLabel(lb, ix + 1);
  }).join('.');
};
T.quotedPrintableEncode = function (s) {
  function encLine(line) {
    var bs = new TextEncoder().encode(line);
    var out = '', col = 0;
    function emit(tok) {
      if (col + tok.length > 76) { out += '=\n'; col = 0; }
      out += tok; col += tok.length;
    }
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], last = (i === bs.length - 1);
      if (b === 61) emit('=3D');
      else if (b === 9 || b === 32) emit(last ? (b === 9 ? '=09' : '=20') : String.fromCharCode(b));
      else if ((b >= 33 && b <= 60) || (b >= 62 && b <= 126)) emit(String.fromCharCode(b));
      else { var h = b.toString(16).toUpperCase(); emit('=' + (h.length < 2 ? '0' + h : h)); }
    }
    return out;
  }
  return String(s).split(/\r\n|\r|\n/).map(encLine).join('\n');
};
/* Quoted-Printable decode: pasted quotes stripped, soft breaks folded, =XX hex required (dangling or bad escapes rejected with positions), bytes as UTF-8. */
T.quotedPrintableDecode = function (s) {
  var t = unquote(s);
  if (!t.trim()) throw new Error('Enter quoted-printable input');
  var body = t.replace(/=\r\n|=\n|=\r/g, '');
  var bytes = [];
  for (var i = 0; i < body.length; i++) {
    var ch = body.charAt(i);
    if (ch !== '=') {
      var code = body.charCodeAt(i);
      if (code < 128) bytes.push(code);
      else { var eb = new TextEncoder().encode(ch); for (var k = 0; k < eb.length; k++) bytes.push(eb[k]); }
      continue;
    }
    var hex = body.slice(i + 1, i + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw new Error('Bad = escape at position ' + (i + 1) + ' \u2014 need two hex digits');
    bytes.push(parseInt(hex, 16));
    i += 2;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};
T.ascii85Encode = function (s) {
  var bytes = new TextEncoder().encode(String(s));
  var out = '';
  for (var i = 0; i < bytes.length; i += 4) {
    var n = Math.min(4, bytes.length - i);
    var v = 0;
    for (var j = 0; j < 4; j++) v = v * 256 + (j < n ? bytes[i + j] : 0);
    if (n === 4 && v === 0) { out += 'z'; continue; }
    var chunk = '';
    for (var k = 0; k < 5; k++) { chunk = String.fromCharCode(33 + v % 85) + chunk; v = Math.floor(v / 85); }
    out += chunk.slice(0, n + 1);
  }
  return out;
};
/* Ascii85 decode: pasted quotes stripped, whitespace skipped, lone z expands to four zero bytes, final short groups pad with u, overflows and stray characters rejected with positions. */
T.ascii85Decode = function (s) {
  var clean = unquote(s).replace(/\s/g, '');
  if (!clean) throw new Error('Enter Ascii85 input');
  var out = [], group = [];
  function pushGroup(g, n) {
    var v = 0;
    for (var i = 0; i < 5; i++) v = v * 85 + (i < g.length ? g[i] : 84);
    if (v > 4294967295) throw new Error('Ascii85 overflow \u2014 group exceeds 4 bytes');
    var b = [Math.floor(v / 16777216) % 256, Math.floor(v / 65536) % 256, Math.floor(v / 256) % 256, v % 256];
    for (var k = 0; k < n; k++) out.push(b[k]);
  }
  for (var p = 0; p < clean.length; p++) {
    var ch = clean.charAt(p);
    if (ch === 'z') {
      if (group.length) throw new Error('Stray z at position ' + (p + 1) + ' \u2014 z must stand alone as a full group');
      out.push(0, 0, 0, 0);
      continue;
    }
    var code = clean.charCodeAt(p);
    if (code < 33 || code > 117) throw new Error('Invalid Ascii85 character: ' + ch);
    group.push(code - 33);
    if (group.length === 5) { pushGroup(group, 4); group = []; }
  }
  if (group.length === 1) throw new Error('Trailing lone character \u2014 final groups need 2 to 4 chars');
  if (group.length) pushGroup(group, group.length - 1);
  return new TextDecoder().decode(new Uint8Array(out));
};
T.base58Encode = function (s) {
  var bytes = new TextEncoder().encode(String(s));  var zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  var num = BigInt(0);
  var i;
  for (i = 0; i < bytes.length; i++) num = num * BigInt(256) + BigInt(bytes[i]);
  var enc = '';
  while (num > BigInt(0)) { enc = BASE58_ALPHABET.charAt(Number(num % BigInt(58))) + enc; num = num / BigInt(58); }
  var lead = '';
  for (i = 0; i < zeros; i++) lead += '1';
  return lead + enc;
};
T.base58Decode = function (s) {
  return new TextDecoder().decode(new Uint8Array(base58ToBytes(s)));
};
function parseSemver(s) {
  var t = unquote(s);
  if (t.charAt(0) === 'v' || t.charAt(0) === 'V' || t.charAt(0) === '=') t = t.slice(1);
  var m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(t);
  if (!m) throw new Error('Invalid semver: use MAJOR.MINOR.PATCH like 1.2.3');
  function num(p, name) {
    if (p.length > 1 && p.charAt(0) === '0') throw new Error('Invalid semver: leading zero in ' + name);
    if (p.length > 15) throw new Error('Invalid semver: ' + name + ' too large');
    return parseInt(p, 10);
  }
  return { major: num(m[1], 'major'), minor: num(m[2], 'minor'), patch: num(m[3], 'patch'), pre: m[4] || '', build: m[5] || '', raw: t };
}
function cmpSemver(a, b) {
  var x = parseSemver(a), y = parseSemver(b);
  var d = x.major - y.major || x.minor - y.minor || x.patch - y.patch;
  if (d !== 0) return d < 0 ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  var xi = x.pre.split('.'), yi = y.pre.split('.');
  for (var i = 0; i < xi.length && i < yi.length; i++) {
    if (xi[i] === yi[i]) continue;
    var xn = /^\d+$/.test(xi[i]), yn = /^\d+$/.test(yi[i]);
    if (xn && yn) return parseInt(xi[i], 10) - parseInt(yi[i], 10) < 0 ? -1 : 1;
    if (xn) return -1;
    if (yn) return 1;
    return xi[i] < yi[i] ? -1 : 1;
  }
  if (xi.length === yi.length) return 0;
  return xi.length < yi.length ? -1 : 1;
}
T.parseSemver = parseSemver;
T.semverCompare = function (a, b) {
  var c = cmpSemver(a, b);
  var x = parseSemver(a), y = parseSemver(b);
  var op = c < 0 ? '<' : c > 0 ? '>' : '==';
  var scope;
  if (x.major !== y.major) scope = 'major bump';
  else if (x.minor !== y.minor) scope = 'minor bump';
  else if (x.patch !== y.patch) scope = 'patch bump';
  else if (c === 0) scope = 'equal';
  else if (!x.pre || !y.pre) scope = 'release beats prerelease';
  else scope = 'prerelease';
  return x.raw + ' ' + op + ' ' + y.raw + ' (' + scope + ')';
};

/* Semver-compare UI contract: main input plus compareTo option, friendly message when either is blank. Moved from the manifest so shell UI delegates to this single source. */
T.semverCompareOpts = function (s, opts) {
  var b = (opts && opts.compareTo) || '';
  if (!String(s).trim() || !String(b).trim()) return 'Enter a version in each field';
  return T.semverCompare(String(s).trim(), String(b).trim());
};
T.toolScaffold = function (opts) {
  opts = opts || {};
  var slug = String(opts.slug === undefined ? '' : opts.slug).trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(slug)) throw new Error('Slug must start with a letter, then lowercase, digits or hyphens (2-41 chars)');
  var kind = String(opts.kind === undefined ? 'transform' : opts.kind);
  if (kind !== 'transform' && kind !== 'generator' && kind !== 'custom') throw new Error('Kind must be transform, generator or custom');
  var name = String(opts.name === undefined ? '' : opts.name).trim();
  if (!name) name = slug.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  var desc = String(opts.desc === undefined ? '' : opts.desc).trim() || name;
  function esc(s) { var bs = String.fromCharCode(92); return String(s).split(bs).join(bs + bs).split(String.fromCharCode(39)).join(bs + String.fromCharCode(39)); }
  var camel = slug.split('-').map(function (w, i) { return i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join('');
  var sq = String.fromCharCode(39);
  var tag = esc(slug.split('-')[0]);
  var L = [];
  L.push('// scaffold for ' + sq + esc(slug) + sq + ' (' + kind + '). Paste, wire, ship.');
  L.push('// 1. manifest entry (js/manifest.js, before the closing bracket)');
  if (kind === 'custom') {
    L.push('  { slug: ' + sq + esc(slug) + sq + ', name: ' + sq + esc(name) + sq + ', desc: ' + sq + esc(desc) + sq + ', category: ' + sq + 'text' + sq + ', tags: [' + sq + tag + sq + '], icon: ' + sq + 'code2' + sq + ', template: ' + sq + 'custom' + sq + ' },');
    L.push('');
    L.push('// 2. custom UI (js/tools/' + slug + '.js)');
    L.push('(function () {');
    L.push(sq + 'use strict' + sq + ';');
    L.push('App.registerTool(' + sq + esc(slug) + sq + ', {');
    L.push('  mount: function (root, toolDef) { root.textContent = ' + sq + esc(name) + sq + '; },');
    L.push('});');
    L.push('})();');
  } else if (kind === 'generator') {
    L.push('  { slug: ' + sq + esc(slug) + sq + ', name: ' + sq + esc(name) + sq + ', desc: ' + sq + esc(desc) + sq + ', category: ' + sq + 'text' + sq + ', tags: [' + sq + tag + sq + '], icon: ' + sq + 'code2' + sq + ', template: ' + sq + 'generator' + sq + ',');
    L.push('    genHandler: function (opts) { return Transforms.' + camel + '(opts); },');
    L.push('    params: [{ key: ' + sq + 'input' + sq + ', label: ' + sq + 'Input' + sq + ', type: ' + sq + 'text' + sq + ', default: ' + sq + sq + ' }] },');
    L.push('');
    L.push('// 2. logic goes in js/lib/transforms.js. Manifest must only delegate.');
    L.push('T.' + camel + ' = function (opts) { return ' + sq + 'TODO' + sq + '; };');
  } else {
    L.push('  { slug: ' + sq + esc(slug) + sq + ', name: ' + sq + esc(name) + sq + ', desc: ' + sq + esc(desc) + sq + ', category: ' + sq + 'text' + sq + ', tags: [' + sq + tag + sq + '], icon: ' + sq + 'code2' + sq + ', template: ' + sq + 'transform' + sq + ',');
    L.push('    handler: function (s) { return Transforms.' + camel + '(s); } },');
    L.push('');
    L.push('// 2. logic goes in js/lib/transforms.js. Manifest must only delegate.');
    L.push('T.' + camel + ' = function (s) { return s; };');
  }
  L.push('');
  L.push('// 3. ship checklist: smoke test plus error path, e2e fixtures 35 and 80.');
  L.push('//    Bump versions for transforms.js plus manifest.js in index.html and sw.js SHELL. Bump SW_VERSION.');
  L.push('//    Custom tools also bump App.TOOL_VERSION in js/core.js plus the lazy SHELL line.');
  return L.join('\n');
};

/* HTML-to-markdown UI contract: empty-input guard plus conversion. Guard already exists in htmlToMarkdown; this wrapper keeps the manifest free of duplicated logic. */
T.htmlToMarkdownOpts = function (s) {
  if (!String(s).trim()) throw new Error('Enter HTML to convert');
  return T.htmlToMarkdown(s);
};
T.htmlToMarkdown = function (html) {
  var src = String(html);
  if (!src.trim()) throw new Error('Enter HTML to convert');
  src = src.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  src = src.replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  var dq = String.fromCharCode(34), sq = String.fromCharCode(39);
  function attr(tagText, name) {
    var patterns = [
      name + '\\s*=\\s*' + dq + '([^' + dq + ']*)' + dq,
      name + '\\s*=\\s*' + sq + '([^' + sq + ']*)' + sq,
      name + '\\s*=\\s*([^\\s>]+)'
    ];
    for (var pi = 0; pi < patterns.length; pi++) {
      var found = tagText.match(new RegExp(patterns[pi], 'i'));
      if (found) return found[1];
    }
    return '';
  }
  function stripTags(htmlFrag) { return String(htmlFrag).replace(/<[^>]*>/g, ''); }
  function inlineFrag(htmlFrag) {
    var text = String(htmlFrag);
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<img(\s[^>]*)?\/?>/gi, function (tagText) {
      return '![' + attr(tagText, 'alt') + '](' + attr(tagText, 'src') + ')';
    });
    text = text.replace(/<a(\s[^>]*)?>([\s\S]*?)<\/a\s*>/gi, function (all, at, label) {
      var href = attr(at || '', 'href');
      var clean = T.htmlDecode(stripTags(label)).replace(/\s+/g, ' ').trim();
      if (!href) return clean;
      return '[' + clean + '](' + href + ')';
    });
    text = text.replace(/<(strong|b)(\s[^>]*)?>/gi, '**').replace(/<\/(strong|b)\s*>/gi, '**');
    text = text.replace(/<(em|i)(\s[^>]*)?>/gi, '*').replace(/<\/(em|i)\s*>/gi, '*');
    text = text.replace(/<code(\s[^>]*)?>/gi, '`').replace(/<\/code\s*>/gi, '`');
    text = text.replace(/<[^>]*>/g, '');
    text = T.htmlDecode(text);
    var fragLines = text.split('\n');
    for (var li = 0; li < fragLines.length; li++) {
      fragLines[li] = fragLines[li].replace(/[ \t]+/g, ' ').trim();
    }
    return fragLines.join('\n');
  }
  function tokenize(htmlFrag) { return String(htmlFrag).match(/<[^>]*>|[^<]+/g) || []; }
  function isTag(tok) { return tok.charAt(0) === '<'; }
  function isClose(tok) { return tok.slice(0, 2) === '</'; }
  function tagName(tok) {
    var tagMatch = tok.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/);
    return tagMatch ? tagMatch[1].toLowerCase() : '';
  }
  function renderTokens(toks, listStack, quoteDepth) {
    var out = [], idx = 0, para = '';
    function pushPara() {
      var text = inlineFrag(para).replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim();
      para = '';
      if (text) out.push({ text: text, quote: quoteDepth });
    }
    function pushLine(text) { out.push({ text: text, quote: quoteDepth }); }
    function pushBlank() {
      if (out.length && out[out.length - 1].text !== '') out.push({ text: '', quote: 0 });
    }
    function innerHtml(tag) {
      var depth = 0, buf = '';
      while (idx < toks.length) {
        var tok = toks[idx++];
        if (!isTag(tok)) { buf += tok; continue; }
        var name = tagName(tok);
        if (!isClose(tok) && name === tag && !/\/>$/.test(tok)) depth++;
        else if (isClose(tok) && name === tag) {
          if (depth === 0) return buf;
          depth--;
        }
        buf += tok;
      }
      return buf;
    }
    function renderList(ordered, startAt) {
      var stackTop = { ordered: ordered, num: startAt };
      var childStack = listStack.concat([stackTop]);
      var parts = [];
      while (idx < toks.length) {
        var tok = toks[idx];
        if (!isTag(tok)) { idx++; continue; }
        var name = tagName(tok);
        if (isClose(tok) && (name === 'ul' || name === 'ol')) { idx++; break; }
        if (!isClose(tok) && name === 'li') {
          if (/\/>$/.test(tok)) { if (ordered) stackTop.num++; idx++; continue; }
          idx++;
          var raw = innerHtml('li');
          raw = raw.replace(/<input[^>]*>/gi, function (tagText) {
            return /checked/i.test(tagText) ? '[x] ' : '[ ] ';
          });
          var sub = renderTokens(tokenize(raw), childStack, 0); sub = sub.map(function (r) { return r.text; });
          var bullet = ordered ? (stackTop.num + '.') : '-';
          if (ordered) stackTop.num++;
          var pad = '';
          for (var sp = 0; sp < childStack.length; sp++) pad += '  ';
          var indent = pad.slice(0, (childStack.length - 1) * 2);
          if (!sub.length) {
            parts.push(indent + bullet + ' ');
          } else {
            parts.push(indent + bullet + ' ' + sub[0]);
            for (var si = 1; si < sub.length; si++) parts.push(pad + '  ' + sub[si]);
          }
        } else idx++;
      }
      return parts;
    }
    while (idx < toks.length) {
      var tok = toks[idx];
      if (!isTag(tok)) { para += tok; idx++; continue; }
      var tag = tagName(tok), close = isClose(tok);
      if (/^(strong|b|em|i|code|a|img|span|u|s|del|ins|sub|sup|small|mark|abbr|cite|dfn|kbd|samp|var|time|font|tt)$/.test(tag)) { para += tok; idx++; continue; }
      if (tag === 'br' && !close) { para += '\n'; idx++; continue; }
      if (tag === 'hr') { pushPara(); pushBlank(); pushLine('---'); pushBlank(); idx++; continue; }
      if (!close && /^h[1-6]$/.test(tag)) {
        pushPara(); pushBlank(); idx++;
        var headRaw = innerHtml(tag);
        var headText = inlineFrag(headRaw).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        if (headText) {
          var marks = '######'.slice(0, Number(tag.charAt(1)));
          pushLine(marks + ' ' + headText);
        }
        pushBlank();
        continue;
      }
      if (!close && (tag === 'ul' || tag === 'ol')) {
        pushPara(); pushBlank(); idx++;
        var startAt = 1, startRaw = attr(tok, 'start');
        if (tag === 'ol' && /^\d+$/.test(startRaw)) startAt = parseInt(startRaw, 10);
        var items = renderList(tag === 'ol', startAt);
        for (var ii = 0; ii < items.length; ii++) pushLine(items[ii]);
        pushBlank();
        continue;
      }
      if (!close && tag === 'blockquote') {
        pushPara(); pushBlank(); idx++;
        var quoteRaw = innerHtml(tag);
        var quoted = renderTokens(tokenize(quoteRaw), listStack, quoteDepth + 1);
        for (var qi = 0; qi < quoted.length; qi++) out.push(quoted[qi]);
        pushBlank();
        continue;
      }
      if (!close && tag === 'pre') {
        pushPara(); pushBlank(); idx++;
        var preRaw = innerHtml(tag);
        var lang = '', classRaw = attr(toks[idx - 1] || '', 'class') || '';
        var langMatch = /language-([\w-]+)/.exec(classRaw);
        if (langMatch) lang = langMatch[1];
        var codeText = T.htmlDecode(stripTags(preRaw)).replace(/^\n+/, '').replace(/\s+$/, '');
        pushLine('```' + lang);
        var codeLines = codeText.split('\n');
        for (var ci = 0; ci < codeLines.length; ci++) pushLine(codeLines[ci]);
        pushLine('```');
        pushBlank();
        continue;
      }
      if (!close && tag === 'table') {
        pushPara(); pushBlank(); idx++;
        var tableRaw = innerHtml(tag);
        var rowHtml = tableRaw.match(/<tr(\s[^>]*)?>([\s\S]*?)<\/tr\s*>/gi) || [];
        var grid = [];
        for (var ri = 0; ri < rowHtml.length; ri++) {
          var cells = [], cellRe = /<(th|td)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi, cellMatch;
          while ((cellMatch = cellRe.exec(rowHtml[ri]))) {
            cells.push(inlineFrag(cellMatch[3]).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim());
          }
          if (cells.length) grid.push(cells);
        }
        if (grid.length) {
          var cols = 0;
          for (var gi = 0; gi < grid.length; gi++) cols = Math.max(cols, grid[gi].length);
          for (var gj = 0; gj < grid.length; gj++) {
            while (grid[gj].length < cols) grid[gj].push('');
            pushLine('| ' + grid[gj].join(' | ') + ' |');
            if (gj === 0) {
              var sep = [];
              for (var sc = 0; sc < cols; sc++) sep.push('---');
              pushLine('| ' + sep.join(' | ') + ' |');
            }
          }
        }
        pushBlank();
        continue;
      }
      if (!close && (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer' || tag === 'main' || tag === 'li' || tag === 'tr' || tag === 'td' || tag === 'th')) {
        pushPara(); pushBlank(); idx++; continue;
      }
      if (close) { pushPara(); if (tag === 'p' || tag === 'div') pushBlank(); idx++; continue; }
      para += tok; idx++;
    }
    pushPara();
    return out;
  }
  var topSegs = renderTokens(tokenize(src), [], 0);
  var mdLines = [];
  for (var mi = 0; mi < topSegs.length; mi++) {
    var segLine = topSegs[mi].text.replace(/\s+$/, '');
    if (topSegs[mi].quote > 0 && segLine !== '') {
      var prefix = '';
      for (var qd = 0; qd < topSegs[mi].quote; qd++) prefix += '> ';
      segLine = prefix + segLine;
    }
    mdLines.push(segLine);
  }
  var finalLines = [];
  for (var fi = 0; fi < mdLines.length; fi++) {
    if (mdLines[fi] === '' && finalLines.length && finalLines[finalLines.length - 1] === '') continue;
    finalLines.push(mdLines[fi]);
  }
  while (finalLines.length && finalLines[0] === '') finalLines.shift();
  while (finalLines.length && finalLines[finalLines.length - 1] === '') finalLines.pop();
  return finalLines.join('\n');
};

/** RFC 6238 TOTP (SHA-1): Base32 secret + timestamp → expiring code.
    forTimeMs defaults to now; pass it in tests for exact vectors. */
T.totp = function (secret, forTimeMs, digits, period) {
  var key = new Uint8Array(base32ToBytes(secret));
  var ms = forTimeMs === undefined || forTimeMs === null || forTimeMs === '' ? Date.now() : Number(forTimeMs);
  if (!isFinite(ms) || ms < 0) throw new Error('Invalid timestamp');
  var d = digits === undefined ? 6 : parseInt(digits, 10);
  if (d !== 6 && d !== 7 && d !== 8) throw new Error('Digits must be 6, 7 or 8');
  var step = period === undefined ? 30 : parseInt(period, 10);
  if (!(step >= 1) || step > 300) throw new Error('Period must be 1–300 seconds');
  var counter = Math.floor(Math.floor(ms / 1000) / step);
  var msg = new Uint8Array(8);
  var c = counter;
  for (var i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  var hex = Core.hmacBytes(key, msg, 0);
  var hmac = [];
  for (var k = 0; k < hex.length; k += 2) hmac.push(parseInt(hex.slice(k, k + 2), 16));
  var offset = hmac[hmac.length - 1] & 15;
  var bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  var code = (bin % Math.pow(10, d)).toString();
  while (code.length < d) code = '0' + code;
  var elapsed = Math.floor(ms / 1000) - counter * step;
  return { code: code, validFor: step - elapsed, counter: counter };
};
var morseMap = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.' };
var revMorse = {};
for (var mk in morseMap) revMorse[morseMap[mk]] = mk;
T.morseEncode = function (s) { return s.toUpperCase().split('').map(function (c) { return morseMap[c] || (c === ' ' ? '/' : '?'); }).join(' '); };
T.morseDecode = function (s) { return s.trim().split(/\s+/).map(function (code) { return code === '/' ? ' ' : revMorse[code] || '?'; }).join(''); };

/* Morse playback timeline: pure schedule of beeps from encoded text.
   Unit is 1.2/wpm seconds (PARIS). Events carry the letter-token index
   so the UI can highlight the symbol currently sounding. */
var MORSE_PROSIGNS = { AA: '.-.-', AR: '.-.-.', AS: '.-...', BK: '-...-.-', BT: '-...-', CL: '-.-..-..', CT: '-.-.-', DO: '-..---', KN: '-.--.', SK: '...-.-', SN: '...-.', SOS: '...---...' };
T.MORSE_PROSIGNS = MORSE_PROSIGNS;
T.morseTimeline = function (text, wpm) {
  var raw = String(text === undefined || text === null ? '' : text);
  if (!raw.trim()) throw new Error('Enter text to play \u2014 letters, digits and punctuation');
  if (raw.length > 300) throw new Error('Keep it under 300 characters for playback');
  var w = parseInt(wpm, 10);
  if (!(w >= 5 && w <= 40)) throw new Error('Speed must be 5\u201340 WPM');
  var unit = 1.2 / w;
  var encoded, tokens = [];
  raw.toUpperCase().split(/(<[A-Z]{2,6}>)/g).forEach(function (part) {
    var m = /^<([A-Z]{2,6})>$/.exec(part);
    if (m && MORSE_PROSIGNS[m[1]]) { tokens.push(MORSE_PROSIGNS[m[1]]); return; }
    part.split('').forEach(function (c) { tokens.push(morseMap[c] || (c === ' ' ? '/' : '?')); });
  });
  encoded = tokens.join(' ');
  var events = [], t = 0;
  tokens.forEach(function (tk, li) {
    if (tk === '/') { t += 4 * unit; return; }
    if (/\?/.test(tk)) { t += 3 * unit; return; }
    for (var i = 0; i < tk.length; i++) {
      var dur = (tk.charAt(i) === '-' ? 3 : 1) * unit;
      events.push({ sym: tk.charAt(i) === '-' ? 'dah' : 'dit', t0: t, t1: t + dur, li: li });
      t += dur + unit;
    }
    t += 2 * unit;
  });
  return { encoded: encoded, unit: unit, total: t > 0 ? t - 3 * unit : 0, events: events };
};

/* ── json ── */
T.validateJSON = function (s) {
  try {
    var data = JSON.parse(s);
    return { valid: true, data: data };
  } catch (e) {
    var msg = e instanceof Error ? e.message : String(e);
    var posMatch = msg.match(/position\s+(\d+)/i);
    var lineMatch = msg.match(/line\s+(\d+)/i);
    var position = posMatch ? parseInt(posMatch[1]) : -1;
    var line = lineMatch ? parseInt(lineMatch[1]) : -1;
    var col = -1;
    if (position >= 0 && line < 0) {
      var before = s.slice(0, position);
      line = (before.match(/\n/g) || []).length + 1;
      col = position - before.lastIndexOf('\n');
    }
    var detail = msg;
    if (line > 0) detail += ' at line ' + line;
    if (col > 0) detail += ', column ' + col;
    return { valid: false, error: detail };
  }
};
T.formatJSON = function (s, indent) { return JSON.stringify(JSON.parse(s), null, indent === undefined ? 2 : indent); };
/* JSON-formatter UI contract: indent arrives as an option string clamped to 1..8 (default 2). Moved from the manifest so shell UI delegates to this single source. */
T.formatJSONOpts = function (s, opts) {
  var n = parseInt((opts && opts.indent) || '2', 10);
  if (isNaN(n) || n < 1 || n > 8) n = 2;
  return T.formatJSON(s, n);
};
T.minifyJSON = function (s) { return JSON.stringify(JSON.parse(s)); };
T.jsonBadge = function (mode, ok) {
  if (mode === 'format') return ok ? { text: '✓ Formatted', cls: 'ok' } : { text: '✗ Error', cls: 'bad' };
  if (mode === 'minify') return ok ? { text: '✓ Minified', cls: 'ok' } : { text: '✗ Error', cls: 'bad' };
  return ok ? { text: '✓ Valid JSON', cls: 'ok' } : { text: '✗ Invalid JSON', cls: 'bad' };
};
/**
 * Conservative JavaScript minifier: strips comments, collapses whitespace.
 * String, template-literal and regex literals pass through byte-for-byte;
 * semicolons are never dropped (no ASI hazards). Regex vs division uses
 * the standard last-significant-token heuristic; whitespace beside + or -
 * is always kept so a - -b never merges into a--b.
 */
/* CSS beautify/minify: string/comment-aware; brace depth + paren depth
   tracked. Moved verbatim from the manifest handler. */
T.cssFormat = function (s, opts) {
  var mode = (typeof opts === "string") ? opts : ((opts && opts.mode) || "beautify");

      if (mode === 'minify') {
        if (!s || !String(s).trim()) return '';
        return T.cssMinify(s);
      }
      /* beautify: string/comment-aware, brace depth + paren depth tracked */
      var lines = [], buf = '', depth = 0, parens = 0, si = false, sq = '', ci = false;
      function flush() {
        var t = buf.replace(/\s+/g, ' ').trim();
        if (t) lines.push('  '.repeat(Math.max(0, depth)) + t);
        buf = '';
      }
      for (var j = 0; j < s.length; j++) {
        var ch = s.charAt(j), nxt = s.charAt(j + 1);
        if (ci) { buf += ch; if (ch === '*' && nxt === '/') { buf += '/'; j++; flush(); } continue; }
        if (si) {
          buf += ch;
          if (ch === '\\' && j + 1 < s.length) { buf += s.charAt(j + 1); j++; }
          else if (ch === sq) si = false;
          continue;
        }
        if (ch === '/' && nxt === '*') { flush(); ci = true; buf += '/*'; j++; continue; }
        if (ch === '"' || ch === "'") { si = true; sq = ch; buf += ch; continue; }
        if (ch === '(') { parens++; buf += ch; continue; }
        if (ch === ')') { parens = Math.max(0, parens - 1); buf += ch; continue; }
        if (ch === '{') { buf += ' {'; flush(); depth++; continue; }
        if (ch === '}') { flush(); depth = Math.max(0, depth - 1); buf += '}'; flush(); continue; }
        if (ch === ';') { buf += ';'; flush(); continue; }
        if (ch === ':' && depth > 0 && parens === 0) { buf = buf.replace(/\s+$/, '') + ': '; continue; }
        if (ch === ',' && parens === 0) { buf += ','; flush(); continue; }
        if (ch === '\n' || ch === '\r') { flush(); continue; }
        buf += ch;
      }
      flush();
      return lines.join('\n').trim();
    };
/* CSS minifier — string-aware, comment-stripping, calc-aware.
   The old cssFormat minify branch broke calc() combinations
   (spaces around + and - are syntactically required there) and
   collapsed descendant+pseudo selectors ("div :hover" became
   "div:hover"). Both cssFormat minify mode and the css-minifier
   tool delegate here — one shared core, no duplicated logic.
   Zero-unit collapsing is intentionally omitted: "0%" can be a
   keyframe selector, and values cannot be told from selectors
   without a full parser. */
T.cssMinify = function (s) {
  var src = String(s === undefined || s === null ? '' : s);
  if (!src.trim()) throw new Error('Paste CSS to minify first — the Formatter beautifies, this shrinks');
  if (src.indexOf(' ') >= 0) throw new Error('NUL bytes are not valid CSS input');
  var keeps = [];
  function stash(str) { keeps.push(str); return ' ' + (keeps.length - 1) + ' '; }
  var WS = ' \t\n\r\f\v\u00a0\u2028\u2029';
  var DROP_NEXT = '{};:,>+~)]}!(';
  var DROP_PREV = '{(;:,>+~([!';
  var IDENT = /[a-zA-Z0-9_@%]/;
  var i, j, k, p, t, c, d;
  var noStr = '';
  for (i = 0; i < src.length; i++) {
    c = src.charAt(i);
    if (c === '"' || c === "'") {
      var acc = c;
      j = i + 1;
      while (j < src.length) {
        d = src.charAt(j);
        acc += d;
        if (d === '\\' && j + 1 < src.length) { acc += src.charAt(j + 1); j += 2; continue; }
        j++;
        if (d === c) break;
      }
      noStr += stash(acc);
      i = j - 1;
      continue;
    }
    noStr += c;
  }
  var noCom = noStr.replace(/\/\*[\s\S]*?\*\//g, '');
  function minMath(inner) {
    return inner.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
      .replace(/\s*([*,/])\s*/g, '$1')
      .replace(/([0-9a-zA-Z\]%)])\s*([+-])\s*/g, '$1 $2 ')
      .replace(/ {2,}/g, ' ').replace(/^ | $/g, '');
  }
  var low = noCom.toLowerCase();
  var NAMES = ['calc(', 'clamp(', 'min(', 'max('];
  var body = '';
  k = 0;
  while (k < noCom.length) {
    var fname = null;
    for (t = 0; t < NAMES.length; t++) {
      if (low.slice(k, k + NAMES[t].length) === NAMES[t]) {
        var pc = k > 0 ? noCom.charAt(k - 1) : '(';
        if (!/[a-zA-Z0-9_-]/.test(pc)) { fname = NAMES[t]; break; }
      }
    }
    if (!fname) { body += noCom.charAt(k); k++; continue; }
    var dep = 0, e = k, closed = false;
    while (e < noCom.length) {
      var ec = noCom.charAt(e);
      if (ec === '(') dep++;
      else if (ec === ')') { dep--; if (!dep) { closed = true; break; } }
      e++;
    }
    if (closed) {
      body += stash(noCom.slice(k, k + fname.length) + minMath(noCom.slice(k + fname.length, e)) + ')');
      k = e + 1;
    } else {
      body += noCom.charAt(k);
      k++;
    }
  }
  function prevCh(res) { return res.length ? res.charAt(res.length - 1) : ''; }
  var res = '', depth = 0, pend = false;
  for (p = 0; p < body.length; p++) {
    var ch = body.charAt(p);
    if (ch === '{') { res += '{'; depth++; pend = false; continue; }
    if (ch === '}') { res = res.replace(/;+$/, ''); res += '}'; depth = Math.max(0, depth - 1); pend = false; continue; }
    if (ch === ' ') {
      var end = body.indexOf(' ', p + 1);
      var span = end < 0 ? body.slice(p) : body.slice(p, end + 1);
      if (pend) {
        pend = false;
        var pvA = prevCh(res);
        if (IDENT.test(pvA || '')) { res += ' '; }
        else {
          var nxA = end < 0 ? '' : body.charAt(end + 1);
          var dN = nxA !== '' && DROP_NEXT.indexOf(nxA) >= 0 && !(depth === 0 && nxA === ':');
          var dP = pvA !== '' && pvA !== ' ' && DROP_PREV.indexOf(pvA) >= 0 && !(depth === 0 && pvA === ':');
          if (!dN && !dP) res += ' ';
        }
      }
      res += span;
      if (end < 0) break;
      p = end;
      continue;
    }
    if (WS.indexOf(ch) >= 0) { pend = true; continue; }
    if (pend) {
      pend = false;
      var pvB = prevCh(res);
      var drop = false;
      if (DROP_NEXT.indexOf(ch) >= 0) drop = !(depth === 0 && ch === ':');
      else if (pvB !== '' && DROP_PREV.indexOf(pvB) >= 0) drop = !(depth === 0 && pvB === ':');
      if (!drop) res += ' ';
    }
    if (ch === ';') {
      var last = prevCh(res);
      if (last === '{' || last === ';') continue;
      res += ';';
      continue;
    }
    if (ch === '#' && depth > 0) {
      var hex = body.slice(p + 1, p + 7);
      if (/^[0-9a-fA-F]{6}$/.test(hex) && !/[0-9a-fA-F]/.test(body.charAt(p + 7) || '')) {
        var r1 = hex.charAt(0), r2 = hex.charAt(2), r3 = hex.charAt(4);
        var pc2 = prevCh(res);
        if ((pc2 === ':' || pc2 === ',' || pc2 === ' ') &&
            r1.toLowerCase() === hex.charAt(1).toLowerCase() &&
            r2.toLowerCase() === hex.charAt(3).toLowerCase() &&
            r3.toLowerCase() === hex.charAt(5).toLowerCase()) {
          res += '#' + r1 + r2 + r3;
          p += 6;
          continue;
        }
      }
      res += ch;
      continue;
    }
    if (ch === '0' && depth > 0) {
      var pc3 = prevCh(res);
      if ((pc3 === ':' || pc3 === ',' || pc3 === '(' || pc3 === ' ') &&
          body.charAt(p + 1) === '.' && /[0-9]/.test(body.charAt(p + 2) || '')) {
        continue;
      }
      res += ch;
      continue;
    }
    res += ch;
  }
  res = res.replace(/;}/g, '}').replace(/^\s+|\s+$/g, '');
  var done = res.replace(/ (\d+) /g, function (mm, n) { return keeps[+n]; });
  if (!done) throw new Error('Nothing left to minify — input was comments or whitespace');
  return done;
};
T.jsMinify = function (s) {
  if (!s || !s.trim()) throw new Error('Enter JavaScript to minify');
  var text = s;
  if (text.charCodeAt(0) === 0x23 && text.charAt(1) === '!') {
    var nl = text.indexOf('\n');
    text = nl === -1 ? '' : text.slice(nl + 1);
    if (!text.trim()) throw new Error('Enter JavaScript to minify');
  }
  var out = '', i = 0, n = text.length, prev = '', lastWord = '';
  var stack = [];
  var REG_WORDS = { return: 1, typeof: 1, instanceof: 1, in: 1, of: 1, new: 1, delete: 1, void: 1, throw: 1, case: 1, do: 1, else: 1, yield: 1, await: 1 };
  function isWord(ch) { return ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'); }
  function emit(ch) { out += ch; if (isWord(ch)) { lastWord += ch; } else { lastWord = ''; } prev = ch; }
  function operand() { lastWord = ''; prev = ')'; }
  function takesRegex() {
    if (!prev) return true;
    if (prev === ')' || prev === ']' || prev === '}') return false;
    if (isWord(prev)) return !!REG_WORDS[lastWord];
    return true;
  }
  function blankRun(j) {
    var k = j;
    while (k < n) { var w = text.charAt(k); if (w !== ' ' && w !== '\t' && w !== '\n' && w !== '\r' && w !== '\f' && w !== '\v') break; k++; }
    return k;
  }
  var mode = 'n';
  while (i < n) {
    var c = text.charAt(i), nx = text.charAt(i + 1);
    if (mode === 't') {
      if (c === '\\') { out += c + nx; i += 2; continue; }
      if (c === '`') { out += c; i++; var fr = stack.pop(); mode = (fr && fr.back === 't') ? 't' : 'n'; operand(); prev = '`'; lastWord = ''; continue; }
      if (c === '$' && nx === '{') { out += '${'; i += 2; stack.push({ kind: 'sub', back: 't', depth: 0 }); mode = 'n'; prev = '{'; lastWord = ''; continue; }
      out += c; i++; continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
      var k = blankRun(i);
      var nc = text.charAt(k);
      if (nc && ((isWord(prev) && isWord(nc)) || prev === '+' || prev === '-' || nc === '+' || nc === '-')) out += ' ';
      i = k; continue;
    }
    if (c === '/' && nx === '/') { var e = text.indexOf('\n', i + 2); i = e === -1 ? n : e + 1; continue; }
    if (c === '/' && nx === '*') { var e2 = text.indexOf('*/', i + 2); i = e2 === -1 ? n : e2 + 2; continue; }
    if (c === '/' && takesRegex()) {
      out += c; i++;
      var inClass = false;
      while (i < n) {
        var r = text.charAt(i);
        out += r; i++;
        if (r === '\\') { if (i < n) { out += text.charAt(i); i++; } continue; }
        if (r === '\n' || r === '\r') break;
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
      }
      while (i < n && isWord(text.charAt(i))) { out += text.charAt(i); i++; }
      operand(); continue;
    }
    if (c === '"' || c === '\'') {
      var q = c;
      out += c; i++;
      while (i < n) {
        var g = text.charAt(i);
        out += g; i++;
        if (g === '\\') { if (i < n) { out += text.charAt(i); i++; } continue; }
        if (g === '\n' || g === '\r') break;
        if (g === q) break;
      }
      operand(); continue;
    }
    if (c === '`') { out += c; i++; stack.push({ kind: 'tpl', back: 'n' }); mode = 't'; prev = '`'; lastWord = ''; continue; }
    if (c === '{') { emit(c); i++; if (stack.length && stack[stack.length - 1].kind === 'sub') stack[stack.length - 1].depth++; continue; }
    if (c === '}') {
      var top = stack.length ? stack[stack.length - 1] : null;
      if (top && top.kind === 'sub' && top.depth === 0) { out += c; i++; stack.pop(); mode = 't'; prev = '}'; lastWord = ''; continue; }
      emit(c); i++;
      if (top && top.kind === 'sub' && top.depth > 0) top.depth--;
      continue;
    }
    emit(c); i++;
  }
  return out.trim();
};
/**
 * Conservative SVG optimizer: strips comments, editor metadata and
 * namespaced cruft (inkscape/sodipodi elements, attributes, xmlns decls).
 * Only newline-bearing gaps between tags collapse, so intentional single
 * spaces inside <text> content survive. Structure and text pass through.
 */
T.svgMinify = function (s) {
  if (!s || !s.trim()) throw new Error('Enter SVG markup to optimize');
  if (!/<\s*svg[\s>]/.test(s)) throw new Error('Input does not look like SVG (missing <svg> root)');
  var out = String(s);
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<\?(?!xml\b)[\s\S]*?\?>/g, '');
  out = out.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata\s*>/gi, '');
  out = out.replace(/<[\w.-]+:[\w:.-]+\b[^>]*>[\s\S]*?<\/[\w.-]+:[\w:.-]+\s*>/g, '');
  out = out.replace(/<[\w.-]+:[\w:.-]+\b[^>]*\/>/g, '');
  out = out.replace(/\s+xmlns:(inkscape|sodipodi)=("[^"]*"|'[^']*')/g, '');
  out = out.replace(/\s+(inkscape|sodipodi):[\w:.-]+\s*=\s*("[^"]*"|'[^']*')/g, '');
  out = out.replace(/>\s*\n\s*</g, '><');
  return out.trim();
};
/**
 * Levenshtein edit distance over Unicode code points (astral-safe),
 * O(min(m,n)) space via two rolling rows. Throws past 4M length-product
 * (quadratic time guard) instead of hanging the tab.
 */
T.levenshtein = function (a, b) {
  var sc = Array.from(String(a)), tc = Array.from(String(b));
  var m = sc.length, n = tc.length;
  if (m * n > 4000000) throw new Error('Inputs too large (length product exceeds 4,000,000)');
  if (!m) return n;
  if (!n) return m;
  var prev = new Array(n + 1), cur = new Array(n + 1), i, j;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    cur[0] = i;
    for (j = 1; j <= n; j++) {
      var cost = sc[i - 1] === tc[j - 1] ? 0 : 1;
      var del = prev[j] + 1, ins = cur[j - 1] + 1, sub = prev[j - 1] + cost;
      cur[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    var tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
};
/* Levenshtein UI contract: compare-text option plus distance/similarity/lengths report. Codepoint-aware lengths, moved from the manifest so shell UI delegates to this single source. */
T.levenshteinReport = function (s, opts) {
  var b = (opts && opts.compareTo) || '';
  var d = T.levenshtein(s, b);
  var la = Array.from(s).length, lb = Array.from(b).length;
  var mx = Math.max(la, lb);
  var sim = mx === 0 ? 100 : (1 - d / mx) * 100;
  return 'Distance: ' + d + '\nSimilarity: ' + sim.toFixed(1) + '%' + '\nLengths: ' + la + ' vs ' + lb;
};
/* JSON to JSONL: arrays unwrap to one compact value per line (empty arrays throw), single values stay one line \u2014 the root-level emitter for streaming and logging pipelines. */
T.jsonToJSONL = function (s) {
  if (!String(s).trim()) throw new Error('Enter JSON to convert');
  var v = T.validateJSON(s);
  if (!v.valid) throw new Error('Invalid JSON \u2014 ' + (v.error || 'check commas, quotes and brackets'));
  var docs = Array.isArray(v.data) ? v.data : [v.data];
  if (!docs.length) throw new Error('JSON array has no items \u2014 need at least one value');
  return docs.map(function (d) { return JSON.stringify(d); }).join('\n');
};
T.jsonToCSV = function (s, opts) {
  var o = opts || {};
  var DELIMS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = DELIMS[o.delimiter] || ',';
  var flatten = o.nested !== 'stringify';
  var data;
  try { data = JSON.parse(s); }
  catch (e) { void e; throw new Error('Invalid JSON'); }
  var arr = Array.isArray(data) ? data : [data];
  if (!arr.length) return '';
  if (!arr.every(function (r) { return r !== null && typeof r === 'object' && !Array.isArray(r); })) throw new Error('JSON must be an object or an array of objects');
  function leaf(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function flat(obj, prefix, out) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      if (flatten && v !== null && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
      else out[key] = leaf(v);
    });
    return out;
  }
  var rows = arr.map(function (r) { return flat(r, '', {}); });
  var headers = Array.from(new Set(rows.flatMap(function (r) { return Object.keys(r); })));
  function cell(v) {
    return (v.indexOf(d) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  return [headers.join(d)].concat(rows.map(function (r) { return headers.map(function (h) { return cell(r[h] === undefined ? '' : r[h]); }).join(d); })).join('\n');
};
/* JSONL to Markdown table: one JSON object per line becomes a
   GitHub-flavored Markdown table. Keys union in first-seen order,
   nested objects flatten to dotted paths (or stringify via opt),
   missing cells stay blank, bad lines carry line numbers. */
T.jsonlToMarkdown = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [];
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) throw new Error('Line ' + (n + 1) + ': ' + (v.error || 'Invalid JSON'));
    docs.push(v.data);
  }
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON object per line');
  if (!docs.every(function (r) { return r !== null && typeof r === 'object' && !Array.isArray(r); })) throw new Error('JSONL must hold objects \u2014 values like 1 or [1] have no columns');
  var flatten = o.nested !== 'stringify';
  function leaf(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }
  function flat(obj, prefix, out) {
    Object.keys(obj).forEach(function (k) {
      var val = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      if (flatten && val !== null && typeof val === 'object' && !Array.isArray(val)) flat(val, key, out);
      else out[key] = leaf(val);
    });
    return out;
  }
  var rows = docs.map(function (r) { return flat(r, '', {}); });
  var headers = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); }); });
  if (!headers.length) throw new Error('No columns found \u2014 objects hold no keys');
  var align = o.align === 'center' ? ':center:' : (o.align === 'right' ? '---:' : '---');
  function esc(c) { return c.replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function mdRow(r) { return '| ' + r.join(' | ') + ' |'; }
  var head = headers.map(esc);
  var sep = '|' + headers.map(function () { return align; }).join('|') + '|';
  var body = rows.map(function (r) { return mdRow(headers.map(function (h) { return esc(r[h] === undefined ? '' : r[h]); })); });
  return [mdRow(head), sep].concat(body).join('\n');
};

/* Markdown table to CSV: a GitHub-flavored pipe table becomes delimited
   rows with minimal RFC 4180 quoting. Finds the first run of lines
   starting with | (surrounding prose ignored), requires the --- separator
   second, unescapes escaped pipes, pads ragged rows. */
T.markdownToCSV = function (s, opts) {
  var o = opts || {};
  var DELIMS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = DELIMS[o.delimiter] || ',';
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/);
  var start = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim().charAt(0) === '|') { start = i; break; }
  }
  if (start < 0) throw new Error('No Markdown table found \u2014 start a line with | and follow the header with a | --- | row');
  var end = start;
  while (end < lines.length && lines[end].trim().charAt(0) === '|') end++;
  function splitRow(ln) {
    var t = ln.trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    var cells = [], cur = '';
    for (var k = 0; k < t.length; k++) {
      var ch = t.charAt(k), nx = t.charAt(k + 1);
      if (ch === '\\' && (nx === '|' || nx === '\\')) { cur += nx; k++; continue; }
      if (ch === '|') { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells.map(function (c) { return c.trim(); });
  }
  var rows = lines.slice(start, end).map(splitRow);
  if (rows.length < 2) throw new Error('Table needs a separator row \u2014 e.g. | --- | --- | right under the header');
  var sep = rows[1];
  var sepOk = sep.length > 0 && sep.filter(function (c) { return /^:?-+:?$/.test(c); }).length === sep.length;
  if (!sepOk) throw new Error('Second row must be the separator \u2014 cells like --- or :---: only, got ' + JSON.stringify(rows[1].join(' | ')));
  var head = rows[0], body = rows.slice(2);
  if (!head.length || head.every(function (c) { return c === ''; })) throw new Error('Header row holds no cells \u2014 add column names between the pipes');
  var width = head.length;
  for (var b = 0; b < body.length; b++) width = Math.max(width, body[b].length);
  function pad(r) { while (r.length < width) r.push(''); return r; }
  function cell(v) {
    return (v.indexOf(d) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var out = (o.headers === 'drop' ? [] : [pad(head).map(cell).join(d)]);
  for (var r = 0; r < body.length; r++) out.push(pad(body[r]).map(cell).join(d));
  if (!out.length) throw new Error('Table holds no data rows \u2014 add rows or keep the header');
  return out.join('\n');
};

/* CSV rows to GitHub-flavored Markdown table: records split by the shared
   RFC 4180 parser (quoted commas, escaped quotes, multiline records),
   auto delimiter, optional header row, per-table alignment. Cells trim for
   table source; GFM renders padded cells identically. */
T.csvToMarkdown = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste rows first \u2014 one record per line, values separated by commas, tabs or pipes');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(raw, d).filter(function (r) {
    return !r.every(function (c) { return c.trim() === ''; });
  }).map(function (r) { return r.map(function (c) { return c.trim(); }); });
  if (!rows.length) throw new Error('Paste rows first \u2014 one record per line, values separated by commas, tabs or pipes');
  var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  rows = rows.map(function (r) { while (r.length < cols) r.push(''); return r; });
  var useHeader = o.header !== 'none';
  var head = useHeader ? rows[0] : rows[0].map(function (_, i) { return 'Column ' + (i + 1); });
  var body = useHeader ? rows.slice(1) : rows;
  var align = o.align === 'center' ? ':center:' : (o.align === 'right' ? '---:' : '---');
  function esc(c) { return c.replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function mdRow(r) { return '| ' + r.map(esc).join(' | ') + ' |'; }
  var sep = '|' + head.map(function () { return align; }).join('|') + '|';
  return [mdRow(head), sep].concat(body.map(mdRow)).join('\n');
};

/* CSV to ASCII table: delimited rows become a bordered fixed-width
   plain-text table for terminals, READMEs and code comments. Delimiter
   auto-detects (or explicit opt), ragged rows pad short, header
   defaults to the first row. Styles are ascii (+--+) and unicode box
   drawing. Quoted newlines collapse to spaces so rows stay rectangular. */
T.csvToAsciiTable = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste rows first \u2014 one record per line, values separated by commas, tabs or pipes');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(raw, d).filter(function (r) {
    return !r.every(function (c) { return c.trim() === ''; });
  }).map(function (r) { return r.map(function (c) { return c.trim().replace(/\r\n|\r|\n/g, ' ').replace(/\t/g, '    '); }); });
  if (!rows.length) throw new Error('Paste rows first \u2014 one record per line, values separated by commas, tabs or pipes');
  var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  rows = rows.map(function (r) { while (r.length < cols) r.push(''); return r; });
  var useHeader = o.header !== 'none';
  var head = useHeader ? rows[0] : rows[0].map(function (_, i) { return 'Column ' + (i + 1); });
  var body = useHeader ? rows.slice(1) : rows;
  var widths = head.map(function (h, i) {
    var m = h.length;
    for (var k = 0; k < body.length; k++) m = Math.max(m, body[k][i].length);
    return m;
  });
  var right = o.align === 'right', center = o.align === 'center';
  function rep(ch, n) { return new Array(n + 1).join(ch); }
  function cell(c, wdt) {
    var p = wdt - c.length;
    if (right) return rep(' ', p) + c;
    if (center) { var l = Math.floor(p / 2); return rep(' ', l) + c + rep(' ', p - l); }
    return c + rep(' ', p);
  }
  var st = o.style === 'unicode'
    ? { tl: '\u250c', tm: '\u252c', tr: '\u2510', ml: '\u251c', mm: '\u253c', mr: '\u2524', bl: '\u2514', bm: '\u2534', br: '\u2518', h: '\u2500', v: '\u2502' }
    : { tl: '+', tm: '+', tr: '+', ml: '+', mm: '+', mr: '+', bl: '+', bm: '+', br: '+', h: '-', v: '|' };
  function rule(l, m, r) { return l + widths.map(function (wdt) { return rep(st.h, wdt + 2); }).join(m) + r; }
  function dataRow(r) { return st.v + ' ' + r.map(function (c, i) { return cell(c, widths[i]); }).join(' ' + st.v + ' ') + ' ' + st.v; }
  var out = [rule(st.tl, st.tm, st.tr), dataRow(head), rule(st.ml, st.mm, st.mr)];
  for (var b = 0; b < body.length; b++) out.push(dataRow(body[b]));
  out.push(rule(st.bl, st.bm, st.br));
  return out.join('\n');
};

/* Delimiter scoring core: quote-aware field counts per candidate over the
   sampled lines. Shared by the sniffer report and auto-delimiter parsing. */
T.scoreDelims = function (sample) {
  var cands = [
    { name: 'Comma (,)', ch: ',' },
    { name: 'Semicolon (;)', ch: ';' },
    { name: 'Tab', ch: '	' },
    { name: 'Pipe (|)', ch: '|' }
  ];
  function countFields(line, d) {
    var n = 1, q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') i++;
          else q = false;
        }
      } else if (ch === '"') q = true;
      else if (ch === d) n++;
    }
    return n;
  }
  return cands.map(function (c) {
    var counts = sample.map(function (ln) { return countFields(ln, c.ch); });
    var same = counts.every(function (x) { return x === counts[0]; });
    return { name: c.name, ch: c.ch, cols: counts[0], same: same };
  });
};
/* Unambiguous winner character, or null on ties and single-column input. */
T.detectDelimChar = function (sample) {
  var winners = T.scoreDelims(sample).filter(function (r) { return r.same && r.cols > 1; });
  return winners.length === 1 ? winners[0].ch : null;
};/* CSV delimiter sniffer: quote-aware scoring over comma/semicolon/tab/pipe.
   Samples up to 10 non-empty lines; the winner splits every sampled line
   into the same field count greater than one. Ties and single-column input
   report honestly instead of guessing. */
T.csvSniffDelim = function (s) {
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line');
  var sample = lines.slice(0, 10);
  var scored = T.scoreDelims(sample);
  var winners = scored.filter(function (r) { return r.same && r.cols > 1; });
  var best = winners.length === 1 ? winners[0] : null;
  var out = [];
  if (best) {
    out.push('Delimiter: ' + best.name);
    out.push(sample.length > 1
      ? 'Confidence: high \u2014 ' + sample.length + ' sampled lines, each split into ' + best.cols + ' fields'
      : 'Confidence: low \u2014 single line, consistency unproven');
  } else if (winners.length > 1) {
    out.push('Delimiter: ambiguous \u2014 ' + winners.map(function (r) { return r.name; }).join(' vs '));
    out.push('Confidence: low \u2014 paste more rows to break the tie');
  } else {
    out.push('Delimiter: none detected \u2014 single column');
    out.push('Confidence: high \u2014 no candidate delimiter splits every line');
  }
  out.push('');
  out.push('Candidates (' + sample.length + (sample.length === 1 ? ' sampled line' : ' sampled lines') + '):');
  scored.forEach(function (r) {
    out.push((best && r.name === best.name ? '\u2713 ' : '\u2717 ') + r.name + ' \u2014 ' + r.cols + (r.cols === 1 ? ' field' : ' fields') + (r.same ? ' (consistent)' : ' (ragged)'));
  });
  return out.join('\n');
};
/**
 * JSON to TypeScript: interfaces for objects, type aliases for roots
 * that are arrays or primitives. Empty arrays become unknown[] (no element
 * evidence); nesting past 12 levels falls back to unknown. Keys that are
 * not valid identifiers are quoted; reserved words gain a Type suffix.
 */
T.jsonToTS = function (s, opts) {
  var parsed = T.validateJSON(s);
  if (!parsed.valid) throw new Error(parsed.error || 'Invalid JSON');
  var data = parsed.data;
  var n = parseInt((opts && opts.indent) || '2', 10);
  if (isNaN(n) || n < 1 || n > 8) n = 2;
  var pad = new Array(n + 1).join(' ');
  var decls = [];
  function typeName(raw, fb) {
    var parts = String(raw === undefined || raw === null ? '' : raw).split(/[^A-Za-z0-9_$]+/).filter(function (x) { return !!x; });
    var w = parts.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join('').replace(/[^A-Za-z0-9_$]/g, '');
    if (!w) return fb || 'Root';
    if (/^[0-9]/.test(w)) w = '_' + w;
    return w;
  }
  function propKey(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k); }
  function elemType(arr, name, depth) {
    var seen = {}, types = [];
    for (var k = 0; k < arr.length; k++) {
      var t = valType(arr[k], name + 'Item', depth);
      if (!seen[t]) { seen[t] = 1; types.push(t); }
    }
    if (!types.length) return 'unknown[]';
    return (types.length > 1 ? '(' + types.join(' | ') + ')' : types[0]) + '[]';
  }
  function valType(v, name, depth) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return elemType(v, name, depth);
    var t = typeof v;
    if (t !== 'object') return t === 'string' ? 'string' : t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'unknown';
    if (depth > 12) return 'unknown';
    emitInterface(v, name, depth);
    return name;
  }
  function emitInterface(obj, name, depth) {
    var lines = Object.keys(obj).map(function (k) {
      return pad + propKey(k) + ': ' + valType(obj[k], name + typeName(k, 'Prop').replace(/^_/, ''), depth + 1) + ';';
    });
    decls.push(lines.length ? 'interface ' + name + ' {\n' + lines.join('\n') + '\n}' : 'interface ' + name + ' {}');
  }
  var rootName = typeName(opts && opts.rootName, 'Root');
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    emitInterface(data, rootName, 1);
    return decls.join('\n\n');
  }
  var rootType = valType(data, rootName, 1);
  var alias = 'type ' + rootName + ' = ' + rootType + ';';
  return decls.length ? decls.join('\n\n') + '\n\n' + alias : alias;
};
/**
 * Human-readable byte sizes: binary IEC (KiB, 1024) or decimal SI
 * (KB, 1000). Two decimals max, trailing zeros stripped; the exact count
 * rides along grouped, taken from the raw digits so huge values stay exact.
 */
T.formatBytes = function (s, opts) {
  var t = String(s).trim().replace(/[,_\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('Enter a byte count (non-negative number)');
  var n = parseFloat(t);
  if (!isFinite(n)) throw new Error('Enter a byte count (non-negative number)');
  var binary = !(opts && opts.mode === 'decimal');
  var base = binary ? 1024 : 1000;
  var units = binary ?
    ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'] :
    ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  var u = 0, v = n;
  while (v >= base && u < units.length - 1) { v /= base; u++; }
  var str;
  if (u === 0) { str = String(Math.floor(v)); }
  else {
    var r = Math.round(v * 100) / 100;
    if (r >= base && u < units.length - 1) { v = v / base; u++; r = Math.round(v * 100) / 100; }
    str = String(r);
    if (str.indexOf('.') >= 0) str = str.replace(/0+$/, '').replace(/\.$/, '');
  }
  var digits = t.split('.')[0].replace(/^0+/, '') || '0';
  var grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return str + ' ' + units[u] + ' (' + grouped + ' bytes)';
};
T.jsonToYAML = function (s) {
  var obj = JSON.parse(s);
  var toYaml = function (val, indent) {
    if (indent === undefined) indent = '';
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') {
      if (val.indexOf('\n') >= 0) {
        var chomp = val.slice(-2) === '\n\n' ? '+' : (val.slice(-1) === '\n' ? '' : '-');
        var parts = val.split('\n');
        if (chomp !== '+' && parts[parts.length - 1] === '') parts.pop();
        return '|' + chomp + '\n' + parts.map(function (l) { return indent + '  ' + l; }).join('\n');
      }
      return yamlQuoteIfNeeded(val);
    }
    if (Array.isArray(val)) {
      if (!val.length) return '[]';
      return val.map(function (v) { var sub = toYaml(v, indent + '  '); if (Array.isArray(v) && sub.charAt(0) === '\n') return '\n' + indent + '-' + sub; return '\n' + indent + '- ' + sub.trimStart(); }).join('');

    }
    if (typeof val === 'object') {
      var entries = Object.entries(val);
      if (!entries.length) return '{}';
      return entries.map(function (e) {
        var sub = toYaml(e[1], indent + '  ');
        if (e[1] !== null && typeof e[1] === 'object' && sub.charAt(0) === '\n') return '\n' + indent + yamlQuoteIfNeeded(e[0]) + ':' + sub;
        return '\n' + indent + yamlQuoteIfNeeded(e[0]) + ': ' + sub.trimStart();
      }).join('');
    }
    return String(val);
  };
  return toYaml(obj).replace(/^\s+/, '');
};
/* JSON to TOML: objects become [table] sections, arrays of objects
   become [[table]] lists. TOML has no null or top-level array, so
   those throw with the key path instead of emitting wrong output. */
T.jsonToTOML = function (s) {
  var obj = JSON.parse(s);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Top-level JSON must be an object for TOML (no arrays or scalars)');
  function key(k) {
    if (/^[A-Za-z0-9_-]+$/.test(k)) return k;
    return '"' + k.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  function str(v) {
    var o = '';
    for (var i = 0; i < v.length; i++) {
      var c = v.charAt(i), d = v.charCodeAt(i);
      if (c === '"') o += '\\"';
      else if (c === '\\') o += '\\\\';
      else if (c === '\n') o += '\\n';
      else if (c === '\r') o += '\\r';
      else if (c === '\t') o += '\\t';
      else if (c === '\b') o += '\\b';
      else if (c === '\f') o += '\\f';
      else if (d < 32) o += '\\u' + ('000' + d.toString(16)).slice(-4);
      else o += c;
    }
    return '"' + o + '"';
  }
  function scalar(v, path) {
    if (v === null || v === undefined) throw new Error('TOML has no null (key "' + path + '") \u2014 drop it or use ""');
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') { if (!isFinite(v)) throw new Error('TOML has no NaN/Infinity (key "' + path + '")'); return String(v); }
    if (typeof v === 'string') return str(v);
    throw new Error('Cannot encode key "' + path + '" as TOML');
  }
  var lines = [];
  function isTable(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isTableArray(v) { return Array.isArray(v) && v.length && v[0] !== null && typeof v[0] === 'object' && !Array.isArray(v[0]); }
  function table(o, segs) {
    Object.keys(o).forEach(function (k) {
      var v = o[k], path = segs.concat([k]).join('.');
      if (isTable(v) || isTableArray(v)) return;
      if (Array.isArray(v)) lines.push(key(k) + ' = [' + v.map(function (w) { return scalar(w, path); }).join(', ') + ']');
      else lines.push(key(k) + ' = ' + scalar(v, path));
    });
    Object.keys(o).forEach(function (k) {
      var v = o[k], ns = segs.concat([k]);
      var head = ns.map(key).join('.');
      if (isTable(v)) { lines.push('[' + head + ']'); table(v, ns); }
      else if (isTableArray(v)) { v.forEach(function (item) { lines.push('[[' + head + ']]'); table(item, ns); }); }
    });
  }
  table(obj, []);
  return lines.join('\n');
};

/* TOML formatter: validate with the TOML core, then canonicalize
   whitespace without touching scalar text, so datetimes, numbers and
   strings keep their exact spelling. Spacing around top-level equals
   signs and after commas becomes canonical, table headers trim inside
   the brackets, comments reattach after one space, blank lines and
   pure comment lines pass through byte-identical. Triple-quoted spans
   are tracked across lines and never rewritten inside. */
T.tomlFormat = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Paste TOML first \u2014 tables, keys or comments');
  T.tomlToJSON(text);
  function skipQuoted(str, i) {
    var q = str.charAt(i);
    var basic = q === '"';
    if (str.charAt(i + 1) === q && str.charAt(i + 2) === q) {
      var j = i + 3;
      while (j < str.length) {
        if (basic && str.charAt(j) === '\\') { j += 2; continue; }
        if (str.charAt(j) === q && str.charAt(j + 1) === q && str.charAt(j + 2) === q) return j + 3;
        j++;
      }
      return str.length;
    }
    var k = i + 1;
    while (k < str.length) {
      if (basic && str.charAt(k) === '\\') { k += 2; continue; }
      if (str.charAt(k) === q) return k + 1;
      k++;
    }
    return str.length;
  }
  function splitComment(code) {
    for (var i = 0; i < code.length; i++) {
      var ch = code.charAt(i);
      if (ch === '"' || ch === '\'') { i = skipQuoted(code, i) - 1; continue; }
      if (ch === '#') return [code.slice(0, i), code.slice(i)];
    }
    return [code, ''];
  }
  function commaSpace(code) {
    var out = '';
    for (var i = 0; i < code.length; i++) {
      var ch = code.charAt(i);
      if (ch === '"' || ch === '\'') { var e = skipQuoted(code, i); out += code.slice(i, e); i = e - 1; continue; }
      if (ch === ',') {
        out += ',';
        var j = i + 1;
        while (code.charAt(j) === ' ' || code.charAt(j) === '\t') j++;
        if (j < code.length) out += ' ';
        i = j - 1;
        continue;
      }
      out += ch;
    }
    return out;
  }
  function findEq(code) {
    var depth = 0;
    for (var i = 0; i < code.length; i++) {
      var ch = code.charAt(i);
      if (ch === '"' || ch === '\'') { i = skipQuoted(code, i) - 1; continue; }
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === '=' && depth === 0) return i;
    }
    return -1;
  }
  function detectTriple(ln) {
    for (var i = 0; i < ln.length; i++) {
      var ch = ln.charAt(i);
      if (ch !== '"' && ch !== '\'') continue;
      if (ln.charAt(i + 1) === ch && ln.charAt(i + 2) === ch) {
        var q3 = ch + ch + ch, basic = ch === '"', j = i + 3, closed = false;
        while (j < ln.length) {
          if (basic && ln.charAt(j) === '\\') { j += 2; continue; }
          if (ln.slice(j, j + 3) === q3) { closed = true; break; }
          j++;
        }
        if (!closed) return q3;
        i = j + 2;
        continue;
      }
      i = skipQuoted(ln, i) - 1;
    }
    return null;
  }
  function tripleEnd(ln, q3) {
    var basic = q3.charAt(0) === '"';
    for (var j = 0; j < ln.length; j++) {
      if (basic && ln.charAt(j) === '\\') { j++; continue; }
      if (ln.slice(j, j + 3) === q3) return j;
    }
    return -1;
  }
  function fmtTail(tail) {
    var tc = splitComment(tail);
    var code = commaSpace(tc[0]).replace(/^\s+/, '').replace(/\s+$/, '');
    return code + (tc[1] ? (code ? ' ' : '') + tc[1] : '');
  }
  var lines = text.split(/\r?\n/);
  var triple = null, out = [];
  for (var n = 0; n < lines.length; n++) {
    var ln = lines[n];
    if (triple) {
      var at = tripleEnd(ln, triple);
      if (at < 0) { out.push(ln); continue; }
      var tail = ln.slice(at + 3);
      out.push(ln.slice(0, at + 3) + fmtTail(tail));
      triple = detectTriple(tail);
      continue;
    }
    var sc = splitComment(ln);
    var code = sc[0], comment = sc[1];
    if (!code.trim()) { out.push(ln); continue; }
    var t = code.trim(), done;
    if (t.charAt(0) === '[') {
      var dbl = t.slice(0, 2) === '[[';
      var inner = dbl ? t.slice(2, -2) : t.slice(1, -1);
      done = (dbl ? '[[' : '[') + inner.trim() + (dbl ? ']]' : ']');
    } else {
      var eq = findEq(code);
      if (eq < 0) done = commaSpace(code).replace(/\s+$/, '');
      else done = code.slice(0, eq).trim() + ' = ' + commaSpace(code.slice(eq + 1)).replace(/^\s+/, '').replace(/\s+$/, '');
    }
    out.push(done + (comment ? ' ' + comment : ''));
    triple = detectTriple(code);
  }
  return out.join('\n');
};

/* TOML to JSON (round trip for the TOML emitter above). */
T.tomlToJSON = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Paste TOML first');
  function bad(ln, msg) { throw new Error('Line ' + ln + ': ' + msg); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function hex4(ch) {
    var h = '0123456789abcdefABCDEF';
    return ch.length === 1 && h.indexOf(ch) >= 0;
  }
  function unesc(chunk, ln) {
    var o = '';
    for (var i = 0; i < chunk.length; i++) {
      var c = chunk.charAt(i);
      if (c !== '\\') { o += c; continue; }
      var e = chunk.charAt(i + 1);
      if (e === 'n') o += '\n';
      else if (e === 't') o += '\t';
      else if (e === 'r') o += '\r';
      else if (e === 'b') o += '\b';
      else if (e === 'f') o += '\f';
      else if (e === '\\') o += '\\';
      else if (e === '"') o += '"';
      else if (e === 'u' || e === 'U') {
        var w = e === 'u' ? 4 : 8, hx = chunk.slice(i + 2, i + 2 + w);
        if (hx.length !== w) bad(ln, 'Short unicode escape');
        for (var k = 0; k < hx.length; k++) if (!hex4(hx.charAt(k))) bad(ln, 'Bad unicode escape');
        var cp = parseInt(hx, 16);
        o += cp > 65535 ? String.fromCharCode(55296 + ((cp - 65536) >> 10), 56320 + ((cp - 65536) & 1023)) : String.fromCharCode(cp);
        i += 1 + w;
      }
      else bad(ln, 'Bad escape');
      i++;
    }
    return o;
  }
  function setKey(o, k, v, ln) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') bad(ln, 'Forbidden key ' + '"' + k + '"');
    if (Object.prototype.hasOwnProperty.call(o, k)) bad(ln, 'Duplicate key ' + '"' + k + '"');
    o[k] = v;
  }
  function findKeyEq(str, from) {
    var i = from || 0, q = '';
    while (i < str.length) {
      var ch = str.charAt(i);
      if (q) {
        if (ch === '\\' && q === '"') i++;
        else if (ch === q) q = '';
        i++;
        continue;
      }
      if (ch === '"' || ch === '\'') { q = ch; i++; continue; }
      if (ch === '=') return i;
      i++;
    }
    return -1;
  }

  function splitKey(raw, ln) {
    var segs = [], i = 0, n = raw.length;
    function skipSp() { while (i < n && (raw.charAt(i) === ' ' || raw.charAt(i) === '\t')) i++; }
    for (;;) {
      skipSp();
      if (raw.charAt(i) === '"') {
        var j = i + 1, o = ''; 
        while (j < n && raw.charAt(j) !== '"') {
          if (raw.charAt(j) === '\\') { o += '\\' + raw.charAt(j + 1); j += 2; continue; }
          o += raw.charAt(j); j++;
        }
        if (j >= n) bad(ln, 'Unterminated quoted key');
        segs.push(unesc(o, ln)); i = j + 1;
      } else if (raw.charAt(i) === '\'') {
        var lq = i + 1, lit = '';
        while (lq < n && raw.charAt(lq) !== '\'') { lit += raw.charAt(lq); lq++; }
        if (lq >= n) bad(ln, 'Unterminated quoted key');
        segs.push(lit); i = lq + 1;
      } else {
        var m = /^[A-Za-z0-9_-]+/.exec(raw.slice(i));
        if (!m) bad(ln, 'Bad key near ' + '"' + raw.slice(i, i + 12) + '"');
        segs.push(m[0]); i += m[0].length;
      }
      skipSp();
      if (i >= n) break;
      if (raw.charAt(i) !== '.') bad(ln, 'Expected ' + '"."' + ' in dotted key');
      i++;
    }
    if (!segs.length) bad(ln, 'Empty key');
    return segs;
  }
  function parseVal(str, ln) {
    var i = 0, n = str.length;
    function sp() { while (i < n && (str.charAt(i) === ' ' || str.charAt(i) === '\t' || str.charAt(i) === '\n' || str.charAt(i) === '\r')) i++; }
    function mlBasic() {
      var o = ''; i += 3;
      if (str.charAt(i) === '\n') i++;
      else if (str.charAt(i) === '\r' && str.charAt(i + 1) === '\n') i += 2;
      while (i < n) {
        if (str.charAt(i) === '\\') {
          var nx = str.charAt(i + 1);
          if (nx === '\\') { o += '\\\\'; i += 2; continue; }
          var k = i + 1;
          while (k < n && (str.charAt(k) === ' ' || str.charAt(k) === '\t')) k++;
          if (str.charAt(k) === '\n' || (str.charAt(k) === '\r' && str.charAt(k + 1) === '\n')) {
            k += str.charAt(k) === '\r' ? 2 : 1;
            while (k < n && /\s/.test(str.charAt(k))) k++;
            i = k; continue;
          }
          o += '\\' + nx; i += 2; continue;
        }
        if (str.substr(i, 3) === '"""') {
          var e = i;
          while (str.charAt(e) === '"') e++;
          if (e - i === 4) o += '"';
          else if (e - i === 5) o += '""';
          i = (e - i === 4 || e - i === 5) ? e : i + 3;
          return unesc(o, ln);
        }
        o += str.charAt(i); i++;
      }
      bad(ln, 'Unterminated multi-line string');
    }
    function mlLiteral() {
      var o2 = ''; i += 3;
      if (str.charAt(i) === '\n') i++;
      else if (str.charAt(i) === '\r' && str.charAt(i + 1) === '\n') i += 2;
      while (i < n) {
        if (str.substr(i, 3) === "'''") {
          var e2 = i;
          while (str.charAt(e2) === "'") e2++;
          if (e2 - i === 4) o2 += "'";
          else if (e2 - i === 5) o2 += "''";
          i = (e2 - i === 4 || e2 - i === 5) ? e2 : i + 3;
          return o2;
        }
        o2 += str.charAt(i); i++;
      }
      bad(ln, 'Unterminated multi-line literal string');
    }
    function basic() {
      var o = ''; i++;
      while (i < n && str.charAt(i) !== '"') {
        if (str.charAt(i) === '\\') { o += '\\' + str.charAt(i + 1); i += 2; continue; }
        o += str.charAt(i); i++;
      }
      if (i >= n) bad(ln, 'Unterminated string');
      i++; return unesc(o, ln);
    }
    function literal() {
      var j = str.indexOf("'", i + 1);
      if (j < 0) bad(ln, 'Unterminated literal string');
      var o = str.slice(i + 1, j); i = j + 1; return o;
    }
    function arr() {
      var a = []; i++;
      for (;;) {
        sp();
        if (i < n && str.charAt(i) === ']') { i++; return a; }
        a.push(val()); sp();
        if (i < n && str.charAt(i) === ',') { i++; continue; }
        if (i < n && str.charAt(i) === ']') { i++; return a; }
        bad(ln, 'Expected ' + '","' + ' or ' + '"]"' + ' in array');
      }
    }
    function inline() {
      var o = {}; i++;
      for (;;) {
        sp();
        if (i < n && str.charAt(i) === '}') { i++; return o; }
        var eq = findKeyEq(str, i);
        if (eq < 0) bad(ln, 'Expected key = value in inline table');
        var ks = splitKey(str.slice(i, eq), ln);
        i = eq + 1;
        var vv = val();
        var t = o;
        for (var d = 0; d < ks.length - 1; d++) {
          if (!isObj(t[ks[d]])) t[ks[d]] = {};
          t = t[ks[d]];
        }
        setKey(t, ks[ks.length - 1], vv, ln); sp();
        if (i < n && str.charAt(i) === ',') { i++; continue; }
        if (i < n && str.charAt(i) === '}') { i++; return o; }
        bad(ln, 'Expected ' + '","' + ' or ' + '"}"' + ' in inline table');
      }
    }
    function token() {
      var j = i;
      while (j < n && ' \t\r\n,#}]'.indexOf(str.charAt(j)) < 0) j++;
      var t = str.slice(i, j); i = j; return t;
    }
    function numlike(t) {
      return /^[+-]?[0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9_]+)?$/.test(t) && /[0-9]/.test(t);
    }
    function val() {
      sp();
      var c = str.charAt(i);
      if (c === '"' && str.substr(i, 3) === '"""') return mlBasic();
      if (c === "'" && str.substr(i, 3) === "'''") return mlLiteral();
      if (c === '"') return basic();
      if (c === "'") return literal();
      if (c === '[') return arr();
      if (c === '{') return inline();
      var t = token(), low = t.toLowerCase();
      if (t === 'true') return true;
      if (t === 'false') return false;
      if (low === 'inf' || low === '+inf' || low === '-inf' || low === 'nan' || low === '+nan' || low === '-nan') bad(ln, 'NaN/Infinity have no JSON form');
      if (/^0[xob]/.test(t)) { if (!/^0[xob][0-9a-fA-F_]+$/.test(t)) bad(ln, 'Bad number'); var hv = Number(t.replace(/_/g, '')); if (isNaN(hv)) bad(ln, 'Bad number'); return hv; }
      if (numlike(t)) {
        var v = Number(t.replace(/_/g, ''));
        if (isNaN(v)) bad(ln, 'Bad number ' + '"' + t + '"');
        return v;
      }
      if (/^[0-9]/.test(t) && /[-:T]/.test(t)) return t;
      bad(ln, 'Bad value ' + '"' + t.slice(0, 20) + '"');
    }
    sp();
    var out0 = val(); sp();
    if (i !== n) bad(ln, 'Trailing text after value');
    return out0;
  }
  var root = {}, cur = root, seen = {};
  function nav(segs, ln) {
    var o = root;
    for (var d = 0; d < segs.length; d++) {
      var k = segs[d];
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') bad(ln, 'Forbidden key ' + '"' + k + '"');
      if (o[k] === undefined) o[k] = {};
      else if (!isObj(o[k])) bad(ln, 'Type clash at ' + '"' + k + '"');
      o = o[k];
    }
    return o;
  }
  var raws = text.split('\n'), lns = [], buf = '', bstart = 1, depth = 0, inS = false, sq = '', tri = '';
  for (var r = 0; r < raws.length; r++) {
    var rl = raws[r];
    for (var p = 0; p < rl.length; p++) {
      var ch = rl.charAt(p);
      if (tri) {
        if (tri === '"""' && ch === '\\') { buf += ch + rl.charAt(p + 1); p++; continue; }
        if (rl.substr(p, 3) === tri) {
          var run = p;
          while (rl.charAt(run) === tri.charAt(0)) run++;
          run -= p;
          if (run === 4 || run === 5) { buf += rl.substr(p, run); p += run - 1; tri = ''; continue; }
          buf += tri; p += 2; tri = ''; continue;
        }
        buf += ch; continue;
      }
      if (inS) {
        if (ch === '\\' && sq === '"') { buf += ch + rl.charAt(p + 1); p++; continue; }
        if (ch === sq) inS = false;
        buf += ch; continue;
      }
      if (rl.substr(p, 3) === '"""' || rl.substr(p, 3) === "'''") { tri = rl.substr(p, 3); buf += tri; p += 2; continue; }
      if (ch === '"' || ch === "'") { inS = true; sq = ch; buf += ch; continue; }
      if (ch === '#') { buf += rl.slice(p); break; }
      if (ch === '[') depth++;
      if (ch === ']') depth = Math.max(0, depth - 1);
      buf += ch;
    }
    if (depth > 0 || tri) { buf += '\n'; continue; }
    lns.push({ t: buf, ln: bstart }); buf = ''; bstart = r + 2;
  }
  if (buf.trim()) lns.push({ t: buf, ln: bstart });
  lns.forEach(function (L) {
    var line = L.t, ln2 = L.ln;
    var cut = -1, iq = false, qq = '', tq = '';
    for (var q2 = 0; q2 < line.length; q2++) {
      var cc = line.charAt(q2);
      if (tq) {
        if (tq === '"""' && cc === '\\') { q2++; continue; }
        if (line.substr(q2, 3) === tq) {
          var rq = q2;
          while (line.charAt(rq) === tq.charAt(0)) rq++;
          if (rq - q2 === 4 || rq - q2 === 5) q2 = rq - 1;
          else q2 += 2;
          tq = ''; continue;
        }
        continue;
      }
      if (iq) {
        if (cc === '\\' && qq === '"') { q2++; continue; }
        if (cc === qq) iq = false;
        continue;
      }
      if ((cc === '"' && line.substr(q2, 3) === '"""') || (cc === "'" && line.substr(q2, 3) === "'''")) { tq = line.substr(q2, 3); q2 += 2; continue; }
      if (cc === '"' || cc === "'") { iq = true; qq = cc; continue; }
      if (cc === '#') { cut = q2; break; }
    }
    if (cut >= 0) {
      var nl = line.indexOf('\n', cut);
      line = line.slice(0, cut) + (nl < 0 ? '' : line.slice(nl));
    }
    line = line.trim();
    if (!line) return;
    if (line.charAt(0) === '[') {
      var arr2 = line.slice(0, 2) === '[[';
      var inner = arr2 ? line.slice(2, -2).trim() : line.slice(1, -1).trim();
      if (arr2 && line.slice(-2) !== ']]') bad(ln2, 'Array-table header must end with ]]');
      if (!arr2 && (line.slice(-1) !== ']' || line.slice(0, 2) === '[[')) bad(ln2, 'Table header must end with ]');
      var segs = splitKey(inner, ln2);
      var parent = nav(segs.slice(0, -1), ln2);
      var last = segs[segs.length - 1];
      if (last === '__proto__' || last === 'constructor' || last === 'prototype') bad(ln2, 'Forbidden key ' + '"' + last + '"');
      var sig = segs.join('' + String.fromCharCode(0) + '');
      if (arr2) {
        var ex = parent[last];
        var item = {};
        if (ex === undefined) parent[last] = [item];
        else if (Array.isArray(ex)) ex.push(item);
        else bad(ln2, 'Cannot append [[table]] over existing key');
        cur = item;
      } else {
        if (seen[sig]) bad(ln2, 'Duplicate table');
        seen[sig] = 1;
        if (parent[last] === undefined) parent[last] = {};
        else if (!isObj(parent[last])) bad(ln2, 'Type clash at ' + '"' + last + '"');
        cur = parent[last];
      }
      return;
    }
    var eq = findKeyEq(line, 0);
    if (eq < 0) bad(ln2, 'Expected key = value');
    var ks = splitKey(line.slice(0, eq), ln2);
    var vv = parseVal(line.slice(eq + 1), ln2);
    var t = cur;
    for (var d2 = 0; d2 < ks.length - 1; d2++) {
      if (ks[d2] === '__proto__' || ks[d2] === 'constructor' || ks[d2] === 'prototype') bad(ln2, 'Forbidden key');
      if (t[ks[d2]] === undefined) t[ks[d2]] = {};
      else if (!isObj(t[ks[d2]])) bad(ln2, 'Type clash in dotted key');
      t = t[ks[d2]];
    }
    setKey(t, ks[ks.length - 1], vv, ln2);
  });
  return JSON.stringify(root, null, 2);
};
/* TOML to YAML: parse once with the TOML core, emit with the canonical
   JSON-to-YAML emitter, so quoting stays single-sourced (bool-like strings
   stay quoted, tables become maps, [[arrays]] become sequences). */
T.tomlToYAML = function (s) { return T.jsonToYAML(T.tomlToJSON(s)); };
/* YAML to TOML: parse once with the YAML core (flow styles included),
   emit with the canonical JSON-to-TOML emitter. YAML nulls and top-level
   arrays/scalars have no TOML form, so those throw with the key path. */
T.yamlToTOML = function (s) { return T.jsonToTOML(T.yamlToJSON(s)); };
T.jsonDiff = function (a, b) {
  var oa = JSON.parse(a), ob = JSON.parse(b);
  var diffs = [];
  function compare(x, y, path) {
    if (typeof x !== typeof y) { diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
    if (x === null || y === null) { if (x !== y) diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
    if (typeof x !== 'object') { if (x !== y) diffs.push('- ' + path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); return; }
    if (Array.isArray(x) && Array.isArray(y)) {
      var max = Math.max(x.length, y.length);
      for (var i = 0; i < max; i++) {
        if (i >= x.length) diffs.push('+ ' + path + '[' + i + ']: ' + JSON.stringify(y[i]));
        else if (i >= y.length) diffs.push('- ' + path + '[' + i + ']: ' + JSON.stringify(x[i]));
        else compare(x[i], y[i], path + '[' + i + ']');
      }
      return;
    }
    var keys = Array.from(new Set(Object.keys(x).concat(Object.keys(y))));
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!(key in x)) diffs.push('+ ' + path + '.' + key + ': ' + JSON.stringify(y[key]));
      else if (!(key in y)) diffs.push('- ' + path + '.' + key + ': ' + JSON.stringify(x[key]));
      else compare(x[key], y[key], path + '.' + key);
    }
  }
  compare(oa, ob, 'root');
  return diffs.length ? diffs.join('\n') : 'No differences found';
};
/* JSON-diff UI contract: main input plus compareTo option (default empty object). Moved from the manifest so shell UI delegates to this single source. */
T.jsonDiffOpts = function (s, opts) {
  return T.jsonDiff(s, (opts && opts.compareTo) || '{}');
};
/* HTML pretty-printer (moved verbatim from the manifest handler):
   comment/doctype aware, void elements never gain children,
   script/style/pre content preserved byte-for-byte. */
T.htmlFormat = function (s) {
  if (!String(s).trim()) throw new Error('Enter HTML to format');
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  var RAW = { script: 1, style: 1, pre: 1, textarea: 1 };
  var out = [];
  var depth = 0;
  var i = 0, n = s.length;

  function pushText(text) {
    // Blank runs between tags collapse; real text gets its own line.
    var t = text.replace(/\s+/g, ' ');
    if (t.trim()) out.push('  '.repeat(depth) + t.trim());
  }

  while (i < n) {
    if (s.charAt(i) !== '<') {
      var next = s.indexOf('<', i);
      if (next === -1) next = n;
      pushText(s.slice(i, next));
      i = next;
      continue;
    }
    if (s.startsWith('<!--', i)) {
      var endC = s.indexOf('-->', i + 4);
      endC = endC === -1 ? n : endC + 3;
      out.push('  '.repeat(depth) + s.slice(i, endC).trim());
      i = endC;
      continue;
    }
    if (s.startsWith('<!', i) || s.startsWith('<?', i)) {
      var endD = s.indexOf('>', i);
      endD = endD === -1 ? n : endD + 1;
      out.push('  '.repeat(depth) + s.slice(i, endD).trim());
      i = endD;
      continue;
    }
    var gt = s.indexOf('>', i);
    if (gt === -1) { pushText(s.slice(i)); break; }
    var tag = s.slice(i, gt + 1);
    var isClose = tag.charAt(1) === '/';
    var nameMatch = tag.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);
    var name = nameMatch ? nameMatch[1].toLowerCase() : '';

    if (!isClose) {
      out.push('  '.repeat(depth) + tag.trim());
      var selfClosed = /\/>$/.test(tag);
      if (!selfClosed && !VOID[name]) {
        if (RAW[name]) {
          // Raw-content elements: copy the body verbatim, no reindent.
          var closeRe = new RegExp('</' + name + '\\s*>', 'i');
          var rest = s.slice(gt + 1);
          var m = rest.match(closeRe);
          if (m) {
            var inner = rest.slice(0, m.index);
            if (inner.trim()) out.push(inner.replace(/^\n/, '').replace(/\n$/, ''));
            out.push('  '.repeat(depth) + m[0].trim());
            i = gt + 1 + m.index + m[0].length;
            continue;
          }
        }
        depth++;
      }
    } else {
      depth = Math.max(0, depth - 1);
      out.push('  '.repeat(depth) + tag.trim());
    }
    i = gt + 1;
  }
  return out.join('\n').trim();
};

/* HTML minifier: comments stripped, inter-tag whitespace dropped,
   text runs collapsed to single spaces with edge spaces trimmed.
   script/style/pre/textarea bodies pass through byte-for-byte. */
T.htmlMinify = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Enter HTML to minify');
  var RAW = { script: 1, style: 1, pre: 1, textarea: 1 };
  var parts = [], i = 0, n = text.length;
  while (i < n) {
    var lt = text.indexOf('<', i);
    if (lt === -1) { parts.push({ t: 'text', v: text.slice(i) }); break; }
    if (lt > i) parts.push({ t: 'text', v: text.slice(i, lt) });
    if (text.indexOf('<!--', lt) === lt) {
      var ec = text.indexOf('-->', lt + 4);
      i = ec === -1 ? n : ec + 3;
      continue;
    }
    var gt = text.indexOf('>', lt + 1);
    if (gt === -1) { parts.push({ t: 'text', v: text.slice(lt) }); break; }
    var tag = text.slice(lt, gt + 1);
    var q = lt + 1;
    if (text.charAt(q) === '/') q++;
    while (text.charAt(q) === ' ') q++;
    var qs = q;
    while (/[a-zA-Z0-9-]/.test(text.charAt(q))) q++;
    var tname = text.slice(qs, q).toLowerCase();
    var isClose = tag.charAt(1) === '/';
    parts.push({ t: 'tag', v: tag.replace(/\s+/g, ' ').trim() });
    i = gt + 1;
    if (!isClose && RAW[tname] && tag.charAt(tag.length - 2) !== '/') {
      var low = text.slice(i).toLowerCase();
      var cay = low.indexOf('</' + tname);
      if (cay >= 0) {
        var cend = text.indexOf('>', i + cay + 2);
        if (cend >= 0) { parts.push({ t: 'raw', v: text.slice(i, cend + 1) }); i = cend + 1; }
      }
    }
  }
  var out = '';
  for (var k = 0; k < parts.length; k++) {
    var p = parts[k];
    if (p.t !== 'text') { out += p.v; continue; }
    var collapsed = p.v.replace(/\s+/g, ' ');
    if (!collapsed.trim()) continue;
    var lead = /^\s/.test(p.v), trail = /\s$/.test(p.v);
    if (lead && out.charAt(out.length - 1) === '>') out += ' ';
    out += collapsed.trim();
    if (trail) out += ' ';
  }
  out = out.replace(/> </g, '><').trim();
  if (!out) throw new Error('Input holds no markup (only comments or whitespace)');
  return out;
};

/* SQL pretty-printer (moved verbatim from the manifest handler):
   clause starters get their own line, quoted literals stay opaque. */
T.sqlFormat = function (s) {
  // Clause starters get their own line. Longer phrases must come
  // before their prefixes ('UNION ALL' before 'UNION').
  var BREAKS = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'OUTER JOIN',
    'GROUP BY', 'ORDER BY', 'UNION ALL', 'INSERT INTO', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE',
    'DROP TABLE', 'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'UPDATE', 'SET',
    'UNION', 'JOIN', 'ON'];
  var BREAK_RE = new RegExp('\\b(' + BREAKS.map(function (k) { return k.replace(/ /g, '\\s+'); }).join('|') + ')\\b', 'gi');

  /* Split into literal / code segments so quoted text is opaque. */
  var segs = [];
  var lit = false, buf = '';
  var i = 0;
  while (i < s.length) {
    var ch = s.charAt(i);
    if (!lit && ch === "'") {
      if (buf) { segs.push({ lit: false, text: buf }); buf = ''; }
      lit = true; buf = "'";
    } else if (lit && ch === "'") {
      if (s.charAt(i + 1) === "'") { buf += "''"; i++; }
      else { buf += "'"; segs.push({ lit: true, text: buf }); buf = ''; lit = false; }
    } else {
      buf += ch;
    }
    i++;
  }
  if (buf) segs.push({ lit: lit, text: buf });

  /* Break before keywords in code segments; literals pass through. */
  var broken = '';
  segs.forEach(function (seg) {
    if (seg.lit) { broken += seg.text; return; }
    broken += seg.text.replace(BREAK_RE, function (m) { return '\n' + m.toUpperCase(); });
  });

  /* Layout: first clause at column 0; joins and continuations indent. */
  var lines = broken.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  var out = [];
  var condCol = false; // inside a WHERE/HAVING leg → continuations align under AND/OR
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j];
    if (j === 0 || /^(SELECT|FROM|WHERE|HAVING|GROUP BY|ORDER BY|LIMIT|OFFSET|VALUES|SET|UNION)/i.test(line)) {
      condCol = /^WHERE|^HAVING/i.test(line);
      out.push(line);
    } else if (/^(INNER |LEFT |RIGHT |FULL |CROSS )?(OUTER )?JOIN/i.test(line)) {
      condCol = false;
      out.push('  ' + line);
    } else if (/^ON\b/i.test(line)) {
      out.push('    ' + line);
    } else if (/^(AND|OR)\b/i.test(line)) {
      out.push(condCol ? '  ' : '    ' + line);
    } else {
      out.push(condCol ? '  ' : '    ' + line);
    }
  }
  return out.join('\n');
};

/* SQL minifier: line/block comments stripped, whitespace collapsed
   to single spaces. Single-quoted literals ('' escape included)
   pass through byte-for-byte, so keywords inside strings survive. */
T.sqlMinify = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Enter SQL to minify');
  var pieces = [], code = '', lit = '', inStr = false;
  function flushCode() {
    var c = code.replace(/\s+/g, ' ').trim();
    c = c.replace(/ ([,;)])/g, '$1').replace(/[(] /g, '(');
    if (c) pieces.push(c);
    code = '';
  }
  var i = 0, n = text.length;
  while (i < n) {
    var ch = text.charAt(i), nx = text.charAt(i + 1);
    if (inStr) {
      if (ch === "'") {
        if (nx === "'") { lit += "''"; i += 2; continue; }
        lit += "'"; pieces.push(lit); lit = ''; inStr = false; i++; continue;
      }
      lit += ch; i++; continue;
    }
    if (ch === "'") { flushCode(); inStr = true; lit = "'"; i++; continue; }
    if (ch === '-' && nx === '-') {
      flushCode();
      var nl = text.indexOf('\n', i + 2);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (ch === '/' && nx === '*') {
      flushCode();
      var end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    code += ch; i++;
  }
  if (lit) pieces.push(lit);
  flushCode();
  var out = '';
  pieces.forEach(function (tok) {
    if (!out) { out = tok; return; }
    var gap = true;
    var last = out.charAt(out.length - 1), first = tok.charAt(0);
    if (last === '(' || first === ',' || first === ')' || first === ';') gap = false;
    out += (gap ? ' ' : '') + tok;
  });
  out = out.trim();
  if (!out) throw new Error('Input holds no SQL to minify (only comments or whitespace)');
  return out;
};

/* Shared XML strictness: bare-& scan over tokenizer output, matching
   the entity rules of the XML parser (xmlParseTree). Text and tag
   tokens may only carry well-formed entities (&amp; &lt; &#65; &#x41
   style, code point 1..1114111 excluding surrogates); comments, CDATA,
   PIs and declarations stay literal. */
T.xmlBareAmp = function (toks, text) {
  var ent = /^&([A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);/;
  var at = 0;
  for (var k = 0; k < toks.length; k++) {
    var tk = toks[k];
    if (tk.charAt(0) !== '<' || (tk.charAt(1) !== '?' && tk.charAt(1) !== '!')) {
      for (var i = 0; i < tk.length; i++) {
        if (tk.charAt(i) !== '&') continue;
        var m = ent.exec(tk.slice(i));
        if (!m) throw new Error('Bare & near ' + JSON.stringify(text.slice(at + i, at + i + 16)) + ' \u2014 escape it as &amp;');
        var body = m[1]; if (body.charAt(0) !== '#' && ['amp', 'lt', 'gt', 'quot', 'apos'].indexOf(body) < 0) throw new Error('Unknown entity &' + body + ';');
        if (body.charAt(0) === '#') {
          var hex = body.charAt(1) === 'x';
          var cp = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
          if (!isFinite(cp) || cp < 1 || cp > 1114111 || (cp >= 55296 && cp <= 57343)) throw new Error('Bad character reference &' + body + ';');
        }
      }
    }
    at += tk.length;
  }
};

/* XML pretty-printer: comment/CDATA/PI/doctype aware tokenizer, elements
   holding only text stay inline, blank inter-tag text drops, mismatched or
   unclosed tags throw with position context. */
T.xmlFormat = function (s, opts) {
  var o = opts || {};
  var pad = o.indent === 'tab' ? '\t' : '';
  if (!pad) {
    var n = parseInt(o.indent || '2', 10);
    if (!(n >= 1 && n <= 8)) n = 2;
    for (var pi = 0; pi < n; pi++) pad += ' ';
  }
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Paste XML first \u2014 a declaration, element or fragment');
  var toks = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^<>]*>|<\/?[A-Za-z_][\w:.-]*[^<>]*\/?>|[^<]+/g) || [];
  var tkAt = 0, tkCi = 0;
  while (tkCi < toks.length && text.slice(tkAt, tkAt + toks[tkCi].length) === toks[tkCi]) { tkAt += toks[tkCi].length; tkCi++; }
  if (tkAt !== text.length) throw new Error('Bare "<" near ' + JSON.stringify(text.slice(tkAt, tkAt + 16)) + ' \u2014 escape it as &lt;');
  T.xmlBareAmp(toks, text);

  function isText(t) { return t.charAt(0) !== '<'; }
  function tagName(t) { var m = /^<\/?([A-Za-z_][\w:.-]*)/.exec(t); return m ? m[1] : null; }
  function isClose(t) { return t.charAt(0) === '<' && t.charAt(1) === '/'; }
  function isOpen(t) { return t.charAt(0) === '<' && t.charAt(1) !== '/' && t.charAt(1) !== '!' && t.charAt(1) !== '?' && !/\/\s*>$/.test(t); }
  function ind(d) { var p2 = ''; for (var i = 0; i < d; i++) p2 += pad; return p2; }
  var out = [], stack = [], depth = 0;
  for (var i = 0; i < toks.length; i++) {
    var tk = toks[i];
    if (isText(tk)) {
      if (!tk.trim()) continue;
      out.push(ind(depth) + tk.trim().replace(/\s+/g, ' '));
    } else if (tk.indexOf('<![CDATA[') === 0) {
      out.push(ind(depth) + tk);
    } else if (tk.indexOf('<!--') === 0 || tk.indexOf('<?') === 0 || tk.indexOf('<!') === 0) {
      out.push(ind(depth) + tk.trim());
    } else if (isClose(tk)) {
      var want = stack.pop();
      var got = tagName(tk);
      if (!want) throw new Error('Stray closing tag ' + tk.trim().slice(0, 24) + ' \u2014 nothing is open');
      if (want !== got) throw new Error('Mismatched tag: expected </' + want + '> but found </' + got + '>');
      depth = Math.max(0, depth - 1);
      out.push(ind(depth) + tk.trim());
    } else if (isOpen(tk)) {
      var nm = tagName(tk);
      var nx = toks[i + 1], nn = toks[i + 2];
      if (nm && nx !== undefined && isText(nx) && nx.trim() && nn !== undefined && isClose(nn) && tagName(nn) === nm) {
        out.push(ind(depth) + tk.trim() + nx.trim().replace(/\s+/g, ' ') + nn.trim());
        i += 2;
      } else {
        stack.push(nm || '?');
        out.push(ind(depth) + tk.trim());
        depth++;
      }
    } else {
      out.push(ind(depth) + tk.trim());
    }
  }
  if (stack.length) throw new Error('Unclosed tag <' + stack[stack.length - 1] + '> \u2014 missing closing tag');
  return out.join('\n');
};
/* XML minifier: same validated token grammar as xmlFormat (stray /
   mismatched / unclosed tags throw identical errors), but comments are
   stripped, inter-tag whitespace is dropped and tags are tightened with
   quote-aware space surgery, so CDATA, PIs, doctype and quoted attribute
   values pass through untouched. */
T.xmlMinify = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Paste XML first \u2014 a declaration, element or fragment');
  var toks = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^<>]*>|<\/?[A-Za-z_][\w:.-]*[^<>]*\/?>|[^<]+/g) || [];
  var tkAt = 0, tkCi = 0;
  while (tkCi < toks.length && text.slice(tkAt, tkAt + toks[tkCi].length) === toks[tkCi]) { tkAt += toks[tkCi].length; tkCi++; }
  if (tkAt !== text.length) throw new Error('Bare "<" near ' + JSON.stringify(text.slice(tkAt, tkAt + 16)) + ' \u2014 escape it as &lt;');
  T.xmlBareAmp(toks, text);

  function isText(t) { return t.charAt(0) !== '<'; }
  function tagName(t) { var m = /^<\/?([A-Za-z_][\w:.-]*)/.exec(t); return m ? m[1] : null; }
  function isClose(t) { return t.charAt(0) === '<' && t.charAt(1) === '/'; }
  function isOpen(t) { return t.charAt(0) === '<' && t.charAt(1) !== '/' && t.charAt(1) !== '!' && t.charAt(1) !== '?' && !/\/\s*>$/.test(t); }
  function tightTag(t) {
    var raw = t.trim(), o = '', q = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (q) { o += ch; if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; o += ch; continue; }
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        var j = i + 1;
        while (raw.charAt(j) === ' ' || raw.charAt(j) === '\t' || raw.charAt(j) === '\n' || raw.charAt(j) === '\r') j++;
        var nxq = raw.charAt(j);
        i = j - 1;
        if (nxq === '/' || nxq === '>' || nxq === '') continue;
        o += ' '; continue;
      }
      o += ch;
    }
    return o;
  }
  var out = [], stack = [];
  for (var k = 0; k < toks.length; k++) {
    var tk = toks[k];
    if (isText(tk)) {
      if (!tk.trim()) continue;
      out.push(tk.trim().replace(/\s+/g, ' '));
    } else if (tk.indexOf('<![CDATA[') === 0) {
      out.push(tk);
    } else if (tk.indexOf('<!--') === 0) {
      continue;
    } else if (tk.indexOf('<?') === 0 || tk.indexOf('<!') === 0) {
      out.push(tk.trim());
    } else if (isClose(tk)) {
      var want = stack.pop();
      var got = tagName(tk);
      if (!want) throw new Error('Stray closing tag ' + tk.trim().slice(0, 24) + ' \u2014 nothing is open');
      if (want !== got) throw new Error('Mismatched tag: expected </' + want + '> but found </' + got + '>');
      out.push(tightTag(tk));
    } else if (isOpen(tk)) {
      var nm = tagName(tk);
      var onx = toks[k + 1], nn = toks[k + 2];
      if (nm && onx !== undefined && isText(onx) && onx.trim() && nn !== undefined && isClose(nn) && tagName(nn) === nm) {
        out.push(tightTag(tk) + onx.trim().replace(/\s+/g, ' ') + tightTag(nn));
        k += 2;
      } else {
        stack.push(nm || '?');
        out.push(tightTag(tk));
      }
    } else {
      out.push(tightTag(tk));
    }
  }
  if (stack.length) throw new Error('Unclosed tag <' + stack[stack.length - 1] + '> \u2014 missing closing tag');
  return out.join('');
};

T.jsonToXML = function (s) {
  var obj = JSON.parse(s);
  function toXml(val, name) {
    var safe = String(name).replace(/[^a-zA-Z0-9_\-.:]/g, '_').replace(/^[^a-zA-Z_]/, '_$&') || 'item';
    if (val === null || val === undefined) return '<' + safe + '/>';
    if (typeof val !== 'object') return '<' + safe + '>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</' + safe + '>';
    if (Array.isArray(val)) return val.map(function (v) { return toXml(v, safe); }).join('\n');
    return '<' + safe + '>\n' + Object.entries(val).map(function (e) { return '  ' + toXml(e[1], e[0]).replace(/\n/g, '\n  '); }).join('\n') + '\n</' + safe + '>';
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + toXml(obj, 'root');
};
T.jsonEscape = function (s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'); };
T.jsonUnescape = function (s) {
  return s.replace(/\\(\\|t|r|n|"|'|\/)/g, function (m, ch) {
    switch (ch) {
      case '\\': return '\\';
      case 't': return '\t';
      case 'r': return '\r';
      case 'n': return '\n';
      case '"': return '"';
      case "'": return "'";
      case '/': return '/';
      default: return m;
    }
  });
};

T.extractPalette = function (rgba, maxColors) {
  if (!rgba || typeof rgba.length !== "number" || rgba.length < 4 || rgba.length % 4 !== 0) throw new Error("No pixel data \u2014 upload an image first.");
  maxColors = (maxColors === undefined || maxColors === null) ? 8 : parseInt(maxColors, 10);
  if (!(maxColors >= 1)) throw new Error("Pick at least 1 color.");
  if (maxColors > 16) maxColors = 16;
  var buckets = Object.create(null);
  var total = 0, i, r, g, b, a, key, e;
  for (i = 0; i < rgba.length; i += 4) {
    a = rgba[i + 3];
    if (a < 128) continue;
    r = rgba[i] | 0; g = rgba[i + 1] | 0; b = rgba[i + 2] | 0;
    key = (((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    e = buckets[key];
    if (!e) e = buckets[key] = { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; total++;
  }
  if (!total) throw new Error("Image is fully transparent \u2014 nothing to sample.");
  var list = [], k;
  for (k in buckets) { if (Object.prototype.hasOwnProperty.call(buckets, k)) list.push(buckets[k]); }
  list.sort(function (x, y) { return y.n - x.n; });
  var hex2 = function (v) { var h = (v < 0 ? 0 : v > 255 ? 255 : v).toString(16); return h.length < 2 ? "0" + h : h; };
  return list.slice(0, maxColors).map(function (en) {
    var ar = Math.round(en.r / en.n), ag = Math.round(en.g / en.n), ab = Math.round(en.b / en.n);
    var pct = Math.round((en.n / total) * 1000) / 10;
    return { hex: "#" + hex2(ar) + hex2(ag) + hex2(ab), rgb: ar + ", " + ag + ", " + ab, count: en.n, pct: pct };
  });
};

/* ── text ── */
var EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
var PHONE_RE = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}/g;
var URL_RE = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
var IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
T.extractEmails = function (s, delimiter) { return (s.match(EMAIL_RE) || []).join(delimiter || '\n'); };
/* Phone keywords from the extractor UI select (newline/comma/semicolon/
   space); anything else passes through as a raw delimiter. */
T.extractPhones = function (s, delimiter) {
  var d = delimiter || '\n';
  if (d === 'newline') d = '\n';
  else if (d === 'comma') d = ',';
  else if (d === 'semicolon') d = ';';
  else if (d === 'space') d = ' ';
  return (s.match(PHONE_RE) || []).join(d);
};
/* Phone UI contract: text input plus delimiter option. Moved from the manifest for single source. */
T.extractPhonesOpts = function (s, opts) {
  return T.extractPhones(s, (opts && opts.delimiter) || 'newline');
};
T.extractURLs = function (s, delimiter) { return (s.match(URL_RE) || []).join(delimiter || '\n'); };
T.extractIPs = function (s, delimiter) {
  var matches = s.match(IP_RE) || [];
  return matches.filter(function (ip) { return ip.split('.').every(function (n) { return parseInt(n) >= 0 && parseInt(n) <= 255; }); }).join(delimiter || '\n');
};
T.wordCount = function (s) {
  var words = s.toLowerCase().match(/\b\w+\b/g) || [];
  var counts = {};
  for (var i = 0; i < words.length; i++) counts[words[i]] = (counts[words[i]] || 0) + 1;
  return counts;
};
/* Word-counter report: fixed-width stats lines over T.textStats. */
T.wordReport = function (s) {
  var t = T.textStats(s);
  return [
    'Characters:  ' + t.characters, 'Words:       ' + t.words, 'Lines:       ' + t.lines,
    'Sentences:   ' + t.sentences, 'Paragraphs:  ' + t.paragraphs, 'Avg Word:    ' + t.avgWordLen + ' chars',
    'Read Time:   ~' + t.readingTime + ' min'
  ].join('\n');
};
/* Line tools: number (zero-padded), trim, drop empties, prefix/suffix.
   Moved verbatim from the manifest handler. */
T.lineTools = function (s, opts) {
  var mode = (opts && opts.mode) || 'number';
  var affix = (opts && opts.affix) || '';
  var lines = s.split('\n');
  if (mode === 'trim') return lines.map(function (l) { return l.trim(); }).join('\n');
  if (mode === 'remove-empty') return lines.filter(function (l) { return l.trim() !== ''; }).join('\n');
  if (mode === 'prefix') return lines.map(function (l) { return affix + l; }).join('\n');
  if (mode === 'suffix') return lines.map(function (l) { return l + affix; }).join('\n');
  var w = String(lines.length).length;
  return lines.map(function (l, i) {
    var n = String(i + 1);
    while (n.length < w) n = '0' + n;
    return n + '  ' + l;
  }).join('\n');
};
T.textStats = function (s) {
  var chars = s.length;
  var words = (s.match(/\b\w+\b/g) || []).length;
  var lines = s ? s.split('\n').length : 0;
  var sentences = (s.match(/[.!?]+/g) || []).length || (words > 0 ? 1 : 0);
  var paragraphs = s ? s.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length : 0;
  var avgWordLen = words ? Math.round((s.match(/\b\w+\b/g) || []).reduce(function (sum, w) { return sum + w.length; }, 0) / words * 10) / 10 : 0;
  var readingTime = Math.ceil(words / 200);
  return { characters: chars, words: words, lines: lines, sentences: sentences, paragraphs: paragraphs, avgWordLen: avgWordLen, readingTime: readingTime };
};
/* Statistics: Welford one-pass mean/variance (numerically stable),
   population AND sample stddev. Moved verbatim from the manifest handler
   so the UI delegates to this single source. */
/* Prime engine: deterministic Miller-Rabin (12 witnesses) + cached
   trial-division table (primes 5..10^6, sieved once). Moved verbatim
   from the manifest so the UI delegates to this single source. */
/** Generation counter: each run takes a number; a newer run aborts the
    factor hunt of any older one still chunking. */
var primeGen = 0;
/** Cached trial-division table: every prime in [5, 10^6], sieved once. */
var primeDivCache = null;
function primeDivisors() {
  if (primeDivCache) return primeDivCache;
  var limit = 1000000, sieve = new Uint8Array(limit + 1), out = [], i, j;
  for (i = 3; i * i <= limit; i += 2) {
    if (!sieve[i]) for (j = i * i; j <= limit; j += 2 * i) sieve[j] = 1;
  }
  for (i = 5; i <= limit; i += 2) if (!sieve[i]) out.push(i);
  primeDivCache = out;
  return out;
}
/** Modular exponentiation (square-and-multiply) over BigInt. */
function primeModPow(base, exp, mod) {
  var result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = result * base % mod;
    base = base * base % mod;
    exp >>= 1n;
  }
  return result;
}
T.primeDivisors = primeDivisors;
window.warmPrimeCache = primeDivisors;
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(function () { primeDivisors(); }, { timeout: 3000 });
}
T.primeCheck = function (s) {

      var input = s.trim().replace(/[,_\s]/g, '');
      if (!/^\d+$/.test(input)) throw new Error('Enter a non-negative integer');
      var n = BigInt(input);
      if (n < 2n) return input + ' — not a prime number (must be >= 2)';
      if (n === 2n || n === 3n) return n + ' — prime ✓';
      if (n % 2n === 0n) return n + ' — not prime ✗\nSmallest factor: 2';

      // Miller–Rabin with the first 12 primes as witnesses: deterministic
      // (proven, not probabilistic) for all n < 3,317,044,064,679,887,385,961,981
      // (Sorenson-Webster: no strong pseudoprime to these 12 bases exists below
      // that bound). Past it, "prime" carries the usual MR error; every
      // "composite" still runs the factor hunt, so a wrong factor is never
      // reported — only the honest > 10^6 verdict.
      var witnesses = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
      var d = n - 1n, r = 0n;
      while (d % 2n === 0n) { d /= 2n; r++; }
      var composite = false;
      for (var w = 0; w < witnesses.length && !composite; w++) {
        if (witnesses[w] >= n) continue; // witness must be coprime-stride below n
        var x = primeModPow(witnesses[w], d, n);
        if (x === 1n || x === n - 1n) continue;
        for (var i = 1n; i < r; i++) {
          x = x * x % n;
          if (x === n - 1n) break;
        }
        if (x !== n - 1n) composite = true;
      }
      if (!composite) return n + ' — prime ✓';

      // Composite: hunt the smallest factor. Trial division over a cached
      // prime table (primes to 10^6, sieved once) skips composite divisors;
      // inputs at or below 2^53-1 divide in fast Number arithmetic, larger
      // ones in BigInt. First chunk runs sync so small composites resolve to
      // a plain string (every existing caller keeps working); long hunts yield
      // to the event loop in 2000-entry slices so typing never janks.
      // No Worker: spawn cost (10-40ms) exceeds hunt cost.
      if (n % 3n === 0n) return n + ' — not prime ✗\nSmallest factor: 3';
      var myGen = ++primeGen;
      var divs = primeDivisors();
      var useNum = n <= 9007199254740991n;
      var N = useNum ? Number(n) : 0;
      var di = 0, dChunk = 2000; // dChunk sizes the sync head only; async slices are time-boxed
      var factorVerdict = function (d) { return n + ' — not prime ✗\nSmallest factor: ' + d; };
      var honestVerdict = function () { return n + ' — not prime ✗\nSmallest factor: > 10⁶ (too large to factor quickly)'; };
      var hasFactor = function (d) { return useNum ? N % d === 0 : n % BigInt(d) === 0n; };
      for (var c = 0; c < dChunk && di < divs.length; c++, di++) {
        if (hasFactor(divs[di])) return factorVerdict(divs[di]);
      }
      var fallbackHunt = function () {
        return (async function () {
          while (di < divs.length) {
            if (myGen !== primeGen) return '';
            await new Promise(function (r) { setTimeout(r, 0); });
            if (myGen !== primeGen) return '';
            var tEnd = Date.now() + 8, k = 0;
            while (di < divs.length) {
              if (hasFactor(divs[di])) return factorVerdict(divs[di]);
              di++;
              if ((++k & 127) === 0 && Date.now() >= tEnd) break;
            }
          }
          return honestVerdict();
        })();
      };
      return fallbackHunt();
    };
T.describeStats = function (s) {
  var nums = s.split(/[\s,\n]+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
  if (nums.length < 2) throw new Error("Enter at least 2 numbers");
  function fmt(x) {
    if (!isFinite(x)) return String(x);
    if (Math.abs(x) >= 1e15 || (Math.abs(x) > 0 && Math.abs(x) < 1e-9)) return x.toExponential(6);
    var f = x.toFixed(6);
    if (f.indexOf(".") >= 0) f = f.replace(/0+$/, "").replace(/\.$/, "");
    return f === "" || f === "-" ? "0" : f;
  }
  var count = 0, mean = 0, m2 = 0;
  for (var i = 0; i < nums.length; i++) {
    count++;
    var delta = nums[i] - mean;
    mean += delta / count;
    var delta2 = nums[i] - mean;
    m2 += delta * delta2;
  }
  var sorted = nums.slice().sort(function (a, b) { return a - b; });
  var median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];
  var freq = {};
  nums.forEach(function (n) { freq[n] = (freq[n] || 0) + 1; });
  var maxFreq = Math.max.apply(null, Object.values(freq));
  var modes = maxFreq === 1 ? "none" : Object.entries(freq)
    .filter(function (e) { return e[1] === maxFreq; })
    .map(function (e) { return parseFloat(e[0]); }).join(", ");
  var popVar = m2 / count;
  var sampleVar = m2 / (count - 1);
  return "Count:       " + count +
    "\nSum:         " + fmt(nums.reduce(function (a, b) { return a + b; }, 0)) +
    "\nMean:        " + fmt(mean) +
    "\nMedian:      " + fmt(median) +
    "\nMode:        " + modes +
    "\nRange:       " + fmt(sorted[count - 1] - sorted[0]) +
    "\nMin:         " + fmt(sorted[0]) +
    "\nMax:         " + fmt(sorted[count - 1]) +
    "\nVariance:    " + fmt(popVar) + " (population)" +
    "\nStdDev:      " + fmt(Math.sqrt(popVar)) + " (population)" +
    "\nSample StdDev: " + fmt(Math.sqrt(sampleVar)) + " (n\u22121)";
};
/* Readability estimates: Flesch Reading Ease, Flesch-Kincaid grade and
   Gunning Fog from vowel-group syllable counts, plus the hardest words
   and longest sentences as rewrite targets. Heuristic by nature —
   scores are estimates, not verdicts. */
T.readability = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  var words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (!words.length) throw new Error('Paste text first \u2014 a sentence or more');
  var sentences = [];
  var sre = /[^.!?…]+([.!?…]+|$)/g, sm;
  while ((sm = sre.exec(text))) { if (/[A-Za-z0-9]/.test(sm[0])) sentences.push(sm[0]); }
  if (!sentences.length) sentences = [text];
  function syl(w) {
    var t = w.toLowerCase().replace(/[^a-z]/g, '');
    if (!t) return 0;
    if (t.length <= 3) return 1;
    t = t.replace(/(?:[^laeiouy]e|ed|es)$/, '').replace(/^y/, '');
    return Math.max(1, (t.match(/[aeiouy]{1,2}/g) || []).length);
  }
  var syls = words.map(syl);
  var totalSyl = syls.reduce(function (a, b) { return a + b; }, 0);
  var w = words.length, sn = sentences.length;
  var fre = 206.835 - 1.015 * (w / sn) - 84.6 * (totalSyl / w);
  var fk = 0.39 * (w / sn) + 11.8 * (totalSyl / w) - 15.59;
  var complex = words.filter(function (wd, i) { return syls[i] >= 3 && wd.charAt(0) === wd.charAt(0).toLowerCase(); });
  var fog = 0.4 * ((w / sn) + 100 * (complex.length / w));
  if (fk < 0) fk = 0;
  function r1(n) { return Math.round(n * 10) / 10; }
  function freBand(x) {
    if (x >= 90) return 'very easy';
    if (x >= 80) return 'easy';
    if (x >= 70) return 'fairly easy';
    if (x >= 60) return 'plain English';
    if (x >= 50) return 'fairly difficult';
    if (x >= 30) return 'difficult';
    return 'very difficult';
  }
  var freq = {}, repSyl = {};
  words.forEach(function (wd, i) {
    if (syls[i] >= 3 && wd.charAt(0) === wd.charAt(0).toLowerCase()) {
      var k = wd.toLowerCase();
      freq[k] = (freq[k] || 0) + 1;
      repSyl[k] = syls[i];
    }
  });
  var hard = Object.keys(freq).map(function (k) { return { w: k, n: freq[k], s: repSyl[k] }; })
    .sort(function (a, b) { return (b.n - a.n) || (b.s - a.s); }).slice(0, 10);
  var long = sentences.map(function (x) { return x.trim().replace(/\s+/g, ' '); })
    .map(function (x) { return { x: x, n: x.split(' ').length }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 3);
  var out = [];
  out.push('Words: ' + w + ' \u00b7 Sentences: ' + sn + ' \u00b7 Syllables: ' + totalSyl + ' (estimates)');
  out.push('Flesch Reading Ease: ' + r1(fre) + ' (' + freBand(fre) + ')');
  out.push('Flesch-Kincaid Grade: ' + r1(fk) + ' (US grade level)');
  out.push('Gunning Fog: ' + r1(fog) + ' (years of schooling)');
  if (hard.length) {
    out.push('');
    out.push('Hardest words (' + complex.length + ' complex, top ' + hard.length + '):');
    hard.forEach(function (h) { out.push('\u00b7 ' + h.w + ' (\u00d7' + h.n + ', ' + h.s + ' syllables)'); });
  }
  if (sn > 1 && long.length) {
    out.push('');
    out.push('Longest sentences:');
    long.forEach(function (L, i) {
      var t = L.x.length > 90 ? L.x.slice(0, 90) + '\u2026' : L.x;
      out.push((i + 1) + '. [' + L.n + ' words] ' + t);
    });
  }
  return out.join('\n');
};

T.caseConvert = function (s, style) {
  var words = s.match(/\b\w+\b/g) || [];
  switch (style) {
    case 'lower': return s.toLowerCase();
    case 'upper': return s.toUpperCase();
    case 'title': return words.map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
    case 'camel': return words.map(function (w, i) { return i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join('');
    case 'pascal': return words.map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join('');
    case 'snake': return words.map(function (w) { return w.toLowerCase(); }).join('_');
    case 'screaming_snake': return words.map(function (w) { return w.toUpperCase(); }).join('_');
    case 'kebab': return words.map(function (w) { return w.toLowerCase(); }).join('-');
    case 'train': return words.map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join('-');
    default: return s;
  }
};
/* Case UI contract: text input plus style option. Moved from the manifest for single source. */
T.caseConvertOpts = function (s, opts) {
  return T.caseConvert(s, (opts && opts.style) || 'lower');
};
T.slugify = function (s) { return s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, ''); };
T.textDiff = function (a, b) { return MyersDiff.linesText(a, b); };
/* Diff UI contract: compare-text plus lines/words granularity arrive as option strings (lines default). Moved from the manifest so shell UI delegates to this single source. */
T.diffOpts = function (s, opts) {
  var b = (opts && opts.compareTo) || '';
  if ((opts && opts.granularity) === 'words') return MyersDiff.wordsText(s, b);
  return T.textDiff(s, b);
};
T.deduplicate = function (s) { return Array.from(new Set(s.split('\n'))).join('\n'); };
T.sortLines = function (s, desc) {
  var lines = s.split('\n');
  lines.sort(desc ? function (a, b) { return b.localeCompare(a); } : function (a, b) { return a.localeCompare(b); });
  return lines.join('\n');
};
T.sortByLength = function (s, desc) {
  var lines = s.split('\n');
  lines.sort(function (a, b) { return desc ? b.length - a.length : a.length - b.length; });
  return lines.join('\n');
};
/* Line sorter UI contract: mode + direction arrive as option strings with alpha/asc defaults. Moved from the manifest so shell UI delegates to this single source. */
T.sortText = function (s, opts) {
  var desc = opts && opts.direction === 'desc';
  return ((opts && opts.sortBy) || 'alpha') === 'length' ? T.sortByLength(s, desc) : T.sortLines(s, desc);
};
T.reverseText = function (s, perLine) {
  function rev(t) { return t.split('').reverse().join(''); }
  if (perLine) return String(s).split('\n').map(rev).join('\n');
  return rev(String(s));
};
/* Text-reverser UI contract: mode arrives as an option string ('lines' reverses per line, anything else reverses full text). Moved from the manifest so shell UI delegates to this single source. */
T.reverseTextOpts = function (s, opts) {
  return T.reverseText(s, opts && opts.mode === 'lines');
};
T.palindromeReport = function (s) {
  var clean = String(s).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  var isPal = clean === clean.split('').reverse().join('');
  return (isPal ? '\u2713 YES' : '\u2717 NO') + ' \u2014 "' + clean + '" ' + (isPal ? 'is' : 'is not') + ' a palindrome\n\nOriginal: ' + String(s).slice(0, 200);
};
T.regexTest = function (pattern, flags, text) {
  try {
    var re = new RegExp(pattern, flags);
    var matches = Array.from(text.matchAll(re), function (m) { return m[0]; });
    return { matches: matches, count: matches.length };
  } catch (e) { throw new Error('Invalid regex: ' + (e instanceof Error ? e.message : String(e))); }
};
/* Regex-tester UI contract: pattern/flags arrive as option strings (flags default g, empty pattern throws). Report formatting moved from the manifest so shell UI delegates to this single source. */
T.regexTestOpts = function (s, opts) {
  var pat = (opts && opts.pattern) || '';
  var flags = (opts && opts.flags) || 'g';
  if (!pat) throw new Error('Enter a regex pattern');
  var r = T.regexTest(pat, flags, s);
  return 'Matches found: ' + r.count + '\n' + '\u2500'.repeat(40) + '\n' + r.matches.join('\n');
};
T.regexEscape = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
T.palindromeCheck = function (s) {
  var clean = s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return clean === clean.split('').reverse().join('');
};
T.uuidV4 = function () { return CryptoRand.uuidV4(); };
T.uuidV7 = function (nowMs) {
  var ts = (nowMs === undefined || nowMs === null) ? Date.now() : nowMs;
  if (!Number.isInteger(ts) || ts < 0 || ts > 0xFFFFFFFFFFFF) throw new Error('UUID v7 timestamp must be an integer millisecond in [0, 2^48-1]');
  var hi = Math.floor(ts / 4294967296), lo = ts >>> 0;
  var r = CryptoRand.bytes(10);
  r[0] = (r[0] & 15) | 112;
  r[2] = (r[2] & 63) | 128;
  var time = hi.toString(16).padStart(4, '0') + lo.toString(16).padStart(8, '0');
  function bx(b) { return (b < 16 ? '0' : '') + b.toString(16); }
  var tail = '';
  for (var i = 4; i < 10; i++) tail += bx(r[i]);
  return time.slice(0, 8) + '-' + time.slice(8) + '-' + bx(r[0]) + bx(r[1]) + '-' + bx(r[2]) + bx(r[3]) + '-' + tail;
};
var ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulidEncode16(bytes) {
  var out = ULID_ALPHABET.charAt((bytes[0] >> 5) & 7);
  var acc = bytes[0] & 31, n = 5;
  for (var i = 1; i < bytes.length; i++) {
    acc = acc * 256 + bytes[i];
    n += 8;
    while (n >= 5) {
      n -= 5;
      var v = Math.floor(acc / Math.pow(2, n));
      out += ULID_ALPHABET.charAt(v);
      acc -= v * Math.pow(2, n);
    }
  }
  return out;
}
T.ulid = function (nowMs) {
  var ts = (nowMs === undefined || nowMs === null) ? Date.now() : nowMs;
  if (!Number.isInteger(ts) || ts < 0 || ts > 0xFFFFFFFFFFFF) throw new Error('ULID timestamp must be an integer millisecond in [0, 2^48-1]');
  var time = [], t = ts;
  for (var i = 0; i < 6; i++) { time.unshift(t % 256); t = Math.floor(t / 256); }
  var rand = CryptoRand.bytes(10);
  var bytes = time;
  for (var j = 0; j < rand.length; j++) bytes.push(rand[j]);
  if (bytes.length !== 16) throw new Error('ULID entropy failure');
  return ulidEncode16(bytes);
};
T.ulidDecode = function (s) {
  var t = String(s).trim().toUpperCase();
  if (t.length !== 26) throw new Error('ULID must be 26 characters');
  var vals = [];
  for (var i = 0; i < 26; i++) {
    var v = ULID_ALPHABET.indexOf(t.charAt(i));
    if (v < 0) throw new Error('ULID has invalid character ' + JSON.stringify(t.charAt(i)));
    vals.push(v);
  }
  if (vals[0] > 7) throw new Error('ULID timestamp overflows 48 bits');
  var bytes = [], acc = vals[0], n = 3;
  for (var k = 1; k < 26; k++) {
    acc = acc * 32 + vals[k];
    n += 5;
    while (n >= 8) {
      n -= 8;
      var b = Math.floor(acc / Math.pow(2, n));
      bytes.push(b);
      acc -= b * Math.pow(2, n);
    }
  }
  var ms = 0;
  for (var m = 0; m < 6; m++) ms = ms * 256 + bytes[m];
  return { id: t, timestamp: ms, iso: new Date(ms).toISOString() };
};
/* ULID validator: per-line verdicts with decoded timestamps. Moved from the manifest so shell UI delegates to this single source. */
T.ulidValidate = function (s) {
  var lines = s.trim().split('\n');
  return lines.map(function (ln) {
    var t = ln.trim();
    try {
      var d = T.ulidDecode(t);
      return '✓ ' + d.id + ' — valid ULID, timestamp ' + d.iso;
    } catch (e) {
      return '✗ ' + t + ' — ' + (e instanceof Error ? e.message : String(e));
    }
  }).join('\n');
};
/* UUID validator: Nil/Max plus v1, v3-v8 per RFC 9562, per-line verdicts.
   Moved verbatim from the manifest handler. */
T.uuidValidate = function (s) {

      var uuids = s.trim().split('\n');
      var names = { 1: 'UUIDv1 (time-based)', 3: 'UUIDv3 (MD5 name)', 4: 'UUIDv4 (random)', 5: 'UUIDv5 (SHA-1 name)', 6: 'UUIDv6 (reordered time)', 7: 'UUIDv7 (Unix-ms time)', 8: 'UUIDv8 (custom)' };
      return uuids.map(function (u) {
        var t = u.trim();
        if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(t)) return '✓ ' + t + ' — valid Nil UUID';
        if (/^f{8}-f{4}-f{4}-f{4}-f{12}$/i.test(t)) return '✓ ' + t + ' — valid Max UUID';
        var m = t.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        if (!m) return '✗ ' + t + ' — invalid UUID';
        var ver = parseInt(m[1], 16);
        if (!names[ver]) return '✗ ' + t + ' — unsupported UUID version ' + ver;
        return '✓ ' + t + ' — valid ' + names[ver];
      }).join('\n');
    };
/* Bulk generator rows: count/length clamps live here so every UI
   gets the same ceilings (uuid/ulid 1000, random-string 1024). */
T.uuidV4Batch = function (count) {
  count = parseInt(count, 10);
  if (!(count >= 1)) count = 1;
  if (count > 1000) count = 1000;
  var out = [];
  for (var i = 0; i < count; i++) out.push(T.uuidV4());
  return out.join('\n');
};
/* UUID v4 UI contract: count option. Moved from the manifest for single source. */
T.uuidV4BatchOpts = function (opts) {
  return T.uuidV4Batch((opts && opts.count) || '1');
};
T.ulidBatch = function (count) {
  count = parseInt(count, 10);
  if (!(count >= 1)) count = 1;
  if (count > 1000) count = 1000;
  var out = [];
  for (var i = 0; i < count; i++) out.push(T.ulid());
  return out.join('\n');
};
/* ULID UI contract: count option. Moved from the manifest for single source. */
T.ulidBatchOpts = function (opts) {
  return T.ulidBatch((opts && opts.count) || '1');
};
/* UUID v7 batch: count-clamped bulk generation over T.uuidV7. Extracted from the manifest so shell UI delegates to this single source. */
T.uuidV7Batch = function (count) {
  count = parseInt(count, 10);
  if (!(count >= 1)) count = 1;
  if (count > 1000) count = 1000;
  var out = [];
  for (var i = 0; i < count; i++) out.push(T.uuidV7());
  return out.join('\n');
};
/* UUID v7 UI contract: count option. Moved from the manifest for single source. */
T.uuidV7BatchOpts = function (opts) {
  return T.uuidV7Batch((opts && opts.count) || '1');
};
T.randomString = function (length, charset) {
  length = parseInt(length, 10);
  if (!charset) charset = 'alphanumeric';
  if (!(length >= 1)) length = 16;
  if (length > 1024) length = 1024;
  var pool = charset === 'alpha' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' :
    charset === 'numeric' ? '0123456789' :
    charset === 'hex' ? '0123456789abcdef' :
    charset === 'alphanumeric' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' :
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  return CryptoRand.string(length, pool);
};
/* Random-string UI contract: length and charset options. Moved from the manifest for single source. */
/* Dice roller: NdS+M notation over rejection-sampled CryptoRand draws, totals plus per-die detail. */
T.rollDiceOpts = function (opts) {
  var o = opts || {};
  var rawN = (o.notation === undefined || o.notation === null) ? '2d6' : String(o.notation);
  var spec = rawN.replace(/\s+/g, '');
  var dv = o.detail;
  var detail = (dv === undefined || dv === null) ? true : (dv === true || dv === 'true');
  var dm = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(spec);
  if (!dm) throw new Error('Bad notation \u2014 use NdS+M like 2d6+3, got ' + JSON.stringify(rawN));
  var dc = dm[1] === '' ? 1 : parseInt(dm[1], 10);
  var ds = parseInt(dm[2], 10);
  var dmod = dm[3] ? parseInt(dm[3], 10) : 0;
  if (!(dc >= 1) || dc > 100) throw new Error('Dice count \u2014 1 to 100 dice, got ' + JSON.stringify(dm[1]));
  if (!(ds >= 2) || ds > 1000) throw new Error('Dice sides \u2014 2 to 1000 sides, got ' + JSON.stringify(dm[2]));
  if (!(Math.abs(dmod) <= 1000000)) throw new Error('Modifier too large \u2014 within a million, got ' + JSON.stringify(dm[3]));
  var rolls = [];
  var total = dmod;
  for (var ri = 0; ri < dc; ri++) { var rv = CryptoRand.int(ds) + 1; rolls.push(rv); total += rv; }
  if (!detail) return String(total);
  var expr = String(dc) + 'd' + String(ds) + (dmod > 0 ? '+' + dmod : (dmod < 0 ? String(dmod) : ''));
  var parts = rolls.join(' + ');
  if (dmod > 0) parts += ' + ' + dmod;
  if (dmod < 0) parts += ' - ' + Math.abs(dmod);
  return expr + ' = ' + total + '  (' + parts + ')';
};
T.randomStringOpts = function (opts) {
  return T.randomString((opts && opts.length) || '16', (opts && opts.charset) || 'alphanumeric');
};
/* Password builder: UI contract (string or boolean class flags, length
   floor 4, throw when every class is off) over rejection-sampled draws
   with guaranteed per-class coverage. */
T.generatePassword = function (length, opts) {
  length = parseInt(length, 10);
  if (!(length >= 4)) length = 4;
  opts = opts || {};
  var on = function (v, dflt) { return (v === undefined || v === null) ? dflt : (v === true || v === 'true'); };
  var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower = 'abcdefghijklmnopqrstuvwxyz';
  var digits = '0123456789', symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?~';
  var active = [];
  if (on(opts.upper, true)) active.push(upper);
  if (on(opts.lower, true)) active.push(lower);
  if (on(opts.digits, true)) active.push(digits);
  if (on(opts.symbols, false)) active.push(symbols);
  if (!active.length) throw new Error('Select at least one character set');
  return CryptoRand.string(length, active.join(''), active);
};
/* Password UI contract: length plus class flags arrive as one options object. Moved from the manifest for single source. */
T.generatePasswordOpts = function (opts) {
  return T.generatePassword((opts && opts.length) || '24', opts);
};
/* API key: prefixed 32-char CSPRNG token (192 bits). Moved from the manifest
   so shell UI delegates to this single source. */
T.apiKey = function (fmt) {
  var prefix = fmt === 'sk' ? 'sk-' : fmt === 'pk' ? 'pk-' : '';
  return prefix + CryptoRand.string(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
};
/* API-key UI contract: format option. Moved from the manifest for single source. */
T.apiKeyOpts = function (opts) {
  return T.apiKey((opts && opts.format) || 'sk');
};
T.macAddress = function () {
  var arr = CryptoRand.bytes(6);
  arr[0] = (arr[0] | 0x02) & 0xfe;
  return Array.from(arr, function (b) { return b.toString(16).padStart(2, '0'); }).join(':').toUpperCase();
};
/* MAC batch: count-clamped bulk generation over T.macAddress. Extracted from the manifest so shell UI delegates to this single source. */
T.macBatch = function (count) {
  count = parseInt(count, 10);
  if (!(count >= 1)) count = 1;
  if (count > 100) count = 100;
  var out = [];
  for (var n = 0; n < count; n++) out.push(T.macAddress());
  return out.join('\n');
};
/* MAC UI contract: count option. Moved from the manifest for single source. */
T.macBatchOpts = function (opts) {
  return T.macBatch((opts && opts.count) || '1');
};
T.loremIpsum = function (paragraphs) {
  paragraphs = parseInt(paragraphs, 10);
  if (!(paragraphs >= 1)) paragraphs = 1;
  paragraphs = Math.min(paragraphs, 50);
  var words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'dolor', 'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum'];
  var sentences = [];
  for (var si = 0; si < paragraphs * 5; si++) {
    var len = 5 + CryptoRand.int(10);
    var parts = [];
    for (var wi = 0; wi < len; wi++) {
      var w = CryptoRand.pick(words);
      parts.push(wi === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w);
    }
    sentences.push(parts.join(' ') + '.');
  }
  var result = [];
  for (var i = 0; i < paragraphs; i++) result.push(sentences.slice(i * 5, i * 5 + 5).join(' '));
  return result.join('\n\n');
};
/* Lorem-ipsum UI contract: paragraph count arrives as an option string (default 1, clamped 1..50 inside loremIpsum). Moved from the manifest so shell UI delegates to this single source. */
T.loremIpsumOpts = function (opts) {
  return T.loremIpsum((opts && opts.paragraphs) || '1');
};
T.formatPhone = function (s) {
  var digits = s.replace(/\D/g, '');
  if (digits.length === 10) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  if (digits.length === 11 && digits[0] === '1') return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
  return digits;
};


T.PASSPHRASE_WORDS = 'amber anchor apple april atlas autumn bacon badge bamboo banana basin basket beach beard beaver berry birch blade blanket blaze blossom boiler bolt bonfire book boulder boxer branch brave bread breeze brick bridge bright bronze brook brown brush bucket buddy builder bunch bundle bush butter button cabin cactus camel candle canyon captain carbon cargo carpet carrot castle cedar celery cellar chain chair chalk charm cheese cherry chess chest chicken chief chill chimney cider cinema circle city civil claim clerk clever cliff clock clone closet cloud clover coach cocoa coconut coffee comet compass copper coral cork corn cottage cotton cougar county crayon cream creek cricket crimson crocus crowd crown crude crush crust crystal curtain curve cycle dagger daily dancer daisy dawn deal denim depot desert diary diesel dinner diver dock doctor dodge dolphin donor dragon drain drama dream dress drift drill drink driver drone drum duck duffel dune dusk eagle earth easel ebony eclipse edge elder electric eleven ember emerald engine envelope epic epoch equal eraser escort estate evening exile express fabric factor falcon family farmer feather fence fern ferry fever fiber field fig filter finch fire fish fjord flame flash flask fleet flesh flint float flock flood floor flour flower fluid flute foam focus fog forest forge fork fossil foster fountain fox frame freckle freezer fresh friend frost fruit fuel galaxy gallery garden garlic garnet gate gather gecko gem giant ginger glacier globe glove glow goat golden goose gorge gorilla gospel grain granite grape grass gravel grove guitar habit hamster harbor harmony harvest hat haven hazard'.split(' ');
T.passphrase = function (count, sep) {
  count = parseInt(count, 10);
  if (!(count >= 3)) throw new Error('Use at least 3 words (each adds 8 bits of entropy)');
  if (count > 12) throw new Error('Use at most 12 words');
  if (sep === undefined || sep === null) sep = '-';
  if (sep !== '-' && sep !== ' ' && sep !== '_' && sep !== '.') throw new Error('Separator must be hyphen, space, underscore or dot');
  if (!T.PASSPHRASE_WORDS || T.PASSPHRASE_WORDS.length !== 256) throw new Error('Passphrase wordlist is corrupt');
  var out = [];
  for (var i = 0; i < count; i++) out.push(CryptoRand.pick(T.PASSPHRASE_WORDS));
  return out.join(sep);
};
/* Passphrase UI contract: words and separator options. Moved from the manifest for single source. */
T.passphraseOpts = function (opts) {
  return T.passphrase(parseInt((opts && opts.words) || '6', 10), (opts && opts.separator) || '-');
};
T.passphraseEntropyBits = function (count) { count = parseInt(count, 10); if (!(count >= 1)) throw new Error('Enter a word count'); return count * 8; };
T.unicodeInspector = function (s) {
  var text = String(s === undefined ? '' : (s === null ? '' : s));
  if (text === '') throw new Error('Paste text first \u2014 one character is enough');
  var max = 256;
  var n = text.length;
  var lines = [];
  var i = 0;
  var count = 0;
  var lone = 0;
  var truncated = false;
  while (i < n) {
    if (count >= max) { truncated = true; break; }
    var cu = text.charCodeAt(i);
    var cp = cu;
    var units = 1;
    if (cu >= 0xD800) {
      if (cu <= 0xDBFF) {
        if (i + 1 < n) {
          var lo = text.charCodeAt(i + 1);
          if (lo >= 0xDC00) {
            if (lo <= 0xDFFF) {
              cp = (cu - 0xD800) * 0x400 + (lo - 0xDC00) + 0x10000;
              units = 2;
            } else { lone = lone + 1; }
          } else { lone = lone + 1; }
        } else { lone = lone + 1; }
      } else {
        if (cu >= 0xDC00) {
          if (cu <= 0xDFFF) { lone = lone + 1; }
        }
      }
    }
    var utf8 = '';
    if (cp >= 0xD800) {
      if (cp <= 0xDFFF) { utf8 = 'none'; }
    }
    if (utf8 === '') {
      if (cp <= 0x7F) {
        utf8 = '0x' + cp.toString(16).toUpperCase();
      } else {
        if (cp <= 0x7FF) {
          var b1 = 0xC0 + Math.floor(cp / 0x40);
          var b2 = 0x80 + (cp % 0x40);
          utf8 = '0x' + b1.toString(16).toUpperCase() + ' 0x' + b2.toString(16).toUpperCase();
        } else {
          if (cp <= 0xFFFF) {
            var c1 = 0xE0 + Math.floor(cp / 0x1000);
            var c2 = 0x80 + (Math.floor(cp / 0x40) % 0x40);
            var c3 = 0x80 + (cp % 0x40);
            utf8 = '0x' + c1.toString(16).toUpperCase() + ' 0x' + c2.toString(16).toUpperCase() + ' 0x' + c3.toString(16).toUpperCase();
          } else {
            var d1 = 0xF0 + Math.floor(cp / 0x40000);
            var d2 = 0x80 + (Math.floor(cp / 0x1000) % 0x40);
            var d3 = 0x80 + (Math.floor(cp / 0x40) % 0x40);
            var d4 = 0x80 + (cp % 0x40);
            utf8 = '0x' + d1.toString(16).toUpperCase() + ' 0x' + d2.toString(16).toUpperCase() + ' 0x' + d3.toString(16).toUpperCase() + ' 0x' + d4.toString(16).toUpperCase();
          }
        }
      }
    }
    var hex = cp.toString(16).toUpperCase();
    while (hex.length < 4) { hex = '0' + hex; }
    var ch = text.slice(i, i + units);
    var disp = ch;
    if (ch === '\n') { disp = 'LF'; }
    if (ch === '\r') { disp = 'CR'; }
    if (ch === '\t') { disp = 'TAB'; }
    if (ch === ' ') { disp = 'SPACE'; }
    var amp = String.fromCharCode(38);
    lines.push(disp + '  U+' + hex + '  dec ' + cp + '  UTF-8 ' + utf8 + '  UTF-16 ' + units + '  HTML ' + amp + '#' + cp + ';');
    i = i + units;
    count = count + 1;
  }
  var head = 'Code points: ' + count + '  UTF-16 units: ' + n;
  if (lone > 0) { head = head + '  Lone surrogates: ' + lone + ' (no valid UTF-8)'; }
  if (truncated) { head = head + '  Showing first ' + max; }
  return head + '\n' + lines.join('\n');
};
T.jsonPath = function (json, path) {
  var text = String(json === undefined ? '' : (json === null ? '' : json));
  if (text === '') throw new Error('Paste JSON first');
  var obj = JSON.parse(text);
  var D = String.fromCharCode(36);
  var SQ = String.fromCharCode(39);
  var DQ = String.fromCharCode(34);
  var raw = String(path === undefined ? D : (path === null ? D : path));
  var ps = 0;
  var pe = raw.length;
  while (ps < pe) {
    var wc = raw.charAt(ps);
    if (wc === ' ') { ps = ps + 1; } else { if (wc === '\t') { ps = ps + 1; } else { break; } }
  }
  while (pe > ps) {
    var ec = raw.charAt(pe - 1);
    if (ec === ' ') { pe = pe - 1; } else { if (ec === '\t') { pe = pe - 1; } else { break; } }
  }
  var p = raw.slice(ps, pe);
  if (p === '') throw new Error('Enter a path starting with ' + D + ' (example ' + D + '.store.book[0].title)');
  if (p.charAt(0) !== D) throw new Error('Path must start with ' + D + ' (example ' + D + '.store.book[0].title)');
  var rest = p.slice(1);
  var toks = [];
  var i = 0;
  var n = rest.length;
  while (i < n) {
    var ch = rest.charAt(i);
    if (ch === ' ') { i = i + 1; } else {
      if (ch === '\t') { i = i + 1; } else {
        if (ch === '.') {
          if (rest.charAt(i + 1) === '*') { toks.push({ wild: true }); i = i + 2; } else {
            var km = /^[A-Za-z0-9_]+/.exec(rest.slice(i + 1));
            if (km === null) throw new Error('Bad key after . at position ' + (i + 2));
            toks.push({ key: km[0] });
            i = i + 1 + km[0].length;
          }
        } else {
          if (ch === '[') {
            var close = rest.indexOf(']', i);
            if (close < 0) throw new Error('Missing ] in path');
            var a = i + 1;
            var z = close;
            while (a < z) {
              var c1 = rest.charAt(a);
              if (c1 === ' ') { a = a + 1; } else { if (c1 === '\t') { a = a + 1; } else { break; } }
            }
            while (z > a) {
              var c2 = rest.charAt(z - 1);
              if (c2 === ' ') { z = z - 1; } else { if (c2 === '\t') { z = z - 1; } else { break; } }
            }
            var inside = rest.slice(a, z);
            if (inside === '*') { toks.push({ wild: true }); } else {
              var allDig = inside.length > 0;
              for (var d = 0; d < inside.length; d = d + 1) {
                var dc = inside.charCodeAt(d);
                if (dc < 48) { allDig = false; } else { if (dc > 57) { allDig = false; } }
              }
              if (allDig) { toks.push({ index: parseInt(inside, 10) }); } else {
                if (inside.length >= 2) {
                  var f = inside.charAt(0);
                  var g = inside.charAt(inside.length - 1);
                  if (f === SQ) { if (g === SQ) { toks.push({ key: inside.slice(1, -1) }); } else { throw new Error('Bad key (use [0], [*], or quoted key)'); } }
                  else { if (f === DQ) { if (g === DQ) { toks.push({ key: inside.slice(1, -1) }); } else { throw new Error('Bad key (use [0], [*], or quoted key)'); } } else { throw new Error('Bad key (use [0], [*], or quoted key)'); } }
                } else { throw new Error('Bad key (use [0], [*], or quoted key)'); }
              }
            }
            i = close + 1;
          } else { throw new Error('Bad path (use .key, [0], [*])'); }
        }
      }
    }
  }
  var current = [obj];
  for (var t = 0; t < toks.length; t = t + 1) {
    var tok = toks[t];
    var next = [];
    for (var k = 0; k < current.length; k = k + 1) {
      var node = current[k];
      if (node !== null) {
        if (typeof node === 'object') {
          if (tok.wild) {
            for (var key in node) {
              if (Object.prototype.hasOwnProperty.call(node, key)) next.push(node[key]);
            }
          } else {
            if (tok.key !== undefined) {
              if (Object.prototype.hasOwnProperty.call(node, tok.key)) next.push(node[tok.key]);
            } else {
              if (Array.isArray(node)) { if (tok.index < node.length) next.push(node[tok.index]); }
            }
          }
        }
      }
    }
    current = next;
    if (current.length === 0) throw new Error('No match for path ' + p);
  }
  if (current.length === 1) return JSON.stringify(current[0], null, 2);
  return JSON.stringify(current, null, 2);
};
/* JSONPath UI contract: main input plus path option with root default. Moved from manifest for single source. */
T.jsonPathOpts = function (s, opts) {
  return T.jsonPath(s, (opts && opts.path) || String.fromCharCode(36));
};
/* Adler-32 checksum: zlib-style rolling sums over UTF-8 bytes, modulo deferred per NMAX chunk so long inputs stay exact and fast. */
T.adler32 = function (s) {
  var bytes = new TextEncoder().encode(String(s));
  var a = 1, b = 0, i = 0, n = bytes.length;
  while (n > 0) {
    var k = n < 5552 ? n : 5552;
    n -= k;
    for (var j = 0; j < k; j++, i++) { a += bytes[i]; b += a; }
    a %= 65521;
    b %= 65521;
  }
  return (((b << 16) | a) >>> 0).toString(16).padStart(8, '0');
};
/* Fletcher checksums: 16-bit byte sums plus 32-bit big-endian word sums with zero pad, both modulo one-less-than-base. */
T.fletcher = function (s, opts) {
  var o = opts || {};
  var size = String(o.size) === '32' ? 32 : 16;
  var bytes = new TextEncoder().encode(String(s));
  function fl16() {
    var s1 = 0, s2 = 0;
    for (var i = 0; i < bytes.length; i++) { s1 = (s1 + bytes[i]) % 255; s2 = (s2 + s1) % 255; }
    return (((s2 << 8) | s1) >>> 0).toString(16).padStart(4, '0');
  }
  function fl32() {
    var t1 = 0, t2 = 0;
    for (var k = 0; k < bytes.length; k += 2) {
      var w = (bytes[k] << 8) | (k + 1 < bytes.length ? bytes[k + 1] : 0);
      t1 = (t1 + w) % 65535;
      t2 = (t2 + t1) % 65535;
    }
    return ((t2 * 65536 + t1) >>> 0).toString(16).padStart(8, '0');
  }
  return size === 32 ? fl32() : fl16();
};
T.passwordEntropy = function (s) {
  var text = String(s === undefined ? '' : (s === null ? '' : s));
  var pool = 0;
  if (/[a-z]/.test(text)) pool += 26;
  if (/[A-Z]/.test(text)) pool += 26;
  if (/[0-9]/.test(text)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(text)) pool += 33;
  var bits = Math.round(text.length * Math.log2(pool === 0 ? 1 : pool) * 10) / 10;
  var strength = bits < 30 ? 'Weak' : bits < 50 ? 'Fair' : bits < 70 ? 'Good' : bits < 100 ? 'Strong' : 'Very Strong';
  return 'Entropy:    ' + bits + ' bits' + '\nStrength:   ' + strength + '\nLength:     ' + text.length + ' chars' + '\nChar Pool:  ' + pool + ' chars';
};
T.curlQuote = function (s) {
  var SQ = String.fromCharCode(39);
  var BS = String.fromCharCode(92);
  var LF = String.fromCharCode(10);
  return SQ + String(s).split(BS).join(BS + BS).split(SQ).join(BS + SQ).split(LF).join(BS + 'n') + SQ;
};
T.curlToFetch = function (s, style) {
  var text = String(s === undefined ? '' : (s === null ? '' : s));
  if (text === '') throw new Error('Paste a curl command first');
  var flat = text.replace(/\\\r\\n/g, ' ').replace(/\\\n/g, ' ');
  var SQ = String.fromCharCode(39);
  var DQ = String.fromCharCode(34);
  var toks = [];
  var cur = '';
  var qi = 0;
  var i = 0;
  while (i < flat.length) {
    var ch = flat.charAt(i);
    if (qi === 1) {
      if (ch === SQ) { qi = 0; } else { cur = cur + ch; }
      i = i + 1;
    } else {
      if (qi === 2) {
        if (ch === DQ) { qi = 0; i = i + 1; } else {
          if (ch === '\\') {
            if (i + 1 < flat.length) { cur = cur + flat.charAt(i + 1); i = i + 2; } else { i = i + 1; }
          } else { cur = cur + ch; i = i + 1; }
        }
      } else {
        if (ch === SQ) { qi = 1; i = i + 1; } else {
          if (ch === DQ) { qi = 2; i = i + 1; } else {
            if (flat.charCodeAt(i) <= 32) {
              if (cur !== '') { toks.push(cur); cur = ''; }
              i = i + 1;
            } else {
              if (ch === '\\') {
                if (i + 1 < flat.length) { cur = cur + flat.charAt(i + 1); i = i + 2; } else { i = i + 1; }
              } else { cur = cur + ch; i = i + 1; }
            }
          }
        }
      }
    }
  }
  if (cur !== '') toks.push(cur);
  var ci = -1;
  for (var t = 0; t < toks.length; t = t + 1) { if (toks[t] === 'curl') { ci = t; break; } }
  if (ci < 0) throw new Error('That input has no curl command in it');
  var method = '';
  var url = '';
  var headers = [];
  var datas = [];
  var user = '';
  var agent = '';
  var timeoutMs = 0;
  var notes = [];
  var k = ci + 1;
  while (k < toks.length) {
    var a = toks[k];
    if (a === '-X') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      method = toks[k + 1].toUpperCase(); k = k + 2;
    } else {
    if (a === '--request') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      method = toks[k + 1].toUpperCase(); k = k + 2;
    } else {
    if (a === '-H') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      T.curlHeader(headers, toks[k + 1]); k = k + 2;
    } else {
    if (a === '--header') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      T.curlHeader(headers, toks[k + 1]); k = k + 2;
    } else {
    if (a === '-d') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      datas.push(toks[k + 1]); k = k + 2;
    } else {
    if (a === '--data') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      datas.push(toks[k + 1]); k = k + 2;
    } else {
    if (a === '--data-raw') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      datas.push(toks[k + 1]); k = k + 2;
    } else {
    if (a === '--data-binary') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      datas.push(toks[k + 1]); k = k + 2;
    } else {
    if (a === '--data-ascii') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      datas.push(toks[k + 1]); k = k + 2;
    } else {
    if (a === '--data-urlencode') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      T.curlUrlEncode(datas, toks[k + 1]); k = k + 2;
    } else {
    if (a === '--url') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      url = toks[k + 1]; k = k + 2;
    } else {
    if (a === '-u') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      user = toks[k + 1]; k = k + 2;
    } else {
    if (a === '--user') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      user = toks[k + 1]; k = k + 2;
    } else {
    if (a === '-A') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      agent = toks[k + 1]; k = k + 2;
    } else {
    if (a === '--user-agent') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      agent = toks[k + 1]; k = k + 2;
    } else {
    if (a === '-b') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      headers.push(['Cookie', toks[k + 1]]); k = k + 2;
    } else {
    if (a === '--cookie') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      headers.push(['Cookie', toks[k + 1]]); k = k + 2;
    } else {
    if (a === '-e') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      headers.push(['Referer', toks[k + 1]]); k = k + 2;
    } else {
    if (a === '--referer') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      headers.push(['Referer', toks[k + 1]]); k = k + 2;
    } else {
    if (a === '-m') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      timeoutMs = T.curlTimeout(toks[k + 1]); k = k + 2;
    } else {
    if (a === '--max-time') {
      if (k + 1 >= toks.length) throw new Error('Missing value after ' + a);
      timeoutMs = T.curlTimeout(toks[k + 1]); k = k + 2;
    } else {
    if (a === '-L') { notes.push('-L: fetch follows redirects by default'); k = k + 1; } else {
    if (a === '--location') { notes.push('-L: fetch follows redirects by default'); k = k + 1; } else {
    if (a === '-k') { notes.push('-k: browsers cannot skip TLS checks; call fails on bad certs'); k = k + 1; } else {
    if (a === '--insecure') { notes.push('-k: browsers cannot skip TLS checks; call fails on bad certs'); k = k + 1; } else {
    if (a === '--compressed') { k = k + 1; } else {
    if (a === '-s') { k = k + 1; } else {
    if (a === '--silent') { k = k + 1; } else {
    if (a === '-S') { k = k + 1; } else {
    if (a === '--show-error') { k = k + 1; } else {
    if (a === '-v') { k = k + 1; } else {
    if (a === '--verbose') { k = k + 1; } else {
    if (a === '-f') { k = k + 1; } else {
    if (a === '--fail') { k = k + 1; } else {
    if (a === '-o') { k = k + 2; } else {
    if (a === '--output') { k = k + 2; } else {
    if (a === '-O') { k = k + 1; } else {
    if (a === '--remote-name') { k = k + 1; } else {
    if (a === '-w') { k = k + 2; } else {
    if (a === '--write-out') { k = k + 2; } else {
    if (a.charAt(0) === '-') { throw new Error('Unknown option ' + a + ' (only common HTTP flags convert)'); } else {
      if (url === '') { url = a; }
      k = k + 1;
    }}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}
  }
  if (url === '') throw new Error('No URL found in curl command');
  if (url.indexOf('http://') !== 0) { if (url.indexOf('https://') !== 0) throw new Error('Only http(s) URLs fetch in a browser (got ' + url + ')'); }
  if (method === '') { if (datas.length > 0) { method = 'POST'; } else { method = 'GET'; } }
  if (user !== '') {
    for (var u = 0; u < user.length; u = u + 1) { if (user.charCodeAt(u) > 255) throw new Error('Basic auth needs Latin-1 credentials'); }
    headers.push(['Authorization', 'Basic ' + T.b64(user)]);
  }
  if (agent !== '') { headers.push(['User-Agent', agent]); notes.push('User-Agent is forbidden in browsers; that header needs a proxy'); }
  if (style === undefined) { style = 'async'; } else { if (style === null) { style = 'async'; } else { if (style === '') { style = 'async'; } } }
  if (style !== 'async') { if (style !== 'promise') throw new Error('Unknown style'); }
  var body = datas.join('&');
  var q = T.curlQuote;
  var out = [];
  out.push('fetch(' + q(url) + ', {');
  out.push('  method: ' + q(method) + ',');
  if (headers.length > 0) {
    out.push('  headers: {');
    for (var h = 0; h < headers.length; h = h + 1) out.push('    ' + q(headers[h][0]) + ': ' + q(headers[h][1]) + ',');
    out.push('  },');
  }
  if (body !== '') out.push('  body: ' + q(body) + ',');
  if (timeoutMs > 0) out.push('  signal: AbortSignal.timeout(' + timeoutMs + '),');
  out.push('});');
  var call = out.join('\n');
  var tail = '';
  if (style === 'async') { tail = 'const res = await ' + call.slice(0, -1) + ';\nconst data = await res.text();'; }
  else { tail = call.slice(0, -1) + '\n  .then(function (res) { return res.text(); })\n  .then(function (data) { console.log(data); });'; }
  for (var nn = 0; nn < notes.length; nn = nn + 1) tail = tail + '\n// NOTE: ' + notes[nn];
  return tail;
};
/* Curl UI contract: curl command input plus style option. Moved from the manifest for single source. */
T.curlToFetchOpts = function (s, opts) {
  return T.curlToFetch(s, (opts && opts.style) || 'async');
};
T.curlHeader = function (headers, hv) {
  var colon = hv.indexOf(':');
  if (colon < 0) throw new Error('Bad header (need Name: value): ' + hv);
  var hk = hv.slice(0, colon).trim();
  var vv = hv.slice(colon + 1);
  if (vv.charAt(0) === ' ') vv = vv.slice(1);
  if (hk === '') throw new Error('Bad header (need Name: value): ' + hv);
  headers.push([hk, vv]);
};
T.curlUrlEncode = function (datas, dv) {
  var eq = dv.indexOf('=');
  if (eq < 0) { datas.push(encodeURIComponent(dv)); } else { datas.push(dv.slice(0, eq + 1) + encodeURIComponent(dv.slice(eq + 1))); }
};
T.curlTimeout = function (v) {
  var sec = parseFloat(v);
  if (isNaN(sec)) throw new Error('Bad --max-time (seconds): ' + v);
  if (sec <= 0) throw new Error('Bad --max-time (seconds): ' + v);
  return Math.round(sec * 1000);
};
T.b64 = function (s) {
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '';
  var n = s.length;
  for (var i = 0; i < n; i = i + 3) {
    var a = s.charCodeAt(i);
    var b = i + 1 < n ? s.charCodeAt(i + 1) : -1;
    var c = i + 2 < n ? s.charCodeAt(i + 2) : -1;
    var w = a * 65536 + (b < 0 ? 0 : b * 256) + (c < 0 ? 0 : c);
    var s0 = Math.floor(w / 262144);
    var s1 = Math.floor(w / 4096) - s0 * 64;
    var s2 = Math.floor(w / 64) - Math.floor(w / 4096) * 64;
    var s3 = w - Math.floor(w / 64) * 64;
    out = out + ABC.charAt(s0);
    out = out + ABC.charAt(s1);
    out = out + (b < 0 ? '=' : ABC.charAt(s2));
    out = out + (c < 0 ? '=' : ABC.charAt(s3));
  }
  return out;
};
/* MIME lookup: extension to IANA type and back, filenames tolerated, one result per line. */
var MIMEDB = {
html: ['text/html', 'HTML page'], htm: ['text/html', 'HTML page'], xhtml: ['application/xhtml+xml', 'XHTML page'],
css: ['text/css', 'Stylesheet'], csv: ['text/csv', 'CSV data'], txt: ['text/plain', 'Plain text'], log: ['text/plain', 'Log file'],
md: ['text/markdown', 'Markdown'], xml: ['application/xml', 'XML data'], js: ['text/javascript', 'JavaScript'], mjs: ['text/javascript', 'ES module'],
json: ['application/json', 'JSON data'], map: ['application/json', 'Source map'], geojson: ['application/geo+json', 'GeoJSON'], jsonld: ['application/ld+json', 'JSON-LD'],
webmanifest: ['application/manifest+json', 'Web app manifest'], yaml: ['application/yaml', 'YAML data'], rss: ['application/rss+xml', 'RSS feed'], atom: ['application/atom+xml', 'Atom feed'],
sql: ['application/sql', 'SQL dump'], ics: ['text/calendar', 'Calendar'], vcf: ['text/vcard', 'Contact card'], vtt: ['text/vtt', 'Subtitles'],
png: ['image/png', 'PNG image'], jpg: ['image/jpeg', 'JPEG image'], jpeg: ['image/jpeg', 'JPEG image'], gif: ['image/gif', 'GIF image'],
webp: ['image/webp', 'WebP image'], avif: ['image/avif', 'AVIF image'], apng: ['image/apng', 'Animated PNG'], svg: ['image/svg+xml', 'SVG vector'],
ico: ['image/x-icon', 'Icon'], bmp: ['image/bmp', 'Bitmap'], tif: ['image/tiff', 'TIFF image'], tiff: ['image/tiff', 'TIFF image'],
heic: ['image/heic', 'HEIC image'], heif: ['image/heif', 'HEIF image'], jxl: ['image/jxl', 'JPEG XL image'],
mp3: ['audio/mpeg', 'MP3 audio'], wav: ['audio/wav', 'WAV audio'], ogg: ['audio/ogg', 'Ogg audio'], opus: ['audio/ogg', 'Opus audio'],
flac: ['audio/flac', 'FLAC audio'], m4a: ['audio/mp4', 'M4A audio'], mid: ['audio/midi', 'MIDI'], midi: ['audio/midi', 'MIDI'], aac: ['audio/aac', 'AAC audio'],
mp4: ['video/mp4', 'MP4 video'], m4v: ['video/mp4', 'M4V video'], webm: ['video/webm', 'WebM video'], ogv: ['video/ogg', 'Ogg video'],
mov: ['video/quicktime', 'QuickTime'], avi: ['video/x-msvideo', 'AVI video'], mkv: ['video/x-matroska', 'Matroska'], flv: ['video/x-flv', 'Flash video'],
wmv: ['video/x-ms-wmv', 'WMV video'], mpg: ['video/mpeg', 'MPEG video'], mpeg: ['video/mpeg', 'MPEG video'], '3gp': ['video/3gpp', '3GP video'], ts: ['video/mp2t', 'MPEG transport'],
pdf: ['application/pdf', 'PDF document'], doc: ['application/msword', 'Word document'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word document'],
xls: ['application/vnd.ms-excel', 'Excel sheet'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel sheet'],
ppt: ['application/vnd.ms-powerpoint', 'Slides'], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Slides'],
odt: ['application/vnd.oasis.opendocument.text', 'ODT document'], ods: ['application/vnd.oasis.opendocument.spreadsheet', 'ODS sheet'], odp: ['application/vnd.oasis.opendocument.presentation', 'ODP slides'],
rtf: ['application/rtf', 'Rich text'], epub: ['application/epub+zip', 'EPUB ebook'],
zip: ['application/zip', 'ZIP archive'], rar: ['application/vnd.rar', 'RAR archive'], '7z': ['application/x-7z-compressed', '7-Zip archive'],
tar: ['application/x-tar', 'Tarball'], gz: ['application/gzip', 'Gzip'], bz2: ['application/x-bzip2', 'Bzip2'], xz: ['application/x-xz', 'XZ data'],
wasm: ['application/wasm', 'WASM module'], ttf: ['font/ttf', 'TrueType'], ttc: ['font/collection', 'Font collection'], otf: ['font/otf', 'OpenType'],
woff: ['font/woff', 'WOFF font'], woff2: ['font/woff2', 'WOFF2 font'], eot: ['application/vnd.ms-fontobject', 'Embedded font'],
exe: ['application/vnd.microsoft.portable-executable', 'Windows binary'], dmg: ['application/x-apple-diskimage', 'Disk image'],
deb: ['application/vnd.debian.binary-package', 'Debian package'], rpm: ['application/x-rpm', 'RPM package'], apk: ['application/vnd.android.package-archive', 'Android package'],
jar: ['application/java-archive', 'Java archive'], iso: ['application/x-iso9660-image', 'ISO image'], msi: ['application/x-msi', 'Installer'],
sh: ['application/x-sh', 'Shell script'], sqlite3: ['application/vnd.sqlite3', 'SQLite DB'],
pem: ['application/x-pem-file', 'PEM key'], crt: ['application/x-x509-ca-cert', 'Certificate'], cer: ['application/x-x509-ca-cert', 'Certificate'],
p12: ['application/x-pkcs12', 'PKCS12 store'], pfx: ['application/x-pkcs12', 'PKCS12 store']
};
T.mimeLookup = function (s) {
  var raw = String(s === undefined || s === null ? '' : s);
  for (var si = 0; si < raw.length; si++) { var cc = raw.charCodeAt(si); if (cc >= 0xD800 && cc <= 0xDFFF) return ''; }
  var rows = raw.split(/\r?\n/);
  var out = [];
  var seen = 0;
  for (var n = 0; n < rows.length; n++) {
    var line = rows[n].trim().toLowerCase();
    if (!line) continue;
    seen++;
    out.push('Line ' + (n + 1) + ': ' + one(line));
  }
  if (!seen) throw new Error('Enter an extension or MIME type');
  function one(line) {
    if (line.indexOf('/') >= 0) {
      var parts = line.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1] || /\s/.test(line)) throw new Error('Unrecognized MIME, got ' + JSON.stringify(line));
      var exts = [];
      for (var k in MIMEDB) if (MIMEDB[k][0] === line) exts.push(k);
      if (!exts.length) throw new Error('Unknown MIME, got ' + JSON.stringify(line));
      return line + ' → ' + exts.join(', ') + ' (' + MIMEDB[exts[0]][1] + ')';
    }
    var ext = line.charAt(0) === '.' ? line.slice(1) : line;
    if (ext.indexOf('.') >= 0) ext = ext.slice(ext.lastIndexOf('.') + 1);
    if (!ext || !/^[a-z0-9]+$/.test(ext) || !MIMEDB[ext]) throw new Error('Unknown extension, got ' + JSON.stringify(line));
    return ext + ' → ' + MIMEDB[ext][0] + ' (' + MIMEDB[ext][1] + ')';
  }
  return out.length === 1 ? out[0].slice(out[0].indexOf(': ') + 2) : out.join('\n');
};
T.filenameSanitize = function (s) {
  var text = String(s === undefined ? '' : (s === null ? '' : s));
  var RESERVED = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  var out = text.replace(/\s+/g, '_');
  out = out.replace(/[<>:"\/\\|?*]/g, '');
  out = out.replace(/[\x00-\x1F]/g, '');
  out = out.replace(/_+/g, '_');
  while (out.length > 0) {
    var f0 = out.charAt(0);
    if (f0 === '.') { out = out.slice(1); } else { if (f0 === '_') { out = out.slice(1); } else { if (out.charCodeAt(0) <= 32) { out = out.slice(1); } else { break; } } }
  }
  while (out.length > 0) {
    var e0 = out.charAt(out.length - 1);
    if (e0 === '.') { out = out.slice(0, -1); } else { if (e0 === '_') { out = out.slice(0, -1); } else { if (out.charCodeAt(out.length - 1) <= 32) { out = out.slice(0, -1); } else { break; } } }
  }
  if (RESERVED.indexOf(out.split('.')[0].toUpperCase()) >= 0) out = '_' + out;
  if (out === '') out = 'unnamed';
  return out.slice(0, 255);
};
T.envUnescape = function (v, ln) {
  var BS = String.fromCharCode(92);
  var DQ = String.fromCharCode(34);
  var SQ = String.fromCharCode(39);
  var out = '';
  var i = 0;
  while (i < v.length) {
    var ch = v.charAt(i);
    if (ch === BS) {
      if (i + 1 >= v.length) throw new Error('Line ' + ln + ' ends with a lone backslash');
      var nx = v.charAt(i + 1);
      if (nx === 'n') { out = out + '\n'; } else {
        if (nx === 't') { out = out + '\t'; } else {
          if (nx === 'r') { out = out + '\r'; } else {
            if (nx === BS) { out = out + BS; } else {
              if (nx === DQ) { out = out + DQ; } else {
                if (nx === SQ) { out = out + SQ; } else {
                  if (nx === '$') { out = out + '$'; } else { out = out + BS + nx; }
                }
              }
            }
          }
        }
      }
      i = i + 2;
    } else { out = out + ch; i = i + 1; }
  }
  return out;
};
T.envToJSON = function (s) {
  var text = String(s === undefined ? '' : (s === null ? '' : s));
  var SQ = String.fromCharCode(39);
  var DQ = String.fromCharCode(34);
  var obj = {};
  var count = 0;
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i = i + 1) {
    var ln = i + 1;
    var line = lines[i];
    if (line.charAt(line.length - 1) === '\r') line = line.slice(0, -1);
    var t = line.trim();
    if (t === '') continue;
    if (t.charAt(0) === '#') continue;
    if (t.slice(0, 6) === 'export') { if (t.length > 6) { if (t.charCodeAt(6) <= 32) t = t.slice(6).trim(); } }
    var eq = t.indexOf('=');
    if (eq < 0) throw new Error('Line ' + ln + ' has no = (need KEY=value)');
    var key = t.slice(0, eq).trim();
    if (key === '') throw new Error('Line ' + ln + ' has an empty key');
    var kc = key.charCodeAt(0);
    var firstOK = false;
    if (kc === 95) { firstOK = true; } else {
      if (kc >= 65) {
        if (kc <= 90) { firstOK = true; } else {
          if (kc >= 97) { if (kc <= 122) { firstOK = true; } }
        }
      } else {
        if (kc >= 97) { if (kc <= 122) { firstOK = true; } }
      }
    }
    if (firstOK === false) throw new Error('Bad key on line ' + ln + ': ' + key);
    for (var d = 1; d < key.length; d = d + 1) {
      var kd = key.charCodeAt(d);
      var good = false;
      if (kd >= 48) {
        if (kd <= 57) { good = true; } else {
          if (kd >= 65) {
            if (kd <= 90) { good = true; } else {
              if (kd === 95) { good = true; } else {
                if (kd >= 97) { if (kd <= 122) { good = true; } }
              }
            }
          } else {
            if (kd >= 97) { if (kd <= 122) { good = true; } }
          }
        }
      } else {
        if (kd === 46) { good = true; }
      }
      if (good === false) throw new Error('Bad key on line ' + ln + ': ' + key);
    }
    var val = t.slice(eq + 1).trim();
    if (val.length >= 2) {
      var q0 = val.charAt(0);
      var q1 = val.charAt(val.length - 1);
      if (q0 === SQ) { if (q1 === SQ) { val = val.slice(1, -1); } else { throw new Error('Line ' + ln + ' has an unterminated single quote'); } } else {
        if (q0 === DQ) { if (q1 === DQ) { val = T.envUnescape(val.slice(1, -1), ln); } else { throw new Error('Line ' + ln + ' has an unterminated double quote'); } }
      }
    }
    obj[key] = val;
    count = count + 1;
  }
  if (count === 0) throw new Error('No KEY=value pairs found');
  return JSON.stringify(obj, null, 2);
};
/* Fibonacci: exact BigInt sequence, clamped 1..100. Moved from manifest. */
T.fibonacci = function (raw) {
  var n = parseInt(raw, 10);
  if (!(n >= 1)) n = 10;
  if (n > 100) n = 100;
  var out = [];
  var a = 0n, b = 1n;
  for (var i = 0; i < n; i++) { out.push(a); var t = a + b; a = b; b = t; }
  return out.join(", ");
};
/* Fibonacci UI contract: terms option. Moved from the manifest for single source. */
T.fibonacciOpts = function (opts) {
  return T.fibonacci((opts && opts.terms) || "10");
};
/* Loan amortization — fixed-rate schedule simulated to the cent.
   Returns { payment, months, totalPaid, totalInterest, yearly, rows }.
   yearly = [{ year, principal, interest, balance }]; rows = monthly
   [month, payment, principal, interest, balance] as CSV-ready strings.
   Pure math: the loan-calculator custom tool only formats this. */
T.loanSchedule = function (principal, ratePct, years) {
  var P = Number(principal), R = Number(ratePct), Y = Number(years);
  if (!(P > 0) || !isFinite(P)) throw new Error('Principal must be a number above 0');
  if (P > 1e12) throw new Error('Principal is capped at 1,000,000,000,000');
  if (!(R >= 0) || !isFinite(R)) throw new Error('Rate must be 0 or higher');
  if (R > 100) throw new Error('A rate above 100% is not a loan');
  if (!isFinite(Y) || Y !== Math.floor(Y) || !(Y >= 1)) throw new Error('Term must be a whole number of years, 1 or more');
  if (Y > 50) throw new Error('Term is capped at 50 years');
  function r2(x) { return Math.round(x * 100) / 100; }
  var n = Y * 12, r = R / 100 / 12;
  var pay = r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n));
  pay = r2(pay);
  var bal = P, totalInt = 0, month = 0;
  var rows = [], yearly = [], yP = 0, yI = 0;
  while (bal > 0 && month < n + 600) {
    month++;
    var interest = r2(bal * r);
    var princ = r2(pay - interest);
    var thisPay = pay;
    if (month >= n || princ >= bal) {
      princ = r2(bal);
      thisPay = r2(princ + interest);
      bal = 0;
    } else {
      if (!(princ > 0)) throw new Error('Payment does not cover the monthly interest');
      bal = r2(bal - princ);
    }
    totalInt = r2(totalInt + interest);
    yP = r2(yP + princ);
    yI = r2(yI + interest);
    rows.push([month, thisPay.toFixed(2), princ.toFixed(2), interest.toFixed(2), bal.toFixed(2)]);
    if (month % 12 === 0 || bal === 0) {
      yearly.push({ year: Math.ceil(month / 12), principal: yP, interest: yI, balance: bal });
      yP = 0;
      yI = 0;
    }
  }
  if (bal > 0) throw new Error('Schedule did not converge — check the inputs');
  return { payment: pay, months: month, totalPaid: r2(P + totalInt), totalInterest: totalInt, yearly: yearly, rows: rows };
};
/* Tracker sets for the URL cleaner. Standard strips analytics/click IDs;
   aggressive additionally strips affiliate/commerce params (tag, cjevent,
   rakuten ran*, amazon pd_rd_/pf_rd_). Matching is case-insensitive;
   the tool keep-list always wins. */
var CLEAN_PREFIX = ['utm_', 'ref_', 'mc_', 'hsa_', 'vero_'];
var CLEAN_EXACT = { gclid: 1, gbraid: 1, wbraid: 1, dclid: 1, gclsrc: 1, fbclid: 1, msclkid: 1, ircid: 1, igshid: 1, li_fat_id: 1, yclid: 1, twclid: 1, ttclid: 1, mkt_tok: 1, hsctatracking: 1, srsltid: 1, si: 1, ref: 1 };
var AGGR_PREFIX = ['pd_rd_', 'pf_rd_', 'pf_'];
var AGGR_EXACT = { tag: 1, ascsubtag: 1, camp: 1, creative: 1, creativeasin: 1, linkcode: 1, linkid: 1, aff_id: 1, affid: 1, affiliate: 1, cjevent: 1, cjdata: 1, ranmid: 1, raneaid: 1, ransiteid: 1, scid: 1 };
function isTrackerKey(lower, aggressive, keep) {
  if (keep[lower]) return false;
  var i;
  for (i = 0; i < CLEAN_PREFIX.length; i++) { if (lower.slice(0, CLEAN_PREFIX[i].length) === CLEAN_PREFIX[i]) return true; }
  if (CLEAN_EXACT[lower]) return true;
  if (!aggressive) return false;
  for (i = 0; i < AGGR_PREFIX.length; i++) { if (lower.slice(0, AGGR_PREFIX[i].length) === AGGR_PREFIX[i]) return true; }
  return !!AGGR_EXACT[lower];
}
/* URL cleaner: one URL per line, tracker params stripped, survivors
   sorted for a canonical form. Bare domains gain https://; the hash
   is never touched (fragments are app state, not tracking). */
T.cleanURL = function (s, opts) {
  var raw = String(s === undefined || s === null ? '' : s);
  var o = opts || {};
  var aggressive = o.mode === 'aggressive';
  var keep = {};
  String(o.keep || '').split(',').forEach(function (k) {
    var t = k.trim().toLowerCase();
    if (t) keep[t] = 1;
  });
  var lines = raw.split(/\r?\n/);
  var out = [];
  for (var n = 0; n < lines.length; n++) {
    var line = lines[n].trim();
    if (!line) continue;
    var text = line;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) text = 'https://' + text;
    var u;
    try { u = new URL(text); } catch (e) { throw new Error('Line ' + (n + 1) + ' is not a URL — include https://'); }
    var kill = [];
    u.searchParams.forEach(function (v, k) {
      if (isTrackerKey(k.toLowerCase(), aggressive, keep)) kill.push(k);
    });
    kill.forEach(function (k) { u.searchParams.delete(k); });
    var pairs = [];
    u.searchParams.forEach(function (v, k) { pairs.push([k, v]); });
    pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    u.search = '';
    pairs.forEach(function (pr) { u.searchParams.append(pr[0], pr[1]); });
    out.push(u.href);
  }
  if (!out.length) throw new Error('Paste at least one URL — one per line, https:// included');
  return out.join('\n');
};
/* Timezone conversion over the Intl API — no tables, DST correct by
   construction. A wall time resolves to the exact UTC instant in the
   source zone (two-pass offset refine), then renders in the target
   zone. Fall-back repeats take the first occurrence; spring-forward
   gaps land on the nearest valid minute. */
function tzParts(ms, zone) {
  var dtf = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var p = {};
  dtf.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
  return p;
}
T.tzOffsetMinutes = function (ms, zone) {
  var p = tzParts(ms, zone);
  var asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUTC - Number(ms)) / 60000);
};
T.tzConvert = function (input, fromZone, toZone) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(input === undefined || input === null ? '' : input).trim());
  if (!m) throw new Error('Pick a date and time first — format YYYY-MM-DD HH:mm');
  var from = String(fromZone === undefined || fromZone === null ? '' : fromZone).trim();
  var to = String(toZone === undefined || toZone === null ? '' : toZone).trim();
  if (!from) throw new Error('Choose a source zone — try Asia/Tokyo');
  if (!to) throw new Error('Choose a target zone — try UTC');
  var zones = [from, to];
  for (var zi = 0; zi < zones.length; zi++) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: zones[zi] }); }
    catch (e) { throw new Error('Unknown time zone "' + zones[zi] + '" — use an IANA name like Europe/Paris'); }
  }
  var comp = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)];
  if (comp[1] < 1 || comp[1] > 12) throw new Error('Month is out of range in that date');
  if (comp[2] < 1 || comp[2] > 31) throw new Error('Day is out of range in that date');
  if (comp[3] > 23 || comp[4] > 59 || comp[5] > 59) throw new Error('Clock time is out of range in that date');
  var guess = Date.UTC(comp[0], comp[1] - 1, comp[2], comp[3], comp[4], comp[5]);
  var off = T.tzOffsetMinutes(guess, from);
  var utc = guess - off * 60000;
  var off2 = T.tzOffsetMinutes(utc, from);
  if (off2 !== off) utc = guess - off2 * 60000;
  function fmt(ms, zone) {
    var p = tzParts(ms, zone);
    return p.year + '-' + p.month + '-' + p.day + ' ' + ('0' + (Number(p.hour) % 24)).slice(-2) + ':' + p.minute;
  }
  function gmt(min) {
    var s = min < 0 ? '-' : '+';
    var a = Math.abs(min);
    return 'GMT' + s + Math.floor(a / 60) + ':' + ('0' + (a % 60)).slice(-2);
  }
  var oF = T.tzOffsetMinutes(utc, from), oT = T.tzOffsetMinutes(utc, to);
  return {
    fromText: fmt(utc, from), fromZone: from, fromOffset: gmt(oF),
    utcMs: utc, utcISO: new Date(utc).toISOString(), utcText: fmt(utc, 'UTC'),
    toText: fmt(utc, to), toZone: to, toOffset: gmt(oT)
  };
};
/* JSON Schema validator (draft-7 flavor, local subset). Supports $ref
   to local "#/..." pointers (never the network), integer-aware types,
   enum/const, string length+pattern, numeric bounds in boolean and
   numeric exclusive forms, single/tuple items, uniqueItems, contains,
   properties/patternProperties/required/additionalProperties,
   allOf/anyOf/oneOf/not and array- or schema-form dependencies.
   if/then/else and remote $refs are intentionally unsupported. */
function schemaDeepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) { if (!schemaDeepEqual(a[i], b[i])) return false; }
    return true;
  }
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var j = 0; j < ka.length; j++) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[j])) return false;
    if (!schemaDeepEqual(a[ka[j]], b[ka[j]])) return false;
  }
  return true;
}
function schemaTypeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return (isFinite(v) && Math.floor(v) === v) ? 'integer' : 'number';
  return typeof v;
}
function schemaTypeOk(v, want) {
  switch (want) {
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'integer': return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
    case 'number': return typeof v === 'number' && isFinite(v);
    case 'string': return typeof v === 'string';
    case 'boolean': return typeof v === 'boolean';
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: throw new Error('Unknown type "' + want + '" in schema — want string, number, integer, boolean, object, array or null');
  }
}
function schemaPath(base, key) {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return base + '.' + key;
  return base + '[' + JSON.stringify(key) + ']';
}
function schemaResolveRef(ref, root, path) {
  if (ref === '#') return root;
  if (typeof ref !== 'string' || ref.slice(0, 2) !== '#/') throw new Error('Only local refs ("#/...") are supported — ref "' + ref + '" at ' + path + ' would need the network');
  var parts = ref.slice(2).split('/');
  var cur = root;
  for (var i = 0; i < parts.length; i++) {
    var key = parts[i].replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object' || !(key in Object(cur))) throw new Error('Unresolvable ref "' + ref + '" at ' + path);
    cur = cur[key];
  }
  return cur;
}
function schemaCheck(v, sch, path, root, errs, depth) {
  if (depth > 100) throw new Error('Schema too deeply nested at ' + path + ' (possible $ref cycle)');
  if (errs.length > 200) return;
  if (sch === true) return;
  if (sch === false) { errs.push(path + ': forbidden by a false schema'); return; }
  if (sch === null || typeof sch !== 'object' || Array.isArray(sch)) throw new Error('Schema at ' + path + ' must be an object, true or false');
  if (typeof sch.$ref === 'string') {
    schemaCheck(v, schemaResolveRef(sch.$ref, root, path), path, root, errs, depth + 1);
    return;
  }
  function err(msg) { errs.push(path + ': ' + msg); }
  function subPasses(sub) {
    var tmp = [];
    schemaCheck(v, sub, path, root, tmp, depth + 1);
    return tmp.length === 0;
  }
  var i, k;
  if (sch.type !== undefined) {
    var wants = Array.isArray(sch.type) ? sch.type : [sch.type];
    var hit = false;
    for (i = 0; i < wants.length; i++) { if (schemaTypeOk(v, wants[i])) { hit = true; break; } }
    if (!hit) { err('expected ' + wants.join(' or ') + ', got ' + schemaTypeName(v)); return; }
  }
  if (Array.isArray(sch.enum) && !sch.enum.some(function (e) { return schemaDeepEqual(e, v); })) err('not one of the allowed values');
  if (Object.prototype.hasOwnProperty.call(sch, 'const') && !schemaDeepEqual(sch.const, v)) err('does not equal the required constant');
  if (typeof v === 'string') {
    if (sch.minLength !== undefined && v.length < sch.minLength) err('shorter than minLength ' + sch.minLength);
    if (sch.maxLength !== undefined && v.length > sch.maxLength) err('longer than maxLength ' + sch.maxLength);
    if (sch.pattern !== undefined) {
      var re;
      try { re = new RegExp(sch.pattern); }
      catch (e) { throw new Error('Invalid pattern "' + sch.pattern + '" at ' + path); }
      if (!re.test(v)) err('does not match pattern ' + sch.pattern);
    }
  }
  if (typeof v === 'number') {
    if (sch.minimum !== undefined && v < sch.minimum) err('below minimum ' + sch.minimum);
    if (sch.maximum !== undefined && v > sch.maximum) err('above maximum ' + sch.maximum);
    var exMin = sch.exclusiveMinimum, exMax = sch.exclusiveMaximum;
    if (exMin === true && sch.minimum !== undefined && v <= sch.minimum) err('not above exclusive minimum ' + sch.minimum);
    else if (typeof exMin === 'number' && v <= exMin) err('not above exclusive minimum ' + exMin);
    if (exMax === true && sch.maximum !== undefined && v >= sch.maximum) err('not below exclusive maximum ' + sch.maximum);
    else if (typeof exMax === 'number' && v >= exMax) err('not below exclusive maximum ' + exMax);
  }
  if (Array.isArray(v)) {
    if (sch.minItems !== undefined && v.length < sch.minItems) err('fewer than minItems ' + sch.minItems);
    if (sch.maxItems !== undefined && v.length > sch.maxItems) err('more than maxItems ' + sch.maxItems);
    if (sch.uniqueItems) {
      var dup = null;
      for (i = 0; i < v.length && !dup; i++) {
        for (var q = i + 1; q < v.length; q++) {
          if (schemaDeepEqual(v[i], v[q])) { dup = 'items are not unique (indices ' + i + ' and ' + q + ')'; break; }
        }
      }
      if (dup) err(dup);
    }
    if (sch.items !== undefined) {
      if (Array.isArray(sch.items)) {
        for (i = 0; i < v.length; i++) {
          var sub = i < sch.items.length ? sch.items[i] : sch.additionalItems;
          if (sub === undefined || sub === true) continue;
          if (sub === false) { err('extra item at index ' + i + ' is forbidden'); continue; }
          schemaCheck(v[i], sub, path + '[' + i + ']', root, errs, depth + 1);
        }
      } else {
        for (i = 0; i < v.length; i++) schemaCheck(v[i], sch.items, path + '[' + i + ']', root, errs, depth + 1);
      }
    }
    if (sch.contains !== undefined && sch.contains !== true) {
      var found = false;
      for (i = 0; i < v.length && !found; i++) {
        var probe = [];
        schemaCheck(v[i], sch.contains, path + '[' + i + ']', root, probe, depth + 1);
        if (!probe.length) found = true;
      }
      if (!found) err('no item matches contains');
    }
  }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    var keys = Object.keys(v);
    if (sch.minProperties !== undefined && keys.length < sch.minProperties) err('fewer than minProperties ' + sch.minProperties);
    if (sch.maxProperties !== undefined && keys.length > sch.maxProperties) err('more than maxProperties ' + sch.maxProperties);
    if (Array.isArray(sch.required)) {
      sch.required.forEach(function (rk) {
        if (!Object.prototype.hasOwnProperty.call(v, rk)) err('missing required property "' + rk + '"');
      });
    }
    var props = (sch.properties && typeof sch.properties === 'object') ? sch.properties : {};
    var pats = (sch.patternProperties && typeof sch.patternProperties === 'object') ? sch.patternProperties : {};
    var extraOpen = sch.additionalProperties === undefined || sch.additionalProperties === true;
    keys.forEach(function (key) {
      var kp = schemaPath(path, key);
      var named = Object.prototype.hasOwnProperty.call(props, key);
      if (named) schemaCheck(v[key], props[key], kp, root, errs, depth + 1);
      var patHit = false;
      for (var pk in pats) {
        if (!Object.prototype.hasOwnProperty.call(pats, pk)) continue;
        var rx;
        try { rx = new RegExp(pk); }
        catch (e) { throw new Error('Invalid patternProperty "' + pk + '" at ' + path); }
        if (rx.test(key)) { schemaCheck(v[key], pats[pk], kp, root, errs, depth + 1); patHit = true; }
      }
      if (!named && !patHit && !extraOpen) {
        if (sch.additionalProperties === false) err('unexpected property "' + key + '"');
        else schemaCheck(v[key], sch.additionalProperties, kp, root, errs, depth + 1);
      }
    });
  }
  if (Array.isArray(sch.allOf)) sch.allOf.forEach(function (sub) { schemaCheck(v, sub, path, root, errs, depth + 1); });
  if (Array.isArray(sch.anyOf) && !sch.anyOf.some(subPasses)) err('matches none of anyOf');
  if (Array.isArray(sch.oneOf)) {
    var count = 0;
    sch.oneOf.forEach(function (sub) { if (subPasses(sub)) count++; });
    if (count !== 1) err('matches ' + count + ' of oneOf (want exactly 1)');
  }
  if (sch.not !== undefined && subPasses(sch.not)) err('matches the forbidden not schema');
  if (sch.dependencies && typeof sch.dependencies === 'object') {
    Object.keys(sch.dependencies).forEach(function (dk) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return;
      if (!Object.prototype.hasOwnProperty.call(v, dk)) return;
      var dep = sch.dependencies[dk];
      if (Array.isArray(dep)) {
        dep.forEach(function (need) {
          if (!Object.prototype.hasOwnProperty.call(v, need)) err('property "' + dk + '" needs missing property "' + need + '"');
        });
      } else if (dep && typeof dep === 'object') {
        schemaCheck(v, dep, path, root, errs, depth + 1);
      }
    });
  }
}
T.jsonSchemaValidate = function (instText, schemaText) {
  var iv = T.validateJSON(String(instText === undefined || instText === null ? '' : instText));
  if (!iv.valid) throw new Error('Instance is not valid JSON: ' + (iv.error || 'parse error'));
  var sv = T.validateJSON(String(schemaText === undefined || schemaText === null ? '' : schemaText));
  if (!sv.valid) throw new Error('Schema is not valid JSON: ' + (sv.error || 'parse error'));
  var schema = sv.data;
  if (schema !== true && schema !== false && (schema === null || typeof schema !== 'object' || Array.isArray(schema))) {
    throw new Error('Schema must be an object, true or false');
  }
  var errs = [];
  schemaCheck(iv.data, schema, '$', schema, errs, 0);
  if (!errs.length) return 'Valid — the instance conforms to the schema';
  var shown = errs.slice(0, 50);
  if (errs.length > 50) shown.push('… and ' + (errs.length - 50) + ' more errors (first 50 shown)');
  return shown.join('\n');
};
/* Stopwatch display format: milliseconds to HH:MM:SS.cs
   (centiseconds), clamped at zero. Single source for the stopwatch
   tool face, lap splits and countdown readouts. */
T.formatStopwatch = function (ms) {
  if (ms === '' || ms === null || ms === undefined) throw new Error('Give milliseconds as a number');
  var t = Number(ms);
  if (!isFinite(t)) throw new Error('Give milliseconds as a number');
  if (t < 0) t = 0;
  t = Math.floor(t);
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  var cs = Math.floor((t % 1000) / 10);
  var s = Math.floor(t / 1000) % 60;
  var m = Math.floor(t / 60000) % 60;
  var h = Math.floor(t / 3600000);
  return (h < 10 ? '0' + h : '' + h) + ':' + p2(m) + ':' + p2(s) + '.' + p2(cs);
};
/* Aspect-preserving fit: scale w×h so the long side lands on max
   (never upscale). Returns { w, h, scaled }. Single source for the
   image-compressor tool sizing. */
T.fitDimensions = function (w, h, max) {
  var W = Number(w), H = Number(h), M = Number(max);
  if (!isFinite(W) || !isFinite(H) || !(W > 0) || !(H > 0)) throw new Error('Image has no readable dimensions');
  if (!isFinite(M) || !(M >= 16)) throw new Error('Max side must be 16px or more');
  if (W <= M && H <= M) return { w: Math.round(W), h: Math.round(H), scaled: false };
  var k = M / Math.max(W, H);
  return { w: Math.max(1, Math.round(W * k)), h: Math.max(1, Math.round(H * k)), scaled: true };
};
/* CSV normalizer: any supported delimiter in, canonical comma+LF out.
   BOM stripped, CRLF folded, blank records dropped, ragged rows padded
   to the widest row, minimal RFC 4180 quoting on emit. */
T.csvNormalize = function (s, opts) {
  var o = opts || {};
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s === undefined || s === null ? '' : s).replace(/^\uFEFF/, '');
  var lines = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; });
  if (!lines.length) throw new Error('Paste delimited rows first \u2014 one record per line');
  if (d === null) d = T.detectDelimChar(lines.slice(0, 10)) || ',';
  var rows = T.parseCSV(raw, d);
  var trim = o.trim === true || o.trim === 'true';
  if (trim) rows = rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  rows = rows.filter(function (r) { return !r.every(function (c) { return c === ''; }); });
  if (!rows.length) throw new Error('Paste delimited rows first \u2014 one record per line');
  var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  function cell(v) {
    v = String(v === undefined || v === null ? '' : v);
    return (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  return rows.map(function (r) {
    while (r.length < cols) r.push('');
    return r.map(cell).join(',');
  }).join('\n');
};
/* JSONL sorter: one-JSON-per-line docs sorted by key fields (or the whole
   doc when key is empty). Blank lines skip; failures carry the line number.
   Type-aware compare - numbers numeric, date strings chronological, other
   strings lexicographic, objects by canonical form; ties keep input order. */
T.jsonlSort = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [];
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) throw new Error('Line ' + (n + 1) + ': ' + (v.error || 'Invalid JSON'));
    docs.push({ d: v.data, i: docs.length });
  }
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON value per line');
  var fields = String(o.key === undefined || o.key === null ? '' : o.key).split(',').map(function (k) { return k.trim(); }).filter(Boolean);
  function isNumStr(x) { return typeof x === 'string' && x.trim() !== '' && isFinite(Number(x)); }
  function rank(x) {
    if (x === null || x === undefined) return 0;
    var t = typeof x;
    if (t === 'boolean') return 1;
    if (t === 'number') return 2;
    if (t === 'string') return 3;
    return 4;
  }
  function cmpVals(a, b) {
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : (a ? 1 : -1);
    if (typeof a === 'string' && typeof b === 'string') {
      if (isNumStr(a) && isNumStr(b)) return Number(a) - Number(b);
      var da = Date.parse(a), db = Date.parse(b);
      if (isFinite(da) && isFinite(db)) return da - db;
      return a < b ? -1 : a > b ? 1 : 0;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      for (var k = 0; k < Math.min(a.length, b.length); k++) {
        var c = cmpVals(a[k], b[k]);
        if (c !== 0) return c;
      }
      return a.length - b.length;
    }
    var ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    var ca = T.canonJSON(a), cb = T.canonJSON(b);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  }
  docs.forEach(function (e) {
    var d = e.d;
    if (!fields.length) { e.k = d; return; }
    if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error('Key fields need JSON objects \u2014 got ' + T.canonJSON(d).slice(0, 40));
    var sub = fields.map(function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; });
    e.k = sub.length === 1 ? sub[0] : sub;
  });
  var desc = String(o.order || 'asc') === 'desc';
  docs.sort(function (x, y) {
    var c = cmpVals(x.k, y.k);
    if (c !== 0) return desc ? -c : c;
    return x.i - y.i;
  });
  return docs.map(function (e) { return JSON.stringify(e.d); }).join('\n');
};
/* PII redactor: mask emails, phone numbers, IP addresses and Luhn-checked
   card numbers in place with labeled tokens, then append a redaction count.
   Order matters - emails, IPs and cards first so the broad phone pattern
   never bites a fragment; digit/dot neighbors veto phone and IP matches.
   Fresh RegExp copies dodge the shared /g lastIndex hazard. */
T.redactPII = function (s, opts) {
  var o = opts || {};
  var raw = String(s === undefined || s === null ? '' : s);
  if (!raw.trim()) throw new Error('Paste text first \u2014 emails, phone numbers, IPs or card numbers to redact');
  function on(v, fb) {
    if (v === undefined || v === null || v === '') return fb;
    return v === true || v === 'true' || v === 'on' || v === '1';
  }
  var useEmail = on(o.email, true), usePhone = on(o.phone, true);
  var useIP = on(o.ip, true), useCard = on(o.card, true);
  var ce = 0, cp = 0, ci = 0, cc = 0;
  var out = raw;
  function isDigit(ch) { return ch >= '0' && ch <= '9'; }
  function luhn(ds) {
    var sum = 0, dbl = false;
    for (var i = ds.length - 1; i >= 0; i--) {
      var d = ds.charCodeAt(i) - 48;
      if (d < 0 || d > 9) return false;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return ds.length >= 13 && ds.length <= 19 && sum % 10 === 0;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  if (useEmail) {
    var emailRe = new RegExp(EMAIL_RE.source, 'g');
    out = out.replace(emailRe, function () { ce++; return '[EMAIL]'; });
  }
  if (useIP) {
    var ipRe = new RegExp(IP_RE.source, 'g');
    out = out.replace(ipRe, function (m, off, full) {
      var before = off > 0 ? full.charAt(off - 1) : '';
      var after = off + m.length < full.length ? full.charAt(off + m.length) : '';
      var beforePrev = off >= 2 ? full.charAt(off - 2) : '';
      var afterNext = off + m.length + 1 < full.length ? full.charAt(off + m.length + 1) : '';
      if (isDigit(before) || isDigit(after)) return m;
      if (before === '.' && isDigit(beforePrev)) return m;
      if (after === '.' && isDigit(afterNext)) return m;
      var valid = m.split('.').every(function (n) { return parseInt(n, 10) >= 0 && parseInt(n, 10) <= 255; });
      if (!valid) return m;
      ci++;
      return '[IP]';
    });
  }
  if (useCard) {
    var cardRe = /\b\d(?:[ -]?\d){12,18}\b/g;
    out = out.replace(cardRe, function (m) {
      if (!luhn(m.replace(/[ -]/g, ''))) return m;
      cc++;
      return '[CARD]';
    });
  }
  if (usePhone) {
    var phoneRe = new RegExp(PHONE_RE.source, 'g');
    out = out.replace(phoneRe, function (m, off, full) {
      var before = off > 0 ? full.charAt(off - 1) : '';
      var after = off + m.length < full.length ? full.charAt(off + m.length) : '';
      if (isDigit(before) || isDigit(after)) return m;
      cp++;
      return '[PHONE]';
    });
  }
  return out + '\n\nRedacted: ' + plural(ce, 'email', 'emails') + ', ' + plural(cp, 'phone', 'phones') + ', ' + plural(ci, 'IP', 'IPs') + ', ' + plural(cc, 'card', 'cards');
};
/* INI to JSON: sections map to objects, pre-section keys stay top-level.
   Full-line ; and # comments plus blanks skip; inline semicolons are data.
   Duplicate keys throw with line numbers; repeat sections merge. Prototype
   pollution keys are refused, mirroring the TOML parser guard. */
T.iniToJSON = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Paste INI first');
  function bad(ln, msg) { throw new Error('Line ' + ln + ': ' + msg); }
  function forbid(k, ln) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') bad(ln, 'Forbidden key ' + '"' + k + '"');
  }
  function unquote(v) {
    if (v.length >= 2) {
      var q0 = v.charAt(0), q1 = v.charAt(v.length - 1);
      if ((q0 === '"' && q1 === '"') || (q0 === String.fromCharCode(39) && q1 === String.fromCharCode(39))) return v.slice(1, -1);
    }
    return v;
  }
  var obj = {};
  var cur = obj, curName = '';
  var count = 0;
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var ln = i + 1;
    var line = lines[i];
    if (line.charAt(line.length - 1) === '\r') line = line.slice(0, -1);
    var t = line.trim();
    if (t === '' || t.charAt(0) === ';' || t.charAt(0) === '#') continue;
    if (t.charAt(0) === '[') {
      if (t.charAt(t.length - 1) !== ']') bad(ln, 'Unterminated section header');
      var name = t.slice(1, -1).trim();
      if (!name) bad(ln, 'Empty section name');
      forbid(name, ln);
      if (!Object.prototype.hasOwnProperty.call(obj, name)) obj[name] = {};
      var tgt = obj[name];
      if (tgt === null || typeof tgt !== 'object' || Array.isArray(tgt)) bad(ln, 'Section clashes with key ' + '"' + name + '"');
      cur = tgt;
      curName = name;
      continue;
    }
    var eq = t.indexOf('=');
    var col = t.indexOf(':');
    var sep = eq >= 0 && col >= 0 ? Math.min(eq, col) : Math.max(eq, col);
    if (sep < 0) bad(ln, 'Expected KEY=value' + (curName ? ' in [' + curName + ']' : ''));
    var key = t.slice(0, sep).trim();
    if (!key) bad(ln, 'Empty key');
    forbid(key, ln);
    if (Object.prototype.hasOwnProperty.call(cur, key)) bad(ln, 'Duplicate key ' + '"' + key + '"' + (curName ? ' in [' + curName + ']' : ''));
    cur[key] = unquote(t.slice(sep + 1).trim());
    count++;
  }
  if (!count) throw new Error('No keys found - need KEY=value lines');
  return JSON.stringify(obj, null, 2);
};
/* Dependency-free XML tree parser: comments, PIs and doctypes skip, CDATA
   folds into text, entities decoded. Strict about mismatches, stray closers,
   bare ampersands and unknown entities so bad XML throws with context.
   Null-prototype maps keep a <__proto__> tag from polluting the result.
   Shared single source behind XML to JSON and XML to YAML. */
T.xmlParseTree = function (s) {
  var text = String(s === undefined || s === null ? '' : s);
  if (!text.trim()) throw new Error('Paste XML first \u2014 a declaration, element or fragment');
  function unescapeEntities(chunk) {
    return chunk.replace(/&(#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;|[\s\S]|$)/g, function (m, ent) {
      if (!ent) throw new Error('Bare & at end of input \u2014 escape it as &amp;');
      if (ent.charAt(ent.length - 1) !== ';') throw new Error('Bare & near ' + JSON.stringify(ent.slice(0, 12)) + ' \u2014 escape it as &amp;');
      var body = ent.slice(0, -1);
      if (body.charAt(0) === '#') {
        var hex = body.charAt(1) === 'x';
        var cp = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        if (!isFinite(cp) || cp < 1 || cp > 1114111 || (cp >= 55296 && cp <= 57343)) throw new Error('Bad character reference &' + body + ';');
        return cp > 65535 ? String.fromCharCode(55296 + ((cp - 65536) >> 10), 56320 + ((cp - 65536) & 1023)) : String.fromCharCode(cp);
      }
      if (body === 'amp') return '&';
      if (body === 'lt') return '<';
      if (body === 'gt') return '>';
      if (body === 'quot') return '"';
      if (body === 'apos') return String.fromCharCode(39);
      throw new Error('Unknown entity &' + body + ';');
    });
  }
  function parseTag(v) {
    var close = v.charAt(1) === '/';
    var body = v.slice(close ? 2 : 1, v.length - 1).trim();
    var selfClose = false;
    if (!close && body.charAt(body.length - 1) === '/') { selfClose = true; body = body.slice(0, -1).trim(); }
    var m = /^[A-Za-z_][\w:.-]*/.exec(body);
    if (!m) throw new Error('Bad tag ' + v.slice(0, 24));
    var name = m[0], rest = body.slice(name.length), attrs = Object.create(null);
    var am = /([A-Za-z_][\w:.-]*)\s*=\s*("[^"><]*"|'[^'<>]*')/g;
    var last = 0, a;
    while ((a = am.exec(rest)) !== null) {
      if (rest.slice(last, a.index).trim()) throw new Error('Bad attribute near ' + JSON.stringify(rest.slice(last, last + 16)) + ' in <' + name + '>');
      if (Object.prototype.hasOwnProperty.call(attrs, a[1])) throw new Error('Duplicate attribute "' + a[1] + '" in <' + name + '>');
      attrs[a[1]] = unescapeEntities(a[2].slice(1, -1));
      last = a.index + a[0].length;
    }
    if (rest.slice(last).trim()) throw new Error('Bad attribute near ' + JSON.stringify(rest.slice(last, last + 16)) + ' in <' + name + '>');
    return { name: name, attrs: attrs, close: close, selfClose: selfClose };
  }
  var root = null, stack = [];
  function top() { return stack[stack.length - 1]; }
  function pushText(raw) {
    var seg = unescapeEntities(raw).replace(/\s+/g, ' ').trim();
    if (!seg) return;
    if (!stack.length) throw new Error('Text outside the root element (near ' + JSON.stringify(seg.slice(0, 24)) + ')');
    top().chunks.push(seg);
  }
  var i = 0, n = text.length;
  while (i < n) {
    var lt = text.indexOf('<', i);
    if (lt < 0) { pushText(text.slice(i)); break; }
    if (lt > i) pushText(text.slice(i, lt));
    if (text.slice(lt, lt + 4) === '<!--') {
      var end = text.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('Unterminated comment');
      i = end + 3; continue;
    }
    if (text.slice(lt, lt + 9) === '<![CDATA[') {
      var ce = text.indexOf(']]>', lt + 9);
      if (ce < 0) throw new Error('Unterminated CDATA section');
      pushText(text.slice(lt + 9, ce));
      i = ce + 3; continue;
    }
    if (text.slice(lt, lt + 2) === '<?') {
      var pe = text.indexOf('?>', lt + 2);
      if (pe < 0) throw new Error('Unterminated processing instruction');
      i = pe + 2; continue;
    }
    if (text.slice(lt, lt + 2) === '<!') {
      var de = text.indexOf('>', lt + 2);
      if (de < 0) throw new Error('Unterminated declaration');
      i = de + 1; continue;
    }
    var gt = text.indexOf('>', lt + 1);
    if (gt < 0) throw new Error('Unterminated tag');
    var tag = parseTag(text.slice(lt, gt + 1));
    if (tag.close) {
      var done = stack.pop();
      if (!done) throw new Error('Stray closing tag </' + tag.name + '> \u2014 nothing is open');
      if (done.name !== tag.name) throw new Error('Mismatched tag: expected </' + done.name + '> but found </' + tag.name + '>');
      if (!stack.length) {
        if (root) throw new Error('Multiple root elements');
        root = done;
      }
    } else if (tag.selfClose) {
      var leaf = { name: tag.name, attrs: tag.attrs, kids: [], chunks: [] };
      if (stack.length) top().kids.push(leaf);
      else { if (root) throw new Error('Multiple root elements'); root = leaf; }
    } else {
      if (!stack.length && root) throw new Error('Multiple root elements');
      var node = { name: tag.name, attrs: tag.attrs, kids: [], chunks: [] };
      if (stack.length) top().kids.push(node);
      stack.push(node);
    }
    i = gt + 1;
  }
  if (stack.length) throw new Error('Unclosed tag <' + stack[stack.length - 1].name + '> \u2014 missing closing tag');
  if (!root) throw new Error('No root element found');
  return root;
};
/* XML tree to value: attributes as @-keys, repeats as arrays, bare text
   for attr-less leafless elements, #text when mixed. Mirrors the historic
   DOM-walk contract so XML to JSON output is unchanged. */
T.xmlTreeToValue = function (node) {
  var out = Object.create(null), i;
  var anames = Object.keys(node.attrs);
  for (i = 0; i < anames.length; i++) out['@' + anames[i]] = node.attrs[anames[i]];
  var text = node.chunks.join(' ');
  var groups = Object.create(null), order = [];
  node.kids.forEach(function (k) {
    var v = T.xmlTreeToValue(k);
    if (!Object.prototype.hasOwnProperty.call(groups, k.name)) { groups[k.name] = []; order.push(k.name); }
    groups[k.name].push(v);
  });
  if (!anames.length && !order.length) return text;
  if (text) out['#text'] = text;
  order.forEach(function (k) { out[k] = groups[k].length > 1 ? groups[k] : groups[k][0]; });
  return out;
};
/* XML document to JSON value ({ root: ... }), pretty JSON doc, and YAML doc.
   YAML composes the canonical JSON emitter, so quoting stays single-sourced. */
T.xmlToJsonValue = function (s) {
  var t = T.xmlParseTree(s);
  var res = Object.create(null);
  res[t.name] = T.xmlTreeToValue(t);
  return res;
};
T.xmlToJsonDoc = function (s) { return JSON.stringify(T.xmlToJsonValue(s), null, 2); };
T.xmlToYAML = function (s) { return T.jsonToYAML(JSON.stringify(T.xmlToJsonValue(s))); };
/* XML to TOML: parse once with the shared dependency-free XML parser,
   emit with the canonical JSON-to-TOML emitter (attributes as @-keys,
   repeats as arrays, empty elements as empty strings). */
T.xmlToTOML = function (s) { return T.jsonToTOML(T.xmlToJsonDoc(s)); };
/* YAML to XML: parse once with the YAML core, emit with the canonical JSON-to-XML emitter (maps nest, sequences repeat as siblings, nulls self-close). */
T.yamlToXML = function (s) { if (!String(s).trim()) throw new Error('Enter YAML to convert'); return T.jsonToXML(T.yamlToJSON(s)); };
/* TOML to XML: parse once with the TOML core, emit with the canonical JSON-to-XML emitter (tables nest, arrays repeat as siblings). */
T.tomlToXML = function (s) { return T.jsonToXML(T.tomlToJSON(s)); };
/* CSV to XML: parse once with the RFC 4180 CSV core (auto delimiter, headers as keys), emit with the canonical JSON-to-XML emitter (rows repeat as siblings). */
/* CSV to JSONL: parse once with the RFC 4180 CSV core (auto delimiter, headers as keys), emit one compact JSON object per line for streaming and logging pipelines. */
T.csvToJSONL = function (s, opts) { var arr = JSON.parse(T.csvToJSON(s, opts)); if (!arr.length) throw new Error('CSV has no data rows \u2014 need a header plus at least one record'); return arr.map(function (r) { return JSON.stringify(r); }).join('\n'); };
T.csvToXML = function (s, opts) { return T.jsonToXML(T.csvToJSON(s, opts)); };
/* CSV to TOML: parse once with the RFC 4180 CSV core (auto delimiter, headers as keys), emit rows as [[docs]] tables since TOML has no bare record streams. */
T.csvToTOML = function (s, opts) { return T.jsonToTOML(JSON.stringify({ docs: JSON.parse(T.csvToJSON(s, opts)) })); };
/* CSV to YAML: parse once with the RFC 4180 CSV core (auto delimiter, headers as keys), emit with the canonical JSON-to-YAML emitter (rows as sequences). */
/* CSV to Schema: infer a draft-07 array schema from delimited rows \u2014 headers become properties, column types from non-empty cells, required where no gaps, validator-ready for csvToJSON output. */
T.csvToSchema = function (s, opts) {
  var o = opts || {};
  var n = parseInt(o.indent || '2', 10);
  if (isNaN(n) || n < 1 || n > 8) n = 2;
  if (!String(s).trim()) throw new Error('Enter CSV to convert');
  var DELIMS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  var d = Object.prototype.hasOwnProperty.call(DELIMS, o.delimiter) ? DELIMS[o.delimiter] : null;
  var raw = String(s).replace(/^\uFEFF/, '');
  var probe = raw.split(/\r?\n/).filter(function (ln) { return ln.trim() !== ''; }).slice(0, 10);
  if (!probe.length) throw new Error('Enter CSV to convert');
  if (d === null) d = T.detectDelimChar(probe) || ',';
  var rows = T.parseCSV(s, d);
  if (!rows.length) throw new Error('Enter CSV to convert');
  if (rows.length < 2) throw new Error('Need a header row plus at least one data row');
  var seen = {};
  function nameCol(name) {
    if (seen[name]) { seen[name]++; return name + '_' + seen[name]; }
    seen[name] = 1;
    return name;
  }
  var headers = rows[0].map(function (h) { return nameCol(h === '' ? '(unnamed)' : h); });
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, headers.length);
  for (var ci = headers.length; ci < width; ci++) headers.push(nameCol('(extra_' + (ci + 1) + ')'));
  var body = rows.slice(1);
  function colType(c) {
    var vals = body.map(function (r) { return c < r.length ? r[c] : ''; }).filter(function (v) { return String(v).trim() !== ''; });
    if (!vals.length) return { type: 'string' };
    function isInt(v) { return /^[+-]?\d+$/.test(String(v).trim()); }
    function isNum(v) { var x = Number(v); return String(v).trim() !== '' && isFinite(x); }
    function isBool(v) { var x = String(v).trim().toLowerCase(); return x === 'true' || x === 'false'; }
    if (vals.every(isInt)) return { type: 'integer' };
    if (vals.every(isNum)) return { type: 'number' };
    if (vals.every(isBool)) return { type: 'boolean' };
    return { type: 'string' };
  }
  var props = {}, req = [];
  headers.forEach(function (h, c) {
    props[h] = colType(c);
    var full = body.every(function (r) { return String(c < r.length ? r[c] : '').trim() !== ''; });
    if (full) req.push(h);
  });
  var row = { type: 'object', properties: props };
  if (req.length) row.required = req;
  var ordered = {};
  ordered.$schema = 'http://json-schema.org/draft-07/schema#';
  ordered.type = 'array';
  ordered.items = row;
  return JSON.stringify(ordered, null, n);
};
T.csvToYAML = function (s, opts) { return T.jsonToYAML(T.csvToJSON(s, opts)); };
/* XML to CSV: parse once with the shared XML parser, unwrap the first repeating group to rows (single records stay one row), emit with the canonical JSON-to-CSV core. */
/* XML to Schema: parse once with the shared dependency-free XML parser, infer with the canonical JSON-to-Schema core (attributes as @-keys, repeats as arrays, leaf values stay strings since XML carries no scalar types). */
T.xmlToSchema = function (s, opts) { return T.jsonToSchema(T.xmlToJsonDoc(s), opts); };
T.xmlToCSV = function (s, opts) { var v = T.xmlToJsonValue(s); var ks = Object.keys(v); var root = v[ks[0]]; var rows; if (Array.isArray(root)) rows = root; else if (root !== null && typeof root === 'object') { var found = null; Object.keys(root).forEach(function (k) { if (!found && Array.isArray(root[k])) found = root[k]; }); rows = found || [root]; } else throw new Error('XML has no tabular rows \u2014 need repeating elements'); return T.jsonToCSV(JSON.stringify(rows), opts); };
/* INI to XML: parse once with the INI core (sections as objects, line-numbered errors), emit with the canonical JSON-to-XML emitter. */
T.iniToXML = function (s) { return T.jsonToXML(T.iniToJSON(s)); };
/* ENV to XML: parse once with the dotenv core (export prefixes, line-numbered key errors), emit with the canonical JSON-to-XML emitter. */
T.envToXML = function (s) { return T.jsonToXML(T.envToJSON(s)); };
/* JSONL to XML: validate one JSON value per line (line-numbered errors), emit the doc array with the canonical JSON-to-XML emitter (docs repeat as siblings). */
/* JSONL to Schema: validate one JSON value per line (line-numbered errors), infer the doc array with the canonical JSON-to-Schema core (mixed shapes merge to anyOf). */
T.jsonlToSchema = function (s, opts) { return T.jsonToSchema(T.jsonlToJSON(s), opts); };
T.jsonlToXML = function (s) { return T.jsonToXML(T.jsonlToJSON(s)); };
/* JSONL to YAML: validate one JSON value per line (line-numbered errors), emit the doc array with the canonical JSON-to-YAML emitter (docs as sequences). */
T.jsonlToYAML = function (s) { return T.jsonToYAML(T.jsonlToJSON(s)); };
/* JSONL to TOML: validate one JSON value per line (line-numbered errors); a lone object emits bare keys, several docs wrap as [[docs]] tables since TOML has no top-level arrays. */
T.jsonlToTOML = function (s) { var arr = JSON.parse(T.jsonlToJSON(s)); if (arr.length === 1 && arr[0] !== null && typeof arr[0] === 'object' && !Array.isArray(arr[0])) return T.jsonToTOML(JSON.stringify(arr[0])); return T.jsonToTOML(JSON.stringify({ docs: arr })); };
/* Markdown table to XML: pipe table to CSV rows, CSV rows to header-keyed records, records to sibling XML elements (delimiter shared). */
/* Markdown to Schema: pipe table to CSV rows, CSV rows to a draft-07 array schema (headers as properties, column types detected, required where no gaps, delimiter shared). */
T.markdownToSchema = function (s, opts) { return T.csvToSchema(T.markdownToCSV(s, opts), opts); };
/* Markdown to JSONL: pipe table to CSV rows with the shared table core, one compact object per line with the CSV-to-JSONL core (surrounding prose ignored, delimiter shared). */
T.markdownToJSONL = function (s, opts) { return T.csvToJSONL(T.markdownToCSV(s, opts), opts); };
T.markdownToXML = function (s, opts) { return T.jsonToXML(T.csvToJSON(T.markdownToCSV(s, opts), opts)); };
/* Markdown table to JSON: pipe table to CSV rows, CSV rows to header-keyed records, records pretty-printed (delimiter shared). */
T.markdownToJSON = function (s, opts) { return T.csvToJSON(T.markdownToCSV(s, opts), opts); };
/* Markdown table to TOML: pipe table to CSV rows, CSV rows to header-keyed records, records as [[docs]] tables (delimiter shared). */
T.markdownToTOML = function (s, opts) { return T.csvToTOML(T.markdownToCSV(s, opts), opts); };
/* Markdown table to YAML: pipe table to CSV rows, CSV rows to header-keyed records, records as sequences (delimiter shared). */
T.markdownToYAML = function (s, opts) { return T.jsonToYAML(T.csvToJSON(T.markdownToCSV(s, opts), opts)); };
/* XML to Markdown: parse once with the shared XML parser, unwrap the first repeating group to rows (single records stay one row), emit pipe tables with the canonical JSONL-to-Markdown core. */
/* XML to JSONL: unwrap repeats to CSV rows with the shared XML core, emit one compact object per line with the CSV-to-JSONL core (delimiter shared, single records stay one line). */
T.xmlToJSONL = function (s, opts) { return T.csvToJSONL(T.xmlToCSV(s, opts), opts); };
T.xmlToMarkdown = function (s, opts) { var v = T.xmlToJsonValue(s); var ks = Object.keys(v); var root = v[ks[0]]; var rows; if (Array.isArray(root)) rows = root; else if (root !== null && typeof root === 'object') { var found = null; Object.keys(root).forEach(function (k) { if (!found && Array.isArray(root[k])) found = root[k]; }); rows = found || [root]; } else throw new Error('XML has no tabular rows \u2014 need repeating elements'); return T.jsonlToMarkdown(rows.map(function (r) { return JSON.stringify(r); }).join('\n'), opts); };

/* INI to Markdown: parse sections to a single object, bridge through one compact JSON line, emit pipe tables with the canonical JSONL-to-Markdown core (nested sections flatten to dotted columns). */
/* INI to JSONL: sections to CSV rows with the shared INI core, one compact object per line with the CSV-to-JSONL core (line-numbered errors, delimiter shared). */
T.iniToJSONL = function (s, opts) { return T.csvToJSONL(T.iniToCSV(s, opts), opts); };
T.iniToMarkdown = function (s, opts) { return T.jsonlToMarkdown(JSON.stringify(JSON.parse(T.iniToJSON(s))), opts); };
/* INI to CSV: parse once with the INI core (sections as objects, line-numbered errors), emit with the canonical JSON-to-CSV core (sections flatten to dotted columns, delimiter shared). */
/* INI to Schema: parse once with the shared INI core (line-numbered errors), infer with the canonical JSON-to-Schema core (sections as objects, values stay strings since INI carries no scalar types). */
T.iniToSchema = function (s, opts) { return T.jsonToSchema(T.iniToJSON(s), opts); };
T.iniToCSV = function (s, opts) { return T.jsonToCSV(T.iniToJSON(s), opts); };
/* INI to TOML: parse once with the INI core (sections as objects, line-numbered errors), emit with the canonical JSON-to-TOML emitter (sections as tables). */
T.iniToTOML = function (s) { return T.jsonToTOML(T.iniToJSON(s)); };
/* INI to YAML: parse once with the INI core (sections as objects, line-numbered errors), emit with the canonical JSON-to-YAML emitter (sections as nested maps). */
T.iniToYAML = function (s) { return T.jsonToYAML(T.iniToJSON(s)); };
/* ENV to Markdown: parse dotenv to one flat object, bridge through one compact JSON line, emit pipe tables with the canonical JSONL-to-Markdown core. */
T.envToMarkdown = function (s, opts) { return T.jsonlToMarkdown(JSON.stringify(JSON.parse(T.envToJSON(s))), opts); };
/* ENV to CSV: parse once with the dotenv core (export prefixes, line-numbered key errors), emit with the canonical JSON-to-CSV core (keys become columns, single row). */
/* ENV to JSONL: dotenv keys to one CSV row with the shared dotenv core, one compact object line with the CSV-to-JSONL core (export prefixes stripped, line-numbered key errors). */
T.envToJSONL = function (s, opts) { return T.csvToJSONL(T.envToCSV(s, opts), opts); };
T.envToCSV = function (s, opts) { return T.jsonToCSV(T.envToJSON(s), opts); };
/* ENV to TOML: parse once with the dotenv core (export prefixes, line-numbered key errors), emit with the canonical JSON-to-TOML emitter (keys as bare pairs). */
T.envToTOML = function (s) { return T.jsonToTOML(T.envToJSON(s)); };
/* ENV to YAML: parse once with the dotenv core (export prefixes, line-numbered key errors), emit with the canonical JSON-to-YAML emitter (keys as maps). */
/* ENV to Schema: parse once with the shared dotenv core (export prefixes, line-numbered key errors), infer with the canonical JSON-to-Schema core (keys as properties, values stay strings since dotenv carries no scalar types). */
T.envToSchema = function (s, opts) { return T.jsonToSchema(T.envToJSON(s), opts); };
T.envToYAML = function (s) { return T.jsonToYAML(T.envToJSON(s)); };
/* TOML to Markdown: parse tables to one object, bridge through one compact JSON line, emit pipe tables with the canonical JSONL-to-Markdown core (nested tables flatten to dotted columns). */
/* TOML to JSONL: tables to CSV rows with the shared TOML core, one compact object per line with the CSV-to-JSONL core (line-numbered errors, delimiter shared). */
T.tomlToJSONL = function (s, opts) { return T.csvToJSONL(T.tomlToCSV(s, opts), opts); };
T.tomlToMarkdown = function (s, opts) { return T.jsonlToMarkdown(JSON.stringify(JSON.parse(T.tomlToJSON(s))), opts); };
/* TOML to CSV: parse once with the TOML core (line-numbered errors), emit with the canonical JSON-to-CSV core (tables flatten to dotted columns, delimiter shared). */
/* TOML to Schema: parse once with the shared TOML core (line-numbered errors), infer with the canonical JSON-to-Schema core so table types and required keys stay single-sourced. */
T.tomlToSchema = function (s, opts) { return T.jsonToSchema(T.tomlToJSON(s), opts); };
T.tomlToCSV = function (s, opts) { return T.jsonToCSV(T.tomlToJSON(s), opts); };
/* YAML to Markdown: parse to maps or sequences (line-numbered errors), unwrap sequences to one compact JSON line each, emit pipe tables with the canonical JSONL-to-Markdown core. */
/* YAML to JSONL: maps or sequences to CSV rows with the shared YAML core, one compact object per line with the CSV-to-JSONL core (line-numbered errors, delimiter shared). */
T.yamlToJSONL = function (s, opts) { return T.csvToJSONL(T.yamlToCSV(s, opts), opts); };
T.yamlToMarkdown = function (s, opts) { if (!String(s).trim()) throw new Error('Enter YAML to convert'); var v = JSON.parse(T.yamlToJSON(s)); var docs = Array.isArray(v) ? v : [v]; if (!docs.length) throw new Error('YAML has no tabular rows \u2014 need maps with keys'); for (var i = 0; i < docs.length; i++) { var d = docs[i]; if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error('YAML has no tabular rows \u2014 need maps with keys'); } return T.jsonlToMarkdown(docs.map(function (r) { return JSON.stringify(r); }).join('\n'), opts); };
/* YAML to CSV: parse once with the YAML core (line-numbered errors), emit with the canonical JSON-to-CSV core (sequences become rows, nested flatten, delimiter shared). */
/* YAML to Schema: parse once with the shared YAML core (line-numbered errors), infer with the canonical JSON-to-Schema core so nested types and required keys stay single-sourced. */
T.yamlToSchema = function (s, opts) { if (!String(s).trim()) throw new Error('Enter YAML to convert'); return T.jsonToSchema(T.yamlToJSON(s), opts); };
T.yamlToCSV = function (s, opts) { if (!String(s).trim()) throw new Error('Enter YAML to convert'); return T.jsonToCSV(T.yamlToJSON(s), opts); };
/* JSON to Markdown: parse objects or arrays (single row or per-element rows), bridge through compact JSON lines, emit pipe tables with the canonical JSONL-to-Markdown core. */
T.jsonToMarkdown = function (s, opts) { if (!String(s).trim()) throw new Error('Enter JSON to convert'); var v; try { v = JSON.parse(s); } catch (e) { void e; throw new Error('Invalid JSON \u2014 check commas, quotes and brackets'); } var docs = Array.isArray(v) ? v : [v]; if (!docs.length) throw new Error('JSON has no tabular rows \u2014 need objects with keys'); for (var i = 0; i < docs.length; i++) { var d = docs[i]; if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error('JSON has no tabular rows \u2014 need objects with keys'); } return T.jsonlToMarkdown(docs.map(function (r) { return JSON.stringify(r); }).join('\n'), opts); };
/* JSON to Schema: infer a draft-07 schema from example JSON \u2014 nested types, merged array items via deep-equal, required keys, validator-ready output. */
T.jsonToSchema = function (s, opts) {
  var o = opts || {};
  var n = parseInt(o.indent || '2', 10);
  if (isNaN(n) || n < 1 || n > 8) n = 2;
  if (!String(s).trim()) throw new Error('Enter JSON to convert');
  var v = T.validateJSON(s);
  if (!v.valid) throw new Error('Invalid JSON \u2014 ' + (v.error || 'check commas, quotes and brackets'));
  function infer(val) {
    if (val === null) return { type: 'null' };
    if (Array.isArray(val)) {
      if (!val.length) return { type: 'array', items: {} };
      var subs = val.map(infer);
      var uniq = [];
      subs.forEach(function (x) { if (!uniq.some(function (u) { return schemaDeepEqual(u, x); })) uniq.push(x); });
      return uniq.length === 1 ? { type: 'array', items: uniq[0] } : { type: 'array', items: { anyOf: uniq } };
    }
    if (typeof val === 'object') {
      var props = {}, req = [];
      Object.keys(val).forEach(function (k) { props[k] = infer(val[k]); req.push(k); });
      var sch = { type: 'object', properties: props };
      if (req.length) sch.required = req;
      return sch;
    }
    if (typeof val === 'string') return { type: 'string' };
    if (typeof val === 'boolean') return { type: 'boolean' };
    return { type: (Math.floor(val) === val ? 'integer' : 'number') };
  }
  var out = { $schema: 'http://json-schema.org/draft-07/schema#' };
  var root = infer(v.data);
  Object.keys(root).forEach(function (k) { out[k] = root[k]; });
  return JSON.stringify(out, null, n);
};
/* Duration calculator: one signed duration per line, summed. Each line takes
   jammed or spaced unit groups (1h30m, 2 days 4 hours), colon times (1:30:00,
   12:30) or bare seconds; leading - subtracts, # lines and blanks skip.
   An @instant line (epoch or date string) anchors the cursor: the next
   @instant adds the gap between them, so date ranges mix with durations.
   Months read as 30 days and years as 365 days. Totals show s/min/h plus
   ms under a minute and days past a day. Unknown units and bad clocks throw
   with the offending line number. */
T.durationCalc = function (s) {
  var UN = { ms: 1, millisecond: 1, milliseconds: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000, h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000, d: 86400000, day: 86400000, days: 86400000, w: 604800000, week: 604800000, weeks: 604800000, mo: 2592000000, month: 2592000000, months: 2592000000, y: 31536000000, year: 31536000000, years: 31536000000 };
  var URE = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(milliseconds|millisecond|seconds|second|minutes|minute|hours|hour|days|weeks|months|years|ms|mo|sec|secs|min|mins|hrs|hr|s|m|h|d|w|y)/i;
  function fmt(n) {
    if (Math.abs(n) < 1e-9) n = 0;
    return String(Math.round(n * 10000) / 10000);
  }
  function parseTerm(body, ln) {
    if (body.indexOf(':') >= 0) {
      var parts = body.split(':');
      if (parts.length < 2 || parts.length > 3) throw new Error('Line ' + ln + ': clocks take H:MM:SS or MM:SS \u2014 got ' + JSON.stringify(body.slice(0, 24)));
      var nums = parts.map(function (x) { return /^[0-9]+(?:\.[0-9]+)?$/.test(x.trim()) ? Number(x) : NaN; });
      for (var k = 0; k < nums.length; k++) if (!isFinite(nums[k])) throw new Error('Line ' + ln + ': bad clock segment ' + JSON.stringify(parts[k].trim().slice(0, 12)));
      var hh = nums.length === 3 ? nums[0] : 0, mm = nums.length === 3 ? nums[1] : nums[0], ss = nums[nums.length - 1];
      if (mm >= 60 || ss >= 60) throw new Error('Line ' + ln + ': minutes and seconds must stay under 60');
      return (hh * 3600 + mm * 60 + ss) * 1000;
    }
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(body)) return Number(body) * 1000;
    var rest = body, ms = 0, matched = false, m;
    while (rest) {
      m = URE.exec(rest);
      if (!m || !m[0].length) break;
      ms += Number(m[1]) * UN[m[2].toLowerCase()];
      rest = rest.slice(m[0].length);
      matched = true;
    }
    if (!matched) throw new Error('Line ' + ln + ': could not parse ' + JSON.stringify(body.slice(0, 32)));
    if (rest.trim()) throw new Error('Line ' + ln + ': leftover ' + JSON.stringify(rest.trim().slice(0, 24)) + ' \u2014 jam units like 1h30m or use 1:30:00');
    return ms;
  }
  var raw = String(s === undefined || s === null ? '' : s);
  var rows = raw.split(/\r?\n/);
  var out = [], total = 0, count = 0, anchor = null;
  for (var n = 0; n < rows.length; n++) {
    var line = rows[n].trim();
    if (!line || line.charAt(0) === '#') continue;
    var ln = n + 1, sign = 1, body = line;
    var sig = /^\s*([+-])\s*(.*)$/.exec(line);
    if (sig) { sign = sig[1] === '-' ? -1 : 1; body = sig[2]; }
    if (!body) throw new Error('Line ' + ln + ': sign with no duration');
    if (body.charAt(0) === '@') {
      var when = T.parseDateValue(body.slice(1), ln).getTime();
      if (anchor === null) { anchor = when; out.push(line + ' (anchor)'); }
      else {
        var gap = sign * (when - anchor);
        anchor = when;
        total += gap;
        out.push(line + ' = ' + fmt(gap / 1000) + 's');
      }
      count++;
      continue;
    }
    var ms = sign * parseTerm(body, ln);
    total += ms;
    count++;
    out.push(line + ' = ' + fmt(ms / 1000) + 's');
  }
  if (!count) throw new Error('Paste durations first \u2014 one per line, e.g. 1h30m or @2024-06-10');
  var segs = [];
  if (Math.abs(total) < 60000) segs.push(fmt(total) + 'ms');
  segs.push(fmt(total / 1000) + 's', fmt(total / 60000) + 'min', fmt(total / 3600000) + 'h');
  if (Math.abs(total / 86400000) >= 1) segs.push(fmt(total / 86400000) + 'd');
  out.push('Total = ' + segs.join(' = '));
  return out.join('\n');
};
/* JSONL stats: one JSON value per line. Reports the row count, a row-type
   histogram and per-key coverage across object rows with numeric min/max/mean,
   string distinct counts and boolean true/false splits. Blank lines skip;
   bad rows throw with the offending line number. */
T.jsonlStats = function (s) {
  function r4(n) { return String(Math.round(n * 10000) / 10000); }
  function pct(a, b) { return String(Math.round(a / b * 1000) / 10); }
  function typeOf(x) {
    if (x === null) return 'null';
    if (Array.isArray(x)) return 'array';
    return typeof x;
  }
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [];
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) throw new Error('Line ' + (n + 1) + ': ' + (v.error || 'Invalid JSON'));
    docs.push(v.data);
  }
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON value per line');
  var total = docs.length, th = {}, thOrder = [], keys = {}, keyOrder = [];
  var i, k, d;
  for (i = 0; i < total; i++) {
    var t = typeOf(docs[i]);
    if (!th[t]) { th[t] = 0; thOrder.push(t); }
    th[t]++;
    d = docs[i];
    if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
      for (k in d) {
        if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
        var e = keys[k];
        if (!e) { e = keys[k] = { present: 0, types: {}, tOrder: [], nums: null, strs: null, bt: 0, bf: 0, nulls: 0 }; keyOrder.push(k); }
        e.present++;
        var vt = typeOf(d[k]);
        if (!e.types[vt]) { e.types[vt] = 0; e.tOrder.push(vt); }
        e.types[vt]++;
        if (vt === 'number') {
          if (!e.nums) e.nums = { n: 0, sum: 0, min: 0, max: 0 };
          var q = e.nums, x = d[k];
          if (!q.n) { q.min = x; q.max = x; }
          else { if (x < q.min) q.min = x; if (x > q.max) q.max = x; }
          q.n++; q.sum += x;
        } else if (vt === 'string') {
          if (!e.strs) e.strs = { n: 0, seen: {}, distinct: 0, capped: false };
          var g = e.strs, sv = d[k];
          g.n++;
          if (!g.capped && !Object.prototype.hasOwnProperty.call(g.seen, sv)) {
            g.seen[sv] = 1; g.distinct++;
            if (g.distinct >= 5000) g.capped = true;
          }
        } else if (vt === 'boolean') { if (d[k]) e.bt++; else e.bf++; }
        else if (vt === 'null') e.nulls++;
      }
    }
  }
  var out = ['rows = ' + total];
  out.push('row types: ' + thOrder.map(function (x) { return x + ' x' + th[x]; }).join(', '));
  keyOrder.sort(function (a, b) { return keys[b].present - keys[a].present; });
  for (i = 0; i < keyOrder.length; i++) {
    k = keyOrder[i];
    var en = keys[k];
    var segs = ['key ' + JSON.stringify(k) + ': ' + en.present + '/' + total + ' (' + pct(en.present, total) + '%)', en.tOrder.join('+')];
    if (en.nums) segs.push('n=' + en.nums.n + ' min=' + r4(en.nums.min) + ' max=' + r4(en.nums.max) + ' mean=' + r4(en.nums.sum / en.nums.n));
    if (en.strs) segs.push('n=' + en.strs.n + ' distinct=' + en.strs.distinct + (en.strs.capped ? '+' : ''));
    if (en.bt + en.bf) segs.push('true=' + en.bt + ' false=' + en.bf);
    if (en.nulls) segs.push('nulls=' + en.nulls);
    out.push(segs.join(' | '));
  }
  return out.join('\n');
};
/* Date difference: two dates, one per line (epoch s/ms or any Date.parse
   string); a lone date compares against now. Reports the signed exact total
   plus a calendar-accurate year/month/day split on the UTC calendar.
   Unknown dates throw with the offending line number. */
/* Shared loose date value: epoch seconds-or-milliseconds (digit-count
   heuristic) or any Date.parse string. Powers dateDiff plus the @instant
   lines of durationCalc; unknown input throws with the line number. */
T.parseDateValue = function (t, ln) {
  t = String(t === undefined || t === null ? '' : t).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    var n = parseFloat(t);
    var digits = t.replace(/[-.]/g, '').replace(/^0+/, '').length || 1;
    return new Date(digits > 10 ? n : n * 1000);
  }
  var ms = Date.parse(t);
  if (isNaN(ms)) throw new Error('Line ' + ln + ': Unrecognized date \u2014 try 2024-06-10 or 1718035200');
  return new Date(ms);
};
/* Business-day math: add, subtract or diff weekdays with configurable weekends plus holiday lines, NETWORKDAYS-inclusive diffs. */
/* Sleep cycles: 90-minute cycles back from a must-wake time or forward from bedtime, fall-asleep buffer plus AM/PM input. */
T.sleepCycles = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'bedtime';
  if (mode !== 'bedtime' && mode !== 'wake') throw new Error('Bad mode \u2014 use bedtime or wake');
  var braw = (o.buffer === undefined || o.buffer === null || o.buffer === '') ? '15' : o.buffer;
  var buf = parseInt(braw, 10);
  if (!(buf >= 0) || buf > 120) throw new Error('Buffer \u2014 0 to 120 minutes to fall asleep, got ' + JSON.stringify(braw));
  var raw = String(s === undefined || s === null ? '' : s);
  for (var si = 0; si < raw.length; si++) if (raw.charCodeAt(si) >= 0xD800 && raw.charCodeAt(si) <= 0xDFFF) return '';
  var txt = raw.trim();
  var mins = null;
  if (!txt) {
    if (mode !== 'wake') throw new Error('Enter a wake time \u2014 HH:MM on line one');
    var now = new Date();
    mins = now.getHours() * 60 + now.getMinutes();
  } else {
    var m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i.exec(txt) || /^(\d{1,2}):(\d{2})$/.exec(txt);
    if (!m) throw new Error('Bad time \u2014 HH:MM or h:MM AM/PM, got ' + JSON.stringify(txt));
    var h, mm;
    if (m[3] !== undefined) {
      h = parseInt(m[1], 10);
      mm = m[2] === undefined ? 0 : parseInt(m[2], 10);
      if (!(h >= 1 && h <= 12)) throw new Error('Hour \u2014 1 to 12 with AM/PM, got ' + JSON.stringify(m[1]));
      if (!(mm >= 0 && mm <= 59)) throw new Error('Minutes \u2014 00 to 59, got ' + JSON.stringify(m[2] === undefined ? '' : m[2]));
      if (/p/i.test(m[3])) { if (h !== 12) h += 12; } else if (h === 12) h = 0;
    } else {
      h = parseInt(m[1], 10);
      mm = parseInt(m[2], 10);
      if (!(h >= 0 && h <= 23)) throw new Error('Hour \u2014 00 to 23, got ' + JSON.stringify(m[1]));
      if (!(mm >= 0 && mm <= 59)) throw new Error('Minutes \u2014 00 to 59, got ' + JSON.stringify(m[2]));
    }
    mins = h * 60 + mm;
  }
  function fmtT(abs) {
    var day = Math.floor(abs / 1440);
    var tt = ((abs % 1440) + 1440) % 1440;
    var hh = Math.floor(tt / 60), m2 = tt % 60;
    var s = (hh < 10 ? '0' + hh : '' + hh) + ':' + (m2 < 10 ? '0' + m2 : '' + m2);
    if (day > 0) s += ' (+' + day + 'd)';
    if (day < 0) s += ' (' + day + 'd)';
    return s;
  }
  function cycDur(c) { var m3 = c * 90; return Math.floor(m3 / 60) + 'h' + String(m3 % 60).padStart(2, '0'); }
  var lines = [];
  var cyc = [6, 5, 4];
  if (mode === 'bedtime') {
    lines.push('To wake at ' + fmtT(mins) + ', fall asleep at:');
    for (var i = 0; i < cyc.length; i++) lines.push(fmtT(mins - cyc[i] * 90) + ' \u2014 ' + cyc[i] + ' cycles (' + cycDur(cyc[i]) + ')');
    lines.push('Be in bed ~' + buf + ' min earlier to fall asleep.');
  } else {
    var onset = mins + buf;
    lines.push('If asleep by ' + fmtT(onset) + ', wake at:');
    for (var j = 0; j < cyc.length; j++) lines.push(fmtT(onset + cyc[j] * 90) + ' \u2014 ' + cyc[j] + ' cycles (' + cycDur(cyc[j]) + ')');
  }
  return lines.join('\n');
};
T.bizDays = function (s, opts) {
  var o = opts || {};
  var mode = o.mode || 'add';
  if (mode !== 'add' && mode !== 'subtract' && mode !== 'diff') throw new Error('Bad mode \u2014 use add, subtract or diff');
  var wk = o.weekend || 'sat-sun';
  if (wk !== 'sat-sun' && wk !== 'fri-sat' && wk !== 'sun') throw new Error('Bad weekend \u2014 use sat-sun, fri-sat or sun');
  var WDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dayNum(d) { return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000); }
  function isWk(dn) { var dow = new Date(dn * 86400000).getUTCDay(); if (wk === 'fri-sat') return dow === 5 || dow === 6; if (wk === 'sun') return dow === 0; return dow === 0 || dow === 6; }
  function fmtDay(dn) { var d = new Date(dn * 86400000); function pp(x) { return String(x).padStart(2, '0'); } return d.getUTCFullYear() + '-' + pp(d.getUTCMonth() + 1) + '-' + pp(d.getUTCDate()) + ' (' + WDAYS[d.getUTCDay()] + ')'; }
  var raw = String(s === undefined || s === null ? '' : s);
  for (var si = 0; si < raw.length; si++) if (raw.charCodeAt(si) >= 0xD800 && raw.charCodeAt(si) <= 0xDFFF) return '';
  var rows = raw.split(/\r?\n/);
  var dates = [];
  for (var n = 0; n < rows.length; n++) {
    if (!rows[n].trim()) continue;
    dates.push({ d: dayNum(T.parseDateValue(rows[n], n + 1)), ln: n + 1 });
  }
  if (!dates.length) throw new Error('Enter a start date \u2014 YYYY-MM-DD on line one');
  var hols = {};
  var hraw = String(o.holidays === undefined || o.holidays === null ? '' : o.holidays);
  var hrows = hraw.split(/\r?\n/);
  for (var k = 0; k < hrows.length; k++) {
    if (!hrows[k].trim()) continue;
    hols[dayNum(T.parseDateValue(hrows[k], 'holiday ' + (k + 1)))] = 1;
  }
  function biz(dn) { return !isWk(dn) && !hols[dn]; }
  if (mode === 'diff') {
    if (dates.length < 2) throw new Error('Diff needs two dates \u2014 start and end on separate lines');
    if (dates.length > 2) throw new Error('Line ' + dates[2].ln + ': diff takes two dates \u2014 extra input');
    var a = dates[0].d, b = dates[1].d;
    var sgn = b < a ? -1 : 1;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var cnt = 0;
    for (var dd = lo; dd <= hi; dd++) if (biz(dd)) cnt++;
    var cal = hi - lo + 1;
    return fmtDay(lo) + ' to ' + fmtDay(hi) + '\n' + (sgn < 0 ? '-' : '') + cnt + ' business days (' + cal + ' calendar, ' + (cal - cnt) + ' skipped)';
  }
  if (dates.length > 1) throw new Error('Line ' + dates[1].ln + ': add and subtract take one start date \u2014 extra input');
  var draw = (o.days === undefined || o.days === null || o.days === '') ? '5' : o.days;
  var nd = parseInt(draw, 10);
  if (!(nd >= 0) || nd > 36500) throw new Error('Days \u2014 0 to 36500 business days, got ' + JSON.stringify(draw));
  var step = mode === 'subtract' ? -1 : 1;
  var cur = dates[0].d, moved = 0;
  while (moved < nd) { cur += step; if (biz(cur)) moved++; }
  return fmtDay(cur) + ' is ' + nd + ' business day' + (nd === 1 ? '' : 's') + ' ' + (mode === 'subtract' ? 'before' : 'after') + ' ' + fmtDay(dates[0].d);
};
T.dateDiff = function (s) {
  function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function tod(d) { return d.getUTCHours() * 3600000 + d.getUTCMinutes() * 60000 + d.getUTCSeconds() * 1000 + d.getUTCMilliseconds(); }
  var raw = String(s === undefined || s === null ? '' : s);
  var rows = raw.split(/\r?\n/);
  var dates = [];
  for (var n = 0; n < rows.length; n++) {
    if (!rows[n].trim()) continue;
    if (dates.length >= 2) throw new Error('Line ' + (n + 1) + ': expected at most two dates \u2014 extra input');
    dates.push(T.parseDateValue(rows[n], n + 1));
  }
  if (!dates.length) throw new Error('Paste one or two dates \u2014 one date compares against now');
  var a = dates[0], b = dates.length > 1 ? dates[1] : new Date();
  if (isNaN(a.getTime()) || isNaN(b.getTime())) throw new Error('Out-of-range date');
  var ms = b.getTime() - a.getTime();
  var sign = ms < 0 ? '-' : '';
  var abs = Math.abs(ms);
  var lo = ms < 0 ? b : a, hi = ms < 0 ? a : b;
  var Y = hi.getUTCFullYear() - lo.getUTCFullYear();
  var M = hi.getUTCMonth() - lo.getUTCMonth();
  var D = hi.getUTCDate() - lo.getUTCDate();
  if (tod(hi) < tod(lo)) D--;
  var by = hi.getUTCFullYear(), bm = hi.getUTCMonth();
  while (D < 0) { M--; bm--; if (bm < 0) { bm += 12; by--; } D += dim(by, bm); }
  if (M < 0) { Y--; M += 12; }
  var parts = [];
  if (Y) parts.push(Y + 'y');
  if (M || parts.length) parts.push(M + 'mo');
  parts.push(D + 'd');
  return 'from = ' + a.toISOString() + '\nto = ' + b.toISOString() +
    '\nTotal = ' + sign + Math.floor(abs / 86400000) + 'd = ' + sign + Math.floor(abs / 3600000) + 'h = ' + sign + Math.floor(abs / 60000) + 'min = ' + sign + Math.floor(abs / 1000) + 's' +
    '\nCalendar = ' + sign + parts.join(' ');
};
/* JSONL to CSV: one JSON value per line becomes CSV rows. Each row is
   validated with its line number, then emission delegates to the shared
   jsonToCSV core so quoting, delimiters and nesting stay single-sourced. */
T.jsonlToCSV = function (s, opts) {
  var raw = String(s === undefined || s === null ? '' : s);
  var lines = raw.split(/\r?\n/);
  var docs = [];
  for (var n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    var v = T.validateJSON(lines[n]);
    if (!v.valid) throw new Error('Line ' + (n + 1) + ': ' + (v.error || 'Invalid JSON'));
    docs.push(v.data);
  }
  if (!docs.length) throw new Error('Paste JSONL first \u2014 one JSON value per line');
  return T.jsonToCSV(JSON.stringify(docs), opts);
};
window.Transforms = T;
})();
