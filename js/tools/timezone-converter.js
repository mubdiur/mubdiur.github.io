/* ═══════════════════════════════════════════════════════════
   Timezone Converter — CUSTOM TOOL.
   Wall-clock conversion across IANA zones over
   Transforms.tzConvert (Intl-based, DST aware): source wall
   time, exact UTC instant, target wall time plus offsets.
   Pure browser math — no server, no lookup tables.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';
var ZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tehran', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Fiji'];
var TzSeq = 0;
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function localWall(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function localZone() {
  try {
    var z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z) return z;
  } catch (e) { void e; }
  return 'UTC';
}
var CSS = '' +
'.t-timezone-converter .tz-inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0.6rem;}\n' +
'.t-timezone-converter .tz-flabel{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.75);display:block;margin-bottom:0.3rem;}\n' +
'.t-timezone-converter .tz-in{width:100%;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 10px;font-family:var(--font-mono);font-size:12px;color:rgba(227,227,227,0.9);outline:none;color-scheme:dark;}\n' +
'.t-timezone-converter .tz-in:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
'.t-timezone-converter .tz-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.65rem;}\n' +
'.t-timezone-converter .btn-run{background:rgba(83,163,249,0.2);border:1px solid rgba(83,163,249,0.45);color:#fff;border-radius:6px;font-family:var(--font-mono);font-size:12px;padding:0.45rem 1.1rem;cursor:pointer;}\n' +
'.t-timezone-converter .tz-status{font-family:var(--font-mono);font-size:11.5px;min-height:1.4em;margin-top:0.55rem;color:rgba(141,148,158,0.85);}\n' +
'.t-timezone-converter .tz-status.ok{color:var(--lime);}\n' +
'.t-timezone-converter .tz-status.err{color:var(--ctp-red);}\n' +
'.t-timezone-converter .tz-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0.6rem;margin-top:0.7rem;}\n' +
'.t-timezone-converter .tz-card{border:1px solid rgba(51,53,56,0.4);border-radius:6px;background:rgba(0,0,0,0.25);padding:0.6rem 0.75rem;}\n' +
'.t-timezone-converter .tz-card .k{font-family:var(--font-mono);font-size:10px;color:rgba(141,148,158,0.7);text-transform:uppercase;letter-spacing:0.06em;}\n' +
'.t-timezone-converter .tz-card .v{font-family:var(--font-mono);font-size:15px;color:#fff;margin-top:0.2rem;}\n' +
'.t-timezone-converter .tz-card .z{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.75);margin-top:0.15rem;}\n' +
'.t-timezone-converter .tz-card.hero{border-color:rgba(83,163,249,0.45);}\n' +
'.t-timezone-converter .tz-card.hero .v{color:var(--lime);}\n' +
'.t-timezone-converter .tz-hint{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.6);margin-top:0.5rem;line-height:1.6;}\n';
function zoneCard(k, v, z, hero) {
  return App.el('div', { class: 'tz-card' + (hero ? ' hero' : '') },
    App.el('div', { class: 'k', text: k }),
    App.el('div', { class: 'v', text: v }),
    App.el('div', { class: 'z', text: z }));
}
App.registerTool('timezone-converter', {
  css: CSS,
  mount: function (root) {
    TzSeq += 1;
    var dlId = 'tz-zones-' + TzSeq;
    var dl = App.el('datalist', { id: dlId });
    ZONES.forEach(function (z) { dl.appendChild(App.el('option', { value: z })); });
    var dtInput = App.el('input', { class: 'tz-in', type: 'datetime-local', 'aria-label': 'Date and time' });
    var fromInput = App.el('input', { class: 'tz-in', list: dlId, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'From time zone' });
    var toInput = App.el('input', { class: 'tz-in', list: dlId, autocomplete: 'off', spellcheck: 'false', value: 'UTC', 'aria-label': 'To time zone' });
    var runBtn = App.el('button', { class: 'btn-run', type: 'button', text: 'Convert' });
    var nowBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.el('span', { text: 'Now' }));
    var swapBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.el('span', { text: 'Swap zones' }));
    var clearBtn = App.clearButton(clearAll);
    var status = App.el('div', { class: 'tz-status', role: 'status', text: 'Pick any IANA zone — type or choose from the list.' });
    var out = App.el('div', {});
    try { dtInput.value = localWall(new Date()); } catch (e) { void e; }
    try { fromInput.value = localZone(); } catch (e2) { fromInput.value = 'UTC'; }
    function setStatus(msg, cls) {
      status.textContent = msg;
      status.className = 'tz-status' + (cls ? ' ' + cls : '');
    }
    function clearAll() {
      out.innerHTML = '';
      setStatus('Cleared. Nothing is stored — close the tab and it is gone.');
      dtInput.focus();
    }
    function run() {
      out.innerHTML = '';
      var r;
      try {
        r = Transforms.tzConvert(dtInput.value, fromInput.value, toInput.value);
      } catch (err) {
        setStatus((err && err.message) || 'That did not convert.', 'err');
        return;
      }
      setStatus('Converted — offsets hold for that exact instant, DST included.', 'ok');
      out.appendChild(App.el('div', { class: 'tz-cards' },
        zoneCard('Source', r.fromText, r.fromZone + ' ' + r.fromOffset, false),
        zoneCard('UTC instant', r.utcText, r.utcISO, true),
        zoneCard('Target', r.toText, r.toZone + ' ' + r.toOffset, false)));
      var snap = r;
      var copyBtn = App.el('button', { class: 'btn-copy', type: 'button' }, App.icon('copy', '', 14), App.el('span', { text: 'Copy' }));
      copyBtn.addEventListener('click', function () {
        App.copy(snap.fromText + ' ' + snap.fromZone + ' = ' + snap.toText + ' ' + snap.toZone + ' (' + snap.utcISO + ')', copyBtn);
      });
      out.appendChild(App.el('div', { class: 'tz-row' }, copyBtn, App.clearButton(clearAll)));
    }
    runBtn.addEventListener('click', run);
    nowBtn.addEventListener('click', function () {
      try { dtInput.value = localWall(new Date()); } catch (e) { void e; }
      run();
    });
    swapBtn.addEventListener('click', function () {
      var f = fromInput.value;
      fromInput.value = toInput.value;
      toInput.value = f;
      run();
    });
    [dtInput, fromInput, toInput].forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') run(); });
    });
    root.appendChild(App.el('div', {},
      dl,
      App.el('div', { class: 'tz-inputs' },
        App.el('div', {}, App.el('label', { class: 'tz-flabel', text: 'Date and time' }), dtInput),
        App.el('div', {}, App.el('label', { class: 'tz-flabel', text: 'From zone' }), fromInput),
        App.el('div', {}, App.el('label', { class: 'tz-flabel', text: 'To zone' }), toInput)),
      App.el('div', { class: 'tz-row' }, runBtn, nowBtn, swapBtn, clearBtn),
      status, out,
      App.el('div', { class: 'tz-hint', text: 'Fall-back repeat hours resolve to the first occurrence; spring-forward gaps land on the nearest valid minute. Offsets print per-instant, so DST never lies.' })));
    run();
  }
});
})();
