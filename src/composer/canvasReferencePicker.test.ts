import { describe, expect, it } from 'vitest';
import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import { pickableCanvasMediaReference } from './canvasReferencePicker';

function node(id: string, kind: NodeKind, data: Partial<FlowNode['data']> = {}) {
  return { id, data: { kind, title: id, ...data } } as Pick<FlowNode, 'id' | 'data'>;
}

describe('canvas reference picker', () => {
  it('exposes image, video and audio outputs with their real media type', () => {
    expect(
      pickableCanvasMediaReference(
        node('image', 'image', { imageUrl: '/asset-library/files/image-reference' }),
      ),
    ).toMatchObject({ id: 'image-image-0', type: 'image' });
    expect(
      pickableCanvasMediaReference(
        node('video', 'video', { videoUrl: '/asset-library/files/video-reference' }),
      ),
    ).toMatchObject({ id: 'video-video', type: 'video' });
    expect(
      pickableCanvasMediaReference(
        node('audio', 'audio', { audioUrl: '/asset-library/files/audio-reference' }),
      ),
    ).toMatchObject({ id: 'audio-audio', type: 'audio' });
  });

  it('rejects empty media nodes and non-media nodes', () => {
    expect(pickableCanvasMediaReference(node('empty-audio', 'audio'))).toBeNull();
    expect(pickableCanvasMediaReference(node('text', 'text', { outputText: 'hello' }))).toBeNull();
  });
});
