import { describe, expect, it } from 'vitest';
import { calculateThumbnailCoverMetrics, calculateThumbnailCropRegion } from './thumbnailCrop';

describe('thumbnail crop geometry', () => {
  it('covers a 4:3 viewport without stretching a 16:9 source', () => {
    const metrics = calculateThumbnailCoverMetrics(
      { width: 1920, height: 1080 },
      { width: 640, height: 480 },
      1,
    );
    expect(metrics.width / metrics.height).toBeCloseTo(16 / 9, 6);
    expect(metrics.height).toBeCloseTo(480, 6);
    expect(metrics.maxX).toBeCloseTo(106.666667, 5);
    expect(metrics.maxY).toBe(0);
  });

  it('exports the same centered 4:3 crop shown by the viewport', () => {
    const crop = calculateThumbnailCropRegion(
      { width: 1920, height: 1080 },
      { width: 640, height: 480 },
      1,
      0,
      0,
    );
    expect(crop.x).toBeCloseTo(240, 6);
    expect(crop.y).toBe(0);
    expect(crop.width).toBeCloseTo(1440, 6);
    expect(crop.height).toBeCloseTo(1080, 6);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3, 6);
  });

  it('keeps the crop within the source when the preview is moved to an edge', () => {
    const crop = calculateThumbnailCropRegion(
      { width: 1920, height: 1080 },
      { width: 640, height: 480 },
      1,
      106.666667,
      0,
    );
    expect(crop.x).toBeCloseTo(0, 5);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1920);
  });
});
