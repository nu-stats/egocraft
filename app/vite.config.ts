import { defineConfig } from 'vite';

// The built app is static: it runs from server/serve.mjs (Pinokio), from any
// static host (the web build), or from the dev server below.
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5320, strictPort: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
});
