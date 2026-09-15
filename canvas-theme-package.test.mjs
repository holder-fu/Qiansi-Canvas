import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function readStoredThemePackage(fileName) {
  const bytes = await readFile(new URL(`./data/canvas-themes/${fileName}`, import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(8, true), 0, 'theme entry must use the supported stored method');
  const size = view.getUint32(18, true);
  assert.equal(size, view.getUint32(22, true));
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
  assert.equal(name, 'theme.json');
  const start = 30 + nameLength + extraLength;
  const content = bytes.subarray(start, start + size);
  assert.equal(crc32(content), view.getUint32(14, true));
  return JSON.parse(new TextDecoder().decode(content));
}

test('bundled macOS theme is a stored, checksummed and safe install package', async () => {
  const manifest = await readStoredThemePackage('Qiansi-macOS-Dark.zip');
  assert.equal(manifest.kind, 'qiansi-canvas-theme');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.name, 'macOS 深色玻璃');
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.tokens.interfaceStyle, 'macos');
  assert.equal(manifest.tokens.cursorStyle, 'macos');
  assert.equal(manifest.tokens.canvas, '#151517');
  assert.equal(manifest.tokens.card, '#242426');
  assert.equal(manifest.tokens.panel, '#1c1c1e');
  assert.equal(manifest.tokens.accent, '#0a84ff');
  assert.equal('css' in manifest, false);
  assert.equal('scripts' in manifest, false);
});

test('bundled Dream Pink theme is a stored, checksummed and safe install package', async () => {
  const manifest = await readStoredThemePackage('Qiansi-Dream-Pink.zip');
  assert.equal(manifest.kind, 'qiansi-canvas-theme');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.name, '绯梦紫粉');
  assert.equal(manifest.version, '1.1.0');
  assert.equal(
    manifest.description,
    '低亮度灰紫画布与面板、莓粉强调、柔和分层与甜心圆角组成的舒适全局风格。',
  );
  assert.equal(manifest.tokens.interfaceStyle, 'dream-pink');
  assert.equal(manifest.tokens.cursorStyle, 'system');
  assert.equal(manifest.tokens.canvas, '#403443');
  assert.equal(manifest.tokens.card, '#58435e');
  assert.equal(manifest.tokens.panel, '#4b3952');
  assert.equal(manifest.tokens.edge, '#715978');
  assert.equal(manifest.tokens.edgeStrong, '#a77eaa');
  assert.equal(manifest.tokens.accent, '#c978b6');
  assert.equal(manifest.tokens.grid, '#68566c');
  assert.equal(manifest.tokens.gridVisible, true);
  assert.equal(manifest.tokens.gridGap, 24);
  assert.equal(manifest.tokens.gridSize, 1);
  assert.equal('css' in manifest, false);
  assert.equal('scripts' in manifest, false);
});
