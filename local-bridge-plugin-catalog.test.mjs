import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

function startBridge(dataRoot, port) {
  let output = '';
  const child = spawn(process.execPath, ['local-bridge.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      QIANSI_CANVAS_DATA_DIR: dataRoot,
      QIANSI_CANVAS_BRIDGE_PORT: String(port),
      QIANSI_CANVAS_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

async function waitForBridge(origin, bridge) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (bridge.child.exitCode !== null) throw new Error(`Bridge 提前退出：${bridge.output()}`);
    try {
      const response = await fetch(`${origin}/health`, { headers: { Origin: origin } });
      if (response.ok) return;
    } catch {
      // Startup is asynchronous.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Bridge 启动超时：${bridge.output()}`);
}

async function stopBridge(bridge) {
  if (bridge.child.exitCode === null) bridge.child.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (bridge.child.exitCode !== null) resolveExit();
    else bridge.child.once('exit', resolveExit);
  });
}

test(
  'Bridge ignores project-data-only plugin aliases without hiding malformed plugin installs',
  { timeout: 30_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-plugin-catalog-'));
    const pluginRoot = join(dataRoot, 'plugins', 'Novel-to-video');
    const aliasRoot = join(dataRoot, 'plugins', 'qiansi-novel-video-studio');
    const brokenRoot = join(dataRoot, 'plugins', 'broken-plugin');
    await mkdir(pluginRoot, { recursive: true });
    await mkdir(join(aliasRoot, 'project-data', 'main-canvas'), { recursive: true });
    await mkdir(brokenRoot, { recursive: true });
    await writeFile(
      join(pluginRoot, 'plugin.json'),
      JSON.stringify({
        schemaVersion: 2,
        id: 'qiansi-novel-video-studio',
        name: 'Novel Production Desk',
        version: '1.0.0',
        engine: { qiansiCanvas: '>=1.50.0' },
        runtime: { entry: 'runtime.js', apiVersion: 2 },
        permissions: ['media:transform'],
        assets: [],
        contributes: {
          nodes: [],
          panels: [
            {
              id: 'studio',
              label: 'Studio',
              position: 'fullscreen',
              view: 'studio',
              width: 1200,
              height: 900,
            },
          ],
          menus: [],
        },
      }),
      'utf8',
    );
    await writeFile(join(pluginRoot, 'runtime.js'), 'globalThis.qiansiPlugin = true;', 'utf8');
    await writeFile(join(brokenRoot, 'runtime.js'), 'globalThis.brokenPlugin = true;', 'utf8');

    let bridge;
    try {
      const port = await availablePort();
      const origin = `http://127.0.0.1:${port}`;
      bridge = startBridge(dataRoot, port);
      await waitForBridge(origin, bridge);

      const response = await fetch(`${origin}/plugins`, { headers: { Origin: origin } });
      const catalog = await response.json();
      const packageVersion = JSON.parse(
        await readFile(new URL('./package.json', import.meta.url), 'utf8'),
      ).version;
      const healthResponse = await fetch(`${origin}/health?session=1`, {
        headers: { Origin: origin },
      });
      const health = await healthResponse.json();
      assert.equal(response.status, 200, JSON.stringify(catalog));
      assert.equal(catalog.canvasVersion, packageVersion);
      assert.equal(catalog.bridgeVersion, packageVersion);
      assert.equal(healthResponse.status, 200, JSON.stringify(health));
      assert.equal(health.version, packageVersion);
      assert.equal(health.canvasVersion, packageVersion);
      assert.equal(health.bridgeVersion, packageVersion);
      assert.equal(catalog.plugins.length, 1, JSON.stringify(catalog));
      assert.equal(catalog.plugins[0].manifest.id, 'qiansi-novel-video-studio');
      assert.deepEqual(catalog.plugins[0].manifest.permissions, ['media:transform']);
      assert.equal(
        catalog.errors.some((error) => error.directory === aliasRoot),
        false,
      );
      assert.equal(
        catalog.errors.some(
          (error) => error.directory === brokenRoot && /ENOENT/.test(error.message),
        ),
        true,
      );
    } finally {
      if (bridge) await stopBridge(bridge);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Bridge discovers the installed Novel Production Desk manifest without an audio generator',
  { timeout: 30_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-novel-plugin-catalog-'));
    const pluginRoot = join(dataRoot, 'plugins', 'Novel-to-video');
    const manifest = JSON.parse(
      await readFile(new URL('./data/plugins/Novel-to-video/plugin.json', import.meta.url), 'utf8'),
    );
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(join(pluginRoot, 'plugin.json'), JSON.stringify(manifest), 'utf8');
    await writeFile(
      join(pluginRoot, manifest.runtime.entry),
      'globalThis.qiansiPlugin = true;',
      'utf8',
    );
    for (const asset of manifest.assets) {
      await writeFile(join(pluginRoot, asset), '', 'utf8');
    }
    await writeFile(
      join(dataRoot, 'plugin-state.json'),
      JSON.stringify({
        schemaVersion: 1,
        enabled: { 'qiansi-novel-video-studio': true },
      }),
      'utf8',
    );

    let bridge;
    try {
      const port = await availablePort();
      const origin = `http://127.0.0.1:${port}`;
      bridge = startBridge(dataRoot, port);
      await waitForBridge(origin, bridge);

      const response = await fetch(`${origin}/plugins`, { headers: { Origin: origin } });
      const catalog = await response.json();
      assert.equal(response.status, 200, JSON.stringify(catalog));
      assert.equal(catalog.errors.length, 0, JSON.stringify(catalog));
      assert.equal(catalog.plugins.length, 1, JSON.stringify(catalog));
      assert.equal(catalog.plugins[0].manifest.id, 'qiansi-novel-video-studio');
      assert.equal(catalog.plugins[0].manifest.version, manifest.version);
      assert.deepEqual(catalog.plugins[0].manifest.contributes.audioGenerators, []);
      assert.ok(catalog.plugins[0].manifest.permissions.includes('audio:reference-library'));
      assert.equal(catalog.plugins[0].enabled, true);
      assert.equal(catalog.plugins[0].compatible, true);
    } finally {
      if (bridge) await stopBridge(bridge);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);
