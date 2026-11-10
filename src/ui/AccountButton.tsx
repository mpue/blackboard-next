import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { authClient, serverConfig } from '../account/auth.ts';
import { openDialog } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import { IconButton } from './primitives.tsx';

/**
 * Account and cloud projects, in the top bar of the web version (hidden when
 * there is no BlackBoard server, e.g. in the desktop app).
 */
export function AccountButton() {
  const t = useT();
  const [available, setAvailable] = useState(false);
  const session = authClient.useSession();
  const user = session.data?.user;
  useEffect(() => {
    void serverConfig().then((c) => setAvailable(!!c));
  }, []);
  if (!available) return null;
  if (!user) return <IconButton icon={Cloud} label={t('cloud.account')} onClick={() => openDialog({ kind: 'cloud' })} />;
  return (
    <button
      className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-muted hover:bg-hover hover:text-fg"
      title={`${t('cloud.title')} · ${user.email}`}
      aria-label={t('cloud.title')}
      onClick={() => openDialog({ kind: 'cloud' })}
    >
      {user.image ? (
        <img src={user.image} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white dark:text-slate-950">{user.name.slice(0, 1).toUpperCase()}</span>
      )}
      <Cloud size={14} />
    </button>
  );
}
