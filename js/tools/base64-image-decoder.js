/* ═══════════════════════════════════════════════════════════
   Base64 Image Decoder — CUSTOM TOOL.
   Ported from src/components/tools/base64-image-decoder.tsx.
   Paste a base64 string (with or without data:image prefix),
   get a live image preview, decoded size, download + copy.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('base64-image-decoder', {
  css: '' +
    '.t-base64-image-decoder .b64-input{width:100%;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-size:12px;font-family:var(--font-mono);color:rgba(227,227,227,0.9);resize:vertical;min-height:60px;border-radius:var(--radius);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-base64-image-decoder .b64-input::placeholder{color:rgba(141,148,158,0.3);}\n' +
    '.t-base64-image-decoder .b64-input:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-base64-image-decoder .space-y-2 > * + *{margin-top:0.5rem;}\n' +
    '.t-base64-image-decoder .max-w-full{max-width:100%;}\n' +
    '.t-base64-image-decoder .max-h-\\[300px\\]{max-height:300px;}\n' +
    '.t-base64-image-decoder .min-h-\\[100px\\]{min-height:100px;}\n' +
    '.t-base64-image-decoder .object-contain{object-fit:contain;}\n' +
    '.t-base64-image-decoder .border-cyan-glow\\/20{border-color:rgba(83,163,249,0.2);}\n' +
    '.t-base64-image-decoder .text-cyan-glow\\/80{color:rgba(83,163,249,0.8);}\n' +
    '.t-base64-image-decoder .hover\\:bg-cyan-glow\\/20:hover{background:rgba(83,163,249,0.2);}\n',

  mount: function (root) {
    var input = '';
    var imgData = null;
    var mime = '';
    var size = 0;
    var error = null;

    var outputBox = App.el('div');
    var imgEl = App.el('img', { alt: 'Decoded', class: 'max-w-full max-h-[300px] object-contain rounded' });

    var downloadBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono bg-cyan-glow/10 border border-cyan-glow/20 text-cyan-glow/80 hover:bg-cyan-glow/20 transition-colors',
      onclick: function () {
        if (!imgData) return;
        var a = document.createElement('a');
        a.href = imgData;
        a.download = 'decoded-image.' + (mime.split('/')[1] || 'png');
        a.click();
      }
    }, App.icon('download', '', 12), App.el('span', { text: 'Download Image' }));

    var previewBox = App.el('div', { class: 'space-y-2 hidden' },
      App.el('div', { class: 'rounded border border-border/40 bg-black/20 p-2 flex items-center justify-center min-h-[100px]' }, imgEl),
      downloadBtn);

    var textarea = App.el('textarea', {
      rows: 5, spellcheck: 'false', class: 'b64-input',
      placeholder: 'Paste Base64 string (with or without data:image prefix)...'
    });

    function sniffMime(bytes) {
      var len = bytes.length;
      function b(i) { return bytes.charCodeAt(i) & 0xFF; }
      if (len >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png';
      if (len >= 3 && b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
      if (len >= 6 && b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38 && b(4) === 0x37 && b(5) === 0x61) return 'image/gif';
      if (len >= 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
      if (len >= 1 && bytes.charCodeAt(0) === 60 && bytes.indexOf('<svg') >= 0) return 'image/svg+xml';
      return null;
    }

    function decode(s) {
      try {
        var trimmed = s.trim();
        var prefixMatch = trimmed.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,/i);
        var b64 = prefixMatch ? trimmed.slice(prefixMatch[0].length) : trimmed;
        b64 = b64.replace(/\s/g, '');
        if (!b64) throw new Error('Empty Base64 input');
        while (b64.length % 4 !== 0) b64 += '=';
        var bytes = atob(b64);
        var declared = prefixMatch ? prefixMatch[1].toLowerCase() : '';
        var detected = declared && declared.indexOf('image/') === 0 ? declared : sniffMime(bytes);
        if (!detected || detected.indexOf('image/') !== 0) throw new Error('Not a supported image format — PNG, JPEG, GIF, WEBP or SVG');
        mime = detected;
        size = bytes.length;
        imgData = 'data:' + mime + ';base64,' + b64;
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to decode Base64';
        imgData = null;
        size = 0;
        mime = '';
      }
      render();
    }

    function render() {
      outputBox.innerHTML = '';
      outputBox.appendChild(App.outputBox('Size: ' + (size / 1024).toFixed(1) + ' KB | ' + mime, error, 'Output', clear));
      if (imgData) {
        imgEl.src = imgData;
        previewBox.classList.remove('hidden');
      } else {
        previewBox.classList.add('hidden');
      }
    }

    function clear() {
      input = '';
      textarea.value = '';
      imgData = null;
      error = null;
      size = 0;
      render();
    }

    textarea.addEventListener('input', function () {
      input = textarea.value;
      if (input.trim()) decode(input);
      else { imgData = null; error = null; size = 0; render(); }
    });

    render();
    root.appendChild(textarea);
    root.appendChild(previewBox);
    root.appendChild(outputBox);
  }
});
})();
