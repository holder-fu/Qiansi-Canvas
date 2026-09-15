import { describe, expect, it } from 'vitest';
import {
  closestStandardAspectRatio,
  intrinsicAspectRatio,
  mediaFrameSize,
  resolveMediaFrameSize,
} from './mediaFrameSize';

describe('mediaFrameSize', () => {
  it('keeps landscape media inside the shared frame bounds', () => {
    expect(mediaFrameSize('16:9')).toEqual({ width: 620, height: 349 });
  });

  it('keeps portrait media visible without creating an oversized node', () => {
    expect(mediaFrameSize('9:16')).toEqual({ width: 293, height: 520 });
  });

  it('falls back to 16:9 for an automatic or invalid ratio', () => {
    expect(mediaFrameSize('Auto')).toEqual({ width: 620, height: 349 });
  });

  it('honors bounded presentation frames and rejects unsafe persisted dimensions', () => {
    expect(resolveMediaFrameSize('16:9', 236, 294)).toEqual({ width: 236, height: 294 });
    expect(resolveMediaFrameSize('16:9', 5000, 294)).toEqual({ width: 620, height: 349 });
    expect(resolveMediaFrameSize('16:9', 236, 0)).toEqual({ width: 620, height: 349 });
  });

  it('derives and normalizes intrinsic dimensions from uploaded media', () => {
    expect(intrinsicAspectRatio(1080, 1920)).toBe('9:16');
    expect(intrinsicAspectRatio(1920, 1080)).toBe('16:9');
  });

  it('maps uploaded media to the closest generation-control ratio', () => {
    expect(closestStandardAspectRatio(1000, 1500)).toBe('2:3');
    expect(closestStandardAspectRatio(1080, 1920)).toBe('9:16');
  });
});
