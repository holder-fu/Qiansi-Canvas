import { describe, expect, it } from 'vitest';
import {
  directorPanoramaBackgroundPitchDegrees,
  directorPanoramaGroundUv,
  directorPanoramaGroundVerticalOffset,
  directorPanoramaRenderPlan,
  isDirectorPanoramaStageReady,
} from './directorPanorama';

describe('director panorama framing', () => {
  it('converts a 2K 16:9 scene into a floor-focused 2:1 stage texture', () => {
    expect(directorPanoramaRenderPlan(2048, 1152, 4096, 2048)).toEqual({
      sourceX: 0,
      sourceY: 128,
      sourceWidth: 2048,
      sourceHeight: 1024,
      outputWidth: 2048,
      outputHeight: 1024,
    });
  });

  it('converts a 4K 16:9 scene into an exact 4096 by 2048 stage texture', () => {
    expect(directorPanoramaRenderPlan(4096, 2304, 4096, 2048)).toEqual({
      sourceX: 0,
      sourceY: 256,
      sourceWidth: 4096,
      sourceHeight: 2048,
      outputWidth: 4096,
      outputHeight: 2048,
    });
  });

  it('center-crops overly wide sources without stretching them', () => {
    expect(directorPanoramaRenderPlan(2560, 1080, 4096, 2048)).toEqual({
      sourceX: 200,
      sourceY: 0,
      sourceWidth: 2160,
      sourceHeight: 1080,
      outputWidth: 2160,
      outputHeight: 1080,
    });
  });

  it('leaves bounded 2:1 textures ready for direct stage use', () => {
    expect(isDirectorPanoramaStageReady(2048, 1024)).toBe(true);
    expect(isDirectorPanoramaStageReady(4096, 2048)).toBe(true);
    expect(isDirectorPanoramaStageReady(2048, 1152)).toBe(false);
    expect(isDirectorPanoramaStageReady(8192, 4096)).toBe(false);
  });

  it('raises the panorama independently from the fine horizon calibration', () => {
    expect(directorPanoramaBackgroundPitchDegrees(-3, 0)).toBe(-3);
    expect(directorPanoramaBackgroundPitchDegrees(-3, 10)).toBe(-21);
    expect(directorPanoramaBackgroundPitchDegrees(30, 30)).toBe(-24);
    expect(directorPanoramaBackgroundPitchDegrees(-30, 100)).toBe(-84);
  });

  it('projects the lower panorama hemisphere onto the stage floor without horizontal drift', () => {
    const original = directorPanoramaGroundUv(8, 12, 0, 0);
    const lifted = directorPanoramaGroundUv(8, 12, 0, 20);

    expect(lifted.u).toBeCloseTo(original.u, 8);
    expect(lifted.v).toBeGreaterThan(original.v);
    expect(directorPanoramaGroundVerticalOffset(0, 20)).toBeCloseTo(0.1, 8);
  });

  it('uses radial floor projection so equal radii share latitude while preserving direction', () => {
    const east = directorPanoramaGroundUv(10, 0, 0, 0);
    const north = directorPanoramaGroundUv(0, 10, 0, 0);

    expect(east.v).toBeCloseTo(north.v, 8);
    expect(east.u).not.toBeCloseTo(north.u, 8);
    expect(east.v).toBeLessThan(0.5);
  });
});
