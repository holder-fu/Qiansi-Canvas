import {
  normalizeUserName,
  readCanvasPreferences,
  useCanvasPreferences,
  writeCanvasPreferences,
} from '../store/canvasPreferences';
import {
  loadUserProfile,
  saveUserProfile,
  UserProfileConflictError,
  type UserProfileSnapshot,
} from '../services/userProfile';

let activeSnapshot: UserProfileSnapshot | undefined;
let localEditVersion = 0;
let startupPromise: Promise<void> | undefined;

function canonicalUserName(value: unknown) {
  const source = typeof value === 'string' ? value.normalize('NFKC') : value;
  return normalizeUserName(source).trim().replace(/\s+/gu, ' ');
}

function applyUserName(value: unknown) {
  const userName = canonicalUserName(value);
  writeCanvasPreferences({ userName });
  useCanvasPreferences.setState({ userName });
}

/** Mark an in-progress input edit so a slower startup read cannot overwrite it. */
export function markConfiguredUserNameEdited() {
  localEditVersion += 1;
}

async function retrySaveAfterConflict(userName: string, error: UserProfileConflictError) {
  const latest = error.profile
    ? { profile: error.profile, writable: activeSnapshot?.writable === true }
    : await loadUserProfile();
  activeSnapshot = latest;
  if (!latest.writable) return false;
  activeSnapshot = await saveUserProfile(userName, latest.profile.revision);
  applyUserName(activeSnapshot.profile.userName);
  return true;
}

/** Persist the author identity to Bridge; browser storage remains the offline fallback. */
export async function persistConfiguredUserName(value: unknown): Promise<boolean> {
  markConfiguredUserNameEdited();
  const userName = canonicalUserName(value);
  applyUserName(userName);
  try {
    activeSnapshot ??= await loadUserProfile();
    if (!activeSnapshot.writable) return false;
    activeSnapshot = await saveUserProfile(userName, activeSnapshot.profile.revision);
    applyUserName(activeSnapshot.profile.userName);
    return true;
  } catch (error) {
    if (error instanceof UserProfileConflictError) {
      try {
        return await retrySaveAfterConflict(userName, error);
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Hydrate the browser cache from the host profile. A first-run host migrates an
 * existing browser-only name; revisioned empty values remain authoritative.
 */
export function startConfiguredUserNameSync(): Promise<void> {
  if (startupPromise) return startupPromise;
  const editVersionAtStart = localEditVersion;
  const localUserName = canonicalUserName(readCanvasPreferences().userName);
  startupPromise = loadUserProfile()
    .then(async (snapshot) => {
      activeSnapshot = snapshot;
      if (localEditVersion !== editVersionAtStart) return;
      if (snapshot.profile.revision === 0 && localUserName && snapshot.writable) {
        activeSnapshot = await saveUserProfile(localUserName, 0);
        applyUserName(activeSnapshot.profile.userName);
        return;
      }
      if (snapshot.profile.revision > 0 || !localUserName) {
        applyUserName(snapshot.profile.userName);
      }
    })
    .catch(() => {
      // Bridge may be restarting or unavailable; keep the browser cache usable.
    });
  return startupPromise;
}
