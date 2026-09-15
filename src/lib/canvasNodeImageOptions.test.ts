import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { placeholderImage } from '../canvas/placeholders';
import {
  canvasImageOptionToFile,
  canvasNodeImageOptions,
  sortCanvasNodeImageOptions,
} from './canvasNodeImageOptions';

function node(id: string, data: FlowNode['data']): FlowNode {
  return { id, type: data.kind, position: { x: 0, y: 0 }, data };
}

describe('canvas node image options', () => {
  it('reads a selected canvas image into the reusable upload file contract', async () => {
    const file = await canvasImageOptionToFile(
      {
        id: 'image:0',
        nodeId: 'image',
        title: '画布图片',
        url: 'data:image/png;base64,iVBORw0KGgo=',
      },
      'canvas-prompt',
    );

    expect(file.name).toBe('canvas-prompt.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBeGreaterThan(0);
  });

  it('rejects a canvas source that no longer resolves to an image', async () => {
    await expect(
      canvasImageOptionToFile(
        {
          id: 'image:0',
          nodeId: 'image',
          title: '失效图片',
          url: 'data:text/plain;base64,bm90IGFuIGltYWdl',
        },
        'canvas-prompt',
      ),
    ).rejects.toThrow('Canvas source is not an image');
  });

  it('lists owned full-resolution images and excludes inherited previews', () => {
    const options = canvasNodeImageOptions([
      node('generated', {
        kind: 'image',
        title: '角色结果',
        originalUrl: 'data:image/png;base64,original',
        imageUrl: 'data:image/png;base64,preview',
        images: ['data:image/png;base64,original', 'data:image/png;base64,second'],
      }),
      node('inherited', {
        kind: 'image',
        title: '继承预览',
        imagePreviewUrl: 'data:image/png;base64,inherited',
      }),
    ]);

    expect(options.map(({ id, title, url }) => ({ id, title, url }))).toEqual([
      {
        id: 'generated:0',
        title: '角色结果 · 1',
        url: 'data:image/png;base64,original',
      },
      {
        id: 'generated:1',
        title: '角色结果 · 2',
        url: 'data:image/png;base64,second',
      },
    ]);
  });

  it('excludes video and audio nodes instead of rendering their media through an image element', () => {
    const options = canvasNodeImageOptions([
      node('video', {
        kind: 'video',
        title: '视频2',
        originalUrl: '/asset-library/files/video-original.mp4',
        videoUrl: '/asset-library/files/video-original.mp4',
      }),
      node('video-with-opaque-url', {
        kind: 'video',
        title: '视频3',
        originalUrl: '/asset-library/files/opaque-video-id',
      }),
      node('audio', {
        kind: 'audio',
        title: '音频1',
        originalUrl: 'data:audio/mpeg;base64,audio',
      }),
      node('image', {
        kind: 'image',
        title: '真实图片',
        originalUrl: '/asset-library/files/opaque-image-id',
      }),
    ]);

    expect(options.map((option) => option.title)).toEqual(['真实图片']);
  });

  it('excludes built-in empty-state artwork and non-image files from otherwise visual nodes', () => {
    const placeholder = placeholderImage('generator').imageUrl;
    expect(placeholder).toBeTruthy();

    const options = canvasNodeImageOptions([
      node('empty-generator', {
        kind: 'generator',
        title: '未生成',
        imageUrl: placeholder,
      }),
      node('mixed-output', {
        kind: 'output',
        title: '结果',
        images: [
          'data:video/mp4;base64,video',
          'https://example.test/generated.webm?download=1',
          'data:image/webp;base64,image',
        ],
      }),
    ]);

    expect(options.map(({ title, url }) => ({ title, url }))).toEqual([
      { title: '结果', url: 'data:image/webp;base64,image' },
    ]);
  });

  it('lists the newest nodes first while preserving image order within each node', () => {
    const nodes = [
      node('oldest', {
        kind: 'image',
        title: '旧节点',
        originalUrl: 'data:image/png;base64,oldest',
      }),
      node('newest', {
        kind: 'image',
        title: '最新节点',
        images: ['data:image/png;base64,new-1', 'data:image/png;base64,new-2'],
      }),
    ];

    expect(canvasNodeImageOptions(nodes).map((option) => option.id)).toEqual([
      'newest:0',
      'newest:1',
      'oldest:0',
    ]);
    expect(nodes.map((item) => item.id)).toEqual(['oldest', 'newest']);
  });

  it('switches to oldest-node-first without reversing images inside a node', () => {
    const newestFirst = [
      { id: 'newest:0', nodeId: 'newest', title: '最新 · 1', url: 'new-1' },
      { id: 'newest:1', nodeId: 'newest', title: '最新 · 2', url: 'new-2' },
      { id: 'oldest:0', nodeId: 'oldest', title: '最早', url: 'old' },
    ];

    expect(sortCanvasNodeImageOptions(newestFirst, 'oldest').map((option) => option.id)).toEqual([
      'oldest:0',
      'newest:0',
      'newest:1',
    ]);
    expect(sortCanvasNodeImageOptions(newestFirst, 'newest')).toEqual(newestFirst);
    expect(newestFirst.map((option) => option.id)).toEqual(['newest:0', 'newest:1', 'oldest:0']);
  });
});
