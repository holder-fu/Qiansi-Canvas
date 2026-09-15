/**
 * Port interaction constants — all distances are in screen pixels so the
 * magnetic feel stays consistent across zoom levels.
 */

/** How far the resting + button sits outside the node border. */
export const PORT_REST_OFFSET = 16;

/** Base size of the + button. */
export const PORT_SIZE = 22;

/** Invisible pointer target around the + button; the visible size stays unchanged. */
export const PORT_HIT_SIZE = 56;

/** Size of the + button when hovered / magnetically active. */
export const PORT_HOVER_SIZE = 28;

/** Radius around the resting port position that wakes up the magnet. */
export const MAGNET_RADIUS = 72;

/** Maximum distance the port button can be pulled away from its rest position. */
export const MAGNET_MAX_OFFSET = 28;

/** Strength of the magnetic pull (0-1). Lower = looser follow, higher = stronger snap. */
export const MAGNET_ATTRACTION = 0.35;

/** Radius around a target input port at which the source drag snaps to it. */
export const TARGET_SNAP_RADIUS = 32;

/** Radius at which a snapped target port releases again. */
export const TARGET_RELEASE_RADIUS = 42;

/** Screen-pixel threshold for considering the port "near" (shows at rest). */
export const NEAR_THRESHOLD = 80;

/** Hysteresis: hide the port only when the cursor leaves this radius. */
export const FAR_THRESHOLD = 96;
