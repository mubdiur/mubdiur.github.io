/* ═══════════════════════════════════════════════════════════
   Generic transform tool — input textarea + params + output.
   Ported from TransformTool.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function TransformToolUI(tool) {
  var state = { input: '', output: '', error: null, pending: false, opts: {} };
  (tool.params || []).forEach(function (p) {
    if (p.default !== undefined) state.opts[p.key] = p.default;
  });

  var inputTa = App.el('textarea', {
    class: 'tool-textarea', rows: 6, placeholder: tool.placeholder || 'Paste input here...',
    spellcheck: 'false'
  });
  inputTa.addEventListener('input', App.debounce(function () { state.input = inputTa.value; run(); }, 150));

  var outputArea = App.el('div');
  var fileInput = null;
  var fileNote = null;
  if (tool.fileHash) {
    fileInput = App.el('input', { type: 'file', class: 'input-text', 'aria-label': 'Hash a file', style: 'font-size:12px' });
    fileNote = App.el('div', { class: 'text-xs font-mono', style: { color: 'rgba(141,148,158,0.7)' } });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 33554432) { state.output = ''; state.error = 'File over 32 MB — paste text instead'; state.pending = false; renderOutput(); return; }
      if (!f.arrayBuffer) { state.output = ''; state.error = 'Browser cannot read files here — paste text instead'; state.pending = false; renderOutput(); return; }
      state.pending = true; state.error = null; renderOutput();
      f.arrayBuffer().then(function (buf) {
        var hex = Transforms.hashBytes(tool.slug, new Uint8Array(buf));
        fileNote.textContent = f.name + ' \u00b7 ' + Transforms.formatBytes(String(f.size));
        state.pending = false; state.output = hex; state.error = null; renderOutput();
      }).catch(function (e) {
        state.pending = false; state.output = ''; state.error = e instanceof Error ? e.message : String(e); renderOutput();
      });
    });
  }

  function run() {
    var cancelToken = {};
    run._token = cancelToken;
    if (!state.input.trim()) { state.output = ''; state.error = null; state.pending = false; renderOutput(); return; }
    var handler = tool.handler;
    if (!handler) return;
    var result;
    try {
      result = handler(state.input, state.opts);
    } catch (e) {
      if (run._token !== cancelToken) return;
      state.error = e instanceof Error ? e.message : String(e);
      state.output = '';
      state.pending = false;
      renderOutput();
      return;
    }
    if (result && typeof result.then === 'function') {
      // Async handler (prime-checker long hunts): hold a Working marker so
      // the output never sits silently blank while the promise settles.
      state.output = ''; state.error = null; state.pending = true; renderOutput();
      result.then(function (val) {
        if (run._token !== cancelToken) return;
        state.pending = false; state.output = val; state.error = null; renderOutput();
      }).catch(function (e) {
        if (run._token !== cancelToken) return;
        state.pending = false; state.error = e instanceof Error ? e.message : String(e);
        state.output = '';
        renderOutput();
      });
    } else {
      if (run._token !== cancelToken) return;
      state.pending = false; state.output = result; state.error = null; renderOutput();
    }
  }

  function clear() {
    run._token = {};
    state.input = ''; state.output = ''; state.error = null;
    inputTa.value = '';
    if (fileInput) fileInput.value = '';
    if (fileNote) fileNote.textContent = '';
    renderOutput();
  }

  function downloadOutput() {
    var rawExt = (typeof tool.downloadExt === 'function') ? tool.downloadExt(state.opts) : tool.downloadExt;
    var ext = String(rawExt || 'txt').replace(/[^a-z0-9]/gi, '') || 'txt';
    App.download(tool.slug + '-output.' + ext, state.output, ext === 'csv' ? 'text/csv' : 'text/plain');
  }
  function renderOutput() {
    outputArea.innerHTML = '';
    if (state.pending) {
      outputArea.appendChild(App.el('div', { class: 'output-box', text: 'Working…', 'aria-live': 'polite' }));
      return;
    }
    if (!state.output && !state.error) return;
    outputArea.appendChild(App.outputBox(state.output, state.error, 'Output', clear, downloadOutput));
  }

  /* params */
  var paramsRow = App.el('div', { class: 'flex flex-wrap gap-2' });
  (tool.params || []).forEach(function (p) {
    var control;
    var update = function (val) { state.opts[p.key] = val; run(); };
    if (p.type === 'textarea') {
      // Multi-line secondary input (diffs compare documents, not lines)
      control = App.el('textarea', { class: 'tool-textarea', rows: 5, spellcheck: 'false', 'aria-label': p.label });
      control.addEventListener('input', function () { update(control.value); });
    } else if (p.type === 'select') {
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
      control = App.el('input', { type: 'checkbox', class: 't-checkbox', 'aria-label': p.label, style: 'width:16px;height:16px;accent-color:#53a3f9' });
      control.checked = state.opts[p.key] === 'true';
      control.addEventListener('change', function () { update(control.checked ? 'true' : 'false'); });
    } else if (p.type === 'password') {
      control = App.el('div', { class: 'flex items-center gap-1.5' });
      var pw = App.el('input', { type: 'password', class: 'input-text', style: 'width:12rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label, autocomplete: 'new-password', spellcheck: 'false' });
      pw.value = state.opts[p.key] || '';
      pw.addEventListener('input', function () { update(pw.value); run(); });
      var tog = App.el('button', { class: 'btn-copy', type: 'button', 'aria-label': 'Show secret', text: 'Show' });
      tog.addEventListener('click', function () { var show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; tog.textContent = show ? 'Hide' : 'Show'; });
      control.appendChild(pw); control.appendChild(tog);
    } else {
      control = App.el('input', { type: 'text', class: 'input-text', style: 'width:12rem;padding:0.25rem 0.5rem;font-size:12px;height:28px', 'aria-label': p.label });
      control.value = state.opts[p.key] || '';
      control.addEventListener('input', function () { update(control.value); });
    }
    paramsRow.appendChild(App.el('div', { class: 'flex items-center gap-1.5' },
      App.el('label', { class: 'text-xs font-mono', style: { color: '#8d949e', whiteSpace: 'nowrap' }, text: p.label }),
      control));
  });

  var fileCard = null;
  if (tool.fileHash) {
    fileCard = App.el('div', {},
      App.el('div', { class: 'text-xs font-mono mb-1', style: { color: 'rgba(184,178,178,0.72)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: '600', fontSize: '10.5px' }, text: 'Or hash a file' }),
      fileInput,
      fileNote,
      App.el('div', { class: 'text-xs font-mono', style: { color: 'rgba(141,148,158,0.55)' }, text: '32 MB max \u00b7 hashed locally, never uploaded' }));
  }
  var root = App.el('div', { class: 'flex flex-col', style: { gap: '1.1rem' } },
    paramsRow.childNodes.length ? App.el('div', { style: { background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'10px', padding:'0.6rem 0.75rem' } }, paramsRow) : paramsRow,
    App.el('div', {},
      App.el('div', { class: 'text-xs font-mono mb-1', style: { color: 'rgba(184,178,178,0.72)', letterSpacing:'0.04em', textTransform:'uppercase', fontWeight:'600', fontSize:'10.5px' }, text: 'Input' }),
      inputTa),
    fileCard,
    outputArea);

  return root;
}

window.TransformToolUI = TransformToolUI;
})();
