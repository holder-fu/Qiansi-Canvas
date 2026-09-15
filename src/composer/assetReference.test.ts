import { describe, expect, it } from 'vitest';
import type { AssetItem } from '../store/canvasStore';
import { appendComposerReference, assetToComposerReference } from './assetReference';

function asset(overrides: Partial<AssetItem>): AssetItem {
  return {
    id: 'asset-1',
    title: '测试素材',
    kind: 'image',
    category: 'character',
    createdAt: 1,
    ...overrides,
  };
}

describe('assetToComposerReference', () => {
  it('converts image, video and audio assets into composer references', () => {
    expect(assetToComposerReference(asset({ imageUrl: 'hero.png' }))).toMatchObject({
      type: 'image',
      url: 'hero.png',
      label: '测试素材',
    });
    expect(assetToComposerReference(asset({ kind: 'video', videoUrl: 'shot.mp4' }))).toMatchObject({
      type: 'video',
      url: 'shot.mp4',
    });
    expect(assetToComposerReference(asset({ kind: 'audio', audioUrl: 'voice.mp3' }))).toMatchObject(
      { type: 'audio', url: 'http://127.0.0.1:2895/voice.mp3' },
    );
  });

  it('uses a resolved local video URL and rejects assets without usable media', () => {
    expect(
      assetToComposerReference(asset({ kind: 'video', videoStorageId: 'stored-video' }), 'blob:1'),
    ).toMatchObject({ type: 'video', url: 'blob:1' });
    expect(assetToComposerReference(asset({ imageUrl: undefined }))).toBeNull();
    expect(
      assetToComposerReference(
        asset({
          kind: 'audio',
          audioUrl: 'blob:http://127.0.0.1/expired-audio',
          audioSourceState: 'unavailable-after-restore',
        }),
      ),
    ).toBeNull();
  });

  it('falls back to the persisted original image URL after optimized assets drop imageUrl', () => {
    expect(
      assetToComposerReference(
        asset({ originalUrl: 'http://127.0.0.1:2896/asset-library/files/hero_image' }),
      ),
    ).toMatchObject({
      type: 'image',
      url: 'http://127.0.0.1:2896/asset-library/files/hero_image',
    });
  });

  it('uses the bridge asset file when the asset record still has a stale image URL', () => {
    expect(
      assetToComposerReference(
        asset({
          bridgeAssetId: 'asset_123456',
          imageUrl: 'https://remote.example/expired-image.png',
        }),
      ),
    ).toMatchObject({
      type: 'image',
      url: 'http://127.0.0.1:2895/asset-library/files/asset_123456',
    });
  });

  it('keeps a persisted preview display-only while submitting the original image', () => {
    expect(
      assetToComposerReference(
        asset({
          previewUrl: 'http://127.0.0.1:2896/media-preview/files/preview_123456789012.webp',
          originalUrl: 'http://127.0.0.1:2896/asset-library/files/asset_original',
        }),
      ),
    ).toMatchObject({
      type: 'image',
      url: 'http://127.0.0.1:2896/asset-library/files/asset_original',
      previewUrl: 'http://127.0.0.1:2895/media-preview/files/preview_123456789012.webp',
    });
  });

  it('does not promote an orphaned thumbnail into an AI reference', () => {
    expect(
      assetToComposerReference(
        asset({
          previewUrl: 'http://127.0.0.1:2896/media-preview/files/preview_123456789012.webp',
        }),
      ),
    ).toBeNull();
  });
});

describe('appendComposerReference', () => {
  it('appends once and deduplicates the same asset or media URL', () => {
    const reference = assetToComposerReference(asset({ imageUrl: 'hero.png' }));
    expect(reference).not.toBeNull();
    if (!reference) throw new Error('Expected image reference');
    const first = appendComposerReference([], reference);
    expect(first).toHaveLength(1);
    expect(appendComposerReference(first, reference)).toHaveLength(1);
    expect(appendComposerReference(first, { ...reference, id: 'another-asset' })).toHaveLength(1);
  });
});
