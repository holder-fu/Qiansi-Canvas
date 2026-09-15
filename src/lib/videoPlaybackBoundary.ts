export interface VideoPlaybackBoundaryMedia {
  currentTime: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
}

export interface VideoPlaybackBoundaryRange {
  start: number;
  end: number;
}

export type VideoPlaybackBoundaryResult = 'progress' | 'looped' | 'stopped';

/**
 * Keep custom video ranges replayable after their last frame.
 *
 * Seeking from an `ended` event clears the media's ended position, but does not
 * reliably restart WebM decoding in every browser. Explicitly resume media that
 * was already playing (or has ended), while preserving an intentional pause.
 */
export function applyVideoPlaybackBoundary(
  media: VideoPlaybackBoundaryMedia,
  range: VideoPlaybackBoundaryRange,
  loop: boolean,
): VideoPlaybackBoundaryResult {
  if (range.end <= range.start || media.currentTime < range.end) return 'progress';

  if (!loop) {
    media.pause();
    media.currentTime = range.end;
    return 'stopped';
  }

  const shouldResume = media.ended || !media.paused;
  media.currentTime = range.start;
  if (shouldResume) void media.play().catch(() => {});
  return 'looped';
}
