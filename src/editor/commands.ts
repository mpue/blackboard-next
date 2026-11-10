// Central command registry: menus, context menu, toolbar and keyboard
// shortcuts all dispatch through here.

import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  FileDown,
  FileImage,
  FilePlus2,
  FileCode2,
  FolderOpen,
  Grid2x2Check,
  Grid3x3,
  Hand,
  Magnet,
  Maximize,
  MousePointer2,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  Scissors,
  Spline,
  Square,
  Trash2,
  Type,
  Undo2,
  Waves,
  ZoomIn,
  ZoomOut,
  FlipHorizontal2,
  FlipVertical2,
  Activity,
  Network,
  Library,
  FlaskConical,
  Zap,
  Sheet,
  Route,
  CircleDot,
  SquareDashed,
  ShieldCheck,
  Factory,
  Cpu,
  RefreshCw,
  ScanEye,
  Cable,
  SlidersHorizontal,
  Gauge,
  GraduationCap,
  Timer,
  ListOrdered,
  Wand2,
  Box,
  Eraser,
  PenLine,
  Pentagon,
  CircleGauge,
  PackagePlus,
} from 'lucide-react';
import {
  activeDoc,
  copySelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  openDialog,
  paste,
  redo,
  reorderSelection,
  rotateSelection,
  selectAll,
  selectAllLines,
  setSimulationOpen,
  setTool,
  nudgeSelection,
  toggleMirror,
  undo,
  updateSettings,
  useStore,
  zoomAt,
  type Tool,
} from '../store/store.ts';
import type { I18nKey } from '../i18n/i18n.ts';
import { isSchematicDoc } from '../model/types.ts';
import { exportBom, exportNetlist, exportPng, exportSvg, openFromDisk, printActive, saveActive } from './fileActions.ts';
import { breakSymbols } from './symbolActions.ts';
import { editSelectedPart, partFromSelection } from './partActions.ts';
import {
  addMountingHoles,
  annotateSchematic,
  createPcbFromSchematic,
  exportEtching,
  exportFabrication,
  fitBoardToParts,
  resetOutline,
  selectConnectedCopper,
  unroute,
  updatePcbFromSchematic,
} from './pcbActions.ts';
import { setDrcOpen } from '../ui/drcState.ts';
import { exportKicadFootprints, exportKicadNetlist, importKicadFootprints } from './kicadActions.ts';
import { runAutorouter } from './autorouteAction.ts';
import { setView3d, useView3d } from '../ui/Board3DHost.tsx';
import { setLiveMode, setLiveValues, useLive } from '../store/live.ts';
import { setLearnOpen, useLearn } from '../learn/state.ts';

export interface Command {
  id: string;
  label: I18nKey;
  icon?: LucideIcon;
  /** display form, e.g. "Ctrl+S" */
  shortcut?: string;
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;
}

const hasDoc = () => !!activeDoc();
const hasSel = () => (activeDoc()?.selection.length ?? 0) > 0;
const isPcb = () => activeDoc()?.doc.type === 'PCB';
const isSchematic = () => {
  const d = activeDoc()?.doc;
  return !!d && isSchematicDoc(d);
};

function zoomCenter(f: number) {
  const el = document.querySelector('.bb-canvas');
  const r = el?.getBoundingClientRect();
  zoomAt(f, { x: (r?.width ?? 800) / 2, y: (r?.height ?? 600) / 2 });
}

function toggle(key: 'grid' | 'snap' | 'magnetic' | 'showNames' | 'showValues' | 'showPins' | 'useLayerColor' | 'leftPanel' | 'rightPanel' | 'pcbRealistic' | 'showRatsnest') {
  return () => updateSettings({ [key]: !useStore.getState().settings[key] });
}

function tool(id: Tool, label: I18nKey, icon: LucideIcon, shortcut: string, enabled: () => boolean = hasDoc): Command {
  return { id: `tool.${id}`, label, icon, shortcut, run: () => setTool(id), enabled, checked: () => useStore.getState().tool === id };
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export const commands = {
  new: { id: 'new', label: 'file.new', icon: FilePlus2, shortcut: `${MOD}+N`, run: () => openDialog({ kind: 'newBoard' }) },
  open: { id: 'open', label: 'file.open', icon: FolderOpen, shortcut: `${MOD}+O`, run: () => void openFromDisk() },
  samples: { id: 'samples', label: 'file.samples', icon: Library, run: () => openDialog({ kind: 'samples' }) },
  save: { id: 'save', label: 'file.save', icon: Save, shortcut: `${MOD}+S`, run: () => void saveActive(false), enabled: hasDoc },
  saveAs: { id: 'saveAs', label: 'file.saveAs', icon: FileDown, shortcut: `${MOD}+Shift+S`, run: () => void saveActive(true), enabled: hasDoc },
  exportPng: { id: 'exportPng', label: 'file.exportPng', icon: FileImage, run: () => void exportPng(), enabled: hasDoc },
  exportSvg: { id: 'exportSvg', label: 'file.exportSvg', icon: FileCode2, run: () => void exportSvg(), enabled: hasDoc },
  exportNetlist: { id: 'exportNetlist', label: 'file.exportNetlist', icon: Network, run: () => void exportNetlist(), enabled: hasDoc },
  exportBom: { id: 'exportBom', label: 'file.exportBom', icon: Sheet, run: () => void exportBom(), enabled: hasDoc },
  print: { id: 'print', label: 'file.print', icon: Printer, shortcut: `${MOD}+P`, run: () => void printActive(), enabled: hasDoc },

  undo: { id: 'undo', label: 'edit.undo', icon: Undo2, shortcut: `${MOD}+Z`, run: undo, enabled: () => (activeDoc()?.past.length ?? 0) > 0 },
  redo: { id: 'redo', label: 'edit.redo', icon: Redo2, shortcut: `${MOD}+Y`, run: redo, enabled: () => (activeDoc()?.future.length ?? 0) > 0 },
  cut: { id: 'cut', label: 'edit.cut', icon: Scissors, shortcut: `${MOD}+X`, run: () => copySelection(true), enabled: hasSel },
  copy: { id: 'copy', label: 'edit.copy', icon: Copy, shortcut: `${MOD}+C`, run: () => copySelection(false), enabled: hasSel },
  paste: { id: 'paste', label: 'edit.paste', icon: ClipboardPaste, shortcut: `${MOD}+V`, run: paste, enabled: () => hasDoc() && useStore.getState().clipboard.length > 0 },
  duplicate: { id: 'duplicate', label: 'edit.duplicate', icon: CopyPlus, shortcut: `${MOD}+D`, run: duplicateSelection, enabled: hasSel },
  delete: { id: 'delete', label: 'edit.delete', icon: Trash2, shortcut: 'Entf', run: deleteSelection, enabled: hasSel },
  selectAll: { id: 'selectAll', label: 'edit.selectAll', shortcut: `${MOD}+A`, run: selectAll, enabled: hasDoc },
  selectLines: { id: 'selectLines', label: 'edit.selectLines', run: selectAllLines, enabled: hasDoc },
  rotateCW: { id: 'rotateCW', label: 'edit.rotateCW', icon: RotateCw, shortcut: 'R', run: () => rotateSelection(rotStep()), enabled: hasSel },
  rotateCCW: { id: 'rotateCCW', label: 'edit.rotateCCW', icon: RotateCcw, shortcut: 'Shift+R', run: () => rotateSelection(-rotStep()), enabled: hasSel },
  flipH: { id: 'flipH', label: 'edit.flipH', icon: FlipHorizontal2, shortcut: 'X', run: () => flipSelection(true), enabled: hasSel },
  flipV: { id: 'flipV', label: 'edit.flipV', icon: FlipVertical2, shortcut: 'Y', run: () => flipSelection(false), enabled: hasSel },
  front: { id: 'front', label: 'edit.front', icon: ArrowUpToLine, shortcut: `${MOD}+Bild↑`, run: () => reorderSelection('front'), enabled: hasSel },
  back: { id: 'back', label: 'edit.back', icon: ArrowDownToLine, shortcut: `${MOD}+Bild↓`, run: () => reorderSelection('back'), enabled: hasSel },
  forward: { id: 'forward', label: 'edit.forward', shortcut: 'Bild↑', run: () => reorderSelection('forward'), enabled: hasSel },
  backward: { id: 'backward', label: 'edit.backward', shortcut: 'Bild↓', run: () => reorderSelection('backward'), enabled: hasSel },
  makeSymbol: { id: 'makeSymbol', label: 'edit.makeSymbol', run: () => openDialog({ kind: 'symbolFromSelection' }), enabled: hasSel },
  breakSymbol: {
    id: 'breakSymbol',
    label: 'edit.breakSymbol',
    run: breakSymbols,
    enabled: () => {
      const ds = activeDoc();
      return !!ds && ds.doc.items.some((i) => i.kind === 'symbol' && ds.selection.includes(i.id));
    },
  },
  makePart: { id: 'makePart', label: 'edit.makePart', run: () => void partFromSelection(), enabled: () => hasSel() && !isPcb() },
  editPart: {
    id: 'editPart',
    label: 'edit.editPart',
    run: editSelectedPart,
    enabled: () => {
      const ds = activeDoc();
      return !!ds && ds.selection.length === 1 && ds.doc.items.some((i) => i.kind === 'part' && i.id === ds.selection[0]);
    },
  },
  newPart: { id: 'newPart', label: 'part.newPart', icon: PackagePlus, run: () => openDialog({ kind: 'partEditor' }) },
  scaleDesigner: { id: 'scaleDesigner', label: 'scale.menu', icon: CircleGauge, run: () => openDialog({ kind: 'scaleDesigner' }), enabled: () => hasDoc() && !isPcb() },

  zoomIn: { id: 'zoomIn', label: 'view.zoomIn', icon: ZoomIn, shortcut: '+', run: () => zoomCenter(1.25), enabled: hasDoc },
  zoomOut: { id: 'zoomOut', label: 'view.zoomOut', icon: ZoomOut, shortcut: '−', run: () => zoomCenter(0.8), enabled: hasDoc },
  fit: { id: 'fit', label: 'view.fit', icon: Maximize, shortcut: 'F', run: () => window.dispatchEvent(new Event('bb:fit')), enabled: hasDoc },
  actual: {
    id: 'actual',
    label: 'view.actual',
    shortcut: '1',
    run: () => {
      const ds = activeDoc();
      if (ds) zoomCenter(1 / ds.view.zoom);
    },
    enabled: hasDoc,
  },
  grid: { id: 'grid', label: 'view.grid', icon: Grid3x3, shortcut: 'G', run: toggle('grid'), checked: () => useStore.getState().settings.grid },
  snap: { id: 'snap', label: 'view.snap', icon: Grid2x2Check, shortcut: 'S', run: toggle('snap'), checked: () => useStore.getState().settings.snap },
  magnet: { id: 'magnet', label: 'view.magnet', icon: Magnet, shortcut: 'Shift+M', run: toggle('magnetic'), checked: () => useStore.getState().settings.magnetic },
  mirror: { id: 'mirror', label: 'view.mirror', icon: FlipHorizontal2, shortcut: 'L', run: toggleMirror, enabled: hasDoc, checked: () => !!activeDoc()?.mirror },
  names: { id: 'names', label: 'view.names', shortcut: 'N', run: toggle('showNames'), checked: () => useStore.getState().settings.showNames },
  values: { id: 'values', label: 'view.values', run: toggle('showValues'), checked: () => useStore.getState().settings.showValues },
  pins: { id: 'pins', label: 'view.pins', shortcut: 'P', run: toggle('showPins'), checked: () => useStore.getState().settings.showPins },
  layerColor: { id: 'layerColor', label: 'view.layerColor', run: toggle('useLayerColor'), checked: () => useStore.getState().settings.useLayerColor },
  leftPanel: { id: 'leftPanel', label: 'view.leftPanel', shortcut: `${MOD}+1`, run: toggle('leftPanel'), checked: () => useStore.getState().settings.leftPanel },
  rightPanel: { id: 'rightPanel', label: 'view.rightPanel', shortcut: `${MOD}+2`, run: toggle('rightPanel'), checked: () => useStore.getState().settings.rightPanel },

  boardProps: { id: 'boardProps', label: 'board.properties', run: () => openDialog({ kind: 'boardProps' }), enabled: hasDoc },
  simulate: { id: 'simulate', label: 'board.simulate', icon: Activity, shortcut: 'F5', run: () => setSimulationOpen(true), enabled: hasDoc },
  live: {
    id: 'live',
    label: 'live.toggle',
    icon: Gauge,
    shortcut: 'Shift+L',
    run: () => setLiveValues(!useLive.getState().on),
    enabled: isSchematic,
    checked: () => useLive.getState().on,
  },

  select: tool('select', 'tool.select', MousePointer2, 'V'),
  pan: tool('pan', 'tool.pan', Hand, 'H'),
  wire: tool('wire', 'tool.wire', Spline, 'W'),
  box: tool('box', 'tool.box', Square, 'B'),
  ellipse: tool('ellipse', 'tool.ellipse', Circle, 'E'),
  text: tool('text', 'tool.text', Type, 'T'),
  measure: tool('measure', 'tool.measure', Ruler, 'M'),
  resistor: tool('resistor', 'tool.resistor', Waves, 'O'),
  diode: tool('diode', 'tool.diode', Zap, 'D'),
  check: tool('check', 'tool.check', Crosshair, 'K'),
  track: tool('track', 'tool.track', Route, 'W', isPcb),
  via: tool('via', 'tool.via', CircleDot, 'Shift+V', isPcb),
  zone: tool('zone', 'tool.zone', SquareDashed, 'Z', isPcb),
  outline: tool('outline', 'tool.outline', Pentagon, 'Shift+O', isPcb),
  mountingHoles: { id: 'mountingHoles', label: 'pcb.mountingHoles', run: addMountingHoles, enabled: isPcb },
  fitBoard: { id: 'fitBoard', label: 'pcb.fitBoard', run: () => fitBoardToParts(), enabled: () => isPcb() && !activeDoc()?.doc.pcb?.outline },
  resetOutline: { id: 'resetOutline', label: 'pcb.resetOutline', run: resetOutline, enabled: () => !!activeDoc()?.doc.pcb?.outline },

  annotate: { id: 'annotate', label: 'annotate.title', icon: ListOrdered, run: annotateSchematic, enabled: isSchematic },
  createPcb: { id: 'createPcb', label: 'pcb.create', icon: Cpu, run: createPcbFromSchematic, enabled: isSchematic },
  updatePcb: { id: 'updatePcb', label: 'pcb.update', icon: RefreshCw, run: updatePcbFromSchematic, enabled: isPcb },
  autoroute: { id: 'autoroute', label: 'route.run', icon: Wand2, shortcut: 'Shift+A', run: runAutorouter, enabled: isPcb },
  selectConnected: { id: 'selectConnected', label: 'route.selectConnected', shortcut: 'U', run: selectConnectedCopper, enabled: () => isPcb() && hasSel() },
  unrouteNet: { id: 'unrouteNet', label: 'route.unrouteNet', icon: Eraser, run: () => unroute('selection'), enabled: () => isPcb() && hasSel() },
  unrouteAll: { id: 'unrouteAll', label: 'route.unrouteAll', run: () => unroute('all'), enabled: isPcb },
  drc: { id: 'drc', label: 'pcb.drc', icon: ShieldCheck, shortcut: 'Shift+D', run: () => setDrcOpen(true), enabled: isPcb },
  erc: { id: 'erc', label: 'erc.title', icon: ShieldCheck, shortcut: 'Shift+D', run: () => setDrcOpen(true), enabled: isSchematic },
  exportGerber: { id: 'exportGerber', label: 'pcb.exportGerber', icon: Factory, run: () => void exportFabrication(), enabled: isPcb },
  exportEtching: { id: 'exportEtching', label: 'pcb.exportEtching', icon: Printer, run: () => void exportEtching(), enabled: isPcb },
  newFootprint: { id: 'newFootprint', label: 'fpe.newFootprint', icon: PenLine, run: () => openDialog({ kind: 'footprintEditor' }) },
  exportKicadNetlist: { id: 'exportKicadNetlist', label: 'kicad.exportNetlist', icon: FileCode2, run: () => void exportKicadNetlist(), enabled: isSchematic },
  importKicadFootprints: { id: 'importKicadFootprints', label: 'kicad.importFootprints', icon: FolderOpen, run: () => void importKicadFootprints() },
  exportKicadFootprints: {
    id: 'exportKicadFootprints',
    label: 'kicad.exportFootprints',
    run: () => void exportKicadFootprints(),
    enabled: () => useStore.getState().library.userFootprints.length > 0,
  },
  editFootprint: {
    id: 'editFootprint',
    label: 'fpe.editFootprint',
    run: () => {
      const ds = activeDoc();
      const fp = ds?.doc.items.find((i) => i.kind === 'footprint' && ds.selection.includes(i.id));
      if (fp?.kind === 'footprint') openDialog({ kind: 'footprintEditor', itemId: fp.id, def: fp.footprint });
    },
    enabled: () => {
      const ds = activeDoc();
      return !!ds && ds.doc.type === 'PCB' && ds.selection.length === 1 && ds.doc.items.some((i) => i.kind === 'footprint' && i.id === ds.selection[0]);
    },
  },
  view3d: { id: 'view3d', label: 'view3d.toggle', icon: Box, shortcut: '3', run: () => setView3d(!useView3d.getState().open), enabled: isPcb, checked: () => useView3d.getState().open },
  pcbRules: { id: 'pcbRules', label: 'pcb.rules', icon: SlidersHorizontal, run: () => openDialog({ kind: 'pcbRules' }), enabled: isPcb },
  realistic: { id: 'realistic', label: 'pcb.realistic', icon: ScanEye, shortcut: 'Shift+3', run: toggle('pcbRealistic'), checked: () => useStore.getState().settings.pcbRealistic },
  ratsnest: { id: 'ratsnest', label: 'pcb.ratsnest', icon: Cable, run: toggle('showRatsnest'), checked: () => useStore.getState().settings.showRatsnest },

  liveTran: {
    id: 'liveTran',
    label: 'live.tran',
    icon: Timer,
    shortcut: 'Shift+T',
    run: () => {
      const st = useLive.getState();
      if (!st.on) setLiveValues(true);
      setLiveMode(st.on && st.mode === 'tran' ? 'dc' : 'tran');
    },
    enabled: isSchematic,
    checked: () => useLive.getState().on && useLive.getState().mode === 'tran',
  },
  learn: { id: 'learn', label: 'learn.open', icon: GraduationCap, shortcut: 'F1', run: () => setLearnOpen(!useLearn.getState().open), checked: () => useLearn.getState().open },
  shortcuts: { id: 'shortcuts', label: 'help.shortcuts', shortcut: '?', run: () => openDialog({ kind: 'shortcuts' }) },
  about: { id: 'about', label: 'help.about', icon: FlaskConical, run: () => openDialog({ kind: 'about' }) },
} satisfies Record<string, Command>;

export type CommandId = keyof typeof commands;

function rotStep(): number {
  return 90;
}

export function runCommand(c: Command) {
  if (c.enabled && !c.enabled()) return;
  c.run();
}

// ---- keyboard --------------------------------------------------------------------------------

/** `pcb`: only on PCBs (checked before the general bindings), `pcb: false`: never on PCBs */
type KeyBinding = { key: string; mod?: boolean; shift?: boolean; alt?: boolean; pcb?: boolean; cmd: Command };

const B = (key: string, cmd: Command, o: Omit<KeyBinding, 'key' | 'cmd'> = {}): KeyBinding => ({ key, cmd, ...o });
const c = commands;

const bindings: KeyBinding[] = [
  B('n', c.new, { mod: true }),
  B('o', c.open, { mod: true }),
  B('s', c.save, { mod: true }),
  B('s', c.saveAs, { mod: true, shift: true }),
  B('p', c.print, { mod: true }),
  B('z', c.undo, { mod: true }),
  B('z', c.redo, { mod: true, shift: true }),
  B('y', c.redo, { mod: true }),
  B('x', c.cut, { mod: true }),
  B('c', c.copy, { mod: true }),
  B('v', c.paste, { mod: true }),
  B('d', c.duplicate, { mod: true }),
  B('a', c.selectAll, { mod: true }),
  B('1', c.leftPanel, { mod: true }),
  B('2', c.rightPanel, { mod: true }),
  B('delete', c.delete),
  B('backspace', c.delete),
  B('r', c.rotateCW),
  B('r', c.rotateCCW, { shift: true }),
  B('x', c.flipH),
  B('y', c.flipV),
  B('pageup', c.front, { mod: true }),
  B('pagedown', c.back, { mod: true }),
  B('pageup', c.forward),
  B('pagedown', c.backward),
  B('+', c.zoomIn),
  B('=', c.zoomIn),
  B('-', c.zoomOut),
  B('f', c.fit),
  B('1', c.actual),
  B('g', c.grid),
  B('s', c.snap),
  B('m', c.magnet, { shift: true }),
  B('l', c.mirror),
  B('n', c.names),
  B('p', c.pins),
  B('f5', c.simulate),
  B('f1', c.learn),
  B('l', c.live, { shift: true }),
  B('t', c.liveTran, { shift: true }),
  B('v', c.select),
  B('h', c.pan),
  B('w', c.wire),
  B('b', c.box),
  B('e', c.ellipse),
  B('t', c.text),
  B('m', c.measure),
  B('o', c.resistor),
  B('d', c.diode),
  B('k', c.check),
  B('w', c.track, { pcb: true }),
  B('v', c.via, { pcb: true, shift: true }),
  B('z', c.zone, { pcb: true }),
  B('a', c.autoroute, { pcb: true, shift: true }),
  B('u', c.selectConnected, { pcb: true }),
  B('o', c.outline, { pcb: true, shift: true }),
  B('3', c.view3d, { pcb: true }),
  B('d', c.drc, { pcb: true, shift: true }),
  B('d', c.erc, { shift: true }),
  B('3', c.realistic, { pcb: true, shift: true }),
  B('§', c.realistic, { pcb: true, shift: true }),
  B('?', c.shortcuts, { shift: true }),
];

export function handleShortcut(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return false;
  if (useStore.getState().dialog) return false;
  // digits by physical key: Shift+3 is '#' on US but '§' on German keyboards
  const key = /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  const pcb = isPcb();
  const matches = (x: KeyBinding) => x.key === key && !!x.mod === mod && (x.key === '?' || !!x.shift === e.shiftKey) && !e.altKey;
  const b = (pcb ? bindings.find((x) => x.pcb && matches(x)) : undefined) ?? bindings.find((x) => x.pcb === undefined && matches(x));
  if (b) {
    e.preventDefault();
    runCommand(b.cmd);
    return true;
  }
  // arrow keys nudge the selection
  if (key.startsWith('arrow') && !mod && hasSel()) {
    e.preventDefault();
    const { snapStep, snap } = useStore.getState().settings;
    const step = e.altKey ? 1 : snap ? snapStep : 4;
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    nudgeSelection(dx, dy);
    return true;
  }
  return false;
}
