import { useMemo, useState } from 'react';
import { Activity, Code2, RotateCcw, Terminal, Trash2, Upload } from 'lucide-react';
import type { SymbolItem } from '../model/types.ts';
import { setLiveMode, setLiveValues, useLive } from '../store/live.ts';
import { openMonitor, resetMcu, useMcu, type ChipState } from '../mcu/controller.ts';
import { clearFirmware, loadEsp32Example, loadEsp32Image, loadExample, loadHexFile, setClock, setScript, setUsbPower } from '../mcu/firmwareActions.ts';
import { EXAMPLES, exampleById, type ExampleId } from '../mcu/examples.ts';
import { ESP32_EXAMPLES, esp32ExampleById, type Esp32ExampleId } from '../mcu/esp32Examples.ts';
import { parseHex } from '../mcu/hex.ts';
import { mcuClock, mcuFirmware, mcuKind, usbPowered } from '../mcu/pinout.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { Button, Check, Dialog, Field, IconButton, Select, cx } from './primitives.tsx';

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
    text = t(mcuKind(item) === 'esp32' ? 'mcu.st.unpoweredEsp32' : 'mcu.st.unpowered', { volts: chip.vcc.toFixed(2) });
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

/** Wiring hint and the Arduino sketch of an ATmega example. */
function AvrExampleInfo({ id }: { id: ExampleId }) {
  const t = useT();
  const ex = exampleById(id)!;
  return (
    <>
      <p className="text-[11.5px] leading-snug text-muted">{t(`mcu.ex.${id}.wire` as I18nKey)}</p>
      <details className="text-[11.5px]">
        <summary className="cursor-pointer text-muted hover:text-fg">{t('mcu.sketch')}</summary>
        <pre className="bb-scroll mt-1 overflow-x-auto rounded bg-panel p-2 font-mono text-[10.5px] leading-relaxed">{ex.sketch}</pre>
      </details>
    </>
  );
}

function AvrProgram({ item }: { item: SymbolItem }) {
  const t = useT();
  const hex = item.properties?.firmware;
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
    <>
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
      {example && <AvrExampleInfo id={example.id} />}
      <Button icon={Upload} onClick={() => void loadHexFile(item.id)} className="self-start">
        {t('mcu.loadHex')}
      </Button>
      <p className="text-[11px] leading-snug text-muted">{t('mcu.hexHint')}</p>
      <Field label={t('mcu.clock')}>
        <Select value={mcuClock(item)} options={CLOCKS.map((f) => ({ value: f, label: `${f / 1e6} MHz` }))} onChange={(v) => setClock(item.id, v)} />
      </Field>
    </>
  );
}

/** A larger editor for the MicroPython code of an ESP32. */
function CodeDialog({ item, onClose }: { item: SymbolItem; onClose: () => void }) {
  const t = useT();
  const [code, setCode] = useState(item.properties?.script ?? ESP32_EXAMPLES[0].script);
  return (
    <Dialog
      title={t('mcu.code.title', { ref: item.name })}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('mcu.code.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setScript(item.id, code);
              onClose();
            }}
          >
            {t('mcu.code.apply')}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-[12px] text-muted">{t('mcu.code.hint')}</p>
      <textarea
        className="bb-input h-[50vh] w-full resize-none p-2 font-mono text-[12.5px] leading-relaxed"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          // Tab indents (Python), Ctrl+Enter applies
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: a, selectionEnd: b } = el;
            setCode(code.slice(0, a) + '    ' + code.slice(b));
            requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4));
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            setScript(item.id, code);
            onClose();
          }
        }}
        aria-label={t('mcu.code.title', { ref: item.name })}
      />
    </Dialog>
  );
}

function Esp32Program({ item }: { item: SymbolItem }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const p = item.properties ?? {};
  const name = p.firmwareName ?? '';
  const example = !p.firmware && name.startsWith('example:') ? esp32ExampleById(name.slice(8)) : undefined;
  const label = p.firmware
    ? `${name || 'firmware.bin'} · ${Math.round((p.firmware.length * 3) / 4 / 1024)} KB`
    : p.script
      ? `${t('mcu.micropython')} · ${example ? t(`mcu.ex.${example.id}` as I18nKey) : t('mcu.ownCode')}`
      : t('mcu.none');
  return (
    <>
      <Check checked={usbPowered(item)} onChange={(v) => setUsbPower(item.id, v)} label={t('mcu.usb')} />
      <p className="-mt-1 text-[11px] leading-snug text-muted">{t('mcu.usbHint')}</p>
      <Field label={t('mcu.firmware')}>
        <span className="min-w-0 flex-1 truncate text-[12px]" title={name}>
          {label}
        </span>
        {mcuFirmware(item) && <IconButton icon={Trash2} size={14} label={t('mcu.remove')} onClick={() => clearFirmware(item.id)} />}
      </Field>
      <Field label={t('mcu.example')}>
        <Select
          value={example?.id ?? ''}
          options={[{ value: '', label: t('mcu.exampleNone') }, ...ESP32_EXAMPLES.map((e) => ({ value: e.id, label: t(`mcu.ex.${e.id}` as I18nKey) }))]}
          onChange={(v) => v && loadEsp32Example(item.id, v as Esp32ExampleId)}
        />
      </Field>
      {example && <p className="text-[11.5px] leading-snug text-muted">{t(`mcu.esp.${example.id}.wire` as I18nKey)}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button icon={Code2} onClick={() => setEditing(true)}>
          {t('mcu.editCode')}
        </Button>
        <Button icon={Upload} onClick={() => void loadEsp32Image(item.id)}>
          {t('mcu.loadBin')}
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted">{t('mcu.binHint')}</p>
      {editing && <CodeDialog item={item} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Firmware, supply and run state of a microcontroller symbol. */
export function McuFields({ item }: { item: SymbolItem }) {
  const t = useT();
  const chip = useMcu((s) => s.chips[item.id]);
  return (
    <div className="grid gap-2.5 rounded-md bg-panel-2 p-2">
      <Status item={item} chip={chip} />
      {mcuKind(item) === 'esp32' ? <Esp32Program item={item} /> : <AvrProgram item={item} />}
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
