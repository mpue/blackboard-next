import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Cloud, CloudUpload, Copy, FolderOpen, Loader2, LogIn, LogOut, Pencil, Share2, Trash2, UserPlus, X } from 'lucide-react';
import { activeDoc, useStore } from '../store/store.ts';
import { authClient, landingUrl } from '../account/auth.ts';
import { CloudError, listProjects, listShares, removeProject, renameProject, shareProject, unshareProject, type ProjectMeta, type Share } from '../account/cloud.ts';
import { openCloudProject, saveToCloud } from '../account/cloudActions.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { Button, Dialog, cx } from './primitives.tsx';

function ago(ms: number, lang: string): string {
  const s = (ms - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  for (const [unit, size] of [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ] as const)
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return rtf.format(Math.round(s), 'second');
}

function Avatar({ name, image, size = 28 }: { name: string; image?: string | null; size?: number }) {
  return image ? (
    <img src={image} alt="" className="rounded-full" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-accent font-semibold text-white dark:text-slate-950" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SharePanel({ project, onBack }: { project: ProjectMeta; onBack: () => void }) {
  const t = useT();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'view' | 'edit'>('view');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void listShares(project.id).then(setShares, () => setShares([]));
  }, [project.id]);
  const add = async (mail: string, r: 'view' | 'edit') => {
    setBusy(true);
    setError('');
    try {
      setShares(await shareProject(project.id, mail, r));
      setEmail('');
    } catch (e) {
      const code = e instanceof CloudError ? e.code : '';
      setError(code === 'no user' ? t('cloud.shareNoUser', { email: mail }) : code === 'self' ? t('cloud.shareSelf') : t('cloud.err.generic', { msg: code || '?' }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3">
      <button className="flex items-center gap-1 self-start text-[12px] text-muted hover:text-fg" onClick={onBack}>
        <ArrowLeft size={13} /> {t('cloud.back')}
      </button>
      <h3 className="text-[14px] font-semibold">{t('cloud.shareTitle', { name: project.name })}</h3>
      <p className="text-[12px] text-muted">{t('cloud.shareHint')}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void add(email.trim(), role);
        }}
      >
        <input className="bb-input h-8 min-w-[200px] flex-1" type="email" placeholder={t('cloud.shareEmail')} value={email} onChange={(e) => setEmail(e.target.value)} required aria-label={t('cloud.shareEmail')} />
        <select className="bb-input h-8 w-auto" value={role} onChange={(e) => setRole(e.target.value as 'view' | 'edit')} aria-label="role">
          <option value="view">{t('cloud.role.view')}</option>
          <option value="edit">{t('cloud.role.edit')}</option>
        </select>
        <Button type="submit" variant="primary" icon={busy ? Loader2 : UserPlus} disabled={busy}>
          {t('cloud.shareAdd')}
        </Button>
      </form>
      {error && <p className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-600 dark:text-red-300">{error}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {shares === null ? (
          <li className="p-3 text-muted">…</li>
        ) : shares.length === 0 ? (
          <li className="p-3 text-[12px] text-muted">{t('cloud.shareNone')}</li>
        ) : (
          shares.map((s) => (
            <li key={s.user.id} className="flex items-center gap-2.5 px-3 py-2">
              <Avatar name={s.user.name} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{s.user.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{s.user.email}</span>
              </span>
              <select className="bb-input h-7 w-auto text-[12px]" value={s.role} onChange={(e) => void add(s.user.email, e.target.value as 'view' | 'edit')} aria-label="role">
                <option value="view">{t('cloud.role.view')}</option>
                <option value="edit">{t('cloud.role.edit')}</option>
              </select>
              <button
                className="rounded p-1 text-muted hover:bg-hover hover:text-red-500"
                title={t('cloud.shareRemove')}
                aria-label={t('cloud.shareRemove')}
                onClick={() => void unshareProject(project.id, s.user.id).then(setShares)}
              >
                <X size={14} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** The user's cloud projects and those shared with them; saving the current document there. */
export function CloudDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const ds = useStore((s) => activeDoc(s));
  const session = authClient.useSession();
  const user = session.data?.user;
  const [tab, setTab] = useState<'own' | 'shared'>('own');
  const [list, setList] = useState<{ own: ProjectMeta[]; shared: ProjectMeta[] } | null>(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState<ProjectMeta | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    listProjects().then(
      (l) => {
        setList(l);
        setError('');
      },
      (e) => setError(e instanceof CloudError && e.status === 401 ? t('cloud.err.signedOut') : t('cloud.err.offline')),
    );
  }, [t]);
  useEffect(() => {
    if (user) reload();
  }, [user, reload]);

  const save = async (copy = false) => {
    setSaving(true);
    await saveToCloud(activeDoc(), copy);
    setSaving(false);
    reload();
  };

  const rows = tab === 'own' ? list?.own : list?.shared;
  const linked = ds?.cloud && ds.cloud.role !== 'view';

  return (
    <Dialog title={t('cloud.title')} onClose={onClose} width={620}>
      {session.isPending ? (
        <div className="flex justify-center p-8 text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : !user ? (
        <div className="grid justify-items-center gap-4 p-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Cloud size={24} />
          </span>
          <p className="max-w-[420px] text-[13px] leading-relaxed text-muted">{t('cloud.signInHint')}</p>
          <div className="flex gap-2">
            <Button variant="primary" icon={LogIn} onClick={() => (location.href = landingUrl('?login&next=app'))}>
              {t('cloud.signIn')}
            </Button>
            <Button icon={UserPlus} onClick={() => (location.href = landingUrl('?signup&next=app'))}>
              {t('cloud.signUp')}
            </Button>
          </div>
        </div>
      ) : sharing ? (
        <SharePanel
          project={sharing}
          onBack={() => {
            setSharing(null);
            reload();
          }}
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-panel-2 px-3 py-2">
            <Avatar name={user.name} image={user.image} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{t('cloud.signedInAs', { name: user.name })}</span>
            <button className="flex items-center gap-1 text-[12px] text-muted hover:text-fg" onClick={() => void authClient.signOut()}>
              <LogOut size={13} /> {t('cloud.signOut')}
            </button>
          </div>
          {ds && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={saving ? Loader2 : CloudUpload} disabled={saving} onClick={() => void save()}>
                {linked ? t('cloud.saveChanges') : t('cloud.saveCurrent')}
              </Button>
              {ds.cloud && (
                <Button icon={Copy} disabled={saving} onClick={() => void save(true)}>
                  {t('cloud.saveCopy')}
                </Button>
              )}
            </div>
          )}
          <div className="flex gap-1 border-b border-line">
            {(['own', 'shared'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cx('-mb-px border-b-2 px-3 py-1.5 text-[12.5px] font-medium', tab === k ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
              >
                {t(k === 'own' ? 'cloud.mine' : 'cloud.shared')}
                {list && <span className="ml-1.5 text-muted">{(k === 'own' ? list.own : list.shared).length}</span>}
              </button>
            ))}
          </div>
          {error && <p className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-600 dark:text-red-300">{error}</p>}
          <ul className="bb-scroll max-h-[50vh] divide-y divide-line overflow-y-auto">
            {!rows ? (
              <li className="flex justify-center p-6 text-muted">
                <Loader2 className="animate-spin" />
              </li>
            ) : rows.length === 0 ? (
              <li className="p-6 text-center text-[12.5px] text-muted">{t(tab === 'own' ? 'cloud.empty' : 'cloud.emptyShared')}</li>
            ) : (
              rows.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <button
                    className="flex min-w-0 flex-1 flex-col items-start rounded-md px-2 py-1 text-left hover:bg-hover"
                    onClick={() => {
                      void openCloudProject(p.id);
                      onClose();
                    }}
                    title={t('cloud.open')}
                  >
                    <span className="flex max-w-full items-center gap-1.5 text-[13px] font-medium">
                      <span className="truncate">{p.name}</span>
                      {p.role !== 'owner' && <span className="shrink-0 rounded bg-panel-2 px-1.5 py-px text-[10.5px] font-normal text-muted">{t(`cloud.role.${p.role}` as I18nKey)}</span>}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {ago(p.updatedAt, lang)} · {Math.max(1, Math.round(p.size / 1024))} KB
                      {p.role === 'owner' ? (p.shares ? ` · ${t('cloud.sharedWith', { count: p.shares })}` : '') : ` · ${t('cloud.by', { name: p.owner.name })}`}
                    </span>
                  </button>
                  <button className="rounded p-1.5 text-muted hover:bg-hover hover:text-fg" title={t('cloud.open')} aria-label={t('cloud.open')} onClick={() => (void openCloudProject(p.id), onClose())}>
                    <FolderOpen size={15} />
                  </button>
                  {p.role === 'owner' && (
                    <>
                      <button className="rounded p-1.5 text-muted hover:bg-hover hover:text-fg" title={t('cloud.share')} aria-label={t('cloud.share')} onClick={() => setSharing(p)}>
                        <Share2 size={15} />
                      </button>
                      <button
                        className="rounded p-1.5 text-muted hover:bg-hover hover:text-fg"
                        title={t('cloud.rename')}
                        aria-label={t('cloud.rename')}
                        onClick={() => {
                          const name = prompt(t('cloud.newName', { name: p.name }), p.name)?.trim();
                          if (name && name !== p.name) void renameProject(p.id, name).then(reload);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    </>
                  )}
                  <button
                    className="rounded p-1.5 text-muted hover:bg-hover hover:text-red-500"
                    title={p.role === 'owner' ? t('cloud.delete') : t('cloud.removeShared')}
                    aria-label={p.role === 'owner' ? t('cloud.delete') : t('cloud.removeShared')}
                    onClick={() => {
                      if (p.role === 'owner' && !confirm(t('cloud.deleteConfirm', { name: p.name }))) return;
                      void removeProject(p.id).then(reload);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
