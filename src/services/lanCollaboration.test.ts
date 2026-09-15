import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { BRIDGE_BASE_URL } from '../lib/bridgeUrl';
import {
  captureSharedProjectWorkspace,
  useCanvasStore,
  type SharedProjectWorkspace,
} from '../store/canvasStore';
import {
  exportLanCollaborationConflictCopy,
  getLanCollaborationConflictCopy,
  initialLoadedLanScopeMatchesRemote,
  initialLanCollaborationConflict,
  localSharedProjectWorkspace,
  mergeSharedProjectWorkspaces,
  mergeInitialSharedProjectWorkspaces,
  portableSharedProjectWorkspace,
  startLanCollaboration,
} from './lanCollaboration';
import { isLanCollaborationHealth } from './lanCollaborationSession';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function node(id: string, x: number): FlowNode {
  return {
    id,
    type: 'image',
    position: { x, y: 0 },
    data: { kind: 'image', title: id },
  };
}

function project(nodes: FlowNode[], revision = 1): SharedProjectWorkspace {
  return {
    version: 2,
    projectId: 'project-1',
    projectName: '协作项目',
    workspaces: { views: { nodes, edges: [] } },
    tabs: [{ id: 'tab-1', name: '画板 1', workspace: 'views' }],
    assets: [],
    trash: [],
    genParams: {
      aspectRatio: '16:9',
      resolution: '720P',
      quality: 'standard',
      count: 1,
      viewCount: 3,
    },
    activeTags: [],
    revision,
  };
}

describe('LAN collaboration merge', () => {
  it('only accepts an explicitly enabled bridge collaboration session', () => {
    const base = {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      capabilities: { projects: true, managedMedia: true },
    };

    expect(
      isLanCollaborationHealth({
        ...base,
        scope: 'host',
        collaborationEnabled: true,
      }),
    ).toBe(true);
    expect(
      isLanCollaborationHealth({
        ...base,
        scope: 'collaboration',
        collaborationEnabled: true,
      }),
    ).toBe(true);
    expect(
      isLanCollaborationHealth({
        ...base,
        scope: 'host',
        collaborationEnabled: false,
      }),
    ).toBe(false);
    expect(isLanCollaborationHealth({ ...base, scope: 'collaboration' })).toBe(false);
    expect(
      isLanCollaborationHealth({ ...base, scope: 'unknown', collaborationEnabled: true }),
    ).toBe(false);
  });

  it('does not start collaboration polling for an ordinary local host session', async () => {
    const projectId = 'ordinary-local-project';
    useCanvasStore.setState({
      activeProjectId: projectId,
      projects: [{ id: projectId, name: '普通本机项目' }],
    });
    const fetchMock = vi.fn(async (_input: string | URL | Request) => ({
      status: 200,
      ok: true,
      json: async () => ({
        ok: true,
        bridge: 'qiansi-canvas-cli-bridge',
        scope: 'host',
        collaborationEnabled: false,
        capabilities: { projects: true, managedMedia: true },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const setInterval = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      setInterval,
      clearInterval: vi.fn(),
      dispatchEvent,
    });

    const stop = startLanCollaboration();
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await Promise.resolve();

      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/health?session=1');
      expect(setInterval).not.toHaveBeenCalled();
      expect(dispatchEvent).not.toHaveBeenCalled();
      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
    } finally {
      stop();
    }
  });

  it('does not archive a bridge project when a local-only project is deleted', async () => {
    const projectId = 'local-delete-project';
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '本机待删除项目',
      projects: [
        { id: projectId, name: '本机待删除项目' },
        { id: 'local-delete-survivor', name: '保留项目' },
      ],
      workspace: 'views',
      nodes: [],
      edges: [],
      assets: [],
      trash: [],
      activeTags: new Set(),
    });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      json: async () => ({
        ok: true,
        bridge: 'qiansi-canvas-cli-bridge',
        scope: 'host',
        collaborationEnabled: false,
        capabilities: { projects: true, managedMedia: true },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    useCanvasStore.getState().deleteProject();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    expect(useCanvasStore.getState().activeProjectId).toBe('local-delete-survivor');
  });

  it('does not start polling when cleanup wins a pending session probe', async () => {
    let finishProbe: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finishProbe = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const setInterval = vi.fn();
    vi.stubGlobal('window', {
      setInterval,
      clearInterval: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const stop = startLanCollaboration();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    stop();
    finishProbe?.({
      status: 200,
      ok: true,
      json: async () => ({
        ok: true,
        bridge: 'qiansi-canvas-cli-bridge',
        scope: 'collaboration',
        collaborationEnabled: true,
        capabilities: { projects: true, managedMedia: true },
      }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(setInterval).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps independent node edits made by two terminals', () => {
    const base = project([node('a', 0), node('b', 0)]);
    const local = project([node('a', 120), node('b', 0)]);
    const remote = project([node('a', 0), node('b', 240)], 2);

    const merged = mergeSharedProjectWorkspaces(base, local, remote);

    expect(merged.workspaces.views?.nodes).toEqual([
      expect.objectContaining({ id: 'a', position: { x: 120, y: 0 } }),
      expect.objectContaining({ id: 'b', position: { x: 240, y: 0 } }),
    ]);
    expect(merged.revision).toBe(2);
  });

  it('does not let an unchanged local deletion erase a concurrently edited remote node', () => {
    const base = project([node('a', 0)]);
    const local = project([]);
    const remote = project([node('a', 300)], 2);

    expect(mergeSharedProjectWorkspaces(base, local, remote).workspaces.views?.nodes).toEqual([
      expect.objectContaining({ id: 'a', position: { x: 300, y: 0 } }),
    ]);
  });

  it('conservatively reconciles first contact instead of replacing offline local edits', () => {
    const local = project([node('same', 120), node('local-only', 10)]);
    const remote = project([node('same', 300), node('remote-only', 20)], 7);

    const merged = mergeInitialSharedProjectWorkspaces(local, remote);

    expect(merged.workspaces.views?.nodes).toEqual([
      expect.objectContaining({ id: 'same', position: { x: 120, y: 0 } }),
      expect.objectContaining({ id: 'local-only' }),
      expect.objectContaining({ id: 'remote-only' }),
    ]);
    expect(merged.revision).toBe(7);
  });

  it('creates a lossless first-contact conflict copy for same-id divergent content', () => {
    const local = project([node('same', 120), node('local-only', 10)]);
    const remote = project([node('same', 300), node('remote-only', 20)], 7);

    const conflict = initialLanCollaborationConflict(local, remote);

    expect(conflict).toMatchObject({
      version: 1,
      projectId: 'project-1',
      reason: 'initial-content-diverged',
    });
    expect(conflict?.local.workspaces.views?.nodes).toEqual(local.workspaces.views?.nodes);
    expect(conflict?.remote.workspaces.views?.nodes).toEqual(remote.workspaces.views?.nodes);
    const dismissedCopies = new WeakSet<object>();
    if (conflict) dismissedCopies.add(conflict);
    const changedConflict = initialLanCollaborationConflict(
      project([node('same', 180), node('local-only', 10)]),
      remote,
    );
    expect(changedConflict).toBeDefined();
    expect(changedConflict && dismissedCopies.has(changedConflict)).toBe(false);
    expect(
      initialLanCollaborationConflict(local, {
        ...local,
        revision: 99,
        updatedAt: Date.now(),
      }),
    ).toBeUndefined();
  });

  it('ignores bridge-only manifest metadata when the loaded canvas and trash are identical', () => {
    const local = project([node('current', 20)]);
    const remote = {
      ...structuredClone(local),
      revision: 9,
      updatedAt: Date.now(),
      name: 'Bridge 清单名称',
      title: 'Bridge 清单标题',
      workspace: 'views',
      currentWorkspace: 'views',
      activeWorkspace: 'views',
    } as SharedProjectWorkspace & Record<string, unknown>;

    expect(initialLanCollaborationConflict(local, remote)).toBeUndefined();
    expect(initialLoadedLanScopeMatchesRemote(local, remote, { trash: true })).toBe(true);
  });

  it('does not treat object-key insertion order as a LAN content change', () => {
    const localNode = {
      ...node('current', 20),
      data: { kind: 'image' as const, title: '角色', prompt: '保持身份' },
    };
    const remoteNode = {
      id: localNode.id,
      type: localNode.type,
      position: { y: 0, x: 20 },
      data: { prompt: '保持身份', title: '角色', kind: 'image' as const },
    } as FlowNode;
    const local = project([localNode]);
    const remote = project([remoteNode], 9);

    expect(initialLanCollaborationConflict(local, remote)).toBeUndefined();
    expect(initialLoadedLanScopeMatchesRemote(local, remote, { trash: true })).toBe(true);
  });

  it('does not report a full-project conflict when the exact local workspace is only lazily loaded', () => {
    const local = project([node('current', 20)]);
    const remote: SharedProjectWorkspace = {
      ...structuredClone(local),
      workspaces: {
        ...structuredClone(local.workspaces),
        video: { nodes: [node('remote-video', 40)], edges: [] },
      },
      tabs: [...structuredClone(local.tabs), { id: 'tab-video', name: '视频', workspace: 'video' }],
      assets: [
        {
          id: 'remote-asset',
          kind: 'image',
          title: '远端素材',
          category: 'item',
          createdAt: 1,
          sourceProjectId: 'project-1',
        },
      ],
    };

    expect(initialLanCollaborationConflict(local, remote)).toBeDefined();
    expect(initialLoadedLanScopeMatchesRemote(local, remote)).toBe(true);
    expect(
      initialLoadedLanScopeMatchesRemote(
        { ...local, workspaces: { views: { nodes: [node('current', 99)], edges: [] } } },
        remote,
      ),
    ).toBe(false);
  });

  it('does not treat an unhydrated local trash array as a deletion on cold start', () => {
    const local = project([node('current', 20)]);
    const remote: SharedProjectWorkspace = {
      ...structuredClone(local),
      trash: [
        {
          id: 'remote-trash',
          projectId: 'project-1',
          workspace: 'views',
          title: '远端回收项',
          deletedAt: 1,
          nodes: [node('deleted-node', 0)],
          edges: [],
        },
      ],
    };

    expect(initialLanCollaborationConflict(local, remote)).toBeDefined();
    expect(initialLoadedLanScopeMatchesRemote(local, remote, { trash: false })).toBe(true);
    expect(initialLoadedLanScopeMatchesRemote(local, remote, { trash: true })).toBe(false);
  });

  it('waits for authoritative main-canvas bridge hydration before the first LAN comparison', async () => {
    const projectId = 'main-canvas';
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '我的画布',
      projects: [{ id: projectId, name: '我的画布' }],
      workspace: 'views',
      nodes: [node('host-node', 20)],
      edges: [],
      tabs: [{ id: 'tab-main', name: '画板 1', workspace: 'views' }],
      activeTabId: 'tab-main',
      assets: [],
      trash: [],
      activeTags: new Set(),
      persistenceStatus: { projectId, state: 'idle' },
    });
    const local = captureSharedProjectWorkspace();
    const remote = {
      ...structuredClone(local),
      revision: 4,
      updatedAt: Date.now(),
      name: 'Bridge 清单名称',
      currentWorkspace: 'views',
    } as SharedProjectWorkspace & Record<string, unknown>;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/health?session=1')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            bridge: 'qiansi-canvas-cli-bridge',
            scope: 'collaboration',
            collaborationEnabled: true,
            capabilities: { projects: true, managedMedia: true },
          }),
        };
      }
      if (url.endsWith(`/projects/${projectId}`)) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ workspace: remote }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ projects: [{ id: projectId, name: '我的画布' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    let poll: (() => void) | undefined;
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      setInterval: vi.fn((callback: () => void) => {
        poll = callback;
        return 1;
      }),
      clearInterval: vi.fn(),
      dispatchEvent,
    });

    const stop = startLanCollaboration();
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(poll).toBeTypeOf('function'));
      poll?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
      expect(dispatchEvent).not.toHaveBeenCalled();

      useCanvasStore.setState({
        persistenceStatus: {
          projectId,
          state: 'saved',
          revision: 4,
          writerId: 'bridge',
          lastSavedAt: Date.now(),
        },
      });
      poll?.();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
      expect(dispatchEvent).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('does not overwrite a local edit made while the first LAN reads are in flight', async () => {
    const projectId = 'main-canvas';
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '我的画布',
      projects: [{ id: projectId, name: '我的画布' }],
      workspace: 'views',
      nodes: [node('before-read', 20)],
      edges: [],
      tabs: [{ id: 'tab-main', name: '画板 1', workspace: 'views' }],
      activeTabId: 'tab-main',
      assets: [],
      trash: [],
      activeTags: new Set(),
      persistenceStatus: {
        projectId,
        state: 'saved',
        revision: 4,
        writerId: 'bridge',
        lastSavedAt: Date.now(),
      },
    });
    const remote = { ...captureSharedProjectWorkspace(), revision: 4 };
    let finishProjectRead: ((response: unknown) => void) | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/health?session=1')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            bridge: 'qiansi-canvas-cli-bridge',
            scope: 'collaboration',
            collaborationEnabled: true,
            capabilities: { projects: true, managedMedia: true },
          }),
        };
      }
      if (url.endsWith(`/projects/${projectId}`)) {
        return new Promise((resolve) => {
          finishProjectRead = resolve;
        });
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ projects: [{ id: projectId, name: '我的画布' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
      dispatchEvent,
    });

    const stop = startLanCollaboration();
    try {
      await vi.waitFor(() => expect(finishProjectRead).toBeTypeOf('function'));
      useCanvasStore.setState({ nodes: [node('edited-during-read', 80)] });
      finishProjectRead?.({
        status: 200,
        ok: true,
        json: async () => ({ workspace: remote }),
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(useCanvasStore.getState().nodes[0]?.id).toBe('edited-during-read');
      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
      expect(dispatchEvent).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('does not report the current page previous save as a different LAN writer', async () => {
    const projectId = 'main-canvas';
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '我的画布',
      projects: [{ id: projectId, name: '我的画布' }],
      workspace: 'views',
      nodes: [node('saved-at-revision-4', 0)],
      edges: [],
      tabs: [{ id: 'tab-main', name: '画板 1', workspace: 'views' }],
      activeTabId: 'tab-main',
      assets: [],
      trash: [],
      activeTags: new Set(),
      persistenceStatus: {
        projectId,
        state: 'saved',
        revision: 4,
        writerId: 'bridge',
        lastSavedAt: Date.now(),
      },
    });
    let remote: SharedProjectWorkspace = {
      ...captureSharedProjectWorkspace(),
      revision: 4,
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/health?session=1')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            bridge: 'qiansi-canvas-cli-bridge',
            scope: 'collaboration',
            collaborationEnabled: true,
            capabilities: { projects: true, managedMedia: true },
          }),
        };
      }
      if (url.endsWith(`/projects/${projectId}`)) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ workspace: structuredClone(remote) }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ projects: [{ id: projectId, name: '我的画布' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    let poll: (() => void) | undefined;
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      setInterval: vi.fn((callback: () => void) => {
        poll = callback;
        return 1;
      }),
      clearInterval: vi.fn(),
      dispatchEvent,
    });

    const stop = startLanCollaboration();
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

      // The same page has a newer edit while the Bridge exposes its preceding
      // acknowledged save. The read-only observer must not label that normal
      // save pipeline as a second terminal; the Bridge CAS writer owns any
      // genuine revision conflict.
      useCanvasStore.setState({ nodes: [node('newer-local-edit', 20)] });
      remote = {
        ...remote,
        revision: 5,
        workspaces: {
          views: { nodes: [node('preceding-local-save', 10)], edges: [] },
        },
      };
      poll?.();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(useCanvasStore.getState().nodes[0]?.id).toBe('newer-local-edit');
      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
      expect(dispatchEvent).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('does not emit the retired first-sync conflict for the Bridge-authoritative canvas', async () => {
    const projectId = 'main-canvas';
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '首轮冲突项目',
      projects: [
        { id: projectId, name: '首轮冲突项目' },
        { id: 'local-only-project', name: '仅本机项目' },
      ],
      workspace: 'views',
      nodes: [node('same', 120)],
      edges: [],
      tabs: [{ id: 'tab-first-contact', name: '画板 1', workspace: 'views' }],
      activeTabId: 'tab-first-contact',
      assets: [],
      trash: [],
      activeTags: new Set(),
      persistenceStatus: {
        projectId,
        state: 'saved',
        revision: 6,
        writerId: 'bridge',
        lastSavedAt: Date.now(),
      },
    });
    const local = captureSharedProjectWorkspace();
    const remote: SharedProjectWorkspace = {
      ...local,
      revision: 7,
      workspaces: {
        ...local.workspaces,
        views: { nodes: [node('same', 300)], edges: [] },
      },
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/health?session=1')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            bridge: 'qiansi-canvas-cli-bridge',
            scope: 'collaboration',
            collaborationEnabled: true,
            capabilities: { projects: true, managedMedia: true },
          }),
        };
      }
      if (init?.method === 'PUT') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ workspace: remote }),
        };
      }
      if (url.endsWith(`/projects/${projectId}`)) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ workspace: remote }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ projects: [{ id: projectId, name: '主机项目' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    let poll: (() => void) | undefined;
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      setInterval: vi.fn((callback: () => void) => {
        poll = callback;
        return 1;
      }),
      clearInterval: vi.fn(),
      dispatchEvent,
    });
    const stop = startLanCollaboration();
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
      expect(useCanvasStore.getState().projects).toEqual([{ id: projectId, name: '主机项目' }]);
      expect(useCanvasStore.getState().nodes[0]?.position.x).toBe(120);
      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
      expect(exportLanCollaborationConflictCopy(projectId)).toBeUndefined();

      poll?.();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
      // The polling callback intentionally returns void, while synchronize()
      // clears its busy flag after both reads have resolved. Let that final
      // microtask settle before simulating the next interval tick.
      await new Promise((resolve) => setTimeout(resolve, 0));
      poll?.();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
      expect(getLanCollaborationConflictCopy(projectId)).toBeUndefined();
      expect(dispatchEvent).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('stores bridge media as host-portable paths for other LAN terminals', () => {
    const workspace = project([
      {
        ...node('image', 0),
        data: {
          kind: 'image',
          title: '共享图片',
          imageUrl: 'http://127.0.0.1:2896/asset-library/files/asset_123456?preview=image',
          previewUrl: 'http://127.0.0.1:2896/media-preview/files/asset_123456.webp',
        },
      },
    ]);

    expect(
      portableSharedProjectWorkspace(workspace).workspaces.views?.nodes[0]?.data.imageUrl,
    ).toBe('/asset-library/files/asset_123456?preview=image');
    expect(
      portableSharedProjectWorkspace(workspace).workspaces.views?.nodes[0]?.data.previewUrl,
    ).toBe('/media-preview/files/asset_123456.webp');
  });

  it('canonicalizes old development-proxy media before LAN comparison and adoption', () => {
    const legacyWorkspace = project([
      {
        ...node('legacy-image', 0),
        data: {
          kind: 'image',
          title: '旧代理图片',
          imageUrl: 'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_legacy',
          previewUrl:
            'http://localhost:2895/__qiansi_bridge/media-preview/files/preview_legacy.webp',
        },
      },
    ]);

    const portable = portableSharedProjectWorkspace(legacyWorkspace);
    expect(portable.workspaces.views?.nodes[0]?.data).toMatchObject({
      imageUrl: '/asset-library/files/asset_legacy',
      previewUrl: '/media-preview/files/preview_legacy.webp',
    });

    const localized = localSharedProjectWorkspace(portable);
    expect(localized.workspaces.views?.nodes[0]?.data).toMatchObject({
      imageUrl: `${BRIDGE_BASE_URL}/asset-library/files/asset_legacy`,
      previewUrl: `${BRIDGE_BASE_URL}/media-preview/files/preview_legacy.webp`,
    });
    expect(
      initialLoadedLanScopeMatchesRemote(localized, localSharedProjectWorkspace(legacyWorkspace)),
    ).toBe(true);
  });

  it('projects a browser-session image before publishing it to another LAN terminal', () => {
    const workspace = project([
      {
        ...node('session-image', 0),
        data: {
          kind: 'image',
          title: '会话图片',
          prompt: 'file:///C:/shot.png',
          imageUrl: 'blob:http://127.0.0.1/session-image',
          images: ['blob:http://127.0.0.1/session-image'],
          output: 'blob:http://127.0.0.1/session-image',
        },
      },
    ]);

    const sentData = portableSharedProjectWorkspace(workspace).workspaces.views?.nodes[0]?.data;
    expect(sentData).toMatchObject({
      kind: 'image',
      title: '会话图片',
      prompt: 'file:///C:/shot.png',
      mediaPersistenceState: 'session-only',
    });
    expect(sentData?.imageUrl).toBeUndefined();
    expect(sentData?.images).toEqual([]);
    expect(sentData?.output).toBeUndefined();
  });

  it('does not report a false LAN conflict between a live session URL and its durable marker', () => {
    const local = project([
      {
        ...node('session-image', 0),
        data: {
          kind: 'image',
          title: '会话图片',
          imageUrl: 'blob:http://127.0.0.1/session-image',
          images: ['blob:http://127.0.0.1/session-image'],
          output: 'blob:http://127.0.0.1/session-image',
        },
      },
    ]);
    const remote = portableSharedProjectWorkspace(local);

    expect(initialLanCollaborationConflict(local, remote)).toBeUndefined();
    expect(initialLoadedLanScopeMatchesRemote(local, remote)).toBe(true);
  });

  it('does not rewrite a third-party URL that happens to use a bridge-like path', () => {
    const externalUrl = 'https://cdn.example.test/output/song.mp3';
    const localServiceUrl = 'http://127.0.0.1:8188/output/song.mp3';
    const workspace = project([
      {
        id: 'audio',
        type: 'audio',
        position: { x: 0, y: 0 },
        data: {
          kind: 'audio',
          title: '外部音频',
          audioUrl: externalUrl,
          audios: [localServiceUrl],
        },
      },
    ]);

    expect(
      portableSharedProjectWorkspace(workspace).workspaces.views?.nodes[0]?.data.audioUrl,
    ).toBe(externalUrl);
    expect(
      portableSharedProjectWorkspace(workspace).workspaces.views?.nodes[0]?.data.audios,
    ).toEqual([localServiceUrl]);
  });

  it('keeps audio portable on disk and localizes it for the current LAN host', () => {
    const assetPath = '/asset-library/files/asset_audio_123456';
    const localAssetUrl = `${BRIDGE_BASE_URL}${assetPath}`;
    const workspace = project([
      {
        id: 'audio',
        type: 'audio',
        position: { x: 0, y: 0 },
        data: {
          kind: 'audio',
          title: '共享录音',
          audioUrl: localAssetUrl,
          audios: [localAssetUrl],
          output: localAssetUrl,
        },
      },
    ]);
    const portableWorkspace = portableSharedProjectWorkspace(workspace);
    const sentData = portableWorkspace.workspaces.views?.nodes[0]?.data;
    expect(sentData?.audioUrl).toBe(assetPath);
    expect(sentData?.audios).toEqual([assetPath]);
    expect(sentData?.output).toBe(assetPath);

    const adoptedData =
      localSharedProjectWorkspace(portableWorkspace).workspaces.views?.nodes[0]?.data;
    expect(adoptedData?.audioUrl).toBe(localAssetUrl);
    expect(adoptedData?.audios).toEqual([localAssetUrl]);
    expect(adoptedData?.output).toBe(localAssetUrl);
  });
});
