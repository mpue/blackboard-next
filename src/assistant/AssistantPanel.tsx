// The side panel of the design assistant: the way to Claude (sign in, plan,
// API key) and the conversation, with Claude's work on the schematic as
// activity lines and one click to undo an answer's changes.

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  Square,
  Undo2,
  UserPlus,
  X,
} from 'lucide-react';
import { activeDoc, toast, useStore } from '../store/store.ts';
import { isSchematicDoc } from '../model/types.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { Button, IconButton, cx } from '../ui/primitives.tsx';
import { RichText } from '../learn/RichText.tsx';
import { landingUrl } from '../account/auth.ts';
import { AssistantError, fetchAssistant, removeAssistantKey, saveAssistantKey, type AssistantInfo, type ModelChoice } from './api.ts';
import {
  canUndoAnswer,
  newConversation,
  retry,
  send,
  setAssistantOpen,
  setInfo,
  setModel,
  showKeyForm,
  stop,
  undoAnswer,
  useAssistant,
  type Entry,
} from './state.ts';

const CONSOLE_KEYS = 'https://platform.claude.com/settings/keys';

export function AssistantPanel() {
  const t = useT();
  const info = useAssistant((s) => s.info);
  const keyForm = useAssistant((s) => s.keyForm);

  useEffect(() => {
    void fetchAssistant().then(setInfo);
  }, []);

  let body;
  if (info === undefined)
    body = (
      <div className="flex flex-1 items-center justify-center text-muted">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  else if (info === 'none') body = <Notice text={t('ai.none')} />;
  else if (info === 'login') body = <Notice text={t('ai.login')} login />;
  else if (!info.access.ok) body = <Notice text={t('ai.blocked')} />;
  else if (!info.key || keyForm) body = <KeyForm info={info} />;
  else body = <Conversation info={info} />;

  return (
    <aside className="flex w-[22rem] shrink-0 flex-col border-l border-line bg-panel max-md:h-[55%] max-md:w-full max-md:border-l-0 max-md:border-t" aria-label={t('ai.title')}>
      <Header ready={!!info && typeof info === 'object' && info.access.ok && !!info.key && !keyForm} />
      {body}
    </aside>
  );
}

function Header({ ready }: { ready: boolean }) {
  const t = useT();
  const model = useAssistant((s) => s.model);
  const started = useAssistant((s) => s.messages.length > 0);
  return (
    <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-3">
      <Sparkles size={16} className="text-accent" />
      <h2 className="text-[12.5px] font-semibold">{t('ai.title')}</h2>
      {ready && (
        <select
          className="ml-1 h-7 min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-1.5 text-[11.5px] text-muted outline-none focus:border-accent disabled:opacity-70"
          value={model}
          disabled={started}
          title={started ? t('ai.modelLocked') : t('ai.model')}
          aria-label={t('ai.model')}
          onChange={(e) => setModel(e.target.value as ModelChoice)}
        >
          <option value="opus">{t('ai.opus')}</option>
          <option value="sonnet">{t('ai.sonnet')}</option>
        </select>
      )}
      {!ready && <span className="flex-1" />}
      {ready && <IconButton icon={MessageSquarePlus} label={t('ai.new')} disabled={!started} onClick={newConversation} />}
      <IconButton icon={X} label={t('common.close')} onClick={() => setAssistantOpen(false)} />
    </header>
  );
}

function Notice({ text, login }: { text: string; login?: boolean }) {
  const t = useT();
  return (
    <div className="grid gap-3 p-4 text-[12.5px] leading-relaxed">
      <Sparkles size={22} className="text-accent" />
      <p>{t('ai.intro')}</p>
      <p className="text-muted">{text}</p>
      {login && (
        <div className="flex flex-wrap gap-1.5">
          <Button variant="primary" icon={UserPlus} onClick={() => (location.href = landingUrl('?signup&next=app'))}>
            {t('code.signUp')}
          </Button>
          <Button icon={LogIn} onClick={() => (location.href = landingUrl('?login&next=app'))}>
            {t('code.signIn')}
          </Button>
        </div>
      )}
    </div>
  );
}

const KEY_ERRORS: Record<string, I18nKey> = { format: 'ai.key.format', invalid: 'ai.key.invalid', unreachable: 'ai.key.unreachable' };

function KeyForm({ info }: { info: AssistantInfo }) {
  const t = useT();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastError = useAssistant((s) => s.entries.at(-1));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const k = await saveAssistantKey(key.trim());
      setInfo({ ...info, key: k });
      showKeyForm(false);
      setKey('');
      toast(t('ai.key.saved'), 'success');
    } catch (err) {
      const kind = err instanceof AssistantError ? err.kind : 'server';
      setError(t(KEY_ERRORS[kind] ?? (`ai.err.${kind}` as I18nKey)));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await removeAssistantKey();
      setInfo({ ...info, key: null });
      toast(t('ai.key.removed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid content-start gap-3 overflow-y-auto p-4 text-[12.5px] leading-relaxed" onSubmit={save}>
      {!info.key && <p>{t('ai.intro')}</p>}
      {lastError?.kind === 'error' && lastError.error === 'key' && <p className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-red-700 dark:text-red-300">{t('ai.err.key')}</p>}
      <div className="flex items-center gap-2 font-semibold">
        <KeyRound size={15} className="text-accent" /> {t('ai.key.title')}
      </div>
      <p className="text-muted">{t('ai.key.text')}</p>
      <div className="flex gap-1.5">
        <input
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[11.5px] outline-none focus:border-accent"
          type={show ? 'text' : 'password'}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          aria-label={t('ai.key.title')}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
          autoFocus
        />
        <IconButton icon={show ? EyeOff : Eye} label={show ? 'Hide' : 'Show'} onClick={() => setShow(!show)} />
      </div>
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="primary" type="submit" disabled={busy || !key.trim()} icon={busy ? Loader2 : Check} className={cx(busy && '[&_svg]:animate-spin')}>
          {t('ai.key.save')}
        </Button>
        {info.key && (
          <Button variant="ghost" onClick={() => showKeyForm(false)}>
            {t('ai.key.cancel')}
          </Button>
        )}
      </div>
      <a className="inline-flex w-fit items-center gap-1.5 text-accent hover:underline" href={CONSOLE_KEYS} target="_blank" rel="noreferrer">
        <ExternalLink size={13} /> {t('ai.key.get')}
      </a>
      {info.key && (
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-3 text-muted">
          <span className="flex-1 font-mono text-[11.5px]">{t('ai.key.current', { hint: info.key.hint })}</span>
          <Button variant="danger" disabled={busy} onClick={() => void remove()}>
            {t('ai.key.remove')}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Suggestions for an empty conversation, by what is open. */
function useSuggestions(): I18nKey[] {
  const hasCircuit = useStore((s) => {
    const d = activeDoc(s)?.doc;
    return !!d && isSchematicDoc(d) && d.items.some((i) => i.kind === 'symbol');
  });
  return hasCircuit ? ['ai.s.explain', 'ai.s.check', 'ai.s.improve'] : ['ai.s.led', 'ai.s.555', 'ai.s.transistor'];
}

function Conversation({ info }: { info: AssistantInfo }) {
  const t = useT();
  const entries = useAssistant((s) => s.entries);
  const running = useAssistant((s) => s.running);
  const canRetry = useAssistant((s) => s.canRetry);
  const usage = useAssistant((s) => s.usage);
  // re-render when the document changes: the undo button depends on it
  const changed = useAssistant((s) => s.changed);
  const undoable = useStore(() => changed !== null && canUndoAnswer());
  const suggestions = useSuggestions();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries, running]);

  const last = entries.at(-1);
  const streaming = running && (last?.kind === 'text' || last?.kind === 'note');

  return (
    <>
      <div
        ref={scroller}
        className="bb-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[12.5px] leading-relaxed"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {entries.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-muted">{t('ai.intro')}</p>
            <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{t('ai.try')}</p>
            {suggestions.map((k) => (
              <button key={k} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-left hover:border-accent/60 hover:bg-hover" onClick={() => void send(t(k))}>
                {t(k)}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            {entries.map((e, i) => (
              <EntryView key={e.id} e={e} retry={canRetry && !running && i === entries.length - 1} />
            ))}
            {running && !streaming && (
              <div className="flex items-center gap-2 text-muted">
                <Loader2 size={13} className="animate-spin" /> {t('ai.working')}
              </div>
            )}
            {undoable && !running && (
              <Button className="mt-1 w-fit" icon={Undo2} onClick={() => (undoAnswer(), toast(t('ai.undone')))}>
                {t('ai.undo')}
              </Button>
            )}
          </div>
        )}
      </div>
      <Composer />
      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-1.5 text-[11px] text-muted">
        <span className="flex-1 truncate" title={t('ai.key.text')}>
          {usage.input + usage.output > 0 ? t('ai.usage', { input: usage.input.toLocaleString(), output: usage.output.toLocaleString() }) : t('ai.key.current', { hint: info.key?.hint ?? '' })}
        </span>
        <button className="shrink-0 hover:text-fg hover:underline" onClick={() => showKeyForm(true)}>
          {t('ai.key.change')}
        </button>
      </footer>
    </>
  );
}

function EntryView({ e, retry: canRetry }: { e: Entry; retry: boolean }) {
  const t = useT();
  switch (e.kind) {
    case 'user':
      return <div className="ml-6 justify-self-end whitespace-pre-wrap rounded-lg rounded-br-sm bg-accent-soft px-3 py-2">{e.text}</div>;
    case 'text':
      return e.text.trim() ? <RichText text={e.text} /> : null;
    case 'note':
      return <p className="border-l-2 border-line pl-2 text-[11.5px] italic text-muted">{e.text}</p>;
    case 'tool':
      return (
        <div className="flex min-w-0 items-start gap-1.5 text-[11.5px] text-muted" title={e.detail}>
          {e.state === 'running' ? (
            <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" />
          ) : e.state === 'ok' ? (
            <Check size={13} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span className="min-w-0">
            {t(`ai.tool.${e.name}` as I18nKey)}
            {e.subject && <span className="ml-1 font-mono text-fg/80">{e.subject}</span>}
            {e.detail && <span className="block truncate text-amber-700/80 dark:text-amber-300/80">{e.detail}</span>}
          </span>
        </div>
      );
    case 'error':
      return (
        <div className={cx('grid gap-2 rounded-lg px-3 py-2', e.error === 'stopped' ? 'bg-panel-2 text-muted' : 'bg-red-500/10 text-red-800 dark:text-red-200')}>
          <span>
            {t(`ai.err.${e.error}` as I18nKey)}
            {e.message && <span className="mt-0.5 block text-[11px] opacity-80">{e.message}</span>}
          </span>
          {canRetry && (
            <Button className="w-fit" icon={RotateCcw} onClick={() => void retry()}>
              {t('ai.retry')}
            </Button>
          )}
        </div>
      );
  }
}

function Composer() {
  const t = useT();
  const running = useAssistant((s) => s.running);
  const entries = useAssistant((s) => s.entries);
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // grows with the text, up to a few lines
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = () => {
    if (running || !text.trim()) return;
    void send(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp' && !text) {
      // the last question again, to change it
      const lastQ = entries.findLast((x) => x.kind === 'user');
      if (lastQ && lastQ.kind === 'user') {
        e.preventDefault();
        setText(lastQ.text);
      }
    } else if (e.key === 'Escape' && running) stop();
  };

  return (
    <div className="shrink-0 border-t border-line p-2">
      <div className="flex items-end gap-1.5 rounded-lg border border-line bg-panel-2 p-1.5 focus-within:border-accent">
        <textarea
          ref={ref}
          rows={1}
          className="max-h-40 min-h-[1.75rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-[12.5px] outline-none placeholder:text-muted"
          placeholder={t('ai.placeholder')}
          aria-label={t('ai.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {running ? (
          <IconButton icon={Square} label={`${t('ai.stop')} (Esc)`} className="h-7 w-7 bg-panel text-fg" onClick={stop} />
        ) : (
          <IconButton icon={ArrowUp} label={t('ai.send')} disabled={!text.trim()} className="h-7 w-7 bg-accent text-white hover:bg-accent hover:text-white hover:brightness-110 dark:text-slate-950" onClick={submit} />
        )}
      </div>
    </div>
  );
}
