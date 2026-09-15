import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import type * as CanvasMediaPersistenceModule from '../services/canvasMediaPersistence';
import { parseCanvasPersistence, stringifyCanvasPersistence } from './canvasPersistenceCodec';
import type { CanvasTab } from './canvasStore';
import { canvasWorkspaceStorageKey } from './canvasWorkspaceStorage';

const mediaPersistenceMocks = vi.hoisted(() => ({ persist: vi.fn() }));

vi.mock('../services/canvasMediaPersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof CanvasMediaPersistenceModule>();
  return {
    ...actual,
    CanvasMediaPersistenceSession: class {
      private readonly pending = new Map<
        string,
        ReturnType<typeof mediaPersistenceMocks.persist>
      >();
      private readonly projectId: string;

      constructor(projectId: string) {
        this.projectId = projectId;
      }

      persist(dataUrl: string) {
        let result = this.pending.get(dataUrl);
        if (!result) {
          result = mediaPersistenceMocks.persist(dataUrl, this.projectId);
          this.pending.set(dataUrl, result);
        }
        return result;
      }
    },
  };
});

const originalLocalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;

afterEach(() => {
  vi.resetModules();
  mediaPersistenceMocks.persist.mockReset();
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

describe('canvas persistence quota recovery', () => {
  it('reclaims the redundant v6 root workspace before replacing a media-heavy canvas', async () => {
    const projectId = 'project-quota-recovery';
    const workspace = 'video';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const oldMedia = `data:image/jpeg;base64,${'A'.repeat(70_000)}`;
    const newMedia = `data:image/jpeg;base64,${'B'.repeat(80_000)}`;
    const oldNode: FlowNode = {
      id: 'old-video-reference',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { kind: 'image', title: '旧参考图', imageUrl: oldMedia, output: oldMedia },
    };
    const tabs: CanvasTab[] = [{ id: 'video-tab', name: '视频画板', workspace }];
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'video-tab',
    };
    const oldSnapshot = { nodes: [oldNode], edges: [] };
    const values = new Map<string, string>([
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectId,
          projectStates: {
            [projectId]: { ...meta, workspaces: { [workspace]: oldSnapshot } },
          },
          projectMeta: { [projectId]: meta },
          workspace,
          workspaces: { [workspace]: oldSnapshot },
          tabs: meta.tabs,
          activeTabId: meta.activeTabId,
          projectName: '配额恢复项目',
          projects: [{ id: projectId, name: '配额恢复项目' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [
        workspaceKey,
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace,
          snapshot: oldSnapshot,
        }),
      ],
    ]);
    const seededSize = [...values.values()].reduce((total, value) => total + value.length, 0);
    const quota = seededSize + 1_000;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        const nextSize =
          [...values.entries()].reduce(
            (total, [storedKey, storedValue]) =>
              total + (storedKey === key ? 0 : storedValue.length),
            0,
          ) + value.length;
        if (nextSize > quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, loadCanvasBootstrap, useCanvasStore } =
      await import('./canvasStore');
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '配额恢复项目',
      projects: [{ id: projectId, name: '配额恢复项目' }],
      workspace,
      tabs: meta.tabs,
      activeTabId: meta.activeTabId,
      nodes: [
        {
          ...oldNode,
          id: 'new-video-reference',
          data: { ...oldNode.data, title: '新参考图', imageUrl: newMedia, output: newMedia },
        },
      ],
      edges: [],
    });

    await expect(flushCanvasPersistence()).resolves.toBe(true);

    const root = parseCanvasPersistence<{
      projectStates?: Record<string, unknown>;
      workspaces?: Record<string, unknown>;
    }>(values.get('kitty-canvas-state') ?? '{}');
    const savedWorkspace = parseCanvasPersistence<{
      snapshot: { nodes: FlowNode[] };
    }>(values.get(workspaceKey) ?? '{}');
    expect(root.projectStates).toEqual({});
    expect(root.workspaces).toEqual({});
    expect(savedWorkspace.snapshot.nodes[0]?.data.imageUrl).toBe(newMedia);
    expect(useCanvasStore.getState().persistenceStatus.state).toBe('saved');
    expect(loadCanvasBootstrap(storage)?.workspaces.video?.nodes[0]?.data.imageUrl).toBe(newMedia);
  });

  it('replaces an unsplit quota-full v6 root before writing its verified workspace', async () => {
    const projectId = 'project-unsplit-v6-recovery';
    const workspace = 'views';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const embeddedImage = `data:image/jpeg;base64,${'V'.repeat(90_000)}`;
    const stableImage = '/asset-library/files/verified-v6-original';
    const tabs: CanvasTab[] = [{ id: 'tab-views', name: '图片画板', workspace }];
    const embeddedNode: FlowNode = {
      id: 'v6-embedded-image',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '已迁移原图',
        originalUrl: embeddedImage,
        imageUrl: embeddedImage,
        output: embeddedImage,
      },
    };
    const snapshot = { nodes: [embeddedNode], edges: [] };
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'tab-views',
    };
    const rootValue = stringifyCanvasPersistence({
      version: 6,
      activeProjectId: projectId,
      projectStates: { [projectId]: { ...meta, workspaces: { [workspace]: snapshot } } },
      projectMeta: { [projectId]: meta },
      workspace,
      workspaces: { [workspace]: snapshot },
      tabs,
      activeTabId: 'tab-views',
      projectName: '未拆分 v6 项目',
      projects: [{ id: projectId, name: '未拆分 v6 项目' }],
      genParams: {},
      activeTags: [],
      projectRevisions: {},
    });
    const values = new Map<string, string>([
      ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
      ['kitty-canvas-state', rootValue],
    ]);
    const operations: string[] = [];
    const quota = [...values.values()].reduce((total, value) => total + value.length, 0) + 300;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        const total =
          [...values.entries()].reduce(
            (size, [storedKey, storedValue]) => size + (storedKey === key ? 0 : storedValue.length),
            0,
          ) + value.length;
        if (total > quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        operations.push(`set:${key}`);
        values.set(key, value);
      },
      removeItem: (key: string) => {
        operations.push(`remove:${key}`);
        values.delete(key);
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      nodes: [
        {
          ...embeddedNode,
          data: {
            ...embeddedNode.data,
            originalUrl: stableImage,
            imageUrl: stableImage,
            output: stableImage,
          },
        },
      ],
    });

    await expect(flushCanvasPersistence()).resolves.toBe(true);

    const rootWrites = operations.filter((operation) => operation === 'set:kitty-canvas-state');
    expect(rootWrites).toHaveLength(2);
    expect(operations.indexOf('set:kitty-canvas-state')).toBeLessThan(
      operations.indexOf(`set:${workspaceKey}`),
    );
    const savedWorkspace = parseCanvasPersistence<{ snapshot: { nodes: FlowNode[] } }>(
      values.get(workspaceKey) ?? '{}',
    );
    expect(savedWorkspace.snapshot.nodes[0]?.data.originalUrl).toBe(stableImage);
    expect(JSON.stringify([...values.values()])).not.toContain('data:image/');
  });

  it('replaces a quota-full legacy root with its verified lightweight snapshot before splitting', async () => {
    const projectId = 'project-legacy-quota-migration';
    const workspace = 'views';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const embeddedImage = `data:image/jpeg;base64,${'L'.repeat(90_000)}`;
    const stableImage = '/asset-library/files/migrated-original';
    const tabs: CanvasTab[] = [{ id: 'tab-views', name: '图片画板', workspace }];
    const legacySnapshot = {
      nodes: [
        {
          id: 'legacy-image',
          type: 'image' as const,
          position: { x: 0, y: 0 },
          data: {
            kind: 'image' as const,
            title: '旧项目原图',
            imageUrl: embeddedImage,
            output: embeddedImage,
          },
        },
      ],
      edges: [],
    };
    const legacyRoot = stringifyCanvasPersistence({
      version: 5,
      activeProjectId: projectId,
      workspace,
      workspaces: { [workspace]: legacySnapshot },
      tabs,
      activeTabId: 'tab-views',
      projectName: '旧版满额项目',
      projects: [{ id: projectId, name: '旧版满额项目' }],
      genParams: {},
      activeTags: [],
      projectRevisions: {},
    });
    const values = new Map<string, string>([
      ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
      ['kitty-canvas-state', legacyRoot],
    ]);
    const quota = [...values.values()].reduce((total, value) => total + value.length, 0) + 300;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        const total =
          [...values.entries()].reduce(
            (size, [storedKey, storedValue]) => size + (storedKey === key ? 0 : storedValue.length),
            0,
          ) + value.length;
        if (total > quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
    useCanvasStore.setState({
      nodes: [
        {
          id: 'legacy-image',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: '旧项目原图',
            originalUrl: stableImage,
            imageUrl: stableImage,
            output: stableImage,
          },
        },
      ],
    });

    await expect(flushCanvasPersistence()).resolves.toBe(true);

    const root = parseCanvasPersistence<{
      version: number;
      projectStates?: Record<string, unknown>;
      workspaces?: Record<string, unknown>;
    }>(values.get('kitty-canvas-state') ?? '{}');
    const split = parseCanvasPersistence<{
      snapshot: { nodes: FlowNode[] };
    }>(values.get(workspaceKey) ?? '{}');
    expect(root.version).toBe(6);
    expect(root.projectStates).toEqual({});
    expect(root.workspaces).toEqual({});
    expect(split.snapshot.nodes[0]?.data.imageUrl).toBe(stableImage);
    expect(JSON.stringify([...values.values()])).not.toContain('data:image/');
  });

  it('migrates every project in a quota-full legacy-only root before clearing the legacy key', async () => {
    const projectA = 'project-legacy-a';
    const projectB = 'project-legacy-b';
    const workspace = 'views';
    const workspaceKeyA = canvasWorkspaceStorageKey(projectA, workspace);
    const workspaceKeyB = canvasWorkspaceStorageKey(projectB, workspace);
    const embeddedA = `data:image/png;base64,${'A'.repeat(36_000)}`;
    const embeddedB = `data:image/png;base64,${'B'.repeat(36_000)}`;
    const tabs: CanvasTab[] = [{ id: 'tab-views', name: '图片画板', workspace }];
    const node = (id: string, imageUrl: string): FlowNode => ({
      id,
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: id,
        originalUrl: imageUrl,
        imageUrl,
        previewUrl: imageUrl,
        output: imageUrl,
      },
    });
    const snapshotA = { nodes: [node('legacy-a', embeddedA)], edges: [] };
    const snapshotB = { nodes: [node('legacy-b', embeddedB)], edges: [] };
    const projectSnapshot = (snapshot: typeof snapshotA) => ({
      workspace,
      workspaces: { [workspace]: snapshot },
      tabs,
      activeTabId: 'tab-views',
    });
    const legacyRoot = stringifyCanvasPersistence({
      version: 5,
      activeProjectId: projectA,
      projectStates: {
        [projectA]: projectSnapshot(snapshotA),
        [projectB]: projectSnapshot(snapshotB),
      },
      workspace,
      workspaces: { [workspace]: snapshotA },
      tabs,
      activeTabId: 'tab-views',
      projectName: '旧项目 A',
      projects: [
        { id: projectA, name: '旧项目 A' },
        { id: projectB, name: '旧项目 B' },
      ],
      genParams: {},
      activeTags: [],
      projectRevisions: {},
    });
    const values = new Map<string, string>([['libtv-canvas-state', legacyRoot]]);
    const operations: string[] = [];
    const quota = legacyRoot.length + 500;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        const total =
          [...values.entries()].reduce(
            (size, [storedKey, storedValue]) => size + (storedKey === key ? 0 : storedValue.length),
            0,
          ) + value.length;
        if (total > quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        operations.push(`set:${key}`);
        values.set(key, value);
      },
      removeItem: (key: string) => {
        operations.push(`remove:${key}`);
        values.delete(key);
      },
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
    mediaPersistenceMocks.persist.mockImplementation(
      async (_dataUrl: string, projectId: string) => ({
        originalUrl: `/asset-library/files/${projectId}-original`,
        previewUrl: `/media-preview/files/${projectId}-preview.webp`,
        bridgeAssetId: `${projectId}-original`,
        storage: 'bridge' as const,
      }),
    );

    const { flushCanvasPersistence } = await import('./canvasStore');
    await expect(flushCanvasPersistence()).resolves.toBe(true);

    expect(mediaPersistenceMocks.persist).toHaveBeenCalledWith(embeddedA, projectA);
    expect(mediaPersistenceMocks.persist).toHaveBeenCalledWith(embeddedB, projectB);
    for (const [projectId, workspaceKey] of [
      [projectA, workspaceKeyA],
      [projectB, workspaceKeyB],
    ] as const) {
      const saved = parseCanvasPersistence<{ snapshot: { nodes: FlowNode[] } }>(
        values.get(workspaceKey) ?? '{}',
      );
      expect(saved.snapshot.nodes[0]?.data.originalUrl).toBe(
        `/asset-library/files/${projectId}-original`,
      );
    }
    expect(operations.indexOf('set:libtv-canvas-state')).toBeLessThan(
      operations.indexOf(`set:${workspaceKeyA}`),
    );
    expect(operations.indexOf('set:kitty-canvas-state')).toBeLessThan(
      operations.indexOf('remove:libtv-canvas-state'),
    );
    expect(values.has('libtv-canvas-state')).toBe(false);
    expect(JSON.stringify([...values.values()])).not.toContain('data:image/');
  });

  it('does not clear a newer root snapshot when the existing split workspace is stale', async () => {
    const projectId = 'project-stale-split';
    const workspace = 'video';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const rootMedia = `data:image/jpeg;base64,${'N'.repeat(4_000)}`;
    const staleMedia = `data:image/jpeg;base64,${'S'.repeat(4_000)}`;
    const tabs: CanvasTab[] = [{ id: 'tab-video', name: '视频画板', workspace }];
    const node = (id: string, imageUrl: string): FlowNode => ({
      id,
      type: 'image',
      position: { x: 0, y: 0 },
      data: { kind: 'image', title: id, imageUrl, output: imageUrl },
    });
    const currentSnapshot = { nodes: [node('new-root', rootMedia)], edges: [] };
    const staleSnapshot = { nodes: [node('old-split', staleMedia)], edges: [] };
    const projectSnapshot = {
      workspace,
      workspaces: { [workspace]: currentSnapshot },
      tabs,
      activeTabId: 'tab-video',
    };
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'tab-video',
    };
    const values = new Map<string, string>([
      ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectId,
          projectStates: { [projectId]: projectSnapshot },
          projectMeta: { [projectId]: meta },
          workspace,
          workspaces: { [workspace]: currentSnapshot },
          tabs,
          activeTabId: 'tab-video',
          projectName: '较新的根快照',
          projects: [{ id: projectId, name: '较新的根快照' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [
        workspaceKey,
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace,
          snapshot: staleSnapshot,
        }),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === workspaceKey) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, loadCanvasBootstrap } = await import('./canvasStore');

    await expect(flushCanvasPersistence()).resolves.toBe(false);
    const retainedRoot = parseCanvasPersistence<{
      projectStates: Record<string, typeof projectSnapshot>;
    }>(values.get('kitty-canvas-state') ?? '{}');
    expect(retainedRoot.projectStates[projectId]?.workspaces.video?.nodes[0]?.data.imageUrl).toBe(
      rootMedia,
    );
    expect(loadCanvasBootstrap(storage)?.workspaces.video?.nodes[0]?.data.imageUrl).toBe(rootMedia);
  });

  it('fails closed when a newer split workspace diverges from an early-v6 root fallback', async () => {
    const projectId = 'project-newer-split';
    const workspace = 'video';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const rootMedia = 'https://example.test/root-old.png';
    const splitMedia = 'https://example.test/split-new.png';
    const tabs: CanvasTab[] = [{ id: 'tab-video', name: '视频画板', workspace }];
    const snapshot = (id: string, imageUrl: string) => ({
      nodes: [
        {
          id,
          type: 'image' as const,
          position: { x: 0, y: 0 },
          data: { kind: 'image' as const, title: id, imageUrl, output: imageUrl },
        },
      ],
      edges: [],
    });
    const rootSnapshot = snapshot('root-old', rootMedia);
    const splitSnapshot = snapshot('split-new', splitMedia);
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'tab-video',
    };
    const values = new Map<string, string>([
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectId,
          projectStates: {
            [projectId]: { ...meta, workspaces: { [workspace]: rootSnapshot } },
          },
          projectMeta: { [projectId]: meta },
          workspace,
          workspaces: { [workspace]: rootSnapshot },
          tabs,
          activeTabId: 'tab-video',
          projectName: '分歧项目',
          projects: [{ id: projectId, name: '分歧项目' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [
        workspaceKey,
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace,
          snapshot: splitSnapshot,
        }),
      ],
    ]);
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');

    await expect(flushCanvasPersistence()).resolves.toBe(false);
    expect(
      setItem.mock.calls.filter(([key]) => key === 'kitty-canvas-state' || key === workspaceKey),
    ).toHaveLength(0);
    expect(values.get('kitty-canvas-state')).toContain(rootMedia);
    expect(values.get(workspaceKey)).toContain(splitMedia);
    expect(useCanvasStore.getState().persistenceStatus.state).toMatch(/error|conflict/);
    expect(useCanvasStore.getState().persistenceStatus.message).toContain('两份不同');
  });

  it('fails closed when project and active compatibility workspaces diverge inside one root', async () => {
    const projectId = 'project-internal-root-divergence';
    const workspace = 'views';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const projectMedia = 'https://example.test/project-state.png';
    const compatibilityMedia = 'https://example.test/active-compatibility.png';
    const tabs: CanvasTab[] = [{ id: 'tab-views', name: '图片画板', workspace }];
    const snapshot = (id: string, imageUrl: string) => ({
      nodes: [
        {
          id,
          type: 'image' as const,
          position: { x: 0, y: 0 },
          data: { kind: 'image' as const, title: id, imageUrl, output: imageUrl },
        },
      ],
      edges: [],
    });
    const projectSnapshot = snapshot('project-state', projectMedia);
    const compatibilitySnapshot = snapshot('active-compatibility', compatibilityMedia);
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'tab-views',
    };
    const rootValue = stringifyCanvasPersistence({
      version: 6,
      activeProjectId: projectId,
      projectStates: {
        [projectId]: { ...meta, workspaces: { [workspace]: projectSnapshot } },
      },
      projectMeta: { [projectId]: meta },
      workspace,
      workspaces: { [workspace]: compatibilitySnapshot },
      tabs,
      activeTabId: 'tab-views',
      projectName: '根内分歧项目',
      projects: [{ id: projectId, name: '根内分歧项目' }],
      genParams: {},
      activeTags: [],
      projectRevisions: {},
    });
    const splitValue = stringifyCanvasPersistence({
      version: 1,
      projectId,
      workspace,
      snapshot: projectSnapshot,
    });
    const values = new Map<string, string>([
      ['kitty-canvas-state', rootValue],
      [workspaceKey, splitValue],
    ]);
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, loadCanvasBootstrap, useCanvasStore } =
      await import('./canvasStore');

    expect(loadCanvasBootstrap(storage)?.workspaceDivergence).toContain('画布根快照内');
    expect(useCanvasStore.getState().persistenceStatus.state).toBe('conflict');
    await expect(flushCanvasPersistence()).resolves.toBe(false);
    expect(useCanvasStore.getState().persistenceStatus.message).toContain('画布根快照内');
    expect(
      setItem.mock.calls.filter(
        ([key]) => key === 'kitty-canvas-state' || key.startsWith('kitty-canvas-workspace-state:'),
      ),
    ).toHaveLength(0);
    expect(values.get('kitty-canvas-state')).toBe(rootValue);
    expect(values.get(workspaceKey)).toBe(splitValue);
    expect(rootValue).toContain(projectMedia);
    expect(rootValue).toContain(compatibilityMedia);
  });

  it.each([
    ['current', 'kitty-canvas-state', '{"format":"kitty-canvas-storage","payload":'],
    ['legacy', 'libtv-canvas-state', '{"format":"kitty-canvas-storage","payload":'],
    ['empty current', 'kitty-canvas-state', ''],
  ])(
    'keeps a malformed %s root untouched and blocks canvas writes',
    async (_label, rootKey, malformedRoot) => {
      const values = new Map<string, string>([[rootKey, malformedRoot]]);
      const setItem = vi.fn((key: string, value: string) => values.set(key, value));
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem,
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } as Storage;
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage,
      });

      const { flushCanvasPersistence, loadCanvasBootstrap, useCanvasStore } =
        await import('./canvasStore');

      const loaded = loadCanvasBootstrap(storage);
      expect(loaded?.workspaceDivergence).toContain('根快照无法读取');
      expect(useCanvasStore.getState().persistenceStatus.state).toBe('conflict');
      await expect(flushCanvasPersistence()).resolves.toBe(false);
      expect(useCanvasStore.getState().persistenceStatus.message).toContain('读取失败');
      expect(values.get(rootKey)).toBe(malformedRoot);
      expect(values.has('kitty-canvas-state')).toBe(rootKey === 'kitty-canvas-state');
      expect(
        setItem.mock.calls.filter(
          ([key]) =>
            key === 'kitty-canvas-state' || key.startsWith('kitty-canvas-workspace-state:'),
        ),
      ).toHaveLength(0);
    },
  );

  it('keeps a legacy v5 root authoritative over an interrupted stale split migration', async () => {
    const projectId = 'project-v5-root-authority';
    const workspace = 'views';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const rootMedia = 'https://example.test/root-current.png';
    const staleMedia = 'https://example.test/split-stale.png';
    const tabs: CanvasTab[] = [{ id: 'tab-views', name: '图片画板', workspace }];
    const snapshot = (id: string, imageUrl: string) => ({
      nodes: [
        {
          id,
          type: 'image' as const,
          position: { x: 0, y: 0 },
          data: { kind: 'image' as const, title: id, imageUrl, output: imageUrl },
        },
      ],
      edges: [],
    });
    const rootSnapshot = snapshot('root-current', rootMedia);
    const staleSnapshot = snapshot('split-stale', staleMedia);
    const values = new Map<string, string>([
      ['qiansi-canvas-preferences-v1', JSON.stringify({ startupTarget: 'last-session' })],
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 5,
          activeProjectId: projectId,
          workspace,
          workspaces: { [workspace]: rootSnapshot },
          tabs,
          activeTabId: 'tab-views',
          projectName: '旧版根快照',
          projects: [{ id: projectId, name: '旧版根快照' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [
        workspaceKey,
        stringifyCanvasPersistence({
          version: 1,
          projectId,
          workspace,
          snapshot: staleSnapshot,
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
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, loadCanvasBootstrap, useCanvasStore } =
      await import('./canvasStore');

    expect(loadCanvasBootstrap(storage)?.workspaces.views?.nodes[0]?.data.imageUrl).toBe(rootMedia);
    expect(useCanvasStore.getState().nodes[0]?.data.imageUrl).toBe(rootMedia);
    await expect(flushCanvasPersistence()).resolves.toBe(true);

    const savedWorkspace = parseCanvasPersistence<{
      snapshot: { nodes: FlowNode[] };
    }>(values.get(workspaceKey) ?? '{}');
    expect(savedWorkspace.snapshot.nodes[0]?.data.imageUrl).toBe(rootMedia);
    expect(JSON.stringify(savedWorkspace.snapshot)).not.toContain(staleMedia);
  });

  it('rolls back a newly written workspace when the catalog commit exceeds quota', async () => {
    const projectId = 'project-workspace-rollback';
    const existingWorkspace = 'views';
    const newWorkspace = 'video';
    const existingKey = canvasWorkspaceStorageKey(projectId, existingWorkspace);
    const newKey = canvasWorkspaceStorageKey(projectId, newWorkspace);
    const tabs: CanvasTab[] = [{ id: 'tab-views', name: '图片画板', workspace: existingWorkspace }];
    const existingSnapshot = {
      nodes: [
        {
          id: 'existing-image',
          type: 'image' as const,
          position: { x: 0, y: 0 },
          data: {
            kind: 'image' as const,
            title: '原工作台',
            imageUrl: 'https://example.test/existing.png',
          },
        },
      ],
      edges: [],
    };
    const meta = {
      workspace: existingWorkspace,
      workspaceIds: [existingWorkspace],
      tabs,
      activeTabId: 'tab-views',
    };
    const rootValue = stringifyCanvasPersistence({
      version: 6,
      activeProjectId: projectId,
      projectStates: {},
      projectMeta: { [projectId]: meta },
      workspace: existingWorkspace,
      workspaces: {},
      tabs,
      activeTabId: 'tab-views',
      projectName: '工作台回滚项目',
      projects: [{ id: projectId, name: '工作台回滚项目' }],
      genParams: {},
      activeTags: [],
      projectRevisions: {},
    });
    const existingValue = stringifyCanvasPersistence({
      version: 1,
      projectId,
      workspace: existingWorkspace,
      snapshot: existingSnapshot,
    });
    const values = new Map<string, string>([
      ['kitty-canvas-state', rootValue],
      [existingKey, existingValue],
    ]);
    let rejectRootCommit = false;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (rejectRootCommit && key === 'kitty-canvas-state') {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
    const draftNode: FlowNode = {
      id: 'unsaved-video-reference',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '尚未提交的新工作台',
        imageUrl: 'https://example.test/new-video-reference.png',
      },
    };
    useCanvasStore.setState({
      workspace: newWorkspace,
      nodes: [draftNode],
      edges: [],
      tabs: [...tabs, { id: 'tab-video', name: '视频画板', workspace: newWorkspace }],
      activeTabId: 'tab-video',
    });
    rejectRootCommit = true;

    await expect(flushCanvasPersistence()).resolves.toBe(false);

    expect(values.get('kitty-canvas-state')).toBe(rootValue);
    expect(values.get(existingKey)).toBe(existingValue);
    expect(values.has(newKey)).toBe(false);
    expect(useCanvasStore.getState().nodes[0]?.id).toBe(draftNode.id);
    expect(useCanvasStore.getState().persistenceStatus.message).toContain('本地保存空间不足');
  });
});
