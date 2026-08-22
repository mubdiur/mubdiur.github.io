/* ═══════════════════════════════════════════════════════════
   Sorting Algorithm Visualizer — ported from src/components/tools/sorting-visualizer.tsx.
   Watch bubble, selection, insertion, quick, merge, heap sorts in action.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var ALGOS = {
  'Bubble Sort': function* (arr) {
    var a = arr.slice();
    for (var i = 0; i < a.length - 1; i++)
      for (var j = 0; j < a.length - 1 - i; j++) {
        if (a[j] > a[j + 1]) { var t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }
        yield [a, [j, j + 1]];
      }
  },
  'Selection Sort': function* (arr) {
    var a = arr.slice();
    for (var i = 0; i < a.length - 1; i++) {
      var min = i;
      for (var j = i + 1; j < a.length; j++) { if (a[j] < a[min]) min = j; yield [a, [j, min]]; }
      var t = a[i]; a[i] = a[min]; a[min] = t;
    }
  },
  'Insertion Sort': function* (arr) {
    var a = arr.slice();
    for (var i = 1; i < a.length; i++) {
      var j = i;
      while (j > 0 && a[j - 1] > a[j]) { var t = a[j]; a[j] = a[j - 1]; a[j - 1] = t; j--; yield [a, [j, j + 1]]; }
    }
  },
  'Quick Sort': function* (arr) {
    var a = arr.slice();
    function* qs(lo, hi) {
      if (lo >= hi) return;
      var p = a[hi]; var i = lo;
      for (var j = lo; j < hi; j++) {
        if (a[j] < p) { var t = a[i]; a[i] = a[j]; a[j] = t; i++; }
        yield [a, [i - 1, j]];
      }
      var t = a[i]; a[i] = a[hi]; a[hi] = t;
      yield [a, [i, hi]];
      yield* qs(lo, i - 1);
      yield* qs(i + 1, hi);
    }
    yield* qs(0, a.length - 1);
  },
  'Merge Sort': function* (arr) {
    var a = arr.slice();
    function* ms(lo, hi) {
      if (lo >= hi) return;
      var mid = Math.floor((lo + hi) / 2);
      yield* ms(lo, mid);
      yield* ms(mid + 1, hi);
      var temp = [];
      var i = lo, j = mid + 1;
      while (i <= mid && j <= hi) temp.push(a[i] <= a[j] ? a[i++] : a[j++]);
      while (i <= mid) temp.push(a[i++]);
      while (j <= hi) temp.push(a[j++]);
      for (var k = 0; k < temp.length; k++) { a[lo + k] = temp[k]; yield [a, [lo + k]]; }
    }
    yield* ms(0, a.length - 1);
  },
  'Heap Sort': function* (arr) {
    var a = arr.slice();
    var heapify = function* (n, i) {
      var largest = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && a[l] > a[largest]) largest = l;
      if (r < n && a[r] > a[largest]) largest = r;
      if (largest !== i) { var t = a[i]; a[i] = a[largest]; a[largest] = t; yield [a, [i, largest]]; yield* heapify(n, largest); }
    };
    for (var i = Math.floor(a.length / 2) - 1; i >= 0; i--) yield* heapify(a.length, i);
    for (var i2 = a.length - 1; i2 > 0; i2--) { var t = a[0]; a[0] = a[i2]; a[i2] = t; yield [a, [0, i2]]; yield* heapify(i2, 0); }
  }
};

App.registerTool('sorting-visualizer', {
  css: '' +
    '.t-sorting-visualizer .ctrls{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;}\n' +
    '.t-sorting-visualizer .range-group{display:flex;align-items:center;gap:0.375rem;}\n' +
    '.t-sorting-visualizer .range-label{font-family:var(--font-mono);font-size:10px;color:rgba(189,174,147,0.5);}\n' +
    '.t-sorting-visualizer .range{width:80px;height:6px;accent-color:var(--cyan-glow);cursor:pointer;}\n' +
    '.t-sorting-visualizer .range-val{font-family:var(--font-mono);font-size:10px;color:rgba(189,174,147,0.5);width:24px;}\n' +
    '.t-sorting-visualizer .btn-play{display:flex;align-items:center;gap:0.25rem;padding:0.25rem 0.625rem;border-radius:6px;font-family:var(--font-mono);font-size:10px;background:rgba(142,192,124,0.1);border:1px solid rgba(142,192,124,0.2);color:rgba(142,192,124,0.8);cursor:pointer;transition:background-color .2s;}\n' +
    '.t-sorting-visualizer .btn-play:hover{background:rgba(142,192,124,0.2);}\n' +
    '.t-sorting-visualizer .btn-step{display:flex;align-items:center;gap:0.25rem;padding:0.25rem 0.5rem;border-radius:6px;font-family:var(--font-mono);font-size:10px;background:rgba(60,56,54,0.3);border:1px solid rgba(80,73,69,0.3);color:rgba(189,174,147,0.6);cursor:pointer;transition:color .2s;}\n' +
    '.t-sorting-visualizer .btn-step:hover{color:rgba(235,219,178,0.8);}\n' +
    '.t-sorting-visualizer .btn-step:disabled{opacity:0.4;cursor:not-allowed;}\n' +
    '.t-sorting-visualizer .btn-group{margin-left:auto;display:flex;align-items:center;gap:0.25rem;}\n' +
    '.t-sorting-visualizer .bars{display:flex;align-items:flex-end;gap:2px;height:250px;border:1px solid rgba(80,73,69,0.3);background:rgba(0,0,0,0.2);padding:0.5rem;border-radius:6px;overflow:hidden;margin-top:0.75rem;}\n' +
    '.t-sorting-visualizer .bar{flex:1;border-radius:4px 4px 0 0;min-width:3px;transition:all 30ms;}\n' +
    '.t-sorting-visualizer .stats{display:flex;gap:0.75rem;margin-top:0.75rem;font-family:var(--font-mono);font-size:10px;color:rgba(189,174,147,0.5);}\n' +
    '.t-sorting-visualizer .stats .sorted{color:rgba(184,187,38,0.7);}\n',

  mount: function (root) {
    var array = [];
    var highlighted = [];
    var running = false;
    var done = false;
    var algo = 'Bubble Sort';
    var speed = 50;
    var size = 20;
    var gen = null;
    var runId = 0;

    var barsEl = App.el('div', { class: 'bars' });
    var statsEl = App.el('div', { class: 'stats' });

    function generateArray() {
      var n = Math.min(size, 100);
      array = [];
      for (var i = 0; i < n; i++) array.push(Math.floor(Math.random() * 80) + 5);
      highlighted = [];
      done = false;
      running = false;
      gen = null;
      render();
    }

    function applyStep(step) {
      array = step[0].slice();
      highlighted = step[1];
      render();
    }

    function render() {
      barsEl.innerHTML = '';
      array.forEach(function (val, i) {
        var bg = highlighted.indexOf(i) >= 0
          ? 'oklch(0.68 0.18 195)'
          : done
            ? 'oklch(0.70 0.18 145 / 0.7)'
            : 'oklch(0.68 0.18 195 / 0.3)';
        barsEl.appendChild(App.el('div', { class: 'bar', style: { height: val + '%', backgroundColor: bg } }));
      });
      statsEl.innerHTML = '';
      statsEl.appendChild(App.el('span', { text: 'Elements: ' + array.length }));
      statsEl.appendChild(App.el('span', { text: 'Comparisons highlighted' }));
      if (done) statsEl.appendChild(App.el('span', { class: 'sorted', text: '✓ Sorted' }));
      updateButtons();
    }

    function updateButtons() {
      playBtn.innerHTML = '';
      playBtn.appendChild(App.icon(running ? 'pause' : done ? 'rotate-ccw' : 'play', '', 12));
      playBtn.appendChild(document.createTextNode(running ? 'Pause' : done ? 'Reset' : 'Start'));
      stepBtn.classList.toggle('hidden', running);
      stepBtn.disabled = done;
    }

    async function play() {
      var id = ++runId;
      var delay = 200 - speed * 1.8;
      var res;
      while (running && runId === id) {
        res = gen.next();
        if (res.done) break;
        applyStep(res.value);
        await App.sleep(delay);
      }
      if (runId === id && res && res.done) {
        running = false;
        done = true;
        highlighted = [];
        render();
      }
    }

    function startAnim() {
      if (running) { running = false; updateButtons(); return; }
      if (done) { generateArray(); return; }
      running = true;
      gen = ALGOS[algo](array.slice());
      play();
    }

    function step() {
      if (!gen) return;
      var res = gen.next();
      if (res.done) { done = true; highlighted = []; }
      else applyStep(res.value);
      render();
    }

    function clear() {
      generateArray();
    }

    var playBtn = App.el('button', { class: 'btn-play', type: 'button' }, App.icon('play', '', 12), App.el('span', { text: 'Start' }));
    playBtn.addEventListener('click', startAnim);

    var stepBtn = App.el('button', { class: 'btn-step', type: 'button', disabled: true }, App.icon('fast-forward', '', 12), App.el('span', { text: 'Step' }));
    stepBtn.addEventListener('click', step);

    var algoSel = App.el('select', { class: 'select-control', 'aria-label': 'Sorting algorithm' });
    Object.keys(ALGOS).forEach(function (a) {
      algoSel.appendChild(App.el('option', { value: a, text: a }));
    });
    algoSel.value = algo;
    algoSel.addEventListener('change', function () { algo = algoSel.value; clear(); });

    var sizeRange = App.el('input', { class: 'range', type: 'range', min: 5, max: 100 });
    sizeRange.value = String(size);
    var sizeVal = App.el('span', { class: 'range-val', text: String(size) });
    sizeRange.addEventListener('change', function () { size = parseInt(sizeRange.value, 10); sizeVal.textContent = String(size); clear(); });

    var speedRange = App.el('input', { class: 'range', type: 'range', min: 1, max: 100 });
    speedRange.value = String(speed);
    speedRange.addEventListener('change', function () { speed = parseInt(speedRange.value, 10); });

    var controls = App.el('div', { class: 'ctrls' },
      algoSel,
      App.el('div', { class: 'range-group' },
        App.el('span', { class: 'range-label', text: 'Size' }),
        sizeRange,
        sizeVal),
      App.el('div', { class: 'range-group' },
        App.el('span', { class: 'range-label', text: 'Speed' }),
        speedRange),
      App.el('div', { class: 'btn-group' },
        playBtn,
        stepBtn));

    root.appendChild(controls);
    root.appendChild(barsEl);
    root.appendChild(statsEl);
    generateArray();
  }
});
})();
