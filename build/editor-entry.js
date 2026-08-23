/* CodeMirror 6 editor bundle for the in-browser IDE — built locally with
   esbuild and vendored as a single ESM file (no CDN at runtime).
   Exposes createIdeEditor(parent, { value, language, onRun, onState }) -> handle.
   The handle also carries setDiagnostics(diags) / clearDiagnostics() for
   in-editor error/warning marking (gutter marker + line tint + wavy span). */
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, gutter, GutterMarker, Decoration } from '@codemirror/view';
import { EditorState, Compartment, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { StreamLanguage } from '@codemirror/language';
import { clike } from '@codemirror/legacy-modes/mode/clike';
import { go } from '@codemirror/legacy-modes/mode/go';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/* ── diagnostics (error/warning marking) ── */

const setDiagnostics = StateEffect.define();

const diagnosticsField = StateField.define({
  create() { return Decoration.none; },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setDiagnostics)) deco = e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

class DiagMarker extends GutterMarker {
  constructor(severity) { super(); this.severity = severity; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-diag-marker ' + this.severity;
    span.textContent = this.severity === 'error' ? '✕' : '⚠';
    span.title = this.severity === 'error' ? 'error' : 'warning';
    return span;
  }
}

function diagGutter() {
  return gutter({
    class: 'cm-diag-gutter',
    markers: (view) => {
      const deco = view.state.field(diagnosticsField);
      const builder = new RangeSetBuilder();
      deco.between(0, view.state.doc.length, (from, to, d) => {
        if (!d.spec.diagLine) return;
        const line = view.state.doc.lineAt(from);
        builder.add(line.from, line.from, new DiagMarker(d.spec.diagSeverity));
      });
      return builder.finish();
    },
  });
}

/* diags: [{ line, col, endLine, endCol, severity: 'error'|'warning', message }]
   line/col are 1-based; positions are clamped to the current document. */
function buildDiagDecos(view, diags) {
  const decos = [];
  const doc = view.state.doc;
  for (const d of diags || []) {
    const severity = (d.severity === 'warning' || d.severity === 'warn') ? 'warn' : 'error';
    const lineNo = Math.max(1, Math.min(doc.lines, Math.round(d.line || 1)));
    const line = doc.line(lineNo);
    const lineDeco = Decoration.line({
      class: 'cm-diag-line ' + severity,
      diagLine: true,
      diagSeverity: severity,
    }).range(line.from);
    if (d.endLine && d.endLine >= (d.line || 1) && lineNo < doc.lines) {
      const from = line.from + Math.max(0, Math.min(line.length, Math.round((d.col || 1)) - 1));
      const endLineNo = Math.max(lineNo, Math.min(doc.lines, Math.round(d.endLine)));
      const to = doc.line(endLineNo).to;
      if (to > from) decos.push(Decoration.mark({ class: 'cm-diag-mark ' + severity }).range(from, to));
      decos.push(lineDeco);
    } else if (d.endLine && d.endLine >= (d.line || 1)) {
      const from = line.from + Math.max(0, Math.min(line.length, Math.round((d.col || 1)) - 1));
      const to = line.to;
      if (to > from) decos.push(Decoration.mark({ class: 'cm-diag-mark ' + severity }).range(from, to));
      decos.push(lineDeco);
    } else {
      decos.push(lineDeco);
    }
  }
  return Decoration.set(decos, true);
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#0a0b10',
    color: '#d8dee9',
    fontSize: '12.5px',
  },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: '1.55',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: '#c2dcd4',
    padding: '10px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c2dcd4' },
  '.cm-gutters': {
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: '#565869',
    border: 'none',
    borderRight: '1px solid rgba(30,32,41,0.6)',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(194,220,212,0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(194,220,212,0.06)', color: '#8a93a5' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(200,212,228,0.18)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(194,220,212,0.18)',
    outline: '1px solid rgba(194,220,212,0.4)',
  },
  '.cm-tooltip': {
    backgroundColor: '#1e2029',
    border: '1px solid #2b2e3a',
    color: '#e9e9ec',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11.5px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'rgba(194,220,212,0.15)',
    color: '#c2dcd4',
  },
  '.cm-tooltip.cm-tooltip-autocomplete ul': { maxHeight: '240px' },
  '.cm-panels': { backgroundColor: '#13141c', color: '#aaaab3' },
  '.cm-searchMatch': { backgroundColor: 'rgba(220,211,189,0.2)', outline: '1px solid rgba(220,211,189,0.35)' },
  '.cm-searchMatch-selected': { backgroundColor: 'rgba(220,211,189,0.4)' },
  '&.cm-focused .cm-selectionMatch': { backgroundColor: 'rgba(194,220,212,0.12)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(30,32,41,0.9)',
    border: '1px solid #2b2e3a',
    color: '#aaaab3',
    fontFamily: "'JetBrains Mono', monospace",
  },
  /* error/warning diagnostics */
  '.cm-diag-line.error': { backgroundColor: 'rgba(228,205,212,0.08)' },
  '.cm-diag-line.warn': { backgroundColor: 'rgba(220,211,189,0.07)' },
  '.cm-diag-mark.error': { textDecoration: 'underline wavy rgba(228,205,212,0.7)', textDecorationSkipInk: 'none' },
  '.cm-diag-mark.warn': { textDecoration: 'underline wavy rgba(220,211,189,0.7)', textDecorationSkipInk: 'none' },
  '.cm-diag-marker': {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    lineHeight: '1.5',
    color: 'rgba(228,205,212,0.95)',
    cursor: 'default',
  },
  '.cm-diag-marker.warn': { color: 'rgba(220,211,189,0.95)' },
});

const syntax = HighlightStyle.define([
  { tag: tags.keyword, color: '#e2cfda' },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: '#c8d4e4' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#c8d4e4' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#dcd3bd' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#e9e9ec' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#cfcbe0' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: '#c5dae2' },
  { tag: [tags.meta, tags.comment], color: '#7e7f89' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#e2cfda' },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], color: '#dcd3bd' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#c0d9c8' },
  { tag: tags.invalid, color: '#e4cdd4' },
]);

function langFor(id) {
  switch (id) {
    case 'js': return javascript();
    case 'py': return python();
    case 'c':
    case 'cpp': return cpp();
    case 'cs': return StreamLanguage.define(clike({ name: 'text/x-csharp' }));
    case 'java': return java();
    case 'go': return StreamLanguage.define(go);
    case 'rs': return rust();
    default: return [];
  }
}

export function createIdeEditor(parent, opts) {
  opts = opts || {};
  const langCompartment = new Compartment();
  const runKeymap = [
    {
      key: 'Ctrl-Enter',
      mac: 'Cmd-Enter',
      run: () => { if (opts.onRun) opts.onRun(); return true; },
    },
  ];

  const state = EditorState.create({
    doc: opts.value || '',
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      foldGutter(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ activateOnTyping: true }),
      highlightSelectionMatches(),
      langCompartment.of(langFor(opts.language || 'js')),
      diagnosticsField,
      diagGutter(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab, ...runKeymap]),
      baseTheme,
      syntaxHighlighting(syntax),
      EditorView.lineWrapping,
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    setLanguage(id) {
      view.dispatch({ effects: langCompartment.reconfigure(langFor(id)) });
    },
    getValue() {
      return view.state.doc.toString();
    },
    setValue(v) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
    },
    setDiagnostics(diags) {
      view.dispatch({ effects: setDiagnostics.of(buildDiagDecos(view, diags || [])) });
    },
    clearDiagnostics() {
      view.dispatch({ effects: setDiagnostics.of(Decoration.none) });
    },
    focus() { view.focus(); },
    destroy() { view.destroy(); },
  };
}
