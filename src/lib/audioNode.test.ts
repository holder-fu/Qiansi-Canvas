import { describe, expect, it } from 'vitest';
import {
  AUDIO_NODE_HEIGHT,
  AUDIO_NODE_WIDTH,
  audioRecordingAvailability,
  audioRecordingExtension,
  createAudioWaveformBars,
  createAudioRecordingFile,
  formatAudioDuration,
  formatAudioEditorTime,
  hasAudibleInput,
  preferredAudioRecordingMimeType,
} from './audioNode';

describe('audio node helpers', () => {
  it('uses the compact node dimensions from the selected visual contract', () => {
    expect(AUDIO_NODE_WIDTH).toBe(350);
    expect(AUDIO_NODE_HEIGHT).toBe(148);
  });

  it('formats media duration for compact playback metadata', () => {
    expect(formatAudioDuration(0)).toBe('0:00');
    expect(formatAudioDuration(65.9)).toBe('1:05');
    expect(formatAudioDuration(3661)).toBe('1:01:01');
    expect(formatAudioDuration(Number.NaN)).toBe('--:--');
    expect(formatAudioEditorTime(0)).toBe('00:00');
    expect(formatAudioEditorTime(65.9)).toBe('01:05');
  });

  it('prefers Opus WebM and falls back to a browser-selected recorder type', () => {
    expect(preferredAudioRecordingMimeType((type) => type === 'audio/webm')).toBe('audio/webm');
    expect(preferredAudioRecordingMimeType(() => false)).toBe('');
  });

  it.each([
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/mp4', 'm4a'],
    ['audio/mpeg', 'mp3'],
    ['audio/mp3', 'mp3'],
    ['audio/wav', 'wav'],
    ['audio/x-wav', 'wav'],
    ['audio/ogg;codecs=opus', 'ogg'],
    ['audio/flac', 'flac'],
    ['audio/x-flac', 'flac'],
  ])('uses the matching extension for recorder MIME %s', (mimeType, extension) => {
    expect(audioRecordingExtension(mimeType)).toBe(extension);
  });

  it('requires a secure browser context and real recording APIs', () => {
    expect(
      audioRecordingAvailability({
        secureContext: false,
        hasGetUserMedia: true,
        hasMediaRecorder: true,
      }),
    ).toMatchObject({ available: false, message: expect.stringContaining('HTTPS') });
    expect(
      audioRecordingAvailability({
        secureContext: true,
        hasGetUserMedia: false,
        hasMediaRecorder: true,
      }),
    ).toMatchObject({ available: false, message: expect.stringContaining('Chrome') });
    expect(
      audioRecordingAvailability({
        secureContext: true,
        hasGetUserMedia: true,
        hasMediaRecorder: true,
      }),
    ).toEqual({ available: true, message: '' });
  });

  it('builds a persisted recording file and distinguishes an audible input signal', () => {
    const file = createAudioRecordingFile(
      [new Uint8Array([1, 2, 3])],
      'audio/webm;codecs=opus',
      new Date('2026-08-14T00:00:00.000Z'),
    );
    expect(file.name).toBe('录音-2026-08-14T00-00-00-000Z.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
    expect(file.size).toBe(3);
    expect(hasAudibleInput(0.014)).toBe(false);
    expect(hasAudibleInput(0.015)).toBe(true);
  });

  it('builds a stable bounded waveform without decoding the source media', () => {
    const first = createAudioWaveformBars('demo.wav', 24);
    expect(first).toEqual(createAudioWaveformBars('demo.wav', 24));
    expect(first).toHaveLength(24);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0.16);
    expect(Math.max(...first)).toBeLessThanOrEqual(1);
  });
});
