import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startBridge(dataRoot) {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let output = '';
  const child = spawn(process.execPath, ['local-bridge.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      QIANSI_CANVAS_DATA_DIR: dataRoot,
      QIANSI_CANVAS_HOST: '127.0.0.1',
      QIANSI_CANVAS_BRIDGE_PORT: String(port),
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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Bridge 提前退出：${output}`);
    try {
      const response = await fetch(`${origin}/health?session=1`, { headers: { Origin: origin } });
      if (response.ok) return { child, origin };
    } catch {
      // Startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Bridge 启动超时：${output}`);
}

async function stopBridge(child) {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
}

test(
  'Bridge host settings persist across restarts and reject stale revisions',
  { timeout: 40_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-bridge-profile-'));
    let running;
    try {
      running = await startBridge(dataRoot);
      const promptSeedResponse = await fetch(`${running.origin}/prompt-library/library.json`, {
        headers: { Origin: running.origin },
      });
      assert.equal(promptSeedResponse.status, 200);
      assert.match(promptSeedResponse.headers.get('content-type') || '', /^application\/json\b/i);
      assert.equal((await promptSeedResponse.json()).version, 1);

      const initial = await fetch(`${running.origin}/settings/profile`, {
        headers: { Origin: running.origin },
      });
      assert.equal(initial.status, 200);
      assert.deepEqual(await initial.json(), {
        profile: { version: 1, revision: 0, userName: '', updatedAt: 0 },
        writable: true,
      });

      const savedResponse = await fetch(`${running.origin}/settings/profile`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: 'holder', expectedRevision: 0 }),
      });
      assert.equal(savedResponse.status, 200);
      const saved = await savedResponse.json();
      assert.equal(saved.profile.revision, 1);
      assert.equal(saved.profile.userName, 'holder');
      assert.equal(
        JSON.parse(await readFile(join(dataRoot, 'settings', 'profile.json'), 'utf8')).userName,
        'holder',
      );

      const staleResponse = await fetch(`${running.origin}/settings/profile`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: 'stale', expectedRevision: 0 }),
      });
      assert.equal(staleResponse.status, 409);
      assert.equal((await staleResponse.json()).profile.userName, 'holder');

      const modesResponse = await fetch(`${running.origin}/settings/text-modes`, {
        headers: { Origin: running.origin },
      });
      assert.equal(modesResponse.status, 200);
      assert.deepEqual(await modesResponse.json(), {
        catalog: { version: 1, revision: 0, modes: [], updatedAt: 0 },
        writable: true,
      });
      const modesSavedResponse = await fetch(`${running.origin}/settings/text-modes`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          modes: [
            {
              key: 'custom',
              value: 'custom-review',
              label: '审校',
              description: '检查错别字',
              details: '检查文本问题',
              placeholder: '输入文本',
              promptTemplate: '请检查：',
              instruction: '检查文本。',
            },
          ],
        }),
      });
      assert.equal(modesSavedResponse.status, 200);
      assert.equal((await modesSavedResponse.json()).catalog.revision, 1);

      const promptLibraryResponse = await fetch(`${running.origin}/settings/prompt-library`, {
        headers: { Origin: running.origin },
      });
      assert.equal(promptLibraryResponse.status, 200);
      assert.deepEqual(await promptLibraryResponse.json(), {
        library: {
          version: 1,
          revision: 0,
          items: [],
          categories: [],
          renames: [],
          deleted: [],
          updatedAt: 0,
        },
        writable: true,
      });
      const promptLibrarySaved = await fetch(`${running.origin}/settings/prompt-library`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          items: [{ id: 'custom-image', target: 'image', name: '图片提示词', prompt: 'cinematic' }],
          categories: [],
          renames: [],
          deleted: [],
        }),
      });
      assert.equal(promptLibrarySaved.status, 200);
      assert.equal((await promptLibrarySaved.json()).library.revision, 1);

      const imageTypeResponse = await fetch(`${running.origin}/settings/image-type-presets`, {
        headers: { Origin: running.origin },
      });
      assert.equal(imageTypeResponse.status, 200);
      assert.deepEqual(await imageTypeResponse.json(), {
        catalog: {
          version: 1,
          revision: 0,
          categories: [],
          presets: [],
          updatedAt: 0,
        },
        writable: true,
      });
      const expressionPresets = [
        {
          id: 'custom:expression-a',
          name: '人物表情九宫格',
          category: '人物表情',
          description: '九种人物表情',
          prompt: '生成同一人物的九种连续表情。',
          builtIn: false,
        },
        {
          id: 'custom:expression-b',
          name: '人物表情特写',
          category: '人物表情',
          description: '人物表情特写',
          prompt: '生成保持人物身份一致的表情特写。',
          builtIn: false,
        },
      ];
      const imageTypeSaved = await fetch(`${running.origin}/settings/image-type-presets`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          categories: ['人物表情'],
          presets: expressionPresets,
        }),
      });
      assert.equal(imageTypeSaved.status, 200);
      const savedImageTypes = await imageTypeSaved.json();
      assert.equal(savedImageTypes.catalog.revision, 1);
      assert.deepEqual(savedImageTypes.catalog.presets, expressionPresets);

      const userLibrariesResponse = await fetch(`${running.origin}/settings/user-libraries`, {
        headers: { Origin: running.origin },
      });
      assert.equal(userLibrariesResponse.status, 200);
      const userLibraries = await userLibrariesResponse.json();
      assert.equal(userLibraries.libraries.version, 1);
      assert.equal(userLibraries.libraries.revision, 0);
      const userLibrariesSaved = await fetch(`${running.origin}/settings/user-libraries`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          libraries: {
            style: { presets: [{ id: 'style-1', kind: 'style', title: '风格' }] },
            effect: { presets: [{ id: 'effect-1', kind: 'effect', title: '特效' }] },
            character: { presets: [{ id: 'character-1', kind: 'character', title: '角色' }] },
          },
        }),
      });
      assert.equal(userLibrariesSaved.status, 200);
      assert.equal((await userLibrariesSaved.json()).libraries.revision, 1);

      const browserStorageResponse = await fetch(`${running.origin}/settings/browser-storage`, {
        headers: { Origin: running.origin },
      });
      assert.equal(browserStorageResponse.status, 200);
      assert.deepEqual(await browserStorageResponse.json(), {
        storage: { version: 1, revision: 0, records: [], updatedAt: 0 },
        writable: true,
      });
      const browserStorageSaved = await fetch(`${running.origin}/settings/browser-storage`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          changes: [
            { key: 'kitty-canvas-agent-conversations-v1', value: '[{"id":"chat-1"}]' },
            { key: 'qiansi-canvas-themes-v1', value: '{"customThemes":[]}' },
            { key: 'kitty-canvas-api-vault-v1', value: '{"sealed":true}' },
          ],
        }),
      });
      assert.equal(browserStorageSaved.status, 200);
      assert.equal((await browserStorageSaved.json()).storage.revision, 1);

      const staleBrowserStorage = await fetch(`${running.origin}/settings/browser-storage`, {
        method: 'PATCH',
        headers: { Origin: running.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          changes: [{ key: 'qiansi-canvas-themes-v1', value: '{}' }],
        }),
      });
      assert.equal(staleBrowserStorage.status, 409);

      await stopBridge(running.child);
      running = await startBridge(dataRoot);
      const restored = await fetch(`${running.origin}/settings/profile`, {
        headers: { Origin: running.origin },
      });
      assert.equal(restored.status, 200);
      assert.equal((await restored.json()).profile.userName, 'holder');
      const restoredModes = await fetch(`${running.origin}/settings/text-modes`, {
        headers: { Origin: running.origin },
      });
      assert.equal(restoredModes.status, 200);
      assert.equal((await restoredModes.json()).catalog.revision, 1);
      const restoredPromptLibrary = await fetch(`${running.origin}/settings/prompt-library`, {
        headers: { Origin: running.origin },
      });
      assert.equal(restoredPromptLibrary.status, 200);
      assert.equal((await restoredPromptLibrary.json()).library.revision, 1);
      const restoredImageTypes = await fetch(`${running.origin}/settings/image-type-presets`, {
        headers: { Origin: running.origin },
      });
      assert.equal(restoredImageTypes.status, 200);
      const restoredImageTypePayload = await restoredImageTypes.json();
      assert.equal(restoredImageTypePayload.catalog.revision, 1);
      assert.deepEqual(restoredImageTypePayload.catalog.presets, expressionPresets);
      const restoredUserLibraries = await fetch(`${running.origin}/settings/user-libraries`, {
        headers: { Origin: running.origin },
      });
      assert.equal(restoredUserLibraries.status, 200);
      const restoredLibraryPayload = await restoredUserLibraries.json();
      assert.equal(restoredLibraryPayload.libraries.revision, 1);
      assert.equal(restoredLibraryPayload.libraries.libraries.effect.presets[0].title, '特效');
      const restoredBrowserStorage = await fetch(`${running.origin}/settings/browser-storage`, {
        headers: { Origin: running.origin },
      });
      assert.equal(restoredBrowserStorage.status, 200);
      const restoredBrowserStoragePayload = await restoredBrowserStorage.json();
      assert.equal(restoredBrowserStoragePayload.storage.revision, 1);
      assert.equal(
        restoredBrowserStoragePayload.storage.records.find(
          (record) => record.key === 'kitty-canvas-agent-conversations-v1',
        )?.value,
        '[{"id":"chat-1"}]',
      );
    } finally {
      if (running?.child) await stopBridge(running.child);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);
