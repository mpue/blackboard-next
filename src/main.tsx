import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from './platform/files.ts';
import './index.css';

// One page for both: the landing page, or the editor when the address asks for
// it (?app, and the direct links ?demo= ?lesson= ?sample= ?view= ?project=).
// The desktop app always starts in the editor.
const EDITOR_PARAMS = ['app', 'demo', 'lesson', 'sample', 'view', 'project'];
const params = new URLSearchParams(location.search);
const editor = isTauri() || EDITOR_PARAMS.some((k) => params.has(k));

const root = createRoot(document.getElementById('root')!);
if (editor) {
  const { App } = await import('./App.tsx');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  const { Landing } = await import('./landing/Landing.tsx');
  root.render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  );
}

// Offline support for the browser build; the Tauri shell ships everything locally.
if (!isTauri() && 'serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

if (import.meta.env.DEV && editor) {
  void import('./store/store.ts').then(({ useStore }) => Object.assign(window, { __bb: useStore }));
}
