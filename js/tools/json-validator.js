/* ═══════════════════════════════════════════════════════════
   JSON Validator — EXAMPLE CUSTOM TOOL.
   Ported from src/components/tools/json-validator.tsx.
   This file is the reference pattern for all custom tool ports:
   IIFE + App.registerTool(slug, { css?, mount(container) }) +
   App.el / App.icon / App.outputBox helpers + scoped CSS under .t-<slug>.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('json-validator', {
  css: '' +
    '.t-json-validator .seg{display:flex;border:1px solid rgba(80,73,69,0.4);border-radius:6px;overflow:hidden;}\n' +
    '.t-json-validator .seg button{padding:0.25rem 0.625rem;font-family:var(--font-mono);font-size:10px;background:rgba(0,0,0,0.2);color:rgba(189,174,147,0.6);border:none;cursor:pointer;border-right:1px solid rgba(80,73,69,0.4);transition:all .15s;}\n' +
    '.t-json-validator .seg button:last-child{border-right:none;}\n' +
    '.t-json-validator .seg button:hover{color:rgba(235,219,178,0.9);}\n' +
    '.t-json-validator .seg button.active{background:rgba(142,192,124,0.15);color:var(--cyan-glow);}\n' +
    '.t-json-validator .toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-bottom:0.75rem;}\n',

  mount: function (root) {
    var mode = 'validate';
    var indent = 2;
    var input = '';

    var outputBox = App.el('div');
    var textarea = App.el('textarea', {
      class: 'tool-textarea', rows: 8, spellcheck: 'false',
      placeholder: '{"name": "example", "data": [1, 2, 3]}'
    });

    function run() {
      if (!input.trim()) { outputBox.innerHTML = ''; return; }
      try {
        if (mode === 'validate') {
          var result = Transforms.validateJSON(input);
          if (result.valid) {
            var type = Array.isArray(result.data) ? 'Array[' + result.data.length + ']' : typeof result.data;
            setOutput('✓ Valid JSON\n\nType: ' + type + '\nSize: ' + new Blob([input]).size + ' bytes\n\nFormatted preview:\n' + JSON.stringify(result.data, null, 2).slice(0, 2000), null);
          } else {
            setOutput('', result.error || 'Invalid JSON');
          }
        } else if (mode === 'format') {
          setOutput(Transforms.formatJSON(input, indent), null);
        } else {
          setOutput(Transforms.minifyJSON(input), null);
        }
      } catch (e) {
        setOutput('', e instanceof Error ? e.message : String(e));
      }
    }

    function setOutput(output, error) {
      outputBox.innerHTML = '';
      outputBox.appendChild(App.outputBox(output, error, 'Output', clear));
    }

    function clear() {
      input = '';
      textarea.value = '';
      outputBox.innerHTML = '';
    }

    textarea.addEventListener('input', function () { input = textarea.value; run(); });

    var seg = App.el('div', { class: 'seg' });
    ['validate', 'format', 'minify'].forEach(function (m) {
      var btn = App.el('button', {
        type: 'button',
        class: m === mode ? 'active' : '',
        text: m === 'validate' ? 'Validate' : m === 'format' ? 'Format' : 'Minify'
      });
      btn.addEventListener('click', function () {
        mode = m;
        seg.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (mode === 'format') indentSel.style.display = '';
        else indentSel.style.display = 'none';
        run();
      });
      seg.appendChild(btn);
    });

    var indentSel = App.el('select', { class: 'select-control', 'aria-label': 'Indent' });
    [2, 4, 1].forEach(function (v) {
      indentSel.appendChild(App.el('option', { value: String(v), text: v + ' space' + (v === 1 ? '' : 's') }));
    });
    indentSel.value = '2';
    indentSel.style.display = 'none';
    indentSel.addEventListener('change', function () { indent = parseInt(indentSel.value, 10); run(); });

    var toolbar = App.el('div', { class: 'toolbar' }, seg, indentSel);
    root.appendChild(toolbar);
    root.appendChild(textarea);
    root.appendChild(outputBox);
  }
});
})();
