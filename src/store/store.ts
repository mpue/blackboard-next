import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { BoardType, Doc, EdgeType, FootprintDef, Item, Layer, PartDef, PcbSettings, ShapeStyle, SpiceModel, SymbolDef } from '../model/types.ts';
import { isBoardLayer, RASTER } from '../model/types.ts';
import { defaultLayers } from '../io/legacy.ts';
import { createPcbDoc } from '../pcb/defaults.ts';
import { uid } from '../model/id.ts';
import { cloneItems, flipItem, rotateItem, selectionBounds, translateItem } from '../model/ops.ts';
import { applyAttachments, collectAttachments, type Attachment } from '../model/magnet.ts';
import type { Pt } from '../geometry/geom.ts';

export type Tool = 'select' | 'pan' | 'wire' | 'box' | 'ellipse' | 'text' | 'measure' | 'resistor' | 'diode' | 'check' | 'place' | 'track' | 'via' | 'zone' | 'outline';

export type Placement = { kind: 'part'; ref: string } | { kind: 'symbol'; def: SymbolDef } | { kind: 'footprint'; def: FootprintDef };

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface DocState {
  id: string;
  fileName: string;
  /** FileSystemFileHandle (browser) or path (Tauri) used for "save" */
  handle?: unknown;
  doc: Doc;
  savedDoc: Doc | null;
  past: Doc[];
  future: Doc[];
  gestureBase: Doc | null;
  selection: string[];
  view: View;
  fitted: boolean;
  currentLayer: string;
  /** view from the solder side */
  mirror: boolean;
  /** the cloud project this document was opened from or saved to */
  cloud?: CloudLink;
}

/** A document's project in the cloud: its id, the version it is based on, and what we may do with it. */
export interface CloudLink {
  id: string;
  version: number;
  role: 'owner' | 'edit' | 'view';
}

export interface Settings {
  grid: boolean;
  snap: boolean;
  /** snap raster in board units (16 = 0.1") */
  snapStep: number;
  /** wire ends follow the pins and junctions they touch while editing */
  magnetic: boolean;
  showNames: boolean;
  showValues: boolean;
  showPins: boolean;
  useLayerColor: boolean;
  theme: 'system' | 'light' | 'dark';
  lang: 'de' | 'en';
  leftPanel: boolean;
  rightPanel: boolean;
  /** PCBs: manufactured look (solder mask, HASL pads) instead of layer colours */
  pcbRealistic: boolean;
  showRatsnest: boolean;
}

export interface DrawStyle {
  color: string;
  thickness: number;
  startType: EdgeType;
  endType: EdgeType;
  shapeStyle: ShapeStyle;
  fontSize: number;
}

export interface Library {
  loaded: boolean;
  error?: string;
  parts: PartDef[];
  symbols: SymbolDef[];
  models: SpiceModel[];
  userSymbols: SymbolDef[];
  /** parts made with the part editor (IndexedDB); their files start with "user-" */
  userParts: PartDef[];
  /** footprints drawn with the footprint editor (IndexedDB) */
  userFootprints: FootprintDef[];
}

export interface Toast {
  id: string;
  kind: 'info' | 'error' | 'success';
  text: string;
}

interface State {
  docs: DocState[];
  active: string | null;
  tool: Tool;
  placement: Placement | null;
  settings: Settings;
  drawStyle: DrawStyle;
  library: Library;
  clipboard: Item[];
  clipboardParts: Record<string, PartDef>;
  toasts: Toast[];
  simulationOpen: boolean;
  dialog:
    | null
    | { kind: 'newBoard' }
    | { kind: 'about' }
    | { kind: 'shortcuts' }
    | { kind: 'samples' }
    | { kind: 'cloud' }
    | { kind: 'boardProps' }
    | { kind: 'symbolFromSelection' }
    | { kind: 'pcbRules' }
    | { kind: 'scaleDesigner' }
    | { kind: 'partEditor'; def?: PartDef; itemId?: string }
    | { kind: 'footprintEditor'; itemId?: string; def?: FootprintDef };
}

const SETTINGS_KEY = 'blackboard.settings.v1';
const STYLE_KEY = 'blackboard.drawStyle.v1';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

const defaultLang = (): 'de' | 'en' => (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en');

export const useStore = create<State>()(() => ({
  docs: [],
  active: null,
  tool: 'select',
  placement: null,
  settings: loadJson<Settings>(SETTINGS_KEY, {
    grid: true,
    snap: true,
    snapStep: RASTER,
    magnetic: false,
    showNames: true,
    showValues: true,
    showPins: false,
    useLayerColor: false,
    theme: 'system',
    lang: defaultLang(),
    leftPanel: true,
    rightPanel: true,
    pcbRealistic: false,
    showRatsnest: true,
  }),
  drawStyle: loadJson<DrawStyle>(STYLE_KEY, {
    color: '#1d4ed8',
    thickness: 3,
    startType: 'STRAIGHT',
    endType: 'STRAIGHT',
    shapeStyle: 'OUTLINED',
    fontSize: 14,
  }),
  library: { loaded: false, parts: [], symbols: [], models: [], userSymbols: [], userParts: [], userFootprints: [] },
  clipboard: [],
  clipboardParts: {},
  toasts: [],
  simulationOpen: false,
  dialog: null,
}));

const set = useStore.setState;
const get = useStore.getState;

// ---- selectors -------------------------------------------------------------------------

export function activeDoc(s: State = get()): DocState | undefined {
  return s.docs.find((d) => d.id === s.active);
}

export function useActive<T>(selector: (d: DocState) => T): T | undefined {
  return useStore((s) => {
    const d = activeDoc(s);
    return d ? selector(d) : undefined;
  });
}

export const isDirty = (d: DocState) => d.doc !== d.savedDoc;

// ---- internal helpers ------------------------------------------------------------------

function updateActive(fn: (d: DocState) => DocState) {
  set((s) => ({ docs: s.docs.map((d) => (d.id === s.active ? fn(d) : d)) }));
}

const HISTORY_LIMIT = 200;

/** Applies a recipe to the active document and records an undo step. */
export function commit(recipe: (d: Draft<Doc>) => void) {
  updateActive((ds) => {
    const next = produce(ds.doc, recipe);
    if (next === ds.doc) return ds;
    return { ...ds, doc: next, past: [...ds.past.slice(-HISTORY_LIMIT), ds.doc], future: [] };
  });
}

/** Interactive gestures (drag, resize) are recorded as a single undo step. */
export function beginGesture() {
  updateActive((ds) => ({ ...ds, gestureBase: ds.doc }));
}

export function gestureUpdate(recipe: (d: Draft<Doc>) => void) {
  updateActive((ds) => (ds.gestureBase ? { ...ds, doc: produce(ds.gestureBase, recipe) } : ds));
}

export function endGesture() {
  updateActive((ds) => {
    const base = ds.gestureBase;
    if (!base) return ds;
    if (base === ds.doc) return { ...ds, gestureBase: null };
    return { ...ds, gestureBase: null, past: [...ds.past.slice(-HISTORY_LIMIT), base], future: [] };
  });
}

export function cancelGesture() {
  updateActive((ds) => (ds.gestureBase ? { ...ds, doc: ds.gestureBase, gestureBase: null } : ds));
}

// ---- documents -------------------------------------------------------------------------

export function createDoc(type: BoardType, width: number, height: number): Doc {
  if (type === 'PCB') return createPcbDoc(width, height);
  return { width, height, type, layers: defaultLayers(type), items: [], parts: {} };
}

function defaultLayerFor(doc: Doc): string {
  return (doc.layers.find((l) => l.name.toLowerCase() === 'top') ?? doc.layers.find((l) => !isBoardLayer(l)) ?? doc.layers[0]).id;
}

export function openDoc(doc: Doc, fileName: string, handle?: unknown, saved = true, cloud?: CloudLink) {
  const id = uid('d');
  const ds: DocState = {
    id,
    fileName,
    handle,
    doc,
    savedDoc: saved ? doc : null,
    past: [],
    future: [],
    gestureBase: null,
    selection: [],
    view: { zoom: 1, panX: 40, panY: 40 },
    fitted: false,
    currentLayer: defaultLayerFor(doc),
    mirror: false,
    ...(cloud ? { cloud } : {}),
  };
  set((s) => ({ docs: [...s.docs, ds], active: id, tool: 'select', placement: null }));
  return id;
}

export function newDocument(type: BoardType, width: number, height: number) {
  const base = type === 'SCHEMATICS' ? 'schaltplan' : type === 'PCB' ? 'leiterplatte' : 'platine';
  const n = get().docs.filter((d) => d.fileName.startsWith(base)).length + 1;
  openDoc(createDoc(type, width, height), `${base}${n > 1 ? n : ''}.bb`, undefined, false);
}

export function closeDoc(id: string) {
  set((s) => {
    const docs = s.docs.filter((d) => d.id !== id);
    const idx = s.docs.findIndex((d) => d.id === id);
    const active = s.active === id ? (docs[Math.min(idx, docs.length - 1)]?.id ?? null) : s.active;
    return { docs, active };
  });
}

export function setActive(id: string) {
  set({ active: id, placement: null });
}

export function markSaved(id: string, fileName: string, handle: unknown) {
  set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, fileName, handle, savedDoc: d.doc } : d)) }));
}

/** Saved to (or linked with) a cloud project; `doc` is the version that was saved. */
export function markCloudSaved(id: string, fileName: string, cloud: CloudLink, doc: Doc) {
  set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, fileName, cloud, savedDoc: doc } : d)) }));
}

export function undo() {
  updateActive((ds) => {
    const prev = ds.past[ds.past.length - 1];
    if (!prev) return ds;
    const valid = new Set(prev.items.map((i) => i.id));
    return { ...ds, doc: prev, past: ds.past.slice(0, -1), future: [ds.doc, ...ds.future], selection: ds.selection.filter((id) => valid.has(id)) };
  });
}

export function redo() {
  updateActive((ds) => {
    const next = ds.future[0];
    if (!next) return ds;
    const valid = new Set(next.items.map((i) => i.id));
    return { ...ds, doc: next, past: [...ds.past, ds.doc], future: ds.future.slice(1), selection: ds.selection.filter((id) => valid.has(id)) };
  });
}

// ---- view ------------------------------------------------------------------------------

export function setView(view: Partial<View>) {
  updateActive((ds) => ({ ...ds, view: { ...ds.view, ...view }, fitted: true }));
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 16;

export function zoomAt(factor: number, screen: Pt) {
  updateActive((ds) => {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ds.view.zoom * factor));
    const k = zoom / ds.view.zoom;
    return { ...ds, view: { zoom, panX: screen.x - (screen.x - ds.view.panX) * k, panY: screen.y - (screen.y - ds.view.panY) * k }, fitted: true };
  });
}

export function fitToView(width: number, height: number) {
  updateActive((ds) => {
    const margin = 48;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((width - 2 * margin) / ds.doc.width, (height - 2 * margin) / ds.doc.height)));
    return {
      ...ds,
      fitted: true,
      view: { zoom, panX: (width - ds.doc.width * zoom) / 2, panY: (height - ds.doc.height * zoom) / 2 },
    };
  });
}

export function toggleMirror() {
  updateActive((ds) => ({ ...ds, mirror: !ds.mirror }));
}

// ---- selection -------------------------------------------------------------------------

export function select(ids: string[], mode: 'replace' | 'add' | 'toggle' = 'replace') {
  updateActive((ds) => {
    let sel: string[];
    if (mode === 'replace') sel = ids;
    else if (mode === 'add') sel = [...new Set([...ds.selection, ...ids])];
    else {
      const cur = new Set(ds.selection);
      for (const id of ids) {
        if (cur.has(id)) cur.delete(id);
        else cur.add(id);
      }
      sel = [...cur];
    }
    return { ...ds, selection: sel };
  });
}

export function selectedItems(ds: DocState | undefined = activeDoc()): Item[] {
  if (!ds) return [];
  const sel = new Set(ds.selection);
  return ds.doc.items.filter((i) => sel.has(i.id));
}

function editableLayerIds(doc: Doc): Set<string> {
  return new Set(doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
}

export function selectAll() {
  updateActive((ds) => {
    const ok = editableLayerIds(ds.doc);
    return { ...ds, selection: ds.doc.items.filter((i) => ok.has(i.layer)).map((i) => i.id) };
  });
}

export function selectAllLines() {
  updateActive((ds) => {
    const ok = editableLayerIds(ds.doc);
    return { ...ds, selection: ds.doc.items.filter((i) => i.kind === 'line' && ok.has(i.layer)).map((i) => i.id) };
  });
}

// ---- editing ---------------------------------------------------------------------------

export function addItems(items: Item[], parts?: Record<string, PartDef>, selectThem = true) {
  commit((d) => {
    if (parts) for (const [k, v] of Object.entries(parts)) if (!d.parts[k]) d.parts[k] = v;
    d.items.push(...(items as Draft<Item>[]));
  });
  if (selectThem) select(items.map((i) => i.id));
}

export function deleteSelection() {
  const ds = activeDoc();
  if (!ds || !ds.selection.length) return;
  const sel = new Set(ds.selection);
  commit((d) => {
    d.items = d.items.filter((i) => !sel.has(i.id));
  });
  select([]);
}

export function updateItems(ids: string[], recipe: (it: Draft<Item>) => void) {
  const set_ = new Set(ids);
  commit((d) => {
    for (const it of d.items) if (set_.has(it.id)) recipe(it);
  });
}

export function rotateSelection(deg: number) {
  const ds = activeDoc();
  if (!ds) return;
  const items = selectedItems(ds);
  const r = selectionBounds(ds.doc, items);
  if (!r) return;
  const center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const snap = get().settings.snap;
  const ids = new Set(ds.selection);
  const attached = magnetAttachments(ds.doc, ids);
  commit((d) => {
    for (const it of d.items) if (ids.has(it.id)) rotateItem(d as Doc, it as Item, deg, center, snap);
    applyAttachments(d as Doc, attached);
  });
}

/** Wire ends that have to follow an edit of `ids` (magnetic mode; tracks on PCBs always follow). */
export function magnetAttachments(doc: Doc, ids: Set<string>): Attachment[] {
  return get().settings.magnetic || doc.type === 'PCB' ? collectAttachments(doc, ids) : [];
}

export function nudgeSelection(dx: number, dy: number) {
  const ds = activeDoc();
  if (!ds || !ds.selection.length) return;
  const ids = new Set(ds.selection);
  const attached = magnetAttachments(ds.doc, ids);
  commit((d) => {
    for (const it of d.items) if (ids.has(it.id)) translateItem(it as Item, dx, dy);
    applyAttachments(d as Doc, attached);
  });
}

export function flipSelection(horizontal: boolean) {
  const ds = activeDoc();
  if (!ds) return;
  const r = selectionBounds(ds.doc, selectedItems(ds));
  if (!r) return;
  const center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const ids = new Set(ds.selection);
  const attached = magnetAttachments(ds.doc, ids);
  commit((d) => {
    for (const it of d.items) if (ids.has(it.id)) flipItem(it as Item, horizontal, center);
    // flipped footprints change sides: move them onto that side's copper layer
    for (const it of d.items) {
      if (!ids.has(it.id) || it.kind !== 'footprint') continue;
      const layer = d.layers.find((l) => l.role === (it.side === 'top' ? 'top-copper' : 'bottom-copper'));
      if (layer) it.layer = layer.id;
    }
    applyAttachments(d as Doc, attached);
  });
}

export function reorderSelection(where: 'front' | 'back' | 'forward' | 'backward') {
  const ds = activeDoc();
  if (!ds || !ds.selection.length) return;
  const ids = new Set(ds.selection);
  commit((d) => {
    const items = d.items as Item[];
    if (where === 'front' || where === 'back') {
      const picked = items.filter((i) => ids.has(i.id));
      const rest = items.filter((i) => !ids.has(i.id));
      d.items = (where === 'front' ? [...rest, ...picked] : [...picked, ...rest]) as Draft<Item>[];
      return;
    }
    const arr = [...items];
    if (where === 'forward') {
      for (let i = arr.length - 2; i >= 0; i--) if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    } else {
      for (let i = 1; i < arr.length; i++) if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
    d.items = arr as Draft<Item>[];
  });
}

export function moveSelectionToLayer(layerId: string) {
  const ds = activeDoc();
  if (!ds) return;
  const role = ds.doc.layers.find((l) => l.id === layerId)?.role;
  const copper = role === 'top-copper' || role === 'bottom-copper';
  updateItems(ds.selection, (it) => {
    // copper items only move between copper layers; footprints change sides
    if (it.kind === 'via') return;
    if ((it.kind === 'track' || it.kind === 'zone') && !copper) return;
    if (it.kind === 'footprint') {
      if (!copper) return;
      const side = role === 'top-copper' ? 'top' : 'bottom';
      if (side !== it.side) {
        it.side = side;
        it.rotation = -it.rotation;
      }
    }
    it.layer = layerId;
  });
}

export function copySelection(cut = false) {
  const ds = activeDoc();
  if (!ds) return;
  const items = selectedItems(ds);
  if (!items.length) return;
  const parts: Record<string, PartDef> = {};
  for (const it of items) if (it.kind === 'part' && ds.doc.parts[it.ref]) parts[it.ref] = ds.doc.parts[it.ref];
  set({ clipboard: structuredClone(items), clipboardParts: parts });
  if (cut) deleteSelection();
}

export function paste() {
  const ds = activeDoc();
  const { clipboard, clipboardParts } = get();
  if (!ds || !clipboard.length) return;
  const layerIds = new Set(ds.doc.layers.map((l) => l.id));
  const items = cloneItems(ds.doc, clipboard, RASTER * 2, RASTER * 2, true).map((it) => (layerIds.has(it.layer) ? it : { ...it, layer: ds.currentLayer }));
  addItems(items, clipboardParts);
  set({ clipboard: cloneItems(ds.doc, clipboard, RASTER * 2, RASTER * 2, false) });
}

export function duplicateSelection() {
  const ds = activeDoc();
  if (!ds) return;
  const items = selectedItems(ds);
  if (!items.length) return;
  addItems(cloneItems(ds.doc, items, RASTER, RASTER, true));
}

// ---- layers ----------------------------------------------------------------------------

export function setCurrentLayer(id: string) {
  updateActive((ds) => ({ ...ds, currentLayer: id }));
}

export function updateLayer(id: string, patch: Partial<Layer>, record = true) {
  const recipe = (d: Draft<Doc>) => {
    const l = d.layers.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  };
  if (record) commit(recipe);
  else updateActive((ds) => ({ ...ds, doc: produce(ds.doc, recipe) }));
}

export function addLayer(name: string) {
  const id = uid('L');
  const ds = activeDoc();
  if (!ds) return;
  commit((d) => {
    const at = Math.max(0, d.layers.findIndex((l) => l.id === ds.currentLayer));
    d.layers.splice(at, 0, { id, name, visible: true, locked: false, opacity: 1, color: '#000000' });
  });
  setCurrentLayer(id);
}

export function deleteLayer(id: string) {
  const ds = activeDoc();
  // physical PCB layers (copper, silk, outline) carry the board itself
  if (!ds || ds.doc.layers.length <= 1 || ds.doc.layers.find((l) => l.id === id)?.role) return;
  commit((d) => {
    d.layers = d.layers.filter((l) => l.id !== id);
    d.items = d.items.filter((i) => i.layer !== id);
  });
  if (ds.currentLayer === id) setCurrentLayer(activeDoc()!.doc.layers[0].id);
}

export function duplicateLayer(id: string) {
  const ds = activeDoc();
  if (!ds) return;
  const src = ds.doc.layers.find((l) => l.id === id);
  if (!src) return;
  const newId = uid('L');
  const copies = cloneItems(ds.doc, ds.doc.items.filter((i) => i.layer === id), 0, 0, false).map((i) => ({ ...i, layer: newId }));
  commit((d) => {
    const at = d.layers.findIndex((l) => l.id === id);
    d.layers.splice(at, 0, { ...src, id: newId, name: `${src.name} (2)` });
    d.items.push(...(copies as Draft<Item>[]));
  });
}

export function moveLayer(id: string, dir: -1 | 1) {
  commit((d) => {
    const i = d.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.layers.length) return;
    [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
  });
}

export function updatePcbSettings(patch: Partial<PcbSettings>) {
  commit((d) => {
    if (!d.pcb) return;
    Object.assign(d.pcb, patch);
  });
}

export function updateDoc(patch: Partial<Pick<Doc, 'width' | 'height' | 'type' | 'backgroundImage'>>) {
  commit((d) => {
    Object.assign(d, patch);
    if (patch.backgroundImage === undefined && 'backgroundImage' in patch) delete d.backgroundImage;
  });
}

// ---- app wide --------------------------------------------------------------------------

export function setTool(tool: Tool) {
  set({ tool, placement: tool === 'place' ? get().placement : null });
}

export function startPlacement(p: Placement) {
  set({ tool: 'place', placement: p });
}

export function updateSettings(patch: Partial<Settings>) {
  set((s) => {
    const settings = { ...s.settings, ...patch };
    saveJson(SETTINGS_KEY, settings);
    return { settings };
  });
}

export function updateDrawStyle(patch: Partial<DrawStyle>) {
  set((s) => {
    const drawStyle = { ...s.drawStyle, ...patch };
    saveJson(STYLE_KEY, drawStyle);
    return { drawStyle };
  });
}

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = uid('t');
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500);
}

export function openDialog(dialog: State['dialog']) {
  set({ dialog });
}

export function setSimulationOpen(open: boolean) {
  set({ simulationOpen: open });
}

export function setLibrary(patch: Partial<Library>) {
  set((s) => ({ library: { ...s.library, ...patch } }));
}
