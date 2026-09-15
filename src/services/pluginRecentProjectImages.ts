import type { FlowNode } from '../canvas/nodeTypes';
import { canvasNodeImageOptions } from '../lib/canvasNodeImageOptions';
import { selectRecentlyUsedCanvases } from '../components/projects/projectPresentation';
import { readBridgeWorkspace } from './bridgeCanvasPersistence';
import { listProjects, type ProjectCatalog, type ProjectSummary } from './projectHub';

export interface PluginRecentProjectImageOption {
  id: string;
  nodeId: string;
  title: string;
  url: string;
}

export interface PluginRecentProjectImages {
  project: ProjectSummary | null;
  images: PluginRecentProjectImageOption[];
}

type WorkspacePayload = { nodes: FlowNode[] };

type Dependencies = {
  list?: () => Promise<ProjectCatalog>;
  readWorkspace?: (
    projectId: string,
    workspaceId: 'views',
  ) => Promise<{ workspace: WorkspacePayload } | null>;
};

/** Read only the first entry from the same recently-used ordering shown on Home. */
export async function loadMostRecentPluginProjectImages(
  dependencies: Dependencies = {},
): Promise<PluginRecentProjectImages> {
  const catalog = await (dependencies.list ?? listProjects)();
  const project = selectRecentlyUsedCanvases(catalog.projects, 1)[0] ?? null;
  if (!project) return { project: null, images: [] };

  const loaded = await (dependencies.readWorkspace ?? readBridgeWorkspace<WorkspacePayload>)(
    project.id,
    'views',
  );
  const nodes = Array.isArray(loaded?.workspace?.nodes) ? loaded.workspace.nodes : [];
  return {
    project,
    images: canvasNodeImageOptions(nodes).map((option) => ({
      ...option,
      id: `${project.id}:${option.id}`,
    })),
  };
}
