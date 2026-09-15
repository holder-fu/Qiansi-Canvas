import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BridgeGenerationLimitsConflictError,
  BridgeGenerationLimitsStorage,
} from './bridge-generation-limits.mjs';
import { DEFAULT_GENERATION_LIMITS } from './src/lib/generationLimitsContract.mjs';

test('generation limits persist atomically under data/settings and normalize unsafe values', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-generation-limits-'));
  try {
    const storage = new BridgeGenerationLimitsStorage({ dataRoot, now: () => 1234 });
    assert.deepEqual(await storage.read(), {
      version: 1,
      revision: 0,
      ...DEFAULT_GENERATION_LIMITS,
      updatedAt: 0,
    });

    const saved = await storage.update({
      limits: {
        ...DEFAULT_GENERATION_LIMITS,
        requestRateLimit: 99_999,
        generationConcurrency: 8,
        imageBatchSize: 35,
        videoGenerationConcurrency: 0,
      },
      expectedRevision: 0,
    });
    assert.equal(saved.revision, 1);
    assert.equal(saved.requestRateLimit, 20_000);
    assert.equal(saved.generationConcurrency, 8);
    assert.equal(saved.imageBatchSize, 35);
    assert.equal(saved.videoGenerationConcurrency, 1);
    assert.equal(saved.updatedAt, 1234);
    assert.deepEqual(
      JSON.parse(await readFile(join(dataRoot, 'settings', 'generation-limits.json'), 'utf8')),
      saved,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test('generation limits reject stale writers with the current snapshot', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-generation-limits-conflict-'));
  try {
    const storage = new BridgeGenerationLimitsStorage({ dataRoot });
    await storage.update({ limits: DEFAULT_GENERATION_LIMITS, expectedRevision: 0 });
    await assert.rejects(
      storage.update({
        limits: { ...DEFAULT_GENERATION_LIMITS, imageBatchSize: 30 },
        expectedRevision: 0,
      }),
      (error) =>
        error instanceof BridgeGenerationLimitsConflictError && error.current.revision === 1,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
