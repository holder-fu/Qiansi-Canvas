import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { MediaPreviewModal } from './MediaPreviewModal';

const mediaPreviewState = vi.hoisted(() => ({
  openModal: 'media-preview' as string | null,
  modalNodeId: 'video-source' as string | null,
  nodes: [] as FlowNode[],
  closeModal: vi.fn(),
}));

vi.mock('../store/canvasStore', () => ({
  useCanvasStore: (selector: (state: typeof mediaPreviewState) => unknown) =>
    selector(mediaPreviewState),
}));

const videoNode: FlowNode = {
  id: 'video-source',
  type: 'video',
  position: { x: 0, y: 0 },
  data: {
    kind: 'video',
    title: '参考视频',
    videoUrl: 'http://127.0.0.1:2896/asset-library/files/source-video',
    previewUrl: 'http://127.0.0.1:2896/media-preview/files/source-video.webp',
  },
};

describe('MediaPreviewModal', () => {
  beforeEach(() => {
    mediaPreviewState.nodes = [videoNode];
    mediaPreviewState.openModal = 'media-preview';
    mediaPreviewState.modalNodeId = videoNode.id;
    mediaPreviewState.closeModal.mockClear();
  });

  it('resolves persisted video URLs through the active bridge and keeps the poster', () => {
    const html = renderToStaticMarkup(createElement(MediaPreviewModal));

    expect(html).toContain('src="http://127.0.0.1:2895/asset-library/files/source-video"');
    expect(html).toContain('poster="http://127.0.0.1:2895/media-preview/files/source-video.webp"');
  });

  it('uses the original image source for the full-screen preview', () => {
    const imageNode: FlowNode = {
      id: 'image-source',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '提示词图片',
        originalUrl: 'http://127.0.0.1:2896/asset-library/files/original-image',
        imageUrl: 'http://127.0.0.1:2896/asset-library/files/original-image',
        previewUrl: 'http://127.0.0.1:2896/media-preview/files/original-image.webp',
      },
    };
    mediaPreviewState.nodes = [imageNode];
    mediaPreviewState.modalNodeId = imageNode.id;

    const html = renderToStaticMarkup(createElement(MediaPreviewModal));

    expect(html).toContain('src="http://127.0.0.1:2895/asset-library/files/original-image"');
    expect(html).not.toContain(
      'src="http://127.0.0.1:2895/media-preview/files/original-image.webp"',
    );
  });
});
