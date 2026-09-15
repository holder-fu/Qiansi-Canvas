import { describe, expect, it } from 'vitest';
import { resolveVideoCropPixels, resolveVideoEditPlan } from './videoCrop';

describe('resolveVideoCropPixels', () => {
  it('maps a normalized crop rectangle onto source video pixels', () => {
    expect(resolveVideoCropPixels(1920, 1080, { x: 0.1, y: 0.2, width: 0.5, height: 0.6 })).toEqual(
      { x: 192, y: 216, width: 960, height: 648 },
    );
  });

  it('keeps an out-of-range crop rectangle inside the source frame', () => {
    expect(resolveVideoCropPixels(1280, 720, { x: 0.95, y: -1, width: 0.5, height: 2 })).toEqual({
      x: 640,
      y: 0,
      width: 640,
      height: 720,
    });
  });
});

describe('resolveVideoEditPlan', () => {
  it('keeps the full frame while applying a real trim range', () => {
    expect(resolveVideoEditPlan(1280, 720, 12, { range: { start: 2.5, end: 8.25 } })).toEqual({
      crop: { x: 0, y: 0, width: 1280, height: 720 },
      range: { start: 2.5, end: 8.25 },
    });
  });

  it('clamps an invalid trim range before encoding', () => {
    expect(resolveVideoEditPlan(640, 360, 5, { range: { start: -3, end: 99 } }).range).toEqual({
      start: 0,
      end: 5,
    });
  });
});
