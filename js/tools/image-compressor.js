/* ═══════════════════════════════════════════════════════════
   Image Compressor — CUSTOM TOOL.
   Shrink images entirely in-browser: drop, paste or upload,
   resize by max side, JPEG/WebP quality dial, side-by-side
   byte readout plus one-click download. Sizing math lives in
   Transforms.fitDimensions — one tested source.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';
function fmtKB(n) {
  var b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (Math.round(b / 1024 * 10) / 10) + ' KB';
  return (Math.round(b / 1048576 * 100) / 100) + ' MB';
}
function extOf(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
function safeBase(name) {
  var b = String(name || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!b) b = 'image';
  return b.slice(0, 40);
}
var CSS = '' +
'.t-image-compressor .ic-file{display:none;}\n' +
'.t-image-compressor .ic-drop{border:1.5px dashed rgba(141,148,158,0.35);border-radius:10px;padding:1.75rem 1rem;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;}\n' +
'.t-image-compressor .ic-drop:hover,.t-image-compressor .ic-drop.over{border-color:rgba(83,163,249,0.6);background:rgba(83,163,249,0.06);}\n' +
'.t-image-compressor .ic-drop p{margin:0.35rem 0 0;font-family:var(--font-mono);font-size:12.5px;color:rgba(141,148,158,0.7);}\n' +
'.t-image-compressor .ic-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.6rem;margin-top:0.7rem;}\n' +
'.t-image-compressor .ic-flabel{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.75);display:block;margin-bottom:0.3rem;}\n' +
'.t-image-compressor .ic-flabel b{color:rgba(227,227,227,0.9);font-weight:600;}\n' +
'.t-image-compressor select.ic-sel{width:100%;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 8px;font-family:var(--font-mono);font-size:13.5px;color:rgba(227,227,227,0.9);outline:none;}\n' +
'.t-image-compressor input.ic-range{width:100%;accent-color:#53a3f9;}\n' +
'.t-image-compressor .ic-compare{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-top:0.7rem;}\n' +
'.t-image-compressor .ic-shot{border:1px solid rgba(51,53,56,0.4);border-radius:8px;background:rgba(0,0,0,0.25);padding:0.5rem;text-align:center;}\n' +
'.t-image-compressor .ic-shot img{max-width:100%;max-height:220px;border-radius:4px;}\n' +
'.t-image-compressor .ic-shot .t{font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.7);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.35rem;}\n' +
'.t-image-compressor .ic-shot .s{font-family:var(--font-mono);font-size:13px;color:#fff;margin-top:0.35rem;}\n' +
'.t-image-compressor .ic-shot .s small{color:rgba(141,148,158,0.7);}\n' +
'.t-image-compressor .ic-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.65rem;}\n' +
'.t-image-compressor .ic-status{font-family:var(--font-mono);font-size:13px;min-height:1.4em;margin-top:0.55rem;color:rgba(141,148,158,0.85);}\n' +
'.t-image-compressor .ic-status.ok{color:var(--lime);}\n' +
'.t-image-compressor .ic-status.err{color:var(--ctp-red);}\n' +
'.t-image-compressor .ic-hint{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.6);margin-top:0.5rem;line-height:1.6;}\n' +
'.t-image-compressor .ic-save{font-family:var(--font-mono);font-size:17px;color:var(--lime);text-align:center;margin-top:0.4rem;}\n';
App.registerTool('image-compressor', {
  css: CSS,
  mount: function (root) {
    var runToken = 0;
    var srcUrl = null, srcFile = null, srcW = 0, srcH = 0, probeImg = null;
    var outBlob = null, outUrl = null;
    var fileInput = App.el('input', { type: 'file', accept: 'image/*', class: 'ic-file', 'aria-label': 'Choose an image' });
    var drop = App.el('div', { class: 'ic-drop', role: 'button', tabindex: '0', 'aria-label': 'Upload an image' },
      App.el('div', { text: '🖼' }),
      App.el('p', { text: 'Drop an image here, paste from clipboard, or click to browse' }));
    var maxSel = App.el('select', { class: 'ic-sel', 'aria-label': 'Max side' },
      App.el('option', { value: '512', text: 'Max side 512px' }),
      App.el('option', { value: '1024', text: 'Max side 1024px' }),
      App.el('option', { value: '1920', text: 'Max side 1920px' }),
      App.el('option', { value: '2560', text: 'Max side 2560px' }),
      App.el('option', { value: 'orig', text: 'Keep original size' }));
    maxSel.value = '1920';
    var fmtSel = App.el('select', { class: 'ic-sel', 'aria-label': 'Output format' },
      App.el('option', { value: 'image/jpeg', text: 'JPEG (smallest)' }),
      App.el('option', { value: 'image/webp', text: 'WebP (modern)' }),
      App.el('option', { value: 'image/png', text: 'PNG (lossless)' }));
    var qRange = App.el('input', { class: 'ic-range', type: 'range', min: '1', max: '100', value: '82', 'aria-label': 'Quality' });
    var qLab = App.el('b', { text: '82%' });
    var qWrap = App.el('div', {}, App.el('label', { class: 'ic-flabel' }, App.el('span', { text: 'Quality ' }), qLab), qRange);
    var status = App.el('div', { class: 'ic-status', role: 'status', text: 'Private by design — pixels never leave this tab.' });
    var result = App.el('div', {});
    function setStatus(msg, cls) {
      status.textContent = msg;
      status.className = 'ic-status' + (cls ? ' ' + cls : '');
    }
    function maxSide() {
      if (maxSel.value === 'orig') return Math.max(srcW, srcH) || 1920;
      return Number(maxSel.value);
    }
    function clearOut() {
      if (outUrl) { try { URL.revokeObjectURL(outUrl); } catch (e) { void e; } }
      outBlob = null;
      outUrl = null;
      result.innerHTML = '';
    }
    function clearAll() {
      runToken++;
      clearOut();
      if (srcUrl) { try { URL.revokeObjectURL(srcUrl); } catch (e) { void e; } }
      srcUrl = null;
      srcFile = null;
      probeImg = null;
      try { fileInput.value = ''; } catch (e) { void e; }
      setStatus('Cleared. Nothing is stored — close the tab and it is gone.');
    }
    function paint() {
      result.innerHTML = '';
      if (!outBlob || !srcUrl) return;
      var saved = srcFile && srcFile.size ? Math.max(0, Math.round((1 - outBlob.size / srcFile.size) * 100)) : 0;
      var saveLine = App.el('div', { class: 'ic-save', text: '−' + saved + '% smaller' });
      var origShot = App.el('div', { class: 'ic-shot' },
        App.el('div', { class: 't', text: 'Original' }),
        App.el('img', { src: srcUrl, alt: 'Original image' }),
        App.el('div', { class: 's', text: fmtKB(srcFile ? srcFile.size : 0) + ' · ' + srcW + '×' + srcH }));
      var outShot = App.el('div', { class: 'ic-shot' },
        App.el('div', { class: 't', text: 'Compressed (' + outBlob.type + ')' }),
        App.el('img', { src: outUrl, alt: 'Compressed image' }),
        App.el('div', { class: 's', text: fmtKB(outBlob.size) + ' · ' + outW() + '×' + outH() }));
      result.appendChild(App.el('div', { class: 'ic-compare' }, origShot, outShot));
      result.appendChild(saveLine);
      var snap = outBlob;
      var dlBtn = App.downloadButton(function () {
        var base = safeBase(srcFile && srcFile.name);
        App.download(base + '-' + snapW + 'x' + snapH + '.' + extOf(snap.type), snap, snap.type || 'image/jpeg');
      }, 'Download');
      result.appendChild(App.el('div', { class: 'ic-row' }, dlBtn, App.clearButton(clearAll)));
      function outW() { return lastDim.w; }
      function outH() { return lastDim.h; }
      var snapW = lastDim.w, snapH = lastDim.h;
    }
    var lastDim = { w: 0, h: 0 };
    function encode(token) {
      if (!probeImg) return;
      var dim;
      try { dim = Transforms.fitDimensions(srcW, srcH, maxSide()); }
      catch (err) { setStatus((err && err.message) || 'Bad dimensions.', 'err'); return; }
      lastDim = dim;
      var canvas = document.createElement('canvas');
      canvas.width = dim.w;
      canvas.height = dim.h;
      var ctx = null;
      try { ctx = canvas.getContext('2d'); } catch (e) { void e; }
      if (!ctx) { setStatus('Canvas is unavailable in this browser.', 'err'); return; }
      try { ctx.drawImage(probeImg, 0, 0, dim.w, dim.h); }
      catch (e) { setStatus('That image cannot be rasterized — animated GIFs and foreign SVGs may fail.', 'err'); return; }
      var mime = fmtSel.value;
      var q = mime === 'image/png' ? undefined : Number(qRange.value) / 100;
      setStatus('Encoding ' + dim.w + '×' + dim.h + '…');
      try {
        canvas.toBlob(function (blob) {
          if (token !== runToken) return;
          if (!blob || !blob.size) { setStatus('Encoding failed — try JPEG instead of WebP.', 'err'); return; }
          clearOut();
          outBlob = blob;
          try { outUrl = URL.createObjectURL(blob); } catch (e) { setStatus('Could not package the result.', 'err'); return; }
          var note = (mime === 'image/webp' && blob.type !== 'image/webp') ? ' (WebP unsupported here — fell back to ' + blob.type + ')' : '';
          setStatus('Compressed ' + fmtKB(srcFile ? srcFile.size : 0) + ' → ' + fmtKB(blob.size) + note + '.', 'ok');
          paint();
        }, mime, q);
      } catch (e) { setStatus('Encoding failed in this browser — try JPEG.', 'err'); }
    }
    var reEncode = App.debounce(function () {
      if (!probeImg) return;
      encode(runToken);
    }, 160);
    function loadFile(file) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        setStatus('Not an image — drop a PNG, JPEG, GIF, SVG or WebP file.', 'err');
        return;
      }
      var token = ++runToken;
      clearOut();
      if (srcUrl) { try { URL.revokeObjectURL(srcUrl); } catch (e) { void e; } }
      var url = null;
      try { url = URL.createObjectURL(file); } catch (e) { setStatus('Could not read that file.', 'err'); return; }
      var probe = new Image();
      probe.onload = function () {
        if (token !== runToken) { try { URL.revokeObjectURL(url); } catch (e) { void e; } return; }
        if (!probe.naturalWidth || !probe.naturalHeight) { setStatus('That file has no readable pixels.', 'err'); return; }
        srcUrl = url;
        srcFile = file;
        srcW = probe.naturalWidth;
        srcH = probe.naturalHeight;
        probeImg = probe;
        encode(token);
      };
      probe.onerror = function () {
        if (token !== runToken) return;
        try { URL.revokeObjectURL(url); } catch (e) { void e; }
        setStatus('Could not decode that image file.', 'err');
      };
      probe.src = url;
    }
    var depth = 0;
    App.on(drop, 'click', function () { fileInput.click(); });
    App.on(drop, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    App.on(drop, 'dragenter', function (e) { e.preventDefault(); depth++; drop.classList.add('over'); });
    App.on(drop, 'dragover', function (e) { e.preventDefault(); });
    App.on(drop, 'dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('over'); });
    App.on(drop, 'drop', function (e) {
      e.preventDefault();
      depth = 0;
      drop.classList.remove('over');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) loadFile(files[0]);
    });
    App.on(fileInput, 'change', function () {
      if (fileInput.files && fileInput.files.length) loadFile(fileInput.files[0]);
    });
    App.on(window, 'paste', function (e) {
      var cd = e.clipboardData;
      if (!cd || !cd.items) return;
      for (var i = 0; i < cd.items.length; i++) {
        if (cd.items[i].type && cd.items[i].type.indexOf('image/') === 0) {
          var f = cd.items[i].getAsFile();
          if (f) { loadFile(f); break; }
        }
      }
    });
    App.on(maxSel, 'change', reEncode);
    App.on(fmtSel, 'change', function () {
      qWrap.style.display = fmtSel.value === 'image/png' ? 'none' : '';
      reEncode();
    });
    App.on(qRange, 'input', function () {
      qLab.textContent = qRange.value + '%';
      reEncode();
    });
    root.appendChild(App.el('div', {},
      drop, fileInput,
      App.el('div', { class: 'ic-controls' },
        App.el('div', {}, App.el('label', { class: 'ic-flabel', text: 'Max side' }), maxSel),
        App.el('div', {}, App.el('label', { class: 'ic-flabel', text: 'Format' }), fmtSel),
        qWrap),
      App.el('div', { class: 'ic-row' }, App.clearButton(clearAll)),
      status, result,
      App.el('div', { class: 'ic-hint', text: 'GIFs compress to their first still frame. The true output format is always shown — WebP falls back where unsupported.' })));
  }
});
})();
