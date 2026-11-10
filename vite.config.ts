import { defineConfig } from 'vite';
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

// Relative base so the very same build runs from a web server, a sub path,
// the Tauri webview or a file share.
export default defineConfig({
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2023',
    chunkSizeWarningLimit: 25_000,
  },
  worker: { format: 'es' },
  define: { __ESP32_VERSION__: JSON.stringify(esp32Version) },
  plugins: [
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
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        file_handlers: [{ action: '.', accept: { 'application/x-blackboard': ['.bb'] } }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,wasm,bb}'],
        // the NGSpice engine is ~20 MB and the ESP32 emulator ~6 MB; they are cached on first use instead of precached
        globIgnores: ['**/spice.worker-*.js', 'esp32/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
