import { describe, expect, it } from 'vitest';
import { stableJsonEqual, stableJsonStringify } from './stableJson';

describe('stable JSON wire comparison', () => {
  it('ignores recursive object-key insertion order', () => {
    expect(
      stableJsonEqual({ b: 2, nested: { z: 3, a: 1 } }, { nested: { a: 1, z: 3 }, b: 2 }),
    ).toBe(true);
  });

  it('preserves array order and duplicate semantic slots', () => {
    expect(stableJsonEqual({ refs: ['A', 'B'] }, { refs: ['B', 'A'] })).toBe(false);
    expect(stableJsonEqual({ refs: ['A', 'A'] }, { refs: ['A'] })).toBe(false);
  });

  it('uses JSON wire semantics for omitted and non-finite values', () => {
    expect(stableJsonStringify({ omitted: undefined, value: Number.NaN })).toBe('{"value":null}');
  });
});
