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
    '.t-json-validator .seg{display:flex;border:1px solid rgba(51,53,56,0.4);border-radius:6px;overflow:hidden;}\n' +
    '.t-json-validator .seg button{padding:0.25rem 0.625rem;font-family:var(--font-mono);font-size:10px;background:rgba(0,0,0,0.2);color:rgba(141,148,158,0.6);border:none;cursor:pointer;border-right:1px solid rgba(51,53,56,0.4);transition:all .15s;}\n' +
    '.t-json-validator .seg button:last-child{border-right:none;}\n' +
    '.t-json-validator .seg button:hover{color:rgba(227,227,227,0.9);}\n' +
    '.t-json-validator .seg button.active{background:rgba(83,163,249,0.15);color:var(--cyan-glow);}\n' +
    '.t-json-validator .toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-bottom:0.75rem;}\n' +
    '.t-json-validator .badge{margin-left:auto;font-family:var(--font-mono);font-size:11px;padding:0.2rem 0.6rem;border-radius:999px;border:1px solid;}\n' +
    '.t-json-validator .badge.ok{color:var(--green-glow);border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.08);}\n' +
    '.t-json-validator .badge.bad{color:var(--destructive);border-color:rgba(255,100,103,0.4);background:rgba(255,100,103,0.08);}\n',

  mount: function (root) {
    var mode = 'validate';
    var indent = 2;
    var input = '';

    var outputBox = App.el('div');
    var badge = App.el('span', { class: 'badge hidden', role: 'status', text: '' });
    var textarea = App.el('textarea', {
      class: 'tool-textarea', rows: 8, spellcheck: 'false',
      placeholder: '{"name": "example", "data": [1, 2, 3]}'
    });

    function run() {
      if (!input.trim()) { outputBox.innerHTML = ''; setBadge(null); return; }
      try {
        if (mode === 'validate') {
          var result = Transforms.validateJSON(input);
          if (result.valid) {
            var type = Array.isArray(result.data) ? 'Array[' + result.data.length + ']' : typeof result.data;
            setOutput('✓ Valid JSON\n\nType: ' + type + '\nSize: ' + new Blob([input]).size + ' bytes\n\nFormatted preview:\n' + JSON.stringify(result.data, null, 2).slice(0, 2000), null);
          } else {
            setOutput('', result.error || 'Invalid JSON');
          }
          setBadge(Transforms.jsonBadge('validate', result.valid));
        } else if (mode === 'format') {
          setOutput(Transforms.formatJSON(input, indent), null);
          setBadge(Transforms.jsonBadge('format', true));
        } else {
          setOutput(Transforms.minifyJSON(input), null);
          setBadge(Transforms.jsonBadge('minify', true));
        }
      } catch (e) {
        setOutput('', e instanceof Error ? e.message : String(e));
        setBadge(Transforms.jsonBadge(mode, false));
      }
    }

    function setBadge(b) {
      if (!b) { badge.classList.add('hidden'); return; }
      badge.textContent = b.text;
      badge.setAttribute('aria-label', b.text);
      badge.classList.remove('hidden');
      badge.classList.toggle('ok', b.cls === 'ok');
      badge.classList.toggle('bad', b.cls !== 'ok');
    }

    function setOutput(output, error) {
      outputBox.innerHTML = '';
      var canSave = !error && output;
      outputBox.appendChild(App.outputBox(output, error, 'Output', clear, canSave ? function () { App.download('json-validator-output.json', output, 'application/json'); } : null));
    }

    function clear() {
      input = '';
      textarea.value = '';
      setBadge(null);
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

    var toolbar = App.el('div', { class: 'toolbar' }, seg, indentSel, badge);
    root.appendChild(toolbar);
    root.appendChild(textarea);
    root.appendChild(outputBox);
  }
});
})();
