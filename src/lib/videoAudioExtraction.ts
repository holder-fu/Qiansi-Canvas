import { resolveMediaDuration } from './mediaDuration';

export const VIDEO_AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm'] as const;

export type VideoAudioExtractionStrategy = 'capture-stream' | 'audio-context';

export type VideoAudioExtractionPlan = {
  mimeType: (typeof VIDEO_AUDIO_MIME_TYPES)[number];
  strategy: VideoAudioExtractionStrategy;
};

export type VideoAudioExtractionErrorCode =
  | 'aborted'
  | 'cors-or-drm'
  | 'empty-result'
  | 'invalid-duration'
  | 'no-audio-track'
  | 'playback-failed'
  | 'read-timeout'
  | 'unsupported';

export type VideoAudioExtractionOptions = {
  /** Receives an integer percentage in the inclusive 0..100 range. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

export type VideoAudioExtractionResult = {
  blob: Blob;
  duration: number;
  mimeType: string;
};

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
  webkitAudioDecodedByteCount?: number;
};

type AudioTrackListLike = { length: number };

const READ_TIMEOUT_MS = 15_000;

export function preferredVideoAudioMimeType(
  isTypeSupported: (mimeType: string) => boolean = (mimeType) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType),
) {
  return VIDEO_AUDIO_MIME_TYPES.find(isTypeSupported) ?? '';
}

function isVideoAudioMimeType(
  mimeType: string,
): mimeType is (typeof VIDEO_AUDIO_MIME_TYPES)[number] {
  return (VIDEO_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function videoAudioExtractionErrorMessage(code: VideoAudioExtractionErrorCode) {
  const messages: Record<VideoAudioExtractionErrorCode, string> = {
    aborted: '音频分离已取消。',
    'cors-or-drm':
      '当前视频受跨域或数字版权保护限制，浏览器无法读取音轨。请先将无 DRM 的视频上传到本机素材库后重试。',
    'empty-result': '音频编码器没有产生可用结果，请确认原视频包含可播放的音轨。',
    'invalid-duration': '当前视频没有可读取的时长，无法分离音频。',
    'no-audio-track': '当前视频没有可读取的音轨。',
    'playback-failed': '浏览器无法播放待处理视频，音频分离未完成。',
    'read-timeout': '读取视频音轨超时，请确认视频可以正常播放后重试。',
    unsupported: '当前浏览器不支持本地音频分离，请使用最新版 Chrome 或 Edge。',
  };
  return messages[code];
}

export function createVideoAudioExtractionPlan(input: {
  audioContextSupported: boolean;
  capturedAudioTrackCount: number;
  mediaRecorderSupported: boolean;
  mimeType: string;
}): VideoAudioExtractionPlan {
  if (!input.mediaRecorderSupported || !isVideoAudioMimeType(input.mimeType)) {
    throw new Error(videoAudioExtractionErrorMessage('unsupported'));
  }
  if (input.capturedAudioTrackCount > 0) {
    return {
      mimeType: input.mimeType,
      strategy: 'capture-stream',
    };
  }
  if (input.audioContextSupported) {
    return {
      mimeType: input.mimeType,
      strategy: 'audio-context',
    };
  }
  throw new Error(videoAudioExtractionErrorMessage('no-audio-track'));
}

function createAbortError() {
  return new DOMException(videoAudioExtractionErrorMessage('aborted'), 'AbortError');
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function withAbort<T>(operation: Promise<T>, signal?: AbortSignal) {
  if (!signal) return operation;
  assertNotAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const cleanup = () => signal.removeEventListener('abort', handleAbort);
    signal.addEventListener('abort', handleAbort, { once: true });
    operation.then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function waitForMetadata(video: HTMLVideoElement, signal?: AbortSignal) {
  assertNotAborted(signal);
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = globalThis.setTimeout(
      () => finish(new Error(videoAudioExtractionErrorMessage('read-timeout'))),
      READ_TIMEOUT_MS,
    );
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', handleReady);
      video.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleReady = () => finish();
    const handleError = () => finish(new Error(videoAudioExtractionErrorMessage('cors-or-drm')));
    const handleAbort = () => finish(createAbortError());

    video.addEventListener('loadedmetadata', handleReady, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function waitForPlaybackEnd(
  video: HTMLVideoElement,
  duration: number,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = globalThis.setTimeout(
      () => finish(new Error(videoAudioExtractionErrorMessage('read-timeout'))),
      Math.max(READ_TIMEOUT_MS, Math.ceil(duration + 20) * 1_000),
    );
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('error', handleError);
      video.removeEventListener('encrypted', handleEncrypted);
      signal?.removeEventListener('abort', handleAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleEnded = () => finish();
    const handleTimeUpdate = () => {
      const progress = Math.max(0, Math.min(100, Math.round((video.currentTime / duration) * 100)));
      onProgress?.(progress);
      if (video.currentTime >= duration - 0.025) finish();
    };
    const handleError = () =>
      finish(new Error(videoAudioExtractionErrorMessage('playback-failed')));
    const handleEncrypted = () =>
      finish(new Error(videoAudioExtractionErrorMessage('cors-or-drm')));
    const handleAbort = () => finish(createAbortError());

    video.addEventListener('ended', handleEnded, { once: true });
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('error', handleError, { once: true });
    video.addEventListener('encrypted', handleEncrypted, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function hasDeclaredAudioTracks(video: CapturableVideo) {
  const audioTracks = (video as CapturableVideo & { audioTracks?: AudioTrackListLike }).audioTracks;
  return audioTracks ? audioTracks.length > 0 : undefined;
}

function normalizedExtractionError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') return error;
    if (error.name === 'SecurityError') {
      return new Error(videoAudioExtractionErrorMessage('cors-or-drm'));
    }
    if (error.name === 'NotSupportedError') {
      return new Error(videoAudioExtractionErrorMessage('unsupported'));
    }
  }
  return error instanceof Error
    ? error
    : new Error(videoAudioExtractionErrorMessage('playback-failed'));
}

/**
 * Extract the complete mixed soundtrack from a video by recording it at 1× playback speed.
 * This is intentionally a browser-native path for Chrome/Edge installations without FFmpeg.
 */
export async function extractVideoAudioToBlob(
  videoUrl: string,
  options: VideoAudioExtractionOptions = {},
): Promise<VideoAudioExtractionResult> {
  assertNotAborted(options.signal);
  const mimeType = preferredVideoAudioMimeType();
  if (typeof MediaRecorder === 'undefined' || !mimeType) {
    throw new Error(videoAudioExtractionErrorMessage('unsupported'));
  }

  const video = document.createElement('video') as CapturableVideo;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;
  video.playbackRate = 1;
  video.src = videoUrl;

  let capturedStream: MediaStream | undefined;
  let recordingStream: MediaStream | undefined;
  let audioContext: AudioContext | undefined;
  let audioSource: MediaElementAudioSourceNode | undefined;
  let audioDestination: MediaStreamAudioDestinationNode | undefined;
  let recorder: MediaRecorder | undefined;

  try {
    video.load();
    await waitForMetadata(video, options.signal);
    assertNotAborted(options.signal);
    if (video.mediaKeys) throw new Error(videoAudioExtractionErrorMessage('cors-or-drm'));

    const duration = await withAbort(resolveMediaDuration(video), options.signal);
    assertNotAborted(options.signal);
    if (duration <= 0) throw new Error(videoAudioExtractionErrorMessage('invalid-duration'));

    const captureSource = video.captureStream ?? video.mozCaptureStream;
    if (captureSource) {
      try {
        capturedStream = captureSource.call(video);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'SecurityError') {
          throw new Error(videoAudioExtractionErrorMessage('cors-or-drm'));
        }
      }
    }
    const capturedAudioTracks = capturedStream?.getAudioTracks() ?? [];
    const plan = createVideoAudioExtractionPlan({
      audioContextSupported: typeof AudioContext !== 'undefined',
      capturedAudioTrackCount: capturedAudioTracks.length,
      mediaRecorderSupported: true,
      mimeType,
    });

    if (plan.strategy === 'capture-stream') {
      recordingStream = new MediaStream(capturedAudioTracks);
    } else {
      audioContext = new AudioContext();
      audioSource = audioContext.createMediaElementSource(video);
      audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);
      const mixedTracks = audioDestination.stream.getAudioTracks();
      if (mixedTracks.length === 0) {
        throw new Error(videoAudioExtractionErrorMessage('no-audio-track'));
      }
      recordingStream = new MediaStream(mixedTracks);
      if (audioContext.state === 'suspended') await audioContext.resume();
    }

    if (recordingStream.getAudioTracks().length === 0) {
      throw new Error(videoAudioExtractionErrorMessage('no-audio-track'));
    }

    recorder = new MediaRecorder(recordingStream, { mimeType: plan.mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    let rejectRecorderFailure: (error: Error) => void = () => {};
    const recorderFailed = new Promise<never>((_, reject) => {
      rejectRecorderFailure = reject;
    });
    const recorderStopped = new Promise<void>((resolve) => {
      if (!recorder) return resolve();
      recorder.onstop = () => resolve();
      recorder.onerror = () =>
        rejectRecorderFailure(new Error(videoAudioExtractionErrorMessage('empty-result')));
    });

    options.onProgress?.(0);
    recorder.start(500);
    let processingError: unknown;
    try {
      try {
        await video.play();
      } catch {
        throw new Error(videoAudioExtractionErrorMessage('playback-failed'));
      }
      await Promise.race([
        waitForPlaybackEnd(video, duration, options.onProgress, options.signal),
        recorderFailed,
      ]);
    } catch (error) {
      processingError = error;
    } finally {
      video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      await recorderStopped;
    }
    if (processingError) throw processingError;

    const declaredAudio = hasDeclaredAudioTracks(video);
    const decodedBytes = video.webkitAudioDecodedByteCount;
    if (
      declaredAudio === false ||
      (plan.strategy === 'audio-context' && typeof decodedBytes === 'number' && decodedBytes <= 0)
    ) {
      throw new Error(videoAudioExtractionErrorMessage('no-audio-track'));
    }
    if (chunks.length === 0) throw new Error(videoAudioExtractionErrorMessage('empty-result'));

    const resultMimeType = recorder.mimeType || plan.mimeType;
    options.onProgress?.(100);
    return {
      blob: new Blob(chunks, { type: resultMimeType }),
      duration,
      mimeType: resultMimeType,
    };
  } catch (error) {
    throw normalizedExtractionError(error);
  } finally {
    video.pause();
    if (recorder?.state && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // The recorder can already be stopping after an asynchronous failure.
      }
    }
    for (const track of recordingStream?.getTracks() ?? []) track.stop();
    for (const track of capturedStream?.getTracks() ?? []) track.stop();
    audioSource?.disconnect();
    audioDestination?.disconnect();
    if (audioContext) await audioContext.close().catch(() => {});
    video.removeAttribute('src');
    video.load();
  }
}
