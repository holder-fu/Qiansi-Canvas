import type { ImageNodeData, FlowNode } from '../canvas/nodeTypes';
import { getNodeOutputPorts, getNodeOutputValues } from '../graph/graph';

export const IMAGE_COMPARISON_DEFAULT_POSITION = 50;
export const IMAGE_COMPARISON_NODE_WIDTH = 480;
export const IMAGE_COMPARISON_NODE_HEIGHT = 320;
export const IMAGE_COMPARISON_NODE_GAP = 120;

export interface ImageComparisonSource {
  nodeId: string;
  sourceHandle: string;
  imageUrl: string;
}

export interface ImageComparisonNaturalSize {
  width: number;
  height: number;
}

export interface ImageComparisonViewportSize {
  width: number;
  height: number;
}

function validNaturalSize(
  size: ImageComparisonNaturalSize | undefined,
): size is ImageComparisonNaturalSize {
  return Boolean(
    size &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0,
  );
}

/** Fit the primary image ratio inside one stable maximum side without distorting it. */
export function imageComparisonViewportSize(
  first?: ImageComparisonNaturalSize,
  second?: ImageComparisonNaturalSize,
): ImageComparisonViewportSize {
  const source = validNaturalSize(first) ? first : validNaturalSize(second) ? second : undefined;
  if (!source) {
    return { width: IMAGE_COMPARISON_NODE_WIDTH, height: IMAGE_COMPARISON_NODE_HEIGHT };
  }
  const ratio = source.width / source.height;
  return ratio >= 1
    ? {
        width: IMAGE_COMPARISON_NODE_WIDTH,
        height: Math.max(1, Math.round(IMAGE_COMPARISON_NODE_WIDTH / ratio)),
      }
    : {
        width: Math.max(1, Math.round(IMAGE_COMPARISON_NODE_WIDTH * ratio)),
        height: IMAGE_COMPARISON_NODE_WIDTH,
      };
}

/** Detect a material ratio mismatch so the shared center-crop alignment can be explained. */
export function imageComparisonNeedsAlignedCrop(
  first: ImageComparisonNaturalSize | undefined,
  second?: ImageComparisonNaturalSize,
  tolerance = 0.015,
): boolean {
  if (
    !first ||
    !second ||
    !Number.isFinite(first.width) ||
    !Number.isFinite(first.height) ||
    !Number.isFinite(second.width) ||
    !Number.isFinite(second.height) ||
    first.width <= 0 ||
    first.height <= 0 ||
    second.width <= 0 ||
    second.height <= 0
  ) {
    return false;
  }
  const firstRatio = first.width / first.height;
  const secondRatio = second.width / second.height;
  return Math.abs(firstRatio - secondRatio) / Math.max(firstRatio, secondRatio) > tolerance;
}

export function clampImageComparisonPosition(value?: unknown): number {
  if (
    value == null ||
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    return IMAGE_COMPARISON_DEFAULT_POSITION;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return IMAGE_COMPARISON_DEFAULT_POSITION;
  return Math.min(100, Math.max(0, numeric));
}

export function imageComparisonPositionFromPointer(
  clientX: number,
  bounds: Pick<DOMRect, 'left' | 'width'>,
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(bounds.left) || bounds.width <= 0) {
    return IMAGE_COMPARISON_DEFAULT_POSITION;
  }
  return clampImageComparisonPosition(((clientX - bounds.left) / bounds.width) * 100);
}

export function imageComparisonKeyboardPosition(
  current: number,
  key: string,
  shiftKey = false,
): number | null {
  const position = clampImageComparisonPosition(current);
  const step = shiftKey ? 5 : 1;
  if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return clampImageComparisonPosition(position - step);
  }
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    return clampImageComparisonPosition(position + step);
  }
  if (key === 'Home') return 0;
  if (key === 'End') return 100;
  return null;
}

export function imageComparisonInputUrls(
  data: Pick<ImageNodeData, 'portInputs'>,
): [string | undefined, string | undefined] {
  const values = Array.isArray(data.portInputs?.images) ? data.portInputs.images : [];
  const urls = values.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return [urls[0], urls[1]];
}

function comparableOutput(node: FlowNode): ImageComparisonSource | null {
  const port = getNodeOutputPorts(node).find(
    (candidate) => candidate.assetType === 'image' || candidate.assetType === 'reference',
  );
  if (!port) return null;
  const imageUrl = getNodeOutputValues(node, port).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return imageUrl ? { nodeId: node.id, sourceHandle: port.id, imageUrl } : null;
}

/** Resolve exactly two ordered, real image outputs for the selection shortcut. */
export function resolveImageComparisonSources(
  nodes: readonly FlowNode[],
  selectedNodeIds: readonly string[],
): [ImageComparisonSource, ImageComparisonSource] | null {
  if (selectedNodeIds.length !== 2 || selectedNodeIds[0] === selectedNodeIds[1]) return null;
  const sources = selectedNodeIds.map((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    return node ? comparableOutput(node) : null;
  });
  return sources[0] && sources[1] ? [sources[0], sources[1]] : null;
}

function nodeDimension(node: FlowNode, axis: 'width' | 'height', fallback: number): number {
  const measured = node.measured?.[axis];
  const declared = node[axis];
  const styled = node.style?.[axis];
  for (const candidate of [measured, declared, styled]) {
    const numeric = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return fallback;
}

function absoluteNodePosition(node: FlowNode, nodes: readonly FlowNode[]) {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

/** Place an automatically created comparison node to the right of both sources. */
export function imageComparisonNodePosition(nodes: readonly FlowNode[], sourceNodeIds: string[]) {
  const sources = sourceNodeIds.flatMap((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    return node ? [node] : [];
  });
  if (sources.length === 0) return { x: 120, y: -96 };

  const boxes = sources.map((node) => {
    const position = absoluteNodePosition(node, nodes);
    const width = nodeDimension(node, 'width', 350);
    const height = nodeDimension(node, 'height', 220);
    return {
      left: position.x,
      top: position.y,
      right: position.x + width,
      bottom: position.y + height,
    };
  });
  const right = Math.max(...boxes.map((box) => box.right));
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return {
    x: right + IMAGE_COMPARISON_NODE_GAP,
    y: top + (bottom - top - IMAGE_COMPARISON_NODE_HEIGHT) / 2,
  };
}
