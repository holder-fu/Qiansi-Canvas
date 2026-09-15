import { describe, expect, it, vi } from 'vitest';
import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import {
  executeIndependentSelectionConnectionPlans,
  planIndependentSelectionConnections,
  resolveIndependentSelectionConnectTargetKinds,
  resolveSelectionConnectTargetKinds,
} from './selectionConnectTargets';

function node(id: string, kind: NodeKind, output?: string): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    selected: true,
    data: { kind, title: id, ...(output ? { output } : {}) },
  };
}

describe('multi-selection connection targets', () => {
  it('keeps only targets that consume every mixed text and image source', () => {
    expect(
      resolveSelectionConnectTargetKinds([
        node('prompt-a', 'text', '人物提示'),
        node('prompt-b', 'text', '场景提示'),
        node('reference', 'image', 'data:image/png;base64,reference'),
      ]),
    ).toEqual(['text', 'image', 'video']);
  });

  it('offers script generation only for an all-text selection', () => {
    expect(
      resolveSelectionConnectTargetKinds([
        node('outline', 'text', '故事梗概'),
        node('character', 'text', '人物设定'),
      ]),
    ).toEqual(['text', 'image', 'video', 'script']);
  });

  it('offers real video composition only for video clips and at most one audio track', () => {
    expect(
      resolveSelectionConnectTargetKinds([
        node('clip-a', 'video', 'https://example.test/a.mp4'),
        node('clip-b', 'video', 'https://example.test/b.mp4'),
        node('music', 'audio', 'https://example.test/music.mp3'),
      ]),
    ).toEqual(['video-comp']);
  });

  it('does not offer a blank audio target or a video target that would discard extra videos', () => {
    expect(
      resolveSelectionConnectTargetKinds([
        node('clip-a', 'video', 'https://example.test/a.mp4'),
        node('clip-b', 'video', 'https://example.test/b.mp4'),
      ]),
    ).toEqual(['text', 'video-comp']);
  });

  it('does not show a create menu when selected sources have no consumable output', () => {
    expect(
      resolveSelectionConnectTargetKinds([node('group-a', 'group'), node('group-b', 'group')]),
    ).toEqual([]);
  });

  it('offers model-gated targets when six selected images already contain outputs', () => {
    const first = node('images-a', 'image');
    first.data.images = ['a.png', 'b.png', 'c.png'];
    const second = node('images-b', 'image');
    second.data.images = ['d.png', 'e.png', 'f.png'];

    expect(resolveSelectionConnectTargetKinds([first, second])).toEqual(['text', 'image', 'video']);
  });

  it('plans one independent text target for every selected source', () => {
    const selected = [
      node('reference-a', 'image', 'data:image/png;base64,a'),
      node('reference-b', 'image', 'data:image/png;base64,b'),
      node('reference-c', 'image', 'data:image/png;base64,c'),
    ];

    expect(resolveIndependentSelectionConnectTargetKinds(selected)).toEqual(['text', 'image']);
    const plans = planIndependentSelectionConnections(selected, 'text');
    expect(plans).toEqual([
      { sourceId: 'reference-a', sourceHandle: 'image', targetKind: 'text' },
      { sourceId: 'reference-b', sourceHandle: 'image', targetKind: 'text' },
      { sourceId: 'reference-c', sourceHandle: 'image', targetKind: 'text' },
    ]);

    const createTarget = vi.fn();
    expect(executeIndependentSelectionConnectionPlans(plans, createTarget)).toBe(3);
    expect(createTarget.mock.calls).toEqual(plans.map((plan) => [plan]));
  });

  it('does not plan a partial independent batch when one source cannot feed the target kind', () => {
    const selected = [
      node('reference', 'image', 'data:image/png;base64,reference'),
      node('clip', 'video', 'https://example.test/clip.mp4'),
    ];

    expect(resolveIndependentSelectionConnectTargetKinds(selected)).toEqual(['text']);
    expect(planIndependentSelectionConnections(selected, 'image')).toEqual([]);
  });
});
