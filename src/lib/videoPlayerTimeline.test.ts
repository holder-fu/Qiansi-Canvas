import { describe, expect, it } from 'vitest';
import { formatVideoPlayerTime, videoPlayerProgressPercent } from './videoPlayerTimeline';

describe('video player timeline', () => {
  it('shows current playback time without claiming an unplayed second', () => {
    expect(formatVideoPlayerTime(2.98)).toBe('0:02');
    expect(formatVideoPlayerTime(62.4)).toBe('1:02');
  });

  it('shows the complete media duration instead of truncating the last partial second', () => {
    expect(formatVideoPlayerTime(6.949, 'duration')).toBe('0:07');
    expect(formatVideoPlayerTime(60.001, 'duration')).toBe('1:00');
    expect(formatVideoPlayerTime(62.4, 'duration')).toBe('1:03');
  });

  it('uses the same finite media timeline for the visible progress fill', () => {
    expect(videoPlayerProgressPercent(2.5, 10)).toBe(25);
    expect(videoPlayerProgressPercent(8, 6.949)).toBe(100);
    expect(videoPlayerProgressPercent(-2, 6.949)).toBe(0);
    expect(videoPlayerProgressPercent(2, 0)).toBe(0);
  });
});
