import { describe, expect, it } from 'vitest';
import { normalizeVideoActionBarLayout } from './videoActionBarLayout';

const defaults = {
  primaryIds: ['edit', 'crop', 'enhance'],
  overflowIds: ['download'],
};

describe('video action bar layout persistence', () => {
  it('restores tools dragged into the overflow tray', () => {
    expect(
      normalizeVideoActionBarLayout(
        {
          primaryIds: ['edit', 'enhance'],
          overflowIds: ['crop', 'download'],
        },
        ['edit', 'crop', 'enhance', 'download'],
        defaults,
      ),
    ).toEqual({
      primaryIds: ['edit', 'enhance'],
      overflowIds: ['crop', 'download'],
    });
  });

  it('filters invalid duplicates and places new tools in their default group', () => {
    expect(
      normalizeVideoActionBarLayout(
        {
          primaryIds: ['edit', 'edit', 'removed'],
          overflowIds: ['edit', 'download'],
        },
        ['edit', 'crop', 'enhance', 'download'],
        defaults,
      ),
    ).toEqual(defaults);
  });

  it('drops the retired mask-painting entry while preserving segment remake placement', () => {
    expect(
      normalizeVideoActionBarLayout(
        {
          primaryIds: ['edit', 'mask-repair'],
          overflowIds: ['remake', 'download'],
        },
        ['edit', 'remake', 'download'],
        {
          primaryIds: ['edit', 'remake'],
          overflowIds: ['download'],
        },
      ),
    ).toEqual({
      primaryIds: ['edit'],
      overflowIds: ['remake', 'download'],
    });
  });
});
