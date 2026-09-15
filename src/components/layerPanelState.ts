import type { FlowNode } from '../canvas/nodeTypes';

export function toggleLayerNodeVisibility(
  nodes: readonly FlowNode[],
  nodeId: string,
): FlowNode[] | null {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return null;
  return nodes.map((node, nodeIndex) =>
    nodeIndex === index ? { ...node, hidden: !node.hidden } : node,
  );
}

export function moveLayerNode(
  nodes: readonly FlowNode[],
  nodeId: string,
  direction: 'up' | 'down',
): FlowNode[] | null {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return null;
  const swapWith = direction === 'up' ? index + 1 : index - 1;
  if (swapWith < 0 || swapWith >= nodes.length) return null;

  const ordered = [...nodes];
  const current = ordered[index];
  const neighbor = ordered[swapWith];
  if (!current || !neighbor) return null;
  ordered[index] = neighbor;
  ordered[swapWith] = current;
  return ordered.map((node, layerIndex) =>
    node.data.kind === 'group' ? node : { ...node, zIndex: layerIndex + 1 },
  );
}
