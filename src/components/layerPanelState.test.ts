import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { moveLayerNode, toggleLayerNodeVisibility } from './layerPanelState';

function node(id: string, kind: FlowNode['data']['kind'] = 'image'): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    zIndex: kind === 'group' ? -1 : 1,
    data: { kind, title: id },
  };
}

describe('layer panel state transitions', () => {
  it('toggles visibility immutably', () => {
    const source = [node('a'), node('b')];
    const next = toggleLayerNodeVisibility(source, 'a');

    expect(next?.[0]?.hidden).toBe(true);
    expect(source[0]?.hidden).toBeUndefined();
    expect(next?.[1]).toBe(source[1]);
  });

  it('moves and reindexes layers without mutating the history source', () => {
    const source = [node('a'), node('b'), node('group', 'group')];
    const next = moveLayerNode(source, 'a', 'up');

    expect(next?.map((item) => item.id)).toEqual(['b', 'a', 'group']);
    expect(next?.map((item) => item.zIndex)).toEqual([1, 2, -1]);
    expect(source.map((item) => item.zIndex)).toEqual([1, 1, -1]);
  });

  it('rejects missing nodes and moves past either boundary', () => {
    const source = [node('a'), node('b')];

    expect(moveLayerNode(source, 'missing', 'up')).toBeNull();
    expect(moveLayerNode(source, 'b', 'up')).toBeNull();
    expect(moveLayerNode(source, 'a', 'down')).toBeNull();
  });
});
