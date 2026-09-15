export const MAX_MEDIA_WIDTH = 620;
export const MAX_MEDIA_HEIGHT = 520;

export type StandardMediaAspectRatio =
  '16:9' | '9:16' | '1:1' | '3:4' | '4:3' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9';

const STANDARD_MEDIA_ASPECT_RATIOS: StandardMediaAspectRatio[] = [
  '16:9',
  '9:16',
  '1:1',
  '3:4',
  '4:3',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '21:9',
];

function standardRatioValue(value: StandardMediaAspectRatio): number {
  const [width = 16, height = 9] = value.split(':').map(Number);
  return width / height;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b > 0) [a, b] = [b, a % b];
  return a || 1;
}

export function intrinsicAspectRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '16:9';
  }
  const divisor = greatestCommonDivisor(width, height);
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

export function closestStandardAspectRatio(
  width: number,
  height: number,
): StandardMediaAspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '16:9';
  }
  const actual = width / height;
  return STANDARD_MEDIA_ASPECT_RATIOS.reduce((closest, candidate) => {
    const candidateDelta = Math.abs(Math.log(actual / standardRatioValue(candidate)));
    const closestDelta = Math.abs(Math.log(actual / standardRatioValue(closest)));
    return candidateDelta < closestDelta ? candidate : closest;
  });
}

/** Resolve the exact bounded frame used by image and video nodes. */
export function mediaFrameSize(aspectRatio: unknown): { width: number; height: number } {
  const [ratioW = 16, ratioH = 9] = String(aspectRatio ?? '16:9')
    .split(':')
    .map(Number);
  const validRatio = Number.isFinite(ratioW) && Number.isFinite(ratioH) && ratioW > 0 && ratioH > 0;
  const ratio = validRatio ? ratioW / ratioH : 16 / 9;

  if (ratio >= MAX_MEDIA_WIDTH / MAX_MEDIA_HEIGHT) {
    return { width: MAX_MEDIA_WIDTH, height: Math.round(MAX_MEDIA_WIDTH / ratio) };
  }
  return { width: Math.round(MAX_MEDIA_HEIGHT * ratio), height: MAX_MEDIA_HEIGHT };
}

/** Resolve a bounded per-node presentation frame before falling back to the aspect-ratio frame. */
export function resolveMediaFrameSize(
  aspectRatio: unknown,
  customWidth: unknown,
  customHeight: unknown,
): { width: number; height: number } {
  const width = Number(customWidth);
  const height = Number(customHeight);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 120 &&
    width <= 1600 &&
    height >= 120 &&
    height <= 1200
  ) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  return mediaFrameSize(aspectRatio);
}
