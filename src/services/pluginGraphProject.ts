import { addEdge, type Connection } from '@xyflow/react';
import type { FlowEdge, FlowNode, Point } from '../canvas/nodeTypes';
import { KIND_DEFAULTS } from '../canvas/placeholders';
import { isValidConnection, resolveConnectionPorts } from '../graph/graph';
import {
  createBridgeWorkflowProject,
  flushCanvasPersistence,
  runCanvasHistoryTransaction,
  useCanvasStore,
} from '../store/canvasStore';
import type { PluginHostNodeKind } from './pluginRegistry';

export type PluginGraphNode = {
  clientId: string;
  kind: Exclude<PluginHostNodeKind, 'plugin'>;
  position: Point;
  data: Record<string, unknown>;
};

export type PluginGraphEdge = {
  clientId: string;
  source: string;
  target: string;
};

export type PluginProjectGraphRequest = {
  applicationId: string;
  name: string;
  nodes: PluginGraphNode[];
  edges: PluginGraphEdge[];
  retryFailed?: true;
};

export type PluginProjectGraphReceipt = {
  projectId: string;
  projectName: string;
  nodeIds: Record<string, string>;
  edgeCount: number;
};

function validationNodes(nodes: PluginGraphNode[]): FlowNode[] {
  return nodes.map((node) => ({
    id: node.clientId,
    type: node.kind,
    position: { ...node.position },
    data: {
      kind: node.kind,
      ...KIND_DEFAULTS[node.kind],
      ...node.data,
    },
  })) as FlowNode[];
}

function validateGraph(nodes: PluginGraphNode[], edges: PluginGraphEdge[]) {
  const clientIds = new Set<string>();
  for (const node of nodes) {
    if (clientIds.has(node.clientId)) throw new Error(`节点标识重复：${node.clientId}。`);
    clientIds.add(node.clientId);
  }
  const edgeIds = new Set<string>();
  const mockNodes = validationNodes(nodes);
  let mockEdges: FlowEdge[] = [];
  for (const edge of edges) {
    if (edgeIds.has(edge.clientId)) throw new Error(`连线标识重复：${edge.clientId}。`);
    edgeIds.add(edge.clientId);
    if (!clientIds.has(edge.source) || !clientIds.has(edge.target)) {
      throw new Error(`连线 ${edge.clientId} 引用了不存在的节点。`);
    }
    const ports = resolveConnectionPorts(mockNodes, edge.source, null, edge.target, null);
    if (
      !ports ||
      !isValidConnection(
        mockNodes,
        mockEdges,
        edge.source,
        ports.source.id,
        edge.target,
        ports.target.id,
      )
    ) {
      throw new Error(`连线 ${edge.clientId} 的节点类型或端口不兼容。`);
    }
    mockEdges = addEdge(
      {
        id: edge.clientId,
        type: 'flow',
        source: edge.source,
        target: edge.target,
        sourceHandle: ports.source.id,
        targetHandle: ports.target.id,
      },
      mockEdges,
    );
  }
}

export function validatePluginProjectGraph(request: PluginProjectGraphRequest) {
  validateGraph(request.nodes, request.edges);
}

export async function createPluginProjectGraph(
  request: PluginProjectGraphRequest,
  options: { creationRequestId: string; onProjectCreationAttempt?: () => void },
): Promise<PluginProjectGraphReceipt> {
  validatePluginProjectGraph(request);
  let createdProjectId: string | undefined;
  let createdProjectName: string | undefined;
  if (
    !(await createBridgeWorkflowProject('views', request.name, {
      requestId: options.creationRequestId,
      onProjectCreationAttempt: options.onProjectCreationAttempt,
      onProjectCreated: (projectId, projectName) => {
        createdProjectId = projectId;
        createdProjectName = projectName;
      },
    }))
  ) {
    throw new Error('宿主未能创建并打开新的画布项目。');
  }
  if (!createdProjectId || !createdProjectName) {
    throw new Error('宿主没有返回新画布项目的确认身份。');
  }
  const projectId = createdProjectId;
  const projectName = createdProjectName;
  if (useCanvasStore.getState().activeProjectId !== projectId) {
    throw new Error('新画布项目身份与当前宿主状态不一致。');
  }
  const mapping: Record<string, string> = Object.create(null) as Record<string, string>;
  try {
    useCanvasStore.getState().importWorkflow([], []);
    runCanvasHistoryTransaction(() => {
      for (const node of request.nodes) {
        const nodeId = useCanvasStore.getState().addNode(node.kind, node.position);
        mapping[node.clientId] = nodeId;
        if (Object.keys(node.data).length > 0) {
          useCanvasStore.getState().updateNodeData(nodeId, node.data);
        }
      }
      for (const edge of request.edges) {
        const source = mapping[edge.source];
        const target = mapping[edge.target];
        if (!source || !target) throw new Error(`连线 ${edge.clientId} 的节点映射不完整。`);
        const connection: Connection = {
          source,
          target,
          sourceHandle: null,
          targetHandle: null,
        };
        useCanvasStore.getState().onConnect(connection);
      }
    });

    const applied = useCanvasStore.getState();
    if (
      applied.activeProjectId !== projectId ||
      applied.nodes.length !== request.nodes.length ||
      applied.edges.length !== request.edges.length
    ) {
      throw new Error('宿主拒绝了部分节点或连线。');
    }
    if (!(await flushCanvasPersistence())) {
      throw new Error('节点图已写入新画布，但首次持久化未确认。');
    }
  } catch (error) {
    // Project creation is already durable at this point. Fail closed by
    // clearing any partially applied graph and persisting that empty state;
    // never leave a half-connected graph that looks ready to run.
    if (useCanvasStore.getState().activeProjectId === projectId) {
      useCanvasStore.getState().importWorkflow([], []);
      useCanvasStore.setState({ past: [], future: [] });
      await flushCanvasPersistence().catch(() => false);
    }
    throw error;
  }
  return {
    projectId,
    projectName,
    nodeIds: mapping,
    edgeCount: request.edges.length,
  };
}
