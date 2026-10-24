import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { serviceWorkerSource } from './scripts/service-worker.ts';

/** After a build, write dist/sw.js listing every built file, so the app works offline. */
function offline(): Plugin {
  let outDir = 'dist';
  return {
    name: 'egocraft-offline',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = path.join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (name !== 'sw.js') files.push(path.relative(outDir, full).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      files.sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(path.join(outDir, f)));
      const list = ['./', ...files.map((f) => `./${f}`)];
      writeFileSync(path.join(outDir, 'sw.js'), serviceWorkerSource(list, hash.digest('hex').slice(0, 12)));
    },
  };
}

// The built app is static: it runs from server/serve.mjs (Pinokio), from any
// static host (the web build), or from the dev server below.
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5320, strictPort: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  plugins: [offline()],
});
