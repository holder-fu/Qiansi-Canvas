import { describe, expect, it } from 'vitest';
import {
  calculateComposerRestorePlacement,
  calculateComposerPlacement,
  composerDimensions,
  composerPromptRegionSpacing,
  COMPOSER_RESTORE_BUTTON_INSET,
  COMPOSER_RESTORE_BUTTON_SIZE,
  COMPOSER_NODE_GAP,
  COMPOSER_VIEWPORT_PADDING,
  selectedVisualBounds,
} from './composerLayout';

describe('composer layout', () => {
  it('uses the actual rendered height for every composer family', () => {
    expect(composerDimensions('image', false)).toEqual({ width: 660, height: 260 });
    expect(composerDimensions('video', false)).toEqual({ width: 660, height: 260 });
    expect(composerDimensions('generic', false)).toEqual({ width: 660, height: 260 });
    expect(composerDimensions('text', false)).toEqual({ width: 660, height: 270 });
    expect(composerDimensions('audio', false)).toEqual({ width: 660, height: 150 });
    expect(composerDimensions('image', true)).toEqual({ width: 800, height: 620 });
  });

  it('gives text instructions balanced insets with or without a rendered reference strip', () => {
    expect(composerPromptRegionSpacing('text', false, false)).toBe('px-3 pt-3');
    expect(composerPromptRegionSpacing('text', false, true)).toBe('px-3 pt-1');
    expect(composerPromptRegionSpacing('text', true, false)).toBe('px-4 pt-4');
    expect(composerPromptRegionSpacing('text', true, true)).toBe('px-4 pt-2');
  });

  it('does not change spacing for image, video, audio, or generic composers', () => {
    expect(composerPromptRegionSpacing('image', false, false)).toBe('px-2 pt-2');
    expect(composerPromptRegionSpacing('video', false, true)).toBe('px-2 pt-2');
    expect(composerPromptRegionSpacing('audio', true, false)).toBe('px-4 pt-2');
    expect(composerPromptRegionSpacing('generic', true, true)).toBe('px-4 pt-2');
  });

  it('keeps the shared gap when the composer fits below the node', () => {
    const bounds = { minX: 100, minY: 100, maxX: 500, maxY: 300 };
    const placement = calculateComposerPlacement({
      bounds,
      composerHeight: 260,
      expanded: false,
      viewportWidth: 1200,
      viewportHeight: 900,
    });

    expect(placement.side).toBe('below');
    expect(placement.top).toBe(bounds.maxY + COMPOSER_NODE_GAP);
  });

  it.each(['image', 'text'] as const)(
    'keeps a %s composer below the node even when the viewport has more room above',
    () => {
      const bounds = { minX: 100, minY: 400, maxX: 500, maxY: 760 };
      const placement = calculateComposerPlacement({
        bounds,
        composerHeight: 260,
        expanded: false,
        viewportWidth: 1200,
        viewportHeight: 800,
      });

      expect(placement.side).toBe('below');
      expect(placement.top).toBe(bounds.maxY + COMPOSER_NODE_GAP);
    },
  );

  it('includes the scaled external node title and multi-selection outline', () => {
    const single = selectedVisualBounds({ minX: 100, minY: 300, maxX: 500, maxY: 600 }, 2, 1);
    expect(single.minY).toBe(236);
    expect(single.maxY).toBe(600);

    const multiple = selectedVisualBounds({ minX: 100, minY: 300, maxX: 500, maxY: 600 }, 2, 2);
    expect(multiple.minY).toBe(236);
    expect(multiple.maxY).toBe(624);
  });

  it('does not flip an overflowing composer above the node', () => {
    const bounds = { minX: 100, minY: 180, maxX: 500, maxY: 760 };
    const placement = calculateComposerPlacement({
      bounds,
      composerHeight: 260,
      expanded: false,
      viewportWidth: 1200,
      viewportHeight: 800,
    });

    expect(placement.side).toBe('below');
    expect(placement.top).toBe(bounds.maxY + COMPOSER_NODE_GAP);
  });

  it('places the restore button inside the selected node bottom-right corner', () => {
    const bounds = { minX: 100, minY: 100, maxX: 500, maxY: 600 };
    const placement = calculateComposerRestorePlacement({
      bounds,
      viewportWidth: 1200,
      viewportHeight: 900,
    });

    expect(placement.left).toBe(
      bounds.maxX - COMPOSER_RESTORE_BUTTON_INSET - COMPOSER_RESTORE_BUTTON_SIZE,
    );
    expect(placement.top).toBe(
      bounds.maxY - COMPOSER_RESTORE_BUTTON_INSET - COMPOSER_RESTORE_BUTTON_SIZE,
    );
  });

  it('keeps the restore button reachable when the selected node crosses the viewport edge', () => {
    const placement = calculateComposerRestorePlacement({
      bounds: { minX: -100, minY: -100, maxX: 1500, maxY: 1200 },
      viewportWidth: 1200,
      viewportHeight: 900,
    });

    expect(placement).toEqual({
      left: 1200 - COMPOSER_VIEWPORT_PADDING - COMPOSER_RESTORE_BUTTON_SIZE,
      top: 900 - COMPOSER_VIEWPORT_PADDING - COMPOSER_RESTORE_BUTTON_SIZE,
    });
  });
});
