import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PluginSharedStyleCoverConflictError,
  PluginSharedStyleCoverFileStore,
} from './plugin-style-cover-storage.mjs';

function fakeWebp(width = 640, height = 360) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

const WEBP_BYTES = fakeWebp();

async function withStore(operation) {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-style-covers-'));
  const pluginDirectory = join(root, 'Novel-to-video');
  try {
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(
      join(pluginDirectory, 'plugin.json'),
      JSON.stringify({ id: 'novel-video' }),
      'utf8',
    );
    const store = new PluginSharedStyleCoverFileStore({ pluginsRoot: root });
    await store.registerPluginDirectory('novel-video', pluginDirectory);
    return await operation(store, pluginDirectory, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function cover() {
  return {
    dataUrl: `data:image/webp;base64,${WEBP_BYTES.toString('base64')}`,
    fileName: '封面.webp',
    width: 640,
    height: 360,
  };
}

test('stores a shared cover only in the validated style directory and survives restart', async () => {
  await withStore(async (store, pluginDirectory, root) => {
    const saved = await store.write('novel-video', 'style-demo', cover(), 0);
    assert.equal(saved.revision, 1);
    assert.equal(saved.mimeType, 'image/webp');
    assert.equal(saved.dataUrl, cover().dataUrl);

    const directory = join(pluginDirectory, 'project-data', 'shared-style-covers', 'style-demo');
    assert.deepEqual(await readFile(join(directory, 'cover.webp')), WEBP_BYTES);
    const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
    assert.equal(metadata.pluginId, 'novel-video');
    assert.equal(metadata.styleId, 'style-demo');
    assert.equal(metadata.dataUrl, undefined);

    const restarted = new PluginSharedStyleCoverFileStore({ pluginsRoot: root });
    await restarted.registerPluginDirectory('novel-video', pluginDirectory);
    assert.deepEqual(await restarted.read('novel-video', 'style-demo'), saved);
  });
});

test('enforces CAS and keeps the current shared cover on a stale write', async () => {
  await withStore(async (store, pluginDirectory, root) => {
    await store.write('novel-video', 'style-demo', cover(), 0);
    const secondStore = new PluginSharedStyleCoverFileStore({ pluginsRoot: root });
    await secondStore.registerPluginDirectory('novel-video', pluginDirectory);
    const results = await Promise.allSettled([
      store.write('novel-video', 'style-demo', { ...cover(), fileName: 'cover-a.webp' }, 1),
      secondStore.write('novel-video', 'style-demo', { ...cover(), fileName: 'cover-b.webp' }, 1),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    const rejected = results.find((item) => item.status === 'rejected');
    assert.ok(rejected?.reason instanceof PluginSharedStyleCoverConflictError);
    assert.equal(rejected.reason.currentRevision, 2);
  });
});

test('rejects paths, non-WebP payloads, oversize dimensions, and stale deletes', async () => {
  await withStore(async (store) => {
    await assert.rejects(store.write('novel-video', '../outside', cover(), 0), /风格标识无效/);
    await assert.rejects(
      store.write('novel-video', 'style-demo', { ...cover(), fileName: '../cover.webp' }, 0),
      /文件名无效/,
    );
    await assert.rejects(
      store.write(
        'novel-video',
        'style-demo',
        { ...cover(), dataUrl: 'data:image/webp;base64,AAAA' },
        0,
      ),
      /不是有效的 WebP/,
    );
    await assert.rejects(
      store.write('novel-video', 'style-demo', { ...cover(), width: 1601 }, 0),
      /尺寸无效/,
    );
    await assert.rejects(
      store.write('novel-video', 'style-demo', { ...cover(), width: 639 }, 0),
      /声明尺寸与 WebP 内容不一致/,
    );
    const saved = await store.write('novel-video', 'style-demo', cover(), 0);
    await assert.rejects(
      store.delete('novel-video', 'style-demo', 0),
      PluginSharedStyleCoverConflictError,
    );
    assert.deepEqual(await store.read('novel-video', 'style-demo'), saved);
    assert.deepEqual(await store.delete('novel-video', 'style-demo', saved.revision), {
      deleted: true,
    });
    assert.equal(await store.read('novel-video', 'style-demo'), null);
  });
});
