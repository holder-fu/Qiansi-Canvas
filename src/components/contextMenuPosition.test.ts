import { describe, expect, it } from 'vitest';
import {
  contextMenuViewportPlacement,
  contextSubmenuViewportPlacement,
} from './contextMenuPosition';

describe('canvas context-menu viewport placement', () => {
  it('keeps a right-bottom anchor visible and opens upward/leftward', () => {
    expect(contextMenuViewportPlacement({ x: 799, y: 599 }, { width: 800, height: 600 })).toEqual({
      left: 572,
      top: 592,
      maxHeight: 584,
      openUpward: true,
      openSubmenuOnLeft: true,
    });
  });

  it('opens downward/rightward when there is room', () => {
    expect(contextMenuViewportPlacement({ x: 40, y: 60 }, { width: 1200, height: 800 })).toEqual({
      left: 40,
      top: 60,
      maxHeight: 732,
      openUpward: false,
      openSubmenuOnLeft: false,
    });
  });

  it('remains finite in an extremely narrow viewport', () => {
    const placement = contextMenuViewportPlacement(
      { x: Number.POSITIVE_INFINITY, y: Number.NaN },
      { width: 180, height: 120 },
    );

    expect(placement.left).toBe(8);
    expect(placement.top).toBe(8);
    expect(placement.maxHeight).toBe(104);
  });

  it('keeps an upward-flipped submenu aligned with its trigger', () => {
    expect(contextSubmenuViewportPlacement(54, 4, 420)).toEqual({
      top: 50,
      maxHeight: 358,
    });
  });

  it('clamps submenu space when the trigger is below the viewport', () => {
    expect(contextSubmenuViewportPlacement(500, 120, 420)).toEqual({
      top: 380,
      maxHeight: 0,
    });
  });
});
