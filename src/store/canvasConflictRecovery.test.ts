import { afterEach, describe, expect, it, vi } from 'vitest';

function mapStorage(values = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

function installScheduledHydrationWindow() {
  const idleTasks: Array<{ callback: () => void; timeout?: number }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrame: vi.fn(),
      requestIdleCallback: (callback: () => void, options?: { timeout?: number }) => {
        idleTasks.push({ callback, timeout: options?.timeout });
        return 1;
      },
      cancelIdleCallback: vi.fn(),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    },
  });
  return idleTasks;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();
  vi.clearAllTimers();
  delete (globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean })
    .__QIANSI_FORCE_BRIDGE_PERSISTENCE__;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('canvas Bridge conflict recovery', () => {
  it('requires a current exported backup and never overwrites edits made during the host read', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(
        new Map([
          ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
        ]),
      ),
    });
    const idleTasks = installScheduledHydrationWindow();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    const firstProjectRead = deferred<Response>();
    let projectReadCount = 0;
    const hostProject = {
      version: 2,
      projectId: 'main-canvas',
      projectName: '主机画布',
      workspaces: {
        views: {
          nodes: [
            {
              id: 'host-node',
              type: 'text',
              position: { x: 300, y: 180 },
              data: { kind: 'text', title: '主机节点', prompt: '主机版本' },
            },
          ],
          edges: [],
        },
      },
      tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
      assets: [],
      trash: [],
      genParams: {},
      activeTags: [],
      revision: 2,
    };
    const projectResponse = () =>
      jsonResponse({
        projectId: 'main-canvas',
        project: { id: 'main-canvas', name: '主机画布', revision: 2 },
        workspace: hostProject,
        revision: 2,
        manifest: {
          version: 3,
          projectId: 'main-canvas',
          projectName: '主机画布',
          revision: 2,
          currentWorkspace: 'views',
          tabs: hostProject.tabs,
          activeTabId: 'bridge-tab',
          assets: [],
          activeTags: [],
          genParams: {},
        },
      });

    const requests: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (method === 'GET' && url.endsWith('/projects')) {
        return jsonResponse({
          version: 2,
          primaryProjectId: 'main-canvas',
          canvasProjectId: 'main-canvas',
          projects: [
            { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views', revision: 1 },
          ],
        });
      }
      if (method === 'GET' && url.includes('/projects/main-canvas/workspaces/views')) {
        return jsonResponse({
          projectId: 'main-canvas',
          workspaceId: 'views',
          workspace: { nodes: [], edges: [] },
          revision: 1,
          manifest: {
            version: 3,
            projectId: 'main-canvas',
            projectName: '我的画布',
            revision: 1,
            currentWorkspace: 'views',
            tabs: hostProject.tabs,
            activeTabId: 'bridge-tab',
            assets: [],
            activeTags: [],
            genParams: {},
          },
        });
      }
      if (method === 'PUT' && url.includes('/projects/main-canvas/workspaces/views')) {
        return jsonResponse({ currentRevision: 2, error: { message: '主机同字段已更新' } }, 409);
      }
      if (method === 'GET' && url.endsWith('/projects/main-canvas')) {
        projectReadCount += 1;
        return projectReadCount === 1 ? firstProjectRead.promise : projectResponse();
      }
      return jsonResponse({ error: { message: `unexpected request: ${url}` } }, 500);
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const {
      exportCanvasPersistenceConflictCopy,
      flushCanvasPersistence,
      getCanvasPersistenceConflictCopy,
      reloadCanvasFromBridgeAfterConflict,
      useCanvasStore,
    } = await import('./canvasStore');

    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
        state: 'saved',
        revision: 1,
      }),
    );
    useCanvasStore.setState({
      nodes: [
        {
          id: 'local-node',
          type: 'text',
          position: { x: 20, y: 20 },
          data: { kind: 'text', title: '本地节点', prompt: '本地冲突内容' },
        },
      ],
      edges: [],
    });
    await expect(flushCanvasPersistence()).resolves.toBe(false);
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      state: 'conflict',
      conflictingWriterId: 'bridge-remote',
      conflictCopyAvailable: true,
    });

    await expect(reloadCanvasFromBridgeAfterConflict()).resolves.toBe(false);
    expect(projectReadCount).toBe(0);
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['local-node']);

    const firstBackup = exportCanvasPersistenceConflictCopy('main-canvas');
    expect(firstBackup).toContain('localSharedProject');
    expect(firstBackup).toContain('本地冲突内容');
    const firstRecovery = reloadCanvasFromBridgeAfterConflict();
    await vi.waitFor(() => expect(projectReadCount).toBe(1));
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, prompt: '读取期间的新修改' },
      })),
    }));
    firstProjectRead.resolve(projectResponse());
    await expect(firstRecovery).resolves.toBe(false);
    expect(useCanvasStore.getState().nodes).toEqual([
      expect.objectContaining({
        id: 'local-node',
        data: expect.objectContaining({ prompt: '读取期间的新修改' }),
      }),
    ]);
    expect(useCanvasStore.getState().persistenceStatus.state).toBe('conflict');

    const currentBackup = exportCanvasPersistenceConflictCopy('main-canvas');
    expect(currentBackup).toContain('读取期间的新修改');
    await expect(reloadCanvasFromBridgeAfterConflict()).resolves.toBe(true);
    expect(useCanvasStore.getState()).toMatchObject({
      projectName: '主机画布',
      nodes: [expect.objectContaining({ id: 'host-node' })],
      past: [],
      future: [],
      persistenceStatus: {
        state: 'saved',
        revision: 2,
        writerId: 'bridge',
        conflictCopyAvailable: false,
      },
    });
    expect(getCanvasPersistenceConflictCopy('main-canvas')).toBeUndefined();
    expect(
      requests.filter(
        (request) => request.method === 'GET' && request.url.endsWith('/projects/main-canvas'),
      ),
    ).toHaveLength(2);
  });
});
