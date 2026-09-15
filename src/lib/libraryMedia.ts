import { resolveBridgeUrl } from './bridgeUrl';
import { uploadAssetFile, type BridgeAssetItem } from '../services/assetLibrary';

const DB_NAME = 'kitty-canvas-library-media';
const EFFECT_STORE = 'effect-videos';
const ASSET_STORE = 'asset-videos';
const DIRECTOR_MODEL_STORE = 'director-models';
const DIRECTOR_SCENE_STORE = 'director-scenes';
const DIRECTOR_SCENE_REFERENCE_SUFFIX = '::ai-reference';
const TRASH_STORE = 'project-trash';
const BRIDGE_ASSET_ID = /^asset_[A-Za-z0-9_-]{6,80}$/;

export class BrowserMediaPersistenceDisabledError extends Error {
  constructor() {
    super('浏览器媒体持久化已停用；请先启动本机 Bridge 并完成素材上传。');
    this.name = 'BrowserMediaPersistenceDisabledError';
  }
}

function bridgeOwnedFile(blob: Blob, fileName: string) {
  return blob instanceof File
    ? blob
    : new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
}

async function loadBridgeAsset(id: string): Promise<Blob | null> {
  if (!BRIDGE_ASSET_ID.test(id)) return null;
  try {
    const response = await fetch(
      resolveBridgeUrl(`/asset-library/files/${encodeURIComponent(id)}`),
    );
    return response.ok ? response.blob() : null;
  } catch {
    return null;
  }
}

function openLegacyDatabaseIfExists(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let missingDatabase = false;
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      missingDatabase = true;
      request.transaction?.abort();
    };
    request.onerror = () => {
      if (missingDatabase || request.error?.name === 'AbortError') resolve(null);
      else reject(request.error);
    };
    request.onsuccess = () => {
      if (missingDatabase) {
        request.result.close();
        resolve(null);
      } else {
        resolve(request.result);
      }
    };
  });
}

async function loadLegacyBlob(storeName: string, id: string): Promise<Blob | null> {
  const database = await openLegacyDatabaseIfExists();
  if (!database || !database.objectStoreNames.contains(storeName)) {
    database?.close();
    return null;
  }
  const value = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value;
}

async function deleteLegacyValue(storeName: string, id: string) {
  const database = await openLegacyDatabaseIfExists();
  if (!database || !database.objectStoreNames.contains(storeName)) {
    database?.close();
    return false;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return true;
}

export async function saveDirectorModel(
  id: string,
  blob: Blob,
  options: { project?: string; fileName?: string } = {},
): Promise<BridgeAssetItem> {
  return uploadAssetFile(bridgeOwnedFile(blob, options.fileName || `${id}.glb`), 'director-model', {
    project: options.project,
  });
}

export async function loadDirectorModel(id: string): Promise<Blob | null> {
  if (BRIDGE_ASSET_ID.test(id)) return loadBridgeAsset(id);
  return loadLegacyBlob(DIRECTOR_MODEL_STORE, id);
}

export async function saveDirectorScene(
  id: string,
  blob: Blob,
  options: { project?: string; fileName?: string } = {},
): Promise<BridgeAssetItem> {
  return uploadAssetFile(bridgeOwnedFile(blob, options.fileName || `${id}.jpg`), 'director-scene', {
    project: options.project,
  });
}

export async function loadDirectorScene(id: string): Promise<Blob | null> {
  if (BRIDGE_ASSET_ID.test(id)) return loadBridgeAsset(id);
  return loadLegacyBlob(DIRECTOR_SCENE_STORE, id);
}

export async function saveDirectorSceneReference(
  id: string,
  blob: Blob,
  options: { project?: string; fileName?: string } = {},
): Promise<BridgeAssetItem> {
  return uploadAssetFile(
    bridgeOwnedFile(blob, options.fileName || `${id}-reference.jpg`),
    'director-reference',
    { project: options.project },
  );
}

export async function loadDirectorSceneReference(id: string): Promise<Blob | null> {
  if (BRIDGE_ASSET_ID.test(id)) return loadBridgeAsset(id);
  return loadDirectorScene(`${id}${DIRECTOR_SCENE_REFERENCE_SUFFIX}`);
}

/** @deprecated New effect media must be written through persistVideoFile/Bridge. */
export async function saveEffectVideo(_id: string, _file: Blob): Promise<never> {
  throw new BrowserMediaPersistenceDisabledError();
}

export async function loadEffectVideo(id: string): Promise<Blob | null> {
  return loadLegacyBlob(EFFECT_STORE, id);
}

export async function hasEffectVideo(id: string): Promise<boolean> {
  const database = await openLegacyDatabaseIfExists();
  if (!database || !database.objectStoreNames.contains(EFFECT_STORE)) {
    database?.close();
    return false;
  }
  const count = await new Promise<number>((resolve, reject) => {
    const request = database
      .transaction(EFFECT_STORE, 'readonly')
      .objectStore(EFFECT_STORE)
      .count(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return count > 0;
}

export async function deleteEffectVideo(id: string) {
  await deleteLegacyValue(EFFECT_STORE, id);
}

/** @deprecated New node media must be written through persistVideoFile/Bridge. */
export async function saveAssetVideo(_id: string, _blob: Blob): Promise<never> {
  throw new BrowserMediaPersistenceDisabledError();
}

export async function loadAssetVideo(id: string): Promise<Blob | null> {
  return loadLegacyBlob(ASSET_STORE, id);
}

export async function deleteAssetVideo(id: string) {
  await deleteLegacyValue(ASSET_STORE, id);
}

/** @deprecated Project trash is persisted by the Bridge project document API. */
export async function saveProjectTrash(_projectId: string, _items: unknown[]): Promise<never> {
  throw new BrowserMediaPersistenceDisabledError();
}

export async function loadProjectTrash(projectId: string): Promise<unknown[] | null> {
  const database = await openLegacyDatabaseIfExists();
  if (!database || !database.objectStoreNames.contains(TRASH_STORE)) {
    database?.close();
    return null;
  }
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = database
      .transaction(TRASH_STORE, 'readonly')
      .objectStore(TRASH_STORE)
      .get(projectId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return Array.isArray(value) ? value : null;
}

export async function deleteProjectTrash(projectId: string) {
  await deleteLegacyValue(TRASH_STORE, projectId);
}

export async function deleteLegacyDirectorModel(id: string) {
  if (!BRIDGE_ASSET_ID.test(id)) await deleteLegacyValue(DIRECTOR_MODEL_STORE, id);
}

export async function deleteLegacyDirectorScene(id: string) {
  if (BRIDGE_ASSET_ID.test(id)) return;
  await Promise.all([
    deleteLegacyValue(DIRECTOR_SCENE_STORE, id),
    deleteLegacyValue(DIRECTOR_SCENE_STORE, `${id}${DIRECTOR_SCENE_REFERENCE_SUFFIX}`),
  ]);
}
