// The two plans: Free / Edu at no cost, and the subscription commercial users
// need, paid through a Stripe payment link.

import { ArrowRight, Briefcase, CheckCircle2, GraduationCap } from 'lucide-react';
import { editorUrl } from '../account/auth.ts';
import type { LandingKey, T } from './strings.ts';

/** Stripe payment link of "Individual Commercial" (test mode: swap for the live link before taking real payments) */
export const CHECKOUT_URL = 'https://buy.stripe.com/test_00w3cw7U0eWb2UKf864Ja00';

/** the payment link; a signed-in user's id goes along so the payment in Stripe belongs to the account */
const checkoutUrl = (userId?: string) => (userId ? `${CHECKOUT_URL}?client_reference_id=${encodeURIComponent(userId)}` : CHECKOUT_URL);

const PLANS = [
  { key: 'free', icon: GraduationCap, features: ['plan.free.f1', 'plan.free.f2', 'plan.free.f3'] },
  { key: 'pro', icon: Briefcase, features: ['plan.pro.f1', 'plan.pro.f2', 'plan.pro.f3'] },
] as const;

export function Pricing({ t, userId, onAgb }: { t: T; userId?: string; onAgb: () => void }) {
  return (
    <>
      <h2 className="text-center text-[30px] font-bold tracking-tight text-white md:text-[38px]">{t('pricing.title')}</h2>
      <p className="mx-auto mt-4 max-w-[640px] text-center text-[17px] text-slate-400">{t('pricing.text')}</p>
      <div className="mx-auto mt-12 grid max-w-[880px] gap-5 md:grid-cols-2">
        {PLANS.map(({ key, icon: Icon, features }) => {
          const pro = key === 'pro';
          return (
            <div
              key={key}
              className={`relative flex flex-col rounded-2xl border p-7 ${pro ? 'border-indigo-400/50 bg-gradient-to-b from-indigo-500/15 to-white/[0.03] shadow-2xl shadow-indigo-950/50' : 'border-white/10 bg-white/[0.03]'}`}
            >
              {pro && <span className="absolute -top-3 right-6 rounded-full bg-indigo-500 px-3 py-0.5 text-[12px] font-semibold text-white">{t('plan.pro.badge')}</span>}
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
                  <Icon size={20} />
                </span>
                <h3 className="text-[19px] font-semibold text-white">{t(`plan.${key}.name`)}</h3>
              </div>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-[42px] font-bold tracking-tight text-white">{t(`plan.${key}.price`)}</span>
                <span className="text-[15px] text-slate-400">{t(`plan.${key}.period`)}</span>
              </p>
              {pro && <p className="mt-1 text-[12.5px] text-slate-500">{t('plan.pro.note')}</p>}
              <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{t(`plan.${key}.text`)}</p>
              <ul className="mt-6 grid gap-3 text-[14.5px]">
                {features.map((f: LandingKey) => (
                  <li key={f} className="flex gap-3">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> {t(f)}
                  </li>
                ))}
              </ul>
              <a
                href={pro ? checkoutUrl(userId) : editorUrl()}
                className={`mt-8 flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold ${pro ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400' : 'border border-white/15 text-white hover:bg-white/5'}`}
              >
                {t(`plan.${key}.cta`)} <ArrowRight size={16} />
              </a>
              {pro && (
                <p className="mt-3 text-center text-[12.5px] text-slate-500">
                  {t('plan.pro.terms', { agb: '\u0000' })
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
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
