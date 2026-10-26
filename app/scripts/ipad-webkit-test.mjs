// EgoCraft on WebKit (Safari's engine) at iPad size (1024 x 768, touch, iPad
// user agent): an interview by touch, the back-up and study files, then a real
// offline reload. Not part of `npm run ci`.
//
//   npm install --no-save playwright && npx playwright install webkit
//   node scripts/ipad-webkit-test.mjs [dist folder | URL]
//
// With a folder (for example dist after `npm run build`) it serves the app
// itself and stops the server for the offline part; with no argument it tests
// the published web app. Screenshots and saved files go to scripts/out/.
import { webkit } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
// A folder argument is served at http://127.0.0.1:<port>/egocraft-app/ and the
// server is stopped for the offline part (a real loss of network, which
// Playwright's setOffline doesn't give service workers in WebKit).
const ARG = process.argv[2] || 'https://nu-stats.github.io/egocraft-app/';
let server = null;
let URL = ARG;
if (!/^https?:/.test(ARG)) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
  server = createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]).replace(/^\/egocraft-app/, '');
    if (u === '' || u.endsWith('/')) u += 'index.html';
    const f = join(ARG, u);
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  URL = `http://127.0.0.1:${server.address().port}/egocraft-app/`;
  console.log('serving', ARG, 'at', URL);
}
const OUT = new globalThis.URL('./out/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const results = [];
const log = (ok, what, detail = '') => { results.push({ ok, what, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.type()); d.accept(d.type() === 'prompt' ? 'field ipad 2026' : undefined); });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let shot = 0;
const snap = (name) => page.screenshot({ path: `${OUT}${String(++shot).padStart(2, '0')}-${name}.png` });

/** Tap (touch) the centre of an element. */
const tapEl = async (h) => {
  await h.evaluate((x) => x.scrollIntoView({ block: 'center' }));
  await sleep(250);
  const b = await h.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(450);
};
const button = async (text) => {
  const h = (await page.evaluateHandle((t) => {
    const bs = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
    return bs.find((b) => b.innerText.trim() === t) || bs.find((b) => b.innerText.trim().startsWith(t));
  }, text)).asElement();
  if (!h) throw new Error(`no button "${text}"`);
  await tapEl(h);
};
const sel = async (s) => {
  const h = await page.$(s);
  if (!h) throw new Error(`no ${s}`);
  await tapEl(h);
};
const nav = async (label) => {
  const h = (await page.evaluateHandle((l) => [...document.querySelectorAll('nav button')].find((b) => b.innerText.replace(/^\d+\s*/, '').trim().toLowerCase().startsWith(l)), label)).asElement();
  if (!h) throw new Error(`no nav "${label}"`);
  await tapEl(h);
  await sleep(500);
};
const step = async (what, fn) => {
  try { const d = await fn(); log(true, what, d || ''); return true; } catch (e) { log(false, what, e.message.split('\n')[0]); await snap('fail').catch(() => {}); return false; }
};

/** Drag with pointer events of type "touch", the way a finger on an iPad does. */
const touchDrag = async (from, to) => {
  await page.evaluate(async ({ from, to }) => {
    const el = document.elementFromPoint(from.x, from.y);
    const opts = (x, y) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1, pressure: 0.5 });
    el.dispatchEvent(new PointerEvent('pointerdown', opts(from.x, from.y)));
    const n = 20;
    for (let i = 1; i <= n; i++) {
      const x = from.x + ((to.x - from.x) * i) / n, y = from.y + ((to.y - from.y) * i) / n;
      const target = document.elementFromPoint(x, y) || el;
      // While dragging, events go to the captured element if pointer capture was taken.
      (el.hasPointerCapture?.(7) ? el : target).dispatchEvent(new PointerEvent('pointermove', opts(x, y)));
      await new Promise((r) => setTimeout(r, 16));
    }
    const end = el.hasPointerCapture?.(7) ? el : document.elementFromPoint(to.x, to.y) || el;
    end.dispatchEvent(new PointerEvent('pointerup', { ...opts(to.x, to.y), buttons: 0, pressure: 0 }));
  }, { from, to });
  await sleep(400);
};
const personBox = async (name) => {
  const h = (await page.evaluateHandle((n) => [...document.querySelectorAll('.iv-person')].find((e) => e.offsetParent && e.innerText.trim().startsWith(n)), name)).asElement();
  if (!h) throw new Error(`no person ${name}`);
  await h.evaluate((x) => x.scrollIntoView({ block: 'center' }));
  const b = await h.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const dropBox = async (label) => {
  const h = (await page.evaluateHandle((t) => [...document.querySelectorAll('[data-drop]')].find((e) => e.offsetParent !== null && (e.innerText || '').trim().startsWith(t)), label)).asElement();
  if (!h) throw new Error(`no drop target ${label}`);
  const b = await h.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 40) };
};

// 1. First visit: app loads, service worker installs.
await step('opens in WebKit at iPad size', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Open the sample study')), null, { timeout: 30000 });
  await snap('home');
  return await page.evaluate(() => navigator.userAgent.includes('iPad') ? 'iPad user agent' : '');
});
await step('service worker installs and takes control', async () => {
  const ok = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'no serviceWorker API'; await navigator.serviceWorker.ready; return 'ready'; });
  if (ok !== 'ready') throw new Error(ok);
  await page.reload({ waitUntil: 'networkidle' });
  const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!ctl) throw new Error('page not controlled after reload');
  return 'controlled after reload';
});
await step('storage: persist() and estimate()', async () => {
  return await page.evaluate(async () => {
    const p = navigator.storage?.persist ? await navigator.storage.persist() : 'n/a';
    const e = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    return `persist=${p}, quota=${e ? Math.round(e.quota / 1e6) + ' MB' : 'n/a'}`;
  });
});

// 2. Interview by touch.
let interviewOk = await step('set up example questionnaire and interview', async () => {
  await button('Open the sample study');
  await sleep(1200);
  await nav('interviews');
  await button('Questionnaires');
  await button('Start from the example');
  await sleep(500);
  await button('← All questionnaires');
  await button('Interviews on this device');
  await sleep(400);
  await sel('#pp1'); await page.keyboard.type('field ipad 2026');
  await sel('#pp2'); await page.keyboard.type('field ipad 2026');
  await button('Set the passphrase');
  await page.waitForSelector('#st-ego', { timeout: 20000 });
  await sel('#st-ego'); await page.keyboard.type('R-901');
  await button('Start');
  await sleep(900);
  await snap('interview-start');
});
const next = async () => { await button('Next'); await sleep(500); };
if (interviewOk) interviewOk = await step('consent and names typed with on-screen keyboard flow', async () => {
  await next(); await button('I agree'); await next(); await next();
  for (const name of ['Maria', 'Kofi', 'Lena', 'Dad', 'Sam']) {
    await sel('input[aria-label="Name, nickname or initials"]');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await sleep(250);
  }
  const n = await page.$$eval('.iv-person', (els) => els.filter((e) => e.offsetParent).length);
  await snap('names');
  if (n < 5) throw new Error(`only ${n} people shown`);
  return `${n} people`;
});
if (interviewOk) {
  await next(); await next(); await next();
  await step('touch-action on draggable people', async () => {
    const ta = await page.$$eval('.iv-person', (els) => [...new Set(els.filter((e) => e.offsetParent).map((e) => getComputedStyle(e).touchAction))].join(','));
    if (!/none|pinch-zoom/.test(ta)) throw new Error(`touch-action is "${ta}" (a finger drag would scroll the page instead)`);
    return ta;
  });
  interviewOk = await step('drag people into boxes with touch pointer events', async () => {
    for (const [n, box] of [['Maria', 'Friend'], ['Dad', 'Family'], ['Kofi', 'Work or school'], ['Lena', 'Friend'], ['Sam', 'Neighbor']]) {
      await touchDrag(await personBox(n), await dropBox(box));
    }
    await snap('bins');
    const placed = await page.evaluate(() => [...document.querySelectorAll('[data-drop]')].filter((e) => e.offsetParent).map((d) => d.querySelectorAll('.iv-person').length).reduce((a, b) => a + b, 0));
    if (placed < 5) throw new Error(`${placed} of 5 placed`);
    return `${placed} placed`;
  });
}
if (interviewOk) interviewOk = await step('drag people onto closeness circles', async () => {
  await next();
  const ring = async (r, angle) => {
    const box = await (await page.$('.iv-rings svg')).boundingBox();
    const radius = (k) => 8 + ((4 - k + 1) * 40) / 4;
    const mid = (radius(r) + (r < 4 ? radius(r + 1) : 8)) / 2;
    const k = box.width / 100;
    return { x: box.x + 50 * k + mid * k * Math.cos(angle), y: box.y + 50 * k + mid * k * Math.sin(angle) };
  };
  for (const [n, r, a] of [['Dad', 4, -2.2], ['Maria', 4, 0.4], ['Lena', 3, 2.4], ['Kofi', 2, -0.6], ['Sam', 1, -2.6]]) {
    await touchDrag(await personBox(n), await ring(r, a));
  }
  await snap('rings');
  const fit = await page.evaluate(() => {
    const s = document.querySelector('.iv-rings svg').getBoundingClientRect();
    const bar = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.innerText.trim() === 'Next').getBoundingClientRect();
    return { bottom: Math.round(s.bottom), barTop: Math.round(bar.top) };
  });
  if (fit.bottom > fit.barTop + 2) throw new Error(`circles end at ${fit.bottom}px, under the Next bar at ${fit.barTop}px`);
  const unplaced = await page.evaluate(() => [...document.querySelectorAll('.iv-person')].filter((e) => e.offsetParent && !e.closest('.iv-rings')).length);
  if (unplaced) throw new Error(`${unplaced} people still outside the circles`);
});
if (interviewOk) interviewOk = await step('tap pairs to draw who-knows-whom ties', async () => {
  await next();
  for (const [a, b] of [['Maria', 'Lena'], ['Dad', 'Maria'], ['Kofi', 'Sam']]) {
    const pa = await personBox(a); await page.touchscreen.tap(pa.x, pa.y); await sleep(300);
    const pb = await personBox(b); await page.touchscreen.tap(pb.x, pb.y); await sleep(300);
  }
  await snap('ties');
  const lines = await page.$$eval('.iv-ties line, svg line', (ls) => ls.filter((l) => l.getBoundingClientRect().width + l.getBoundingClientRect().height > 0).length);
  if (lines < 3) throw new Error(`${lines} tie lines drawn`);
  return `${lines} lines`;
});
if (interviewOk) interviewOk = await step('finish the interview', async () => {
  for (let i = 0; i < 25; i++) {
    const labels = await page.$$eval('button', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.innerText.trim()));
    const fin = labels.find((l) => /^(Finish|Done|End the interview|Save and finish)/.test(l));
    if (fin) { await button(fin); await sleep(800); await snap('finished'); return `pressed "${fin}"`; }
    if (!labels.some((l) => l.startsWith('Next'))) throw new Error(`no Next or Finish; buttons: ${labels.slice(0, 12).join(' | ')}`);
    await next();
  }
  throw new Error('no Finish button after 25 screens');
});

// 3. Saving files (Safari hands these to the Files app).
await step('back-up prompt after the interview, passphrase in the page, saved by a tap', async () => {
  const before = await page.evaluate(() => document.body.innerText);
  if (!/Back up the interview/.test(before)) throw new Error('no back-up prompt after the finished interview');
  await button('Back up now');
  await sel('#exp1'); await page.keyboard.type('file pass 2026');
  await sel('#exp2'); await page.keyboard.type('file pass 2026');
  await button('Make the encrypted file');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Save the file'), null, { timeout: 30000 });
  await snap('backup-ready');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), button('Save the file')]);
  const p = `${OUT}${dl.suggestedFilename()}`;
  await dl.saveAs(p);
  await sleep(800);
  const after = await page.evaluate(() => document.body.innerText);
  if (/not yet backed up/i.test(after)) throw new Error('banner still says not yet backed up');
  if (dialogs.length) throw new Error(`browser dialogs used: ${dialogs.join(',')}`);
  return `${dl.suggestedFilename()}, ${statSync(p).size} bytes; no browser dialogs`;
});
await step('save the study as a file (download)', async () => {
  await nav('study');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), button('Save as a file')]);
  const p = `${OUT}${dl.suggestedFilename()}`;
  await dl.saveAs(p);
  return `${dl.suggestedFilename()}, ${statSync(p).size} bytes`;
});

// 4. Offline: reload with no network, as after Add to Home Screen.
await step('reloads and works with the network off', async () => {
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); } else await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('nav button').length > 3, null, { timeout: 20000 });
  await snap('offline');
  return `${await page.$$eval('nav button', (b) => b.length)} nav items`;
});
await step('interview still on the device after the offline reload', async () => {
  await nav('interviews');
  await sleep(600);
  const text = await page.evaluate(() => document.querySelector('.main, main')?.innerText || document.body.innerText);
  await snap('offline-interviews');
  if (/Unlock the interviews/.test(text)) {
    await sel('input[type="password"]');
    await page.keyboard.type('field ipad 2026');
    await button('Unlock');
    await sleep(1500);
  }
  const after = await page.evaluate(() => document.body.innerText);
  if (!/R-901/.test(after)) throw new Error('R-901 not listed after unlocking');
  return 'unlocked offline, R-901 listed';
});
await step('open the encrypted file back in and make a study (offline)', async () => {
  await button('Bring interviews in');
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), button('Open an interview file')]);
  const f = (await import('node:fs')).readdirSync(OUT).find((n) => n.endsWith('.egocraft-interviews'));
  await fc.setFiles(OUT + f);
  await sleep(600);
  await sel('#inc1'); await page.keyboard.type('file pass 2026');
  await button('Open');
  await sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(/(\d+) interviews \((\d+) finished\)/);
  if (!m || m[1] !== '1') throw new Error(`file not read back: ${text.match(/Opened[^\n]*|Wrong[^\n]*|passphrase[^\n]*/i)?.[0] || 'no count shown'}`);
  await button('Make a study from them');
  await sleep(1500);
  await snap('study-from-file');
  const t2 = await page.evaluate(() => document.body.innerText);
  if (!/Checks/.test(t2)) throw new Error('no study made');
  return `${m[1]} interview (${m[2]} finished) read back; study made`;
});
await step('a fresh tab opens offline too', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(URL, { waitUntil: 'load' });
  await p2.waitForFunction(() => document.querySelectorAll('button').length > 3, null, { timeout: 20000 });
  await p2.close();
});

log(errors.length === 0, 'no page errors', errors.slice(0, 8).join(' || '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots in ${OUT}`);
