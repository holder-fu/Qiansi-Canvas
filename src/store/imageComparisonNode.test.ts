import { beforeEach, describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { useCanvasStore } from './canvasStore';

function sourceNode(id: string, imageUrl: string, x: number): FlowNode {
  return {
    id,
    type: 'image',
    position: { x, y: 100 },
    style: { width: 350, height: 220 },
    selected: true,
    data: { kind: 'image', title: id, imageUrl, images: [imageUrl], output: imageUrl },
  };
}

describe('createImageComparison', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [
        sourceNode('image-a', 'data:image/png;base64,image-a', 0),
        sourceNode('image-b', 'data:image/png;base64,image-b', 420),
      ],
      edges: [],
      past: [],
      future: [],
      selectedNodeId: null,
    });
  });

  it('creates, connects, selects and materializes one comparison node in one undo step', () => {
    const id = useCanvasStore.getState().createImageComparison(['image-a', 'image-b']);
    expect(id).toEqual(expect.any(String));

    const state = useCanvasStore.getState();
    const comparison = state.nodes.find((node) => node.id === id);
    expect(comparison).toMatchObject({
      type: 'image-compare',
      selected: true,
      data: {
        kind: 'image-compare',
        title: '图片对比',
        comparisonPosition: 50,
        portInputs: {
          images: ['data:image/png;base64,image-a', 'data:image/png;base64,image-b'],
        },
      },
    });
    expect(state.edges).toHaveLength(2);
    expect(state.edges.every((edge) => edge.target === id && edge.targetHandle === 'images')).toBe(
      true,
    );
    expect(state.past).toHaveLength(1);

    state.undo();
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['image-a', 'image-b']);
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it('does not create a node when either source has no real image', () => {
    useCanvasStore.setState({
      nodes: [
        sourceNode('image-a', 'data:image/png;base64,image-a', 0),
        {
          id: 'empty',
          type: 'image',
          position: { x: 420, y: 100 },
          data: { kind: 'image', title: 'empty' },
        },
      ],
    });
    expect(useCanvasStore.getState().createImageComparison(['image-a', 'empty'])).toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });
});
