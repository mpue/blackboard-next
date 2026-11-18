// The desktop app for download: the newest release on GitHub, as the server
// knows it (server/downloads.ts), with the file for the visitor's system first.

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Monitor } from 'lucide-react';
import { apiUrl } from '../account/auth.ts';
import { SOURCE_URL } from '../source.ts';
import { detectOs, sortAssets, type Release } from './platforms.ts';
import type { T } from './strings.ts';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export function Downloads({ t, cloud }: { t: T; cloud: boolean }) {
  const [release, setRelease] = useState<Release | null | undefined>(undefined);
  const os = detectOs();

  useEffect(() => {
    if (!cloud) return setRelease(null);
    let live = true;
    void fetch(apiUrl('downloads'))
      .then((r) => (r.ok ? (r.json() as Promise<Release>) : null))
      .catch(() => null)
      .then((r) => live && setRelease(r));
    return () => {
      live = false;
    };
  }, [cloud]);

  const files = release ? sortAssets(release.assets) : [];
  const mine = files.find((f) => f.os === os);
  const osName = os ? t(`download.os.${os}`) : '';

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/70 p-8 md:p-12">
      <div className="grid items-start gap-10 md:grid-cols-[1fr_1.1fr]">
        <div>
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
            <Monitor size={24} />
          </span>
          <h2 className="mt-5 text-[28px] font-bold tracking-tight text-white md:text-[34px]">{t('download.title')}</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-slate-300">{t('download.text')}</p>
          {mine && (
            <a href={mine.url} className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-indigo-500 px-6 text-[16px] font-semibold text-white shadow-xl shadow-indigo-500/30 hover:bg-indigo-400">
              <Download size={18} /> {t('download.for', { os: osName })}
            </a>
          )}
          {release && <p className="mt-3 text-[13.5px] text-slate-500">{t('download.version', { version: release.version })}</p>}
        </div>

        <div className="grid gap-3">
          {release === undefined ? (
            <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
          ) : files.length ? (
            <ul className="grid gap-2">
              {files.map((f) => (
                <li key={f.url}>
                  <a href={f.url} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 hover:border-indigo-400/40 hover:bg-white/5">
                    <Download size={16} className="shrink-0 text-indigo-300" />
                    <span className="flex-1 text-[14.5px] text-white">{t(f.label)}</span>
                    <span className="text-[12.5px] tabular-nums text-slate-500">{mb(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-[14.5px] text-slate-300">{t('download.none')}</p>
          )}
          {files.length > 0 && <p className="text-[12.5px] leading-relaxed text-slate-500">{t('download.note')}</p>}
          <a href={release?.url ?? `${SOURCE_URL}/releases`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-indigo-300 hover:text-indigo-200">
            <ExternalLink size={14} /> {t('download.all')}
          </a>
        </div>
      </div>
    </div>
  );
}
