import type { FlowNode } from '../canvas/nodeTypes';

export interface PanelNodeSelectionState {
  nodes: FlowNode[];
  selectedNodeId: string;
}

/**
 * Convert a search/layer-panel choice into the same single-selection state
 * React Flow uses on the canvas. Keeping the id and every `node.selected`
 * flag in one transition prevents panels from only centering a node while
 * selection-dependent controls continue targeting the previous node.
 */
export function selectNodeFromPanel(
  nodes: readonly FlowNode[],
  nodeId: string,
): PanelNodeSelectionState | null {
  if (!nodes.some((node) => node.id === nodeId)) return null;
  return {
    nodes: nodes.map((node) => {
      const selected = node.id === nodeId;
      return node.selected === selected ? node : { ...node, selected };
    }),
    selectedNodeId: nodeId,
  };
}
