import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import type { TrashItem } from '../store/canvasStore';
import { itemMedia, itemText } from './trashPreview';

const trashModalSource = readFileSync(
  fileURLToPath(new URL('./TrashModal.tsx', import.meta.url)),
  'utf8',
);

function trashNode(data: FlowNode['data']): TrashItem {
  return {
    id: 'trash-1',
    projectId: 'project-1',
    workspace: 'views',
    title: '已删除内容',
    deletedAt: 1,
    nodes: [{ id: 'node-1', type: 'image', position: { x: 0, y: 0 }, data }],
    edges: [],
  };
}

describe('TrashModal previews', () => {
  it('opens image cleanup previews on hover or keyboard focus outside the clipped list', () => {
    expect(trashModalSource).toContain('onMouseEnter={(event) =>');
    expect(trashModalSource).toContain('onFocus={(event) =>');
    expect(trashModalSource).toContain('createPortal(');
    expect(trashModalSource).toContain('role="tooltip"');
    expect(trashModalSource).toContain('className="max-h-full max-w-full object-contain"');
  });

  it('resolves persisted image previews through the active bridge', () => {
    const media = itemMedia(
      trashNode({
        kind: 'image',
        title: '角色图',
        imageUrl: 'https://remote.example/expired.png',
        previewUrl: 'http://127.0.0.1:2896/media-preview/files/preview_123456789012.webp',
      }),
    );
    expect(media).toEqual({
      type: 'image',
      url: 'http://127.0.0.1:2895/media-preview/files/preview_123456789012.webp',
    });
  });

  it('keeps video sources and persisted posters visible after a bridge restart', () => {
    const media = itemMedia(
      trashNode({
        kind: 'video',
        title: '参考视频',
        videoUrl: 'http://127.0.0.1:2896/asset-library/files/video_123456',
        previewUrl: 'http://127.0.0.1:2896/media-preview/files/preview_123456789012.webp',
      }),
    );
    expect(media).toEqual({
      type: 'video',
      url: 'http://127.0.0.1:2895/asset-library/files/video_123456',
      posterUrl: 'http://127.0.0.1:2895/media-preview/files/preview_123456789012.webp',
    });
  });

  it('exposes audio and text content instead of only a generic node icon', () => {
    const audio = itemMedia(
      trashNode({
        kind: 'audio',
        title: '音频',
        audioUrl: 'http://127.0.0.1:2896/asset-library/files/audio_123456',
      }),
    );
    expect(audio).toEqual({
      type: 'audio',
      url: 'http://127.0.0.1:2895/asset-library/files/audio_123456',
    });
    expect(
      itemText(trashNode({ kind: 'text', title: '提示词', prompt: '古风少女，镜头推进。' })),
    ).toBe('古风少女，镜头推进。');
  });
});
