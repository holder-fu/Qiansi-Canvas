import { describe, expect, it } from 'vitest';
import type { FlowEdge, FlowNode, WorkspaceId } from '../canvas/nodeTypes';
import { stringifyCanvasPersistence } from './canvasPersistenceCodec';
import { loadCanvasBootstrap } from './canvasStore';
import { canvasWorkspaceStorageKey, writeCanvasWorkspaceSnapshot } from './canvasWorkspaceStorage';

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

describe('canvas bootstrap loading boundary', () => {
  it('reads only the lightweight catalog and active workspace when many canvases exist', () => {
    const { storage, values, reads } = trackedStorage();
    const projects = Array.from({ length: 40 }, (_, index) => ({
      id: `project-${index}`,
      name: `项目 ${index}`,
    }));
    const workspaceIds: WorkspaceId[] = ['script', 'views', 'video', 'audio'];
    const projectMeta = Object.fromEntries(
      projects.map((project) => [
        project.id,
        {
          workspace: 'views',
          workspaceIds,
          tabs: [{ id: `${project.id}-tab`, name: '画板 1', workspace: 'views' }],
          activeTabId: `${project.id}-tab`,
        },
      ]),
    );
    const activeNode: FlowNode = {
      id: 'active-text',
      type: 'text',
      position: { x: 20, y: 30 },
      data: { kind: 'text', title: '当前文本', prompt: '只恢复当前画布' },
    };
    const activeEdge: FlowEdge = {
      id: 'active-edge',
      source: 'active-text',
      target: 'active-text',
      sourceHandle: 'out',
      targetHandle: 'text-ref',
      type: 'default',
    };
    writeCanvasWorkspaceSnapshot(storage, 'project-0', 'views', {
      nodes: [activeNode],
      edges: [activeEdge],
    });
    values.set(
      'kitty-canvas-state',
      stringifyCanvasPersistence({
        version: 6,
        activeProjectId: 'project-0',
        projectStates: {},
        projectMeta,
        workspace: 'views',
        workspaces: {},
        tabs: projectMeta['project-0']?.tabs ?? [],
        activeTabId: 'project-0-tab',
        projectName: '项目 0',
        projects,
        genParams: {},
        activeTags: [],
        projectRevisions: {},
      }),
    );
    for (let projectIndex = 1; projectIndex < projects.length; projectIndex += 1) {
      for (const workspace of workspaceIds) {
        values.set(
          canvasWorkspaceStorageKey(`project-${projectIndex}`, workspace),
          'DORMANT_WORKSPACE_MUST_NOT_BE_PARSED',
        );
      }
    }

    const loaded = loadCanvasBootstrap(storage);

    expect(loaded?.activeProjectId).toBe('project-0');
    expect(loaded?.workspaces.views).toEqual({ nodes: [activeNode], edges: [activeEdge] });
    expect(reads).toEqual(['kitty-canvas-state', canvasWorkspaceStorageKey('project-0', 'views')]);
    expect(reads.some((key) => key.includes('project-39'))).toBe(false);
  });
});
