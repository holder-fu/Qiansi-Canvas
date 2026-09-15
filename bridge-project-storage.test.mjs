import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { link, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
  BridgeFileBusyError,
  BridgeProjectLockTimeoutError,
  BridgeProjectStorage,
  ProjectRevisionConflictError,
  ProjectArchivedError,
  atomicWriteJson,
  readJsonIfExists,
  renameWithTransientRetry,
  resolveCanvasDataRoot,
} from './bridge-project-storage.mjs';

async function withStorage(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-project-storage-'));
  try {
    return await run(new BridgeProjectStorage({ dataRoot: root, ...options }), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function workspace(projectId = 'project_one') {
  const stableOriginal = '/asset-library/files/asset_original_001';
  const stablePreview = '/media-preview/files/preview_001.webp';
  return {
    version: 2,
    projectId,
    projectName: '测试项目',
    workspace: 'views',
    workspaces: {
      views: {
        nodes: [
          {
            id: 'image-1',
            data: {
              kind: 'image',
              originalUrl: stableOriginal,
              previewUrl: stablePreview,
              assetId: 'asset_original_001',
              referenceSlots: ['face', 'face'],
            },
          },
        ],
        edges: [],
      },
      video: { nodes: [{ id: 'video-1', data: { kind: 'video' } }], edges: [] },
    },
    tabs: [
      { id: 'tab-views', name: '画板', workspace: 'views' },
      { id: 'tab-video', name: '视频', workspace: 'video' },
    ],
    activeTabId: 'tab-views',
    assets: [{ id: 'asset_original_001', url: stableOriginal }],
    trash: [{ id: 'trash-1', nodes: [], edges: [] }],
    genParams: { quality: '2k' },
    activeTags: ['人物', '人物'],
  };
}

async function writeProjectLock(root, projectId, pid, acquiredAt) {
  const token = 'a'.repeat(32);
  const lockRoot = join(root, '.bridge-locks', 'projects');
  const ownerFileName = `.${projectId}.${pid}.${token}.owner`;
  const ownerFile = join(lockRoot, ownerFileName);
  const lockFile = join(lockRoot, `${projectId}.lock`);
  await mkdir(lockRoot, { recursive: true });
  await writeFile(
    ownerFile,
    JSON.stringify({
      version: 1,
      projectId,
      pid,
      token,
      ownerFile: ownerFileName,
      acquiredAt,
    }),
    'utf8',
  );
  await link(ownerFile, lockFile);
  return { lockRoot, ownerFile, lockFile };
}

test('resolves an explicit independent data root without changing the configured path', () => {
  const configured = join(tmpdir(), 'qiansi-data-root');
  assert.equal(
    resolveCanvasDataRoot('/application', { QIANSI_CANVAS_DATA_DIR: configured }),
    configured,
  );
  assert.equal(resolveCanvasDataRoot('/application', {}), resolve('/application', 'data'));
});

test('retries transient Windows rename failures without weakening the atomic rename contract', async () => {
  const attempts = [];
  const waits = [];
  await renameWithTransientRetry('temporary-revision', 'final-revision', {
    renameFile: async (source, destination) => {
      attempts.push([source, destination]);
      if (attempts.length < 3) {
        const error = new Error('temporarily locked');
        error.code = 'EPERM';
        throw error;
      }
    },
    wait: async (milliseconds) => waits.push(milliseconds),
    backoffMs: [5, 10, 20],
  });
  assert.equal(attempts.length, 3);
  assert.deepEqual(waits, [5, 10]);
  assert.deepEqual(attempts[0], ['temporary-revision', 'final-revision']);
});

test('reports an actionable storage error after bounded rename retries are exhausted', async () => {
  let attempts = 0;
  await assert.rejects(
    renameWithTransientRetry('temporary-revision', 'final-revision', {
      renameFile: async () => {
        attempts += 1;
        const error = new Error('access denied');
        error.code = 'EACCES';
        throw error;
      },
      wait: async () => {},
      backoffMs: [1, 1],
    }),
    (error) =>
      error instanceof BridgeFileBusyError &&
      error.code === 'BRIDGE_FILE_BUSY' &&
      !error.message.includes('temporary-revision'),
  );
  assert.equal(attempts, 3);
});

test('does not retry non-transient rename failures', async () => {
  let attempts = 0;
  await assert.rejects(
    renameWithTransientRetry('temporary-revision', 'final-revision', {
      renameFile: async () => {
        attempts += 1;
        const error = new Error('missing parent');
        error.code = 'ENOENT';
        throw error;
      },
      wait: async () => assert.fail('non-transient rename must not wait'),
    }),
    /missing parent/,
  );
  assert.equal(attempts, 1);
});

test('atomically creates one deterministic empty primary canvas without replacing later data', async () => {
  await withStorage(async (storage, root) => {
    const concurrentStorage = new BridgeProjectStorage({ dataRoot: root });
    const options = {
      projectName: '画布',
      workspaceId: 'views',
      workspace: { nodes: [], edges: [] },
      manifestPatch: {
        tabs: [{ id: 'tab-main-canvas', name: '画板 1', workspace: 'views' }],
        activeTabId: 'tab-main-canvas',
      },
    };
    const [first, concurrent] = await Promise.all([
      storage.ensureProject(BRIDGE_PRIMARY_CANVAS_PROJECT_ID, options),
      concurrentStorage.ensureProject(BRIDGE_PRIMARY_CANVAS_PROJECT_ID, options),
    ]);
    assert.deepEqual([first.created, concurrent.created].sort(), [false, true]);
    assert.equal(first.revision, 1);
    assert.equal(concurrent.revision, 1);
    assert.deepEqual(first.workspace.workspaces.views, { nodes: [], edges: [] });
    assert.equal(first.workspace.activeTabId, 'tab-main-canvas');

    const changed = await storage.saveWorkspace(BRIDGE_PRIMARY_CANVAS_PROJECT_ID, 'views', {
      expectedRevision: 1,
      workspace: { nodes: [{ id: 'kept-node' }], edges: [] },
    });
    assert.equal(changed.revision, 2);
    const ensuredAgain = await storage.ensureProject(BRIDGE_PRIMARY_CANVAS_PROJECT_ID, options);
    assert.equal(ensuredAgain.created, false);
    assert.equal(ensuredAgain.revision, 2);
    assert.equal(ensuredAgain.workspace.workspaces.views.nodes[0].id, 'kept-node');
    const revisions = (
      await readdir(join(root, 'projects', BRIDGE_PRIMARY_CANVAS_PROJECT_ID, 'revisions'))
    ).filter((name) => !name.startsWith('.tmp-'));
    assert.equal(revisions.length, 2);
  });
});

test('does not overwrite a malformed existing primary canvas document', async () => {
  await withStorage(async (storage, root) => {
    const directory = join(root, 'projects', BRIDGE_PRIMARY_CANVAS_PROJECT_ID);
    const file = join(directory, 'project.json');
    const malformed = '{"version":3,"format":"qiansi-canvas-project"';
    await mkdir(directory, { recursive: true });
    await writeFile(file, malformed, 'utf8');
    await assert.rejects(storage.ensureProject(BRIDGE_PRIMARY_CANVAS_PROJECT_ID), SyntaxError);
    assert.equal(await readFile(file, 'utf8'), malformed);
  });
});

test('keeps a fresh primary canvas isolated from the legacy project root', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-primary-data-'));
  const legacyRoot = await mkdtemp(join(tmpdir(), 'qiansi-primary-legacy-'));
  try {
    const legacyPrimaryDirectory = join(legacyRoot, BRIDGE_PRIMARY_CANVAS_PROJECT_ID);
    const legacyReadOnlyDirectory = join(legacyRoot, 'legacy_read_only');
    await mkdir(legacyPrimaryDirectory, { recursive: true });
    await mkdir(legacyReadOnlyDirectory, { recursive: true });
    const legacyPrimary = workspace(BRIDGE_PRIMARY_CANVAS_PROJECT_ID);
    legacyPrimary.workspaces.views.nodes[0].id = 'must-not-load';
    await writeFile(
      join(legacyPrimaryDirectory, 'project.json'),
      JSON.stringify(legacyPrimary),
      'utf8',
    );
    await writeFile(
      join(legacyReadOnlyDirectory, 'project.json'),
      JSON.stringify(workspace('legacy_read_only')),
      'utf8',
    );

    const storage = new BridgeProjectStorage({
      dataRoot,
      legacyProjectsRoot: legacyRoot,
    });
    const ensured = await storage.ensureProject(BRIDGE_PRIMARY_CANVAS_PROJECT_ID, {
      projectName: '画布',
      workspaceId: 'views',
      workspace: { nodes: [], edges: [] },
    });
    assert.equal(ensured.created, true);
    assert.deepEqual(ensured.workspace.workspaces.views, { nodes: [], edges: [] });
    assert.equal(
      storage.sourceProjectDirectory(BRIDGE_PRIMARY_CANVAS_PROJECT_ID),
      join(dataRoot, 'projects', BRIDGE_PRIMARY_CANVAS_PROJECT_ID),
    );

    const legacyReadOnly = await storage.readProject('legacy_read_only');
    assert.equal(legacyReadOnly.workspaces.views.nodes[0].id, 'image-1');
    assert.equal(
      JSON.parse(await readFile(join(legacyPrimaryDirectory, 'project.json'), 'utf8')).workspaces
        .views.nodes[0].id,
      'must-not-load',
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(legacyRoot, { recursive: true, force: true });
  }
});

test('commits immutable revisions and preserves stable URLs, array order, and duplicate slots', async () => {
  await withStorage(async (storage, root) => {
    const first = await storage.saveProject('project_one', {
      expectedRevision: 0,
      workspace: workspace(),
    });
    assert.equal(first.revision, 1);
    assert.equal(
      first.workspace.workspaces.views.nodes[0].data.originalUrl,
      '/asset-library/files/asset_original_001',
    );
    assert.deepEqual(first.workspace.workspaces.views.nodes[0].data.referenceSlots, [
      'face',
      'face',
    ]);
    assert.deepEqual(first.workspace.activeTags, ['人物', '人物']);

    const manifestPath = join(root, 'projects', 'project_one', 'project.json');
    const firstManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(firstManifest.version, 3);
    assert.deepEqual(firstManifest.workspaceIds, ['video', 'views']);
    const firstRevisionPath = join(
      root,
      'projects',
      'project_one',
      'revisions',
      firstManifest.currentRevision,
    );
    assert.deepEqual((await readdir(join(firstRevisionPath, 'workspaces'))).sort(), [
      'video.json',
      'views.json',
    ]);

    const second = await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: 1,
      manifestPatch: { projectName: '重命名项目', activeTags: ['镜头', '镜头'] },
      workspace: {
        nodes: [{ id: 'image-2', data: { originalUrl: 'https://cdn.example.test/original.png' } }],
        edges: [],
      },
    });
    assert.equal(second.revision, 2);
    assert.equal(second.manifest.projectName, '重命名项目');
    assert.deepEqual(second.manifest.activeTags, ['镜头', '镜头']);

    const assembled = await storage.readProject('project_one');
    assert.equal(assembled.workspaces.views.nodes[0].id, 'image-2');
    assert.equal(assembled.workspaces.video.nodes[0].id, 'video-1');
    assert.deepEqual(
      assembled.tabs.map((tab) => tab.id),
      ['tab-views', 'tab-video'],
    );
    assert.equal(
      assembled.workspaces.views.nodes[0].data.originalUrl,
      'https://cdn.example.test/original.png',
    );
    assert.deepEqual(
      await readFile(join(firstRevisionPath, 'trash.json'), 'utf8').then(JSON.parse),
      [{ id: 'trash-1', nodes: [], edges: [] }],
    );
  });
});

test('granular startup reads only the requested workspace and project trash', async () => {
  await withStorage(async (storage, root) => {
    await storage.saveProject('project_one', { expectedRevision: 0, workspace: workspace() });
    const manifest = JSON.parse(
      await readFile(join(root, 'projects', 'project_one', 'project.json'), 'utf8'),
    );
    await writeFile(
      join(
        root,
        'projects',
        'project_one',
        'revisions',
        manifest.currentRevision,
        'workspaces',
        'video.json',
      ),
      '{broken',
      'utf8',
    );
    assert.equal(
      (await storage.readWorkspace('project_one', 'views')).workspace.nodes[0].id,
      'image-1',
    );
    assert.deepEqual((await storage.readTrash('project_one')).trash, [
      { id: 'trash-1', nodes: [], edges: [] },
    ]);
    await assert.rejects(storage.readProject('project_one'), SyntaxError);
  });
});

test('requires expectedRevision and rebases a stale no-op without creating a revision', async () => {
  await withStorage(async (storage, root) => {
    await storage.saveProject('project_one', { expectedRevision: 0, workspace: workspace() });
    await assert.rejects(
      storage.saveWorkspace('project_one', 'views', { workspace: { nodes: [], edges: [] } }),
      /expectedRevision/,
    );
    const staleNoop = await storage.saveTrash('project_one', {
      expectedRevision: 0,
      trash: [],
    });
    assert.equal(staleNoop.revision, 1);
    assert.equal(staleNoop.rebased, true);
    assert.deepEqual(staleNoop.trash, workspace().trash);
    const revisions = await readdir(join(root, 'projects', 'project_one', 'revisions'));
    assert.equal(revisions.filter((name) => !name.startsWith('.tmp-')).length, 1);
  });
});

test('serializes and safely merges non-overlapping writes across storage instances', async () => {
  await withStorage(async (firstStorage, root) => {
    const secondStorage = new BridgeProjectStorage({ dataRoot: root });
    await firstStorage.saveWorkspace('project_one', 'views', {
      expectedRevision: 0,
      workspace: { nodes: [], edges: [] },
    });

    const largeValue = 'x'.repeat(512 * 1024);
    const writes = await Promise.allSettled([
      firstStorage.saveWorkspace('project_one', 'views', {
        expectedRevision: 1,
        workspace: { nodes: [{ id: 'first-writer', data: { value: largeValue } }], edges: [] },
      }),
      secondStorage.saveWorkspace('project_one', 'views', {
        expectedRevision: 1,
        workspace: { nodes: [{ id: 'second-writer', data: { value: largeValue } }], edges: [] },
      }),
    ]);

    const fulfilled = writes.filter((result) => result.status === 'fulfilled');
    assert.equal(fulfilled.length, 2);
    assert.deepEqual(
      fulfilled.map((result) => result.value.revision).sort((left, right) => left - right),
      [2, 3],
    );
    assert.equal(
      fulfilled.some((result) => result.value.rebased),
      true,
    );
    const stored = await firstStorage.readWorkspace('project_one', 'views');
    assert.equal(stored.revision, 3);
    assert.deepEqual(stored.workspace.nodes.map((node) => node.id).sort(), [
      'first-writer',
      'second-writer',
    ]);
    assert.deepEqual(await readdir(join(root, '.bridge-locks', 'projects')), []);
  });
});

test('keeps an overlapping same-leaf edit as a real revision conflict', async () => {
  await withStorage(async (storage) => {
    const first = await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: 0,
      workspace: {
        nodes: [{ id: 'shared-node', position: { x: 0, y: 0 }, data: { title: '原始' } }],
        edges: [],
      },
    });
    await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: first.revision,
      workspace: {
        nodes: [{ id: 'shared-node', position: { x: 10, y: 0 }, data: { title: '原始' } }],
        edges: [],
      },
    });

    await assert.rejects(
      storage.saveWorkspace('project_one', 'views', {
        expectedRevision: first.revision,
        workspace: {
          nodes: [{ id: 'shared-node', position: { x: 20, y: 0 }, data: { title: '原始' } }],
          edges: [],
        },
      }),
      (error) => error instanceof ProjectRevisionConflictError && error.currentRevision === 2,
    );
    assert.equal(
      (await storage.readWorkspace('project_one', 'views')).workspace.nodes[0].position.x,
      10,
    );
  });
});

test('merges different fields on one node and independent trash records', async () => {
  await withStorage(async (storage) => {
    const first = await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: 0,
      workspace: {
        nodes: [{ id: 'shared-node', position: { x: 0, y: 0 }, data: { title: '原始' } }],
        edges: [],
      },
    });
    const moved = await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: first.revision,
      workspace: {
        nodes: [{ id: 'shared-node', position: { x: 12, y: 4 }, data: { title: '原始' } }],
        edges: [],
      },
    });
    const renamed = await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: first.revision,
      workspace: {
        nodes: [{ id: 'shared-node', position: { x: 0, y: 0 }, data: { title: '新标题' } }],
        edges: [],
      },
    });
    assert.equal(renamed.rebased, true);
    assert.equal(renamed.revision, moved.revision + 1);
    assert.deepEqual(renamed.workspace.nodes[0], {
      id: 'shared-node',
      position: { x: 12, y: 4 },
      data: { title: '新标题' },
    });
    assert.deepEqual(renamed.project.workspaces.views, renamed.workspace);

    const trashBase = renamed.revision;
    const firstTrash = await storage.saveTrash('project_one', {
      expectedRevision: trashBase,
      trash: [{ id: 'trash-a', nodes: [], edges: [] }],
    });
    const secondTrash = await storage.saveTrash('project_one', {
      expectedRevision: trashBase,
      trash: [{ id: 'trash-b', nodes: [], edges: [] }],
    });
    assert.equal(firstTrash.revision + 1, secondTrash.revision);
    assert.equal(secondTrash.rebased, true);
    assert.deepEqual(secondTrash.trash.map((item) => item.id).sort(), ['trash-a', 'trash-b']);
    assert.deepEqual(secondTrash.project.trash, secondTrash.trash);
  });
});

test('rebases a stale full-project save when its leaves do not overlap the host edit', async () => {
  await withStorage(async (storage) => {
    const source = workspace();
    await storage.saveProject('project_one', { expectedRevision: 0, workspace: source });
    await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: 1,
      workspace: {
        ...source.workspaces.views,
        nodes: source.workspaces.views.nodes.map((node) =>
          node.id === 'image-1' ? { ...node, position: { x: 120, y: 80 } } : node,
        ),
      },
    });

    const local = structuredClone(source);
    local.workspaces.views.nodes[0].data.title = '本地标题';
    const result = await storage.saveProject('project_one', {
      expectedRevision: 1,
      workspace: local,
    });

    assert.equal(result.rebased, true);
    assert.equal(result.revision, 3);
    assert.deepEqual(result.workspace.workspaces.views.nodes[0].position, { x: 120, y: 80 });
    assert.equal(result.workspace.workspaces.views.nodes[0].data.title, '本地标题');
  });
});

test('times out without deleting a live lock and reclaims only a verified dead stale owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-project-lock-'));
  const projectId = 'project_one';
  try {
    const liveLock = await writeProjectLock(root, projectId, process.pid, Date.now() - 10_000);
    const storage = new BridgeProjectStorage({
      dataRoot: root,
      projectLockTimeoutMs: 40,
      projectLockRetryMs: 5,
      projectLockStaleMs: 1,
    });
    await assert.rejects(
      storage.ensureProject(projectId),
      (error) =>
        error instanceof BridgeProjectLockTimeoutError && error.code === 'PROJECT_LOCK_TIMEOUT',
    );
    assert.equal(JSON.parse(await readFile(liveLock.lockFile, 'utf8')).pid, process.pid);
    await rm(liveLock.lockFile);
    await rm(liveLock.ownerFile);

    const exited = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const exitedPid = exited.pid;
    await new Promise((resolveExit, rejectExit) => {
      exited.once('error', rejectExit);
      exited.once('exit', resolveExit);
    });
    assert.ok(Number.isSafeInteger(exitedPid));
    await writeProjectLock(root, projectId, exitedPid, Date.now() - 10_000);

    const ensured = await storage.ensureProject(projectId, {
      workspace: { nodes: [], edges: [] },
    });
    assert.equal(ensured.created, true);
    assert.equal(ensured.revision, 1);
    assert.deepEqual(await readdir(join(root, '.bridge-locks', 'projects')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns the current revision for identical autosaves even when their expected revision is stale', async () => {
  await withStorage(async (storage, root) => {
    const source = workspace();
    const first = await storage.saveProject('project_one', {
      expectedRevision: 0,
      workspace: source,
    });
    assert.equal(first.revision, 1);
    const manifestPath = join(root, 'projects', 'project_one', 'project.json');
    const initialManifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    const sameWorkspace = await storage.saveWorkspace('project_one', 'views', {
      expectedRevision: 0,
      workspace: source.workspaces.views,
    });
    assert.equal(sameWorkspace.revision, 1);
    assert.equal(sameWorkspace.manifest.currentRevision, initialManifest.currentRevision);

    const sameTrash = await storage.saveTrash('project_one', {
      expectedRevision: 0,
      trash: source.trash,
    });
    assert.equal(sameTrash.revision, 1);

    const sameProject = await storage.saveProject('project_one', {
      expectedRevision: 0,
      workspace: source,
    });
    assert.equal(sameProject.revision, 1);
    assert.equal(
      (await readdir(join(root, 'projects', 'project_one', 'revisions'))).filter(
        (name) => !name.startsWith('.tmp-'),
      ).length,
      1,
    );

    await assert.rejects(
      storage.saveWorkspace('project_one', 'views', {
        expectedRevision: 0,
        workspace: {
          nodes: [{ id: 'image-1', data: { kind: 'image', title: '并发覆盖' } }],
          edges: [],
        },
      }),
      (error) =>
        error instanceof ProjectRevisionConflictError && error.currentRevision === first.revision,
    );
  });
});

test('reads legacy v1/v2 files and preserves the original bytes before migration', async () => {
  await withStorage(async (storage, root) => {
    const projectRoot = join(root, 'projects', 'legacy_project');
    await mkdir(projectRoot, { recursive: true });
    const legacy = {
      version: 2,
      projectId: 'legacy_project',
      projectName: '旧项目',
      workspaces: {
        views: {
          nodes: [{ id: 'old-node', data: { url: '/asset-library/files/old_asset' } }],
          edges: [],
        },
      },
      tabs: [],
      assets: [],
      trash: [],
      genParams: {},
      activeTags: [],
      revision: 7,
    };
    const serialized = JSON.stringify(legacy, null, 2);
    await writeFile(join(projectRoot, 'project.json'), serialized, 'utf8');
    assert.equal(
      (await storage.readProject('legacy_project')).workspaces.views.nodes[0].id,
      'old-node',
    );

    const saved = await storage.saveWorkspace('legacy_project', 'audio', {
      expectedRevision: 7,
      workspace: { nodes: [{ id: 'audio-1', data: { kind: 'audio' } }], edges: [] },
    });
    assert.equal(saved.revision, 8);
    const assembled = await storage.readProject('legacy_project');
    assert.equal(assembled.workspaces.views.nodes[0].id, 'old-node');
    assert.equal(assembled.workspaces.audio.nodes[0].id, 'audio-1');
    const legacyCopies = await readdir(join(projectRoot, 'legacy'));
    assert.equal(legacyCopies.length, 1);
    assert.equal(await readFile(join(projectRoot, 'legacy', legacyCopies[0]), 'utf8'), serialized);
  });
});

test('atomically saves trash with manifest metadata and enforces the complete revision size bound', async () => {
  await withStorage(
    async (storage) => {
      const first = await storage.saveWorkspace('project_one', 'views', {
        expectedRevision: 0,
        manifestPatch: {
          projectName: '按需项目',
          tabs: [{ id: 'tab-1', name: '画板', workspace: 'views' }],
          genParams: { model: 'image' },
          activeTags: ['构图'],
        },
        workspace: { nodes: [], edges: [] },
      });
      const savedTrash = await storage.saveTrash('project_one', {
        expectedRevision: first.revision,
        trash: [{ id: 'trash-a', nodes: [], edges: [] }],
      });
      assert.equal(savedTrash.revision, 2);
      assert.deepEqual((await storage.readTrash('project_one')).trash, [
        { id: 'trash-a', nodes: [], edges: [] },
      ]);
      assert.equal(
        (await storage.readWorkspace('project_one', 'views')).manifest.projectName,
        '按需项目',
      );
      await assert.rejects(
        storage.saveWorkspace('project_one', 'video', {
          expectedRevision: 2,
          workspace: { nodes: [{ id: 'large', data: { prompt: 'x'.repeat(5_000) } }], edges: [] },
        }),
        /项目文件过大/,
      );
      assert.equal((await storage.readProject('project_one')).revision, 2);
    },
    { maxProjectBytes: 2_000 },
  );
});

test('keeps the current and a bounded number of immutable revisions', async () => {
  await withStorage(
    async (storage, root) => {
      let revision = 0;
      for (let index = 0; index < 7; index += 1) {
        const saved = await storage.saveWorkspace('project_one', 'views', {
          expectedRevision: revision,
          workspace: { nodes: [{ id: `node-${index}`, data: {} }], edges: [] },
        });
        revision = saved.revision;
      }
      const revisionsRoot = join(root, 'projects', 'project_one', 'revisions');
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const entries = (await readdir(revisionsRoot)).filter((name) => !name.startsWith('.tmp-'));
        if (entries.length <= 3) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      }
      const manifest = JSON.parse(
        await readFile(join(root, 'projects', 'project_one', 'project.json'), 'utf8'),
      );
      const revisions = (await readdir(revisionsRoot)).filter((name) => !name.startsWith('.tmp-'));
      assert.ok(revisions.length <= 3);
      assert.ok(revisions.includes(manifest.currentRevision));
      assert.equal(
        (await storage.readProject('project_one')).workspaces.views.nodes[0].id,
        'node-6',
      );
    },
    { retainedRevisionCount: 3 },
  );
});

test('atomicWriteJson leaves no temporary sibling after a successful replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-atomic-json-'));
  try {
    const file = join(root, 'library.json');
    await atomicWriteJson(file, { version: 1, items: [] });
    await atomicWriteJson(file, { version: 1, items: [{ id: 'asset-1' }] });
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).items, [{ id: 'asset-1' }]);
    assert.deepEqual(await readdir(root), ['library.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed authoritative JSON fails closed and leaves the original bytes untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-malformed-index-'));
  try {
    const file = join(root, 'library.json');
    const malformed = '{"version":1,"items":[';
    await writeFile(file, malformed, 'utf8');
    await assert.rejects(readJsonIfExists(file, '素材库索引'), /损坏，已拒绝覆盖/);
    assert.equal(await readFile(file, 'utf8'), malformed);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects arbitrary workspace filenames outside the fixed application allowlist', async () => {
  await withStorage(async (storage) => {
    await assert.rejects(
      storage.saveWorkspace('project_one', '../escape', {
        expectedRevision: 0,
        workspace: { nodes: [], edges: [] },
      }),
      /工作台编号无效/,
    );
    await assert.rejects(
      storage.saveProject('project_one', {
        expectedRevision: 0,
        workspace: {
          ...workspace(),
          workspaces: { arbitrary: { nodes: [], edges: [] } },
        },
      }),
      /工作台编号无效/,
    );
  });
});

test('revisions metadata, duplicates the latest snapshot, and durably blocks archived project revival', async () => {
  await withStorage(async (storage, root) => {
    const first = await storage.saveProject('project_one', {
      expectedRevision: 0,
      workspace: workspace(),
    });
    const metadata = await storage.updateProjectMetadata(
      'project_one',
      {
        name: '重命名项目',
        folderId: 'folder_one',
        coverUrl: '/asset-library/files/asset_original_001',
        coverAssetId: 'asset_original_001',
      },
      { expectedRevision: first.revision },
    );
    assert.equal(metadata.revision, 2);
    assert.equal(metadata.manifest.projectName, '重命名项目');
    assert.equal(metadata.manifest.folderId, 'folder_one');
    assert.equal(metadata.manifest.coverAssetId, 'asset_original_001');

    const duplicate = await storage.duplicateProject('project_one', 'project_copy', {
      projectName: '项目副本',
    });
    assert.equal(duplicate.created, true);
    assert.equal(duplicate.revision, 1);
    assert.equal(duplicate.workspace.projectId, 'project_copy');
    assert.equal(duplicate.workspace.projectName, '项目副本');
    assert.equal(duplicate.workspace.workspaces.views.nodes[0].id, 'image-1');
    assert.equal(
      duplicate.workspace.workspaces.views.nodes[0].data.originalUrl,
      '/asset-library/files/asset_original_001',
    );

    await assert.rejects(
      storage.archiveProject('project_one', { expectedRevision: 1 }),
      (error) => error instanceof ProjectRevisionConflictError && error.currentRevision === 2,
    );
    const archived = await storage.archiveProject('project_one', { expectedRevision: 2 });
    assert.equal(archived.archived, true);
    assert.equal(await storage.readProject('project_one'), null);
    assert.equal(
      JSON.parse(
        await readFile(join(root, 'project-archive', '.tombstones', 'project_one.json'), 'utf8'),
      ).revision,
      2,
    );
    assert.equal((await readdir(join(root, 'projects'))).includes('project_one'), false);

    const concurrentStorage = new BridgeProjectStorage({ dataRoot: root });
    await assert.rejects(
      concurrentStorage.saveWorkspace('project_one', 'views', {
        expectedRevision: 2,
        workspace: { nodes: [{ id: 'late-writer' }], edges: [] },
      }),
      (error) => error instanceof ProjectArchivedError && error.code === 'PROJECT_ARCHIVED',
    );
    await assert.rejects(
      concurrentStorage.ensureProject('project_one'),
      (error) => error instanceof ProjectArchivedError,
    );
    const repeatedArchive = await concurrentStorage.archiveProject('project_one', {
      expectedRevision: 2,
    });
    assert.equal(repeatedArchive.alreadyArchived, true);
    assert.equal((await readdir(join(root, 'projects'))).includes('project_one'), false);
  });
});
