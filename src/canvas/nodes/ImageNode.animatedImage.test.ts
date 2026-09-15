import { describe, expect, it } from 'vitest';
import imageNodeSource from './ImageNode.tsx?raw';

describe('video-to-animated-image workflow', () => {
  it('reuses the mounted video decoder and persists the animated WebP as a connected image node', () => {
    expect(imageNodeSource).toContain('videoElement: primaryVideoElement()');
    expect(imageNodeSource).toContain("new File([result.blob], fileName, { type: 'image/webp' })");
    expect(imageNodeSource).toContain(
      "persistImageFile(file, 'storyboard', projectId, controller.signal)",
    );
    expect(imageNodeSource).toContain("mediaMimeType: 'image/webp'");
    expect(imageNodeSource).toContain('animatedFromVideoId: id');
    expect(imageNodeSource).toContain('animatedScalePercent: options.scalePercent ?? 100');
    expect(imageNodeSource).toContain('latestStore.onConnect({');
  });

  it('does not steal selection when generation finishes after the user moved to another node', () => {
    expect(imageNodeSource).toContain('if (useCanvasStore.getState().selectedNodeId === id)');
    expect(imageNodeSource).toContain('selectedNodeId: imageNodeId');
  });

  it('keeps the animated original visible after persistence instead of replacing it with a still preview', () => {
    expect(imageNodeSource).toContain('const isAnimatedImageResult = Boolean(');
    expect(imageNodeSource).toContain('isEffectAsset || isAnimatedImageResult');
  });
});
