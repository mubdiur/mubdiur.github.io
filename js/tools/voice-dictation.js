/* ═══════════════════════════════════════════════════════════
   Voice Dictation — CUSTOM TOOL.
   Hands-free English speech-to-text via the browser-native
   Web Speech API (SpeechRecognition): the lowest-latency,
   zero-dependency path — streaming interim + final results
   with no model download and no round-trip to this site's
   servers (there are none; the page is fully static).
   English-only (en-US). Ctrl+C / Cmd+C copies the transcript.
   Speak to replace: any selected text is swapped for what you
   say next. Voice commands ("period", "comma", "new line",
   "delete that", …) plus smart caps/punctuation keep the
   transcript clean without touching the keyboard.
   Pop-out button opens an always-on-top Picture-in-Picture
   window (Document PiP) so you can dictate + copy into any
   app while this tab sits in the background.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

window.ICONS = window.ICONS || {};
if (!window.ICONS.mic) {
  window.ICONS.mic = '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>';
}

/* Shared stylesheet: injected into the page by the tool shell AND
   into the PiP window document (which has no app.css of its own). */
var VD_CSS = '' +
  '.t-voice-dictation{display:flex;flex-direction:column;gap:0.75rem;flex:1;min-height:0;}\n' +
  '.t-voice-dictation .vd-top{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.75rem;}\n' +
  '.t-voice-dictation .vd-status{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.8);min-width:0;}\n' +
  '.t-voice-dictation .vd-dot{width:10px;height:10px;border-radius:50%;background:rgba(141,148,158,0.5);flex-shrink:0;}\n' +
  '.t-voice-dictation .vd-dot.live{background:#fb565b;animation:vd-pulse 1.2s ease-in-out infinite;}\n' +
  '.t-voice-dictation .vd-dot.hearing{background:#4ade80;animation:vd-pulse 0.6s ease-in-out infinite;}\n' +
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
  '.t-voice-dictation .vd-input{width:100%;flex:1;min-height:44vh;resize:vertical;border-radius:8px;border:1px solid rgba(51,53,56,0.5);background:rgba(0,0,0,0.3);padding:0.75rem;font-family:var(--font-mono);font-size:14px;line-height:1.6;color:rgba(227,227,227,0.92);outline:none;box-sizing:border-box;}\n' +
  '.t-voice-dictation .vd-input::placeholder{color:rgba(141,148,158,0.3);}\n' +
  '.t-voice-dictation .vd-input:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
  '.t-voice-dictation .vd-input::selection{background:rgba(83,163,249,0.35);}\n' +
  '.t-voice-dictation .vd-interim{min-height:1.5rem;font-family:var(--font-mono);font-size:13px;font-style:italic;color:rgba(141,148,158,0.75);white-space:pre-wrap;word-break:break-word;}\n' +
  '.t-voice-dictation .vd-sel{font-family:var(--font-mono);font-size:11px;color:rgba(83,163,249,0.9);background:rgba(83,163,249,0.08);border:1px solid rgba(83,163,249,0.25);border-radius:8px;padding:0.4rem 0.6rem;}\n' +
  '.t-voice-dictation .vd-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.75rem;font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.65);}\n' +
  '.t-voice-dictation .vd-opts{display:flex;flex-wrap:wrap;gap:0.5rem 1rem;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.8);}\n' +
  '.t-voice-dictation .vd-opts label{display:flex;align-items:center;gap:0.4rem;cursor:pointer;}\n' +
  '.t-voice-dictation .vd-opts input{accent-color:rgba(83,163,249,0.9);}\n' +
  '.t-voice-dictation .vd-err{font-family:var(--font-mono);font-size:12px;color:#fb565b;background:rgba(251,86,91,0.08);border:1px solid rgba(251,86,91,0.3);border-radius:8px;padding:0.5rem 0.75rem;line-height:1.5;}\n' +
  '.t-voice-dictation .vd-note{font-family:var(--font-mono);font-size:11px;line-height:1.6;color:rgba(141,148,158,0.55);}\n' +
  '.t-voice-dictation .vd-kbd{font-family:var(--font-mono);font-size:10px;background:rgba(51,53,56,0.6);border:1px solid rgba(51,53,56,0.8);border-bottom-width:2px;border-radius:4px;padding:0.05rem 0.35rem;color:rgba(227,227,227,0.8);}\n';

/* PiP window has no app.css — no --font-mono / body theme. Plain literals only. */
var VD_PIP_EXTRA = '' +
  'html,body{height:100%;}\n' +
  'body{margin:0;background:#131010;}\n' +
  '.pip-wrap{height:100vh;box-sizing:border-box;padding:0.75rem;}\n' +
  '.pip-wrap,.pip-wrap *{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace !important;}\n' +
  '.pip-wrap .vd-input{min-height:0;}\n' +
  '.pip-title{font-size:12px;font-weight:700;color:rgba(227,227,227,0.9);display:flex;align-items:center;gap:0.5rem;}\n';

App.registerTool('voice-dictation', {
  css: VD_CSS,

  mount: function (root) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var supported = typeof SR === 'function';
    var rec = null;
    var wantListening = false;
    var showInterim = true;
    var autoRestart = true;
    var voiceCommands = true;
    var smartFormat = true;
    var failStreak = 0;
    var sessionStart = 0;
    var restartPending = false;
    /* Last known caret/selection + which box owns it — survives focus
       loss (e.g. clicking Start after selecting text). */
    var lastRange = null;
    var activeTag = 'main';

    /* ── PiP refs (null unless the pop-out is open) ── */
    var pipWin = null, pipTa = null, pipInterim = null, pipDot = null;
    var pipStatusText = null, pipStartBtn = null, pipCopyBtn = null, pipSelHint = null;

    function pipAlive() {
      try {
        return !!(pipWin && !pipWin.closed && pipTa && pipWin.document);
      } catch (ePip) { return false; }
    }

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
    var pipBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('external-link', '', 12), App.el('span', { text: 'Pop-out' }));

    /* ── transcript ── */
    var ta = App.el('textarea', {
      class: 'vd-input', rows: '8', spellcheck: 'true',
      'aria-label': 'Dictation transcript',
      placeholder: supported ? 'Press Start and speak — words appear here live…' : 'Speech input is unsupported here — you can still type, then copy with Ctrl+C.',
      autocapitalize: 'sentences'
    });
    var interimEl = App.el('div', { class: 'vd-interim', 'aria-live': 'polite', text: '' });
    var selHint = App.el('div', { class: 'vd-sel', style: 'display:none' });
    var metaEl = App.el('div', { class: 'vd-meta' });
    var errBox = App.el('div', { class: 'vd-err', style: 'display:none' });
    /* Draft autosave: a reload or route switch never eats dictation. */
    var DRAFT_KEY = 'mub.dictation.v1';
    function saveDraft() {
      try {
        if (ta.value) localStorage.setItem(DRAFT_KEY, ta.value);
        else localStorage.removeItem(DRAFT_KEY);
      } catch (eD) {}
    }
    function loadDraft() {
      try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (eL) { return ''; }
    }
    /* Option checkboxes persist alongside the draft. */
    var OPT_KEY = 'mub.dictation.opts.v1';
    function saveOpts() {
      try { localStorage.setItem(OPT_KEY, JSON.stringify({ interim: !!showInterim, restart: !!autoRestart, commands: !!voiceCommands, smart: !!smartFormat })); } catch (eO) {}
    }
    function loadOpts() {
      try {
        var o = JSON.parse(localStorage.getItem(OPT_KEY) || 'null');
        if (o && typeof o === 'object') {
          showInterim = o.interim !== false;
          autoRestart = o.restart !== false;
          voiceCommands = o.commands !== false;
          smartFormat = o.smart !== false;
        }
      } catch (eP) {}
    }

    var optInterim = App.el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Show interim results' });
    var optRestart = App.el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Auto-restart on pause' });
    var optCommands = App.el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Voice commands for punctuation and editing' });
    var optSmart = App.el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Smart capitalization and spacing' });

    function paintStartButton(btn, live) {
      btn.className = 'vd-start ' + (live ? 'live' : 'idle');
      btn.setAttribute('aria-pressed', live ? 'true' : 'false');
      btn.innerHTML = '';
      btn.appendChild(App.icon(live ? 'pause' : 'play', '', 14));
      btn.appendChild(App.el('span', { text: live ? 'Stop' : 'Start dictation' }));
    }

    function setStatus(live, msg, hearing) {
      dot.className = 'vd-dot' + (hearing ? ' hearing' : live ? ' live' : '');
      statusText.textContent = msg;
      paintStartButton(startBtn, live);
      if (pipAlive()) {
        try {
          pipDot.className = dot.className;
          pipStatusText.textContent = msg;
          paintStartButton(pipStartBtn, live);
        } catch (eS) {}
      }
    }

    function setInterim(t) {
      interimEl.textContent = t;
      if (pipAlive()) { try { pipInterim.textContent = t; } catch (eI) {} }
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
      if (pipAlive()) { try { pipCopyBtn.disabled = empty; } catch (eB) {} }
    }

    function showError(msg) {
      errBox.textContent = msg;
      errBox.style.display = msg ? '' : 'none';
    }

    function readSel(el) {
      try {
        if (el && typeof el.selectionStart === 'number') return { s: el.selectionStart, e: el.selectionEnd };
      } catch (eR) {}
      return null;
    }

    /** Remember caret/selection + which box owns it. */
    function trackRangeEl(el, tag) {
      var r = readSel(el);
      if (r) lastRange = { tag: tag, s: r.s, e: r.e };
      refreshHints();
    }

    function updateSelHintEl(el, hintEl) {
      var r = readSel(el);
      if (r && r.e - r.s > 0) {
        var preview = el.value.slice(r.s, r.e);
        if (preview.length > 60) preview = preview.slice(0, 60) + '…';
        hintEl.textContent = '“' + preview + '” selected — speak now to replace it';
        hintEl.style.display = '';
      } else {
        hintEl.style.display = 'none';
      }
    }

    function refreshHints() {
      updateSelHintEl(ta, selHint);
      if (pipAlive()) { try { updateSelHintEl(pipTa, pipSelHint); } catch (eH) {} }
    }

    function livePos(el, w, tag) {
      try {
        if (el && typeof el.selectionStart === 'number' &&
            (w.document.activeElement === el || el.selectionEnd !== el.selectionStart)) {
          return { el: el, tag: tag, s: el.selectionStart, e: el.selectionEnd };
        }
      } catch (eL) {}
      return null;
    }

    /** Where should the next words go? Focused box wins, then any live
        selection, then the remembered range, else end of the active box. */
    function getInsertPos() {
      var main = livePos(ta, window, 'main');
      var pip = pipAlive() ? livePos(pipTa, pipWin, 'pip') : null;
      var focused = null;
      try { if (window.document.activeElement === ta) focused = main; } catch (eF1) {}
      try { if (pipAlive() && pipWin.document.activeElement === pipTa) focused = pip; } catch (eF2) {}
      if (focused) return focused;
      var first = activeTag === 'pip' ? pip : main;
      var second = activeTag === 'pip' ? main : pip;
      if (first) return first;
      if (second) return second;
      if (lastRange) {
        var el = lastRange.tag === 'pip' && pipAlive() ? pipTa : ta;
        var tag = el === pipTa ? 'pip' : 'main';
        if (lastRange.s <= el.value.length && lastRange.e <= el.value.length) {
          return { el: el, tag: tag, s: lastRange.s, e: lastRange.e };
        }
      }
      var fb = activeTag === 'pip' && pipAlive() ? pipTa : ta;
      var fbTag = fb === pipTa ? 'pip' : 'main';
      return { el: fb, tag: fbTag, s: fb.value.length, e: fb.value.length };
    }

    function placeCaretEl(pos, caret) {
      lastRange = { tag: pos.tag, s: caret, e: caret };
      try { pos.el.setSelectionRange(caret, caret); } catch (eC) {}
    }

    /** Mirror a mutation into the other box. The event source is the writer,
        so overwrite unconditionally — cross-window focus is NOT exclusive
        (both documents can report a focused element), so a focus guard here
        silently breaks sync. The other's caret/selection is preserved. */
    function mirrorFrom(el) {
      var other = el === ta ? (pipAlive() ? pipTa : null) : ta;
      if (!other || other.value === el.value) return;
      var os = readSel(other);
      try { other.value = el.value; } catch (eM) { return; }
      if (os) {
        try {
          other.setSelectionRange(Math.min(os.s, other.value.length), Math.min(os.e, other.value.length));
        } catch (eM2) {}
      }
    }

    function scrollBottom(el) {
      try { el.scrollTop = el.scrollHeight; } catch (eSc) {}
    }

    function afterEdit(pos, caret) {
      mirrorFrom(pos.el);
      scrollBottom(pos.el);
      placeCaretEl(pos, Math.max(0, caret));
      updateStats();
      refreshHints();
      saveDraft();
    }

    function capitalizeChunk(t) {
      return t.replace(/^[a-z]/, function (c) { return c.toUpperCase(); });
    }

    /* Voice commands: exact single-phrase matches only, so ordinary
       dictation ("comma" inside a sentence) never misfires. */
    var COMMANDS = {
      'period': '.', 'full stop': '.', 'dot': '.',
      'comma': ',', 'question mark': '?',
      'exclamation mark': '!', 'exclamation point': '!',
      'colon': ':', 'semicolon': ';', 'semi colon': ';',
      'dash': '—', 'hyphen': '-',
      'open quote': '\u201c', 'close quote': '\u201d',
      'new line': '\n', 'newline': '\n',
      'new paragraph': '\n\n', 'next paragraph': '\n\n'
    };
    var DELETE_WORDS = { 'delete that': 1, 'scratch that': 1, 'delete last word': 1, 'delete it': 1 };

    function isWordCh(ch) { return !!ch && /[A-Za-z0-9_\u00C0-\u024F]/.test(ch); }

    /** Insert text at pos. Spaces are added only at real word boundaries —
        never inside a word — using the removed text to tell the difference
        between "select whole word" (needs spaces) and "select mid-word"
        or "caret mid-word" (needs none). */
    function spliceAt(pos, t, attachLeft) {
      var el = pos.el;
      var before = el.value.slice(0, pos.s);
      var after = el.value.slice(pos.e);
      var removed = el.value.slice(pos.s, pos.e);
      var first = t.charAt(0);
      var last = t.charAt(t.length - 1);
      var afterFirst = after.charAt(0);
      var beforeLast = before.charAt(before.length - 1);
      var midCaret = pos.s === pos.e && isWordCh(beforeLast) && isWordCh(afterFirst);
      var sep1 = '';
      if (!attachLeft && before && !/\s$/.test(before) && isWordCh(first) && !midCaret) {
        /* Mid-word selection (word char on both sides of the left cut)? Fuse. */
        if (!(isWordCh(beforeLast) && isWordCh(removed.charAt(0)))) sep1 = ' ';
      }
      var sep2 = '';
      if (after && !/^\s/.test(after) && isWordCh(last) && isWordCh(afterFirst) && !midCaret) {
        /* Mid-word selection at the right cut? Fuse. */
        if (!(isWordCh(removed.charAt(removed.length - 1)) && isWordCh(afterFirst))) sep2 = ' ';
      }
      el.value = before + sep1 + t + sep2 + after;
      return before.length + sep1.length + t.length + sep2.length;
    }

    /** Delete the selected range, or the last word before the caret/pos. */
    function deleteAt(pos) {
      var el = pos.el;
      var before, after, caret;
      if (pos.e !== pos.s) {
        before = el.value.slice(0, pos.s);
        after = el.value.slice(pos.e);
        el.value = (before + after).replace(/ {2,}/g, ' ');
        if (!before) el.value = el.value.replace(/^ +/, '');
        if (!after) el.value = el.value.replace(/ +$/, '');
        caret = before.length;
      } else {
        before = el.value.slice(0, pos.s);
        after = el.value.slice(pos.s);
        var m = before.match(/\s*\S+\s*$/);
        caret = m ? pos.s - m[0].length : pos.s;
        el.value = el.value.slice(0, caret) + after;
      }
      afterEdit(pos, caret);
    }

    /** Insert final transcript at the caret/selection — never at a stale end. */
    function appendFinal(raw) {
      var t = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      var pos = getInsertPos();
      var el = pos.el;
      var collapsedEnd = pos.s === pos.e && pos.s === el.value.length;
      var lower = t.toLowerCase();

      if (voiceCommands && DELETE_WORDS[lower]) {
        deleteAt(pos);
        return;
      }
      if (voiceCommands && COMMANDS[lower]) {
        var cmd = COMMANDS[lower];
        var caret;
        if (cmd === '\n' || cmd === '\n\n') {
          /* Newlines replace the selection cleanly, no stray spaces. */
          var b = el.value.slice(0, pos.s).replace(/\s+$/, '');
          var a = el.value.slice(pos.e).replace(/^\s+/, '');
          el.value = b + cmd + a;
          caret = (b + cmd).length;
        } else {
          caret = spliceAt(pos, cmd, true);
        }
        afterEdit(pos, caret);
        return;
      }

      if (smartFormat) {
        t = t.replace(/\bi\b/g, 'I');
        var before = el.value.slice(0, pos.s);
        var trimmed = before.replace(/\s+$/, '');
        var lastCh = trimmed.charAt(trimmed.length - 1);
        if (!trimmed || lastCh === '.' || lastCh === '?' || lastCh === '!' || lastCh === '\n') {
          t = capitalizeChunk(t);
        } else if (!collapsedEnd && pos.s === 0) {
          t = capitalizeChunk(t);
        }
      }
      afterEdit(pos, spliceAt(pos, t, false));
    }

    function flashBtn(btn, label) {
      try {
        var orig = btn.innerHTML;
        btn.innerHTML = '';
        btn.appendChild(App.icon('check', '', 12));
        btn.appendChild(App.el('span', { text: 'Copied' }));
        App.timer(function () { try { btn.innerHTML = orig; } catch (eT) {} }, 1500);
        if (label) { try { btn.setAttribute('aria-label', label); } catch (eA) {} }
      } catch (eF) {}
    }

    function pipCopyText(btn) {
      if (!ta.value) return false;
      var done = function () { flashBtn(btn); };
      try {
        var nc = pipWin.navigator && pipWin.navigator.clipboard;
        if (nc && nc.writeText) {
          nc.writeText(ta.value).then(done, function () { pipFallbackCopy(); done(); });
          return true;
        }
      } catch (eN) {}
      pipFallbackCopy();
      done();
      return true;
    }

    function pipFallbackCopy() {
      try {
        var d = pipWin.document;
        var area = d.createElement('textarea');
        area.value = ta.value;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        d.body.appendChild(area);
        area.select();
        d.execCommand('copy');
        area.remove();
      } catch (eFc) {}
    }

    function copyAll(btn, fromPip) {
      if (!ta.value) {
        var msg = wantListening ? 'Listening… (nothing to copy yet)' : 'Nothing to copy yet — dictate or type first';
        statusText.textContent = msg;
        if (pipAlive()) { try { pipStatusText.textContent = msg; } catch (eCm) {} }
        return false;
      }
      if (fromPip && pipAlive()) pipCopyText(btn);
      else App.copy(ta.value, btn || copyBtn);
      return true;
    }

    function tickTimer() {
      if (!wantListening || !sessionStart) { timerEl.textContent = ''; return; }
      var s = Math.floor((Date.now() - sessionStart) / 1000);
      var mm = String(Math.floor(s / 60)).padStart(2, '0');
      var ss = String(s % 60).padStart(2, '0');
      timerEl.textContent = '● ' + mm + ':' + ss;
    }

    /** Best-confidence transcript across alternatives (Chrome returns
        several when maxAlternatives > 1). */
    function bestTranscript(res) {
      var best = '', bestConf = -1, i, c;
      for (i = 0; i < res.length; i++) {
        try {
          c = typeof res[i].confidence === 'number' ? res[i].confidence : (i === 0 ? 0.5 : 0);
        } catch (eB) { c = i === 0 ? 0.5 : 0; }
        if (c >= bestConf) { bestConf = c; best = res[i].transcript; }
      }
      return best || (res[0] && res[0].transcript) || '';
    }

    function newRecognizer() {
      var r = new SR();
      r.lang = 'en-US'; // English only — single fixed grammar, no runtime switching cost
      r.continuous = true; // one session, no per-utterance restart churn
      r.interimResults = true; // stream partials for lowest perceived latency
      r.maxAlternatives = 3; // confidence pick across hypotheses beats res[0] alone
      /* Exactly-once commit per session. Desktop Chrome advances resultIndex
         so resends never happen — but mobile Chrome re-fires the CUMULATIVE
         list with resultIndex stuck at 0, so naive "append everything new"
         inserts every word 2–3×. Keying committed finals by index + text
         makes repeats idempotent while genuine repeats ("yes" … "yes" as
         separate results) still commit, since their indices differ. */
      var seenFinal = {};
      var maxSeen = -1;
      r.onresult = function (ev) {
        failStreak = 0;
        var finals = [];
        var partials = [];
        var i, res, txt, key, len;
        try { len = ev.results.length; } catch (eRn) { len = 0; }
        if (len <= maxSeen) { seenFinal = {}; maxSeen = -1; } // session reset: list shrank, re-index from 0
        for (i = 0; i < len; i++) {
          res = ev.results[i];
          if (res.isFinal) {
            txt = bestTranscript(res);
            key = i + '|' + txt;
            if (!seenFinal[key]) { seenFinal[key] = 1; finals.push(txt); }
            if (i > maxSeen) maxSeen = i;
          } else if (res[0]) {
            partials.push(res[0].transcript);
          }
        }
        if (finals.length) {
          setInterim('');
          appendFinal(finals.join(' '));
        }
        setInterim(showInterim ? partials.join(' ').trim() : '');
      };
      r.onsoundstart = function () {
        if (wantListening) setStatus(true, 'Hearing you…', true);
      };
      r.onsoundend = function () {
        if (wantListening) setStatus(true, 'Listening… speak now', false);
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
        setInterim('');
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
        /* Chrome ends the session after a pause; resume fast — one timer, no polling. */
        if (!restartPending) {
          restartPending = true;
          App.timer(function () {
            restartPending = false;
            if (!wantListening) return;
            try { rec.start(); } catch (eRt) { /* already started — next onend retries */ }
          }, 120);
        }
      };
      return r;
    }

    function focusActiveBox() {
      /* Preserve the selection across focus() — focus() collapses it,
         which used to silently break speak-to-replace. */
      var el = activeTag === 'pip' && pipAlive() ? pipTa : ta;
      var w = el === pipTa ? pipWin : window;
      var tag = el === pipTa ? 'pip' : 'main';
      var saved = readSel(el);
      try {
        if (w.document.activeElement !== el) el.focus();
        if (saved && saved.e !== saved.s) el.setSelectionRange(saved.s, saved.e);
      } catch (eFx) {}
      if (saved) lastRange = { tag: tag, s: saved.s, e: saved.e };
      refreshHints();
    }

    function start() {
      if (!supported || wantListening) return;
      showError('');
      try {
        rec = newRecognizer();
        rec.start();
      } catch (eSt) {
        showError('Could not start recognition: ' + ((eSt && eSt.message) || eSt));
        return;
      }
      wantListening = true;
      failStreak = 0;
      sessionStart = Date.now();
      setStatus(true, 'Listening… speak now');
      focusActiveBox();
    }

    function stop(msg) {
      wantListening = false;
      sessionStart = 0;
      timerEl.textContent = '';
      setInterim('');
      try { if (rec) rec.stop(); } catch (eSp) {}
      setStatus(false, msg || (ta.value ? 'Stopped — transcript kept' : 'Idle — press Start and speak'));
    }

    function clearAll(focusAfter) {
      ta.value = '';
      try { localStorage.removeItem(DRAFT_KEY); } catch (eDc) {}
      if (pipAlive()) { try { pipTa.value = ''; } catch (eCl) {} }
      setInterim('');
      lastRange = null;
      showError('');
      updateStats();
      refreshHints();
      if (focusAfter !== false) {
        try { (activeTag === 'pip' && pipAlive() ? pipTa : ta).focus(); } catch (eCf) {}
      }
    }

    /* ── Picture-in-Picture pop-out (Document PiP: real always-on-top window) ── */
    function updatePipToggle() {
      var open = pipAlive();
      pipBtn.innerHTML = '';
      pipBtn.appendChild(App.icon('external-link', '', 12));
      pipBtn.appendChild(App.el('span', { text: open ? 'Pop-out open' : 'Pop-out' }));
    }

    function openPip() {
      if (pipAlive()) { try { pipWin.focus(); } catch (ePf) {} return; }
      var DPIP = window.documentPictureInPicture;
      if (!DPIP || !DPIP.requestWindow) {
        showError('Pop-out needs Chrome or Edge 116+. Your browser has no Document Picture-in-Picture support.');
        return;
      }
      var req;
      try {
        req = DPIP.requestWindow({ width: 400, height: 620 });
      } catch (eRq) {
        showError('Could not open the pop-out: ' + ((eRq && eRq.message) || eRq));
        return;
      }
      if (req && typeof req.then === 'function') {
        req.then(gotPipWin, function (err) {
          showError('Could not open the pop-out: ' + ((err && err.message) || err));
        });
      } else if (req) {
        gotPipWin(req);
      }
    }

    function gotPipWin(w) {
      pipWin = w;
      buildPip(w);
      activeTag = 'pip';
      updatePipToggle();
      try { if (pipTa) pipTa.focus(); } catch (eGf) {}
    }

    function onPipClosed() {
      pipWin = null; pipTa = null; pipInterim = null; pipDot = null;
      pipStatusText = null; pipStartBtn = null; pipCopyBtn = null; pipSelHint = null;
      if (activeTag === 'pip') activeTag = 'main';
      updatePipToggle();
    }

    function buildPip(w) {
      var d = w.document;
      var st = d.createElement('style');
      st.textContent = VD_CSS + VD_PIP_EXTRA;
      d.head.appendChild(st);

      var wrap = App.el('div', { class: 't-voice-dictation pip-wrap' });
      pipDot = App.el('span', { class: dot.className, 'aria-hidden': 'true' });
      pipStatusText = App.el('span', { text: statusText.textContent });
      pipStartBtn = App.el('button', { type: 'button', class: startBtn.className });
      paintStartButton(pipStartBtn, wantListening);
      pipStartBtn.addEventListener('click', function () {
        activeTag = 'pip';
        if (wantListening) stop();
        else start();
      });
      pipCopyBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('copy', '', 12), App.el('span', { text: 'Copy' }));
      pipCopyBtn.disabled = !ta.value;
      pipCopyBtn.addEventListener('click', function () { copyAll(pipCopyBtn, true); });
      var pipClearBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('rotate-ccw', '', 12), App.el('span', { text: 'Clear' }));
      pipClearBtn.addEventListener('click', function () { activeTag = 'pip'; clearAll(false); try { pipTa.focus(); } catch (ePc) {} });
      var pipCloseBtn = App.el('button', { type: 'button', class: 'vd-btn' }, App.icon('x', '', 12), App.el('span', { text: 'Pop-in' }));
      pipCloseBtn.addEventListener('click', function () { try { pipWin.close(); } catch (ePz) {} });

      pipTa = App.el('textarea', {
        class: 'vd-input', rows: '12', spellcheck: 'true',
        'aria-label': 'Dictation transcript (pop-out)',
        placeholder: 'Dictate here — same transcript, always on top…',
        autocapitalize: 'sentences'
      });
      pipTa.value = ta.value;
      pipSelHint = App.el('div', { class: 'vd-sel', style: 'display:none' });
      pipInterim = App.el('div', { class: 'vd-interim', 'aria-live': 'polite', text: interimEl.textContent });

      pipTa.addEventListener('input', function () {
        activeTag = 'pip';
        try { ta.value = pipTa.value; } catch (ePi) {}
        trackRangeEl(pipTa, 'pip');
        updateStats();
      });
      pipTa.addEventListener('focus', function () { activeTag = 'pip'; });
      ['select', 'click', 'keyup'].forEach(function (t) {
        pipTa.addEventListener(t, function () { trackRangeEl(pipTa, 'pip'); });
      });
      d.addEventListener('keydown', function (e) { copyKeyHandler(e, wrap, pipTa, w); });

      wrap.appendChild(App.el('div', { class: 'pip-title' },
        App.icon('mic', '', 14), App.el('span', { text: 'Voice Dictation' })));
      wrap.appendChild(App.el('div', { class: 'vd-status' }, pipDot, pipStatusText));
      wrap.appendChild(pipTa);
      wrap.appendChild(pipSelHint);
      wrap.appendChild(pipInterim);
      wrap.appendChild(App.el('div', { class: 'vd-top' }, pipStartBtn, pipCopyBtn, pipClearBtn, pipCloseBtn));
      d.body.appendChild(wrap);
      d.title = 'Voice Dictation';

      App.on(w, 'pagehide', onPipClosed);
      refreshHints();
    }

    function closePip() {
      if (pipWin && !pipWin.closed) { try { pipWin.close(); } catch (eCp) {} }
      onPipClosed();
    }

    /* ── main wiring ── */
    startBtn.addEventListener('click', function () {
      if (wantListening) stop();
      else start();
    });
    copyBtn.addEventListener('click', function () { copyAll(copyBtn, false); });
    dlBtn.addEventListener('click', function () {
      if (ta.value) App.download('dictation.txt', ta.value, 'text/plain;charset=utf-8');
    });
    clearBtn.addEventListener('click', function () { activeTag = 'main'; clearAll(true); });
    ta.addEventListener('input', App.debounce(function () { saveDraft(); }, 300));
    pipBtn.addEventListener('click', openPip);

    App.on(ta, 'input', function () { activeTag = 'main'; trackRangeEl(ta, 'main'); mirrorFrom(ta); updateStats(); });
    App.on(ta, 'focus', function () { activeTag = 'main'; });
    App.on(ta, 'select', function () { trackRangeEl(ta, 'main'); });
    App.on(ta, 'click', function () { trackRangeEl(ta, 'main'); });
    App.on(ta, 'keyup', function () { trackRangeEl(ta, 'main'); });
    App.on(optInterim, 'change', function () {
      showInterim = !!optInterim.checked;
      if (!showInterim) setInterim('');
      saveOpts();
    });
    App.on(optRestart, 'change', function () { autoRestart = !!optRestart.checked; saveOpts(); });
    App.on(optCommands, 'change', function () { voiceCommands = !!optCommands.checked; saveOpts(); });
    App.on(optSmart, 'change', function () { smartFormat = !!optSmart.checked; saveOpts(); });
    loadOpts();
    optInterim.checked = showInterim;
    optRestart.checked = autoRestart;
    optCommands.checked = voiceCommands;
    optSmart.checked = smartFormat;
    App.interval(tickTimer, 500);

    /* Ctrl+C / Cmd+C copies the whole transcript.
       A real text selection still wins: we only take over when there
       is nothing selected, so partial copies keep working natively. */
    function copyKeyHandler(e, containerEl, boxEl, w) {
      var key = e.key || '';
      var isC = key === 'c' || key === 'C' || e.keyCode === 67;
      if (!isC || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (!containerEl.contains(e.target)) return;
      try {
        if (e.target === boxEl && typeof boxEl.selectionStart === 'number' && boxEl.selectionEnd !== boxEl.selectionStart) return;
        var sel = w.getSelection();
        if (sel && !sel.isCollapsed && containerEl.contains(sel.anchorNode)) return;
      } catch (err) {}
      if (!ta.value) return;
      e.preventDefault();
      if (boxEl === pipTa) copyAll(pipCopyBtn, true);
      else copyAll(copyBtn, false);
    }
    App.on(document, 'keydown', function (e) { copyKeyHandler(e, root, ta, window); });

    App.onUnmount(function () {
      saveDraft();
      wantListening = false;
      try { if (rec) rec.abort(); } catch (eU) {}
      closePip();
    });

    /* ── layout ── */
    root.appendChild(App.el('div', { class: 'vd-top' },
      startBtn, copyBtn, dlBtn, clearBtn, pipBtn));
    root.appendChild(App.el('div', { class: 'vd-top' },
      App.el('div', { class: 'vd-status' }, dot, statusText),
      langBadge, timerEl));
    root.appendChild(ta);
    root.appendChild(selHint);
    root.appendChild(interimEl);
    root.appendChild(metaEl);
    root.appendChild(App.el('div', { class: 'vd-opts' },
      App.el('label', {}, optInterim, App.el('span', { text: 'Live interim results' })),
      App.el('label', {}, optRestart, App.el('span', { text: 'Auto-restart on pause' })),
      App.el('label', {}, optCommands, App.el('span', { text: 'Voice commands' })),
      App.el('label', {}, optSmart, App.el('span', { text: 'Smart caps + spacing' }))));
    root.appendChild(errBox);
    root.appendChild(App.el('p', { class: 'vd-note',
      text: 'Tip: select any wrong word, then just say the fix — it swaps in place. Short single words (“He”) ' +
        'are the hardest for any recognizer (no context), so speak in short phrases for best accuracy. ' +
        'Say “period”, “comma”, “question mark”, “new line”, “new paragraph”, or “delete that” to punctuate and edit hands-free. ' +
        'Pop-out pins a mini dictation window on top of every app — dictate there, copy, paste anywhere. ' +
        'Runs via your browser\u2019s built-in Speech API (fixed to en-US) — fastest path, no downloads. ' +
        'Note: in Chrome/Edge the audio is transcribed by the browser vendor\u2019s speech service; ' +
        'nothing is sent to this site (fully static, no server). Requires HTTPS or localhost plus mic permission. ' +
        'Best in Chrome/Edge on desktop.' }));

    if (!supported) {
      startBtn.disabled = true;
      setStatus(false, 'Unsupported — use Chrome or Edge (HTTPS/localhost)');
      showError('SpeechRecognition is not available in this browser. Use Chrome or Edge over HTTPS (or localhost). Typing + Ctrl+C copy still work.');
    } else {
      var draft = loadDraft();
      if (draft) { ta.value = draft; updateStats(); refreshHints(); }
      setStatus(false, draft ? 'Recovered unsent transcript — press Start to continue' : 'Idle — press Start and speak');
    }
    updatePipToggle();
    updateStats();
  }
});
})();
