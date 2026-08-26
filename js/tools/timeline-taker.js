/* ═══════════════════════════════════════════════════════════
   Timeline Taker — incident logbook.
   Ported from src/components/tools/timeline-taker.tsx.
   Date/time/summary entries, CSV import/export, row toolbar
   (add above/below, duplicate, delete, move), keyboard shortcuts
   (Ctrl+S save, Ctrl+Z/Ctrl+Shift+Z undo/redo, Esc discard,
   Enter next row + autosave, ↑/↓ adjust cells, Ctrl+↑/↓ move
   in summary column), localStorage auto-save, auto-timestamps.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var STORAGE_KEY = 'timeline-taker-entries';
var seq = 1;

function formatDate(date) {
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return m + '/' + d + '/' + date.getFullYear();
}

function formatTime(date) {
  var hours = date.getHours();
  var minutes = String(date.getMinutes()).padStart(2, '0');
  var ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return String(hours).padStart(2, '0') + ':' + minutes + ' ' + ampm;
}

function parseDate(str) {
  var parts = str.split('/');
  if (parts.length !== 3) return null;
  var d = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
  return isNaN(d.getTime()) ? null : d;
}

function parseTime(str) {
  var match = str.match(/(\d+):(\d+)\s(AM|PM)/);
  if (!match) return null;
  var hours = parseInt(match[1], 10);
  var minutes = parseInt(match[2], 10);
  if (match[3] === 'PM' && hours < 12) hours += 12;
  if (match[3] === 'AM' && hours === 12) hours = 0;
  var d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function parseCSV(csvText) {
  var lines = csvText.trim().split(/\r\n|\n/);
  if (lines.length > 0) lines.shift(); // header
  return lines
    .map(function (line, index) {
      var regex = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
      var matches = line.match(regex) || [];
      var values = matches.map(function (v) { return v.replace(/^"|"$/g, '').replace(/""/g, '"'); });
      if (values.length < 3) return null;
      return { id: Date.now() + index, date: values[0] || '', time: values[1] || '', summary: values[2] || '' };
    })
    .filter(function (e) { return e !== null && Boolean(e.summary); });
}

App.registerTool('timeline-taker', {
  css: '' +
    '.t-timeline-taker .row-saved{background:rgba(83,163,249,0.1);}\n' +
    '.t-timeline-taker .row-modified{background:rgba(230,167,0,0.1);}\n' +
    '.t-timeline-taker .row-unsaved{background:rgba(251,86,91,0.1);}\n' +
    '.t-timeline-taker .cell-input{width:100%;background:transparent;padding:0.5rem 0.75rem;font-size:14px;font-family:var(--font-mono);color:rgba(227,227,227,0.9);outline:none;border:none;}\n' +
    '.t-timeline-taker .cell-input::placeholder{color:rgba(141,148,158,0.3);}\n' +
    '.t-timeline-taker .cell-input:focus{background:rgba(0,0,0,0.2);border-radius:0.375rem;}\n' +
    '.t-timeline-taker .th-cell{background:rgba(51,53,56,0.8);color:rgba(141,148,158,0.9);padding:0.625rem 0.75rem;font-family:var(--font-mono);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;}\n' +
    '.t-timeline-taker .sticky-head{position:sticky;top:0;z-index:1;}\n' +
    '.t-timeline-taker .dot{width:8px;height:8px;border-radius:2px;display:inline-block;}\n' +
    '.t-timeline-taker .dot-green{background:rgba(83,163,249,0.5);}\n' +
    '.t-timeline-taker .dot-yellow{background:rgba(230,167,0,0.6);}\n' +
    '.t-timeline-taker .dot-red{background:rgba(251,86,91,0.5);}\n' +
    '.t-timeline-taker .bg-red-10{background:rgba(251,86,91,0.1);}\n' +
    '.t-timeline-taker .bg-blue-10{background:rgba(115,180,250,0.1);}\n' +
    '.t-timeline-taker .btn-danger{display:flex;align-items:center;gap:0.375rem;border-radius:0.375rem;background:rgba(251,86,91,0.2);border:1px solid rgba(251,86,91,0.4);padding:0.375rem 0.75rem;font-family:var(--font-mono);font-size:12px;color:var(--ctp-red);cursor:pointer;transition:background-color .2s;}\n' +
    '.t-timeline-taker .btn-danger:hover{background:rgba(251,86,91,0.3);}\n' +
    '.t-timeline-taker .btn-replace{display:flex;align-items:center;gap:0.375rem;border-radius:0.375rem;background:rgba(230,167,0,0.1);border:1px solid rgba(230,167,0,0.4);padding:0.375rem 0.75rem;font-family:var(--font-mono);font-size:12px;color:var(--ctp-yellow);cursor:pointer;transition:background-color .2s;}\n' +
    '.t-timeline-taker .btn-replace:hover{background:rgba(230,167,0,0.2);}\n' +
    '.t-timeline-taker .muted-70{color:rgba(141,148,158,0.7);}\n' +
    '.t-timeline-taker .muted-80{color:rgba(141,148,158,0.8);}\n' +
    '.t-timeline-taker .fg-90{color:rgba(227,227,227,0.9);}\n' +
    '.t-timeline-taker .hover-fg-90:hover{color:rgba(227,227,227,0.9);}\n' +
    '.t-timeline-taker .row-active{box-shadow:inset 2px 0 0 rgba(83,163,249,0.7);}\n' +
    '.t-timeline-taker button:disabled{opacity:0.4;cursor:not-allowed;}\n',

  mount: function (root) {
    var entries = [];
    var loaded = false;
    var importMode = null; // 'ask' | null
    var pendingImport = [];
    var confirmClear = false;
    var fileInput = null;
    var tbody = null;
    var undoStack = [];
    var redoStack = [];
    var lastHistoryAt = 0;
    var activeId = null;
    var rowAboveBtn, rowBelowBtn, dupBtn, moveUpBtn, moveDownBtn, delBtn;

    var btnPrimary =
      'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono font-medium bg-ctp-teal/15 border border-ctp-teal/30 text-ctp-teal hover:bg-ctp-teal/25 transition-colors';
    var btnSecondary =
      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 muted-80 hover:bg-surface0 hover-fg-90 transition-colors';

    function stateCls(state) {
      return state === 'saved' ? 'row-saved' : state === 'modified' ? 'row-modified' : 'row-unsaved';
    }

    function findEntry(id) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === id) return entries[i];
      }
      return null;
    }

    /* ── persistence ── */

    function persist(list) {
      try {
        var clean = list
          .filter(function (e) { return e.summary.trim(); })
          .map(function (e) { return { id: e.id, date: e.date, time: e.time, summary: e.summary, state: 'saved' }; });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        entries.forEach(function (e) {
          var c = clean.find(function (x) { return x.id === e.id; });
          if (c) e.state = 'saved';
        });
      } catch (err) {
        /* storage unavailable */
      }
    }

    function save() {
      persist(entries);
      syncAllRows();
    }

    function discard() {
      lastHistoryAt = 0; // never coalesce a discrete action into typing history
      pushHistory();
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) entries = JSON.parse(raw).map(function (e) { return Object.assign({}, e, { state: 'saved' }); });
        else entries = [];
      } catch (err) {
        entries = [];
      }
      renderTable();
      ensureTrailing();
    }

    /* ── history (undo / redo) ── */

    var HISTORY_MAX = 100;
    var HISTORY_COALESCE_MS = 800;

    function snapshotEntries() {
      return entries.map(function (e) { return Object.assign({}, e); });
    }

    function pushHistory() {
      var now = Date.now();
      // coalesce rapid edits (typing bursts) into a single undo step
      if (now - lastHistoryAt < HISTORY_COALESCE_MS && undoStack.length) return;
      undoStack.push(snapshotEntries());
      if (undoStack.length > HISTORY_MAX) undoStack.shift();
      redoStack = [];
      lastHistoryAt = now;
    }

    function undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshotEntries());
      entries = undoStack.pop();
      lastHistoryAt = 0;
      renderTable();
      ensureTrailing();
      restoreFocusAfterHistory();
    }

    function redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshotEntries());
      entries = redoStack.pop();
      lastHistoryAt = 0;
      renderTable();
      ensureTrailing();
      restoreFocusAfterHistory();
    }

    function restoreFocusAfterHistory() {
      // the focused row may have been removed by the restore; fall back to the first row
      var active = document.activeElement;
      if (active && active.tagName === 'INPUT') return;
      var rows = tbody.querySelectorAll('tr');
      if (!rows.length) return;
      var inputs = rows[0].querySelectorAll('input');
      var summary = inputs[inputs.length - 1];
      if (summary) summary.focus();
    }

    /* ── entry mutations ── */

    function updateField(id, kind, value) {
      var entry = findEntry(id);
      if (!entry) return;
      var old = kind === 'date' ? entry.date : kind === 'time' ? entry.time : entry.summary;
      if (old === value) return;
      pushHistory();
      var hadDate = entry.date;
      var hadTime = entry.time;
      if (kind === 'date') entry.date = value;
      else if (kind === 'time') entry.time = value;
      else entry.summary = value;
      if (entry.state === 'saved') entry.state = 'modified';
      // auto-fill timestamp when summary is typed on a fresh row
      if (kind === 'summary' && value && !hadDate && !hadTime) {
        var now = new Date();
        entry.date = formatDate(now);
        entry.time = formatTime(now);
      }
      syncRow(id);
      ensureTrailing();
    }

    function appendRow() {
      entries.push({ id: Date.now() + seq++, date: '', time: '', summary: '', state: 'unsaved' });
      renderTable();
    }

    function ensureTrailing() {
      if (!loaded) return;
      if (entries.length === 0 || entries[entries.length - 1].summary.trim()) {
        appendRow();
      }
    }

    function onCellKey(ev, id, kind) {
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
      ev.preventDefault();
      var inc = ev.key === 'ArrowUp' ? 1 : -1;
      var entry = findEntry(id);
      if (!entry) return;
      if (kind === 'date') {
        var d = parseDate(entry.date);
        if (d) {
          d.setDate(d.getDate() + inc);
          updateField(id, 'date', formatDate(d));
        }
      } else {
        var t = parseTime(entry.time);
        if (t) {
          var unit = ev.ctrlKey ? 'Hours' : 'Minutes';
          if (unit === 'Hours') t.setHours(t.getHours() + inc);
          else t.setMinutes(t.getMinutes() + inc);
          updateField(id, 'time', formatTime(t));
        }
      }
    }

    function focusLastSummary() {
      var rows = tbody.querySelectorAll('tr');
      var last = rows[rows.length - 1];
      if (!last) return;
      var inputs = last.querySelectorAll('input');
      var summary = inputs[inputs.length - 1];
      if (summary) summary.focus();
    }

    function focusAdjacentSummary(id, dir) {
      var rows = tbody.querySelectorAll('tr');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-id') === String(id)) {
          var target = rows[i + dir];
          if (!target) return false;
          var inputs = target.querySelectorAll('input');
          var summary = inputs[inputs.length - 1];
          if (summary) { summary.focus(); return true; }
          return false;
        }
      }
      return false;
    }

    /* ── row operations (toolbar) ── */

    function rowIndex(id) {
      var s = String(id);
      for (var i = 0; i < entries.length; i++) {
        if (String(entries[i].id) === s) return i;
      }
      return -1;
    }

    function focusRowSummary(id) {
      var tr = tbody.querySelector('tr[data-id="' + id + '"]');
      if (!tr) return false;
      var inputs = tr.querySelectorAll('input');
      var summary = inputs[inputs.length - 1];
      if (!summary) return false;
      summary.focus();
      return true;
    }

    function setActiveRow(id) {
      activeId = id;
      var rows = tbody.querySelectorAll('tr');
      for (var i = 0; i < rows.length; i++) {
        rows[i].classList.toggle('row-active', rows[i].getAttribute('data-id') === String(id));
      }
      updateToolbar();
    }

    function updateToolbar() {
      var i = activeId === null ? -1 : rowIndex(activeId);
      var has = i >= 0;
      rowAboveBtn.disabled = !has;
      rowBelowBtn.disabled = !has;
      dupBtn.disabled = !has;
      delBtn.disabled = !has;
      moveUpBtn.disabled = !has || i <= 0;
      moveDownBtn.disabled = !has || i >= entries.length - 1;
    }

    function newEmptyEntry() {
      return { id: Date.now() + seq++, date: '', time: '', summary: '', state: 'unsaved' };
    }

    function addRowAbove() {
      var i = rowIndex(activeId);
      if (i < 0) return;
      pushHistory();
      lastHistoryAt = 0; // discrete toolbar action: fresh undo step
      var neu = newEmptyEntry();
      entries.splice(i, 0, neu);
      renderTable();
      ensureTrailing();
      focusRowSummary(neu.id);
    }

    function addRowBelow() {
      var i = rowIndex(activeId);
      if (i < 0) return;
      pushHistory();
      lastHistoryAt = 0; // discrete toolbar action: fresh undo step
      var neu = newEmptyEntry();
      entries.splice(i + 1, 0, neu);
      renderTable();
      ensureTrailing();
      focusRowSummary(neu.id);
    }

    function duplicateRow() {
      var i = rowIndex(activeId);
      if (i < 0) return;
      var src = entries[i];
      pushHistory();
      lastHistoryAt = 0; // discrete toolbar action: fresh undo step
      var neu = { id: Date.now() + seq++, date: src.date, time: src.time, summary: src.summary, state: 'unsaved' };
      entries.splice(i + 1, 0, neu);
      renderTable();
      ensureTrailing();
      focusRowSummary(neu.id);
    }

    function deleteRow() {
      var i = rowIndex(activeId);
      if (i < 0) return;
      pushHistory();
      lastHistoryAt = 0; // discrete toolbar action: fresh undo step
      entries.splice(i, 1);
      renderTable();
      ensureTrailing();
      var target = entries[Math.min(i, entries.length - 1)];
      if (target) focusRowSummary(target.id);
      else focusLastSummary();
    }

    function moveRow(dir) {
      var i = rowIndex(activeId);
      if (i < 0) return;
      var j = i + dir;
      if (j < 0 || j >= entries.length) return;
      pushHistory();
      lastHistoryAt = 0; // discrete toolbar action: fresh undo step
      var tmp = entries[i];
      entries[i] = entries[j];
      entries[j] = tmp;
      renderTable();
      ensureTrailing();
      focusRowSummary(activeId);
    }

    /* ── CSV import / export ── */

    function exportCsv() {
      var data = entries.filter(function (e) { return e.summary.trim(); });
      if (!data.length) return;
      var rows = data.map(function (r) { return r.date + ',' + r.time + ',"' + r.summary.replace(/"/g, '""') + '"'; });
      var csv = 'Date,Time,Summary\n' + rows.join('\n');
      App.download('logbook_export.csv', csv, 'text/csv;charset=utf-8;');
    }

    function onImportFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var parsed = parseCSV(String(ev.target && ev.target.result || ''));
        if (parsed.length) {
          pendingImport = parsed;
          importMode = 'ask';
          renderBanners();
        }
      };
      reader.readAsText(file);
      if (fileInput) fileInput.value = '';
    }

    function applyImport(mode) {
      lastHistoryAt = 0; // discrete action: fresh undo step
      pushHistory();
      var imported = pendingImport.map(function (e) { return Object.assign({}, e, { state: 'saved' }); });
      var next = mode === 'append' ? entries.concat(imported) : imported.slice();
      entries = next;
      persist(next);
      importMode = null;
      pendingImport = [];
      renderBanners();
      renderTable();
      ensureTrailing();
    }

    function clearAll() {
      lastHistoryAt = 0; // discrete action: fresh undo step
      pushHistory();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        /* ignore */
      }
      entries = [];
      confirmClear = false;
      renderBanners();
      renderTable();
      ensureTrailing();
    }

    /* ── rendering ── */

    function buildRow(e) {
      var tr = App.el('tr', { class: 'border-t border-border/40 transition-colors ' + stateCls(e.state), dataset: { id: String(e.id) } });

      var dateInput = App.el('input', {
        class: 'cell-input', value: e.date, placeholder: 'MM/DD/YYYY', spellcheck: 'false',
        'aria-label': 'Date'
      });
      var timeInput = App.el('input', {
        class: 'cell-input', value: e.time, placeholder: 'hh:mm AM', spellcheck: 'false',
        'aria-label': 'Time'
      });
      var summaryInput = App.el('input', {
        class: 'cell-input', value: e.summary, placeholder: 'Summary…', spellcheck: 'false',
        'aria-label': 'Summary'
      });

      dateInput.addEventListener('input', function () { updateField(e.id, 'date', dateInput.value); });
      dateInput.addEventListener('keydown', function (ev) { onCellKey(ev, e.id, 'date'); });
      timeInput.addEventListener('input', function () { updateField(e.id, 'time', timeInput.value); });
      timeInput.addEventListener('keydown', function (ev) { onCellKey(ev, e.id, 'time'); });
      summaryInput.addEventListener('input', function () { updateField(e.id, 'summary', summaryInput.value); });
      summaryInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          var entry = findEntry(e.id);
          if (entry && entry.summary.trim()) save();
          lastHistoryAt = 0; // Enter commits the row: next row starts a fresh undo step
          if (!focusAdjacentSummary(e.id, 1)) {
            appendRow();
            App.timer(function () { focusLastSummary(); }, 0);
          }
        } else if (ev.ctrlKey && ev.key === 'ArrowDown') {
          ev.preventDefault();
          focusAdjacentSummary(e.id, 1);
        } else if (ev.ctrlKey && ev.key === 'ArrowUp') {
          ev.preventDefault();
          focusAdjacentSummary(e.id, -1);
        }
      });

      tr.appendChild(App.el('td', {}, dateInput));
      tr.appendChild(App.el('td', {}, timeInput));
      tr.appendChild(App.el('td', {}, summaryInput));
      return tr;
    }

    function renderTable() {
      // preserve focus/caret across rebuilds (rows are recreated, unlike React keys)
      var active = document.activeElement;
      var focusId = null;
      var focusIdx = -1;
      var caret = 0;
      if (active && active.tagName === 'INPUT' && active.closest('tbody')) {
        var tr = active.closest('tr');
        var inputs = tr ? tr.querySelectorAll('input') : [];
        for (var i = 0; i < inputs.length; i++) {
          if (inputs[i] === active) { focusIdx = i; break; }
        }
        focusId = tr ? tr.getAttribute('data-id') : null;
        caret = active.selectionStart || 0;
      }
      tbody.innerHTML = '';
      entries.forEach(function (e) {
        tbody.appendChild(buildRow(e));
      });
      if (focusId !== null && focusIdx >= 0) {
        var tr2 = tbody.querySelector('tr[data-id="' + focusId + '"]');
        if (tr2) {
          var inputs2 = tr2.querySelectorAll('input');
          var target = inputs2[focusIdx];
          if (target) {
            target.focus();
            if (target.setSelectionRange) target.setSelectionRange(caret, caret);
          }
        }
      }
    }

    function syncRow(id) {
      var entry = findEntry(id);
      var tr = tbody.querySelector('tr[data-id="' + id + '"]');
      if (!entry || !tr) return;
      var inputs = tr.querySelectorAll('input');
      inputs[0].value = entry.date;
      inputs[1].value = entry.time;
      inputs[2].value = entry.summary;
      tr.className = 'border-t border-border/40 transition-colors ' + stateCls(entry.state) + (tr.classList.contains('row-active') ? ' row-active' : '');
    }

    function syncAllRows() {
      entries.forEach(function (e) { syncRow(e.id); });
    }

    function renderBanners() {
      importBanner.classList.toggle('hidden', importMode !== 'ask');
      if (importMode === 'ask') {
        importCount.textContent =
          'Imported ' + pendingImport.length + ' entr' + (pendingImport.length === 1 ? 'y' : 'ies') + '. Append or replace?';
      }
      confirmBanner.classList.toggle('hidden', !confirmClear);
    }

    /* ── initial load from localStorage ── */
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        entries = parsed.map(function (e) { return Object.assign({}, e, { state: 'saved' }); });
      }
    } catch (err) {
      /* corrupt storage — start fresh */
    }
    loaded = true;

    /* ── keyboard shortcuts ── */
    App.on(document, 'keydown', function (ev) {
      if (ev.ctrlKey && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        save();
      } else if (ev.ctrlKey && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
      } else if (ev.ctrlKey && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        discard();
      } else if (ev.key === 'Enter' && (document.activeElement && document.activeElement.tagName || '') !== 'INPUT') {
        ev.preventDefault();
        focusLastSummary();
      }
    });

    /* ── DOM ── */

    var header = App.el('div', { class: 'flex flex-wrap items-center justify-between gap-3' },
      App.el('div', { class: 'flex flex-wrap items-center gap-1.5 font-mono text-xs muted-70' },
        App.el('kbd', { text: 'Ctrl+S' }), App.el('span', { text: ' save · ' }),
        App.el('kbd', { text: 'Ctrl+Z' }), App.el('span', { text: ' undo · ' }),
        App.el('kbd', { text: 'Ctrl+Shift+Z' }), App.el('span', { text: ' redo · ' }),
        App.el('kbd', { text: 'Enter' }), App.el('span', { text: ' autosaves row · ' }),
        App.el('kbd', { text: '↑' }), App.el('span', { text: '/' }),
        App.el('kbd', { text: '↓' }), App.el('span', { text: ' adjust date/time · ' }),
        App.el('kbd', { text: 'Ctrl+↑' }), App.el('span', { text: '/' }),
        App.el('kbd', { text: 'Ctrl+↓' }), App.el('span', { text: ' move in summary' })));

    fileInput = App.el('input', { type: 'file', accept: '.csv', class: 'hidden' });
    fileInput.addEventListener('change', function () { onImportFile(fileInput.files[0]); });

    var importBtn = App.el('button', {
      type: 'button',
      class: btnSecondary,
      onclick: function () { fileInput.click(); }
    }, App.icon('upload', 'h-3 w-3', 12), App.el('span', { text: 'Import CSV' }));

    var exportBtn = App.el('button', {
      type: 'button',
      class: btnSecondary,
      onclick: exportCsv
    }, App.icon('download', 'h-3 w-3', 12), App.el('span', { text: 'Export CSV' }));

    var saveBtn = App.el('button', {
      type: 'button',
      class: btnPrimary,
      onclick: save
    }, App.icon('save', 'h-3.5 w-3.5', 14), App.el('span', { text: 'Save' }));

    var clearBtn = App.el('button', {
      type: 'button',
      class: btnSecondary + ' hover:text-ctp-red',
      onclick: function () { confirmClear = true; renderBanners(); }
    }, App.icon('trash-2', 'h-3 w-3', 12), App.el('span', { text: 'Clear All' }));

    header.appendChild(App.el('div', { class: 'flex flex-wrap items-center gap-2' },
      importBtn, fileInput, exportBtn, saveBtn, clearBtn));

    /* confirm-clear banner */
    var confirmBanner = App.el('div', {
      class: 'hidden flex flex-wrap items-center gap-3 rounded-lg border border-ctp-red/30 bg-red-10 p-3'
    },
      App.el('span', { class: 'font-mono text-xs fg-90', text: 'Delete all log entries? This cannot be undone.' }),
      App.el('button', {
        type: 'button',
        class: 'btn-danger',
        onclick: clearAll
      }, App.el('span', { text: 'Yes, clear everything' })),
      App.el('button', {
        type: 'button',
        class: btnSecondary,
        onclick: function () { confirmClear = false; renderBanners(); }
      }, App.el('span', { text: 'Cancel' })));

    /* import banner */
    var importCount = App.el('span', { class: 'font-mono text-xs fg-90' });
    var importBanner = App.el('div', {
      class: 'hidden flex flex-wrap items-center gap-3 rounded-lg border border-ctp-blue/30 bg-blue-10 p-3'
    },
      importCount,
      App.el('button', {
        type: 'button',
        class: btnPrimary,
        onclick: function () { applyImport('append'); }
      }, App.el('span', { text: 'Append' })),
      App.el('button', {
        type: 'button',
        class: 'btn-replace',
        onclick: function () { applyImport('replace'); }
      }, App.el('span', { text: 'Replace' })),
      App.el('button', {
        type: 'button',
        class: btnSecondary,
        onclick: function () { importMode = null; pendingImport = []; renderBanners(); }
      }, App.el('span', { text: 'Cancel' })));

    /* row-ops toolbar */
    rowAboveBtn = App.el('button', { type: 'button', class: btnSecondary, onclick: addRowAbove },
      App.icon('arrow-up', 'h-3 w-3', 12), App.el('span', { text: 'Add Above' }));
    rowBelowBtn = App.el('button', { type: 'button', class: btnSecondary, onclick: addRowBelow },
      App.icon('arrow-down', 'h-3 w-3', 12), App.el('span', { text: 'Add Below' }));
    dupBtn = App.el('button', { type: 'button', class: btnSecondary, onclick: duplicateRow },
      App.icon('copy', 'h-3 w-3', 12), App.el('span', { text: 'Duplicate' }));
    moveUpBtn = App.el('button', { type: 'button', class: btnSecondary, onclick: function () { moveRow(-1); } },
      App.icon('arrow-up', 'h-3 w-3', 12), App.el('span', { text: 'Move Up' }));
    moveDownBtn = App.el('button', { type: 'button', class: btnSecondary, onclick: function () { moveRow(1); } },
      App.icon('arrow-down', 'h-3 w-3', 12), App.el('span', { text: 'Move Down' }));
    delBtn = App.el('button', { type: 'button', class: btnSecondary + ' hover:text-ctp-red', onclick: deleteRow },
      App.icon('trash-2', 'h-3 w-3', 12), App.el('span', { text: 'Delete' }));

    var rowToolbar = App.el('div', { class: 'flex flex-wrap items-center gap-1.5' },
      App.el('span', { class: 'font-mono text-[10px] uppercase tracking-wider muted-70', text: 'Row ops' }),
      rowAboveBtn, rowBelowBtn, dupBtn, moveUpBtn, moveDownBtn, delBtn);

    /* entries table */
    tbody = App.el('tbody');
    tbody.addEventListener('focusin', function (ev) {
      var tr = ev.target && ev.target.closest ? ev.target.closest('tr') : null;
      if (tr) setActiveRow(tr.getAttribute('data-id'));
    });
    var tableWrap = App.el('div', { class: 'overflow-auto rounded-lg border border-border/60 bg-mantle' },
      App.el('table', { class: 'w-full border-collapse text-left' },
        App.el('thead', { class: 'sticky-head' },
          App.el('tr', {},
            App.el('th', { class: 'th-cell', style: { width: '110px' }, text: 'Date' }),
            App.el('th', { class: 'th-cell', style: { width: '120px' }, text: 'Time' }),
            App.el('th', { class: 'th-cell', text: 'Summary' }))),
        tbody));

    /* legend */
    var legend = App.el('div', { class: 'flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider muted-70' },
      App.el('span', { class: 'flex items-center gap-1.5' }, App.el('span', { class: 'dot dot-green' }), App.el('span', { text: 'saved' })),
      App.el('span', { class: 'flex items-center gap-1.5' }, App.el('span', { class: 'dot dot-yellow' }), App.el('span', { text: 'modified' })),
      App.el('span', { class: 'flex items-center gap-1.5' }, App.el('span', { class: 'dot dot-red' }), App.el('span', { text: 'unsaved' })),
      App.el('span', { class: 'ml-auto flex items-center gap-1' },
        App.icon('plus', 'h-3 w-3', 12),
        App.el('span', { text: 'typing a summary timestamps it automatically' })));

    root.appendChild(header);
    root.appendChild(confirmBanner);
    root.appendChild(importBanner);
    root.appendChild(rowToolbar);
    root.appendChild(tableWrap);
    root.appendChild(legend);

    renderTable();
    ensureTrailing();
    updateToolbar();
  }
});
})();
