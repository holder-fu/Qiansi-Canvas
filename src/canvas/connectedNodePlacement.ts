import { NODE_W } from './constants';

export const CONNECTED_NODE_HORIZONTAL_GAP = 120;

type Position = { x: number; y: number };

export type ConnectedNodeSourceGeometry = {
  position: Position;
  width?: number;
  measured?: { width?: number };
  style?: { width?: number | string };
};

function positiveWidth(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/** Place a node created from an outgoing connection beside its real source border. */
export function connectedNodePosition(
  source: ConnectedNodeSourceGeometry,
  absolutePosition?: Position,
  gap = CONNECTED_NODE_HORIZONTAL_GAP,
): Position {
  const origin = absolutePosition ?? source.position;
  const width =
    positiveWidth(source.measured?.width) ??
    positiveWidth(source.width) ??
    positiveWidth(source.style?.width) ??
    NODE_W;
  const safeGap = Number.isFinite(gap) && gap >= 0 ? gap : CONNECTED_NODE_HORIZONTAL_GAP;

  return {
    x: origin.x + width + safeGap,
    y: origin.y,
  };
}
