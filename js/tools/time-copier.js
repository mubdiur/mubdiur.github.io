/* ═══════════════════════════════════════════════════════════
   Time Copier — DST-aware time conversion across UTC, PT and
   ET, for now or any custom moment (wall time + source tz),
   with copy-ready rows and engineer extras. Ported from
   src/components/tools/time-copier.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var ZONES = [
  { key: 'pt', zone: 'America/Los_Angeles', label: 'PT', alt: { PDT: 'PST', PST: 'PDT' } },
  { key: 'et', zone: 'America/New_York', label: 'ET', alt: { EDT: 'EST', EST: 'EDT' } },
  { key: 'utc', zone: 'UTC', label: 'UTC' },
];

/** mm/dd/yyyy hh:mm AM|PM for a given IANA zone — DST handled by Intl. */
function mdy(d, zone) {
  var dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  var parts = {};
  var p, i;
  for (i = 0; i < dtf.formatToParts(d).length; i++) {
    p = dtf.formatToParts(d)[i];
    parts[p.type] = p.value;
  }
  var h = parseInt(parts.hour, 10);
  if (Number.isNaN(h)) h = 0;
  if (h === 24) h = 0; // some engines emit "24" at midnight
  var ap = (parts.dayPeriod || (h >= 12 ? 'PM' : 'AM')).toUpperCase();
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return parts.month + '/' + parts.day + '/' + parts.year + ' ' + String(h12).padStart(2, '0') + ':' + parts.minute + ' ' + ap;
}

/** Smart DST abbreviation: PDT/PST, EDT/EST, UTC, GMT. */
function zoneAbbr(d, zone) {
  var parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(d);
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].type === 'timeZoneName') return parts[i].value;
  }
  return '';
}

/** Offset like "UTC-07:00" — computed per instant, so it tracks DST. */
function zoneOffset(d, zone) {
  var parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(d);
  var v = '';
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].type === 'timeZoneName') { v = parts[i].value; break; }
  }
  return v.replace('GMT', 'UTC');
}

/** Offset of a zone at a given instant, in minutes (± from UTC). */
function tzOffsetMinutes(d, zone) {
  var parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(d);
  var v = '';
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].type === 'timeZoneName') { v = parts[i].value; break; }
  }
  var m = v.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  var sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/** Interpret "YYYY-MM-DDTHH:mm" as wall time in an IANA zone → absolute Date (DST-aware). */
function parseZonedWallTime(value, zone) {
  var m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  var nums = m.map(Number);
  var Y = nums[1], Mo = nums[2], D = nums[3], H = nums[4], Mi = nums[5];
  if (Mo < 1 || Mo > 12 || D < 1 || D > 31 || H > 23 || Mi > 59) return null;
  var guess = new Date(Date.UTC(Y, Mo - 1, D, H, Mi));
  if (Number.isNaN(guess.getTime())) return null;
  return new Date(guess.getTime() - tzOffsetMinutes(guess, zone) * 60000);
}

var CUSTOM_TZ_OPTIONS = [
  { label: 'UTC', zone: 'UTC' },
  { label: 'PT — Los Angeles', zone: 'America/Los_Angeles' },
  { label: 'ET — New York', zone: 'America/New_York' },
  { label: 'GMT — London', zone: 'Europe/London' },
  { label: 'CET — Stockholm', zone: 'Europe/Stockholm' },
  { label: 'GST — Dubai', zone: 'Asia/Dubai' },
  { label: 'IST — Kolkata', zone: 'Asia/Kolkata' },
  { label: 'BST — Dhaka', zone: 'Asia/Dhaka' },
  { label: 'JST — Tokyo', zone: 'Asia/Tokyo' },
  { label: 'AEST — Sydney', zone: 'Australia/Sydney' },
];

App.registerTool('time-copier', {
  css: '' +
    '.t-time-copier{display:flex;flex-direction:column;gap:1rem;}\n' +
    '.t-time-copier .tc-input{width:100%;border-radius:8px;border:1px solid rgba(49,50,68,0.5);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-family:var(--font-mono);font-size:14px;color:rgba(205,214,244,0.9);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-time-copier .tc-input::placeholder{color:rgba(166,173,200,0.3);}\n' +
    '.t-time-copier .tc-input:focus{border-color:rgba(148,226,213,0.4);box-shadow:0 0 0 1px rgba(148,226,213,0.3);}\n' +
    '.t-time-copier .tc-active{background:rgba(148,226,213,0.15);border:1px solid rgba(148,226,213,0.3);color:var(--ctp-teal);}\n' +
    '.t-time-copier .tc-inactive{background:rgba(49,50,68,0.5);border:1px solid rgba(49,50,68,0.5);color:rgba(166,173,200,0.8);}\n' +
    '.t-time-copier .tc-inactive:hover{color:rgba(205,214,244,0.9);}\n' +
    '.t-time-copier .tc-muted50{color:rgba(166,173,200,0.5);}\n' +
    '.t-time-copier .tc-muted60{color:rgba(166,173,200,0.6);}\n' +
    '.t-time-copier .tc-muted70{color:rgba(166,173,200,0.7);}\n' +
    '.t-time-copier .tc-muted80{color:rgba(166,173,200,0.8);}\n' +
    '.t-time-copier .tc-hover-fg:hover{color:rgba(205,214,244,0.9);}\n' +
    '.t-time-copier .tc-fg90{color:rgba(205,214,244,0.9);}\n' +
    '.t-time-copier .tc-fg80{color:rgba(205,214,244,0.8);}\n' +
    '.t-time-copier .tc-teal90{color:rgba(148,226,213,0.9);}\n' +
    '.t-time-copier .tc-copyall{border-color:rgba(148,226,213,0.25);}\n' +
    '.t-time-copier .tc-copyall:hover{border-color:rgba(148,226,213,0.35);}\n' +
    '.t-time-copier .tc-label{width:2.25rem;}\n' +
    '.t-time-copier .tc-maxw180{max-width:180px;}\n' +
    '.t-time-copier .tc-row{background:rgba(0,0,0,0.25);}\n' +
    '.t-time-copier .tc-bg40{background:rgba(49,50,68,0.4);}\n' +
    '@media(min-width:640px){.t-time-copier .tc-custom-row{flex-direction:row;align-items:center;}.t-time-copier .tc-custom-row .tc-input{width:auto;}}\n',

  mount: function (root) {
    var mode = 'now';
    var custom = '';
    var customTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    var now = new Date();
    var clockId = null;
    var target = null;
    var rowData = [];
    var allText = '';

    var localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';

    var tzOptions = [{ label: 'Local — ' + localTz, zone: localTz }];
    CUSTOM_TZ_OPTIONS.forEach(function (o) {
      if (o.zone !== localTz) tzOptions.push(o);
    });

    function customTzLabel() {
      for (var i = 0; i < tzOptions.length; i++) {
        if (tzOptions[i].zone === customTz) return tzOptions[i].label;
      }
      return customTz;
    }

    /* ── mode toggle ── */
    var toggleBase = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors';
    var btnNow = App.el('button', { type: 'button', class: toggleBase + ' tc-active' },
      App.icon('clock', '', 14), App.el('span', { text: 'NOW' }));
    btnNow.addEventListener('click', function () { switchMode('now'); });
    var btnCustom = App.el('button', { type: 'button', class: toggleBase + ' tc-inactive' },
      App.icon('refresh-cw', '', 14), App.el('span', { text: 'CUSTOM TIME' }));
    btnCustom.addEventListener('click', function () { switchMode('custom'); });

    /* ── custom input — wall time + source timezone ── */
    var customEl = App.el('input', {
      type: 'datetime-local', class: 'tc-input flex-1 min-w-0', 'aria-label': 'Custom time (wall time)'
    });
    customEl.addEventListener('change', function () { custom = customEl.value; refresh(); });

    var tzSel = App.el('select', { class: 'tc-input shrink-0', 'aria-label': 'Input timezone' });
    tzOptions.forEach(function (o) {
      tzSel.appendChild(App.el('option', { value: o.zone, text: o.label }));
    });
    tzSel.value = customTz;
    tzSel.addEventListener('change', function () { customTz = tzSel.value; refresh(); });

    var useNowBtn = App.el('button', {
      type: 'button', class: 'shrink-0 px-3 py-2 rounded-lg text-xs font-mono border border-border/50 bg-surface0/60 tc-muted80 tc-hover-fg hover:bg-surface0 transition-colors',
      text: 'Use now'
    });
    useNowBtn.addEventListener('click', fillNow);

    var customRow = App.el('div', { class: 'tc-custom-row flex flex-col gap-2' }, customEl, tzSel, useNowBtn);

    var statusLine = App.el('p', { class: 'text-xs font-mono tc-muted60' });
    var errorLine = App.el('div', { class: 'text-xs font-mono text-ctp-red' });

    /* ── copy-ready rows ── */
    var copyAllBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-ctp-teal/12 border tc-copyall tc-teal90 hover:bg-ctp-teal/20 transition-colors'
    }, App.icon('copy', '', 14), App.el('span', { text: 'Copy all' }));
    copyAllBtn.addEventListener('click', function () { if (target) App.copy(allText, copyAllBtn); });

    var rowsHead = App.el('div', { class: 'flex items-center justify-between' },
      App.el('span', { class: 'text-xs font-mono font-medium tc-muted80', text: 'Copy-ready times' }),
      copyAllBtn);

    var rowsGrid = App.el('div', { class: 'grid gap-2' });
    var rows = ZONES.map(function (z) {
      var lineEl = App.el('div', { class: 'text-sm font-mono truncate tc-fg90' });
      var subEl = App.el('div', { class: 'text-[10px] font-mono tc-muted60' });
      var copyBtn = App.el('button', {
        type: 'button', 'aria-label': 'Copy ' + z.label + ' time',
        class: 'shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-mono bg-surface0/60 border border-border/50 tc-muted80 tc-hover-fg hover:bg-surface0 transition-colors'
      }, App.icon('copy', '', 12), App.el('span', { text: 'Copy' }));
      copyBtn.addEventListener('click', function () { copyRow(z); });
      var rowEl = App.el('div', { class: 'flex items-center gap-3 rounded-lg border border-border/50 tc-row px-3 py-2.5' },
        App.el('span', { class: 'tc-label shrink-0 text-xs font-mono font-bold text-ctp-teal', text: z.label }),
        App.el('div', { class: 'flex-1 min-w-0' }, lineEl, subEl),
        copyBtn);
      rowsGrid.appendChild(rowEl);
      return { z: z, lineEl: lineEl, subEl: subEl, copyBtn: copyBtn };
    });

    /* ── engineer extras ── */
    var isoValue = App.el('span', { class: 'tc-fg80 tc-maxw180 truncate' });
    var epochValue = App.el('span', { class: 'tc-fg80 tc-maxw180 truncate' });
    var isoBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono tc-bg40 border border-border/50 tc-muted70 tc-hover-fg hover:bg-surface0 transition-colors'
    }, App.el('span', { class: 'tc-muted50', text: 'ISO 8601' }), isoValue, App.icon('copy', '', 12));
    isoBtn.addEventListener('click', function () { if (target) App.copy(target.toISOString(), isoBtn); });
    var epochBtn = App.el('button', {
      type: 'button',
      class: 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono tc-bg40 border border-border/50 tc-muted70 tc-hover-fg hover:bg-surface0 transition-colors'
    }, App.el('span', { class: 'tc-muted50', text: 'UNIX EPOCH' }), epochValue, App.icon('copy', '', 12));
    epochBtn.addEventListener('click', function () { if (target) App.copy(String(Math.floor(target.getTime() / 1000)), epochBtn); });

    var extrasRow = App.el('div', { class: 'flex flex-wrap items-center gap-2 pt-1' }, isoBtn, epochBtn);
    var rowsWrap = App.el('div', {}, rowsHead, rowsGrid, extrasRow);

    /* ── logic ── */
    function fillNow() {
      var d = new Date();
      var dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: customTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      var parts = {};
      var i, p;
      for (i = 0; i < dtf.formatToParts(d).length; i++) {
        p = dtf.formatToParts(d)[i];
        parts[p.type] = p.value;
      }
      custom = parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
      customEl.value = custom;
      refresh();
    }

    function switchMode(m) {
      mode = m;
      if (m === 'custom' && !custom) fillNow();
      updateClock();
      refresh();
    }

    function updateClock() {
      if (clockId !== null) { clearInterval(clockId); clockId = null; }
      if (mode === 'now') {
        clockId = App.interval(function () { now = new Date(); refresh(); }, 1000);
      }
    }

    function copyRow(z) {
      if (!target) return;
      for (var i = 0; i < rowData.length; i++) {
        if (rowData[i].key === z.key) { App.copy(rowData[i].line, rows[i].copyBtn); return; }
      }
    }

    function refresh() {
      target = mode === 'now' ? now : parseZonedWallTime(custom, customTz);
      rowData = target ? ZONES.map(function (z) {
        var a = zoneAbbr(target, z.zone);
        return {
          key: z.key,
          zone: z.zone,
          label: z.label,
          abbr: a,
          line: mdy(target, z.zone) + ' ' + a,
          offset: zoneOffset(target, z.zone),
          altAbbr: z.alt ? z.alt[a] : undefined,
        };
      }) : [];
      allText = rowData.map(function (r) { return r.line; }).join('\n');

      btnNow.className = toggleBase + (mode === 'now' ? ' tc-active' : ' tc-inactive');
      btnCustom.className = toggleBase + (mode === 'custom' ? ' tc-active' : ' tc-inactive');
      customRow.style.display = mode === 'custom' ? '' : 'none';

      if (mode === 'now') {
        statusLine.textContent = 'Live — refreshing every second. Your local timezone: ' + localTz + '.';
      } else if (target) {
        statusLine.textContent = 'Interpreted as wall time in ' + customTzLabel() + ' (' + zoneOffset(target, customTz) + ').';
      } else {
        statusLine.textContent = 'Interpreted as wall time in ' + customTzLabel() + '.';
      }
      var invalid = mode === 'custom' && !target;
      errorLine.textContent = invalid ? 'Enter a valid date and time' : '';
      errorLine.style.display = invalid ? '' : 'none';

      rowsWrap.style.display = target ? '' : 'none';
      if (target) {
        for (var i = 0; i < rows.length; i++) {
          var r = rowData[i];
          rows[i].lineEl.textContent = r.line;
          rows[i].subEl.textContent = r.abbr + ' (' + r.offset + ')' + (r.altAbbr ? ' · also ' + r.altAbbr : '');
        }
        isoValue.textContent = target.toISOString();
        epochValue.textContent = String(Math.floor(target.getTime() / 1000));
      }
    }

    root.appendChild(App.el('div', { class: 'flex items-center gap-2' }, btnNow, btnCustom));
    root.appendChild(customRow);
    root.appendChild(statusLine);
    root.appendChild(errorLine);
    root.appendChild(rowsWrap);

    refresh();
    updateClock();
  }
});
})();
