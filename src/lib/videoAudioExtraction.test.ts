import { describe, expect, it } from 'vitest';
import {
  createVideoAudioExtractionPlan,
  preferredVideoAudioMimeType,
  videoAudioExtractionErrorMessage,
} from './videoAudioExtraction';

describe('preferredVideoAudioMimeType', () => {
  it('prefers Opus in WebM when the browser supports it', () => {
    expect(preferredVideoAudioMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to plain WebM and rejects unsupported containers', () => {
    expect(preferredVideoAudioMimeType((type) => type === 'audio/webm')).toBe('audio/webm');
    expect(preferredVideoAudioMimeType(() => false)).toBe('');
  });
});

describe('createVideoAudioExtractionPlan', () => {
  it('uses captureStream audio tracks before the Web Audio fallback', () => {
    expect(
      createVideoAudioExtractionPlan({
        audioContextSupported: true,
        capturedAudioTrackCount: 1,
        mediaRecorderSupported: true,
        mimeType: 'audio/webm;codecs=opus',
      }),
    ).toEqual({ mimeType: 'audio/webm;codecs=opus', strategy: 'capture-stream' });
  });

  it('uses a MediaElementAudioSourceNode mix when captureStream exposes no audio', () => {
    expect(
      createVideoAudioExtractionPlan({
        audioContextSupported: true,
        capturedAudioTrackCount: 0,
        mediaRecorderSupported: true,
        mimeType: 'audio/webm',
      }),
    ).toEqual({ mimeType: 'audio/webm', strategy: 'audio-context' });
  });

  it('reports a missing audio track when neither source strategy can provide one', () => {
    expect(() =>
      createVideoAudioExtractionPlan({
        audioContextSupported: false,
        capturedAudioTrackCount: 0,
        mediaRecorderSupported: true,
        mimeType: 'audio/webm',
      }),
    ).toThrow(videoAudioExtractionErrorMessage('no-audio-track'));
  });

  it('reports unsupported browsers before attempting extraction', () => {
    expect(() =>
      createVideoAudioExtractionPlan({
        audioContextSupported: true,
        capturedAudioTrackCount: 1,
        mediaRecorderSupported: false,
        mimeType: '',
      }),
    ).toThrow(videoAudioExtractionErrorMessage('unsupported'));
  });
});

describe('videoAudioExtractionErrorMessage', () => {
  it('keeps actionable messages for protected media and cancellation', () => {
    expect(videoAudioExtractionErrorMessage('cors-or-drm')).toContain('跨域或数字版权保护');
    expect(videoAudioExtractionErrorMessage('aborted')).toBe('音频分离已取消。');
  });
});
