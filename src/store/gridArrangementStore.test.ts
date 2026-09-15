import { beforeEach, describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { useCanvasStore } from './canvasStore';

function imageNode(id: string, x: number, y: number): FlowNode {
  return {
    id,
    type: 'image',
    position: { x, y },
    measured: { width: 300, height: 180 },
    selected: true,
    data: { kind: 'image', title: id },
  };
}

describe('canvas grid arrangement action', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [
        imageNode('bottom-right', 500, 400),
        imageNode('top-left', 100, 100),
        imageNode('bottom-left', 100, 400),
        imageNode('top-right', 500, 100),
      ],
      edges: [],
      past: [],
      future: [],
    });
  });

  it('applies a 2x2 grid as one undoable canvas operation', () => {
    const before = useCanvasStore.getState().nodes.map((node) => ({
      id: node.id,
      position: node.position,
    }));

    expect(
      useCanvasStore
        .getState()
        .arrangeNodesInGrid(['bottom-right', 'top-left', 'bottom-left', 'top-right'], 2),
    ).toBe(true);

    expect(useCanvasStore.getState().past).toHaveLength(1);
    expect(
      useCanvasStore.getState().nodes.map((node) => ({ id: node.id, position: node.position })),
    ).toEqual([
      { id: 'bottom-right', position: { x: 432, y: 312 } },
      { id: 'top-left', position: { x: 100, y: 100 } },
      { id: 'bottom-left', position: { x: 100, y: 312 } },
      { id: 'top-right', position: { x: 432, y: 100 } },
    ]);

    useCanvasStore.getState().undo();
    expect(
      useCanvasStore.getState().nodes.map((node) => ({ id: node.id, position: node.position })),
    ).toEqual(before);
  });

  it('does not create history when the requested nodes span different parent levels', () => {
    useCanvasStore.setState({
      nodes: [
        { ...imageNode('nested', 20, 20), parentId: 'group-a' },
        imageNode('outside', 500, 100),
      ],
      past: [],
    });

    expect(useCanvasStore.getState().arrangeNodesInGrid(['nested', 'outside'], 2)).toBe(false);
    expect(useCanvasStore.getState().past).toHaveLength(0);
  });
});
