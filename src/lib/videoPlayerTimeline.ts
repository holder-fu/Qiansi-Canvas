export type VideoTimeRounding = 'current' | 'duration';

export function formatVideoPlayerTime(seconds: number, rounding: VideoTimeRounding = 'current') {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const wholeSeconds =
    rounding === 'duration'
      ? Math.ceil(Math.max(0, seconds - 0.001))
      : Math.floor(Math.max(0, seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

export function videoPlayerProgressPercent(currentTime: number, duration: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(100, (currentTime / duration) * 100));
}
