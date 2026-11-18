// The access part of the account dialog: what the account may do, today's
// compiles, the newsletter, the desktop app's key, the Anthropic API key for
// Claude and, for admins, the way to the admin page.

import { useEffect, useState } from 'react';
import { Check, Copy, Cpu, ExternalLink, KeyRound, Loader2, Shield, Sparkles } from 'lucide-react';
import { adminUrl } from '../account/auth.ts';
import { createCompileKey, fetchMe, removeCompileKey, setOwnNewsletter, type Me } from '../account/plans.ts';
import { AssistantError, fetchAssistant, removeAssistantKey, saveAssistantKey, type KeyInfo } from '../assistant/api.ts';
import type { Lang, T } from './strings.ts';

const small = 'flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[12.5px] hover:bg-white/5 disabled:opacity-60';

export function AccountPlan({ t, lang }: { t: T; lang: Lang }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchMe().then(setMe);
  }, []);
  if (me === undefined)
    return (
      <div className="flex h-16 items-center justify-center text-slate-500">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  // no server or no session: nothing to show
  if (!me) return null;

  const work = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
      setMe(await fetchMe());
    } finally {
      setBusy(false);
    }
  };
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US');
  const text = me.plan === 'blocked' ? t('account.accessBlocked') : me.plan === 'unlimited' ? t('account.accessUnlimited') : t('account.accessStandard');

  return (
    <div className="grid min-w-0 gap-3">
      <div className="rounded-xl border border-white/10 p-3">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-indigo-300" />
          <span className="text-[12px] text-slate-400">{t('account.plan')}</span>
          <span className="font-semibold text-white">{t(`account.level.${me.plan}`)}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{text}</p>
        {me.compile.ok && (
          <p className="mt-1 text-[12.5px] text-slate-500">
            {me.compile.limit === null ? t('account.todayUnlimited', { used: String(me.compile.used) }) : t('account.today', { used: String(me.compile.used), limit: String(me.compile.limit) })}
          </p>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-[13px] text-slate-300">
        <input type="checkbox" className="mt-0.5" checked={me.newsletter === 'active'} disabled={busy} onChange={(e) => void work(async () => void (await setOwnNewsletter(e.target.checked, lang)))} />
        <span>{t('account.newsletter')}</span>
      </label>

      {me.compile.ok && (
        <details className="min-w-0 rounded-xl border border-white/10 p-3" open={!!key}>
          <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-200">
            <KeyRound size={15} className="text-indigo-300" /> {t('account.key')}
          </summary>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">{t('account.keyText')}</p>
          {key ? (
            <div className="mt-2.5 grid min-w-0 gap-1.5">
              <span className="text-[12px] text-amber-200">{t('account.keyShown')}</span>
              <div className="flex gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 font-mono text-[12px] text-emerald-200">{key}</code>
                <button
                  type="button"
                  className={small}
                  onClick={() =>
                    void navigator.clipboard.writeText(key).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                  }
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('account.copied') : t('account.copy')}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500">
              {me.key ? `${t('account.keySince', { date: date(me.key.createdAt) })}${me.key.lastUsedAt ? `, ${t('account.keyUsed', { date: date(me.key.lastUsedAt) })}` : ''}` : t('account.keyNone')}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              className={small}
              disabled={busy}
              onClick={() => (!me.key || confirm(t('account.keyRenewConfirm'))) && void work(async () => setKey(await createCompileKey()))}
            >
              {busy && <Loader2 size={13} className="animate-spin" />} {me.key ? t('account.keyRenew') : t('account.keyCreate')}
            </button>
            {me.key && (
              <button
                type="button"
                className={`${small} text-red-300`}
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await removeCompileKey();
                    setKey('');
                  })
                }
              >
                {t('account.keyRemove')}
              </button>
            )}
          </div>
        </details>
      )}

      {me.compile.ok && <AssistantKey t={t} date={date} />}

      {me.admin && (
        <a href={adminUrl()} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-400/30 text-[14px] text-amber-200 hover:bg-amber-400/10">
          <Shield size={16} /> {t('account.admin')}
        </a>
      )}
    </div>
  );
}

const KEY_ERRORS = { format: 'account.aiFormat', invalid: 'account.aiInvalid', unreachable: 'account.aiUnreachable' } as const;

/** The Anthropic API key with which Claude works in the editor (server/assistant.ts). */
function AssistantKey({ t, date }: { t: T; date: (ms: number) => string }) {
  const [key, setKey] = useState<KeyInfo | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchAssistant().then((i) => setKey(typeof i === 'object' ? i.key : null));
  }, []);
  if (key === undefined) return null;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      setKey(await saveAssistantKey(input.trim()));
      setInput('');
    } catch (e) {
      const kind = e instanceof AssistantError ? e.kind : '';
      setError(t(KEY_ERRORS[kind as keyof typeof KEY_ERRORS] ?? 'account.aiUnreachable'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="min-w-0 rounded-xl border border-white/10 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-200">
        <Sparkles size={15} className="text-indigo-300" /> {t('account.ai')}
      </summary>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">{t('account.aiText')}</p>
      <p className="mt-2 text-[12px] text-slate-500">
        {key ? `${t('account.aiKey', { hint: key.hint })}${key.lastUsedAt ? `, ${t('account.aiUsed', { date: date(key.lastUsedAt) })}` : ''}` : t('account.aiNone')}
      </p>
      <form
        className="mt-2.5 flex min-w-0 gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 font-mono text-[12px] text-white outline-none focus:border-indigo-400"
          type="password"
          placeholder="sk-ant-…"
          autoComplete="off"
          aria-label={t('account.ai')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
        />
        <button className={small} disabled={busy || !input.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />} {t('account.aiSave')}
        </button>
      </form>
      {error && <p className="mt-1.5 text-[12px] text-red-300">{error}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <a className="inline-flex items-center gap-1.5 text-[12.5px] text-indigo-300 hover:text-indigo-200" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> {t('account.aiGet')}
        </a>
        {key && (
          <button
            type="button"
            className={`${small} ml-auto text-red-300`}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void removeAssistantKey()
                .then(() => setKey(null))
                .finally(() => setBusy(false));
            }}
          >
            {t('account.aiRemove')}
          </button>
        )}
      </div>
    </details>
  );
}
