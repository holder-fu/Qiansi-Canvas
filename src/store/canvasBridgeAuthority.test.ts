import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasWorkspaceStorageKey, writeCanvasWorkspaceSnapshot } from './canvasWorkspaceStorage';

const canvasStoreSource = readFileSync(new URL('./canvasStore.ts', import.meta.url), 'utf8');

function mapStorage(
  values: Map<string, string>,
  removeItem: (key: string) => void = (key) => void values.delete(key),
): Storage {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem,
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

function installScheduledHydrationWindow(addEventListener = vi.fn()) {
  const idleTasks: Array<{ callback: () => void; timeout?: number }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener,
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function successfulMainCanvasFetch(revision = 4, nodes: unknown[] = []) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.endsWith('/projects')) {
      return new Response(
        JSON.stringify({
          version: 2,
          primaryProjectId: 'main-canvas',
          canvasProjectId: 'main-canvas',
          projects: [{ id: 'main-canvas', name: '我的画布', activeWorkspace: 'views', revision }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (method === 'GET' && url.includes('/projects/main-canvas/workspaces/views')) {
      return new Response(
        JSON.stringify({
          projectId: 'main-canvas',
          workspaceId: 'views',
          workspace: { nodes, edges: [] },
          revision,
          manifest: {
            version: 3,
            projectId: 'main-canvas',
            projectName: '我的画布',
            revision,
            currentWorkspace: 'views',
            tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
            activeTabId: 'bridge-tab',
            assets: [],
            activeTags: [],
            genParams: {},
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ error: { message: 'unexpected request' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const originalFetch = globalThis.fetch;
const originalIndexedDb = globalThis.indexedDB;
const originalLocalStorage = globalThis.localStorage;
const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();
  vi.clearAllTimers();
  vi.useRealTimers();
  delete (globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean })
    .__QIANSI_FORCE_BRIDGE_PERSISTENCE__;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: originalIndexedDb,
  });
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

describe('canvas store Bridge authority', () => {
  it('reuses unchanged runtime nodes when observing a shared snapshot, but accepts a real remote edit', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
    const {
      useCanvasStore,
      sanitizeNodes,
      captureSharedProjectWorkspace,
      applySharedProjectWorkspace,
    } = await import('./canvasStore');
    useCanvasStore.setState({
      workspace: 'views',
      nodes: sanitizeNodes([
        {
          id: 'one',
          type: 'text',
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 300, height: 200 },
          data: {
            kind: 'text',
            title: 'One',
            textInstruction: '保留光标',
            composerParams: { quality: 'standard' },
          },
        },
        {
          id: 'two',
          type: 'text',
          position: { x: 400, y: 0 },
          data: { kind: 'text', title: 'Two', textInstruction: '不变' },
        },
      ]),
      edges: [],
    });
    const before = useCanvasStore.getState();
    const shared = JSON.parse(JSON.stringify(captureSharedProjectWorkspace()));
    expect(applySharedProjectWorkspace(shared)).toBe(true);
    expect(useCanvasStore.getState().nodes).toBe(before.nodes);
    shared.workspaces.views.nodes[0].data.textInstruction = '真实远端修改';
    expect(applySharedProjectWorkspace(shared)).toBe(true);
    expect(useCanvasStore.getState().nodes[0]?.data.textInstruction).toBe('真实远端修改');
    expect(useCanvasStore.getState().nodes[1]).toBe(before.nodes[1]);
    expect(useCanvasStore.getState().nodes[0]?.measured).toBe(before.nodes[0]?.measured);
  });

  it('retains a text request lease from a project-authoritative shared snapshot while home is open', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
    const { useCanvasStore, applySharedProjectWorkspace } = await import('./canvasStore');
    const state = useCanvasStore.getState();
    useCanvasStore.setState({ workspace: 'home', nodes: [], edges: [] });

    expect(
      applySharedProjectWorkspace(
        {
          version: 2,
          projectId: state.activeProjectId,
          projectName: state.projectName,
          workspaces: {
            views: {
              nodes: [
                {
                  id: 'recoverable-text',
                  type: 'text',
                  position: { x: 40, y: 50 },
                  data: {
                    kind: 'text',
                    title: '文本 1',
                    generationRequestId: 'gen-home-text-recovery',
                  },
                },
              ],
              edges: [],
            },
          },
          tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
          assets: [],
          trash: [],
          genParams: state.genParams,
          activeTags: [],
        },
        { recoverInterruptedGeneration: true },
      ),
    ).toBe(true);

    useCanvasStore.getState().setWorkspace('views');
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
        kind: 'text',
        generationRequestId: 'gen-home-text-recovery',
        generationError: expect.stringContaining('检查文本生成结果'),
      }),
    );
  });

  it('settles a JSON-roundtrip save once and preserves unchanged nested nodes and edges', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
    const idleTasks = installScheduledHydrationWindow();
    const reads = successfulMainCanvasFetch();
    let writes = 0;
    let revision = 4;
    let pendingResponse: Promise<void> | undefined;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method !== 'PUT') return reads(input, init);
        const body = JSON.parse(String(init.body));
        writes += 1;
        await pendingResponse;
        return new Response(
          JSON.stringify({
            projectId: 'main-canvas',
            workspaceId: 'views',
            workspace: body.workspace,
            revision: ++revision,
            manifest: { version: 3, projectId: 'main-canvas', revision },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    });
    const { useCanvasStore } = await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() => expect(useCanvasStore.getState().persistenceStatus.state).toBe('saved'));
    vi.useFakeTimers();
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [
        {
          id: 'prompt',
          type: 'text',
          position: { x: 0, y: 0 },
          selected: true,
          measured: { width: 300, height: 200 },
          data: {
            kind: 'text',
            title: '文本',
            textInstruction: '第一行\n在这里继续',
            composerParams: { quality: 'standard' },
            progress: 0.5,
            optional: undefined,
          },
        },
      ],
      edges: [
        {
          id: 'edge',
          source: 'prompt',
          target: 'prompt',
          data: { nested: { enabled: true } },
          selected: true,
        },
      ],
      selectedNodeId: 'prompt',
    });
    const before = useCanvasStore.getState();
    for (let index = 0; index < 5; index += 1) {
      await vi.advanceTimersByTimeAsync(400);
      expect(writes).toBe(1);
      expect(useCanvasStore.getState().nodes).toBe(before.nodes);
      expect(useCanvasStore.getState().edges).toBe(before.edges);
    }
    expect(useCanvasStore.getState().selectedNodeId).toBe('prompt');
    useCanvasStore.getState().updateNodeData('prompt', { textInstruction: '继续输入' });
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toBe(2);
    expect(useCanvasStore.getState().nodes[0]?.data.textInstruction).toBe('继续输入');
    await vi.advanceTimersByTimeAsync(1200);
    expect(writes).toBe(2);
    const blocked = deferred<void>();
    pendingResponse = blocked.promise;
    useCanvasStore.getState().updateNodeData('prompt', { textInstruction: '保存中的文本' });
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toBe(3);
    useCanvasStore.getState().updateNodeData('prompt', { textInstruction: '切回后继续粘贴' });
    const newerNodes = useCanvasStore.getState().nodes;
    pendingResponse = undefined;
    blocked.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(useCanvasStore.getState().nodes).toBe(newerNodes);
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toBe(4);
    expect(useCanvasStore.getState().nodes[0]?.data.textInstruction).toBe('切回后继续粘贴');
    await vi.advanceTimersByTimeAsync(1200);
    expect(writes).toBe(4);
  });

  it('saves only the latest dirty state after idle, including writes waiting in the Bridge queue', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
    const idleTasks = installScheduledHydrationWindow();
    const reads = successfulMainCanvasFetch();
    const writes: Array<{
      nodes: Array<{ position: { x: number; y: number } }>;
      edges: unknown[];
    }> = [];
    const heldWrite: { promise?: Promise<void> } = {};
    let revision = 4;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== 'PUT') return reads(input, init);
      const body = JSON.parse(String(init.body));
      writes.push(body.workspace);
      await heldWrite.promise;
      return new Response(
        JSON.stringify({
          projectId: 'main-canvas',
          workspaceId: 'views',
          workspace: body.workspace,
          revision: ++revision,
          manifest: { version: 3, projectId: 'main-canvas', revision },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const { useCanvasStore, _setInteracting, flushCanvasPersistence } =
      await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() => expect(useCanvasStore.getState().persistenceStatus.state).toBe('saved'));
    vi.useFakeTimers();
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [
        {
          id: 'idle-node',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { kind: 'image', title: 'Idle save' },
        },
      ],
      edges: [],
    });
    await vi.advanceTimersByTimeAsync(300);
    _setInteracting(true);
    useCanvasStore.getState().setNodePosition('idle-node', { x: 100, y: 50 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(0);
    _setInteracting(false);
    _setInteracting(true, 'viewport');
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(0);
    _setInteracting(false, 'viewport');
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.nodes[0]?.position).toEqual({ x: 100, y: 50 });

    // Explicit saves remain permitted. A queued autosave must not start if the user resumes.
    const blocked = deferred<void>();
    heldWrite.promise = blocked.promise;
    const explicit = flushCanvasPersistence();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toHaveLength(2);
    useCanvasStore.getState().setNodePosition('idle-node', { x: 200, y: 50 });
    await vi.advanceTimersByTimeAsync(400);
    _setInteracting(true);
    blocked.resolve();
    await explicit;
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(2);
    useCanvasStore.getState().setNodePosition('idle-node', { x: 300, y: 50 });
    _setInteracting(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toHaveLength(3);
    expect(writes[2]?.nodes[0]?.position).toEqual({ x: 300, y: 50 });
    _setInteracting(true);
    await expect(flushCanvasPersistence()).resolves.toBe(true);
    expect(writes).toHaveLength(4);
    _setInteracting(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(4);
  });

  it('keeps session-only media alive in memory while Bridge stores the lightweight graph', () => {
    expect(canvasStoreSource).toContain(
      'const hasSessionMedia = containsBrowserSessionMedia(preparedWorkspace)',
    );
    expect(canvasStoreSource).toContain('!hasSessionMedia &&');
    expect(canvasStoreSource).toContain(
      'workspaceStates.set(state.workspace, hasSessionMedia ? preparedWorkspace : result.workspace)',
    );
  });

  it('disposes every module-owned persistence trigger before a Vite hot replacement', () => {
    expect(canvasStoreSource).toContain(
      'const unsubscribeCanvasStorePersistence = useCanvasStore.subscribe',
    );
    expect(canvasStoreSource).toContain('cancelCanvasStoreStartupTasks.splice(0)');
    expect(canvasStoreSource).toContain("window.removeEventListener('beforeunload'");
    expect(canvasStoreSource).toContain("window.removeEventListener('storage'");
    expect(canvasStoreSource).toContain("document.removeEventListener('visibilitychange'");
    expect(canvasStoreSource).toContain('canvasPersistenceRetries.reset(projectId)');
    expect(canvasStoreSource).toContain('import.meta.hot.dispose(disposeCanvasStoreRuntime)');
  });

  it('starts on the workbench home without reading legacy project selection or snapshots', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const reads: string[] = [];
    const values = new Map<string, string>([
      ['qiansi-canvas-current-project-id', 'holder'],
      ['kitty-canvas-state', '{"legacy":"must-not-load"}'],
      ['kitty-canvas-workspace-state:holder:views', '{"legacy":"must-not-load"}'],
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => {
          reads.push(key);
          return values.get(key) ?? null;
        },
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } as Storage,
    });
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
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    const { useCanvasStore } = await import('./canvasStore');

    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: 'main-canvas',
      projectName: '我的画布',
      projects: [{ id: 'main-canvas', name: '我的画布' }],
      workspace: 'home',
      nodes: [],
      edges: [],
    });
    expect(reads).not.toContain('qiansi-canvas-current-project-id');
    expect(reads).not.toContain('kitty-canvas-state');
    expect(reads.some((key) => key.startsWith('kitty-canvas-workspace-state:'))).toBe(false);
  });

  it('stays on the workbench home after Bridge restores the current canvas in the background', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
    const idleTasks = installScheduledHydrationWindow();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const restoredImageNode = {
      id: 'restored-image',
      type: 'image',
      position: { x: 40, y: 60 },
      data: {
        kind: 'image',
        title: '已保存图片',
        originalUrl: '/asset-library/files/restored-image',
      },
    };
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: successfulMainCanvasFetch(4, [restoredImageNode]),
    });

    const { selectCanvasImagePickerNodes, useCanvasStore } = await import('./canvasStore');
    expect(useCanvasStore.getState().workspace).toBe('home');

    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
        state: 'saved',
        revision: 4,
      }),
    );

    expect(useCanvasStore.getState()).toMatchObject({
      workspace: 'home',
      nodes: [],
      edges: [],
      tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
      activeTabId: 'bridge-tab',
    });
    expect(selectCanvasImagePickerNodes(useCanvasStore.getState()).map((node) => node.id)).toEqual([
      'restored-image',
    ]);
  });

  it('keeps an explicit last-session startup choice', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>([
      ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(values),
    });
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
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    const { useCanvasStore } = await import('./canvasStore');

    expect(useCanvasStore.getState().workspace).toBe('views');
  });

  it('does not register the legacy cross-tab storage listener in Bridge-only production mode', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
    const addEventListener = vi.fn();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener,
        removeEventListener: vi.fn(),
        requestAnimationFrame: vi.fn(() => 1),
        cancelAnimationFrame: vi.fn(),
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
      },
    });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    await import('./canvasStore');

    expect(addEventListener.mock.calls.map(([type]) => type)).toContain('beforeunload');
    expect(addEventListener.mock.calls.map(([type]) => type)).not.toContain('storage');
    expect(canvasStoreSource).not.toContain('另存为新项目');
  });

  it('keeps the latest workspace choice when earlier Bridge reads finish later', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
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
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const videoRead = deferred<Response>();
    const scriptRead = deferred<Response>();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/projects')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                version: 2,
                primaryProjectId: 'main-canvas',
                projects: [
                  {
                    id: 'main-canvas',
                    name: '主项目',
                    revision: 1,
                    activeWorkspace: 'views',
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (url.includes('/workspaces/video')) return videoRead.promise;
        if (url.includes('/workspaces/script')) return scriptRead.promise;
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: `unexpected request: ${url}` } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    });
    const workspacePayload = (workspaceId: 'video' | 'script') =>
      new Response(
        JSON.stringify({
          projectId: 'main-canvas',
          workspaceId,
          workspace: { nodes: [], edges: [] },
          revision: workspaceId === 'script' ? 2 : 1,
          manifest: {
            version: 3,
            projectId: 'main-canvas',
            revision: workspaceId === 'script' ? 2 : 1,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const { useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({ workspace: 'home', nodes: [], edges: [], past: [], future: [] });
    useCanvasStore.getState().setWorkspace('video');
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some(([input]) => String(input).includes('/workspaces/video')),
      ).toBe(true),
    );
    useCanvasStore.getState().setWorkspace('script');

    scriptRead.resolve(workspacePayload('script'));
    await vi.waitFor(() => expect(useCanvasStore.getState().workspace).toBe('script'));
    videoRead.resolve(workspacePayload('video'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useCanvasStore.getState().workspace).toBe('script');
  });

  it('keeps the current workspace when its pending edits cannot be saved', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(new Map()),
    });
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
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: `unexpected request: ${url}` } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { useCanvasStore } = await import('./canvasStore');
    const viewsNode = {
      id: 'views-node',
      type: 'text' as const,
      position: { x: 20, y: 30 },
      data: { kind: 'text' as const, title: '文本 1', prompt: '保留当前工作台' },
    };
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [viewsNode],
      edges: [],
      past: [],
      future: [],
    });

    useCanvasStore.getState().setWorkspace('video');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useCanvasStore.getState()).toMatchObject({
      workspace: 'views',
      nodes: [viewsNode],
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/workspaces/video')),
    ).toBe(false);
  });

  it('cleans obsolete canvas snapshots while preserving the active project preference', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>();
    const removed: string[] = [];
    const clear = vi.fn();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => {
        removed.push(key);
        values.delete(key);
      },
      clear,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    const splitKey = canvasWorkspaceStorageKey('project-1', 'views');
    writeCanvasWorkspaceSnapshot(storage, 'project-1', 'views', {
      nodes: [
        {
          id: 'newer-orphan-node',
          type: 'text',
          position: { x: 10, y: 20 },
          data: { kind: 'text', title: '较新的孤立 split', prompt: '必须保留' },
        },
      ],
      edges: [],
    });
    values.set('qiansi-canvas-current-project-id', 'project-1');
    values.set(
      'kitty-canvas-state',
      JSON.stringify({
        activeProjectId: 'project-1',
        projects: [{ id: 'project-1', name: '旧画布' }],
        projectStates: { 'project-1': { workspaces: {} } },
      }),
    );
    values.set('kitty-canvas-trash:project-1', '[]');
    values.set('kitty-canvas-assets', '[{"id":"legacy-asset"}]');
    values.set('kitty-canvas-assets:project-1', '[{"id":"legacy-scoped-asset"}]');
    values.set('qiansi-canvas-ui-preferences', '{"snapEnabled":true}');
    values.set('qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' }));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
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
    const lockRequest = vi.fn(
      async (_name: string, _options: LockOptions, callback: () => boolean | Promise<boolean>) =>
        callback(),
    );
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request: lockRequest } },
    });
    const indexedDbOpen = vi.fn();
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: indexedDbOpen },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/projects')) {
        return new Response(
          JSON.stringify({
            version: 2,
            primaryProjectId: 'main-canvas',
            canvasProjectId: 'main-canvas',
            projects: [
              { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views', revision: 4 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/projects/main-canvas/workspaces/views')) {
        return new Response(
          JSON.stringify({
            projectId: 'main-canvas',
            workspaceId: 'views',
            workspace: { nodes: [], edges: [] },
            revision: 4,
            manifest: {
              version: 3,
              projectId: 'main-canvas',
              projectName: '我的画布',
              revision: 4,
              currentWorkspace: 'views',
              tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
              activeTabId: 'bridge-tab',
              assets: [],
              activeTags: [],
              genParams: {},
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { useCanvasStore } = await import('./canvasStore');
    expect(idleTasks.map((task) => task.timeout)).toContain(100);
    useCanvasStore.setState({ workspace: 'views' });
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/projects/main-canvas/workspaces/views'),
        ),
      ).toBe(true),
    );

    await vi.waitFor(() => expect(values.has(splitKey)).toBe(false));
    expect(values.get('qiansi-canvas-current-project-id')).toBe('main-canvas');
    expect(values.has('kitty-canvas-state')).toBe(false);
    expect(values.has('kitty-canvas-trash:project-1')).toBe(false);
    expect(values.get('kitty-canvas-assets')).toBe('[{"id":"legacy-asset"}]');
    expect(values.get('kitty-canvas-assets:project-1')).toBe('[{"id":"legacy-scoped-asset"}]');
    expect(values.get('qiansi-canvas-ui-preferences')).toBe('{"snapEnabled":true}');
    expect(removed).toEqual(
      expect.arrayContaining([splitKey, 'kitty-canvas-state', 'kitty-canvas-trash:project-1']),
    );
    expect(removed).not.toContain('qiansi-canvas-current-project-id');
    expect(clear).not.toHaveBeenCalled();
    expect(lockRequest).toHaveBeenCalledWith(
      'qiansi-canvas-persistence-v6',
      { mode: 'exclusive' },
      expect.any(Function),
    );
    expect(indexedDbOpen).not.toHaveBeenCalled();
  });

  it('fails closed and leaves obsolete browser canvas copies untouched without Web Locks', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>([
      ['qiansi-canvas-current-project-id', 'holder'],
      ['kitty-canvas-state', '{"activeProjectId":"holder"}'],
      ['kitty-canvas-trash:holder', '[]'],
      ['kitty-canvas-assets:holder', '[{"id":"keep-asset"}]'],
    ]);
    const removed = vi.fn((key: string) => void values.delete(key));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(values, removed),
    });
    const idleTasks = installScheduledHydrationWindow();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const fetchMock = successfulMainCanvasFetch();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { useCanvasStore } = await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
        state: 'saved',
        revision: 4,
      }),
    );

    expect(removed).not.toHaveBeenCalled();
    expect(values.get('qiansi-canvas-current-project-id')).toBe('main-canvas');
    expect(values.get('kitty-canvas-state')).toBe('{"activeProjectId":"holder"}');
    expect(values.get('kitty-canvas-trash:holder')).toBe('[]');
    expect(values.get('kitty-canvas-assets:holder')).toBe('[{"id":"keep-asset"}]');
  });

  it('rechecks obsolete browser canvas values after acquiring the persistence lock', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>([
      ['qiansi-canvas-current-project-id', 'holder'],
      ['kitty-canvas-state', '{"revision":1}'],
    ]);
    const removed = vi.fn((key: string) => void values.delete(key));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(values, removed),
    });
    const idleTasks = installScheduledHydrationWindow();
    const lockRequest = vi.fn(
      async (_name: string, _options: LockOptions, callback: () => boolean | Promise<boolean>) => {
        values.set('kitty-canvas-state', '{"revision":2}');
        return callback();
      },
    );
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request: lockRequest } },
    });
    const fetchMock = successfulMainCanvasFetch();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { useCanvasStore } = await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({ state: 'saved' }),
    );

    expect(lockRequest).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    expect(values.get('qiansi-canvas-current-project-id')).toBe('main-canvas');
    expect(values.get('kitty-canvas-state')).toBe('{"revision":2}');
  });

  it('rolls back already removed localStorage canvas keys when cleanup removal fails', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>([
      ['qiansi-canvas-current-project-id', 'holder'],
      ['kitty-canvas-state', '{"activeProjectId":"holder"}'],
    ]);
    const removed: string[] = [];
    const removeItem = (key: string) => {
      removed.push(key);
      values.delete(key);
      if (key === 'kitty-canvas-state') throw new Error('simulated removal failure');
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(values, removeItem),
    });
    const idleTasks = installScheduledHydrationWindow();
    const lockRequest = vi.fn(
      async (_name: string, _options: LockOptions, callback: () => boolean | Promise<boolean>) =>
        callback(),
    );
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request: lockRequest } },
    });
    const fetchMock = successfulMainCanvasFetch();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { useCanvasStore } = await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({ state: 'saved' }),
    );

    expect(removed).toEqual(['kitty-canvas-state']);
    expect(values.get('qiansi-canvas-current-project-id')).toBe('main-canvas');
    expect(values.get('kitty-canvas-state')).toBe('{"activeProjectId":"holder"}');
  });

  it('preserves an edit made before initial Bridge hydration and performs no cleanup or write', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const values = new Map<string, string>([
      ['qiansi-canvas-current-project-id', 'holder'],
      ['kitty-canvas-state', '{"activeProjectId":"holder"}'],
    ]);
    const removed = vi.fn((key: string) => void values.delete(key));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mapStorage(values, removed),
    });
    const idleTasks = installScheduledHydrationWindow();
    const lockRequest = vi.fn();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request: lockRequest } },
    });
    const fetchMock = successfulMainCanvasFetch(7);
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      nodes: [
        {
          id: 'local-before-hydrate',
          type: 'text',
          position: { x: 10, y: 20 },
          data: { kind: 'text', title: '文本 1', prompt: '不得被首次读取覆盖' },
        },
      ],
      edges: [],
    });
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
        state: 'conflict',
        projectId: 'main-canvas',
        conflictingWriterId: 'bridge-local-read',
        message: expect.stringContaining('修订 7'),
      }),
    );
    expect(useCanvasStore.getState().persistenceStatus.message).not.toMatch(/其他窗口|局域网用户/u);

    expect(useCanvasStore.getState().nodes).toEqual([
      expect.objectContaining({ id: 'local-before-hydrate' }),
    ]);
    await expect(flushCanvasPersistence()).resolves.toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/workspaces/views')),
    ).toBe(false);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    expect(lockRequest).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    expect(values.get('kitty-canvas-state')).toBe('{"activeProjectId":"holder"}');
  });

  it('keeps every legacy browser copy when the authoritative main canvas conflicts', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const splitKey = canvasWorkspaceStorageKey('holder', 'views');
    const values = new Map<string, string>([
      ['qiansi-canvas-current-project-id', 'holder'],
      ['kitty-canvas-state', '{"activeProjectId":"holder"}'],
      [splitKey, '{"legacy":"keep"}'],
      ['kitty-canvas-trash:holder', '[]'],
      ['kitty-canvas-assets:holder', '[{"id":"keep-asset"}]'],
    ]);
    const removed: string[] = [];
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => {
          removed.push(key);
          values.delete(key);
        },
        clear: vi.fn(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } as Storage,
    });
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
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/projects')) {
        return new Response(
          JSON.stringify({
            version: 2,
            primaryProjectId: 'main-canvas',
            canvasProjectId: 'main-canvas',
            projects: [{ id: 'main-canvas', name: '我的画布', activeWorkspace: 'views' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ currentRevision: 9, error: { message: 'canvas changed' } }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/projects/main-canvas/workspaces/views'),
        ),
      ).toBe(true),
    );

    expect(removed).toEqual([]);
    expect(values.get('qiansi-canvas-current-project-id')).toBe('holder');
    expect(values.get('kitty-canvas-state')).toBe('{"activeProjectId":"holder"}');
    expect(values.get(splitKey)).toBe('{"legacy":"keep"}');
    expect(values.get('kitty-canvas-trash:holder')).toBe('[]');
    expect(values.get('kitty-canvas-assets:holder')).toBe('[{"id":"keep-asset"}]');
  });

  it.each(['image', 'video', 'text'] as const)(
    'round-trips the exact %s generation request through a workspace PUT without persisting live progress',
    async (kind) => {
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

      type StoredWorkspace = {
        nodes: Array<{ id: string; data: Record<string, unknown> }>;
        edges: unknown[];
      };
      let revision = 1;
      let storedWorkspace: StoredWorkspace = { nodes: [], edges: [] };
      const workspaceWrites: StoredWorkspace[] = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'GET' && url.endsWith('/projects')) {
          return new Response(
            JSON.stringify({
              version: 2,
              primaryProjectId: 'main-canvas',
              canvasProjectId: 'main-canvas',
              projects: [
                {
                  id: 'main-canvas',
                  name: '我的画布',
                  activeWorkspace: 'views',
                  revision,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (method === 'GET' && url.includes('/projects/main-canvas/workspaces/views')) {
          return new Response(
            JSON.stringify({
              projectId: 'main-canvas',
              workspaceId: 'views',
              workspace: storedWorkspace,
              revision,
              manifest: {
                version: 3,
                projectId: 'main-canvas',
                projectName: '我的画布',
                revision,
                currentWorkspace: 'views',
                tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
                activeTabId: 'bridge-tab',
                assets: [],
                activeTags: [],
                genParams: {},
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (method === 'PUT' && url.includes('/projects/main-canvas/workspaces/views')) {
          const body = JSON.parse(String(init?.body)) as { workspace: StoredWorkspace };
          storedWorkspace = body.workspace;
          workspaceWrites.push(structuredClone(body.workspace));
          revision += 1;
          return new Response(
            JSON.stringify({
              projectId: 'main-canvas',
              workspaceId: 'views',
              workspace: storedWorkspace,
              revision,
              manifest: { version: 3, projectId: 'main-canvas', revision },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ error: { message: `unexpected request: ${url}` } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

      const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
      idleTasks.find((task) => task.timeout === 100)?.callback();
      await vi.waitFor(() =>
        expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
          state: 'saved',
          revision: 1,
        }),
      );

      const generationRequestId = `gen-bridge-${kind}-exact`;
      useCanvasStore.setState({
        workspace: 'views',
        nodes: [
          {
            id: `${kind}-generating`,
            type: kind,
            position: { x: 20, y: 30 },
            data: {
              kind,
              title: kind === 'image' ? '图片 1' : kind === 'video' ? '视频 1' : '文本 1',
              generationRequestId,
              generating: true,
              progress: 47,
            },
          },
        ],
        edges: [],
      });

      await expect(flushCanvasPersistence()).resolves.toBe(true);

      expect(workspaceWrites).toHaveLength(1);
      expect(workspaceWrites[0]?.nodes[0]?.data).toMatchObject({
        kind,
        generationRequestId,
      });
      expect(workspaceWrites[0]?.nodes[0]?.data).not.toHaveProperty('generating');
      expect(workspaceWrites[0]?.nodes[0]?.data).not.toHaveProperty('progress');
      expect(storedWorkspace.nodes[0]?.data.generationRequestId).toBe(generationRequestId);
      expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
        generationRequestId,
        generating: true,
        progress: 47,
      });
    },
  );

  it.each(['image', 'video', 'text'] as const)(
    'uses the same generation-token persistence contract for the home full-project %s write',
    async (kind) => {
      (
        globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
      ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: mapStorage(new Map()),
      });
      const idleTasks = installScheduledHydrationWindow();
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

      const generationRequestId = `gen-home-${kind}-exact`;
      const bridgeWorkspace = {
        nodes: [
          {
            id: `${kind}-recoverable`,
            type: kind,
            position: { x: 40, y: 50 },
            data: {
              kind,
              title: kind === 'image' ? '图片 1' : kind === 'video' ? '视频 1' : '文本 1',
              generationRequestId,
              generating: true,
              progress: 63,
            },
          },
        ],
        edges: [],
      };
      const projectWrites: Array<Record<string, unknown>> = [];
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'GET' && url.endsWith('/projects')) {
          return new Response(
            JSON.stringify({
              version: 2,
              primaryProjectId: 'main-canvas',
              canvasProjectId: 'main-canvas',
              projects: [
                {
                  id: 'main-canvas',
                  name: '我的画布',
                  activeWorkspace: 'views',
                  revision: 1,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (method === 'GET' && url.includes('/projects/main-canvas/workspaces/views')) {
          return new Response(
            JSON.stringify({
              projectId: 'main-canvas',
              workspaceId: 'views',
              workspace: bridgeWorkspace,
              revision: 1,
              manifest: {
                version: 3,
                projectId: 'main-canvas',
                projectName: '我的画布',
                revision: 1,
                currentWorkspace: 'views',
                tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
                activeTabId: 'bridge-tab',
                assets: [],
                activeTags: [],
                genParams: {},
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (
          method === 'PUT' &&
          url.endsWith('/projects/main-canvas') &&
          !url.includes('/workspaces/')
        ) {
          const body = JSON.parse(String(init?.body)) as {
            workspace: Record<string, unknown>;
          };
          projectWrites.push(structuredClone(body.workspace));
          return new Response(
            JSON.stringify({
              projectId: 'main-canvas',
              project: { id: 'main-canvas', name: '我的画布', revision: 2 },
              workspace: body.workspace,
              revision: 2,
              manifest: { version: 3, projectId: 'main-canvas', revision: 2 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ error: { message: `unexpected request: ${url}` } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

      const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
      expect(useCanvasStore.getState().workspace).toBe('home');
      idleTasks.find((task) => task.timeout === 100)?.callback();
      await vi.waitFor(() =>
        expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
          state: 'saved',
          revision: 1,
        }),
      );

      await expect(flushCanvasPersistence()).resolves.toBe(true);

      expect(projectWrites).toHaveLength(1);
      const savedProject = projectWrites[0] as {
        workspaces: { views: { nodes: Array<{ data: Record<string, unknown> }> } };
      };
      expect(savedProject.workspaces.views.nodes[0]?.data).toMatchObject({
        kind,
        generationRequestId,
      });
      expect(savedProject.workspaces.views.nodes[0]?.data).not.toHaveProperty('generating');
      expect(savedProject.workspaces.views.nodes[0]?.data).not.toHaveProperty('progress');
    },
  );

  it('saves through Bridge without clearing the selected node after a position change', async () => {
    (
      globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean }
    ).__QIANSI_FORCE_BRIDGE_PERSISTENCE__ = true;
    const browserFailure = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: browserFailure,
        setItem: browserFailure,
        removeItem: browserFailure,
        key: browserFailure,
        get length() {
          return 0;
        },
      },
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: browserFailure, deleteDatabase: browserFailure },
    });
    const idleTasks: Array<{ callback: () => void; timeout?: number }> = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
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
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });

    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      requests.push({ url, method, body });
      if (method === 'PUT' && url.includes('/workspaces/views')) {
        return new Response(
          JSON.stringify({
            projectId: 'main-canvas',
            workspaceId: 'views',
            workspace: body?.workspace,
            revision: 2,
            manifest: { version: 3, projectId: 'main-canvas', revision: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'GET' && url.endsWith('/projects')) {
        return new Response(
          JSON.stringify({
            version: 2,
            primaryProjectId: 'main-canvas',
            canvasProjectId: 'main-canvas',
            projects: [
              { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views', revision: 1 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'GET' && url.includes('/projects/main-canvas/workspaces/views')) {
        return new Response(
          JSON.stringify({
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
              tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
              activeTabId: 'bridge-tab',
              assets: [],
              activeTags: [],
              genParams: {},
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected request' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
    idleTasks.find((task) => task.timeout === 100)?.callback();
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
        state: 'saved',
        revision: 1,
        writerId: 'bridge',
      }),
    );
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          position: { x: 0, y: 0 },
          selected: true,
          dragging: false,
          measured: { width: 420, height: 260 },
          data: {
            kind: 'image',
            title: '图片 1',
            originalUrl: 'https://cdn.example.test/original.png',
            previewUrl: 'https://cdn.example.test/preview.webp',
            bridgeAssetId: 'stable-image-1',
          },
        },
      ],
      edges: [],
      selectedNodeId: 'image-1',
    });
    useCanvasStore.getState().onNodesChange([
      {
        id: 'image-1',
        type: 'position',
        position: { x: 10, y: 20 },
        dragging: false,
      },
    ]);

    await expect(flushCanvasPersistence()).resolves.toBe(true);
    const writes = requests.filter((request) => request.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body?.workspace).toMatchObject({
      nodes: [
        expect.objectContaining({
          id: 'image-1',
          data: expect.objectContaining({
            originalUrl: 'https://cdn.example.test/original.png',
            previewUrl: 'https://cdn.example.test/preview.webp',
            bridgeAssetId: 'stable-image-1',
          }),
        }),
      ],
      edges: [],
    });
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      state: 'saved',
      revision: 2,
      writerId: 'bridge',
    });
    expect(useCanvasStore.getState().nodes[0]).toMatchObject({
      id: 'image-1',
      position: { x: 10, y: 20 },
      selected: true,
      dragging: false,
      measured: { width: 420, height: 260 },
    });
    expect(useCanvasStore.getState().selectedNodeId).toBe('image-1');
  });

  it('does not let a late workspace read regress the revision used by the next Bridge write', async () => {
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

    let hostRevision = 1;
    let hostViews = { nodes: [] as unknown[], edges: [] as unknown[] };
    let hostVideo = { nodes: [] as unknown[], edges: [] as unknown[] };
    const staleVideoRead = deferred<Response>();
    let videoReadCount = 0;
    const writeExpectedRevisions: number[] = [];
    const workspaceResponse = (
      workspaceId: 'views' | 'video',
      workspace: { nodes: unknown[]; edges: unknown[] },
      revision: number,
    ) =>
      new Response(
        JSON.stringify({
          projectId: 'main-canvas',
          workspaceId,
          workspace,
          revision,
          manifest: {
            version: 3,
            projectId: 'main-canvas',
            projectName: '我的画布',
            revision,
            currentWorkspace: workspaceId,
            tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
            activeTabId: 'bridge-tab',
            assets: [],
            activeTags: [],
            genParams: {},
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/projects')) {
        return new Response(
          JSON.stringify({
            version: 2,
            primaryProjectId: 'main-canvas',
            canvasProjectId: 'main-canvas',
            projects: [
              {
                id: 'main-canvas',
                name: '我的画布',
                activeWorkspace: 'views',
                revision: hostRevision,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'GET' && url.includes('/workspaces/views')) {
        return workspaceResponse('views', hostViews, hostRevision);
      }
      if (method === 'GET' && url.includes('/workspaces/video')) {
        videoReadCount += 1;
        if (videoReadCount === 1) return staleVideoRead.promise;
        return workspaceResponse('video', hostVideo, hostRevision);
      }
      if (method === 'PUT' && url.includes('/workspaces/')) {
        const body = JSON.parse(String(init?.body)) as {
          expectedRevision: number;
          workspace: { nodes: unknown[]; edges: unknown[] };
        };
        writeExpectedRevisions.push(body.expectedRevision);
        const workspaceId = url.includes('/workspaces/video') ? 'video' : 'views';
        const currentWorkspace = workspaceId === 'video' ? hostVideo : hostViews;
        if (JSON.stringify(body.workspace) !== JSON.stringify(currentWorkspace)) {
          expect(body.expectedRevision).toBe(hostRevision);
          hostRevision += 1;
          if (workspaceId === 'video') hostVideo = body.workspace;
          else hostViews = body.workspace;
        }
        return workspaceResponse(workspaceId, body.workspace, hostRevision);
      }
      return new Response(JSON.stringify({ error: { message: `unexpected request: ${url}` } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
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
          id: 'saved-at-revision-2',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { kind: 'text', title: '文本 1', prompt: '第一次保存' },
        },
      ],
      edges: [],
    });
    await expect(flushCanvasPersistence()).resolves.toBe(true);
    expect(hostRevision).toBe(2);

    useCanvasStore.getState().setWorkspace('video');
    await vi.waitFor(() => expect(videoReadCount).toBe(1));
    staleVideoRead.resolve(workspaceResponse('video', hostVideo, 1));
    await vi.waitFor(() => expect(useCanvasStore.getState().workspace).toBe('video'));
    expect(videoReadCount).toBe(2);

    useCanvasStore.setState({
      nodes: [
        {
          id: 'saved-at-revision-3',
          type: 'text',
          position: { x: 20, y: 20 },
          data: { kind: 'text', title: '文本 2', prompt: '迟到读取后的保存' },
        },
      ],
      edges: [],
    });
    await expect(flushCanvasPersistence()).resolves.toBe(true);

    expect(writeExpectedRevisions).toEqual([1, 2, 2]);
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      state: 'saved',
      revision: 3,
      writerId: 'bridge',
    });
  });

  it('applies the complete project after a granular rebase before adopting its revision', async () => {
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

    const expectedRevisions: number[] = [];
    let writeCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/projects')) {
        return new Response(
          JSON.stringify({
            version: 2,
            primaryProjectId: 'main-canvas',
            canvasProjectId: 'main-canvas',
            projects: [
              { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views', revision: 1 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'GET' && url.includes('/workspaces/views')) {
        return new Response(
          JSON.stringify({
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
              tabs: [{ id: 'bridge-tab', name: '画板 1', workspace: 'views' }],
              activeTabId: 'bridge-tab',
              assets: [],
              activeTags: [],
              genParams: {},
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'PUT' && url.includes('/workspaces/views')) {
        writeCount += 1;
        const body = JSON.parse(String(init?.body)) as {
          expectedRevision: number;
          workspace: { nodes: unknown[]; edges: unknown[] };
          manifestPatch: Record<string, unknown>;
        };
        expectedRevisions.push(body.expectedRevision);
        if (writeCount === 1) {
          const mergedWorkspace = {
            nodes: [
              {
                id: 'remote-node',
                type: 'text',
                position: { x: 200, y: 100 },
                data: { kind: 'text', title: '远程节点', prompt: '局域网修改' },
              },
              ...body.workspace.nodes,
            ],
            edges: body.workspace.edges,
          };
          const project = {
            version: 2,
            projectId: 'main-canvas',
            projectName: '我的画布',
            workspaces: {
              views: mergedWorkspace,
              video: {
                nodes: [
                  {
                    id: 'remote-video-node',
                    type: 'text',
                    position: { x: 0, y: 0 },
                    data: { kind: 'text', title: '视频工作台远程节点' },
                  },
                ],
                edges: [],
              },
            },
            tabs: body.manifestPatch.tabs,
            assets: body.manifestPatch.assets,
            trash: [{ id: 'remote-trash', nodes: [], edges: [], deletedAt: Date.now() }],
            genParams: body.manifestPatch.genParams,
            activeTags: body.manifestPatch.activeTags,
            revision: 3,
            updatedAt: Date.now(),
          };
          return new Response(
            JSON.stringify({
              projectId: 'main-canvas',
              workspaceId: 'views',
              workspace: mergedWorkspace,
              project,
              revision: 3,
              rebased: true,
              manifest: {
                ...body.manifestPatch,
                version: 3,
                projectId: 'main-canvas',
                revision: 3,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            projectId: 'main-canvas',
            workspaceId: 'views',
            workspace: body.workspace,
            revision: 4,
            manifest: {
              ...body.manifestPatch,
              version: 3,
              projectId: 'main-canvas',
              revision: 4,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: { message: `unexpected request: ${url}` } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
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
          data: { kind: 'text', title: '本地节点', prompt: '本地修改' },
        },
      ],
      edges: [],
    });
    await expect(flushCanvasPersistence()).resolves.toBe(true);
    expect(
      useCanvasStore
        .getState()
        .nodes.map((node) => node.id)
        .sort(),
    ).toEqual(['local-node', 'remote-node']);
    expect(useCanvasStore.getState().trash.map((item) => item.id)).toEqual(['remote-trash']);
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      state: 'saved',
      revision: 3,
    });

    useCanvasStore.setState((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: 'second-local-node',
          type: 'text',
          position: { x: 40, y: 40 },
          data: { kind: 'text', title: '后续节点', prompt: '合并后保存' },
        },
      ],
    }));
    await expect(flushCanvasPersistence()).resolves.toBe(true);
    expect(expectedRevisions).toEqual([1, 3]);
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      state: 'saved',
      revision: 4,
    });
  });
});
