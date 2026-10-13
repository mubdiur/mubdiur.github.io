/* ═══════════════════════════════════════════════════════════
   Stopwatch / Countdown — CUSTOM TOOL.
   Count-up stopwatch with lap splits plus a countdown with a
   WebAudio finish beep (zero audio assets). Ticks through
   App.interval so navigation auto-cleans; display text comes
   from Transforms.formatStopwatch — one tested source.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';
var LS_KEY = 'stopwatch:countdown:v1';
function nowMs() {
  try { return performance.now(); } catch (e) { return Date.now(); }
}
function ensureBeepCtx(ref) {
  try {
    if (!ref.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ref.ctx = new AC();
    }
    if (ref.ctx.state === 'suspended' && ref.ctx.resume) { try { ref.ctx.resume(); } catch (e2) { void e2; } }
    return ref.ctx;
  } catch (e) { void e; return null; }
}
function beep(ref) {
  var ctx = ensureBeepCtx(ref);
  if (!ctx) return;
  try {
    var t = ctx.currentTime;
    [0, 0.28, 0.56].forEach(function (off, ix) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = ix === 2 ? 1318.5 : 880;
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.25, t + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t + off);
      o.stop(t + off + 0.24);
    });
  } catch (e) { void e; }
}
function readCountdown(ref) {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    var p = JSON.parse(raw);
    if (p && isFinite(p.h) && isFinite(p.m) && isFinite(p.s)) {
      ref.h.value = String(Math.max(0, Math.min(99, Math.floor(p.h))));
      ref.m.value = String(Math.max(0, Math.min(59, Math.floor(p.m))));
      ref.s.value = String(Math.max(0, Math.min(59, Math.floor(p.s))));
    }
  } catch (e) { void e; }
}
function saveCountdown(h, m, s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ h: h, m: m, s: s })); } catch (e) { void e; }
}
var CSS = '' +
'.t-stopwatch .sw-seg{display:inline-flex;border:1px solid rgba(51,53,56,0.4);border-radius:6px;overflow:hidden;}\n' +
'.t-stopwatch .sw-seg button{background:transparent;border:0;color:rgba(227,227,227,0.65);font-family:var(--font-mono);font-size:11.5px;padding:0.4rem 0.9rem;cursor:pointer;}\n' +
'.t-stopwatch .sw-seg button.on{background:rgba(83,163,249,0.22);color:#fff;}\n' +
'.t-stopwatch .sw-face{font-family:var(--font-mono);font-size:52px;font-weight:600;letter-spacing:0.04em;text-align:center;color:#fff;padding:0.9rem 0 0.3rem;font-variant-numeric:tabular-nums;}\n' +
'.t-stopwatch .sw-face.done{color:var(--lime);}\n' +
'.t-stopwatch .sw-sub{text-align:center;font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.75);padding-bottom:0.4rem;min-height:1.4em;}\n' +
'.t-stopwatch .sw-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;justify-content:center;margin-top:0.5rem;}\n' +
'.t-stopwatch .btn-run{background:rgba(83,163,249,0.2);border:1px solid rgba(83,163,249,0.45);color:#fff;border-radius:6px;font-family:var(--font-mono);font-size:12px;padding:0.45rem 1.1rem;cursor:pointer;min-width:7rem;}\n' +
'.t-stopwatch .sw-in{width:4.2rem;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 8px;font-family:var(--font-mono);font-size:12.5px;color:rgba(227,227,227,0.9);outline:none;text-align:center;}\n' +
'.t-stopwatch .sw-in:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
'.t-stopwatch .sw-in:disabled{opacity:0.45;}\n' +
'.t-stopwatch .sw-flabel{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.75);}\n' +
'.t-stopwatch table.sw-laps{width:100%;border-collapse:collapse;margin-top:0.7rem;font-family:var(--font-mono);font-size:11.5px;}\n' +
'.t-stopwatch table.sw-laps th{text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:rgba(141,148,158,0.75);padding:0.4rem 0.5rem;border-bottom:1px solid rgba(51,53,56,0.5);}\n' +
'.t-stopwatch table.sw-laps th:first-child,.t-stopwatch table.sw-laps td:first-child{text-align:left;}\n' +
'.t-stopwatch table.sw-laps td{text-align:right;padding:0.3rem 0.5rem;border-bottom:1px solid rgba(51,53,56,0.25);color:rgba(227,227,227,0.88);font-variant-numeric:tabular-nums;}\n' +
'.t-stopwatch table.sw-laps tr.best td{color:var(--lime);}\n' +
'.t-stopwatch table.sw-laps tr.worst td{color:var(--ctp-red);}\n' +
'.t-stopwatch .sw-status{font-family:var(--font-mono);font-size:11.5px;min-height:1.4em;margin-top:0.55rem;text-align:center;color:rgba(141,148,158,0.85);}\n' +
'.t-stopwatch .sw-status.ok{color:var(--lime);}\n' +
'.t-stopwatch .sw-status.err{color:var(--ctp-red);}\n' +
'.t-stopwatch .sw-hint{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.6);margin-top:0.5rem;line-height:1.6;text-align:center;}\n';
App.registerTool('stopwatch', {
  css: CSS,
  mount: function (root) {
    var beepRef = {};
    var mode = 'up';
    var tickId = 0;
    var acc = 0, stamp = 0, running = false;
    var laps = [];
    var cdTotal = 0;
    function stopTick() { if (tickId) { try { clearInterval(tickId); } catch (e) { void e; } tickId = 0; } lockCd(false); }
    App.onUnmount(stopTick);
    var upBtn = App.el('button', { type: 'button', text: 'Stopwatch', class: 'on', 'aria-pressed': 'true' });
    var dnBtn = App.el('button', { type: 'button', text: 'Countdown', 'aria-pressed': 'false' });
    var seg = App.el('div', { class: 'sw-seg', role: 'group', 'aria-label': 'Mode' }, upBtn, dnBtn);
    var face = App.el('div', { class: 'sw-face', role: 'timer', text: '00:00:00.00' });
    var sub = App.el('div', { class: 'sw-sub', text: 'Ready.' });
    var status = App.el('div', { class: 'sw-status', role: 'status', text: 'Count up, lap splits, or count down to a beep.' });
    var mainBtn = App.el('button', { class: 'btn-run', type: 'button', text: 'Start' });
    var lapBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.el('span', { text: 'Lap' }));
    var resetBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.el('span', { text: 'Reset' }));
    var hIn = App.el('input', { class: 'sw-in', inputmode: 'numeric', autocomplete: 'off', value: '0', 'aria-label': 'Hours' });
    var mIn = App.el('input', { class: 'sw-in', inputmode: 'numeric', autocomplete: 'off', value: '5', 'aria-label': 'Minutes' });
    var sIn = App.el('input', { class: 'sw-in', inputmode: 'numeric', autocomplete: 'off', value: '0', 'aria-label': 'Seconds' });
    var cdRow = App.el('div', { class: 'sw-row hidden' },
      App.el('span', { class: 'sw-flabel', text: 'H' }), hIn,
      App.el('span', { class: 'sw-flabel', text: 'M' }), mIn,
      App.el('span', { class: 'sw-flabel', text: 'S' }), sIn);
    var chips = App.el('div', { class: 'sw-row hidden' });
    [['1:00', 0, 1, 0], ['5:00', 0, 5, 0], ['10:00', 0, 10, 0], ['25:00', 0, 25, 0]].forEach(function (c) {
      var b = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.el('span', { text: c[0] }));
      b.addEventListener('click', function () {
        if (running) return;
        hIn.value = String(c[1]);
        mIn.value = String(c[2]);
        sIn.value = String(c[3]);
        syncCd();
      });
      chips.appendChild(b);
    });
    var lapsWrap = App.el('div', {});
    function setStatus(msg, cls) {
      status.textContent = msg;
      status.className = 'sw-status' + (cls ? ' ' + cls : '');
    }
    function elapsed() { return acc + (running ? nowMs() - stamp : 0); }
    function render() {
      var ms = mode === 'up' ? elapsed() : Math.max(0, cdTotal - elapsed());
      try { face.textContent = Transforms.formatStopwatch(ms); }
      catch (e) { face.textContent = '00:00:00.00'; }
      face.classList.toggle('done', mode === 'dn' && running === false && acc > 0 && ms === 0);
    }
    function renderLaps() {
      lapsWrap.innerHTML = '';
      if (!laps.length) return;
      var best = -1, worst = -1, i;
      for (i = 0; i < laps.length; i++) {
        if (best < 0 || laps[i].split < laps[best].split) best = i;
        if (worst < 0 || laps[i].split > laps[worst].split) worst = i;
      }
      var tbody = App.el('tbody', {});
      laps.forEach(function (l, ix) {
        var cls = laps.length > 1 && ix === best ? 'best' : (laps.length > 1 && ix === worst ? 'worst' : '');
        var tr = App.el('tr', { class: cls || undefined },
          App.el('td', { text: 'Lap ' + l.n }),
          App.el('td', { text: Transforms.formatStopwatch(l.split) }),
          App.el('td', { text: Transforms.formatStopwatch(l.total) }));
        tbody.appendChild(tr);
      });
      var table = App.el('table', { class: 'sw-laps', 'aria-label': 'Lap splits' },
        App.el('thead', {}, App.el('tr', {},
          App.el('th', { text: 'Lap' }), App.el('th', { text: 'Split' }), App.el('th', { text: 'Total' }))),
        tbody);
      lapsWrap.appendChild(table);
      var copyBtn = App.el('button', { class: 'btn-copy', type: 'button' }, App.icon('copy', '', 14), App.el('span', { text: 'Copy laps' }));
      copyBtn.addEventListener('click', function () {
        var lines = laps.map(function (l) { return 'Lap ' + l.n + '  split ' + Transforms.formatStopwatch(l.split) + '  total ' + Transforms.formatStopwatch(l.total); });
        App.copy(lines.join('\n'), copyBtn);
      });
      lapsWrap.appendChild(App.el('div', { class: 'sw-row' }, copyBtn));
      if (!running) {
      var many = laps.length > 1;
      sub.textContent = many ? ('Best ' + Transforms.formatStopwatch(laps[best].split) + ' · Worst ' + Transforms.formatStopwatch(laps[worst].split)) : (laps.length + ' lap recorded.');
      }
    }
    function setMode(m) {
      stopTick();
      running = false;
      acc = 0;
      laps = [];
      lapsWrap.innerHTML = '';
      mode = m;
      var up = m === 'up';
      upBtn.className = up ? 'on' : '';
      dnBtn.className = up ? '' : 'on';
      upBtn.setAttribute('aria-pressed', up ? 'true' : 'false');
      dnBtn.setAttribute('aria-pressed', up ? 'false' : 'true');
      mainBtn.textContent = 'Start';
      lapBtn.classList.toggle('hidden', !up);
      if (up) { cdRow.classList.add('hidden'); chips.classList.add('hidden'); }
      else { cdRow.classList.remove('hidden'); chips.classList.remove('hidden'); }
      face.classList.remove('done');
      sub.textContent = up ? 'Ready.' : 'Set a duration, then start.';
      setStatus(up ? 'Count up, lap splits, or count down to a beep.' : 'Countdown beeps three times at zero — keep the tab open.');
      render();
    }
    function startUp() {
      running = true;
      stamp = nowMs();
      mainBtn.textContent = 'Pause';
      sub.textContent = 'Running…';
      stopTick();
      tickId = App.interval(render, 47);
    }
    function pauseUp() {
      acc = elapsed();
      running = false;
      stopTick();
      mainBtn.textContent = 'Start';
      sub.textContent = laps.length ? laps.length + ' lap' + (laps.length === 1 ? '' : 's') + ' · paused.' : 'Paused.';
      render();
    }
    function startDown(total) {
      cdTotal = total;
      acc = 0;
      running = true;
      stamp = nowMs();
      ensureBeepCtx(beepRef);
      mainBtn.textContent = 'Pause';
      sub.textContent = 'Counting down…';
      face.classList.remove('done');
      stopTick();
      lockCd(true);
      tickId = App.interval(function () {
        render();
        if (cdTotal - elapsed() <= 0) {
          stopTick();
          running = false;
          acc = cdTotal;
          render();
          mainBtn.textContent = 'Start';
          sub.textContent = 'Time is up.';
          setStatus('Time is up — ' + Transforms.formatStopwatch(cdTotal) + ' elapsed.', 'ok');
          beep(beepRef);
        }
      }, 47);
    }
    function pauseDown() {
      acc = elapsed();
      running = false;
      stopTick();
      mainBtn.textContent = 'Start';
      sub.textContent = 'Paused with ' + Transforms.formatStopwatch(Math.max(0, cdTotal - acc)) + ' left.';
      render();
    }
    function parseCd() {
      var h = Math.max(0, Math.min(99, Math.floor(Number(hIn.value) || 0)));
      var m = Math.max(0, Math.min(59, Math.floor(Number(mIn.value) || 0)));
      var s = Math.max(0, Math.min(59, Math.floor(Number(sIn.value) || 0)));
      return ((h * 60) + m) * 60 * 1000 + s * 1000;
    }
    function lockCd(lock) {
      hIn.disabled = lock;
      mIn.disabled = lock;
      sIn.disabled = lock;
    }
    function syncCd() {
      if (running) return;
      cdTotal = parseCd();
      if (acc > 0 && cdTotal > 0 && acc >= cdTotal) acc = 0;
      render();
    }
    mainBtn.addEventListener('click', function () {
      if (running) { if (mode === 'up') pauseUp(); else pauseDown(); return; }
      if (mode === 'up') {
        if (acc > 0 || laps.length) { startUp(); return; }
        startUp();
        return;
      }
      var h0 = Math.max(0, Math.min(99, Math.floor(Number(hIn.value) || 0)));
      var m0 = Math.max(0, Math.min(59, Math.floor(Number(mIn.value) || 0)));
      var s0 = Math.max(0, Math.min(59, Math.floor(Number(sIn.value) || 0)));
      var total = ((h0 * 60) + m0) * 60 * 1000 + s0 * 1000;
      if (!(total > 0)) { setStatus('Set a duration above zero first.', 'err'); return; }
      saveCountdown(h0, m0, s0);
      setStatus('Counting down from ' + Transforms.formatStopwatch(total) + '.', '');
      startDown(total);
    });
    lapBtn.addEventListener('click', function () {
      if (mode !== 'up' || !running) { setStatus('Start the stopwatch before taking laps.', ''); return; }
      if (laps.length >= 500) { setStatus('Lap table is capped at 500 — reset to start fresh.', 'err'); return; }
      var total = elapsed();
      var prev = laps.length ? laps[laps.length - 1].total : 0;
      laps.push({ n: laps.length + 1, split: total - prev, total: total });
      renderLaps();
    });
    resetBtn.addEventListener('click', function () {
      stopTick();
      running = false;
      acc = 0;
      laps = [];
      lapsWrap.innerHTML = '';
      mainBtn.textContent = 'Start';
      face.classList.remove('done');
      sub.textContent = mode === 'up' ? 'Ready.' : 'Set a duration, then start.';
      setStatus('Reset. Nothing is stored except your last countdown length.', '');
      render();
    });
    upBtn.addEventListener('click', function () { if (mode !== 'up') setMode('up'); });
    dnBtn.addEventListener('click', function () { if (mode !== 'dn') setMode('dn'); });
    [hIn, mIn, sIn].forEach(function (inp) {
      inp.addEventListener('input', function () { if (mode === 'dn') syncCd(); });
    });
    var cdRef = { h: hIn, m: mIn, s: sIn };
    readCountdown(cdRef);
    syncCd();
    root.appendChild(App.el('div', {},
      App.el('div', { class: 'sw-row', style: { marginTop: '0' } }, seg),
      face, sub, cdRow, chips,
      App.el('div', { class: 'sw-row' }, mainBtn, lapBtn, resetBtn),
      status, lapsWrap,
      App.el('div', { class: 'sw-hint', text: 'Centisecond display, pause-safe math, laps survive pausing. The countdown beep needs no files — it is synthesized live.' })));
    render();
  }
});
})();
