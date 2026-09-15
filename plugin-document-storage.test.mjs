import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PluginFileDocumentConflictError,
  PluginProjectDocumentFileStore,
} from './plugin-document-storage.mjs';

async function withStore(operation) {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-plugin-documents-'));
  try {
    return await operation(new PluginProjectDocumentFileStore({ pluginsRoot: root }), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('persists project documents inside the owning plugin directory across store restarts', async () => {
  await withStore(async (store, root) => {
    const saved = await store.write(
      'novel-video',
      'project_01',
      'studio-project.v1',
      { title: '甲' },
      0,
    );
    assert.equal(saved.revision, 1);

    const restarted = new PluginProjectDocumentFileStore({ pluginsRoot: root });
    assert.deepEqual(await restarted.read('novel-video', 'project_01', 'studio-project.v1'), saved);

    const documentDirectory = join(root, 'novel-video', 'project-data', 'project_01', 'documents');
    const files = await import('node:fs/promises').then(({ readdir }) =>
      readdir(documentDirectory),
    );
    assert.equal(files.length, 1);
    const record = JSON.parse(await readFile(join(documentDirectory, files[0]), 'utf8'));
    assert.equal(record.pluginId, 'novel-video');
    assert.equal(record.projectId, 'project_01');
    assert.equal(record.key, 'studio-project.v1');
  });
});

test('keeps revision CAS authoritative across concurrent store instances', async () => {
  await withStore(async (store, root) => {
    const secondStore = new PluginProjectDocumentFileStore({ pluginsRoot: root });
    await store.write('novel-video', 'project_01', 'draft', { value: 1 }, 0);
    const results = await Promise.allSettled([
      store.write('novel-video', 'project_01', 'draft', { value: 2 }, 1),
      secondStore.write('novel-video', 'project_01', 'draft', { value: 3 }, 1),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    const rejected = results.find((item) => item.status === 'rejected');
    assert.ok(rejected?.reason instanceof PluginFileDocumentConflictError);
    assert.equal(rejected.reason.currentRevision, 2);
  });
});

test('migrates a legacy snapshot once without overwriting a newer file record', async () => {
  await withStore(async (store) => {
    assert.deepEqual(await store.migrationStatus('novel-video', 'project_01'), {
      completed: false,
    });
    const migrated = await store.migrate('novel-video', 'project_01', {
      key: 'draft',
      value: { source: 'indexeddb' },
      revision: 7,
      updatedAt: 1_700_000_000_000,
    });
    assert.equal(migrated.migrated, true);
    await store.write('novel-video', 'project_01', 'draft', { source: 'file' }, 7);
    const replay = await store.migrate('novel-video', 'project_01', {
      key: 'draft',
      value: { source: 'stale-indexeddb' },
      revision: 7,
      updatedAt: 1_700_000_000_000,
    });
    assert.equal(replay.migrated, false);
    assert.deepEqual(replay.snapshot.value, { source: 'file' });
    assert.deepEqual(await store.completeMigration('novel-video', 'project_01', 1), {
      completed: true,
      recordCount: 1,
    });
    assert.deepEqual(await store.migrationStatus('novel-video', 'project_01'), { completed: true });
  });
});

test('rejects traversal identities and preserves documents on revision conflicts', async () => {
  await withStore(async (store) => {
    await assert.rejects(store.write('novel-video', '../outside', 'draft', {}, 0), /项目 ID 无效/);
    await assert.rejects(store.write('novel-video', 'project_01', '../draft', {}, 0), /文档键必须/);
    const saved = await store.write('novel-video', 'project_01', 'draft', { value: 1 }, 0);
    await assert.rejects(
      store.delete('novel-video', 'project_01', 'draft', 0),
      PluginFileDocumentConflictError,
    );
    assert.deepEqual(await store.read('novel-video', 'project_01', 'draft'), saved);
  });
});

test('uses a differently named installed directory only after verifying its manifest ID', async () => {
  await withStore(async (store, root) => {
    const installedDirectory = join(root, 'Novel-to-video');
    await mkdir(installedDirectory, { recursive: true });
    await writeFile(
      join(installedDirectory, 'plugin.json'),
      JSON.stringify({ id: 'novel-video' }),
      'utf8',
    );
    await store.registerPluginDirectory('novel-video', installedDirectory);
    await store.write('novel-video', 'project_01', 'draft', { value: 1 }, 0);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(
            installedDirectory,
            'project-data',
            'project_01',
            'documents',
            '7743ce348d9284d677a185f33295b92266cc435a5b5f775029b300066d26693a.json',
          ),
          'utf8',
        ),
      ).pluginId,
      'novel-video',
    );

    const otherDirectory = join(root, 'other-plugin');
    await mkdir(otherDirectory, { recursive: true });
    await writeFile(join(otherDirectory, 'plugin.json'), JSON.stringify({ id: 'other' }), 'utf8');
    await assert.rejects(store.registerPluginDirectory('novel-video', otherDirectory), /不匹配/);
  });
});
