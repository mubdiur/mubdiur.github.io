/* ═══════════════════════════════════════════════════════════
   Canvas chart engine — replaces ApexCharts for the
   Observability Desk. Bar, line, area, radial, horizontal bar.
   Gruvbox palette, JetBrains Mono labels.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var MONO = 'JetBrains Mono, monospace';

// roundRect fallback for older browsers
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

function niceMax(v) {
  if (v <= 0) return 1;
  var mag = Math.pow(10, Math.floor(Math.log10(v)));
  var norm = v / mag;
  var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/** Draw a chart into a canvas. opts: { type, series, categories, colors, yFmt, yMax, yMin, annotations, labels } */
function drawChart(canvas, opts) {
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.clientWidth || 600;
  var H = canvas.clientHeight || 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  var padL = 44, padR = 12, padT = 14, padB = 24;
  var plotW = W - padL - padR;
  var plotH = H - padT - padB;
  var cats = opts.categories || [];
  var n = cats.length || (opts.series && opts.series[0] && opts.series[0].data.length) || 0;

  // ── y scale ──
  var allVals = [];
  (opts.series || []).forEach(function (s) { (s.data || []).forEach(function (d) { allVals.push(typeof d === 'object' ? d.y : d); }); });
  var rawMax = Math.max.apply(null, allVals.concat([0]));
  var rawMin = Math.min.apply(null, allVals.concat([0]));
  var yMax = opts.yMax !== undefined ? opts.yMax : niceMax(rawMax * 1.1);
  var yMin = opts.yMin !== undefined ? opts.yMin : Math.min(0, rawMin * 1.1);
  var yRange = yMax - yMin || 1;
  var yFmt = opts.yFmt || function (v) { return String(Math.round(v)); };

  // ── grid ──
  ctx.font = '10px ' + MONO;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  var gridLines = 4;
  for (var gi = 0; gi <= gridLines; gi++) {
    var gv = yMin + (yRange * gi) / gridLines;
    var gy = padT + plotH - ((gv - yMin) / yRange) * plotH;
    ctx.strokeStyle = '#313244';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(W - padR, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a6adc8';
    ctx.fillText(yFmt(gv), padL - 6, gy);
  }

  var xStep = n > 1 ? plotW / n : plotW;

  function xPos(i) { return padL + xStep * (i + 0.5); }
  function yPos(v) { return padT + plotH - ((v - yMin) / yRange) * plotH; }

  // ── annotations (vertical lines) ──
  (opts.annotations || []).forEach(function (a) {
    var ax = xPos(a.x);
    ctx.strokeStyle = a.color || '#f9e2af';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, padT);
    ctx.lineTo(ax, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    if (a.label) {
      ctx.font = '10px ' + MONO;
      var tw = ctx.measureText(a.label.text).width;
      var lx = Math.min(Math.max(ax - tw / 2, padL), W - padR - tw);
      ctx.fillStyle = a.label.background || '#f9e2af';
      ctx.fillRect(lx - 4, padT - 1, tw + 8, 15);
      ctx.fillStyle = a.label.color || '#11111b';
      ctx.textAlign = 'left';
      ctx.fillText(a.label.text, lx, padT + 6.5);
      ctx.textAlign = 'right';
    }
  });

  (opts.series || []).forEach(function (s, si) {
    var color = (opts.colors && opts.colors[si]) || '#cdd6f4';
    var data = s.data.map(function (d) { return typeof d === 'object' ? d.y : d; });

    if (s.type === 'bar' && s.horizontal) {
      // horizontal bar
      var barH = (plotH / data.length) * 0.62;
      data.forEach(function (v, i) {
        var bx = padL;
        var bw = ((v - yMin) / yRange) * plotW;
        var by = padT + (plotH / data.length) * i + (plotH / data.length - barH) / 2;
        ctx.fillStyle = (opts.colors && opts.colors[i]) || color;
        ctx.beginPath();
        var r = Math.min(2, barH / 2);
        ctx.roundRect(bx, by, Math.max(bw, 0), barH, r);
        ctx.fill();
        ctx.fillStyle = '#11111b';
        ctx.font = '10px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(yFmt(v), bx + Math.max(bw, 0) + 6, by + barH / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#a6adc8';
        ctx.fillText(s.labels && s.labels[i] !== undefined ? s.labels[i] : (cats[i] || ''), bx - 6, by + barH / 2);
      });
    } else if (s.type === 'bar') {
      var bw = Math.min(xStep * 0.58, 30);
      data.forEach(function (v, i) {
        var h = ((v - yMin) / yRange) * plotH;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(xPos(i) - bw / 2, yPos(v), bw, Math.max(h, 0), 2);
        ctx.fill();
      });
    } else {
      // line / area
      ctx.beginPath();
      data.forEach(function (v, i) {
        if (i === 0) ctx.moveTo(xPos(i), yPos(v));
        else ctx.lineTo(xPos(i), yPos(v));
      });
      if (s.type === 'area') {
        ctx.save();
        ctx.lineTo(xPos(data.length - 1), padT + plotH);
        ctx.lineTo(xPos(0), padT + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, hexA(color, 0.35));
        grad.addColorStop(1, hexA(color, 0.02));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        data.forEach(function (v, i) {
          if (i === 0) ctx.moveTo(xPos(i), yPos(v));
          else ctx.lineTo(xPos(i), yPos(v));
        });
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = (s.type === 'area' ? 1.6 : 2);
      ctx.lineJoin = 'round';
      ctx.stroke();
      if (s.type === 'line' && opts.markers) {
        data.forEach(function (v, i) {
          ctx.beginPath();
          ctx.arc(xPos(i), yPos(v), 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }
    }
  });

  // ── x labels ──
  ctx.fillStyle = '#a6adc8';
  ctx.font = '10px ' + MONO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var skip = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 46))));
  cats.forEach(function (c, i) {
    if (i % skip !== 0 && i !== n - 1) return;
    ctx.fillText(String(c), xPos(i), padT + plotH + 6);
  });

  // ── legend ──
  if (opts.legend) {
    var lx = padL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    (opts.series || []).forEach(function (s, si) {
      var color = (opts.colors && opts.colors[si]) || '#cdd6f4';
      var label = s.name || '';
      if (!label) return;
      ctx.fillStyle = color;
      ctx.fillRect(lx, 8, 8, 2);
      ctx.fillStyle = '#a6adc8';
      ctx.fillText(label, lx + 12, 9);
      lx += ctx.measureText(label).width + 28;
    });
  }
}

function hexA(hex, a) {
  var h = hex.replace('#', '');
  var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

/** Grafana-flavored panel shell. */
function Panel(title, badge, bodyNode) {
  var fig = App.el('figure', { class: 'news-panel flex flex-col' },
    App.el('div', { class: 'panel-head' },
      App.el('span', { class: 'panel-dots', 'aria-hidden': 'true', html:
        '<span style="background:rgba(251,73,52,0.8)"></span><span style="background:rgba(249,226,175,0.8)"></span><span style="background:rgba(148,226,213,0.8)"></span>' }),
      App.el('figcaption', { text: title }),
      badge ? App.el('span', { class: 'panel-badge', html: '<span class="dot"></span>' + App.esc(badge) }) : null),
    App.el('div', { class: 'panel-body' }, bodyNode));
  return fig;
}

/** Chart wrapper: creates a canvas and draws on resize. */
function Chart(opts) {
  var wrap = App.el('div');
  var canvas = App.el('canvas', { class: 'chart-canvas' });
  wrap.appendChild(canvas);
  function draw() {
    if (wrap.offsetWidth > 0) {
      canvas.style.height = opts.height || '220px';
      drawChart(canvas, opts);
    }
  }
  App.on(window, 'resize', draw);
  App.raf(function () { draw(); });
  // redraw after fonts/layout settle
  App.timer(draw, 100);
  return wrap;
}

window.Charts = { Chart: Chart, Panel: Panel };
})();
