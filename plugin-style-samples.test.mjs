import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  readLatestPluginStyleSample,
  uploadPluginStyleSample,
} from './plugin-style-samples.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-style-sample-'));
  const packId = 'test-style';
  await writeFile(
    join(root, 'style-catalog.json'),
    JSON.stringify({ styles: [{ pack_id: packId, status: 'active' }] }),
    'utf8',
  );
  const packRoot = join(root, '.agents', 'style-packs', packId);
  await mkdir(packRoot, { recursive: true });
  await writeFile(join(packRoot, 'style-pack.yaml'), 'pack: test\n', 'utf8');
  return { root, packId };
}

test('style samples stay inside the registered style pack and persist as the latest sample', async () => {
  const { root, packId } = await fixture();
  try {
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('sample')]);
    const saved = await uploadPluginStyleSample(root, {
      packId,
      mimeType: 'image/png',
      base64: png.toString('base64'),
    });
    assert.match(saved.relativePath, /^\.agents\/style-packs\/test-style\/assets\/style-samples\/sample-/);
    assert.deepEqual(
      await readFile(join(root, ...saved.relativePath.split('/'))),
      png,
    );
    const latest = await readLatestPluginStyleSample(root, packId);
    assert.equal(latest.fileName, saved.fileName);
    assert.deepEqual(Buffer.from(latest.base64, 'base64'), png);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('style sample upload rejects unregistered packs and MIME/signature mismatches', async () => {
  const { root, packId } = await fixture();
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('sample')]);
  try {
    await assert.rejects(
      uploadPluginStyleSample(root, { packId: '../escape', mimeType: 'image/png', base64: png.toString('base64') }),
      /风格标识格式无效/,
    );
    await assert.rejects(
      uploadPluginStyleSample(root, { packId, mimeType: 'image/jpeg', base64: png.toString('base64') }),
      /内容与声明格式不一致/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
