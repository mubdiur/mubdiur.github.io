/* ═══════════════════════════════════════════════════════════
   Color Converter — ported from src/components/tools/color-converter.tsx.
   HEX ⇄ RGB ⇄ HSL with the exact conversion formulas and
   validation behavior from the source component.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('color-converter', {
  css: '' +
    '.t-color-converter .cc-swatch{width:64px;height:64px;}\n' +
    '.t-color-converter .cc-grid{display:grid;grid-template-columns:repeat(2,1fr);column-gap:1rem;row-gap:0.25rem;}\n' +
    '.t-color-converter .cc-field{background:transparent;border:none;border-bottom:1px solid rgba(51,53,56,0.3);color:rgba(227,227,227,0.8);padding:0 0.25rem;outline:none;font-family:var(--font-mono);font-size:10px;}\n' +
    '.t-color-converter .cc-field:focus{border-color:rgba(83,163,249,0.5);}\n' +
    '.t-color-converter .cc-field.cc-dim{color:rgba(227,227,227,0.6);}\n' +
    '.t-color-converter .cc-picker{height:32px;width:100%;background:transparent;cursor:pointer;}\n',

  mount: function (root) {
    var hex = '#3498db';
    var rgb = '52, 152, 219';
    var hsl = '204, 70%, 53%';
    var color = '#3498db';

    var swatch = App.el('div', { class: 'cc-swatch rounded border border-border/40 shrink-0', style: { backgroundColor: color } });
    var hexInput = App.el('input', { class: 'cc-field', value: hex, spellcheck: 'false', 'aria-label': 'HEX' });
    var rgbInput = App.el('input', { class: 'cc-field', value: rgb, spellcheck: 'false', 'aria-label': 'RGB' });
    var hslInput = App.el('input', { class: 'cc-field cc-dim', value: hsl, readonly: true, 'aria-label': 'HSL' });
    var picker = App.el('input', { type: 'color', class: 'cc-picker block mt-1 rounded', value: color, 'aria-label': 'Pick a color' });

    function fromHex(h) {
      var clean = h.replace('#', '');
      if (clean.length === 3) clean = clean.split('').map(function (c) { return c + c; }).join('');
      if (!/^[0-9a-fA-F]{6}$/.test(clean)) return;
      var r = parseInt(clean.slice(0, 2), 16);
      var g = parseInt(clean.slice(2, 4), 16);
      var b = parseInt(clean.slice(4, 6), 16);
      rgb = r + ', ' + g + ', ' + b;
      rgbInput.value = rgb;
      color = '#' + clean;
      swatch.style.backgroundColor = color;
      picker.value = color;
      // HSL
      var rr = r / 255, gg = g / 255, bb = b / 255;
      var max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
      var hh = 0, ss = 0, ll = (max + min) / 2;
      if (max !== min) {
        var d = max - min;
        ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rr) hh = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
        else if (max === gg) hh = ((bb - rr) / d + 2) * 60;
        else hh = ((rr - gg) / d + 4) * 60;
      }
      hsl = Math.round(hh) + ', ' + Math.round(ss * 100) + '%, ' + Math.round(ll * 100) + '%';
      hslInput.value = hsl;
    }

    function fromRgb(s) {
      var parts = s.split(',').map(function (p) { return parseInt(p.trim(), 10); });
      // Out-of-range channels previously produced garbage hex like #12c00;
      // reject them so only real colors enter the converter.
      if (parts.length !== 3 || parts.some(function (p) { return isNaN(p) || p < 0 || p > 255; })) return;
      var h = '#' + parts.map(function (p) { return p.toString(16).padStart(2, '0'); }).join('');
      hex = h.toUpperCase();
      hexInput.value = hex;
      fromHex(h);
    }

    function clear() {
      hex = '#000000';
      hexInput.value = hex;
      fromHex('#000000');
    }

    hexInput.addEventListener('input', function () {
      hex = hexInput.value;
      if (hexInput.value.length >= 4) fromHex(hexInput.value);
    });

    rgbInput.addEventListener('input', function () {
      rgb = rgbInput.value;
      if (rgbInput.value.indexOf(',') >= 0) fromRgb(rgbInput.value);
    });

    picker.addEventListener('input', function () {
      hex = picker.value.toUpperCase();
      hexInput.value = hex;
      fromHex(picker.value);
    });

    fromHex(hex);

    root.appendChild(App.el('div', { class: 'flex flex-col', style: { gap: '1rem' } },
      App.el('div', { class: 'flex items-center gap-3' },
        swatch,
        App.el('div', { class: 'cc-grid' },
          App.el('span', { class: 'text-[10px] font-mono text-muted-foreground opacity-50', text: 'HEX' }),
          hexInput,
          App.el('span', { class: 'text-[10px] font-mono text-muted-foreground opacity-50', text: 'RGB' }),
          rgbInput,
          App.el('span', { class: 'text-[10px] font-mono text-muted-foreground opacity-50', text: 'HSL' }),
          hslInput)),
      App.el('div', {},
        App.el('div', { class: 'flex items-center justify-between' },
          App.el('span', { class: 'text-[10px] font-mono text-muted-foreground opacity-60', text: 'Pick a color' }),
          App.clearButton(clear)),
        picker)));
  }
});
})();
