import type { Node } from '@xyflow/react';
import { NODE_W, NODE_H } from './constants';

const SNAP_THRESHOLD_PX = 8;

export type Rect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

export type Guide = {
  direction: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
};

export type SnapResult = {
  position: { x: number; y: number };
  correctionX: number;
  correctionY: number;
  snappedX: boolean;
  snappedY: boolean;
  guides: Guide[];
};

type SnapCandidate = {
  correction: number;
  guide: Guide;
  alignmentPriority: number;
  targetDistance: number;
};

type Anchor = {
  value: number;
  isCenter: boolean;
};

function intervalGap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.max(startA, startB) - Math.min(endA, endB));
}

function getRect(node: Node): Rect {
  // React Flow stores the live DOM size in `measured`; `width` / `height`
  // are only declared dimensions and are usually absent for our adaptive
  // image, video and audio nodes. Mirror React Flow's own geometry order so
  // the snap correction and its guide describe the node users actually see.
  const w = node.measured?.width ?? node.width ?? node.initialWidth ?? NODE_W;
  const h = node.measured?.height ?? node.height ?? node.initialHeight ?? NODE_H;
  return {
    id: node.id,
    left: node.position.x,
    right: node.position.x + w,
    top: node.position.y,
    bottom: node.position.y + h,
    centerX: node.position.x + w / 2,
    centerY: node.position.y + h / 2,
  };
}

function getBoundingRect(nodes: Node[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = getRect(n);
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right);
    maxY = Math.max(maxY, r.bottom);
  }
  return {
    id: 'selection',
    left: minX,
    right: maxX,
    top: minY,
    bottom: maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function isBetterCandidate(candidate: SnapCandidate, current: SnapCandidate | null): boolean {
  if (!current) return true;

  if (candidate.targetDistance !== current.targetDistance) {
    return candidate.targetDistance < current.targetDistance;
  }

  const candidateCorrection = Math.abs(candidate.correction);
  const currentCorrection = Math.abs(current.correction);
  if (candidateCorrection !== currentCorrection) return candidateCorrection < currentCorrection;

  // Equal distances on opposite sides must keep their stable traversal order.
  // Preferring another anchor here would make the node jump across the pointer
  // at the midpoint between two valid snap lines.
  if (candidate.correction !== current.correction) return false;

  if (candidate.alignmentPriority !== current.alignmentPriority) {
    return candidate.alignmentPriority < current.alignmentPriority;
  }

  // Identical candidates can still come from overlapping targets. Prefer the
  // visually shortest guide as a stable final tie-breaker.
  const candidateSpan = candidate.guide.end - candidate.guide.start;
  const currentSpan = current.guide.end - current.guide.start;
  return candidateSpan < currentSpan;
}

/**
 * Calculate snap correction and guides for a dragged set of nodes.
 *
 * X and Y are resolved independently: a horizontal guide means Y snapped,
 * a vertical guide means X snapped. The smallest correction within threshold
 * wins. Among valid targets, the node with the smallest orthogonal edge gap is
 * preferred before comparing correction size, so a nearly aligned distant node
 * cannot steal the snap from the node next to the dragged selection. When
 * several anchors on that target produce the same correction, center alignment
 * takes priority; opposite corrections never swap direction just to prefer a
 * different anchor. Only the winning candidate for each axis is exposed.
 */
export function calculateSnap(draggedNodes: Node[], otherNodes: Node[], zoom: number): SnapResult {
  if (draggedNodes.length === 0) {
    return {
      position: { x: 0, y: 0 },
      correctionX: 0,
      correctionY: 0,
      snappedX: false,
      snappedY: false,
      guides: [],
    };
  }

  const dragged = getBoundingRect(draggedNodes);
  const others = otherNodes.map(getRect);
  const threshold = SNAP_THRESHOLD_PX / zoom;

  const xAnchors: Anchor[] = [
    { value: dragged.left, isCenter: false },
    { value: dragged.centerX, isCenter: true },
    { value: dragged.right, isCenter: false },
  ];
  const yAnchors: Anchor[] = [
    { value: dragged.top, isCenter: false },
    { value: dragged.centerY, isCenter: true },
    { value: dragged.bottom, isCenter: false },
  ];

  let bestX: SnapCandidate | null = null;
  let bestY: SnapCandidate | null = null;

  for (const other of others) {
    for (const da of xAnchors) {
      for (const oa of [
        { value: other.left, isCenter: false },
        { value: other.centerX, isCenter: true },
        { value: other.right, isCenter: false },
      ]) {
        const diff = oa.value - da.value;
        if (Math.abs(diff) <= threshold) {
          const candidate: SnapCandidate = {
            correction: diff,
            alignmentPriority: da.isCenter && oa.isCenter ? 0 : 1,
            targetDistance: intervalGap(dragged.top, dragged.bottom, other.top, other.bottom),
            guide: {
              direction: 'vertical',
              position: oa.value,
              start: Math.min(dragged.top, other.top),
              end: Math.max(dragged.bottom, other.bottom),
            },
          };
          if (isBetterCandidate(candidate, bestX)) {
            bestX = candidate;
          }
        }
      }
    }

    for (const da of yAnchors) {
      for (const oa of [
        { value: other.top, isCenter: false },
        { value: other.centerY, isCenter: true },
        { value: other.bottom, isCenter: false },
      ]) {
        const diff = oa.value - da.value;
        if (Math.abs(diff) <= threshold) {
          const candidate: SnapCandidate = {
            correction: diff,
            alignmentPriority: da.isCenter && oa.isCenter ? 0 : 1,
            targetDistance: intervalGap(dragged.left, dragged.right, other.left, other.right),
            guide: {
              direction: 'horizontal',
              position: oa.value,
              start: Math.min(dragged.left, other.left),
              end: Math.max(dragged.right, other.right),
            },
          };
          if (isBetterCandidate(candidate, bestY)) {
            bestY = candidate;
          }
        }
      }
    }
  }

  const bestCorrectionX = bestX?.correction ?? 0;
  const bestCorrectionY = bestY?.correction ?? 0;
  const snappedX = bestX !== null;
  const snappedY = bestY !== null;
  const guides = [bestX?.guide, bestY?.guide].filter((guide): guide is Guide => !!guide);

  const position = {
    x: dragged.left + bestCorrectionX,
    y: dragged.top + bestCorrectionY,
  };

  return {
    position,
    correctionX: bestCorrectionX,
    correctionY: bestCorrectionY,
    snappedX,
    snappedY,
    guides,
  };
}

/**
 * Apply a bounding-box snap correction to every node in a multi-selection.
 * Each node is offset by the same correction vector.
 */
export function applySnapToNodes(nodes: Node[], correctionX: number, correctionY: number): Node[] {
  if (correctionX === 0 && correctionY === 0) return nodes;
  return nodes.map((n) => ({
    ...n,
    position: {
      x: n.position.x + correctionX,
      y: n.position.y + correctionY,
    },
  }));
}
