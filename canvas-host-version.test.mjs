import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCanvasHostVersionReader } from './canvas-host-version.mjs';
import { isPluginEngineCompatible } from './plugin-contract.mjs';

test('re-reads the Canvas host version after the package on disk is upgraded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qiansi-canvas-host-version-'));
  const packageFile = join(directory, 'package.json');
  try {
    await writeFile(packageFile, JSON.stringify({ version: '1.54.2' }), 'utf8');
    const readCanvasHostVersion = createCanvasHostVersionReader(packageFile, '1.54.2');
    assert.equal(isPluginEngineCompatible('>=1.55.0', await readCanvasHostVersion()), false);

    await writeFile(packageFile, JSON.stringify({ version: '1.56.1' }), 'utf8');
    assert.equal(isPluginEngineCompatible('>=1.55.0', await readCanvasHostVersion()), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps the Bridge startup version as a safe fallback during an incomplete update', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qiansi-canvas-host-version-'));
  const packageFile = join(directory, 'package.json');
  try {
    const readCanvasHostVersion = createCanvasHostVersionReader(packageFile, '1.54.2');
    assert.equal(await readCanvasHostVersion(), '1.54.2');

    await writeFile(packageFile, '{"version":', 'utf8');
    assert.equal(await readCanvasHostVersion(), '1.54.2');

    await writeFile(packageFile, JSON.stringify({ version: '../invalid' }), 'utf8');
    assert.equal(await readCanvasHostVersion(), '1.54.2');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
