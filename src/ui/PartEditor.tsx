import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ImagePlus, Maximize, Minus, Plus, Trash2, X } from 'lucide-react';
import { activeDoc, startPlacement, toast } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import type { PartDef, Pin } from '../model/types.ts';
import { MM_PER_UNIT, RASTER } from '../model/types.ts';
import { emptyPart, isUserPart, readImageFile, saveUserPart } from '../editor/partActions.ts';
import { Button, Check, Field, IconButton, NumberInput, cx } from './primitives.tsx';

const MARGIN = RASTER;
const HALF = RASTER / 2;

const mm = (units: number) => Math.round(units * MM_PER_UNIT * 100) / 100;
const fromMm = (v: number) => Math.max(4, Math.round(v / MM_PER_UNIT));

/**
 * The part editor: a picture of the component, its size on the raster and its
 * pins (where wires connect and solder joints sit). Clicking the picture sets
 * a pin, pins are dragged into place.
 */
export function PartEditor({ initial, itemId, onClose }: { initial?: PartDef; itemId?: string; onClose: () => void }) {
  const t = useT();
  const start = useRef(initial ?? emptyPart());
  const [def, setDef] = useState<PartDef>(start.current);
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(2);
  const [snap, setSnap] = useState(true);
  const [lockAspect, setLockAspect] = useState(true);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; id: number } | null>(null);
  const isNew = !initial?.file;
  const copy = !!initial?.file && !isUserPart(initial);
  const step = snap ? HALF : 1;
  const patch = (p: Partial<PartDef>) => setDef((d) => ({ ...d, ...p }));
  const setPins = (fn: (pins: Pin[]) => Pin[]) => setDef((d) => ({ ...d, pins: fn(d.pins) }));

  const fit = useCallback(() => {
    const el = area.current;
    if (!el) return;
    const k = Math.min((el.clientWidth - 24) / (def.width + 2 * MARGIN), (el.clientHeight - 24) / (def.height + 2 * MARGIN));
    setZoom(Math.min(8, Math.max(0.25, k)));
  }, [def.width, def.height]);
  // fit once the dialog has its size
  useLayoutEffect(() => fit(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (def !== start.current && !window.confirm(t('part.discard'))) return;
    onClose();
  };

  const loadFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const img = await readImageFile(file);
      // the classic library draws one image pixel per board unit; large photos start ten holes wide
      const k = Math.max(img.width, img.height) > 640 ? (RASTER * 10) / Math.max(img.width, img.height) : 1;
      const width = Math.max(4, Math.round(img.width * k));
      const height = Math.max(4, Math.round(img.height * k));
      setDef((d) => ({ ...d, image: img.url, width, height, name: d.name || file.name.replace(/\.[^.]+$/, '') }));
      requestAnimationFrame(() => {
        const el = area.current;
        if (el) setZoom(Math.min(8, Math.max(0.25, Math.min((el.clientWidth - 24) / (width + 2 * MARGIN), (el.clientHeight - 24) / (height + 2 * MARGIN)))));
      });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const resize = (w: number, h: number) =>
    setDef((d) => ({
      ...d,
      width: w,
      height: h,
      // pins stay on the leads of the picture (and on the raster)
      pins: d.pins.map((p) => ({
        ...p,
        x: Math.min(w, Math.round((p.x * w) / d.width / step) * step),
        y: Math.min(h, Math.round((p.y * h) / d.height / step) * step),
      })),
    }));

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    const vw = def.width + 2 * MARGIN;
    const vh = def.height + 2 * MARGIN;
    return { x: ((e.clientX - r.left) / r.width) * vw - MARGIN, y: ((e.clientY - r.top) / r.height) * vh - MARGIN };
  };
  const snapPt = (p: { x: number; y: number }) => ({
    x: Math.min(def.width, Math.max(0, Math.round(p.x / step) * step)),
    y: Math.min(def.height, Math.max(0, Math.round(p.y / step) * step)),
  });

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !def.image) return;
    const p = local(e);
    // the nearest pin within reach, so close pins can still be told apart
    let hit = -1;
    let best = Math.max(5, 12 / zoom);
    def.pins.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= best) [hit, best] = [i, d];
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit >= 0) {
      setSel(hit);
      drag.current = { index: hit, id: e.pointerId };
      return;
    }
    if (p.x < -HALF || p.y < -HALF || p.x > def.width + HALF || p.y > def.height + HALF) {
      setSel(null);
      return;
    }
    const at = snapPt(p);
    const num = def.pins.reduce((m, q) => Math.max(m, q.num), 0) + 1;
    setPins((pins) => [...pins, { num, name: String(num), x: at.x, y: at.y }]);
    setSel(def.pins.length);
    drag.current = { index: def.pins.length, id: e.pointerId };
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const at = snapPt(local(e));
    setPins((pins) => pins.map((q, i) => (i === d.index && (q.x !== at.x || q.y !== at.y) ? { ...q, ...at } : q)));
  };
  const onUp = () => (drag.current = null);

  const removePin = (i: number) => {
    setPins((pins) => pins.filter((_, k) => k !== i));
    setSel(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || sel === null) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removePin(sel);
      }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) {
        e.preventDefault();
        setPins((pins) => pins.map((q, i) => (i === sel ? { ...q, ...snapPt({ x: q.x + d[0] * step, y: q.y + d[1] * step }) } : q)));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const nums = def.pins.map((p) => p.num);
  const duplicate = nums.find((n, i) => nums.indexOf(n) !== i);
  const problem = !def.image ? t('part.needImage') : !def.name.trim() ? t('part.needName') : duplicate !== undefined ? t('part.duplicatePin', { num: duplicate }) : null;

  const save = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const saved = await saveUserPart({ ...def, name: def.name.trim(), designator: def.designator.trim() || 'U' }, itemId);
      toast(t('part.saved', { name: saved.name }), 'success');
      onClose();
      // a new part goes straight onto the board
      const ds = activeDoc();
      if (!itemId && (isNew || copy) && ds && ds.doc.type !== 'PCB') startPlacement({ kind: 'part', ref: saved.file });
    } catch (e) {
      toast((e as Error).message, 'error');
      setSaving(false);
    }
  };

  const holes = (v: number) => Math.round((v / RASTER) * 10) / 10;
  const vw = def.width + 2 * MARGIN;
  const vh = def.height + 2 * MARGIN;
  const pinR = Math.max(2.5, 5 / zoom);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label={t('part.editorTitle')} className="bb-pop flex h-full max-h-[94vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-line bg-panel text-fg shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="min-w-0 truncate text-[14px] font-semibold">
            {isNew ? t('part.newTitle') : t('part.editTitle')}
            {def.name && <span className="ml-2 text-[12px] font-normal text-muted">{def.name}</span>}
          </h2>
          <IconButton icon={X} label={t('common.close')} onClick={close} />
        </header>
        {copy && <p className="border-b border-line bg-accent-soft px-4 py-2 text-[12px] text-accent">{t('part.copyHint')}</p>}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-[280px] min-w-0 flex-1 flex-col border-line max-md:border-b md:border-r">
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
              <Button icon={ImagePlus} onClick={() => fileInput.current?.click()}>
                {def.image ? t('part.replaceImage') : t('part.loadImage')}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  void loadFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="mx-1 h-5 w-px bg-line" />
              <IconButton icon={Minus} label={t('view.zoomOut')} onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} />
              <span className="w-12 text-center text-[11.5px] tabular-nums text-muted">{Math.round(zoom * 100)} %</span>
              <IconButton icon={Plus} label={t('view.zoomIn')} onClick={() => setZoom((z) => Math.min(8, z * 1.25))} />
              <IconButton icon={Maximize} label={t('view.fit')} onClick={fit} />
              <div className="mx-1 h-5 w-px bg-line" />
              <Check checked={snap} onChange={setSnap} label={t('part.snap')} />
              <span className="ml-auto hidden text-[11px] text-muted lg:inline">{t('part.canvasHint')}</span>
            </div>
            <div
              ref={area}
              className={cx('bb-scroll relative min-h-0 flex-1 overflow-auto bg-panel-2', over && 'outline-2 -outline-offset-4 outline-dashed outline-accent')}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void loadFile(e.dataTransfer.files[0]);
              }}
            >
              {def.image ? (
                <div className="flex min-h-full min-w-full items-center justify-center p-3" style={{ width: 'max-content' }}>
                  <svg
                    ref={svgRef}
                    width={vw * zoom}
                    height={vh * zoom}
                    viewBox={`${-MARGIN} ${-MARGIN} ${vw} ${vh}`}
                    className="cursor-crosshair touch-none select-none"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    role="img"
                    aria-label={t('part.picture')}
                  >
                    <defs>
                      <pattern id="pe-holes" width={RASTER} height={RASTER} patternUnits="userSpaceOnUse" x={0} y={0}>
                        <circle cx={HALF} cy={HALF} r={1.1} fill="#64748b" fillOpacity={0.55} />
                      </pattern>
                    </defs>
                    <rect x={0} y={0} width={def.width} height={def.height} fill="#ffffff" />
                    <image href={def.image} x={0} y={0} width={def.width} height={def.height} preserveAspectRatio="none" />
                    {snap && <rect x={0} y={0} width={def.width} height={def.height} fill="url(#pe-holes)" pointerEvents="none" />}
                    <rect x={0} y={0} width={def.width} height={def.height} fill="none" stroke="var(--bb-accent)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
                    {def.pins.map((p, i) => (
                      <g key={i}>
                        {i === sel && <circle cx={p.x} cy={p.y} r={pinR * 1.9} fill="none" stroke="#f59e0b" strokeWidth={1.6 / zoom} />}
                        <circle cx={p.x} cy={p.y} r={pinR} fill="#ef4444" fillOpacity={0.85} stroke="#fff" strokeWidth={1 / zoom} />
                        <text x={p.x + pinR * 1.4} y={p.y - pinR * 1.2} fontSize={Math.max(5, 10 / zoom)} fontFamily="Inter, system-ui, sans-serif" fill="#b91c1c" paintOrder="stroke" stroke="#ffffffdd" strokeWidth={2 / zoom} pointerEvents="none">
                          {p.name || p.num}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              ) : (
                <button
                  className="absolute inset-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-muted hover:border-accent hover:text-accent"
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={28} />
                  <span className="text-[13px] font-medium">{t('part.loadImage')}</span>
                  <span className="max-w-sm text-center text-[11.5px]">{t('part.imageHint')}</span>
                </button>
              )}
            </div>
          </div>
          <div className="bb-scroll w-full shrink-0 overflow-y-auto p-3 max-md:max-h-[40vh] md:w-[340px]">
            <div className="grid gap-2">
              <Field label={t('part.name')}>
                <input className="bb-input" value={def.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label={t('part.description')}>
                <input className="bb-input" value={def.description} onChange={(e) => patch({ description: e.target.value })} />
              </Field>
              <Field label={t('part.package')}>
                <input className="bb-input" value={def.packageType} placeholder="DIL8, TO-92 …" onChange={(e) => patch({ packageType: e.target.value })} />
              </Field>
              <Field label={t('part.designator')}>
                <input className="bb-input" value={def.designator} placeholder="U, IC, Q …" onChange={(e) => patch({ designator: e.target.value })} />
              </Field>
              <Field label={t('part.author')}>
                <input className="bb-input" value={def.author ?? ''} onChange={(e) => patch({ author: e.target.value })} />
              </Field>
              <Field label={t('part.license')}>
                <input className="bb-input" value={def.license ?? ''} onChange={(e) => patch({ license: e.target.value })} />
              </Field>
            </div>
            <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('part.size')}</h3>
            <div className="grid gap-2">
              <Field label={t('part.width')}>
                <NumberInput value={mm(def.width)} step={2.54} min={0.5} suffix="mm" onCommit={(v) => resize(fromMm(v), lockAspect ? Math.max(4, Math.round((fromMm(v) * def.height) / def.width)) : def.height)} />
              </Field>
              <Field label={t('part.height')}>
                <NumberInput value={mm(def.height)} step={2.54} min={0.5} suffix="mm" onCommit={(v) => resize(lockAspect ? Math.max(4, Math.round((fromMm(v) * def.width) / def.height)) : def.width, fromMm(v))} />
              </Field>
              <div className="pl-[100px]">
                <Check checked={lockAspect} onChange={setLockAspect} label={t('part.keepAspect')} />
              </div>
              <p className="text-[11px] leading-relaxed text-muted">{t('part.sizeHint', { w: holes(def.width), h: holes(def.height) })}</p>
            </div>
            <h3 className="mb-2 mt-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>
                {t('part.pins')} <span className="font-normal normal-case">({def.pins.length})</span>
              </span>
              {def.pins.length > 0 && (
                <button className="text-[11px] font-normal normal-case tracking-normal text-accent hover:underline" onClick={() => (setPins(() => []), setSel(null))}>
                  {t('part.removeAllPins')}
                </button>
              )}
            </h3>
            {!def.pins.length ? (
              <p className="text-[11.5px] leading-relaxed text-muted">{t('part.pinsHint')}</p>
            ) : (
              <ul className="grid gap-1">
                {def.pins.map((p, i) => (
                  <li key={i} className={cx('grid grid-cols-[52px_1fr_auto] items-center gap-1.5 rounded-md p-1', i === sel ? 'bg-accent-soft' : 'hover:bg-hover')} onClick={() => setSel(i)}>
                    <input
                      className="bb-input px-1.5 tabular-nums"
                      inputMode="numeric"
                      aria-label={t('part.pinNumber')}
                      value={p.num}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (Number.isFinite(n)) setPins((pins) => pins.map((q, k) => (k === i ? { ...q, num: n } : q)));
                      }}
                    />
                    <input className="bb-input" aria-label={t('part.pinName')} value={p.name ?? ''} onChange={(e) => setPins((pins) => pins.map((q, k) => (k === i ? { ...q, name: e.target.value } : q)))} />
                    <IconButton icon={Trash2} label={t('part.removePin')} className="h-7 w-7" size={13} onClick={() => removePin(i)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-panel-2 px-4 py-3">
          {problem && <span className="mr-auto text-[12px] text-muted">{problem}</span>}
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!!problem || saving} onClick={() => void save()}>
            {t('part.save')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
