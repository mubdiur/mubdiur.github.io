/* ═══════════════════════════════════════════════════════════
   Search Algorithm Visualizer — ported from src/components/tools/search-visualizer.tsx.
   Visualize linear and binary search on arrays.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('search-visualizer', {
  css: '' +
    '.t-search-visualizer .ctrls{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;}\n' +
    '.t-search-visualizer .target-group{display:flex;align-items:center;gap:0.375rem;}\n' +
    '.t-search-visualizer .target-label{font-family:var(--font-mono);font-size:10px;color:rgba(170,170,179,0.5);}\n' +
    '.t-search-visualizer .target-input{width:64px;height:28px;border:1px solid rgba(30,32,41,0.4);background:rgba(0,0,0,0.3);color:rgba(233,233,236,0.8);font-family:var(--font-mono);font-size:12px;border-radius:6px;padding:0 8px;outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-search-visualizer .target-input:focus{border-color:rgba(194,220,212,0.4);box-shadow:0 0 0 1px rgba(194,220,212,0.3);}\n' +
    '.t-search-visualizer .btn-run{display:flex;align-items:center;gap:0.25rem;padding:0.25rem 0.625rem;border-radius:6px;font-family:var(--font-mono);font-size:10px;background:rgba(194,220,212,0.1);border:1px solid rgba(194,220,212,0.2);color:rgba(194,220,212,0.8);cursor:pointer;transition:background-color .2s;}\n' +
    '.t-search-visualizer .btn-run:hover{background:rgba(194,220,212,0.2);}\n' +
    '.t-search-visualizer .btn-run:disabled{opacity:0.4;cursor:not-allowed;}\n' +
    '.t-search-visualizer .btn-ghost{display:flex;align-items:center;gap:0.25rem;padding:0.25rem 0.5rem;border-radius:6px;font-family:var(--font-mono);font-size:10px;background:rgba(30,32,41,0.3);border:1px solid rgba(30,32,41,0.3);color:rgba(170,170,179,0.6);cursor:pointer;transition:color .2s;}\n' +
    '.t-search-visualizer .btn-ghost:hover{color:rgba(233,233,236,0.8);}\n' +
    '.t-search-visualizer .btn-group{margin-left:auto;display:flex;align-items:center;gap:0.25rem;}\n' +
    '.t-search-visualizer .bars{display:flex;align-items:flex-end;gap:4px;height:200px;border:1px solid rgba(30,32,41,0.3);background:rgba(0,0,0,0.2);padding:0.5rem;border-radius:6px;overflow:hidden;margin-top:0.75rem;}\n' +
    '.t-search-visualizer .sbar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;border-radius:4px 4px 0 0;position:relative;min-width:20px;transition:all 0.2s;}\n' +
    '.t-search-visualizer .sbar .val{font-family:var(--font-mono);font-size:10px;color:rgba(233,233,236,0.6);position:absolute;top:-16px;}\n' +
    '.t-search-visualizer .indexes{display:flex;gap:4px;padding-left:20px;margin-top:0.5rem;}\n' +
    '.t-search-visualizer .indexes span{flex:1;font-family:var(--font-mono);font-size:10px;text-align:center;color:rgba(170,170,179,0.4);min-width:20px;}\n' +
    '.t-search-visualizer .status{display:none;font-family:var(--font-mono);font-size:12px;padding:0.25rem 0.5rem;border-radius:6px;margin-top:0.75rem;}\n' +
    '.t-search-visualizer .status.show{display:block;}\n' +
    '.t-search-visualizer .status.found{background:rgba(5,46,22,0.25);color:rgba(194,220,212,0.7);}\n' +
    '.t-search-visualizer .status.miss{background:rgba(69,10,10,0.25);color:rgba(248,113,113,0.7);}\n' +
    '.t-search-visualizer .status.info{color:rgba(170,170,179,0.6);}\n',

  mount: function (root) {
    var array = [];
    var target = '42';
    var highlighted = [];
    var found = null;
    var algo = 'binary';
    var running = false;
    var done = false;
    var message = '';
    var steps = [];
    var stepIdx = 0;
    var runId = 0;

    var barsEl = App.el('div', { class: 'bars' });
    var indexesEl = App.el('div', { class: 'indexes' });
    var statusEl = App.el('div', { class: 'status' });

    function newArray() {
      array = [];
      for (var i = 0; i < 15; i++) array.push(Math.floor(Math.random() * 90) + 5);
      array.sort(function (a, b) { return a - b; });
    }

    function runSearch() {
      running = false;
      done = false;
      found = null;
      highlighted = [];
      message = '';
      var t = parseInt(target, 10);
      if (isNaN(t)) { message = 'Enter a valid number'; render(); return; }
      var arr = array.slice();
      steps = [];
      stepIdx = 0;

      if (algo === 'linear') {
        for (var i = 0; i < arr.length; i++) {
          steps.push({ arr: arr.slice(), hl: [i], found: null, msg: 'Checking index ' + i + ': ' + arr[i] });
          if (arr[i] === t) {
            steps.push({ arr: arr.slice(), hl: [i], found: i, msg: 'Found ' + t + ' at index ' + i + '!' });
            break;
          }
        }
        if (!steps.some(function (s) { return s.found !== null; })) {
          steps[steps.length - 1].msg = t + ' not found in array';
        }
      } else {
        var lo = 0, hi = arr.length - 1;
        while (lo <= hi) {
          var mid = Math.floor((lo + hi) / 2);
          steps.push({ arr: arr.slice(), hl: [lo, hi, mid], found: null, msg: 'Searching [' + lo + '..' + hi + '], mid=' + mid + ' (value: ' + arr[mid] + ')' });
          if (arr[mid] === t) {
            steps.push({ arr: arr.slice(), hl: [mid], found: mid, msg: 'Found ' + t + ' at index ' + mid + '!' });
            break;
          }
          if (arr[mid] < t) lo = mid + 1;
          else hi = mid - 1;
        }
        if (!steps.some(function (s) { return s.found !== null; })) {
          steps.push({ arr: arr.slice(), hl: [], found: null, msg: t + ' not found in array' });
        }
      }

      running = true;
      stepIdx = 0;
      play();
    }

    async function play() {
      var id = ++runId;
      while (running && runId === id && stepIdx < steps.length) {
        var s = steps[stepIdx++];
        highlighted = s.hl;
        found = s.found;
        message = s.msg;
        render();
        await App.sleep(600);
      }
      if (running && runId === id) {
        running = false;
        done = true;
        if (steps.length > 0) {
          var last = steps[steps.length - 1];
          highlighted = last.hl;
          found = last.found;
          message = last.msg;
        }
        render();
      }
    }

    function regenerate() {
      running = false;
      done = false;
      found = null;
      highlighted = [];
      message = '';
      newArray();
      render();
    }

    function clear() {
      running = false;
      done = false;
      found = null;
      highlighted = [];
      message = '';
      render();
    }

    function render() {
      runBtn.disabled = running;

      barsEl.innerHTML = '';
      array.forEach(function (val, i) {
        var bg = 'oklch(0.68 0.18 195 / 0.25)';
        if (found === i) bg = 'oklch(0.70 0.18 145 / 0.8)';
        else if (highlighted.indexOf(i) >= 0) {
          if (algo === 'binary') {
            if (i === highlighted[2]) bg = 'oklch(0.90 0.30 60 / 0.8)'; // mid
            else if (i >= highlighted[0] && i <= highlighted[1]) bg = 'oklch(0.68 0.18 195 / 0.5)';
            else bg = 'oklch(0.68 0.18 195 / 0.1)';
          } else {
            bg = 'oklch(0.68 0.18 195 / 0.7)';
          }
        }
        barsEl.appendChild(App.el('div', { class: 'sbar', style: { height: val + '%', backgroundColor: bg } },
          App.el('span', { class: 'val', text: String(val) })));
      });

      indexesEl.innerHTML = '';
      array.forEach(function (_, i) {
        indexesEl.appendChild(App.el('span', { text: String(i) }));
      });

      statusEl.classList.remove('found', 'miss', 'info');
      statusEl.classList.toggle('show', !!message);
      if (message) {
        statusEl.classList.add(found !== null ? 'found' : done ? 'miss' : 'info');
        statusEl.textContent = message;
      }
    }

    var algoSel = App.el('select', { class: 'select-control', 'aria-label': 'Search algorithm' },
      App.el('option', { value: 'linear', text: 'Linear Search' }),
      App.el('option', { value: 'binary', text: 'Binary Search' }));
    algoSel.value = algo;
    algoSel.addEventListener('change', function () { algo = algoSel.value; });

    var targetInput = App.el('input', {
      class: 'target-input', type: 'number', 'aria-label': 'Target value'
    });
    targetInput.value = target;
    targetInput.addEventListener('input', function () { target = targetInput.value; });

    var runBtn = App.el('button', { class: 'btn-run', type: 'button', disabled: false }, App.icon('play', '', 12), App.el('span', { text: 'Search' }));
    runBtn.addEventListener('click', runSearch);

    var newArrayBtn = App.el('button', { class: 'btn-ghost', type: 'button' }, App.icon('rotate-ccw', '', 12), App.el('span', { text: 'New Array' }));
    newArrayBtn.addEventListener('click', regenerate);

    var controls = App.el('div', { class: 'ctrls' },
      algoSel,
      App.el('div', { class: 'target-group' },
        App.el('span', { class: 'target-label', text: 'Target:' }),
        targetInput),
      App.el('div', { class: 'btn-group' },
        runBtn,
        newArrayBtn));

    root.appendChild(controls);
    root.appendChild(barsEl);
    root.appendChild(indexesEl);
    root.appendChild(statusEl);
    newArray();
    render();
  }
});
})();
