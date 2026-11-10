// Small building blocks of the admin page, in the look of the landing page.

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';

export const input =
  'h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[14px] text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 disabled:opacity-60';
export const textarea =
  'rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13.5px] leading-relaxed text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30';

const VARIANTS = {
  primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
  default: 'border border-white/10 text-slate-200 hover:bg-white/5',
  danger: 'border border-red-500/30 text-red-300 hover:bg-red-500/10',
};

export function Button({
  variant = 'default',
  busy,
  icon: Icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; busy?: boolean; icon?: typeof X }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium transition disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

export function Card({ title, children, className = '', actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center gap-3">
          {title && <h2 className="text-[16px] font-semibold text-white">{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const TONES = {
  slate: 'bg-white/10 text-slate-300',
  indigo: 'bg-indigo-500/20 text-indigo-200',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-200',
  red: 'bg-red-500/15 text-red-300',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[13px]">
      <span className="font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-[12px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`w-full ${wide ? 'max-w-[760px]' : 'max-w-[520px]'} rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-200 shadow-2xl`}>
        <header className="mb-5 flex items-start gap-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** a short message at the bottom of the page */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [text, onDone]);
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-[60] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-[14px] text-white shadow-2xl">
      {text}
    </div>
  );
}

export function Pager({ offset, total, size, onChange }: { offset: number; total: number; size: number; onChange: (offset: number) => void }) {
  if (total <= size) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-[13px] text-slate-400">
      <span>
        {offset + 1}–{Math.min(offset + size, total)} von {total}
      </span>
      <Button disabled={offset === 0} onClick={() => onChange(Math.max(offset - size, 0))}>
        Zurück
      </Button>
      <Button disabled={offset + size >= total} onClick={() => onChange(offset + size)}>
        Weiter
      </Button>
    </div>
  );
}

/** an error of a call, in words */
export const problem = (e: unknown) => {
  const code = e instanceof Error ? e.message : String(e);
  const words: Record<string, string> = {
    self: 'Das geht nicht mit dem eigenen Konto.',
    settings: 'Die Einstellungen passen nicht (Datum JJJJ-MM-TT, Preise ab 0, Links mit https://).',
    sent: 'Diese Ausgabe ist schon verschickt.',
    sending: 'Diese Ausgabe wird gerade verschickt.',
    empty: 'Betreff und Text dürfen nicht leer sein.',
    verified: 'Die Adresse ist schon bestätigt.',
    forbidden: 'Kein Zugriff.',
  };
  return words[code] ?? `Das hat nicht geklappt (${code}).`;
};
