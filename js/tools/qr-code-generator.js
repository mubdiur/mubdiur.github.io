/* ═══════════════════════════════════════════════════════════
   QR Code Generator — WebAssembly core (wasm/core.wasm).
   Produces real, scannable QR codes (ISO/IEC 18004, full spec:
   Reed-Solomon ECC, mask selection, format info — versions 1-40).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('qr-code-generator', {
  css: '' +
    '.t-qr-code-generator .qr-input{width:100%;height:32px;border:1px solid rgba(75,64,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 8px;font-family:var(--font-mono);font-size:12px;color:rgba(202,170,152,0.9);outline:none;}\n' +
    '.t-qr-code-generator .qr-input:focus{border-color:rgba(163,191,160,0.4);box-shadow:0 0 0 1px rgba(163,191,160,0.3);}\n' +
    '.t-qr-code-generator .qr-input::placeholder{color:rgba(154,134,120,0.3);}\n' +
    '.t-qr-code-generator .qr-stage{display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px;padding:16px;border:1px solid rgba(75,64,56,0.3);min-height:220px;}\n' +
    '.t-qr-code-generator .qr-stage canvas{max-width:100%;height:auto;image-rendering:pixelated;}\n' +
    '.t-qr-code-generator .qr-meta{display:flex;align-items:center;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:rgba(154,134,120,0.5);gap:0.5rem;flex-wrap:wrap;}\n' +
    '.t-qr-code-generator .qr-meta select{height:24px;border:1px solid rgba(75,64,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 6px;font-family:var(--font-mono);font-size:10px;color:rgba(202,170,152,0.7);}\n' +
    '.t-qr-code-generator .ecl-row{display:flex;gap:0.375rem;flex-wrap:wrap;}\n' +
    '.t-qr-code-generator .ecl-row button{padding:0.25rem 0.625rem;border-radius:6px;font-family:var(--font-mono);font-size:10px;background:rgba(163,191,160,0.1);border:1px solid rgba(163,191,160,0.2);color:rgba(163,191,160,0.8);cursor:pointer;}\n' +
    '.t-qr-code-generator .ecl-row button.active{background:rgba(163,191,160,0.2);border-color:rgba(163,191,160,0.4);color:var(--ctp-teal);}\n' +
    '.t-qr-code-generator .qr-error{color:var(--ctp-red);font-family:var(--font-mono);font-size:12px;padding:2rem 0;text-align:center;}',

  mount: function (root) {
    var text = 'https://mubdiur.github.io';
    var ecl = 1; // M
    var pxSize = 280;

    var canvas = App.el('canvas');
    var stage = App.el('div', { class: 'qr-stage' }, canvas);

    function draw() {
      if (!text.trim()) return;
      try {
        var qr = Core.qrEncode(text.trim(), ecl);
        var n = qr.size;
        var cell = Math.floor(pxSize / (n + 8));
        cell = Math.max(cell, 1);
        var pad = 4 * cell;
        var dim = n * cell + pad * 2;
        canvas.width = dim;
        canvas.height = dim;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dim, dim);
        ctx.fillStyle = '#000000';
        for (var y = 0; y < n; y++) {
          for (var x = 0; x < n; x++) {
            if (qr.matrix[y * n + x]) ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell);
          }
        }
        canvas.style.width = Math.min(pxSize, 420) + 'px';
        errorNode.classList.add('hidden');
      } catch (e) {
        errorNode.textContent = e instanceof Error ? e.message : String(e);
        errorNode.classList.remove('hidden');
      }
    }

    var errorNode = App.el('div', { class: 'qr-error hidden' });

    var input = App.el('input', { class: 'qr-input', value: text, spellcheck: 'false', placeholder: 'Enter text or URL...' });
    input.addEventListener('input', function () { text = input.value; draw(); });

    var sizeSel = App.el('select');
    [[168, 'Small'], [280, 'Medium'], [420, 'Large'], [560, 'XL']].forEach(function (o) {
      sizeSel.appendChild(App.el('option', { value: String(o[0]), text: o[1] }));
    });
    sizeSel.value = '280';
    sizeSel.addEventListener('change', function () { pxSize = parseInt(sizeSel.value, 10); draw(); });

    var eclRow = App.el('div', { class: 'ecl-row' });
    [['L', 0], ['M', 1], ['Q', 2], ['H', 3]].forEach(function (o) {
      var b = App.el('button', { type: 'button', class: o[1] === ecl ? 'active' : '', text: o[0] });
      b.addEventListener('click', function () {
        ecl = o[1];
        eclRow.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        draw();
      });
      eclRow.appendChild(b);
    });

    var downloadBtn = App.el('button', { class: 'btn-primary-sm', type: 'button' }, App.icon('download', '', 14), App.el('span', { text: 'PNG' }));
    downloadBtn.addEventListener('click', function () {
      if (!canvas.width) return;
      var a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'qrcode.png';
      a.click();
    });

    root.appendChild(App.el('div', { class: 'flex flex-col', style: { gap: '0.75rem' } },
      App.el('span', { class: 'text-[10px] font-mono', style: { color: 'rgba(154,134,120,0.6)' }, text: 'Text or URL to encode — WebAssembly core, versions 1-40' }),
      input,
      eclRow,
      stage,
      errorNode,
      App.el('div', { class: 'qr-meta' },
        App.el('span', { id: 'qr-charcount' }),
        App.el('div', { class: 'flex items-center', style: { gap: '0.5rem' } },
          App.el('span', { text: 'Size' }),
          sizeSel,
          downloadBtn))));

    var charCount = root.querySelector('#qr-charcount');
    function updateCount() { charCount.textContent = text.length + ' chars'; }
    input.addEventListener('input', updateCount);

    draw();
    updateCount();
  }
});
})();
