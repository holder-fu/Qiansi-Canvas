import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BridgeImageTypePresetCatalogConflictError,
  BridgeImageTypePresetCatalogStorage,
  BridgePromptLibraryConflictError,
  BridgePromptLibraryStorage,
} from './bridge-prompt-library.mjs';

test('prompt library storage persists custom image prompts and protects revisions', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-prompt-library-'));
  try {
    const storage = new BridgePromptLibraryStorage({ dataRoot, now: () => 100 });
    assert.equal((await storage.read()).revision, 0);
    const saved = await storage.update({
      expectedRevision: 0,
      items: [{ id: 'custom-image', target: 'image', name: '图片提示词', prompt: 'cinematic' }],
      categories: ['分镜构图'],
      renames: [],
      deleted: [],
    });
    assert.equal(saved.revision, 1);
    assert.equal(saved.items[0].target, 'image');
    await assert.rejects(
      storage.update({ expectedRevision: 0, items: [], categories: [], renames: [], deleted: [] }),
      (error) => error instanceof BridgePromptLibraryConflictError && error.current.revision === 1,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test('image generation type storage preserves multiple custom prompts and protects revisions', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-image-type-presets-'));
  try {
    const storage = new BridgeImageTypePresetCatalogStorage({ dataRoot, now: () => 200 });
    assert.equal((await storage.read()).revision, 0);
    const presets = [
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
    const saved = await storage.update({
      expectedRevision: 0,
      categories: ['人物表情'],
      presets,
    });
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.presets, presets);
    assert.deepEqual((await storage.read()).presets, presets);
    await assert.rejects(
      storage.update({ expectedRevision: 0, categories: [], presets: [] }),
      (error) =>
        error instanceof BridgeImageTypePresetCatalogConflictError && error.current.revision === 1,
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
