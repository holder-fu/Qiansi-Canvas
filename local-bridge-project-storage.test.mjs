import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function waitForBridge(origin, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Bridge 提前退出：${output()}`);
    try {
      const response = await fetch(`${origin}/health?session=1`, {
        headers: { Origin: origin },
      });
      if (response.ok) return;
    } catch {
      // Startup is asynchronous.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Bridge 启动超时：${output()}`);
}

async function jsonRequest(origin, path, init) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: { Origin: origin, ...init?.headers },
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

function startBridge(dataRoot, port) {
  let output = '';
  const child = spawn(process.execPath, ['local-bridge.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      QIANSI_CANVAS_DATA_DIR: dataRoot,
      QIANSI_CANVAS_BRIDGE_PORT: String(port),
      QIANSI_CANVAS_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

async function stopBridge(child) {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (child.exitCode !== null) resolveExit();
    else child.once('exit', resolveExit);
  });
}

test(
  'two bridge ports sharing one data root serialize catalog initialization and rebase independent project writes',
  { timeout: 45_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-cross-port-bridge-data-'));
    const projectsRoot = join(dataRoot, 'projects');
    await mkdir(projectsRoot, { recursive: true });
    const exitedOwner = spawn(process.execPath, ['-e', '']);
    const exitedOwnerPid = exitedOwner.pid;
    await new Promise((resolveExit) => exitedOwner.once('exit', resolveExit));
    assert.ok(Number.isSafeInteger(exitedOwnerPid));
    const staleAt = Date.now() - 10_000;
    const staleCatalogLock = join(projectsRoot, '.projects-catalog.lock');
    await writeFile(
      staleCatalogLock,
      JSON.stringify({
        version: 1,
        token: 'stale-catalog-owner',
        pid: exitedOwnerPid,
        createdAt: staleAt,
      }),
      'utf8',
    );
    await utimes(staleCatalogLock, staleAt / 1_000, staleAt / 1_000);
    const firstPort = await availablePort();
    let secondPort = await availablePort();
    while (secondPort === firstPort) secondPort = await availablePort();
    const firstOrigin = `http://127.0.0.1:${firstPort}`;
    const secondOrigin = `http://127.0.0.1:${secondPort}`;
    const first = startBridge(dataRoot, firstPort);
    const second = startBridge(dataRoot, secondPort);
    try {
      await Promise.all([
        waitForBridge(firstOrigin, first.child, first.output),
        waitForBridge(secondOrigin, second.child, second.output),
      ]);

      const initialCatalogs = await Promise.all([
        jsonRequest(firstOrigin, '/projects'),
        jsonRequest(secondOrigin, '/projects'),
      ]);
      for (const result of initialCatalogs) {
        assert.equal(result.response.status, 200, JSON.stringify(result.payload));
        assert.equal(result.payload.primaryProjectId, 'main-canvas');
        assert.deepEqual(
          result.payload.projects.map((project) => project.id),
          ['main-canvas'],
        );
      }

      const concurrentWrites = await Promise.all([
        jsonRequest(firstOrigin, '/projects/main-canvas/workspaces/views', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: 1,
            workspace: { nodes: [{ id: 'from-first-port' }], edges: [] },
          }),
        }),
        jsonRequest(secondOrigin, '/projects/main-canvas/workspaces/views', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: 1,
            workspace: { nodes: [{ id: 'from-second-port' }], edges: [] },
          }),
        }),
      ]);
      assert.deepEqual(
        concurrentWrites
          .map((result) => result.response.status)
          .sort((left, right) => left - right),
        [200, 200],
      );
      assert.deepEqual(
        concurrentWrites
          .map((result) => result.payload.revision)
          .sort((left, right) => left - right),
        [2, 3],
      );
      assert.equal(
        concurrentWrites.some((result) => result.payload.rebased === true),
        true,
      );

      const [firstRead, secondRead] = await Promise.all([
        jsonRequest(firstOrigin, '/projects/main-canvas'),
        jsonRequest(secondOrigin, '/projects/main-canvas'),
      ]);
      assert.equal(firstRead.response.status, 200, JSON.stringify(firstRead.payload));
      assert.equal(secondRead.response.status, 200, JSON.stringify(secondRead.payload));
      assert.equal(firstRead.payload.revision, 3);
      assert.equal(secondRead.payload.revision, 3);
      assert.deepEqual(firstRead.payload.workspace, secondRead.payload.workspace);
      assert.deepEqual(
        firstRead.payload.workspace.workspaces.views.nodes.map((node) => node.id).sort(),
        ['from-first-port', 'from-second-port'],
      );

      const catalog = JSON.parse(await readFile(join(projectsRoot, 'projects.json'), 'utf8'));
      assert.equal(catalog.projects.find((project) => project.id === 'main-canvas').revision, 3);
      assert.equal(
        (await readdir(projectsRoot)).some((name) => name.includes('.lock')),
        false,
      );
    } finally {
      await Promise.all([stopBridge(first.child), stopBridge(second.child)]);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);

test(
  'local Bridge persists granular project revisions and managed Director media in its configured data root',
  { timeout: 30_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-local-bridge-data-'));
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    let output = '';
    const child = spawn(process.execPath, ['local-bridge.mjs'], {
      cwd: new URL('.', import.meta.url),
      env: {
        ...process.env,
        QIANSI_CANVAS_DATA_DIR: dataRoot,
        QIANSI_CANVAS_BRIDGE_PORT: String(port),
        QIANSI_CANVAS_HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    try {
      await waitForBridge(origin, child, () => output);

      const projectCatalogFile = join(dataRoot, 'projects', 'projects.json');
      const initialCatalog = await jsonRequest(origin, '/projects');
      assert.equal(initialCatalog.response.status, 200, JSON.stringify(initialCatalog.payload));
      assert.equal(initialCatalog.payload.version, 2);
      assert.equal(initialCatalog.payload.primaryProjectId, 'main-canvas');
      assert.equal(initialCatalog.payload.canvasProjectId, 'main-canvas');
      assert.deepEqual(
        initialCatalog.payload.projects.map((project) => project.id),
        ['main-canvas'],
      );
      assert.equal(
        initialCatalog.payload.projects.some((project) =>
          ['clocktower', 'starsea', 'swordcity'].includes(project.id),
        ),
        false,
      );
      const persistedInitialCatalog = JSON.parse(await readFile(projectCatalogFile, 'utf8'));
      assert.equal(persistedInitialCatalog.version, 2);
      assert.equal(persistedInitialCatalog.primaryProjectId, 'main-canvas');

      const mainCanvas = await jsonRequest(origin, '/projects/main-canvas');
      assert.equal(mainCanvas.response.status, 200, JSON.stringify(mainCanvas.payload));
      assert.equal(mainCanvas.payload.isPrimary, true);
      assert.equal(mainCanvas.payload.primaryProjectId, 'main-canvas');
      assert.deepEqual(mainCanvas.payload.workspace.workspaces.views, { nodes: [], edges: [] });
      assert.deepEqual(mainCanvas.payload.workspace.tabs, [
        { id: 'tab-main-canvas', name: '画板 1', workspace: 'views' },
      ]);

      const resolvedPrimary = await jsonRequest(origin, '/projects/primary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateProjectId: 'main-canvas' }),
      });
      assert.equal(resolvedPrimary.response.status, 200, JSON.stringify(resolvedPrimary.payload));
      assert.equal(resolvedPrimary.payload.primaryProjectId, 'main-canvas');
      assert.equal(resolvedPrimary.payload.claimed, false);
      const rejectedLegacyClaim = await jsonRequest(origin, '/projects/primary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateProjectId: 'holder' }),
      });
      assert.equal(rejectedLegacyClaim.response.status, 400);
      assert.match(rejectedLegacyClaim.payload.error.message, /主画布/u);
      const rejectedPrimaryDelete = await jsonRequest(origin, '/projects/main-canvas', {
        method: 'DELETE',
      });
      assert.equal(rejectedPrimaryDelete.response.status, 400);
      assert.equal(rejectedPrimaryDelete.payload.error.message, '主画布不能归档。');

      const folderRequest = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '短片项目', requestId: 'folder_request_001' }),
      };
      const folder = await jsonRequest(origin, '/project-folders', folderRequest);
      assert.equal(folder.response.status, 201, JSON.stringify(folder.payload));
      const repeatedFolder = await jsonRequest(origin, '/project-folders', folderRequest);
      assert.equal(repeatedFolder.response.status, 200, JSON.stringify(repeatedFolder.payload));
      assert.equal(repeatedFolder.payload.folder.id, folder.payload.folder.id);
      assert.equal(
        repeatedFolder.payload.catalog.catalogRevision,
        folder.payload.catalog.catalogRevision,
      );
      const renamedFolder = await jsonRequest(
        origin,
        `/project-folders/${folder.payload.folder.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '短片项目集' }),
        },
      );
      assert.equal(renamedFolder.response.status, 200, JSON.stringify(renamedFolder.payload));
      assert.equal(renamedFolder.payload.folder.name, '短片项目集');

      const missingIdempotency = await jsonRequest(origin, '/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '缺少幂等标识' }),
      });
      assert.equal(missingIdempotency.response.status, 400);
      assert.match(missingIdempotency.payload.error.message, /requestId|expectedCatalogRevision/u);

      const implicitCreateRequest = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '自动幂等项目',
          expectedCatalogRevision: renamedFolder.payload.catalog.catalogRevision,
        }),
      };
      const implicitCreated = await jsonRequest(origin, '/projects', implicitCreateRequest);
      assert.equal(implicitCreated.response.status, 201, JSON.stringify(implicitCreated.payload));
      const implicitRetried = await jsonRequest(origin, '/projects', implicitCreateRequest);
      assert.equal(implicitRetried.response.status, 200, JSON.stringify(implicitRetried.payload));
      assert.equal(implicitRetried.payload.project.id, implicitCreated.payload.project.id);

      const createRequest = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '新建短片',
          folderId: folder.payload.folder.id,
          requestId: 'project_request_001',
        }),
      };
      const createdProject = await jsonRequest(origin, '/projects', createRequest);
      assert.equal(createdProject.response.status, 201, JSON.stringify(createdProject.payload));
      assert.deepEqual(createdProject.payload.workspace.workspaces.views, {
        nodes: [],
        edges: [],
      });
      assert.equal(createdProject.payload.project.folderId, folder.payload.folder.id);
      const repeatedCreate = await jsonRequest(origin, '/projects', createRequest);
      assert.equal(repeatedCreate.response.status, 200, JSON.stringify(repeatedCreate.payload));
      assert.equal(repeatedCreate.payload.project.id, createdProject.payload.project.id);

      const createdProjectId = createdProject.payload.project.id;
      const createdWrite = await jsonRequest(
        origin,
        `/projects/${createdProjectId}/workspaces/views`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: 1,
            workspace: { nodes: [{ id: 'created-project-node' }], edges: [] },
          }),
        },
      );
      assert.equal(createdWrite.response.status, 200, JSON.stringify(createdWrite.payload));
      assert.equal(createdWrite.payload.revision, 2);

      const catalogBeforeRename = await jsonRequest(origin, '/projects');
      assert.equal(
        catalogBeforeRename.response.status,
        200,
        JSON.stringify(catalogBeforeRename.payload),
      );
      const renameCatalogRevision = catalogBeforeRename.payload.catalogRevision;
      const renamedProject = await jsonRequest(origin, `/projects/${createdProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '重命名短片',
          expectedRevision: 2,
          expectedCatalogRevision: renameCatalogRevision,
        }),
      });
      assert.equal(renamedProject.response.status, 200, JSON.stringify(renamedProject.payload));
      assert.equal(renamedProject.payload.project.name, '重命名短片');
      assert.equal(renamedProject.payload.revision, 3);
      assert.ok(renamedProject.payload.catalog.catalogRevision > renameCatalogRevision);

      const staleCatalogRename = await jsonRequest(origin, `/projects/${createdProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '不应写入的旧目录重命名',
          expectedRevision: 3,
          expectedCatalogRevision: renameCatalogRevision,
        }),
      });
      assert.equal(
        staleCatalogRename.response.status,
        409,
        JSON.stringify(staleCatalogRename.payload),
      );
      assert.equal(
        staleCatalogRename.payload.currentCatalogRevision,
        renamedProject.payload.catalog.catalogRevision,
      );
      const projectAfterStaleCatalogRename = await jsonRequest(
        origin,
        `/projects/${createdProjectId}`,
      );
      assert.equal(projectAfterStaleCatalogRename.response.status, 200);
      assert.equal(projectAfterStaleCatalogRename.payload.revision, 3);
      assert.equal(projectAfterStaleCatalogRename.payload.workspace.projectName, '重命名短片');

      const rejectedExternalCover = await jsonRequest(origin, `/projects/${createdProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverUrl: 'https://example.test/not-managed.png',
          coverAssetId: 'asset_external',
          expectedRevision: 3,
        }),
      });
      assert.equal(rejectedExternalCover.response.status, 400);

      const coverWebp = Buffer.alloc(16);
      coverWebp.write('RIFF', 0, 'ascii');
      coverWebp.writeUInt32LE(8, 4);
      coverWebp.write('WEBP', 8, 'ascii');
      coverWebp.write('VP8 ', 12, 'ascii');
      const projectCoverPreview = await jsonRequest(origin, '/media-preview/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'image/webp', 'Content-Length': String(coverWebp.length) },
        body: coverWebp,
      });
      assert.equal(
        projectCoverPreview.response.status,
        201,
        JSON.stringify(projectCoverPreview.payload),
      );
      const mainCanvasImageWrite = await jsonRequest(
        origin,
        '/projects/main-canvas/workspaces/views',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: 1,
            workspace: {
              nodes: [
                {
                  id: 'main-cover-image',
                  type: 'image',
                  position: { x: 0, y: 0 },
                  data: {
                    kind: 'image',
                    previewUrl: projectCoverPreview.payload.url,
                  },
                },
              ],
              edges: [],
            },
          }),
        },
      );
      assert.equal(
        mainCanvasImageWrite.response.status,
        200,
        JSON.stringify(mainCanvasImageWrite.payload),
      );
      const catalogWithAutomaticCover = await jsonRequest(origin, '/projects');
      assert.equal(catalogWithAutomaticCover.response.status, 200);
      const mainCanvasSummary = catalogWithAutomaticCover.payload.projects.find(
        (project) => project.id === 'main-canvas',
      );
      assert.equal(mainCanvasSummary.autoCoverUrl, projectCoverPreview.payload.url);
      assert.equal(mainCanvasSummary.autoCoverAssetId, projectCoverPreview.payload.id);
      const coveredProject = await jsonRequest(origin, `/projects/${createdProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverUrl: projectCoverPreview.payload.url,
          coverAssetId: projectCoverPreview.payload.id,
          expectedRevision: 3,
        }),
      });
      assert.equal(coveredProject.response.status, 200, JSON.stringify(coveredProject.payload));
      assert.equal(coveredProject.payload.revision, 4);
      assert.equal(coveredProject.payload.project.coverAssetId, projectCoverPreview.payload.id);

      const duplicatedProject = await jsonRequest(
        origin,
        `/projects/${createdProjectId}/duplicate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '重命名短片副本', requestId: 'duplicate_request_001' }),
        },
      );
      assert.equal(
        duplicatedProject.response.status,
        201,
        JSON.stringify(duplicatedProject.payload),
      );
      assert.equal(
        duplicatedProject.payload.workspace.workspaces.views.nodes[0].id,
        'created-project-node',
      );
      assert.notEqual(duplicatedProject.payload.project.id, createdProjectId);

      const archivedProject = await jsonRequest(origin, `/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 4 }),
      });
      assert.equal(archivedProject.response.status, 200, JSON.stringify(archivedProject.payload));
      assert.equal(archivedProject.payload.archived, true);
      const lateWrite = await jsonRequest(
        origin,
        `/projects/${createdProjectId}/workspaces/views`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: 4,
            workspace: { nodes: [{ id: 'must-not-resurrect' }], edges: [] },
          }),
        },
      );
      assert.notEqual(lateWrite.response.status, 200);
      assert.equal((await readdir(join(dataRoot, 'projects'))).includes(createdProjectId), false);
      assert.equal(
        (await readdir(join(dataRoot, 'project-archive', '.tombstones'))).includes(
          `${createdProjectId}.json`,
        ),
        true,
      );
      const deletedFolder = await jsonRequest(
        origin,
        `/project-folders/${folder.payload.folder.id}`,
        { method: 'DELETE' },
      );
      assert.equal(deletedFolder.response.status, 200, JSON.stringify(deletedFolder.payload));
      assert.equal(deletedFolder.payload.deletedFolderId, folder.payload.folder.id);
      assert.equal(
        deletedFolder.payload.catalog.projects.find(
          (project) => project.id === duplicatedProject.payload.project.id,
        ).folderId,
        null,
      );

      const viewsBody = {
        expectedRevision: 2,
        manifestPatch: {
          projectName: '画布',
          workspace: 'views',
          tabs: [{ id: 'tab-views', name: '画板', workspace: 'views' }],
          activeTabId: 'tab-views',
          genParams: { quality: '2k' },
          activeTags: ['角色', '角色'],
        },
        workspace: {
          nodes: [
            {
              id: 'image-1',
              data: {
                assetId: 'asset_stable_001',
                originalUrl: '/asset-library/files/asset_stable_001',
                previewUrl: '/media-preview/files/preview_stable_001.webp',
                slots: ['face', 'face'],
              },
            },
          ],
          edges: [],
        },
      };
      const views = await jsonRequest(origin, '/projects/main-canvas/workspaces/views', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewsBody),
      });
      assert.equal(views.response.status, 200, JSON.stringify(views.payload));
      assert.equal(views.payload.revision, 3);
      assert.deepEqual(views.payload.workspace.nodes[0].data.slots, ['face', 'face']);

      const repeatedViews = await jsonRequest(origin, '/projects/main-canvas/workspaces/views', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewsBody),
      });
      assert.equal(repeatedViews.response.status, 200, JSON.stringify(repeatedViews.payload));
      assert.equal(repeatedViews.payload.revision, 3);

      const video = await jsonRequest(origin, '/projects/main-canvas/workspaces/video', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 3,
          workspace: { nodes: [{ id: 'video-1', data: { kind: 'video' } }], edges: [] },
        }),
      });
      assert.equal(video.response.status, 200, JSON.stringify(video.payload));
      assert.equal(video.payload.revision, 4);

      const trash = await jsonRequest(origin, '/projects/main-canvas/trash', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 4,
          trash: [{ id: 'trash-1', nodes: [], edges: [] }],
        }),
      });
      assert.equal(trash.response.status, 200, JSON.stringify(trash.payload));
      assert.equal(trash.payload.revision, 5);

      const assembled = await jsonRequest(origin, '/projects/main-canvas');
      assert.equal(assembled.response.status, 200, JSON.stringify(assembled.payload));
      assert.equal(assembled.payload.workspace.version, 2);
      assert.equal(assembled.payload.workspace.workspaces.views.nodes[0].id, 'image-1');
      assert.equal(assembled.payload.workspace.workspaces.video.nodes[0].id, 'video-1');
      assert.deepEqual(assembled.payload.workspace.trash, [
        { id: 'trash-1', nodes: [], edges: [] },
      ]);
      assert.equal(
        assembled.payload.workspace.workspaces.views.nodes[0].data.originalUrl,
        '/asset-library/files/asset_stable_001',
      );
      assert.equal(assembled.payload.primaryProjectId, 'main-canvas');
      assert.equal(assembled.payload.isPrimary, true);

      const stale = await jsonRequest(origin, '/projects/main-canvas/workspaces/views', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 1,
          workspace: {
            nodes: [{ id: 'image-1', data: { kind: 'image', title: '冲突覆盖' } }],
            edges: [],
          },
        }),
      });
      assert.equal(stale.response.status, 409);
      assert.equal(stale.payload.currentRevision, 5);

      const legacyReadOnlyDirectory = join(dataRoot, 'projects', 'legacy_read_only');
      await mkdir(legacyReadOnlyDirectory, { recursive: true });
      await writeFile(
        join(legacyReadOnlyDirectory, 'project.json'),
        JSON.stringify({
          version: 1,
          projectId: 'legacy_read_only',
          projectName: '旧画布',
          nodes: [{ id: 'legacy-node' }],
          edges: [],
        }),
        'utf8',
      );
      const legacyReadOnly = await jsonRequest(origin, '/projects/legacy_read_only');
      assert.equal(legacyReadOnly.response.status, 200, JSON.stringify(legacyReadOnly.payload));
      assert.equal(legacyReadOnly.payload.workspace.workspaces.views.nodes[0].id, 'legacy-node');

      await writeFile(
        projectCatalogFile,
        JSON.stringify({
          version: 1,
          projects: [
            {
              id: 'clocktower',
              name: '旧演示画布',
              title: '旧演示画布',
              createdAt: 1,
            },
            {
              id: 'project_http',
              name: '旧画布',
              title: '旧画布',
              createdAt: 2,
            },
          ],
          updatedAt: 3,
        }),
        'utf8',
      );
      const migratedCatalog = await jsonRequest(origin, '/projects');
      assert.equal(migratedCatalog.response.status, 200, JSON.stringify(migratedCatalog.payload));
      assert.equal(migratedCatalog.payload.version, 2);
      assert.equal(migratedCatalog.payload.primaryProjectId, 'main-canvas');
      const migratedProjectIds = new Set(
        migratedCatalog.payload.projects.map((project) => project.id),
      );
      assert.deepEqual(
        ['clocktower', 'project_http', 'legacy_read_only', 'main-canvas'].filter(
          (id) => !migratedProjectIds.has(id),
        ),
        [],
      );
      assert.equal(migratedProjectIds.has(duplicatedProject.payload.project.id), true);
      const reconciledDuplicate = migratedCatalog.payload.projects.find(
        (project) => project.id === duplicatedProject.payload.project.id,
      );
      assert.equal(reconciledDuplicate.name, '重命名短片副本');
      assert.equal(reconciledDuplicate.coverAssetId, projectCoverPreview.payload.id);
      const persistedMigratedCatalog = JSON.parse(await readFile(projectCatalogFile, 'utf8'));
      assert.deepEqual(
        new Set(persistedMigratedCatalog.projects.map((project) => project.id)),
        migratedProjectIds,
      );
      const retriedDuplicate = await jsonRequest(
        origin,
        `/projects/${createdProjectId}/duplicate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '重命名短片副本', requestId: 'duplicate_request_001' }),
        },
      );
      assert.equal(retriedDuplicate.response.status, 200, JSON.stringify(retriedDuplicate.payload));
      assert.equal(retriedDuplicate.payload.project.id, duplicatedProject.payload.project.id);
      const preservedMainAfterLegacyCatalog = await jsonRequest(origin, '/projects/main-canvas');
      assert.equal(
        preservedMainAfterLegacyCatalog.payload.workspace.workspaces.views.nodes[0].id,
        'image-1',
      );

      const malformedCatalog = '{"version":1,"projects":[';
      await writeFile(projectCatalogFile, malformedCatalog, 'utf8');
      const savedWithoutCatalog = await jsonRequest(
        origin,
        '/projects/main-canvas/workspaces/audio',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: 5,
            workspace: { nodes: [{ id: 'audio-1', data: { kind: 'audio' } }], edges: [] },
          }),
        },
      );
      assert.equal(
        savedWithoutCatalog.response.status,
        503,
        JSON.stringify(savedWithoutCatalog.payload),
      );
      assert.match(savedWithoutCatalog.payload.error.message, /修订已经提交/u);
      assert.equal(await readFile(projectCatalogFile, 'utf8'), malformedCatalog);
      const authoritativeManifest = JSON.parse(
        await readFile(join(dataRoot, 'projects', 'main-canvas', 'project.json'), 'utf8'),
      );
      assert.equal(authoritativeManifest.revision, 6);
      assert.ok(authoritativeManifest.workspaceIds.includes('audio'));
      const recoveredWithoutCatalog = await jsonRequest(origin, '/projects/main-canvas');
      assert.equal(recoveredWithoutCatalog.response.status, 200);
      assert.equal(recoveredWithoutCatalog.payload.revision, 6);
      assert.equal(
        recoveredWithoutCatalog.payload.workspace.workspaces.audio.nodes[0].id,
        'audio-1',
      );
      assert.equal(recoveredWithoutCatalog.payload.primaryProjectId, 'main-canvas');

      const malformedCatalogRead = await jsonRequest(origin, '/projects');
      assert.equal(malformedCatalogRead.response.status, 500);
      assert.match(malformedCatalogRead.payload.error.message, /损坏，已拒绝覆盖/u);
      assert.equal(await readFile(projectCatalogFile, 'utf8'), malformedCatalog);

      const glb = Buffer.alloc(20);
      glb.writeUInt32LE(0x46546c67, 0);
      glb.writeUInt32LE(2, 4);
      glb.writeUInt32LE(glb.length, 8);
      const model = await jsonRequest(origin, '/asset-library/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': String(glb.length),
          'X-Qiansi-Canvas-File-Name': 'actor.glb',
          'X-Qiansi-Canvas-Project': 'project_http',
          'X-Qiansi-Canvas-Kind': 'director-model',
        },
        body: glb,
      });
      assert.equal(model.response.status, 201, JSON.stringify(model.payload));
      assert.equal(model.payload.item.kind, 'director-model');
      assert.equal(model.payload.item.mime, 'model/gltf-binary');
      assert.match(model.payload.item.url, /^\/asset-library\/files\/asset_/u);

      const webp = Buffer.alloc(16);
      webp.write('RIFF', 0, 'ascii');
      webp.writeUInt32LE(8, 4);
      webp.write('WEBP', 8, 'ascii');
      webp.write('VP8 ', 12, 'ascii');
      const preview = await jsonRequest(origin, '/media-preview/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'image/webp', 'Content-Length': String(webp.length) },
        body: webp,
      });
      assert.equal(preview.response.status, 201, JSON.stringify(preview.payload));
      assert.ok(
        (await readdir(join(dataRoot, 'asset-library', 'previews'))).includes(
          `${preview.payload.id}.webp`,
        ),
      );

      const libraryFile = join(dataRoot, 'asset-library', 'library.json');
      const library = JSON.parse(await readFile(libraryFile, 'utf8'));
      assert.equal(library.items[0].id, model.payload.item.id);
      assert.equal(library.items[0].kind, 'director-model');
      assert.ok(
        await readFile(join(dataRoot, 'asset-library', 'files', library.items[0].fileName)).then(
          (value) => value.equals(glb),
        ),
      );

      const malformed = '{"version":1,"items":[';
      await writeFile(libraryFile, malformed, 'utf8');
      const failedClosed = await jsonRequest(origin, '/asset-library');
      assert.equal(failedClosed.response.status, 500);
      assert.match(failedClosed.payload.error.message, /损坏，已拒绝覆盖/u);
      assert.equal(await readFile(libraryFile, 'utf8'), malformed);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
      await new Promise((resolveExit) => {
        if (child.exitCode !== null) resolveExit();
        else child.once('exit', resolveExit);
      });
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);
