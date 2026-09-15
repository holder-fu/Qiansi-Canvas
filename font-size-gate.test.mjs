import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const gateSource = join(projectRoot, 'scripts', 'check-font-size-gate.mjs');

async function runIsolatedGate(source) {
  const sandbox = await mkdtemp(join(tmpdir(), 'qiansi-font-gate-'));
  try {
    await mkdir(join(sandbox, 'scripts'), { recursive: true });
    await mkdir(join(sandbox, 'src'), { recursive: true });
    await copyFile(gateSource, join(sandbox, 'scripts', 'check-font-size-gate.mjs'));
    await writeFile(join(sandbox, 'src', 'sample.tsx'), source, 'utf8');
    return spawnSync(process.execPath, [join(sandbox, 'scripts', 'check-font-size-gate.mjs')], {
      cwd: sandbox,
      encoding: 'utf8',
      windowsHide: true,
    });
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

test('font gate succeeds in a clean checkout without data/plugins', async () => {
  const result = await runIsolatedGate('export const Sample = () => <span>Readable</span>;\n');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /8px 字体门禁通过/);
});

test('font gate still rejects a first-party 8px declaration', async () => {
  const result = await runIsolatedGate('export const tiny = { fontSize: "8px" };\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /inline 8px fontSize/);
});
