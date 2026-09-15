export const AUDIO_EDIT_RATE_MIN = 0.1;
export const AUDIO_EDIT_RATE_MAX = 4;
export const AUDIO_TRIM_MIN_DURATION_SECONDS = 0.05;
export const MAX_EDITED_AUDIO_DURATION_SECONDS = 10 * 60;

export type AudioTrimBoundary = 'start' | 'end';
export type AudioTrimRange = { start: number; end: number };

export type AudioEditErrorCode =
  | 'unsupported'
  | 'load-failed'
  | 'decode-failed'
  | 'invalid-range'
  | 'output-too-long'
  | 'render-failed';

export class AudioEditingError extends Error {
  readonly code: AudioEditErrorCode;

  constructor(code: AudioEditErrorCode) {
    super(code);
    this.name = 'AudioEditingError';
    this.code = code;
  }
}

export type AudioEditPlan = {
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  outputDurationSeconds: number;
};

export function clampAudioEditRate(value: unknown) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 1;
  return Number(Math.max(AUDIO_EDIT_RATE_MIN, Math.min(AUDIO_EDIT_RATE_MAX, rate)).toFixed(2));
}

export function moveAudioTrimBoundary(
  range: AudioTrimRange,
  boundary: AudioTrimBoundary,
  value: unknown,
  durationSeconds: number,
): AudioTrimRange {
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  const start = Math.max(0, Math.min(duration, Number(range.start) || 0));
  const end = Math.max(start, Math.min(duration, Number(range.end) || duration));
  const requestedValue = Number(value);
  if (!Number.isFinite(requestedValue)) return { start, end };

  if (boundary === 'start') {
    return {
      start: Number(
        Math.max(0, Math.min(end - AUDIO_TRIM_MIN_DURATION_SECONDS, requestedValue)).toFixed(2),
      ),
      end,
    };
  }

  return {
    start,
    end: Number(
      Math.min(duration, Math.max(start + AUDIO_TRIM_MIN_DURATION_SECONDS, requestedValue)).toFixed(
        2,
      ),
    ),
  };
}

export function createAudioEditPlan(
  durationSeconds: number,
  options: { startSeconds?: number; endSeconds?: number; playbackRate?: number },
): AudioEditPlan {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AudioEditingError('invalid-range');
  }

  const startSeconds = Math.max(0, Math.min(durationSeconds, Number(options.startSeconds) || 0));
  const requestedEnd = Number(options.endSeconds);
  const endSeconds = Number.isFinite(requestedEnd)
    ? Math.max(0, Math.min(durationSeconds, requestedEnd))
    : durationSeconds;
  if (endSeconds - startSeconds < AUDIO_TRIM_MIN_DURATION_SECONDS) {
    throw new AudioEditingError('invalid-range');
  }

  const playbackRate = clampAudioEditRate(options.playbackRate);
  const outputDurationSeconds = (endSeconds - startSeconds) / playbackRate;
  if (outputDurationSeconds > MAX_EDITED_AUDIO_DURATION_SECONDS) {
    throw new AudioEditingError('output-too-long');
  }

  return { startSeconds, endSeconds, playbackRate, outputDurationSeconds };
}

export function createEditedAudioFileName(
  sourceName: string,
  operation: 'trim' | 'speed',
  playbackRate = 1,
) {
  const cleanName = sourceName.trim() || '音频';
  const stem = cleanName.replace(/\.[^.]+$/u, '') || '音频';
  return operation === 'trim'
    ? `${stem}_截取.wav`
    : `${stem}_${clampAudioEditRate(playbackRate).toFixed(2)}x.wav`;
}

type AudioBufferLike = {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
};

export function encodeAudioBufferAsWave(audioBuffer: AudioBufferLike) {
  const channelCount = Math.max(1, Math.min(2, audioBuffer.numberOfChannels));
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);

  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeText(36, 'data');
  view.setUint32(40, dataLength, true);

  const channels = Array.from({ length: channelCount }, (_, channel) =>
    audioBuffer.getChannelData(channel),
  );
  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel]?.[sampleIndex] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([output], { type: 'audio/wav' });
}

export async function renderEditedAudioFile(
  sourceUrl: string,
  sourceName: string,
  operation: 'trim' | 'speed',
  options: { startSeconds?: number; endSeconds?: number; playbackRate?: number },
) {
  if (
    typeof AudioContext === 'undefined' ||
    typeof OfflineAudioContext === 'undefined' ||
    typeof fetch === 'undefined'
  ) {
    throw new AudioEditingError('unsupported');
  }

  let response: Response;
  try {
    response = await fetch(sourceUrl);
  } catch {
    throw new AudioEditingError('load-failed');
  }
  if (!response.ok) throw new AudioEditingError('load-failed');

  const context = new AudioContext();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      throw new AudioEditingError('decode-failed');
    }

    const plan = createAudioEditPlan(decoded.duration, options);
    const channelCount = Math.max(1, Math.min(2, decoded.numberOfChannels));
    const outputFrames = Math.max(1, Math.ceil(plan.outputDurationSeconds * decoded.sampleRate));
    const offline = new OfflineAudioContext(channelCount, outputFrames, decoded.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = plan.playbackRate;
    source.connect(offline.destination);
    source.start(0, plan.startSeconds, plan.endSeconds - plan.startSeconds);

    let rendered: AudioBuffer;
    try {
      rendered = await offline.startRendering();
    } catch {
      throw new AudioEditingError('render-failed');
    }

    const file = new File(
      [encodeAudioBufferAsWave(rendered)],
      createEditedAudioFileName(sourceName, operation, plan.playbackRate),
      { type: 'audio/wav' },
    );
    return { file, durationSeconds: rendered.duration };
  } finally {
    await context.close().catch(() => {});
  }
}
