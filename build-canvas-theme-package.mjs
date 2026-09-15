import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZipEntry(name, content) {
  const fileName = encoder.encode(name);
  const size = content.byteLength;
  const checksum = crc32(content);
  const local = new Uint8Array(30 + fileName.byteLength + size);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0x0800, true);
  localView.setUint16(8, 0, true);
  localView.setUint32(14, checksum, true);
  localView.setUint32(18, size, true);
  localView.setUint32(22, size, true);
  localView.setUint16(26, fileName.byteLength, true);
  local.set(fileName, 30);
  local.set(content, 30 + fileName.byteLength);

  const central = new Uint8Array(46 + fileName.byteLength);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0x0800, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint32(16, checksum, true);
  centralView.setUint32(20, size, true);
  centralView.setUint32(24, size, true);
  centralView.setUint16(28, fileName.byteLength, true);
  central.set(fileName, 46);
  return { local, central };
}

function createStoredZip(entries) {
  const parts = entries.map(([name, content]) => storedZipEntry(name, content));
  let localOffset = 0;
  for (const part of parts) {
    new DataView(part.central.buffer).setUint32(42, localOffset, true);
    localOffset += part.local.byteLength;
  }
  const centralSize = parts.reduce((total, part) => total + part.central.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, parts.length, true);
  endView.setUint16(10, parts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  const output = new Uint8Array(localOffset + centralSize + end.byteLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part.local, offset);
    offset += part.local.byteLength;
  }
  for (const part of parts) {
    output.set(part.central, offset);
    offset += part.central.byteLength;
  }
  output.set(end, offset);
  return output;
}

export async function buildCanvasThemePackage(manifestPath, outputPath) {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.kind !== 'qiansi-canvas-theme' || manifest.schemaVersion !== 1) {
    throw new Error('Theme manifest is not a supported Qiansi-Canvas schema.');
  }
  const themeJson = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(outputPath, createStoredZip([['theme.json', themeJson]]));
}

const scriptPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (scriptPath === import.meta.url) {
  const [, , manifestPath, outputPath] = process.argv;
  if (!manifestPath || !outputPath) {
    throw new Error('Usage: node build-canvas-theme-package.mjs <manifest.json> <theme.zip>');
  }
  await buildCanvasThemePackage(resolve(manifestPath), resolve(outputPath));
}
