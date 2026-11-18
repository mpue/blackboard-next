// Free and open source: what the editor offers without an account, what a
// free account adds (cloud, online compiler, Claude) and where the source is.

import { ArrowRight, CheckCircle2, Cloud, Code2, PencilRuler } from 'lucide-react';
import { editorUrl } from '../account/auth.ts';
import { SOURCE_URL } from '../source.ts';
import type { LandingKey, T } from './strings.ts';

function Feature({ children }: { children: string }) {
  return (
    <li className="flex gap-3">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> {children}
    </li>
  );
}

const card = 'relative flex flex-col rounded-2xl border p-7';
const ctaBase = 'mt-8 flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold';
const ctaPrimary = `${ctaBase} bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400`;
const ctaSecondary = `${ctaBase} border border-white/15 text-white hover:bg-white/5`;

export function OpenSource({ t, dailyCompiles, user, cloud, onSignUp }: { t: T; dailyCompiles: number; user?: { id: string }; cloud: boolean; onSignUp: () => void }) {
  const head = (Icon: typeof Cloud, name: LandingKey, text: LandingKey) => (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
          <Icon size={20} />
        </span>
        <h3 className="text-[19px] font-semibold text-white">{t(name)}</h3>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{t(text)}</p>
    </>
  );

  return (
    <>
      <h2 className="text-center text-[30px] font-bold tracking-tight text-white md:text-[38px]">{t('free.title')}</h2>
      <p className="mx-auto mt-4 max-w-[680px] text-center text-[17px] text-slate-400">{t('free.text')}</p>
      <div className={`mx-auto mt-12 grid max-w-[1120px] gap-5 ${cloud ? 'lg:grid-cols-3' : 'max-w-[760px] md:grid-cols-2'}`}>
        <div className={`${card} border-white/10 bg-white/[0.03]`}>
          {head(PencilRuler, 'free.editor.name', 'free.editor.text')}
          <ul className="mt-6 grid gap-3 text-[14.5px]">
            <Feature>{t('free.editor.f1')}</Feature>
            <Feature>{t('free.editor.f2')}</Feature>
            <Feature>{t('free.editor.f3')}</Feature>
          </ul>
          <div className="mt-auto">
            <a href={editorUrl()} className={ctaSecondary}>
              {t('free.editor.cta')} <ArrowRight size={16} />
            </a>
          </div>
        </div>

        {cloud && (
          <div className={`${card} border-indigo-400/50 bg-gradient-to-b from-indigo-500/15 to-white/[0.03] shadow-2xl shadow-indigo-950/50`}>
            {head(Cloud, 'free.account.name', 'free.account.text')}
            <ul className="mt-6 grid gap-3 text-[14.5px]">
              <Feature>{t('free.account.f1')}</Feature>
              <Feature>{t('free.account.f2', { n: String(dailyCompiles) })}</Feature>
              <Feature>{t('free.account.f3')}</Feature>
            </ul>
            <div className="mt-auto">
              {user ? (
                <a href={editorUrl()} className={ctaPrimary}>
                  {t('free.account.ctaSignedIn')} <ArrowRight size={16} />
                </a>
              ) : (
                <button type="button" onClick={onSignUp} className={`${ctaPrimary} w-full`}>
                  {t('free.account.cta')} <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className={`${card} border-emerald-400/30 bg-white/[0.03]`}>
          {head(Code2, 'free.source.name', 'free.source.text')}
          <ul className="mt-6 grid gap-3 text-[14.5px]">
            <Feature>{t('free.source.f1')}</Feature>
            <Feature>{t('free.source.f2')}</Feature>
            <Feature>{t('free.source.f3')}</Feature>
          </ul>
          <div className="mt-auto">
            <a href={SOURCE_URL} className={ctaSecondary} target="_blank" rel="noreferrer">
              {t('free.source.cta')} <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
