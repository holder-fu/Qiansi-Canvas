import type { FlowNode } from './nodeTypes';

const NODE_Z_INDEX = 1;
const ACTIVE_NODE_Z_INDEX = 100_000;

/** Keep unchanged userNode identities stable for React Flow's internal-node cache. */
export function createRenderedNodeProjector() {
  const cache = new WeakMap<FlowNode, FlowNode>();
  return (nodes: FlowNode[]): FlowNode[] =>
    nodes.map((node) => {
      const existing = cache.get(node);
      if (existing) return existing;
      const baseZIndex =
        node.data.kind === 'group'
          ? (node.zIndex ?? -1)
          : Math.max(node.zIndex ?? NODE_Z_INDEX, NODE_Z_INDEX);
      const zIndex = node.selected ? Math.max(baseZIndex, ACTIVE_NODE_Z_INDEX) : baseZIndex;
      const rendered = node.zIndex === zIndex ? node : { ...node, zIndex };
      cache.set(node, rendered);
      return rendered;
    });
}
