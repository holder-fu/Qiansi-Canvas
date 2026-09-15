import { DEFAULT_GENERATION_LIMITS, GENERATION_LIMIT_KEYS } from './generationLimitsContract.mjs';
import {
  readGenerationLimitPreferences,
  useCanvasPreferences,
  writeCanvasPreferences,
  type GenerationLimitPreferences,
} from '../store/canvasPreferences';
import {
  GenerationLimitsConflictError,
  loadGenerationLimits,
  saveGenerationLimits,
  type GenerationLimitsSnapshot,
} from '../services/generationLimits';

let activeSnapshot: GenerationLimitsSnapshot | undefined;
let localEditVersion = 0;
let startupPromise: Promise<void> | undefined;
let saveQueue = Promise.resolve(true);

function applyGenerationLimits(value: GenerationLimitPreferences) {
  writeCanvasPreferences(value);
  const limits = readGenerationLimitPreferences();
  useCanvasPreferences.setState(
    Object.fromEntries(GENERATION_LIMIT_KEYS.map((key) => [key, limits[key]])),
  );
}

function limitsEqual(left: GenerationLimitPreferences, right: GenerationLimitPreferences) {
  return GENERATION_LIMIT_KEYS.every((key) => left[key] === right[key]);
}

export function markGenerationLimitsEdited() {
  localEditVersion += 1;
}

async function retrySaveAfterConflict(
  desired: GenerationLimitPreferences,
  error: GenerationLimitsConflictError,
  editVersion: number,
) {
  const latest = error.limits
    ? { limits: error.limits, writable: activeSnapshot?.writable === true }
    : await loadGenerationLimits();
  activeSnapshot = latest;
  if (!latest.writable) return false;
  activeSnapshot = await saveGenerationLimits(desired, latest.limits.revision);
  if (localEditVersion === editVersion) applyGenerationLimits(activeSnapshot.limits);
  return true;
}

async function saveCurrentGenerationLimits(
  desired: GenerationLimitPreferences,
  editVersion: number,
) {
  try {
    activeSnapshot ??= await loadGenerationLimits();
    if (!activeSnapshot.writable) return false;
    activeSnapshot = await saveGenerationLimits(desired, activeSnapshot.limits.revision);
    if (localEditVersion === editVersion) applyGenerationLimits(activeSnapshot.limits);
    return true;
  } catch (error) {
    if (error instanceof GenerationLimitsConflictError) {
      try {
        return await retrySaveAfterConflict(desired, error, editVersion);
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Persist the current local controls to Bridge while serializing rapid field commits. */
export function persistGenerationLimits(): Promise<boolean> {
  markGenerationLimitsEdited();
  const editVersion = localEditVersion;
  const desired = readGenerationLimitPreferences();
  saveQueue = saveQueue
    .catch(() => false)
    .then(() => saveCurrentGenerationLimits(desired, editVersion));
  return saveQueue;
}

/** Hydrate the browser fallback from the host-level Bridge settings. */
export function startGenerationLimitsSync(): Promise<void> {
  if (startupPromise) return startupPromise;
  const editVersionAtStart = localEditVersion;
  const localLimits = readGenerationLimitPreferences();
  startupPromise = loadGenerationLimits()
    .then(async (snapshot) => {
      activeSnapshot = snapshot;
      if (localEditVersion !== editVersionAtStart) return;
      const defaults = DEFAULT_GENERATION_LIMITS as GenerationLimitPreferences;
      if (
        snapshot.limits.revision === 0 &&
        !limitsEqual(localLimits, defaults) &&
        snapshot.writable
      ) {
        activeSnapshot = await saveGenerationLimits(localLimits, 0);
        applyGenerationLimits(activeSnapshot.limits);
        return;
      }
      applyGenerationLimits(snapshot.limits);
    })
    .catch(() => {
      // Bridge may be restarting or unavailable; keep the browser cache usable.
    });
  return startupPromise;
}
