import { describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import type { ProjectCatalog, ProjectSummary } from './projectHub';
import { loadMostRecentPluginProjectImages } from './pluginRecentProjectImages';

function project(id: string, updatedAt: number): ProjectSummary {
  return {
    id,
    name: `项目 ${id}`,
    createdAt: updatedAt - 1,
    updatedAt,
  };
}

function catalog(projects: ProjectSummary[]): ProjectCatalog {
  return {
    version: 2,
    catalogRevision: 1,
    primaryProjectId: projects[0]?.id ?? 'fallback',
    projects,
    folders: [],
  };
}

function imageNode(id: string, title: string, url: string): FlowNode {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: { kind: 'image', title, originalUrl: url },
  };
}

describe('plugin recent project images', () => {
  it('reads only the first project from the Home recent-project ordering', async () => {
    const readWorkspace = vi.fn(async (projectId: string, workspaceId: 'views') => ({
      workspace: {
        nodes: [
          imageNode('old-image', '旧图', 'data:image/png;base64,old'),
          imageNode('new-image', '新图', 'data:image/png;base64,new'),
        ],
      },
      projectId,
      workspaceId,
    }));

    const result = await loadMostRecentPluginProjectImages({
      list: async () =>
        catalog([project('older', 10), project('latest', 30), project('middle', 20)]),
      readWorkspace,
    });

    expect(readWorkspace).toHaveBeenCalledTimes(1);
    expect(readWorkspace).toHaveBeenCalledWith('latest', 'views');
    expect(result.project?.id).toBe('latest');
    expect(result.images.map((item) => item.title)).toEqual(['新图', '旧图']);
    expect(result.images[0]?.id).toBe('latest:new-image:0');
  });

  it('does not read any workspace when the recent-project list is empty', async () => {
    const readWorkspace = vi.fn();
    await expect(
      loadMostRecentPluginProjectImages({
        list: async () => catalog([]),
        readWorkspace,
      }),
    ).resolves.toEqual({ project: null, images: [] });
    expect(readWorkspace).not.toHaveBeenCalled();
  });
});
