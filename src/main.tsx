import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { isTauri } from './platform/files.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support for the browser build; the Tauri shell ships everything locally.
if (!isTauri() && 'serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

if (import.meta.env.DEV) {
  void import('./store/store.ts').then(({ useStore }) => Object.assign(window, { __bb: useStore }));
}
