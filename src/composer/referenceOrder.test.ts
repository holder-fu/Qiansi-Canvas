import { describe, expect, it } from 'vitest';
import type { ComposerReference } from './types';
import { reorderComposerReferences } from './referenceOrder';

const image = (id: string, locked = false): ComposerReference => ({
  id,
  type: 'image',
  label: id,
  url: `/asset-library/files/${id}`,
  ...(locked ? { locked: true } : {}),
});

describe('reorderComposerReferences', () => {
  it('moves a reference before or after the hovered thumbnail', () => {
    const refs = [image('one'), image('two'), image('three')];
    expect(reorderComposerReferences(refs, 'one', 'three', 'after').map(({ id }) => id)).toEqual([
      'two',
      'three',
      'one',
    ]);
    expect(reorderComposerReferences(refs, 'three', 'one', 'before').map(({ id }) => id)).toEqual([
      'three',
      'one',
      'two',
    ]);
  });

  it('does not move, target or cross a locked director bundle', () => {
    const refs = [image('one'), image('director', true), image('three')];
    expect(reorderComposerReferences(refs, 'one', 'three', 'after')).toEqual(refs);
    expect(reorderComposerReferences(refs, 'director', 'one', 'before')).toEqual(refs);
    expect(reorderComposerReferences(refs, 'one', 'director', 'before')).toEqual(refs);
  });

  it('leaves missing and identical targets unchanged', () => {
    const refs = [image('one'), image('two')];
    expect(reorderComposerReferences(refs, 'one', 'one', 'after')).toEqual(refs);
    expect(reorderComposerReferences(refs, 'missing', 'two', 'before')).toEqual(refs);
  });
});
