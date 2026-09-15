export interface RemovedAssetPersistenceIdentity {
  id: string;
  videoStorageId?: string;
  bridgeAssetId?: string;
}

export interface PersistedMediaReferences {
  complete: boolean;
  browserVideoIds: ReadonlySet<string>;
  bridgeAssetIds: ReadonlySet<string>;
}

interface AssetRemovalTransactionOptions {
  removed: RemovedAssetPersistenceIdentity;
  commitCatalog: () => Promise<boolean>;
  wasRestored: () => boolean;
  collectReferences: () => Promise<PersistedMediaReferences>;
  deleteBrowserVideo: (id: string) => Promise<unknown>;
  deleteBridgeAsset: (id: string) => Promise<unknown>;
}

/**
 * Delete physical media only after the project catalog removal is durable.
 * A failed/ambiguous save intentionally leaves an orphan candidate behind;
 * losing a file that a verified project revision still references is worse.
 */
export async function cleanupRemovedAssetAfterCommit({
  removed,
  commitCatalog,
  wasRestored,
  collectReferences,
  deleteBrowserVideo,
  deleteBridgeAsset,
}: AssetRemovalTransactionOptions) {
  if (!(await commitCatalog())) return false;
  if (wasRestored()) return false;

  const referenced = await collectReferences();
  if (!referenced.complete) return false;

  await Promise.allSettled([
    ...(removed.videoStorageId && !referenced.browserVideoIds.has(removed.videoStorageId)
      ? [deleteBrowserVideo(removed.videoStorageId)]
      : []),
    ...(removed.bridgeAssetId && !referenced.bridgeAssetIds.has(removed.bridgeAssetId)
      ? [deleteBridgeAsset(removed.bridgeAssetId)]
      : []),
  ]);
  return true;
}
