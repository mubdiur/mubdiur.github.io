/* ═══════════════════════════════════════════════════════════
   JWT Debugger — ported from src/components/tools/jwt-debugger.tsx.
   Decode and inspect JWT tokens — header, payload, signature.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('jwt-debugger', {
  css: '' +
    '.t-jwt-debugger .jwt-sec{margin-top:0.75rem;}\n' +
    '.t-jwt-debugger .jwt-label{display:flex;align-items:center;gap:0.375rem;font-family:var(--font-mono);font-size:10px;margin-bottom:0.25rem;}\n' +
    '.t-jwt-debugger .jwt-label .btn-copy{margin-left:auto;padding:0.125rem 0.375rem;font-size:10px;}\n' +
    '.t-jwt-debugger .lbl-header{color:rgba(142,192,124,0.7);}\n' +
    '.t-jwt-debugger .lbl-payload{color:rgba(184,187,38,0.7);}\n' +
    '.t-jwt-debugger .lbl-signature{color:rgba(251,146,60,0.7);}\n' +
    '.t-jwt-debugger .jwt-pre{border:1px solid rgba(80,73,69,0.4);background:rgba(0,0,0,0.3);padding:0.5rem;font-family:var(--font-mono);font-size:10px;color:rgba(235,219,178,0.8);border-radius:6px;overflow:auto;white-space:pre-wrap;word-break:break-all;}\n' +
    '.t-jwt-debugger .jwt-hdr{max-height:128px;}\n' +
    '.t-jwt-debugger .jwt-pay{max-height:192px;}\n' +
    '.t-jwt-debugger .jwt-sig{color:rgba(235,219,178,0.6);}\n',

  mount: function (root) {
    var token = '';
    var header = '';
    var payload = '';
    var signature = '';
    var error = null;

    var outputBox = App.el('div');
    var textarea = App.el('textarea', {
      class: 'tool-textarea', rows: 3, spellcheck: 'false',
      placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    });

    var headerPre = App.el('pre', { class: 'jwt-pre jwt-hdr' });
    var payloadPre = App.el('pre', { class: 'jwt-pre jwt-pay' });
    var signaturePre = App.el('pre', { class: 'jwt-pre jwt-sig' });

    function makeCopyBtn(getText) {
      var btn = App.el('button', { class: 'btn-copy', type: 'button' }, App.icon('copy', '', 14), App.el('span', { text: 'Copy' }));
      btn.addEventListener('click', function () { App.copy(getText(), btn); });
      return btn;
    }

    var sections = App.el('div', { class: 'hidden' },
      App.el('div', { class: 'jwt-sec' },
        App.el('div', { class: 'jwt-label lbl-header', text: 'HEADER: ALGORITHM & TOKEN TYPE' }, makeCopyBtn(function () { return header; })),
        headerPre),
      App.el('div', { class: 'jwt-sec' },
        App.el('div', { class: 'jwt-label lbl-payload', text: 'PAYLOAD: DATA' }, makeCopyBtn(function () { return payload; })),
        payloadPre),
      App.el('div', { class: 'jwt-sec' },
        App.el('div', { class: 'jwt-label lbl-signature', text: 'SIGNATURE: VERIFY' }, makeCopyBtn(function () { return signature; })),
        signaturePre));

    function decode() {
      if (!token.trim()) { header = ''; payload = ''; signature = ''; error = null; update(); return; }
      try {
        var result = Transforms.jwtDecode(token.trim());
        header = result.header;
        payload = result.payload;
        signature = result.signature;
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        header = ''; payload = ''; signature = '';
      }
      update();
    }

    function update() {
      headerPre.textContent = header;
      payloadPre.textContent = payload;
      signaturePre.textContent = signature;
      sections.classList.toggle('hidden', !header);
      outputBox.innerHTML = '';
      if (error) outputBox.appendChild(App.outputBox('', error, 'Decoded', clear));
    }

    function clear() {
      token = '';
      textarea.value = '';
      header = ''; payload = ''; signature = ''; error = null;
      update();
    }

    textarea.addEventListener('input', function () { token = textarea.value; decode(); });

    root.appendChild(textarea);
    root.appendChild(sections);
    root.appendChild(outputBox);
  }
});
})();
