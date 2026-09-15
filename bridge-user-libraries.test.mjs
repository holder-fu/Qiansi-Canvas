import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BridgeUserLibrariesConflictError,
  BridgeUserLibrariesStorage,
} from './bridge-user-libraries.mjs';

test('user libraries persist metadata for all library kinds with revision protection', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-user-libraries-'));
  try {
    const storage = new BridgeUserLibrariesStorage({ dataRoot, now: () => 100 });
    const initial = await storage.read();
    assert.equal(initial.revision, 0);
    assert.deepEqual(initial.libraries.style.presets, []);
    const saved = await storage.update({
      expectedRevision: 0,
      libraries: {
        style: { presets: [{ id: 'style-1', title: '新风格' }] },
        effect: {
          presets: [{ id: 'effect-1', title: '新特效', previewUrl: '/media/effect.webp' }],
        },
        character: { presets: [{ id: 'character-1', title: '新角色' }] },
        camera: { presets: [{ id: 'camera-1', title: '新运镜', prompt: '缓慢推进' }] },
      },
    });
    assert.equal(saved.revision, 1);
    assert.equal(saved.libraries.effect.presets[0].previewUrl, '/media/effect.webp');
    assert.equal(saved.libraries.camera.presets[0].prompt, '缓慢推进');
    await assert.rejects(
      storage.update({ expectedRevision: 0, libraries: {} }),
      (error) => error instanceof BridgeUserLibrariesConflictError && error.current.revision === 1,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
