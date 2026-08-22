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
    '.t-base64-image-decoder .b64-input{width:100%;border:1px solid rgba(80,73,69,0.4);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-size:12px;font-family:var(--font-mono);color:rgba(235,219,178,0.9);resize:vertical;min-height:60px;border-radius:var(--radius);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-base64-image-decoder .b64-input::placeholder{color:rgba(189,174,147,0.3);}\n' +
    '.t-base64-image-decoder .b64-input:focus{border-color:rgba(142,192,124,0.4);box-shadow:0 0 0 1px rgba(142,192,124,0.3);}\n' +
    '.t-base64-image-decoder .space-y-2 > * + *{margin-top:0.5rem;}\n' +
    '.t-base64-image-decoder .max-w-full{max-width:100%;}\n' +
    '.t-base64-image-decoder .max-h-\\[300px\\]{max-height:300px;}\n' +
    '.t-base64-image-decoder .min-h-\\[100px\\]{min-height:100px;}\n' +
    '.t-base64-image-decoder .object-contain{object-fit:contain;}\n' +
    '.t-base64-image-decoder .border-cyan-glow\\/20{border-color:rgba(142,192,124,0.2);}\n' +
    '.t-base64-image-decoder .text-cyan-glow\\/80{color:rgba(142,192,124,0.8);}\n' +
    '.t-base64-image-decoder .hover\\:bg-cyan-glow\\/20:hover{background:rgba(142,192,124,0.2);}\n',

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

    function decode(s) {
      try {
        var trimmed = s.trim();
        // Strip data URL prefix if present
        var b64 = trimmed.replace(/^data:image\/[^;]+;base64,/, '');
        var dataUrl = 'data:image/png;base64,' + b64;
        var bytes = atob(b64.replace(/\s/g, ''));
        size = bytes.length;
        imgData = dataUrl;
        mime = 'image/png';
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to decode Base64';
        imgData = null;
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
      if (input.length > 20) decode(input);
    });

    render();
    root.appendChild(textarea);
    root.appendChild(previewBox);
    root.appendChild(outputBox);
  }
});
})();
