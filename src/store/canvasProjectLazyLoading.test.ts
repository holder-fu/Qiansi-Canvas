import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowEdge, FlowNode, WorkspaceId } from '../canvas/nodeTypes';
import { stringifyCanvasPersistence } from './canvasPersistenceCodec';
import { canvasWorkspaceStorageKey, writeCanvasWorkspaceSnapshot } from './canvasWorkspaceStorage';

const originalLocalStorage = globalThis.localStorage;

function trackedStorage() {
  const values = new Map<string, string>();
  const reads: string[] = [];
  const storage = {
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
  } as Storage;
  return { storage, values, reads };
}

function projectMeta(projectId: string, workspace: WorkspaceId = 'views') {
  return {
    workspace,
    workspaceIds: [workspace],
    tabs: [{ id: `${projectId}-tab`, name: '画板 1', workspace }],
    activeTabId: `${projectId}-tab`,
  };
}

function seedRoot(storage: Storage, activeNodes: FlowNode[]) {
  const activeMeta = projectMeta('project-active');
  const dormantMeta = projectMeta('project-dormant');
  storage.setItem(
    'kitty-canvas-state',
    stringifyCanvasPersistence({
      version: 6,
      activeProjectId: 'project-active',
      projectStates: {
        'project-active': {
          ...activeMeta,
          workspaces: { views: { nodes: activeNodes, edges: [] } },
        },
      },
      projectMeta: {
        'project-active': activeMeta,
        'project-dormant': dormantMeta,
      },
      workspace: 'views',
      workspaces: { views: { nodes: activeNodes, edges: [] } },
      tabs: activeMeta.tabs,
      activeTabId: activeMeta.activeTabId,
      projectName: '当前项目',
      projects: [
        { id: 'project-active', name: '当前项目' },
        { id: 'project-dormant', name: '按需项目' },
      ],
      genParams: {},
      activeTags: [],
      projectRevisions: {},
    }),
  );
}

afterEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('project canvas lazy loading', () => {
  it('reads the target workspace only when the user switches projects', async () => {
    const { storage, reads } = trackedStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    seedRoot(storage, []);
    const dormantNode: FlowNode = {
      id: 'dormant-text',
      type: 'text',
      position: { x: 10, y: 20 },
      data: { kind: 'text', title: '按需文本', prompt: '切换后才读取' },
    };
    const dormantEdge: FlowEdge = {
      id: 'dormant-edge',
      source: 'dormant-text',
      target: 'dormant-text',
      sourceHandle: 'out',
      targetHandle: 'text-ref',
      type: 'default',
    };
    writeCanvasWorkspaceSnapshot(storage, 'project-dormant', 'views', {
      nodes: [dormantNode],
      edges: [dormantEdge],
    });
    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');
    reads.length = 0;

    useCanvasStore.getState().switchProject('project-dormant');

    expect(reads.filter((key) => key.startsWith('kitty-canvas-workspace-state:'))).toEqual([
      canvasWorkspaceStorageKey('project-dormant', 'views'),
    ]);
    expect(useCanvasStore.getState().activeProjectId).toBe('project-dormant');
    expect(useCanvasStore.getState().nodes).toMatchObject([
      {
        id: dormantNode.id,
        position: dormantNode.position,
        data: { kind: 'text', title: '按需文本', prompt: '切换后才读取' },
      },
    ]);
    expect(useCanvasStore.getState().edges).toEqual([dormantEdge]);
    await flushCanvasPersistence();
  });

  it('does not seed over a corrupt workspace that the catalog says exists', async () => {
    const { storage, values } = trackedStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    seedRoot(storage, []);
    values.set(canvasWorkspaceStorageKey('project-dormant', 'views'), '{malformed');
    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');

    useCanvasStore.getState().switchProject('project-dormant');

    expect(useCanvasStore.getState().activeProjectId).toBe('project-active');
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      projectId: 'project-active',
      state: 'error',
    });
    expect(values.get(canvasWorkspaceStorageKey('project-dormant', 'views'))).toBe('{malformed');
    await flushCanvasPersistence();
  });
});
