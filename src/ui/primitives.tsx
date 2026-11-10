import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function IconButton({
  icon: Icon,
  label,
  active,
  shortcut,
  className,
  size = 16,
  ...rest
}: { icon: LucideIcon; label: string; active?: boolean; shortcut?: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-35',
        active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
        className,
      )}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.8} />
    </button>
  );
}

export function Button({
  variant = 'default',
  className,
  icon: Icon,
  children,
  ...rest
}: { variant?: 'default' | 'primary' | 'ghost' | 'danger'; icon?: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-white shadow-sm hover:brightness-110 dark:text-slate-950',
        variant === 'default' && 'border border-line bg-panel text-fg hover:bg-hover',
        variant === 'ghost' && 'text-muted hover:bg-hover hover:text-fg',
        variant === 'danger' && 'border border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={15} strokeWidth={1.9} />}
      {children}
    </button>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cx('grid items-center gap-2', wide ? 'grid-cols-1' : 'grid-cols-[92px_1fr]')}>
      <span className="truncate text-[11.5px] text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </label>
  );
}

/** Text input that commits on blur/Enter, so typing does not create undo steps per key. */
export function TextInput({ value, onCommit, placeholder, mono, id }: { value: string; onCommit: (v: string) => void; placeholder?: string; mono?: boolean; id?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      id={id}
      className={cx('bb-input', mono && 'font-mono')}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function TextArea({ value, onCommit, rows = 3, mono, id }: { value: string; onCommit: (v: string) => void; rows?: number; mono?: boolean; id?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      id={id}
      rows={rows}
      className={cx('bb-input', mono && 'font-mono text-[11.5px]')}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

export function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
  const [v, setV] = useState(fmt(value));
  useEffect(() => setV(fmt(value)), [value]);
  const commit = () => {
    let n = parseFloat(v.replace(',', '.'));
    if (!Number.isFinite(n)) return setV(fmt(value));
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onCommit(n);
    else setV(fmt(value));
  };
  return (
    <div className="relative w-full">
      <input
        className={cx('bb-input tabular-nums', suffix && 'pr-8')}
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = (parseFloat(v) || 0) + (e.key === 'ArrowUp' ? step : -step);
            setV(fmt(n));
            onCommit(min !== undefined ? Math.max(min, n) : n);
          }
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      className="bb-input"
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3 last:border-b-0">
      <header className="mb-2.5 flex h-6 items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        <div className="flex items-center gap-0.5">{actions}</div>
      </header>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{children}</kbd>;
}

export function Dialog({ title, onClose, children, footer, width = 480 }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="bb-pop flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" style={{ maxWidth: width }}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="bb-scroll overflow-auto px-4 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line bg-panel-2 px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
