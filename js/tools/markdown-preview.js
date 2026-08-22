/* ═══════════════════════════════════════════════════════════
   Markdown Preview — CUSTOM TOOL.
   Ported from src/components/tools/markdown-preview.tsx.
   Split-pane Markdown editor with a live-rendered preview pane.
   mdToHtml() is ported VERBATIM from the TSX (pure string replaces).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* Verbatim from the TSX — self-contained pure-JS Markdown parser. */
function mdToHtml(md) {
  var html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-black/40 rounded p-2 overflow-auto text-xs leading-relaxed"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded text-cyan-glow/80 text-xs">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold font-mono mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold font-mono mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold font-mono mt-4 mb-2">$1</h1>')
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-glow/80 underline underline-offset-2 hover:text-cyan-glow">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded border border-border/30 my-2" />')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-border/30 my-3" />')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-cyan-glow/30 pl-3 text-muted-foreground/70 italic text-xs my-2">$1</blockquote>')
    // Unordered list
    .replace(/^- (.+)$/gm, '<li class="text-xs ml-4 list-disc text-foreground/80">$1</li>')
    // Ordered list
    .replace(/^\d+\. (.+)$/gm, '<li class="text-xs ml-4 list-decimal text-foreground/80">$1</li>')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, '</p><p class="text-xs leading-relaxed my-2">')
    // Single newline to space
    .replace(/\n/g, ' ')
    .replace(/<li>/g, '<ul class="my-1"><li>')
    .replace(/<\/li>(?!<li)/g, '</li></ul>');

  return '<p class="text-xs leading-relaxed my-2">' + html + '</p>';
}

App.registerTool('markdown-preview', {
  css: '' +
    '.t-markdown-preview{display:flex;flex-direction:column;flex:1;min-height:0;}\n' +
    '.t-markdown-preview .md-grid{display:grid;grid-template-columns:1fr;gap:0.75rem;flex:1;min-height:0;}\n' +
    '@media(min-width:1024px){.t-markdown-preview .md-grid{grid-template-columns:1fr 1fr;}}\n' +
    '.t-markdown-preview .md-col{display:flex;flex-direction:column;min-height:0;}\n' +
    '.t-markdown-preview .md-label{font-size:10px;font-family:var(--font-mono);color:rgba(166,173,200,0.6);margin-bottom:0.25rem;}\n' +
    '.t-markdown-preview .md-input{flex:1;width:100%;min-height:200px;border:1px solid rgba(49,50,68,0.4);background:rgba(0,0,0,0.3);padding:0.5rem 0.75rem;font-size:12px;font-family:var(--font-mono);color:rgba(205,214,244,0.9);resize:none;border-radius:var(--radius);outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-markdown-preview .md-input::placeholder{color:rgba(166,173,200,0.3);}\n' +
    '.t-markdown-preview .md-input:focus{border-color:rgba(148,226,213,0.4);box-shadow:0 0 0 1px rgba(148,226,213,0.3);}\n' +
    '.t-markdown-preview .md-preview{flex:1;min-height:200px;border:1px solid rgba(49,50,68,0.4);background:rgba(0,0,0,0.2);padding:0.5rem 0.75rem;overflow:auto;border-radius:var(--radius);}\n' +
    /* rendered-markdown typography (mirrors the TSX preview pane's [&_...] variant rules) */
    '.t-markdown-preview .md-preview h1{font-size:18px;font-weight:700;font-family:var(--font-mono);margin:0.75rem 0 0.5rem;}\n' +
    '.t-markdown-preview .md-preview h2{font-size:16px;font-weight:700;font-family:var(--font-mono);margin:0.75rem 0 0.25rem;}\n' +
    '.t-markdown-preview .md-preview h3{font-size:14px;font-weight:700;font-family:var(--font-mono);margin:0.5rem 0 0.25rem;}\n' +
    '.t-markdown-preview .md-preview p{font-size:12px;line-height:1.625;margin:0.375rem 0;}\n' +
    '.t-markdown-preview .md-preview code{background:rgba(0,0,0,0.3);padding:0 0.25rem;border-radius:var(--radius);color:rgba(148,226,213,0.8);font-size:12px;font-family:var(--font-mono);}\n' +
    '.t-markdown-preview .md-preview pre{background:rgba(0,0,0,0.4);padding:0.5rem;border-radius:var(--radius);overflow:auto;font-family:var(--font-mono);}\n' +
    '.t-markdown-preview .md-preview pre code{background:transparent;padding:0;}\n' +
    '.t-markdown-preview .md-preview a{color:rgba(148,226,213,0.8);text-decoration:underline;text-underline-offset:2px;}\n' +
    '.t-markdown-preview .md-preview a:hover{color:var(--cyan-glow);}\n' +
    '.t-markdown-preview .md-preview img{max-width:100%;border-radius:var(--radius);border:1px solid rgba(49,50,68,0.3);margin:0.5rem 0;}\n' +
    '.t-markdown-preview .md-preview blockquote{border-left:2px solid rgba(148,226,213,0.3);padding-left:0.75rem;color:rgba(166,173,200,0.7);font-style:italic;font-size:12px;margin:0.5rem 0;}\n' +
    '.t-markdown-preview .md-preview ul{margin:0.25rem 0;list-style:none;}\n' +
    '.t-markdown-preview .md-preview li{font-size:12px;margin-left:1rem;color:rgba(205,214,244,0.8);}\n' +
    '.t-markdown-preview .md-preview li.list-disc{list-style-type:disc;}\n' +
    '.t-markdown-preview .md-preview li.list-decimal{list-style-type:decimal;}\n' +
    '.t-markdown-preview .md-preview li:not([class]){list-style-type:disc;}\n' +
    '.t-markdown-preview .md-preview hr{border:none;border-top:1px solid rgba(49,50,68,0.3);margin:0.75rem 0;}\n' +
    '.t-markdown-preview .md-preview .text-red-400{color:#f87171;}\n' +
    '.t-markdown-preview .md-preview .text-muted-foreground\\/30{color:rgba(166,173,200,0.3);}\n',

  mount: function (root) {
    var textarea = App.el('textarea', {
      class: 'md-input', spellcheck: 'false',
      placeholder: '# Hello World\n\nThis is **markdown** with `inline code`'
    });

    var preview = App.el('div', { class: 'md-preview',
      html: '<span class="text-muted-foreground/30 text-xs">Preview will appear here</span>' });

    function handleChange(value) {
      if (value.trim()) {
        try { preview.innerHTML = mdToHtml(value); }
        catch (e) { preview.innerHTML = '<p class="text-xs text-red-400">Error rendering markdown</p>'; }
      } else {
        preview.innerHTML = '<span class="text-muted-foreground/30 text-xs">Preview will appear here</span>';
      }
    }

    textarea.addEventListener('input', function () { handleChange(textarea.value); });

    root.appendChild(App.el('div', { class: 'md-grid' },
      App.el('div', { class: 'md-col' },
        App.el('span', { class: 'md-label', text: 'Markdown' }),
        textarea),
      App.el('div', { class: 'md-col' },
        App.el('span', { class: 'md-label', text: 'Preview' }),
        preview)));
  }
});
})();
