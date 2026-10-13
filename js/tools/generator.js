/* ═══════════════════════════════════════════════════════════
   Generic generator tool — params + regenerate + output.
   Ported from GeneratorTool.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function GeneratorToolUI(tool) {
  var state = { opts: {}, output: '', pending: false };
  (tool.params || []).forEach(function (p) {
    if (p.default !== undefined) state.opts[p.key] = p.default;
  });

  var outputArea = App.el('div');

  function generate() {
    // Token guards the latent race: a slow async handler resolving after a
    // newer run must never overwrite fresher output.
    var cancelToken = {};
    generate._token = cancelToken;
    var result;
    try {
      result = tool.genHandler(state.opts);
    } catch (e) {
      state.pending = false;
      state.output = 'Error: ' + (e instanceof Error ? e.message : String(e));
      renderOutput();
      return;
    }
    if (result && typeof result.then === 'function') {
      state.pending = true; renderOutput();
      result.then(function (val) {
        if (generate._token !== cancelToken) return;
        state.pending = false; state.output = val; renderOutput();
      })
        .catch(function (e) {
          if (generate._token !== cancelToken) return;
          state.pending = false; state.output = 'Error: ' + (e instanceof Error ? e.message : String(e)); renderOutput();
        });
    } else {
      state.pending = false;
      state.output = result;
      renderOutput();
    }
  }

  function clear() { generate._token = {}; state.output = ''; state.pending = false; renderOutput(); }

  function downloadOutput() {
    var rawExt = (typeof tool.downloadExt === 'function') ? tool.downloadExt(state.opts) : tool.downloadExt;
    var ext = String(rawExt || 'txt').replace(/[^a-z0-9]/gi, '') || 'txt';
    App.download(tool.slug + '-output.' + ext, state.output, 'text/plain');
  }
  function renderOutput() {
    outputArea.innerHTML = '';
    if (state.pending) {
      outputArea.appendChild(App.el('div', { class: 'output-box', text: 'Working…', 'aria-live': 'polite' }));
      return;
    }
    if (!state.output) return;
    /* Generator errors ride in state.output with an 'Error: ' prefix,
       so offer Download for real output only. */
    var canSave = state.output.indexOf('Error: ') !== 0;
    outputArea.appendChild(App.outputBox(state.output, null, 'Generated', clear, canSave ? downloadOutput : null));
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
      control = App.el('input', { type: 'checkbox', class: 't-checkbox', 'aria-label': p.label, style: 'width:16px;height:16px;accent-color:#53a3f9' });
      control.checked = state.opts[p.key] === 'true';
      control.addEventListener('change', function () { update(control.checked ? 'true' : 'false'); generate(); });
    } else if (p.type === 'password') {
      control = App.el('div', { class: 'flex items-center gap-1.5' });
      var pw = App.el('input', { type: 'password', class: 'input-text', style: 'width:12rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label, autocomplete: 'new-password', spellcheck: 'false' });
      pw.value = state.opts[p.key] || p.default || '';
      pw.addEventListener('input', function () { update(pw.value); generate(); });
      var tog = App.el('button', { class: 'btn-copy', type: 'button', 'aria-label': 'Show secret', text: 'Show' });
      tog.addEventListener('click', function () { var show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; tog.textContent = show ? 'Hide' : 'Show'; });
      control.appendChild(pw); control.appendChild(tog);
    } else {
      control = App.el('input', { type: 'text', class: 'input-text', style: 'width:12rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label });
      control.value = state.opts[p.key] || '';
      control.addEventListener('input', function () { update(control.value); generate(); });
    }
    paramsRow.appendChild(App.el('div', { class: 'flex items-center gap-1.5' },
      App.el('label', { class: 'text-xs font-mono', style: { color: '#8d949e', whiteSpace: 'nowrap' }, text: p.label }),
      control));
  });
  paramsRow.appendChild(App.el('button', {
    class: 'btn-primary-sm', type: 'button',
    style: { marginLeft: 'auto' },
    onclick: generate,
    html: 'Regenerate &#8635;'
  }));

  generate();

  return App.el('div', { class: 'flex flex-col', style: { gap: '1.1rem' } },
    App.el('div', { style: { background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'10px', padding:'0.6rem 0.75rem', display:'flex', flexWrap:'wrap', gap:'0.5rem', alignItems:'center' } }, paramsRow),
    outputArea);
}

window.GeneratorToolUI = GeneratorToolUI;
})();
