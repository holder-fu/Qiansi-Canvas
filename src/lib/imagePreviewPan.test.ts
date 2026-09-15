import { describe, expect, it } from 'vitest';
import { imagePreviewPanPosition } from './imagePreviewPan';

describe('image preview panning', () => {
  const start = { clientX: 300, clientY: 200, scrollLeft: 420, scrollTop: 180 };

  it('moves the viewport opposite to the pointer drag so the image follows the hand', () => {
    expect(imagePreviewPanPosition(start, 250, 160)).toEqual({ left: 470, top: 220 });
    expect(imagePreviewPanPosition(start, 340, 230)).toEqual({ left: 380, top: 150 });
  });

  it('keeps the original scroll position before the pointer moves', () => {
    expect(imagePreviewPanPosition(start, 300, 200)).toEqual({ left: 420, top: 180 });
  });
});
