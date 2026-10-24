import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline use: the built app stores its own files (dist/sw.js, written by
// the build). Browsers allow this on https and on this computer
// (127.0.0.1, localhost) only; elsewhere the app simply runs online.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Not fatal: the app works the same, just not offline.
  });
}
