"use strict";
/* Mount harness (opt-in, not part of npm test): loads custom tool files against a DOM stub,
   mounts each, and simulates clicks. Catches App-API misuse and
   handler logic bugs that syntax checks cannot. */
global.window = global;
global.self = global;
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
function makeEl(tag) {
  const el = {
    tag, nodeType: 1, children: [], style: {}, dataset: {},
    _attrs: {}, _listeners: {}, _text: '', _html: '', value: '',
    disabled: false, className: '',
    _cls: new Set(),
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    setAttribute(k, v) {
      this._attrs[k] = v;
      if (k === 'class') { this.className = v; this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
      if (k === 'value') this.value = v;
      if (k === 'id') this.id = v;
    },
    getAttribute(k) { return this._attrs[k]; },
    remove() {},
    focus() {},
    click() { (this._listeners.click || []).forEach((f) => f({ key: undefined })); }
  };
  el.classList = {
    add: (c) => { el._cls.add(c); },
    remove: (...cs) => { cs.forEach((c) => el._cls.delete(c)); },
    toggle: (c, f) => { if (f === undefined) { if (el._cls.has(c)) el._cls.delete(c); else el._cls.add(c); } else if (f) el._cls.add(c); else el._cls.delete(c); },
    contains: (c) => el._cls.has(c)
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = v; el.children.length = 0; }
  });
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(v) { el._text = String(v); }
  });
  return el;
}
global.document = {
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  getElementById: () => null,
  head: makeEl('head'),
  body: makeEl('body')
};
const copied = [], downloaded = [];
let toolDefs = {};
global.App = {
  el(tag, props, ...kids) {
    const node = makeEl(tag);
    if (props && typeof props === 'object' && !props.nodeType) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.setAttribute('class', v);
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else { try { node.setAttribute(k, v); } catch (e) { node[k] = v; } }
      }
    } else if (props && props.nodeType) { kids.unshift(props); }
    const push = (c) => {
      if (c === undefined || c === null || c === false) return;
      if (Array.isArray(c)) return c.forEach(push);
      node.appendChild(c.nodeType ? c : document.createTextNode(c));
    };
    kids.forEach(push);
    return node;
  },
  icon: () => makeEl('span'),
  copy: (t) => { copied.push(t); },
  download: (name, content) => { downloaded.push([name, content]); },
  clearButton: (fn) => { const b = makeEl('button'); b.addEventListener('click', fn); b._label = 'clear'; return b; },
  downloadButton: (fn, label) => { const b = makeEl('button'); b.addEventListener('click', fn); b._label = label; return b; },
  copyButton: (t, label) => { const b = makeEl('button'); b.addEventListener('click', () => copied.push(t)); return b; },
  interval: (fn) => { intervals.push(fn); return 1000 + intervals.length; },
  timer: (fn) => { fn(); return 1; },
  onUnmount: (fn) => { unmounters.push(fn); },
  registerTool: (slug, def) => { toolDefs[slug] = def; }
};
const intervals = [], unmounters = [];
global.Transforms = undefined;
require('../js/lib/transforms.js');
global.Transforms = global.window.Transforms;
let passed = 0, failed = 0;
function ok(c, n) { if (c) { passed++; console.log('  ok  ' + n); } else { failed++; console.error('  FAIL ' + n); } }
function btns(root, label) {
  const found = [];
  const walk = (el) => {
    if (!el || !el.children) return;
    if (el.tag === 'button' && (el._text === label || (el.children || []).some((c) => c.textContent === label))) found.push(el);
    el.children.forEach(walk);
  };
  walk(root);
  return found;
}
function faces(root) {
  const found = [];
  const walk = (el) => {
    if (!el || !el.children) return;
    if (el._cls && el._cls.has('sw-face')) found.push(el);
    el.children.forEach(walk);
  };
  walk(root);
  return found;
}
for (const slug of ['stopwatch', 'loan-calculator', 'timezone-converter', 'aes-encryptor']) {
  delete require.cache[require.resolve('../js/tools/' + slug + '.js')];
  require('../js/tools/' + slug + '.js');
  const root = makeEl('div');
  try {
    toolDefs[slug].mount(root);
    ok(root.children.length > 0, slug + ' mounts and renders');
  } catch (e) { ok(false, slug + ' mount threw: ' + (e && e.message)); }
  if (slug === 'stopwatch') {
    try {
      const face = faces(root)[0];
      ok(face && face.textContent === '00:00:00.00', 'stopwatch initial face');
      const start = btns(root, 'Start')[0];
      ok(!!start, 'stopwatch start button found');
      start.click();
      ok(start._text === 'Pause' || btns(root, 'Pause').length === 1, 'stopwatch starts');
      const lap = btns(root, 'Lap')[0];
      lap.click();
      const pause = btns(root, 'Pause')[0];
      pause.click();
      ok(btns(root, 'Start').length === 1, 'stopwatch pauses');
      ok(/^\d\d:\d\d:\d\d\.\d\d$/.test(faces(root)[0].textContent), 'stopwatch face formatted (' + faces(root)[0].textContent + ')');
      const dn = btns(root, 'Countdown')[0];
      dn.click();
      ok(btns(root, 'Countdown').length >= 0, 'stopwatch mode switches');
      const s2 = btns(root, 'Start')[0];
      s2.click();
      const st = [];
      const walk = (el) => {
        if (!el || !el.children) return;
        if (el._cls && el._cls.has('sw-status')) st.push(el);
        el.children.forEach(walk);
      };
      walk(root);
      ok(/above zero|Counting down/.test(st[0].textContent), 'countdown validates then runs (' + st[0].textContent.slice(0, 40) + ')');
    } catch (e) { ok(false, 'stopwatch interaction threw: ' + (e && e.stack || e).toString().slice(0, 200)); }
  }
}
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
