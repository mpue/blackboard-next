import { useMemo } from 'react';
import { Activity, RotateCcw, Terminal, Trash2, Upload } from 'lucide-react';
import type { SymbolItem } from '../model/types.ts';
import { setLiveMode, setLiveValues, useLive } from '../store/live.ts';
import { openMonitor, resetMcu, useMcu, type ChipState } from '../mcu/controller.ts';
import { clearFirmware, loadExample, loadHexFile, setClock } from '../mcu/firmwareActions.ts';
import { EXAMPLES, exampleById, type ExampleId } from '../mcu/examples.ts';
import { parseHex } from '../mcu/hex.ts';
import { mcuClock, mcuFirmware } from '../mcu/pinout.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { Button, Field, IconButton, Select, cx } from './primitives.tsx';

const CLOCKS = [1e6, 8e6, 16e6, 20e6];

function Status({ item, chip }: { item: SymbolItem; chip: ChipState | undefined }) {
  const t = useT();
  const on = useLive((s) => s.on);
  const mode = useLive((s) => s.mode);
  const hex = mcuFirmware(item);
  let tone: 'ok' | 'warn' | 'off' | 'bad' = 'off';
  let text: string;
  let action: { label: string; run: () => void } | undefined;
  if (!hex) {
    text = t('mcu.st.noFirmware');
    tone = 'warn';
  } else if (!on) {
    text = t('mcu.st.liveOff');
    action = { label: t('mcu.liveOn'), run: () => setLiveValues(true) };
  } else if (mode !== 'dc') {
    text = t('mcu.st.slowmo');
    action = { label: t('mcu.toDc'), run: () => setLiveMode('dc') };
  } else if (chip?.status === 'error') {
    text = t('mcu.st.error', { message: chip.error?.message ?? '' });
    tone = 'bad';
  } else if (chip?.status === 'running') {
    text = t('mcu.st.running', { mhz: mcuClock(item) / 1e6, speed: Math.round(chip.speed * 100) });
    tone = 'ok';
  } else if (chip?.status === 'unpowered' && chip.vcc > 0.05) {
    text = t('mcu.st.unpowered', { volts: chip.vcc.toFixed(2) });
    tone = 'warn';
  } else {
    text = t('mcu.st.starting');
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2 text-[12px] leading-snug">
        <span
          className={cx(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            tone === 'ok' && 'bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500',
            tone === 'warn' && 'bg-amber-500',
            tone === 'bad' && 'bg-red-500',
            tone === 'off' && 'bg-slate-400',
          )}
        />
        <span>{text}</span>
      </div>
      {action && (
        <Button icon={Activity} onClick={action.run} className="self-start">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Firmware, clock and run state of a microcontroller symbol. */
export function McuFields({ item }: { item: SymbolItem }) {
  const t = useT();
  const chip = useMcu((s) => s.chips[item.id]);
  const hex = mcuFirmware(item);
  const name = item.properties?.firmwareName ?? '';
  const example = name.startsWith('example:') ? exampleById(name.slice(8)) : undefined;
  const bytes = useMemo(() => {
    try {
      return hex ? parseHex(hex).used : 0;
    } catch {
      return 0;
    }
  }, [hex]);
  return (
    <div className="grid gap-2.5 rounded-md bg-panel-2 p-2">
      <Status item={item} chip={chip} />
      <Field label={t('mcu.firmware')}>
        <span className="min-w-0 flex-1 truncate text-[12px]" title={name}>
          {hex ? `${example ? t(`mcu.ex.${example.id}` as I18nKey) : name || 'HEX'} · ${bytes} B` : t('mcu.none')}
        </span>
        {hex && <IconButton icon={Trash2} size={14} label={t('mcu.remove')} onClick={() => clearFirmware(item.id)} />}
      </Field>
      <Field label={t('mcu.example')}>
        <Select
          value={example?.id ?? ''}
          options={[{ value: '', label: t('mcu.exampleNone') }, ...EXAMPLES.map((e) => ({ value: e.id, label: t(`mcu.ex.${e.id}` as I18nKey) }))]}
          onChange={(v) => v && void loadExample(item.id, v as ExampleId)}
        />
      </Field>
      {example && (
        <>
          <p className="text-[11.5px] leading-snug text-muted">{t(`mcu.ex.${example.id}.wire` as I18nKey)}</p>
          <details className="text-[11.5px]">
            <summary className="cursor-pointer text-muted hover:text-fg">{t('mcu.sketch')}</summary>
            <pre className="bb-scroll mt-1 overflow-x-auto rounded bg-panel p-2 font-mono text-[10.5px] leading-relaxed">{example.sketch}</pre>
          </details>
        </>
      )}
      <Button icon={Upload} onClick={() => void loadHexFile(item.id)} className="self-start">
        {t('mcu.loadHex')}
      </Button>
      <p className="text-[11px] leading-snug text-muted">{t('mcu.hexHint')}</p>
      <Field label={t('mcu.clock')}>
        <Select value={mcuClock(item)} options={CLOCKS.map((f) => ({ value: f, label: `${f / 1e6} MHz` }))} onChange={(v) => setClock(item.id, v)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        <Button icon={RotateCcw} onClick={() => resetMcu(item.id)} disabled={chip?.status !== 'running'}>
          {t('mcu.reset')}
        </Button>
        <Button icon={Terminal} onClick={() => openMonitor(item.id)}>
          {t('mcu.monitor')}
        </Button>
      </div>
    </div>
  );
}
