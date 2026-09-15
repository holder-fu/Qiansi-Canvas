import { clampCropRect, type NormalizedRect } from './imageEditing';
import { resolveMediaDuration } from './mediaDuration';
import { normalizeVideoTrimRange, type VideoTrimRange } from './videoTrim';

export type VideoEditResult = {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
};

export type VideoCropResult = VideoEditResult;

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function resolveVideoCropPixels(
  sourceWidth: number,
  sourceHeight: number,
  rect: NormalizedRect,
) {
  const safeWidth = Math.max(1, Math.round(sourceWidth));
  const safeHeight = Math.max(1, Math.round(sourceHeight));
  const normalized = clampCropRect(rect, 0.02);
  const x = Math.min(safeWidth - 1, Math.round(normalized.x * safeWidth));
  const y = Math.min(safeHeight - 1, Math.round(normalized.y * safeHeight));
  const width = Math.max(1, Math.min(safeWidth - x, Math.round(normalized.width * safeWidth)));
  const height = Math.max(1, Math.min(safeHeight - y, Math.round(normalized.height * safeHeight)));
  return { x, y, width, height };
}

export function resolveVideoEditPlan(
  sourceWidth: number,
  sourceHeight: number,
  duration: number,
  options: { crop?: NormalizedRect; range?: VideoTrimRange },
) {
  const crop = options.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const range = normalizeVideoTrimRange(duration, options.range?.start, options.range?.end);
  return {
    crop: resolveVideoCropPixels(sourceWidth, sourceHeight, crop),
    range,
  };
}

export function preferredVideoCropMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? ''
  );
}

function waitForVideoReady(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('读取视频画面超时。')), 15000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleReady = () => finish();
    const handleError = () => finish(new Error('无法读取待处理视频。'));
    video.addEventListener('loadeddata', handleReady, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function seekVideo(video: HTMLVideoElement, time: number) {
  if (
    !video.seeking &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Math.abs(video.currentTime - time) < 0.01
  ) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('定位视频剪辑位置超时。')), 10000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleSeeked = () => finish();
    const handleError = () => finish(new Error('无法定位视频剪辑位置。'));
    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = time;
  });
}

export async function editVideoToBlob(
  videoUrl: string,
  options: {
    crop?: NormalizedRect;
    range?: VideoTrimRange;
    onProgress?: (progress: number) => void;
  },
): Promise<VideoEditResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持本地视频生成，请使用最新版 Chrome 或 Edge。');
  }

  const video = document.createElement('video') as CapturableVideo;
  video.crossOrigin = 'anonymous';
  video.src = videoUrl;
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;

  let outputStream: MediaStream | undefined;
  let sourceStream: MediaStream | undefined;
  let audioContext: AudioContext | undefined;
  let recorder: MediaRecorder | undefined;
  let animationHandle = 0;
  let videoFrameHandle = 0;

  try {
    await waitForVideoReady(video);
    const duration = await resolveMediaDuration(video);
    if (duration <= 0) {
      throw new Error('当前视频没有可读取的时长，无法生成剪辑结果。');
    }
    const plan = resolveVideoEditPlan(video.videoWidth, video.videoHeight, duration, options);
    if (plan.range.end <= plan.range.start) throw new Error('剪辑区间无效。');
    await seekVideo(video, plan.range.start);

    const canvas = document.createElement('canvas');
    canvas.width = plan.crop.width;
    canvas.height = plan.crop.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建视频处理画布。');

    const drawCurrentFrame = () => {
      context.drawImage(
        video,
        plan.crop.x,
        plan.crop.y,
        plan.crop.width,
        plan.crop.height,
        0,
        0,
        plan.crop.width,
        plan.crop.height,
      );
    };

    try {
      drawCurrentFrame();
      outputStream = canvas.captureStream(30);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        throw new Error('当前视频地址禁止浏览器读取画面，请先将视频上传到本机素材库后再剪辑。');
      }
      throw error;
    }

    const captureSource = video.captureStream ?? video.mozCaptureStream;
    try {
      sourceStream = captureSource?.call(video);
    } catch {
      sourceStream = undefined;
    }
    const sourceAudioTracks = sourceStream?.getAudioTracks() ?? [];
    for (const track of sourceAudioTracks) outputStream.addTrack(track);
    if (sourceAudioTracks.length === 0 && typeof AudioContext !== 'undefined') {
      try {
        audioContext = new AudioContext();
        const audioSource = audioContext.createMediaElementSource(video);
        const audioDestination = audioContext.createMediaStreamDestination();
        audioSource.connect(audioDestination);
        for (const track of audioDestination.stream.getAudioTracks()) outputStream.addTrack(track);
        if (audioContext.state === 'suspended') await audioContext.resume();
      } catch {
        if (audioContext) await audioContext.close().catch(() => {});
        audioContext = undefined;
      }
    }

    const mimeType = preferredVideoCropMimeType();
    const pixelsPerSecond = plan.crop.width * plan.crop.height * 30;
    const videoBitsPerSecond = Math.max(2_000_000, Math.min(20_000_000, pixelsPerSecond * 0.12));
    recorder = new MediaRecorder(outputStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      if (!recorder) return reject(new Error('视频编码器没有初始化。'));
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('生成编辑后的视频失败。'));
    });

    let stopPlaybackMonitor: ((error?: Error) => void) | undefined;
    const playbackFinished = new Promise<void>((resolve, reject) => {
      const editDuration = plan.range.end - plan.range.start;
      const timeout = window.setTimeout(
        () => finish(new Error('视频处理超时，请缩短视频后重试。')),
        Math.max(30000, Math.ceil(editDuration + 20) * 1500),
      );
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        video.removeEventListener('error', handleError);
        if (animationHandle) {
          window.cancelAnimationFrame(animationHandle);
          animationHandle = 0;
        }
        if (videoFrameHandle && video.cancelVideoFrameCallback) {
          video.cancelVideoFrameCallback(videoFrameHandle);
          videoFrameHandle = 0;
        }
        if (error) reject(error);
        else resolve();
      };
      stopPlaybackMonitor = finish;
      const handleError = () => finish(new Error('视频处理过程中读取失败。'));
      video.addEventListener('error', handleError, { once: true });

      const drawFrame = () => {
        try {
          drawCurrentFrame();
          const elapsed = Math.max(0, video.currentTime - plan.range.start);
          options.onProgress?.(Math.min(99, Math.round((elapsed / editDuration) * 100)));
          if (video.ended || video.currentTime >= plan.range.end - 1 / 60) {
            finish();
            return;
          }
          if (video.requestVideoFrameCallback) {
            videoFrameHandle = video.requestVideoFrameCallback(drawFrame);
          } else {
            animationHandle = window.requestAnimationFrame(drawFrame);
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error('无法读取视频画面。'));
        }
      };
      drawFrame();
    });

    options.onProgress?.(0);
    recorder.start(500);
    try {
      await video.play();
    } catch (error) {
      const playbackError =
        error instanceof Error ? error : new Error('浏览器无法开始播放待处理视频。');
      stopPlaybackMonitor?.(playbackError);
      await playbackFinished.catch(() => {});
      throw playbackError;
    }
    await playbackFinished;
    video.pause();
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    if (chunks.length === 0) throw new Error('视频编码器没有产生可用结果。');
    options.onProgress?.(100);
    return {
      blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }),
      width: plan.crop.width,
      height: plan.crop.height,
      duration: plan.range.end - plan.range.start,
    };
  } finally {
    video.pause();
    if (animationHandle) window.cancelAnimationFrame(animationHandle);
    if (videoFrameHandle && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(videoFrameHandle);
    }
    if (recorder?.state && recorder.state !== 'inactive') recorder.stop();
    for (const track of outputStream?.getTracks() ?? []) track.stop();
    for (const track of sourceStream?.getTracks() ?? []) track.stop();
    if (audioContext) await audioContext.close().catch(() => {});
    video.removeAttribute('src');
    video.load();
  }
}

export function cropVideoToBlob(
  videoUrl: string,
  rect: NormalizedRect,
  onProgress?: (progress: number) => void,
) {
  return editVideoToBlob(videoUrl, { crop: rect, onProgress });
}

export function trimVideoToBlob(
  videoUrl: string,
  range: VideoTrimRange,
  onProgress?: (progress: number) => void,
) {
  return editVideoToBlob(videoUrl, { range, onProgress });
}
