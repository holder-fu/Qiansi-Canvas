import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANAGED_AUDIO_ADAPTER_DEFINITIONS,
  ManagedAudioWorkerPool,
  resolveManagedAudioAdapter,
} from './managed-audio-worker.mjs';

const trustedWorkerSource = 'print("trusted worker")\n';

const fakeWorkerSource = String.raw`
const readline = require('node:readline');
const fs = require('node:fs');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'shutdown') process.exit(0);
  if (message.method === 'health') {
    process.stdout.write(JSON.stringify({ id: message.id, ok: true, result: { ready: true } }) + '\n');
    return;
  }
  if (message.method === 'generate') {
    const respond = () => {
      fs.writeFileSync(message.outputPath, Buffer.from([0x52,0x49,0x46,0x46,4,0,0,0,0x57,0x41,0x56,0x45]));
      process.stdout.write(JSON.stringify({ id: message.id, ok: true, result: { durationSeconds: 1.25 } }) + '\n');
    };
    if (message.request?.text === 'slow') setTimeout(respond, 150);
    else respond();
  }
});
`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function testAdapterDefinitions() {
  const common = {
    developmentPythonRelativePaths: {
      win32: [['python', 'python.exe']],
      posix: [['python', 'bin', 'python3']],
    },
    workerSha256: sha256(trustedWorkerSource),
  };
  return {
    voxcpm2: {
      ...common,
      pluginId: 'qiansi-audio',
      generatorId: 'voxcpm2-local',
      label: 'VoxCPM2',
      rootEnvironmentVariable: 'TEST_VOXCPM2_ROOT',
      fallbackRelativePath: ['runtime', 'voxcpm2'],
      workerRelativePath: ['engines', 'voxcpm2', 'service', 'worker.py'],
      installedPythonRelativePaths: {
        win32: [['engines', 'voxcpm2', 'runtime', 'python', 'python.exe']],
        posix: [['engines', 'voxcpm2', 'runtime', 'python', 'bin', 'python3']],
      },
      cacheRelativePath: ['engines', 'voxcpm2', 'runtime', 'model-cache'],
      temporaryPrefix: 'test-voxcpm2-',
      outputFileName: 'voxcpm2-output.wav',
    },
    chattts: {
      ...common,
      pluginId: 'qiansi-audio',
      generatorId: 'chattts-local',
      label: 'ChatTTS',
      rootEnvironmentVariable: 'TEST_CHAT_TTS_ROOT',
      fallbackRelativePath: ['runtime', 'chattts'],
      workerRelativePath: ['engines', 'chattts', 'service', 'worker.py'],
      installedPythonRelativePaths: {
        win32: [['engines', 'chattts', 'runtime', 'python', 'python.exe']],
        posix: [['engines', 'chattts', 'runtime', 'python', 'bin', 'python3']],
      },
      cacheRelativePath: ['engines', 'chattts', 'runtime', 'model-cache'],
      temporaryPrefix: 'test-chattts-',
      outputFileName: 'chattts-output.wav',
    },
  };
}

async function writeAdapterRuntime(
  root,
  adapterId,
  { installedPython = true, worker = trustedWorkerSource } = {},
) {
  const engineRoot = join(root, 'engines', adapterId);
  const pythonRoot = installedPython ? join(engineRoot, 'runtime', 'python') : join(root, 'python');
  await mkdir(pythonRoot, { recursive: true });
  await mkdir(join(engineRoot, 'service'), { recursive: true });
  await writeFile(join(pythonRoot, 'python.exe'), 'placeholder');
  await writeFile(join(engineRoot, 'service', 'worker.py'), worker);
}

function fakePool({ spawned } = {}) {
  return new ManagedAudioWorkerPool({
    projectRoot: process.cwd(),
    spawnImpl: (...args) => {
      spawned?.push(args);
      return spawn(...args);
    },
    resolveAdapter: (adapterId, context) => {
      const pluginId = 'qiansi-audio';
      assert.equal(context.pluginId, pluginId);
      return {
        adapterId,
        pluginId,
        label: adapterId === 'voxcpm2' ? 'VoxCPM2' : 'ChatTTS',
        root: context.pluginRoot,
        command: process.execPath,
        args: ['-e', fakeWorkerSource],
        cwd: process.cwd(),
        env: process.env,
        temporaryPrefix: `test-${adapterId}-`,
        outputFileName: `${adapterId}-output.wav`,
      };
    },
  });
}

function generationOptions(adapterId, overrides = {}) {
  const pluginId = 'qiansi-audio';
  return {
    pluginId,
    pluginRoot: join(process.cwd(), 'data', 'plugins', pluginId),
    timeoutMs: 5_000,
    maxBytes: 64 * 1024,
    ...overrides,
  };
}

test('ships six ordered trusted adapter definitions with matching workers', async () => {
  assert.deepEqual(Object.keys(MANAGED_AUDIO_ADAPTER_DEFINITIONS), [
    'voxcpm2',
    'chattts',
    'qwen3tts',
    'cosyvoice3',
    'woosh',
    'acestepXl',
  ]);
  for (const [adapterId, definition] of Object.entries(MANAGED_AUDIO_ADAPTER_DEFINITIONS)) {
    const sourceDirectory = adapterId === 'acestepXl' ? 'acestep-xl' : adapterId;
    const worker = await readFile(
      join('data', 'plugins', 'qiansi-audio', 'install', 'adapters', sourceDirectory, 'service', 'worker.py'),
    );
    assert.equal(sha256(worker), definition.workerSha256, `${adapterId} worker digest must match`);
  }
  assert.deepEqual(MANAGED_AUDIO_ADAPTER_DEFINITIONS.woosh.installedPythonRelativePaths.win32, [
    ['engines', 'woosh', 'runtime', 'app', 'Woosh', '.venv', 'Scripts', 'python.exe'],
  ]);
  assert.deepEqual(MANAGED_AUDIO_ADAPTER_DEFINITIONS.acestepXl.installedPythonRelativePaths.win32, [
    ['engines', 'acestep-xl', 'runtime', 'app', 'ACE-Step-1.5', '.venv', 'Scripts', 'python.exe'],
  ]);
});

test('binds a managed adapter to its canonical plugin id/root and ignores env root overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-managed-adapter-'));
  try {
    const projectRoot = join(root, 'canvas');
    const pluginRoot = join(projectRoot, 'data', 'plugins', 'qiansi-audio');
    const environmentRoot = join(root, 'environment-override');
    await writeAdapterRuntime(pluginRoot, 'voxcpm2');
    await writeAdapterRuntime(environmentRoot, 'voxcpm2');
    const resolved = resolveManagedAudioAdapter('voxcpm2', {
      projectRoot,
      pluginId: 'qiansi-audio',
      pluginRoot,
      platform: 'win32',
      env: { TEST_VOXCPM2_ROOT: environmentRoot },
      adapterDefinitions: testAdapterDefinitions(),
    });
    assert.equal(resolved.pluginId, 'qiansi-audio');
    assert.equal(resolved.root, pluginRoot);
    assert.equal(
      resolved.command,
      join(pluginRoot, 'engines', 'voxcpm2', 'runtime', 'python', 'python.exe'),
    );
    assert.equal(resolved.workerSha256, sha256(trustedWorkerSource));
    assert.equal(resolved.env.PYTHONNOUSERSITE, '1');
    assert.equal(resolved.env.PYTHONDONTWRITEBYTECODE, '1');
    assert.throws(
      () =>
        resolveManagedAudioAdapter('voxcpm2', {
          projectRoot,
          pluginRoot,
          platform: 'win32',
          adapterDefinitions: testAdapterDefinitions(),
        }),
      /只能由 qiansi-audio 插件使用/,
    );
    assert.throws(
      () =>
        resolveManagedAudioAdapter('voxcpm2', {
          projectRoot,
          pluginId: 'chattts-tts',
          pluginRoot,
          platform: 'win32',
          adapterDefinitions: testAdapterDefinitions(),
        }),
      /只能由 qiansi-audio 插件使用/,
    );
    assert.throws(
      () =>
        resolveManagedAudioAdapter('voxcpm2', {
          projectRoot,
          pluginId: 'qiansi-audio',
          pluginRoot: environmentRoot,
          platform: 'win32',
          adapterDefinitions: testAdapterDefinitions(),
        }),
      /必须安装在/,
    );
    assert.throws(() => resolveManagedAudioAdapter('arbitrary-worker', { projectRoot }), /不支持/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('requires canonical runtime Python layout and a trusted worker digest for ChatTTS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-managed-chattts-'));
  try {
    const projectRoot = join(root, 'canvas');
    const pluginRoot = join(projectRoot, 'data', 'plugins', 'qiansi-audio');
    const definitions = testAdapterDefinitions();
    await writeAdapterRuntime(pluginRoot, 'chattts', { installedPython: false });
    assert.throws(
      () =>
        resolveManagedAudioAdapter('chattts', {
          projectRoot,
          pluginId: 'qiansi-audio',
          pluginRoot,
          platform: 'win32',
          adapterDefinitions: definitions,
        }),
      /runtime.*python.*python\.exe/,
    );
    await writeAdapterRuntime(pluginRoot, 'chattts');
    await writeFile(join(pluginRoot, 'engines', 'chattts', 'service', 'worker.py'), 'tampered\n');
    assert.throws(
      () =>
        resolveManagedAudioAdapter('chattts', {
          projectRoot,
          pluginId: 'qiansi-audio',
          pluginRoot,
          platform: 'win32',
          adapterDefinitions: definitions,
        }),
      /完整性校验失败/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('blocks managed workers while an install or swap recovery is active', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-managed-install-gate-'));
  try {
    const projectRoot = join(root, 'canvas');
    const pluginRoot = join(projectRoot, 'data', 'plugins', 'qiansi-audio');
    const definitions = testAdapterDefinitions();
    await writeAdapterRuntime(pluginRoot, 'voxcpm2');
    const context = {
      projectRoot,
      pluginId: 'qiansi-audio',
      pluginRoot,
      platform: 'win32',
      adapterDefinitions: definitions,
    };

    const transactionRoot = join(
      pluginRoot,
      'engines',
      '.qiansi-install',
      'voxcpm2-local',
    );
    await mkdir(transactionRoot, { recursive: true });
    await writeFile(join(transactionRoot, 'transaction.json'), '{}');
    assert.throws(
      () => resolveManagedAudioAdapter('voxcpm2', context),
      /未完成的安装替换/,
    );
    await rm(join(transactionRoot, 'transaction.json'));

    const stateRoot = join(pluginRoot, 'install', '.installing', 'state');
    await mkdir(stateRoot, { recursive: true });
    await writeFile(
      join(stateRoot, 'qwen3-tts-local.json'),
      JSON.stringify({ status: 'downloading', ownerPid: process.pid }),
    );
    assert.throws(
      () => resolveManagedAudioAdapter('voxcpm2', context),
      /模型正在安装/,
    );

    await writeFile(
      join(stateRoot, 'qwen3-tts-local.json'),
      JSON.stringify({ status: 'done', ownerPid: process.pid }),
    );
    assert.equal(resolveManagedAudioAdapter('voxcpm2', context).pluginId, 'qiansi-audio');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('starts one managed worker, probes it, generates adapter-specific WAV, and stops it', async () => {
  const pool = fakePool();
  const options = generationOptions('voxcpm2');
  const probe = await pool.probe('voxcpm2', options);
  assert.equal(probe.ok, true);
  const result = await pool.generate('voxcpm2', { mode: 'design', text: '你好' }, options);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.fileName, 'voxcpm2-output.wav');
  assert.equal(result.durationSeconds, 1.25);
  assert.equal(result.bytes.byteLength, 12);
  await pool.stopAll();
  assert.equal(pool.workers.size, 0);
});

test('evicts other adapter workers, reuses the active adapter, and serializes GPU generation', async () => {
  const spawned = [];
  const pool = fakePool({ spawned });
  try {
    await pool.generate(
      'voxcpm2',
      { mode: 'design', text: '第一段' },
      generationOptions('voxcpm2'),
    );
    assert.deepEqual(
      [...pool.workers.values()].map((state) => state.adapterId),
      ['voxcpm2'],
    );
    assert.equal(spawned.length, 1);

    await pool.generate(
      'chattts',
      { mode: 'design', text: '第二段' },
      generationOptions('chattts'),
    );
    assert.deepEqual(
      [...pool.workers.values()].map((state) => state.adapterId),
      ['chattts'],
    );
    assert.equal(spawned.length, 2);

    await pool.generate(
      'chattts',
      { mode: 'design', text: '第三段' },
      generationOptions('chattts'),
    );
    assert.equal(spawned.length, 2);

    await pool.probe('voxcpm2', generationOptions('voxcpm2'));
    assert.equal(spawned.length, 3);
    await pool.generate(
      'voxcpm2',
      { mode: 'design', text: '第四段' },
      generationOptions('voxcpm2'),
    );
    assert.deepEqual(
      [...pool.workers.values()].map((state) => state.adapterId),
      ['voxcpm2'],
    );
    assert.equal(spawned.length, 3);

    const slow = pool.generate(
      'voxcpm2',
      { mode: 'design', text: 'slow' },
      generationOptions('voxcpm2'),
    );
    assert.equal(pool.isGenerating(), true);
    await assert.rejects(
      pool.generate('chattts', { mode: 'design', text: '并发' }, generationOptions('chattts')),
      (error) => error.statusCode === 409 && /同一时间只能运行一个/.test(error.message),
    );
    await slow;
    assert.equal(pool.isGenerating(), false);
  } finally {
    await pool.stopAll();
  }
});
