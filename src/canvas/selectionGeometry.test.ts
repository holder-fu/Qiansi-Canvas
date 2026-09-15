import { describe, expect, it } from 'vitest';
import {
  nodeSelectionRect,
  pointInsideSelectionBounds,
  selectionBounds,
  SELECTION_OUTLINE_GAP,
} from './selectionGeometry';

describe('selection geometry', () => {
  it('uses the absolute position for a node inside a group', () => {
    const rect = nodeSelectionRect(
      {
        position: { x: 20, y: 80 },
        measured: { width: 620, height: 350 },
      },
      { x: 780, y: 130 },
    );

    expect(rect).toEqual({ x: 780, y: 130, width: 620, height: 350 });
  });

  it('prefers measured node dimensions over stale dimensions', () => {
    const rect = nodeSelectionRect({
      position: { x: 30, y: 40 },
      width: 620,
      height: 350,
      measured: { width: 690, height: 450 },
    });

    expect(rect).toEqual({ x: 30, y: 40, width: 690, height: 450 });
  });

  it('wraps only node rectangles with the same larger gap on every side', () => {
    const bounds = selectionBounds([
      { x: 30, y: 40, width: 620, height: 350 },
      { x: 780, y: 130, width: 690, height: 350 },
    ]);

    expect(bounds).toEqual({
      minX: 30 - SELECTION_OUTLINE_GAP,
      minY: 40 - SELECTION_OUTLINE_GAP,
      maxX: 1470 + SELECTION_OUTLINE_GAP,
      maxY: 480 + SELECTION_OUTLINE_GAP,
    });
  });

  it('recognizes right-clicks inside the multi-selection frame', () => {
    const bounds = { minX: 10, minY: 20, maxX: 210, maxY: 220 };

    expect(pointInsideSelectionBounds({ x: 10, y: 20 }, bounds)).toBe(true);
    expect(pointInsideSelectionBounds({ x: 110, y: 120 }, bounds)).toBe(true);
    expect(pointInsideSelectionBounds({ x: 210, y: 220 }, bounds)).toBe(true);
    expect(pointInsideSelectionBounds({ x: 9, y: 120 }, bounds)).toBe(false);
    expect(pointInsideSelectionBounds({ x: 110, y: 221 }, bounds)).toBe(false);
    expect(pointInsideSelectionBounds({ x: 110, y: 120 }, null)).toBe(false);
  });
});
