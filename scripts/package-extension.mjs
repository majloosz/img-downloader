import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = join(projectRoot, "dist");
const zipPath = join(outputDir, "simple-image-downloader.zip");
const packageEntries = [
  "manifest.json",
  "src",
  "icons",
  "README.md",
  "PRIVACY.md",
  "STORE_LISTING.md"
];

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

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function localHeader(name, data, metadata) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(metadata.dosTime, 10);
  header.writeUInt16LE(metadata.dosDate, 12);
  header.writeUInt32LE(metadata.crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer, data]);
}

function centralHeader(name, data, metadata, offset) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(metadata.dosTime, 12);
  header.writeUInt16LE(metadata.dosDate, 14);
  header.writeUInt32LE(metadata.crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endRecord(entryCount, centralSize, centralOffset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

async function collectFiles(entry, files = []) {
  const absolute = join(projectRoot, entry);
  const info = await stat(absolute);

  if (info.isDirectory()) {
    const children = await readdir(absolute);
    for (const child of children) {
      await collectFiles(join(entry, child), files);
    }
    return files;
  }

  files.push({
    absolute,
    name: relative(projectRoot, absolute).split(sep).join("/")
  });
  return files;
}

async function createZip() {
  const files = [];
  for (const entry of packageEntries) {
    await collectFiles(entry, files);
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const data = await readFile(file.absolute);
    const { mtime } = await stat(file.absolute);
    const metadata = {
      ...dosDateTime(mtime),
      crc: crc32(data)
    };
    const local = localHeader(file.name, data, metadata);
    const central = centralHeader(file.name, data, metadata, offset);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = endRecord(files.length, centralDirectory.length, offset);
  await mkdir(outputDir, { recursive: true });
  await rm(zipPath, { force: true });
  await writeFile(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
  console.log(`Created ${zipPath}`);
}

await createZip();
