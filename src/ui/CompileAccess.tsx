// Who may use the online compiler (server/plans.ts), as the code panel shows
// it: before the first compile already, with the way on – sign in, or in the
// desktop app the key of the account.

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { landingUrl, serverConfig } from '../account/auth.ts';
import { fetchMe } from '../account/plans.ts';
import { compileKey, PUBLIC_SITE, setCompileKey, type CompileProblem, type CompileUsage } from '../mcu/sketch.ts';
import { isTauri } from '../platform/files.ts';
import { toast } from '../store/store.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';

const ACCOUNT_PROBLEMS: CompileProblem[] = ['login', 'key', 'blocked', 'quota'];
export const isAccountProblem = (p: CompileProblem | undefined): p is CompileProblem => !!p && ACCOUNT_PROBLEMS.includes(p);

export interface CompileAccess {
  problem?: CompileProblem;
  usage?: CompileUsage;
}

/** What the account allows, asked once when the panel opens; `recheck` after a key was saved. */
export function useCompileAccess(): [CompileAccess, () => void] {
  const [access, setAccess] = useState<CompileAccess>({});
  const [n, setN] = useState(0);
  useEffect(() => {
    if (isTauri()) {
      setAccess(compileKey() ? {} : { problem: 'login' });
      return;
    }
    let live = true;
    void serverConfig().then(async (c) => {
      // without a server the first compile says so
      if (!c) return;
      const me = await fetchMe();
      if (!live) return;
      if (!me) setAccess({ problem: 'login' });
      else if (!me.compile.ok) setAccess({ problem: me.compile.reason });
      else setAccess({ usage: { used: me.compile.used, limit: me.compile.limit } });
    });
    return () => {
      live = false;
    };
  }, [n]);
  return [access, useCallback(() => setN((x) => x + 1), [])];
}

/** the words for a problem of the compile */
export function problemText(t: ReturnType<typeof useT>, p: CompileProblem, usage?: CompileUsage) {
  if (p === 'login' && isTauri()) return t('code.problem.loginDesktop');
  if (p === 'quota') return t('code.problem.quota', { limit: String(usage?.limit ?? '') });
  return t(`code.problem.${p}` as I18nKey);
}

const button = 'flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[12px] hover:bg-hover';
const primary = 'flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-white hover:opacity-90 dark:text-slate-950';

/** the way on from an account problem: none when the account is blocked or today's compiles are used up */
export function AccessActions({ problem, onKey }: { problem: CompileProblem; onKey: () => void }) {
  const t = useT();
  const [key, setKey] = useState('');

  if (isTauri() && (problem === 'login' || problem === 'key'))
    return (
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          setCompileKey(key.trim());
          setKey('');
          toast(t('code.keySaved'), 'success');
          onKey();
        }}
      >
        <KeyRound size={13} className="text-muted" />
        <input
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[11.5px] outline-none focus:border-accent"
          placeholder="bbk_…"
          aria-label={t('code.key')}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          pattern="bbk_[A-Za-z0-9_\-]{20,64}"
          required
        />
        <button className={primary}>{t('code.keySave')}</button>
        <a className={button} href={PUBLIC_SITE} target="_blank" rel="noreferrer">
          <ExternalLink size={12} /> {t('code.keyGet')}
        </a>
      </form>
    );
  if (problem === 'login')
    return (
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={primary} onClick={() => (location.href = landingUrl('?signup&next=app'))}>
          <UserPlus size={13} /> {t('code.signUp')}
        </button>
        <button type="button" className={button} onClick={() => (location.href = landingUrl('?login&next=app'))}>
          <LogIn size={13} /> {t('code.signIn')}
        </button>
      </div>
    );
  return null;
}
