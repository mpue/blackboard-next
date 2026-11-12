// The three plans: Free / Edu for everyone, Professional with the online
// compiler (free of charge in the launch phase, an account is enough) and
// Individual Commercial for commercial use. Prices, the end of the launch
// phase and the Stripe payment links come from the server (admin page).

import { ArrowRight, Briefcase, CheckCircle2, Cpu, GraduationCap, MinusCircle } from 'lucide-react';
import { editorUrl } from '../account/auth.ts';
import { checkoutUrl, euro, lastFreeDay, longDate, proFree, type PlanSettings } from '../account/plans.ts';
import type { Lang, LandingKey, T } from './strings.ts';

function Feature({ children, off }: { children: string; off?: boolean }) {
  return (
    <li className={`flex gap-3 ${off ? 'text-slate-400' : ''}`}>
      {off ? <MinusCircle size={18} className="mt-0.5 shrink-0 text-slate-500" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />} {children}
    </li>
  );
}

const card = 'relative flex flex-col rounded-2xl border p-7';
const ctaBase = 'mt-8 flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold';
const ctaPrimary = `${ctaBase} bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400`;
const ctaSecondary = `${ctaBase} border border-white/15 text-white hover:bg-white/5`;
const ctaNone = `${ctaBase} cursor-default border border-white/10 text-slate-400`;

export function Pricing({
  t,
  lang,
  plans,
  user,
  onSignUp,
  onAgb,
}: {
  t: T;
  lang: Lang;
  plans: PlanSettings;
  user?: { id: string; email: string };
  onSignUp: () => void;
  onAgb: () => void;
}) {
  const free = proFree(plans);
  const last = longDate(lastFreeDay(plans), lang);
  const proPrice = euro(plans.proPrice, lang);
  const head = (Icon: typeof Cpu, name: LandingKey) => (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
        <Icon size={20} />
      </span>
      <h3 className="text-[19px] font-semibold text-white">{t(name)}</h3>
    </div>
  );
  const price = (amount: string, period: string) => (
    <p className="mt-5 flex items-baseline gap-2">
      <span className="text-[42px] font-bold tracking-tight text-white">{amount}</span>
      <span className="text-[15px] text-slate-400">{period}</span>
    </p>
  );

  // Professional: sign up while it is free; afterwards the payment link, if there is one yet
  const proCta = free ? (
    user ? (
      <a href={editorUrl()} className={ctaPrimary}>
        {t('plan.pro.ctaSignedIn')} <ArrowRight size={16} />
      </a>
    ) : (
      <button type="button" onClick={onSignUp} className={`${ctaPrimary} w-full`}>
        {t('plan.pro.cta')} <ArrowRight size={16} />
      </button>
    )
  ) : plans.proCheckoutUrl ? (
    <a href={checkoutUrl(plans.proCheckoutUrl, user)} className={ctaPrimary}>
      {t('plan.pro.ctaPay')} <ArrowRight size={16} />
    </a>
  ) : (
    <span className={ctaNone}>{t('plan.pro.soon')}</span>
  );

  return (
    <>
      <h2 className="text-center text-[30px] font-bold tracking-tight text-white md:text-[38px]">{t('pricing.title')}</h2>
      <p className="mx-auto mt-4 max-w-[680px] text-center text-[17px] text-slate-400">{t('pricing.text')}</p>
      <div className="mx-auto mt-12 grid max-w-[1120px] gap-5 lg:grid-cols-3">
        <div className={`${card} border-white/10 bg-white/[0.03]`}>
          {head(GraduationCap, 'plan.free.name')}
          {price(t('plan.free.price'), t('plan.free.period'))}
          <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{t('plan.free.text')}</p>
          <ul className="mt-6 grid gap-3 text-[14.5px]">
            <Feature>{t('plan.free.f1')}</Feature>
            <Feature>{t('plan.free.f2')}</Feature>
            <Feature>{t('plan.free.f3')}</Feature>
            <Feature off>{t('plan.free.no')}</Feature>
          </ul>
          <div className="mt-auto">
            <a href={editorUrl()} className={ctaSecondary}>
              {t('plan.free.cta')} <ArrowRight size={16} />
            </a>
          </div>
        </div>

        <div className={`${card} border-indigo-400/50 bg-gradient-to-b from-indigo-500/15 to-white/[0.03] shadow-2xl shadow-indigo-950/50`}>
          {free && <span className="absolute -top-3 right-6 rounded-full bg-indigo-500 px-3 py-0.5 text-[12px] font-semibold text-white">{t('plan.pro.badge')}</span>}
          {head(Cpu, 'plan.pro.name')}
          {free ? price('0 €', t('plan.pro.periodFree', { date: last })) : price(proPrice, t('plan.pro.period'))}
          <p className="mt-1 text-[12.5px] leading-relaxed text-indigo-200/80">
            {free ? t('plan.pro.noteFree', { last, date: longDate(plans.proFreeUntil, lang), price: proPrice }) : t('plan.pro.note')}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{t('plan.pro.text')}</p>
          <ul className="mt-6 grid gap-3 text-[14.5px]">
            <Feature>{t('plan.pro.f1')}</Feature>
            <Feature>{t('plan.pro.f2')}</Feature>
            <Feature>{t('plan.pro.f3', { n: String(plans.proDailyCompiles) })}</Feature>
            <Feature>{t('plan.pro.f4')}</Feature>
            <Feature>{t('plan.pro.f5')}</Feature>
          </ul>
          <div className="mt-auto">{proCta}</div>
        </div>

        <div className={`${card} border-emerald-400/30 bg-white/[0.03]`}>
          <span className="absolute -top-3 right-6 rounded-full bg-emerald-600 px-3 py-0.5 text-[12px] font-semibold text-white">{t('plan.com.badge')}</span>
          {head(Briefcase, 'plan.com.name')}
          {price(euro(plans.commercialPrice, lang), t('plan.com.period'))}
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{t('plan.com.note')}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{t('plan.com.text')}</p>
          <ul className="mt-6 grid gap-3 text-[14.5px]">
            <Feature>{t('plan.com.f1')}</Feature>
            <Feature>{t('plan.com.f2')}</Feature>
            <Feature>{t('plan.com.f3')}</Feature>
            <Feature>{t('plan.com.f4')}</Feature>
          </ul>
          <div className="mt-auto">
            {plans.commercialCheckoutUrl ? (
              <a href={checkoutUrl(plans.commercialCheckoutUrl, user)} className={ctaSecondary}>
                {t('plan.com.cta')} <ArrowRight size={16} />
              </a>
            ) : (
              <span className={ctaNone}>{t('plan.pro.soon')}</span>
            )}
            <p className="mt-3 text-center text-[12.5px] text-slate-500">
              {t('plan.com.terms', { agb: '\u0000' })
                .split('\u0000')
                .flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <button key={i} type="button" className="text-indigo-300 hover:text-indigo-200" onClick={onAgb}>
                          {t('footer.agb')}
                        </button>,
                        part,
                      ],
                )}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
