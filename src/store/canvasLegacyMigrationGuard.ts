import {
  portableBridgeCanvasValue,
  type BridgeProjectManifest,
} from '../services/bridgeCanvasPersistence';

export interface LegacyStorageCasEntry {
  key: string;
  raw: string | null;
}

export class LegacyStorageChangedError extends Error {
  constructor(key: string) {
    super(`旧浏览器数据“${key}”在迁移期间发生变化，已保留原记录并停止清理。`);
    this.name = 'LegacyStorageChangedError';
  }
}

export function equivalentLegacyBridgeValue(left: unknown, right: unknown) {
  return (
    JSON.stringify(portableBridgeCanvasValue(left)) ===
    JSON.stringify(portableBridgeCanvasValue(right))
  );
}

export function legacyCopiesMatchBridge(bridgeValue: unknown, legacyCopies: readonly unknown[]) {
  return legacyCopies.every((copy) => equivalentLegacyBridgeValue(copy, bridgeValue));
}

function blankManifestValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

const LEGACY_MANIFEST_ALIAS_GROUPS = [
  ['projectName', 'name', 'title'],
  ['currentWorkspace', 'workspace', 'activeWorkspace'],
] as const;

/**
 * Returns the first pre-existing manifest field that a legacy patch would
 * overwrite. Empty host fields may be filled, but any non-empty difference is
 * a recovery conflict even when expectedRevision still matches.
 */
export function legacyManifestPatchConflictField(
  remote: BridgeProjectManifest | undefined,
  patch: Partial<BridgeProjectManifest>,
): string | undefined {
  if (!remote) return;
  const covered = new Set<string>();
  for (const aliases of LEGACY_MANIFEST_ALIAS_GROUPS) {
    for (const key of aliases) covered.add(key);
    const desired = aliases.map((key) => patch[key]).find((value) => value !== undefined);
    if (desired === undefined) continue;
    for (const key of aliases) {
      const existing = remote[key];
      if (!blankManifestValue(existing) && !equivalentLegacyBridgeValue(existing, desired)) {
        return aliases[0];
      }
    }
  }
  for (const [key, desired] of Object.entries(patch)) {
    if (covered.has(key) || desired === undefined) continue;
    const existing = remote[key];
    if (!blankManifestValue(existing) && !equivalentLegacyBridgeValue(existing, desired)) {
      return key;
    }
  }
  return;
}

/**
 * The final guard before deleting any promoted IndexedDB record. All browser
 * JSON sources are re-read first; cleanup never runs after a stale migration.
 */
export async function commitLegacyMediaAfterStorageCas(
  storage: Pick<Storage, 'getItem'>,
  entries: readonly LegacyStorageCasEntry[],
  commit: () => Promise<void>,
) {
  // Two synchronous passes catch a source changed while the first snapshot is
  // being inspected (including fault-injected Storage implementations).
  for (let pass = 0; pass < 2; pass += 1) {
    for (const entry of entries) {
      if (storage.getItem(entry.key) !== entry.raw) throw new LegacyStorageChangedError(entry.key);
    }
  }
  await commit();
}
