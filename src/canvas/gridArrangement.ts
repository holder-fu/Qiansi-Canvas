import type { FlowNode } from './nodeTypes';
import { nodeSelectionRect } from './selectionGeometry';

export const GRID_ARRANGEMENT_GAP = 32;

export type GridDimensions = {
  columns: number;
  rows: number;
};

export type GridArrangement = GridDimensions & {
  parentId?: string;
  positions: Array<{ id: string; position: { x: number; y: number } }>;
};

export function automaticGridColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(0, count))));
}

export function gridDimensions(count: number, requestedColumns: number): GridDimensions {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return { columns: 0, rows: 0 };
  const columns = Math.max(1, Math.min(safeCount, Math.floor(requestedColumns) || 1));
  return { columns, rows: Math.ceil(safeCount / columns) };
}

export function gridColumnOptions(count: number): number[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount < 2) return [];
  const first = safeCount === 2 ? 1 : 2;
  const last = Math.min(6, safeCount);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function nodesInReadingOrder(nodes: FlowNode[]): FlowNode[] {
  if (nodes.length < 2) return nodes;
  const rects = new Map(nodes.map((node) => [node.id, nodeSelectionRect(node)]));
  const maxHeight = Math.max(...Array.from(rects.values(), (rect) => rect.height));
  const anchorY = Math.min(...Array.from(rects.values(), (rect) => rect.y));
  const rowStep = Math.max(1, maxHeight * 0.55);
  const rectFor = (node: FlowNode) => rects.get(node.id) ?? nodeSelectionRect(node);

  return [...nodes].sort((left, right) => {
    const leftRect = rectFor(left);
    const rightRect = rectFor(right);
    const leftRow = Math.round((leftRect.y - anchorY) / rowStep);
    const rightRow = Math.round((rightRect.y - anchorY) / rowStep);
    if (leftRow !== rightRow) return leftRow - rightRow;
    if (leftRect.x !== rightRect.x) return leftRect.x - rightRect.x;
    return left.id.localeCompare(right.id);
  });
}

export function arrangeNodesInGrid(
  nodes: FlowNode[],
  nodeIds: readonly string[],
  requestedColumns: number,
  gap = GRID_ARRANGEMENT_GAP,
): GridArrangement | null {
  const requested = new Set(nodeIds);
  const targets = nodes.filter((node) => requested.has(node.id));
  if (targets.length < 2) return null;

  const parentIds = new Set(targets.map((node) => node.parentId ?? ''));
  if (parentIds.size !== 1) return null;

  const ordered = nodesInReadingOrder(targets);
  const rects = ordered.map((node) => ({ node, rect: nodeSelectionRect(node) }));
  const anchorX = Math.min(...rects.map(({ rect }) => rect.x));
  const anchorY = Math.min(...rects.map(({ rect }) => rect.y));
  const cellWidth = Math.max(...rects.map(({ rect }) => rect.width));
  const cellHeight = Math.max(...rects.map(({ rect }) => rect.height));
  const dimensions = gridDimensions(ordered.length, requestedColumns);
  const safeGap = Math.max(0, gap);

  return {
    ...dimensions,
    parentId: targets[0]?.parentId,
    positions: rects.map(({ node, rect }, index) => {
      const column = index % dimensions.columns;
      const row = Math.floor(index / dimensions.columns);
      return {
        id: node.id,
        position: {
          x: anchorX + column * (cellWidth + safeGap) + (cellWidth - rect.width) / 2,
          y: anchorY + row * (cellHeight + safeGap) + (cellHeight - rect.height) / 2,
        },
      };
    }),
  };
}
