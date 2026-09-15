import { describe, expect, it } from 'vitest';
import { shouldHydrateStoredVideoSource } from './videoPosterState';

const baseState = {
  isVideoNode: true,
  hasDirectVideoUrl: false,
  hasStoredVideoId: true,
  zoom: 1,
  decoderGranted: false,
};

describe('shouldHydrateStoredVideoSource', () => {
  it('hydrates a stored video without waiting for hover when its poster is missing', () => {
    expect(shouldHydrateStoredVideoSource(baseState)).toBe(true);
  });

  it('keeps a healthy static poster without retaining a video decoder source', () => {
    expect(
      shouldHydrateStoredVideoSource({
        ...baseState,
        posterUrl: '/media-preview/files/video-poster.webp',
      }),
    ).toBe(false);
  });

  it('rehydrates the stored video when the persisted poster fails to load', () => {
    const posterUrl = '/media-preview/files/missing-poster.webp';
    expect(
      shouldHydrateStoredVideoSource({
        ...baseState,
        posterUrl,
        failedPosterUrl: posterUrl,
      }),
    ).toBe(true);
  });

  it('still hydrates for active playback but skips distant low-zoom nodes', () => {
    expect(
      shouldHydrateStoredVideoSource({
        ...baseState,
        posterUrl: '/media-preview/files/video-poster.webp',
        decoderGranted: true,
      }),
    ).toBe(true);
    expect(shouldHydrateStoredVideoSource({ ...baseState, zoom: 0.2 })).toBe(false);
  });
});
