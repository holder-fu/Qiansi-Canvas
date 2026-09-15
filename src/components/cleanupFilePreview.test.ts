import { describe, expect, it } from 'vitest';
import { placeCleanupFilePreview } from './cleanupFilePreview';

describe('cleanup file hover preview placement', () => {
  it('places the preview to the right when there is room', () => {
    expect(
      placeCleanupFilePreview({ left: 100, right: 136, top: 120 }, { width: 1200, height: 800 }),
    ).toEqual({ left: 148, top: 120 });
  });

  it('moves the preview to the left near the right edge', () => {
    expect(
      placeCleanupFilePreview({ left: 860, right: 896, top: 120 }, { width: 920, height: 800 }),
    ).toEqual({ left: 528, top: 120 });
  });

  it('keeps the preview inside a small viewport', () => {
    expect(
      placeCleanupFilePreview({ left: 4, right: 40, top: 760 }, { width: 300, height: 700 }),
    ).toEqual({ left: 12, top: 402 });
  });
});
