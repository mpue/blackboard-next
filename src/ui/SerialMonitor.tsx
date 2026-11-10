import { useEffect, useRef, useState } from 'react';
import { Eraser, Send, Terminal, X } from 'lucide-react';
import { activeDoc, useStore } from '../store/store.ts';
import { clearSerial, openMonitor, sendSerial, useMcu } from '../mcu/controller.ts';
import { useT } from '../i18n/i18n.ts';

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 115200, 230400, 250000, 500000, 1000000];

/** The rate the firmware asked for: UBRR rounding makes 9600 come out as 9615 at 16 MHz. */
const nominalBaud = (baud: number) => BAUD_RATES.find((b) => Math.abs(baud - b) / b < 0.035) ?? baud;

/**
 * What the firmware writes to the serial port (USART0), and a line to send
 * text to it, like the serial monitor of the Arduino IDE (line ending "\n").
 */
export function SerialMonitor() {
  const t = useT();
  const id = useMcu((s) => s.monitor);
  const text = useMcu((s) => (id ? (s.serial[id] ?? '') : ''));
  const chip = useMcu((s) => (id ? s.chips[id] : undefined));
  const ref = useStore((s) => {
    const it = id ? activeDoc(s)?.doc.items.find((i) => i.id === id) : undefined;
    return it?.kind === 'symbol' ? it.name : undefined;
  });
  const [line, setLine] = useState('');
  const out = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = out.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  if (!id || !ref) return null;
  return (
    <div className="bb-pop absolute bottom-3 right-3 z-30 flex w-[min(420px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl backdrop-blur">
      <header className="flex items-center gap-2 px-3 py-2">
        <Terminal size={14} className="text-emerald-500" />
        <span className="flex-1 truncate text-[12.5px] font-semibold">
          {t('mcu.monitor')} · {ref}
        </span>
        {!!chip?.baud && <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{nominalBaud(chip.baud)} Baud</span>}
        <button className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg" onClick={() => clearSerial(id)} aria-label={t('mcu.serial.clear')} title={t('mcu.serial.clear')}>
          <Eraser size={14} />
        </button>
        <button className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg" onClick={() => openMonitor(null)} aria-label={t('mcu.serial.close')} title={t('mcu.serial.close')}>
          <X size={14} />
        </button>
      </header>
      <pre
        ref={out}
        className="bb-scroll h-40 overflow-y-auto whitespace-pre-wrap break-all border-y border-line bg-[#0b1220] px-3 py-2 font-mono text-[11.5px] leading-relaxed text-emerald-300"
        aria-live="polite"
      >
        {text || <span className="text-slate-500">{t('mcu.serial.empty')}</span>}
      </pre>
      <form
        className="flex items-center gap-1.5 px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendSerial(id, `${line}\n`);
          setLine('');
        }}
      >
        <input className="bb-input h-7 flex-1 font-mono text-[12px]" value={line} placeholder={t('mcu.serial.placeholder')} onChange={(e) => setLine(e.target.value)} />
        <button type="submit" className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[12px] font-medium text-white dark:text-slate-950">
          <Send size={12} />
          {t('mcu.serial.send')}
        </button>
      </form>
    </div>
  );
}
