import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Loader2, LogOut, Mail, Trash2, X } from 'lucide-react';
import { authClient, landingUrl, editorUrl, serverConfig } from '../account/auth.ts';
import { AccountPlan } from './AccountPlan.tsx';
import type { Lang, T } from './strings.ts';

export type AuthMode = 'signIn' | 'signUp' | 'forgot' | 'reset' | 'account';

type Done = 'checkMail' | 'forgotSent' | 'resetDone' | 'deleted';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[13px]">
      <span className="font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}

const input = 'h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-[14px] text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30';
const primary = 'flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-[14px] font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60';
const link = 'font-medium text-indigo-300 hover:text-indigo-200';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * Sign in, sign up, password reset and the account, in one dialog. `next`:
 * where to go after signing in ('app' = the editor).
 */
export function AuthDialog({
  mode: start,
  t,
  lang,
  token,
  next,
  onClose,
  onPrivacy,
  onTerms,
}: {
  mode: AuthMode;
  t: T;
  lang: Lang;
  token?: string;
  next?: 'app';
  onClose: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}) {
  // a text with {terms} and {privacy} as links to those pages
  const withLinks = (key: 'auth.consent' | 'auth.googleNote') =>
    t(key, { terms: '\u0001', privacy: '\u0002' })
      .split(/([\u0001\u0002])/)
      .map((part, i) =>
        part === '\u0001' ? (
          <button key={i} type="button" className={link} onClick={onTerms}>
            {t('auth.termsLink')}
          </button>
        ) : part === '\u0002' ? (
          <button key={i} type="button" className={link} onClick={onPrivacy}>
            {t('auth.consentLink')}
          </button>
        ) : (
          part
        ),
      );
  const [mode, setMode] = useState<AuthMode>(start);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [consent, setConsent] = useState(false);
  const [google, setGoogle] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const session = authClient.useSession();

  useEffect(() => {
    void serverConfig().then((c) => setGoogle(!!c?.google));
  }, []);
  useEffect(() => {
    if (mode !== 'account') return;
    void authClient.listAccounts().then((r) => setHasPassword(!!r.data?.some((a) => a.providerId === 'credential')));
  }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const afterSignIn = landingUrl(next === 'app' ? '?signedIn=1&next=app' : '?signedIn=1');
  const go = (m: AuthMode) => {
    setMode(m);
    setError('');
    setDone(null);
  };
  const fail = (e: { code?: string; message?: string; status?: number } | null | undefined) => {
    if (!e) return false;
    const code = e.code ?? '';
    if (code === 'EMAIL_NOT_VERIFIED') setError(t('err.unverified'));
    else if (code === 'INVALID_EMAIL_OR_PASSWORD') setError(t('err.credentials'));
    else if (code.startsWith('USER_ALREADY_EXISTS')) setError(t('err.exists'));
    else if (code === 'INVALID_TOKEN') setError(t('err.token'));
    else if (code === 'PASSWORD_TOO_SHORT') setError(t('err.short'));
    else if (!e.status || e.status >= 500) setError(t('err.server'));
    else setError(t('err.generic', { message: e.message ?? code }));
    return true;
  };
  const run = (f: () => Promise<void>) => async (ev: FormEvent) => {
    ev.preventDefault();
    setError('');
    setBusy(true);
    try {
      await f();
    } catch {
      setError(t('err.server'));
    } finally {
      setBusy(false);
    }
  };

  const signIn = run(async () => {
    const r = await authClient.signIn.email({ email, password, callbackURL: afterSignIn });
    if (fail(r.error)) return;
    if (next === 'app') location.href = editorUrl();
    else onClose();
  });
  const signUp = run(async () => {
    if (password.length < 8) return void setError(t('err.short'));
    if (!consent) return void setError(t('err.consent'));
    const r = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: landingUrl(next === 'app' ? '?verified=1&next=app' : '?verified=1') });
    if (!fail(r.error)) setDone('checkMail');
  });
  const forgot = run(async () => {
    const r = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: landingUrl('?reset=1') });
    if (!fail(r.error)) setDone('forgotSent');
  });
  const reset = run(async () => {
    if (password.length < 8) return void setError(t('err.short'));
    if (password !== password2) return void setError(t('err.mismatch'));
    const r = await authClient.resetPassword({ newPassword: password, token: token ?? '' });
    if (!fail(r.error)) setDone('resetDone');
  });
  const remove = run(async () => {
    const r = await authClient.deleteUser(hasPassword ? { password } : {});
    if (r.error) {
      if (!hasPassword || /fresh|session/i.test(r.error.code ?? '')) setError(t('account.deleteFresh'));
      else fail(r.error);
      return;
    }
    setDone('deleted');
  });
  const googleSignIn = () => void authClient.signIn.social({ provider: 'google', callbackURL: afterSignIn, errorCallbackURL: landingUrl('?authError=1') });

  const title =
    mode === 'signIn' ? t('auth.signInTitle') : mode === 'signUp' ? t('auth.signUpTitle') : mode === 'forgot' ? t('auth.forgotTitle') : mode === 'reset' ? t('auth.resetTitle') : t('account.title');
  const message = done === 'checkMail' ? t('auth.checkMail', { email }) : done === 'forgotSent' ? t('auth.forgotSent', { email }) : done === 'resetDone' ? t('auth.resetDone') : done === 'deleted' ? t('account.deleted') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-32px)] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-200 shadow-2xl shadow-indigo-950/50"
      >
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold text-white">{title}</h2>
          <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label={t('account.cancel')}>
            <X size={18} />
          </button>
        </header>

        {done ? (
          <div className="grid gap-4">
            <p className="flex gap-3 text-[14px] leading-relaxed">
              {done === 'checkMail' || done === 'forgotSent' ? <Mail className="mt-0.5 shrink-0 text-indigo-300" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={18} />}
              {message}
            </p>
            {done === 'resetDone' && (
              <button className={primary} onClick={() => go('signIn')}>
                {t('auth.signIn')}
              </button>
            )}
            {done === 'deleted' && (
              <button className={primary} onClick={() => (location.href = landingUrl())}>
                {t('footer.home')}
              </button>
            )}
          </div>
        ) : mode === 'account' ? (
          <div className="grid gap-4 text-[14px]">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              {session.data?.user.image ? (
                <img src={session.data.user.image} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 font-semibold text-white">{(session.data?.user.name ?? '?').slice(0, 1).toUpperCase()}</span>
              )}
              <span className="min-w-0">
                <span className="block text-[12px] text-slate-400">{t('account.signedInAs')}</span>
                <span className="block truncate font-medium text-white">{session.data?.user.name}</span>
                <span className="block truncate text-slate-400">{session.data?.user.email}</span>
              </span>
            </div>
            <AccountPlan t={t} lang={lang} />
            <button className={primary} onClick={() => (location.href = editorUrl())}>
              {t('nav.editor')}
            </button>
            <button
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 text-[14px] hover:bg-white/5"
              onClick={() => void authClient.signOut().then(() => onClose())}
            >
              <LogOut size={16} /> {t('account.signOut')}
            </button>
            <details className="rounded-xl border border-red-500/20 p-3">
              <summary className="cursor-pointer text-[13px] font-medium text-red-300">{t('account.delete')}</summary>
              <form className="mt-3 grid gap-3" onSubmit={remove}>
                <p className="text-[13px] text-slate-400">{t('account.deleteText')}</p>
                {hasPassword && (
                  <Field label={t('account.deletePassword')}>
                    <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </Field>
                )}
                {error && <p className="text-[13px] text-red-300">{error}</p>}
                <button className="flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 text-[14px] font-semibold text-white hover:bg-red-500 disabled:opacity-60" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} {t('account.deleteConfirm')}
                </button>
              </form>
            </details>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={mode === 'signIn' ? signIn : mode === 'signUp' ? signUp : mode === 'forgot' ? forgot : reset}>
            {(mode === 'signIn' || mode === 'signUp') && google && (
              <>
                <button type="button" onClick={googleSignIn} className="flex h-10 items-center justify-center gap-2.5 rounded-lg bg-white text-[14px] font-semibold text-slate-800 hover:bg-slate-100">
                  <GoogleIcon /> {t('auth.google')}
                </button>
                {mode === 'signUp' && <p className="-mt-2 text-[12px] leading-relaxed text-slate-500">{withLinks('auth.googleNote')}</p>}
                <div className="flex items-center gap-3 text-[12px] text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  {t('auth.or')}
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}
            {mode === 'forgot' && <p className="text-[13px] leading-relaxed text-slate-400">{t('auth.forgotText')}</p>}
            {mode === 'signUp' && (
              <Field label={t('auth.name')}>
                <input className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
              </Field>
            )}
            {mode !== 'reset' && (
              <Field label={t('auth.email')}>
                <input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
            )}
            {mode !== 'forgot' && (
              <Field label={mode === 'reset' ? t('auth.resetTitle') : t('auth.password')}>
                <input
                  className={input}
                  type="password"
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'signIn' ? undefined : 8}
                />
                {mode !== 'signIn' && <span className="text-[12px] text-slate-500">{t('auth.passwordHint')}</span>}
              </Field>
            )}
            {mode === 'reset' && (
              <Field label={t('auth.password2')}>
                <input className={input} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </Field>
            )}
            {mode === 'signUp' && (
              <label className="flex items-start gap-2.5 text-[13px] text-slate-400">
                <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{withLinks('auth.consent')}</span>
              </label>
            )}
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] leading-relaxed text-red-200">{error}</p>}
            <button className={primary} disabled={busy}>
              {busy && <Loader2 className="animate-spin" size={16} />}
              {mode === 'signIn' ? t('auth.signIn') : mode === 'signUp' ? t('auth.signUp') : mode === 'forgot' ? t('auth.forgotSend') : t('auth.resetSave')}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-[13px] text-slate-400">
              {mode === 'signIn' && (
                <>
                  <button type="button" className={link} onClick={() => go('forgot')}>
                    {t('auth.forgot')}
                  </button>
                  <span>
                    {t('auth.noAccount')}{' '}
                    <button type="button" className={link} onClick={() => go('signUp')}>
                      {t('nav.signUp')}
                    </button>
                  </span>
                </>
              )}
              {mode === 'signUp' && (
                <span>
                  {t('auth.haveAccount')}{' '}
                  <button type="button" className={link} onClick={() => go('signIn')}>
                    {t('nav.signIn')}
                  </button>
                </span>
              )}
              {(mode === 'forgot' || mode === 'reset') && (
                <button type="button" className={link} onClick={() => go('signIn')}>
                  {t('auth.back')}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
