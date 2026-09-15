import { Position } from '@xyflow/react';
import {
  PORT_REST_OFFSET,
  MAGNET_RADIUS,
  MAGNET_MAX_OFFSET,
  MAGNET_ATTRACTION,
  NEAR_THRESHOLD,
  FAR_THRESHOLD,
} from './portConstants';

export type PortInteractionState = 'idle' | 'near' | 'magnetic' | 'pressed' | 'connecting';

export interface MagnetResult {
  state: PortInteractionState;
  /** Offset from the rest position in screen pixels. */
  offsetX: number;
  offsetY: number;
  /** Scale of the visual proxy (1 = rest size). */
  scale: number;
  /** Whether the proxy is currently visible. */
  visible: boolean;
}

export interface RestPosition {
  x: number;
  y: number;
}

export function isConnectionDestinationPort(
  portDirection: 'in' | 'out',
  fromHandleType: 'source' | 'target' | null,
): boolean {
  return (
    (fromHandleType === 'source' && portDirection === 'in') ||
    (fromHandleType === 'target' && portDirection === 'out')
  );
}

/**
 * Compute the rest position of the port proxy in node-local flow coordinates.
 * The real React Flow Handle stays exactly on the node border; the proxy rests
 * slightly outside it.
 */
export function getRestPosition(
  position: Position,
  nodeWidth: number,
  nodeHeight: number,
  zoom: number,
  placement = 0.5,
  outsideOffsetPx = PORT_REST_OFFSET,
): RestPosition {
  const restOffset = outsideOffsetPx / zoom;
  switch (position) {
    case Position.Left:
      return { x: -restOffset, y: nodeHeight * placement };
    case Position.Right:
      return { x: nodeWidth + restOffset, y: nodeHeight * placement };
    case Position.Top:
      return { x: nodeWidth * placement, y: -restOffset };
    case Position.Bottom:
      return { x: nodeWidth * placement, y: nodeHeight + restOffset };
    default:
      return { x: nodeWidth + restOffset, y: nodeHeight * placement };
  }
}

/**
 * Compute the magnetic offset and interaction state from:
 * - rest screen position
 * - current mouse screen position
 * - previous state (for hysteresis)
 */
export function calculateMagnet(
  restScreenX: number,
  restScreenY: number,
  mouseX: number,
  mouseY: number,
  wasVisible: boolean,
): MagnetResult {
  const dx = mouseX - restScreenX;
  const dy = mouseY - restScreenY;
  const distance = Math.hypot(dx, dy);

  const showThreshold = wasVisible ? FAR_THRESHOLD : NEAR_THRESHOLD;

  if (distance > showThreshold) {
    return {
      state: 'idle',
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      visible: false,
    };
  }

  const isMagnetic = distance <= MAGNET_RADIUS;

  if (!isMagnetic) {
    return {
      state: 'near',
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      visible: true,
    };
  }

  // Pull the proxy toward the cursor, but clamp to MAX_MAGNET_OFFSET.
  const rawOffsetX = dx * MAGNET_ATTRACTION;
  const rawOffsetY = dy * MAGNET_ATTRACTION;
  const rawDistance = Math.hypot(rawOffsetX, rawOffsetY);

  let offsetX = rawOffsetX;
  let offsetY = rawOffsetY;

  if (rawDistance > MAGNET_MAX_OFFSET) {
    const ratio = MAGNET_MAX_OFFSET / rawDistance;
    offsetX = rawOffsetX * ratio;
    offsetY = rawOffsetY * ratio;
  }

  // Scale up slightly as the cursor gets closer.
  const proximity = Math.max(0, 1 - distance / MAGNET_RADIUS);
  const scale = 1 + proximity * 0.25;

  return {
    state: 'magnetic',
    offsetX,
    offsetY,
    scale,
    visible: true,
  };
}
