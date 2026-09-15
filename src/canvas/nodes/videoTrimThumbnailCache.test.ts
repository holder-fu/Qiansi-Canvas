import { describe, expect, it } from 'vitest';
import imageNodeSource from './ImageNode.tsx?raw';

describe('video trim thumbnail session cache', () => {
  it('reuses one in-flight or completed extraction while the video source is unchanged', () => {
    expect(imageNodeSource).toContain('trimThumbnailGenerationRef');
    expect(imageNodeSource).toContain(
      'trimThumbnailGenerationRef.current?.source === resolvedVideoUrl',
    );
    expect(imageNodeSource).toContain('void generation.promise');
    expect(imageNodeSource).not.toMatch(
      /if \(trimOpen\) return;[\s\S]{0,240}setTrimThumbnails\(\[\]\);/u,
    );
  });

  it('releases cached URLs when the source changes or the node unmounts', () => {
    expect(
      (imageNodeSource.match(/trimThumbnailGenerationRef\.current = null;/gu) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      (imageNodeSource.match(/URL\.revokeObjectURL\(url\)/gu) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(imageNodeSource).toContain('trimThumbnailsSourceRef.current !== generation.source');
  });
});
