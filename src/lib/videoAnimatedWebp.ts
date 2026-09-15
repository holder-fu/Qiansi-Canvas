import { resolveMediaDuration } from './mediaDuration';
import { normalizeVideoTrimRange, type VideoTrimRange } from './videoTrim';

const DEFAULT_FPS = 8;
const DEFAULT_MAX_EDGE = 540;
const DEFAULT_SCALE_PERCENT = 100;
const DEFAULT_QUALITY = 0.8;
const MAX_FRAME_COUNT = 180;
const MAX_TIMEOUT_MS = 15_000;

export type AnimatedWebpOptions = {
  range: VideoTrimRange;
  fps?: number;
  maxEdge?: number;
  scalePercent?: number;
  quality?: number;
  /** Reuse the node player to avoid opening a second hardware decoder for the same video. */
  videoElement?: HTMLVideoElement;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type AnimatedWebpResult = {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  frameCount: number;
  fps: number;
};

export function resolveAnimatedWebpDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge = DEFAULT_MAX_EDGE,
  scalePercent = DEFAULT_SCALE_PERCENT,
) {
  const safeSourceWidth = Math.max(1, Math.round(sourceWidth));
  const safeSourceHeight = Math.max(1, Math.round(sourceHeight));
  const safeMaxEdge = Math.round(clamp(maxEdge, DEFAULT_MAX_EDGE, 240, 960));
  const safeScalePercent = clamp(scalePercent, DEFAULT_SCALE_PERCENT, 10, 100);
  const fitScale = Math.min(1, safeMaxEdge / Math.max(safeSourceWidth, safeSourceHeight));
  const outputScale = fitScale * (safeScalePercent / 100);
  return {
    width: Math.max(1, Math.round(safeSourceWidth * outputScale)),
    height: Math.max(1, Math.round(safeSourceHeight * outputScale)),
    scalePercent: safeScalePercent,
  };
}

function abortError() {
  return new DOMException('动态图生成已取消。', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function clamp(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? Number(value) : fallback));
}

export function createAnimatedWebpFrameTimes(
  range: VideoTrimRange,
  fps = DEFAULT_FPS,
  maxFrames = MAX_FRAME_COUNT,
) {
  const duration = Math.max(0, range.end - range.start);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const safeFps = clamp(fps, DEFAULT_FPS, 2, 15);
  const frameCount = Math.max(2, Math.min(maxFrames, Math.ceil(duration * safeFps)));
  const frameDuration = duration / frameCount;
  return Array.from({ length: frameCount }, (_, index) =>
    Math.min(range.end - 0.001, range.start + index * frameDuration),
  );
}

function fourCc(value: string) {
  return new TextEncoder().encode(value);
}

function setUint24(view: DataView, offset: number, value: number) {
  const safe = Math.max(0, Math.min(0xffffff, Math.round(value)));
  view.setUint8(offset, safe & 0xff);
  view.setUint8(offset + 1, (safe >>> 8) & 0xff);
  view.setUint8(offset + 2, (safe >>> 16) & 0xff);
}

function webpChunk(name: string, payload: Uint8Array) {
  const chunk = new Uint8Array(8 + payload.byteLength + (payload.byteLength % 2));
  chunk.set(fourCc(name), 0);
  new DataView(chunk.buffer).setUint32(4, payload.byteLength, true);
  chunk.set(payload, 8);
  return chunk;
}

function readFourCc(bytes: Uint8Array, offset: number) {
  return new TextDecoder('ascii').decode(bytes.subarray(offset, offset + 4));
}

function extractFrameChunks(frame: Uint8Array) {
  if (frame.byteLength < 20 || readFourCc(frame, 0) !== 'RIFF' || readFourCc(frame, 8) !== 'WEBP') {
    throw new Error('浏览器没有生成有效的 WebP 帧。');
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= frame.byteLength) {
    const name = readFourCc(frame, offset);
    const length = view.getUint32(offset + 4, true);
    const paddedLength = length + (length % 2);
    const nextOffset = offset + 8 + paddedLength;
    if (nextOffset > frame.byteLength) throw new Error('WebP 帧结构已损坏。');
    if (name === 'ALPH' || name === 'VP8 ' || name === 'VP8L') {
      chunks.push(frame.slice(offset, nextOffset));
    }
    offset = nextOffset;
  }
  if (!chunks.some((chunk) => ['VP8 ', 'VP8L'].includes(readFourCc(chunk, 0)))) {
    throw new Error('WebP 帧缺少可用的图像数据。');
  }
  return chunks;
}

/** Package browser-encoded static WebP frames into one standards-compliant animated WebP. */
export function muxAnimatedWebpFrames(
  encodedFrames: readonly Uint8Array[],
  width: number,
  height: number,
  frameDurationMs: number,
) {
  if (encodedFrames.length < 2) throw new Error('生成动态图至少需要两个有效画面。');
  const safeWidth = Math.max(1, Math.min(0x1000000, Math.round(width)));
  const safeHeight = Math.max(1, Math.min(0x1000000, Math.round(height)));
  const safeDuration = Math.max(10, Math.min(0xffffff, Math.round(frameDurationMs)));

  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02; // Animation flag.
  const vp8xView = new DataView(vp8x.buffer);
  setUint24(vp8xView, 4, safeWidth - 1);
  setUint24(vp8xView, 7, safeHeight - 1);

  const animationHeader = new Uint8Array(6); // Transparent background, infinite loop.
  const chunks = [webpChunk('VP8X', vp8x), webpChunk('ANIM', animationHeader)];
  for (const frame of encodedFrames) {
    const frameChunks = extractFrameChunks(frame);
    const payloadLength = 16 + frameChunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const payload = new Uint8Array(payloadLength);
    const view = new DataView(payload.buffer);
    setUint24(view, 0, 0);
    setUint24(view, 3, 0);
    setUint24(view, 6, safeWidth - 1);
    setUint24(view, 9, safeHeight - 1);
    setUint24(view, 12, safeDuration);
    view.setUint8(15, 0x02); // Replace the full canvas instead of blending old pixels.
    let offset = 16;
    for (const chunk of frameChunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
    chunks.push(webpChunk('ANMF', payload));
  }

  const payloadLength = 4 + chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const file = new Uint8Array(8 + payloadLength);
  file.set(fourCc('RIFF'), 0);
  new DataView(file.buffer).setUint32(4, payloadLength, true);
  file.set(fourCc('WEBP'), 8);
  let offset = 12;
  for (const chunk of chunks) {
    file.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([file], { type: 'image/webp' });
}

function waitForVideoReady(video: HTMLVideoElement, signal?: AbortSignal) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => finish(new Error('读取视频画面超时。')),
      MAX_TIMEOUT_MS,
    );
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
      if (error) reject(error);
      else resolve();
    };
    const handleReady = () => finish();
    const handleError = () => finish(new Error('浏览器无法读取待转换的视频。'));
    const handleAbort = () => finish(abortError());
    video.addEventListener('loadeddata', handleReady, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function seekVideoFrame(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
  if (
    !video.seeking &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Math.abs(video.currentTime - time) < 0.002
  ) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => finish(new Error('定位视频画面超时。')),
      MAX_TIMEOUT_MS,
    );
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
      if (error) reject(error);
      else resolve();
    };
    const handleSeeked = () => finish();
    const handleError = () => finish(new Error('浏览器无法定位视频画面。'));
    const handleAbort = () => finish(abortError());
    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
    video.currentTime = time;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob?.type === 'image/webp'
          ? resolve(blob)
          : reject(new Error('当前浏览器不支持 WebP 编码，请使用最新版 Chrome 或 Edge。')),
      'image/webp',
      quality,
    );
  });
}

/** Convert a selected local video interval into a looping animated WebP. */
export async function videoToAnimatedWebp(
  videoUrl: string,
  options: AnimatedWebpOptions,
): Promise<AnimatedWebpResult> {
  const ownsVideo = !options.videoElement;
  const video = options.videoElement ?? document.createElement('video');
  const canvas = document.createElement('canvas');
  const originalTime = video.currentTime;
  try {
    throwIfAborted(options.signal);
    if (ownsVideo) {
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      const ready = waitForVideoReady(video, options.signal);
      video.src = videoUrl;
      video.load();
      await ready;
    } else {
      video.pause();
      await waitForVideoReady(video, options.signal);
    }
    const duration = await resolveMediaDuration(video, MAX_TIMEOUT_MS);
    const range = normalizeVideoTrimRange(duration, options.range.start, options.range.end);
    const times = createAnimatedWebpFrameTimes(range, options.fps);
    if (times.length < 2) throw new Error('选择的片段太短，无法生成动态图。');

    const outputSize = resolveAnimatedWebpDimensions(
      video.videoWidth,
      video.videoHeight,
      options.maxEdge,
      options.scalePercent,
    );
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建动态图处理画布。');

    const frames: Uint8Array[] = [];
    options.onProgress?.(0);
    for (let index = 0; index < times.length; index += 1) {
      throwIfAborted(options.signal);
      await seekVideoFrame(video, times[index] ?? range.start, options.signal);
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (cause) {
        throw new Error('当前视频地址禁止读取画面，请先把视频保存到本机素材库。', { cause });
      }
      const frame = await canvasToWebp(canvas, clamp(options.quality, DEFAULT_QUALITY, 0.4, 0.95));
      frames.push(new Uint8Array(await frame.arrayBuffer()));
      options.onProgress?.(Math.min(95, Math.round(((index + 1) / times.length) * 95)));
    }
    throwIfAborted(options.signal);
    const selectedDuration = range.end - range.start;
    const frameDurationMs = (selectedDuration * 1000) / frames.length;
    const blob = muxAnimatedWebpFrames(frames, canvas.width, canvas.height, frameDurationMs);
    options.onProgress?.(100);
    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      duration: selectedDuration,
      frameCount: frames.length,
      fps: frames.length / selectedDuration,
    };
  } finally {
    video.pause();
    if (ownsVideo) {
      video.removeAttribute('src');
      video.load();
    } else if (Number.isFinite(originalTime) && Math.abs(video.currentTime - originalTime) > 0.01) {
      await seekVideoFrame(video, originalTime).catch(() => {});
    }
    canvas.width = 0;
    canvas.height = 0;
  }
}
