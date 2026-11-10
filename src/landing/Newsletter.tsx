// The newsletter box of the landing page: visitors sign up with their address
// and confirm it from a mail (double opt-in); signed-in users subscribe in one
// click, their address is confirmed already.

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Mail, Newspaper } from 'lucide-react';
import { setOwnNewsletter, subscribeNewsletter, fetchMe, type NewsletterStatus } from '../account/plans.ts';
import type { Lang, T } from './strings.ts';

export function Newsletter({ t, lang, user, onPrivacy }: { t: T; lang: Lang; user?: { email: string }; onPrivacy: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [own, setOwn] = useState<NewsletterStatus>(null);

  useEffect(() => {
    if (user) void fetchMe().then((m) => setOwn(m?.newsletter ?? null));
  }, [user]);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error && e.message === 'rate' ? t('news.rate') : t('err.server'));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await subscribeNewsletter(email.trim(), lang);
      setSent(email.trim());
    });
  };
  const toggleOwn = (on: boolean) => void run(async () => setOwn((await setOwnNewsletter(on, lang)).status));

  const consent = t(user ? 'news.consentUser' : 'news.consent', { privacy: '\u0000' })
    .split('\u0000')
    .flatMap((part, i) =>
      i === 0
        ? [part]
        : [
            <button key={i} type="button" className="text-indigo-300 hover:text-indigo-200" onClick={onPrivacy}>
              {t('auth.consentLink')}
            </button>,
            part,
          ],
    );

  return (
    <div className="mx-auto grid max-w-[880px] items-center gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-7 md:grid-cols-[1fr_1.1fr] md:p-9">
      <div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-200">
          <Newspaper size={21} />
        </span>
        <h2 className="mt-4 text-[24px] font-bold tracking-tight text-white">{t('news.title')}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{t('news.text')}</p>
      </div>
      <div>
        {user ? (
          own === 'active' ? (
            <div className="grid gap-3">
              <p className="flex gap-2.5 text-[14.5px] text-slate-200">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> {t('news.active', { email: user.email })}
              </p>
              <button type="button" className="justify-self-start text-[13px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline" onClick={() => toggleOwn(false)} disabled={busy}>
                {t('news.unsubscribeSelf')}
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => toggleOwn(true)}
                disabled={busy}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-[15px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} {t('news.asUser', { email: user.email })}
              </button>
              <p className="text-[12px] leading-relaxed text-slate-500">{consent}</p>
            </div>
          )
        ) : sent ? (
          <p className="flex gap-2.5 text-[14.5px] leading-relaxed text-slate-200">
            <Mail size={18} className="mt-0.5 shrink-0 text-indigo-300" /> {t('news.sent', { email: sent })}
          </p>
        ) : (
          <form className="grid gap-3" onSubmit={submit}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder={t('news.email')}
                aria-label={t('news.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              />
              <button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-[15px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">
                {busy && <Loader2 size={16} className="animate-spin" />} {t('news.subscribe')}
              </button>
            </div>
            <p className="text-[12px] leading-relaxed text-slate-500">{consent}</p>
          </form>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{error}</p>}
      </div>
    </div>
  );
}
