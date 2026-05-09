import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const sizes = [16, 32, 48, 128];
const iconDir = new URL("../icons/", import.meta.url);

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

function pixel(size, x, y) {
  const border = Math.max(1, Math.floor(size * 0.08));
  const trayTop = Math.floor(size * 0.62);
  const arrowCenter = size / 2;
  const arrowWidth = size * 0.32;
  const arrowTop = size * 0.18;
  const arrowBottom = size * 0.58;
  const shaftHalf = Math.max(1, Math.floor(size * 0.055));
  const inBorder = x < border || y < border || x >= size - border || y >= size - border;
  const inTray = y >= trayTop && y <= trayTop + border * 2 && x > size * 0.22 && x < size * 0.78;
  const inShaft = Math.abs(x - arrowCenter) <= shaftHalf && y >= arrowTop && y <= arrowBottom;
  const headSlope = Math.abs(x - arrowCenter) <= arrowWidth * ((y - arrowBottom) / (size * 0.2));
  const inHead = y >= arrowBottom && y <= arrowBottom + size * 0.2 && headSlope;

  if (inBorder || inTray || inShaft || inHead) return [255, 255, 255, 255];
  return [17, 103, 177, 255];
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
