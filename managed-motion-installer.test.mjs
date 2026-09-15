import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  ManagedMotionInstallerError,
  ManagedMotionInstallerManager,
  QIANSI_MOTION_PLUGIN_ID,
  resolveManagedMotionInstaller,
} from './managed-motion-installer.mjs';

const bytesById = {
  'gem-x': Buffer.from('gem fixture'),
  rtmw3d: Buffer.from('rtm fixture'),
  'depth-anything-v2-small': Buffer.from('depth fixture'),
  'sapiens2-normal-0.4b': Buffer.from('sapiens normal fixture'),
};

const fixtureCatalog = Object.fromEntries(
  Object.entries(bytesById).map(([id, bytes]) => [
    id,
    {
      id,
      label: id,
      fileName: `${id}.bin`,
      url: `https://official.example/${id}.bin`,
      bytes: bytes.length,
      license: { id: 'fixture', name: 'Fixture', url: 'https://official.example/license' },
      runtimeNote: 'fixture worker required',
    },
  ]),
);

async function fixtureManager() {
  const projectRoot = await mkdtemp(join(tmpdir(), 'qiansi-motion-install-'));
  const pluginRoot = join(projectRoot, 'data', 'plugins', QIANSI_MOTION_PLUGIN_ID);
  const runtimeInstallerScript = join(projectRoot, 'fixture-runtime-installer.ps1');
  await writeFile(runtimeInstallerScript, '# fixture');
  const runtimeSpawns = [];
  const manager = new ManagedMotionInstallerManager({
    projectRoot,
    pluginId: QIANSI_MOTION_PLUGIN_ID,
    pluginRoot,
    catalog: fixtureCatalog,
    platform: 'win32',
    runtimeInstallerScript,
    runtimeInstallerScripts: {
      'gem-x': runtimeInstallerScript,
      rtmw3d: runtimeInstallerScript,
      'sapiens2-normal-0.4b': runtimeInstallerScript,
    },
    spawnImpl: (command, args) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => child.emit('exit', 1);
      runtimeSpawns.push({ command, args });
      setTimeout(() => {
        child.stdout.write(
          'QIMC_INSTALL_PROGRESS {"phase":"ready","message":"fixture ready","progress":100}\n',
        );
        child.stdout.end();
        child.stderr.end();
        child.emit('exit', 0);
      }, 5);
      return child;
    },
    fetchImpl: async (url) => {
      const id = String(url).includes('gem-x')
        ? 'gem-x'
        : String(url).includes('depth-anything')
          ? 'depth-anything-v2-small'
          : String(url).includes('sapiens2')
            ? 'sapiens2-normal-0.4b'
            : 'rtmw3d';
      const bytes = bytesById[id];
      return new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      });
    },
  });
  return { projectRoot, pluginRoot, manager, runtimeSpawns };
}

test('motion model installer is restricted to the canonical trusted plugin directory', () => {
  assert.throws(
    () =>
      resolveManagedMotionInstaller({
        projectRoot: 'C:\\fixture',
        pluginId: 'other-plugin',
        pluginRoot: 'C:\\fixture\\data\\plugins\\other-plugin',
      }),
    (error) => error instanceof ManagedMotionInstallerError && error.statusCode === 403,
  );
});

test('motion model installer downloads to the fixed engine directory and removes only that model', async () => {
  const { projectRoot, pluginRoot, manager, runtimeSpawns } = await fixtureManager();
  try {
    const before = await manager.catalog();
    assert.equal(before.models.find((item) => item.id === 'rtmw3d').installed, false);

    const result = await manager.install('rtmw3d');
    assert.equal(result.status, 'done');
    assert.equal(result.installed, true);
    assert.equal(
      await readFile(join(pluginRoot, 'models', 'rtmw3d', 'rtmw3d.bin'), 'utf8'),
      'rtm fixture',
    );
    assert.equal((await manager.status('rtmw3d')).installed, true);
    assert.equal(runtimeSpawns.length, 1);

    const repaired = await manager.install('rtmw3d');
    assert.equal(repaired.status, 'done');
    assert.equal(runtimeSpawns.length, 2);

    const removed = await manager.uninstall('rtmw3d');
    assert.equal(removed.installed, false);
    assert.equal((await manager.status('rtmw3d')).installed, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('installed GEM-X weights can provision and repair the managed Worker runtime', async () => {
  const { projectRoot, pluginRoot, manager, runtimeSpawns } = await fixtureManager();
  try {
    const installed = await manager.install('gem-x');
    assert.equal(installed.status, 'done');
    assert.equal(installed.installed, true);
    assert.equal(runtimeSpawns.length, 1);
    assert.equal(
      await readFile(join(pluginRoot, 'models', 'gem-x', 'gem-x.bin'), 'utf8'),
      'gem fixture',
    );

    const repaired = await manager.install('gem-x');
    assert.equal(repaired.status, 'done');
    assert.equal(runtimeSpawns.length, 2);

    const removed = await manager.uninstall('gem-x');
    assert.equal(removed.installed, false);
    assert.equal((await manager.status('gem-x')).installed, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('failed Worker installation reports the actionable end of a long stderr log', async () => {
  const { projectRoot, pluginRoot } = await fixtureManager();
  const runtimeInstallerScript = join(projectRoot, 'failing-runtime-installer.ps1');
  await writeFile(runtimeInstallerScript, '# fixture');
  const manager = new ManagedMotionInstallerManager({
    projectRoot,
    pluginId: QIANSI_MOTION_PLUGIN_ID,
    pluginRoot,
    catalog: fixtureCatalog,
    platform: 'win32',
    runtimeInstallerScript,
    spawnImpl: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => child.emit('exit', 1);
      setTimeout(() => {
        child.stderr.write(`normal dependency output ${'x'.repeat(1_200)}`);
        child.stderr.end('\nMMCV installation failed with exit code 1.\n');
        child.emit('exit', 1);
      }, 5);
      return child;
    },
    fetchImpl: async () =>
      new Response(bytesById.rtmw3d, {
        status: 200,
        headers: { 'content-length': String(bytesById.rtmw3d.length) },
      }),
  });
  try {
    await assert.rejects(manager.install('rtmw3d'), /MMCV installation failed with exit code 1\./);
    const status = await manager.status('rtmw3d');
    assert.equal(status.status, 'error');
    assert.match(status.message, /MMCV installation failed with exit code 1\./);
    assert.doesNotMatch(status.message, /^normal dependency output/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('motion model installer rejects content whose byte size differs from the official catalog', async () => {
  const { projectRoot, pluginRoot } = await fixtureManager();
  const manager = new ManagedMotionInstallerManager({
    projectRoot,
    pluginId: QIANSI_MOTION_PLUGIN_ID,
    pluginRoot,
    catalog: fixtureCatalog,
    fetchImpl: async () =>
      new Response(Buffer.from('short'), {
        status: 200,
        headers: { 'content-length': '5' },
      }),
  });
  try {
    await assert.rejects(manager.install('gem-x'), /大小/);
    assert.equal((await manager.status('gem-x')).installed, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('managed vision catalog exposes the installable Depth Anything V2 Small package', async () => {
  const { projectRoot, pluginRoot, manager } = await fixtureManager();
  try {
    const item = (await manager.catalog()).models.find(
      (model) => model.id === 'depth-anything-v2-small',
    );
    assert.equal(item?.installed, false);
    assert.equal(item?.license.id, 'fixture');

    await manager.install('depth-anything-v2-small');
    assert.equal(
      await readFile(
        join(pluginRoot, 'models', 'depth-anything-v2-small', 'depth-anything-v2-small.bin'),
        'utf8',
      ),
      'depth fixture',
    );
    assert.equal(
      await manager.installedModelFile('depth-anything-v2-small'),
      join(pluginRoot, 'models', 'depth-anything-v2-small', 'depth-anything-v2-small.bin'),
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('managed vision catalog exposes the official Sapiens2 Normal 0.4B package', async () => {
  const { projectRoot, pluginRoot, manager, runtimeSpawns } = await fixtureManager();
  try {
    const item = (await manager.catalog()).models.find(
      (model) => model.id === 'sapiens2-normal-0.4b',
    );
    assert.equal(item?.installed, false);
    assert.equal(item?.license.id, 'fixture');

    await manager.install('sapiens2-normal-0.4b');
    assert.equal(runtimeSpawns.length, 1);
    assert.equal(
      await readFile(
        join(pluginRoot, 'models', 'sapiens2-normal-0.4b', 'sapiens2-normal-0.4b.bin'),
        'utf8',
      ),
      'sapiens normal fixture',
    );
    assert.equal((await manager.status('sapiens2-normal-0.4b')).installed, true);
    await manager.install('sapiens2-normal-0.4b');
    assert.equal(runtimeSpawns.length, 2);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('resumes a partial model download after the installer process is recreated', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'qiansi-motion-resume-'));
  const pluginRoot = join(projectRoot, 'data', 'plugins', QIANSI_MOTION_PLUGIN_ID);
  const id = 'depth-anything-v2-small';
  const bytes = bytesById[id];
  const split = 7;
  try {
    const interrupted = new ManagedMotionInstallerManager({
      projectRoot,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot,
      catalog: fixtureCatalog,
      fetchImpl: async () => {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.subarray(0, split));
              setTimeout(() => controller.error(new Error('fixture connection interrupted')), 20);
            },
          }),
          { status: 200, headers: { 'content-length': String(bytes.length) } },
        );
      },
    });
    await assert.rejects(interrupted.install(id), /interrupted/);
    assert.equal((await interrupted.status(id)).completedBytes, split);

    let requestedRange = '';
    const resumed = new ManagedMotionInstallerManager({
      projectRoot,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot,
      catalog: fixtureCatalog,
      fetchImpl: async (_url, options) => {
        requestedRange = options.headers.Range;
        return new Response(bytes.subarray(split), {
          status: 206,
          headers: {
            'content-length': String(bytes.length - split),
            'content-range': `bytes ${split}-${bytes.length - 1}/${bytes.length}`,
          },
        });
      },
    });
    const paused = await resumed.status(id);
    assert.equal(paused.status, 'idle');
    assert.equal(paused.phase, 'paused');
    assert.equal(paused.completedBytes, split);
    assert.match(paused.message, /断点继续/);

    const result = await resumed.install(id);
    assert.equal(requestedRange, `bytes=${split}-`);
    assert.equal(result.status, 'done');
    assert.deepEqual(await readFile(join(pluginRoot, 'models', id, `${id}.bin`)), bytes);
    await assert.rejects(stat(join(pluginRoot, 'models', '.installing', id)));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('restarts safely when the official server ignores a resume range', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'qiansi-motion-range-fallback-'));
  const pluginRoot = join(projectRoot, 'data', 'plugins', QIANSI_MOTION_PLUGIN_ID);
  const id = 'depth-anything-v2-small';
  const bytes = bytesById[id];
  try {
    const interrupted = new ManagedMotionInstallerManager({
      projectRoot,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot,
      catalog: fixtureCatalog,
      fetchImpl: async () => {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 3));
              setTimeout(() => controller.error(new Error('fixture connection interrupted')), 20);
            },
          }),
          { status: 200, headers: { 'content-length': String(bytes.length) } },
        );
      },
    });
    await assert.rejects(interrupted.install(id), /interrupted/);

    let requestedRange = '';
    const restarted = new ManagedMotionInstallerManager({
      projectRoot,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot,
      catalog: fixtureCatalog,
      fetchImpl: async (_url, options) => {
        requestedRange = options.headers.Range;
        return new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        });
      },
    });
    const result = await restarted.install(id);
    assert.equal(requestedRange, 'bytes=3-');
    assert.equal(result.status, 'done');
    assert.deepEqual(await readFile(join(pluginRoot, 'models', id, `${id}.bin`)), bytes);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('explicit model removal clears a retained partial download', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'qiansi-motion-resume-remove-'));
  const pluginRoot = join(projectRoot, 'data', 'plugins', QIANSI_MOTION_PLUGIN_ID);
  const id = 'depth-anything-v2-small';
  const bytes = bytesById[id];
  try {
    const interrupted = new ManagedMotionInstallerManager({
      projectRoot,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot,
      catalog: fixtureCatalog,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 4));
              setTimeout(() => controller.error(new Error('fixture connection interrupted')), 20);
            },
          }),
          { status: 200, headers: { 'content-length': String(bytes.length) } },
        ),
    });
    await assert.rejects(interrupted.install(id), /interrupted/);
    assert.equal((await interrupted.status(id)).completedBytes, 4);

    const recreated = new ManagedMotionInstallerManager({
      projectRoot,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot,
      catalog: fixtureCatalog,
    });
    await recreated.uninstall(id);
    assert.equal((await recreated.status(id)).completedBytes, 0);
    await assert.rejects(stat(join(pluginRoot, 'models', '.installing', id)));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
