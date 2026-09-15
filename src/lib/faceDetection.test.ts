import { describe, expect, it } from 'vitest';
import { normalizeFaceBoundingBox } from './faceDetection';

describe('face detection geometry', () => {
  it('normalizes and pads a detected pixel bounding box', () => {
    const region = normalizeFaceBoundingBox(
      { originX: 200, originY: 100, width: 400, height: 500, angle: 0 },
      1000,
      1000,
      0.1,
    );
    expect(region?.x).toBeCloseTo(0.16);
    expect(region?.y).toBeCloseTo(0.05);
    expect(region?.width).toBeCloseTo(0.48);
    expect(region?.height).toBeCloseTo(0.6);
  });

  it('clamps padded regions to the image bounds', () => {
    expect(
      normalizeFaceBoundingBox(
        { originX: 0, originY: 0, width: 200, height: 200, angle: 0 },
        1000,
        1000,
        0.2,
      ),
    ).toEqual({ x: 0, y: 0, width: 0.24, height: 0.24 });
  });
});
