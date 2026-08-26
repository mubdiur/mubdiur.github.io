/* ═══════════════════════════════════════════════════════════
   Contrast Checker — CUSTOM TOOL.
   Ported from src/components/tools/contrast-checker.tsx.
   WCAG contrast ratio between two colors with live AA/AAA
   pass-fail badges. hexToRgb / luminance / contrastRatio math
   is ported VERBATIM from the TSX.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function hexToRgb(hex) {
  var h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('Invalid hex');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(r, g, b) {
  var ch = [r, g, b].map(function (v) {
    var s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrastRatio(c1, c2) {
  var l1 = luminance(c1[0], c1[1], c1[2]);
  var l2 = luminance(c2[0], c2[1], c2[2]);
  var lighter = Math.max(l1, l2);
  var darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

App.registerTool('contrast-checker', {
  css: '' +
    '.t-contrast-checker .color-input{display:block;width:100%;height:2.5rem;border:1px solid rgba(51,53,56,0.4);border-radius:var(--radius);margin-top:0.25rem;cursor:pointer;}\n' +
    '.t-contrast-checker .hex-input{width:100%;height:1.75rem;margin-top:0.25rem;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);padding:0 0.5rem;font-size:10px;font-family:var(--font-mono);color:rgba(227,227,227,0.8);border-radius:var(--radius);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-contrast-checker .hex-input:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-contrast-checker .text-muted-foreground\\/60{color:rgba(141,148,158,0.6);}\n' +
    '.t-contrast-checker .text-muted-foreground\\/70{color:rgba(141,148,158,0.7);}\n' +
    '.t-contrast-checker .bg-black\\/10{background:rgba(0,0,0,0.1);}\n' +
    '.t-contrast-checker .text-green-glow\\/80{color:rgba(83,163,249,0.8);}\n' +
    '.t-contrast-checker .text-red-400\\/80{color:rgba(248,113,113,0.8);}\n' +
    '.t-contrast-checker .space-y-1\\.5 > * + *{margin-top:0.375rem;}\n',

  mount: function (root) {
    var fg = '#ffffff';
    var bg = '#000000';

    var fgColor = App.el('input', { type: 'color', value: fg, class: 'color-input', 'aria-label': 'Foreground color' });
    var bgColor = App.el('input', { type: 'color', value: bg, class: 'color-input', 'aria-label': 'Background color' });
    var fgHex = App.el('input', { value: fg, spellcheck: 'false', class: 'hex-input', 'aria-label': 'Foreground hex' });
    var bgHex = App.el('input', { value: bg, spellcheck: 'false', class: 'hex-input', 'aria-label': 'Background hex' });

    var preview = App.el('div', {
      class: 'rounded border border-border/40 p-4 text-center font-mono text-sm',
      text: 'Sample text — The quick brown fox jumps over the lazy dog.'
    });
    var resultsBox = App.el('div', { class: 'space-y-1.5 text-xs font-mono' });

    function compute() {
      try {
        var f = hexToRgb(fg);
        var b = hexToRgb(bg);
        var ratio = contrastRatio(f, b);
        var aaLarge = ratio >= 3;
        var aaSmall = ratio >= 4.5;
        var aaaSmall = ratio >= 7;
        return { ratio: ratio.toFixed(2), aaLarge: aaLarge, aaSmall: aaSmall, aaaSmall: aaaSmall, aaa: aaaSmall };
      } catch (e) { return null; }
    }

    function render() {
      fgColor.value = fg;
      bgColor.value = bg;
      fgHex.value = fg;
      bgHex.value = bg;
      preview.style.backgroundColor = bg;
      preview.style.color = fg;

      var result = compute();
      resultsBox.innerHTML = '';
      if (!result) return;

      resultsBox.appendChild(App.el('div', { class: 'flex justify-between items-center py-1.5 px-2 rounded bg-black/20' },
        App.el('span', { class: 'text-muted-foreground/70', text: 'Contrast Ratio' }),
        App.el('span', { class: 'text-lg font-bold', style: { color: parseFloat(result.ratio) >= 4.5 ? '#26b226' : '#ffffff' }, text: result.ratio + ':1' })));

      [
        { label: 'WCAG AA Normal Text (≥ 4.5:1)', pass: result.aaSmall },
        { label: 'WCAG AA Large Text (≥ 3:1)', pass: result.aaLarge },
        { label: 'WCAG AAA Normal Text (≥ 7:1)', pass: result.aaaSmall }
      ].forEach(function (item) {
        resultsBox.appendChild(App.el('div', { class: 'flex justify-between items-center py-1 px-2 rounded bg-black/10' },
          App.el('span', { class: 'text-muted-foreground/60 text-[10px]', text: item.label }),
          App.el('span', { class: 'text-[10px] font-bold ' + (item.pass ? 'text-green-glow/80' : 'text-red-400/80'), text: item.pass ? 'PASS ✓' : 'FAIL ✗' })));
      });
    }

    fgColor.addEventListener('input', function () { fg = fgColor.value; render(); });
    bgColor.addEventListener('input', function () { bg = bgColor.value; render(); });

    function normalizeHex(v) {
      var h = String(v).trim();
      if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
      return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null;
    }
    fgHex.addEventListener('input', function () { var n = normalizeHex(fgHex.value); if (n) { fg = n; render(); } });
    bgHex.addEventListener('input', function () { var n = normalizeHex(bgHex.value); if (n) { bg = n; render(); } });

    root.appendChild(App.el('div', { class: 'grid grid-cols-2 gap-3' },
      App.el('div', {},
        App.el('span', { class: 'text-[10px] font-mono text-muted-foreground/60', text: 'Foreground' }),
        fgColor, fgHex),
      App.el('div', {},
        App.el('span', { class: 'text-[10px] font-mono text-muted-foreground/60', text: 'Background' }),
        bgColor, bgHex)));
    root.appendChild(preview);
    root.appendChild(resultsBox);

    render();
  }
});
})();
