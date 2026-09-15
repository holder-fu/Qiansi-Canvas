import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  ManagedSapiensNormalWorkerPool,
  resolveManagedSapiensNormalAdapter,
  SAPIENS_NORMAL_MODEL_ID,
} from './managed-sapiens-normal-worker.mjs';

function fixtureChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = () => {
    child.exitCode = 0;
    child.emit('exit', 0);
  };
  return child;
}

const fixtureAdapter = Object.freeze({
  command: 'python-fixture',
  adapterPath: 'fixture-adapter.py',
  runtimeRoot: 'fixture-runtime',
  configPath: 'fixture-config.py',
  modelPath: 'fixture-model.safetensors',
  cwd: 'fixture-runtime',
  env: {},
});

test('Sapiens2 adapter resolves the pinned official dense src package layout', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'qiansi-sapiens-worker-'));
  try {
    const pluginsRoot = join(projectRoot, 'data', 'plugins');
    const pluginRoot = join(pluginsRoot, 'qiansi-motion-capture');
    const packagedRuntime = join(pluginRoot, 'worker-runtime', SAPIENS_NORMAL_MODEL_ID);
    const runtimeRoot = join(packagedRuntime, 'app', 'sapiens2');
    const requiredFiles = [
      join(runtimeRoot, 'sapiens', 'dense', 'src', 'models', '__init__.py'),
      join(
        runtimeRoot,
        'sapiens',
        'dense',
        'configs',
        'normal',
        'metasim_render_people',
        'sapiens2_0.4b_normal_metasim_render_people-1024x768.py',
      ),
      join(packagedRuntime, '.venv', 'Scripts', 'python.exe'),
      join(pluginRoot, 'worker', 'adapters', 'sapiens2_normal_adapter.py'),
      join(pluginRoot, 'models', SAPIENS_NORMAL_MODEL_ID, 'sapiens2_0.4b_normal.safetensors'),
    ];
    for (const file of requiredFiles) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'fixture');
    }

    const adapter = resolveManagedSapiensNormalAdapter({
      projectRoot,
      pluginsRoot,
      pluginRoot,
      env: {},
      platform: 'win32',
    });
    assert.equal(adapter.runtimeRoot, runtimeRoot);
    assert.equal(adapter.cwd, join(runtimeRoot, 'sapiens', 'dense'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('Sapiens2 pool probes and reuses one persistent worker for sequential frames', async () => {
  let serveSpawns = 0;
  const pool = new ManagedSapiensNormalWorkerPool({
    resolveAdapter: () => fixtureAdapter,
    spawnImpl: (_command, args) => {
      const child = fixtureChild();
      if (args.includes('--probe')) {
        setTimeout(() => {
          child.stdout.end('QISN_READY {"ready":true,"backend":"fixture-cuda"}\n');
          child.exitCode = 0;
          child.emit('exit', 0);
        }, 1);
        return child;
      }
      serveSpawns += 1;
      let input = '';
      child.stdin.setEncoding('utf8');
      child.stdin.on('data', (chunk) => {
        input += chunk;
        const lines = input.split(/\r?\n/);
        input = lines.pop() || '';
        for (const line of lines) {
          const request = JSON.parse(line);
          child.stdout.write(
            `QISN_RESULT ${JSON.stringify({
              requestId: request.requestId,
              imageBase64: Buffer.from('webp-fixture').toString('base64'),
              width: 320,
              height: 180,
              inferenceMs: 12,
            })}\n`,
          );
        }
      });
      setTimeout(() => {
        child.stdout.write('QISN_READY {"ready":true,"backend":"fixture-cuda"}\n');
      }, 1);
      return child;
    },
  });

  assert.equal((await pool.probe()).available, true);
  const request = { bytes: Buffer.from('jpeg-fixture'), timestampMs: 100 };
  const first = await pool.render(request);
  const second = await pool.render({ ...request, timestampMs: 200 });
  assert.equal(first.bytes.toString(), 'webp-fixture');
  assert.equal(first.mimeType, 'image/webp');
  assert.equal(second.timestampMs, 200);
  assert.equal(serveSpawns, 1);
  assert.equal(pool.isRendering(), false);
  await pool.stopAll();
});

test('Sapiens2 pool rejects oversized frame payloads before spawning a worker', async () => {
  const pool = new ManagedSapiensNormalWorkerPool({
    resolveAdapter: () => fixtureAdapter,
    spawnImpl: () => {
      throw new Error('must not spawn');
    },
  });
  await assert.rejects(
    pool.render({ bytes: Buffer.alloc(2 * 1024 * 1024 + 1), timestampMs: 0 }),
    /不能超过 2 MB/,
  );
});

test('Sapiens2 model id remains the fixed managed contract', () => {
  assert.equal(SAPIENS_NORMAL_MODEL_ID, 'sapiens2-normal-0.4b');
});
