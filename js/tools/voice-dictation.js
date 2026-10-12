/* ═══════════════════════════════════════════════════════════
   Voice Dictation — CUSTOM TOOL.
   Hands-free English speech-to-text via the browser-native
   Web Speech API (SpeechRecognition): the lowest-latency,
   zero-dependency path — streaming interim + final results
   with no model download and no round-trip to this site's
   servers (there are none; the page is fully static).
   English-only (en-US). Ctrl+C / Cmd+C copies the transcript.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

window.ICONS = window.ICONS || {};
if (!window.ICONS.mic) {
  window.ICONS.mic = '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>';
}

App.registerTool('voice-dictation', {
  css: '' +
    '.t-voice-dictation{display:flex;flex-direction:column;gap:0.75rem;}\n' +
    '.t-voice-dictation .vd-top{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.75rem;}\n' +
    '.t-voice-dictation .vd-status{display:flex;align-items:center;gap:0.5rem;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.8);}\n' +
    '.t-voice-dictation .vd-dot{width:10px;height:10px;border-radius:50%;background:rgba(141,148,158,0.5);flex-shrink:0;}\n' +
    '.t-voice-dictation .vd-dot.live{background:#fb565b;animation:vd-pulse 1.2s ease-in-out infinite;}\n' +
    '@keyframes vd-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(251,86,91,0.5);}50%{opacity:0.55;box-shadow:0 0 0 6px rgba(251,86,91,0);}}\n' +
    '.t-voice-dictation .vd-lang{font-family:var(--font-mono);font-size:11px;color:rgba(83,163,249,0.9);background:rgba(83,163,249,0.12);border:1px solid rgba(83,163,249,0.25);border-radius:6px;padding:0.15rem 0.5rem;}\n' +
    '.t-voice-dictation .vd-timer{font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.6);}\n' +
    '.t-voice-dictation .vd-start{display:flex;align-items:center;gap:0.5rem;padding:0.6rem 1.25rem;border-radius:8px;font-family:var(--font-mono);font-size:13px;font-weight:600;border:1px solid;cursor:pointer;transition:background-color .2s,color .2s;}\n' +
    '.t-voice-dictation .vd-start.idle{background:rgba(38,178,38,0.12);border-color:rgba(38,178,38,0.4);color:#4ade80;}\n' +
    '.t-voice-dictation .vd-start.idle:hover{background:rgba(38,178,38,0.22);}\n' +
    '.t-voice-dictation .vd-start.live{background:rgba(251,86,91,0.12);border-color:rgba(251,86,91,0.4);color:#fb565b;}\n' +
    '.t-voice-dictation .vd-start.live:hover{background:rgba(251,86,91,0.22);}\n' +
    '.t-voice-dictation .vd-start:disabled{opacity:0.45;cursor:not-allowed;}\n' +
    '.t-voice-dictation .vd-btn{display:flex;align-items:center;gap:0.375rem;padding:0.45rem 0.75rem;border-radius:8px;font-family:var(--font-mono);font-size:12px;background:rgba(51,53,56,0.4);border:1px solid rgba(51,53,56,0.5);color:rgba(227,227,227,0.85);cursor:pointer;transition:background-color .2s;}\n' +
    '.t-voice-dictation .vd-btn:hover{background:rgba(51,53,56,0.7);}\n' +
    '.t-voice-dictation .vd-btn:disabled{opacity:0.45;cursor:not-allowed;}\n' +
    '.t-voice-dictation .vd-input{width:100%;min-height:180px;resize:vertical;border-radius:8px;border:1px solid rgba(51,53,56,0.5);background:rgba(0,0,0,0.3);padding:0.75rem;font-family:var(--font-mono);font-size:14px;line-height:1.6;color:rgba(227,227,227,0.92);outline:none;}\n' +
    '.t-voice-dictation .vd-input::placeholder{color:rgba(141,148,158,0.3);}\n' +
    '.t-voice-dictation .vd-input:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-voice-dictation .vd-interim{min-height:1.5rem;font-family:var(--font-mono);font-size:13px;font-style:italic;color:rgba(141,148,158,0.75);white-space:pre-wrap;word-break:break-word;}\n' +
    '.t-voice-dictation .vd-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.75rem;font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.65);}\n' +
    '.t-voice-dictation .vd-opts{display:flex;flex-wrap:wrap;gap:0.5rem 1rem;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.8);}\n' +
    '.t-voice-dictation .vd-opts label{display:flex;align-items:center;gap:0.4rem;cursor:pointer;}\n' +
    '.t-voice-dictation .vd-opts input{accent-color:rgba(83,163,249,0.9);}\n' +
    '.t-voice-dictation .vd-err{font-family:var(--font-mono);font-size:12px;color:#fb565b;background:rgba(251,86,91,0.08);border:1px solid rgba(251,86,91,0.3);border-radius:8px;padding:0.5rem 0.75rem;line-height:1.5;}\n' +
    '.t-voice-dictation .vd-note{font-family:var(--font-mono);font-size:11px;line-height:1.6;color:rgba(141,148,158,0.55);}\n' +
    '.t-voice-dictation .vd-kbd{font-family:var(--font-mono);font-size:10px;background:rgba(51,53,56,0.6);border:1px solid rgba(51,53,56,0.8);border-bottom-width:2px;border-radius:4px;padding:0.05rem 0.35rem;color:rgba(227,227,227,0.8);}\n',

  mount: function (root) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var supported = typeof SR === 'function';
    var rec = null;
    var wantListening = false;
    var showInterim = true;
    var autoRestart = true;
    var failStreak = 0;
    var sessionStart = 0;
    var restartPending = false;

    /* ── status ── */
    var dot = App.el('span', { class: 'vd-dot', 'aria-hidden': 'true' });
    var statusText = App.el('span', { text: supported ? 'Idle — press Start and speak' : 'Speech recognition not available in this browser' });
    var langBadge = App.el('span', { class: 'vd-lang', text: 'en-US · English only' });
    var timerEl = App.el('span', { class: 'vd-timer', text: '' });

    /* ── controls ── */
    var startBtn = App.el('button', { type: 'button', class: 'vd-start idle', 'aria-pressed': 'false' });
    var copyBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('copy', '', 12), App.el('span', { text: 'Copy' }));
    var dlBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('download', '', 12), App.el('span', { text: '.txt' }));
    var clearBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('rotate-ccw', '', 12), App.el('span', { text: 'Clear' }));

    /* ── transcript ── */
    var ta = App.el('textarea', {
      class: 'vd-input', rows: '8', spellcheck: 'true',
      'aria-label': 'Dictation transcript',
      placeholder: supported ? 'Press Start and speak — words appear here live…' : 'Speech input is unsupported here — you can still type, then copy with Ctrl+C.',
      autocapitalize: 'sentences'
    });
    var interimEl = App.el('div', { class: 'vd-interim', 'aria-live': 'polite', text: '' });
    var metaEl = App.el('div', { class: 'vd-meta' });
    var errBox = App.el('div', { class: 'vd-err', style: 'display:none' });

    var optInterim = App.el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Show interim results' });
    var optRestart = App.el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Auto-restart on pause' });

    function setStatus(live, msg) {
      dot.className = 'vd-dot' + (live ? ' live' : '');
      statusText.textContent = msg;
      startBtn.className = 'vd-start ' + (live ? 'live' : 'idle');
      startBtn.setAttribute('aria-pressed', live ? 'true' : 'false');
      startBtn.innerHTML = '';
      startBtn.appendChild(App.icon(live ? 'pause' : 'play', '', 14));
      startBtn.appendChild(App.el('span', { text: live ? 'Stop' : 'Start dictation' }));
    }

    function updateStats() {
      var v = ta.value;
      var words = (v.match(/\S+/g) || []).length;
      metaEl.innerHTML = '';
      metaEl.appendChild(App.el('span', { text: words + ' words · ' + v.length + ' chars' }));
      metaEl.appendChild(App.el('span', { html: '<span class="vd-kbd">Ctrl</span> + <span class="vd-kbd">C</span> copies transcript' }));
      var empty = !v;
      copyBtn.disabled = empty;
      dlBtn.disabled = empty;
      clearBtn.disabled = empty;
    }

    function showError(msg) {
      errBox.textContent = msg;
      errBox.style.display = msg ? '' : 'none';
    }

    /** Insert final transcript at the caret when the box is focused, else append. */
    function appendFinal(t) {
      t = String(t || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      var pos = null;
      try {
        if (document.activeElement === ta && typeof ta.selectionStart === 'number') {
          pos = { s: ta.selectionStart, e: ta.selectionEnd };
        }
      } catch (e) { pos = null; }
      if (pos) {
        var before = ta.value.slice(0, pos.s);
        var after = ta.value.slice(pos.e);
        var sep1 = before && !/\s$/.test(before) ? ' ' : '';
        var sep2 = after && !/^\s/.test(after) ? ' ' : '';
        ta.value = before + sep1 + t + sep2 + after;
        var caret = (before + sep1 + t + sep2).length;
        try { ta.setSelectionRange(caret, caret); } catch (e2) {}
      } else {
        ta.value += (ta.value && !/\s$/.test(ta.value) ? ' ' : '') + t;
      }
      try { ta.scrollTop = ta.scrollHeight; } catch (e3) {}
      updateStats();
    }

    function copyAll(btn) {
      if (!ta.value) {
        statusText.textContent = wantListening ? 'Listening… (nothing to copy yet)' : 'Nothing to copy yet — dictate or type first';
        return false;
      }
      App.copy(ta.value, btn || copyBtn);
      return true;
    }

    function tickTimer() {
      if (!wantListening || !sessionStart) { timerEl.textContent = ''; return; }
      var s = Math.floor((Date.now() - sessionStart) / 1000);
      var mm = String(Math.floor(s / 60)).padStart(2, '0');
      var ss = String(s % 60).padStart(2, '0');
      timerEl.textContent = '● ' + mm + ':' + ss;
    }

    function newRecognizer() {
      var r = new SR();
      r.lang = 'en-US'; // English only — single fixed grammar, no runtime switching cost
      r.continuous = true; // one session, no per-utterance restart churn
      r.interimResults = true; // stream partials for lowest perceived latency
      r.maxAlternatives = 1; // single hypothesis — cheapest post-processing
      r.onresult = function (ev) {
        failStreak = 0;
        var finals = [];
        var partials = [];
        var i, res;
        for (i = ev.resultIndex; i < ev.results.length; i++) {
          res = ev.results[i];
          if (res.isFinal) finals.push(res[0].transcript);
          else partials.push(res[0].transcript);
        }
        if (finals.length) {
          interimEl.textContent = '';
          appendFinal(finals.join(' '));
        }
        interimEl.textContent = showInterim ? partials.join(' ').trim() : '';
      };
      r.onerror = function (ev) {
        var type = (ev && ev.error) || '';
        if (type === 'not-allowed' || type === 'service-not-allowed') {
          failStreak++;
          wantListening = false;
          setStatus(false, 'Microphone blocked — allow mic access, then press Start');
          showError('Microphone blocked. Click the mic/camera icon in the address bar → allow access → press Start again.');
        } else if (type === 'audio-capture') {
          failStreak++;
          wantListening = false;
          setStatus(false, 'No microphone found');
          showError('No microphone found. Plug in a mic and press Start again.');
        } else if (type === 'network' || type === 'service-not-allowed') {
          failStreak++;
          showError('Speech service unreachable (offline?). Retrying…');
        } else if (type === 'aborted' || type === 'no-speech') {
          /* benign: silence timeout or manual stop — onend handles restart */
        } else if (type) {
          showError('Recognition error: ' + type);
        }
      };
      r.onend = function () {
        interimEl.textContent = '';
        if (!wantListening) {
          setStatus(false, ta.value ? 'Stopped — transcript kept' : 'Idle — press Start and speak');
          return;
        }
        if (!autoRestart) {
          wantListening = false;
          setStatus(false, 'Paused (auto-restart off) — press Start to resume');
          return;
        }
        if (failStreak > 10) {
          wantListening = false;
          setStatus(false, 'Stopped after repeated errors — check mic/network, then press Start');
          return;
        }
        /* Chrome ends the session after a pause; resume immediately — one timer, no polling. */
        if (!restartPending) {
          restartPending = true;
          App.timer(function () {
            restartPending = false;
            if (!wantListening) return;
            try { rec.start(); } catch (e) { /* already started — next onend retries */ }
          }, 200);
        }
      };
      return r;
    }

    function start() {
      if (!supported || wantListening) return;
      showError('');
      try {
        rec = newRecognizer();
        rec.start();
      } catch (e) {
        showError('Could not start recognition: ' + ((e && e.message) || e));
        return;
      }
      wantListening = true;
      failStreak = 0;
      sessionStart = Date.now();
      setStatus(true, 'Listening… speak now');
      ta.focus();
    }

    function stop(msg) {
      wantListening = false;
      sessionStart = 0;
      timerEl.textContent = '';
      interimEl.textContent = '';
      try { if (rec) rec.stop(); } catch (e) {}
      setStatus(false, msg || (ta.value ? 'Stopped — transcript kept' : 'Idle — press Start and speak'));
    }

    startBtn.addEventListener('click', function () {
      if (wantListening) stop();
      else start();
    });
    copyBtn.addEventListener('click', function () { copyAll(copyBtn); });
    dlBtn.addEventListener('click', function () {
      if (ta.value) App.download('dictation.txt', ta.value, 'text/plain;charset=utf-8');
    });
    clearBtn.addEventListener('click', function () {
      ta.value = '';
      interimEl.textContent = '';
      showError('');
      updateStats();
      ta.focus();
    });

    App.on(ta, 'input', updateStats);
    App.on(optInterim, 'change', function () {
      showInterim = !!optInterim.checked;
      if (!showInterim) interimEl.textContent = '';
    });
    App.on(optRestart, 'change', function () { autoRestart = !!optRestart.checked; });
    App.interval(tickTimer, 500);

    /* Ctrl+C / Cmd+C inside this tool copies the whole transcript.
       A real text selection still wins: we only take over when there
       is nothing selected, so partial copies keep working natively. */
    App.on(document, 'keydown', function (e) {
      var key = e.key || '';
      var isC = key === 'c' || key === 'C' || e.keyCode === 67;
      if (!isC || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (!root.contains(e.target)) return;
      try {
        if (e.target === ta && typeof ta.selectionStart === 'number' && ta.selectionEnd !== ta.selectionStart) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed && root.contains(sel.anchorNode)) return;
      } catch (err) {}
      if (!ta.value) return;
      e.preventDefault();
      copyAll(copyBtn);
    });

    App.onUnmount(function () {
      wantListening = false;
      try { if (rec) rec.abort(); } catch (e) {}
    });

    /* ── layout ── */
    root.appendChild(App.el('div', { class: 'vd-top' },
      startBtn, copyBtn, dlBtn, clearBtn));
    root.appendChild(App.el('div', { class: 'vd-top' },
      App.el('div', { class: 'vd-status' }, dot, statusText),
      langBadge, timerEl));
    root.appendChild(ta);
    root.appendChild(interimEl);
    root.appendChild(metaEl);
    root.appendChild(App.el('div', { class: 'vd-opts' },
      App.el('label', {}, optInterim, App.el('span', { text: 'Live interim results' })),
      App.el('label', {}, optRestart, App.el('span', { text: 'Auto-restart on pause' }))));
    root.appendChild(errBox);
    root.appendChild(App.el('p', { class: 'vd-note',
      text: 'Runs via your browser\u2019s built-in Speech API (fixed to en-US) — fastest path, no downloads. ' +
        'Note: in Chrome/Edge the audio is transcribed by the browser vendor\u2019s speech service; ' +
        'nothing is sent to this site (fully static, no server). Requires HTTPS or localhost plus mic permission. ' +
        'Best in Chrome/Edge on desktop.' }));

    if (!supported) {
      startBtn.disabled = true;
      setStatus(false, 'Unsupported — use Chrome or Edge (HTTPS/localhost)');
      showError('SpeechRecognition is not available in this browser. Use Chrome or Edge over HTTPS (or localhost). Typing + Ctrl+C copy still work.');
    } else {
      setStatus(false, 'Idle — press Start and speak');
    }
    updateStats();
  }
});
})();
