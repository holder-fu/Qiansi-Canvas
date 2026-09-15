export type VideoMaskRepairRange = {
  rangeStart: number;
  rangeEnd: number;
  keyframeTime: number;
};

/** Persisted contract shared by the modal, canvas node and provider request. */
export type VideoMaskRepairSpec = VideoMaskRepairRange & {
  maskImage: string;
  maskPreview?: string;
  tracking: 'provider';
};

const MIN_REPAIR_RANGE_SECONDS = 0.1;

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Keep a single problem range valid while preserving the real frame timestamp
 * represented by the painted mask. If the keyframe falls outside the requested
 * range, the range expands to include it instead of silently moving the mask.
 */
export function normalizeVideoMaskRepairRange(
  duration: number,
  rangeStart: number,
  rangeEnd: number,
  keyframeTime: number,
): VideoMaskRepairRange {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration === 0) return { rangeStart: 0, rangeEnd: 0, keyframeTime: 0 };

  const minimumRange = Math.min(MIN_REPAIR_RANGE_SECONDS, safeDuration);
  const safeKeyframe = clamp(finiteOr(keyframeTime, 0), 0, safeDuration);
  let start = clamp(finiteOr(rangeStart, 0), 0, Math.max(0, safeDuration - minimumRange));
  let end = clamp(finiteOr(rangeEnd, safeDuration), start + minimumRange, safeDuration);

  start = Math.min(start, safeKeyframe);
  end = Math.max(end, safeKeyframe);
  if (end - start < minimumRange) {
    if (start + minimumRange <= safeDuration) end = start + minimumRange;
    else start = Math.max(0, end - minimumRange);
  }

  return { rangeStart: start, rangeEnd: end, keyframeTime: safeKeyframe };
}

/**
 * Pick a focused default range around the frame the user identified. Two
 * seconds is long enough to cover a small visual defect without accidentally
 * asking a provider to repair the entire clip. Exact range controls remain
 * available for longer actions.
 */
export function suggestVideoMaskRepairRange(
  duration: number,
  keyframeTime: number,
): VideoMaskRepairRange {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration === 0) return { rangeStart: 0, rangeEnd: 0, keyframeTime: 0 };

  const safeKeyframe = clamp(finiteOr(keyframeTime, 0), 0, safeDuration);
  const targetLength = Math.min(2, safeDuration);
  const start = clamp(safeKeyframe - targetLength / 2, 0, Math.max(0, safeDuration - targetLength));

  return normalizeVideoMaskRepairRange(safeDuration, start, start + targetLength, safeKeyframe);
}

/** True when the translucent editor overlay contains at least one painted pixel. */
export function hasPaintedVideoMask(rgba: Uint8ClampedArray, alphaThreshold = 8) {
  for (let index = 3; index < rgba.length; index += 4) {
    if ((rgba[index] ?? 0) > alphaThreshold) return true;
  }
  return false;
}

/**
 * Convert the editor's cyan alpha overlay into the lossless black-background,
 * white-edit-region pixels expected by a video inpainting workflow.
 */
export function videoMaskOverlayToBinaryRgba(
  rgba: Uint8ClampedArray,
  alphaThreshold = 8,
): Uint8ClampedArray {
  if (rgba.length % 4 !== 0) throw new Error('视频蒙版像素长度无效。');
  const output = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    const value = (rgba[index + 3] ?? 0) > alphaThreshold ? 255 : 0;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return output;
}

export function formatVideoMaskRepairTime(seconds: number) {
  const safe = Math.max(0, finiteOr(seconds, 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`;
}
