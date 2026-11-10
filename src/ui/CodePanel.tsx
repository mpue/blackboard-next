// The code editor beside the canvas: the C/C++ program of one ATmega, its
// files as tabs, "Verify" and "Upload" like in the Arduino IDE, and what the
// compiler said below. The text goes into the chip symbol a moment after
// typing stops, so the schematic saves it and undo there reaches it too.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, AlertTriangle, Check, Code2, FileDown, FolderOpen, Info, Loader2, Play, Plus, Save, Terminal, X } from 'lucide-react';
import type { SymbolItem } from '../model/types.ts';
import { activeDoc, toast, useStore } from '../store/store.ts';
import { commands as appCommands, runCommand } from '../editor/commands.ts';
import { openMonitor } from '../mcu/controller.ts';
import { mcuClock } from '../mcu/pinout.ts';
import { encodeSketch, exampleOf, FILE_NAME, mainFile, MAX_FILES, sketchFiles, storeSketch, templateFiles, TEMPLATES, type Diagnostic, type SourceFile, type TemplateId } from '../mcu/sketch.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { clearRun, closeCode, compileChip, pickSource, saveHex, saveSource, useCode, type CompileRun } from './codeState.ts';
import { CodeEditor, type JumpTarget } from './CodeEditor.tsx';
import { McuStatus } from './McuFields.tsx';
import { AccessActions, isAccountProblem, problemText, useCompileAccess } from './CompileAccess.tsx';
import { IconButton, cx } from './primitives.tsx';

const WIDTH_KEY = 'blackboard.code.width';
const WRITE_DELAY_MS = 800;

function savedWidth(): number {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    if (w >= 320) return w;
  } catch {
    /* storage unavailable */
  }
  return Math.round(Math.min(620, Math.max(380, window.innerWidth * 0.4)));
}

/** The chip whose code is open, while its tab is the active one. */
export function CodePanel({ phone }: { phone: boolean }) {
  const open = useCode((s) => s.open);
  const docOpen = useStore((s) => !!open && s.docs.some((d) => d.id === open.docId));
  const chip = useStore((s) => {
    if (!open || s.active !== open.docId) return undefined;
    const it = activeDoc(s)?.doc.items.find((i) => i.id === open.chipId);
    return it?.kind === 'symbol' ? it : undefined;
  });
  const chipGone = useStore((s) => !!open && s.active === open.docId && !activeDoc(s)?.doc.items.some((i) => i.id === open.chipId));
  // the tab was closed or the chip deleted
  useEffect(() => {
    if (open && (!docOpen || chipGone)) closeCode();
  }, [open, docOpen, chipGone]);
  if (!open || !chip) return null;
  return <Panel key={`${open.docId}/${open.chipId}`} docId={open.docId} chip={chip} phone={phone} />;
}

function startFiles(chip: SymbolItem): SourceFile[] {
  const stored = sketchFiles(chip);
  if (stored) return stored;
  // a chip running one of the examples starts with that example's sketch
  const name = chip.properties?.firmwareName ?? '';
  const ex = name.startsWith('example:') ? (name.slice(8) as TemplateId) : undefined;
  return ex && TEMPLATES.includes(ex) ? templateFiles(ex) : templateFiles('empty');
}

function Panel({ docId, chip, phone }: { docId: string; chip: SymbolItem; phone: boolean }) {
  const t = useT();
  const [files, setFiles] = useState<SourceFile[]>(() => startFiles(chip));
  const [active, setActive] = useState(() => files[0].name);
  const [jump, setJump] = useState<JumpTarget>();
  const [width, setWidth] = useState(savedWidth);
  const run = useCode((s) => s.runs[chip.id]);
  const clock = mcuClock(chip);
  const filesRef = useRef(files);
  filesRef.current = files;

  // ---- keeping the text in the chip ----
  /** the `code` property as this panel last wrote it */
  const written = useRef(chip.properties?.code ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const code = encodeSketch(filesRef.current);
    if (code === written.current) return;
    written.current = code;
    storeSketch(docId, chip.id, filesRef.current);
  }, [docId, chip.id]);
  useEffect(() => flush, [flush]);

  const update = (next: SourceFile[], now = false) => {
    setFiles(next);
    filesRef.current = next;
    clearTimeout(timer.current);
    if (now) flush();
    else timer.current = setTimeout(flush, WRITE_DELAY_MS);
  };

  // changed from outside: undo or redo in the schematic, or uploaded (then it is what we have)
  const code = chip.properties?.code;
  useEffect(() => {
    if (code === undefined || code === written.current) return;
    written.current = code;
    if (code === encodeSketch(filesRef.current)) return;
    const next = sketchFiles(chip);
    if (!next) return;
    clearTimeout(timer.current);
    setFiles(next);
    filesRef.current = next;
    setActive((a) => (next.some((f) => f.name === a) ? a : next[0].name));
  }, [code]);

  // ---- commands ----
  const verify = () => {
    flush();
    void compileChip(docId, chip.id, filesRef.current, clock, false);
  };
  const upload = () => {
    clearTimeout(timer.current);
    void compileChip(docId, chip.id, filesRef.current, clock, true);
  };
  const commands = { verify, upload, save: () => (flush(), runCommand(appCommands.save)) };

  const onChange = (name: string, content: string) => {
    const cur = filesRef.current;
    const f = cur.find((x) => x.name === name);
    if (!f || f.content === content) return;
    update(cur.map((x) => (x === f ? { ...x, content } : x)));
  };

  const templateLabel = (id: TemplateId) => {
    const ex = exampleOf(id);
    return t(ex ? (`mcu.ex.${ex}` as I18nKey) : (`code.tpl.${id}` as I18nKey));
  };
  const templateWire = (id: TemplateId) => {
    const ex = exampleOf(id);
    return ex && t(`mcu.ex.${ex}.wire` as I18nKey);
  };

  const replaceAll = (next: SourceFile[], question: string) => {
    const now = encodeSketch(filesRef.current);
    // a template as it came (with or without the wiring hint) is replaced without asking
    const pristine = TEMPLATES.some((id) => [templateFiles(id), templateFiles(id, templateWire(id))].some((f) => encodeSketch(f) === now));
    if (!pristine && !confirm(question)) return;
    update(next, true);
    setActive(next[0].name);
  };

  const askName = (question: string, initial: string, except?: string): string | undefined => {
    const name = prompt(question, initial)?.trim();
    if (!name || name === except) return undefined;
    if (!FILE_NAME.test(name)) return void toast(t('code.badName', { name }), 'error');
    if (filesRef.current.some((f) => f.name.toLowerCase() === name.toLowerCase() && f.name !== except)) return void toast(t('code.nameTaken', { name }), 'error');
    return name;
  };
  const addFile = () => {
    if (files.length >= MAX_FILES) return toast(t('code.tooMany', { n: MAX_FILES }), 'error');
    let n = 1;
    while (files.some((f) => f.name === `datei${n}.h`)) n++;
    const name = askName(t('code.newFileName'), `datei${n}.h`);
    if (!name) return;
    update([...files, { name, content: name.endsWith('.h') ? `#pragma once\n\n` : '' }], true);
    setActive(name);
  };
  const renameFile = (old: string) => {
    const name = askName(t('code.rename', { name: old }), old, old);
    if (!name) return;
    update(
      files.map((f) => (f.name === old ? { ...f, name } : f)),
      true,
    );
    if (active === old) setActive(name);
  };
  const removeFile = (name: string) => {
    const f = files.find((x) => x.name === name);
    if (!f || (f.content.trim() && !confirm(t('code.removeFile', { name })))) return;
    const next = files.filter((x) => x !== f);
    update(next, true);
    if (active === name) setActive(next[0].name);
  };

  // ---- width ----
  const drag = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = Math.round(Math.min(window.innerWidth - 320, Math.max(320, startW + startX - ev.clientX)));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(WIDTH_KEY, String(w));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const main = mainFile(files);
  const diagnostics = run?.result?.diagnostics ?? [];

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-line bg-panel max-md:h-[60%] max-md:border-l-0 max-md:border-t"
      style={phone ? undefined : { width }}
      aria-label={t('code.title', { ref: chip.name })}
    >
      {!phone && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('code.resize')}
          className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/30"
          onPointerDown={drag}
        />
      )}
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Code2 size={15} className="shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t('code.title', { ref: chip.name })}</h2>
        <IconButton icon={Terminal} size={15} label={t('code.monitor')} onClick={() => openMonitor(chip.id)} />
        <IconButton icon={X} size={15} label={t('code.close')} onClick={closeCode} />
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 dark:text-slate-950"
          title={t('code.uploadHint')}
          onClick={upload}
          disabled={run?.busy}
        >
          {run?.busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {t('code.upload')}
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] font-medium hover:bg-hover disabled:opacity-50"
          title={t('code.verifyHint')}
          onClick={verify}
          disabled={run?.busy}
        >
          <Check size={14} />
          {t('code.verify')}
        </button>
        <span className="flex-1" />
        <select
          className="bb-input h-8 max-w-[11rem] text-[12px]"
          value=""
          aria-label={t('code.template')}
          onChange={(e) => {
            const id = e.target.value as TemplateId;
            e.target.value = '';
            if (!id) return;
            replaceAll(templateFiles(id, templateWire(id)), t('code.replace', { name: templateLabel(id) }));
          }}
        >
          <option value="">{t('code.template')}</option>
          {TEMPLATES.map((id) => (
            <option key={id} value={id}>
              {templateLabel(id)}
            </option>
          ))}
        </select>
        <IconButton
          icon={FolderOpen}
          size={15}
          label={t('code.open')}
          onClick={async () => {
            const picked = await pickSource();
            if (picked.length) replaceAll(picked, t('code.openReplace'));
          }}
        />
        <IconButton icon={Save} size={15} label={t('code.saveSource')} onClick={() => void saveSource(filesRef.current)} />
        <IconButton icon={FileDown} size={15} label={t('code.saveHex')} disabled={run?.busy} onClick={() => (flush(), void saveHex(docId, chip.id, filesRef.current, clock))} />
      </div>

      <div className="bb-scroll flex items-end gap-0.5 overflow-x-auto border-b border-line bg-panel-2 px-1.5 pt-1" role="tablist">
        {files.map((f) => {
          const errors = diagnostics.filter((d) => d.own && d.file === f.name && d.severity === 'error').length;
          return (
            <div
              key={f.name}
              role="tab"
              aria-selected={f.name === active}
              tabIndex={0}
              className={cx(
                'group flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-t-md border border-b-0 px-2.5 font-mono text-[11.5px]',
                f.name === active ? 'border-line bg-panel text-fg' : 'border-transparent text-muted hover:bg-hover hover:text-fg',
              )}
              title={`${f.name === main ? `${t('code.mainFile')} · ` : ''}${t('code.renameHint')}`}
              onClick={() => setActive(f.name)}
              onDoubleClick={() => renameFile(f.name)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActive(f.name)}
            >
              {errors > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
              {f.name}
              {f.name !== main && (
                <button
                  type="button"
                  className="-mr-1 rounded p-0.5 opacity-0 hover:bg-hover group-hover:opacity-100 group-aria-selected:opacity-60"
                  aria-label={t('code.removeFileLabel', { name: f.name })}
                  title={t('code.removeFileLabel', { name: f.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.name);
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="mb-0.5 ml-0.5 rounded p-1 text-muted hover:bg-hover hover:text-fg" aria-label={t('code.newFile')} title={t('code.newFile')} onClick={addFile}>
          <Plus size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <CodeEditor files={files} active={active} diagnostics={diagnostics} jump={jump} label={t('code.title', { ref: chip.name })} onChange={onChange} commands={commands} />
      </div>

      <Output
        run={run}
        chip={chip}
        clock={clock}
        onPick={(d) => {
          if (!files.some((f) => f.name === d.file)) return;
          setActive(d.file);
          setJump((j) => ({ file: d.file, line: d.line, column: d.column, n: (j?.n ?? 0) + 1 }));
        }}
        onKeySaved={() => clearRun(chip.id)}
      />
    </aside>
  );
}

function Meter({ label, used, max, locale }: { label: string; used: number; max: number; locale: string }) {
  const t = useT();
  const pct = max ? Math.round((used / max) * 100) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between gap-2 text-[10.5px] text-muted">
        <span>{label}</span>
        <span className="truncate">{t('code.bytes', { used: used.toLocaleString(locale), max: max.toLocaleString(locale), pct })}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-hover">
        <div className={cx('h-full rounded-full', pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} />
      </div>
    </div>
  );
}

const ICONS = { error: AlertCircle, warning: AlertTriangle, note: Info };

function Output({ run, chip, clock, onPick, onKeySaved }: { run: CompileRun | undefined; chip: SymbolItem; clock: number; onPick: (d: Diagnostic) => void; onKeySaved: () => void }) {
  const t = useT();
  const r = run?.result;
  const errors = r?.diagnostics.filter((d) => d.severity === 'error').length ?? 0;
  const warnings = r?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0;
  const locale = useStore((s) => (s.settings.lang === 'de' ? 'de-DE' : 'en-US'));
  const mhz = (clock / 1e6).toLocaleString(locale);
  const seconds = r ? (r.ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '';
  const messages = r?.diagnostics ?? [];
  const [access, recheck] = useCompileAccess();
  const usage = run?.usage ?? access.usage;
  // what the account allows: after a compile from its answer, before from the server
  const accountProblem = run?.busy ? undefined : run?.problem ? (isAccountProblem(run.problem) ? run.problem : undefined) : !r ? access.problem : undefined;

  let tone: 'ok' | 'bad' | 'busy' | 'idle' = 'idle';
  let text = t('code.noRun');
  if (run?.busy) {
    tone = 'busy';
    text = t('code.compiling');
  } else if (run?.problem) {
    tone = 'bad';
    text = problemText(t, run.problem, run.usage);
  } else if (!r && access.problem) {
    text = problemText(t, access.problem);
  } else if (r?.ok) {
    tone = 'ok';
    text = run?.uploaded ? t('code.okUploaded', { s: seconds, ref: chip.name, mhz }) : t('code.ok', { s: seconds, mhz });
  } else if (r) {
    tone = 'bad';
    text = r.log === 'timeout' ? t('code.timeout') : errors ? t('code.errors', { n: errors }) : t('code.failed');
  }

  return (
    <div className="flex max-h-[40%] min-h-[7.5rem] shrink-0 flex-col border-t border-line bg-panel-2">
      <div className="flex items-start gap-2 px-3 pb-1.5 pt-2 text-[12px] leading-snug">
        {tone === 'busy' ? (
          <Loader2 size={14} className="mt-px shrink-0 animate-spin text-accent" />
        ) : tone === 'ok' ? (
          <Check size={14} className="mt-px shrink-0 text-emerald-500" />
        ) : tone === 'bad' ? (
          <AlertCircle size={14} className="mt-px shrink-0 text-red-500" />
        ) : (
          <Info size={14} className="mt-px shrink-0 text-muted" />
        )}
        <span className={cx('min-w-0 flex-1', tone === 'idle' && 'text-muted')}>
          {text}
          {warnings > 0 && !run?.busy && <span className="ml-1.5 text-amber-600 dark:text-amber-400">· {t('code.warnings', { n: warnings })}</span>}
          {usage && usage.limit !== null && !run?.busy && !accountProblem && (
            <span className="mt-0.5 block text-[11px] text-muted">{t('code.usage', { used: String(usage.used), limit: String(usage.limit) })}</span>
          )}
        </span>
      </div>
      {accountProblem && (
        <div className="px-3 pb-2 pl-[30px]">
          <AccessActions
            problem={accountProblem}
            onKey={() => {
              recheck();
              onKeySaved();
            }}
          />
        </div>
      )}
      {r?.ok && r.flash && !run?.busy && (
        <div className="flex gap-3 px-3 pb-2">
          <Meter label={t('code.flash')} used={r.flash.used} max={r.flash.max} locale={locale} />
          {r.ram && <Meter label={t('code.ram')} used={r.ram.used} max={r.ram.max} locale={locale} />}
        </div>
      )}
      {run?.uploaded && !run.busy && (
        <div className="px-3 pb-2">
          <McuStatus item={chip} />
        </div>
      )}
      {(messages.length > 0 || (r && !r.ok && r.log)) && !run?.busy && (
        <div className="bb-scroll min-h-0 flex-1 overflow-y-auto border-t border-line px-1.5 py-1">
          {messages.map((d, i) => {
            const Icon = ICONS[d.severity];
            return (
              <button
                key={i}
                type="button"
                className={cx('flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left text-[11.5px] leading-snug hover:bg-hover', !d.own && 'cursor-default')}
                onClick={() => onPick(d)}
              >
                <Icon size={13} className={cx('mt-px shrink-0', d.severity === 'error' ? 'text-red-500' : d.severity === 'warning' ? 'text-amber-500' : 'text-muted')} />
                <span className="shrink-0 font-mono text-muted">
                  {d.file}:{d.line}
                </span>
                <span className="min-w-0 break-words font-mono">{d.message}</span>
              </button>
            );
          })}
          {r?.log && r.log !== 'timeout' && (
            <details className="px-1.5 py-1 text-[11.5px]" open={!r.ok && !messages.length}>
              <summary className="cursor-pointer text-muted hover:text-fg">{t('code.log')}</summary>
              <pre className="bb-scroll mt-1 overflow-x-auto whitespace-pre rounded bg-[#0b1220] p-2 font-mono text-[10.5px] leading-relaxed text-slate-200">{r.log}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
