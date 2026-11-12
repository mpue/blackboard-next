// The conversation with Claude in the editor. The history for the API is only
// ever appended to and sent back exactly as it came (the thinking blocks of
// earlier turns stay valid only that way); next to it are the entries the
// panel shows. One answer may take many rounds: Claude calls tools, they run
// on the schematic here, their results go back, until Claude is done. All
// changes of one answer undo as one step.

import { create } from 'zustand';
import type { Doc } from '../model/types.ts';
import { RASTER, isSchematicDoc } from '../model/types.ts';
import { activeDoc, commitDoc, createDoc, joinHistory, openDoc, refit, setActive, undo, useStore } from '../store/store.ts';
import { editableLayer } from '../editor/placement.ts';
import { simulate } from '../spice/simulator.ts';
import { globalNetKey } from '../spice/labels.ts';
import { allSymbols, tightenDoc, ToolError } from './circuit.ts';
import { runTool, toolSubject, type Bench } from './tools.ts';
import { AssistantError, streamAnswer, type AssistantInfo, type ModelChoice } from './api.ts';

export type Block = { type: string; [k: string]: unknown };
export type Message = { role: 'user' | 'assistant'; content: Block[] };

export type Entry =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'text'; text: string }
  /** Claude's short progress notes between tool calls */
  | { id: number; kind: 'note'; text: string }
  | { id: number; kind: 'tool'; name: string; subject: string; state: 'running' | 'ok' | 'error'; detail?: string }
  | { id: number; kind: 'error'; error: string; message?: string };

interface AssistantState {
  open: boolean;
  /** access and key of the account; undefined while asking */
  info?: AssistantInfo | 'login' | 'none';
  /** show the key form even though there is a key (to change it, or after it was refused) */
  keyForm: boolean;
  model: ModelChoice;
  messages: Message[];
  entries: Entry[];
  running: boolean;
  /** the last answer stopped on an error and can be sent again */
  canRetry: boolean;
  usage: { input: number; output: number };
  /** the document the last answer changed and how it was afterwards, for "undo" */
  changed: { docId: string; doc: Doc } | null;
}

const KEY = 'blackboard.assistant.v1';

function loadModel(): ModelChoice {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { model?: ModelChoice }).model === 'sonnet' ? 'sonnet' : 'opus';
  } catch {
    return 'opus';
  }
}

export const useAssistant = create<AssistantState>()(() => ({
  open: false,
  keyForm: false,
  model: loadModel(),
  messages: [],
  entries: [],
  running: false,
  canRetry: false,
  usage: { input: 0, output: 0 },
  changed: null,
}));

const set = useAssistant.setState;
const get = useAssistant.getState;

let seq = 0;
const nextId = () => ++seq;

export const setAssistantOpen = (open: boolean) => set({ open });
export const setInfo = (info: AssistantState['info']) => set({ info, ...(info && typeof info === 'object' && info.key ? {} : { keyForm: false }) });
export const showKeyForm = (keyForm: boolean) => set({ keyForm });

/** The model of a new conversation (a running one keeps its model: the thinking of a model is only valid for that model). */
export function setModel(model: ModelChoice) {
  if (get().messages.length) return;
  set({ model });
  try {
    localStorage.setItem(KEY, JSON.stringify({ model }));
  } catch {
    /* storage unavailable */
  }
}

export function newConversation() {
  stop();
  set({ messages: [], entries: [], canRetry: false, usage: { input: 0, output: 0 }, changed: null });
}

const push = (e: Entry) => set((s) => ({ entries: [...s.entries, e] }));
const patch = (id: number, p: Partial<Entry>) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? ({ ...e, ...p } as Entry) : e)) }));
const append = (id: number, text: string) => set((s) => ({ entries: s.entries.map((e) => (e.id === id && 'text' in e ? { ...e, text: e.text + text } : e)) }));

/** A line about the editor before each request of the user: which document Claude would work on. */
function editorContext(): string {
  const ds = activeDoc();
  if (!ds) return 'No document is open in the editor.';
  const d = ds.doc;
  if (d.type !== 'SCHEMATICS' && !isSchematicDoc(d)) return `The open document "${ds.fileName}" is a ${d.type === 'PCB' ? 'printed circuit board' : 'breadboard layout'}, not a schematic.`;
  const parts = d.items.filter((i) => i.kind === 'symbol' && i.pins.length > 0 && !globalNetKey(i)).length;
  return d.items.length ? `The open schematic "${ds.fileName}" has ${parts} parts.` : `The open schematic "${ds.fileName}" is empty.`;
}

// ---- running an answer ------------------------------------------------------------------------

/** rounds of tool calls per answer before Claude has to ask whether to go on */
const MAX_ROUNDS = 40;

let abort: AbortController | null = null;

export function stop() {
  abort?.abort();
}

/** The tools work on the schematic that was open when the question was asked (or the one Claude opened). */
function editorBench(target: { docId?: string }, before: Map<string, Doc>, opened: Set<string>): Bench {
  const ds = () => useStore.getState().docs.find((d) => d.id === target.docId);
  let symbols: { from: unknown; all: ReturnType<typeof allSymbols> } | undefined;
  return {
    doc: () => ds()?.doc,
    fileName: () => ds()?.fileName ?? '',
    edit(fn) {
      const cur = ds();
      if (!cur) throw new ToolError('The schematic was closed in the editor.');
      if (!before.has(cur.id)) before.set(cur.id, cur.doc);
      commitDoc(cur.id, (d) => {
        fn(d as Doc);
      });
    },
    layer() {
      const cur = ds()!;
      return editableLayer(cur.doc, cur.currentLayer) ?? cur.doc.layers[0].id;
    },
    symbols() {
      const lib = useStore.getState().library;
      if (symbols?.from !== lib) symbols = { from: lib, all: allSymbols(lib.symbols, lib.userSymbols) };
      return symbols.all;
    },
    models: () => useStore.getState().library.models,
    newSchematic(name) {
      const doc = createDoc('SCHEMATICS', 65 * RASTER, 41 * RASTER);
      const base = name ?? 'schaltplan-claude';
      const n = useStore.getState().docs.filter((d) => d.fileName.startsWith(base)).length;
      target.docId = openDoc(doc, `${base}${n ? n + 1 : ''}.bb`, undefined, false);
      before.set(target.docId, doc);
      opened.add(target.docId);
    },
    simulate: (netlist, timeoutMs) => simulate(netlist, timeoutMs).then((r) => r.result.data.map((d) => ({ name: d.name, values: (d.values as number[]).map(Number) }))),
  };
}

/** One request: streams the answer into the panel and returns it. */
async function request(signal: AbortSignal) {
  const { model, messages } = get();
  /** content block index -> panel entry */
  const blocks = new Map<number, number>();
  for await (const ev of streamAnswer(model, messages, signal)) {
    if (ev.t === 'text' || ev.t === 'note') {
      if (ev.t === 'note' && !ev.d.trim() && !blocks.has(ev.i)) continue;
      let id = blocks.get(ev.i);
      if (id === undefined) {
        id = nextId();
        blocks.set(ev.i, id);
        push({ id, kind: ev.t, text: '' });
      }
      append(id, ev.d);
    } else if (ev.t === 'done') {
      return ev;
    } else if (ev.t === 'error') {
      throw new AssistantError(ev.error, ev.message);
    }
  }
  throw new AssistantError('network');
}

async function run() {
  const ctrl = new AbortController();
  abort = ctrl;
  set({ running: true, canRetry: false, changed: null });
  const start = activeDoc();
  const target: { docId?: string } = { docId: start && (start.doc.type === 'SCHEMATICS' || isSchematicDoc(start.doc)) ? start.id : undefined };
  const before = new Map<string, Doc>();
  const opened = new Set<string>();
  const bench = editorBench(target, before, opened);
  try {
    for (let round = 0; ; round++) {
      if (round >= MAX_ROUNDS) {
        push({ id: nextId(), kind: 'error', error: 'rounds' });
        break;
      }
      const res = await request(ctrl.signal);
      set((s) => ({ usage: { input: s.usage.input + res.usage.input, output: s.usage.output + res.usage.output } }));
      // a declined answer stays out of the history
      if (res.stop === 'refusal') {
        push({ id: nextId(), kind: 'error', error: 'refusal' });
        break;
      }
      const message = res.message as Message;
      set((s) => ({ messages: [...s.messages, message] }));
      const calls = message.content.filter((b) => b.type === 'tool_use') as (Block & { id: string; name: string; input: unknown })[];
      if (!calls.length) {
        if (res.stop === 'max_tokens') push({ id: nextId(), kind: 'error', error: 'length' });
        break;
      }
      const results: Block[] = [];
      for (const c of calls) {
        // every call needs its result, also after "stop"
        if (ctrl.signal.aborted) {
          results.push({ type: 'tool_result', tool_use_id: c.id, content: 'Stopped by the user before it ran.', is_error: true });
          continue;
        }
        const id = nextId();
        push({ id, kind: 'tool', name: c.name, subject: toolSubject(c.name, c.input), state: 'running' });
        const out = await runTool(bench, c.name, c.input);
        patch(id, { state: out.isError ? 'error' : 'ok', subject: toolSubject(c.name, c.input, out.content), detail: out.isError ? out.content : undefined });
        results.push({ type: 'tool_result', tool_use_id: c.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
      }
      set((s) => ({ messages: [...s.messages, { role: 'user', content: results }] }));
      if (ctrl.signal.aborted) break;
    }
  } catch (e) {
    if (ctrl.signal.aborted) push({ id: nextId(), kind: 'error', error: 'stopped' });
    else {
      const err = e instanceof AssistantError ? e : new AssistantError('server', (e as Error).message);
      push({ id: nextId(), kind: 'error', error: err.kind, message: err.message !== err.kind ? err.message : undefined });
      set({ canRetry: !['key', 'nokey', 'login', 'plan', 'payment', 'messages', 'large'].includes(err.kind) });
      if (err.kind === 'key' || err.kind === 'nokey') set({ keyForm: true });
    }
  } finally {
    if (abort === ctrl) abort = null;
    // a schematic Claude started fits its circuit, in the same undo step
    for (const docId of opened) if (useStore.getState().docs.some((d) => d.id === docId)) commitDoc(docId, (d) => tightenDoc(d as Doc));
    for (const [docId, base] of before) joinHistory(docId, base);
    for (const docId of opened) refit(docId);
    const changedId = target.docId && before.has(target.docId) ? target.docId : [...before.keys()][0];
    const ds = useStore.getState().docs.find((d) => d.id === changedId);
    set({ running: false, changed: ds && ds.doc !== before.get(ds.id) ? { docId: ds.id, doc: ds.doc } : null });
  }
}

/** Asks Claude. */
export async function send(text: string) {
  const q = text.trim();
  if (!q || get().running) return;
  push({ id: nextId(), kind: 'user', text: q });
  set((s) => ({
    messages: [
      ...s.messages,
      {
        role: 'user',
        content: [
          { type: 'text', text: `<editor>${editorContext()}</editor>` },
          { type: 'text', text: q },
        ],
      },
    ],
  }));
  await run();
}

/** Sends the conversation again after an error (it ends with the question or the tool results). */
export async function retry() {
  const { messages, running } = get();
  if (running || !messages.length || messages[messages.length - 1].role !== 'user') return;
  await run();
}

/** Is the document still as the last answer left it? Then its changes can be undone in one step. */
export function canUndoAnswer(): boolean {
  const c = get().changed;
  return !!c && useStore.getState().docs.find((d) => d.id === c.docId)?.doc === c.doc;
}

export function undoAnswer() {
  const c = get().changed;
  if (!c || !canUndoAnswer()) return;
  setActive(c.docId);
  undo();
  set({ changed: null });
}
