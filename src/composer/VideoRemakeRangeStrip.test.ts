import { describe, expect, it } from 'vitest';
import source from './VideoRemakeRangeStrip.tsx?raw';

describe('VideoRemakeRangeStrip preview scrubbing', () => {
  it('previews updated drag times and only restores the initial frame after cancellation', () => {
    const handleUp = source.slice(
      source.indexOf('const handleUp'),
      source.indexOf('const handleCancel'),
    );
    const handleCancel = source.slice(
      source.indexOf('const handleCancel'),
      source.indexOf("window.addEventListener('pointermove'"),
    );

    expect(source).toContain('resolveVideoRemakeDragPreviewTime(drag.mode, time, updated)');
    expect(handleUp).not.toContain('drag.initialPreviewTime');
    expect(handleCancel).toContain('onPreviewTimeChangeRef.current?.(drag.initialPreviewTime)');
  });
});
