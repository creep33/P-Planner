// Renders the stopwatch icon to extension/icons/*.png and the padded Web Store icon, with no dependencies.
// Usage: node scripts/make-icons.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'extension', 'icons');
const STORE_OUT = join(ROOT, 'store', 'assets');
const ACCENT = [79, 70, 229];
const WHITE = [255, 255, 255];
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling per axis

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Shape in a 128x128 design space; returns an RGB colour or null (transparent).
function shade(x, y) {
  const cx = 64;
  const cy = 72;
  const r = Math.hypot(x - cx, y - cy);
  const angle = -Math.PI / 3;
  let c = null;
  if (x >= 54 && x <= 74 && y >= 4 && y <= 22) c = ACCENT; // crown
  if (segDist(x, y, 100, 30, 108, 22) <= 5) c = ACCENT; // side button
  if (r <= 54) c = ACCENT;
  if (r <= 41) c = WHITE;
  if (segDist(x, y, cx, cy, cx + 30 * Math.cos(angle), cy + 30 * Math.sin(angle)) <= 5) c = ACCENT;
  if (r <= 8) c = ACCENT;
  return c;
}

// pad: transparent margin in output pixels (Web Store wants 96px artwork inside 128px).
function render(size, pad = 0) {
  const px = Buffer.alloc(size * size * 4);
  const scale = 128 / (size - 2 * pad);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const dx = (x - pad + (sx + 0.5) / SS) * scale;
          const dy = (y - pad + (sy + 0.5) / SS) * scale;
          const c = dx < 0 || dy < 0 || dx > 128 || dy > 128 ? null : shade(dx, dy);
          if (!c) continue;
          n++;
          for (let i = 0; i < 3; i++) sum[i] += c[i];
        }
      }
      const o = (y * size + x) * 4;
      if (n) for (let i = 0; i < 3; i++) px[o + i] = Math.round(sum[i] / n);
      px[o + 3] = Math.round((255 * n) / (SS * SS));
    }
  }
  return px;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT, `icon${size}.png`), png(size, render(size)));
  console.log(`icon${size}.png`);
}

mkdirSync(STORE_OUT, { recursive: true });
writeFileSync(join(STORE_OUT, 'store-icon-128.png'), png(128, render(128, 16)));
console.log('store-icon-128.png');
