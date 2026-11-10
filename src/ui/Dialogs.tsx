import { lazy, Suspense, useEffect, useState } from 'react';
import { FilePlus2, FolderOpen, Library, CircuitBoard, Rows3, Workflow, ImagePlus, Activity, Cpu, GraduationCap, MemoryStick, Monitor, Wifi } from 'lucide-react';
import { setLearnOpen } from '../learn/state.ts';
import { openPcbDemo } from '../editor/pcbActions.ts';
import { activeDoc, newDocument, openDialog, openDoc, setLibrary, setSimulationOpen, toast, updateDoc, updateItems, updatePcbSettings, useStore } from '../store/store.ts';
import { withUserFootprint, saveUserFootprints } from '../platform/userFootprints.ts';
import { LABELS_DE } from '../pcb/editor/labels.ts';
import type { BoardType, FootprintDef } from '../model/types.ts';
import { MM_PER_UNIT, RASTER } from '../model/types.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { commands, MOD, type Command } from '../editor/commands.ts';
import { openFromDisk, openSample } from '../editor/fileActions.ts';
import { createSymbolFromSelection } from '../editor/symbolActions.ts';
import { isTauri, openViaInput } from '../platform/files.ts';
import { dataUrl } from '../io/bbfile.ts';
import { Button, Check, Dialog, Field, Kbd, NumberInput, Select, cx } from './primitives.tsx';
import { Logo } from './Logo.tsx';
import { buildBenchDemo } from '../spice/benchDemo.ts';
import { setLiveMode, setLiveValues } from '../store/live.ts';
import { mm, toMm } from '../pcb/units.ts';
import { DesignRulesDialog } from './DesignRulesDialog.tsx';

// the cloud dialog (accounts) and the footprint editor are only loaded when opened
const CloudDialog = lazy(() => import('./CloudDialog.tsx').then((m) => ({ default: m.CloudDialog })));
// the footprint editor is only loaded when it is opened
const FootprintEditor = lazy(() => import('../pcb/editor/FootprintEditor.tsx'));
const PartEditor = lazy(() => import('./PartEditor.tsx').then((m) => ({ default: m.PartEditor })));
const ScaleDesigner = lazy(() => import('./ScaleDesigner.tsx').then((m) => ({ default: m.ScaleDesigner })));

/** Opens the microcontroller demo with the live values running. */
export async function openMcuDemo() {
  const s = useStore.getState();
  const { buildMcuDemo } = await import('../mcu/mcuDemo.ts');
  openDoc(await buildMcuDemo(s.library.symbols, s.settings.lang), s.settings.lang === 'de' ? 'mikrocontroller-demo.bb' : 'microcontroller-demo.bb', undefined, false);
  setLiveMode('dc');
  setLiveValues(true);
}

/** Opens the ESP32 demo with the live values running. */
export async function openEsp32Demo() {
  const s = useStore.getState();
  const { buildEsp32Demo } = await import('../mcu/mcuDemo.ts');
  openDoc(buildEsp32Demo(s.library.symbols, s.settings.lang), 'esp32-demo.bb', undefined, false);
  setLiveMode('dc');
  setLiveValues(true);
}

/** Opens an LCD demo (ATmega328P or ESP32) with the live values running. */
export async function openLcdDemo(chip: 'atmega' | 'esp32') {
  const s = useStore.getState();
  const { buildEsp32LcdDemo, buildLcdDemo } = await import('../mcu/mcuDemo.ts');
  const doc = chip === 'esp32' ? buildEsp32LcdDemo(s.library.symbols, s.settings.lang) : await buildLcdDemo(s.library.symbols, s.settings.lang);
  openDoc(doc, chip === 'esp32' ? 'lcd-esp32-demo.bb' : 'lcd-demo.bb', undefined, false);
  setLiveMode('dc');
  setLiveValues(true);
}

/** Opens the generated instrument bench demo with the bench panel. */
export function openBenchDemo() {
  const s = useStore.getState();
  openDoc(buildBenchDemo(s.library.symbols, s.settings.lang), s.settings.lang === 'de' ? 'messplatz-demo.bb' : 'bench-demo.bb', undefined, false);
  setSimulationOpen(true);
}

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const close = () => openDialog(null);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'newBoard':
      return <NewBoardDialog onClose={close} />;
    case 'samples':
      return <SamplesDialog onClose={close} />;
    case 'cloud':
      return (
        <Suspense fallback={null}>
          <CloudDialog onClose={close} />
        </Suspense>
      );
    case 'about':
      return <AboutDialog onClose={close} />;
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />;
    case 'boardProps':
      return <BoardPropsDialog onClose={close} />;
    case 'symbolFromSelection':
      return <SymbolDialog onClose={close} />;
    case 'pcbRules':
      return <DesignRulesDialog onClose={close} />;
    case 'footprintEditor':
      return <FootprintEditorHost itemId={dialog.itemId} def={dialog.def} onClose={close} />;
    case 'partEditor':
      return (
        <Suspense fallback={null}>
          <PartEditor initial={dialog.def} itemId={dialog.itemId} onClose={close} />
        </Suspense>
      );
    case 'scaleDesigner':
      return (
        <Suspense fallback={null}>
          <ScaleDesigner onClose={close} />
        </Suspense>
      );
  }
}

/** The footprint editor; saved footprints go to the user library (and onto the edited board footprint). */
function FootprintEditorHost({ itemId, def, onClose }: { itemId?: string; def?: FootprintDef; onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  return (
    <Suspense fallback={null}>
      <FootprintEditor
        initial={def}
        labels={lang === 'de' ? LABELS_DE : undefined}
        categoryName={(c: string) => t(`fpcat.${c}` as I18nKey)}
        onClose={onClose}
        onSave={(saved: FootprintDef) => {
          if (itemId) {
            updateItems([itemId], (it) => {
              if (it.kind !== 'footprint') return;
              it.footprint = saved;
              for (const k of Object.keys(it.nets)) if (!saved.pads.some((p) => p.num === k)) delete it.nets[k];
            });
          }
          const next = withUserFootprint(useStore.getState().library.userFootprints, saved);
          setLibrary({ userFootprints: next });
          void saveUserFootprints(next);
          toast(t('fpe.saved', { id: saved.id }), 'success');
          onClose();
        }}
      />
    </Suspense>
  );
}

const TYPES: { type: BoardType; icon: typeof CircuitBoard; w: number; h: number }[] = [
  { type: 'HOLES', icon: CircuitBoard, w: 40, h: 25 },
  { type: 'STRIPES', icon: Rows3, w: 40, h: 25 },
  { type: 'SCHEMATICS', icon: Workflow, w: 64, h: 40 },
  { type: 'PCB', icon: Cpu, w: 100, h: 80 },
  { type: 'BLANK', icon: FilePlus2, w: 40, h: 25 },
];

function NewBoardDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [type, setType] = useState<BoardType>('HOLES');
  const [cols, setCols] = useState(40);
  const [rows, setRows] = useState(25);
  const choose = (tt: (typeof TYPES)[number]) => {
    setType(tt.type);
    setCols(tt.w);
    setRows(tt.h);
  };
  // holes sit on multiples of the raster, leaving half a raster at the border;
  // PCBs are sized in millimetres
  const pcb = type === 'PCB';
  const width = pcb ? mm(cols) : (cols + 1) * RASTER;
  const height = pcb ? mm(rows) : (rows + 1) * RASTER;
  const create = () => {
    newDocument(type, width, height);
    onClose();
  };
  return (
    <Dialog
      title={t('new.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('new.cancel')}</Button>
          <Button variant="primary" onClick={create}>
            {t('new.create')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((tt) => (
          <button
            key={tt.type}
            onClick={() => choose(tt)}
            onDoubleClick={create}
            className={cx('flex items-center gap-3 rounded-lg border p-3 text-left', type === tt.type ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')}
          >
            <tt.icon size={22} className={type === tt.type ? 'text-accent' : 'text-muted'} />
            <span className="text-[12.5px] font-medium">{t(`new.${tt.type}` as I18nKey)}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        <Field label={t('new.width')}>
          <NumberInput value={cols} min={2} max={pcb ? 1000 : 400} onCommit={setCols} suffix={pcb ? 'mm' : t('new.holes')} />
        </Field>
        <Field label={t('new.height')}>
          <NumberInput value={rows} min={2} max={pcb ? 1000 : 400} onCommit={setRows} suffix={pcb ? 'mm' : t('new.holes')} />
        </Field>
        <p className="pl-[100px] text-[11.5px] text-muted">{t('new.sizeHint', { w: (width * MM_PER_UNIT).toFixed(1), h: (height * MM_PER_UNIT).toFixed(1) })}</p>
      </div>
    </Dialog>
  );
}

function SamplesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [samples, setSamples] = useState<{ group: string; file: string; size: number }[] | null>(null);
  useEffect(() => {
    fetch('samples/index.json')
      .then((r) => r.json())
      .then(setSamples)
      .catch(() => setSamples([]));
  }, []);
  return (
    <Dialog title={t('samples.title')} onClose={onClose} width={560}>
      <button
        className="mb-4 flex w-full items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5 text-left hover:border-accent"
        onClick={() => {
          openBenchDemo();
          onClose();
        }}
      >
        <Activity size={18} className="text-accent" />
        <span className="flex-1">
          <span className="block text-[12.5px] font-medium">{t('demo.title')}</span>
          <span className="block text-[11.5px] text-muted">{t('demo.text')}</span>
        </span>
      </button>
      <button
        className="-mt-2 mb-4 flex w-full items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-left hover:border-emerald-500"
        onClick={() => {
          void openMcuDemo();
          onClose();
        }}
      >
        <MemoryStick size={18} className="text-emerald-600 dark:text-emerald-400" />
        <span className="flex-1">
          <span className="block text-[12.5px] font-medium">{t('demo.mcuTitle')}</span>
          <span className="block text-[11.5px] text-muted">{t('demo.mcuText')}</span>
        </span>
      </button>
      <button
        className="-mt-2 mb-4 flex w-full items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-left hover:border-sky-500"
        onClick={() => {
          void openEsp32Demo();
          onClose();
        }}
      >
        <Wifi size={18} className="text-sky-600 dark:text-sky-400" />
        <span className="flex-1">
          <span className="block text-[12.5px] font-medium">{t('demo.esp32Title')}</span>
          <span className="block text-[11.5px] text-muted">{t('demo.esp32Text')}</span>
        </span>
      </button>
      {(['atmega', 'esp32'] as const).map((chip) => (
        <button
          key={chip}
          className="-mt-2 mb-4 flex w-full items-center gap-3 rounded-lg border border-lime-500/40 bg-lime-500/10 px-3 py-2.5 text-left hover:border-lime-500"
          onClick={() => {
            void openLcdDemo(chip);
            onClose();
          }}
        >
          <Monitor size={18} className="text-lime-700 dark:text-lime-400" />
          <span className="flex-1">
            <span className="block text-[12.5px] font-medium">{t(chip === 'esp32' ? 'demo.lcdEsp32Title' : 'demo.lcdTitle')}</span>
            <span className="block text-[11.5px] text-muted">{t(chip === 'esp32' ? 'demo.lcdEsp32Text' : 'demo.lcdText')}</span>
          </span>
        </button>
      ))}
      {!samples ? (
        <p className="text-muted">…</p>
      ) : (
        (['boards', 'schematics'] as const).map((g) => (
          <div key={g} className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t(`samples.${g}`)}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {samples
                .filter((s) => s.group === g)
                .map((s) => (
                  <button
                    key={s.file}
                    className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-left hover:bg-hover"
                    onClick={() => {
                      void openSample(g, s.file);
                      onClose();
                    }}
                  >
                    {g === 'boards' ? <CircuitBoard size={16} className="text-amber-500" /> : <Workflow size={16} className="text-sky-500" />}
                    <span className="flex-1 truncate text-[12.5px]">{s.file.replace(/\.bb$/, '')}</span>
                    <span className="text-[10.5px] text-muted">{Math.round(s.size / 1024)} kB</span>
                  </button>
                ))}
            </div>
          </div>
        ))
      )}
    </Dialog>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={t('help.about')} onClose={onClose}>
      <div className="flex gap-4">
        <Logo size={64} />
        <div className="grid gap-2 text-[12.5px] leading-relaxed">
          <p className="text-[15px] font-semibold">BlackBoard Circuit Designer 3.0</p>
          <p>{t('about.text')}</p>
          <p>{t('about.compat')}</p>
          <p>
            {t('about.plans')}{' '}
            <a className="underline" href={isTauri() ? 'https://pueski.de/blackboard/#pricing' : new URL('./#pricing', document.baseURI).href} target="_blank" rel="noreferrer">
              {t('about.pricing')}
            </a>
          </p>
          <p className="text-muted">{t('about.credits')}</p>
          <p className="text-muted">© Matthias Pueski & contributors · React · TypeScript · Vite · Tauri</p>
        </div>
      </div>
    </Dialog>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const list = (Object.values(commands) as Command[]).filter((c) => c.shortcut);
  return (
    <Dialog title={t('help.shortcuts')} onClose={onClose} width={640}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {list.map((c) => (
          <div key={c.id} className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px]">
            <span>{t(c.label)}</span>
            <Kbd>{c.shortcut}</Kbd>
          </div>
        ))}
        <div className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px]">
          <span>Pan</span>
          <Kbd>Space + drag / middle mouse</Kbd>
        </div>
        <div className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px]">
          <span>Zoom</span>
          <Kbd>Wheel / pinch</Kbd>
        </div>
        <div className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px]">
          <span>Nudge</span>
          <Kbd>← ↑ → ↓ (Alt = 1px)</Kbd>
        </div>
        <div className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px]">
          <span>{t('edit.selectAll')}</span>
          <Kbd>{MOD}+A</Kbd>
        </div>
      </div>
    </Dialog>
  );
}

function BoardPropsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const [w, setW] = useState(ds?.doc.width ?? 640);
  const [h, setH] = useState(ds?.doc.height ?? 480);
  const [type, setType] = useState<BoardType>(ds?.doc.type ?? 'HOLES');
  const [radius, setRadius] = useState(toMm(ds?.doc.pcb?.cornerRadius ?? 0));
  if (!ds) return null;
  const pcb = ds.doc.type === 'PCB';
  return (
    <Dialog
      title={t('board.properties')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              updateDoc({ width: w, height: h, type });
              if (pcb) updatePcbSettings({ cornerRadius: mm(radius) });
              onClose();
            }}
          >
            {t('common.apply')}
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        {pcb ? (
          <>
            <Field label={t('new.width')}>
              <NumberInput value={parseFloat(toMm(w).toFixed(2))} min={5} step={1} onCommit={(v) => setW(mm(v))} suffix="mm" />
            </Field>
            <Field label={t('new.height')}>
              <NumberInput value={parseFloat(toMm(h).toFixed(2))} min={5} step={1} onCommit={(v) => setH(mm(v))} suffix="mm" />
            </Field>
            <Field label={t('pcb.cornerRadius')}>
              <NumberInput value={radius} min={0} step={0.5} onCommit={setRadius} suffix="mm" />
            </Field>
            <div className="pl-[100px]">
              <Button onClick={() => openDialog({ kind: 'pcbRules' })}>{t('pcb.rules')}</Button>
            </div>
          </>
        ) : (
          <>
            <Field label={t('new.type')}>
              <Select value={type} options={(['HOLES', 'STRIPES', 'BLANK', 'SCHEMATICS', 'CUSTOM'] as BoardType[]).map((v) => ({ value: v, label: t(`new.${v}` as I18nKey) }))} onChange={setType} />
            </Field>
            <Field label={t('new.width')}>
              <NumberInput value={w} min={32} step={RASTER} onCommit={setW} suffix="px" />
            </Field>
            <Field label={t('new.height')}>
              <NumberInput value={h} min={32} step={RASTER} onCommit={setH} suffix="px" />
            </Field>
          </>
        )}
        <p className="pl-[100px] text-[11.5px] text-muted">{t('new.sizeHint', { w: (w * MM_PER_UNIT).toFixed(1), h: (h * MM_PER_UNIT).toFixed(1) })}</p>
        <div className="flex gap-2 pl-[100px]">
          <Button
            icon={ImagePlus}
            onClick={async () => {
              const f = await openViaInput('image/*');
              if (f) updateDoc({ backgroundImage: dataUrl(f.data, f.name) });
            }}
          >
            {t('board.background')}
          </Button>
          {ds.doc.backgroundImage && (
            <Button variant="ghost" onClick={() => updateDoc({ backgroundImage: undefined })}>
              {t('board.removeBackground')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function SymbolDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState('U');
  const [category, setCategory] = useState('User');
  const [add, setAdd] = useState(true);
  return (
    <Dialog
      title={t('symbol.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              createSymbolFromSelection(name.trim() || 'U', category, add);
              onClose();
            }}
          >
            {t('symbol.create')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-muted">{t('symbol.hint')}</p>
      <div className="grid gap-2">
        <Field label={t('symbol.name')}>
          <input className="bb-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('symbol.category')}>
          <input className="bb-input" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <div className="pl-[100px]">
          <Check checked={add} onChange={setAdd} label={t('symbol.addToLibrary')} />
        </div>
      </div>
    </Dialog>
  );
}

export function Welcome() {
  const t = useT();
  const [over, setOver] = useState(false);
  const card = (icon: typeof CircuitBoard, label: I18nKey, onClick: () => void, accent: string, className?: string) => {
    const Icon = icon;
    return (
      <button
        onClick={onClick}
        className={cx('group flex items-center gap-3 rounded-xl border border-line bg-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md', className)}
      >
        <span className={cx('flex h-10 w-10 items-center justify-center rounded-lg', accent)}>
          <Icon size={20} />
        </span>
        <span className="text-[13px] font-medium">{t(label)}</span>
      </button>
    );
  };
  return (
    <div className={cx('bb-canvas flex h-full w-full items-center justify-center p-6', over && 'outline-2 -outline-offset-8 outline-dashed outline-accent')} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center gap-4">
          <Logo size={56} />
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">{t('welcome.title')}</h1>
            <p className="text-[13px] text-muted">{t('welcome.text')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {card(CircuitBoard, 'welcome.newBoard', () => newDocument('HOLES', 41 * RASTER, 26 * RASTER), 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}
          {card(Rows3, 'welcome.newStripes', () => newDocument('STRIPES', 41 * RASTER, 26 * RASTER), 'bg-orange-500/15 text-orange-600 dark:text-orange-400')}
          {card(Workflow, 'welcome.newSchematic', () => newDocument('SCHEMATICS', 65 * RASTER, 41 * RASTER), 'bg-sky-500/15 text-sky-600 dark:text-sky-400')}
          {card(Cpu, 'welcome.newPcb', () => newDocument('PCB', mm(100), mm(80)), 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}
          {card(FolderOpen, 'welcome.open', () => void openFromDisk(), 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300', 'sm:col-span-2')}
        </div>
        <button
          onClick={() => setLearnOpen(true)}
          className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <GraduationCap size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium">{t('learn.welcome')}</span>
            <span className="block text-[12px] text-muted">{t('learn.welcomeText')}</span>
          </span>
        </button>
        <button
          onClick={() => void openPcbDemo()}
          className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Cpu size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium">{t('demo.pcbTitle')}</span>
            <span className="block text-[12px] text-muted">{t('demo.pcbText')}</span>
          </span>
        </button>
        <button
          onClick={openBenchDemo}
          className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-gradient-to-r from-accent-soft to-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white dark:text-slate-950">
            <Activity size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium">{t('demo.title')}</span>
            <span className="block text-[12px] text-muted">{t('demo.text')}</span>
          </span>
        </button>
        <button
          onClick={() => void openMcuDemo()}
          className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/60 hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <MemoryStick size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium">{t('demo.mcuTitle')}</span>
            <span className="block text-[12px] text-muted">{t('demo.mcuText')}</span>
          </span>
        </button>
        <button
          onClick={() => void openEsp32Demo()}
          className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-500/60 hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <Wifi size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium">{t('demo.esp32Title')}</span>
            <span className="block text-[12px] text-muted">{t('demo.esp32Text')}</span>
          </span>
        </button>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="ghost" icon={Library} onClick={() => openDialog({ kind: 'samples' })}>
            {t('welcome.samples')}
          </Button>
          <span className="text-[12px] text-muted">{t('welcome.drop')}</span>
        </div>
      </div>
    </div>
  );
}
