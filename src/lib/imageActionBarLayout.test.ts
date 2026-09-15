import { describe, expect, it } from 'vitest';
import {
  IMAGE_ACTION_BAR_LAYOUT_STORAGE_KEY,
  normalizeImageActionBarLayout,
} from './imageActionBarLayout';

const defaults = {
  primaryIds: ['preview', 'crop'],
  overflowIds: ['grid'],
  quickPrimaryIds: ['person', 'quality'],
  quickOverflowIds: [] as string[],
};

describe('image action bar layout persistence', () => {
  it('uses the rebuilt compact-layout preference namespace', () => {
    expect(IMAGE_ACTION_BAR_LAYOUT_STORAGE_KEY).toBe('qiansi-image-action-bar-layout-v2');
  });
  it('restores tools placed in the overflow tray', () => {
    expect(
      normalizeImageActionBarLayout(
        {
          primaryIds: ['preview'],
          overflowIds: ['crop', 'grid'],
          quickPrimaryIds: ['quality'],
          quickOverflowIds: ['person'],
        },
        ['preview', 'crop', 'grid'],
        ['person', 'quality'],
        defaults,
      ),
    ).toEqual({
      primaryIds: ['preview'],
      overflowIds: ['crop', 'grid'],
      quickPrimaryIds: ['quality'],
      quickOverflowIds: ['person'],
    });
  });

  it('filters invalid and duplicate ids without losing known tools', () => {
    expect(
      normalizeImageActionBarLayout(
        {
          primaryIds: ['preview', 'preview', 'removed'],
          overflowIds: ['preview'],
          quickPrimaryIds: 'invalid',
          quickOverflowIds: ['quality', 'quality'],
        },
        ['preview', 'crop', 'grid'],
        ['person', 'quality'],
        defaults,
      ),
    ).toEqual({
      primaryIds: ['preview', 'crop'],
      overflowIds: ['grid'],
      quickPrimaryIds: ['person'],
      quickOverflowIds: ['quality'],
    });
  });

  it('places newly introduced tools in their default group', () => {
    expect(
      normalizeImageActionBarLayout(
        {
          primaryIds: ['preview'],
          overflowIds: ['grid'],
          quickPrimaryIds: ['person'],
          quickOverflowIds: [],
        },
        ['preview', 'crop', 'grid'],
        ['person', 'quality'],
        defaults,
      ),
    ).toEqual(defaults);
  });
});
