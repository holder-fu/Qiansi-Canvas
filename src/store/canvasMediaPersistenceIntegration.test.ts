import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import type * as CanvasMediaMigrationModule from '../lib/canvasMediaMigration';
import { parseCanvasPersistence, stringifyCanvasPersistence } from './canvasPersistenceCodec';
import { canvasWorkspaceStorageKey } from './canvasWorkspaceStorage';

const mocks = vi.hoisted(() => ({
  persist: vi.fn(),
  prepareAssets: vi.fn(),
  persistedItem: {
    originalUrl: '/asset-library/files/shared-original',
    previewUrl: '/media-preview/files/shared-preview.webp',
    bridgeAssetId: 'shared-original',
    storage: 'bridge' as const,
  },
}));

vi.mock('../services/canvasMediaPersistence', async () => {
  const { migrateCanvasNodesEmbeddedImages } = await vi.importActual<
    typeof CanvasMediaMigrationModule
  >('../lib/canvasMediaMigration');
  class MockCanvasMediaPersistenceSession {
    private readonly pending = new Map<string, ReturnType<typeof mocks.persist>>();
    private readonly projectId: string;

    constructor(projectId: string) {
      this.projectId = projectId;
    }

    persist(dataUrl: string) {
      let result = this.pending.get(dataUrl);
      if (!result) {
        result = mocks.persist(dataUrl, this.projectId);
        this.pending.set(dataUrl, result);
      }
      return result;
    }

    async commitLegacyMigration() {}
  }
  return {
    CanvasMediaPersistenceSession: MockCanvasMediaPersistenceSession,
    resolveCanvasImageForAi: async (value: string) => value,
    resolveCanvasMediaRuntimeUrl: async (value: string) => value,
    resolveCanvasPosterForAi: async (value: string) => value,
    stableCanvasMediaUrlForRuntime: () => null,
    prepareCanvasNodesForPersistence: async (
      nodes: FlowNode[],
      _projectId: string,
      _signal?: AbortSignal,
      session?: MockCanvasMediaPersistenceSession,
    ) => {
      const activeSession = session ?? new MockCanvasMediaPersistenceSession('test-project');
      const migrated = await migrateCanvasNodesEmbeddedImages(nodes, (dataUrl) =>
        activeSession.persist(dataUrl),
      );
      return { ...migrated, legacyIndexedDbReferenceCount: 0, session: activeSession };
    },
    prepareCanvasAssetItemsForPersistence: (...args: unknown[]) => mocks.prepareAssets(...args),
    prepareCanvasMediaValueForPersistence: async (value: unknown) => ({
      value,
      embeddedImageCount: 0,
      uniqueImageCount: 0,
      resolutions: new Map(),
      legacyIndexedDbReferenceCount: 0,
      session: new MockCanvasMediaPersistenceSession('test-project'),
    }),
  };
});

const originalLocalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;

beforeEach(() => {
  mocks.persist.mockReset();
  mocks.persist.mockResolvedValue(mocks.persistedItem);
  mocks.prepareAssets.mockReset();
  mocks.prepareAssets.mockImplementation(async (items: unknown[]) => ({
    items,
    embeddedImageCount: 0,
    uniqueImageCount: 0,
    resolutions: new Map(),
  }));
});

afterEach(() => {
  vi.resetModules();
  mocks.persist.mockReset();
  mocks.prepareAssets.mockReset();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  });
});

function embeddedNode(id: string, dataUrl: string): FlowNode {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      title: id,
      originalUrl: dataUrl,
      imageUrl: dataUrl,
      previewUrl: dataUrl,
      output: dataUrl,
    },
  };
}

describe('canvas media persistence integration', () => {
  it('migrates active and dormant workspaces atomically without duplicating a shared image', async () => {
    const projectId = 'project-media-migration';
    const dataUrl = `data:image/png;base64,${'A'.repeat(256)}`;
    const activeWorkspace = 'views';
    const dormantWorkspace = 'video';
    const tabs = [
      { id: 'views-tab', name: '图片画板', workspace: activeWorkspace },
      { id: 'video-tab', name: '视频画板', workspace: dormantWorkspace },
    ];
    const activeSnapshot = { nodes: [embeddedNode('active-image', dataUrl)], edges: [] };
    const dormantSnapshot = { nodes: [embeddedNode('dormant-image', dataUrl)], edges: [] };
    const projectMeta = {
      workspace: activeWorkspace,
      workspaceIds: [activeWorkspace, dormantWorkspace],
      tabs,
      activeTabId: 'views-tab',
    };
    const values = new Map<string, string>([
      ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectId,
          projectStates: {},
          projectMeta: { [projectId]: projectMeta },
          workspace: activeWorkspace,
          workspaces: {},
          tabs,
          activeTabId: 'views-tab',
          projectName: '媒体迁移项目',
          projects: [{ id: projectId, name: '媒体迁移项目' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [
        canvasWorkspaceStorageKey(projectId, activeWorkspace),
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace: activeWorkspace,
          snapshot: activeSnapshot,
        }),
      ],
      [
        canvasWorkspaceStorageKey(projectId, dormantWorkspace),
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace: dormantWorkspace,
          snapshot: dormantSnapshot,
        }),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        requestAnimationFrame: vi.fn(() => 1),
        cancelAnimationFrame: vi.fn(),
        setTimeout,
        clearTimeout,
      },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: vi.fn(
            async (_name: string, _options: unknown, callback: () => boolean | Promise<boolean>) =>
              callback(),
          ),
        },
      },
    });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');

    await expect(flushCanvasPersistence()).resolves.toBe(true);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledWith(dataUrl, projectId);
    expect(useCanvasStore.getState().nodes[0]?.data.originalUrl).toBe(
      '/asset-library/files/shared-original',
    );
    for (const workspace of [activeWorkspace, dormantWorkspace]) {
      const saved = parseCanvasPersistence<{
        snapshot: { nodes: FlowNode[] };
      }>(values.get(canvasWorkspaceStorageKey(projectId, workspace)) ?? '{}');
      expect(JSON.stringify(saved.snapshot)).not.toContain('data:image/png');
      expect(saved.snapshot.nodes[0]?.data.originalUrl).toBe(
        '/asset-library/files/shared-original',
      );
      expect(saved.snapshot.nodes[0]?.data.previewUrl).toBe(
        '/media-preview/files/shared-preview.webp',
      );
    }
    await expect(flushCanvasPersistence()).resolves.toBe(true);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });

  it('does not apply a delayed immediate migration to the same node id in another project', async () => {
    const projectA = 'project-immediate-media-a';
    const projectB = 'project-immediate-media-b';
    const workspace = 'views';
    const nodeId = 'shared-node-id';
    const dataUrl = `data:image/png;base64,${'R'.repeat(256)}`;
    const tabs = [{ id: 'views-tab', name: '图片画板', workspace }];
    const projectMeta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'views-tab',
    };
    const values = new Map<string, string>([
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectA,
          projectStates: {},
          projectMeta: { [projectA]: projectMeta, [projectB]: projectMeta },
          workspace,
          workspaces: {},
          tabs,
          activeTabId: 'views-tab',
          projectName: '项目 A',
          projects: [
            { id: projectA, name: '项目 A' },
            { id: projectB, name: '项目 B' },
          ],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      ...[projectA, projectB].map(
        (projectId) =>
          [
            canvasWorkspaceStorageKey(projectId, workspace),
            stringifyCanvasPersistence({
              version: 1,
              projectId,
              workspace,
              snapshot: { nodes: [embeddedNode(nodeId, dataUrl)], edges: [] },
            }),
          ] as const,
      ),
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    // Keep background autosave structural in this unit test. The immediate
    // migration itself still runs, while no second mocked media upload obscures
    // which project owned the delayed request.
    Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });

    let resolvePersistence: ((value: typeof mocks.persistedItem) => void) | undefined;
    mocks.persist.mockImplementation(
      () =>
        new Promise<typeof mocks.persistedItem>((resolve) => {
          resolvePersistence = resolve;
        }),
    );

    const { useCanvasStore } = await import('./canvasStore');
    useCanvasStore.getState().updateNodeData(nodeId, {
      imageUrl: dataUrl,
      images: [dataUrl],
      output: dataUrl,
    });
    expect(mocks.persist).toHaveBeenCalledOnce();
    expect(mocks.persist).toHaveBeenCalledWith(dataUrl, projectA);

    useCanvasStore.getState().switchProject(projectB);
    expect(useCanvasStore.getState().activeProjectId).toBe(projectB);
    expect(useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data.imageUrl).toBe(
      dataUrl,
    );

    if (!resolvePersistence) throw new Error('Expected delayed media persistence request.');
    resolvePersistence(mocks.persistedItem);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const projectBNode = useCanvasStore.getState().nodes.find((node) => node.id === nodeId);
    expect(projectBNode?.data.imageUrl).toBe(dataUrl);
    expect(projectBNode?.data.originalUrl).toBe(dataUrl);
    expect(projectBNode?.data.previewUrl).toBe(dataUrl);
    expect(projectBNode?.data.bridgeAssetId).toBeUndefined();
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });

  it('commits a migrated Asset Library catalog before the canvas snapshot', async () => {
    const projectId = 'project-asset-catalog-migration';
    const workspace = 'views';
    const dataUrl = `data:image/png;base64,${'C'.repeat(256)}`;
    const originalUrl = '/asset-library/files/catalog-original';
    const previewUrl = '/media-preview/files/catalog-preview.webp';
    const tabs = [{ id: 'views-tab', name: '图片画板', workspace }];
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'views-tab',
    };
    const values = new Map<string, string>([
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectId,
          projectStates: {},
          projectMeta: { [projectId]: meta },
          workspace,
          workspaces: {},
          tabs,
          activeTabId: 'views-tab',
          projectName: '素材目录迁移',
          projects: [{ id: projectId, name: '素材目录迁移' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [
        canvasWorkspaceStorageKey(projectId, workspace),
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace,
          snapshot: {
            nodes: [embeddedNode('stable-node', 'https://example.test/stable.png')],
            edges: [],
          },
        }),
      ],
      [
        `kitty-canvas-assets:${projectId}`,
        JSON.stringify([
          {
            id: 'legacy-asset',
            title: '旧素材',
            originalUrl: dataUrl,
            imageUrl: dataUrl,
            images: [dataUrl],
            previewUrl: dataUrl,
            bridgeAssetId: 'stale-bridge-id',
            kind: 'image',
            category: 'character',
            createdAt: 1,
          },
        ]),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        requestAnimationFrame: vi.fn(() => 1),
        cancelAnimationFrame: vi.fn(),
        setTimeout,
        clearTimeout,
      },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: vi.fn(
            async (_name: string, _options: unknown, callback: () => boolean | Promise<boolean>) =>
              callback(),
          ),
        },
      },
    });
    mocks.prepareAssets.mockImplementation(async (items: Array<Record<string, unknown>>) => ({
      items: items.map((item) => ({
        ...item,
        originalUrl,
        imageUrl: originalUrl,
        images: [originalUrl],
        previewUrl,
        bridgeAssetId: 'catalog-original',
      })),
      embeddedImageCount: 4,
      uniqueImageCount: 1,
      resolutions: new Map(),
    }));

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');

    await expect(flushCanvasPersistence()).resolves.toBe(true);
    const persistedAssets = JSON.parse(
      values.get(`kitty-canvas-assets:${projectId}`) ?? '[]',
    ) as Array<Record<string, unknown>>;
    expect(JSON.stringify(persistedAssets)).not.toContain('data:image/');
    expect(persistedAssets[0]?.originalUrl).toBe(originalUrl);
    expect(persistedAssets[0]?.previewUrl).toBe(previewUrl);
    expect(useCanvasStore.getState().assets[0]?.originalUrl).toBe(originalUrl);
    expect(useCanvasStore.getState().persistenceStatus.state).toBe('saved');
  });
});
