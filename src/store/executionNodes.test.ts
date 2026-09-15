import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowEdge, FlowNode } from '../canvas/nodeTypes';

const renderTimeline = vi.hoisted(() => vi.fn());

vi.mock('../services/timeline', () => ({ renderTimeline }));

import { useCanvasStore } from './canvasStore';

function videoSource(): FlowNode {
  return {
    id: 'clip-1',
    type: 'video',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      title: '片段',
      videoUrl: 'https://cdn.example.test/clip.mp4',
      videos: ['https://cdn.example.test/clip.mp4'],
      output: 'https://cdn.example.test/clip.mp4',
    },
  };
}

function videoComposition(): FlowNode {
  return {
    id: 'composition',
    type: 'video-comp',
    position: { x: 700, y: 0 },
    data: { kind: 'video-comp', title: '视频合成', genParams: { duration: 7 } },
  };
}

const clipEdge: FlowEdge = {
  id: 'clip-edge',
  source: 'clip-1',
  target: 'composition',
  sourceHandle: 'video',
  targetHandle: 'clips',
  type: 'flow',
};

describe('real executable utility nodes', () => {
  beforeEach(() => {
    renderTimeline.mockReset();
    useCanvasStore.setState({
      nodes: [videoSource(), videoComposition()],
      edges: [clipEdge],
      past: [],
      future: [],
      genParams: {
        viewCount: 3,
        aspectRatio: '16:9',
        videoAspectRatio: 'Auto',
        quality: 'standard',
        count: 1,
        duration: 5,
      },
    });
  });

  it('runs the FFmpeg timeline job and stores its final video output', async () => {
    renderTimeline.mockResolvedValue({
      id: 'render_1',
      status: 'ready',
      progress: 100,
      output: '合成完成',
      url: 'http://127.0.0.1:2895/exports/render_1.mp4',
    });

    await useCanvasStore.getState().generateNode('composition');

    expect(renderTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        clips: [
          {
            source: 'https://cdn.example.test/clip.mp4',
            duration: 7,
          },
        ],
      }),
    );
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'composition')?.data,
    ).toMatchObject({
      generating: false,
      progress: 100,
      videoUrl: 'http://127.0.0.1:2895/exports/render_1.mp4',
      output: 'http://127.0.0.1:2895/exports/render_1.mp4',
    });
  });

  it('re-runs the connected executable node and collects each loop result', async () => {
    renderTimeline
      .mockResolvedValueOnce({
        id: 'render_a',
        status: 'ready',
        progress: 100,
        url: 'http://127.0.0.1:2895/exports/render_a.mp4',
      })
      .mockResolvedValueOnce({
        id: 'render_b',
        status: 'ready',
        progress: 100,
        url: 'http://127.0.0.1:2895/exports/render_b.mp4',
      });
    useCanvasStore.setState((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: 'loop-1',
          type: 'loop',
          position: { x: 1400, y: 0 },
          data: { kind: 'loop', title: '循环', genParams: { count: 2 } },
        },
      ],
      edges: [
        ...state.edges,
        {
          id: 'loop-edge',
          source: 'composition',
          target: 'loop-1',
          sourceHandle: 'video',
          targetHandle: 'in',
          type: 'flow',
        },
      ],
    }));

    await useCanvasStore.getState().generateNode('loop-1');

    expect(renderTimeline).toHaveBeenCalledTimes(2);
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'loop-1')?.data,
    ).toMatchObject({
      generating: false,
      progress: 100,
      output: [
        'http://127.0.0.1:2895/exports/render_a.mp4',
        'http://127.0.0.1:2895/exports/render_b.mp4',
      ],
      videos: [
        'http://127.0.0.1:2895/exports/render_a.mp4',
        'http://127.0.0.1:2895/exports/render_b.mp4',
      ],
    });
  });
});
