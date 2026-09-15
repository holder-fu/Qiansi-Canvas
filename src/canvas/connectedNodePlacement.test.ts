import { describe, expect, it } from 'vitest';
import { CONNECTED_NODE_HORIZONTAL_GAP, connectedNodePosition } from './connectedNodePlacement';

describe('connected node placement', () => {
  it('places the new node beside the measured source with a stable gap', () => {
    expect(
      connectedNodePosition({
        position: { x: 20, y: 48 },
        measured: { width: 350 },
      }),
    ).toEqual({ x: 20 + 350 + CONNECTED_NODE_HORIZONTAL_GAP, y: 48 });
  });

  it('uses the absolute source position for nodes nested in a group', () => {
    expect(
      connectedNodePosition(
        {
          position: { x: 30, y: 40 },
          measured: { width: 620 },
        },
        { x: 780, y: 130 },
      ),
    ).toEqual({ x: 1520, y: 130 });
  });

  it('falls back to the authored node width before the first measurement', () => {
    expect(
      connectedNodePosition({
        position: { x: 100, y: 200 },
        style: { width: 350 },
      }),
    ).toEqual({ x: 570, y: 200 });
  });
});
