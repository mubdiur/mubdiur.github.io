/* ═══════════════════════════════════════════════════════════
   JWT Debugger.
   Decode and inspect JWT tokens — header, payload, signature,
   human-readable registered claims with expiry badges, and real
   HS256 signature verification through the WebAssembly HMAC core
   (Core.hmacHex). Everything stays in the browser.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('jwt-debugger', {
  css: '' +
    '.t-jwt-debugger .jwt-sec{margin-top:0.75rem;}\n' +
    '.t-jwt-debugger .jwt-label{display:flex;align-items:center;gap:0.375rem;font-family:var(--font-mono);font-size:10px;margin-bottom:0.25rem;}\n' +
    '.t-jwt-debugger .jwt-label .btn-copy{margin-left:auto;padding:0.125rem 0.375rem;font-size:10px;}\n' +
    '.t-jwt-debugger .lbl-header{color:var(--ctp-blue);}\n' +
    '.t-jwt-debugger .lbl-payload{color:var(--ctp-blue);}\n' +
    '.t-jwt-debugger .lbl-signature{color:var(--ctp-yellow);}\n' +
    '.t-jwt-debugger .jwt-pre{border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);padding:0.5rem;font-family:var(--font-mono);font-size:10px;color:rgba(227,227,227,0.8);border-radius:6px;overflow:auto;white-space:pre-wrap;word-break:break-all;}\n' +
    '.t-jwt-debugger .jwt-hdr{max-height:128px;}\n' +
    '.t-jwt-debugger .jwt-pay{max-height:192px;}\n' +
    '.t-jwt-debugger .jwt-sig{color:rgba(227,227,227,0.6);}\n' +
    '.t-jwt-debugger .claims{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.375rem;margin-top:0.5rem;}\n' +
    '.t-jwt-debugger .claim{border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.2);border-radius:6px;padding:0.375rem 0.5rem;font-family:var(--font-mono);}\n' +
    '.t-jwt-debugger .claim .ck{font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(141,148,158,0.9);}\n' +
    '.t-jwt-debugger .claim .cv{font-size:11px;color:rgba(227,227,227,0.9);word-break:break-all;margin-top:0.125rem;}\n' +
    '.t-jwt-debugger .claim .cs{font-size:9px;margin-top:0.25rem;}\n' +
    '.t-jwt-debugger .cs.ok{color:var(--ctp-green);}\n' +
    '.t-jwt-debugger .cs.bad{color:var(--ctp-red);}\n' +
    '.t-jwt-debugger .verify-row{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-top:0.75rem;}\n' +
    '.t-jwt-debugger .secret-input{flex:1;min-width:10rem;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);color:rgba(227,227,227,0.9);font-family:var(--font-mono);font-size:12px;padding:0.375rem 0.625rem;border-radius:6px;outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-jwt-debugger .secret-input:focus{border-color:rgba(83,163,249,0.45);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-jwt-debugger .btn-verify{display:flex;align-items:center;gap:0.375rem;padding:0.375rem 0.75rem;border-radius:6px;background:rgba(83,163,249,0.12);border:1px solid rgba(83,163,249,0.3);color:var(--ctp-teal);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:background-color .2s;}\n' +
    '.t-jwt-debugger .btn-verify:hover{background:rgba(83,163,249,0.2);}\n' +
    '.t-jwt-debugger .verdict{font-family:var(--font-mono);font-size:12px;margin-top:0.5rem;}\n',

  mount: function (root) {
    var token = '';
    var header = '', payload = '', signature = '';
    var rawHeader = null, rawPayload = null;
    var error = null;

    var outputBox = App.el('div');
    var textarea = App.el('textarea', {
      class: 'tool-textarea', rows: 3, spellcheck: 'false',
      placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    });

    var headerPre = App.el('pre', { class: 'jwt-pre jwt-hdr' });
    var payloadPre = App.el('pre', { class: 'jwt-pre jwt-pay' });
    var signaturePre = App.el('pre', { class: 'jwt-pre jwt-sig' });
    var claimsEl = App.el('div', { class: 'claims' });

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
        payloadPre,
        claimsEl),
      App.el('div', { class: 'jwt-sec' },
        App.el('div', { class: 'jwt-label lbl-signature', text: 'SIGNATURE: HMAC-SHA256(header.payload, secret)' }, makeCopyBtn(function () { return signature; })),
        signaturePre));

    var secretInput = App.el('input', {
      class: 'secret-input', type: 'text', spellcheck: 'false',
      placeholder: 'secret for HS256 verification', 'aria-label': 'HMAC secret'
    });
    var verifyBtn = App.el('button', { class: 'btn-verify', type: 'button' },
      App.icon('shield-check', '', 14), App.el('span', { text: 'Verify signature' }));
    verifyBtn.addEventListener('click', verify);
    var verdictEl = App.el('div', { class: 'verdict' });
    var verifyRow = App.el('div', { class: 'verify-row' }, secretInput, verifyBtn);

    /** Fixed-length comparison so timing doesn't leak how many hex chars matched. */
    function signaturesEqual(a, b) {
      var len = Math.max(a.length, b.length);
      var diff = a.length === b.length ? 0 : 1;
      for (var i = 0; i < len; i++) {
        var ca = i < a.length ? a.charCodeAt(i) : 0;
        var cb = i < b.length ? b.charCodeAt(i) : 0;
        diff |= ca ^ cb;
      }
      return diff === 0;
    }

    /** JWT base64url segment → lowercase hex of the raw bytes. */
    function segmentToHex(seg) {
      var std = seg.replace(/-/g, '+').replace(/_/g, '/');
      while (std.length % 4 !== 0) std += '=';
      var bin = atob(std);
      var hex = '';
      for (var i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
      return hex;
    }

    function setVerdict(ok, text) {
      verdictEl.textContent = text;
      verdictEl.style.color = ok ? 'var(--ctp-green)' : 'var(--ctp-red)';
    }

    function verify() {
      verdictEl.innerHTML = '';
      if (!rawHeader || !signature) { setVerdict(false, 'Nothing to verify — paste a token first'); return; }
      var alg = String(rawHeader.alg || '').toUpperCase();
      if (alg === 'NONE') { setVerdict(false, 'alg "none" — the token is unsigned; anyone can forge it'); return; }
      if (!/^HS\d+$/.test(alg)) { setVerdict(false, 'Verification supports HMAC (HS*) only — this token uses "' + (alg || '?') + '"'); return; }
      if (alg !== 'HS256') { setVerdict(false, alg + ' is not supported by the WASM core yet — HS256 only'); return; }
      var secret = secretInput.value;
      if (!secret) { setVerdict(false, 'Enter the shared secret first'); return; }
      var signingInput = token.trim().split('.').slice(0, 2).join('.');
      try {
        var expected = Core.hmacHex(secret, signingInput, 1);
        var actual = segmentToHex(signature);
        if (signaturesEqual(expected, actual)) setVerdict(true, '✓ Signature valid — HMAC-SHA256 matches');
        else setVerdict(false, '✗ Signature INVALID — signed with a different secret or tampered');
      } catch (e) {
        setVerdict(false, 'Verification failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    /** Human-readable cards for registered claims we can judge. */
    function renderClaims() {
      claimsEl.innerHTML = '';
      if (!rawPayload) { claimsEl.style.display = 'none'; return; }
      var now = Math.floor(Date.now() / 1000);
      var fmtTime = function (epoch) {
        try { return new Date(epoch * 1000).toLocaleString(); } catch (e) { return String(epoch); }
      };
      var rows = [];
      ['iss', 'sub', 'aud'].forEach(function (k) {
        if (rawPayload[k] !== undefined) rows.push({ k: k, v: String(rawPayload[k]) });
      });
      if (typeof rawPayload.exp === 'number') {
        rows.push({ k: 'exp', v: fmtTime(rawPayload.exp), s: now >= rawPayload.exp ? { c: 'bad', t: 'EXPIRED' } : { c: 'ok', t: 'not expired' } });
      }
      if (typeof rawPayload.nbf === 'number') {
        rows.push({ k: 'nbf', v: fmtTime(rawPayload.nbf), s: now < rawPayload.nbf ? { c: 'bad', t: 'NOT YET VALID' } : { c: 'ok', t: 'in force' } });
      }
      if (typeof rawPayload.iat === 'number') {
        rows.push({ k: 'iat', v: fmtTime(rawPayload.iat) });
      }
      if (!rows.length) { claimsEl.style.display = 'none'; return; }
      claimsEl.style.display = '';
      rows.forEach(function (r) {
        claimsEl.appendChild(App.el('div', { class: 'claim' },
          App.el('div', { class: 'ck', text: r.k }),
          App.el('div', { class: 'cv', text: r.v }),
          r.s ? App.el('div', { class: 'cs ' + r.s.c, text: r.s.t }) : null));
      });
    }

    function resetOutputs() {
      header = ''; payload = ''; signature = '';
      rawHeader = null; rawPayload = null;
    }

    function decode() {
      if (!token.trim()) { resetOutputs(); update(); return; }
      try {
        var result = Transforms.jwtDecode(token.trim());
        header = result.header;
        payload = result.payload;
        signature = result.signature;
        rawHeader = result.rawHeader;
        rawPayload = result.rawPayload;
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        resetOutputs();
      }
      update();
    }

    function update() {
      headerPre.textContent = header;
      payloadPre.textContent = payload;
      signaturePre.textContent = signature;
      sections.classList.toggle('hidden', !header);
      renderClaims();
      verdictEl.innerHTML = '';
      outputBox.innerHTML = '';
      if (error) outputBox.appendChild(App.outputBox('', error, 'Decoded', clear));
    }

    function clear() {
      token = '';
      textarea.value = '';
      resetOutputs();
      update();
    }

    textarea.addEventListener('input', function () { token = textarea.value; decode(); });

    root.appendChild(textarea);
    root.appendChild(sections);
    root.appendChild(verifyRow);
    root.appendChild(verdictEl);
    root.appendChild(outputBox);
  }
});
})();
