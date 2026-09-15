import { describe, expect, it } from 'vitest';
import {
  formatVideoMaskRepairTime,
  hasPaintedVideoMask,
  normalizeVideoMaskRepairRange,
  suggestVideoMaskRepairRange,
  videoMaskOverlayToBinaryRgba,
} from './videoMaskRepair';

describe('video mask repair range', () => {
  it('clamps invalid boundaries while keeping the painted keyframe inside the range', () => {
    expect(normalizeVideoMaskRepairRange(10, -2, 4, 8)).toEqual({
      rangeStart: 0,
      rangeEnd: 8,
      keyframeTime: 8,
    });
    expect(normalizeVideoMaskRepairRange(10, 5, 6, 2)).toEqual({
      rangeStart: 2,
      rangeEnd: 6,
      keyframeTime: 2,
    });
  });

  it('keeps a usable minimum range at the end of a short video', () => {
    expect(normalizeVideoMaskRepairRange(0.06, 0.06, 0.06, 0.06)).toEqual({
      rangeStart: 0,
      rangeEnd: 0.06,
      keyframeTime: 0.06,
    });
    expect(normalizeVideoMaskRepairRange(Number.NaN, 1, 2, 1.5)).toEqual({
      rangeStart: 0,
      rangeEnd: 0,
      keyframeTime: 0,
    });
  });

  it('suggests a short two-second repair range around the selected frame', () => {
    expect(suggestVideoMaskRepairRange(10, 6)).toEqual({
      rangeStart: 5,
      rangeEnd: 7,
      keyframeTime: 6,
    });
    expect(suggestVideoMaskRepairRange(10, 0.25)).toEqual({
      rangeStart: 0,
      rangeEnd: 2,
      keyframeTime: 0.25,
    });
    expect(suggestVideoMaskRepairRange(1.2, 1.1)).toEqual({
      rangeStart: 0,
      rangeEnd: 1.2,
      keyframeTime: 1.1,
    });
  });
});

describe('video mask pixels', () => {
  it('detects paint through alpha and exports opaque black/white pixels', () => {
    const overlay = new Uint8ClampedArray([14, 220, 230, 0, 14, 220, 230, 120]);
    expect(hasPaintedVideoMask(overlay)).toBe(true);
    expect([...videoMaskOverlayToBinaryRgba(overlay)]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('rejects malformed pixels and formats sub-second timestamps', () => {
    expect(hasPaintedVideoMask(new Uint8ClampedArray(8))).toBe(false);
    expect(() => videoMaskOverlayToBinaryRgba(new Uint8ClampedArray(3))).toThrow('像素长度无效');
    expect(formatVideoMaskRepairTime(65.25)).toBe('01:05.3');
  });
});
