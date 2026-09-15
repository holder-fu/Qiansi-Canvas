import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishWebBuild } from './scripts/build-web.mjs';

test('publishes a new entry without removing lazy chunks used by open pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-build-test-'));
  try {
    const staging = join(root, 'stage');
    const live = join(root, 'live');
    await mkdir(join(staging, 'assets'), { recursive: true });
    await mkdir(join(live, 'assets'), { recursive: true });
    await writeFile(join(live, 'assets', 'old.js'), 'old lazy module');
    await writeFile(join(live, 'index.html'), '<script src="/assets/old.js"></script>');
    await writeFile(join(staging, 'assets', 'new.js'), 'new lazy module');
    await writeFile(join(staging, 'index.html'), '<script src="/assets/new.js"></script>');
    await publishWebBuild(staging, live);
    assert.equal(await readFile(join(live, 'assets', 'old.js'), 'utf8'), 'old lazy module');
    assert.equal(await readFile(join(live, 'assets', 'new.js'), 'utf8'), 'new lazy module');
    assert.match(await readFile(join(live, 'index.html'), 'utf8'), /new\.js/u);
    await writeFile(join(staging, 'index.html'), '<script src="/assets/missing.js"></script>');
    await assert.rejects(publishWebBuild(staging, live), /Missing entry resource/u);
    assert.match(await readFile(join(live, 'index.html'), 'utf8'), /new\.js/u);
    await writeFile(join(staging, 'index.html'), '<script src="/assets/new.js"></script>');
    await publishWebBuild(staging, live);
    await writeFile(join(staging, 'assets', 'new.js'), 'illegal collision');
    await assert.rejects(publishWebBuild(staging, live), /Asset collision/u);
    assert.match(await readFile(join(live, 'index.html'), 'utf8'), /new\.js/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
