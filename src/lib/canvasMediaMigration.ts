import { isDirectorNodeKind, type FlowNode, type NodeKind } from '../canvas/nodeTypes';
import { isPlaceholderMediaUrl } from '../canvas/placeholders';

const EMBEDDED_RASTER_IMAGE_DATA_URL_RE =
  /^data:image\/(?:png|jpe?g|webp|gif|avif|bmp)(?:;[^,]*)?,/iu;
const PREVIEW_FIELD_NAMES = new Set([
  'previewUrl',
  'imagePreviewPosterUrl',
  'thumbnail',
  'thumbnailUrl',
  'directorThumbnailUrl',
  'maskPreview',
]);

export interface CanvasImageMigrationResolution {
  originalUrl: string;
  previewUrl?: string;
  bridgeAssetId?: string;
  storage: 'bridge' | 'indexeddb';
}

export type CanvasImageMigrationResolver = (
  dataUrl: string,
) => Promise<CanvasImageMigrationResolution>;

export interface CanvasNodeMediaMigrationResult {
  nodes: FlowNode[];
  embeddedImageCount: number;
  uniqueImageCount: number;
  resolutions: ReadonlyMap<string, CanvasImageMigrationResolution>;
}

export interface CanvasMediaValueMigrationResult<T> {
  value: T;
  embeddedImageCount: number;
  uniqueImageCount: number;
  resolutions: ReadonlyMap<string, CanvasImageMigrationResolution>;
}

/**
 * The image-bearing subset shared by AssetItem and import/catalog records.
 * Keeping this structural avoids importing the store into the migration layer.
 */
export interface CanvasMediaAssetLike {
  originalUrl?: string;
  previewUrl?: string;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
  audioUrl?: string;
  bridgeAssetId?: string;
  kind?: string;
  category?: string;
}

export interface CanvasAssetMediaMigrationResult<T extends CanvasMediaAssetLike> {
  items: T[];
  embeddedImageCount: number;
  uniqueImageCount: number;
  resolutions: ReadonlyMap<string, CanvasImageMigrationResolution>;
}

export function isEmbeddedCanvasImage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    EMBEDDED_RASTER_IMAGE_DATA_URL_RE.test(value) &&
    !isPlaceholderMediaUrl(value)
  );
}

function collectEmbeddedImages(
  value: unknown,
  images: Set<string>,
  visited: WeakSet<object>,
): number {
  if (isEmbeddedCanvasImage(value)) {
    images.add(value);
    return 1;
  }
  if (!value || typeof value !== 'object') return 0;
  if (visited.has(value)) return 0;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + collectEmbeddedImages(item, images, visited), 0);
  }
  return Object.values(value).reduce(
    (count, item) => count + collectEmbeddedImages(item, images, visited),
    0,
  );
}

export function embeddedCanvasImageStats(value: unknown) {
  const images = new Set<string>();
  const occurrenceCount = collectEmbeddedImages(value, images, new WeakSet());
  return { occurrenceCount, uniqueImages: images };
}

function isPreviewField(path: readonly string[]) {
  const field = path.at(-1);
  return Boolean(field && PREVIEW_FIELD_NAMES.has(field));
}

function replaceEmbeddedImages(
  value: unknown,
  path: readonly string[],
  resolutions: ReadonlyMap<string, CanvasImageMigrationResolution>,
  visited: WeakMap<object, unknown>,
): unknown {
  if (isEmbeddedCanvasImage(value)) {
    const resolution = resolutions.get(value);
    if (!resolution) return value;
    return isPreviewField(path) && resolution.previewUrl
      ? resolution.previewUrl
      : resolution.originalUrl;
  }
  if (!value || typeof value !== 'object') return value;
  const existing = visited.get(value);
  if (existing) return existing;
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    visited.set(value, next);
    value.forEach((item, index) => {
      next.push(replaceEmbeddedImages(item, [...path, String(index)], resolutions, visited));
    });
    return next;
  }
  const next: Record<string, unknown> = {};
  visited.set(value, next);
  for (const [key, item] of Object.entries(value)) {
    next[key] = replaceEmbeddedImages(item, [...path, key], resolutions, visited);
  }
  return next;
}

function primaryEmbeddedImage(data: FlowNode['data']) {
  return [data.imageUrl, data.images?.[0], data.originalUrl].find(isEmbeddedCanvasImage);
}

function primaryEmbeddedAssetImage(asset: CanvasMediaAssetLike) {
  return [asset.imageUrl, asset.images?.[0], asset.originalUrl].find(isEmbeddedCanvasImage);
}

function isStillImageAsset(asset: CanvasMediaAssetLike) {
  if (asset.category === 'video' || asset.category === 'audio') return false;
  if (asset.kind === 'video' || asset.kind === 'video-comp' || asset.kind === 'audio') return false;
  return Boolean(asset.imageUrl || asset.images?.length || asset.originalUrl);
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

/**
 * Rewrites raster Data URLs in an arbitrary JSON-like value. Resolution is
 * completed before cloning/replacement, so a failed image leaves the caller's
 * original object untouched and no half-migrated value can be persisted.
 */
export async function migrateCanvasMediaValueEmbeddedImages<T>(
  value: T,
  resolveImage: CanvasImageMigrationResolver,
): Promise<CanvasMediaValueMigrationResult<T>> {
  const { occurrenceCount, uniqueImages } = embeddedCanvasImageStats(value);
  if (uniqueImages.size === 0) {
    return {
      value,
      embeddedImageCount: 0,
      uniqueImageCount: 0,
      resolutions: new Map(),
    };
  }

  // Large legacy canvases may contain dozens of multi-megabyte Data URLs. Resolving
  // all of them at once temporarily keeps every decoded Blob, digest buffer and
  // bridge verification response alive together, which can exhaust the renderer
  // before any safe snapshot is committed. Resolve serially instead: node/reference
  // ordering is still driven by the immutable replacement pass below, while peak
  // migration memory stays bounded to one source image.
  const resolutions = new Map<string, CanvasImageMigrationResolution>();
  for (const dataUrl of uniqueImages) {
    resolutions.set(dataUrl, await resolveImage(dataUrl));
  }
  const migrated = replaceEmbeddedImages(value, ['value'], resolutions, new WeakMap()) as T;

  if (embeddedCanvasImageStats(migrated).occurrenceCount > 0) {
    throw new Error('媒体迁移未覆盖全部 Base64 图片引用，已停止保存以避免产生半迁移数据。');
  }
  return {
    value: migrated,
    embeddedImageCount: occurrenceCount,
    uniqueImageCount: uniqueImages.size,
    resolutions,
  };
}

/**
 * Migrates AssetItem-compatible records without importing the store. Still-image
 * assets receive one authoritative original/preview pair; a migrated IndexedDB
 * original therefore clears any bridgeAssetId left by an older image revision.
 * Video/audio bridge identities are not changed when only their poster is migrated.
 */
export async function migrateCanvasAssetItemsEmbeddedImages<T extends CanvasMediaAssetLike>(
  items: readonly T[],
  resolveImage: CanvasImageMigrationResolver,
): Promise<CanvasAssetMediaMigrationResult<T>> {
  const migrated = await migrateCanvasMediaValueEmbeddedImages([...items], resolveImage);
  const normalizedItems = migrated.value.map((item, index) => {
    const source = items[index];
    if (!source || !isStillImageAsset(source)) return item;
    const primary = primaryEmbeddedAssetImage(source);
    const resolution = primary ? migrated.resolutions.get(primary) : undefined;
    if (!resolution) return item;
    return {
      ...item,
      originalUrl: resolution.originalUrl,
      imageUrl: resolution.originalUrl,
      images:
        source.images && source.images.length > 0
          ? [resolution.originalUrl, ...(item.images?.slice(1) ?? [])]
          : item.images,
      previewUrl: resolution.previewUrl,
      bridgeAssetId: resolution.bridgeAssetId,
    };
  });

  return {
    items: normalizedItems,
    embeddedImageCount: migrated.embeddedImageCount,
    uniqueImageCount: migrated.uniqueImageCount,
    resolutions: migrated.resolutions,
  };
}

/**
 * Rewrites only exact Data URL values and preserves every array/object position.
 * The resolver runs once per unique image, so copied nodes keep one underlying
 * asset while retaining their independent node/reference identities.
 */
export async function migrateCanvasNodesEmbeddedImages(
  nodes: readonly FlowNode[],
  resolveImage: CanvasImageMigrationResolver,
): Promise<CanvasNodeMediaMigrationResult> {
  const migrated = await migrateCanvasMediaValueEmbeddedImages([...nodes], resolveImage);
  const migratedNodes = migrated.value.map((node, index) => {
    const source = nodes[index];
    const primary = source ? primaryEmbeddedImage(source.data) : undefined;
    const primaryResolution = primary ? migrated.resolutions.get(primary) : undefined;
    const bridgeAssetId = primaryResolution?.bridgeAssetId;
    const previewUrl =
      primaryResolution?.previewUrl && !source?.data.previewUrl
        ? primaryResolution.previewUrl
        : undefined;
    const keepsCanonicalImageAliases = Boolean(
      primaryResolution &&
      source &&
      CANONICAL_IMAGE_NODE_KINDS.has(source.data.kind) &&
      !isDirectorNodeKind(source.data.kind),
    );
    const canonicalImages = keepsCanonicalImageAliases
      ? source?.data.images?.length
        ? [primaryResolution?.originalUrl ?? '', ...(node.data.images?.slice(1) ?? [])]
        : node.data.images
      : node.data.images;
    return primaryResolution || previewUrl
      ? {
          ...node,
          data: {
            ...node.data,
            // A migrated primary image starts a new immutable content revision.
            // Explicitly clear an old bridge id when the new revision lives in
            // IndexedDB, otherwise asset pickers can silently resolve the old image.
            bridgeAssetId,
            ...(keepsCanonicalImageAliases
              ? {
                  originalUrl: primaryResolution?.originalUrl,
                  imageUrl: primaryResolution?.originalUrl,
                  images: canonicalImages,
                  previewUrl: primaryResolution?.previewUrl,
                  ...(typeof source?.data.output === 'string'
                    ? { output: primaryResolution?.originalUrl }
                    : {}),
                }
              : previewUrl
                ? { previewUrl }
                : {}),
          },
        }
      : node;
  });

  return {
    nodes: migratedNodes,
    embeddedImageCount: migrated.embeddedImageCount,
    uniqueImageCount: migrated.uniqueImageCount,
    resolutions: migrated.resolutions,
  };
}

export function replaceExactCanvasMediaUrls(
  nodes: readonly FlowNode[],
  replacements: ReadonlyMap<string, string>,
): FlowNode[] {
  if (replacements.size === 0) return [...nodes];
  const replace = (value: unknown, visited: WeakMap<object, unknown>): unknown => {
    if (typeof value === 'string') return replacements.get(value) ?? value;
    if (!value || typeof value !== 'object') return value;
    const existing = visited.get(value);
    if (existing) return existing;
    if (Array.isArray(value)) {
      const next: unknown[] = [];
      visited.set(value, next);
      value.forEach((item) => next.push(replace(item, visited)));
      return next;
    }
    const next: Record<string, unknown> = {};
    visited.set(value, next);
    for (const [key, item] of Object.entries(value)) next[key] = replace(item, visited);
    return next;
  };
  return replace(nodes, new WeakMap()) as FlowNode[];
}

export function mapCanvasMediaValueStrings<T>(value: T, mapValue: (value: string) => string): T {
  const visit = (value: unknown, visited: WeakMap<object, unknown>): unknown => {
    if (typeof value === 'string') return mapValue(value);
    if (!value || typeof value !== 'object') return value;
    const existing = visited.get(value);
    if (existing) return existing;
    if (Array.isArray(value)) {
      const next: unknown[] = [];
      visited.set(value, next);
      value.forEach((item) => next.push(visit(item, visited)));
      return next;
    }
    const next: Record<string, unknown> = {};
    visited.set(value, next);
    for (const [key, item] of Object.entries(value)) next[key] = visit(item, visited);
    return next;
  };
  return visit(value, new WeakMap()) as T;
}

export function mapCanvasMediaStrings(
  nodes: readonly FlowNode[],
  mapValue: (value: string) => string,
): FlowNode[] {
  return mapCanvasMediaValueStrings([...nodes], mapValue);
}

export function collectCanvasMediaStrings(
  value: unknown,
  predicate: (value: string) => boolean,
): string[] {
  const matches = new Set<string>();
  const visited = new WeakSet<object>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      if (predicate(item)) matches.add(item);
      return;
    }
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    if (Array.isArray(item)) item.forEach(visit);
    else Object.values(item).forEach(visit);
  };
  visit(value);
  return [...matches];
}

/** Positions, selection and measurements cannot introduce a media reference. */
export function canvasNodeMediaDataChanged(previous: FlowNode[], current: FlowNode[]): boolean {
  if (previous === current) return false;
  if (previous.length !== current.length) return true;
  return current.some((node, index) => node.data !== previous[index]?.data);
}
