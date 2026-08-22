/* ═══════════════════════════════════════════════════════════
   Generic generator tool — params + regenerate + output.
   Ported from GeneratorTool.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function GeneratorToolUI(tool) {
  var state = { opts: {}, output: '' };
  (tool.params || []).forEach(function (p) {
    if (p.default !== undefined) state.opts[p.key] = p.default;
  });

  var outputArea = App.el('div');

  function generate() {
    var result;
    try {
      result = tool.genHandler(state.opts);
    } catch (e) {
      state.output = 'Error: ' + (e instanceof Error ? e.message : String(e));
      renderOutput();
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(function (val) { state.output = val; renderOutput(); })
        .catch(function (e) { state.output = 'Error: ' + (e instanceof Error ? e.message : String(e)); renderOutput(); });
    } else {
      state.output = result;
      renderOutput();
    }
  }

  function clear() { state.output = ''; renderOutput(); }

  function renderOutput() {
    outputArea.innerHTML = '';
    if (!state.output) return;
    outputArea.appendChild(App.outputBox(state.output, null, 'Generated', clear));
  }

  var paramsRow = App.el('div', { class: 'flex flex-wrap gap-2 items-center' });
  (tool.params || []).forEach(function (p) {
    var control;
    var update = function (val) { state.opts[p.key] = val; };
    if (p.type === 'select') {
      control = App.el('select', { class: 'select-control', 'aria-label': p.label });
      (p.options || []).forEach(function (o) {
        control.appendChild(App.el('option', { value: o.value, text: o.label }));
      });
      control.value = state.opts[p.key] || '';
      control.addEventListener('change', function () { update(control.value); generate(); });
    } else if (p.type === 'number') {
      control = App.el('input', { type: 'number', min: p.min, max: p.max, class: 'input-text', style: 'width:4.5rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label });
      control.value = state.opts[p.key] || p.default || '';
      control.addEventListener('input', function () { update(control.value); generate(); });
    } else if (p.type === 'boolean' || p.type === 'checkbox') {
      control = App.el('input', { type: 'checkbox', class: 't-checkbox', 'aria-label': p.label, style: 'width:16px;height:16px;accent-color:#a3bfa0' });
      control.checked = state.opts[p.key] === 'true';
      control.addEventListener('change', function () { update(control.checked ? 'true' : 'false'); generate(); });
    } else {
      control = App.el('input', { type: 'text', class: 'input-text', style: 'width:12rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label });
      control.value = state.opts[p.key] || '';
      control.addEventListener('input', function () { update(control.value); generate(); });
    }
    paramsRow.appendChild(App.el('div', { class: 'flex items-center gap-1.5' },
      App.el('label', { class: 'text-xs font-mono', style: { color: 'rgba(154,134,120,0.7)', whiteSpace: 'nowrap' }, text: p.label }),
      control));
  });
  paramsRow.appendChild(App.el('button', {
    class: 'btn-primary-sm', type: 'button',
    style: { marginLeft: 'auto' },
    onclick: generate,
    html: 'Regenerate &#8635;'
  }));

  generate();

  return App.el('div', { class: 'flex flex-col', style: { gap: '1rem' } }, paramsRow, outputArea);
}

window.GeneratorToolUI = GeneratorToolUI;
})();
