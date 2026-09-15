import {
  isDirectorNodeKind,
  type FlowEdge,
  type FlowNode,
  type NodeKind,
} from '../canvas/nodeTypes';
import { isPlaceholderMediaUrl } from '../canvas/placeholders';
import { preferredImageReferenceUrls } from '../lib/imageAnnotations';
import { resolvedAudioSource, resolveMediaSourceUrl } from '../lib/mediaPreview';
import { getNodeSpec, resolveInputPort } from './nodeSpecs';
import { isAssetType, type AssetType, type NodePortInputs, type PortDef } from './types';

function pluginAssetType(value: unknown): AssetType {
  return isAssetType(value) ? value : 'any';
}

export function getNodeInputPorts(node: FlowNode): PortDef[] {
  if (node.data.kind !== 'plugin') return getNodeSpec(node.data.kind).inputs;
  return [
    {
      id: 'in',
      direction: 'in',
      assetType: pluginAssetType(node.data.pluginInputType),
      label: '插件输入',
      multiple: true,
    },
  ];
}

export function getNodeOutputPorts(node: FlowNode): PortDef[] {
  if (node.data.kind !== 'plugin') return getNodeSpec(node.data.kind).outputs;
  return [
    {
      id: 'out',
      direction: 'out',
      assetType: pluginAssetType(node.data.pluginOutputType),
      label: '插件输出',
    },
  ];
}

export function resolveNodeOutputPort(
  node: FlowNode,
  sourceHandle?: string | null,
): PortDef | undefined {
  const outputs = getNodeOutputPorts(node);
  if (sourceHandle) return outputs.find((port) => port.id === sourceHandle);
  return outputs[0];
}

export interface ResolvedConnectionPorts {
  source: PortDef;
  target: PortDef;
}

function asValues(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function stringValues(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/** Read a node's current output using the declared source-port asset type. */
export function getNodeOutputValues(node: FlowNode, port: PortDef): unknown[] {
  const resolvedMediaValues = (values: unknown[]) =>
    port.assetType === 'video' || port.assetType === 'audio'
      ? values.map((value) =>
          typeof value === 'string' && (value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value))
            ? resolveMediaSourceUrl(value)
            : value,
        )
      : values;
  const withoutPlaceholderMedia = (values: unknown[]) =>
    port.assetType === 'image' || port.assetType === 'reference'
      ? values.filter((value) => typeof value !== 'string' || !isPlaceholderMediaUrl(value))
      : values;

  if (port.assetType === 'image' || port.assetType === 'reference') {
    if (isDirectorNodeKind(node.data.kind)) {
      const imageBundle = node.data.images?.filter(Boolean) ?? [];
      const outputBundle = Array.isArray(node.data.output)
        ? node.data.output.filter(
            (value): value is string => typeof value === 'string' && Boolean(value),
          )
        : typeof node.data.output === 'string' && node.data.output
          ? [node.data.output]
          : [];
      const directorBundle = imageBundle.length
        ? imageBundle
        : outputBundle.length
          ? outputBundle
          : node.data.imageUrl
            ? [node.data.imageUrl]
            : [];
      if (directorBundle.length) return withoutPlaceholderMedia(directorBundle);
    }
    const preferred = preferredImageReferenceUrls(node.data);
    if (preferred.length) return withoutPlaceholderMedia(preferred);
  }

  if (port.assetType === 'audio' && node.data.audioSourceState === 'unavailable-after-restore') {
    const recovered = resolvedAudioSource(node.data);
    return recovered ? [recovered] : [];
  }

  if (node.data.output != null) {
    return resolvedMediaValues(withoutPlaceholderMedia(asValues(node.data.output)));
  }

  switch (port.assetType) {
    case 'text':
      return asValues(node.data.outputText ?? node.data.result ?? node.data.prompt);
    case 'image':
    case 'reference':
      return withoutPlaceholderMedia(asValues(node.data.images ?? node.data.imageUrl));
    case 'video':
      return resolvedMediaValues(asValues(node.data.videos ?? node.data.videoUrl));
    case 'audio':
      return resolvedMediaValues(asValues(node.data.audios ?? node.data.audioUrl));
    default:
      return [];
  }
}

/** Resolve an omitted legacy target handle to the first compatible input slot. */
export function resolveCompatibleInputPort(
  kind: NodeKind,
  sourceAssetType: AssetType,
  targetHandle?: string | null,
): PortDef | undefined {
  if (targetHandle) {
    const port = resolveInputPort(kind, targetHandle);
    return port && portCompatible(sourceAssetType, port.assetType) ? port : undefined;
  }
  return getNodeSpec(kind).inputs.find((port) => portCompatible(sourceAssetType, port.assetType));
}

/** Resolve the concrete source and target ports for a new or legacy edge. */
export function resolveConnectionPorts(
  nodes: FlowNode[],
  sourceId: string,
  sourceHandle: string | null | undefined,
  targetId: string,
  targetHandle: string | null | undefined,
): ResolvedConnectionPorts | undefined {
  const sourceNode = nodes.find((node) => node.id === sourceId);
  const targetNode = nodes.find((node) => node.id === targetId);
  if (!sourceNode || !targetNode) return undefined;

  const source = resolveNodeOutputPort(sourceNode, sourceHandle);
  if (!source) return undefined;
  const targetPorts = getNodeInputPorts(targetNode);
  const target = targetHandle
    ? targetPorts.find(
        (port) => port.id === targetHandle && portCompatible(source.assetType, port.assetType),
      )
    : targetPorts.find((port) => portCompatible(source.assetType, port.assetType));
  if (!target) return undefined;
  return { source, target };
}

/** Resolve the concrete ports for an existing edge. */
export function resolveEdgePorts(
  nodes: FlowNode[],
  edge: Pick<FlowEdge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
): ResolvedConnectionPorts | undefined {
  return resolveConnectionPorts(
    nodes,
    edge.source,
    edge.sourceHandle,
    edge.target,
    edge.targetHandle,
  );
}

/** Return all accepted incoming values, grouped by their target input port. */
export function collectNodeInputs(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeId: string,
): NodePortInputs {
  const inputs: NodePortInputs = {};

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const ports = resolveEdgePorts(nodes, edge);
    if (!sourceNode || !ports) continue;

    const values = getNodeOutputValues(sourceNode, ports.source);
    if (values.length === 0) continue;
    inputs[ports.target.id] = [...(inputs[ports.target.id] ?? []), ...values];
  }

  return inputs;
}

/**
 * Generation adapter retained for the current AI service contract. The complete
 * port map remains available through collectNodeInputs; text inputs become the
 * prompt, image/reference inputs become referenceImages, and video inputs remain
 * available as referenceVideos for callers that can sample or submit them.
 */
export function collectUpstream(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeId: string,
): {
  prompt: string;
  directorPrompts: string[];
  referenceImages: string[];
  referenceVideos: string[];
  directorReferenceImages: string[];
  inputs: NodePortInputs;
} {
  const node = nodes.find((item) => item.id === nodeId);
  const inputs = collectNodeInputs(nodes, edges, nodeId);
  const ownPrompt = typeof node?.data.prompt === 'string' ? node.data.prompt : '';
  const directorPrompts = edges
    .filter((edge) => edge.target === nodeId)
    .flatMap((edge) => {
      const sourceNode = nodes.find((item) => item.id === edge.source);
      const prompt = sourceNode?.data.directorConstraintPrompt;
      return sourceNode &&
        isDirectorNodeKind(sourceNode.data.kind) &&
        typeof prompt === 'string' &&
        prompt.trim()
        ? [prompt]
        : [];
    });
  const promptParts = [ownPrompt, ...directorPrompts, ...stringValues(inputs.prompt ?? [])].filter(
    Boolean,
  );
  const inputPorts = node ? getNodeInputPorts(node) : undefined;
  const referenceImages = inputPorts
    ? inputPorts
        .filter((port) => port.assetType === 'image' || port.assetType === 'reference')
        .flatMap((port) => stringValues(inputs[port.id] ?? []))
    : [];
  const referenceVideos = inputPorts
    ? inputPorts
        .filter((port) => port.assetType === 'video')
        .flatMap((port) => stringValues(inputs[port.id] ?? []))
        .slice(0, 5)
    : [];
  // Director references are an ordered semantic bundle. Two roles may
  // intentionally point at the same immutable image (for example two
  // characters sharing one identity sheet), so URL de-duplication would shift
  // every following label/prompt index. The store separately enforces the
  // single live director owner for generated tasks.
  const directorReferenceImages = edges
    .filter((edge) => edge.target === nodeId)
    .flatMap((edge) => {
      const sourceNode = nodes.find((item) => item.id === edge.source);
      if (!sourceNode || !isDirectorNodeKind(sourceNode.data.kind)) return [];
      const ports = resolveEdgePorts(nodes, edge);
      if (!ports) return [];
      return stringValues(getNodeOutputValues(sourceNode, ports.source));
    })
    .slice(0, 5);

  return {
    prompt: promptParts.join('\n'),
    directorPrompts,
    referenceImages,
    referenceVideos,
    directorReferenceImages,
    inputs,
  };
}

/** Topological order with the target node last and all dependencies before it. */
export function topoSort(_nodes: FlowNode[], edges: FlowEdge[], rootId: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const source of edges.filter((edge) => edge.target === id).map((edge) => edge.source)) {
      visit(source);
    }
    order.push(id);
  };
  visit(rootId);
  return order;
}

/** True if the current edge set already contains a directed cycle. */
export function hasCycle(nodes: FlowNode[], edges: FlowEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  }

  const white = 0;
  const gray = 1;
  const black = 2;
  const colors = new Map<string, number>(nodes.map((node) => [node.id, white]));
  const visit = (id: string): boolean => {
    colors.set(id, gray);
    for (const target of adjacency.get(id) ?? []) {
      const color = colors.get(target) ?? white;
      if (color === gray) return true;
      if (color === white && visit(target)) return true;
    }
    colors.set(id, black);
    return false;
  };

  return nodes.some((node) => (colors.get(node.id) ?? white) === white && visit(node.id));
}

/** Would adding source → target introduce a cycle? */
export function wouldCreateCycle(edges: FlowEdge[], source: string, target: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  }

  const seen = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

/** Whether a source port asset type may connect to a target port asset type. */
export function portCompatible(source: AssetType, target: AssetType): boolean {
  if (source === 'any' || target === 'any' || source === target) return true;
  return (
    (source === 'reference' && target === 'image') || (source === 'image' && target === 'reference')
  );
}

/** Return the asset type carried by an edge, including legacy handle-less edges. */
export function getEdgeAssetType(nodes: FlowNode[], edge: FlowEdge): AssetType {
  return resolveEdgePorts(nodes, edge)?.source.assetType ?? 'any';
}

/** Enforce endpoint existence, explicit port ids, types, target capacity, duplicates and DAG shape. */
export function isValidConnection(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceId: string,
  sourceHandle: string | null | undefined,
  targetId: string,
  targetHandle: string | null | undefined,
): boolean {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const sourceNode = nodes.find((node) => node.id === sourceId);
  const targetNode = nodes.find((node) => node.id === targetId);
  const isEffectReference = Boolean(
    sourceNode?.data.effectPresetId || sourceNode?.data.effectPreset,
  );
  // Effect-library nodes are animated references for video generation. Keep
  // this constraint in the graph layer so drag gestures, body drops and
  // programmatic connections cannot bypass the disabled add-node menu.
  if (isEffectReference && targetNode?.data.kind !== 'video') return false;
  const ports = resolveConnectionPorts(nodes, sourceId, sourceHandle, targetId, targetHandle);
  if (!ports || wouldCreateCycle(edges, sourceId, targetId)) return false;

  for (const edge of edges) {
    const existing = resolveEdgePorts(nodes, edge);
    if (!existing) continue;
    if (
      edge.source === sourceId &&
      edge.target === targetId &&
      existing.source.id === ports.source.id &&
      existing.target.id === ports.target.id
    ) {
      return false;
    }
    if (
      !ports.target.multiple &&
      edge.target === targetId &&
      existing.target.id === ports.target.id
    ) {
      return false;
    }
  }

  if (ports.target.maxConnections) {
    const occupied = edges.reduce((count, edge) => {
      if (edge.target !== targetId) return count;
      const existing = resolveEdgePorts(nodes, edge);
      return existing?.target.id === ports.target.id ? count + 1 : count;
    }, 0);
    if (occupied >= ports.target.maxConnections) return false;
  }

  return true;
}
