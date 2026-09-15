import { describe, expect, it } from 'vitest';
import {
  IMAGE_NODE_ORIGINAL_ZOOM_THRESHOLD,
  shouldRenderImageNodeOriginal,
} from './imageNodeDisplayQuality';
import imageNodeSource from './ImageNode.tsx?raw';

describe('image node display quality', () => {
  const base = {
    isVideoNode: false,
    singleSelected: true,
    zoom: 1.01,
    originalUrl: '/asset-library/files/original-image',
  };

  it('uses the original only for a single selected image above 100% zoom', () => {
    expect(shouldRenderImageNodeOriginal(base)).toBe(true);
    expect(
      shouldRenderImageNodeOriginal({ ...base, zoom: IMAGE_NODE_ORIGINAL_ZOOM_THRESHOLD }),
    ).toBe(false);
    expect(shouldRenderImageNodeOriginal({ ...base, singleSelected: false })).toBe(false);
  });

  it('keeps video nodes and images without an original on lightweight media', () => {
    expect(shouldRenderImageNodeOriginal({ ...base, isVideoNode: true })).toBe(false);
    expect(shouldRenderImageNodeOriginal({ ...base, originalUrl: undefined })).toBe(false);
  });

  it('wires the selected high-zoom source into the rendered image with preview fallback', () => {
    expect(imageNodeSource).toContain(
      'const displayImageUrl = useOriginalImage ? resolvedOriginalImageUrl : displayPreviewUrl;',
    );
    expect(imageNodeSource).toContain(
      "data-media-quality={useOriginalImage ? 'original' : 'preview'}",
    );
    expect(imageNodeSource).toContain('setFailedOriginalImageUrl(resolvedOriginalImageUrl)');
  });

  it('keeps an inherited reference out of the derived node media body', () => {
    expect(imageNodeSource).toContain(': explicitImageUrl;');
    expect(imageNodeSource).toContain(
      'Upstream references belong in the composer reference strip, not in the',
    );
    expect(imageNodeSource).not.toContain(': resolvedImageUrl || resolvedVideoUrl;');
  });

  it('keeps a lightweight media preview visible below 30% zoom', () => {
    const lowZoomStart = imageNodeSource.indexOf('if (zoom < 0.3)');
    const lowZoomEnd = imageNodeSource.indexOf('const mediaFileName', lowZoomStart);
    const lowZoomBranch = imageNodeSource.slice(lowZoomStart, lowZoomEnd);

    expect(imageNodeSource).toContain(
      'const lowZoomMediaPreviewUrl = isVideoNode ? videoPosterUrl : displayImageUrl;',
    );
    expect(lowZoomBranch).toContain('data-low-zoom-media-preview="true"');
    expect(lowZoomBranch).toContain('src={lowZoomMediaPreviewUrl}');
    expect(lowZoomBranch).not.toContain('<video');
  });
});
