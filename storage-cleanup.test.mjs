import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyStorageCleanupCandidates,
  buildStorageCleanupPlan,
  listStorageCleanupCandidates,
} from './storage-cleanup.mjs';

async function writeOldFile(path, content, modifiedAt) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
  const date = new Date(modifiedAt);
  await utimes(path, date, date);
}

test('扫描只返回未引用且超过保护期的受管文件', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-cleanup-scan-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true }));
  const now = Date.now();
  const old = now - 2 * 60 * 60 * 1_000;

  await mkdir(join(dataRoot, 'asset-library'), { recursive: true });
  await writeFile(
    join(dataRoot, 'asset-library', 'library.json'),
    JSON.stringify({
      items: [
        { fileName: 'demo/image/indexed.png' },
        { url: '/output/asset-linked.mp4' },
        {
          id: 'asset_canvas_image',
          fileName: 'demo/image/canvas-copy.png',
          originalName: 'canvas-node-original.png',
        },
        {
          id: 'asset_unreferenced_image',
          fileName: 'demo/image/unreferenced-copy.png',
          originalName: 'unreferenced-original.png',
        },
        {
          id: 'asset_live_canvas_image',
          fileName: 'demo/image/live-canvas-copy.png',
          originalName: 'live-canvas-original.png',
        },
      ],
    }),
  );
  await writeOldFile(
    join(dataRoot, 'asset-library', 'files', 'demo', 'image', 'indexed.png'),
    'indexed',
    old,
  );
  await writeOldFile(
    join(dataRoot, 'asset-library', 'files', 'demo', 'image', 'orphan.png'),
    'orphan',
    old,
  );

  const referencedPreview = 'preview_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp';
  const livePreview = 'preview_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp';
  const orphanPreview = 'preview_cccccccccccccccccccccccccccccccc.webp';
  const freshPreview = 'preview_dddddddddddddddddddddddddddddddd.webp';
  const settingsPreview = 'preview_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.webp';
  const currentOrphanPreview = 'preview_ffffffffffffffffffffffffffffffff.webp';
  for (const name of [referencedPreview, livePreview, orphanPreview]) {
    await writeOldFile(join(dataRoot, 'media-preview-cache', name), name, old);
  }
  for (const name of [settingsPreview, currentOrphanPreview]) {
    await writeOldFile(join(dataRoot, 'asset-library', 'previews', name), name, old);
  }
  await writeOldFile(join(dataRoot, 'media-preview-cache', freshPreview), 'fresh', now);

  await mkdir(join(dataRoot, 'settings'), { recursive: true });
  await writeFile(
    join(dataRoot, 'settings', 'prompt-library.json'),
    JSON.stringify({ items: [{ thumbnailUrl: `/media-preview/files/${settingsPreview}` }] }),
  );

  const referencedOutput = 'gen-referenced.mp4';
  const assetLinkedOutput = 'asset-linked.mp4';
  const assetReferencedOutput = 'canvas-node-original.png';
  const liveAssetReferencedOutput = 'live-canvas-original.png';
  const unreferencedAssetOutput = 'unreferenced-original.png';
  const orphanOutput = 'gen-orphan.mp4';
  await writeOldFile(join(dataRoot, 'cli-image-output', referencedOutput), 'video', old);
  await writeOldFile(join(dataRoot, 'cli-image-output', assetLinkedOutput), 'video', old);
  await writeOldFile(join(dataRoot, 'cli-image-output', assetReferencedOutput), 'image', old);
  await writeOldFile(join(dataRoot, 'cli-image-output', liveAssetReferencedOutput), 'image', old);
  await writeOldFile(join(dataRoot, 'cli-image-output', unreferencedAssetOutput), 'image', old);
  await writeOldFile(join(dataRoot, 'cli-image-output', orphanOutput), 'video', old);
  await writeOldFile(join(dataRoot, 'media-preview-cache', 'stopped.upload'), 'temporary', old);

  await mkdir(join(dataRoot, 'projects', 'demo', 'snapshots'), { recursive: true });
  await writeFile(
    join(dataRoot, 'projects', 'demo', 'snapshots', 'snapshot.json'),
    JSON.stringify({
      previewUrl: `/media-preview/files/${referencedPreview}`,
      output: `/output/${referencedOutput}`,
      originalUrl: '/asset-library/files/asset_canvas_image',
      bridgeAssetId: 'asset_canvas_image',
    }),
  );

  const plan = await buildStorageCleanupPlan({
    dataRoot,
    liveReferences: [
      `/media-preview/files/${livePreview}`,
      '"bridgeAssetId":"asset_live_canvas_image"',
    ],
    now,
    mediaMinimumAgeMs: 1_000,
    orphanAssetMinimumAgeMs: 1_000,
  });

  assert.deepEqual(
    plan.candidates.map((candidate) => [candidate.scope, candidate.relativePath]),
    [
      ['assetOrphan', 'asset-library/files/demo/image/orphan.png'],
      ['preview', `asset-library/previews/${currentOrphanPreview}`],
      ['output', 'cli-image-output/gen-orphan.mp4'],
      ['output', 'cli-image-output/unreferenced-original.png'],
      ['preview', `media-preview-cache/${orphanPreview}`],
      ['temporary', 'media-preview-cache/stopped.upload'],
    ],
  );
  assert.equal(plan.summary.files, 6);
  assert.equal(plan.summary.scopes.preview.files, 2);

  const previewPage = listStorageCleanupCandidates(plan.candidates, {
    scope: 'preview',
    limit: 1,
  });
  assert.deepEqual(previewPage, {
    items: [
      {
        id: `asset-library/previews/${currentOrphanPreview}`,
        name: currentOrphanPreview,
        folder: 'asset-library/previews',
        relativePath: `asset-library/previews/${currentOrphanPreview}`,
        extension: 'webp',
        kind: 'image',
        scope: 'preview',
        size: currentOrphanPreview.length,
      },
    ],
    total: 2,
    offset: 0,
    hasMore: true,
  });
});

test('执行时只删除未变化的原扫描文件', async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-cleanup-apply-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true }));
  const now = Date.now();
  const old = now - 10_000;
  await mkdir(join(dataRoot, 'asset-library'), { recursive: true });
  await writeFile(join(dataRoot, 'asset-library', 'library.json'), JSON.stringify({ items: [] }));
  const first = join(
    dataRoot,
    'media-preview-cache',
    'preview_11111111111111111111111111111111.webp',
  );
  const changed = join(
    dataRoot,
    'media-preview-cache',
    'preview_22222222222222222222222222222222.webp',
  );
  const current = join(
    dataRoot,
    'asset-library',
    'previews',
    'preview_33333333333333333333333333333333.webp',
  );
  await writeOldFile(first, 'first', old);
  await writeOldFile(changed, 'before', old);
  await writeOldFile(current, 'current', old);
  const plan = await buildStorageCleanupPlan({
    dataRoot,
    now,
    mediaMinimumAgeMs: 1_000,
    orphanAssetMinimumAgeMs: 1_000,
  });

  await writeFile(changed, 'changed after scan');
  const result = await applyStorageCleanupCandidates({ dataRoot, candidates: plan.candidates });

  assert.equal(result.deletedFiles, 2);
  assert.equal(result.skippedFiles, 1);
  await assert.rejects(stat(first), { code: 'ENOENT' });
  await assert.rejects(stat(current), { code: 'ENOENT' });
  assert.equal(await readFile(changed, 'utf8'), 'changed after scan');
});
