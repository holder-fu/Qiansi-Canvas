import { describe, expect, it, vi } from 'vitest';
import {
  applyImageErasureMask,
  clampCropRect,
  editedImageName,
  fitCropRect,
  gridSplitRects,
  imageEditorBrushSizing,
  imageEditorKnownSize,
  type ImageEditorBrushTool,
} from './imageEditing';

describe('image editing geometry', () => {
  it('exposes eraser as a brush tool and applies its mask with destination-out compositing', () => {
    const tool: ImageEditorBrushTool = 'eraser';
    const mask = {} as HTMLCanvasElement;
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      globalCompositeOperation: 'source-over',
    } as unknown as CanvasRenderingContext2D;

    applyImageErasureMask(context, mask);

    expect(tool).toBe('eraser');
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.globalCompositeOperation).toBe('destination-out');
    expect(context.drawImage).toHaveBeenCalledWith(mask, 0, 0);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('fits a requested aspect ratio inside the editable image', () => {
    const rect = fitCropRect(16 / 9);
    expect(rect.width / rect.height).toBeCloseTo(16 / 9);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1);
  });

  it('clamps a moved crop rectangle without changing its size', () => {
    expect(clampCropRect({ x: 0.9, y: -0.2, width: 0.4, height: 0.3 })).toEqual({
      x: 0.6,
      y: 0,
      width: 0.4,
      height: 0.3,
    });
  });

  it('creates stable row-major grid cells and removes the requested gap', () => {
    const rects = gridSplitRects(1200, 900, 2, 3, 20);
    expect(rects).toHaveLength(6);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, row: 0, column: 0 });
    expect(rects[5]).toMatchObject({ row: 1, column: 2 });
    expect(rects[0]?.width).toBe(390);
    expect(rects[1]?.x).toBe(410);
  });

  it('names edited PNGs without duplicating the old extension', () => {
    expect(editedImageName('portrait.jpg', 'crop')).toBe('portrait_crop.png');
  });

  it('keeps precise baseline brush controls for images up to 2K', () => {
    expect(imageEditorBrushSizing(1920, 1080)).toEqual({
      scale: 1,
      brush: { initial: 24, max: 80 },
      arrow: { initial: 8, max: 40 },
      label: { initial: 10, max: 80 },
      mask: { initial: 42, max: 160 },
    });
  });

  it('grows initial brush sizes and slider ranges with larger source images', () => {
    expect(imageEditorBrushSizing(4096, 2160)).toEqual({
      scale: 2,
      brush: { initial: 48, max: 160 },
      arrow: { initial: 16, max: 80 },
      label: { initial: 20, max: 160 },
      mask: { initial: 84, max: 320 },
    });
  });

  it('keeps numeric markers visually consistent when large originals are fitted into the editor', () => {
    const largeSquare = imageEditorBrushSizing(5792, 5792, 630, 630);
    const smallerSquare = imageEditorBrushSizing(1024, 1024, 354, 354);

    expect(largeSquare.label.initial).toBe(77);
    expect(smallerSquare.label.initial).toBe(25);
    expect(Math.abs((largeSquare.label.initial * 2.2 * 0.82 * 630) / 5792 - 15)).toBeLessThan(1);
    expect(Math.abs((smallerSquare.label.initial * 2.2 * 0.82 * 354) / 1024 - 15)).toBeLessThan(1);
  });

  it('caps extreme and invalid image dimensions safely', () => {
    expect(imageEditorBrushSizing(32768, 32768).scale).toBe(8);
    expect(imageEditorBrushSizing(Number.NaN, -10).scale).toBe(1);
  });

  it('reuses valid persisted dimensions without accepting incomplete metadata', () => {
    expect(imageEditorKnownSize(2048, 1152)).toEqual({ width: 2048, height: 1152 });
    expect(imageEditorKnownSize(1024.4, 768.6)).toEqual({ width: 1024, height: 769 });
    expect(imageEditorKnownSize(2048, null)).toBeNull();
    expect(imageEditorKnownSize(Number.NaN, 1152)).toBeNull();
    expect(imageEditorKnownSize(0, 1152)).toBeNull();
  });
});
