import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  activeDoc,
  addItems,
  beginGesture,
  cancelGesture,
  endGesture,
  fitToView,
  gestureUpdate,
  select,
  setTool,
  setView,
  useStore,
  zoomAt,
  type DocState,
} from '../store/store.ts';
import { useCursor } from '../store/cursor.ts';
import type { Doc, Item, LineItem, PartDef } from '../model/types.ts';
import { isBoardLayer, isTwoPoint, MM_PER_UNIT, RASTER } from '../model/types.ts';
import { uid } from '../model/id.ts';
import { nextDesignator, partLookup, translateItem } from '../model/ops.ts';
import {
  hitItem,
  itemBounds,
  itemPins,
  normRect,
  rectContainsRect,
  rectsIntersect,
  snapTo,
  type Pt,
  type Rect,
} from '../geometry/geom.ts';
import { BoardBackground } from '../render/BoardBackground.tsx';
import { ItemView, type RenderFlags } from '../render/ItemView.tsx';
import { editableLayer, makePlacedItem } from './placement.ts';
import { netAt, type Net } from '../spice/connectivity.ts';
import { ContextMenu, type ContextMenuState } from './ContextMenu.tsx';
import { takeDragPayload } from './dragPayload.ts';
import { useT } from '../i18n/i18n.ts';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'marquee'; start: Pt; cur: Pt; mode: 'replace' | 'add' }
  | { kind: 'move'; start: Pt; anchor: Pt; started: boolean; sx: number; sy: number; ids: Set<string> }
  | { kind: 'endpoint'; id: string; which: 1 | 2; started: boolean }
  | { kind: 'resize'; id: string; fixed: Pt }
  | { kind: 'shape'; shape: 'box' | 'ellipse'; start: Pt; cur: Pt }
  | { kind: 'measure'; start: Pt; cur: Pt };

interface Preview {
  marquee?: Rect & { crossing: boolean };
  shape?: { shape: 'box' | 'ellipse'; r: Rect };
  chain?: { from: Pt; to: Pt };
  measure?: { a: Pt; b: Pt };
  ghost?: Item;
  net?: Net;
  snapPin?: Pt;
}

const HANDLE_PX = 9;

function anchorOf(it: Item, doc: Doc): Pt {
  const pins = itemPins(it, partLookup(doc));
  if (pins.length) return pins[0];
  if (isTwoPoint(it)) return { x: it.x1, y: it.y1 };
  return { x: it.x, y: it.y };
}

export function Canvas() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const settings = useStore((s) => s.settings);
  const tool = useStore((s) => s.tool);
  const placement = useStore((s) => s.placement);
  const drawStyle = useStore((s) => s.drawStyle);
  const libraryParts = useStore((s) => s.library.parts);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const chainStart = useRef<Pt | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; mid: Pt } | null>(null);
  const [preview, setPreview] = useState<Preview>({});
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const libByFile = useMemo(() => new Map(libraryParts.map((p) => [p.file, p])), [libraryParts]);
  const lookup = useCallback((ref: string): PartDef | undefined => ds?.doc.parts[ref] ?? libByFile.get(ref), [ds?.doc.parts, libByFile]);

  // ---- size / fit ------------------------------------------------------------------------
  const fitIfNeeded = useCallback(() => {
    const el = wrapRef.current;
    const d = activeDoc();
    if (el && d && !d.fitted && el.clientWidth > 0 && el.clientHeight > 0) fitToView(el.clientWidth, el.clientHeight);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(fitIfNeeded);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitIfNeeded, !!ds]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(fitIfNeeded, [ds?.id, ds?.fitted, fitIfNeeded]);

  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current;
      if (el) fitToView(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('bb:fit', fit);
    return () => window.removeEventListener('bb:fit', fit);
  }, []);

  // reset transient tool state when tool or document changes
  useEffect(() => {
    chainStart.current = null;
    drag.current = null;
    setPreview({});
    useCursor.setState({ measure: null });
  }, [tool, ds?.id, placement]);

  // ---- coordinate helpers -------------------------------------------------------------------
  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const d = activeDoc();
    const svg = svgRef.current;
    if (!d || !svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = (clientX - r.left - d.view.panX) / d.view.zoom;
    const y = (clientY - r.top - d.view.panY) / d.view.zoom;
    return { x: d.mirror ? d.doc.width - x : x, y };
  }, []);

  const snapPt = useCallback(
    (p: Pt, force = false): Pt => {
      const { snap, snapStep } = useStore.getState().settings;
      if (!snap && !force) return { x: Math.round(p.x), y: Math.round(p.y) };
      return { x: snapTo(p.x, snapStep), y: snapTo(p.y, snapStep) };
    },
    [],
  );

  /** Magnetic pins: wires snap to nearby pins even when they are off the raster. */
  const nearPin = useCallback((p: Pt, d: DocState): Pt | undefined => {
    const tol = 8 / Math.min(1, d.view.zoom);
    let best: Pt | undefined;
    let bestD = tol;
    const lk = partLookup(d.doc);
    for (const it of d.doc.items) {
      for (const pin of itemPins(it, lk)) {
        const dd = Math.hypot(pin.x - p.x, pin.y - p.y);
        if (dd < bestD) {
          bestD = dd;
          best = { x: pin.x, y: pin.y };
        }
      }
    }
    return best;
  }, []);

  const hitTest = useCallback((d: DocState, p: Pt): Item | undefined => {
    const tol = 4 / d.view.zoom;
    const lk = partLookup(d.doc);
    for (const layer of d.doc.layers) {
      if (!layer.visible || layer.locked) continue;
      for (let i = d.doc.items.length - 1; i >= 0; i--) {
        const it = d.doc.items[i];
        if (it.layer === layer.id && hitItem(it, p, lk, tol)) return it;
      }
    }
    return undefined;
  }, []);

  // ---- wheel zoom (native listener: must not be passive) -------------------------------------
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const d = activeDoc();
      if (!d) return;
      if (e.shiftKey && !e.ctrlKey) {
        setView({ panX: d.view.panX - (e.deltaY || e.deltaX) });
        return;
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.pow(1.0018, -delta * (e.ctrlKey ? 3 : 1)), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [ds?.id]);

  // ---- keyboard (tool local) ---------------------------------------------------------------------
  useEffect(() => {
    const isInput = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isInput(e)) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        if (drag.current) {
          if (drag.current.kind === 'move' || drag.current.kind === 'endpoint' || drag.current.kind === 'resize') cancelGesture();
          drag.current = null;
        }
        chainStart.current = null;
        setPreview({});
        setMenu(null);
        const s = useStore.getState();
        if (s.tool !== 'select') setTool('select');
        else select([]);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- pointer handling ----------------------------------------------------------------------------
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const d = activeDoc();
    if (!d) return;
    setMenu(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // second finger: switch to pinch zoom
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      if (drag.current?.kind === 'move') cancelGesture();
      drag.current = null;
      setPreview({});
      return;
    }
    const raw = toWorld(e.clientX, e.clientY);
    const p = snapPt(raw);
    const s = useStore.getState();

    if (e.button === 1 || (e.button === 0 && (spaceDown || s.tool === 'pan'))) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: d.view.panX, panY: d.view.panY };
      return;
    }
    if (e.button !== 0) return;
    const layer = editableLayer(d.doc, d.currentLayer);

    switch (s.tool) {
      case 'select': {
        // handles of a single selected item come first
        if (d.selection.length === 1) {
          const it = d.doc.items.find((i) => i.id === d.selection[0]);
          const tol = HANDLE_PX / d.view.zoom;
          if (it && isTwoPoint(it)) {
            if (Math.hypot(raw.x - it.x1, raw.y - it.y1) <= tol) {
              beginGesture();
              drag.current = { kind: 'endpoint', id: it.id, which: 1, started: false };
              return;
            }
            if (Math.hypot(raw.x - it.x2, raw.y - it.y2) <= tol) {
              beginGesture();
              drag.current = { kind: 'endpoint', id: it.id, which: 2, started: false };
              return;
            }
          }
          if (it && (it.kind === 'box' || it.kind === 'ellipse')) {
            const r = normRect(it.x, it.y, it.x + it.w, it.y + it.h);
            const corners: Pt[] = [
              { x: r.x, y: r.y },
              { x: r.x + r.w, y: r.y },
              { x: r.x + r.w, y: r.y + r.h },
              { x: r.x, y: r.y + r.h },
            ];
            const ci = corners.findIndex((c) => Math.hypot(raw.x - c.x, raw.y - c.y) <= tol);
            if (ci >= 0) {
              beginGesture();
              drag.current = { kind: 'resize', id: it.id, fixed: corners[(ci + 2) % 4] };
              return;
            }
          }
        }
        const hit = hitTest(d, raw);
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (hit) {
          let ids = d.selection;
          if (additive) {
            select([hit.id], 'toggle');
            ids = d.selection.includes(hit.id) ? d.selection.filter((x) => x !== hit.id) : [...d.selection, hit.id];
          } else if (!d.selection.includes(hit.id)) {
            select([hit.id]);
            ids = [hit.id];
          }
          if (ids.includes(hit.id)) {
            drag.current = { kind: 'move', start: raw, anchor: anchorOf(hit, d.doc), started: false, sx: e.clientX, sy: e.clientY, ids: new Set(ids) };
          }
        } else {
          drag.current = { kind: 'marquee', start: raw, cur: raw, mode: additive ? 'add' : 'replace' };
        }
        return;
      }
      case 'wire':
      case 'resistor':
      case 'diode': {
        if (!layer) return;
        const pt = nearPin(raw, d) ?? p;
        const start = chainStart.current;
        if (!start) {
          chainStart.current = pt;
          setPreview({ chain: { from: pt, to: pt } });
          return;
        }
        if (start.x === pt.x && start.y === pt.y) {
          chainStart.current = null;
          setPreview({});
          return;
        }
        let end = pt;
        if (e.shiftKey) end = constrain(start, pt);
        if (s.tool === 'wire') {
          const color = s.settings.useLayerColor ? d.doc.layers.find((l) => l.id === layer)?.color ?? s.drawStyle.color : s.drawStyle.color;
          const line: LineItem = {
            id: uid(),
            kind: 'line',
            layer,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            color,
            thickness: s.drawStyle.thickness,
            startType: s.drawStyle.startType,
            endType: s.drawStyle.endType,
          };
          addItems([line], undefined, false);
          chainStart.current = end;
          setPreview({ chain: { from: end, to: end } });
        } else {
          const layerForParts = d.doc.layers.find((l) => l.name.toLowerCase() === 'parts' && !l.locked)?.id ?? layer;
          const base = { id: uid(), layer: layerForParts, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
          const item: Item =
            s.tool === 'resistor'
              ? { ...base, kind: 'resistor', name: nextDesignator(d.doc, 'R'), value: 1000, tolerance: 5 }
              : { ...base, kind: 'diode', name: nextDesignator(d.doc, 'D'), value: '1N4148', diodeType: 'DO35' };
          addItems([item]);
          chainStart.current = null;
          setPreview({});
        }
        return;
      }
      case 'box':
      case 'ellipse':
        if (!layer) return;
        drag.current = { kind: 'shape', shape: s.tool, start: p, cur: p };
        return;
      case 'measure':
        drag.current = { kind: 'measure', start: p, cur: p };
        setPreview({ measure: { a: p, b: p } });
        return;
      case 'text': {
        if (!layer) return;
        addItems([
          {
            id: uid(),
            kind: 'text',
            layer,
            x: p.x,
            y: p.y,
            text: 'Text',
            font: 'Arial',
            fontSize: s.drawStyle.fontSize,
            rotation: 0,
            textType: 'TEXT',
            color: d.doc.type === 'SCHEMATICS' || d.doc.type === 'BLANK' ? '#000000' : '#111111',
          },
        ]);
        setTool('select');
        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('bb:focus-props', { detail: 'text' })));
        return;
      }
      case 'check': {
        const net = netAt(d.doc, raw, 4 / d.view.zoom);
        setPreview({ net });
        return;
      }
      case 'place': {
        if (!s.placement || !layer) return;
        const item = makePlacedItem(d.doc, s.placement, raw, layer, s.settings.snap, lookup);
        if (!item) return;
        const parts = item.kind === 'part' && !d.doc.parts[item.ref] ? { [item.ref]: lookup(item.ref)! } : undefined;
        addItems([item], parts);
        return;
      }
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = activeDoc();
    if (!d) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = svgRef.current!.getBoundingClientRect();
      setView({ panX: d.view.panX + mid.x - pinch.current.mid.x, panY: d.view.panY + mid.y - pinch.current.mid.y });
      zoomAt(dist / pinch.current.dist, { x: mid.x - r.left, y: mid.y - r.top });
      pinch.current = { dist, mid };
      return;
    }
    const raw = toWorld(e.clientX, e.clientY);
    const p = snapPt(raw);
    useCursor.setState({ x: raw.x, y: raw.y, inside: true });
    const s = useStore.getState();
    const g = drag.current;

    if (g) {
      switch (g.kind) {
        case 'pan':
          setView({ panX: g.panX + e.clientX - g.sx, panY: g.panY + e.clientY - g.sy });
          return;
        case 'marquee':
          g.cur = raw;
          setPreview({ marquee: { ...normRect(g.start.x, g.start.y, raw.x, raw.y), crossing: raw.x < g.start.x } });
          return;
        case 'move': {
          if (!g.started) {
            if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
            g.started = true;
            beginGesture();
          }
          let dx = raw.x - g.start.x;
          let dy = raw.y - g.start.y;
          if (s.settings.snap) {
            const target = snapPt({ x: g.anchor.x + dx, y: g.anchor.y + dy });
            dx = target.x - g.anchor.x;
            dy = target.y - g.anchor.y;
          }
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          gestureUpdate((doc) => {
            for (const it of doc.items) if (g.ids.has(it.id)) translateItem(it as Item, dx, dy);
          });
          return;
        }
        case 'endpoint': {
          g.started = true;
          const pt = nearPin(raw, d) ?? p;
          gestureUpdate((doc) => {
            const it = doc.items.find((i) => i.id === g.id);
            if (!it || !isTwoPoint(it as Item)) return;
            const tp = it as LineItem;
            const other = g.which === 1 ? { x: tp.x2, y: tp.y2 } : { x: tp.x1, y: tp.y1 };
            const q = e.shiftKey ? constrain(other, pt) : pt;
            if (g.which === 1) {
              tp.x1 = q.x;
              tp.y1 = q.y;
            } else {
              tp.x2 = q.x;
              tp.y2 = q.y;
            }
          });
          return;
        }
        case 'resize':
          gestureUpdate((doc) => {
            const it = doc.items.find((i) => i.id === g.id);
            if (!it || (it.kind !== 'box' && it.kind !== 'ellipse')) return;
            const r = normRect(g.fixed.x, g.fixed.y, p.x, p.y);
            Object.assign(it, { x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h) });
          });
          return;
        case 'shape': {
          g.cur = p;
          let r = normRect(g.start.x, g.start.y, p.x, p.y);
          if (e.shiftKey) r = { ...r, w: Math.max(r.w, r.h), h: Math.max(r.w, r.h) };
          setPreview({ shape: { shape: g.shape, r } });
          return;
        }
        case 'measure': {
          g.cur = p;
          const dx = p.x - g.start.x;
          const dy = p.y - g.start.y;
          useCursor.setState({ measure: { dx, dy, len: Math.hypot(dx, dy) } });
          setPreview({ measure: { a: g.start, b: p } });
          return;
        }
      }
    }

    // hover previews
    if ((s.tool === 'wire' || s.tool === 'resistor' || s.tool === 'diode') && chainStart.current) {
      const pin = nearPin(raw, d);
      const to = e.shiftKey ? constrain(chainStart.current, pin ?? p) : (pin ?? p);
      setPreview({ chain: { from: chainStart.current, to }, snapPin: pin });
    } else if (s.tool === 'wire' || s.tool === 'resistor' || s.tool === 'diode') {
      const pin = nearPin(raw, d);
      setPreview((pv) => (pv.snapPin === pin ? pv : { ...pv, snapPin: pin }));
    } else if (s.tool === 'place' && s.placement) {
      const layer = editableLayer(d.doc, d.currentLayer) ?? d.currentLayer;
      setPreview({ ghost: makePlacedItem(d.doc, s.placement, raw, layer, s.settings.snap, lookup) });
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const d = activeDoc();
    const g = drag.current;
    drag.current = null;
    if (!d || !g) return;
    switch (g.kind) {
      case 'marquee': {
        const r = normRect(g.start.x, g.start.y, g.cur.x, g.cur.y);
        setPreview({});
        if (r.w < 2 && r.h < 2) {
          if (g.mode === 'replace') select([]);
          return;
        }
        const crossing = g.cur.x < g.start.x;
        const editable = new Set(d.doc.layers.filter((l) => l.visible && !l.locked && !isBoardLayer(l)).map((l) => l.id));
        const lk = partLookup(d.doc);
        const ids = d.doc.items
          .filter((it) => editable.has(it.layer))
          .filter((it) => {
            const b = itemBounds(it, lk);
            return crossing ? rectsIntersect(r, b) : rectContainsRect(r, b);
          })
          .map((i) => i.id);
        select(ids, g.mode);
        return;
      }
      case 'move':
        if (g.started) endGesture();
        return;
      case 'endpoint':
      case 'resize':
        endGesture();
        return;
      case 'shape': {
        setPreview({});
        const r = normRect(g.start.x, g.start.y, g.cur.x, g.cur.y);
        const layer = editableLayer(d.doc, d.currentLayer);
        if (!layer || r.w < 2 || r.h < 2) return;
        const st = useStore.getState().drawStyle;
        const base = { id: uid(), layer, x: r.x, y: r.y, w: r.w, h: r.h, color: st.color, thickness: st.thickness, style: st.shapeStyle };
        addItems([g.shape === 'box' ? { ...base, kind: 'box' } : { ...base, kind: 'ellipse', startAngle: 0, arcAngle: 360 }]);
        return;
      }
      case 'measure':
        return;
      default:
        return;
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const d = activeDoc();
    if (!d || useStore.getState().tool !== 'select') return;
    const hit = hitTest(d, toWorld(e.clientX, e.clientY));
    if (hit) window.dispatchEvent(new CustomEvent('bb:focus-props', { detail: hit.kind === 'text' ? 'text' : 'name' }));
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const d = activeDoc();
    if (!d) return;
    const s = useStore.getState();
    if (chainStart.current || s.tool === 'place') {
      chainStart.current = null;
      setPreview({});
      if (s.tool === 'place') setTool('select');
      return;
    }
    const raw = toWorld(e.clientX, e.clientY);
    const hit = hitTest(d, raw);
    if (hit && !d.selection.includes(hit.id)) select([hit.id]);
    const rect = wrapRef.current!.getBoundingClientRect();
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, onItem: !!hit || d.selection.length > 0 });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const payload = takeDragPayload();
    const d = activeDoc();
    if (!payload || !d) return;
    const layer = editableLayer(d.doc, d.currentLayer);
    if (!layer) return;
    const item = makePlacedItem(d.doc, payload, toWorld(e.clientX, e.clientY), layer, useStore.getState().settings.snap, lookup);
    if (!item) return;
    addItems([item], item.kind === 'part' && !d.doc.parts[item.ref] ? { [item.ref]: lookup(item.ref)! } : undefined);
  };

  // ---- render ------------------------------------------------------------------------------------
  const flags: RenderFlags = useMemo(
    () => ({ showNames: settings.showNames, showValues: settings.showValues, showPins: settings.showPins || tool === 'wire', mirror: !!ds?.mirror }),
    [settings.showNames, settings.showValues, settings.showPins, tool, ds?.mirror],
  );

  const byLayer = useMemo(() => {
    const m = new Map<string, Item[]>();
    if (!ds) return m;
    for (const it of ds.doc.items) {
      const arr = m.get(it.layer);
      if (arr) arr.push(it);
      else m.set(it.layer, [it]);
    }
    return m;
  }, [ds?.doc.items]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ds) return <div ref={wrapRef} className="h-full w-full" />;

  const { doc, view } = ds;
  const z = view.zoom;
  const selected = new Set(ds.selection);
  const mirrorT = ds.mirror ? `translate(${doc.width} 0) scale(-1 1)` : undefined;
  const cursor =
    tool === 'pan' || spaceDown ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : tool === 'check' ? 'help' : 'crosshair';
  const netWires = new Set(preview.net?.wires);

  return (
    <div
      ref={wrapRef}
      className="bb-canvas relative h-full w-full overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPointerLeave={() => useCursor.setState({ inside: false })}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        role="application"
        aria-label={t('canvas.label')}
      >
        <g transform={`translate(${view.panX} ${view.panY}) scale(${z})`}>
          <rect x={-2} y={-2} width={doc.width + 4} height={doc.height + 4} rx={3} className="bb-board-shadow" />
          <g transform={mirrorT}>
            {[...doc.layers].reverse().map((layer) => {
              if (!layer.visible) return null;
              const items = byLayer.get(layer.id) ?? [];
              const bottom = layer.name.toLowerCase() === 'bottom';
              const layerColor = settings.useLayerColor ? layer.color : undefined;
              return (
                <g key={layer.id} opacity={isBoardLayer(layer) ? 1 : layer.opacity}>
                  {isBoardLayer(layer) && (
                    <BoardBackground
                      idPrefix={ds.id}
                      width={doc.width}
                      height={doc.height}
                      type={doc.type}
                      backgroundImage={doc.backgroundImage}
                      opacity={layer.opacity}
                      grid={settings.grid}
                      solderSide={ds.mirror}
                    />
                  )}
                  {items.map((it) => (
                    <ItemView
                      key={it.id}
                      item={it}
                      part={it.kind === 'part' ? lookup(it.ref) : undefined}
                      flags={flags}
                      layerColor={it.kind === 'line' ? layerColor : undefined}
                      bottomLayer={bottom}
                    />
                  ))}
                </g>
              );
            })}

            {/* overlays */}
            <g className="bb-overlay" pointerEvents="none">
              {preview.net &&
                doc.items
                  .filter((i): i is LineItem => i.kind === 'line' && netWires.has(i.id))
                  .map((l) => <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#22c55e" strokeOpacity={0.75} strokeWidth={l.thickness + 6 / z} strokeLinecap="round" />)}
              {preview.net?.pins.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={6 / z + 2} fill="#22c55e" fillOpacity={0.8} />)}

              {doc.items
                .filter((i) => selected.has(i.id))
                .map((it) => (
                  <SelectionOverlay key={it.id} item={it} z={z} single={ds.selection.length === 1} lookup={lookup} />
                ))}

              {preview.ghost && (
                <g opacity={0.6}>
                  <ItemView item={preview.ghost} part={preview.ghost.kind === 'part' ? lookup(preview.ghost.ref) : undefined} flags={flags} bottomLayer={false} />
                </g>
              )}
              {preview.chain && (tool === 'wire' ? (
                <line
                  x1={preview.chain.from.x}
                  y1={preview.chain.from.y}
                  x2={preview.chain.to.x}
                  y2={preview.chain.to.y}
                  stroke={drawStyle.color}
                  strokeOpacity={0.7}
                  strokeWidth={drawStyle.thickness}
                  strokeLinecap="round"
                />
              ) : (
                <line x1={preview.chain.from.x} y1={preview.chain.from.y} x2={preview.chain.to.x} y2={preview.chain.to.y} stroke="#6b7280" strokeWidth={2.5} strokeDasharray={`${4 / z} ${3 / z}`} />
              ))}
              {preview.chain && <circle cx={preview.chain.from.x} cy={preview.chain.from.y} r={3 / z + 1} fill="var(--bb-accent)" />}
              {preview.snapPin && <rect x={preview.snapPin.x - 7} y={preview.snapPin.y - 7} width={14} height={14} fill="none" stroke="var(--bb-accent)" strokeWidth={1.5 / z} />}
              {preview.shape &&
                (preview.shape.shape === 'box' ? (
                  <rect {...rectAttrs(preview.shape.r)} fill={drawStyle.shapeStyle === 'OUTLINED' ? 'none' : drawStyle.color} fillOpacity={0.5} stroke={drawStyle.color} strokeWidth={drawStyle.thickness} />
                ) : (
                  <ellipse
                    cx={preview.shape.r.x + preview.shape.r.w / 2}
                    cy={preview.shape.r.y + preview.shape.r.h / 2}
                    rx={preview.shape.r.w / 2}
                    ry={preview.shape.r.h / 2}
                    fill={drawStyle.shapeStyle === 'OUTLINED' ? 'none' : drawStyle.color}
                    fillOpacity={0.5}
                    stroke={drawStyle.color}
                    strokeWidth={drawStyle.thickness}
                  />
                ))}
              {preview.measure && <MeasureOverlay a={preview.measure.a} b={preview.measure.b} z={z} mirrored={ds.mirror} />}
              {preview.marquee && (
                <rect
                  {...rectAttrs(preview.marquee)}
                  fill="var(--bb-accent)"
                  fillOpacity={0.08}
                  stroke="var(--bb-accent)"
                  strokeWidth={1 / z}
                  strokeDasharray={preview.marquee.crossing ? `${4 / z} ${3 / z}` : undefined}
                />
              )}
            </g>
          </g>
          <rect x={0} y={0} width={doc.width} height={doc.height} fill="none" stroke={ds.mirror ? '#ef4444' : 'var(--bb-board-border)'} strokeWidth={1.5 / z} pointerEvents="none" />
        </g>
      </svg>
      {ds.mirror && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-red-500/90 px-2 py-1 text-xs font-semibold text-white shadow">{t('status.solderSide')}</div>
      )}
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function rectAttrs(r: Rect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

/** Shift constrains wires to 0/45/90 degrees. */
function constrain(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const a = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const sa = Math.round(a / step) * step;
  const len = Math.abs(Math.cos(sa)) > 0.5 && Math.abs(Math.sin(sa)) > 0.5 ? Math.max(Math.abs(dx), Math.abs(dy)) * Math.SQRT2 : Math.hypot(dx, dy);
  return { x: Math.round(from.x + Math.cos(sa) * len), y: Math.round(from.y + Math.sin(sa) * len) };
}

function SelectionOverlay({ item, z, single, lookup }: { item: Item; z: number; single: boolean; lookup: (r: string) => PartDef | undefined }) {
  const hs = HANDLE_PX / z;
  if (isTwoPoint(item)) {
    return (
      <g>
        <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="var(--bb-accent)" strokeOpacity={0.45} strokeWidth={(item.kind === 'line' ? item.thickness : 10) + 4 / z} strokeLinecap="round" />
        {single &&
          [
            [item.x1, item.y1],
            [item.x2, item.y2],
          ].map(([x, y], i) => <rect key={i} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#fff" stroke="var(--bb-accent)" strokeWidth={1.5 / z} />)}
      </g>
    );
  }
  const r = itemBounds(item, lookup);
  const pad = 2 / z;
  return (
    <g>
      <rect x={r.x - pad} y={r.y - pad} width={r.w + 2 * pad} height={r.h + 2 * pad} fill="var(--bb-accent)" fillOpacity={0.06} stroke="var(--bb-accent)" strokeWidth={1.5 / z} />
      {single &&
        (item.kind === 'box' || item.kind === 'ellipse') &&
        [
          [r.x, r.y],
          [r.x + r.w, r.y],
          [r.x + r.w, r.y + r.h],
          [r.x, r.y + r.h],
        ].map(([x, y], i) => <rect key={i} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#fff" stroke="var(--bb-accent)" strokeWidth={1.5 / z} />)}
    </g>
  );
}

function MeasureOverlay({ a, b, z, mirrored }: { a: Pt; b: Pt; z: number; mirrored: boolean }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const mm = len * MM_PER_UNIT;
  const holes = len / RASTER;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const fs = 12 / z;
  const label = `${mm.toFixed(2)} mm · ${holes.toFixed(holes % 1 ? 2 : 0)} RM`;
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f43f5e" strokeWidth={2 / z} />
      <circle cx={a.x} cy={a.y} r={3 / z} fill="#f43f5e" />
      <circle cx={b.x} cy={b.y} r={3 / z} fill="#f43f5e" />
      <g transform={mirrored ? `translate(${2 * mx} 0) scale(-1 1)` : undefined}>
        <rect x={mx - (label.length * fs * 0.3)} y={my - fs * 2} width={label.length * fs * 0.6} height={fs * 1.5} rx={fs * 0.3} fill="#111827" fillOpacity={0.85} />
        <text x={mx} y={my - fs * 0.85} fontSize={fs} fill="#fff" textAnchor="middle" fontFamily="Inter, Arial, sans-serif">
          {label}
        </text>
      </g>
    </g>
  );
}
