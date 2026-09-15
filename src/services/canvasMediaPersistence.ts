import {
  CanvasMediaFallbackObjectUrlRegistry,
  canvasMediaDataUrlToBlob,
  createCanvasMediaStableId,
  deleteCanvasMediaFallback,
  isCanvasMediaFallbackUrl,
  loadCanvasMediaFallback,
  parseCanvasMediaFallbackReferenceUrl,
  verifyCanvasMediaFallback,
} from '../lib/canvasMediaFallback';
import { isDerivedImagePreviewUrl } from '../lib/aiImageReferencePolicy';
import {
  mapCanvasMediaValueStrings,
  collectCanvasMediaStrings,
  migrateCanvasAssetItemsEmbeddedImages,
  migrateCanvasMediaValueEmbeddedImages,
  migrateCanvasNodesEmbeddedImages,
  type CanvasAssetMediaMigrationResult,
  type CanvasImageMigrationResolution,
  type CanvasMediaAssetLike,
  type CanvasMediaValueMigrationResult,
  type CanvasNodeMediaMigrationResult,
} from '../lib/canvasMediaMigration';
import { isDirectorNodeKind, type FlowNode, type NodeKind } from '../canvas/nodeTypes';
import { persistImageFile } from './mediaPersistence';
import { uploadMediaPreview } from './assetLibrary';

const MAX_MIGRATED_IMAGE_BYTES = 40 * 1024 * 1024;

export class CanvasMediaPersistenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CanvasMediaPersistenceError';
  }
}

function imageExtension(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/avif') return 'avif';
  return 'jpg';
}

async function verifyBridgeOriginal(originalUrl: string, expectedBlob: Blob, signal?: AbortSignal) {
  const response = await fetch(originalUrl, {
    method: 'GET',
    signal,
  });
  if (!response.ok) {
    throw new Error(`本机素材回读失败（HTTP ${response.status}）。`);
  }
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error('本机素材回读结果不是图片。');
  }
  const readbackBlob = await response.blob();
  if (readbackBlob.size !== expectedBlob.size) {
    throw new Error('本机素材回读大小与原始图片不一致。');
  }
  const [expectedContentId, readbackContentId] = await Promise.all([
    createCanvasMediaStableId(expectedBlob),
    createCanvasMediaStableId(readbackBlob),
  ]);
  if (readbackContentId !== expectedContentId) {
    throw new Error('本机素材回读内容与原始图片不一致。');
  }
}

const sharedPersistenceByProjectAndContent = new Map<
  string,
  Promise<CanvasImageMigrationResolution>
>();

function sharedPersistenceKey(projectId: string, stableId: string) {
  return `${projectId.length}:${projectId}:${stableId}`;
}

type VerifiedBridgeImage = Awaited<ReturnType<typeof persistImageFile>>;
const verifiedBridgeByProjectAndContent = new Map<string, Promise<VerifiedBridgeImage>>();

async function persistInVerifiedBridge(
  blob: Blob,
  stableId: string,
  projectId: string,
  signal?: AbortSignal,
) {
  const cacheKey = sharedPersistenceKey(projectId, stableId);
  const existing = verifiedBridgeByProjectAndContent.get(cacheKey);
  if (existing) return existing;

  const persistence = (async () => {
    const file = new File([blob], `${stableId.slice(-16)}.${imageExtension(blob.type)}`, {
      type: blob.type,
    });
    const item = await persistImageFile(file, 'storyboard', projectId, signal);
    await verifyBridgeOriginal(item.originalUrl, blob, signal);
    return item;
  })();
  verifiedBridgeByProjectAndContent.set(cacheKey, persistence);
  try {
    return await persistence;
  } catch (error) {
    if (verifiedBridgeByProjectAndContent.get(cacheKey) === persistence) {
      verifiedBridgeByProjectAndContent.delete(cacheKey);
    }
    throw error;
  }
}

async function persistPreparedCanvasImage(
  blob: Blob,
  stableId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<CanvasImageMigrationResolution> {
  try {
    const item = await persistInVerifiedBridge(blob, stableId, projectId, signal);
    return {
      originalUrl: item.originalUrl,
      previewUrl: item.previewUrl,
      bridgeAssetId: item.bridgeAssetId,
      storage: 'bridge',
    };
  } catch (error) {
    throw new CanvasMediaPersistenceError(
      '图片无法写入并回读本机 Bridge 素材库；当前页面仍保留临时内容，但刷新后会丢失，画布快照未提交。',
      error,
    );
  }
}

/**
 * Persist one legacy embedded image to the authoritative Bridge asset library.
 * A Bridge failure leaves the caller's in-memory Data URL untouched.
 */
export async function persistEmbeddedCanvasImage(
  dataUrl: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<CanvasImageMigrationResolution> {
  const blob = canvasMediaDataUrlToBlob(dataUrl);
  if (!blob.type.toLowerCase().startsWith('image/')) {
    throw new CanvasMediaPersistenceError('画布内嵌媒体不是图片，已停止迁移。');
  }
  if (blob.size <= 0 || blob.size > MAX_MIGRATED_IMAGE_BYTES) {
    throw new CanvasMediaPersistenceError(
      `画布图片大小无效或超过 ${MAX_MIGRATED_IMAGE_BYTES / 1024 / 1024} MB，已停止迁移。`,
    );
  }
  const stableId = await createCanvasMediaStableId(blob);
  const cacheKey = sharedPersistenceKey(projectId, stableId);
  const existing = sharedPersistenceByProjectAndContent.get(cacheKey);
  if (existing) return existing;

  const persistence = persistPreparedCanvasImage(blob, stableId, projectId, signal);
  sharedPersistenceByProjectAndContent.set(cacheKey, persistence);
  try {
    return await persistence;
  } catch (error) {
    if (sharedPersistenceByProjectAndContent.get(cacheKey) === persistence) {
      sharedPersistenceByProjectAndContent.delete(cacheKey);
    }
    throw error;
  }
}

export class CanvasMediaPersistenceSession {
  private readonly projectId: string;
  private readonly pendingLegacyStableIds = new Set<string>();
  private readonly promotedReferences = new Map<string, Promise<CanvasImageMigrationResolution>>();

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  persist(dataUrl: string, signal?: AbortSignal) {
    return persistEmbeddedCanvasImage(dataUrl, this.projectId, signal);
  }

  promoteLegacyReference(referenceUrl: string, signal?: AbortSignal) {
    const existing = this.promotedReferences.get(referenceUrl);
    if (existing) return existing;
    const promotion = this.promoteLegacyReferenceUncached(referenceUrl, signal);
    this.promotedReferences.set(referenceUrl, promotion);
    return promotion.catch((error) => {
      if (this.promotedReferences.get(referenceUrl) === promotion) {
        this.promotedReferences.delete(referenceUrl);
      }
      throw error;
    });
  }

  private async promoteLegacyReferenceUncached(
    referenceUrl: string,
    signal?: AbortSignal,
  ): Promise<CanvasImageMigrationResolution> {
    const reference = parseCanvasMediaFallbackReferenceUrl(referenceUrl);
    if (!reference) {
      throw new CanvasMediaPersistenceError('IndexedDB 媒体地址无效，已停止迁移。');
    }
    const verification = await verifyCanvasMediaFallback(reference.stableId);
    if (!verification.ok) {
      throw new CanvasMediaPersistenceError(
        `IndexedDB 媒体校验失败（${verification.reason}），旧记录已保留。`,
      );
    }
    const blob = await loadCanvasMediaFallback(reference.stableId);
    if (!blob) {
      throw new CanvasMediaPersistenceError('IndexedDB 媒体已经丢失，旧项目未提交。');
    }
    assertAiOriginalBlob(blob);

    let resolution: CanvasImageMigrationResolution;
    if (reference.role === 'preview') {
      const preview = await uploadMediaPreview(blob, { signal });
      await verifyBridgeOriginal(preview.url, blob, signal);
      resolution = {
        originalUrl: preview.url,
        previewUrl: preview.url,
        storage: 'bridge',
      };
    } else {
      const item = await persistInVerifiedBridge(blob, reference.stableId, this.projectId, signal);
      resolution = {
        originalUrl: item.originalUrl,
        previewUrl: item.previewUrl,
        bridgeAssetId: item.bridgeAssetId,
        storage: 'bridge',
      };
    }
    this.pendingLegacyStableIds.add(reference.stableId);
    return resolution;
  }

  pendingLegacyMediaIds(): readonly string[] {
    return [...this.pendingLegacyStableIds];
  }

  /** Call only after the Bridge project/workspace transaction has committed. */
  async commitLegacyMigration(): Promise<void> {
    const failures: unknown[] = [];
    for (const stableId of this.pendingLegacyStableIds) {
      try {
        await deleteCanvasMediaFallback(stableId);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) {
      throw new CanvasMediaPersistenceError(
        'Bridge 项目已保存，但部分旧 IndexedDB 媒体未能清理；稍后可安全重试清理。',
        new AggregateError(failures),
      );
    }
    this.pendingLegacyStableIds.clear();
  }
}

interface ManagedReferencePromotionResult<T> {
  value: T;
  referenceCount: number;
  resolutions: ReadonlyMap<string, CanvasImageMigrationResolution>;
}

async function promoteManagedReferences<T>(
  value: T,
  session: CanvasMediaPersistenceSession,
  signal?: AbortSignal,
): Promise<ManagedReferencePromotionResult<T>> {
  const references = collectCanvasMediaStrings(value, (item) => isCanvasMediaFallbackUrl(item));
  const resolutions = new Map<string, CanvasImageMigrationResolution>();
  for (const reference of references) {
    resolutions.set(reference, await session.promoteLegacyReference(reference, signal));
  }
  return {
    value: mapCanvasMediaValueStrings(value, (item) => {
      const resolution = resolutions.get(item);
      if (!resolution) return item;
      return parseCanvasMediaFallbackReferenceUrl(item)?.role === 'preview'
        ? resolution.previewUrl || resolution.originalUrl
        : resolution.originalUrl;
    }),
    referenceCount: references.length,
    resolutions,
  };
}

export type PreparedCanvasMediaValue<T> = CanvasMediaValueMigrationResult<T> & {
  legacyIndexedDbReferenceCount: number;
  session: CanvasMediaPersistenceSession;
};

export type PreparedCanvasAssetItems<T extends CanvasMediaAssetLike> =
  CanvasAssetMediaMigrationResult<T> & {
    legacyIndexedDbReferenceCount: number;
    session: CanvasMediaPersistenceSession;
  };

const fallbackObjectUrls =
  typeof URL !== 'undefined' &&
  typeof URL.createObjectURL === 'function' &&
  typeof URL.revokeObjectURL === 'function'
    ? new CanvasMediaFallbackObjectUrlRegistry()
    : undefined;
const retainedFallbackLeases = new Map<
  string,
  Awaited<ReturnType<CanvasMediaFallbackObjectUrlRegistry['acquire']>>
>();

/** Resolve a serialized IndexedDB reference to one session-only renderer URL. */
export async function resolveCanvasMediaRuntimeUrl(value: string): Promise<string> {
  if (!isCanvasMediaFallbackUrl(value)) return value;
  if (!fallbackObjectUrls) {
    throw new CanvasMediaPersistenceError('当前环境无法恢复 IndexedDB 画布图片。');
  }
  const retained = retainedFallbackLeases.get(value);
  if (retained) return retained.objectUrl;
  const lease = await fallbackObjectUrls.acquire(value);
  retainedFallbackLeases.set(value, lease);
  return lease.objectUrl;
}

/** Convert a runtime Blob URL created by this module back to its serializable ID URL. */
export function stableCanvasMediaUrlForRuntime(value: string): string | undefined {
  if (isCanvasMediaFallbackUrl(value)) return value;
  return fallbackObjectUrls?.stableUrlForObjectUrl(value) ?? undefined;
}

/**
 * Prepare an arbitrary catalog/import value for durable storage. Managed runtime
 * Blob URLs are first restored to their stable IndexedDB role, then legacy raster
 * Data URLs are persisted and verified before the returned clone is rewritten.
 */
export async function prepareCanvasMediaValueForPersistence<T>(
  value: T,
  projectId: string,
  signal?: AbortSignal,
  providedSession?: CanvasMediaPersistenceSession,
): Promise<PreparedCanvasMediaValue<T>> {
  const serializableValue = mapCanvasMediaValueStrings(
    value,
    (mediaValue) => stableCanvasMediaUrlForRuntime(mediaValue) ?? mediaValue,
  );
  const session = providedSession ?? new CanvasMediaPersistenceSession(projectId);
  const promoted = await promoteManagedReferences(serializableValue, session, signal);
  const migrated = await migrateCanvasMediaValueEmbeddedImages(promoted.value, (dataUrl) =>
    session.persist(dataUrl, signal),
  );
  return {
    ...migrated,
    uniqueImageCount: migrated.uniqueImageCount + promoted.referenceCount,
    resolutions: new Map([...promoted.resolutions, ...migrated.resolutions]),
    legacyIndexedDbReferenceCount: promoted.referenceCount,
    session,
  };
}

/** AssetItem-compatible wrapper that also repairs original/preview aliases. */
export async function prepareCanvasAssetItemsForPersistence<T extends CanvasMediaAssetLike>(
  items: readonly T[],
  projectId: string,
  signal?: AbortSignal,
  providedSession?: CanvasMediaPersistenceSession,
): Promise<PreparedCanvasAssetItems<T>> {
  const serializableItems = mapCanvasMediaValueStrings(
    [...items],
    (mediaValue) => stableCanvasMediaUrlForRuntime(mediaValue) ?? mediaValue,
  );
  const session = providedSession ?? new CanvasMediaPersistenceSession(projectId);
  const promoted = await promoteManagedReferences(serializableItems, session, signal);
  const migrated = await migrateCanvasAssetItemsEmbeddedImages(promoted.value, (dataUrl) =>
    session.persist(dataUrl, signal),
  );
  const normalizedItems = migrated.items.map((item, index) => {
    const source = serializableItems[index];
    if (
      !source ||
      source.kind === 'video' ||
      source.kind === 'video-comp' ||
      source.kind === 'audio'
    ) {
      return item;
    }
    const primary = [source.originalUrl, source.imageUrl, source.images?.[0]].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' &&
        parseCanvasMediaFallbackReferenceUrl(candidate)?.role === 'original',
    );
    const resolution = primary ? promoted.resolutions.get(primary) : undefined;
    if (!resolution) return item;
    return {
      ...item,
      originalUrl: resolution.originalUrl,
      imageUrl: resolution.originalUrl,
      images:
        source.images && source.images.length > 0
          ? [resolution.originalUrl, ...(item.images?.slice(1) ?? [])]
          : item.images,
      previewUrl: item.previewUrl || resolution.previewUrl,
      bridgeAssetId: resolution.bridgeAssetId,
    };
  });
  return {
    ...migrated,
    items: normalizedItems,
    uniqueImageCount: migrated.uniqueImageCount + promoted.referenceCount,
    resolutions: new Map([...promoted.resolutions, ...migrated.resolutions]),
    legacyIndexedDbReferenceCount: promoted.referenceCount,
    session,
  };
}

const CANONICAL_IMAGE_NODE_KINDS = new Set<NodeKind>([
  'image',
  'views',
  'front-frame',
  'generator',
  'comfy',
  'midjourney',
  'msgen',
  'rh',
]);

export type PreparedCanvasNodes = CanvasNodeMediaMigrationResult & {
  legacyIndexedDbReferenceCount: number;
  session: CanvasMediaPersistenceSession;
};

/** Promote Data URLs and legacy IndexedDB URLs before a workspace is committed to Bridge. */
export async function prepareCanvasNodesForPersistence(
  nodes: readonly FlowNode[],
  projectId: string,
  signal?: AbortSignal,
  providedSession?: CanvasMediaPersistenceSession,
): Promise<PreparedCanvasNodes> {
  const serializableNodes = mapCanvasMediaValueStrings(
    [...nodes],
    (mediaValue) => stableCanvasMediaUrlForRuntime(mediaValue) ?? mediaValue,
  );
  const session = providedSession ?? new CanvasMediaPersistenceSession(projectId);
  const promoted = await promoteManagedReferences(serializableNodes, session, signal);
  const migrated = await migrateCanvasNodesEmbeddedImages(promoted.value, (dataUrl) =>
    session.persist(dataUrl, signal),
  );
  const normalizedNodes = migrated.nodes.map((node, index) => {
    const source = serializableNodes[index];
    if (
      !source ||
      !CANONICAL_IMAGE_NODE_KINDS.has(source.data.kind) ||
      isDirectorNodeKind(source.data.kind)
    ) {
      return node;
    }
    const primary = [source.data.originalUrl, source.data.imageUrl, source.data.images?.[0]].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' &&
        parseCanvasMediaFallbackReferenceUrl(candidate)?.role === 'original',
    );
    const resolution = primary ? promoted.resolutions.get(primary) : undefined;
    if (!resolution) return node;
    return {
      ...node,
      data: {
        ...node.data,
        bridgeAssetId: resolution.bridgeAssetId,
        previewUrl: node.data.previewUrl || resolution.previewUrl,
      },
    };
  });
  return {
    ...migrated,
    nodes: normalizedNodes,
    uniqueImageCount: migrated.uniqueImageCount + promoted.referenceCount,
    resolutions: new Map([...promoted.resolutions, ...migrated.resolutions]),
    legacyIndexedDbReferenceCount: promoted.referenceCount,
    session,
  };
}

export function isManagedCanvasMediaRuntimeUrl(value: string) {
  return Boolean(stableCanvasMediaUrlForRuntime(value) || isCanvasMediaFallbackUrl(value));
}

function assertAiOriginalBlob(blob: Blob) {
  if (!blob.type.toLowerCase().startsWith('image/')) {
    throw new CanvasMediaPersistenceError('核心参考媒体不是图片，已停止提交给 AI。');
  }
  if (blob.size <= 0 || blob.size > MAX_MIGRATED_IMAGE_BYTES) {
    throw new CanvasMediaPersistenceError(
      `核心参考图大小无效或超过 ${MAX_MIGRATED_IMAGE_BYTES / 1024 / 1024} MB，已停止提交给 AI。`,
    );
  }
}

/**
 * Resolve one core AI image to a bridge-readable original. Renderer previews
 * and unmanaged session Blob URLs are rejected instead of being submitted as
 * a lower-quality or unrelated identity image.
 */
export async function resolveCanvasImageForAi(
  value: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<string> {
  const source = value.trim();
  if (!source) {
    throw new CanvasMediaPersistenceError('核心参考图为空，已停止提交给 AI。');
  }

  const runtimeStableUrl = source.startsWith('blob:')
    ? stableCanvasMediaUrlForRuntime(source)
    : undefined;
  const managedSource = runtimeStableUrl ?? source;
  const fallbackReference = parseCanvasMediaFallbackReferenceUrl(managedSource);
  if (fallbackReference?.role === 'preview') {
    throw new CanvasMediaPersistenceError(
      '核心参考图当前只有 IndexedDB 缩略图，已停止生成；请恢复原始图片后再提交给 AI。',
    );
  }

  let blob: Blob | undefined;
  let stableId: string | undefined;
  if (fallbackReference?.role === 'original') {
    stableId = fallbackReference.stableId;
    try {
      const verification = await verifyCanvasMediaFallback(stableId);
      if (!verification.ok) {
        throw new Error(`IndexedDB 原图校验失败（${verification.reason}）。`);
      }
      blob = (await loadCanvasMediaFallback(stableId)) ?? undefined;
    } catch (error) {
      throw new CanvasMediaPersistenceError(
        '无法读取 IndexedDB 中的核心参考原图，已停止提交给 AI。',
        error,
      );
    }
    if (!blob) {
      throw new CanvasMediaPersistenceError(
        'IndexedDB 中的核心参考原图已不存在，已停止生成；请重新选择原始图片。',
      );
    }
  } else if (source.startsWith('data:image/')) {
    blob = canvasMediaDataUrlToBlob(source);
    stableId = await createCanvasMediaStableId(blob);
  } else if (source.startsWith('data:')) {
    throw new CanvasMediaPersistenceError('核心参考媒体不是图片，已停止提交给 AI。');
  } else if (source.startsWith('blob:')) {
    throw new CanvasMediaPersistenceError(
      '核心参考图是未受管的临时 Blob 地址，刷新后不可恢复，已停止提交给 AI。',
    );
  } else if (source.startsWith('qiansi-canvas-media:')) {
    throw new CanvasMediaPersistenceError(
      '核心参考图的 IndexedDB 地址无效，已停止提交以避免图片错位。',
    );
  } else {
    if (isDerivedImagePreviewUrl(source)) {
      throw new CanvasMediaPersistenceError(
        '核心参考图当前只有缩略图，已停止生成；请恢复或重新选择原始图片。',
      );
    }
    return source;
  }

  assertAiOriginalBlob(blob);
  try {
    const item = await persistInVerifiedBridge(blob, stableId, projectId, signal);
    return item.originalUrl;
  } catch (error) {
    throw new CanvasMediaPersistenceError(
      '核心参考原图无法写入并回读本机素材库，已停止提交给 AI。',
      error,
    );
  }
}

/**
 * Resolve an explicitly declared video-poster image. Unlike core identity
 * references, a verified IndexedDB preview is valid in this poster-only path.
 */
export async function resolveCanvasPosterForAi(
  value: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<string> {
  const source = value.trim();
  if (!source) {
    throw new CanvasMediaPersistenceError('视频海报为空，已停止提交给 AI。');
  }

  const runtimeStableUrl = source.startsWith('blob:')
    ? stableCanvasMediaUrlForRuntime(source)
    : undefined;
  const managedSource = runtimeStableUrl ?? source;
  const fallbackReference = parseCanvasMediaFallbackReferenceUrl(managedSource);

  let blob: Blob | undefined;
  let stableId: string | undefined;
  if (fallbackReference) {
    stableId = fallbackReference.stableId;
    try {
      const verification = await verifyCanvasMediaFallback(stableId);
      if (!verification.ok) {
        throw new Error(`IndexedDB 海报校验失败（${verification.reason}）。`);
      }
      blob = (await loadCanvasMediaFallback(stableId)) ?? undefined;
    } catch (error) {
      throw new CanvasMediaPersistenceError(
        '无法读取或验证 IndexedDB 中的视频海报，已停止提交给 AI。',
        error,
      );
    }
    if (!blob) {
      throw new CanvasMediaPersistenceError(
        'IndexedDB 中的视频海报已不存在，已停止生成；请重新选择海报。',
      );
    }
  } else if (source.startsWith('data:image/')) {
    blob = canvasMediaDataUrlToBlob(source);
    stableId = await createCanvasMediaStableId(blob);
  } else if (source.startsWith('data:')) {
    throw new CanvasMediaPersistenceError('视频海报媒体不是图片，已停止提交给 AI。');
  } else if (source.startsWith('blob:')) {
    throw new CanvasMediaPersistenceError(
      '视频海报是未受管的临时 Blob 地址，刷新后不可恢复，已停止提交给 AI。',
    );
  } else if (source.startsWith('qiansi-canvas-media:')) {
    throw new CanvasMediaPersistenceError(
      '视频海报的 IndexedDB 地址无效，已停止提交以避免图片错位。',
    );
  } else {
    return source;
  }

  assertAiOriginalBlob(blob);
  try {
    const item = await persistInVerifiedBridge(blob, stableId, projectId, signal);
    return item.originalUrl;
  } catch (error) {
    throw new CanvasMediaPersistenceError(
      '视频海报无法写入并回读本机素材库，已停止提交给 AI。',
      error,
    );
  }
}
