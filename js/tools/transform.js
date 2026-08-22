/* ═══════════════════════════════════════════════════════════
   Generic transform tool — input textarea + params + output.
   Ported from TransformTool.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function TransformToolUI(tool) {
  var state = { input: '', output: '', error: null, opts: {} };
  (tool.params || []).forEach(function (p) {
    if (p.default !== undefined) state.opts[p.key] = p.default;
  });

  var inputTa = App.el('textarea', {
    class: 'tool-textarea', rows: 6, placeholder: 'Paste input here...',
    spellcheck: 'false'
  });
  inputTa.addEventListener('input', function () { state.input = inputTa.value; run(); });

  var outputArea = App.el('div');

  function run() {
    var cancelToken = {};
    run._token = cancelToken;
    if (!state.input.trim()) { state.output = ''; state.error = null; renderOutput(); return; }
    var handler = tool.handler;
    if (!handler) return;
    var result;
    try {
      result = handler(state.input, state.opts);
    } catch (e) {
      if (run._token !== cancelToken) return;
      state.error = e instanceof Error ? e.message : String(e);
      state.output = '';
      renderOutput();
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(function (val) {
        if (run._token !== cancelToken) return;
        state.output = val; state.error = null; renderOutput();
      }).catch(function (e) {
        if (run._token !== cancelToken) return;
        state.error = e instanceof Error ? e.message : String(e);
        state.output = '';
        renderOutput();
      });
    } else {
      if (run._token !== cancelToken) return;
      state.output = result; state.error = null; renderOutput();
    }
  }

  function clear() {
    state.input = ''; state.output = ''; state.error = null;
    inputTa.value = '';
    renderOutput();
  }

  function renderOutput() {
    outputArea.innerHTML = '';
    if (!state.output && !state.error) return;
    outputArea.appendChild(App.outputBox(state.output, state.error, 'Output', clear));
  }

  /* params */
  var paramsRow = App.el('div', { class: 'flex flex-wrap gap-2' });
  (tool.params || []).forEach(function (p) {
    var control;
    var update = function (val) { state.opts[p.key] = val; run(); };
    if (p.type === 'select') {
      control = App.el('select', { class: 'select-control', 'aria-label': p.label });
      (p.options || []).forEach(function (o) {
        control.appendChild(App.el('option', { value: o.value, text: o.label }));
      });
      control.value = state.opts[p.key] || '';
      control.addEventListener('change', function () { update(control.value); });
    } else if (p.type === 'number') {
      control = App.el('input', { type: 'number', min: p.min, max: p.max, class: 'input-text', style: 'width:4.5rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label });
      control.value = state.opts[p.key] || p.default || '';
      control.addEventListener('input', function () { update(control.value); });
    } else if (p.type === 'boolean' || p.type === 'checkbox') {
      control = App.el('input', { type: 'checkbox', class: 't-checkbox', 'aria-label': p.label, style: 'width:16px;height:16px;accent-color:#a3bfa0' });
      control.checked = state.opts[p.key] === 'true';
      control.addEventListener('change', function () { update(control.checked ? 'true' : 'false'); });
    } else {
      control = App.el('input', { type: 'text', class: 'input-text', style: 'width:12rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label });
      control.value = state.opts[p.key] || '';
      control.addEventListener('input', function () { update(control.value); });
    }
    paramsRow.appendChild(App.el('div', { class: 'flex items-center gap-1.5' },
      App.el('label', { class: 'text-xs font-mono', style: { color: 'rgba(154,134,120,0.7)', whiteSpace: 'nowrap' }, text: p.label }),
      control));
  });

  var root = App.el('div', { class: 'flex flex-col', style: { gap: '1rem' } },
    paramsRow,
    App.el('div', {},
      App.el('div', { class: 'text-xs font-mono mb-1', style: { color: 'rgba(154,134,120,0.7)' }, text: 'Input' }),
      inputTa),
    outputArea);

  return root;
}

window.TransformToolUI = TransformToolUI;
})();
