/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The ESP32 files are cached on first use under their URL: a content hash in
// the URL makes a new build fetch new files instead of keeping the old ones.
const esp32Version = createHash('sha256')
  .update(Buffer.concat(['esp32sim.wasm', 'esp32_rev300_rom.elf', 'micropython-esp32.bin'].map((f) => readFileSync(new URL(`public/esp32/${f}`, import.meta.url)))))
  .digest('hex')
  .slice(0, 12);

// Where the web version is public, for search engines and link previews: the
// canonical address and og:image in index.html, sitemap.xml and robots.txt.
const SITE_URL = (process.env.SITE_URL ?? 'https://pueski.de/blackboard/').replace(/\/?$/, '/');

function seo(): Plugin {
  const pages = ['', '?page=impressum', '?page=datenschutz', '?page=nutzungsbedingungen', '?page=agb'];
  const today = new Date().toISOString().slice(0, 10);
  const xml = (s: string) => s.replace(/&/g, '&amp;');
  return {
    name: 'blackboard-seo',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_URL%', SITE_URL) },
    generateBundle() {
      const urls = pages.map((p) => `  <url><loc>${xml(SITE_URL + p)}</loc><lastmod>${today}</lastmod><priority>${p ? '0.2' : '1.0'}</priority></url>`);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      });
      // crawlers read robots.txt only at the root of a host; under a sub path this one is for reference
      const path = new URL(SITE_URL).pathname;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: ${path}\nDisallow: ${path}api/\n\nSitemap: ${SITE_URL}sitemap.xml\n` });
    },
  };
}

// Relative base so the very same build runs from a web server, a sub path,
// the Tauri webview or a file share.
export default defineConfig({
  base: './',
  clearScreen: false,
  // the account and cloud server (server/) answers /api; run it with `npm run server`
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
  build: {
    target: 'es2023',
    chunkSizeWarningLimit: 25_000,
  },
  worker: { format: 'es' },
  // the server (server/) and the compiler (compiler/) have their own tests on node:test
  test: { exclude: ['**/node_modules/**', 'server/**', 'compiler/**', 'dist/**'] },
  define: { __ESP32_VERSION__: JSON.stringify(esp32Version) },
  plugins: [
    seo(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'BlackBoard Circuit Designer',
        short_name: 'BlackBoard',
        description: 'Lochraster-, Streifenraster- und Schaltplan-Editor mit NGSpice-Simulation',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        // the installed app opens the editor, not the landing page
        start_url: './?app',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        file_handlers: [{ action: './?app', accept: { 'application/x-blackboard': ['.bb'] } }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,wasm,bb}'],
        // the NGSpice engine is ~20 MB and the ESP32 emulator ~6 MB; they are cached on first use instead of precached
        globIgnores: ['**/spice.worker-*.js', 'esp32/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // links from the account mails and the Google sign-in land on the server, not on the cached page
        navigateFallbackDenylist: [/\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('spice.worker'),
            handler: 'CacheFirst',
            options: { cacheName: 'ngspice-engine' },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/esp32/'),
            handler: 'CacheFirst',
            // three files per version: keep the current and the previous one
            options: { cacheName: 'esp32-emulator', expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
});
