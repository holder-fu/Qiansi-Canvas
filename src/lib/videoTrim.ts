export type VideoTrimRange = {
  start: number;
  end: number;
};

export type IdentifiedVideoTrimRange = VideoTrimRange & { id: string };

export type VideoRemakeDragMode = 'start' | 'end' | 'window';

export const MIN_VIDEO_TRIM_SECONDS = 0.1;
export const MIN_VIDEO_REMAKE_SECONDS = MIN_VIDEO_TRIM_SECONDS;
export const ABSOLUTE_MIN_VIDEO_REMAKE_SECONDS = MIN_VIDEO_REMAKE_SECONDS;
export const MIN_DEFAULT_VIDEO_REMAKE_SECONDS = 1;
export const DEFAULT_VIDEO_REMAKE_SECONDS = 5;
export const MAX_VIDEO_REMAKE_SEGMENTS = 5;

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Remake handles use the same tenth-second precision as the timeline display.
 * Keep this independent from the larger duration-aware range created by a click.
 */
export function getVideoRemakeMinimumSeconds(duration: number) {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration <= 0) return MIN_VIDEO_REMAKE_SECONDS;
  return Math.min(MIN_VIDEO_REMAKE_SECONDS, safeDuration);
}

/** Clicks retain practical one-to-five-second defaults; handles may resize them further. */
export function getVideoRemakeDefaultSeconds(duration: number) {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration <= 0) return DEFAULT_VIDEO_REMAKE_SECONDS;
  return Math.min(
    DEFAULT_VIDEO_REMAKE_SECONDS,
    safeDuration,
    Math.max(
      Math.min(MIN_DEFAULT_VIDEO_REMAKE_SECONDS, safeDuration),
      safeDuration / MAX_VIDEO_REMAKE_SEGMENTS,
    ),
  );
}

export function normalizeVideoTrimRange(
  duration: number,
  start?: number,
  end?: number,
  minimumDuration = MIN_VIDEO_TRIM_SECONDS,
): VideoTrimRange {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration === 0) return { start: 0, end: 0 };

  const minimumGap = Math.min(Math.max(0, minimumDuration), safeDuration);
  const safeStart = Math.min(Math.max(0, finiteOr(start, 0)), safeDuration - minimumGap);
  const safeEnd = Math.min(
    safeDuration,
    Math.max(safeStart + minimumGap, finiteOr(end, safeDuration)),
  );
  return { start: safeStart, end: safeEnd };
}

export function updateVideoTrimHandle(
  duration: number,
  range: VideoTrimRange,
  handle: 'start' | 'end',
  time: number,
  minimumDuration = MIN_VIDEO_TRIM_SECONDS,
): VideoTrimRange {
  const normalized = normalizeVideoTrimRange(duration, range.start, range.end, minimumDuration);
  const minimumGap = Math.min(Math.max(0, minimumDuration), Math.max(0, duration));
  if (handle === 'start') {
    return {
      start: Math.min(Math.max(0, time), normalized.end - minimumGap),
      end: normalized.end,
    };
  }
  return {
    start: normalized.start,
    end: Math.max(normalized.start + minimumGap, Math.min(Math.max(0, duration), time)),
  };
}

export function moveVideoTrimRange(
  duration: number,
  range: VideoTrimRange,
  nextStart: number,
  minimumDuration = MIN_VIDEO_TRIM_SECONDS,
): VideoTrimRange {
  const normalized = normalizeVideoTrimRange(duration, range.start, range.end, minimumDuration);
  const span = normalized.end - normalized.start;
  const start = Math.min(Math.max(0, nextStart), Math.max(0, duration - span));
  return { start, end: start + span };
}

/** Update one stable remake segment without sorting or changing the identity of its siblings. */
export function updateIdentifiedVideoRemakeSegment(
  duration: number,
  segments: readonly IdentifiedVideoTrimRange[],
  segmentId: string,
  mode: VideoRemakeDragMode,
  time: number,
  windowOffset = 0,
): IdentifiedVideoTrimRange[] {
  const ordered = [...segments].sort(
    (left, right) =>
      left.start - right.start || left.end - right.end || left.id.localeCompare(right.id),
  );
  const selectedIndex = ordered.findIndex((segment) => segment.id === segmentId);
  if (selectedIndex < 0) return [...segments];
  const selected = ordered[selectedIndex];
  if (!selected) return [...segments];
  const previous = ordered[selectedIndex - 1];
  const next = ordered[selectedIndex + 1];
  const minimumStart = previous?.end ?? 0;
  const maximumEnd = next?.start ?? Math.max(0, duration);
  const span = selected.end - selected.start;
  const minimumDuration = getVideoRemakeMinimumSeconds(duration);

  let changed: VideoTrimRange;
  if (mode === 'window') {
    const maximumStart = Math.max(minimumStart, maximumEnd - span);
    const start = Math.min(Math.max(minimumStart, time - windowOffset), maximumStart);
    changed = { start, end: start + span };
  } else if (mode === 'start') {
    changed = {
      start: Math.min(Math.max(minimumStart, time), selected.end - minimumDuration),
      end: selected.end,
    };
  } else {
    changed = {
      start: selected.start,
      end: Math.max(selected.start + minimumDuration, Math.min(maximumEnd, time)),
    };
  }

  return segments.map((segment) => {
    if (segment.id !== segmentId) return segment;
    return { ...changed, id: segment.id };
  });
}

/** Resolve the source frame that should be visible while a remake range is being dragged. */
export function resolveVideoRemakeDragPreviewTime(
  mode: VideoRemakeDragMode,
  pointerTime: number,
  segment: VideoTrimRange,
) {
  if (mode === 'start') return segment.start;
  if (mode === 'end') return segment.end;
  const safePointerTime = finiteOr(pointerTime, segment.start);
  return Math.min(Math.max(segment.start, safePointerTime), segment.end);
}

/** Quantize both trim boundaries while preserving a valid snapped interval. */
export function snapVideoTrimRange(
  duration: number,
  range: VideoTrimRange,
  stepSeconds = 1,
): VideoTrimRange {
  const step = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : 1;
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration === 0) return { start: 0, end: 0 };
  const snappedStart = Math.round(range.start / step) * step;
  const snappedEnd = Math.round(range.end / step) * step;
  return normalizeVideoTrimRange(
    safeDuration,
    snappedStart,
    snappedEnd,
    Math.min(step, safeDuration),
  );
}

export function normalizeVideoRemakeSegments(
  duration: number,
  segments: readonly VideoTrimRange[] | undefined = undefined,
): VideoTrimRange[] {
  if (!segments?.length || duration <= 0) return [];
  const minimumDuration = getVideoRemakeMinimumSeconds(duration);
  const normalized = segments
    .filter((segment) => segment && Number.isFinite(segment.start) && Number.isFinite(segment.end))
    .map((segment) =>
      normalizeVideoTrimRange(duration, segment.start, segment.end, minimumDuration),
    )
    .sort((left, right) => left.start - right.start);

  return normalized.reduce<VideoTrimRange[]>((accepted, segment) => {
    if (accepted.length >= MAX_VIDEO_REMAKE_SEGMENTS) return accepted;
    if (accepted.some((current) => videoTrimRangesOverlap(current, segment))) return accepted;
    accepted.push(segment);
    return accepted;
  }, []);
}

/** Adjacent boundaries may touch, but two selected remake intervals may never overlap. */
export function videoTrimRangesOverlap(left: VideoTrimRange, right: VideoTrimRange) {
  return left.start < right.end && left.end > right.start;
}

/** Resolve the duration-aware default section represented by a timeline click. */
export function defaultVideoRemakeSegmentAt(duration: number, time: number): VideoTrimRange | null {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  const minimumDuration = getVideoRemakeMinimumSeconds(safeDuration);
  const defaultDuration = getVideoRemakeDefaultSeconds(safeDuration);
  if (safeDuration < minimumDuration) return null;
  const safeTime = Math.min(Math.max(0, finiteOr(time, 0)), safeDuration);
  let start =
    Math.floor(Math.min(safeTime, Math.max(0, safeDuration - Number.EPSILON)) / defaultDuration) *
    defaultDuration;
  let end = Math.min(safeDuration, start + defaultDuration);
  if (end - start < minimumDuration) {
    start = Math.max(0, safeDuration - defaultDuration);
    end = safeDuration;
  }
  return { start, end };
}

export function addVideoRemakeSegment(
  duration: number,
  segments: readonly VideoTrimRange[],
  start: number,
): VideoTrimRange[] | null {
  const current = normalizeVideoRemakeSegments(duration, segments);
  if (duration <= 0 || current.length >= MAX_VIDEO_REMAKE_SEGMENTS) return null;
  const next = defaultVideoRemakeSegmentAt(duration, start);
  if (!next) return null;
  if (current.some((segment) => videoTrimRangesOverlap(segment, next))) return null;
  return normalizeVideoRemakeSegments(duration, [...current, next]);
}
