import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Play, RefreshCw, X, Loader2, AlertTriangle, Download } from 'lucide-react';
import type { ResultType } from 'eecircuit-engine';
import { activeDoc, setSimulationOpen, useStore } from '../store/store.ts';
import { buildNetlist } from '../spice/netlist.ts';
import { simulate } from '../spice/simulator.ts';
import { useT } from '../i18n/i18n.ts';
import { formatEng } from '../model/ops.ts';
import { download } from '../platform/files.ts';
import { Button, Check, IconButton, cx } from './primitives.tsx';
import { useIsDark } from './theme.ts';
import { Workbench } from './instruments/Workbench.tsx';
import { docHasInstruments } from '../store/sim.ts';

// validated categorical palette (fixed order, never cycled), light and dark steps
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const MAX_SERIES = SERIES_LIGHT.length;

interface Trace {
  name: string;
  unit: 'V' | 'A' | '';
  values: number[];
}

interface Parsed {
  x: number[];
  xUnit: 's' | 'Hz' | '';
  log: boolean;
  traces: Trace[];
  /** AC analyses are shown as magnitude in dB */
  db: boolean;
}

function parseResult(r: ResultType): Parsed {
  if (r.dataType === 'complex') {
    const [xs, ...rest] = r.data;
    return {
      x: xs.values.map((v) => v.real),
      xUnit: 'Hz',
      log: true,
      db: true,
      traces: rest.map((d) => ({ name: d.name, unit: d.type === 'current' ? 'A' : 'V', values: d.values.map((v) => 20 * Math.log10(Math.hypot(v.real, v.img) || 1e-30)) })),
    };
  }
  const [xs, ...rest] = r.data;
  const xUnit = xs.type === 'time' ? 's' : xs.type === 'frequency' ? 'Hz' : '';
  return {
    x: xs.values,
    xUnit,
    log: false,
    db: false,
    traces: rest.map((d) => ({ name: d.name, unit: d.type === 'current' ? 'A' : d.type === 'voltage' ? 'V' : '', values: d.values })),
  };
}

function Chart({ parsed, traces, unit, colors }: { parsed: Parsed; traces: Trace[]; unit: string; colors: Map<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = useIsDark();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--bb-muted').trim() || '#888';
    const grid = css.getPropertyValue('--bb-border').trim() || '#ddd';
    const axis = (fmtUnit: string, log = false): uPlot.Axis => ({
      stroke: ink,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      font: '11px Inter, system-ui, sans-serif',
      values: (_u, splits) => splits.map((v) => (log ? formatEng(v, fmtUnit) : formatEng(v, fmtUnit))),
      size: 56,
    });
    const yUnit = parsed.db ? 'dB' : unit;
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight - 30,
      pxAlign: 0,
      scales: { x: { time: false, distr: parsed.log ? 3 : 1 }, y: { auto: true } },
      axes: [axis(parsed.xUnit, parsed.log), { ...axis(parsed.db ? '' : unit), values: (_u, s) => s.map((v) => (parsed.db ? `${v.toFixed(0)} dB` : formatEng(v, unit))) }],
      series: [
        { label: parsed.xUnit === 's' ? 't' : 'f', value: (_u, v) => (v == null ? '–' : formatEng(v, parsed.xUnit)) },
        ...traces.map((tr) => ({
          label: tr.name,
          stroke: colors.get(tr.name),
          width: 2,
          points: { show: false },
          value: (_u: uPlot, v: number | null) => (v == null ? '–' : parsed.db ? `${v.toFixed(2)} dB` : formatEng(v, yUnit)),
        })),
      ],
      cursor: { drag: { x: true, y: false }, points: { size: 8 } },
      legend: { live: true },
    };
    const plot = new uPlot(opts, [parsed.x, ...traces.map((t) => t.values)], el);
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: Math.max(80, el.clientHeight - 30) }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [parsed, traces, unit, colors, dark]);
  return <div ref={ref} className="h-full min-h-0 w-full" />;
}

type Status = 'idle' | 'running' | 'done' | 'error';

export function SimulationPanel() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const models = useStore((s) => s.library.models);
  const dark = useIsDark();
  const [uic, setUic] = useState(true);
  const [netlist, setNetlist] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [plots, setPlots] = useState<string[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'result' | 'log'>('result');
  const [internal, setInternal] = useState(false);
  const [height, setHeight] = useState(() => (docHasInstruments() ? Math.min(window.innerHeight - 180, 640) : Math.round(window.innerHeight * 0.42)));
  const firstRun = useRef(true);
  const [mode, setMode] = useState<'bench' | 'analysis'>(() => (docHasInstruments() ? 'bench' : 'analysis'));

  const regenerate = (): { netlist: string; plots: string[] } => {
    if (!ds) return { netlist: '', plots: [] };
    const r = buildNetlist(ds.doc, ds.fileName, models, { uic });
    const n: string[] = [];
    for (const e of r.errors) n.push(t(e.key === 'noGround' ? 'sim.noGround' : 'sim.noSymbols'));
    if (r.defaultAnalysisAdded) n.push(t('sim.noAnalysis'));
    n.push(...r.warnings.map((w) => t(`sim.w.${w.key}`, { name: w.name, value: w.value ?? '' })));
    setNotes(n);
    setPlots(r.plots);
    setNetlist(r.netlist);
    return r;
  };

  const run = async (text = netlist, plotNames = plots) => {
    setStatus('running');
    setError('');
    try {
      let res;
      try {
        res = await simulate(text);
      } catch (e) {
        // UIC helps oscillators start but can stall bias networks: retry with a DC operating point
        if (!/\buic\b/i.test(text)) throw e;
        const withoutUic = text.replace(/^(\.tran\b.*?)\s+uic\s*$/gim, '$1');
        res = await simulate(withoutUic);
        setNetlist(withoutUic);
        setUic(false);
        setNotes((n) => [...n, t('sim.uicRetry')]);
      }
      const p = parseResult(res.result);
      setParsed(p);
      setInfo(res.info + (res.warnings.length ? '\n' + res.warnings.join('\n') : ''));
      const wanted = plotNames.map((x) => x.toLowerCase());
      const byPlot = p.traces.filter((tr) => wanted.includes(tr.name.toLowerCase()));
      const initial = byPlot.length ? byPlot : p.traces.filter((tr) => tr.unit === 'V' && !tr.name.includes('.')).slice(0, 4);
      setVisible(new Set(initial.map((tr) => tr.name)));
      setStatus('done');
      setTab('result');
    } catch (e) {
      setError((e as Error).message);
      setInfo((e as Error & { info?: string }).info ?? '');
      setStatus('error');
      setTab('log');
    }
  };

  // build the netlist (and run once) when the panel opens or the document changes
  useEffect(() => {
    const r = regenerate();
    if (firstRun.current && r.netlist && mode === 'analysis') {
      firstRun.current = false;
      void run(r.netlist, r.plots);
    }
  }, [ds?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = useMemo(() => {
    const m = new Map<string, string>();
    const pal = dark ? SERIES_DARK : SERIES_LIGHT;
    // colour follows the entity: assigned by trace order, not by visibility
    parsed?.traces.forEach((tr, i) => m.set(tr.name, pal[i % MAX_SERIES]));
    return m;
  }, [parsed, dark]);

  const shown = parsed?.traces.filter((tr) => visible.has(tr.name)) ?? [];
  // one chart per unit: volts and amps never share an axis
  const byUnit = new Map<string, Trace[]>();
  for (const tr of shown) byUnit.set(tr.unit, [...(byUnit.get(tr.unit) ?? []), tr]);

  const toggle = (name: string) =>
    setVisible((v) => {
      const n = new Set(v);
      if (n.has(name)) n.delete(name);
      else if (n.size < MAX_SERIES) n.add(name);
      return n;
    });

  const exportCsv = () => {
    if (!parsed) return;
    const head = [parsed.xUnit === 's' ? 'time' : 'frequency', ...parsed.traces.map((t) => t.name)];
    const rows = parsed.x.map((x, i) => [x, ...parsed.traces.map((t) => t.values[i])].join(';'));
    download(`${ds?.fileName.replace(/\.bbs?$/, '') ?? 'sim'}_sim.csv`, new Blob([[head.join(';'), ...rows].join('\n')], { type: 'text/csv' }));
  };

  return (
    <section className="relative flex shrink-0 flex-col border-t border-line bg-panel" style={{ height }} aria-label={t('sim.title')}>
      <div
        className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize"
        onPointerDown={(e) => {
          const startY = e.clientY;
          const startH = height;
          const move = (ev: PointerEvent) => setHeight(Math.max(160, Math.min(window.innerHeight - 160, startH - (ev.clientY - startY))));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-[12.5px] font-semibold">{t('sim.title')}</h2>
        <span className="text-[11px] text-muted max-lg:hidden">NGSpice · WebAssembly</span>
        <div className="ml-2 flex rounded-lg bg-panel-2 p-0.5" role="tablist">
          {(['bench', 'analysis'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                if (m === 'bench') setHeight((h) => Math.max(h, Math.min(window.innerHeight - 180, 640)));
              }}
              className={cx('h-7 rounded-md px-3 text-[12px] font-medium', mode === m ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg')}
            >
              {t(m === 'bench' ? 'inst.bench' : 'sim.analysis')}
            </button>
          ))}
        </div>
        {mode === 'analysis' && (
        <div className="ml-3 flex items-center gap-2">
          <Button variant="primary" icon={status === 'running' ? Loader2 : Play} disabled={status === 'running' || !netlist} onClick={() => void run()} className={cx(status === 'running' && '[&_svg]:animate-spin')}>
            {status === 'running' ? t('sim.running') : t('sim.run')}
          </Button>
          <Button variant="ghost" icon={RefreshCw} onClick={() => regenerate()}>
            {t('sim.regenerate')}
          </Button>
          <Check
            checked={uic}
            onChange={(v) => {
              setUic(v);
              setNetlist((n) => (v ? n.replace(/^(\.tran\b(?:(?!\buic\b).)*)$/gim, '$1 uic') : n.replace(/^(\.tran\b.*?)\s+uic\s*$/gim, '$1')));
            }}
            label={t('sim.uic')}
          />
        </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {parsed && mode === 'analysis' && <IconButton icon={Download} label="CSV" onClick={exportCsv} />}
          <IconButton icon={X} label={t('sim.close')} onClick={() => setSimulationOpen(false)} />
        </div>
      </header>
      {mode === 'bench' ? (
        <Workbench />
      ) : (
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[38%] min-w-[260px] max-w-[520px] flex-col border-r border-line">
          <div className="flex h-7 items-center px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('sim.netlist')}</div>
          <textarea
            className="bb-scroll min-h-0 flex-1 resize-none bg-panel-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg outline-none"
            spellCheck={false}
            value={netlist}
            onChange={(e) => setNetlist(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run();
            }}
            aria-label={t('sim.netlist')}
          />
          {notes.length > 0 && (
            <ul className="bb-scroll max-h-28 overflow-auto border-t border-line px-3 py-2 text-[11.5px]">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-7 items-center gap-1 px-2">
            {(['result', 'log'] as const).map((k) => (
              <button key={k} className={cx('h-6 rounded px-2 text-[11.5px]', tab === k ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover')} onClick={() => setTab(k)}>
                {t(k === 'result' ? 'sim.result' : 'sim.log')}
              </button>
            ))}
            {parsed && <span className="ml-2 text-[11px] text-muted">{t('sim.points', { n: parsed.x.length })}</span>}
          </div>
          {tab === 'log' ? (
            <pre className="bb-scroll min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-snug text-muted">
              {error && <span className="text-red-600 dark:text-red-400">{`${t('sim.error')}: ${error}\n\n`}</span>}
              {info}
            </pre>
          ) : !parsed ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-muted">
              {status === 'running' ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> {t('sim.loading')}
                </span>
              ) : status === 'error' ? (
                <span className="text-red-600 dark:text-red-400">{error}</span>
              ) : (
                t('sim.hint')
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col gap-1 px-2 pb-1">
                {[...byUnit.entries()].map(([unit, trs]) => (
                  <div key={unit} className="min-h-0 flex-1">
                    <Chart parsed={parsed} traces={trs} unit={unit} colors={colors} />
                  </div>
                ))}
                {!byUnit.size && <div className="flex flex-1 items-center justify-center text-muted">{t('sim.traces')} →</div>}
              </div>
              <div className="bb-scroll w-44 shrink-0 overflow-y-auto border-l border-line px-2 py-1">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('sim.traces')}</div>
                <label className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  {t('sim.internal')}
                </label>
                {parsed.traces.filter((tr) => internal || visible.has(tr.name) || !/[.#]/.test(tr.name)).map((tr) => (
                  <label key={tr.name} className="flex cursor-pointer items-center gap-2 py-0.5 text-[11.5px]">
                    <input type="checkbox" checked={visible.has(tr.name)} onChange={() => toggle(tr.name)} />
                    <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: colors.get(tr.name) }} />
                    <span className="truncate font-mono">{tr.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
