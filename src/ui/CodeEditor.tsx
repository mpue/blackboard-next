// The text editor of the code panel (CodeMirror 6): C/C++ highlighting,
// completion and parameter help (codeIntel.ts), the compiler's messages
// underlined in the text. Each file keeps its own undo history while the panel
// is open.

import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { cpp } from '@codemirror/lang-cpp';
import { tags } from '@lezer/highlight';
import type { Diagnostic, SourceFile } from '../mcu/sketch.ts';
import { codeIntel, type FilesOf } from './codeIntel.ts';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'var(--bb-panel)', color: 'var(--bb-text)' },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--bb-accent)' },
  '.cm-gutters': { backgroundColor: 'var(--bb-panel-2)', color: 'var(--bb-muted)', borderRight: '1px solid var(--bb-border)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bb-accent) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bb-hover)', color: 'var(--bb-text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--bb-accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--bb-accent) 24%, transparent) !important',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--bb-accent) 12%, transparent)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--bb-accent) 20%, transparent)', outline: 'none' },
  '.cm-tooltip': { backgroundColor: 'var(--bb-panel)', border: '1px solid var(--bb-border)', color: 'var(--bb-text)', borderRadius: '6px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--bb-accent)', color: 'white' },
  '.cm-completionDetail': { color: 'var(--bb-muted)', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': { color: 'inherit' },
  '.cm-panels': { backgroundColor: 'var(--bb-panel-2)', color: 'var(--bb-text)', borderColor: 'var(--bb-border)' },
  '.cm-panel input, .cm-panel button': { fontSize: '12px' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, #f59e0b 30%, transparent)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--bb-hover)', border: 'none', color: 'var(--bb-muted)' },
  '.cm-diagnostic': { fontSize: '12px', padding: '4px 8px' },
  '.cm-tooltip.cm-completionInfo': { padding: '6px 9px', maxWidth: '340px' },
  '.cm-tooltip-hover .cm-bb-info': { padding: '6px 9px', maxWidth: '420px' },
  '.cm-bb-info, .cm-bb-signature': { fontSize: '12px', lineHeight: '1.45' },
  '.cm-bb-info code, .cm-bb-signature code': { display: 'block', fontFamily: MONO, fontSize: '11.5px', color: 'var(--code-function)', whiteSpace: 'pre-wrap' },
  '.cm-bb-info div, .cm-bb-signature div': { marginTop: '3px' },
  '.cm-bb-signature': { padding: '4px 9px', maxWidth: '520px' },
  '.cm-bb-signature b': { color: 'var(--bb-text)', backgroundColor: 'color-mix(in srgb, var(--bb-accent) 22%, transparent)', borderRadius: '3px', padding: '0 2px' },
  '.cm-bb-signature .cm-bb-more': { fontSize: '11px', color: 'var(--bb-muted)' },
});

// colours in index.css (--code-*), so they follow the light and dark theme
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier, tags.definitionKeyword, tags.moduleKeyword], color: 'var(--code-keyword)' },
  { tag: [tags.typeName, tags.standard(tags.typeName), tags.className, tags.namespace], color: 'var(--code-type)' },
  { tag: [tags.string, tags.character, tags.special(tags.string), tags.escape], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--code-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.macroName], color: 'var(--code-macro)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function)' },
  { tag: tags.invalid, color: '#ef4444' },
]);

export interface EditorCommands {
  verify: () => void;
  upload: () => void;
  save: () => void;
}

function extensions(lang: boolean, files: FilesOf, onChange: (text: string) => void, commands: () => EditorCommands): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    lintGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    ...codeIntel(files),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      // like "verify" and "upload" in the Arduino IDE; Ctrl+S saves the schematic
      { key: 'Mod-b', run: () => (commands().verify(), true) },
      { key: 'Mod-r', run: () => (commands().verify(), true) },
      { key: 'Mod-Enter', run: () => (commands().upload(), true) },
      { key: 'Mod-u', run: () => (commands().upload(), true) },
      { key: 'Mod-s', run: () => (commands().save(), true) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    theme,
    ...(lang ? [cpp()] : []),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString());
    }),
    EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
  ];
}

/** where the editor should put the cursor (a click on a message); `n` makes the same place count again */
export interface JumpTarget {
  file: string;
  line: number;
  column: number;
  n: number;
}

export function CodeEditor({
  files,
  active,
  diagnostics,
  jump,
  label,
  onChange,
  commands,
}: {
  files: SourceFile[];
  active: string;
  diagnostics: Diagnostic[];
  jump?: JumpTarget;
  label: string;
  onChange: (name: string, content: string) => void;
  commands: EditorCommands;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** editor state per file name, so every file keeps its undo history */
  const states = useRef(new Map<string, EditorState>());
  const shown = useRef<string>('');
  const latest = useRef({ onChange, commands, files });
  latest.current = { onChange, commands, files };

  const stateFor = (name: string, content: string) => {
    let s = states.current.get(name);
    if (!s) {
      s = EditorState.create({
        doc: content,
        extensions: extensions(
          !name.endsWith('.S'),
          (state) => latest.current.files.map((f) => (f.name === name ? { name, content: state.doc.toString() } : f)),
          (text) => latest.current.onChange(name, text),
          () => latest.current.commands,
        ),
      });
      states.current.set(name, s);
    }
    return s;
  };

  // the view itself, once
  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => {
      if (shown.current) states.current.set(shown.current, v.state);
      shown.current = '';
      v.destroy();
      view.current = null;
    };
  }, []);

  // switching files, and text that changed from outside (undo in the schematic, a template)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    for (const name of [...states.current.keys()]) if (!files.some((f) => f.name === name)) states.current.delete(name);
    const file = files.find((f) => f.name === active) ?? files[0];
    if (!file) return;
    if (shown.current !== file.name) {
      if (shown.current && files.some((f) => f.name === shown.current)) states.current.set(shown.current, v.state);
      v.setState(stateFor(file.name, file.content));
      shown.current = file.name;
    } else if (v.state.doc.toString() !== file.content) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: file.content } });
    }
    for (const f of files) {
      const s = states.current.get(f.name);
      if (f.name !== file.name && s && s.doc.toString() !== f.content) states.current.delete(f.name);
    }
    v.contentDOM.setAttribute('aria-label', label);
  }, [files, active, label]);

  // the compiler's messages for the file on screen (CodeMirror moves them along while typing)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const marks: CmDiagnostic[] = diagnostics
      .filter((d) => d.own && d.file === shown.current && d.severity !== 'note')
      .map((d) => {
        const line = doc.line(Math.min(Math.max(d.line, 1), doc.lines));
        const from = Math.min(line.from + Math.max(d.column - 1, 0), line.to);
        const word = /^[\w]+/.exec(doc.sliceString(from, line.to))?.[0].length ?? 0;
        return { from, to: Math.min(from + Math.max(word, 1), line.to), severity: d.severity === 'error' ? 'error' : 'warning', message: d.message };
      });
    v.dispatch(setDiagnostics(v.state, marks));
  }, [diagnostics, active]);

  // a click on a message
  useEffect(() => {
    const v = view.current;
    if (!v || !jump || jump.file !== shown.current) return;
    const doc = v.state.doc;
    const line = doc.line(Math.min(Math.max(jump.line, 1), doc.lines));
    const pos = Math.min(line.from + Math.max(jump.column - 1, 0), line.to);
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    v.focus();
  }, [jump, active]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
