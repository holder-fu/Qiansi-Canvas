import { afterEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

function memoryStorage(values = new Map<string, string>()): Storage {
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

function installBrowser(storage: Storage) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    },
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function catalog() {
  return {
    version: 2,
    primaryProjectId: 'main-canvas',
    projects: [
      { id: 'main-canvas', name: '主项目', revision: 2, activeWorkspace: 'views' },
      { id: 'project-target', name: '目标项目', revision: 7, activeWorkspace: 'views' },
    ],
  };
}

function targetProject() {
  return {
    project: { id: 'project-target', name: '目标项目', revision: 7, activeWorkspace: 'views' },
    revision: 7,
    manifest: {
      version: 3,
      projectId: 'project-target',
      projectName: '目标项目',
      revision: 7,
      currentWorkspace: 'views',
      activeTabId: 'target-tab',
    },
    workspace: {
      version: 2,
      projectId: 'project-target',
      projectName: '目标项目',
      currentWorkspace: 'views',
      activeTabId: 'target-tab',
      workspaces: {
        views: {
          nodes: [
            {
              id: 'target-node',
              type: 'text',
              position: { x: 80, y: 120 },
              data: { kind: 'text', title: '目标节点', prompt: '只属于目标项目' },
            },
          ],
          edges: [],
        },
      },
      tabs: [{ id: 'target-tab', name: '目标画板', workspace: 'views' }],
      assets: [],
      trash: [],
      genParams: {},
      activeTags: [],
    },
  };
}

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean })
    .__QIANSI_FORCE_BRIDGE_PERSISTENCE__;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('Bridge project switching transaction', () => {
  it('loads and applies the complete target project, then remembers it locally', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>();
    installBrowser(memoryStorage(values));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/projects')) return json(catalog());
        if (url.endsWith('/projects/project-target')) return json(targetProject());
        return json({ error: { message: `unexpected ${url}` } }, 500);
      }),
    });

    const { openBridgeCanvasProject, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      projectName: '主项目',
      projects: [{ id: 'main-canvas', name: '主项目' }],
      workspace: 'home',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
      genParams: {
        ...useCanvasStore.getState().genParams,
        quality: '4K',
        duration: 12,
      },
    });

    await expect(openBridgeCanvasProject('project-target')).resolves.toBe(true);
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'project-target',
      projectName: '目标项目',
      workspace: 'views',
      projects: [
        { id: 'main-canvas', name: '主项目' },
        { id: 'project-target', name: '目标项目' },
      ],
    });
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['target-node']);
    expect(useCanvasStore.getState().genParams).toMatchObject({
      quality: '2K',
      duration: 5,
    });
    expect(values.get('qiansi-canvas-current-project-id')).toBe('project-target');
  });

  it('opens the covered media workspace when the recorded workspace only contains templates', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    installBrowser(memoryStorage());
    const result = targetProject();
    result.project.activeWorkspace = 'video';
    Object.assign(result.project, {
      autoCoverUrl: '/media-preview/files/preview-covered.webp',
      autoCoverAssetId: 'preview-covered',
    });
    result.manifest.currentWorkspace = 'video';
    Object.assign(result.workspace, {
      currentWorkspace: 'video',
      workspaces: {
        video: {
          nodes: [
            {
              id: 'empty-video-template',
              type: 'video',
              position: { x: 80, y: 120 },
              data: { kind: 'video', title: '视频', portInputs: [] },
            },
          ],
          edges: [],
        },
        views: {
          nodes: [
            {
              id: 'covered-image',
              type: 'image',
              position: { x: 80, y: 120 },
              data: {
                kind: 'image',
                title: '已保存图片',
                originalUrl: '/asset-library/files/asset-covered',
                previewUrl: '/media-preview/files/preview-covered.webp',
                bridgeAssetId: 'asset-covered',
              },
            },
          ],
          edges: [],
        },
      },
    });
    const targetCatalog = catalog();
    const targetCatalogProject = targetCatalog.projects[1];
    if (!targetCatalogProject) throw new Error('target project fixture is missing');
    Object.assign(targetCatalogProject, result.project);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/projects')) return json(targetCatalog);
        if (url.endsWith('/projects/project-target')) return json(result);
        return json({ error: { message: `unexpected ${url}` } }, 500);
      }),
    });

    const { openBridgeCanvasProject, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      projectName: '主项目',
      workspace: 'home',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
    });

    await expect(openBridgeCanvasProject('project-target')).resolves.toBe(true);
    expect(useCanvasStore.getState().workspace).toBe('views');
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['covered-image']);
  });

  it('retries until the catalog and complete project describe the same revision', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    installBrowser(memoryStorage());
    let projectReads = 0;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/projects')) {
          const result = catalog();
          result.projects[1] = {
            id: 'project-target',
            name: '已重命名目标',
            revision: 8,
            activeWorkspace: 'views',
          };
          return json(result);
        }
        if (url.endsWith('/projects/project-target')) {
          projectReads += 1;
          const result = targetProject();
          if (projectReads > 1) {
            result.revision = 8;
            result.project.name = '已重命名目标';
            result.project.revision = 8;
            result.manifest.projectName = '已重命名目标';
            result.manifest.revision = 8;
            result.workspace.projectName = '已重命名目标';
          }
          return json(result);
        }
        return json({ error: { message: `unexpected ${url}` } }, 500);
      }),
    });

    const { openBridgeCanvasProject, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      projectName: '主项目',
      workspace: 'home',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
    });

    await expect(openBridgeCanvasProject('project-target')).resolves.toBe(true);
    expect(projectReads).toBe(2);
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'project-target',
      projectName: '已重命名目标',
    });
  });

  it('ignores a late target read when the source project changes during loading', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    installBrowser(memoryStorage());
    let resolveTarget!: (response: Response) => void;
    const targetResponse = new Promise<Response>((resolve) => {
      resolveTarget = resolve;
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/projects')) return json(catalog());
        if (url.endsWith('/projects/project-target')) return targetResponse;
        return json({ error: { message: `unexpected ${url}` } }, 500);
      }),
    });

    const { openBridgeCanvasProject, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      projectName: '主项目',
      projects: [{ id: 'main-canvas', name: '主项目' }],
      workspace: 'home',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
    });
    const opening = openBridgeCanvasProject('project-target');
    useCanvasStore.setState({ projectName: '读取期间的新修改' });
    resolveTarget(json(targetProject()));

    await expect(opening).resolves.toBe(false);
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'main-canvas',
      projectName: '读取期间的新修改',
      workspace: 'home',
    });
    expect(useCanvasStore.getState().nodes).toEqual([]);
  });

  it('keeps the source project open when its pre-switch save is not confirmed', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    installBrowser(memoryStorage());
    const requests: Array<{ url: string; method: string }> = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        requests.push({ url, method });
        if (method === 'PUT' && url.endsWith('/projects/main-canvas/workspaces/views')) {
          return json({ error: { message: '来源项目已被另一终端更新' }, currentRevision: 12 }, 409);
        }
        return json({ error: { message: `unexpected ${method} ${url}` } }, 500);
      }),
    });

    const { openBridgeCanvasProject, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      projectName: '主项目',
      projects: [
        { id: 'main-canvas', name: '主项目' },
        { id: 'project-target', name: '目标项目' },
      ],
      workspace: 'views',
      nodes: [
        {
          id: 'source-node',
          type: 'text',
          position: { x: 10, y: 20 },
          data: { kind: 'text', title: '来源节点', prompt: '不得丢失' },
        },
      ],
      edges: [],
      assets: [],
      trash: [],
    });

    await expect(openBridgeCanvasProject('project-target')).resolves.toBe(false);
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'main-canvas',
      projectName: '主项目',
      workspace: 'views',
    });
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['source-node']);
    expect(requests.some(({ url }) => url.endsWith('/projects/project-target'))).toBe(false);
  });

  it('does not reopen an archived active project from the Home workspace cache', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    installBrowser(memoryStorage());
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/projects')) {
        return json({
          version: 2,
          primaryProjectId: 'main-canvas',
          projects: [{ id: 'main-canvas', name: '主项目', revision: 2, activeWorkspace: 'views' }],
        });
      }
      return json({ error: { message: `unexpected ${url}` } }, 500);
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const { useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'project-target',
      projectName: '已归档项目',
      projects: [
        { id: 'main-canvas', name: '主项目' },
        { id: 'project-target', name: '已归档项目' },
      ],
      workspace: 'home',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
    });

    useCanvasStore.getState().switchTabWorkspace('views');

    expect(useCanvasStore.getState().workspaceTransition).toBe('views');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus.message).toContain('已归档'),
    );
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'project-target',
      workspace: 'home',
      nodes: [],
      edges: [],
      workspaceTransition: null,
    });
  });

  it('creates a new project and durably seeds the selected Home workflow', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    installBrowser(memoryStorage());
    const mainProject = {
      id: 'main-canvas',
      name: '旧项目',
      createdAt: 1,
      updatedAt: 2,
      revision: 2,
      activeWorkspace: 'views',
    };
    const createdProject = {
      id: 'project-story',
      name: '故事脚本生成',
      createdAt: 3,
      updatedAt: 3,
      revision: 1,
      activeWorkspace: 'views',
    };
    const catalogBefore = {
      version: 2,
      catalogRevision: 4,
      primaryProjectId: 'main-canvas',
      projects: [mainProject],
      folders: [],
    };
    const catalogAfter = {
      ...catalogBefore,
      catalogRevision: 5,
      projects: [mainProject, createdProject],
    };
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined;
        requests.push({ url, method, ...(body ? { body } : {}) });
        if (method === 'GET' && url.endsWith('/projects')) {
          return json(
            requests.some((request) => request.method === 'POST') ? catalogAfter : catalogBefore,
          );
        }
        if (method === 'POST' && url.endsWith('/projects')) {
          return json({ project: createdProject, revision: 1, catalog: catalogAfter }, 201);
        }
        if (method === 'GET' && url.endsWith('/projects/project-story')) {
          return json({
            project: createdProject,
            revision: 1,
            manifest: {
              version: 3,
              projectId: 'project-story',
              projectName: '故事脚本生成',
              revision: 1,
              currentWorkspace: 'views',
              activeTabId: 'tab-project-story-views',
            },
            workspace: {
              version: 2,
              projectId: 'project-story',
              projectName: '故事脚本生成',
              currentWorkspace: 'views',
              activeTabId: 'tab-project-story-views',
              workspaces: { views: { nodes: [], edges: [] } },
              tabs: [{ id: 'tab-project-story-views', name: '画板 1', workspace: 'views' }],
              assets: [],
              trash: [],
              genParams: {},
              activeTags: [],
            },
          });
        }
        if (method === 'PUT' && url.endsWith('/projects/project-story/workspaces/script')) {
          const workspace = body?.workspace as { nodes: unknown[]; edges: unknown[] };
          return json({
            projectId: 'project-story',
            workspaceId: 'script',
            workspace,
            revision: 2,
            manifest: {
              version: 3,
              projectId: 'project-story',
              projectName: '故事脚本生成',
              revision: 2,
              currentWorkspace: 'script',
              activeTabId: 'tab-project-story-script',
            },
          });
        }
        return json({ error: { message: `unexpected ${method} ${url}` } }, 500);
      }),
    });

    const { createBridgeWorkflowProject, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      projectName: '旧项目',
      projects: [{ id: 'main-canvas', name: '旧项目' }],
      workspace: 'home',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
    });

    const onProjectCreated = vi.fn();
    await expect(
      createBridgeWorkflowProject('script', '故事脚本生成', { onProjectCreated }),
    ).resolves.toBe(true);
    expect(onProjectCreated).toHaveBeenCalledWith('project-story', '故事脚本生成');
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'project-story',
      projectName: '故事脚本生成',
      workspace: 'script',
      workspaceTransition: null,
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0]).toMatchObject({
      type: 'text',
      data: { kind: 'text' },
    });
    const createRequest = requests.find((request) => request.method === 'POST');
    expect(createRequest?.body).toMatchObject({
      name: '故事脚本生成',
      expectedCatalogRevision: 4,
    });
    expect(createRequest?.body?.requestId).toMatch(/^workflow-/);
    const seedSave = requests.find(
      (request) => request.method === 'PUT' && request.url.endsWith('/workspaces/script'),
    );
    if (!seedSave?.body) throw new Error('故事脚本工作台未提交。');
    expect(seedSave?.body).toMatchObject({ expectedRevision: 1 });
    expect(
      (seedSave.body.workspace as { nodes: Array<{ data: { kind: string } }> }).nodes[0]?.data.kind,
    ).toBe('text');
    expect(
      requests.some(
        (request) => request.method === 'PUT' && request.url.includes('/projects/main-canvas/'),
      ),
    ).toBe(false);
  });
});
