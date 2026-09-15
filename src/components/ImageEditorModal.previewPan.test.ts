import { describe, expect, it } from 'vitest';
import source from './ImageEditorModal.tsx?raw';

describe('ImageEditorModal preview panning', () => {
  it('captures pointer drags only on the preview image surface', () => {
    expect(source).toContain("data-image-preview-pan-target={mode === 'preview' ? 'true'");
    expect(source).toContain("onPointerDown={mode === 'preview' ? beginPreviewPan : undefined}");
    expect(source).toContain("mode === 'preview' ? movePreviewPan");
    expect(source).toContain("mode === 'preview' ? endPreviewPan");
    expect(source).toContain('cursor-grabbing touch-none select-none');
    expect(source).toContain('cursor-grab touch-none select-none');
  });

  it('keeps crop and drawing modes on their existing pointer handlers', () => {
    expect(source).toContain("mode === 'crop' ? moveCrop : undefined");
    expect(source).toContain("mode === 'crop' ? endCrop : undefined");
    expect(source).toContain('onPointerDown={beginDrawing}');
  });

  it('keeps every zoomed preview edge inside positive scroll coordinates', () => {
    expect(source).toContain("transformOrigin: mode === 'preview' ? 'top left' : 'center'");
    expect(source).toContain('data-image-preview-overflow-origin={');
    expect(source).toContain("mode === 'preview' && zoom > 1");
    expect(source).toContain("? 'items-start justify-start'");
    expect(source).toContain(": 'items-center justify-center'");
  });
});

describe('ImageEditorModal session initialization', () => {
  it('does not reset the selected tool when persistence replaces the node object', () => {
    expect(source).toContain('const initializedSessionRef = useRef<string | null>(null)');
    expect(source).toContain('const editorSessionKey = isOpen');
    expect(source).toContain('if (initializedSessionRef.current === editorSessionKey) return');
    expect(source).toContain('initializedSessionRef.current = editorSessionKey');
    expect(source).not.toContain('if (isOpen) resetEditor()');
  });

  it('recovers a cached image that loaded before the session reset effect', () => {
    expect(source).toContain('setNatural(persistedNatural)');
    expect(source).toContain(
      'image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0',
    );
    expect(source).toContain('initializeLoadedImage(image)');
    expect(source).toContain('setSourceReady(true)');
    expect(source).toContain('loadedImageKeyRef.current !== sourceKey');
  });

  it('keeps destructive apply actions locked until the displayed source is decoded', () => {
    expect(source).toContain('!sourceReady ||');
    expect(source).toContain('disabled={busy || !natural || !sourceReady}');
  });
});
