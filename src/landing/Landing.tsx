// The landing page of the web version: what BlackBoard does, the way into the
// editor (no account needed) and the account (cloud projects, sharing).

import { useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, CircuitBoard, Cloud, Cpu, Gauge, Grid3x3, Lock, LogIn, Share2, UserPlus, Waves, CheckCircle2 } from 'lucide-react';
import { Logo } from '../ui/Logo.tsx';
import { authClient, editorUrl, serverConfig } from '../account/auth.ts';
import { AuthDialog, type AuthMode } from './AuthDialog.tsx';
import { LEGAL_PAGES, LegalPage, type LegalPageId } from './Legal.tsx';
import { Pricing } from './Pricing.tsx';
import { landingLang, setLandingLang, translator, type LandingKey, type Lang } from './strings.ts';

type Page = 'home' | LegalPageId;

const asPage = (p: string | null): Page => (LEGAL_PAGES.includes(p as LegalPageId) ? (p as LegalPageId) : 'home');

const FEATURES: { icon: typeof Cpu; key: 'boards' | 'spice' | 'live' | 'bench' | 'mcu' | 'pcb' }[] = [
  { icon: Grid3x3, key: 'boards' },
  { icon: Waves, key: 'spice' },
  { icon: Activity, key: 'live' },
  { icon: Gauge, key: 'bench' },
  { icon: Cpu, key: 'mcu' },
  { icon: CircuitBoard, key: 'pcb' },
];

const SHOWCASE: { key: 'sim' | 'lcd' | 'pcb'; image: string; demo: string }[] = [
  { key: 'sim', image: 'landing/sim.webp', demo: 'demo=mcu' },
  { key: 'lcd', image: 'landing/lcd.webp', demo: 'demo=lcd-esp32' },
  { key: 'pcb', image: 'landing/pcb.webp', demo: 'demo=pcb&view=3d' },
];

/** a screenshot of the editor in a window frame */
function Shot({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-indigo-950/60 ${className}`}>
      <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-slate-800/80 px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
    </div>
  );
}

function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-[1160px] scroll-mt-20 px-5 ${className}`}>
      {children}
    </section>
  );
}

export function Landing() {
  const [lang, setLang] = useState<Lang>(landingLang);
  const t = translator(lang);
  const params = new URLSearchParams(location.search);
  const [page, setPage] = useState<Page>(() => asPage(params.get('page')));
  const [dialog, setDialog] = useState<{ mode: AuthMode; token?: string } | null>(() => {
    if (params.get('reset') && params.get('token')) return { mode: 'reset', token: params.get('token')! };
    if (params.has('login')) return { mode: 'signIn' };
    if (params.has('signup')) return { mode: 'signUp' };
    return null;
  });
  const next = params.get('next') === 'app' ? 'app' : undefined;
  const [banner, setBanner] = useState<string | null>(() =>
    params.has('verified') ? t('auth.verified') : params.has('subscribed') ? t('pricing.thanks') : params.has('authError') ? t('err.generic', { message: params.get('error') ?? 'Google' }) : null,
  );
  const [cloud, setCloud] = useState(true);
  const session = authClient.useSession();
  const user = session.data?.user;

  useEffect(() => {
    document.title = lang === 'de' ? 'BlackBoard – Schaltungen entwerfen, simulieren und verstehen' : 'BlackBoard – design, simulate and understand circuits';
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    void serverConfig().then((c) => setCloud(!!c));
    // after confirming the address or signing in from the editor: back to it
    if ((params.has('verified') || params.has('signedIn')) && next === 'app') location.replace(editorUrl());
    // the address keeps only the page
    const keep = page === 'home' ? '' : `?page=${page}`;
    if (location.search !== keep) history.replaceState(null, '', `${location.pathname}${keep}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(id);
  }, [banner]);

  const open = (p: Page) => {
    setPage(p);
    setDialog(null);
    history.pushState(null, '', `${location.pathname}${p === 'home' ? '' : `?page=${p}`}`);
    scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onPop = () => {
      setPage(asPage(new URLSearchParams(location.search).get('page')));
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const switchLang = () => {
    const l = lang === 'de' ? 'en' : 'de';
    setLandingLang(l);
    setLang(l);
  };

  const navLink = (href: string, key: LandingKey) => (
    <a href={href} onClick={() => page !== 'home' && open('home')} className="text-[14px] text-slate-300 transition hover:text-white">
      {t(key)}
    </a>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 antialiased">
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-6 px-5">
          <button className="flex items-center gap-2.5" onClick={() => open('home')}>
            <Logo size={30} />
            <span className="text-[17px] font-semibold tracking-tight text-white">
              BlackBoard <span className="font-normal text-slate-400">Next</span>
            </span>
          </button>
          <div className="hidden flex-1 items-center gap-6 md:flex">
            {navLink('#features', 'nav.features')}
            {navLink('#firmware', 'nav.firmware')}
            {cloud && navLink('#cloud', 'nav.cloud')}
            {navLink('#pricing', 'nav.pricing')}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {cloud &&
              (user ? (
                <button onClick={() => setDialog({ mode: 'account' })} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] hover:bg-white/5" aria-label={t('nav.account')}>
                  {user.image ? (
                    <img src={user.image} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-[13px] font-semibold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="hidden max-w-[140px] truncate sm:inline">{user.name}</span>
                </button>
              ) : (
                <>
                  <button onClick={() => setDialog({ mode: 'signIn' })} className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-slate-200 hover:bg-white/5 sm:flex">
                    <LogIn size={15} /> {t('nav.signIn')}
                  </button>
                  <button onClick={() => setDialog({ mode: 'signUp' })} className="hidden h-9 items-center rounded-lg border border-white/15 px-3 text-[14px] font-medium text-white hover:bg-white/5 sm:flex">
                    {t('nav.signUp')}
                  </button>
                </>
              ))}
            <a href={editorUrl()} className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 text-[14px] font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400">
              {t('nav.editor')} <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </nav>

      {page !== 'home' ? (
        <LegalPage page={page} lang={lang} />
      ) : (
        <main>
          {/* hero */}
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(99,102,241,0.35),transparent),radial-gradient(ellipse_50%_40%_at_90%_30%,rgba(16,185,129,0.15),transparent)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
            <Section className="relative pb-20 pt-20 text-center md:pt-28">
              <h1 className="mx-auto max-w-[900px] bg-gradient-to-b from-white to-slate-300 bg-clip-text text-[40px] font-bold leading-[1.08] tracking-tight text-transparent md:text-[64px]">
                {t('hero.title')}
              </h1>
              <p className="mx-auto mt-6 max-w-[720px] text-[17px] leading-relaxed text-slate-400 md:text-[19px]">{t('hero.text')}</p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <a href={editorUrl()} className="flex h-12 items-center gap-2 rounded-xl bg-indigo-500 px-6 text-[16px] font-semibold text-white shadow-xl shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-indigo-400">
                  {t('hero.start')} <ArrowRight size={18} />
                </a>
                {cloud && !user && (
                  <button onClick={() => setDialog({ mode: 'signUp' })} className="flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 text-[16px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10">
                    <UserPlus size={18} /> {t('hero.signUp')}
                  </button>
                )}
              </div>
              {cloud && <p className="mt-5 text-[14px] text-slate-500">{t('hero.note')}</p>}
              <div className="relative mx-auto mt-14 max-w-[1040px]">
                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/30 via-sky-500/20 to-emerald-500/30 blur-2xl" />
                <Shot src="landing/hero.webp" alt="BlackBoard" className="relative" />
              </div>
            </Section>
          </div>

          {/* features */}
          <Section id="features" className="py-20">
            <h2 className="text-center text-[30px] font-bold tracking-tight text-white md:text-[38px]">{t('features.title')}</h2>
            <p className="mx-auto mt-4 max-w-[640px] text-center text-[17px] text-slate-400">{t('features.text')}</p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, key }) => (
                <div key={key} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-white/[0.05]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-emerald-500/20 text-indigo-200 ring-1 ring-white/10">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold text-white">{t(`f.${key}.title`)}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-slate-400">{t(`f.${key}.text`)}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* showcase */}
          <Section id="firmware" className="grid gap-20 py-16">
            {SHOWCASE.map(({ key, image, demo }, i) => (
              <div key={key} className={`grid items-center gap-10 md:grid-cols-[1fr_1.3fr] ${i % 2 ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <h3 className="text-[26px] font-bold tracking-tight text-white md:text-[30px]">{t(`show.${key}.title`)}</h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-slate-400">{t(`show.${key}.text`)}</p>
                  <a href={editorUrl(demo)} className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-indigo-300 hover:text-indigo-200">
                    Demo <ArrowRight size={16} />
                  </a>
                </div>
                <Shot src={image} alt={t(`show.${key}.title`)} />
              </div>
            ))}
          </Section>

          {/* cloud */}
          {cloud && (
            <Section id="cloud" className="py-20">
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-emerald-950/40 p-8 md:p-12">
                <div className="grid items-center gap-10 md:grid-cols-2">
                  <div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
                      <Cloud size={24} />
                    </span>
                    <h2 className="mt-5 text-[28px] font-bold tracking-tight text-white md:text-[34px]">{t('cloud.title')}</h2>
                    <p className="mt-3 text-[16px] leading-relaxed text-slate-300">{t('cloud.text')}</p>
                    <ul className="mt-6 grid gap-3 text-[15px]">
                      {(['cloud.save', 'cloud.share', 'cloud.login', 'cloud.privacy'] as const).map((k) => (
                        <li key={k} className="flex gap-3">
                          <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-400" /> {t(k)}
                        </li>
                      ))}
                    </ul>
                    {!user && (
                      <button onClick={() => setDialog({ mode: 'signUp' })} className="mt-8 flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-slate-900 hover:bg-slate-100">
                        <UserPlus size={17} /> {t('hero.signUp')}
                      </button>
                    )}
                  </div>
                  {/* a sketch of the project list with a share */}
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl">
                    {[
                      ['Blinker NE555', 'A'],
                      [lang === 'de' ? 'Netzteil 5 V' : 'Power supply 5 V', 'J'],
                      [lang === 'de' ? 'ESP32 Wetterstation' : 'ESP32 weather station', 'M'],
                    ].map(([name, who], i) => (
                      <div key={name} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-200">
                          <CircuitBoard size={18} />
                        </span>
                        <span className="flex-1">
                          <span className="block text-[14px] font-medium text-white">{name}</span>
                          <span className="block text-[12px] text-slate-500">{(lang === 'de' ? ['vor 2 Min.', 'gestern', 'vor 3 Tagen'] : ['2 min ago', 'yesterday', '3 days ago'])[i]}</span>
                        </span>
                        <span className="flex -space-x-2">
                          {[who, 'K'].slice(0, i === 2 ? 1 : 2).map((w, j) => (
                            <span key={j} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950 text-[11px] font-semibold text-white ${j ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                              {w}
                            </span>
                          ))}
                        </span>
                        <Share2 size={16} className="text-slate-500" />
                      </div>
                    ))}
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-[13px] text-slate-400">
                      <Lock size={14} /> {t('cloud.share')}
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          )}

          <Section id="pricing" className="py-20">
            <Pricing t={t} userId={user?.id} onAgb={() => open('agb')} />
          </Section>

          {/* call to action */}
          <Section className="py-20 text-center">
            <h2 className="text-[30px] font-bold tracking-tight text-white md:text-[38px]">{t('cta.title')}</h2>
            <p className="mt-3 text-[17px] text-slate-400">{t('cta.text')}</p>
            <a href={editorUrl()} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-indigo-500 px-6 text-[16px] font-semibold text-white shadow-xl shadow-indigo-500/30 hover:bg-indigo-400">
              {t('hero.start')} <ArrowRight size={18} />
            </a>
          </Section>
        </main>
      )}

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8 text-[13.5px] text-slate-500">
          <span className="flex items-center gap-2">
            <Logo size={18} /> BlackBoard Next · © 2026 Matthias Püski
          </span>
          <span className="ml-auto flex flex-wrap gap-5">
            <button className="hover:text-slate-300" onClick={() => open('impressum')}>
              {t('footer.imprint')}
            </button>
            <button className="hover:text-slate-300" onClick={() => open('datenschutz')}>
              {t('footer.privacy')}
            </button>
            <button className="hover:text-slate-300" onClick={() => open('nutzungsbedingungen')}>
              {t('footer.terms')}
            </button>
            <button className="hover:text-slate-300" onClick={() => open('agb')}>
              {t('footer.agb')}
            </button>
            <button className="hover:text-slate-300" onClick={switchLang}>
              {t('footer.language')}
            </button>
          </span>
        </div>
      </footer>

      {dialog && <AuthDialog mode={dialog.mode} token={dialog.token} next={next} t={t} onClose={() => setDialog(null)} onPrivacy={() => open('datenschutz')} onTerms={() => open('nutzungsbedingungen')} />}
      {banner && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-[14px] text-white shadow-2xl">
          <CheckCircle2 size={17} className="text-emerald-400" /> {banner}
        </div>
      )}
    </div>
  );
}
