import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { FAR_THRESHOLD, MAGNET_MAX_OFFSET, MAGNET_RADIUS } from './portConstants';
import { calculateMagnet, getRestPosition, isConnectionDestinationPort } from './portMagnet';

describe('isConnectionDestinationPort', () => {
  it('enables input ports for forward drags and output ports for reverse drags', () => {
    expect(isConnectionDestinationPort('in', 'source')).toBe(true);
    expect(isConnectionDestinationPort('out', 'target')).toBe(true);
    expect(isConnectionDestinationPort('out', 'source')).toBe(false);
    expect(isConnectionDestinationPort('in', 'target')).toBe(false);
  });
});

describe('getRestPosition', () => {
  it('keeps multiple left ports on distinct vertical anchors', () => {
    const first = getRestPosition(Position.Left, 620, 350, 1, 1 / 3);
    const second = getRestPosition(Position.Left, 620, 350, 1, 2 / 3);
    expect(first.x).toBeLessThan(0);
    expect(first.y).toBeLessThan(second.y);
  });

  it('keeps the proxy rest distance constant in screen pixels across zoom', () => {
    const atOne = getRestPosition(Position.Right, 620, 350, 1);
    const atTwo = getRestPosition(Position.Right, 620, 350, 2);
    expect((atOne.x - 620) * 1).toBe((atTwo.x - 620) * 2);
  });

  it('supports a border-centred magnetic rest point for real handles', () => {
    const left = getRestPosition(Position.Left, 620, 350, 1, 0.5, 0);
    const right = getRestPosition(Position.Right, 620, 350, 1, 0.5, 0);
    expect(Math.abs(left.x)).toBe(0);
    expect(left.y).toBe(175);
    expect(right).toEqual({ x: 620, y: 175 });
  });
});

describe('calculateMagnet', () => {
  it('moves the connection button toward a nearby pointer', () => {
    const result = calculateMagnet(100, 100, 120, 112, false);

    expect(result.state).toBe('magnetic');
    expect(result.visible).toBe(true);
    expect(result.offsetX).toBeGreaterThan(0);
    expect(result.offsetY).toBeGreaterThan(0);
    expect(result.scale).toBeGreaterThan(1);
  });

  it('keeps magnetic travel within its limit without changing the interaction state', () => {
    const result = calculateMagnet(0, 0, MAGNET_RADIUS, 0, false);

    expect(result.state).toBe('magnetic');
    expect(Math.hypot(result.offsetX, result.offsetY)).toBeLessThanOrEqual(MAGNET_MAX_OFFSET);
  });

  it('returns to the exact resting state after the pointer leaves the range', () => {
    expect(calculateMagnet(0, 0, FAR_THRESHOLD + 1, 0, true)).toEqual({
      state: 'idle',
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      visible: false,
    });
  });
});
