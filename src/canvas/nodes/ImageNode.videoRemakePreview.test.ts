import { describe, expect, it } from 'vitest';
import source from './ImageNode.tsx?raw';

describe('ImageNode video-remake preview', () => {
  it('coalesces range-drag requests into paused source-frame seeks', () => {
    expect(source).toContain(
      'state.videoRemakePreviewRequest?.nodeId === id ? state.videoRemakePreviewRequest : null',
    );
    expect(source).toContain('const frame = window.requestAnimationFrame(() => {');
    expect(source).toContain('video.pause();');
    expect(source).toContain('video.currentTime = target;');
    expect(source).toContain('window.cancelAnimationFrame(frame)');
  });
});
