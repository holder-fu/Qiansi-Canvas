import { bridgeResourcePathname, resolveBridgeUrl } from './bridgeUrl';

export const CANVAS_IMAGE_PREVIEW_WIDTH = 768;
export const CANVAS_VIDEO_POSTER_WIDTH = 960;

export interface VideoSourceFields {
  originalUrl?: string;
  videoUrl?: string;
  videos?: string[];
  videoPreviewUrl?: string;
  portInputs?: Record<string, unknown[] | undefined>;
}

export interface ImageSourceFields {
  originalUrl?: string;
  imageUrl?: string;
  images?: string[];
  imagePreviewUrl?: string;
  portInputs?: Record<string, unknown[] | undefined>;
}

export interface ImageEditorSourceFields extends ImageSourceFields {
  previewUrl?: string;
  imagePreviewPosterUrl?: string;
}

export interface AudioSourceFields {
  audioUrl?: string;
  audios?: string[];
  bridgeAssetId?: string;
  output?: unknown;
  /** Presentation text is localized by consumers; availability never depends on this field. */
  generationError?: unknown;
  audioSourceState?: 'unavailable-after-restore';
}

function durableAudioPath(bridgeAssetId: string | undefined) {
  if (!bridgeAssetId || !/^[A-Za-z0-9_-]{6,80}$/.test(bridgeAssetId)) return;
  return `/asset-library/files/${encodeURIComponent(bridgeAssetId)}`;
}

function audioSourceCandidates(data: AudioSourceFields) {
  return [
    data.audioUrl,
    ...(data.audios ?? []),
    typeof data.output === 'string' ? data.output : undefined,
  ].filter((source): source is string => typeof source === 'string' && source.length > 0);
}

function directAudioSource(data: AudioSourceFields) {
  return audioSourceCandidates(data)[0];
}

/** Prefer a node's generated/uploaded image over any renderer-only reference. */
export function preferredImageSource(data: ImageSourceFields) {
  return data.originalUrl || data.imageUrl || data.images?.[0];
}

/** Resolve the renderer source, including a reference inherited from an upstream image node. */
export function imagePreviewSource(data: ImageSourceFields) {
  const ownSource = preferredImageSource(data);
  if (ownSource) return ownSource;
  if (data.imagePreviewUrl) return data.imagePreviewUrl;
  return data.portInputs?.ref?.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}

/** Resolve persisted canvas media against the bridge serving the current page. */
export function resolveMediaSourceUrl(value: string) {
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
  try {
    return resolveBridgeUrl(value);
  } catch {
    return value;
  }
}

/** Prefer durable audio media and recover an expired session Blob from its bridge asset. */
export function preferredAudioSource(data: AudioSourceFields) {
  const candidates = audioSourceCandidates(data);
  const directSource = directAudioSource(data);
  if (directSource && !directSource.startsWith('blob:')) return directSource;
  const durableSource = durableAudioPath(data.bridgeAssetId);
  if (durableSource) {
    try {
      return resolveBridgeUrl(durableSource);
    } catch {
      // Fall back to a still-live session Blob when the bridge is unavailable.
    }
  }
  if (data.audioSourceState === 'unavailable-after-restore') {
    return candidates.find((source) => !source.startsWith('blob:'));
  }
  return directSource;
}

/** Resolve audio playback, download and propagation against the bridge serving this page. */
export function resolvedAudioSource(data: AudioSourceFields) {
  const source = preferredAudioSource(data);
  return source ? resolveMediaSourceUrl(source) : undefined;
}

/**
 * Reconcile browser-session Blob URLs only when data crosses a persistence/import boundary.
 * Raw expired references are retained for diagnostics and future recovery, but are no longer
 * exposed as playable media unless a new live-session upload clears the restore marker.
 */
export function recoverPersistedAudioSource<T extends AudioSourceFields>(data: T): T {
  const candidates = audioSourceCandidates(data);
  const hasSessionBlob = candidates.some((source) => source.startsWith('blob:'));
  const stableSource = candidates.find((source) => !source.startsWith('blob:'));
  if (!hasSessionBlob) {
    return data.audioSourceState === 'unavailable-after-restore' && stableSource
      ? { ...data, audioSourceState: undefined }
      : data;
  }

  const durableSource = durableAudioPath(data.bridgeAssetId);
  const recoveredSource = durableSource || stableSource;
  if (!recoveredSource) {
    return {
      ...data,
      audioSourceState: 'unavailable-after-restore',
    };
  }

  return {
    ...data,
    audioUrl: !data.audioUrl || data.audioUrl.startsWith('blob:') ? recoveredSource : data.audioUrl,
    audios: data.audios?.length
      ? data.audios.map((source) => (source.startsWith('blob:') ? recoveredSource : source))
      : [recoveredSource],
    output:
      typeof data.output !== 'string' || data.output.startsWith('blob:')
        ? recoveredSource
        : data.output,
    audioSourceState: undefined,
  };
}

export function recoverPersistedAudioNode<
  T extends { data: AudioSourceFields & { kind?: unknown } },
>(node: T): T {
  if (node.data.kind !== 'audio') return node;
  const data = recoverPersistedAudioSource(node.data);
  return data === node.data ? node : { ...node, data };
}

/**
 * Resolve full-quality image-editor sources first, followed by persisted renderer previews.
 * The fallback order lets old nodes with expired blob/imageUrl values still open successfully.
 */
export function imageEditorSourceCandidates(data: ImageEditorSourceFields) {
  const primary = imagePreviewSource(data);
  return [
    primary,
    data.previewUrl,
    data.imagePreviewPosterUrl,
    data.imagePreviewUrl,
    data.imageUrl,
    data.images?.[0],
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(resolveMediaSourceUrl)
    .filter((value, index, all) => all.indexOf(value) === index);
}

/** Keep alternate encodings of the first image as fallbacks instead of exposing them as pages. */
export function imageEditorSourcePages(data: ImageEditorSourceFields) {
  const firstPage = imageEditorSourceCandidates(data);
  const firstImageAliases = new Set(
    [data.originalUrl, data.imageUrl, data.images?.[0], data.imagePreviewUrl]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(resolveMediaSourceUrl),
  );
  const additionalPages = (data.images ?? [])
    .map(resolveMediaSourceUrl)
    .filter((value, index, all) => !firstImageAliases.has(value) && all.indexOf(value) === index)
    .map((value) => [value]);
  return firstPage.length > 0 ? [firstPage, ...additionalPages] : additionalPages;
}

/** Prefer explicit video fields over the compatibility-only original URL. */
export function preferredVideoSource(data: VideoSourceFields) {
  return data.videoUrl || data.videos?.[0] || data.originalUrl || data.videoPreviewUrl;
}

/** Resolve the renderer-only source, including an upstream source-video connection. */
export function videoPreviewSource(data: VideoSourceFields) {
  const ownSource = preferredVideoSource(data);
  if (ownSource) return ownSource;
  return data.portInputs?.['source-video']?.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}

function isBridgeMediaPath(pathname: string) {
  return (
    /^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/.test(pathname) ||
    /^\/output\/[A-Za-z0-9_.-]+$/.test(pathname)
  );
}

export function isBridgeMediaUrl(value: string | undefined) {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return false;
  const pathname = bridgeResourcePathname(value);
  return pathname ? isBridgeMediaPath(pathname) : false;
}

export function isDerivedBridgePreviewUrl(
  previewUrl: string | undefined,
  originalUrl: string | undefined,
) {
  if (!previewUrl || !originalUrl) return false;
  try {
    const preview = new URL(resolveBridgeUrl(previewUrl));
    const original = new URL(resolveBridgeUrl(originalUrl));
    return preview.pathname === original.pathname && preview.searchParams.has('preview');
  } catch {
    return false;
  }
}

/**
 * Returns a stable bridge-backed preview URL. Unsupported remote/data/blob URLs
 * are intentionally left unchanged so third-party query contracts are never guessed.
 */
export function mediaPreviewUrl(
  originalUrl: string | undefined,
  kind: 'image' | 'video',
): string | undefined {
  if (!originalUrl) return originalUrl;
  if (kind === 'video' && (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:'))) {
    return undefined;
  }
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }
  try {
    const url = new URL(resolveMediaSourceUrl(originalUrl));
    const pathname = bridgeResourcePathname(url.toString());
    if (!pathname || !isBridgeMediaPath(pathname)) return url.toString();
    url.searchParams.set('preview', kind === 'video' ? 'poster' : 'image');
    url.searchParams.set(
      'w',
      String(kind === 'video' ? CANVAS_VIDEO_POSTER_WIDTH : CANVAS_IMAGE_PREVIEW_WIDTH),
    );
    return url.toString();
  } catch {
    return originalUrl;
  }
}

export async function readImageFileMetadata(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality = 0.78) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器无法生成 WebP 预览。'))),
      'image/webp',
      quality,
    );
  });
}

export async function createImagePreviewBlob(file: Blob) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, CANVAS_IMAGE_PREVIEW_WIDTH / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建图片预览画布。');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      blob: await canvasToWebpBlob(canvas),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function createImagePreviewFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片预览读取失败（HTTP ${response.status}）。`);
  return createImagePreviewBlob(await response.blob());
}

export async function createVideoPosterBlob(file: Blob) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await createVideoPosterFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function videoPosterCaptureTime(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0.15) return 0;
  return Math.min(1, Math.max(0.1, durationSeconds * 0.1));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('媒体预览读取失败。'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

export async function createVideoPosterFromUrl(url: string) {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('视频海报生成超时。')), 15000);
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onReady = () => finish();
      const onError = () => finish(new Error('浏览器无法读取视频首帧。'));
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.src = url;
      video.load();
    });
    const captureTime = videoPosterCaptureTime(video.duration);
    if (captureTime > 0) {
      await new Promise<void>((resolve) => {
        let timeout = 0;
        const finish = () => {
          window.clearTimeout(timeout);
          video.removeEventListener('seeked', finish);
          video.removeEventListener('error', finish);
          resolve();
        };
        timeout = window.setTimeout(finish, 5000);
        video.addEventListener('seeked', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
        try {
          video.currentTime = captureTime;
        } catch {
          finish();
        }
      });
    }
    const scale = Math.min(
      1,
      CANVAS_VIDEO_POSTER_WIDTH / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建视频海报画布。');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      blob: await canvasToWebpBlob(canvas, 0.76),
      width: video.videoWidth,
      height: video.videoHeight,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  }
}
