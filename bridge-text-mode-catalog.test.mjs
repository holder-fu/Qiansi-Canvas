import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BridgeTextModeCatalogConflictError,
  BridgeTextModeCatalogStorage,
} from './bridge-text-mode-catalog.mjs';

test('text mode catalog persists custom definitions and protects revisions', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-text-modes-'));
  try {
    const storage = new BridgeTextModeCatalogStorage({ dataRoot, now: () => 100 });
    assert.deepEqual(await storage.read(), { version: 1, revision: 0, modes: [], updatedAt: 0 });
    const saved = await storage.update({
      expectedRevision: 0,
      modes: [{ value: 'custom-style', label: '同风格提示词', promptTemplate: '请复刻图片：' }],
    });
    assert.deepEqual(saved, {
      version: 1,
      revision: 1,
      modes: [{ value: 'custom-style', label: '同风格提示词', promptTemplate: '请复刻图片：' }],
      updatedAt: 100,
    });
    await assert.rejects(
      storage.update({ expectedRevision: 0, modes: [] }),
      (error) =>
        error instanceof BridgeTextModeCatalogConflictError && error.current.revision === 1,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
