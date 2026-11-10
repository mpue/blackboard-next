import { useMemo, useState, type ReactNode } from 'react';
import { activeDoc, addItems, toast, useStore } from '../store/store.ts';
import { translate, useT, type I18nKey } from '../i18n/i18n.ts';
import type { Item } from '../model/types.ts';
import { MM_PER_UNIT, RASTER } from '../model/types.ts';
import { uid } from '../model/id.ts';
import { inflate, shapeBounds, snapTo, unionRect, type Rect } from '../geometry/geom.ts';
import { editableLayer } from '../editor/placement.ts';
import { DEFAULT_SCALE, SCALE_PRESETS, scaleShapes, type ScaleParams } from '../editor/scale.ts';
import { ShapeView } from '../render/shapes.tsx';
import { Button, Check, ColorInput, Dialog, NumberInput, cx } from './primitives.tsx';

const KEY = 'blackboard.scale.v1';

function loadParams(): ScaleParams {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SCALE, ...JSON.parse(raw) } : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

function saveParams(p: ScaleParams) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

function useFormat() {
  const lang = useStore((s) => s.settings.lang);
  return useMemo(() => {
    const f = new Intl.NumberFormat(lang, { maximumFractionDigits: 3, useGrouping: false });
    return (v: number) => f.format(Math.abs(v) < 1e-9 ? 0 : v);
  }, [lang]);
}

/** a form row with room for the longer labels of this dialog */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[140px_1fr] items-center gap-2">
      <span className="text-[11.5px] text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </label>
  );
}

/** Adds the scale to the active document, centred in the visible part of the canvas. */
function insertScale(p: ScaleParams, format: (v: number) => string) {
  const ds = activeDoc();
  if (!ds) return;
  const layer = editableLayer(ds.doc, ds.currentLayer);
  if (!layer) {
    toast(translate(useStore.getState().settings.lang, 'scale.noLayer'), 'error');
    return;
  }
  const r = document.querySelector('.bb-canvas')?.getBoundingClientRect();
  const { zoom, panX, panY } = ds.view;
  const c = {
    x: snapTo(((r?.width ?? 800) / 2 - panX) / zoom, RASTER),
    y: snapTo(((r?.height ?? 600) / 2 - panY) / zoom, RASTER),
  };
  const items = scaleShapes(p, c, format).map((s) => ({ ...s, id: uid(), layer }) as Item);
  addItems(items);
}

export function ScaleDesigner({ onClose }: { onClose: () => void }) {
  const t = useT();
  const format = useFormat();
  const [p, setP] = useState<ScaleParams>(loadParams);
  const set = (patch: Partial<ScaleParams>) => setP((cur) => ({ ...cur, ...patch }));
  const shapes = useMemo(() => scaleShapes(p, { x: 0, y: 0 }, format), [p, format]);
  const vb = useMemo(() => inflate(shapes.reduce<Rect | undefined>((r, s) => unionRect(r, shapeBounds(s)), undefined) ?? { x: -50, y: -50, w: 100, h: 100 }, 8), [shapes]);
  const size = Math.max(vb.w, vb.h) * MM_PER_UNIT;
  const num = (key: keyof ScaleParams, label: I18nKey, opts: { step?: number; min?: number; max?: number; suffix?: string } = {}) => (
    <Row label={t(label)}>
      <NumberInput value={p[key] as number} onCommit={(v) => set({ [key]: v })} {...opts} />
    </Row>
  );
  return (
    <Dialog
      title={t('scale.title')}
      onClose={onClose}
      width={860}
      footer={
        <>
          <Button className="mr-auto" variant="ghost" onClick={() => setP(DEFAULT_SCALE)}>
            {t('scale.reset')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              saveParams(p);
              insertScale(p, format);
              onClose();
            }}
          >
            {t('scale.insert')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-muted">{t('scale.hint')}</p>
      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-2">
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-line bg-white p-2">
            <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="h-full w-full" role="img" aria-label={t('scale.preview')}>
              {shapes.map((s, i) => (
                <ShapeView key={i} s={s} />
              ))}
            </svg>
          </div>
          <p className="text-center text-[11px] text-muted">{t('scale.size', { mm: format(Math.round(size)) })}</p>
          <div className="flex flex-wrap justify-center gap-1">
            {SCALE_PRESETS.map((pr) => (
              <button
                key={pr.id}
                className={cx(
                  'h-7 rounded-md border px-2 text-[11.5px]',
                  p.start === pr.start && p.sweep === pr.sweep ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-hover',
                )}
                onClick={() => set({ start: pr.start, sweep: pr.sweep })}
              >
                {t(`scale.preset.${pr.id}` as I18nKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('scale.shape')}</h3>
          {num('start', 'scale.start', { min: -360, max: 360, suffix: '°' })}
          {num('sweep', 'scale.sweep', { min: 1, max: 360, suffix: '°' })}
          {num('radius', 'scale.radius', { step: 0.5, min: 1, max: 500, suffix: 'mm' })}
          <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('scale.ticks')}</h3>
          {num('steps', 'scale.steps', { min: 1, max: 200 })}
          {num('minor', 'scale.minor', { min: 0, max: 50 })}
          {num('majorLength', 'scale.majorLength', { step: 0.5, min: 0.1, suffix: 'mm' })}
          {num('minorLength', 'scale.minorLength', { step: 0.5, min: 0.1, suffix: 'mm' })}
          {num('thickness', 'scale.thickness', { step: 0.5, min: 0.25, max: 20 })}
          {num('minorThickness', 'scale.minorThickness', { step: 0.5, min: 0.25, max: 20 })}
          <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('scale.captions')}</h3>
          <div className="pl-[148px]">
            <Check checked={p.captions} onChange={(v) => set({ captions: v })} label={t('scale.showCaptions')} />
          </div>
          {p.captions && (
            <>
              {num('startValue', 'scale.startValue', { step: 1 })}
              {num('stepValue', 'scale.stepValue', { step: 0.1 })}
              {num('fontSize', 'scale.fontSize', { min: 4, max: 72 })}
              <div className="pl-[148px]">
                <Check checked={p.captionsInside} onChange={(v) => set({ captionsInside: v })} label={t('scale.inside')} />
              </div>
            </>
          )}
          <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('scale.extras')}</h3>
          <div className="pl-[148px]">
            <Check checked={p.arc} onChange={(v) => set({ arc: v })} label={t('scale.arc')} />
          </div>
          {num('hole', 'scale.hole', { step: 0.5, min: 0, suffix: 'mm' })}
          <Row label={t('props.color')}>
            <ColorInput value={p.color} onChange={(c) => set({ color: c })} />
          </Row>
        </div>
      </div>
    </Dialog>
  );
}
