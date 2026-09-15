import type { FlowNode } from '../nodeTypes';

/**
 * The first text node is the root of the canvas text flow. Keep its typed
 * target handles mounted for graph compatibility, but hide its visible left
 * connection control. Later text nodes keep the normal input control.
 */
export function shouldHideTextNodeInputControl(nodes: FlowNode[], nodeId: string): boolean {
  return nodes.find((node) => node.data.kind === 'text')?.id === nodeId;
}
