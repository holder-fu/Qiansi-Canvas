import { describe, expect, it } from 'vitest';
import { sortEffectLibraryItems } from './effectLibrarySort';

const ITEMS = [
  { id: 'gamma', title: 'Gamma 10', uses: 3 },
  { id: 'alpha', title: 'Alpha 2', uses: 9, createdAt: 20 },
  { id: 'beta', title: 'Beta', uses: 5, createdAt: 10 },
];

describe('effect library sorting', () => {
  it('preserves the projected order for recommended sorting without mutating it', () => {
    const input = [...ITEMS];
    const result = sortEffectLibraryItems(input, 'recommended', {}, 'zh-CN');

    expect(result.map((item) => item.id)).toEqual(['gamma', 'alpha', 'beta']);
    expect(result).not.toBe(input);
    expect(input.map((item) => item.id)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('orders newest user entries first and keeps undated items stable', () => {
    expect(sortEffectLibraryItems(ITEMS, 'recent', {}, 'zh-CN').map((item) => item.id)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('uses live persisted counts before preset counts', () => {
    expect(
      sortEffectLibraryItems(ITEMS, 'uses', { gamma: 12 }, 'zh-CN').map((item) => item.id),
    ).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('sorts names for the active display language with numeric ordering', () => {
    expect(sortEffectLibraryItems(ITEMS, 'name', {}, 'en-US').map((item) => item.id)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });
});
