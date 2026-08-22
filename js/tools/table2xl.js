/* ═══════════════════════════════════════════════════════════
   Table2xl — dirty HTML table / ELK-Kibana grid cleaner.
   Ported from src/components/tools/table2xl.tsx.
   All parsing/cleanup logic kept verbatim: HTML table parsing,
   ELK/Kibana grid noise stripping, CSV-ish handling, ASCII table
   export, HTML export, copy buttons (rich text/html clipboard).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var noiseSelectors = [
  'svg', 'button', 'input', 'select', 'textarea', '[hidden]', '[aria-hidden="true"]',
  '[class*="ScreenReaderOnly"]', '[data-tabular-copy-marker]', 'p[hidden]', 'div[hidden]',
  '[class*="euiPopover"]', '[class*="euiToolTipAnchor"]', '[class*="euiDataGridRowCell__actions"]',
  'div[data-focus-guard]', 'p[id*="focusTrapHint"]', 'div[role="status"]',
];

function cleanArtifacts(text) {
  if (!text) return '';
  return text
    .replace(/Press the Enter key.*$/gm, '')
    .replace(/↦|↵|✄𐘗.*?✄𐘗|Actions column|Select column|Select all visible rows|column \d+, row \d+.*$/g, '')
    .replace(/Filter for this.*$|Filter out this.*$|Copy value of.*$|Click or hit enter.*$|Toggle dialog.*$|Info/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split('\n')[0]
    .trim();
}

function cleanText(element) {
  var valueEl = element.querySelector('.unifiedDataTable__cellValue');
  if (valueEl) return cleanArtifacts(valueEl.textContent || '');

  var titleEl = element.querySelector('[data-test-subj="unifiedDataTableColumnTitle"]');
  if (titleEl) return cleanArtifacts(titleEl.textContent || '');

  var headerContent = element.querySelector('.euiDataGridHeaderCell__content, [class*="euiDataGridHeaderCell__content"]');
  if (headerContent) {
    var text = headerContent.textContent || '';
    if (!text.trim()) {
      var title = headerContent.getAttribute('title') || headerContent.getAttribute('aria-label') || '';
      if (title) text = title.split(' - ')[0].split('\n')[0];
    }
    return cleanArtifacts(text);
  }

  var clone = element.cloneNode(true);
  noiseSelectors.forEach(function (sel) {
    try {
      clone.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    } catch (e) {
      /* selector may not match — ignore */
    }
  });
  var cloneText = clone.textContent || '';
  if (!cloneText.trim()) {
    var anyTitle = element.querySelector('[title], [aria-label]');
    if (anyTitle) cloneText = anyTitle.getAttribute('title') || anyTitle.getAttribute('aria-label') || '';
  }
  return cleanArtifacts(cloneText);
}

function filterIndices(headerTexts) {
  var indices = [];
  for (var i = 0; i < headerTexts.length; i++) {
    var text = headerTexts[i].toLowerCase();
    if (
      text &&
      !text.includes('select') &&
      !text.includes('actions') &&
      !text.includes('select all visible rows') &&
      !text.includes('select column')
    ) {
      indices.push(i);
    }
  }
  return indices;
}

function buildHeader(table, headerTexts, keepIndices) {
  var thead = document.createElement('thead');
  var tr = document.createElement('tr');
  keepIndices.forEach(function (idx) {
    var th = document.createElement('th');
    th.textContent = headerTexts[idx];
    th.style.cssText = 'background:#3c3836;font-weight:700;border:1px solid #504945;padding:4px 8px;text-align:left;color:#ebdbb2';
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);
}

function buildTable(table, rows, cellSelector, keepIndices) {
  var tbody = document.createElement('tbody');
  var fragment = document.createDocumentFragment();

  rows.forEach(function (row) {
    var styleAttr = row.getAttribute('style');
    if (styleAttr && styleAttr.includes('height: 0px')) return;
    var tr = document.createElement('tr');
    var cells = Array.from(row.querySelectorAll(cellSelector));
    var indices = keepIndices || cells.map(function (_, i) { return i; });

    indices.forEach(function (idx, visibleIdx) {
      if (idx >= cells.length) return;
      var td = document.createElement('td');
      var text = cleanText(cells[idx]);
      if (visibleIdx === 0) {
        var link = cells[idx].querySelector('a');
        text = link ? (link.textContent ? link.textContent.trim() : '') || text : text;
      } else {
        text = text.replace(/More/g, '').trim();
      }
      td.textContent = text;
      td.style.cssText = 'border:1px solid #504945;padding:4px 8px;text-align:left;color:#ebdbb2';
      tr.appendChild(td);
    });

    if (tr.textContent && tr.textContent.trim()) fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  table.appendChild(tbody);
}

function generateAscii(table) {
  var rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return 'No data';

  var data = [];
  var cols = 0;
  rows.forEach(function (row) {
    var cells = Array.from(row.querySelectorAll('th, td')).map(function (c) { return (c.textContent || '').trim() || ''; });
    data.push(cells);
    if (cells.length > cols) cols = cells.length;
  });

  var widths = new Array(cols).fill(0);
  data.forEach(function (row) {
    row.forEach(function (c, i) {
      if (c.length > widths[i]) widths[i] = c.length;
    });
  });

  var buildLine = function (l, m, r, h) {
    var s = l;
    widths.forEach(function (w, i) {
      s += h.repeat(w + 2);
      s += i < widths.length - 1 ? m : r;
    });
    return s;
  };
  var buildRow = function (row) {
    var s = '│';
    row.forEach(function (c, i) {
      s += ' ' + c.padEnd(widths[i]) + ' │';
    });
    return s;
  };

  var out = buildLine('┌', '┬', '┐', '─') + '\n';
  data.forEach(function (row, i) {
    out += buildRow(row) + '\n';
    if (i === 0) out += buildLine('├', '┼', '┤', '─') + '\n';
    else if (i === data.length - 1) out += buildLine('└', '┴', '┘', '─') + '\n';
    else out += buildLine('│', '│', '│', ' ') + '\n';
  });
  return out;
}

App.registerTool('table2xl', {
  css: '' +
    '.t-table2xl textarea.tool-textarea{min-height:140px;font-size:14px;}\n' +
    '.t-table2xl .fg-90{color:rgba(235,219,178,0.9);}\n' +
    '.t-table2xl .muted-80{color:rgba(189,174,147,0.8);}\n' +
    '.t-table2xl .muted-70{color:rgba(189,174,147,0.7);}\n' +
    '.t-table2xl .muted-60{color:rgba(189,174,147,0.6);}\n' +
    '.t-table2xl .hover-fg-90:hover{color:rgba(235,219,178,0.9);}\n' +
    '.t-table2xl .seg{display:flex;gap:0.25rem;border:1px solid rgba(80,73,69,0.5);border-radius:0.5rem;background:var(--mantle);padding:0.25rem;}\n' +
    '.t-table2xl .seg button{flex:1;padding:0.375rem 0.75rem;border-radius:0.375rem;font-family:var(--font-mono);font-size:12px;border:1px solid transparent;background:none;color:rgba(189,174,147,0.7);cursor:pointer;transition:color .2s,background-color .2s,border-color .2s;}\n' +
    '.t-table2xl .seg button:hover{color:rgba(235,219,178,0.9);}\n' +
    '.t-table2xl .seg button.active{background:rgba(142,192,124,0.2);color:var(--ctp-teal);border-color:rgba(142,192,124,0.3);}\n' +
    '.t-table2xl .preview{max-height:24rem;overflow:auto;}\n',

  mount: function (root) {
    var input = '';
    var view = 'ascii';
    var tableHtml = '';
    var ascii = '';
    var error = null;
    var copied = null;
    var asciiPre = null;
    var htmlDiv = null;

    /* ── actions ── */

    function clean() {
      var raw = input.trim();
      if (!raw) {
        showError('Paste an HTML table or ELK grid first.');
        return;
      }
      var doc = new DOMParser().parseFromString(raw, 'text/html');
      var originalTable = doc.querySelector('table');
      var gridContainer = doc.querySelector('[role="row"], [role="columnheader"]');
      if (!originalTable && !gridContainer) {
        showError('No table or grid found!');
        return;
      }

      var out = document.createElement('table');
      out.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;font-family:monospace';
      var keepIndices = null;

      if (gridContainer && !originalTable) {
        var headerTexts = Array.from(doc.querySelectorAll('[role="columnheader"]')).map(function (h) { return cleanText(h); });
        keepIndices = filterIndices(headerTexts);
        buildHeader(out, headerTexts, keepIndices);
        var allRows = Array.from(doc.querySelectorAll('[role="row"]'));
        var dataRows = allRows.filter(function (r) {
          return r.querySelector('[role="gridcell"]') && !r.closest('[role="columnheader"]');
        });
        buildTable(out, dataRows, '[role="gridcell"]', keepIndices);
      } else {
        var thead = originalTable.querySelector('thead');
        var tbody = originalTable.querySelector('tbody');
        if (thead) {
          var headerTexts2 = Array.from(thead.querySelectorAll('th, td')).map(function (h) { return cleanText(h); });
          keepIndices = filterIndices(headerTexts2);
          buildHeader(out, headerTexts2, keepIndices);
        }
        if (tbody) buildTable(out, Array.from(tbody.querySelectorAll('tr')), 'td', keepIndices);
      }

      tableHtml = out.outerHTML;
      ascii = generateAscii(out);
      error = null;
      errorBanner.classList.add('hidden');
      resultsWrap.classList.remove('hidden');
      asciiPre.textContent = ascii;
      htmlDiv.innerHTML = tableHtml;
    }

    function showError(msg) {
      error = msg;
      errorBanner.textContent = msg;
      errorBanner.classList.remove('hidden');
    }

    function copyTable() {
      if (!tableHtml) return;
      var ok = function () {
        setCopied('table');
      };
      try {
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([tableHtml], { type: 'text/html' }),
              'text/plain': new Blob([ascii], { type: 'text/plain' }),
            }),
          ]).then(ok).catch(function () { /* clipboard unavailable */ });
        } else {
          navigator.clipboard.writeText(ascii).then(ok).catch(function () { /* clipboard unavailable */ });
        }
      } catch (e) {
        /* clipboard unavailable */
      }
    }

    function copyAscii() {
      if (!ascii) return;
      try {
        navigator.clipboard.writeText(ascii).then(function () {
          setCopied('ascii');
        }).catch(function () { /* clipboard unavailable */ });
      } catch (e) {
        /* clipboard unavailable */
      }
    }

    function setCopied(kind) {
      copied = kind;
      paintCopyButtons();
      App.timer(function () {
        copied = null;
        paintCopyButtons();
      }, 1500);
    }

    function selectAll() {
      var container = view === 'ascii' ? asciiPre : htmlDiv;
      if (!container) return;
      var range = document.createRange();
      range.selectNodeContents(container);
      var sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    function setView(v) {
      view = v;
      asciiBtn.classList.toggle('active', v === 'ascii');
      htmlBtn.classList.toggle('active', v === 'html');
      asciiPre.classList.toggle('hidden', v !== 'ascii');
      htmlDiv.classList.toggle('hidden', v !== 'html');
    }

    function paintCopyButtons() {
      copyTableBtn.innerHTML = '';
      copyTableBtn.appendChild(App.icon(copied === 'table' ? 'check' : 'table-2',
        'h-3 w-3' + (copied === 'table' ? ' text-ctp-green' : ''), 12));
      copyTableBtn.appendChild(App.el('span', { text: copied === 'table' ? 'Copied' : 'Copy as Table' }));

      copyAsciiBtn.innerHTML = '';
      copyAsciiBtn.appendChild(App.icon(copied === 'ascii' ? 'check' : 'braces',
        'h-3 w-3' + (copied === 'ascii' ? ' text-ctp-green' : ''), 12));
      copyAsciiBtn.appendChild(App.el('span', { text: copied === 'ascii' ? 'Copied' : 'Copy ASCII' }));
    }

    /* ── DOM ── */

    var errorBanner = App.el('div', {
      class: 'hidden rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3 font-mono text-xs text-ctp-red'
    });

    var textarea = App.el('textarea', {
      class: 'tool-textarea', rows: 8, spellcheck: 'false',
      placeholder: 'Paste your dirty table HTML or ELK grid here…'
    });
    textarea.addEventListener('input', function () { input = textarea.value; });

    var cleanBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono font-medium bg-ctp-teal/15 border border-ctp-teal/30 text-ctp-teal hover:bg-ctp-teal/25 transition-colors',
      onclick: clean
    }, App.icon('sparkles', 'h-3.5 w-3.5', 14), App.el('span', { text: 'Clean Table' }));

    /* view toggle */
    var asciiBtn = App.el('button', { type: 'button', class: 'active', text: 'ASCII' });
    var htmlBtn = App.el('button', { type: 'button', text: 'HTML Table' });
    asciiBtn.addEventListener('click', function () { setView('ascii'); });
    htmlBtn.addEventListener('click', function () { setView('html'); });
    var seg = App.el('div', { class: 'seg' }, asciiBtn, htmlBtn);

    /* copy / select row */
    var copyTableBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 muted-80 hover:bg-surface0 hover-fg-90 transition-colors',
      onclick: copyTable
    });
    var copyAsciiBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 muted-80 hover:bg-surface0 hover-fg-90 transition-colors',
      onclick: copyAscii
    });
    var selectBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 muted-80 hover:bg-surface0 hover-fg-90 transition-colors',
      onclick: selectAll
    }, App.icon('mouse-pointer-click', 'h-3 w-3', 12), App.el('span', { text: 'Select All' }));

    var actionsRow = App.el('div', { class: 'flex flex-wrap items-center gap-2' }, copyTableBtn, copyAsciiBtn, selectBtn);

    /* previews */
    asciiPre = App.el('pre', {
      class: 'preview rounded-lg border border-border/60 bg-mantle p-4 font-mono text-xs leading-relaxed fg-90'
    });
    htmlDiv = App.el('div', {
      class: 'preview hidden rounded-lg border border-border/60 bg-mantle p-4'
    });

    var tip = App.el('p', {
      class: 'text-xs font-mono muted-60',
      text: 'Tip: both copy buttons work from any view — pastes straight into Excel/Sheets with formatting.'
    });

    var resultsWrap = App.el('div', { class: 'hidden flex flex-col gap-4' }, seg, actionsRow, asciiPre, htmlDiv, tip);

    paintCopyButtons();

    root.appendChild(textarea);
    root.appendChild(cleanBtn);
    root.appendChild(errorBanner);
    root.appendChild(resultsWrap);
  }
});
})();
