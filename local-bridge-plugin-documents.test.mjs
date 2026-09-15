import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

async function post(origin, action, body) {
  const response = await fetch(`${origin}/plugins/project-documents/${action}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

async function postStyleCover(origin, action, body) {
  const response = await fetch(`${origin}/plugins/shared-style-covers/${action}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

test(
  'Bridge stores plugin project documents in the plugin directory and keeps CAS after restart',
  { timeout: 60_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-plugin-file-documents-'));
    const pluginId = 'novel-video';
    const projectId = 'project_01';
    const pluginRoot = join(dataRoot, 'plugins', 'Novel-to-video');
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(
      join(pluginRoot, 'plugin.json'),
      JSON.stringify({
        schemaVersion: 2,
        id: pluginId,
        name: 'Novel Video Test',
        version: '1.0.0',
        engine: { qiansiCanvas: '>=1.0.0' },
        runtime: { entry: 'runtime.js', apiVersion: 2 },
        permissions: ['storage:project-documents', 'storage:shared-style-covers'],
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
        },
      }),
      'utf8',
    );
    await writeFile(join(pluginRoot, 'runtime.js'), 'globalThis.qiansiPlugin = true;', 'utf8');
    await writeFile(
      join(dataRoot, 'plugin-state.json'),
      JSON.stringify({ schemaVersion: 1, enabled: { [pluginId]: true } }),
      'utf8',
    );

    let bridge;
    try {
      let port = await availablePort();
      let origin = `http://127.0.0.1:${port}`;
      bridge = startBridge(dataRoot, port);
      await waitForBridge(origin, bridge);

      const status = await post(origin, 'status', { pluginId, projectId });
      assert.equal(status.response.status, 200, JSON.stringify(status.payload));
      assert.equal(status.payload.completed, false);
      const migrated = await post(origin, 'migrate', {
        pluginId,
        projectId,
        snapshot: {
          key: 'studio-project.v1',
          value: { title: '旧项目' },
          revision: 4,
          updatedAt: 1_700_000_000_000,
        },
      });
      assert.equal(migrated.response.status, 200, JSON.stringify(migrated.payload));
      await post(origin, 'complete-migration', { pluginId, projectId, recordCount: 1 });
      const saved = await post(origin, 'write', {
        pluginId,
        projectId,
        key: 'studio-project.v1',
        value: { title: '文件项目' },
        expectedRevision: 4,
      });
      assert.equal(saved.response.status, 200, JSON.stringify(saved.payload));
      assert.equal(saved.payload.revision, 5);
      const webp = Buffer.alloc(30);
      webp.write('RIFF', 0, 'ascii');
      webp.writeUInt32LE(22, 4);
      webp.write('WEBP', 8, 'ascii');
      webp.write('VP8X', 12, 'ascii');
      webp.writeUInt32LE(10, 16);
      webp.writeUIntLE(639, 24, 3);
      webp.writeUIntLE(359, 27, 3);
      const coverDataUrl = `data:image/webp;base64,${webp.toString('base64')}`;
      const savedCover = await postStyleCover(origin, 'write', {
        pluginId,
        styleId: 'style-demo',
        cover: { dataUrl: coverDataUrl, fileName: 'cover.webp', width: 640, height: 360 },
        expectedRevision: 0,
      });
      assert.equal(savedCover.response.status, 200, JSON.stringify(savedCover.payload));
      assert.equal(savedCover.payload.revision, 1);

      await stopBridge(bridge);
      bridge = undefined;
      port = await availablePort();
      origin = `http://127.0.0.1:${port}`;
      bridge = startBridge(dataRoot, port);
      await waitForBridge(origin, bridge);
      const restored = await post(origin, 'read', {
        pluginId,
        projectId,
        key: 'studio-project.v1',
      });
      assert.equal(restored.response.status, 200, JSON.stringify(restored.payload));
      assert.deepEqual(restored.payload.value, { title: '文件项目' });
      assert.equal(restored.payload.revision, 5);
      const restoredCover = await postStyleCover(origin, 'read', {
        pluginId,
        styleId: 'style-demo',
      });
      assert.equal(restoredCover.response.status, 200, JSON.stringify(restoredCover.payload));
      assert.equal(restoredCover.payload.dataUrl, coverDataUrl);
      assert.equal(restoredCover.payload.revision, 1);

      const conflict = await post(origin, 'write', {
        pluginId,
        projectId,
        key: 'studio-project.v1',
        value: { title: '过期写入' },
        expectedRevision: 4,
      });
      assert.equal(conflict.response.status, 409);
      assert.equal(conflict.payload.currentRevision, 5);

      const documentDirectory = join(pluginRoot, 'project-data', projectId, 'documents');
      const files = await readdir(documentDirectory);
      assert.equal(files.length, 1);
      const record = JSON.parse(await readFile(join(documentDirectory, files[0]), 'utf8'));
      assert.equal(record.pluginId, pluginId);
      assert.equal(record.projectId, projectId);
      assert.equal(record.key, 'studio-project.v1');
      assert.deepEqual(JSON.parse(record.json), { title: '文件项目' });
      const coverDirectory = join(pluginRoot, 'project-data', 'shared-style-covers', 'style-demo');
      assert.deepEqual(await readFile(join(coverDirectory, 'cover.webp')), webp);
      const coverMetadata = JSON.parse(
        await readFile(join(coverDirectory, 'metadata.json'), 'utf8'),
      );
      assert.equal(coverMetadata.styleId, 'style-demo');
      assert.equal('dataUrl' in coverMetadata, false);
    } finally {
      if (bridge) await stopBridge(bridge);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);
