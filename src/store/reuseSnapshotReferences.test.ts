import { describe, expect, it } from 'vitest';
import { reuseSnapshotReferences } from './reuseSnapshotReferences';

describe('snapshot structural sharing', () => {
  it('reuses JSON-equivalent graphs including omitted undefined fields', () => {
    const current = { nodes: [{ data: { params: { quality: 'standard' }, unused: undefined } }] };
    expect(reuseSnapshotReferences(current, JSON.parse(JSON.stringify(current)))).toBe(current);
  });

  it('applies real changes and removals without rebuilding untouched branches', () => {
    const current = {
      nodes: [
        { data: { url: 'old', params: { quality: 'standard' } } },
        { data: { url: 'keep', params: { quality: 'high' } } },
      ],
      removed: 'value',
    };
    const incoming = JSON.parse(JSON.stringify(current));
    incoming.nodes[0].data.url = 'new';
    delete incoming.removed;
    const result = reuseSnapshotReferences(current, incoming);
    expect(result).toEqual(incoming);
    expect(result.nodes[0]?.data.params).toBe(current.nodes[0]?.data.params);
    expect(result.nodes[1]).toBe(current.nodes[1]);
    expect(result).not.toHaveProperty('removed');
  });
});
