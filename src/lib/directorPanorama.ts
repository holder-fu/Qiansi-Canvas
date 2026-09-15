export const DIRECTOR_PANORAMA_ASPECT_RATIO = 2;
export const DIRECTOR_PANORAMA_LIFT_MAX = 30;
export const DIRECTOR_PANORAMA_GROUND_CAPTURE_HEIGHT = 12;

/**
 * When a flat source is taller than a 2:1 equirectangular frame, preserve more of its lower
 * hemisphere. This moves the photographed floor upward without inventing pixels or changing the
 * director-stage coordinate system.
 */
const DIRECTOR_PANORAMA_FLOOR_FOCUS = 1;

export type DirectorPanoramaRenderPlan = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
};

function positiveDimension(value: number) {
  return Number.isFinite(value) ? Math.max(1, value) : 1;
}

export function directorPanoramaRenderPlan(
  sourceWidthValue: number,
  sourceHeightValue: number,
  maximumWidthValue: number,
  maximumHeightValue: number,
): DirectorPanoramaRenderPlan {
  const sourceImageWidth = positiveDimension(sourceWidthValue);
  const sourceImageHeight = positiveDimension(sourceHeightValue);
  const maximumWidth = positiveDimension(maximumWidthValue);
  const maximumHeight = positiveDimension(maximumHeightValue);
  const sourceAspect = sourceImageWidth / sourceImageHeight;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = sourceImageWidth;
  let sourceHeight = sourceImageHeight;

  if (sourceAspect > DIRECTOR_PANORAMA_ASPECT_RATIO) {
    sourceWidth = sourceImageHeight * DIRECTOR_PANORAMA_ASPECT_RATIO;
    sourceX = (sourceImageWidth - sourceWidth) / 2;
  } else if (sourceAspect < DIRECTOR_PANORAMA_ASPECT_RATIO) {
    sourceHeight = sourceImageWidth / DIRECTOR_PANORAMA_ASPECT_RATIO;
    sourceY = (sourceImageHeight - sourceHeight) * DIRECTOR_PANORAMA_FLOOR_FOCUS;
  }

  const scale = Math.min(1, maximumWidth / sourceWidth, maximumHeight / sourceHeight);
  const outputHeight = Math.max(1, Math.floor(sourceHeight * scale));
  const outputWidth = Math.max(2, outputHeight * DIRECTOR_PANORAMA_ASPECT_RATIO);

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
  };
}

export function isDirectorPanoramaStageReady(
  widthValue: number,
  heightValue: number,
  maximumWidth = 4096,
  maximumHeight = 2048,
) {
  const width = positiveDimension(widthValue);
  const height = positiveDimension(heightValue);
  return (
    Math.abs(width / height - DIRECTOR_PANORAMA_ASPECT_RATIO) < 0.001 &&
    width <= maximumWidth &&
    height <= maximumHeight
  );
}

export function directorPanoramaBackgroundPitchDegrees(
  horizonPitchValue: number | undefined,
  liftPercentValue: number | undefined,
) {
  const horizonPitch = Number.isFinite(horizonPitchValue)
    ? Math.max(-30, Math.min(30, horizonPitchValue ?? 0))
    : 0;
  const liftPercent = Number.isFinite(liftPercentValue)
    ? Math.max(0, Math.min(DIRECTOR_PANORAMA_LIFT_MAX, liftPercentValue ?? 0))
    : 0;
  return horizonPitch - liftPercent * 1.8;
}

/**
 * Converts the background pitch into a pure equirectangular V offset for the stage-floor
 * projection. Keeping this separate from longitude prevents the lift control from sliding the
 * photographed floor sideways.
 */
export function directorPanoramaGroundVerticalOffset(
  horizonPitchValue: number | undefined,
  liftPercentValue: number | undefined,
) {
  return -directorPanoramaBackgroundPitchDegrees(horizonPitchValue, liftPercentValue) / 360;
}

export function directorPanoramaGroundUv(
  worldXValue: number,
  worldZValue: number,
  horizonPitchValue: number | undefined,
  liftPercentValue: number | undefined,
) {
  const worldX = Number.isFinite(worldXValue) ? worldXValue : 0;
  const worldZ = Number.isFinite(worldZValue) ? worldZValue : 0;
  const length = Math.hypot(worldX, DIRECTOR_PANORAMA_GROUND_CAPTURE_HEIGHT, worldZ);
  const longitude = Math.atan2(worldZ, worldX) / (Math.PI * 2) + 0.5;
  const latitude = Math.asin(-DIRECTOR_PANORAMA_GROUND_CAPTURE_HEIGHT / length) / Math.PI + 0.5;
  return {
    u: ((longitude % 1) + 1) % 1,
    v: Math.max(
      0.001,
      Math.min(
        0.499,
        latitude + directorPanoramaGroundVerticalOffset(horizonPitchValue, liftPercentValue),
      ),
    ),
  };
}
