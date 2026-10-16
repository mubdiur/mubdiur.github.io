/* ═══════════════════════════════════════════════════════════
   AES Encrypt / Decrypt — CUSTOM TOOL.
   AES-256-GCM with a PBKDF2-SHA256 passphrase key (WebCrypto).
   Random 128-bit salt + 96-bit IV per encryption; output is a
   self-describing envelope: AESGCM1.<iters>.<salt>.<iv>.<ct>
   (Base64 blocks). Entirely offline after load — no server.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';
var HEADER = 'AESGCM1';
var ITERATIONS = 100000;
var SALT_LEN = 16;
var IV_LEN = 12;
function hasSubtle() {
  try {
    return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues && window.TextEncoder);
  } catch (e) { return false; }
}
function b64encode(bytes) {
  var s = '';
  var CHUNK = 8192;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
function b64decode(b64) {
  var clean = String(b64).replace(/\s+/g, '');
  if (!clean.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || (clean.length % 4) !== 0) {
    throw new Error('bad base64');
  }
  var s = atob(clean);
  var out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function deriveKey(pass, salt, iters) {
  var enc = new TextEncoder();
  return window.crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
    .then(function (base) {
      return window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: iters, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
}
function doEncrypt(plain, pass) {
  var salt = new Uint8Array(SALT_LEN);
  var iv = new Uint8Array(IV_LEN);
  window.crypto.getRandomValues(salt);
  window.crypto.getRandomValues(iv);
  return deriveKey(pass, salt, ITERATIONS).then(function (key) {
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plain));
  }).then(function (ct) {
    return HEADER + '.' + ITERATIONS + '.' + b64encode(salt) + '.' + b64encode(iv) + '.' + b64encode(new Uint8Array(ct));
  });
}
function doDecrypt(envelope, pass) {
  var parts = String(envelope).trim().split('.');
  if (parts.length !== 5 || parts[0] !== HEADER) {
    throw new Error('That is not an AESGCM1 envelope — paste the full encrypted string.');
  }
  var iters = parseInt(parts[1], 10);
  if (!(iters >= 1000) || iters > 5000000) throw new Error('Unsupported iteration count in envelope.');
  var salt, iv, ct;
  try {
    salt = b64decode(parts[2]);
    iv = b64decode(parts[3]);
    ct = b64decode(parts[4]);
  } catch (e) {
    throw new Error('Envelope is damaged — a Base64 block will not decode.');
  }
  if (salt.length !== SALT_LEN || iv.length !== IV_LEN || !ct.length) {
    throw new Error('Envelope is damaged — salt, IV or ciphertext has the wrong size.');
  }
  return deriveKey(pass, salt, iters).then(function (key) {
    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
  }).then(function (pt) {
    return new TextDecoder().decode(pt);
  }, function () {
    throw new Error('Decryption failed — wrong passphrase or damaged envelope.');
  });
}
var CSS = '' +
'.t-aes-encryptor .aes-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;}\n' +
'.t-aes-encryptor textarea{width:100%;min-height:9rem;resize:vertical;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0.6rem;font-family:var(--font-mono);font-size:13.5px;line-height:1.55;color:rgba(227,227,227,0.92);outline:none;}\n' +
'.t-aes-encryptor textarea:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
'.t-aes-encryptor textarea[readonly]{background:rgba(0,0,0,0.2);}\n' +
'.t-aes-encryptor .aes-pass{width:100%;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 10px;font-family:var(--font-mono);font-size:13.5px;color:rgba(227,227,227,0.9);outline:none;}\n' +
'.t-aes-encryptor .aes-pass:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
'.t-aes-encryptor .aes-label{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.75);display:block;margin:0.6rem 0 0.3rem;}\n' +
'.t-aes-encryptor .aes-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.6rem;}\n' +
'.t-aes-encryptor .aes-status{font-family:var(--font-mono);font-size:13px;min-height:1.4em;margin-top:0.55rem;color:rgba(141,148,158,0.85);}\n' +
'.t-aes-encryptor .aes-status.ok{color:var(--lime);}\n' +
'.t-aes-encryptor .aes-status.err{color:var(--ctp-red);}\n' +
'.t-aes-encryptor .aes-hint{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.6);margin-top:0.5rem;line-height:1.6;}\n' +
'.t-aes-encryptor .seg{display:inline-flex;border:1px solid rgba(51,53,56,0.4);border-radius:6px;overflow:hidden;}\n' +
'.t-aes-encryptor .seg button{background:transparent;border:0;color:rgba(227,227,227,0.65);font-family:var(--font-mono);font-size:13px;padding:0.4rem 0.9rem;cursor:pointer;}\n' +
'.t-aes-encryptor .seg button.on{background:rgba(83,163,249,0.22);color:#fff;}\n' +
'.t-aes-encryptor .btn-run{background:rgba(83,163,249,0.2);border:1px solid rgba(83,163,249,0.45);color:#fff;border-radius:6px;font-family:var(--font-mono);font-size:13.5px;padding:0.45rem 1.1rem;cursor:pointer;}\n' +
'.t-aes-encryptor .btn-run:disabled{opacity:0.5;cursor:wait;}\n' +
'.t-aes-encryptor .chk{display:inline-flex;align-items:center;gap:0.35rem;font-family:var(--font-mono);font-size:12.5px;color:rgba(141,148,158,0.8);cursor:pointer;}\n' +
'XMEDIA_PLACEHOLDERX\n';
CSS = CSS.replace('XMEDIA_PLACEHOLDERX', '@media(max-width:640px){.t-aes-encryptor .aes-grid{grid-template-columns:1fr;}}');
App.registerTool('aes-encryptor', {
  css: CSS,
  mount: function (root) {
    var mode = 'encrypt';
    var busy = false;
    var encBtn = App.el('button', { type: 'button', text: 'Encrypt', class: 'on', 'aria-pressed': 'true' });
    var decBtn = App.el('button', { type: 'button', text: 'Decrypt', 'aria-pressed': 'false' });
    var seg = App.el('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' }, encBtn, decBtn);
    var passInput = App.el('input', { class: 'aes-pass', type: 'password', autocomplete: 'new-password', spellcheck: 'false', placeholder: 'Passphrase — remembers nothing, stores nothing', 'aria-label': 'Passphrase' });
    var showBox = App.el('input', { type: 'checkbox', 'aria-label': 'Show passphrase' });
    var showLbl = App.el('label', { class: 'chk' }, showBox, App.el('span', { text: 'Show' }));
    var inArea = App.el('textarea', { spellcheck: 'false', placeholder: 'Plaintext to encrypt…', 'aria-label': 'Input text' });
    var outArea = App.el('textarea', { spellcheck: 'false', readonly: 'true', placeholder: 'Result appears here…', 'aria-label': 'Output text' });
    var runBtn = App.el('button', { class: 'btn-run', type: 'button', text: 'Encrypt' });
    var copyBtn = App.el('button', { class: 'btn-copy', type: 'button' }, App.icon('copy', '', 14), App.el('span', { text: 'Copy' }));
    var dlBtn = App.el('button', { class: 'btn-copy', type: 'button', title: 'Download output as a file' }, App.icon('download', '', 14), App.el('span', { text: 'Download' }));
    var swapBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.el('span', { text: 'Use output as input' }));
    var clearBtn = App.clearButton(clearAll);
    var status = App.el('div', { class: 'aes-status', role: 'status', text: 'AES-256-GCM plus PBKDF2-SHA256, 100k iterations — everything stays in this tab.' });
    function setStatus(msg, cls) {
      status.textContent = msg;
      status.className = 'aes-status' + (cls ? ' ' + cls : '');
    }
    function setMode(m) {
      mode = m;
      var enc = m === 'encrypt';
      encBtn.className = enc ? 'on' : '';
      decBtn.className = enc ? '' : 'on';
      encBtn.setAttribute('aria-pressed', enc ? 'true' : 'false');
      decBtn.setAttribute('aria-pressed', enc ? 'false' : 'true');
      runBtn.textContent = enc ? 'Encrypt' : 'Decrypt';
      inArea.placeholder = enc ? 'Plaintext to encrypt…' : 'Paste an AESGCM1 envelope to decrypt…';
      outArea.value = '';
      setStatus(enc ? 'AES-256-GCM plus PBKDF2-SHA256, 100k iterations — everything stays in this tab.' : 'Paste the full envelope — header, salt, IV and ciphertext travel with it.');
    }
    function clearAll() {
      inArea.value = '';
      outArea.value = '';
      setStatus('Cleared. Nothing is stored — close the tab and it is gone.');
      inArea.focus();
    }
    encBtn.addEventListener('click', function () { if (!busy) setMode('encrypt'); });
    decBtn.addEventListener('click', function () { if (!busy) setMode('decrypt'); });
    showBox.addEventListener('change', function () {
      try { passInput.type = showBox.checked ? 'text' : 'password'; } catch (e) { void e; }
    });
    copyBtn.addEventListener('click', function () {
      if (!outArea.value) { setStatus('Nothing to copy yet — run it first.'); return; }
      App.copy(outArea.value, copyBtn);
    });
    dlBtn.addEventListener('click', function () {
      if (!outArea.value) { setStatus('Nothing to download yet — run it first.'); return; }
      App.download(mode === 'encrypt' ? 'aes-encrypted.txt' : 'aes-decrypted.txt', outArea.value, 'text/plain');
    });
    swapBtn.addEventListener('click', function () {
      if (!outArea.value) { setStatus('Nothing to move yet — run it first.'); return; }
      inArea.value = outArea.value;
      outArea.value = '';
      setMode(mode === 'encrypt' ? 'decrypt' : 'encrypt');
      inArea.focus();
    });
    runBtn.addEventListener('click', function () {
      if (busy) return;
      if (!hasSubtle()) {
        setStatus('WebCrypto is unavailable here — open this page over https or localhost.', 'err');
        return;
      }
      var text = inArea.value;
      var pass = passInput.value;
      if (!text) { setStatus(mode === 'encrypt' ? 'Type something to encrypt first.' : 'Paste an envelope to decrypt first.', 'err'); inArea.focus(); return; }
      if (!pass || pass.length < 4) { setStatus('Pick a passphrase — at least 4 characters.', 'err'); passInput.focus(); return; }
      busy = true;
      runBtn.disabled = true;
      setStatus(mode === 'encrypt' ? 'Deriving key and encrypting…' : 'Deriving key and decrypting…');
      var job = mode === 'encrypt' ? doEncrypt(text, pass) : doDecrypt(text, pass);
      job.then(function (out) {
        outArea.value = out;
        setStatus((mode === 'encrypt' ? 'Encrypted' : 'Decrypted') + ' — ' + text.length + ' chars in, ' + out.length + ' chars out. Passphrase never leaves this tab.', 'ok');
      }, function (err) {
        setStatus((err && err.message) || 'Something failed.', 'err');
      }).then(function () {
        busy = false;
        runBtn.disabled = false;
      });
    });
    root.appendChild(App.el('div', {},
      App.el('div', { class: 'aes-row', style: { marginTop: '0' } }, seg,
        App.el('span', { class: 'aes-hint', style: { marginTop: '0' }, text: 'Portable envelope — decrypt anywhere.' })),
      App.el('label', { class: 'aes-label', text: 'Passphrase' }),
      App.el('div', { class: 'aes-row', style: { marginTop: '0' } },
        App.el('div', { style: { flex: '1 1 240px' } }, passInput), showLbl),
      App.el('div', { class: 'aes-grid' },
        App.el('div', {}, App.el('label', { class: 'aes-label', text: 'Input' }), inArea),
        App.el('div', {}, App.el('label', { class: 'aes-label', text: 'Output' }), outArea)),
      App.el('div', { class: 'aes-row' }, runBtn, copyBtn, dlBtn, swapBtn, clearBtn),
      status,
      App.el('div', { class: 'aes-hint', text: 'Format: AESGCM1.<iterations>.<salt>.<iv>.<ciphertext>, all Base64. Salt plus IV are fresh every run, so the same text never encrypts the same way twice.' })
    ));
  }
});
})();
