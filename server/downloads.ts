// The desktop app's downloads: the newest release of the repository on GitHub
// (built by .github/workflows/desktop.yml). The server asks GitHub now and
// then and keeps the answer, so the landing page itself sends no request to
// GitHub; only a click on a download goes there.

import { Hono } from 'hono';
import type { Config } from './config.ts';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface Release {
  version: string;
  /** the release page */
  url: string;
  published: string;
  assets: ReleaseAsset[];
}

const FRESH_MS = 15 * 60_000;
/** after a failed request or while there is no release: try again a little sooner */
const RETRY_MS = 2 * 60_000;

/** the files people install; not the updater's archives and signatures */
const INSTALLER = /\.(exe|msi|dmg|AppImage|deb|rpm)$/i;

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

export function toRelease(r: GitHubRelease): Release {
  return {
    version: r.tag_name.replace(/^v/, ''),
    url: r.html_url,
    published: r.published_at,
    assets: r.assets.filter((a) => INSTALLER.test(a.name)).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
  };
}

export function downloadRoutes(config: Config, fetchImpl: typeof fetch = fetch) {
  const app = new Hono();
  let cached: { release: Release | null; until: number } | undefined;
  let pending: Promise<Release | null> | undefined;

  const latest = async (): Promise<Release | null> => {
    const r = await fetchImpl(`https://api.github.com/repos/${config.downloadsRepo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'BlackBoard-Server' },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return toRelease((await r.json()) as GitHubRelease);
  };

  app.get('/', async (c) => {
    const now = Date.now();
    if (!cached || cached.until <= now) {
      pending ??= latest()
        // no release yet: ask again soon, the first one may be on its way
        .then((release) => ((cached = { release, until: Date.now() + (release ? FRESH_MS : RETRY_MS) }), release))
        .catch(() => {
          // keep showing what was there before
          cached = { release: cached?.release ?? null, until: Date.now() + RETRY_MS };
          return cached.release;
        })
        .finally(() => (pending = undefined));
      await pending;
    }
    const release = cached?.release;
    c.header('cache-control', 'public, max-age=300');
    return release?.assets.length ? c.json(release) : c.json({ error: 'none', url: `https://github.com/${config.downloadsRepo}/releases` }, 404);
  });

  return app;
}
