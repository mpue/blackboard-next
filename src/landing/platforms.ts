// Which installer fits which system: the files of a desktop release and the
// visitor's system (no DOM here, so the tests run without a browser).

import type { LandingKey } from './strings.ts';

export interface Asset {
  name: string;
  url: string;
  size: number;
}

export interface Release {
  version: string;
  url: string;
  assets: Asset[];
}

export type Os = 'windows' | 'mac' | 'linux';

/** the kinds of files, best first per system */
const KINDS: { os: Os; test: RegExp; label: LandingKey }[] = [
  { os: 'windows', test: /\.exe$/i, label: 'download.exe' },
  { os: 'windows', test: /\.msi$/i, label: 'download.msi' },
  { os: 'mac', test: /\.dmg$/i, label: 'download.dmg' },
  { os: 'linux', test: /\.AppImage$/i, label: 'download.appimage' },
  { os: 'linux', test: /\.deb$/i, label: 'download.deb' },
  { os: 'linux', test: /\.rpm$/i, label: 'download.rpm' },
];

/** the visitor's desktop system; none on phones and tablets */
export function detectOs(ua = navigator.userAgent, platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform): Os | undefined {
  const s = `${platform} ${ua}`;
  if (/android|iphone|ipad|ipod/i.test(s)) return undefined;
  if (/win/i.test(s)) return 'windows';
  if (/mac/i.test(s)) return 'mac';
  if (/linux|x11|cros/i.test(s)) return 'linux';
  return undefined;
}

/** the files of a release in the order of KINDS, with their label */
export function sortAssets(assets: Asset[]) {
  return KINDS.flatMap((k) => assets.filter((a) => k.test.test(a.name)).map((a) => ({ ...a, os: k.os, label: k.label })));
}
