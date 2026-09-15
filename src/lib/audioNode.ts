export const AUDIO_NODE_WIDTH = 350;
export const AUDIO_NODE_HEIGHT = 148;

export function createAudioWaveformBars(seed: string, count = 58): number[] {
  const safeCount = Math.max(16, Math.min(96, Math.floor(count)));
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return Array.from({ length: safeCount }, (_, index) => {
    state ^= index + 1;
    state = Math.imul(state, 2246822519);
    state ^= state >>> 13;
    const random = (state >>> 0) / 4294967295;
    const envelope = 0.58 + Math.sin((index / Math.max(1, safeCount - 1)) * Math.PI) * 0.42;
    return Math.max(0.16, Math.min(1, (0.24 + random * 0.76) * envelope));
  });
}

export function formatAudioDuration(seconds: unknown) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const rounded = Math.floor(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatAudioEditorTime(seconds: unknown) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const rounded = Math.floor(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function preferredAudioRecordingMimeType(isTypeSupported: (mimeType: string) => boolean) {
  return (
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(isTypeSupported) ?? ''
  );
}

export function audioRecordingExtension(mimeType: string) {
  const normalizedMime = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (normalizedMime === 'audio/mp4') return 'm4a';
  if (normalizedMime === 'audio/mpeg' || normalizedMime === 'audio/mp3') return 'mp3';
  if (normalizedMime === 'audio/wav' || normalizedMime === 'audio/x-wav') return 'wav';
  if (normalizedMime === 'audio/ogg') return 'ogg';
  if (normalizedMime === 'audio/flac' || normalizedMime === 'audio/x-flac') return 'flac';
  return 'webm';
}

export function createAudioRecordingFile(
  chunks: BlobPart[],
  mimeType: string,
  recordedAt = new Date(),
) {
  const extension = audioRecordingExtension(mimeType);
  return new File(chunks, `录音-${recordedAt.toISOString().replace(/[:.]/g, '-')}.${extension}`, {
    type: mimeType,
  });
}

export function hasAudibleInput(peakLevel: number) {
  return Number.isFinite(peakLevel) && peakLevel >= 0.015;
}

export function audioRecordingAvailability(options: {
  secureContext: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
}) {
  if (!options.secureContext) {
    return {
      available: false,
      message: '麦克风只能在 localhost 或 HTTPS 安全地址中使用。',
    } as const;
  }
  if (!options.hasGetUserMedia || !options.hasMediaRecorder) {
    return {
      available: false,
      message: '当前浏览器不支持麦克风录音，请使用最新版 Chrome 或 Edge。',
    } as const;
  }
  return { available: true, message: '' } as const;
}
