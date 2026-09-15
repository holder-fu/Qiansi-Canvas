import { resolveMediaDuration } from './mediaDuration';

const MAX_REFERENCE_FRAMES = 5;
const DEFAULT_MAX_EDGE = 1280;
const DEFAULT_JPEG_QUALITY = 0.82;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ExtractVideoFramesOptions {
  /** Requested total frame count. The extractor never returns more than five frames. */
  maxFrames?: number;
  maxEdge?: number;
  jpegQuality?: number;
  timeoutMs?: number;
}

/**
 * Return frame times at the centre of evenly divided video segments.
 * Invalid durations still produce a usable first-frame time, while invalid
 * requested counts deliberately produce no work.
 */
export function createUniformVideoFrameTimes(
  durationSeconds: number,
  requestedCount: number,
): number[] {
  if (!Number.isFinite(requestedCount) || requestedCount <= 0) return [];

  const count = Math.max(1, Math.floor(requestedCount));
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [0];

  return Array.from({ length: count }, (_, index) => (durationSeconds * (index + 0.5)) / count);
}

/**
 * Timeline thumbnails cover the whole media, including the first and final
 * readable frames. An unknown duration must not degrade into one repeated frame.
 */
export function createVideoTimelineFrameTimes(
  durationSeconds: number,
  requestedCount: number,
): number[] {
  if (!Number.isFinite(requestedCount) || requestedCount <= 0) return [];
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];

  const count = Math.max(1, Math.floor(requestedCount));
  if (count === 1) return [0];
  const lastReadableTime = Math.max(0, durationSeconds - Math.min(0.04, durationSeconds / 100));
  return Array.from({ length: count }, (_, index) => (lastReadableTime * index) / (count - 1));
}

/** Clamp a requested timeline frame against the duration already recovered for this media. */
export function clampVideoTimelineFrameTime(timeSeconds: number, resolvedDuration: number) {
  if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) return 0;
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  return Math.min(resolvedDuration, Math.max(0, time));
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

function waitForVideoReady(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => finish(new Error(`视频加载超时（${timeoutMs} 毫秒）。`)),
      timeoutMs,
    );
    const finish = (error?: Error) => {
      globalThis.clearTimeout(timeout);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish();
    };
    const handleError = () =>
      finish(new Error('浏览器无法加载该视频。', { cause: video.error ?? undefined }));

    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError, { once: true });
  });
}

function waitForPresentedVideoFrame(
  video: HTMLVideoElement,
  targetTime: number,
  timeoutMs: number,
): Promise<void> {
  if (typeof video.requestVideoFrameCallback !== 'function') {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  return new Promise((resolve) => {
    let finished = false;
    let callbackId = 0;
    const tolerance = 0.12;
    const timeout = globalThis.setTimeout(finish, Math.min(timeoutMs, 1_500));
    const requestNext = () => {
      if (finished) return;
      callbackId = video.requestVideoFrameCallback((_now, metadata) => {
        const mediaTime = Number(metadata.mediaTime);
        const currentTime = Number(video.currentTime);
        if (
          !video.seeking &&
          Number.isFinite(currentTime) &&
          Math.abs(currentTime - targetTime) <= tolerance &&
          (!Number.isFinite(mediaTime) || Math.abs(mediaTime - targetTime) <= tolerance)
        ) {
          finish();
          return;
        }
        requestNext();
      });
    };
    function finish() {
      if (finished) return;
      finished = true;
      globalThis.clearTimeout(timeout);
      if (callbackId && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(callbackId);
      }
      resolve();
    }
    requestNext();
  });
}

function seekVideo(
  video: HTMLVideoElement,
  timeSeconds: number,
  resolvedDuration: number,
  timeoutMs: number,
): Promise<void> {
  const target = clampVideoTimelineFrameTime(timeSeconds, resolvedDuration);
  if (
    !video.seeking &&
    Math.abs(video.currentTime - target) < 0.001 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const presentedFrame = waitForPresentedVideoFrame(video, target, timeoutMs);
    const timeout = globalThis.setTimeout(
      () => finish(new Error(`定位视频画面超时（${timeoutMs} 毫秒）。`)),
      timeoutMs,
    );
    const finish = (error?: Error) => {
      globalThis.clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleSeeked = () => {
      void presentedFrame.then(() => finish());
    };
    const handleError = () =>
      finish(new Error('浏览器无法定位到指定视频画面。', { cause: video.error ?? undefined }));

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = target;
  });
}

function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxEdge: number,
  jpegQuality: number,
): string {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) throw new Error('视频没有可读取的画面尺寸。');

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建视频抽帧画布。');

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', jpegQuality);
  } catch (cause) {
    throw new Error('视频画面读取失败，请确认视频地址同源或允许跨域访问。', { cause });
  }
}

function captureFrameBlob(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxEdge: number,
  jpegQuality: number,
): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) return Promise.reject(new Error('视频没有可读取的画面尺寸。'));
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('浏览器无法创建视频抽帧画布。'));
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch (cause) {
    return Promise.reject(
      new Error('视频画面读取失败，请确认视频地址同源或允许跨域访问。', { cause }),
    );
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器无法编码视频缩略图。'))),
      'image/jpeg',
      jpegQuality,
    );
  });
}

async function extractFramesFromUrl(
  url: string,
  count: number,
  options: Required<Omit<ExtractVideoFramesOptions, 'maxFrames'>>,
  createTimes: (duration: number, count: number) => number[] = createUniformVideoFrameTimes,
  resolvedDuration?: number,
): Promise<string[]> {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const ready = waitForVideoReady(video, options.timeoutMs);
    video.src = url;
    video.load();
    await ready;

    const duration =
      Number.isFinite(resolvedDuration) && Number(resolvedDuration) > 0
        ? Number(resolvedDuration)
        : await resolveMediaDuration(video, options.timeoutMs);
    const times = createTimes(duration, count);
    if (times.length === 0) throw new Error('视频时长尚未就绪，无法生成完整缩略图。');
    const frames: string[] = [];
    for (const time of times) {
      await seekVideo(video, time, duration, options.timeoutMs);
      frames.push(captureFrame(video, canvas, options.maxEdge, options.jpegQuality));
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  }
}

function distributeFrameCounts(sourceCount: number, maxFrames: number): number[] {
  const selectedCount = Math.min(sourceCount, maxFrames);
  if (selectedCount <= 0) return [];
  const base = Math.floor(maxFrames / selectedCount);
  const remainder = maxFrames % selectedCount;
  return Array.from({ length: selectedCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Extract up to five JPEG data URLs from one or more browser-readable videos.
 * Results preserve input-video order and chronological order within each video.
 */
export async function extractVideoFrames(
  videoUrls: string | readonly string[],
  options: ExtractVideoFramesOptions = {},
): Promise<string[]> {
  const urls = (typeof videoUrls === 'string' ? [videoUrls] : [...videoUrls]).filter(
    (url) => typeof url === 'string' && url.trim().length > 0,
  );
  if (urls.length === 0) return [];

  const maxFrames = Math.floor(
    clampNumber(options.maxFrames, MAX_REFERENCE_FRAMES, 1, MAX_REFERENCE_FRAMES),
  );
  const resolvedOptions = {
    maxEdge: Math.round(clampNumber(options.maxEdge, DEFAULT_MAX_EDGE, 1, 4096)),
    jpegQuality: clampNumber(options.jpegQuality, DEFAULT_JPEG_QUALITY, 0.1, 1),
    timeoutMs: Math.round(clampNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 120_000)),
  };
  const counts = distributeFrameCounts(urls.length, maxFrames);
  const frames: string[] = [];

  for (let index = 0; index < counts.length; index += 1) {
    const url = urls[index];
    const count = counts[index];
    if (!url || !count) break;
    try {
      frames.push(...(await extractFramesFromUrl(url, count, resolvedOptions)));
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`第 ${index + 1} 个视频抽帧失败：${detail}`, { cause });
    }
  }

  return frames.slice(0, maxFrames);
}

/** Convenience entry point used by video-to-prompt generation. */
export function extractVideoReferenceFrames(
  urls: readonly string[],
  maxFrames = MAX_REFERENCE_FRAMES,
): Promise<string[]> {
  return extractVideoFrames(urls, { maxFrames });
}

/** Extract a denser, lower-resolution strip for the local video trim timeline. */
export function extractVideoTimelineFrames(
  url: string,
  requestedCount = 10,
  resolvedDuration?: number,
): Promise<string[]> {
  const count = Math.min(30, Math.max(4, Math.floor(requestedCount)));
  return extractFramesFromUrl(
    url,
    count,
    {
      maxEdge: 320,
      jpegQuality: 0.68,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    createVideoTimelineFrameTimes,
    resolvedDuration,
  );
}

/** Blob-based timeline frames avoid retaining inflated Base64 strings in React state. */
export async function extractVideoTimelineFrameBlobs(
  url: string,
  requestedCount = 10,
): Promise<Blob[]> {
  const count = Math.min(16, Math.max(4, Math.floor(requestedCount)));
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const ready = waitForVideoReady(video, DEFAULT_TIMEOUT_MS);
    video.src = url;
    video.load();
    await ready;
    const duration = await resolveMediaDuration(video, DEFAULT_TIMEOUT_MS);
    const times = createVideoTimelineFrameTimes(duration, count);
    if (times.length === 0) throw new Error('视频时长尚未就绪，无法生成完整缩略图。');
    const frames: Blob[] = [];
    for (const time of times) {
      await seekVideo(video, time, duration, DEFAULT_TIMEOUT_MS);
      frames.push(await captureFrameBlob(video, canvas, 320, 0.68));
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  }
}
