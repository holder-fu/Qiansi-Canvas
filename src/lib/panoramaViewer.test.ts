import { describe, expect, it, vi } from 'vitest';
import {
  capturePanoramaFrame,
  clampPanoramaFov,
  clampPanoramaPitch,
  panoramaLookTarget,
} from './panoramaViewer';

describe('panorama viewer geometry', () => {
  it('clamps vertical rotation and zoom to safe viewer ranges', () => {
    expect(clampPanoramaPitch(120)).toBe(85);
    expect(clampPanoramaPitch(-120)).toBe(-85);
    expect(clampPanoramaFov(10)).toBe(35);
    expect(clampPanoramaFov(130)).toBe(95);
  });

  it('maps yaw and pitch to a normalized 3D look target', () => {
    const target = panoramaLookTarget(90, 0);
    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(0);
    expect(target.z).toBeCloseTo(1);
  });

  it('renders and exports the current WebGL view at its real pixel dimensions', async () => {
    const blob = new Blob(['panorama-frame'], { type: 'image/jpeg' });
    const toBlob = vi.fn((callback: BlobCallback) => callback(blob));
    const renderCurrentView = vi.fn();
    const canvas = { width: 1600, height: 1024, toBlob } as unknown as HTMLCanvasElement;

    await expect(capturePanoramaFrame(canvas, renderCurrentView)).resolves.toEqual({
      blob,
      width: 1600,
      height: 1024,
    });
    expect(renderCurrentView).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
  });

  it('rejects a panorama capture when the browser cannot encode the frame', async () => {
    const canvas = {
      width: 1000,
      height: 640,
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement;

    await expect(capturePanoramaFrame(canvas, () => {})).rejects.toThrow('encode-failed');
  });
});
