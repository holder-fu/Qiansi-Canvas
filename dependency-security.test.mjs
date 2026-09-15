import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const PATCHED_NANOID_VERSION = '3.3.18';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

test('the development toolchain pins nanoid to the patched 3.x release', async () => {
  const packageManifest = await readJson('./package.json');
  const packageLock = await readJson('./package-lock.json');
  const installedNanoid = packageLock.packages?.['node_modules/nanoid'];

  assert.equal(packageManifest.overrides?.nanoid, PATCHED_NANOID_VERSION);
  assert.equal(installedNanoid?.version, PATCHED_NANOID_VERSION);
  assert.equal(installedNanoid?.dev, true);
});
