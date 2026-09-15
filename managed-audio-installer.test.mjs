import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  ManagedAudioInstallerError,
  ManagedAudioInstallerManager,
  QIANSI_AUDIO_GENERATOR_IDS,
  resolveManagedAudioInstaller,
} from './managed-audio-installer.mjs';

const fakeBootstrapSource = String.raw`
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_INSTALL_LOG, JSON.stringify({ kind: 'bootstrap', args: process.argv.slice(2) }) + '\n');
const python = process.env.FAKE_BOOTSTRAP_PYTHON;
process.stdout.write('QIAS_CONTROLLER_READY ' + JSON.stringify({ ok: true, python, version: '3.11.9', architecture: 'x64' }) + '\n');
`;

const fakeInstallerSource = String.raw`
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_INSTALL_LOG, JSON.stringify({ kind: 'python', args }) + '\n');
const command = args[4];
const argument = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
if (command === 'catalog') {
  if (process.env.FAKE_CATALOG_ERROR === '1') {
    emit({ status: 'error', message: 'fixture catalog unavailable', code: 409 });
    process.exitCode = 1;
  } else {
  emit({
    schemaVersion: 1,
    catalogVersion: 'fixture-v1',
    generators: ['qwen3-tts-local', 'voxcpm2-local', 'cosyvoice3-local', 'chattts-local', 'woosh-local', 'acestep-xl-local'].map((id) => ({
      id,
      installAvailable: true,
      license: { requiresAcceptance: false, acceptanceSha256: 'a'.repeat(64) },
    })),
  });
  }
} else if (command === 'status') {
  const generatorId = argument('--generator-id');
  emit({ generatorId, status: 'idle', installed: false });
} else if (command === 'cancel') {
  const operationId = argument('--operation-id');
  writeFileSync(process.env.FAKE_CANCEL_DIR + '/' + operationId + '.cancel', '1');
  emit({ status: 'cancelling', operationId });
} else if (command === 'uninstall') {
  const generatorId = argument('--generator-id');
  setTimeout(
    () => emit({ generatorId, status: 'uninstalled', phase: 'complete', installed: false }),
    Number(process.env.FAKE_INSTALL_DELAY_MS || 20),
  );
} else if (command === 'install') {
  const generatorId = argument('--generator-id');
  const operationId = argument('--operation-id');
  const delay = Number(process.env.FAKE_INSTALL_DELAY_MS || 20);
  const cancelled = () => process.env.FAKE_IGNORE_CANCEL !== '1' && existsSync(process.env.FAKE_CANCEL_DIR + '/' + operationId + '.cancel');
  emit({ generatorId, operationId, status: 'pending', phase: 'queued', completedBytes: 0, totalBytes: 100 });
  setTimeout(() => {
    if (cancelled()) {
      emit({ generatorId, operationId, status: 'cancelled', phase: 'cancelled' });
      process.exitCode = 1;
      return;
    }
    emit({ generatorId, operationId, status: 'downloading', phase: 'download', completedBytes: 50, totalBytes: 100 });
    setTimeout(() => {
      if (cancelled()) {
        emit({ generatorId, operationId, status: 'cancelled', phase: 'cancelled' });
        process.exitCode = 1;
        return;
      }
      emit({ generatorId, operationId, status: 'done', phase: 'complete', completedBytes: 100, totalBytes: 100, installed: true });
    }, delay);
  }, delay);
} else {
  emit({ status: 'error', message: 'unsupported fixture command', code: 400 });
  process.exitCode = 1;
}
`;

async function createFixture({ delayMs = 20, markerPython, ignoreCancel = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-audio-installer-'));
  const projectRoot = join(root, 'project with spaces');
  const pluginRoot = join(projectRoot, 'data', 'plugins', 'qiansi-audio');
  const systemRoot = join(root, 'fake-windows');
  const powershellPath = join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const bootstrapPath = join(pluginRoot, 'controller', 'bootstrap.ps1');
  const pythonPath = join(pluginRoot, 'controller', 'runtime', 'python', 'python.exe');
  const installerPath = join(pluginRoot, 'install', 'installer.py');
  const fakeBootstrapPath = join(root, 'fake-bootstrap.mjs');
  const fakeInstallerPath = join(root, 'fake-installer.mjs');
  const logPath = join(root, 'processes.jsonl');
  const cancelDir = join(root, 'cancel');
  await mkdir(cancelDir, { recursive: true });
  for (const file of [powershellPath, bootstrapPath, pythonPath, installerPath]) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, 'fixture\n');
  }
  await writeFile(fakeBootstrapPath, fakeBootstrapSource);
  await writeFile(fakeInstallerPath, fakeInstallerSource);
  await writeFile(logPath, '');

  const env = {
    ...process.env,
    SystemRoot: systemRoot,
    FAKE_INSTALL_LOG: logPath,
    FAKE_BOOTSTRAP_PYTHON: markerPython || pythonPath,
    FAKE_INSTALL_DELAY_MS: String(delayMs),
    FAKE_CANCEL_DIR: cancelDir,
    FAKE_IGNORE_CANCEL: ignoreCancel ? '1' : '0',
  };
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args: [...args], options: { ...options } });
    const fixtureOptions = {
      ...options,
      env: {
        ...options.env,
        SystemRoot: process.env.SystemRoot,
        SYSTEMROOT: process.env.SYSTEMROOT,
      },
    };
    if (resolve(command) === resolve(powershellPath)) {
      return spawn(process.execPath, [fakeBootstrapPath, ...args], fixtureOptions);
    }
    if (resolve(command) === resolve(pythonPath)) {
      return spawn(process.execPath, [fakeInstallerPath, ...args], fixtureOptions);
    }
    throw new Error(`unexpected fixture command: ${command}`);
  };
  const createManager = () =>
    new ManagedAudioInstallerManager({
      projectRoot,
      pluginId: 'qiansi-audio',
      pluginRoot,
      env,
      platform: 'win32',
      spawnImpl,
    });
  return {
    root,
    projectRoot,
    pluginRoot,
    systemRoot,
    powershellPath,
    bootstrapPath,
    pythonPath,
    installerPath,
    logPath,
    env,
    calls,
    createManager,
  };
}

async function fixtureLog(fixture) {
  const content = await readFile(fixture.logPath, 'utf8');
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function waitForProgress(register) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('fixture progress timed out')), 3_000);
    register((progress) => {
      if (!progress.operationId) return;
      clearTimeout(timer);
      resolvePromise(progress);
    });
  });
}

test('resolver accepts only the canonical qiansi-audio plugin and fixed Windows tools', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const resolved = resolveManagedAudioInstaller({
    projectRoot: fixture.projectRoot,
    pluginId: 'qiansi-audio',
    pluginRoot: fixture.pluginRoot,
    env: fixture.env,
    platform: 'win32',
  });
  assert.equal(resolved.pluginRoot, fixture.pluginRoot);
  assert.equal(resolved.powershellPath, fixture.powershellPath);
  assert.equal(resolved.bootstrapPath, fixture.bootstrapPath);
  assert.equal(resolved.controllerPythonPath, fixture.pythonPath);
  assert.equal(resolved.installerPath, fixture.installerPath);
  assert.deepEqual(QIANSI_AUDIO_GENERATOR_IDS, [
    'qwen3-tts-local',
    'voxcpm2-local',
    'cosyvoice3-local',
    'chattts-local',
    'woosh-local',
    'acestep-xl-local',
  ]);

  assert.throws(
    () =>
      resolveManagedAudioInstaller({
        projectRoot: fixture.projectRoot,
        pluginId: 'other-plugin',
        pluginRoot: fixture.pluginRoot,
        env: fixture.env,
        platform: 'win32',
      }),
    (error) => error instanceof ManagedAudioInstallerError && error.statusCode === 403,
  );
  assert.throws(
    () =>
      resolveManagedAudioInstaller({
        projectRoot: fixture.projectRoot,
        pluginId: 'qiansi-audio',
        pluginRoot: join(fixture.projectRoot, 'somewhere-else'),
        env: fixture.env,
        platform: 'win32',
      }),
    (error) => error instanceof ManagedAudioInstallerError && error.statusCode === 403,
  );
  assert.throws(
    () =>
      new ManagedAudioInstallerManager({
        projectRoot: fixture.projectRoot,
        pluginId: 'qiansi-audio',
        pluginRoot: fixture.pluginRoot,
        env: fixture.env,
        platform: 'win32',
        spawnImpl: () => {},
        url: 'https://example.invalid/model.zip',
      }),
    /does not accept option: url/,
  );
});

test('catalog and status use bootstrap first and only fixed no-shell CLI arguments', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const manager = fixture.createManager();

  const catalog = await manager.catalog();
  assert.deepEqual(
    catalog.generators.map((item) => item.id),
    QIANSI_AUDIO_GENERATOR_IDS,
  );
  assert.deepEqual(await manager.status('voxcpm2-local'), {
    generatorId: 'voxcpm2-local',
    status: 'idle',
    installed: false,
  });
  await assert.rejects(
    Promise.resolve().then(() => manager.status('unknown-model')),
    /Unsupported Qiansi Audio generator/,
  );
  await assert.rejects(
    manager.catalog({ url: 'https://example.invalid/catalog.json' }),
    /does not accept option: url/,
  );

  assert.equal(fixture.calls.length, 4);
  for (const call of fixture.calls) {
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.detached, false);
    assert.equal(call.options.shell, false);
    assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe']);
  }
  assert.deepEqual(fixture.calls[0].args, [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    fixture.bootstrapPath,
    '-EnsureOnly',
  ]);
  assert.deepEqual(fixture.calls[1].args, [
    '-I',
    '-B',
    '-u',
    fixture.installerPath,
    'catalog',
    '--json',
  ]);
  assert.deepEqual(fixture.calls[3].args, [
    '-I',
    '-B',
    '-u',
    fixture.installerPath,
    'status',
    '--generator-id',
    'voxcpm2-local',
    '--json',
  ]);

  fixture.env.FAKE_CATALOG_ERROR = '1';
  await assert.rejects(
    manager.catalog(),
    (error) =>
      error instanceof ManagedAudioInstallerError &&
      error.statusCode === 409 &&
      error.message === 'fixture catalog unavailable',
  );
});

test('uninstall is catalog-bound, runs the worker barrier, and rejects overlap', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const manager = fixture.createManager();
  let barrierCalled = false;
  const removalTask = manager.uninstall('woosh-local', {
    beforeUninstall: async () => {
      barrierCalled = true;
    },
  });
  assert.equal(manager.isInstalling('woosh-local'), true);
  await assert.rejects(
    manager.uninstall('woosh-local'),
    (error) => error instanceof ManagedAudioInstallerError && error.statusCode === 409,
  );
  await assert.rejects(
    Promise.resolve().then(() => manager.install('qwen3-tts-local')),
    (error) =>
      error instanceof ManagedAudioInstallerError &&
      error.statusCode === 409 &&
      error.message === 'A model removal is already active.',
  );
  const result = await removalTask;
  assert.equal(manager.isInstalling('woosh-local'), false);
  assert.equal(barrierCalled, true);
  assert.deepEqual(result, {
    generatorId: 'woosh-local',
    status: 'uninstalled',
    phase: 'complete',
    installed: false,
  });
  const log = await fixtureLog(fixture);
  const removal = log.find(
    (item) => item.kind === 'python' && item.args.includes('uninstall'),
  );
  assert.ok(removal);
  assert.ok(removal.args.includes('--generator-id'));
  assert.ok(removal.args.includes('woosh-local'));
  assert.ok(removal.args.includes('--json'));
  await assert.rejects(
    Promise.resolve().then(() => manager.uninstall('../outside')),
    (error) => error instanceof ManagedAudioInstallerError && error.statusCode === 400,
  );
});

test('unpublished catalog is listed without downloading the controller runtime', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await rm(fixture.pythonPath, { force: true });
  const engines = QIANSI_AUDIO_GENERATOR_IDS.map((generatorId) => {
    const installDirectory = {
      'qwen3-tts-local': 'qwen3tts',
      'voxcpm2-local': 'voxcpm2',
      'cosyvoice3-local': 'cosyvoice3',
      'chattts-local': 'chattts',
      'woosh-local': 'woosh',
      'acestep-xl-local': 'acestep-xl',
    }[generatorId];
    const isChatTts = generatorId === 'chattts-local';
    const isWoosh = generatorId === 'woosh-local';
    const isAceStepXl = generatorId === 'acestep-xl-local';
    return {
      generatorId,
      installDirectory,
      license: isChatTts
        ? 'AGPL-3.0-or-later'
        : isWoosh || isAceStepXl
          ? 'MIT'
          : 'Apache-2.0',
      commercialUse: !isChatTts && !isWoosh,
      artifacts: [
        { id: `${installDirectory}-core`, kind: 'core', published: false },
        ...(isChatTts || isWoosh
          ? [
              {
                id: `${installDirectory}-model`,
                kind: 'model',
                license: 'CC-BY-NC-4.0',
              },
            ]
          : []),
      ],
    };
  });
  await writeFile(
    join(fixture.pluginRoot, 'install', 'catalog.json'),
    JSON.stringify({
      schemaVersion: 1,
      catalogId: 'fixture-unpublished',
      coreRelease: { published: false },
      engines,
    }),
  );

  const catalog = await fixture.createManager().catalog();
  assert.equal(catalog.unpublished, true);
  assert.deepEqual(
    catalog.generators.map((item) => item.id),
    QIANSI_AUDIO_GENERATOR_IDS,
  );
  assert.ok(catalog.generators.every((item) => item.installAvailable === false));
  assert.ok(
    catalog.generators.every((item) => /^[a-f0-9]{64}$/.test(item.license.acceptanceSha256)),
  );
  assert.equal(
    catalog.generators.find((item) => item.id === 'chattts-local').license.components.length,
    2,
  );
  assert.equal(
    catalog.generators.find((item) => item.id === 'woosh-local').license.components.length,
    2,
  );
  for (const generatorId of QIANSI_AUDIO_GENERATOR_IDS) {
    assert.equal((await fixture.createManager().status(generatorId)).status, 'idle');
  }
  assert.equal(fixture.calls.length, 0, 'reading an unpublished catalog must not spawn bootstrap');
});

test('unpublished catalog reports an engine installed only after every model file exists', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await rm(fixture.pythonPath, { force: true });
  const installRoot = join(fixture.pluginRoot, 'install');
  const engines = [];
  for (const generatorId of QIANSI_AUDIO_GENERATOR_IDS) {
    const installDirectory = {
      'qwen3-tts-local': 'qwen3tts',
      'voxcpm2-local': 'voxcpm2',
      'cosyvoice3-local': 'cosyvoice3',
      'chattts-local': 'chattts',
      'woosh-local': 'woosh',
      'acestep-xl-local': 'acestep-xl',
    }[generatorId];
    const engineRoot = join(fixture.pluginRoot, 'engines', installDirectory);
    const pythonEntry =
      generatorId === 'woosh-local'
        ? 'runtime/app/Woosh/.venv/Scripts/python.exe'
        : generatorId === 'acestep-xl-local'
          ? 'runtime/app/ACE-Step-1.5/.venv/Scripts/python.exe'
          : 'runtime/python/python.exe';
    const pythonPath = join(engineRoot, pythonEntry);
    const workerPath = join(engineRoot, 'service', 'worker.py');
    const modelDestination = `runtime/models/${installDirectory}`;
    const modelPath = join(engineRoot, modelDestination, 'weights.bin');
    const modelBytes = Buffer.from(`${generatorId}-model`);
    const workerBytes = Buffer.from(`${generatorId}-worker`);
    const artifactId = `${installDirectory}-model`;
    const manifestRelative = `manifests/${artifactId}.json`;
    await mkdir(dirname(pythonPath), { recursive: true });
    await mkdir(dirname(workerPath), { recursive: true });
    await mkdir(dirname(modelPath), { recursive: true });
    await mkdir(join(installRoot, 'manifests'), { recursive: true });
    await writeFile(pythonPath, 'python fixture');
    await writeFile(workerPath, workerBytes);
    await writeFile(modelPath, modelBytes);
    await writeFile(
      join(installRoot, manifestRelative),
      JSON.stringify({
        schemaVersion: 1,
        artifactId,
        files: [{ path: 'weights.bin', bytes: modelBytes.length }],
      }),
    );
    const isChatTts = generatorId === 'chattts-local';
    const isWoosh = generatorId === 'woosh-local';
    const isAceStepXl = generatorId === 'acestep-xl-local';
    engines.push({
      generatorId,
      installDirectory,
      license: isChatTts
        ? 'AGPL-3.0-or-later'
        : isWoosh || isAceStepXl
          ? 'MIT'
          : 'Apache-2.0',
      commercialUse: !isChatTts && !isWoosh,
      entrypoints: {
        pythonWindows: pythonEntry,
        worker: 'service/worker.py',
      },
      worker: {
        path: 'service/worker.py',
        sha256: createHash('sha256').update(workerBytes).digest('hex'),
      },
      artifacts: [
        { id: `${installDirectory}-core`, kind: 'core', published: false },
        {
          id: artifactId,
          kind: 'model',
          destination: modelDestination,
          manifest: manifestRelative,
          license: isChatTts || isWoosh ? 'CC-BY-NC-4.0' : isAceStepXl ? 'MIT' : 'Apache-2.0',
        },
      ],
    });
  }
  await writeFile(
    join(installRoot, 'catalog.json'),
    JSON.stringify({
      schemaVersion: 1,
      catalogId: 'fixture-unpublished-complete-models',
      coreRelease: { published: false },
      engines,
    }),
  );

  let catalog = await fixture.createManager().catalog();
  assert.ok(catalog.generators.every((item) => item.installed === true));

  await rm(
    join(fixture.pluginRoot, 'engines', 'qwen3tts', 'runtime', 'models', 'qwen3tts', 'weights.bin'),
  );
  catalog = await fixture.createManager().catalog();
  assert.equal(catalog.generators.find((item) => item.id === 'qwen3-tts-local').installed, false);
  assert.ok(
    catalog.generators
      .filter((item) => item.id !== 'qwen3-tts-local')
      .every((item) => item.installed === true),
  );
  assert.equal(fixture.calls.length, 0, 'unpublished completeness checks must not bootstrap');
});

test('install streams JSONL progress and permits only one task per generator', async (t) => {
  const fixture = await createFixture({ delayMs: 25 });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const manager = fixture.createManager();
  const progress = [];
  const acceptance = 'a'.repeat(64);
  let barrierCalled = false;
  let liveProgress;
  const task = manager.install('qwen3-tts-local', {
    licenseAcceptance: acceptance,
    beforeInstall: async () => {
      assert.equal(
        fixture.calls.some((call) => call.args.includes('install')),
        false,
        'the worker-stop barrier must run before the installer process starts',
      );
      barrierCalled = true;
    },
    onProgress: (value) => {
      progress.push(value);
      liveProgress = manager.taskStatus('qwen3-tts-local');
    },
  });
  assert.equal(manager.isInstalling('qwen3-tts-local'), true);
  assert.throws(
    () => manager.install('qwen3-tts-local'),
    (error) => error instanceof ManagedAudioInstallerError && error.statusCode === 409,
  );
  assert.throws(
    () => manager.install('voxcpm2-local', { shellArgs: ['--evil'] }),
    /does not accept option: shellArgs/,
  );
  assert.throws(
    () => manager.install('voxcpm2-local', { licenseAcceptance: 'not-a-sha' }),
    /catalog SHA-256/,
  );

  const result = await task;
  assert.equal(manager.isInstalling('qwen3-tts-local'), false);
  assert.equal(barrierCalled, true);
  assert.equal(result.status, 'done');
  assert.deepEqual(
    progress.map((item) => item.status),
    ['pending', 'downloading', 'done'],
  );
  assert.equal(liveProgress.completedBytes, 100);
  assert.equal(liveProgress.totalBytes, 100);
  const terminal = manager.taskStatus('qwen3-tts-local');
  assert.equal(terminal.status, 'done');
  assert.equal(terminal.phase, 'complete');
  assert.equal(terminal.completedBytes, 100);
  assert.equal(terminal.totalBytes, 100);
  assert.equal(Object.hasOwn(terminal, 'progress'), false);
  const installCall = fixture.calls.find((call) => call.args.includes('install'));
  assert.ok(installCall);
  assert.deepEqual(installCall.args, [
    '-I',
    '-B',
    '-u',
    fixture.installerPath,
    'install',
    '--generator-id',
    'qwen3-tts-local',
    '--operation-id',
    terminal.operationId,
    '--progress-jsonl',
    '--accept-license',
    acceptance,
  ]);
});

test('Abort, explicit cancel and stopAll terminate active fixed-generator tasks', async (t) => {
  const fixture = await createFixture({ delayMs: 1_000 });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const manager = fixture.createManager();

  const abortController = new AbortController();
  let observeAbortProgress;
  const abortProgress = waitForProgress((listener) => {
    observeAbortProgress = listener;
  });
  const abortedTask = manager.install('chattts-local', {
    signal: abortController.signal,
    onProgress: (progress) => observeAbortProgress(progress),
  });
  await abortProgress;
  abortController.abort();
  await assert.rejects(abortedTask, (error) => error?.name === 'AbortError');
  assert.equal(manager.taskStatus('chattts-local').status, 'cancelled');

  let qwenProgressListener;
  let voxProgressListener;
  const qwenReady = waitForProgress((listener) => {
    qwenProgressListener = listener;
  });
  const voxReady = waitForProgress((listener) => {
    voxProgressListener = listener;
  });
  const qwenTask = manager.install('qwen3-tts-local', {
    onProgress: (progress) => qwenProgressListener(progress),
  });
  const voxTask = manager.install('voxcpm2-local', {
    onProgress: (progress) => voxProgressListener(progress),
  });
  const settledTasks = Promise.allSettled([qwenTask, voxTask]);
  await Promise.all([qwenReady, voxReady]);
  await manager.stopAll();
  const settled = await settledTasks;
  assert.deepEqual(
    settled.map((item) => item.status),
    ['rejected', 'rejected'],
  );
  assert.equal(manager.taskStatus('qwen3-tts-local').status, 'cancelled');
  assert.equal(manager.taskStatus('voxcpm2-local').status, 'cancelled');

  const log = await fixtureLog(fixture);
  const cancelOperations = log
    .filter((entry) => entry.kind === 'python' && entry.args.includes('cancel'))
    .map((entry) => entry.args[entry.args.indexOf('--operation-id') + 1]);
  assert.equal(cancelOperations.length, 3);
  assert.ok(cancelOperations.every((operationId) => /^[a-f0-9]{32}$/.test(operationId)));
});

test('a late cancel reports done when Python safely commits the installation', async (t) => {
  const fixture = await createFixture({ delayMs: 50, ignoreCancel: true });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const manager = fixture.createManager();
  let progressListener;
  const ready = waitForProgress((listener) => {
    progressListener = listener;
  });
  const task = manager.install('qwen3-tts-local', {
    onProgress: (progress) => progressListener(progress),
  });
  await ready;
  const cancelled = manager.cancel('qwen3-tts-local');
  const [result, status] = await Promise.all([task, cancelled]);
  assert.equal(result.status, 'done');
  assert.equal(status.status, 'done');
  assert.equal(manager.taskStatus('qwen3-tts-local').status, 'done');
});

test('bootstrap marker cannot redirect execution to another Python path', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-audio-untrusted-python-'));
  const outsidePython = join(root, 'outside', 'python.exe');
  await mkdir(dirname(outsidePython), { recursive: true });
  await writeFile(outsidePython, 'untrusted\n');
  const fixture = await createFixture({ markerPython: outsidePython });
  t.after(async () => {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });
  const manager = fixture.createManager();
  await assert.rejects(
    manager.catalog(),
    (error) => error instanceof ManagedAudioInstallerError && error.statusCode === 403,
  );
  assert.equal(fixture.calls.length, 1, 'untrusted marker must be rejected before Python spawn');
});
