/* ═══════════════════════════════════════════════════════════
   HTML Post Maker — ported from src/components/tools/post-maker.tsx.
   Block editor: text + image blocks (file upload, drag-drop, paste),
   reorder (move up/down, insert before, delete), live generated-HTML
   preview, copy as self-contained HTML, preview in a new tab.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var nextId = 1;

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtml(items) {
  var out = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.type === 'text') {
      if (it.text.trim()) out += '<p>' + escapeHtml(it.text).replace(/\n/g, '<br>') + '</p>\n';
    } else if (it.src) {
      out += '<img src="' + it.src + '" alt="image" style="max-width:100%; height:auto;">\n';
    }
  }
  return out;
}

App.registerTool('post-maker', {
  css: '' +
    '.t-post-maker .pm-drop{border-radius:0.75rem;border:2px dashed rgba(75,64,56,0.6);background:rgba(28,35,54,0.5);padding:1rem;transition:background-color .2s,border-color .2s;}\n' +
    '.t-post-maker .pm-drop.dragover{border-color:rgba(163,191,160,0.6);background:rgba(163,191,160,0.08);}\n' +
    '.t-post-maker .pm-btn2{color:rgba(154,134,120,0.8);}\n' +
    '.t-post-maker .pm-btn2:hover{color:rgba(202,170,152,0.9);}\n' +
    '.t-post-maker .pm-cell{height:28px;width:28px;color:rgba(154,134,120,0.8);}\n' +
    '.t-post-maker .pm-cell:hover{color:rgba(202,170,152,0.9);}\n' +
    '.t-post-maker .pm-cell.danger:hover{color:var(--ctp-red);}\n' +
    '.t-post-maker .pm-ta{width:100%;resize:vertical;border-radius:calc(var(--radius)*0.8);border:1px solid rgba(75,64,56,0.5);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-family:var(--font-mono);font-size:14px;color:rgba(202,170,152,0.9);outline:none;}\n' +
    '.t-post-maker .pm-ta::placeholder{color:rgba(154,134,120,0.3);}\n' +
    '.t-post-maker .pm-ta:focus{box-shadow:0 0 0 1px rgba(163,191,160,0.4);}\n' +
    '.t-post-maker .pm-img{max-height:16rem;width:auto;}\n' +
    '.t-post-maker .pm-pre{max-height:16rem;overflow:auto;white-space:pre-wrap;word-break:break-all;font-family:var(--font-mono);font-size:12px;color:rgba(202,170,152,0.85);}\n',

  mount: function (root) {
    var items = [{ id: nextId++, type: 'text', text: '', src: '' }];

    var btn1 = 'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono font-medium bg-ctp-teal/15 border border-ctp-teal/30 text-ctp-teal hover:bg-ctp-teal/25 transition-colors';
    var btn2 = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 pm-btn2 hover:bg-surface0 transition-colors';
    var cellBtn = 'flex items-center justify-center rounded-md text-xs font-mono border border-border/40 bg-surface0/50 pm-cell hover:bg-surface0 transition-colors disabled:opacity-50';

    /* ── file handling ── */
    var fileInput = App.el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
    fileInput.addEventListener('change', function () {
      Array.from(fileInput.files || []).forEach(processFile);
      fileInput.value = '';
    });

    function processFile(file) {
      if (!file || !file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function (e) { addImage(String(e.target && e.target.result || '')); };
      reader.readAsDataURL(file);
    }

    /* ── item mutations ── */
    function addText(insertBeforeId) {
      addItem({ id: nextId++, type: 'text', text: '', src: '' }, insertBeforeId);
    }

    function addImage(src, insertBeforeId) {
      addItem({ id: nextId++, type: 'image', text: '', src: src }, insertBeforeId);
    }

    function addItem(item, insertBeforeId) {
      if (insertBeforeId === undefined) {
        items.push(item);
      } else {
        var idx = -1;
        for (var i = 0; i < items.length; i++) if (items[i].id === insertBeforeId) { idx = i; break; }
        if (idx === -1) items.push(item);
        else items.splice(idx, 0, item);
      }
      renderItems();
      syncOutput();
    }

    function remove(id) {
      items = items.filter(function (i) { return i.id !== id; });
      renderItems();
      syncOutput();
    }

    function move(id, dir) {
      var idx = -1;
      for (var i = 0; i < items.length; i++) if (items[i].id === id) { idx = i; break; }
      var target = idx + dir;
      if (idx === -1 || target < 0 || target >= items.length) return;
      var tmp = items[idx];
      items[idx] = items[target];
      items[target] = tmp;
      renderItems();
      syncOutput();
    }

    function onDrop(e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      Array.from(e.dataTransfer.files).forEach(processFile);
    }

    function onPaste(e) {
      var files = Array.from(e.clipboardData.files).filter(function (f) { return f.type.startsWith('image/'); });
      if (files.length) {
        e.preventDefault();
        files.forEach(processFile);
      }
    }

    /* ── output / preview ── */
    function syncOutput() {
      var gen = buildHtml(items);
      var has = gen.trim().length > 0;
      pre.textContent = gen;
      genBlock.classList.toggle('hidden', !has);
      copyBtn.disabled = !has;
    }

    function preview() {
      var gen = buildHtml(items);
      if (!gen.trim().length) return;
      var full = '<!DOCTYPE html>\n' +
        '<html lang="en">\n' +
        '<head>\n' +
        '  <meta charset="UTF-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '  <title>Post Preview</title>\n' +
        '  <style>\n' +
        '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }\n' +
        '    img { max-width: 100%; height: auto; }\n' +
        '    p { margin: 0 0 10px 0; }\n' +
        '  </style>\n' +
        '</head>\n' +
        '<body>\n' +
        gen +
        '</body>\n' +
        '</html>';
      var blob = new Blob([full], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
    }

    /* ── item rows ── */
    var itemsEl = App.el('div', { class: 'flex flex-col gap-2' });

    function renderItems() {
      itemsEl.innerHTML = '';
      items.forEach(function (it, idx) {
        var left;
        if (it.type === 'text') {
          var ta = App.el('textarea', { class: 'pm-ta', placeholder: 'Type text here…', spellcheck: 'false' });
          ta.value = it.text;
          ta.addEventListener('input', function () {
            it.text = ta.value;
            syncOutput();
          });
          left = App.el('div', { class: 'min-w-0 flex-1' }, ta);
        } else {
          left = App.el('div', { class: 'min-w-0 flex-1' },
            App.el('img', { class: 'pm-img rounded-md border border-border/50', src: it.src, alt: 'Embedded' }));
        }

        var up = App.el('button', { type: 'button', class: cellBtn, 'aria-label': 'Move up', onclick: function () { move(it.id, -1); } }, App.icon('arrow-up', '', 12));
        var down = App.el('button', { type: 'button', class: cellBtn, 'aria-label': 'Move down', onclick: function () { move(it.id, 1); } }, App.icon('arrow-down', '', 12));
        var insert = App.el('button', { type: 'button', class: cellBtn, 'aria-label': 'Insert text before', onclick: function () { addText(it.id); } }, App.icon('file-plus-2', '', 12));
        var del = App.el('button', { type: 'button', class: cellBtn + ' danger', 'aria-label': 'Delete', onclick: function () { remove(it.id); } }, App.icon('trash-2', '', 12));
        up.disabled = idx === 0;
        down.disabled = idx === items.length - 1;

        itemsEl.appendChild(App.el('div', { class: 'flex items-start gap-2 rounded-lg border border-border/40 bg-mantle p-3' },
          left,
          App.el('div', { class: 'flex shrink-0 flex-col gap-1' }, up, down, insert, del)));
      });
    }

    /* ── toolbar ── */
    var copyBtn = App.el('button', { type: 'button', class: btn2, disabled: true }, App.icon('copy', '', 12), App.el('span', { text: 'Copy HTML' }));
    copyBtn.addEventListener('click', function () { App.copy(buildHtml(items), copyBtn); });

    var toolbar = App.el('div', { class: 'mb-4 flex flex-wrap items-center gap-2 border-b border-border/40 pb-3' },
      App.el('button', { type: 'button', class: btn1, onclick: function () { addText(); } }, App.icon('plus', '', 14), App.el('span', { text: 'Add Text' })),
      App.el('button', { type: 'button', class: btn2, onclick: function () { fileInput.click(); } }, App.icon('image-plus', '', 14), App.el('span', { text: 'Add Image' })),
      fileInput,
      App.el('button', { type: 'button', class: btn1, onclick: preview }, App.icon('eye', '', 14), App.el('span', { text: 'Preview in New Tab' })),
      copyBtn);

    var hint = App.el('div', { class: 'mt-4 border-t border-border/40 pt-3 text-center font-mono text-xs text-muted-foreground opacity-60', text: 'Drag & drop images here, or paste (Ctrl+V) to append.' });

    var dropzone = App.el('div', {
      class: 'pm-drop',
      ondragover: function (e) { e.preventDefault(); dropzone.classList.add('dragover'); },
      ondragleave: function () { dropzone.classList.remove('dragover'); },
      ondrop: onDrop,
      onpaste: onPaste
    }, toolbar, itemsEl, hint);

    /* ── generated HTML block ── */
    var pre = App.el('pre', { class: 'pm-pre' });
    var genCopyBtn = App.el('button', { type: 'button', class: btn2 }, App.icon('copy', '', 12), App.el('span', { text: 'Copy' }));
    genCopyBtn.addEventListener('click', function () { App.copy(buildHtml(items), genCopyBtn); });

    var genBlock = App.el('div', { class: 'rounded-lg border border-border/60 bg-mantle p-4 hidden' },
      App.el('div', { class: 'mb-2 flex items-center justify-between' },
        App.el('span', { class: 'text-xs font-mono font-medium text-muted-foreground opacity-80', text: 'Generated HTML' }),
        genCopyBtn),
      pre);

    var tip = App.el('p', { class: 'text-xs font-mono text-muted-foreground opacity-60', text: 'Tip: images are embedded as base64 — the HTML is fully self-contained and paste-ready.' });

    root.appendChild(App.el('div', { class: 'flex flex-col', style: { gap: '1rem' } }, dropzone, genBlock, tip));

    renderItems();
    syncOutput();
  }
});
})();
