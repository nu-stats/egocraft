// Draws EgoCraft's icon (the same shapes as public/icon.svg) as a 256 px PNG
// for the Pinokio launcher: node scripts/make-icon.mjs ../icon.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const S = 256;
const k = S / 64;
const px = new Uint8Array(S * S * 4);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Paint every pixel whose sample points fall inside `inside(u, v)` (in 64-unit icon space), 4x4 supersampled. */
function paint(inside, box, color) {
  const [cr, cg, cb] = hex(color);
  const [x0, y0, x1, y1] = box.map((v) => Math.max(0, Math.min(S, Math.round(v * k))));
  for (let py = y0; py < y1; py++)
    for (let qx = x0; qx < x1; qx++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside((qx + (sx + 0.5) / 4) / k, (py + (sy + 0.5) / 4) / k)) hit++;
      if (!hit) continue;
      const a = hit / 16;
      const i = (py * S + qx) * 4;
      const da = px[i + 3] / 255;
      const oa = a + da * (1 - a);
      px[i] = Math.round((cr * a + px[i] * da * (1 - a)) / oa);
      px[i + 1] = Math.round((cg * a + px[i + 1] * da * (1 - a)) / oa);
      px[i + 2] = Math.round((cb * a + px[i + 2] * da * (1 - a)) / oa);
      px[i + 3] = Math.round(oa * 255);
    }
}

const roundRect = (x, y, w, h, r, c) =>
  paint((u, v) => {
    const dx = Math.max(x + r - u, 0, u - (x + w - r));
    const dy = Math.max(y + r - v, 0, v - (y + h - r));
    return u >= x && u <= x + w && v >= y && v <= y + h && dx * dx + dy * dy <= r * r;
  }, [x, y, x + w, y + h], c);
const circle = (cx, cy, r, c) => paint((u, v) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r, [cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], c);
function line(x1, y1, x2, y2, width, c) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  paint((u, v) => {
    const t = Math.max(0, Math.min(1, ((u - x1) * (x2 - x1) + (v - y1) * (y2 - y1)) / (L * L)));
    return Math.hypot(u - (x1 + t * (x2 - x1)), v - (y1 + t * (y2 - y1))) <= width / 2;
  }, [Math.min(x1, x2) - width, Math.min(y1, y2) - width, Math.max(x1, x2) + width, Math.max(y1, y2) + width], c);
}

roundRect(0, 0, 64, 64, 14, '#123047');
const alters = [[32, 13], [50, 25], [46, 48], [18, 48], [14, 25]];
for (const [x, y] of alters) line(32, 32, x, y, 2.5, '#7fb8d8');
line(32, 13, 50, 25, 3, '#E69F00');
line(46, 48, 18, 48, 3, '#E69F00');
for (const [x, y] of alters) circle(x, y, 5, '#ffffff');
circle(32, 32, 7, '#E69F00');

// PNG: RGBA, no filter.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) Buffer.from(px.subarray(y * S * 4, (y + 1) * S * 4)).copy(raw, y * (S * 4 + 1) + 1);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(process.argv[2] ?? 'icon.png', png);
console.log(`Wrote ${process.argv[2] ?? 'icon.png'}`);
