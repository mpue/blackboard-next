// The admin page (?admin): overview, accounts, newsletter and plan settings.
// Only for admins; the server checks every call (server/admin.ts). Written in
// German only: the operator is its one audience.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Loader2, LogIn, ShieldAlert } from 'lucide-react';
import { authClient, editorUrl, landingUrl } from '../account/auth.ts';
import { Logo } from '../ui/Logo.tsx';
import { AdminError, api, PLAN_NAMES, type Stats } from './api.ts';
import { NewsletterAdmin } from './NewsletterAdmin.tsx';
import { PlanSettingsForm } from './PlanSettingsForm.tsx';
import { Users } from './Users.tsx';
import { Card, Toast } from './ui.tsx';

type Tab = 'overview' | 'users' | 'newsletter' | 'plans';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'users', label: 'Konten' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'plans', label: 'Tarife' },
];
const asTab = (h: string): Tab => (TABS.some((t) => t.id === h) ? (h as Tab) : 'overview');

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[12.5px] text-slate-400">{label}</div>
      <div className="mt-1 text-[26px] font-bold tabular-nums tracking-tight text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Overview({ stats }: { stats: Stats }) {
  // the last 14 days, also the ones without compiles
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    return { day, count: stats.compilesByDay.find((d) => d.day === day)?.count ?? 0 };
  });
  const max = Math.max(...days.map((d) => d.count), 1);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Konten" value={stats.users} sub={`${stats.newUsers} neu in 7 Tagen`} />
        <Stat label="Bestätigt" value={stats.verified} sub={stats.banned ? `${stats.banned} gesperrt` : 'keins gesperrt'} />
        <Stat label="Übersetzungen heute" value={stats.compilesToday} />
        <Stat label="Newsletter" value={stats.subscribers.active} sub={`${stats.subscribers.pending} nicht bestätigt`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Tarife">
          <ul className="grid gap-3">
            {(Object.keys(PLAN_NAMES) as (keyof typeof PLAN_NAMES)[]).map((p) => (
              <li key={p} className="grid gap-1">
                <div className="flex justify-between text-[13.5px]">
                  <span>{PLAN_NAMES[p]}</span>
                  <span className="tabular-nums text-white">{stats.plans[p]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${p === 'commercial' ? 'bg-emerald-500' : p === 'pro' ? 'bg-indigo-500' : 'bg-slate-500'}`}
                    style={{ width: `${stats.users ? (stats.plans[p] / stats.users) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-slate-400">{stats.projects} Cloud-Projekte</p>
        </Card>
        <Card title="Übersetzungen der letzten 14 Tage">
          <div className="flex h-[160px] items-end gap-1.5" role="img" aria-label={days.map((d) => `${d.day}: ${d.count}`).join(', ')}>
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="rounded-t bg-indigo-500/80 group-hover:bg-indigo-400" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }} />
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-white group-hover:block">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
            <span>{new Date(`${days[0].day}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
            <span>heute</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function Admin() {
  const session = authClient.useSession();
  const [tab, setTab] = useState<Tab>(() => asTab(location.hash.slice(1)));
  const [stats, setStats] = useState<Stats | null>(null);
  const [denied, setDenied] = useState<'login' | 'forbidden' | 'offline' | null>(null);
  const [toast, setToast] = useState('');
  const say = useCallback((s: string) => setToast(s), []);
  const done = useCallback(() => setToast(''), []);

  const loadStats = useCallback(() => {
    api.stats().then(
      (s) => {
        setStats(s);
        setDenied(null);
      },
      (e) => setDenied(e instanceof AdminError ? (e.status === 401 ? 'login' : e.status === 403 ? 'forbidden' : 'offline') : 'offline'),
    );
  }, []);
  useEffect(() => {
    document.title = 'BlackBoard · Administration';
    // nothing here for search engines
    const robots = Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex, nofollow' });
    document.head.append(robots);
    const onHash = () => setTab(asTab(location.hash.slice(1)));
    addEventListener('hashchange', onHash);
    return () => {
      robots.remove();
      removeEventListener('hashchange', onHash);
    };
  }, []);
  useEffect(loadStats, [loadStats, tab, session.data?.user.id]);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `${location.pathname}${location.search}#${t}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 antialiased">
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4">
          <a href={landingUrl()} className="flex shrink-0 items-center gap-2">
            <Logo size={26} />
            <span className="hidden text-[15px] font-semibold text-white sm:inline">BlackBoard</span>
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11.5px] font-semibold text-amber-200">Admin</span>
          </a>
          {stats && (
            <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[13.5px] ${tab === t.id ? 'bg-white/10 font-medium text-white' : 'text-slate-400 hover:text-white'}`}
                  onClick={() => go(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <a href={editorUrl()} className="ml-auto hidden shrink-0 items-center gap-1 text-[13px] text-slate-400 hover:text-white md:flex">
            Editor <ArrowRight size={14} />
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-[1240px] px-4 py-6">
        {denied === 'login' ? (
          <div className="mx-auto mt-16 max-w-[420px] text-center">
            <LogIn className="mx-auto text-indigo-300" size={32} />
            <h1 className="mt-4 text-[20px] font-semibold text-white">Bitte zuerst anmelden</h1>
            <a href={landingUrl('?login')} className="mt-5 inline-flex h-10 items-center rounded-lg bg-indigo-500 px-4 text-[14px] font-semibold text-white hover:bg-indigo-400">
              Zur Anmeldung
            </a>
          </div>
        ) : denied ? (
          <div className="mx-auto mt-16 max-w-[460px] text-center">
            <ShieldAlert className="mx-auto text-amber-300" size={32} />
            <h1 className="mt-4 text-[20px] font-semibold text-white">{denied === 'forbidden' ? 'Kein Zugriff' : 'Server nicht erreichbar'}</h1>
            <p className="mt-2 text-[14px] text-slate-400">
              {denied === 'forbidden'
                ? `Das Konto ${session.data?.user.email ?? ''} ist kein Admin. Admins stehen in ADMIN_EMAILS (server.env) oder bekommen die Rolle von einem anderen Admin.`
                : 'Die Administration braucht den BlackBoard-Server.'}
            </p>
          </div>
        ) : !stats ? (
          <div className="mt-24 flex justify-center text-slate-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : tab === 'overview' ? (
          <Overview stats={stats} />
        ) : tab === 'users' ? (
          <Users self={session.data?.user.id ?? ''} say={say} />
        ) : tab === 'newsletter' ? (
          <NewsletterAdmin say={say} subscribers={stats.subscribers.active} onCount={loadStats} />
        ) : (
          <PlanSettingsForm say={say} />
        )}
      </main>
      {toast && <Toast text={toast} onDone={done} />}
    </div>
  );
}
