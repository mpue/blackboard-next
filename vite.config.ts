import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
        // the NGSpice engine is ~20 MB; it is cached on first use instead of precached
        globIgnores: ['**/spice.worker-*.js'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('spice.worker'),
            handler: 'CacheFirst',
            options: { cacheName: 'ngspice-engine' },
          },
        ],
      },
    }),
  ],
});
