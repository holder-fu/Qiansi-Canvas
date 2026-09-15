import { describe, expect, it } from 'vitest';
import type { FlowNode } from './nodeTypes';
import {
  arrangeNodesInGrid,
  automaticGridColumns,
  gridColumnOptions,
  gridDimensions,
} from './gridArrangement';

function node(
  id: string,
  x: number,
  y: number,
  width = 300,
  height = 180,
  parentId?: string,
): FlowNode {
  return {
    id,
    type: 'image',
    parentId,
    position: { x, y },
    measured: { width, height },
    data: { kind: 'image', title: id },
  };
}

describe('multi-node grid arrangement', () => {
  it('offers actual column-by-row layouts for the selected count', () => {
    expect(gridDimensions(4, 2)).toEqual({ columns: 2, rows: 2 });
    expect(gridDimensions(6, 2)).toEqual({ columns: 2, rows: 3 });
    expect(gridDimensions(6, 3)).toEqual({ columns: 3, rows: 2 });
    expect(gridColumnOptions(6)).toEqual([2, 3, 4, 5, 6]);
    expect(automaticGridColumns(6)).toBe(3);
    expect(automaticGridColumns(9)).toBe(3);
  });

  it('keeps visual reading order and aligns heterogeneous nodes to a compact grid', () => {
    const nodes = [
      node('bottom-right', 520, 420, 260, 160),
      node('top-right', 500, 100, 300, 180),
      node('bottom-left', 100, 400, 280, 170),
      node('top-left', 120, 110, 240, 150),
    ];

    const result = arrangeNodesInGrid(
      nodes,
      ['bottom-right', 'top-right', 'bottom-left', 'top-left'],
      2,
      20,
    );

    expect(result?.columns).toBe(2);
    expect(result?.rows).toBe(2);
    expect(result?.positions.map(({ id }) => id)).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    expect(result?.positions).toEqual([
      { id: 'top-left', position: { x: 130, y: 115 } },
      { id: 'top-right', position: { x: 420, y: 100 } },
      { id: 'bottom-left', position: { x: 110, y: 305 } },
      { id: 'bottom-right', position: { x: 440, y: 310 } },
    ]);
  });

  it('keeps nodes in one parent coordinate space and refuses mixed hierarchy levels', () => {
    const siblings = [
      node('a', 40, 40, 200, 120, 'group-a'),
      node('b', 320, 60, 200, 120, 'group-a'),
    ];
    expect(arrangeNodesInGrid(siblings, ['a', 'b'], 2)?.parentId).toBe('group-a');

    const mixed = [...siblings, node('outside', 800, 80)];
    expect(arrangeNodesInGrid(mixed, ['a', 'outside'], 2)).toBeNull();
  });
});
