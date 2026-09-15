const REACT_FLOW_SURFACE_SELECTOR = '.react-flow';
const GRAPH_CONTEXT_TARGET_SELECTOR = [
  '.react-flow__edge',
  '.react-flow__handle',
  '.react-flow__minimap',
  '.react-flow__controls',
].join(', ');

type ClosestTarget = {
  closest: (selectors: string) => unknown;
};

type AttributeTarget = {
  getAttribute: (name: string) => string | null;
};

function supportsClosest(target: unknown): target is ClosestTarget {
  return Boolean(
    target &&
    typeof target === 'object' &&
    typeof (target as Partial<ClosestTarget>).closest === 'function',
  );
}

/**
 * React Flow's multi-selection rectangle sits above the pane and does not
 * dispatch `onPaneContextMenu`. Capture contextmenu on the canvas wrapper for
 * React Flow surfaces, including that rectangle and selected nodes. The caller
 * still preserves unselected-node, edge, handle, minimap and controls menus.
 */
export function shouldCaptureSelectionContextMenu(target: unknown): boolean {
  if (!supportsClosest(target)) return false;
  if (!target.closest(REACT_FLOW_SURFACE_SELECTOR)) return false;
  return !target.closest(GRAPH_CONTEXT_TARGET_SELECTOR);
}

export function selectedNodeIdAtContextTarget(target: unknown): string | null {
  if (!supportsClosest(target)) return null;
  const node = target.closest('.react-flow__node');
  if (!node || typeof (node as Partial<AttributeTarget>).getAttribute !== 'function') return null;
  return (node as AttributeTarget).getAttribute('data-id');
}
