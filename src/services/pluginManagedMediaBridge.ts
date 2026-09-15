import type { sanitizePluginProjectGraphRequest } from './pluginSandbox';
import { createImagePreviewBlob } from '../lib/mediaPreview';
import type { VideoAudioTrackStatus } from './ai';

type PluginProjectGraphRequest = ReturnType<typeof sanitizePluginProjectGraphRequest>;

export type PluginManagedMediaRecord = {
  mediaId: string;
  kind: 'image' | 'video';
  url: string;
  providerId: string;
  model: string;
  audioRequested?: boolean;
  audioTrackStatus?: VideoAudioTrackStatus;
  pluginId: string;
  sessionId: string;
  previewPromise?: Promise<Blob>;
  released?: boolean;
};

export type PluginManagedMediaPreviewPayload = {
  mediaId: string;
  kind: 'image';
  preview: Blob;
};

export type PluginManagedCanvasImageCopyPayload = {
  mediaId: string;
  kind: 'image';
  image: Blob;
};

const MAX_MANAGED_IMAGE_PREVIEW_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_MANAGED_IMAGE_PREVIEW_BYTES = 4 * 1024 * 1024;
const MAX_MANAGED_VIDEO_FRAME_BYTES = 12 * 1024 * 1024;
const MAX_MANAGED_VIDEO_FRAME_DIMENSION = 1_920;
const MANAGED_VIDEO_FRAME_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MANAGED_IMAGE_PREVIEW_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

async function managedImageBlobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return `data:${blob.type};base64,${btoa(chunks.join(''))}`;
}

export function managedGenerationRequestId(sessionId: string, requestId?: string) {
  return `pm-${sessionId}-${requestId || crypto.randomUUID()}`;
}

export function managedMediaRecord(
  registry: Map<string, PluginManagedMediaRecord>,
  mediaId: string,
  pluginId: string,
  sessionId: string,
) {
  const record = registry.get(mediaId);
  if (!record || record.pluginId !== pluginId || record.sessionId !== sessionId) {
    throw new Error('受管媒体不存在或不属于当前插件会话。');
  }
  return record;
}

export function resolveManagedImageReferences(
  registry: Map<string, PluginManagedMediaRecord>,
  mediaIds: readonly string[],
  pluginId: string,
  sessionId: string,
): string[] {
  if (mediaIds.length > 16 || new Set(mediaIds).size !== mediaIds.length) {
    throw new Error('图片模型参考媒体不能超过 16 项或包含重复项。');
  }
  return mediaIds.map((mediaId) => {
    const record = managedMediaRecord(registry, mediaId, pluginId, sessionId);
    if (record.kind !== 'image' || record.released) {
      throw new Error('图片模型参考媒体必须是当前插件会话内有效的图片。');
    }
    return record.url;
  });
}

function hostGeneratedMediaUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('画布模型返回的媒体地址无效。');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    value.length > 8_192
  ) {
    throw new Error('画布模型返回的媒体地址不受宿主管理。');
  }
  return url.toString();
}

export async function readManagedImagePreviewSource(
  sourceUrl: string,
  fetchSource: typeof fetch = fetch,
) {
  const response = await fetchSource(sourceUrl, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error(`图片预览读取失败（HTTP ${response.status}）。`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MANAGED_IMAGE_PREVIEW_SOURCE_BYTES) {
    throw new Error('图片预览源超过 32 MiB 上限。');
  }
  const source = await response.blob();
  if (source.size > MAX_MANAGED_IMAGE_PREVIEW_SOURCE_BYTES) {
    throw new Error('图片预览源超过 32 MiB 上限。');
  }
  if (!MANAGED_IMAGE_PREVIEW_MIME_TYPES.has(source.type.toLowerCase())) {
    throw new Error('图片预览源格式不受支持。');
  }
  return source;
}

async function createManagedImagePreviewBlob(sourceUrl: string) {
  return (await createImagePreviewBlob(await readManagedImagePreviewSource(sourceUrl))).blob;
}

function releaseManagedMediaRecord(record: PluginManagedMediaRecord) {
  record.released = true;
  record.previewPromise = undefined;
}

function storeManagedMediaRecord(
  registry: Map<string, PluginManagedMediaRecord>,
  record: PluginManagedMediaRecord,
) {
  registry.set(record.mediaId, record);
  while (registry.size > 256) {
    const oldestId = registry.keys().next().value as string | undefined;
    if (!oldestId) break;
    const oldest = registry.get(oldestId);
    if (oldest) releaseManagedMediaRecord(oldest);
    registry.delete(oldestId);
  }
}

export function releaseManagedMediaRegistry(registry: Map<string, PluginManagedMediaRecord>) {
  for (const record of registry.values()) releaseManagedMediaRecord(record);
  registry.clear();
}

export async function previewManagedMedia(
  record: PluginManagedMediaRecord,
  createPreviewBlob: (sourceUrl: string) => Promise<Blob> = createManagedImagePreviewBlob,
): Promise<PluginManagedMediaPreviewPayload> {
  if (record.kind !== 'image') throw new Error('当前仅支持受管图片预览。');
  if (record.released) throw new Error('受管媒体预览已随当前插件会话释放。');
  if (!record.previewPromise) {
    record.previewPromise = (async () => {
      const previewBlob = await createPreviewBlob(record.url);
      if (record.released) throw new Error('受管媒体预览已随当前插件会话释放。');
      if (
        previewBlob.type !== 'image/webp' ||
        previewBlob.size < 1 ||
        previewBlob.size > MAX_MANAGED_IMAGE_PREVIEW_BYTES
      ) {
        throw new Error('宿主生成的图片缩略图无效。');
      }
      return previewBlob;
    })().catch((error) => {
      record.previewPromise = undefined;
      throw error;
    });
  }
  return {
    mediaId: record.mediaId,
    kind: 'image',
    preview: await record.previewPromise,
  };
}

/**
 * Return the user-selected Canvas image bytes, not the 768 px UI preview.
 * This is intentionally limited to Canvas-selection handles; generated-provider
 * media continues to expose only its bounded preview and opaque session handle.
 */
export async function readManagedCanvasImageCopy(
  record: PluginManagedMediaRecord,
  readSource: (sourceUrl: string) => Promise<Blob> = readManagedImagePreviewSource,
): Promise<PluginManagedCanvasImageCopyPayload> {
  if (
    record.kind !== 'image' ||
    record.providerId !== 'qiansi-canvas' ||
    record.model !== 'canvas-image-selection'
  ) {
    throw new Error('当前媒体不是用户从画布选择的图片。');
  }
  if (record.released) throw new Error('画布图片副本已随当前插件会话释放。');
  const image = await readSource(record.url);
  if (record.released) throw new Error('画布图片副本已随当前插件会话释放。');
  if (image.size < 1 || !MANAGED_IMAGE_PREVIEW_MIME_TYPES.has(image.type.toLowerCase())) {
    throw new Error('宿主读取的画布原图无效。');
  }
  return {
    mediaId: record.mediaId,
    kind: 'image',
    image,
  };
}

export function registerManagedMedia(
  registry: Map<string, PluginManagedMediaRecord>,
  scope: { pluginId: string; sessionId: string },
  result: {
    kind: 'image' | 'video';
    url: string;
    providerId: string;
    model: string;
    audioRequested?: boolean;
    audioTrackStatus?: VideoAudioTrackStatus;
  },
) {
  const mediaId = `media-${crypto.randomUUID()}`;
  const record: PluginManagedMediaRecord = {
    mediaId,
    ...result,
    url: hostGeneratedMediaUrl(result.url),
    ...scope,
  };
  storeManagedMediaRecord(registry, record);
  return {
    mediaId,
    kind: result.kind,
    providerId: result.providerId,
    model: result.model,
    ...(result.kind === 'video'
      ? {
          audioRequested: record.audioRequested === true,
          audioTrackStatus: record.audioTrackStatus ?? 'unverified',
        }
      : {}),
  };
}

export async function createManagedVideoFrameBlob(
  sourceUrl: string,
  position: 'first' | 'last',
): Promise<{ blob: Blob; width: number; height: number }> {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const waitFor = (eventName: 'loadeddata' | 'seeked', timeoutMs: number, errorMessage: string) =>
    new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error(errorMessage)), timeoutMs);
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        video.removeEventListener(eventName, onReady);
        video.removeEventListener('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onReady = () => finish();
      const onError = () => finish(new Error(errorMessage));
      video.addEventListener(eventName, onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  try {
    const loaded = waitFor('loadeddata', 20_000, '浏览器无法读取受管视频。');
    video.src = sourceUrl;
    video.load();
    await loaded;
    if (!video.videoWidth || !video.videoHeight) throw new Error('受管视频没有可截取的画面尺寸。');
    if (position === 'last') {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error('受管视频缺少有效时长，无法定位最后一帧。');
      }
      const seeked = waitFor('seeked', 10_000, '受管视频最后一帧定位失败。');
      video.currentTime = Math.max(0, video.duration - 0.05);
      await seeked;
    }
    const scale = Math.min(
      1,
      MAX_MANAGED_VIDEO_FRAME_DIMENSION / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建视频帧画布。');
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      throw new Error('受管视频禁止跨域像素读取，无法截取最后一帧。');
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('视频帧编码失败。'))),
        'image/jpeg',
        0.92,
      );
    });
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function captureManagedVideoFrame(
  registry: Map<string, PluginManagedMediaRecord>,
  scope: { pluginId: string; sessionId: string },
  request: { mediaId: string; position: 'first' | 'last' },
  captureFrame: typeof createManagedVideoFrameBlob = createManagedVideoFrameBlob,
) {
  const source = managedMediaRecord(registry, request.mediaId, scope.pluginId, scope.sessionId);
  if (source.kind !== 'video') throw new Error('视频帧截取来源必须是当前插件会话的受管视频。');
  if (source.released) throw new Error('受管视频已随当前插件会话释放。');
  const frame = await captureFrame(source.url, request.position);
  const mimeType = frame.blob.type.toLowerCase();
  if (
    frame.blob.size < 1 ||
    frame.blob.size > MAX_MANAGED_VIDEO_FRAME_BYTES ||
    !MANAGED_VIDEO_FRAME_MIME_TYPES.has(mimeType) ||
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    frame.width > MAX_MANAGED_VIDEO_FRAME_DIMENSION ||
    frame.height > MAX_MANAGED_VIDEO_FRAME_DIMENSION
  ) {
    throw new Error('宿主截取的视频帧无效或超过限制。');
  }
  const dataUrl = await managedImageBlobToDataUrl(frame.blob);
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) throw new Error('宿主视频帧编码结果无效。');
  const mediaId = `media-${crypto.randomUUID()}`;
  const record: PluginManagedMediaRecord = {
    mediaId,
    kind: 'image',
    url: dataUrl,
    providerId: 'qiansi-canvas',
    model: `managed-video-${request.position}-frame`,
    ...scope,
  };
  storeManagedMediaRecord(registry, record);
  return {
    mediaId,
    kind: 'image' as const,
    providerId: record.providerId,
    model: record.model,
    position: request.position,
    width: frame.width,
    height: frame.height,
  };
}

function selectedCanvasImageUrl(value: string) {
  const source = value.trim();
  if (!source) throw new Error('选中的图片节点还没有可用图片。');
  if (source.startsWith('data:image/')) {
    if (source.length > 48 * 1024 * 1024) throw new Error('选中的画布图片超过会话读取上限。');
    return source;
  }
  if (source.startsWith('blob:')) {
    if (source.length > 8_192) throw new Error('选中的画布图片地址无效。');
    return source;
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error('选中的画布图片地址无效。');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    source.length > 8_192
  ) {
    throw new Error('选中的画布图片地址不受宿主管理。');
  }
  return url.toString();
}

export async function registerManagedCanvasImage(
  registry: Map<string, PluginManagedMediaRecord>,
  scope: { pluginId: string; sessionId: string },
  selection: { url: string; title?: string },
  dependencies: {
    readSource?: (sourceUrl: string) => Promise<Blob>;
    createPreview?: typeof createImagePreviewBlob;
  } = {},
) {
  const sourceUrl = selectedCanvasImageUrl(selection.url);
  const source = await (dependencies.readSource ?? readManagedImagePreviewSource)(sourceUrl);
  if (source.size < 1) throw new Error('选中的画布图片内容为空。');
  const preview = await (dependencies.createPreview ?? createImagePreviewBlob)(source);
  const mediaId = `media-${crypto.randomUUID()}`;
  const record: PluginManagedMediaRecord = {
    mediaId,
    kind: 'image',
    url: sourceUrl,
    providerId: 'qiansi-canvas',
    model: 'canvas-image-selection',
    previewPromise: Promise.resolve(preview.blob),
    ...scope,
  };
  storeManagedMediaRecord(registry, record);
  return {
    mediaId,
    kind: 'image' as const,
    providerId: record.providerId,
    model: record.model,
    title: String(selection.title || '')
      .trim()
      .slice(0, 180),
  };
}

export function resolveManagedProjectGraphMedia(
  request: PluginProjectGraphRequest,
  registry: Map<string, PluginManagedMediaRecord>,
  pluginId: string,
  sessionId: string,
): PluginProjectGraphRequest {
  return {
    ...request,
    nodes: request.nodes.map((node) => {
      const mediaId = typeof node.data.mediaId === 'string' ? node.data.mediaId : undefined;
      if (!mediaId) return node;
      const record = managedMediaRecord(registry, mediaId, pluginId, sessionId);
      if (record.kind !== node.kind) {
        throw new Error(`节点 ${node.clientId} 的受管媒体类型与节点类型不匹配。`);
      }
      const { mediaId: _mediaId, ...data } = node.data;
      return {
        ...node,
        data:
          record.kind === 'image'
            ? { ...data, imageUrl: record.url, images: [record.url], output: record.url }
            : { ...data, videoUrl: record.url, videos: [record.url], output: record.url },
      };
    }),
  };
}
