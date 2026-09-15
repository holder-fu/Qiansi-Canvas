import { afterEach, describe, expect, it } from 'vitest';
import {
  centeredCanvasNodePosition,
  registerCanvasScreenToFlowPosition,
} from './canvasViewportRuntime';

let unregister: (() => void) | null = null;

afterEach(() => {
  unregister?.();
  unregister = null;
});

describe('canvas viewport runtime', () => {
  it('centers the complete node in the current projected canvas viewport', () => {
    unregister = registerCanvasScreenToFlowPosition(({ x, y }) => ({
      x: (x - 120) / 2,
      y: (y + 80) / 2,
    }));

    expect(
      centeredCanvasNodePosition({ width: 420, height: 184 }, { width: 1200, height: 800 }),
    ).toEqual({ x: 30, y: 148 });
  });

  it('returns no placement while the canvas viewport is not mounted', () => {
    expect(
      centeredCanvasNodePosition({ width: 420, height: 184 }, { width: 1200, height: 800 }),
    ).toBeNull();
  });

  it('does not let an older canvas cleanup unregister the active viewport', () => {
    const unregisterOld = registerCanvasScreenToFlowPosition(({ x, y }) => ({ x, y }));
    unregister = registerCanvasScreenToFlowPosition(({ x, y }) => ({ x: x / 2, y: y / 2 }));

    unregisterOld();

    expect(
      centeredCanvasNodePosition({ width: 200, height: 100 }, { width: 1000, height: 600 }),
    ).toEqual({ x: 150, y: 100 });
  });
});
