import type { EdgeProps } from '@xyflow/react';

/** Small visual overlap hides the anti-aliasing seam at a node border. */
const EDGE_DOCK_OVERLAP_PX = 2;

/**
 * Pull React Flow's outer-Handle endpoint back to the node border.
 * Visible Handles are centred on the border, so their outer edge sits half a
 * handle width away; hidden typed anchors have a zero extent.
 */
export function dockPoint(
  x: number,
  y: number,
  position: EdgeProps['sourcePosition'],
  zoom: number,
  handleExtent = 0,
): { x: number; y: number } {
  const dockDistance = handleExtent + EDGE_DOCK_OVERLAP_PX / zoom;

  switch (position) {
    case 'right':
      return { x: x - dockDistance, y };
    case 'left':
      return { x: x + dockDistance, y };
    case 'top':
      return { x, y: y + dockDistance };
    case 'bottom':
      return { x, y: y - dockDistance };
    default:
      return { x, y };
  }
}

export interface NodeBorderBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Use the node's measured border as the visual edge endpoint. This is immune
 * to the visible + being magnetic or resting outside the card.
 */
export function dockToNodeBorder(
  fallback: { x: number; y: number },
  position: EdgeProps['sourcePosition'],
  zoom: number,
  node?: NodeBorderBox,
): { x: number; y: number } {
  if (!node) return dockPoint(fallback.x, fallback.y, position, zoom);

  switch (position) {
    case 'right':
      return dockPoint(node.x + node.width, node.y + node.height / 2, position, zoom);
    case 'left':
      return dockPoint(node.x, node.y + node.height / 2, position, zoom);
    case 'top':
      return dockPoint(node.x + node.width / 2, node.y, position, zoom);
    case 'bottom':
      return dockPoint(node.x + node.width / 2, node.y + node.height, position, zoom);
    default:
      return fallback;
  }
}
