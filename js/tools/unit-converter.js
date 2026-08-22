/* ═══════════════════════════════════════════════════════════
   Unit Converter — ported from src/components/tools/unit-converter.tsx.
   Length / mass / temperature / data conversion tables with
   exact factors and formulas from the source component.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var conversions = {
  length: [
    { unit: 'Meters', toBase: function (v) { return v; }, fromBase: function (v) { return v; } },
    { unit: 'Kilometers', toBase: function (v) { return v * 1000; }, fromBase: function (v) { return v / 1000; } },
    { unit: 'Centimeters', toBase: function (v) { return v / 100; }, fromBase: function (v) { return v * 100; } },
    { unit: 'Millimeters', toBase: function (v) { return v / 1000; }, fromBase: function (v) { return v * 1000; } },
    { unit: 'Miles', toBase: function (v) { return v * 1609.344; }, fromBase: function (v) { return v / 1609.344; } },
    { unit: 'Yards', toBase: function (v) { return v * 0.9144; }, fromBase: function (v) { return v / 0.9144; } },
    { unit: 'Feet', toBase: function (v) { return v * 0.3048; }, fromBase: function (v) { return v / 0.3048; } },
    { unit: 'Inches', toBase: function (v) { return v * 0.0254; }, fromBase: function (v) { return v / 0.0254; } },
    { unit: 'Nautical Miles', toBase: function (v) { return v * 1852; }, fromBase: function (v) { return v / 1852; } }
  ],
  mass: [
    { unit: 'Kilograms', toBase: function (v) { return v; }, fromBase: function (v) { return v; } },
    { unit: 'Grams', toBase: function (v) { return v / 1000; }, fromBase: function (v) { return v * 1000; } },
    { unit: 'Milligrams', toBase: function (v) { return v / 1e6; }, fromBase: function (v) { return v * 1e6; } },
    { unit: 'Metric Tons', toBase: function (v) { return v * 1000; }, fromBase: function (v) { return v / 1000; } },
    { unit: 'Pounds', toBase: function (v) { return v * 0.453592; }, fromBase: function (v) { return v / 0.453592; } },
    { unit: 'Ounces', toBase: function (v) { return v * 0.0283495; }, fromBase: function (v) { return v / 0.0283495; } },
    { unit: 'Stones', toBase: function (v) { return v * 6.35029; }, fromBase: function (v) { return v / 6.35029; } }
  ],
  temperature: [
    { unit: 'Celsius', toBase: function (v) { return v; }, fromBase: function (v) { return v; } },
    { unit: 'Fahrenheit', toBase: function (v) { return (v - 32) * 5 / 9; }, fromBase: function (v) { return v * 9 / 5 + 32; } },
    { unit: 'Kelvin', toBase: function (v) { return v - 273.15; }, fromBase: function (v) { return v + 273.15; } }
  ],
  data: [
    { unit: 'Bytes', toBase: function (v) { return v; }, fromBase: function (v) { return v; } },
    { unit: 'Kilobytes (KB)', toBase: function (v) { return v * 1000; }, fromBase: function (v) { return v / 1000; } },
    { unit: 'Megabytes (MB)', toBase: function (v) { return v * 1e6; }, fromBase: function (v) { return v / 1e6; } },
    { unit: 'Gigabytes (GB)', toBase: function (v) { return v * 1e9; }, fromBase: function (v) { return v / 1e9; } },
    { unit: 'Terabytes (TB)', toBase: function (v) { return v * 1e12; }, fromBase: function (v) { return v / 1e12; } },
    { unit: 'Kibibytes (KiB)', toBase: function (v) { return v * 1024; }, fromBase: function (v) { return v / 1024; } },
    { unit: 'Mebibytes (MiB)', toBase: function (v) { return v * 1048576; }, fromBase: function (v) { return v / 1048576; } },
    { unit: 'Gibibytes (GiB)', toBase: function (v) { return v * 1073741824; }, fromBase: function (v) { return v / 1073741824; } }
  ]
};

App.registerTool('unit-converter', {
  css: '' +
    '.t-unit-converter .uc-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;align-items:center;}\n' +
    '.t-unit-converter .uc-sel{height:28px;border:1px solid rgba(49,50,68,0.4);background:rgba(0,0,0,0.3);font-family:var(--font-mono);font-size:12px;color:rgba(205,214,244,0.8);outline:none;}\n' +
    '.t-unit-converter .uc-sel:focus{border-color:rgba(148,226,213,0.4);box-shadow:0 0 0 1px rgba(148,226,213,0.3);}\n' +
    '.t-unit-converter .uc-sel-sm{font-size:10px;color:rgba(205,214,244,0.7);}\n' +
    '.t-unit-converter .uc-input{width:100%;height:32px;border:1px solid rgba(49,50,68,0.4);background:rgba(0,0,0,0.3);padding:0 0.5rem;font-family:var(--font-mono);font-size:12px;color:rgba(205,214,244,0.9);outline:none;}\n' +
    '.t-unit-converter .uc-input:focus{border-color:rgba(148,226,213,0.4);box-shadow:0 0 0 1px rgba(148,226,213,0.3);}\n' +
    '.t-unit-converter .uc-result{width:100%;height:32px;border:1px solid rgba(49,50,68,0.4);background:rgba(0,0,0,0.4);padding:0 0.5rem;font-family:var(--font-mono);font-size:12px;color:rgba(148,226,213,0.8);display:flex;align-items:center;white-space:nowrap;overflow:hidden;}\n' +
    '.t-unit-converter .uc-swap{margin-top:1.5rem;padding:0.25rem 0.5rem;font-family:var(--font-mono);font-size:10px;color:rgba(148,226,213,0.7);background:none;border:none;cursor:pointer;transition:color .2s,background-color .2s;}\n' +
    '.t-unit-converter .uc-swap:hover{background:rgba(148,226,213,0.1);}\n',

  mount: function (root) {
    var type = 'length';
    var fromUnit = 0;
    var toUnit = 1;
    var value = '1';
    var result = '';

    var typeSel = App.el('select', { class: 'uc-sel rounded px-2 text-xs', 'aria-label': 'Conversion type' });
    Object.keys(conversions).forEach(function (t) {
      typeSel.appendChild(App.el('option', { value: t, text: t.charAt(0).toUpperCase() + t.slice(1) }));
    });
    typeSel.value = type;

    var valueInput = App.el('input', { type: 'number', class: 'uc-input rounded w-full mt-1', value: value });
    var fromSel = App.el('select', { class: 'uc-sel uc-sel-sm rounded w-full mt-1 px-1.5', 'aria-label': 'From unit' });
    var toSel = App.el('select', { class: 'uc-sel uc-sel-sm rounded w-full mt-1 px-1.5', 'aria-label': 'To unit' });
    var resultBox = App.el('div', { class: 'uc-result rounded w-full mt-1' });
    var swapBtn = App.el('button', { type: 'button', class: 'uc-swap rounded px-2 py-1 transition-colors', 'aria-label': 'Swap units', text: '⇄' });

    function renderUnitOptions() {
      fromSel.innerHTML = '';
      toSel.innerHTML = '';
      conversions[type].forEach(function (u, i) {
        fromSel.appendChild(App.el('option', { value: String(i), text: u.unit }));
        toSel.appendChild(App.el('option', { value: String(i), text: u.unit }));
      });
      fromSel.value = String(fromUnit);
      toSel.value = String(toUnit);
    }

    function convert() {
      var v = parseFloat(value);
      if (isNaN(v)) { result = ''; resultBox.textContent = ''; return; }
      var units = conversions[type];
      var base = units[fromUnit].toBase(v);
      var converted = units[toUnit].fromBase(base);
      result = converted.toPrecision(10).replace(/\.?0+$/, '');
      resultBox.textContent = result;
    }

    function clear() {
      value = '';
      valueInput.value = '';
      result = '';
      resultBox.textContent = '';
    }

    typeSel.addEventListener('change', function () {
      type = typeSel.value;
      fromUnit = 0;
      toUnit = 1;
      renderUnitOptions();
    });

    valueInput.addEventListener('input', function () { value = valueInput.value; });
    valueInput.addEventListener('keyup', convert);

    fromSel.addEventListener('change', function () { fromUnit = parseInt(fromSel.value, 10); convert(); });
    toSel.addEventListener('change', function () { toUnit = parseInt(toSel.value, 10); convert(); });

    swapBtn.addEventListener('click', function () {
      var t = fromUnit;
      fromUnit = toUnit;
      toUnit = t;
      renderUnitOptions();
      convert();
    });

    renderUnitOptions();

    root.appendChild(App.el('div', { class: 'flex flex-col', style: { gap: '0.75rem' } },
      App.el('div', { class: 'flex flex-wrap items-center gap-2' },
        typeSel,
        App.clearButton(clear)),
      App.el('div', { class: 'uc-grid' },
        App.el('div', {},
          App.el('span', { class: 'text-[10px] font-mono text-muted-foreground opacity-60', text: 'From' }),
          valueInput,
          fromSel),
        swapBtn,
        App.el('div', {},
          App.el('span', { class: 'text-[10px] font-mono text-muted-foreground opacity-60', text: 'To' }),
          resultBox,
          toSel))));
  }
});
})();
