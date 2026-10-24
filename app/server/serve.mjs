#!/usr/bin/env node
// EgoCraft's local server: the built app (dist/), on 127.0.0.1 only. The
// app keeps studies in the browser, so the server only hands out files.
// No npm packages are needed to run it.
//
//   node server/serve.mjs [--port 4320]

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('port', process.env.PORT || 4320));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Only this computer: a local Host header (no DNS rebinding). */
function isLocalHost(host) {
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return name === '127.0.0.1' || name === 'localhost' || name === '::1' || name.endsWith('.localhost');
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('[EgoCraft] The app is not built yet. Run "npm run build" first.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    if (!isLocalHost(req.headers.host)) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://local');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(dist, '.' + rel);
    if (!file.startsWith(dist + path.sep) && file !== dist) {
      res.writeHead(403).end();
      return;
    }
    const target = existsSync(file) ? file : path.join(dist, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream',
      'Cache-Control': target.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Nothing is loaded from, or sent to, anywhere else.
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'self'",
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e?.message ?? e));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('[EgoCraft] Studies are kept in your browser and in the .egocraft files you save.');
  console.log(`[EgoCraft] Ready at http://127.0.0.1:${port}/`);
});
