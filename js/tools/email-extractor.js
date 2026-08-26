/* ═══════════════════════════════════════════════════════════
   Email Extractor — extract emails from text, with dedupe,
   lowercase, contains-filter, sort, delimiter selection, and a
   two-set email diff mode. Ported from
   src/components/tools/email-extractor.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var EMAIL_REGEX = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;

function dedupePreserveOrder(arr) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var key = arr[i].toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      out.push(arr[i]);
    }
  }
  return out;
}

function extractEmails(text) {
  if (!text) return [];
  var normalized = text.replace(/mailto:/gi, ' ');
  var matches = normalized.match(EMAIL_REGEX) || [];
  var cleaned = matches.map(function (m) { return m.trim().replace(/^["'<(]+|[)">']+$/g, ''); });
  return dedupePreserveOrder(cleaned);
}

App.registerTool('email-extractor', {
  css: '' +
    '.t-email-extractor{display:flex;flex-direction:column;gap:1rem;}\n' +
    '.t-email-extractor .ee-input{width:100%;border-radius:8px;border:1px solid rgba(51,53,56,0.5);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-family:var(--font-mono);font-size:14px;color:rgba(227,227,227,0.9);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-email-extractor .ee-input::placeholder{color:rgba(141,148,158,0.3);}\n' +
    '.t-email-extractor .ee-input:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-email-extractor .ee-input.min-h-180{min-height:180px;resize:vertical;}\n' +
    '.t-email-extractor .ee-input.min-h-120{min-height:120px;resize:vertical;}\n' +
    '.t-email-extractor .ee-input.w-40{width:10rem;}\n' +
    '.t-email-extractor .ee-input.w-auto{width:auto;}\n' +
    '.t-email-extractor .ee-btn-secondary{color:rgba(141,148,158,0.8);}\n' +
    '.t-email-extractor .ee-btn-secondary:hover{color:rgba(227,227,227,0.9);}\n' +
    '.t-email-extractor .ee-check-label{display:flex;align-items:center;gap:0.375rem;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.8);cursor:pointer;}\n' +
    '.t-email-extractor .ee-check-label input{width:16px;height:16px;accent-color:#53a3f9;cursor:pointer;}\n' +
    '.t-email-extractor .ee-badge{color:rgba(141,148,158,0.8);}\n' +
    '.t-email-extractor .ee-fg90{color:rgba(227,227,227,0.9);}\n' +
    '.t-email-extractor .ee-muted70{color:rgba(141,148,158,0.7);}\n' +
    '.t-email-extractor .ee-out-pre{max-height:16rem;color:rgba(227,227,227,0.9);}\n' +
    '.t-email-extractor .ee-diff-pre{max-height:10rem;color:rgba(227,227,227,0.85);}\n' +
    '@media(min-width:640px){.t-email-extractor .ee-sm-cols2{grid-template-columns:repeat(2,1fr);}.t-email-extractor .ee-col-span2{grid-column:span 2;}}\n',

  mount: function (root) {
    var input = '';
    var contains = '';
    var format = '; ';
    var lowercase = false;
    var sort = false;
    var output = '';
    var count = 0;
    var status = null;
    var diffLeft = '';
    var diffRight = '';
    var diff = null;
    var diffStatus = null;

    var btnPrimary = 'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono font-medium bg-ctp-teal/15 border border-ctp-teal/30 text-ctp-teal hover:bg-ctp-teal/25 disabled:opacity-50 transition-colors';
    var btnSecondary = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 ee-btn-secondary hover:bg-surface0 transition-colors';

    /* ── extractor ── */
    var inputTa = App.el('textarea', {
      class: 'ee-input min-h-180', spellcheck: 'false',
      placeholder: 'Paste text here (logs, JSON, emails, CSV, etc.)'
    });
    inputTa.addEventListener('input', function () { input = inputTa.value; });

    var containsInput = App.el('input', {
      class: 'ee-input w-40', type: 'text', spellcheck: 'false', placeholder: 'Contains…'
    });
    containsInput.addEventListener('input', function () { contains = containsInput.value; });

    var formatSel = App.el('select', { class: 'ee-input w-auto', 'aria-label': 'Delimiter' });
    formatSel.appendChild(App.el('option', { value: '; ', text: 'Semicolon separated' }));
    formatSel.appendChild(App.el('option', { value: ',', text: 'Comma separated' }));
    formatSel.appendChild(App.el('option', { value: '\\n', text: 'Separate lines' }));
    formatSel.value = format;
    formatSel.addEventListener('change', function () { format = formatSel.value; });

    var submitBtn = App.el('button', { type: 'button', class: btnPrimary },
      App.icon('search', '', 14), App.el('span', { text: 'Submit' }));
    submitBtn.addEventListener('click', run);

    var copyBtn = App.el('button', { type: 'button', class: btnSecondary, disabled: true },
      App.icon('copy', '', 12), App.el('span', { text: 'Copy All' }));
    copyBtn.addEventListener('click', function () { App.copy(output, copyBtn); });

    var clearBtn = App.el('button', { type: 'button', class: btnSecondary },
      App.icon('eraser', '', 12), App.el('span', { text: 'Clear' }));
    clearBtn.addEventListener('click', clear);

    var lowercaseChk = App.el('input', { type: 'checkbox', style: 'width:16px;height:16px;accent-color:#53a3f9;cursor:pointer' });
    lowercaseChk.addEventListener('change', function () { lowercase = lowercaseChk.checked; });
    var sortChk = App.el('input', { type: 'checkbox', style: 'width:16px;height:16px;accent-color:#53a3f9;cursor:pointer' });
    sortChk.addEventListener('change', function () { sort = sortChk.checked; });

    var controls = App.el('div', { class: 'flex flex-wrap items-center gap-2' },
      containsInput, formatSel, submitBtn, copyBtn, clearBtn,
      App.el('label', { class: 'ee-check-label' }, lowercaseChk, App.el('span', { text: 'Lowercase' })),
      App.el('label', { class: 'ee-check-label' }, sortChk, App.el('span', { text: 'Sort A → Z' })));

    var statusArea = App.el('div');
    var outputArea = App.el('div');

    function run() {
      var raw = input.trim();
      if (!raw) {
        status = { kind: 'err', msg: 'Input is empty. Paste any text and try again.' };
        output = ''; count = 0;
        render();
        return;
      }
      var emails = extractEmails(raw);
      if (!emails.length) {
        status = { kind: 'err', msg: 'No valid emails found in the text.' };
        output = ''; count = 0;
        render();
        return;
      }
      var list = emails.slice();
      if (lowercase) list = dedupePreserveOrder(list.map(function (e) { return e.toLowerCase(); }));
      var filter = contains.trim().toLowerCase();
      if (filter) list = list.filter(function (e) { return e.toLowerCase().indexOf(filter) !== -1; });
      if (sort) list = list.slice().sort(function (a, b) { return a.localeCompare(b); });
      var delim = format === '\\n' ? '\n' : format;
      output = list.join(delim);
      count = list.length;
      status = { kind: 'ok', msg: 'Extracted ' + emails.length + ' email(s).' };
      render();
    }

    function clear() {
      input = ''; contains = ''; format = '; ';
      lowercase = false; sort = false;
      output = ''; count = 0; status = null;
      inputTa.value = ''; containsInput.value = ''; formatSel.value = '; ';
      lowercaseChk.checked = false; sortChk.checked = false;
      render();
    }

    function render() {
      statusArea.innerHTML = '';
      if (status && status.kind === 'err') {
        statusArea.appendChild(App.el('div', { class: 'rounded-lg border border-ctp-red/25 bg-ctp-red/8 px-4 py-3 font-mono text-xs text-ctp-red', text: status.msg }));
      } else if (status && status.kind === 'ok') {
        statusArea.appendChild(App.el('div', { class: 'text-xs font-mono text-ctp-green', text: status.msg }));
      }
      outputArea.innerHTML = '';
      if (output) {
        outputArea.appendChild(App.el('div', { class: 'rounded-lg border border-border/60 bg-mantle p-4' },
          App.el('div', { class: 'mb-2 flex items-center justify-between' },
            App.el('span', { class: 'rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-mono ee-badge',
              text: count + ' email' + (count === 1 ? '' : 's') })),
          App.el('pre', { class: 'overflow-auto whitespace-pre-wrap break-all font-mono text-sm ee-out-pre', text: output })));
      }
      copyBtn.disabled = !output;
      renderDiff();
    }

    /* ── email diff — compare two sets ── */
    function runDiff() {
      var a = extractEmails(diffLeft);
      var b = extractEmails(diffRight);
      if (!a.length && !b.length) {
        diffStatus = { kind: 'err', msg: 'No valid emails found in either set.' };
        diff = null;
        renderDiff();
        return;
      }
      var sa = {};
      var sb = {};
      a.forEach(function (e) { sa[e.toLowerCase()] = true; });
      b.forEach(function (e) { sb[e.toLowerCase()] = true; });
      var onlyA = Object.keys(sa).filter(function (e) { return !sb[e]; });
      var onlyB = Object.keys(sb).filter(function (e) { return !sa[e]; });
      var both = Object.keys(sa).filter(function (e) { return sb[e]; });
      diff = { onlyA: onlyA, onlyB: onlyB, both: both };
      diffStatus = { kind: 'ok', msg: 'Diff complete — ' + onlyA.length + ' only in A, ' + onlyB.length + ' only in B, ' + both.length + ' in both.' };
      renderDiff();
    }

    function clearDiff() {
      diffLeft = ''; diffRight = '';
      diff = null; diffStatus = null;
      diffLeftTa.value = ''; diffRightTa.value = '';
      renderDiff();
    }

    var diffLeftTa = App.el('textarea', {
      class: 'ee-input min-h-120', spellcheck: 'false', placeholder: 'Paste set A here…'
    });
    diffLeftTa.addEventListener('input', function () { diffLeft = diffLeftTa.value; });
    var diffRightTa = App.el('textarea', {
      class: 'ee-input min-h-120', spellcheck: 'false', placeholder: 'Paste set B here…'
    });
    diffRightTa.addEventListener('input', function () { diffRight = diffRightTa.value; });

    var diffBtnRow = App.el('div');
    var diffStatusLine = App.el('div');
    var diffArea = App.el('div');

    function renderDiff() {
      diffBtnRow.innerHTML = '';
      diffBtnRow.className = 'mt-2 flex flex-wrap items-center gap-2';
      var runDiffBtn = App.el('button', { type: 'button', class: btnPrimary },
        App.icon('search', '', 14), App.el('span', { text: 'Run Diff' }));
      runDiffBtn.addEventListener('click', runDiff);
      diffBtnRow.appendChild(runDiffBtn);
      var clearDiffBtn = App.el('button', { type: 'button', class: btnSecondary },
        App.icon('eraser', '', 12), App.el('span', { text: 'Clear' }));
      clearDiffBtn.addEventListener('click', clearDiff);
      diffBtnRow.appendChild(clearDiffBtn);
      if (diff) {
        var copyDiffBtn = App.el('button', { type: 'button', class: btnSecondary },
          App.icon('copy', '', 12), App.el('span', { text: 'Copy all' }));
        copyDiffBtn.addEventListener('click', function () {
          App.copy(diff.onlyA.concat(diff.onlyB).concat(diff.both).join('\n'), copyDiffBtn);
        });
        diffBtnRow.appendChild(copyDiffBtn);
      }

      diffStatusLine.innerHTML = '';
      if (diffStatus && diffStatus.kind === 'err') {
        diffStatusLine.appendChild(App.el('div', { class: 'mt-2 text-xs font-mono text-ctp-red', text: diffStatus.msg }));
      } else if (diffStatus && diffStatus.kind === 'ok') {
        diffStatusLine.appendChild(App.el('div', { class: 'mt-2 text-xs font-mono text-ctp-green', text: diffStatus.msg }));
      }

      diffArea.innerHTML = '';
      if (!diff) return;
      var box = function (title, titleCls, body) {
        return App.el('div', { class: 'rounded-lg border border-border/60 bg-mantle p-3' },
          App.el('div', { class: 'mb-1.5 text-xs font-mono font-semibold ' + titleCls, text: title }),
          App.el('pre', { class: 'overflow-auto whitespace-pre-wrap break-all font-mono text-xs ee-diff-pre', text: body }));
      };
      diffArea.appendChild(App.el('div', { class: 'mt-3 grid gap-2 ee-sm-cols2' },
        box('Only in A (' + diff.onlyA.length + ')', 'text-ctp-red', diff.onlyA.length ? diff.onlyA.join('\n') : '—'),
        box('Only in B (' + diff.onlyB.length + ')', 'text-ctp-green', diff.onlyB.length ? diff.onlyB.join('\n') : '—'),
        App.el('div', { class: 'rounded-lg border border-border/60 bg-mantle p-3 ee-col-span2' },
          App.el('div', { class: 'mb-1.5 text-xs font-mono font-semibold text-ctp-teal', text: 'In both (' + diff.both.length + ')' }),
          App.el('pre', { class: 'overflow-auto whitespace-pre-wrap break-all font-mono text-xs ee-diff-pre',
            text: diff.both.length ? diff.both.join('\n') : '—' }))));
    }

    /* ── diff section shell ── */
    var diffSection = App.el('div', { class: 'border-t border-border/40 pt-4' },
      App.el('div', { class: 'flex items-center gap-2 mb-2' },
        App.icon('git-compare-arrows', 'text-ctp-teal', 16),
        App.el('span', { class: 'text-sm font-mono font-semibold ee-fg90', text: 'Email Diff — compare two sets' })),
      App.el('p', { class: 'mb-2 text-xs font-mono ee-muted70',
        text: 'Paste two sets of text; see which emails are unique to each side and which appear in both.' }),
      App.el('div', { class: 'grid gap-2 ee-sm-cols2' }, diffLeftTa, diffRightTa),
      diffBtnRow, diffStatusLine, diffArea);

    root.appendChild(inputTa);
    root.appendChild(controls);
    root.appendChild(statusArea);
    root.appendChild(outputArea);
    root.appendChild(diffSection);

    render();
  }
});
})();
