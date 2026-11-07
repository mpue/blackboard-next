import { useEffect } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Trash2, ArrowUp, ArrowDown, CopyPlus, Minus } from 'lucide-react';
import type { Draft } from 'immer';
import {
  activeDoc,
  addLayer,
  deleteLayer,
  duplicateLayer,
  moveLayer,
  selectedItems,
  setCurrentLayer,
  updateDrawStyle,
  updateItems,
  updateLayer,
  useStore,
} from '../store/store.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import type { DiodeType, EdgeType, Item, ShapeStyle, SpiceType, SymbolItem, TextType } from '../model/types.ts';
import { isBoardLayer, MM_PER_UNIT } from '../model/types.ts';
import { formatOhm, parseEng } from '../model/ops.ts';
import { resistorBands } from '../render/resistorColors.ts';
import { Check, Field, IconButton, NumberInput, Section, Select, TextArea, TextInput, cx } from './primitives.tsx';

const EDGES: EdgeType[] = ['STRAIGHT', 'ROUND_DOT', 'SIMPLE_ARROW'];
const STYLES: ShapeStyle[] = ['OUTLINED', 'FILLED', 'OUTLINED_FILLED'];
const TEXT_TYPES: TextType[] = ['TEXT', 'NAME', 'VALUE', 'SPICE_DIRECTIVE', 'CONTROL'];
const SPICE_TYPES: SpiceType[] = ['RESISTOR', 'CAPACITOR', 'INDUCTOR', 'DIODE', 'NPN', 'PNP', 'MOSFET', 'VOLTAGE_SOURCE', 'SUBCIRCUIT', 'VOLTAGE_CONTROLLED_SWITCH'];
const THICKNESS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

export function RightPanel() {
  return (
    <aside className="bb-scroll flex w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-panel">
      <PropertiesPanel />
      <LayersPanel />
    </aside>
  );
}

function useFocusEvents() {
  useEffect(() => {
    const onFocus = (e: Event) => {
      const which = (e as CustomEvent<string>).detail;
      requestAnimationFrame(() => {
        const el = document.getElementById(which === 'text' ? 'bb-prop-text' : 'bb-prop-name') as HTMLInputElement | null;
        el?.focus();
        el?.select?.();
      });
    };
    window.addEventListener('bb:focus-props', onFocus);
    return () => window.removeEventListener('bb:focus-props', onFocus);
  }, []);
}

function PropertiesPanel() {
  const t = useT();
  useFocusEvents();
  const ds = useStore((s) => activeDoc(s));
  if (!ds) return null;
  const items = selectedItems(ds);
  if (!items.length) return <DrawStyleSection />;
  if (items.length > 1) {
    const lines = items.filter((i) => i.kind === 'line' || i.kind === 'box' || i.kind === 'ellipse');
    return (
      <Section title={t('props.multiple', { count: items.length })}>
        <LayerField items={items} />
        {lines.length > 0 && (
          <>
            <Field label={t('props.color')}>
              <ColorInput value={'color' in lines[0] ? lines[0].color : '#000000'} onChange={(c) => edit(lines, (i) => 'color' in i && (i.color = c))} />
            </Field>
            <Field label={t('props.thickness')}>
              <Select value={'thickness' in lines[0] ? lines[0].thickness : 2} options={THICKNESS.map((v) => ({ value: v, label: `${v}` }))} onChange={(v) => edit(lines, (i) => 'thickness' in i && (i.thickness = v))} />
            </Field>
          </>
        )}
      </Section>
    );
  }
  return <ItemProperties item={items[0]} />;
}

function edit(items: Item[], fn: (it: Draft<Item>) => void) {
  updateItems(
    items.map((i) => i.id),
    fn,
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input type="color" className="bb-color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="color" />
      <div className="flex flex-wrap gap-1">
        {['#000000', '#1d4ed8', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#6b7280'].map((c) => (
          <button key={c} className={cx('h-4 w-4 rounded-full border border-black/10', value === c && 'ring-2 ring-accent ring-offset-1 ring-offset-panel')} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
        ))}
      </div>
    </>
  );
}

function LayerField({ items }: { items: Item[] }) {
  const t = useT();
  const layers = useStore((s) => activeDoc(s)!.doc.layers);
  return (
    <Field label={t('props.layer')}>
      <Select
        value={items.every((i) => i.layer === items[0].layer) ? items[0].layer : ''}
        options={[...(items.every((i) => i.layer === items[0].layer) ? [] : [{ value: '', label: '–' }]), ...layers.filter((l) => !isBoardLayer(l)).map((l) => ({ value: l.id, label: l.name }))]}
        onChange={(v) => v && edit(items, (i) => (i.layer = v))}
      />
    </Field>
  );
}

function DrawStyleSection() {
  const t = useT();
  const st = useStore((s) => s.drawStyle);
  return (
    <Section title={t('props.drawStyle')}>
      <p className="-mt-1 text-[11.5px] text-muted">{t('props.nothing')}</p>
      <Field label={t('props.color')}>
        <ColorInput value={st.color} onChange={(color) => updateDrawStyle({ color })} />
      </Field>
      <Field label={t('props.thickness')}>
        <Select value={st.thickness} options={THICKNESS.map((v) => ({ value: v, label: `${v}` }))} onChange={(thickness) => updateDrawStyle({ thickness })} />
      </Field>
      <Field label={t('props.start')}>
        <Select value={st.startType} options={EDGES.map((v) => ({ value: v, label: t(`edge.${v}`) }))} onChange={(startType) => updateDrawStyle({ startType })} />
      </Field>
      <Field label={t('props.end')}>
        <Select value={st.endType} options={EDGES.map((v) => ({ value: v, label: t(`edge.${v}`) }))} onChange={(endType) => updateDrawStyle({ endType })} />
      </Field>
      <Field label={t('props.style')}>
        <Select value={st.shapeStyle} options={STYLES.map((v) => ({ value: v, label: t(`style.${v}`) }))} onChange={(shapeStyle) => updateDrawStyle({ shapeStyle })} />
      </Field>
      <Field label={t('props.fontSize')}>
        <NumberInput value={st.fontSize} min={4} max={200} onCommit={(fontSize) => updateDrawStyle({ fontSize })} suffix="pt" />
      </Field>
    </Section>
  );
}

function ItemProperties({ item }: { item: Item }) {
  const t = useT();
  const set = (fn: (it: Draft<Item>) => void) => edit([item], fn);
  const kindLabel: Record<Item['kind'], I18nKey> = {
    line: 'tool.wire',
    box: 'tool.box',
    ellipse: 'tool.ellipse',
    text: 'tool.text',
    resistor: 'tool.resistor',
    diode: 'tool.diode',
    part: 'lib.parts',
    symbol: 'lib.symbols',
  };
  return (
    <Section title={`${t('props.title')} · ${t(kindLabel[item.kind])}`}>
      {(item.kind === 'part' || item.kind === 'resistor' || item.kind === 'diode' || item.kind === 'symbol') && (
        <Field label={t('props.name')}>
          <TextInput id="bb-prop-name" value={item.name} onCommit={(v) => set((i) => 'name' in i && (i.name = v))} />
        </Field>
      )}
      {item.kind === 'line' && (
        <>
          <Field label={t('props.color')}>
            <ColorInput value={item.color} onChange={(c) => set((i) => i.kind === 'line' && (i.color = c))} />
          </Field>
          <Field label={t('props.thickness')}>
            <Select value={item.thickness} options={THICKNESS.map((v) => ({ value: v, label: `${v}` }))} onChange={(v) => set((i) => i.kind === 'line' && (i.thickness = v))} />
          </Field>
          <Field label={t('props.start')}>
            <Select value={item.startType} options={EDGES.map((v) => ({ value: v, label: t(`edge.${v}`) }))} onChange={(v) => set((i) => i.kind === 'line' && (i.startType = v))} />
          </Field>
          <Field label={t('props.end')}>
            <Select value={item.endType} options={EDGES.map((v) => ({ value: v, label: t(`edge.${v}`) }))} onChange={(v) => set((i) => i.kind === 'line' && (i.endType = v))} />
          </Field>
          <Field label={t('props.length')}>
            <span className="text-[12px] tabular-nums">{(Math.hypot(item.x2 - item.x1, item.y2 - item.y1) * MM_PER_UNIT).toFixed(2)} mm</span>
          </Field>
        </>
      )}
      {(item.kind === 'box' || item.kind === 'ellipse') && (
        <>
          <Field label={t('props.color')}>
            <ColorInput value={item.color} onChange={(c) => set((i) => 'color' in i && (i.color = c))} />
          </Field>
          <Field label={t('props.style')}>
            <Select value={item.style} options={STYLES.map((v) => ({ value: v, label: t(`style.${v}`) }))} onChange={(v) => set((i) => 'style' in i && (i.style = v))} />
          </Field>
          <Field label={t('props.thickness')}>
            <Select value={item.thickness} options={THICKNESS.map((v) => ({ value: v, label: `${v}` }))} onChange={(v) => set((i) => 'thickness' in i && (i.thickness = v))} />
          </Field>
          <Field label={t('props.size')}>
            <NumberInput value={item.w} min={1} onCommit={(v) => set((i) => 'w' in i && (i.w = v))} />
            <NumberInput value={item.h} min={1} onCommit={(v) => set((i) => 'h' in i && (i.h = v))} />
          </Field>
          {item.kind === 'ellipse' && (
            <>
              <Field label={t('props.startAngle')}>
                <NumberInput value={item.startAngle} step={15} onCommit={(v) => set((i) => i.kind === 'ellipse' && (i.startAngle = v))} suffix="°" />
              </Field>
              <Field label={t('props.arcAngle')}>
                <NumberInput value={item.arcAngle} step={15} min={-360} max={360} onCommit={(v) => set((i) => i.kind === 'ellipse' && (i.arcAngle = v))} suffix="°" />
              </Field>
            </>
          )}
        </>
      )}
      {item.kind === 'text' && (
        <>
          <Field label={t('props.text')} wide>
            <TextArea id="bb-prop-text" value={item.text} mono={item.textType === 'SPICE_DIRECTIVE' || item.textType === 'CONTROL'} onCommit={(v) => set((i) => i.kind === 'text' && (i.text = v))} />
          </Field>
          <Field label={t('props.textType')}>
            <Select value={item.textType} options={TEXT_TYPES.map((v) => ({ value: v, label: t(`text.${v}`) }))} onChange={(v) => set((i) => i.kind === 'text' && (i.textType = v))} />
          </Field>
          <Field label={t('props.fontSize')}>
            <NumberInput value={item.fontSize} min={4} max={200} onCommit={(v) => set((i) => i.kind === 'text' && (i.fontSize = v))} suffix="pt" />
          </Field>
          <Field label={t('props.rotation')}>
            <NumberInput value={item.rotation} step={90} onCommit={(v) => set((i) => i.kind === 'text' && (i.rotation = v))} suffix="°" />
          </Field>
          <Field label={t('props.color')}>
            <ColorInput value={item.color} onChange={(c) => set((i) => i.kind === 'text' && (i.color = c))} />
          </Field>
        </>
      )}
      {item.kind === 'resistor' && (
        <>
          <Field label={t('props.value')}>
            <TextInput
              value={formatOhm(item.value).replace('Ω', '')}
              onCommit={(v) => {
                const n = parseEng(v.replace(/Ω/g, ''));
                if (n !== undefined && n > 0) set((i) => i.kind === 'resistor' && (i.value = n));
              }}
            />
          </Field>
          <Field label={t('props.tolerance')}>
            <Select value={item.tolerance} options={[0.5, 1, 2, 5, 10].map((v) => ({ value: v, label: `${v} %` }))} onChange={(v) => set((i) => i.kind === 'resistor' && (i.tolerance = v))} />
          </Field>
          <div className="flex h-5 items-center gap-1 pl-[100px]">
            {resistorBands(item.value, item.tolerance).map((c, i) => (
              <span key={i} className="h-5 w-2.5 rounded-sm border border-black/15" style={{ background: c }} />
            ))}
          </div>
        </>
      )}
      {item.kind === 'diode' && (
        <>
          <Field label={t('props.value')}>
            <TextInput value={item.value} onCommit={(v) => set((i) => i.kind === 'diode' && (i.value = v))} />
          </Field>
          <Field label={t('props.diodeType')}>
            <Select value={item.diodeType} options={(['DO35', 'DO41', 'DO7', 'SOD57'] as DiodeType[]).map((v) => ({ value: v, label: v }))} onChange={(v) => set((i) => i.kind === 'diode' && (i.diodeType = v))} />
          </Field>
        </>
      )}
      {item.kind === 'part' && <PartFields item={item} />}
      {item.kind === 'symbol' && <SymbolFields item={item} />}
      <LayerField items={[item]} />
    </Section>
  );
}

function PartFields({ item }: { item: Item & { kind: 'part' } }) {
  const t = useT();
  const def = useStore((s) => activeDoc(s)?.doc.parts[item.ref]);
  return (
    <>
      <Field label={t('props.value')}>
        <TextInput value={item.value ?? ''} onCommit={(v) => edit([item], (i) => i.kind === 'part' && (i.value = v || undefined))} />
      </Field>
      <Field label={t('props.rotation')}>
        <Select
          value={((item.rotation % 360) + 360) % 360}
          options={[0, 45, 90, 135, 180, 225, 270, 315].map((v) => ({ value: v, label: `${v}°` }))}
          onChange={(v) => edit([item], (i) => i.kind === 'part' && (i.rotation = v > 180 ? v - 360 : v))}
        />
      </Field>
      {def && (
        <div className="grid gap-1 rounded-md bg-panel-2 p-2 text-[11.5px]">
          <div className="font-medium">{def.name}</div>
          <div className="text-muted">{def.description}</div>
          <div className="text-muted">
            {t('props.package')}: {def.packageType || '–'} · {t('props.pins')}: {def.pins.length}
          </div>
          {def.author && <div className="text-[10.5px] text-muted">{[def.author, def.license].filter(Boolean).join(' · ')}</div>}
        </div>
      )}
    </>
  );
}

function SymbolFields({ item }: { item: SymbolItem }) {
  const t = useT();
  const models = useStore((s) => s.library.models);
  const set = (fn: (s: Draft<SymbolItem>) => void) => edit([item], (i) => i.kind === 'symbol' && fn(i as Draft<SymbolItem>));
  const needsModel = item.spiceType && ['DIODE', 'NPN', 'PNP', 'MOSFET', 'SUBCIRCUIT'].includes(item.spiceType);
  const typeModels = models.filter((m) => !item.spiceType || m.type === item.spiceType || (item.spiceType === 'MOSFET' && m.type === 'SUBCIRCUIT'));
  const p = item.properties ?? {};
  const setProp = (k: string, v: string) =>
    set((s) => {
      s.properties = { mode: 'DC', dcVoltage: '0', shape: 'SIN', acAmplitude: '1', dcOffset: '0', frequency: '1000', frequencyUnit: 'HZ', acPhase: '0', duty: '50', ...(s.properties ?? {}), [k]: v };
    });
  return (
    <>
      <Field label={t('props.value')}>
        <TextInput value={item.value} onCommit={(v) => set((s) => (s.value = v))} />
      </Field>
      <Field label={t('props.rotation')}>
        <Select
          value={((item.rotation % 360) + 360) % 360}
          options={[0, 90, 180, 270].map((v) => ({ value: v, label: `${v}°` }))}
          onChange={(v) => set((s) => (s.rotation = v > 180 ? v - 360 : v))}
        />
      </Field>
      <div className="flex gap-4 pl-[100px]">
        <Check checked={item.mirrorH} onChange={(v) => set((s) => (s.mirrorH = v))} label="↔" />
        <Check checked={item.mirrorV} onChange={(v) => set((s) => (s.mirrorV = v))} label="↕" />
      </div>
      <Field label={t('props.spiceType')}>
        <Select
          value={item.spiceType ?? ''}
          options={[{ value: '', label: '–' }, ...SPICE_TYPES.map((v) => ({ value: v, label: v }))]}
          onChange={(v) => set((s) => (v ? (s.spiceType = v as SpiceType) : delete s.spiceType))}
        />
      </Field>
      {(needsModel || item.model) && (
        <Field label={t('props.model')}>
          <Select
            value={item.model?.name ?? ''}
            options={[
              { value: '', label: t('props.modelNone') },
              ...(item.model && !typeModels.some((m) => m.name === item.model!.name) ? [{ value: item.model.name, label: `${item.model.name} (eingebettet)` }] : []),
              ...typeModels.map((m) => ({ value: m.name, label: m.name })),
            ]}
            onChange={(v) =>
              set((s) => {
                const m = models.find((x) => x.name === v);
                if (!v) {
                  delete s.model;
                  s.customModel = false;
                } else if (m) {
                  s.model = { ...m };
                  s.customModel = true;
                }
              })
            }
          />
        </Field>
      )}
      {item.spiceType === 'VOLTAGE_SOURCE' && (
        <div className="grid gap-2 rounded-md bg-panel-2 p-2">
          <Field label={t('props.mode')}>
            <Select value={(p.mode ?? 'DC').toUpperCase()} options={[{ value: 'DC', label: 'DC' }, { value: 'AC', label: 'AC / Signal' }]} onChange={(v) => setProp('mode', v)} />
          </Field>
          {(p.mode ?? 'DC').toUpperCase() === 'DC' ? (
            <Field label={t('props.dcVoltage')}>
              <NumberInput value={parseFloat(p.dcVoltage ?? '0') || 0} step={0.5} onCommit={(v) => setProp('dcVoltage', String(v))} suffix="V" />
            </Field>
          ) : (
            <>
              <Field label={t('props.shape')}>
                <Select value={(p.shape ?? 'SIN').toUpperCase()} options={[{ value: 'SIN', label: 'Sinus' }, { value: 'PULSE', label: 'Rechteck / Puls' }]} onChange={(v) => setProp('shape', v)} />
              </Field>
              <Field label={t('props.amplitude')}>
                <NumberInput value={parseFloat(p.acAmplitude ?? '1') || 0} step={0.5} onCommit={(v) => setProp('acAmplitude', String(v))} suffix="V" />
              </Field>
              <Field label={t('props.offset')}>
                <NumberInput value={parseFloat(p.dcOffset ?? '0') || 0} step={0.5} onCommit={(v) => setProp('dcOffset', String(v))} suffix="V" />
              </Field>
              <Field label={t('props.frequency')}>
                <NumberInput
                  value={(parseFloat(p.frequency ?? '1000') || 0) * ({ HZ: 1, KHZ: 1e3, MHZ: 1e6 }[(p.frequencyUnit ?? 'HZ').toUpperCase()] ?? 1)}
                  step={100}
                  min={0}
                  onCommit={(v) =>
                    set((s) => {
                      s.properties = { ...(s.properties ?? {}), frequency: String(v), frequencyUnit: 'HZ' };
                    })
                  }
                  suffix="Hz"
                />
              </Field>
              {(p.shape ?? 'SIN').toUpperCase() === 'PULSE' ? (
                <Field label={t('props.duty')}>
                  <NumberInput value={parseFloat(p.duty ?? '50') || 50} min={1} max={99} onCommit={(v) => setProp('duty', String(v))} suffix="%" />
                </Field>
              ) : (
                <Field label={t('props.phase')}>
                  <NumberInput value={parseFloat(p.acPhase ?? '0') || 0} step={15} onCommit={(v) => setProp('acPhase', String(v))} suffix="°" />
                </Field>
              )}
            </>
          )}
        </div>
      )}
      <PinEditor item={item} />
    </>
  );
}

function PinEditor({ item }: { item: SymbolItem }) {
  const t = useT();
  const set = (fn: (s: Draft<SymbolItem>) => void) => edit([item], (i) => i.kind === 'symbol' && fn(i as Draft<SymbolItem>));
  return (
    <details className="rounded-md border border-line">
      <summary className="cursor-pointer px-2 py-1.5 text-[11.5px] text-muted">
        {t('props.pins')} ({item.pins.length})
      </summary>
      <div className="grid gap-1 p-2">
        {item.pins.map((p, idx) => (
          <div key={idx} className="grid grid-cols-[34px_1fr_46px_46px_24px] items-center gap-1">
            <NumberInput value={p.num} min={0} onCommit={(v) => set((s) => void (s.pins[idx].num = v))} />
            <TextInput value={p.name ?? ''} onCommit={(v) => set((s) => void (s.pins[idx].name = v))} />
            <NumberInput value={p.x} onCommit={(v) => set((s) => void (s.pins[idx].x = v))} />
            <NumberInput value={p.y} onCommit={(v) => set((s) => void (s.pins[idx].y = v))} />
            <IconButton icon={Minus} label="−" className="h-6 w-6" onClick={() => set((s) => void s.pins.splice(idx, 1))} />
          </div>
        ))}
        <button
          className="mt-1 flex items-center gap-1 text-[11.5px] text-accent hover:underline"
          onClick={() => set((s) => void s.pins.push({ num: s.pins.length + 1, x: 0, y: 0, name: String(s.pins.length + 1), orientation: 'TOP_LEFT' }))}
        >
          <Plus size={12} /> {t('props.addPin')}
        </button>
      </div>
    </details>
  );
}

// ---- layers -----------------------------------------------------------------------------------

function LayersPanel() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  if (!ds) return null;
  const layers = ds.doc.layers;
  const current = layers.find((l) => l.id === ds.currentLayer);
  const counts = new Map<string, number>();
  for (const it of ds.doc.items) counts.set(it.layer, (counts.get(it.layer) ?? 0) + 1);
  return (
    <Section
      title={t('layers.title')}
      actions={
        <>
          <IconButton icon={Plus} label={t('layers.add')} className="h-6 w-6" size={14} onClick={() => addLayer(t('layers.newName', { n: layers.length + 1 }))} />
          <IconButton icon={CopyPlus} label={t('layers.duplicate')} className="h-6 w-6" size={14} onClick={() => duplicateLayer(ds.currentLayer)} />
          <IconButton icon={ArrowUp} label={t('layers.up')} className="h-6 w-6" size={14} onClick={() => moveLayer(ds.currentLayer, -1)} />
          <IconButton icon={ArrowDown} label={t('layers.down')} className="h-6 w-6" size={14} onClick={() => moveLayer(ds.currentLayer, 1)} />
          <IconButton
            icon={Trash2}
            label={t('layers.delete')}
            className="h-6 w-6"
            size={14}
            disabled={layers.length <= 1}
            onClick={() => current && confirm(t('layers.deleteConfirm', { name: current.name })) && deleteLayer(current.id)}
          />
        </>
      }
    >
      <ul className="-mx-1 grid gap-0.5" role="listbox" aria-label={t('layers.title')}>
        {layers.map((l) => (
          <li
            key={l.id}
            role="option"
            aria-selected={l.id === ds.currentLayer}
            onClick={() => setCurrentLayer(l.id)}
            className={cx('flex h-8 cursor-pointer items-center gap-1 rounded-md px-1', l.id === ds.currentLayer ? 'bg-accent-soft' : 'hover:bg-hover')}
          >
            <IconButton
              icon={l.visible ? Eye : EyeOff}
              label={t('layers.visible')}
              className="h-6 w-6"
              size={14}
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(l.id, { visible: !l.visible });
              }}
            />
            <IconButton
              icon={l.locked ? Lock : LockOpen}
              label={t('layers.locked')}
              className={cx('h-6 w-6', l.locked && 'text-amber-500')}
              size={13}
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(l.id, { locked: !l.locked });
              }}
            />
            <label className="relative h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/15" style={{ background: l.color }} onClick={(e) => e.stopPropagation()}>
              <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={l.color} onChange={(e) => updateLayer(l.id, { color: e.target.value })} aria-label={t('props.color')} />
            </label>
            <span className={cx('ml-1 flex-1 truncate text-[12.5px]', !l.visible && 'text-muted line-through')}>
              <LayerName id={l.id} name={l.name} />
            </span>
            <span className="pr-1 text-[10.5px] tabular-nums text-muted">{isBoardLayer(l) ? '▦' : counts.get(l.id) ?? 0}</span>
          </li>
        ))}
      </ul>
      {current && (
        <Field label={t('layers.opacity')}>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            className="w-full"
            value={current.opacity}
            onChange={(e) => updateLayer(current.id, { opacity: parseFloat(e.target.value) }, false)}
            onPointerUp={(e) => updateLayer(current.id, { opacity: parseFloat((e.target as HTMLInputElement).value) })}
          />
          <span className="w-9 text-right text-[11px] tabular-nums text-muted">{Math.round(current.opacity * 100)}%</span>
        </Field>
      )}
    </Section>
  );
}

function LayerName({ id, name }: { id: string; name: string }) {
  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        const next = prompt('Name', name);
        if (next && next !== name) updateLayer(id, { name: next });
      }}
    >
      {name}
    </span>
  );
}
