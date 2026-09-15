import { describe, expect, it } from 'vitest';
import source from './PanoramaViewerModal.tsx?raw';

describe('panorama viewer capture', () => {
  it('places a camera action beside the bottom viewer hints', () => {
    expect(source).toContain("t('panorama.capture.aria', '截取当前全景视角')");
    expect(source).toContain('<Camera className="h-4 w-4" />');
    expect(source).toContain('pointer-events-auto flex h-9 w-9');
  });

  it('exports the current WebGL camera view into a durable connected image node', () => {
    expect(source).toContain('preserveDrawingBuffer: true');
    expect(source).toContain('capturePanoramaFrame(renderer.domElement, render)');
    expect(source).toContain('await persistImageFile(');
    expect(source).toContain("store.addNodeWithImage(\n        'image'");
    expect(source).toContain('capturedFromPanoramaId: node.id');
    expect(source).toContain('referenceOnly: true');
    expect(source).toContain('store.onConnect({');
    expect(source).toContain('selectedNodeId: imageNodeId');
    expect(source).toContain('closeModal();');
  });
});
