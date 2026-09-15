import { describe, expect, it } from 'vitest';
import source from './ImageEditorModal.tsx?raw';

describe('ImageEditorModal image eraser', () => {
  it('offers a localized eraser beside the freehand brush', () => {
    expect(source).toContain("['free', Paintbrush, '自由画笔']");
    expect(source).toContain("['eraser', Eraser, '橡皮擦']");
    expect(source).toContain("t('imageEditor.brush.eraserHint'");
    expect(source).not.toContain('Pipette');
    expect(source).not.toContain('data-eraser-color-controls');
  });

  it('keeps erasure pixels in an independent mask and includes them in history', () => {
    expect(source).toContain('const erasureMaskRef = useRef<HTMLCanvasElement | null>(null)');
    expect(source).toContain('erasureUndo: ImageData[]');
    expect(source).toContain('erasureRedo: ImageData[]');
    expect(source).toContain('history.erasureUndo.push(');
    expect(source).toContain('history.erasureRedo.push(');
  });

  it('composites the image, annotations and erasure mask for both preview and PNG export', () => {
    expect(source).toContain('renderBrushCompositePreview');
    expect(source).toContain('context.drawImage(image, 0, 0, preview.width, preview.height)');
    expect(source).toContain('context.drawImage(overlay, 0, 0)');
    expect(source).toContain('applyImageErasureMask(context, erasureMask)');
    expect(source).toContain("canvas.toDataURL('image/png')");
  });
});
