import { describe, expect, it } from 'vitest';
import {
  AUDIO_TRIM_MIN_DURATION_SECONDS,
  clampAudioEditRate,
  createAudioEditPlan,
  createEditedAudioFileName,
  encodeAudioBufferAsWave,
  moveAudioTrimBoundary,
} from './audioEditing';

describe('audio editing helpers', () => {
  it('clamps the reference speed control to 0.1×–4.0×', () => {
    expect(clampAudioEditRate(0.01)).toBe(0.1);
    expect(clampAudioEditRate(1.234)).toBe(1.23);
    expect(clampAudioEditRate(8)).toBe(4);
    expect(clampAudioEditRate(Number.NaN)).toBe(1);
  });

  it('normalizes trim and speed into one bounded render plan', () => {
    expect(createAudioEditPlan(12, { startSeconds: 2, endSeconds: 8, playbackRate: 2 })).toEqual({
      startSeconds: 2,
      endSeconds: 8,
      playbackRate: 2,
      outputDurationSeconds: 3,
    });
    expect(() => createAudioEditPlan(12, { startSeconds: 4, endSeconds: 4.01 })).toThrowError(
      'invalid-range',
    );
    expect(() => createAudioEditPlan(120, { playbackRate: 0.1 })).toThrowError('output-too-long');
  });

  it('moves each trim handle independently with precise bounded values', () => {
    expect(moveAudioTrimBoundary({ start: 2, end: 8 }, 'start', 1.234, 12)).toEqual({
      start: 1.23,
      end: 8,
    });
    expect(moveAudioTrimBoundary({ start: 2, end: 8 }, 'end', 9.876, 12)).toEqual({
      start: 2,
      end: 9.88,
    });
    expect(moveAudioTrimBoundary({ start: 2, end: 8 }, 'start', 9, 12)).toEqual({
      start: 8 - AUDIO_TRIM_MIN_DURATION_SECONDS,
      end: 8,
    });
    expect(moveAudioTrimBoundary({ start: 2, end: 8 }, 'end', 1, 12)).toEqual({
      start: 2,
      end: 2 + AUDIO_TRIM_MIN_DURATION_SECONDS,
    });
  });

  it('creates clear WAV names for generated trim and speed results', () => {
    expect(createEditedAudioFileName('voice.mp3', 'trim')).toBe('voice_截取.wav');
    expect(createEditedAudioFileName('voice.mp3', 'speed', 1.5)).toBe('voice_1.50x.wav');
  });

  it('encodes an interleaved 16-bit PCM WAV with a valid header', async () => {
    const blob = encodeAudioBufferAsWave({
      numberOfChannels: 1,
      length: 3,
      sampleRate: 24_000,
      getChannelData: () => new Float32Array([-1, 0, 1]),
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(24_000);
    expect(bytes).toHaveLength(50);
  });
});
