export const CONTEXT_MENU_VIEWPORT_PADDING = 8;
export const CONTEXT_MENU_MIN_WIDTH = 220;
export const CONTEXT_MENU_SUBMENU_GAP = 4;

type Point = { x: number; y: number };
type Viewport = { width: number; height: number };

export type ContextMenuViewportPlacement = {
  left: number;
  top: number;
  maxHeight: number;
  openUpward: boolean;
  openSubmenuOnLeft: boolean;
};

export type ContextSubmenuViewportPlacement = {
  top: number;
  maxHeight: number;
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Keeps the primary canvas menu and its submenu inside the visible viewport.
 * The menu body is allowed to scroll when neither side of the pointer can fit
 * its full content; this is important on phones and near the bottom edge.
 */
export function contextMenuViewportPlacement(
  anchor: Point,
  viewport: Viewport,
  menuWidth = CONTEXT_MENU_MIN_WIDTH,
  padding = CONTEXT_MENU_VIEWPORT_PADDING,
): ContextMenuViewportPlacement {
  const width = Math.max(0, finiteOr(viewport.width, 0));
  const height = Math.max(0, finiteOr(viewport.height, 0));
  const safePadding = Math.max(0, finiteOr(padding, CONTEXT_MENU_VIEWPORT_PADDING));
  const safeMenuWidth = Math.max(1, finiteOr(menuWidth, CONTEXT_MENU_MIN_WIDTH));
  const maxLeft = Math.max(safePadding, width - safeMenuWidth - safePadding);
  const left = Math.min(Math.max(finiteOr(anchor.x, safePadding), safePadding), maxLeft);
  const top = Math.min(
    Math.max(finiteOr(anchor.y, safePadding), safePadding),
    Math.max(safePadding, height - safePadding),
  );
  const openUpward = top > height / 2;
  const availableHeight = openUpward ? top - safePadding : height - top - safePadding;

  return {
    left,
    top,
    maxHeight: Math.max(0, availableHeight),
    openUpward,
    openSubmenuOnLeft: left + safeMenuWidth * 2 + CONTEXT_MENU_SUBMENU_GAP > width - safePadding,
  };
}

/**
 * Aligns a flyout with its trigger in the viewport, including when the
 * primary menu is visually flipped upward with a CSS transform. The returned
 * top is relative to the visible primary menu root, not its untransformed
 * layout box.
 */
export function contextSubmenuViewportPlacement(
  triggerTop: number,
  menuRootTop: number,
  viewportHeight: number,
  padding = CONTEXT_MENU_VIEWPORT_PADDING,
): ContextSubmenuViewportPlacement {
  const safeTriggerTop = finiteOr(triggerTop, padding);
  const safeRootTop = finiteOr(menuRootTop, padding);
  const safeHeight = Math.max(0, finiteOr(viewportHeight, 0));
  const safePadding = Math.max(0, finiteOr(padding, CONTEXT_MENU_VIEWPORT_PADDING));

  return {
    top: Math.max(0, safeTriggerTop - safeRootTop),
    maxHeight: Math.max(0, safeHeight - safeTriggerTop - safePadding),
  };
}
