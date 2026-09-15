import { describe, expect, it, vi } from 'vitest';
import {
  applyVideoPlaybackBoundary,
  type VideoPlaybackBoundaryMedia,
} from './videoPlaybackBoundary';

function createMedia({
  currentTime,
  paused,
  ended,
}: {
  currentTime: number;
  paused: boolean;
  ended: boolean;
}) {
  const play = vi.fn(async () => {});
  const pause = vi.fn();
  const media: VideoPlaybackBoundaryMedia = {
    currentTime,
    paused,
    ended,
    play,
    pause,
  };
  return { media, pause, play };
}

describe('video playback boundary', () => {
  it('restarts an actively playing video after seeking back to the range start', () => {
    const { media, play } = createMedia({ currentTime: 7, paused: false, ended: false });

    expect(applyVideoPlaybackBoundary(media, { start: 0, end: 7 }, true)).toBe('looped');
    expect(media.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
  });

  it('explicitly restarts a WebM that has already emitted ended', () => {
    const { media, play } = createMedia({ currentTime: 7, paused: true, ended: true });

    expect(applyVideoPlaybackBoundary(media, { start: 1, end: 7 }, true)).toBe('looped');
    expect(media.currentTime).toBe(1);
    expect(play).toHaveBeenCalledOnce();
  });

  it('keeps an intentionally paused seek paused at the loop start', () => {
    const { media, play } = createMedia({ currentTime: 7, paused: true, ended: false });

    expect(applyVideoPlaybackBoundary(media, { start: 0, end: 7 }, true)).toBe('looped');
    expect(media.currentTime).toBe(0);
    expect(play).not.toHaveBeenCalled();
  });

  it('holds the last frame when looping is disabled', () => {
    const { media, pause, play } = createMedia({ currentTime: 7, paused: false, ended: false });

    expect(applyVideoPlaybackBoundary(media, { start: 1, end: 7 }, false)).toBe('stopped');
    expect(media.currentTime).toBe(7);
    expect(pause).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
  });

  it('does not touch media that remains inside its playback range', () => {
    const { media, pause, play } = createMedia({ currentTime: 3, paused: false, ended: false });

    expect(applyVideoPlaybackBoundary(media, { start: 0, end: 7 }, true)).toBe('progress');
    expect(media.currentTime).toBe(3);
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});
