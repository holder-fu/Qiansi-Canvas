import { beforeEach, describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { useCanvasStore } from './canvasStore';

function node(id: string, selected = false): FlowNode {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    selected,
    data: { kind: 'image', title: id },
  };
}

describe('canvas select-all action', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [node('image-1', true), node('image-2'), node('image-3')],
      selectedNodeId: 'image-1',
      past: [],
      future: [],
    });
  });

  it('selects every node in the current workspace without creating undo history', () => {
    useCanvasStore.getState().selectAllNodes();

    expect(useCanvasStore.getState().nodes.map((item) => [item.id, item.selected])).toEqual([
      ['image-1', true],
      ['image-2', true],
      ['image-3', true],
    ]);
    expect(useCanvasStore.getState().selectedNodeId).toBeNull();
    expect(useCanvasStore.getState().past).toEqual([]);
  });

  it('is a no-op for an empty canvas', () => {
    useCanvasStore.setState({ nodes: [], selectedNodeId: null });
    useCanvasStore.getState().selectAllNodes();

    expect(useCanvasStore.getState().nodes).toEqual([]);
  });
});
