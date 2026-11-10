// Property fields of PCB items (footprints, tracks, vias, zones) and the
// footprint assignment of schematic symbols.

import { useMemo } from 'react';
import type { Draft } from 'immer';
import type { CopperSide, FootprintItem, Item, PcbItem, SymbolItem, TrackItem, ViaItem, ZoneItem } from '../model/types.ts';
import { activeDoc, openDialog, updateItems, useStore } from '../store/store.ts';
import { PenLine } from 'lucide-react';
import { useT } from '../i18n/i18n.ts';
import { FOOTPRINTS } from '../pcb/footprints/index.ts';
import { findFootprint } from '../editor/footprintLookup.ts';
import { guessFootprint } from '../pcb/fromSchematic.ts';
import { copperLayerFor } from '../pcb/place.ts';
import { mm, toMm } from '../pcb/units.ts';
import { Field, NumberInput, Select, TextInput } from './primitives.tsx';

function edit<T extends Item>(item: T, fn: (it: Draft<T>) => void) {
  updateItems([item.id], (i) => fn(i as Draft<T>));
}

/** Length input in millimetres for a value in board units. */
function MmInput({ value, min = 0, step = 0.05, onCommit }: { value: number; min?: number; step?: number; onCommit: (units: number) => void }) {
  return <NumberInput value={parseFloat(toMm(value).toFixed(3))} min={min} step={step} onCommit={(v) => onCommit(mm(v))} suffix="mm" />;
}

/** Text input with a datalist of all footprint ids. */
export function FootprintInput({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (id: string) => void }) {
  const user = useStore((s) => s.library.userFootprints);
  const ids = useMemo(() => [...user.map((f) => f.id), ...FOOTPRINTS.map((f) => f.id)], [user]);
  return (
    <>
      <input
        className="bb-input"
        list="bb-footprint-ids"
        defaultValue={value}
        key={value}
        placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && onCommit(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <datalist id="bb-footprint-ids">
        {ids.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </>
  );
}

/** Footprint of a schematic symbol (stored in its properties, so .bb files keep it). */
export function SymbolFootprintField({ item }: { item: SymbolItem }) {
  const t = useT();
  const explicit = item.properties?.footprint ?? '';
  const guessed = useMemo(() => guessFootprint({ ...item, properties: { ...item.properties, footprint: '' } }), [item]);
  return (
    <Field label={t('props.footprint')}>
      <FootprintInput
        value={explicit}
        placeholder={guessed}
        onCommit={(id) =>
          edit(item, (s) => {
            const props = { ...(s.properties ?? {}) };
            if (id) props.footprint = id;
            else delete props.footprint;
            s.properties = Object.keys(props).length ? props : undefined;
          })
        }
      />
    </Field>
  );
}

function CopperLayerField({ item }: { item: TrackItem | ZoneItem }) {
  const t = useT();
  const layers = useStore((s) => activeDoc(s)!.doc.layers);
  return (
    <Field label={t('props.layer')}>
      <Select
        value={item.layer}
        options={layers.filter((l) => l.role === 'top-copper' || l.role === 'bottom-copper').map((l) => ({ value: l.id, label: l.name }))}
        onChange={(v) => edit(item, (i) => (i.layer = v))}
      />
    </Field>
  );
}

function FootprintFields({ item }: { item: FootprintItem }) {
  const t = useT();
  const nets = Object.entries(item.nets);
  return (
    <>
      <Field label={t('props.value')}>
        <TextInput value={item.value} onCommit={(v) => edit(item, (i) => (i.value = v))} />
      </Field>
      <div className="flex justify-end">
        <button className="flex items-center gap-1 text-[12px] text-accent hover:underline" onClick={() => openDialog({ kind: 'footprintEditor', itemId: item.id, def: item.footprint })}>
          <PenLine size={12} /> {t('fpe.editFootprint')}
        </button>
      </div>
      <Field label={t('props.footprint')}>
        <FootprintInput
          value={item.footprint.id}
          onCommit={(id) => {
            const def = findFootprint(id);
            if (def) edit(item, (i) => (i.footprint = structuredClone(def)));
          }}
        />
      </Field>
      <Field label={t('props.side')}>
        <Select
          value={item.side}
          options={(['top', 'bottom'] as CopperSide[]).map((v) => ({ value: v, label: t(`side.${v}`) }))}
          onChange={(side) => {
            const doc = activeDoc()?.doc;
            if (!doc || side === item.side) return;
            const layer = copperLayerFor(doc, side);
            edit(item, (i) => {
              i.side = side;
              i.layer = layer;
              i.rotation = -i.rotation;
            });
          }}
        />
      </Field>
      <Field label={t('props.rotation')}>
        <NumberInput value={item.rotation} step={90} onCommit={(v) => edit(item, (i) => (i.rotation = ((((v + 180) % 360) + 360) % 360) - 180))} suffix="°" />
      </Field>
      <Field label={t('props.position')}>
        <MmInput value={item.x} step={0.635} onCommit={(v) => edit(item, (i) => (i.x = v))} />
        <MmInput value={item.y} step={0.635} onCommit={(v) => edit(item, (i) => (i.y = v))} />
      </Field>
      <div className="grid gap-1 rounded-md bg-panel-2 p-2 text-[11.5px]">
        <div className="font-medium">{item.footprint.name}</div>
        <div className="text-muted">{item.footprint.description}</div>
        {nets.length > 0 && (
          <div className="bb-scroll mt-1 grid max-h-36 grid-cols-[auto_1fr] gap-x-3 overflow-auto font-mono text-[11px]">
            {nets
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
              .map(([pad, net]) => (
                <span key={pad} className="contents">
                  <span className="text-muted">{pad}</span>
                  <span className="truncate">{net}</span>
                </span>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

function NetField({ item }: { item: TrackItem | ViaItem }) {
  const t = useT();
  return (
    <Field label={t('props.net')}>
      <span className="truncate text-[12px]">{item.net ?? t('pcb.netNone')}</span>
    </Field>
  );
}

function ZoneFields({ item }: { item: ZoneItem }) {
  const t = useT();
  const doc = useStore((s) => activeDoc(s)?.doc);
  const nets = useMemo(() => [...new Set(doc?.items.flatMap((i) => (i.kind === 'footprint' ? Object.values(i.nets) : [])) ?? [])].filter((n) => !n.startsWith('unconnected-')).sort(), [doc?.items]);
  const rules = doc?.pcb?.rules;
  return (
    <>
      <Field label={t('props.net')}>
        <Select value={item.net} options={[{ value: '', label: t('pcb.netNone') }, ...nets.map((n) => ({ value: n, label: n }))]} onChange={(v) => edit(item, (i) => (i.net = v))} />
      </Field>
      <CopperLayerField item={item} />
      <Field label={t('props.clearance')}>
        <MmInput value={item.clearance ?? rules?.clearance ?? mm(0.2)} min={0.05} onCommit={(v) => edit(item, (i) => (i.clearance = v))} />
      </Field>
      <Field label={t('props.connect')}>
        <Select
          value={item.connect ?? 'thermal'}
          options={(['thermal', 'solid'] as const).map((v) => ({ value: v, label: t(`connect.${v}`) }))}
          onChange={(v) => edit(item, (i) => (i.connect = v))}
        />
      </Field>
      <Field label={t('props.priority')}>
        <NumberInput value={item.priority ?? 0} min={0} max={99} onCommit={(v) => edit(item, (i) => (i.priority = v))} />
      </Field>
    </>
  );
}

export function PcbItemFields({ item }: { item: PcbItem }) {
  const t = useT();
  switch (item.kind) {
    case 'footprint':
      return <FootprintFields item={item} />;
    case 'track':
      return (
        <>
          <Field label={t('props.width')}>
            <MmInput value={item.width} min={0.05} onCommit={(v) => edit(item, (i) => (i.width = v))} />
          </Field>
          <CopperLayerField item={item} />
          <NetField item={item} />
          <Field label={t('props.length')}>
            <span className="text-[12px] tabular-nums">{toMm(Math.hypot(item.x2 - item.x1, item.y2 - item.y1)).toFixed(2)} mm</span>
          </Field>
        </>
      );
    case 'via':
      return (
        <>
          <Field label={t('props.diameter')}>
            <MmInput value={item.diameter} min={0.2} onCommit={(v) => edit(item, (i) => (i.diameter = v))} />
          </Field>
          <Field label={t('props.drill')}>
            <MmInput value={item.drill} min={0.1} onCommit={(v) => edit(item, (i) => (i.drill = v))} />
          </Field>
          <NetField item={item} />
        </>
      );
    case 'zone':
      return <ZoneFields item={item} />;
  }
}

/** Width of several selected tracks at once. */
export function TrackWidthField({ tracks }: { tracks: Item[] }) {
  const t = useT();
  const widths = new Set(tracks.map((i) => (i.kind === 'track' ? i.width : 0)));
  const first = tracks[0];
  return (
    <Field label={t('props.width')}>
      <MmInput
        value={widths.size === 1 && first.kind === 'track' ? first.width : 0}
        min={0.05}
        onCommit={(v) =>
          updateItems(
            tracks.map((i) => i.id),
            (i) => {
              if (i.kind === 'track') i.width = v;
            },
          )
        }
      />
    </Field>
  );
}
