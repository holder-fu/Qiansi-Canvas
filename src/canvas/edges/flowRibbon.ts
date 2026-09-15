const RIBBON_TO_PITCH_RATIO = 1 / 2.72;
const MIN_RIBBON_LENGTH = 80;
const MAX_RIBBON_LENGTH = 130;

export const FLOW_RIBBON_SLICE_COUNT = 16;

export type FlowRibbonMetrics = {
  ribbonLength: number;
  pitch: number;
  sliceLength: number;
  cycleSeconds: number;
};

/**
 * Sizes the repeated ribbon in canvas coordinates. Keeping these values in the
 * same coordinate system as the edge makes its length, glow and speed scale
 * with the viewport just like the reference animation.
 */
export function getFlowRibbonMetrics(pathLength: number): FlowRibbonMetrics {
  const safePathLength = Number.isFinite(pathLength) ? Math.max(pathLength, 1) : 1;
  const naturalRibbonLength = Math.min(
    Math.max(safePathLength * 0.13, MIN_RIBBON_LENGTH),
    MAX_RIBBON_LENGTH,
  );
  const naturalPitch = naturalRibbonLength / RIBBON_TO_PITCH_RATIO;

  // Keep at least two moving ribbons on short connections. This also makes a
  // short edge slower, while long edges naturally gain both speed and count.
  const pitch = Math.min(naturalPitch, safePathLength / 2);
  const ribbonLength = pitch * RIBBON_TO_PITCH_RATIO;

  return {
    ribbonLength,
    pitch,
    sliceLength: ribbonLength / FLOW_RIBBON_SLICE_COUNT,
    cycleSeconds: 1,
  };
}

/** A smooth one-way brightness ramp sampled from the commercial reference. */
export function getRibbonSliceOpacity(index: number, sliceCount: number): number {
  const progress = Math.min(Math.max((index + 0.5) / Math.max(sliceCount, 1), 0), 1);
  const smoothProgress = progress * progress * (3 - 2 * progress);
  return 0.96 * Math.pow(smoothProgress, 0.45);
}
