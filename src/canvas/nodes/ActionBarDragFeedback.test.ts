import { describe, expect, it } from 'vitest';
import imageActionBarSource from './ImageNodeActionBar.tsx?raw';
import videoActionBarSource from './VideoNodeActionBar.tsx?raw';
import {
  actionBarDropTargetFromPointer,
  resolveActionBarInsertionBeforeId,
} from './actionBarDragFeedback';

describe('action bar drag feedback', () => {
  it('uses the pointer half to show an exact before or after insertion target', () => {
    expect(
      actionBarDropTargetFromPointer('primary', 'crop', 124, { left: 100, width: 50 }),
    ).toEqual({
      group: 'primary',
      itemId: 'crop',
      side: 'before',
    });
    expect(
      actionBarDropTargetFromPointer('overflow', 'crop', 126, { left: 100, width: 50 }),
    ).toEqual({
      group: 'overflow',
      itemId: 'crop',
      side: 'after',
    });
  });

  it('resolves after-target placement after removing the dragged item', () => {
    const target = { group: 'primary', itemId: 'preview', side: 'after' } as const;
    expect(resolveActionBarInsertionBeforeId(['preview', 'crop', 'label'], 'label', target)).toBe(
      'crop',
    );
  });

  it('keeps a drop on the dragged item itself as a no-op and appends zone-only drops', () => {
    expect(
      resolveActionBarInsertionBeforeId(['preview', 'crop', 'label'], 'crop', {
        group: 'primary',
        itemId: 'crop',
        side: 'after',
      }),
    ).toBe('crop');
    expect(
      resolveActionBarInsertionBeforeId(['preview', 'crop', 'label'], 'preview', {
        group: 'overflow',
        itemId: null,
        side: 'after',
      }),
    ).toBeUndefined();
  });

  it('wires the shared preview, drop-zone highlight and insertion marker into image and video bars', () => {
    for (const source of [imageActionBarSource, videoActionBarSource]) {
      expect(source).toContain('setActionBarDragPreview(event.dataTransfer');
      expect(source).toContain('setMoreOpen(true)');
      expect(source).toContain('data-action-bar-drop-zone="primary"');
      expect(source).toContain('data-action-bar-drop-zone="overflow"');
      expect(source).toContain('<ActionBarDragStatus');
      expect(source).toContain('<ActionBarInsertionMarker');
      expect(source).toContain('resolveActionBarInsertionBeforeId');
    }
  });
});
