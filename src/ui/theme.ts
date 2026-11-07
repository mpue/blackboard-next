import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '../store/store.ts';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function subscribeSystem(cb: () => void) {
  media?.addEventListener('change', cb);
  return () => media?.removeEventListener('change', cb);
}

export function useIsDark(): boolean {
  const theme = useStore((s) => s.settings.theme);
  const systemDark = useSyncExternalStore(subscribeSystem, () => !!media?.matches, () => false);
  return theme === 'dark' || (theme === 'system' && systemDark);
}

/** Mirrors the chosen theme onto <html class="dark"> and the window chrome colour. */
export function useApplyTheme() {
  const dark = useIsDark();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121826' : '#ffffff');
  }, [dark]);
}
