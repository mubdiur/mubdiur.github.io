/* ═══════════════════════════════════════════════════════════
   Image to Base64 — CUSTOM TOOL.
   Ported from src/components/tools/image-to-base64.tsx.
   Drop or pick an image, get its data-URI (base64) output
   with size info, preview and copy.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('image-to-base64', {
  css: '' +
    '.t-image-to-base64 .border-dashed{border-style:dashed;}\n' +
    '.t-image-to-base64 .text-muted-foreground\\/60{color:rgba(154,134,120,0.6);}\n' +
    '.t-image-to-base64 .text-muted-foreground\\/40{color:rgba(154,134,120,0.4);}\n' +
    '.t-image-to-base64 .space-y-2 > * + *{margin-top:0.5rem;}\n' +
    '.t-image-to-base64 .max-w-full{max-width:100%;}\n' +
    '.t-image-to-base64 .max-h-\\[200px\\]{max-height:200px;}\n' +
    '.t-image-to-base64 .max-h-\\[180px\\]{max-height:180px;}\n' +
    '.t-image-to-base64 .object-contain{object-fit:contain;}\n' +
    '.t-image-to-base64 .border-cyan-glow\\/20{border-color:rgba(163,191,160,0.2);}\n' +
    '.t-image-to-base64 .text-cyan-glow\\/80{color:rgba(163,191,160,0.8);}\n' +
    '.t-image-to-base64 .hover\\:bg-cyan-glow\\/20:hover{background:rgba(163,191,160,0.2);}\n' +
    '.t-image-to-base64 .hover\\:border-cyan-glow\\/30:hover{border-color:rgba(163,191,160,0.3);}\n' +
    '.t-image-to-base64 .hover\\:bg-cyan-glow\\/5:hover{background:rgba(163,191,160,0.05);}\n' +
    '.t-image-to-base64 .dropzone.dragging{border-color:rgba(163,191,160,0.6);background:rgba(163,191,160,0.05);}\n' +
    '.t-image-to-base64 .b64-out{width:100%;border:1px solid rgba(75,64,56,0.4);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-size:10px;font-family:var(--font-mono);color:rgba(202,170,152,0.7);resize:vertical;min-height:60px;border-radius:var(--radius);}\n',

  mount: function (root) {
    var b64 = '';
    var preview = '';
    var fileName = '';
    var dragging = false;

    var outputBox = App.el('div');
    var imgEl = App.el('img', { alt: 'Preview', class: 'max-w-full max-h-[180px] object-contain rounded' });

    var copyBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono bg-cyan-glow/10 border border-cyan-glow/20 text-cyan-glow/80 hover:bg-cyan-glow/20 transition-colors',
      onclick: function () { App.copy(b64, copyBtn); }
    }, App.icon('copy', '', 12), App.el('span', { text: 'Copy Base64' }));

    var b64Out = App.el('textarea', { rows: 4, readonly: true, class: 'b64-out' });

    var previewBox = App.el('div', { class: 'space-y-2 hidden' },
      App.el('div', { class: 'rounded border border-border/40 bg-black/20 p-2 flex items-center justify-center max-h-[200px]' }, imgEl),
      App.el('div', { class: 'flex items-center gap-2' }, copyBtn),
      b64Out);

    var fileInput = App.el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (file) handleFile(file);
    });

    var zone = App.el('div', {
      class: 'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all border-border/30 hover:border-cyan-glow/30 hover:bg-cyan-glow/5',
      onclick: function () { fileInput.click(); }
    },
      fileInput,
      App.icon('upload', 'mx-auto text-muted-foreground/40 mb-2', 24),
      App.el('p', { class: 'text-xs font-mono text-muted-foreground/60', text: 'Drop an image or click to upload' }),
      App.el('p', { class: 'text-[10px] font-mono text-muted-foreground/40 mt-1', text: 'PNG, JPG, GIF, WebP, SVG' }));

    // Drag & drop
    App.on(zone, 'dragover', function (e) { e.preventDefault(); dragging = true; zone.classList.add('dragging'); });
    App.on(zone, 'dragleave', function () { dragging = false; zone.classList.remove('dragging'); });
    App.on(zone, 'drop', function (e) {
      e.preventDefault();
      dragging = false;
      zone.classList.remove('dragging');
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    function handleFile(file) {
      if (!file.type.startsWith('image/')) return;
      fileName = file.name;
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        b64 = result;
        preview = result;
        render();
      };
      reader.readAsDataURL(file);
      render();
    }

    function render() {
      if (preview) {
        zone.classList.add('hidden');
        previewBox.classList.remove('hidden');
        imgEl.src = preview;
        b64Out.value = b64;
      } else {
        zone.classList.remove('hidden');
        previewBox.classList.add('hidden');
      }
      outputBox.innerHTML = '';
      if (fileName) {
        outputBox.appendChild(App.outputBox(fileName + ' — ' + (b64.length / 1024).toFixed(1) + ' KB', null, 'Output', clear));
      }
    }

    function clear() {
      b64 = '';
      preview = '';
      fileName = '';
      fileInput.value = '';
      render();
    }

    root.appendChild(zone);
    root.appendChild(previewBox);
    root.appendChild(outputBox);
  }
});
})();
