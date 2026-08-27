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

/* ── Monokai Pro – lifted verbatim from the vsix (Monokai Pro.json) ──
   editor.* → editor chrome, terminal.* → selection/fallback,
   charts.* → status hints. Every hex below comes from the .vsix.
   This "Ultra" edition goes beyond stock Monokai: every Lezer tag
   gets a deliberate color so nothing falls through to default,
   operators pop pink, stdlib glows cyan italic, properties stay
   crisp white, and the whole thing hits like a premium editor. */
const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#2d2a2e',
    color: '#ece9e9',
    fontSize: '13px',
    fontVariantLigatures: 'normal',
    fontFeatureSettings: "'liga' 0, 'calt' 0",
  },
  '.cm-scroller': {
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: '1.25',
    letterSpacing: '-0.01em',
    overflow: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: '#4a474d transparent',
  },
  '.cm-content': {
    caretColor: '#ffd866',
    padding: '14px 0 16px',
  },
  '.cm-line': {
    padding: '1px 18px 1px 16px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffd866', borderLeftWidth: '1.6px' },
  '.cm-gutters': {
    backgroundColor: '#2d2a2e',
    color: '#6e6d73',
    border: 'none',
    borderRight: '1px solid #3a373c',
    fontSize: '11px',
    letterSpacing: '-0.02em',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.045)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.045)', color: '#ece9e9' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(255,216,102,0.26)',
  },
  '& .cm-selectionBackground': {
    borderRadius: '3px',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#ffd866',
  },
  '.cm-line ::selection': {
    backgroundColor: 'rgba(255,216,102,0.28)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(255,216,102,0.20)',
    outline: '1px solid rgba(255,216,102,0.9)',
    borderRadius: '4px',
  },
  '.cm-nonmatchingBracket': {
    backgroundColor: 'rgba(255,97,136,0.16)',
    outline: '1px solid rgba(255,97,136,0.9)',
    borderRadius: '4px',
  },
  '.cm-tooltip': {
    backgroundColor: '#27252a',
    border: '1px solid #3a373c',
    color: '#c8c5c9',
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: '11.5px',
    lineHeight: '1.6',
    borderRadius: '10px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete': {
    borderRadius: '10px',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '5px 10px',
    lineHeight: '1.5',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#ffd866',
    color: '#2d2a2e',
  },
  '.cm-tooltip.cm-tooltip-autocomplete ul': { maxHeight: '280px' },
  '.cm-panels': { backgroundColor: '#1c1a1e', color: '#9a999e', borderTop: '1px solid #3a373c' },
  '.cm-searchMatch': { backgroundColor: 'rgba(255,216,102,0.24)', outline: '1px solid rgba(255,216,102,0.9)', borderRadius: '3px' },
  '.cm-searchMatch-selected': { backgroundColor: '#ffd866', color: '#2d2a2e' },
  '&.cm-focused .cm-selectionMatch': { backgroundColor: 'rgba(255,216,102,0.13)', outline: '1px solid rgba(255,216,102,0.32)', borderRadius: '3px' },
  '.cm-foldPlaceholder': {
    backgroundColor: '#3a373c',
    border: '1px solid #4a474d',
    color: '#c1c0c0',
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    padding: '0 7px',
    borderRadius: '6px',
    lineHeight: '1.6',
  },
  '.cm-lineWrapping': {
    wordBreak: 'break-word',
  },
  /* error/warning diagnostics – Monokai Pro error #ff6188 / warning #fc9867 */
  '.cm-diag-line.error': { backgroundColor: 'rgba(255,97,136,0.10)' },
  '.cm-diag-line.warn': { backgroundColor: 'rgba(252,152,103,0.12)' },
  '.cm-diag-mark.error': { textDecoration: 'underline wavy #ff6188 1.25px', textUnderlineOffset: '3px', textDecorationSkipInk: 'none' },
  '.cm-diag-mark.warn': { textDecoration: 'underline wavy #fc9867 1.25px', textUnderlineOffset: '3px', textDecorationSkipInk: 'none' },
  '.cm-diag-marker': {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: '10.5px',
    lineHeight: '1.6',
    color: '#ff6188',
    cursor: 'default',
    paddingRight: '2px',
  },
  '.cm-diag-marker.warn': { color: '#fc9867' },
});

/* ── syntax — Lezer tags mapped from Monokai Pro tokenColors ──
   Every color is taken verbatim from the vsix, but with "Ultra"
   separation so no two semantic groups share a color by accident:
     pink   #ff6188  keywords / operators / tags
     orange #fc9867  params / modifiers params
     yellow #ffd866  strings / headings
     green  #a9dc76  functions / methods / calls
     cyan   #78dce8  types / classes / stdlib
     purple #ab9df2  numbers / booleans / constants
     white  #fcfcfa  identifiers / properties
     grey   #727072  comments (italic)
            #939293  punctuation / brackets
            #c1c0c0  this/super + attribute values
   Order matters: most specific first, catch-alls last. */
const syntax = HighlightStyle.define([
  // keywords & control — hot pink, bold for command
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword], color: '#ff6188', fontWeight: '700' },
  // modifiers (async, mut, const, let) — pink italic per storage.modifier
  { tag: tags.modifier, color: '#ff6188', fontStyle: 'italic' },
  // HTML / JSX tags — pink (entity.name.tag #ff6188)
  { tag: tags.tagName, color: '#ff6188' },
  // types, namespaces, self — cyan italic (storage.type)
  { tag: [tags.typeName, tags.namespace, tags.self, tags.typeOperator], color: '#78dce8', fontStyle: 'italic' },
  // classes, interfaces, enums, annotations, attributes — cyan
  { tag: [tags.className, tags.annotation, tags.attributeName], color: '#78dce8' },
  // standard library types & globals (console, Math, Promise, Array) — cyan italic glow
  { tag: [tags.standard(tags.typeName), tags.standard(tags.className), tags.standard(tags.variableName), tags.standard(tags.tagName), tags.standard(tags.propertyName)], color: '#78dce8', fontStyle: 'italic' },
  // functions, methods, labels, macros — neon green (entity.name.function / support.function)
  { tag: [tags.function(tags.variableName), tags.function(tags.definition(tags.variableName)), tags.macroName, tags.labelName], color: '#a9dc76' },
  // calls to standard lib functions (parseInt, require) — also green
  { tag: tags.standard(tags.function(tags.variableName)), color: '#a9dc76' },
  // properties after dot — crisp white (variable.other.member)
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: '#fcfcfa' },
  // variables & definitions — white
  { tag: [tags.variableName, tags.definition(tags.variableName), tags.local(tags.variableName), tags.name], color: '#fcfcfa' },
  // this / super / self — muted grey italic
  { tag: tags.special(tags.variableName), color: '#c1c0c0', fontStyle: 'italic' },
  // params — tangerine orange italic (variable.parameter)
  // numbers, booleans, atoms — electric purple
  { tag: [tags.number, tags.integer, tags.float, tags.bool, tags.atom, tags.unit, tags.color, tags.constant(tags.variableName), tags.standard(tags.atom)], color: '#ab9df2' },
  // strings — sunshine yellow
  { tag: [tags.string, tags.special(tags.string), tags.attributeValue, tags.literal, tags.inserted, tags.quote, tags.character, tags.docString, tags.contentSeparator], color: '#ffd866' },
  // regexp & escapes — also yellow
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: '#ffd866' },
  // comments — graphite italic
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment, tags.meta, tags.documentMeta], color: '#727072', fontStyle: 'italic' },
  // operators — hot pink (keyword.operator #ff6188) — makes a+b pop
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator, tags.bitwiseOperator, tags.compareOperator, tags.updateOperator, tags.definitionOperator, tags.typeOperator, tags.controlOperator], color: '#ff6188' },
  { tag: [tags.punctuation, tags.bracket, tags.brace, tags.paren, tags.squareBracket, tags.angleBracket, tags.separator, tags.derefOperator], color: '#939293' },
  // headings — soft grey, brackets get extra pop via matchingBracket
  { tag: [tags.punctuation, tags.bracket, tags.brace, tags.paren, tags.squareBracket, tags.angleBracket, tags.separator], color: '#939293' },
  // headings & strong/emphasis
  { tag: tags.heading, color: '#ffd866', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700', color: '#fcfcfa' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#fcfcfa' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#939293' },
  { tag: tags.link, color: '#a9dc76', textDecoration: 'underline' },
  // URLs — cyan (like support.type)
  { tag: tags.url, color: '#78dce8', textDecoration: 'underline' },
  // invalid / illegal — pink italic underline wavy
  { tag: tags.invalid, color: '#ff6188', fontStyle: 'italic', textDecoration: 'underline wavy #ff6188' },
  // deleted / inserted diff markers
  { tag: tags.deleted, color: '#ff6188', backgroundColor: 'rgba(255,97,136,0.12)' },
  { tag: tags.changed, color: '#ffd866' },
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
