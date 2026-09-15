import type { CanvasMediaAssetLike } from '../lib/canvasMediaMigration';
import { prepareCanvasAssetItemsForPersistence } from '../services/canvasMediaPersistence';

export interface PreparedCanvasAssetCatalog<T extends CanvasMediaAssetLike> {
  projectId: string;
  items: T[];
  serialized: string;
  scopedKey: string;
  expectedScopedRaw: string | null;
  legacySources: Array<{ key: string; raw: string }>;
  migrationMarkerKey?: string;
}

export class CanvasAssetPersistenceConflictError extends Error {
  constructor(message = '素材目录在迁移期间发生变化，已停止写入以避免覆盖较新的素材。') {
    super(message);
    this.name = 'CanvasAssetPersistenceConflictError';
  }
}

/**
 * Prepare a compact, verified asset catalog without changing localStorage.
 * The caller supplies the live/recovered items so an old shared catalog can be
 * migrated without first duplicating its large Base64 payload under a new key.
 */
export async function prepareCanvasAssetCatalog<T extends CanvasMediaAssetLike>(options: {
  projectId: string;
  items: readonly T[];
  storage: Storage;
  scopedKey: string;
  legacyKeys?: readonly string[];
  migrationMarkerKey?: string;
  limit?: number;
}): Promise<PreparedCanvasAssetCatalog<T>> {
  const limit = Math.max(1, Math.floor(options.limit ?? 200));
  const items = [...options.items].slice(-limit);
  const expectedScopedRaw = options.storage.getItem(options.scopedKey);
  const legacyCandidates = (options.legacyKeys ?? []).flatMap((key) => {
    const raw = options.storage.getItem(key);
    return raw === null ? [] : [{ key, raw }];
  });
  const selectedLegacyRaw = expectedScopedRaw ?? legacyCandidates[0]?.raw;
  const legacySources =
    selectedLegacyRaw === undefined
      ? []
      : legacyCandidates.filter((source) => source.raw === selectedLegacyRaw);
  const prepared = await prepareCanvasAssetItemsForPersistence(items, options.projectId);
  return {
    projectId: options.projectId,
    items: prepared.items,
    serialized: JSON.stringify(prepared.items),
    scopedKey: options.scopedKey,
    expectedScopedRaw,
    legacySources,
    migrationMarkerKey: options.migrationMarkerKey,
  };
}

/**
 * Commit one prepared catalog with compare-before-write semantics. When a
 * shared legacy key is the only copy, it is compacted in place first; this
 * releases quota while preserving a recoverable catalog if the scoped write
 * is interrupted. Legacy copies are removed only after scoped read-back.
 */
export function commitPreparedCanvasAssetCatalog<T extends CanvasMediaAssetLike>(
  storage: Storage,
  plan: PreparedCanvasAssetCatalog<T>,
) {
  if (storage.getItem(plan.scopedKey) !== plan.expectedScopedRaw) {
    throw new CanvasAssetPersistenceConflictError();
  }
  for (const source of plan.legacySources) {
    if (storage.getItem(source.key) !== source.raw) {
      throw new CanvasAssetPersistenceConflictError();
    }
  }

  // Rewrite matching legacy copies before adding a new scoped key. Replacing
  // an existing value is the only operation that succeeds when localStorage is
  // already full, and the compact value remains a complete fallback catalog.
  for (const source of plan.legacySources) storage.setItem(source.key, plan.serialized);
  storage.setItem(plan.scopedKey, plan.serialized);
  if (storage.getItem(plan.scopedKey) !== plan.serialized) {
    throw new Error('素材目录写入后无法完整回读，旧目录已保留。');
  }

  for (const source of plan.legacySources) {
    if (storage.getItem(source.key) === plan.serialized) storage.removeItem(source.key);
  }
  if (plan.migrationMarkerKey) {
    try {
      storage.setItem(plan.migrationMarkerKey, '1');
    } catch {
      // The scoped catalog is authoritative; a missing marker only causes a
      // harmless future source check and must not turn a valid commit into loss.
    }
  }
  return plan.items;
}
