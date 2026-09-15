import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  imageEditorSourceCandidates,
  imageEditorSourcePages,
  imagePreviewSource,
  isBridgeMediaUrl,
  isDerivedBridgePreviewUrl,
  mediaPreviewUrl,
  preferredAudioSource,
  preferredImageSource,
  preferredVideoSource,
  recoverPersistedAudioNode,
  recoverPersistedAudioSource,
  resolvedAudioSource,
  videoPosterCaptureTime,
  videoPreviewSource,
} from './mediaPreview';

describe('videoPosterCaptureTime', () => {
  it('avoids the commonly black zero frame while keeping short clips in range', () => {
    expect(videoPosterCaptureTime(157)).toBe(1);
    expect(videoPosterCaptureTime(5)).toBe(0.5);
    expect(videoPosterCaptureTime(0.5)).toBe(0.1);
    expect(videoPosterCaptureTime(0.1)).toBe(0);
  });
});

describe('imagePreviewSource', () => {
  it('uses an explicit inherited preview while a derived image node is pending', () => {
    expect(imagePreviewSource({ imagePreviewUrl: 'http://127.0.0.1:2895/assets/source.png' })).toBe(
      'http://127.0.0.1:2895/assets/source.png',
    );
  });

  it('recovers an upstream reference from a saved node port map', () => {
    expect(
      imagePreviewSource({ portInputs: { ref: ['http://127.0.0.1:2895/assets/source.png'] } }),
    ).toBe('http://127.0.0.1:2895/assets/source.png');
  });

  it('keeps a generated result ahead of its inherited reference', () => {
    const generated = 'http://127.0.0.1:2895/assets/generated.png';
    expect(
      imagePreviewSource({
        imageUrl: generated,
        imagePreviewUrl: 'http://127.0.0.1:2895/assets/source.png',
        portInputs: { ref: ['http://127.0.0.1:2895/assets/source.png'] },
      }),
    ).toBe(generated);
    expect(preferredImageSource({ imageUrl: generated })).toBe(generated);
  });
});

describe('resolvedAudioSource', () => {
  it('resolves bridge-relative audio against the active bridge', () => {
    expect(resolvedAudioSource({ audioUrl: '/asset-library/files/audio_123456' })).toBe(
      'http://127.0.0.1:2895/asset-library/files/audio_123456',
    );
  });

  it('repairs audio URLs persisted with a stale loopback port', () => {
    expect(
      resolvedAudioSource({
        audios: ['http://127.0.0.1:2896/asset-library/files/audio_123456'],
      }),
    ).toBe('http://127.0.0.1:2895/asset-library/files/audio_123456');
  });

  it('keeps session and inline audio sources unchanged without a durable asset', () => {
    expect(resolvedAudioSource({ audioUrl: 'blob:http://127.0.0.1/session-audio' })).toBe(
      'blob:http://127.0.0.1/session-audio',
    );
    expect(resolvedAudioSource({ audioUrl: 'data:audio/webm;base64,abc' })).toBe(
      'data:audio/webm;base64,abc',
    );
  });

  it('recovers an expired session Blob from its durable bridge asset id', () => {
    const data = {
      audioUrl: 'blob:http://127.0.0.1/expired-audio',
      bridgeAssetId: 'asset_123456',
    };
    expect(preferredAudioSource(data)).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456',
    );
    expect(resolvedAudioSource(data)).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456',
    );
  });

  it('canonicalizes a persisted Blob to its durable bridge asset without discarding aliases', () => {
    const restored = recoverPersistedAudioSource({
      audioUrl: 'blob:http://127.0.0.1/expired-audio',
      audios: ['blob:http://127.0.0.1/expired-audio', 'https://cdn.example.test/alternate.mp3'],
      output: 'blob:http://127.0.0.1/expired-audio',
      bridgeAssetId: 'asset_123456',
    });

    expect(restored).toMatchObject({
      audioUrl: '/asset-library/files/asset_123456',
      audios: ['/asset-library/files/asset_123456', 'https://cdn.example.test/alternate.mp3'],
      output: '/asset-library/files/asset_123456',
      bridgeAssetId: 'asset_123456',
    });
    expect(resolvedAudioSource(restored)).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456',
    );
  });

  it('replaces stale Blob aliases even when a stable audio URL appears first', () => {
    const stableUrl = '/asset-library/files/audio_123456';
    const restored = recoverPersistedAudioSource({
      audioUrl: stableUrl,
      audios: ['blob:http://127.0.0.1/expired-audio'],
      output: 'blob:http://127.0.0.1/expired-audio',
    });

    expect(restored).toMatchObject({
      audioUrl: stableUrl,
      audios: [stableUrl],
      output: stableUrl,
    });
  });

  it('uses a stable secondary alias instead of hiding the node behind a stale primary Blob', () => {
    const stableUrl = '/asset-library/files/audio_123456';
    const restored = recoverPersistedAudioSource({
      audioUrl: 'blob:http://127.0.0.1/expired-audio',
      audios: [stableUrl],
      output: stableUrl,
      audioSourceState: 'unavailable-after-restore' as const,
    });

    expect(restored).toMatchObject({
      audioUrl: stableUrl,
      audios: [stableUrl],
      output: stableUrl,
    });
    expect(restored.audioSourceState).toBeUndefined();
    expect(resolvedAudioSource(restored)).toBe(
      'http://127.0.0.1:2895/asset-library/files/audio_123456',
    );
  });

  it('retains an unrestorable persisted Blob but stops presenting it as playable', () => {
    const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
    const restored = recoverPersistedAudioSource({
      audioUrl: expiredUrl,
      audios: [expiredUrl],
      output: expiredUrl,
      audioFileName: 'voice.webm',
    });

    expect(restored).toMatchObject({
      audioUrl: expiredUrl,
      audios: [expiredUrl],
      output: expiredUrl,
      audioFileName: 'voice.webm',
      audioSourceState: 'unavailable-after-restore',
    });
    expect(resolvedAudioSource(restored)).toBeUndefined();
  });

  it('uses the restore state, not a localized error string, as the unavailable contract', () => {
    const sessionUrl = 'blob:http://127.0.0.1/new-session-audio';
    expect(
      resolvedAudioSource({
        audioUrl: sessionUrl,
        audioSourceState: 'unavailable-after-restore',
        generationError: 'The previous session audio is unavailable.',
      }),
    ).toBeUndefined();
    expect(resolvedAudioSource({ audioUrl: sessionUrl })).toBe(sessionUrl);
  });

  it('only recovers persisted nodes whose kind is audio', () => {
    const source = 'blob:http://127.0.0.1/expired-audio';
    const imageNode = { data: { kind: 'image', audioUrl: source } };
    expect(recoverPersistedAudioNode(imageNode)).toBe(imageNode);
    expect(
      recoverPersistedAudioNode({
        data: { kind: 'audio', audioUrl: source, bridgeAssetId: 'asset_123456' },
      }).data.audioUrl,
    ).toBe('/asset-library/files/asset_123456');
  });
});

describe('imageEditorSourceCandidates', () => {
  it('opens the stable original first and retains persisted previews as fallbacks', () => {
    expect(
      imageEditorSourceCandidates({
        originalUrl: '/asset-library/files/image_original',
        imageUrl: 'blob:expired-session-image',
        previewUrl: '/asset-library/files/image_preview',
      }),
    ).toEqual([
      'http://127.0.0.1:2895/asset-library/files/image_original',
      'http://127.0.0.1:2895/asset-library/files/image_preview',
      'blob:expired-session-image',
    ]);
  });

  it('can recover a pending linked node from its inherited reference', () => {
    expect(
      imageEditorSourceCandidates({
        portInputs: { ref: ['/output/upstream.png'] },
      }),
    ).toEqual(['http://127.0.0.1:2895/output/upstream.png']);
  });

  it('keeps persisted previews as first-image fallbacks rather than duplicate pages', () => {
    expect(
      imageEditorSourcePages({
        originalUrl: '/asset-library/files/image_original',
        imageUrl: 'blob:expired-session-image',
        images: ['blob:expired-session-image', '/output/second.png'],
        previewUrl: '/asset-library/files/image_preview',
      }),
    ).toEqual([
      [
        'http://127.0.0.1:2895/asset-library/files/image_original',
        'http://127.0.0.1:2895/asset-library/files/image_preview',
        'blob:expired-session-image',
      ],
      ['http://127.0.0.1:2895/output/second.png'],
    ]);
  });
});

describe('mediaPreviewUrl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a real bridge image-preview URL', () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:2895/' } });
    expect(mediaPreviewUrl('/output/frame.png', 'image')).toBe(
      'http://127.0.0.1:2895/output/frame.png?preview=image&w=768',
    );
  });

  it('recognizes the old query-only preview contract for migration', () => {
    expect(
      isDerivedBridgePreviewUrl(
        'http://127.0.0.1:2895/output/frame.png?preview=image&w=768',
        'http://127.0.0.1:2895/output/frame.png',
      ),
    ).toBe(true);
  });

  it('creates a video poster URL for bridge assets', () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:2895/' } });
    expect(mediaPreviewUrl('/asset-library/files/asset_123456', 'video')).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456?preview=poster&w=960',
    );
  });

  it('repairs a persisted preview that still points at the old development port', () => {
    expect(
      mediaPreviewUrl('http://127.0.0.1:2896/media-preview/files/preview_legacy.webp', 'image'),
    ).toBe('http://127.0.0.1:2895/media-preview/files/preview_legacy.webp');
  });

  it('recognizes and repairs media persisted through the development proxy', () => {
    const legacy = 'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_legacy';
    expect(isBridgeMediaUrl(legacy)).toBe(true);
    expect(mediaPreviewUrl(legacy, 'video')).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_legacy?preview=poster&w=960',
    );
  });

  it('does not append guessed parameters to data, blob, or third-party URLs', () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:2895/' } });
    expect(mediaPreviewUrl('data:image/png;base64,abc', 'image')).toBe('data:image/png;base64,abc');
    expect(mediaPreviewUrl('blob:http://127.0.0.1/id', 'image')).toBe('blob:http://127.0.0.1/id');
    expect(mediaPreviewUrl('blob:http://127.0.0.1/video', 'video')).toBeUndefined();
    expect(mediaPreviewUrl('https://cdn.example.test/frame.png', 'image')).toBe(
      'https://cdn.example.test/frame.png',
    );
  });
});

describe('preferredVideoSource', () => {
  it('does not let a legacy input image in originalUrl hide the real video', () => {
    expect(
      preferredVideoSource({
        originalUrl: 'http://127.0.0.1:2896/asset-library/files/image_legacy',
        videoUrl: 'http://127.0.0.1:2896/asset-library/files/video_actual',
      }),
    ).toBe('http://127.0.0.1:2896/asset-library/files/video_actual');
  });

  it('retains originalUrl as a migrated-video fallback', () => {
    expect(preferredVideoSource({ originalUrl: '/asset-library/files/video_only' })).toBe(
      '/asset-library/files/video_only',
    );
  });
});

describe('videoPreviewSource', () => {
  it('uses a connected source-video input for pending downstream video nodes', () => {
    expect(
      videoPreviewSource({
        portInputs: { 'source-video': ['http://127.0.0.1:2895/assets/source.mp4'] },
      }),
    ).toBe('http://127.0.0.1:2895/assets/source.mp4');
  });

  it('keeps a generated node own video ahead of its connected reference', () => {
    expect(
      videoPreviewSource({
        videoUrl: 'http://127.0.0.1:2895/assets/generated.mp4',
        portInputs: { 'source-video': ['http://127.0.0.1:2895/assets/source.mp4'] },
      }),
    ).toBe('http://127.0.0.1:2895/assets/generated.mp4');
  });
});
