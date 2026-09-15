import type { VideoTrimRange } from '../lib/videoTrim';

export function formatVideoRemakeTimestamp(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalTenths = Math.round(safeSeconds * 10);
  const minutes = Math.floor(totalTenths / 600);
  const remainderTenths = totalTenths % 600;
  const wholeSeconds = Math.floor(remainderTenths / 10);
  const tenths = remainderTenths % 10;
  const timestamp = `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return tenths === 0 ? timestamp : `${timestamp}.${tenths}`;
}

export function buildVideoRemakePromptPreview(segments: readonly VideoTrimRange[]) {
  return {
    prefix: '把视频 1 中',
    ranges: segments.map(
      (segment) =>
        `${formatVideoRemakeTimestamp(segment.start)}–${formatVideoRemakeTimestamp(segment.end)}`,
    ),
    suffix: '这些片段重新生成',
  };
}
