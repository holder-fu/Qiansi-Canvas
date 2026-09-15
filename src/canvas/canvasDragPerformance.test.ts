import { describe, expect, it } from 'vitest';
import { adoptUserNodes, type NodeLookup, type ParentLookup } from '@xyflow/system';
import type { FlowNode } from './nodeTypes';
import { createRenderedNodeProjector } from './renderedNodes';
import { canvasNodeMediaDataChanged, collectCanvasMediaStrings } from '../lib/canvasMediaMigration';

function imageNodes(count: number): FlowNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `image-${index}`,
    type: 'image',
    position: { x: (index % 10) * 400, y: Math.floor(index / 10) * 300 },
    data: {
      kind: 'image',
      title: `图片${index}`,
      imageUrl: `/asset-library/files/image-${index}`,
      composerReferences: Array.from({ length: 5 }, (_, reference) => ({
        id: `ref-${reference}`,
        type: 'image',
        label: '参考图',
        url: `/asset-library/files/ref-${reference}`,
      })),
    },
  }));
}

describe('large image canvas drag hot path', () => {
  it('benchmarks the same 100-image update workload before and after caching', () => {
    const measure = (cached: boolean) => {
      let nodes = imageNodes(100);
      const project = createRenderedNodeProjector();
      const lookup: NodeLookup = new Map();
      const parents: ParentLookup = new Map();
      adoptUserNodes(project(nodes), lookup, parents);
      const start = performance.now();
      for (let frame = 0; frame < 240; frame++) {
        const next = nodes.map((node, index) =>
          index === 0 ? { ...node, position: { x: frame, y: frame } } : node,
        );
        if (!cached || canvasNodeMediaDataChanged(nodes, next)) {
          collectCanvasMediaStrings(next, (value) => value.startsWith('indexeddb:'));
        }
        adoptUserNodes(
          cached ? project(next) : next.map((node) => ({ ...node, zIndex: 1 })),
          lookup,
          parents,
        );
        nodes = next;
      }
      return performance.now() - start;
    };
    measure(false);
    measure(true);
    const samples = Array.from({ length: 5 }, () => ({
      before: measure(false),
      after: measure(true),
    }));
    // Wall time is diagnostic only: correctness must not depend on CI machine speed.
    if (process.env.CANVAS_DRAG_BENCHMARK === '1') console.info(JSON.stringify(samples));
    expect(samples.every((sample) => sample.before >= 0 && sample.after >= 0)).toBe(true);
  });

  it('updates only the moved render node and does not revisit any media strings during 120 drag frames', () => {
    let nodes = imageNodes(100);
    const project = createRenderedNodeProjector();
    let rendered = project(nodes);
    let oldReads = 0;
    let newReads = 0;
    let oldReplacements = 0;
    let newReplacements = 0;
    const lookup: NodeLookup = new Map();
    const parents: ParentLookup = new Map();
    adoptUserNodes(rendered, lookup, parents);
    let internalReplacements = 0;
    for (let frame = 0; frame < 120; frame++) {
      const next = nodes.map((node, index) =>
        index === 0 ? { ...node, dragging: true, position: { x: frame, y: frame } } : node,
      );
      collectCanvasMediaStrings(next, () => {
        oldReads++;
        return false;
      });
      oldReplacements += next.map((node) => ({ ...node, zIndex: 1 })).length;
      if (canvasNodeMediaDataChanged(nodes, next)) {
        collectCanvasMediaStrings(next, () => {
          newReads++;
          return false;
        });
      }
      const nextRendered = project(next);
      newReplacements += nextRendered.filter((node, index) => node !== rendered[index]).length;
      const previousLookup = new Map(lookup);
      adoptUserNodes(nextRendered, lookup, parents);
      internalReplacements += [...lookup].filter(
        ([id, node]) => node !== previousLookup.get(id),
      ).length;
      expect(nextRendered[0]?.position).toEqual({ x: frame, y: frame });
      nodes = next;
      rendered = nextRendered;
    }
    expect(oldReads).toBeGreaterThan(100_000);
    expect(newReads).toBe(0);
    expect(oldReplacements).toBe(12_000);
    expect(newReplacements).toBe(120);
    expect(internalReplacements).toBe(120);
  });

  it('keeps stacking, selection and changed data correct across cached projections', () => {
    const project = createRenderedNodeProjector();
    const nodes = imageNodes(3);
    const [first, second, third] = nodes;
    if (!first || !second || !third) throw new Error('Missing test fixture node');
    nodes[0] = { ...first, data: { kind: 'group', title: '分组' } };
    nodes[2] = { ...third, zIndex: 200_000 };
    const before = project(nodes);
    expect(before.map((node) => node.zIndex)).toEqual([-1, 1, 200_000]);
    const selected = nodes.map((node) => ({ ...node, selected: true }));
    expect(project(selected).map((node) => node.zIndex)).toEqual([100_000, 100_000, 200_000]);
    expect(project(nodes)).toEqual(before);
    expect(project(nodes)[1]).toBe(before[1]);
    const edited = [...nodes];
    edited[1] = { ...second, data: { ...second.data, imageUrl: 'indexeddb:new-image' } };
    expect(canvasNodeMediaDataChanged(nodes, edited)).toBe(true);
    expect(project(edited)[1]?.data.imageUrl).toBe('indexeddb:new-image');
    expect(canvasNodeMediaDataChanged(nodes, [...nodes, ...imageNodes(1)])).toBe(true);
    expect(canvasNodeMediaDataChanged(nodes, nodes.slice(1))).toBe(true);
  });
});
