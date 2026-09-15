import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { selectNodeFromPanel } from './nodePanelSelection';

function node(id: string, selected = false): FlowNode {
  return {
    id,
    type: 'text',
    position: { x: 0, y: 0 },
    selected,
    data: { kind: 'text', title: id },
  };
}

describe('node panel selection', () => {
  it('selects only the requested node and synchronizes its id', () => {
    const first = node('first', true);
    const second = node('second');

    const selection = selectNodeFromPanel([first, second], 'second');

    expect(selection?.selectedNodeId).toBe('second');
    expect(selection?.nodes.map((item) => [item.id, item.selected])).toEqual([
      ['first', false],
      ['second', true],
    ]);
  });

  it('does not manufacture selection state for a removed node', () => {
    expect(selectNodeFromPanel([node('existing')], 'missing')).toBeNull();
  });
});
