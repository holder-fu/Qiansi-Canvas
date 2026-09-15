import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BridgeUserProfileConflictError,
  BridgeUserProfileStorage,
  normalizeBridgeUserName,
} from './bridge-user-profile.mjs';

test('user profile persists atomically under data/settings and preserves explicit empty names', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-user-profile-'));
  try {
    const storage = new BridgeUserProfileStorage({ dataRoot, now: () => 1234 });
    assert.deepEqual(await storage.read(), {
      version: 1,
      revision: 0,
      userName: '',
      updatedAt: 0,
    });

    const saved = await storage.update({ userName: '  老\u0000  树苗  ', expectedRevision: 0 });
    assert.deepEqual(saved, {
      version: 1,
      revision: 1,
      userName: '老 树苗',
      updatedAt: 1234,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(dataRoot, 'settings', 'profile.json'), 'utf8')),
      saved,
    );

    const cleared = await storage.update({ userName: '', expectedRevision: 1 });
    assert.equal(cleared.revision, 2);
    assert.equal(cleared.userName, '');
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test('user profile rejects stale writers and limits unsafe or oversized names', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-user-profile-conflict-'));
  try {
    const storage = new BridgeUserProfileStorage({ dataRoot });
    await storage.update({ userName: 'holder', expectedRevision: 0 });
    await assert.rejects(
      storage.update({ userName: 'stale', expectedRevision: 0 }),
      (error) =>
        error instanceof BridgeUserProfileConflictError && error.current.userName === 'holder',
    );
    assert.equal(normalizeBridgeUserName('a'.repeat(80)).length, 60);
    assert.equal((await storage.read()).userName, 'holder');
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
