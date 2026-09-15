export const VIDEO_GENERATION_MAX_DURATION_SECONDS = 30;
export const VIDEO_GENERATION_DURATION_OPTIONS = [5, 10, 15, 30] as const;

/**
 * Normalize persisted display-mode aliases before capability checks and request assembly.
 * `首尾帧视频` was written by older canvases; the current UI/provider contract uses `首尾帧`.
 */
export function normalizeVideoGenerationMode(value: unknown): string {
  const mode = typeof value === 'string' ? value.trim() : '';
  if (mode === '首尾帧视频') return '首尾帧';
  return mode || '文生视频';
}

/** A video requests generated audio only when this node explicitly saved the enabled choice. */
export function requestedVideoAudio(
  explicitlySelected: boolean | undefined,
  audio: boolean | undefined,
): boolean {
  return explicitlySelected === true && audio === true;
}
