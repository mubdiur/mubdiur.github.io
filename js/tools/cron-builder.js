/* -------------------------------------------------------------------
   Cron Builder - visual schedule planner.
   Preset picker plus per-field inputs compose the expression live.
   Transforms.cronParse powers the plain-words breakdown, next 5 runs,
   and the 7x24 fire grid for the coming week. No timers, no globals.
   ------------------------------------------------------------------- */
(function () {
'use strict';

var PRESETS = [
  { value: 'custom', label: 'Custom fields', expr: null },
  { value: 'every-minute', label: 'Every minute', expr: '* * * * *' },
  { value: 'hourly', label: 'Hourly', expr: '0 * * * *' },
  { value: 'daily', label: 'Daily (midnight)', expr: '0 0 * * *' },
  { value: 'weekly', label: 'Weekly (Sun midnight)', expr: '0 0 * * 0' },
  { value: 'monthly', label: 'Monthly (1st midnight)', expr: '0 0 1 * *' },
  { value: 'weekdays', label: 'Weekdays 9am', expr: '0 9 * * 1-5' }
];
var FIELDS = [
  { key: 'minute', label: 'Minute', def: '*/5' },
  { key: 'hour', label: 'Hour', def: '*' },
  { key: 'day', label: 'Day', def: '*' },
  { key: 'month', label: 'Month', def: '*' },
  { key: 'weekday', label: 'Weekday', def: '*' }
];
var FIELD_NAMES = ['Minute', 'Hour', 'Day', 'Month', 'Weekday'];
var DNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

App.registerTool('cron-builder', {
  css: '' +
    '.t-cron-builder .cb-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;}\n' +
    '.t-cron-builder .cb-field{display:flex;flex-direction:column;gap:0.2rem;min-width:0;}\n' +
    '.t-cron-builder .cb-field label{font-family:var(--font-mono);font-size:11px;color:rgba(227,227,227,0.55);}\n' +
    '.t-cron-builder .cb-input{width:5.5rem;height:30px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);padding:0 0.5rem;font-family:var(--font-mono);font-size:14px;color:rgba(227,227,227,0.9);outline:none;}\n' +
    '.t-cron-builder .cb-input:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-cron-builder .cb-sel{height:30px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);font-family:var(--font-mono);font-size:14px;color:rgba(227,227,227,0.8);outline:none;}\n' +
    '.t-cron-builder .cb-expr{font-family:var(--font-mono);font-size:16px;color:rgba(83,163,249,0.9);}\n' +
    '.t-cron-builder .cb-summary{font-size:14px;color:rgba(227,227,227,0.9);}\n' +
    '.t-cron-builder .cb-list{font-family:var(--font-mono);font-size:12px;color:rgba(227,227,227,0.75);line-height:1.6;}\n' +
    '.t-cron-builder .cb-error{font-family:var(--font-mono);font-size:14px;color:rgba(255,107,107,0.95);}\n' +
    '.t-cron-builder .cb-sec{font-family:var(--font-mono);font-size:11px;color:rgba(227,227,227,0.5);text-transform:uppercase;letter-spacing:0.08em;}\n' +
    '.t-cron-builder .cb-grid{border-collapse:collapse;font-family:var(--font-mono);font-size:10px;}\n' +
    '.t-cron-builder .cb-grid th{font-weight:normal;color:rgba(227,227,227,0.45);padding:1px 2px;}\n' +
    '.t-cron-builder .cb-grid td{width:14px;height:14px;text-align:center;color:rgba(227,227,227,0.35);}\n' +
    '.t-cron-builder .cb-grid td.cb-on{color:rgba(83,163,249,1);}\n' +
    '.t-cron-builder .cb-grid tr.cb-today th{color:rgba(83,163,249,0.95);font-weight:bold;}\n' +
    '.t-cron-builder .cb-run{display:flex;align-items:center;gap:0.5rem;}\n' +
    '.t-cron-builder .cb-run .btn-copy{padding:0 0.4rem;font-size:11px;}\n',

  mount: function (root) {
    var T = window.Transforms;
    var presetSel = App.el('select', { class: 'cb-sel', 'aria-label': 'Preset' });
    PRESETS.forEach(function (p) {
      presetSel.appendChild(App.el('option', { value: p.value, text: p.label }));
    });
    var inputs = {};
    FIELDS.forEach(function (f) {
      inputs[f.key] = App.el('input', { class: 'cb-input cb-f-' + f.key, value: f.def, spellcheck: 'false', 'aria-label': f.label });
    });
    var exprLine = App.el('div', { class: 'flex items-center gap-2 flex-wrap' });
    var summaryEl = App.el('div', { class: 'cb-summary' });
    var errEl = App.el('div', { class: 'cb-error' });
    var breakEl = App.el('div', { class: 'cb-list cb-breakdown' });
    var runsEl = App.el('div', { class: 'cb-list cb-runs' });
    var gridWrap = App.el('div', { class: 'cb-gridwrap', style: { overflowX: 'auto' } });

  function expr() {
    return FIELDS.map(function (f) {
      var v = inputs[f.key].value.trim();
      return v ? v : '*';
    }).join(' ');
  }

  function fmtRun(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + T.cronPad(d.getMonth() + 1) + '-' + T.cronPad(d.getDate()) + ' ' +
      T.cronPad(d.getHours()) + ':' + T.cronPad(d.getMinutes()) + ' (' + DNAMES[d.getDay()] + ')';
  }
  function buildGrid(match) {
    var table = App.el('table', { class: 'cb-grid' });
    var head = App.el('tr');
    var h, d, hh, mi;
    head.appendChild(App.el('th', { text: '' }));
    for (h = 0; h < 24; h++) head.appendChild(App.el('th', { text: String(h) }));
    table.appendChild(head);
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var base = new Date(now.getTime() + ((7 - now.getDay()) % 7) * 86400000);
    var todayStr = now.toDateString();
    for (d = 0; d < 7; d++) {
      var day = new Date(base.getTime() + d * 86400000);
      var row = App.el('tr');
      if (day.toDateString() === todayStr) row.className = 'cb-today';
      row.appendChild(App.el('th', { text: DNAMES[day.getDay()] }));
      for (hh = 0; hh < 24; hh++) {
        var on = false, firstMi = 0;
        for (mi = 0; mi < 60; mi++) {
          if (match(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mi))) { on = true; firstMi = mi; break; }
        }
        var tip = DNAMES[day.getDay()] + ' ' + T.cronPad(hh) + (on ? ':' + T.cronPad(firstMi) + ' first fire' : ':00 quiet');
        row.appendChild(App.el('td', { class: on ? 'cb-on' : '', text: on ? 'X' : '-', title: tip }));
      }
      table.appendChild(row);
    }
    return table;
  }

  function showError(msg) {
    summaryEl.textContent = '';
    breakEl.textContent = '';
    runsEl.textContent = '';
    gridWrap.innerHTML = '';
    errEl.textContent = msg;
  }

  function refresh() {
    if (!root.isConnected) return;
    var e = expr();
    exprLine.innerHTML = '';
    exprLine.appendChild(App.el('span', { class: 'cb-expr', text: e }));
    exprLine.appendChild(App.copyButton(e));
    var c;
    try {
      c = T.cronParse(e);
    } catch (err) {
      showError((err && err.message) || String(err));
      return;
    }
    errEl.textContent = '';
    summaryEl.textContent = c.summary;
    breakEl.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      breakEl.appendChild(App.el('div', { text: FIELD_NAMES[i] + ': ' + c.fieldTexts[i] }));
    }
    var ms = T.cronNext(e, 5);
    runsEl.innerHTML = '';
    if (!ms.length) {
      runsEl.appendChild(App.el('div', { text: 'No runs in the next 5 years - check the day/month combo.' }));
    } else {
      ms.forEach(function (t) {
        var label = fmtRun(t);
        runsEl.appendChild(App.el('div', { class: 'cb-run' },
          App.el('span', { text: label }),
          App.copyButton(label, 'Copy')));
      });
    }
    gridWrap.innerHTML = '';
    gridWrap.appendChild(buildGrid(c.match));
  }
    var deb = App.debounce(refresh, 150);

    presetSel.addEventListener('change', function () {
      var p = null;
      for (var i = 0; i < PRESETS.length; i++) {
        if (PRESETS[i].value === presetSel.value) { p = PRESETS[i]; break; }
      }
      if (p && p.expr) {
        var parts = p.expr.split(' ');
        for (var k = 0; k < FIELDS.length; k++) inputs[FIELDS[k].key].value = parts[k];
      }
      refresh();
    });
    FIELDS.forEach(function (f) {
      inputs[f.key].addEventListener('input', function () {
        presetSel.value = 'custom';
        deb();
      });
    });

    var row = App.el('div', { class: 'cb-row' });
    row.appendChild(App.el('div', { class: 'cb-field' }, App.el('label', { text: 'Preset' }), presetSel));
    FIELDS.forEach(function (f) {
      row.appendChild(App.el('div', { class: 'cb-field' }, App.el('label', { text: f.label }), inputs[f.key]));
    });
    var form = App.el('div', { class: 'flex flex-col', style: { gap: '1rem' } },
      row,
      exprLine,
      summaryEl,
      errEl,
      App.el('div', { class: 'cb-sec', text: 'Fields' }),
      breakEl,
      App.el('div', { class: 'cb-sec', text: 'Next 5 runs' }),
      runsEl,
      App.el('div', { class: 'cb-sec', text: 'Coming week' }),
      gridWrap);
    root.appendChild(form);
    refresh();
  }
});
})();
