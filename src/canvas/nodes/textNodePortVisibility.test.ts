import { describe, expect, it } from 'vitest';
import type { FlowNode, NodeKind } from '../nodeTypes';
import { shouldHideTextNodeInputControl } from './textNodePortVisibility';

function node(id: string, kind: NodeKind): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, title: id },
  };
}

describe('first text-node input control', () => {
  it('hides the left + on the first text node even when non-text nodes precede it', () => {
    const nodes = [node('image', 'image'), node('first-text', 'text')];

    expect(shouldHideTextNodeInputControl(nodes, 'first-text')).toBe(true);
  });

  it('keeps the left + visible on later text nodes', () => {
    const nodes = [node('first-text', 'text'), node('second-text', 'text')];

    expect(shouldHideTextNodeInputControl(nodes, 'first-text')).toBe(true);
    expect(shouldHideTextNodeInputControl(nodes, 'second-text')).toBe(false);
  });

  it('promotes the next text node to the hidden root when the former root is removed', () => {
    expect(shouldHideTextNodeInputControl([node('second-text', 'text')], 'second-text')).toBe(true);
  });
});
