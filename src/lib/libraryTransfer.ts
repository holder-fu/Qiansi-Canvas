import {
  addPromptCustomCategory,
  normalizeCustomPromptModules,
  queuePromptLibrarySync,
  refreshPromptLibrary,
  saveCustomPrompt,
  type CustomPromptModule,
} from '../data/promptLibrary';
import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { uploadAssetFile } from '../services/assetLibrary';
import {
  persistImageFile,
  persistImagePreviewBlob,
  persistVideoFile,
} from '../services/mediaPersistence';
import { loadEffectVideo } from './libraryMedia';
import { blobToDataUrl, createImagePreviewBlob, resolveMediaSourceUrl } from './mediaPreview';
import {
  addUserLibraryCategory,
  addUserLibraryModelCategory,
  queueUserLibrariesSync,
  saveUserLibraryPreset,
  type UserLibraryKind,
} from './userLibrary';
import {
  normalizeCharacterAge,
  normalizeCharacterGender,
  normalizeCharacterNationality,
} from './characterMetadata';
import { inspectAnimatedWebp } from './effectWebp';

export type LibraryTransferKind = 'style' | 'effect' | 'character' | 'prompt';
export type LibraryTransferScope = 'selected' | 'all';

export interface LibraryTransferSourceItem {
  id: string;
  title: string;
  data: Record<string, unknown>;
}

export interface LibraryTransferPackage {
  format: 'qiansi-library';
  version: 1 | 2;
  library: LibraryTransferKind;
  exportedAt: string;
  scope: LibraryTransferScope;
  categories: string[];
  modelCategories: string[];
  items: Record<string, unknown>[];
  mediaLayout?: 'zip-v1';
}

export interface LibraryTransferArchive {
  blob: Blob;
  fileName: string;
  manifest: LibraryTransferPackage;
}

interface CreatePackageOptions {
  kind: LibraryTransferKind;
  scope: LibraryTransferScope;
  items: LibraryTransferSourceItem[];
  categories?: string[];
  modelCategories?: string[];
}

interface TransferDependencies {
  readMediaSource: (source: string) => Promise<string>;
  loadLegacyEffectVideo: (id: string) => Promise<Blob | null>;
  encodeBlob: (blob: Blob) => Promise<string>;
}

interface ArchiveTransferDependencies {
  readMediaBlob: (source: string) => Promise<Blob>;
  loadLegacyEffectVideo: (id: string) => Promise<Blob | null>;
}

const MEDIA_FIELDS = [
  'thumbnail',
  'originalImage',
  'previewUrl',
  'videoUrl',
  'thumbnailUrl',
] as const;
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
/** High enough for a complete library export while keeping malformed archives bounded. */
export const MAX_LIBRARY_ITEMS = 2000;
export const MAX_LIBRARY_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_LIBRARY_ARCHIVE_ENTRIES = 20_000;

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function assertLibraryItemCount(items: readonly unknown[]) {
  if (items.length > MAX_LIBRARY_ITEMS) {
    throw new Error(`资料库单次最多处理 ${MAX_LIBRARY_ITEMS} 条资料，请分批导入或导出。`);
  }
}

function safeArchiveSegment(value: string, fallback: string) {
  const printable = [...value.normalize('NFKC')]
    .map((character) => ((character.codePointAt(0) ?? 0) < 32 ? '-' : character))
    .join('');
  const normalized = printable
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 80);
  return normalized || fallback;
}

function uniqueNames(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function estimatedDataUrlBytes(source: string) {
  const comma = source.indexOf(',');
  if (comma < 0) return source.length;
  return Math.ceil((source.length - comma - 1) * 0.75);
}

export async function readLibraryMediaSource(source: string) {
  if (source.startsWith('data:')) {
    if (estimatedDataUrlBytes(source) > MAX_MEDIA_BYTES) {
      throw new Error('单个媒体文件超过 512 MB，无法打包。');
    }
    return source;
  }
  const response = await fetch(resolveMediaSourceUrl(source));
  if (!response.ok) throw new Error(`媒体读取失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (blob.size > MAX_MEDIA_BYTES) throw new Error('单个媒体文件超过 512 MB，无法打包。');
  return blobToDataUrl(blob);
}

export async function readLibraryMediaBlob(source: string) {
  const response = await fetch(resolveMediaSourceUrl(source));
  if (!response.ok) throw new Error(`媒体读取失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (blob.size > MAX_MEDIA_BYTES) throw new Error('单个媒体文件超过 512 MB，无法打包。');
  return blob;
}

async function embedMedia(
  item: LibraryTransferSourceItem,
  kind: LibraryTransferKind,
  dependencies: TransferDependencies,
) {
  const data = cloneRecord(item.data);
  data.id = item.id;

  for (const field of MEDIA_FIELDS) {
    const source = data[field];
    if (typeof source === 'string' && source.trim()) {
      data[field] = await dependencies.readMediaSource(source);
    }
  }

  const references = data.characterReferences;
  if (references && typeof references === 'object' && !Array.isArray(references)) {
    const embeddedReferences: Record<string, string> = {};
    for (const [referenceKind, source] of Object.entries(references)) {
      if (typeof source === 'string' && source.trim()) {
        embeddedReferences[referenceKind] = await dependencies.readMediaSource(source);
      }
    }
    data.characterReferences = embeddedReferences;
  }

  if (kind === 'effect' && data.user === true && typeof data.videoUrl !== 'string') {
    const legacyVideo = await dependencies.loadLegacyEffectVideo(item.id);
    if (legacyVideo) data.videoUrl = await dependencies.encodeBlob(legacyVideo);
  }

  return data;
}

export async function createLibraryTransferPackage(
  options: CreatePackageOptions,
  dependencies: Partial<TransferDependencies> = {},
): Promise<LibraryTransferPackage> {
  if (options.items.length === 0) throw new Error('没有可导出的资料。');
  assertLibraryItemCount(options.items);
  const mediaCache = new Map<string, Promise<string>>();
  const readMediaSource = dependencies.readMediaSource ?? readLibraryMediaSource;
  const resolvedDependencies: TransferDependencies = {
    readMediaSource: (source) => {
      const cached = mediaCache.get(source);
      if (cached) return cached;
      const pending = readMediaSource(source);
      mediaCache.set(source, pending);
      return pending;
    },
    loadLegacyEffectVideo: dependencies.loadLegacyEffectVideo ?? loadEffectVideo,
    encodeBlob: dependencies.encodeBlob ?? blobToDataUrl,
  };
  const items: Record<string, unknown>[] = [];
  for (const [index, item] of options.items.entries()) {
    if (index > 0 && index % 24 === 0) await yieldToEventLoop();
    items.push(await embedMedia(item, options.kind, resolvedDependencies));
  }
  return {
    format: 'qiansi-library',
    version: 1,
    library: options.kind,
    exportedAt: new Date().toISOString(),
    scope: options.scope,
    categories: uniqueNames(options.categories),
    modelCategories: uniqueNames(options.modelCategories),
    items,
  };
}

function extensionFromSource(source: string) {
  const withoutQuery = source.split(/[?#]/u, 1)[0] ?? '';
  const match = /\.([a-z0-9]{2,5})$/iu.exec(withoutQuery);
  return match?.[1]?.toLocaleLowerCase();
}

function archiveExtension(blob: Blob, source: string) {
  const mimeExtension = extensionForMime(blob.type);
  if (mimeExtension !== 'bin') return mimeExtension;
  return extensionFromSource(source) ?? 'bin';
}

function allocateArchivePath(
  usedPaths: Set<string>,
  folder: 'images' | 'videos' | 'character-references',
  baseName: string,
  extension: string,
) {
  const safeBase = safeArchiveSegment(baseName, 'media');
  let path = `${folder}/${safeBase}.${extension}`;
  let suffix = 2;
  while (usedPaths.has(path)) {
    path = `${folder}/${safeBase}-${suffix}.${extension}`;
    suffix += 1;
  }
  usedPaths.add(path);
  return path;
}

/** Build the portable ZIP used by all four libraries. Media stays as real
 * binary files while the manifest only stores relative archive paths. */
export async function createLibraryTransferArchive(
  options: CreatePackageOptions,
  dependencies: Partial<ArchiveTransferDependencies> = {},
): Promise<LibraryTransferArchive> {
  if (options.items.length === 0) throw new Error('没有可导出的资料。');
  assertLibraryItemCount(options.items);
  const resolvedDependencies: ArchiveTransferDependencies = {
    readMediaBlob: dependencies.readMediaBlob ?? readLibraryMediaBlob,
    loadLegacyEffectVideo: dependencies.loadLegacyEffectVideo ?? loadEffectVideo,
  };
  const archiveEntries: Record<string, Uint8Array> = {};
  const mediaCache = new Map<string, Promise<string>>();
  const usedPaths = new Set<string>(['manifest.json']);
  let expandedSize = 0;

  const addMedia = (
    source: string,
    folder: 'images' | 'videos' | 'character-references',
    baseName: string,
  ) => {
    const cacheKey = `${folder}\u0000${source}`;
    const cached = mediaCache.get(cacheKey);
    if (cached) return cached;
    const pending = (async () => {
      const blob = await resolvedDependencies.readMediaBlob(source);
      const path = allocateArchivePath(usedPaths, folder, baseName, archiveExtension(blob, source));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expandedSize += bytes.byteLength;
      if (expandedSize > MAX_LIBRARY_ARCHIVE_BYTES) {
        throw new Error('资料库 ZIP 解压后超过 2 GB，请分批导出。');
      }
      archiveEntries[path] = bytes;
      return path;
    })();
    mediaCache.set(cacheKey, pending);
    return pending;
  };

  const items: Record<string, unknown>[] = [];
  for (const [index, sourceItem] of options.items.entries()) {
    if (index > 0 && index % 24 === 0) await yieldToEventLoop();
    const item = cloneRecord(sourceItem.data);
    item.id = sourceItem.id;
    const itemName = safeArchiveSegment(
      `${sourceItem.id}-${sourceItem.title}`,
      safeArchiveSegment(sourceItem.id, 'item'),
    );

    for (const field of MEDIA_FIELDS) {
      const source = item[field];
      if (typeof source !== 'string' || !source.trim()) continue;
      const folder = field === 'videoUrl' ? 'videos' : 'images';
      item[field] = await addMedia(source, folder, `${itemName}-${field}`);
    }

    const references = item.characterReferences;
    if (references && typeof references === 'object' && !Array.isArray(references)) {
      const storedReferences: Record<string, string> = {};
      for (const [referenceKind, source] of Object.entries(references)) {
        if (typeof source !== 'string' || !source.trim()) continue;
        storedReferences[referenceKind] = await addMedia(
          source,
          'character-references',
          `${itemName}-${referenceKind}`,
        );
      }
      item.characterReferences = storedReferences;
    }

    if (options.kind === 'effect' && item.user === true && typeof item.videoUrl !== 'string') {
      const legacyVideo = await resolvedDependencies.loadLegacyEffectVideo(sourceItem.id);
      if (legacyVideo) {
        if (legacyVideo.size > MAX_MEDIA_BYTES) {
          throw new Error('单个媒体文件超过 512 MB，无法打包。');
        }
        const path = allocateArchivePath(
          usedPaths,
          'videos',
          `${itemName}-videoUrl`,
          archiveExtension(legacyVideo, 'legacy-video.mp4'),
        );
        const bytes = new Uint8Array(await legacyVideo.arrayBuffer());
        expandedSize += bytes.byteLength;
        if (expandedSize > MAX_LIBRARY_ARCHIVE_BYTES) {
          throw new Error('资料库 ZIP 解压后超过 2 GB，请分批导出。');
        }
        archiveEntries[path] = bytes;
        item.videoUrl = path;
      }
    }
    items.push(item);
  }

  const manifest: LibraryTransferPackage = {
    format: 'qiansi-library',
    version: 2,
    library: options.kind,
    exportedAt: new Date().toISOString(),
    scope: options.scope,
    categories: uniqueNames(options.categories),
    modelCategories: uniqueNames(options.modelCategories),
    items,
    mediaLayout: 'zip-v1',
  };
  archiveEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(archiveEntries, { level: 0 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
  if (zipped.byteLength > MAX_LIBRARY_ARCHIVE_BYTES) {
    throw new Error('资料库 ZIP 超过 2 GB，请分批导出。');
  }
  const date = manifest.exportedAt.slice(0, 10);
  return {
    blob: new Blob([zipped.slice().buffer], { type: 'application/zip' }),
    fileName: `qiansi-${options.kind}-library-${date}.zip`,
    manifest,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseLibraryTransferPackage(
  source: string,
  expectedKind: LibraryTransferKind,
): LibraryTransferPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('资料包不是有效的 JSON 文件。');
  }
  if (
    !isRecord(parsed) ||
    parsed.format !== 'qiansi-library' ||
    (parsed.version !== 1 && parsed.version !== 2) ||
    parsed.library !== expectedKind ||
    !Array.isArray(parsed.items)
  ) {
    throw new Error('资料包格式或资料库类型不匹配。');
  }
  const items = parsed.items.filter(isRecord);
  assertLibraryItemCount(items);
  if (
    items.length !== parsed.items.length ||
    items.some((item) => typeof item.id !== 'string' || !item.id.trim())
  ) {
    throw new Error('资料包内存在无效资料。');
  }
  return {
    format: 'qiansi-library',
    version: parsed.version,
    library: expectedKind,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    scope: parsed.scope === 'selected' ? 'selected' : 'all',
    categories: Array.isArray(parsed.categories)
      ? parsed.categories.filter((item): item is string => typeof item === 'string')
      : [],
    modelCategories: Array.isArray(parsed.modelCategories)
      ? parsed.modelCategories.filter((item): item is string => typeof item === 'string')
      : [],
    items,
    mediaLayout: parsed.mediaLayout === 'zip-v1' ? 'zip-v1' : undefined,
  };
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function dataUrlMime(dataUrl: string) {
  return /^data:([^;,]+)/u.exec(dataUrl)?.[1] || 'application/octet-stream';
}

function extensionForMime(mime: string) {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  if (mime.startsWith('video/')) return mime.slice(6) || 'mp4';
  if (mime.startsWith('image/')) return mime.slice(6) || 'png';
  return 'bin';
}

type ArchiveMediaFiles = ReadonlyMap<string, Uint8Array>;

function mimeForArchivePath(path: string) {
  const extension = extensionFromSource(path);
  if (extension === 'webp') return 'image/webp';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'mp4' || extension === 'm4v') return 'video/mp4';
  return 'application/octet-stream';
}

function archiveFileForSource(source: string, baseName: string, archiveMedia?: ArchiveMediaFiles) {
  const bytes = archiveMedia?.get(source);
  if (!bytes) return null;
  const mime = mimeForArchivePath(source);
  const extension = extensionFromSource(source) ?? extensionForMime(mime);
  return new File([bytes.slice().buffer], `${baseName}.${extension}`, { type: mime });
}

async function dataUrlToFile(dataUrl: string, baseName: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('资料包内的媒体数据无法读取。');
  const blob = await response.blob();
  const mime = dataUrlMime(dataUrl);
  return new File([blob], `${baseName}.${extensionForMime(mime)}`, { type: mime });
}

async function transferSourceToFile(
  source: string,
  baseName: string,
  archiveMedia?: ArchiveMediaFiles,
) {
  if (source.startsWith('data:')) return dataUrlToFile(source, baseName);
  const archived = archiveFileForSource(source, baseName, archiveMedia);
  if (archived) return archived;
  if (/^(?:images|videos|character-references)\//u.test(source)) {
    throw new Error(`资料包缺少媒体文件：${source}`);
  }
  return null;
}

async function persistEmbeddedPreview(source: string, archiveMedia?: ArchiveMediaFiles) {
  const file = await transferSourceToFile(source, 'library-preview', archiveMedia);
  if (!file) return { previewUrl: source, previewAssetId: undefined };
  const preview = await createImagePreviewBlob(file);
  return persistImagePreviewBlob(preview.blob);
}

async function persistEmbeddedAsset(
  source: string,
  name: string,
  projectId: string,
  archiveMedia?: ArchiveMediaFiles,
) {
  const file = await transferSourceToFile(source, name, archiveMedia);
  if (!file) return null;
  return uploadAssetFile(file, 'character', { project: projectId });
}

async function materializeCommonImages(
  data: Record<string, unknown>,
  projectId: string,
  archiveMedia?: ArchiveMediaFiles,
) {
  const next = cloneRecord(data);
  const thumbnail = stringValue(next.thumbnail);
  if (thumbnail) {
    const persistedThumbnail = await persistEmbeddedPreview(thumbnail, archiveMedia);
    next.thumbnail = persistedThumbnail.previewUrl;
    next.thumbnailAssetId = persistedThumbnail.previewAssetId;
  }

  const originalImage = stringValue(next.originalImage);
  if (originalImage) {
    const asset = await persistEmbeddedAsset(
      originalImage,
      `${stringValue(next.id, 'library')}-source`,
      projectId,
      archiveMedia,
    );
    if (asset) {
      next.originalImage = asset.url;
      next.bridgeAssetId = asset.id;
    }
  }
  return next;
}

async function materializeCharacter(
  data: Record<string, unknown>,
  projectId: string,
  archiveMedia?: ArchiveMediaFiles,
) {
  const next = await materializeCommonImages(data, projectId, archiveMedia);
  const references = next.characterReferences;
  if (references && typeof references === 'object' && !Array.isArray(references)) {
    const storedReferences: Record<string, string> = {};
    for (const [referenceKind, value] of Object.entries(references)) {
      if (typeof value !== 'string' || !value) continue;
      const asset = await persistEmbeddedAsset(
        value,
        `${stringValue(next.id, 'character')}-${referenceKind}`,
        projectId,
        archiveMedia,
      );
      storedReferences[referenceKind] = asset?.url ?? value;
    }
    next.characterReferences = storedReferences;
  }
  return next;
}

async function materializeEffect(
  data: Record<string, unknown>,
  projectId: string,
  archiveMedia?: ArchiveMediaFiles,
) {
  const next = cloneRecord(data);
  const effectWebp = stringValue(next.originalImage);
  if (effectWebp) {
    const file = await transferSourceToFile(
      effectWebp,
      `${stringValue(next.id, 'effect')}-animated-webp`,
      archiveMedia,
    );
    if (!file) return next;
    await inspectAnimatedWebp(file);
    const persisted = await persistImageFile(file, 'storyboard', projectId);
    next.originalImage = persisted.originalUrl;
    next.thumbnail = persisted.originalUrl;
    next.previewUrl = persisted.previewUrl;
    next.thumbnailAssetId = persisted.previewAssetId;
    next.mediaWidth = persisted.width;
    next.mediaHeight = persisted.height;
    next.bridgeAssetId = persisted.bridgeAssetId;
    delete next.videoUrl;
    delete next.durationSeconds;
    return next;
  }
  const videoUrl = stringValue(next.videoUrl);
  if (videoUrl) {
    const file = await transferSourceToFile(
      videoUrl,
      `${stringValue(next.id, 'effect')}-video`,
      archiveMedia,
    );
    if (!file) return next;
    const persisted = await persistVideoFile(file, projectId);
    next.videoUrl = persisted.originalUrl;
    next.previewUrl = persisted.previewUrl;
    next.thumbnail = persisted.previewUrl;
    next.thumbnailAssetId = persisted.previewAssetId;
    next.mediaWidth = persisted.width;
    next.mediaHeight = persisted.height;
    next.durationSeconds = persisted.durationSeconds;
    next.bridgeAssetId = persisted.bridgeAssetId;
    return next;
  }
  const preview = stringValue(next.previewUrl) || stringValue(next.thumbnail);
  if (preview) {
    const storedPreview = await persistEmbeddedPreview(preview, archiveMedia);
    next.previewUrl = storedPreview.previewUrl;
    next.thumbnail = storedPreview.previewUrl;
    next.thumbnailAssetId = storedPreview.previewAssetId;
  }
  return next;
}

async function materializePrompt(data: Record<string, unknown>, archiveMedia?: ArchiveMediaFiles) {
  const next = cloneRecord(data);
  const thumbnail = stringValue(next.thumbnailUrl);
  if (thumbnail) {
    const storedThumbnail = await persistEmbeddedPreview(thumbnail, archiveMedia);
    next.thumbnailUrl = storedThumbnail.previewUrl;
    next.thumbnailAssetId = storedThumbnail.previewAssetId;
    delete next.thumbnailFile;
  }
  return next;
}

function saveImportedUserPreset(
  kind: Exclude<LibraryTransferKind, 'prompt'>,
  data: Record<string, unknown>,
) {
  const category =
    kind === 'effect'
      ? stringValue(data.model) || stringValue(data.category, '未分类')
      : kind === 'character'
        ? stringValue(data.style) || stringValue(data.category, '未分类')
        : stringValue(data.category, '未分类');
  saveUserLibraryPreset(kind as UserLibraryKind, {
    id: stringValue(data.id),
    title: stringValue(data.title) || stringValue(data.name, '未命名资料'),
    category,
    author: stringValue(data.author) || undefined,
    uses: numberValue(data.uses),
    styleMediaKind:
      kind === 'style' && (data.kind === 'image' || data.kind === 'views' || data.kind === 'video')
        ? data.kind
        : undefined,
    viewCount:
      kind === 'character' && (data.viewCount === 3 || data.viewCount === 4 || data.viewCount === 6)
        ? data.viewCount
        : undefined,
    gender: kind === 'character' ? normalizeCharacterGender(data.gender) : undefined,
    age: kind === 'character' ? normalizeCharacterAge(data.age) : undefined,
    nationality: kind === 'character' ? normalizeCharacterNationality(data.nationality) : undefined,
    model: kind === 'style' ? stringValue(data.model) || undefined : undefined,
    prompt: stringValue(data.prompt),
    thumbnail: stringValue(data.thumbnail) || stringValue(data.previewUrl) || undefined,
    originalImage: stringValue(data.originalImage) || undefined,
    videoUrl: stringValue(data.videoUrl) || undefined,
    previewUrl: stringValue(data.previewUrl) || undefined,
    mediaWidth: numberValue(data.mediaWidth),
    mediaHeight: numberValue(data.mediaHeight),
    bridgeAssetId: stringValue(data.bridgeAssetId) || undefined,
    thumbnailAssetId: stringValue(data.thumbnailAssetId) || undefined,
    thumbnailCrop: isRecord(data.thumbnailCrop)
      ? {
          zoom: numberValue(data.thumbnailCrop.zoom) ?? 1,
          offsetX: numberValue(data.thumbnailCrop.offsetX) ?? 0,
          offsetY: numberValue(data.thumbnailCrop.offsetY) ?? 0,
        }
      : undefined,
    characterReferences: isRecord(data.characterReferences)
      ? Object.fromEntries(
          Object.entries(data.characterReferences).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
    durationSeconds: numberValue(data.durationSeconds) ?? numberValue(data.duration),
    commercial: typeof data.commercial === 'boolean' ? data.commercial : undefined,
    tags: stringArray(data.tags),
    createdAt: numberValue(data.createdAt),
  });
}

export async function importLibraryTransferPackage(
  transferPackage: LibraryTransferPackage,
  projectId: string,
  archiveMedia?: ArchiveMediaFiles,
) {
  assertLibraryItemCount(transferPackage.items);
  if (transferPackage.library === 'prompt') {
    transferPackage.categories.forEach(addPromptCustomCategory);
    for (const [index, data] of transferPackage.items.entries()) {
      if (index > 0 && index % 24 === 0) await yieldToEventLoop();
      const item = await materializePrompt(data, archiveMedia);
      saveCustomPrompt({
        id: stringValue(item.id),
        name: stringValue(item.name) || stringValue(item.title, '未命名提示词'),
        enName: stringValue(item.enName) || stringValue(item.name),
        category: stringValue(item.category, 'uncategorized'),
        target:
          item.target === 'image' || item.target === 'video' || item.target === 'both'
            ? item.target
            : 'both',
        description: stringValue(item.description),
        enDescription: stringValue(item.enDescription) || stringValue(item.description),
        prompt: stringValue(item.prompt),
        promptModules: isRecord(item.promptModules) ? item.promptModules : undefined,
        customPromptModules: normalizeCustomPromptModules(
          Array.isArray(item.customPromptModules)
            ? (item.customPromptModules as CustomPromptModule[])
            : undefined,
        ),
        negative: stringValue(item.negative) || undefined,
        color: stringValue(item.color) || undefined,
        tags: stringArray(item.tags),
        author: stringValue(item.author) || undefined,
        custom: true,
        source: isRecord(item.source) ? (item.source as never) : undefined,
        thumbnailFile: stringValue(item.thumbnailFile) || undefined,
        thumbnailUrl: stringValue(item.thumbnailUrl) || undefined,
        thumbnailAssetId: stringValue(item.thumbnailAssetId) || undefined,
      });
    }
    refreshPromptLibrary();
    await queuePromptLibrarySync();
    return transferPackage.items.length;
  }

  const kind = transferPackage.library;
  transferPackage.categories.forEach((category) => addUserLibraryCategory(kind, category));
  transferPackage.modelCategories.forEach((model) => addUserLibraryModelCategory(kind, model));
  for (const [index, rawItem] of transferPackage.items.entries()) {
    if (index > 0 && index % 24 === 0) await yieldToEventLoop();
    const item =
      kind === 'effect'
        ? await materializeEffect(rawItem, projectId, archiveMedia)
        : kind === 'character'
          ? await materializeCharacter(rawItem, projectId, archiveMedia)
          : await materializeCommonImages(rawItem, projectId, archiveMedia);
    saveImportedUserPreset(kind, item);
  }
  await queueUserLibrariesSync();
  return transferPackage.items.length;
}

export async function importLibraryTransferFile(
  file: File,
  expectedKind: LibraryTransferKind,
  projectId: string,
) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const transferPackage = parseLibraryTransferPackage(strFromU8(bytes), expectedKind);
    return importLibraryTransferPackage(transferPackage, projectId);
  }

  let expandedSize = 0;
  let archiveEntryCount = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(
        bytes,
        {
          filter: (entry) => {
            archiveEntryCount += 1;
            if (archiveEntryCount > MAX_LIBRARY_ARCHIVE_ENTRIES) {
              throw new Error('ZIP 资料条目过多，请分批导入。');
            }
            const safePath =
              entry.name === 'manifest.json' ||
              /^(?:images|videos|character-references)\/[^/]+$/u.test(entry.name);
            if (!safePath || entry.originalSize > MAX_MEDIA_BYTES) {
              throw new Error('ZIP 资料包含有无效路径或超大文件。');
            }
            expandedSize += entry.originalSize;
            if (expandedSize > MAX_LIBRARY_ARCHIVE_BYTES) {
              throw new Error('ZIP 资料包解压后超过 2 GB。');
            }
            return true;
          },
        },
        (error, data) => {
          if (error) reject(error);
          else resolve(data);
        },
      );
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'ZIP 资料包无法读取。');
  }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error('ZIP 资料包缺少 manifest.json。');
  const transferPackage = parseLibraryTransferPackage(strFromU8(manifestBytes), expectedKind);
  if (transferPackage.version !== 2 || transferPackage.mediaLayout !== 'zip-v1') {
    throw new Error('ZIP 资料包版本不受支持。');
  }
  const archiveMedia = new Map(
    Object.entries(entries).filter(([path]) => path !== 'manifest.json'),
  );
  return importLibraryTransferPackage(transferPackage, projectId, archiveMedia);
}

export function downloadLibraryTransferArchive(archive: LibraryTransferArchive) {
  const objectUrl = URL.createObjectURL(archive.blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = archive.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
