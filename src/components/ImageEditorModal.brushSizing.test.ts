import { describe, expect, it } from 'vitest';
import source from './ImageEditorModal.tsx?raw';

describe('ImageEditorModal image-aware brush sizing', () => {
  it('initializes every drawing tool from the loaded source-image dimensions once per source', () => {
    expect(source).toContain('const sizing = imageEditorBrushSizing(');
    expect(source).toContain('image.clientWidth');
    expect(source).toContain('image.clientHeight');
    expect(source).toContain('loadedImageKeyRef.current !== sourceKey');
    expect(source).toContain('setBrushSize(sizing.brush.initial)');
    expect(source).toContain('setArrowSize(sizing.arrow.initial)');
    expect(source).toContain('setLabelSize(sizing.label.initial)');
    expect(source).toContain('setMaskSize(sizing.mask.initial)');
  });

  it('uses the active tool image-aware maximum for the size slider', () => {
    expect(source).toContain('const brushSizing = imageEditorBrushSizing(');
    expect(source).toContain('const activeBrushMax =');
    expect(source).toContain('max={activeBrushMax}');
    expect(source).toContain('imageRef.current?.clientWidth');
    expect(source).toContain('imageRef.current?.clientHeight');
    expect(source).not.toContain("max={mode === 'mask' ? 160 : brushTool === 'arrow' ? 40 : 80}");
  });
});
