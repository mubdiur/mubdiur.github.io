/* ═══════════════════════════════════════════════════════════
   Binary Tree Visualizer — insert/reset/clear on a BST with
   SVG rendering and node highlighting.
   Ported from src/components/tools/binary-tree-visualizer.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('binary-tree-visualizer', {
  css: '' +
    '.t-binary-tree-visualizer .t-input{width:5rem;height:1.75rem;padding:0 0.5rem;border:1px solid rgba(75,64,56,0.4);background:rgba(0,0,0,0.3);color:rgba(202,170,152,0.8);font-family:var(--font-mono);font-size:12px;border-radius:6px;outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-binary-tree-visualizer .t-input:focus{border-color:rgba(163,191,160,0.4);box-shadow:0 0 0 1px rgba(163,191,160,0.3);}\n' +
    '.t-binary-tree-visualizer .t-input::placeholder{color:rgba(154,134,120,0.3);}\n' +
    '.t-binary-tree-visualizer .t-btn-primary{display:flex;align-items:center;gap:0.25rem;padding:0.25rem 0.625rem;border-radius:6px;background:rgba(163,191,160,0.1);border:1px solid rgba(163,191,160,0.2);color:rgba(163,191,160,0.8);font-family:var(--font-mono);font-size:10px;cursor:pointer;transition:background-color .2s,border-color .2s;}\n' +
    '.t-binary-tree-visualizer .t-btn-primary:hover{background:rgba(163,191,160,0.2);}\n' +
    '.t-binary-tree-visualizer .t-btn-ghost{display:flex;align-items:center;gap:0.25rem;padding:0.25rem 0.5rem;border-radius:6px;background:rgba(75,64,56,0.3);border:1px solid rgba(75,64,56,0.3);color:rgba(154,134,120,0.6);font-family:var(--font-mono);font-size:10px;cursor:pointer;transition:color .2s,background-color .2s;}\n' +
    '.t-binary-tree-visualizer .t-btn-ghost:hover{color:rgba(202,170,152,0.8);}\n' +
    '.t-binary-tree-visualizer .t-nodes{font-family:var(--font-mono);font-size:10px;color:rgba(154,134,120,0.5);margin-left:auto;}\n',

  mount: function (root) {
    var SVG_NS = 'http://www.w3.org/2000/svg';
    /* App.el works for HTML; SVG children need the SVG namespace. */
    function svgEl(tag, props) {
      var node = document.createElementNS(SVG_NS, tag);
      var firstChildIdx = 1;
      if (props && typeof props === 'object' && !props.nodeType) {
        for (var k in props) {
          var v = props[k];
          if (v === undefined || v === null || v === false) continue;
          if (k === 'class') node.setAttribute('class', v);
          else if (k === 'text') node.textContent = v;
          else if (k === 'style' && typeof v === 'object') {
            for (var s in v) node.style[s] = v[s];
          } else node.setAttribute(k, v);
        }
        firstChildIdx = 2;
      }
      for (var i = firstChildIdx; i < arguments.length; i++) {
        var child = arguments[i];
        if (child === undefined || child === null || child === false) continue;
        node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
      }
      return node;
    }

    /* ── BST node + algorithms (verbatim from the TSX) ── */
    function BSTNode(val) {
      this.val = val;
      this.left = null;
      this.right = null;
      this.x = 0;
      this.y = 0;
    }

    function insert(root, val) {
      if (!root) return new BSTNode(val);
      if (val < root.val) root.left = insert(root.left, val);
      else root.right = insert(root.right, val);
      return root;
    }

    function layoutTree(root, depth, offset, positions) {
      if (depth === undefined) depth = 0;
      if (offset === undefined) offset = 0;
      if (positions === undefined) positions = new Map();
      if (!root) return { root: root, positions: positions };
      var leftWidth = countNodes(root.left);
      root.x = offset + leftWidth * 40;
      root.y = depth * 60 + 30;
      positions.set(root, { x: root.x, y: root.y });
      layoutTree(root.left, depth + 1, offset, positions);
      layoutTree(root.right, depth + 1, offset + leftWidth * 40 + 40, positions);
      return { root: root, positions: positions };
    }

    function countNodes(n) {
      return n ? 1 + countNodes(n.left) + countNodes(n.right) : 0;
    }

    function treeHeight(n) {
      return n ? 1 + Math.max(treeHeight(n.left), treeHeight(n.right)) : 0;
    }

    /* ── state ── */
    var tree = null;
    var positions = new Map();
    var inputVal = '42';
    var highlight = null;
    var history = [50, 30, 70, 20, 40, 60, 80, 15, 25, 35, 45, 55, 65, 75, 85];

    function rebuildTree(vals) {
      var t = null;
      for (var i = 0; i < vals.length; i++) t = insert(t, vals[i]);
      tree = t;
      positions = layoutTree(t).positions;
      highlight = null;
      renderTree();
    }

    function renderTree() {
      var h = treeHeight(tree) * 60 + 30;
      var w = countNodes(tree) * 40 + 80;
      svg.setAttribute('width', Math.max(w, 400));
      svg.setAttribute('height', Math.max(h, 200));
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      /* Generate edges */
      var edges = [];
      (function genEdges(node) {
        if (!node) return;
        var p = positions.get(node);
        if (!p) return;
        if (node.left) {
          var lp = positions.get(node.left);
          if (lp) edges.push({ x1: p.x, y1: p.y, x2: lp.x, y2: lp.y });
          genEdges(node.left);
        }
        if (node.right) {
          var rp = positions.get(node.right);
          if (rp) edges.push({ x1: p.x, y1: p.y, x2: rp.x, y2: rp.y });
          genEdges(node.right);
        }
      })(tree);

      for (var i = 0; i < edges.length; i++) {
        var e = edges[i];
        svg.appendChild(svgEl('line', {
          x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
          stroke: 'oklch(0.68 0.18 195 / 0.25)', 'stroke-width': 1.5
        }));
      }

      /* Nodes */
      if (tree) {
        positions.forEach(function (pos, node) {
          var isHighlighted = node.val === highlight;
          svg.appendChild(svgEl('g',
            svgEl('circle', {
              cx: pos.x, cy: pos.y, r: 16,
              fill: isHighlighted ? 'oklch(0.70 0.18 145 / 0.3)' : 'oklch(0.12 0.012 260)',
              stroke: isHighlighted ? 'oklch(0.70 0.18 145 / 0.7)' : 'oklch(0.68 0.18 195 / 0.4)',
              'stroke-width': 1.5,
              class: isHighlighted ? 'animate-pulse-glow' : ''
            }),
            svgEl('text', {
              x: pos.x, y: pos.y + 3.5,
              'text-anchor': 'middle',
              class: 'text-[10px] font-mono',
              fill: isHighlighted ? '#34d399' : 'oklch(0.92 0.004 260)',
              text: String(node.val)
            })
          ));
        });
      } else {
        svg.appendChild(svgEl('text', {
          x: 200, y: 100, 'text-anchor': 'middle',
          class: 'text-xs font-mono',
          fill: 'oklch(0.55 0.015 260)',
          text: 'Tree is empty — insert nodes to visualize'
        }));
      }

      nodesSpan.textContent = 'Nodes: ' + history.length;
    }

    async function addNode() {
      var v = parseInt(inputVal);
      if (isNaN(v)) return;
      var newHistory = history.concat(v);
      history = newHistory;
      rebuildTree(newHistory);
      highlight = v;
      renderTree();
      await App.sleep(1000);
      highlight = null;
      renderTree();
      inputVal = '';
      input.value = '';
    }

    function reset() {
      var initial = [50, 30, 70, 20, 40, 60, 80, 15, 25, 35, 45, 55, 65, 75, 85];
      history = initial;
      rebuildTree(initial);
    }

    function clear() {
      tree = null;
      positions = new Map();
      history = [];
      renderTree();
    }

    /* ── controls ── */
    var input = App.el('input', {
      type: 'number', class: 't-input', value: inputVal, placeholder: 'Value'
    });
    App.on(input, 'input', function () { inputVal = input.value; });
    App.on(input, 'keydown', function (e) { if (e.key === 'Enter') addNode(); });

    var insertBtn = App.el('button', {
      type: 'button', class: 't-btn-primary', onclick: addNode
    }, App.icon('plus', '', 12), App.el('span', { text: 'Insert' }));

    var resetBtn = App.el('button', {
      type: 'button', class: 't-btn-ghost', onclick: reset
    }, App.icon('rotate-ccw', '', 12), App.el('span', { text: 'Reset' }));

    /* ToolShell's header Clear button has no vanilla equivalent — kept in the toolbar. */
    var clearBtn = App.el('button', {
      type: 'button', class: 't-btn-ghost', onclick: clear
    }, App.icon('trash-2', '', 12), App.el('span', { text: 'Clear' }));

    var nodesSpan = App.el('span', { class: 't-nodes' });

    var toolbar = App.el('div', { class: 'flex items-center gap-2 flex-wrap' },
      App.el('div', { class: 'flex items-center gap-1.5' }, input, insertBtn),
      resetBtn,
      clearBtn,
      nodesSpan
    );

    var svg = svgEl('svg', { style: { display: 'block' } });
    var svgBox = App.el('div', { class: 'rounded border border-border/30 bg-black/20 overflow-auto' }, svg);

    root.appendChild(toolbar);
    root.appendChild(svgBox);

    /* initial build (useEffect on mount) */
    rebuildTree(history);
  }
});
})();
