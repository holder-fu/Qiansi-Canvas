import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import type { TrashItem } from '../store/canvasStore';
import {
  trashItemCategories,
  trashItemKindLabel,
  trashItemMatchesCategory,
} from './trashCategories';

function trashItem(...nodes: FlowNode[]): TrashItem {
  return {
    id: 'trash-item',
    projectId: 'project-1',
    workspace: 'views',
    title: '测试项目',
    deletedAt: 1,
    nodes,
    edges: [],
  };
}

function node(
  id: string,
  kind: FlowNode['data']['kind'],
  data: FlowNode['data'] = { kind, title: id },
) {
  return { id, type: kind, position: { x: 0, y: 0 }, data } as FlowNode;
}

describe('trash categories', () => {
  it('classifies scripts and other non-media content as nodes', () => {
    const item = trashItem(node('script', 'script'));

    expect(trashItemCategories(item)).toEqual(new Set(['node']));
    expect(trashItemMatchesCategory(item, 'node')).toBe(true);
    expect(trashItemMatchesCategory(item, 'image')).toBe(false);
    expect(trashItemKindLabel(item)).toBe('脚本');
  });

  it('classifies uploaded media from its stored content', () => {
    expect(
      trashItemCategories(
        trashItem(node('image', 'text', { kind: 'text', title: '图片', imageUrl: '/image.png' })),
      ),
    ).toEqual(new Set(['image']));
    expect(
      trashItemCategories(
        trashItem(node('video', 'text', { kind: 'text', title: '视频', videoUrl: '/video.mp4' })),
      ),
    ).toEqual(new Set(['video']));
    expect(
      trashItemCategories(
        trashItem(node('audio', 'text', { kind: 'text', title: '音频', audioUrl: '/audio.mp3' })),
      ),
    ).toEqual(new Set(['audio']));
  });

  it('makes a grouped deletion visible in every contained content category', () => {
    const item = trashItem(node('group', 'group'), node('image', 'image'), node('video', 'video'));

    expect(trashItemCategories(item)).toEqual(new Set(['node', 'image', 'video']));
    expect(trashItemKindLabel(item)).toBe('节点组');
  });
});
