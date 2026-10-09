import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

// App icon: rounded blue gradient tile with a white "photo" card
// (sun + mountains) and a white download badge overlapping its corner.
// Rendered with 4x4 supersampling so small sizes stay smooth.
// No dependencies — runs with plain Node (npm run build:icons).

const sizes = [16, 32, 48, 128];
const iconDir = new URL("../icons/", import.meta.url);
const SS = 4; // supersampling per axis

const TOP = [30, 128, 200];
const BOTTOM = [14, 90, 153];
const BLUE = [17, 103, 177];
const WHITE = [255, 255, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px;
  const cy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// Mountain silhouette inside the photo card.
function inMountains(px, py) {
  // Triangle 1: (0.20,0.66) (0.40,0.42) (0.54,0.66)
  // Triangle 2: (0.44,0.66) (0.62,0.48) (0.80,0.66)
  const inTri = (ax, ay, bx, by, cx, cy) => {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!d) return false;
    const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
    const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
    return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
  };
  return (
    inTri(0.2, 0.66, 0.4, 0.42, 0.54, 0.66) ||
    inTri(0.44, 0.66, 0.62, 0.48, 0.8, 0.66)
  );
}

function inArrow(px, py) {
  const inShaft =
    Math.abs(px - 0.7) <= 0.035 && py >= 0.575 && py <= 0.74;
  const inHead =
    py >= 0.7 && py <= 0.825 && Math.abs(px - 0.7) <= 0.095 * ((0.825 - py) / 0.125);
  return inShaft || inHead;
}

// Single subpixel sample in 0..1 space. Returns [r,g,b,a].
function sample(px, py) {
  if (!inRoundedRect(px, py, 0, 0, 1, 1, 0.225)) return [0, 0, 0, 0];

  const t = Math.min(1, Math.max(0, py));
  let rgb = TOP.map((c, i) => Math.round(c + (BOTTOM[i] - c) * t));

  const CARD = [0.18, 0.2, 0.82, 0.68];
  if (inRoundedRect(px, py, ...CARD, 0.09)) {
    const sunDx = px - 0.345;
    const sunDy = py - 0.345;
    if (sunDx * sunDx + sunDy * sunDy <= 0.058 * 0.058) rgb = BLUE;
    else if (py >= 0.4 && inMountains(px, py)) rgb = BLUE;
    else rgb = WHITE;
  }

  const bDx = px - 0.7;
  const bDy = py - 0.7;
  const dist = Math.sqrt(bDx * bDx + bDy * bDy);
  if (dist <= 0.215) {
    rgb = dist >= 0.215 - 0.028 ? BLUE : inArrow(px, py) ? BLUE : WHITE;
  }

  return [...rgb, 255];
}

function pixel(size, x, y) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let sy = 0; sy < SS; sy += 1) {
    for (let sx = 0; sx < SS; sx += 1) {
      const [sr, sg, sb, sa] = sample(
        (x + (sx + 0.5) / SS) / size,
        (y + (sy + 0.5) / SS) / size
      );
      r += sr;
      g += sg;
      b += sb;
      a += sa;
    }
  }
  const n = SS * SS;
  return [r / n, g / n, b / n, a / n].map(Math.round);
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) row.push(...pixel(size, x, y));
    rows.push(Buffer.from(row));
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

await mkdir(iconDir, { recursive: true });

for (const size of sizes) {
  await writeFile(new URL(`icon-${size}.png`, iconDir), png(size));
}

console.log(`Generated ${sizes.length} icons`);
