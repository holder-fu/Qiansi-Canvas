import { NODE_H, NODE_W } from './constants';

export const SELECTION_OUTLINE_GAP = 40;

type Position = { x: number; y: number };

export type SelectionNodeGeometry = {
  position: Position;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
};

export type SelectionRect = Position & { width: number; height: number };

export type SelectionBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function nodeSelectionRect(
  node: SelectionNodeGeometry,
  absolutePosition?: Position,
): SelectionRect {
  const position = absolutePosition ?? node.position;
  return {
    x: position.x,
    y: position.y,
    width: node.measured?.width ?? node.width ?? NODE_W,
    height: node.measured?.height ?? node.height ?? NODE_H,
  };
}

export function selectionBounds(
  rects: readonly SelectionRect[],
  gap = SELECTION_OUTLINE_GAP,
): SelectionBounds | null {
  if (rects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return {
    minX: minX - gap,
    minY: minY - gap,
    maxX: maxX + gap,
    maxY: maxY + gap,
  };
}

export function pointInsideSelectionBounds(
  point: Position,
  bounds: SelectionBounds | null,
): boolean {
  return Boolean(
    bounds &&
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY,
  );
}
