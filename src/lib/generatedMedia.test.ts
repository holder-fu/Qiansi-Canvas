import { describe, expect, it } from 'vitest';
import {
  appendMediaOrdinal,
  collectGeneratedMediaUrls,
  generatedMediaPosition,
} from './generatedMedia';

describe('generated media batches', () => {
  it('keeps provider order while removing the duplicated primary URL', () => {
    expect(collectGeneratedMediaUrls('one.png', ['one.png', 'two.png', 'three.png'])).toEqual([
      'one.png',
      'two.png',
      'three.png',
    ]);
  });

  it('places additional result nodes to the right with an 80px gap', () => {
    expect(generatedMediaPosition({ x: 100, y: 40 }, 620, 2)).toEqual({ x: 1500, y: 40 });
  });

  it('adds the result number before a file extension', () => {
    expect(appendMediaOrdinal('scene.mp4', 3)).toBe('scene · 3.mp4');
    expect(appendMediaOrdinal('未命名图片', 2)).toBe('未命名图片 · 2');
  });
});
