import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BridgeBrowserStorage,
  BridgeBrowserStorageConflictError,
} from './bridge-browser-storage.mjs';

test('browser storage persists managed state, tombstones deletions and protects revisions', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-browser-storage-'));
  try {
    const storage = new BridgeBrowserStorage({ dataRoot, now: () => 100 });
    assert.deepEqual(await storage.read(), {
      version: 1,
      revision: 0,
      records: [],
      updatedAt: 0,
    });

    const saved = await storage.update({
      expectedRevision: 0,
      changes: [
        { key: 'kitty-canvas-agent-conversations-v1', value: '[{"id":"chat-1"}]' },
        { key: 'qiansi-canvas-themes-v1', value: '{"customThemes":[]}' },
        { key: 'kitty-canvas-api-vault-v1', value: '{"provider":{"iv":"sealed"}}' },
      ],
    });
    assert.equal(saved.revision, 1);
    assert.equal(saved.records.length, 3);

    const deleted = await storage.update({
      expectedRevision: 1,
      changes: [{ key: 'qiansi-canvas-themes-v1', value: null }],
    });
    assert.equal(deleted.revision, 2);
    assert.equal(
      deleted.records.find((record) => record.key === 'qiansi-canvas-themes-v1')?.value,
      null,
    );

    const restored = await new BridgeBrowserStorage({ dataRoot }).read();
    assert.equal(restored.revision, 2);
    assert.equal(
      restored.records.find((record) => record.key === 'kitty-canvas-agent-conversations-v1')
        ?.value,
      '[{"id":"chat-1"}]',
    );

    await assert.rejects(
      storage.update({
        expectedRevision: 0,
        changes: [{ key: 'qiansi-canvas-themes-v1', value: '{}' }],
      }),
      (error) => error instanceof BridgeBrowserStorageConflictError && error.current.revision === 2,
    );
    await assert.rejects(
      storage.update({
        expectedRevision: 2,
        changes: [{ key: 'untrusted-third-party-state', value: '{}' }],
      }),
      /不属于千丝画布受管状态/,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
