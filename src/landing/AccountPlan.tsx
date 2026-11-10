// The plan part of the account dialog: what the plan allows, today's compiles,
// the way to pay, the newsletter, the desktop app's key and, for admins, the
// way to the admin page.

import { useEffect, useState } from 'react';
import { Check, Copy, Cpu, KeyRound, Loader2, Shield } from 'lucide-react';
import { adminUrl } from '../account/auth.ts';
import { checkoutUrl, createCompileKey, euro, fetchMe, lastFreeDay, longDate, proFree, removeCompileKey, setOwnNewsletter, type Me, type PlanSettings } from '../account/plans.ts';
import type { Lang, T } from './strings.ts';

const small = 'flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[12.5px] hover:bg-white/5 disabled:opacity-60';

export function AccountPlan({ t, lang, plans, onPlans }: { t: T; lang: Lang; plans: PlanSettings; onPlans: () => void }) {
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
  const name = me.plan === 'free' ? t('plan.free.name') : me.plan === 'pro' ? t('plan.pro.name') : t('plan.com.name');
  const freeNow = proFree(plans);
  const text =
    me.plan === 'free'
      ? t('account.planFree')
      : me.plan === 'commercial'
        ? t('account.planCommercial')
        : me.compile.ok
          ? freeNow && !me.paidUntil
            ? t('account.planProFree', { last: longDate(lastFreeDay(plans), lang), date: longDate(plans.proFreeUntil, lang), price: euro(plans.proPrice, lang) })
            : t('account.planPro')
          : t('account.planPayment');
  const pay = me.plan === 'pro' && !me.compile.ok && plans.proCheckoutUrl ? checkoutUrl(plans.proCheckoutUrl, me) : '';

  return (
    <div className="grid min-w-0 gap-3">
      <div className="rounded-xl border border-white/10 p-3">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-indigo-300" />
          <span className="text-[12px] text-slate-400">{t('account.plan')}</span>
          <span className="font-semibold text-white">{name}</span>
          <button type="button" className="ml-auto text-[12.5px] font-medium text-indigo-300 hover:text-indigo-200" onClick={onPlans}>
            {t('account.plans')}
          </button>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
          {text}
          {me.paidUntil && me.plan !== 'free' ? ` ${t('account.planPaid', { date: date(me.paidUntil) })}` : ''}
        </p>
        {me.compile.ok && (
          <p className="mt-1 text-[12.5px] text-slate-500">
            {me.compile.limit === null ? t('account.todayUnlimited', { used: String(me.compile.used) }) : t('account.today', { used: String(me.compile.used), limit: String(me.compile.limit) })}
          </p>
        )}
        {pay && (
          <a href={pay} className="mt-2.5 flex h-9 items-center justify-center rounded-lg bg-indigo-500 text-[13.5px] font-semibold text-white hover:bg-indigo-400">
            {t('account.subscribe')}
          </a>
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

      {me.admin && (
        <a href={adminUrl()} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-400/30 text-[14px] text-amber-200 hover:bg-amber-400/10">
          <Shield size={16} /> {t('account.admin')}
        </a>
      )}
    </div>
  );
}
