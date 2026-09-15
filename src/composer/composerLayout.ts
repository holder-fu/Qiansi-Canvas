import type { ComposerSpec } from '../graph/types';

export const COMPOSER_NODE_GAP = 12;
export const COMPOSER_VIEWPORT_PADDING = 8;
export const COMPOSER_RESTORE_BUTTON_SIZE = 28;
export const COMPOSER_RESTORE_BUTTON_INSET = 8;

const NODE_TOP_CHROME_HEIGHT = 32;
const NODE_TOP_CHROME_MIN_ZOOM = 0.3;
const MULTI_SELECTION_PADDING = 12;

export type ComposerDimensions = {
  width: number;
  height: number;
};

export type ScreenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ComposerPlacement = {
  left: number;
  top: number;
  transform: 'translateX(-50%)';
  side: 'below' | 'expanded';
};

export type ComposerRestorePlacement = {
  left: number;
  top: number;
};

/** Keep the rendered shell and its positioning calculation on one size contract. */
export function composerDimensions(
  type: ComposerSpec['type'],
  expanded: boolean,
): ComposerDimensions {
  if (expanded) return { width: 800, height: 620 };
  if (type === 'text') return { width: 660, height: 270 };
  if (type === 'audio') return { width: 660, height: 150 };
  return { width: 660, height: 260 };
}

export function isCompactComposer(type: ComposerSpec['type'], expanded: boolean): boolean {
  return !expanded && (type === 'text' || type === 'audio');
}

/** Keep text instructions comfortably inset without changing other composer families. */
export function composerPromptRegionSpacing(
  type: ComposerSpec['type'],
  expanded: boolean,
  referenceStripRendered: boolean,
): string {
  if (type !== 'text') return `${expanded ? 'px-4' : 'px-2'} pt-2`;
  if (expanded) return `px-4 ${referenceStripRendered ? 'pt-2' : 'pt-4'}`;
  return `px-3 ${referenceStripRendered ? 'pt-1' : 'pt-3'}`;
}

/**
 * Expand the measured React Flow bounds to include visible selection chrome.
 * Node titles sit 32 flow pixels above the border; multi-selection also adds
 * a 12 flow-pixel outline around the selected nodes.
 */
export function selectedVisualBounds(
  bounds: ScreenBounds,
  zoom: number,
  selectedCount: number,
): ScreenBounds {
  const topChrome = zoom >= NODE_TOP_CHROME_MIN_ZOOM ? NODE_TOP_CHROME_HEIGHT * zoom : 0;
  const selectionPadding = selectedCount > 1 ? MULTI_SELECTION_PADDING * zoom : 0;

  return {
    minX: bounds.minX - selectionPadding,
    minY: bounds.minY - Math.max(topChrome, selectionPadding),
    maxX: bounds.maxX + selectionPadding,
    maxY: bounds.maxY + selectionPadding,
  };
}

/** Place every compact composer below the selected node with one shared gap. */
export function calculateComposerPlacement({
  bounds,
  composerHeight,
  expanded,
  viewportWidth,
  viewportHeight,
}: {
  bounds: ScreenBounds;
  composerHeight: number;
  expanded: boolean;
  viewportWidth: number;
  viewportHeight: number;
}): ComposerPlacement {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const left = Math.max(
    COMPOSER_VIEWPORT_PADDING,
    Math.min(centerX, viewportWidth - COMPOSER_VIEWPORT_PADDING),
  );

  if (expanded) {
    return {
      left: viewportWidth / 2,
      top: Math.max(COMPOSER_VIEWPORT_PADDING, (viewportHeight - composerHeight) / 2),
      transform: 'translateX(-50%)',
      side: 'expanded',
    };
  }

  const belowTop = bounds.maxY + COMPOSER_NODE_GAP;
  return { left, top: belowTop, transform: 'translateX(-50%)', side: 'below' };
}

/** Keep the restore control inside the selected node's bottom-right corner and viewport. */
export function calculateComposerRestorePlacement({
  bounds,
  viewportWidth,
  viewportHeight,
}: {
  bounds: ScreenBounds;
  viewportWidth: number;
  viewportHeight: number;
}): ComposerRestorePlacement {
  const maxLeft = Math.max(
    COMPOSER_VIEWPORT_PADDING,
    viewportWidth - COMPOSER_VIEWPORT_PADDING - COMPOSER_RESTORE_BUTTON_SIZE,
  );
  const maxTop = Math.max(
    COMPOSER_VIEWPORT_PADDING,
    viewportHeight - COMPOSER_VIEWPORT_PADDING - COMPOSER_RESTORE_BUTTON_SIZE,
  );
  return {
    left: Math.max(
      COMPOSER_VIEWPORT_PADDING,
      Math.min(bounds.maxX - COMPOSER_RESTORE_BUTTON_INSET - COMPOSER_RESTORE_BUTTON_SIZE, maxLeft),
    ),
    top: Math.max(
      COMPOSER_VIEWPORT_PADDING,
      Math.min(bounds.maxY - COMPOSER_RESTORE_BUTTON_INSET - COMPOSER_RESTORE_BUTTON_SIZE, maxTop),
    ),
  };
}
