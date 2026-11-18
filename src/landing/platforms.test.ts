import { describe, expect, it } from 'vitest';
import { detectOs, sortAssets } from './platforms.ts';

describe('downloads', () => {
  it('recognise the desktop system, and none on phones', () => {
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')).toBe('windows');
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', 'MacIntel')).toBe('mac');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64')).toBe('linux');
    expect(detectOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l')).toBeUndefined();
    expect(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad')).toBeUndefined();
  });

  it('put the installers in order, the best per system first', () => {
    const files = sortAssets(
      ['BlackBoard_3.0.0_amd64.deb', 'BlackBoard_3.0.0_x64_en-US.msi', 'BlackBoard_3.0.0_amd64.AppImage', 'BlackBoard_3.0.0_x64-setup.exe', 'BlackBoard_3.0.0_universal.dmg'].map((name) => ({
        name,
        url: name,
        size: 1,
      })),
    );
    expect(files.map((f) => f.os)).toEqual(['windows', 'windows', 'mac', 'linux', 'linux']);
    expect(files[0].name).toMatch(/setup\.exe$/);
    expect(files[3].name).toMatch(/AppImage$/);
  });
});
