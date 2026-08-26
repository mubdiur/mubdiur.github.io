/* ═══════════════════════════════════════════════════════════
   Tool page — chrome (header/body/footer) + template dispatch.
   Ported from ToolShell.tsx / ToolPageClient.tsx / ToolResolver.tsx.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function renderTool(path) {
  var slug = path.replace(/^\/tools\//, '').replace(/[?#].*$/, '');
  var tool = TOOLS_BY_SLUG[slug];
  var root = App.el('div', { class: 'tool-page' });

  if (!tool) {
    root.appendChild(App.el('div', { class: 'not-found' },
      App.el('span', { class: 'nf-title', text: 'Tool not found' }),
      App.el('span', { class: 'nf-sub', text: 'No tool with slug "' + slug + '"' })));
    return root;
  }

  var shell = App.el('div', { class: 'tool-shell' });

  /* header */
  var header = App.el('div', { class: 'tool-shell-header' },
    App.el('div', { class: 'tool-icon-box' }, App.icon(tool.icon, '', 16)),
    App.el('div', { class: 'min-w-0 flex-1' },
      App.el('div', { class: 'tool-title', text: tool.name }),
      App.el('div', { class: 'tool-desc', text: tool.desc })),
    App.el('a', { class: 'tool-back-link', href: '#/tools', text: '← All Tools' }));
  shell.appendChild(header);

  /* body */
  var body = App.el('div', { class: 'tool-shell-body' });
  shell.appendChild(body);

  /* footer */
  var tags = tool.tags.slice(0, 3).join(' · ') + (tool.tags.length > 3 ? ' · +' + (tool.tags.length - 3) : '');
  var footer = App.el('div', { class: 'tool-shell-footer' },
    App.icon('terminal', '', 14),
    App.el('span', { text: tags }));
  if (tool.wasm) {
    footer.appendChild(App.el('span', { class: 'server-badge wasm-badge' },
      App.icon('cpu', '', 12), App.el('span', { text: 'wasm core' })));
  }
  shell.appendChild(footer);

  root.appendChild(shell);

  /* template dispatch */
  if (tool.template === 'transform') {
    body.appendChild(window.TransformToolUI(tool));
  } else if (tool.template === 'generator') {
    body.appendChild(window.GeneratorToolUI(tool));
  } else if (tool.template === 'custom') {
    body.innerHTML = '';
    var loading = App.el('div', { class: 'loading-block' },
      App.el('span', { class: 'loading-dot', style: 'width:10px;height:10px;border-radius:50%;background:rgba(83,163,249,0.7);display:inline-block;margin:0 2px' }),
      App.el('span', { class: 'loading-dot', style: 'width:10px;height:10px;border-radius:50%;background:rgba(83,163,249,0.7);display:inline-block;margin:0 2px' }),
      App.el('span', { class: 'loading-dot', style: 'width:10px;height:10px;border-radius:50%;background:rgba(83,163,249,0.7);display:inline-block;margin:0 2px' }));
    body.appendChild(loading);
    var t = App.tools[slug];
    if (t) {
      mountCustom();
    } else {
      App.loadToolScript(slug).then(function () {
        if (!App.tools[slug]) { body.innerHTML = ''; body.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">Custom tool not registered: ' + App.esc(slug) + '</span>' })); return; }
        mountCustom();
      }).catch(function (err) {
        body.innerHTML = '';
        body.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">' + App.esc(err.message) + '</span>' }));
      });
    }
    function mountCustom() {
      body.innerHTML = '';
      var inner = App.el('div', { class: 't-' + slug + ' fade-in' });
      body.appendChild(inner);
      var def = App.tools[slug];
      if (def.css && !document.getElementById('toolcss-' + slug)) {
        var st = document.createElement('style');
        st.id = 'toolcss-' + slug;
        st.textContent = def.css;
        document.head.appendChild(st);
      }
      try {
        var ret = def.mount(inner, tool);
        if (ret && typeof ret.then === 'function') {
          ret.catch(function (err) {
            if (body.contains(inner)) {
              body.innerHTML = '';
              body.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">' + App.esc((err && (err.stack || err.message)) || String(err)) + '</span>' }));
            }
          });
        }
      } catch (err) {
        body.innerHTML = '';
        body.appendChild(App.el('div', { class: 'not-found', html: '<span class="nf-sub">' + App.esc(err && err.message || String(err)) + '</span>' }));
      }
    }
  }

  return root;
}

App.registerPage('/tools/:slug', renderTool);
})();
