import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, Trash2, Copy, Plus, PenLine, FolderInput } from 'lucide-react';
import { activeDoc, openDialog, setLibrary, startPlacement, toast, useStore, type Placement } from '../store/store.ts';
import { saveUserFootprints, withoutUserFootprint } from '../platform/userFootprints.ts';
import { setDragPayload } from '../editor/dragPayload.ts';
import { importKicadFootprints } from '../editor/kicadActions.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import type { FootprintDef, PartDef, SpiceModel, SymbolDef } from '../model/types.ts';
import { FOOTPRINT_CATEGORIES, FOOTPRINTS, searchFootprints } from '../pcb/footprints/index.ts';
import { footprintBoundsLocal, FootprintThumb } from './FootprintThumb.tsx';
import { footprintFromPart, LEGACY_CATEGORY } from '../pcb/fromParts.ts';

const USER_FOOTPRINTS = 'User';
import { ShapeView } from '../render/shapes.tsx';
import { inflate, shapeBounds, unionRect, type Rect } from '../geometry/geom.ts';
import { saveUserSymbols } from '../platform/persist.ts';
import { removeUserPart } from '../editor/partActions.ts';
import { INSTRUMENT_DEFS } from '../spice/instruments.ts';
import { LABEL_DEFS } from '../spice/labels.ts';
import { BUILTIN_SYMBOLS } from '../spice/builtinSymbols.ts';
import { cx, IconButton } from './primitives.tsx';

type Tab = 'parts' | 'symbols' | 'models' | 'footprints';

// The shipped library has ~70 package types; they are folded into a few shelves.
const SHELVES: [RegExp, string][] = [
  [/^(dil|ic|oscdip|sil|smd)/i, 'ICs & sockets'],
  [/^(to|multiwatt)/i, 'Transistors & regulators'],
  [/^(do|rectifier|diode)/i, 'Diodes & rectifiers'],
  [/^led(?!display)/i, 'LEDs'],
  [/^(leddisplay|lcddisp|bargraph)/i, 'Displays'],
  [/^(ccer|film|ctantal|elcap|c_)/i, 'Capacitors'],
  [/^(resistor|potentiometer|ntc|ldr|polyswitch|trimmer)/i, 'Resistors & potentiometers'],
  [/^(photo|tsop|sensor)/i, 'Sensors'],
  [/^(switch|relay|jumper)/i, 'Switches & relays'],
  [/^(connector|straightheader|boxheader|terminal|socket|con_)/i, 'Connectors & headers'],
  [/^(quartz|hc|resonator)/i, 'Crystals & resonators'],
  [/^(inductor|transformer|tr_)/i, 'Inductors & transformers'],
  [/^(fuse)/i, 'Fuses'],
  [/^(bat)/i, 'Batteries'],
  [/^(wire|w_)/i, 'Wires'],
  [/^(breadboard|arduino)/i, 'Boards & modules'],
  [/^(th|m_|screw|washer|logo)/i, 'Mechanical & logos'],
];

function packageGroup(p: PartDef): string {
  const key = p.packageType.trim();
  return SHELVES.find(([re]) => (key && re.test(key)) || re.test(p.file))?.[1] ?? 'Miscellaneous';
}

export function LibraryPanel() {
  const t = useT();
  const pcb = useStore((s) => activeDoc(s)?.doc.type === 'PCB');
  const [tab, setTab] = useState<Tab>(pcb ? 'footprints' : 'parts');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const lib = useStore((s) => s.library);
  // PCBs are built from footprints; the other documents from parts and symbols
  useEffect(() => setTab((cur) => (pcb ? 'footprints' : cur === 'footprints' ? 'parts' : cur)), [pcb]);
  const tabs: [Tab, I18nKey, number][] = pcb
    ? [
        ['footprints', 'lib.footprints', FOOTPRINTS.length + lib.userFootprints.length],
        ['models', 'lib.models', lib.models.length],
      ]
    : [
        ['parts', 'lib.parts', lib.parts.length + lib.userParts.length],
        ['symbols', 'lib.symbols', lib.symbols.length + lib.userSymbols.length],
        ['models', 'lib.models', lib.models.length],
      ];
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-panel" aria-label={t('view.leftPanel')}>
      <div className="flex gap-1 border-b border-line p-1.5" role="tablist">
        {tabs.map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={cx('flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium', tab === id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg')}
            onClick={() => setTab(id)}
          >
            {t(label)}
            <span className="text-[10.5px] opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="bb-input pl-8" placeholder={t('lib.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('lib.search')} />
        </div>
      </div>
      <div className="bb-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'footprints' ? (
          <FootprintsList q={q} />
        ) : !lib.loaded ? (
          <p className="p-4 text-muted">{lib.error ?? t('lib.loading')}</p>
        ) : tab === 'parts' ? (
          <PartsList parts={lib.parts} user={lib.userParts} q={q} />
        ) : tab === 'symbols' ? (
          <SymbolsList symbols={lib.symbols} user={lib.userSymbols} q={q} />
        ) : (
          <ModelsList models={lib.models} q={q} />
        )}
      </div>
    </aside>
  );
}

function Group({ title, count, children, defaultOpen }: { title: string; count: number; children: React.ReactNode; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open || defaultOpen;
  return (
    <div className="border-b border-line/60">
      <button className="flex h-8 w-full items-center gap-1.5 px-2.5 text-left text-[12px] font-medium hover:bg-hover" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen}>
        <ChevronRight size={14} className={cx('text-muted transition-transform', isOpen && 'rotate-90')} />
        <span className="flex-1 truncate">{title}</span>
        <span className="text-[11px] text-muted">{count}</span>
      </button>
      {isOpen && <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">{children}</div>}
    </div>
  );
}

function Tile({
  title,
  subtitle,
  placement,
  children,
  onRemove,
  onEdit,
  dark,
}: {
  title: string;
  subtitle?: string;
  placement: Placement;
  children: React.ReactNode;
  onRemove?: () => void;
  onEdit?: () => void;
  dark?: boolean;
}) {
  const t = useT();
  const active = useStore((s) => s.tool === 'place' && s.placement !== null && samePlacement(s.placement, placement));
  return (
    <div className="group relative">
      <button
        draggable
        onDragStart={(e) => {
          setDragPayload(placement);
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', title);
        }}
        onDragEnd={() => setDragPayload(null)}
        onClick={() => startPlacement(placement)}
        title={subtitle ? `${title}\n${subtitle}` : title}
        className={cx(
          'flex h-[86px] w-full flex-col items-center gap-1 overflow-hidden rounded-lg border p-1.5 text-center transition-colors [content-visibility:auto]',
          active ? 'border-accent bg-accent-soft' : 'border-line bg-panel-2 hover:border-accent/50 hover:bg-hover',
        )}
      >
        <div className={cx('flex min-h-0 w-full flex-1 items-center justify-center rounded-md p-1', dark ? 'bg-[#0f1913]' : 'bg-white/90 dark:bg-white/[0.92]')}>{children}</div>
        <span className="w-full truncate text-[10.5px] leading-tight">{title}</span>
      </button>
      {(onRemove || onEdit) && (
        <span className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
          {onEdit && <IconButton icon={PenLine} label={t('lib.edit')} className="h-6 w-6 bg-panel" size={12} onClick={onEdit} />}
          {onRemove && <IconButton icon={Trash2} label={t('lib.removeUser')} className="h-6 w-6 bg-panel" size={12} onClick={onRemove} />}
        </span>
      )}
    </div>
  );
}

function samePlacement(a: Placement, b: Placement) {
  if (a.kind === 'part' && b.kind === 'part') return a.ref === b.ref;
  if (a.kind === 'symbol' && b.kind === 'symbol') return a.def === b.def;
  if (a.kind === 'footprint' && b.kind === 'footprint') return a.def.id === b.def.id;
  return false;
}

const FootprintsList = memo(function FootprintsList({ q }: { q: string }) {
  const t = useT();
  const parts = useStore((s) => s.library.parts);
  const user = useStore((s) => s.library.userFootprints);
  const groups = useMemo(() => {
    const list = q ? searchFootprints(q) : FOOTPRINTS;
    const m = new Map<string, FootprintDef[]>();
    for (const f of list) m.set(f.category, [...(m.get(f.category) ?? []), f]);
    // the classic part library, turned into through-hole footprints
    const legacy = parts
      .filter((p) => !q || `${p.name} ${p.description} ${p.packageType}`.toLowerCase().includes(q))
      .map(footprintFromPart)
      .filter((f): f is FootprintDef => !!f);
    if (legacy.length) m.set(LEGACY_CATEGORY, legacy);
    const mine = user.filter((f) => !q || `${f.id} ${f.name} ${f.description} ${(f.tags ?? []).join(' ')}`.toLowerCase().includes(q));
    if (mine.length) m.set(USER_FOOTPRINTS, mine);
    const order = (c: string) => (c === USER_FOOTPRINTS ? -1 : c === LEGACY_CATEGORY ? 999 : FOOTPRINT_CATEGORIES.indexOf(c));
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [q, parts, user]);
  const remove = (id: string) => {
    const next = withoutUserFootprint(useStore.getState().library.userFootprints, id);
    setLibrary({ userFootprints: next });
    void saveUserFootprints(next);
  };
  return (
    <>
      <div className="flex gap-2 border-b border-line/60 p-2">
        <button
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-line text-[12px] text-muted hover:border-accent hover:text-accent"
          onClick={() => openDialog({ kind: 'footprintEditor' })}
        >
          <Plus size={14} /> {t('fpe.newFootprint')}
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-line text-muted hover:border-accent hover:text-accent"
          title={t('kicad.importFootprints')}
          aria-label={t('kicad.importFootprints')}
          onClick={() => void importKicadFootprints()}
        >
          <FolderInput size={14} />
        </button>
      </div>
      {!groups.length && <p className="p-4 text-muted">{t('lib.empty')}</p>}
      {groups.map(([cat, list]) => (
        <Group key={cat} title={t(`fpcat.${cat}` as I18nKey)} count={list.length} defaultOpen={!!q || cat === USER_FOOTPRINTS}>
          {list.map((f) => (
            <Tile
              key={f.id}
              title={f.name}
              subtitle={f.description}
              placement={{ kind: 'footprint', def: f }}
              dark
              onRemove={cat === USER_FOOTPRINTS ? () => remove(f.id) : undefined}
              onEdit={cat === USER_FOOTPRINTS ? () => openDialog({ kind: 'footprintEditor', def: f }) : undefined}
            >
              <FootprintThumb def={f} box={footprintBoundsLocal(f)} />
            </Tile>
          ))}
        </Group>
      ))}
    </>
  );
});

const USER_PARTS = 'User';

const PartsList = memo(function PartsList({ parts, user, q }: { parts: PartDef[]; user: PartDef[]; q: string }) {
  const t = useT();
  const groups = useMemo(() => {
    const m = new Map<string, PartDef[]>();
    const hit = (p: PartDef) => !q || `${p.name} ${p.description} ${p.packageType} ${p.file}`.toLowerCase().includes(q);
    const mine = user.filter(hit);
    if (mine.length) m.set(USER_PARTS, mine);
    for (const p of parts) {
      if (!hit(p)) continue;
      const g = packageGroup(p);
      m.set(g, [...(m.get(g) ?? []), p]);
    }
    return [...m.entries()];
  }, [parts, user, q]);
  // own parts first, then alphabetical in the language shown, "Miscellaneous" last
  const rank = (g: string) => (g === USER_PARTS ? 0 : g === 'Miscellaneous' ? 2 : 1);
  const shelves = [...groups].sort((a, b) => rank(a[0]) - rank(b[0]) || t(`shelf.${a[0]}` as I18nKey).localeCompare(t(`shelf.${b[0]}` as I18nKey)));
  return (
    <>
      <div className="border-b border-line/60 p-2">
        <button
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line text-[12px] text-muted hover:border-accent hover:text-accent"
          onClick={() => openDialog({ kind: 'partEditor' })}
        >
          <Plus size={14} /> {t('part.newPart')}
        </button>
      </div>
      {!shelves.length && <p className="p-4 text-muted">{t('lib.empty')}</p>}
      {shelves.map(([g, list]) => (
        <Group key={g} title={t(`shelf.${g}` as I18nKey)} count={list.length} defaultOpen={!!q || g === USER_PARTS}>
          {list.map((p) => (
            <Tile
              key={p.file}
              title={p.name}
              subtitle={p.description}
              placement={{ kind: 'part', ref: p.file }}
              onEdit={() => openDialog({ kind: 'partEditor', def: p })}
              onRemove={g === USER_PARTS ? () => removeUserPart(p.file) : undefined}
            >
              <img src={p.image} alt="" loading="lazy" className="max-h-full max-w-full object-contain" draggable={false} />
            </Tile>
          ))}
        </Group>
      ))}
    </>
  );
});

export function SymbolThumb({ def, className }: { def: SymbolDef; className?: string }) {
  const vb = useMemo(() => {
    let r: Rect | undefined = { x: 0, y: 0, w: def.width, h: def.height };
    for (const s of def.shapes) r = unionRect(r, shapeBounds(s));
    return inflate(r!, 2);
  }, [def]);
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={cx('h-full w-full', className)} aria-hidden="true">
      {def.shapes.map((s, i) => (
        <ShapeView key={i} s={s} name={def.name} value={def.value} />
      ))}
    </svg>
  );
}

const CATEGORY_ORDER = ['Instruments', 'Labels', 'User', 'Passive', 'Semiconductors', 'Active', 'Digital', 'Sources', 'Switches', 'Connectors', 'Optoelectronics', 'Microcontrollers', 'Acoustic', 'Misc'];

const SymbolsList = memo(function SymbolsList({ symbols, user, q }: { symbols: SymbolDef[]; user: SymbolDef[]; q: string }) {
  const t = useT();
  const groups = useMemo(() => {
    const m = new Map<string, SymbolDef[]>();
    for (const s of [...Object.values(INSTRUMENT_DEFS), ...LABEL_DEFS, ...BUILTIN_SYMBOLS, ...user.map((u) => ({ ...u, category: 'User' })), ...symbols]) {
      if (q && !`${s.name} ${s.value} ${s.category} ${s.spiceType ?? ''} ${s.filename ?? ''}`.toLowerCase().includes(q)) continue;
      m.set(s.category, [...(m.get(s.category) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
  }, [symbols, user, q]);
  const remove = (def: SymbolDef) => {
    const next = useStore.getState().library.userSymbols.filter((s) => s.filename !== def.filename);
    setLibrary({ userSymbols: next });
    void saveUserSymbols(next);
  };
  if (!groups.length) return <p className="p-4 text-muted">{t('lib.empty')}</p>;
  return (
    <>
      {groups.map(([cat, list]) => (
        <Group key={cat} title={t(`cat.${cat}` as I18nKey)} count={list.length} defaultOpen={!!q || cat === 'User' || cat === 'Instruments'}>
          {list.map((s, i) => {
            const def = cat === 'User' ? user.find((u) => u.filename === s.filename) ?? s : s;
            return (
              <Tile
                key={(s.filename ?? s.name) + i}
                title={s.name}
                subtitle={[s.value, s.spiceType].filter(Boolean).join(' · ')}
                placement={{ kind: 'symbol', def }}
                onRemove={cat === 'User' ? () => remove(def) : undefined}
              >
                <SymbolThumb def={def} />
              </Tile>
            );
          })}
        </Group>
      ))}
    </>
  );
});

const ModelsList = memo(function ModelsList({ models, q }: { models: SpiceModel[]; q: string }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => models.filter((m) => !q || `${m.name} ${m.type ?? ''}`.toLowerCase().includes(q)), [models, q]);
  if (!list.length) return <p className="p-4 text-muted">{t('lib.empty')}</p>;
  return (
    <ul className="py-1">
      {list.map((m) => (
        <li key={m.filename ?? m.name} className="border-b border-line/50">
          <button className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-hover" onClick={() => setOpen(open === m.name ? null : m.name)}>
            <span className="flex-1 truncate font-mono text-[12px]">{m.name}</span>
            <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{m.type ?? '–'}</span>
          </button>
          {open === m.name && (
            <div className="px-3 pb-2">
              <pre className="bb-scroll max-h-56 overflow-auto rounded-md bg-panel-2 p-2 font-mono text-[10.5px] leading-snug text-muted">{m.content}</pre>
              <button
                className="mt-1 flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                onClick={() => {
                  void navigator.clipboard?.writeText(m.content);
                  toast(t('lib.modelCopied'), 'success');
                }}
              >
                <Copy size={12} /> {t('lib.copyModel')}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
});
