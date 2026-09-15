/** True when an image task is owned by a director and must keep its compiled output ratio. */
export function hasDirectorAspectRatioLock(composerParams: unknown): boolean {
  if (!composerParams || typeof composerParams !== 'object') return false;
  const directorSourceId = (composerParams as { directorSourceId?: unknown }).directorSourceId;
  return typeof directorSourceId === 'string' && directorSourceId.trim().length > 0;
}
