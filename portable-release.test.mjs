import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PORTABLE_RELEASE_KIND,
  PORTABLE_RELEASE_MANIFEST,
  PORTABLE_RELEASE_SCHEMA_VERSION,
  collectProductionRuntimeClosure,
  createIntegrityFileList,
  verifyPortableRelease,
} from './scripts/portable-release-contract.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), 'qiansi-portable-test-'));
  temporaryDirectories.push(path);
  return path;
}

async function writeFixtureFile(root, relativePath, content) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

test('production Bridge closure has no npm runtime dependency', async () => {
  const closure = await collectProductionRuntimeClosure(projectRoot);
  assert.ok(closure.files.includes('local-bridge.mjs'));
  assert.ok(closure.files.includes('bridge-browser-storage.mjs'));
  assert.ok(closure.files.includes('generated-video-audio.mjs'));
  assert.ok(closure.files.includes('bridge-provider-lifecycle.mjs'));
  assert.ok(closure.files.includes('managed-audio-installer.mjs'));
  assert.ok(closure.files.includes('managed-motion-installer.mjs'));
  assert.ok(closure.files.includes('managed-motion-worker.mjs'));
  assert.ok(closure.files.includes('system-update-network.mjs'));
  assert.ok(closure.files.includes('plugin-reference-audio-library.mjs'));
  assert.ok(closure.files.includes('plugin-style-cover-storage.mjs'));
  assert.ok(closure.files.includes('src/lib/providerModelContract.mjs'));
  assert.ok(closure.files.includes('src/lib/arkCliContract.mjs'));
  assert.ok(closure.files.includes('src/lib/browserStorageContract.mjs'));
  assert.ok(closure.externalImports.length > 0);
  assert.ok(closure.externalImports.every((specifier) => specifier.startsWith('node:')));
});

test('portable integrity verification detects changed program bytes', async () => {
  const root = await temporaryDirectory();
  const required = {
    'package.json': '{"name":"qiansi-canvas","version":"0.1.0","type":"module"}\n',
    'dist/index.html': '<!doctype html><title>Qiansi</title>',
    'local-bridge.mjs': 'export const ok = true;\n',
    'update-sources.default.json': '{"version":1,"sources":[]}\n',
    'tools/runtime/node/windows/node.exe': 'fixture-node',
    'tools/runtime/node/windows/LICENSE': 'fixture-license',
  };
  for (const [path, content] of Object.entries(required))
    await writeFixtureFile(root, path, content);
  const files = await createIntegrityFileList(root);
  const manifest = {
    schemaVersion: PORTABLE_RELEASE_SCHEMA_VERSION,
    kind: PORTABLE_RELEASE_KIND,
    appVersion: '0.1.0',
    target: 'windows-x64',
    platform: 'win32',
    architecture: 'x64',
    nodeVersion: '22.23.2',
    bridgeEntry: 'local-bridge.mjs',
    bridgeFiles: ['local-bridge.mjs'],
    files,
  };
  await writeFile(join(root, PORTABLE_RELEASE_MANIFEST), `${JSON.stringify(manifest)}\n`);

  await verifyPortableRelease(root, { checkHost: false });
  await writeFile(join(root, 'local-bridge.mjs'), 'export const ok = false;\n');
  await assert.rejects(
    verifyPortableRelease(root, { checkHost: false }),
    /size mismatch|hash mismatch/,
  );
});

test('repository root keeps explicit Canvas and standalone Motion launch entries', async () => {
  const rootLaunchers = (await readdir(projectRoot)).filter(
    (name) => name.endsWith('.bat') || name.endsWith('.command'),
  );
  assert.deepEqual(
    rootLaunchers.sort(),
    [
      'Qiansi-Canvas-windows.bat',
      'Qiansi-Canvas-macOS.command',
      'Qiansi-Motion-Captur-windows.bat',
      '打开Qiansi-Canvas-windows.bat',
      '打开Qiansi-Canvas-macOS.command',
    ].sort(),
  );
  const launcher = await readFile(join(projectRoot, 'Qiansi-Canvas-windows.bat'), 'utf8');
  assert.doesNotMatch(launcher, /node_modules|npm(?:\.cmd)?|tsc|vite|run build/i);
  assert.match(launcher, /tools\\runtime\\node\\windows\\node\.exe/);
  assert.match(launcher, /qiansi-launcher\.mjs/);
  const macLauncher = await readFile(join(projectRoot, 'Qiansi-Canvas-macOS.command'), 'utf8');
  assert.doesNotMatch(macLauncher, /node_modules|npm(?:\.cmd)?|tsc|vite|run build/i);
  assert.match(macLauncher, /tools\/runtime\/node\/macos\/bin\/node/);
  assert.match(macLauncher, /qiansi-launcher\.mjs/);
  const compatibility = await readFile(
    join(projectRoot, 'tools', 'launchers', '启动Qiansi-Canvas.bat'),
    'utf8',
  );
  assert.match(compatibility, /Qiansi-Canvas-windows\.bat/);
});
