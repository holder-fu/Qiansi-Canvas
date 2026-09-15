import { describe, expect, it } from 'vitest';
import {
  advanceNodeDragAcceleration,
  beginNodeDragAcceleration,
  compensateViewportForAcceleratedDrag,
  SHIFT_NODE_DRAG_MULTIPLIER,
} from './nodeDragAcceleration';

describe('node drag acceleration', () => {
  it('keeps ordinary drag movement at one-to-one speed', () => {
    const result = advanceNodeDragAcceleration(
      beginNodeDragAcceleration({ x: 100, y: 50 }),
      { x: 112, y: 43 },
      false,
    );

    expect(result.position).toEqual({ x: 112, y: 43 });
    expect(result.viewportCompensation).toEqual({ x: 0, y: 0 });
  });

  it('multiplies movement while Shift is held', () => {
    const result = advanceNodeDragAcceleration(
      beginNodeDragAcceleration({ x: 100, y: 50 }),
      { x: 112, y: 43 },
      true,
    );

    expect(SHIFT_NODE_DRAG_MULTIPLIER).toBe(3);
    expect(result.position).toEqual({ x: 136, y: 29 });
    expect(result.viewportCompensation).toEqual({ x: 24, y: -14 });
  });

  it('switches speed mid-drag after viewport compensation without jumping', () => {
    const start = beginNodeDragAcceleration({ x: 0, y: 0 });
    const normal = advanceNodeDragAcceleration(start, { x: 10, y: 4 }, false);
    const fast = advanceNodeDragAcceleration(normal.state, { x: 12, y: 5 }, true);
    // The inverse viewport pan makes the next raw React Flow coordinate catch
    // up with the accelerated output before adding the new pointer movement.
    const normalAgain = advanceNodeDragAcceleration(fast.state, { x: 19, y: 9 }, false);

    expect(normal.position).toEqual({ x: 10, y: 4 });
    expect(fast.position).toEqual({ x: 16, y: 7 });
    expect(normalAgain.position).toEqual({ x: 19, y: 9 });
  });

  it('keeps the accelerated node grab point under the pointer', () => {
    const viewport = { x: 80, y: -30, zoom: 2 };
    const rawPosition = { x: 112, y: 43 };
    const result = advanceNodeDragAcceleration(
      beginNodeDragAcceleration({ x: 100, y: 50 }),
      rawPosition,
      true,
    );
    const compensatedViewport = compensateViewportForAcceleratedDrag(
      viewport,
      result.viewportCompensation,
    );

    expect(result.position.x * viewport.zoom + compensatedViewport.x).toBe(
      rawPosition.x * viewport.zoom + viewport.x,
    );
    expect(result.position.y * viewport.zoom + compensatedViewport.y).toBe(
      rawPosition.y * viewport.zoom + viewport.y,
    );
  });

  it('ignores React Flow repeating the last raw position at drag end', () => {
    const accelerated = advanceNodeDragAcceleration(
      beginNodeDragAcceleration({ x: 0, y: 0 }),
      { x: 10, y: 0 },
      true,
    );
    const repeated = advanceNodeDragAcceleration(accelerated.state, { x: 10, y: 0 }, true);

    expect(repeated.position).toEqual({ x: 30, y: 0 });
    expect(repeated.viewportCompensation).toEqual({ x: 0, y: 0 });
  });
});
