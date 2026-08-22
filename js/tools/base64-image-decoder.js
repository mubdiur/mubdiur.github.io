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
    '.t-base64-image-decoder .b64-input{width:100%;border:1px solid rgba(30,32,41,0.4);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-size:12px;font-family:var(--font-mono);color:rgba(233,233,236,0.9);resize:vertical;min-height:60px;border-radius:var(--radius);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-base64-image-decoder .b64-input::placeholder{color:rgba(170,170,179,0.3);}\n' +
    '.t-base64-image-decoder .b64-input:focus{border-color:rgba(194,220,212,0.4);box-shadow:0 0 0 1px rgba(194,220,212,0.3);}\n' +
    '.t-base64-image-decoder .space-y-2 > * + *{margin-top:0.5rem;}\n' +
    '.t-base64-image-decoder .max-w-full{max-width:100%;}\n' +
    '.t-base64-image-decoder .max-h-\\[300px\\]{max-height:300px;}\n' +
    '.t-base64-image-decoder .min-h-\\[100px\\]{min-height:100px;}\n' +
    '.t-base64-image-decoder .object-contain{object-fit:contain;}\n' +
    '.t-base64-image-decoder .border-cyan-glow\\/20{border-color:rgba(194,220,212,0.2);}\n' +
    '.t-base64-image-decoder .text-cyan-glow\\/80{color:rgba(194,220,212,0.8);}\n' +
    '.t-base64-image-decoder .hover\\:bg-cyan-glow\\/20:hover{background:rgba(194,220,212,0.2);}\n',

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
      if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
      if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
      if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x37 && bytes[5] === 0x61) return 'image/gif';
      if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
      return null;
    }

    function decode(s) {
      try {
        var trimmed = s.trim();
        // Use the declared MIME from a data URL prefix, else sniff the magic bytes
        var prefixMatch = trimmed.match(/^data:(image\/[^;]+);base64,/);
        var b64 = trimmed.replace(/^data:image\/[^;]+;base64,/, '');
        var bytes = atob(b64.replace(/\s/g, ''));
        var detected = prefixMatch ? prefixMatch[1] : sniffMime(bytes);
        if (!detected) throw new Error('Not a supported image format — PNG, JPEG, GIF or WEBP only');
        mime = detected;
        size = bytes.length;
        imgData = 'data:' + mime + ';base64,' + b64;
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
